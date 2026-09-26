import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ffmpeg, probeDuration } from '../services/ffmpeg.js';

/**
 * Post-render QC on the actual MP4: samples frames and flags blank frames,
 * frozen clips, overall darkness and duration mismatch. Pure pixel stats —
 * no ML — so it is cheap enough to run on every render.
 */

const W = 72, H = 128;

async function grabFrame(file, seconds, tmpDir, i) {
  const out = path.join(tmpDir, `f${i}.png`);
  await ffmpeg(['-y', '-ss', seconds.toFixed(3), '-i', file, '-frames:v', '1', out]);
  const { data } = await sharp(out).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  let sq = 0;
  for (const v of data) sq += (v - mean) ** 2;
  return { data, mean, stdev: Math.sqrt(sq / data.length) };
}

function diff(a, b) {
  let s = 0;
  for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i] - b.data[i]);
  return s / a.data.length;
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

    const blank = [], frozen = [], lumas = [];
    let k = 0;
    for (const c of timeline.clips) {
      const start = c.from + c.cutAt;
      const end = c.from + c.durationInFrames - (c.exit.frames || 0);
      if (end - start < 8) continue;
      const a = await grabFrame(videoFile, (start + (end - start) * 0.2) / fps, tmpDir, k++);
      const b = await grabFrame(videoFile, (start + (end - start) * 0.85) / fps, tmpDir, k++);
      if (c.bed) lumas.push(a.mean, b.mean); // graphics sit on a deliberately dark ground
      for (const f of [a, b]) if (f.mean < 8 && f.stdev < 4) blank.push(c.id);
      // Photo beds and anything with reveals should visibly change within a clip.
      if (diff(a, b) < 0.6 && c.family !== 'ground') frozen.push(c.id);
    }
    // Tail: the last half-second before the fade-out.
    const tail = await grabFrame(videoFile, Math.max(0, duration - 1.2), tmpDir, k++);
    if (tail.mean < 8 && tail.stdev < 4) blank.push('tail');

    add('blank-frames', blank.length === 0, 'error', blank.length ? `blank frames in ${[...new Set(blank)].join(', ')}` : 'none');
    add('frozen-clips', frozen.length === 0, 'warn', frozen.length ? `no visible change inside ${frozen.join(', ')}` : 'every clip moves');
    const sortedL = [...lumas].sort((x, y) => x - y);
    const median = sortedL[Math.floor(sortedL.length / 2)] || 0;
    add('brightness', !lumas.length || median >= 30, 'warn', lumas.length ? `photo clips median luma ${(median / 2.55).toFixed(0)}%` : 'no photo clips');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
  const errors = checks.filter((c) => !c.ok && c.severity === 'error');
  return { ok: errors.length === 0, checks };
}
