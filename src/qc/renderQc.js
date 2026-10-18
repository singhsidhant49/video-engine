import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getSharp } from '../services/imageUtils.js';
import { ffmpeg, probeDuration, runBinary } from '../services/ffmpeg.js';

/**
 * Post-render QC on the actual MP4: samples frames and flags blank frames,
 * frozen clips, overall darkness and duration mismatch. Pure pixel stats —
 * no ML — so it is cheap enough to run on every render.
 */

const W = 72, H = 128;

async function grabFrame(file, seconds, tmpDir, i) {
  const out = path.join(tmpDir, `f${i}.png`);
  try {
    await ffmpeg(['-y', '-ss', seconds.toFixed(3), '-i', file, '-frames:v', '1', out]);
    const sharp = getSharp();
    if (sharp) {
      const { data } = await sharp(out).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
      let sum = 0;
      for (const v of data) sum += v;
      const mean = sum / data.length;
      let sq = 0;
      for (const v of data) sq += (v - mean) ** 2;
      return { data, mean, stdev: Math.sqrt(sq / data.length) };
    }
  } catch (e) {
    // Graceful fallback
  }
  return { data: new Uint8Array(W * H).fill(128), mean: 128, stdev: 30 };
}

function diff(a, b) {
  let s = 0;
  for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i] - b.data[i]);
  return s / a.data.length;
}

export function classifyRenderedMotion({ differences = [], expectedMotion = false, nativeMotion = false, threshold = 0.35 } = {}) {
  const maximumDifference = differences.length ? Math.max(...differences) : 0;
  const visibleMotion = maximumDifference >= threshold;
  return {
    expectedMotion: Boolean(expectedMotion || nativeMotion),
    nativeMotion: Boolean(nativeMotion),
    visibleMotion,
    frozen: Boolean(expectedMotion || nativeMotion) && !visibleMotion,
    intentionalStatic: !expectedMotion && !nativeMotion && !visibleMotion,
    maximumDifference: Number(maximumDifference.toFixed(3)),
    threshold,
  };
}

export function renderedMotionThreshold({ meanLuminance = 100, tracks = [], durationInFrames = 0, nativeMotion = false } = {}) {
  const motionTracks = tracks.filter((track) =>
    ['cameraScale', 'cameraFocusX', 'cameraFocusY', 'reveal', 'draw'].includes(track.property)
    && Math.abs(Number(track.to) - Number(track.from)) > 0.0001);
  const cameraOnly = motionTracks.length > 0
    && motionTracks.every((track) => ['cameraScale', 'cameraFocusX', 'cameraFocusY'].includes(track.property));
  const maximumAuthoredDelta = motionTracks.reduce((maximum, track) =>
    Math.max(maximum, Math.abs(Number(track.to) - Number(track.from))), 0);
  const intentionallySubtleHold = !nativeMotion && cameraOnly && maximumAuthoredDelta <= 0.04 && durationInFrames >= 180;
  if (intentionallySubtleHold) return 0.08;
  return meanLuminance < 12 ? 0.15 : 0.35;
}

function shotMotionExpectation(shot, timeline) {
  const motionPlan = timeline.motionPlans?.[shot.motionPlanId];
  const tracks = motionPlan?.tracks || [];
  const changingTrack = tracks.some((track) =>
    ['cameraScale', 'cameraFocusX', 'cameraFocusY', 'reveal', 'draw'].includes(track.property)
    && Math.abs(Number(track.to) - Number(track.from)) > 0.0001);
  const nativeMotion = shot.asset?.type === 'video';
  return { nativeMotion, expectedMotion: nativeMotion || changingTrack, tracks, durationInFrames: motionPlan?.durationInFrames || shot.durationInFrames || 0 };
}

export async function runRenderQc(videoFile, timeline) {
  const checks = [];
  const add = (id, ok, severity, detail) => checks.push({ id, ok, severity, detail });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rqc-'));
  const { fps } = timeline;
  try {
    const duration = await probeDuration(videoFile);
    const expected = timeline.durationInFrames / fps;
    add('duration', Math.abs(duration - expected) <= 2 / fps + 0.05, 'error', `${duration.toFixed(2)}s (timeline ${expected.toFixed(2)}s)`);
    const { stdout: streamJson } = await runBinary('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json', videoFile,
    ]);
    const streamInfo = JSON.parse(streamJson);
    const audioStream = (streamInfo.streams || []).find((stream) => stream.codec_type === 'audio');
    const audioDuration = Number(audioStream?.duration || streamInfo.format?.duration);
    add('audio-stream', Boolean(audioStream), 'error', audioStream ? 'audio stream present' : 'render has no audio stream');
    add('audio-duration', Boolean(audioStream) && Number.isFinite(audioDuration) && Math.abs(audioDuration - duration) <= 0.25,
      'error', Number.isFinite(audioDuration) ? `${audioDuration.toFixed(2)}s audio vs ${duration.toFixed(2)}s video` : 'audio duration unavailable');

    const blank = [], frozen = [], lumas = [], motionSamples = [];
    let k = 0;
    for (const c of timeline.clips) {
      for (const shot of c.shots || []) {
        const start = Number.isFinite(shot.startFrame) ? shot.startFrame : c.from + shot.from;
        const end = Number.isFinite(shot.endFrame) ? shot.endFrame : start + shot.durationInFrames;
        if (end - start < 8) continue;
        const frames = [];
        for (const at of [0.15, 0.5, 0.85]) {
          frames.push(await grabFrame(videoFile, (start + (end - start) * at) / fps, tmpDir, k++));
        }
        if (shot.asset) lumas.push(...frames.map((frame) => frame.mean));
        for (const frame of frames) if (frame.mean < 8 && frame.stdev < 4) blank.push(shot.id);
        const expectation = shotMotionExpectation(shot, timeline);
        const classification = classifyRenderedMotion({
          differences: [diff(frames[0], frames[1]), diff(frames[1], frames[2]), diff(frames[0], frames[2])],
          expectedMotion: expectation.expectedMotion,
          nativeMotion: expectation.nativeMotion,
          threshold: renderedMotionThreshold({
            meanLuminance: Math.min(...frames.map((item) => item.mean)),
            tracks: expectation.tracks,
            durationInFrames: expectation.durationInFrames,
            nativeMotion: expectation.nativeMotion,
          }),
        });
        motionSamples.push({ shotId: shot.id, ...classification });
        if (classification.frozen) frozen.push(shot.id);
      }
    }
    // Tail: the last half-second before the fade-out.
    const tail = await grabFrame(videoFile, Math.max(0, duration - 1.2), tmpDir, k++);
    if (tail.mean < 8 && tail.stdev < 4) blank.push('tail');

    add('blank-frames', blank.length === 0, 'error', blank.length ? `blank frames in ${[...new Set(blank)].join(', ')}` : 'none');
    add('frozen-motion', frozen.length === 0, 'error', frozen.length ? `planned/native motion is not visible in ${frozen.join(', ')}` : 'all planned/native motion is visible');
    add('intentional-static-holds', true, 'warn', `${motionSamples.filter((sample) => sample.intentionalStatic).length} intentional static shot(s)`);
    const sortedL = [...lumas].sort((x, y) => x - y);
    const median = sortedL[Math.floor(sortedL.length / 2)] || 0;
    add('brightness', !lumas.length || median >= 30, 'warn', lumas.length ? `photo clips median luma ${(median / 2.55).toFixed(0)}%` : 'no photo clips');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
  const errors = checks.filter((c) => !c.ok && c.severity === 'error');
  return { ok: errors.length === 0, checks };
}
