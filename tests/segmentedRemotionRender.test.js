import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  planRenderSegments,
  renderMediaSegmented,
  shouldUseSegmentedRender,
} from '../src/pipeline/segmentedRemotionRender.js';

test('long render segmentation covers every frame exactly once', () => {
  const segments = planRenderSegments(14_401, 30, 60);
  assert.equal(segments.length, 9);
  assert.equal(segments[0].startFrame, 0);
  assert.equal(segments.at(-1).endFrame, 14_400);
  for (let index = 1; index < segments.length; index++) {
    assert.equal(segments[index].startFrame, segments[index - 1].endFrame + 1);
  }
  assert.equal(segments.reduce((sum, segment) => sum + segment.frameCount, 0), 14_401);
});

test('segmented rendering is limited to full long-form compositions', () => {
  const env = { REMOTION_SEGMENTED_RENDER_MIN_SECONDS: '180' };
  assert.equal(shouldUseSegmentedRender({ totalFrames: 5_399, fps: 30, env }), false);
  assert.equal(shouldUseSegmentedRender({ totalFrames: 5_400, fps: 30, env }), true);
  assert.equal(shouldUseSegmentedRender({ totalFrames: 20_000, fps: 30, frameRange: [0, 90], env }), false);
  assert.equal(shouldUseSegmentedRender({ totalFrames: 20_000, fps: 30, env: { ...env, REMOTION_SEGMENTED_RENDER_ENABLED: 'false' } }), false);
});

test('completed render segments are reused after interruption', async (t) => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'segmented-render-'));
  t.after(() => fs.rm(runDir, { recursive: true, force: true }));
  const durations = new Map();
  const renderCalls = [];
  const renderMediaFn = async ({ outputLocation, frameRange }) => {
    renderCalls.push(frameRange);
    await fs.writeFile(outputLocation, 'segment');
    durations.set(outputLocation, (frameRange[1] - frameRange[0] + 1) / 30);
  };
  const probe = async (file) => {
    if (durations.has(file)) return durations.get(file);
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  };
  const concatSegments = async (files, _list, output) => {
    await fs.writeFile(output, files.join('\n'));
    durations.set(output, 120);
  };
  const outputOne = path.join(runDir, 'first.mp4');
  await renderMediaSegmented({
    renderMediaFn, renderOptions: {}, runDir, totalFrames: 3_600, fps: 30,
    renderIdentity: { timeline: 'stable' }, temporaryOutputPath: outputOne,
    segmentSeconds: 60, probe, concatSegments,
  });
  assert.equal(renderCalls.length, 2);

  // Simulate persisted files being valid to a real probe on the next worker.
  for (const [file, duration] of [...durations]) {
    if (file.includes('segment-') && file.includes('.partial-')) {
      durations.set(file.replace(/\.partial-[^.]+\.mp4$/, '.mp4'), duration);
    }
  }
  const outputTwo = path.join(runDir, 'second.mp4');
  await renderMediaSegmented({
    renderMediaFn, renderOptions: {}, runDir, totalFrames: 3_600, fps: 30,
    renderIdentity: { timeline: 'stable' }, temporaryOutputPath: outputTwo,
    segmentSeconds: 60, probe, concatSegments,
  });
  assert.equal(renderCalls.length, 2, 'valid content-addressed segments are not rendered twice');
});
