import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRenderedMotion, pixelDifferenceExcludingRect, renderedMotionThreshold } from '../src/qc/renderQc.js';
import { classifyBenchmarkFailure, evaluateProductionBenchmark } from '../src/benchmark/productionBenchmark.js';
import { resolvedCameraPresentation } from '../src/pipeline/timeline.js';

test('rendered motion QC does not call an intentional static image frozen', () => {
  const result = classifyRenderedMotion({ differences: [0.01, 0.02], expectedMotion: false, nativeMotion: false });
  assert.equal(result.frozen, false);
  assert.equal(result.intentionalStatic, true);
});

test('rendered motion QC blocks invisible planned and native motion', () => {
  assert.equal(classifyRenderedMotion({ differences: [0.04, 0.08], expectedMotion: true }).frozen, true);
  assert.equal(classifyRenderedMotion({ differences: [0.04, 0.08], nativeMotion: true }).frozen, true);
  assert.equal(classifyRenderedMotion({ differences: [0.1, 0.8], expectedMotion: true }).frozen, false);
});

test('long contemplative camera moves use a sensitive but nonzero pixel threshold', () => {
  const threshold = renderedMotionThreshold({
    meanLuminance: 65,
    durationInFrames: 324,
    tracks: [{ property: 'cameraScale', from: 1.025, to: 1 }],
  });
  assert.equal(threshold, 0.08);
  assert.equal(classifyRenderedMotion({ differences: [0.136], expectedMotion: true, threshold }).frozen, false);
  assert.equal(classifyRenderedMotion({ differences: [0], expectedMotion: true, threshold }).frozen, true);
});

test('rendered motion measurement excludes subtitle pixel changes', () => {
  const width = 72, height = 128;
  const base = { data: new Uint8Array(width * height) };
  const subtitleOnly = { data: new Uint8Array(width * height) };
  for (let y = 96; y < height; y++) for (let x = 0; x < width; x++) subtitleOnly.data[y * width + x] = 255;
  const subtitleMask = { x: 0, y: 96, right: width - 1, bottom: height - 1 };
  assert.equal(pixelDifferenceExcludingRect(base, subtitleOnly, subtitleMask), 0);
  subtitleOnly.data[10 * width + 10] = 255;
  assert.ok(pixelDifferenceExcludingRect(base, subtitleOnly, subtitleMask) > 0);
});

test('renderer-facing camera metadata follows the solved path after a safe downgrade', () => {
  const presentation = resolvedCameraPresentation(
    { cameraMove: 'subtlePush', movementState: 'SUBTLE' },
    { solvedScene: { cameraPaths: { media_primary: { behavior: 'STATIC' } } }, mediaSceneSpec: { assets: [{ motionPresent: null }] } },
    { type: 'image' },
  );
  assert.equal(presentation.authoredCameraMove, 'subtlePush');
  assert.equal(presentation.cameraMove, 'static');
  assert.equal(presentation.movementState, 'STATIC');
  assert.equal(presentation.cameraDowngraded, true);
});

test('production benchmark enforces sample size and publishability thresholds', () => {
  const clean = Array.from({ length: 30 }, (_, index) => ({
    profileId: `p${index % 8}`,
    success: true,
    attempts: 1,
    durationCompliant: true,
    hardQcFailures: 0,
    unresolvedMedia: 0,
    wrongAssets: 0,
    qcChecks: [],
  }));
  assert.equal(evaluateProductionBenchmark(clean).passed, true);
  const broken = clean.slice(0, 29);
  broken[0] = { ...broken[0], success: false, qcChecks: [{ id: 'blank-frames', ok: false }] };
  const verdict = evaluateProductionBenchmark(broken);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.failures.some((failure) => failure.includes('more run')));
  assert.equal(verdict.metrics.blankFrames, 1);
  assert.equal(verdict.metrics.durationCompliance, 1, 'failed jobs must not be mislabeled as duration failures');
});

test('benchmark failures are grouped by actionable pipeline stage', () => {
  assert.equal(classifyBenchmarkFailure('Narration quality gate failed'), 'narration_quality');
  assert.equal(classifyBenchmarkFailure('Timeline QC failed'), 'timeline_qc');
  assert.equal(classifyBenchmarkFailure('Compositor error: No frame found'), 'render');
  assert.equal(classifyBenchmarkFailure('Production rendering requires an approved media asset'), 'asset_resolution');
});
