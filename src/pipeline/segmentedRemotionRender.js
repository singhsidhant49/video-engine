import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ffmpeg, probeDuration } from '../services/ffmpeg.js';

export function planRenderSegments(totalFrames, fps, segmentSeconds = 60) {
  const frames = Math.max(1, Math.floor(Number(totalFrames) || 1));
  const frameRate = Math.max(1, Number(fps) || 30);
  const segmentFrames = Math.max(frameRate, Math.round(Math.max(10, Number(segmentSeconds) || 60) * frameRate));
  const segments = [];
  for (let startFrame = 0, index = 0; startFrame < frames; startFrame += segmentFrames, index++) {
    const endFrame = Math.min(frames - 1, startFrame + segmentFrames - 1);
    segments.push({
      index,
      startFrame,
      endFrame,
      frameCount: endFrame - startFrame + 1,
      durationSeconds: (endFrame - startFrame + 1) / frameRate,
    });
  }
  return segments;
}

export function shouldUseSegmentedRender({ totalFrames, fps, frameRange = null, env = process.env }) {
  if (frameRange || env.REMOTION_SEGMENTED_RENDER_ENABLED === 'false') return false;
  const durationSeconds = Math.max(0, Number(totalFrames) / Math.max(1, Number(fps) || 30));
  const minimumSeconds = Math.max(30, Number(env.REMOTION_SEGMENTED_RENDER_MIN_SECONDS || 180));
  return durationSeconds >= minimumSeconds;
}

function concatPath(file) {
  return path.resolve(file).replaceAll('\\', '/').replaceAll("'", "'\\''");
}

async function defaultConcatSegments(segmentPaths, listPath, outputPath) {
  await fs.writeFile(listPath, `${segmentPaths.map((file) => `file '${concatPath(file)}'`).join('\n')}\n`);
  await ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy', '-movflags', '+faststart', '-y', outputPath,
  ]);
}

async function isUsableSegment(file, expectedSeconds, probe = probeDuration) {
  try {
    const actual = await probe(file);
    return Number.isFinite(actual) && Math.abs(actual - expectedSeconds) <= Math.max(0.75, expectedSeconds * 0.03);
  } catch {
    return false;
  }
}

/**
 * Render long compositions in atomic, resumable pieces. A worker crash loses
 * at most the active piece; completed pieces are content-addressed by the
 * timeline/render settings and reused by the next render-stage retry.
 */
export async function renderMediaSegmented({
  renderMediaFn,
  renderOptions,
  runDir,
  totalFrames,
  fps,
  renderIdentity,
  temporaryOutputPath,
  segmentSeconds = Number(process.env.REMOTION_SEGMENT_SECONDS || 60),
  onOverallProgress = () => {},
  probe = probeDuration,
  concatSegments = defaultConcatSegments,
}) {
  const segments = planRenderSegments(totalFrames, fps, segmentSeconds);
  const key = createHash('sha256').update(JSON.stringify(renderIdentity)).digest('hex').slice(0, 16);
  const segmentDir = path.join(runDir, 'render-segments', key);
  await fs.mkdir(segmentDir, { recursive: true });
  const segmentPaths = [];

  for (const segment of segments) {
    const segmentPath = path.join(segmentDir, `segment-${String(segment.index).padStart(4, '0')}.mp4`);
    const partialPath = `${segmentPath}.partial-${process.pid}`;
    if (!(await isUsableSegment(segmentPath, segment.durationSeconds, probe))) {
      await fs.rm(segmentPath, { force: true }).catch(() => {});
      await fs.rm(partialPath, { force: true }).catch(() => {});
      try {
        await renderMediaFn({
          ...renderOptions,
          outputLocation: partialPath,
          frameRange: [segment.startFrame, segment.endFrame],
          onProgress: ({ progress = 0 }) => {
            onOverallProgress((segment.index + Math.max(0, Math.min(1, progress))) / segments.length, segment);
          },
        });
        if (!(await isUsableSegment(partialPath, segment.durationSeconds, probe))) {
          throw new Error(`Rendered segment ${segment.index + 1}/${segments.length} failed duration validation`);
        }
        await fs.rename(partialPath, segmentPath);
      } finally {
        await fs.rm(partialPath, { force: true }).catch(() => {});
      }
    }
    segmentPaths.push(segmentPath);
    onOverallProgress((segment.index + 1) / segments.length, segment);
  }

  const listPath = path.join(segmentDir, 'concat.txt');
  await concatSegments(segmentPaths, listPath, temporaryOutputPath);
  const expectedDuration = totalFrames / fps;
  if (!(await isUsableSegment(temporaryOutputPath, expectedDuration, probe))) {
    throw new Error('Concatenated long-form render failed duration validation');
  }
  return { segments: segmentPaths, key };
}
