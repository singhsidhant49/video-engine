import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPixelGroundingClasses } from '../src/assets/visualInspectionService.js';
import { buildSameSceneContinuationPrompt, buildSemanticRecoveryPrompt, findApprovedSameSceneContinuation } from '../src/pipeline/aiAssetDirector.js';
import { isAutomaticallyRetryableFailure, resolveVideoJobTimeoutMs, resumeStageForFailure } from '../src/server/videoJobService.js';

test('stick-figure validation never treats the selected visual style as a negative class', () => {
  const result = buildPixelGroundingClasses({
    viewerNeedsToSee: 'a stick figure choosing between three paths',
    subject: 'stick figure at a fork in the path',
    avoidVisuals: ['cartoon clipart or 3D stickman', 'corporate handshake in boardroom'],
  }, { styleId: 'stickman' });
  assert.ok(result.targets.some((target) => /stick figure/i.test(target)));
  assert.ok(!result.confusers.some((target) => /stickman|stick figure|cartoon clipart/i.test(target)));
  assert.ok(result.confusers.some((target) => /handshake/i.test(target)));
});

test('semantic recovery turns abstract replication language into a concrete visible action', () => {
  const prompt = buildSemanticRecoveryPrompt({
    narration: 'Before trusting a psychology experiment, ask who the participants were and whether it has been replicated.',
    visibleNeed: { subject: 'checklist who replicated' },
    styleLabel: 'Modern Editorial Stick Figures',
    format: 'shorts',
  });
  assert.match(prompt, /two small teams of researchers repeat the same simple psychology task/i);
  assert.match(prompt, /diverse participant groups/i);
  assert.match(prompt, /matching check marks/i);
  assert.match(prompt, /Vertical 9:16/i);
});

test('approved same-scene continuation never reuses a rejected visual', () => {
  const continuation = findApprovedSameSceneContinuation({ byShot: {
    shot_1: { src: 'assets/rejected.png' },
    shot_2: { src: 'assets/approved.png' },
  } }, {
    shot_1: { accepted: false },
    shot_2: { accepted: true },
  });
  assert.deepEqual(continuation, ['shot_2', { src: 'assets/approved.png' }]);
});

test('approved same-scene continuation always derives its prompt from scoped narration', () => {
  assert.equal(
    buildSameSceneContinuationPrompt(
      { narration: 'Pause before reacting on autopilot.' },
      { visibleNeed: { narrationText: 'fallback narration' } },
    ),
    'Approved same-scene visual continuation for narration: Pause before reacting on autopilot.',
  );
  assert.equal(
    buildSameSceneContinuationPrompt({}, { visibleNeed: { narrationText: 'Use the visible-need narration.' } }),
    'Approved same-scene visual continuation for narration: Use the visible-need narration.',
  );
});

test('long-form jobs receive a duration-aware CPU render budget', () => {
  const env = { VIDEO_JOB_TIMEOUT_MS: String(90 * 60_000), VIDEO_JOB_MAX_TIMEOUT_MS: String(12 * 60 * 60_000) };
  const longForm = resolveVideoJobTimeoutMs({ request: { output: { durationSeconds: 485 } } }, env);
  const short = resolveVideoJobTimeoutMs({ request: { output: { durationSeconds: 52 } } }, env);
  assert.ok(longForm >= 250 * 60_000, `expected at least 250 minutes, got ${longForm / 60_000}`);
  assert.ok(short < 120 * 60_000);
});

test('a render timeout is automatically resumable from the render checkpoint', () => {
  const failure = { code: 'VIDEO_JOB_TIMEOUT', stage: 'Rendering video: 29%' };
  assert.equal(isAutomaticallyRetryableFailure(failure), true);
  assert.equal(resumeStageForFailure(failure), 'render');
});

test('a caption alignment QC failure is automatically retryable from alignment', () => {
  const failure = { code: 'TIMELINE_QC_FAILED', resumeFrom: 'alignment', stage: 'Building the edit...' };
  assert.equal(isAutomaticallyRetryableFailure(failure), true);
  assert.equal(resumeStageForFailure(failure), 'alignment');
});
