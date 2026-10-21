import assert from 'node:assert/strict';
import test from 'node:test';

import { validateContentQuality } from '../src/services/aiDirectorService.js';
import { authorShots, estimateShotDemand, DURATION_BANDS } from '../src/storyboard/shotPlanner.js';
import { selectVideoVisualStrategy } from '../src/storyboard/visualStrategySelector.js';
import { buildPacingDiagnostics } from '../src/pipeline/continuityDirector.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

const testStrategy = selectVideoVisualStrategy({
  topic: 'Why Your Brain Chooses Instant Gratification',
  format: 'landscape',
  plan: { style: 'minimal_premium', scenes: [] },
});

test('validateContentQuality flags generic hooks and rewards tension hooks', () => {
  const badPlan = {
    title: 'Instant Gratification',
    scenes: [
      { id: 's1', script: 'Have you ever wondered why we procrastinate?', contentBeat: 'HOOK' },
      { id: 's2', script: 'Dopamine is released in the brain.', contentBeat: 'EXPLANATION' },
    ],
  };
  const badQc = validateContentQuality(badPlan);
  assert.ok(badQc.warnings.some((w) => w.includes('generic filler opener')));

  const goodPlan = {
    title: 'Instant Gratification',
    scenes: [
      { id: 's1', script: "We know the long-term choice is better. So why does the brain keep choosing the reward that's available right now?", contentBeat: 'HOOK' },
      { id: 's2', script: 'The prefrontal cortex evaluates long-term gains, but the limbic system fires instantly.', contentBeat: 'MECHANISM' },
      { id: 's3', script: 'When you understand this asymmetry, you stop fighting willpower and start designing your environment.', contentBeat: 'PAYOFF' },
      { id: 's4', script: 'Your brain is not broken; it is simply running an ancient survival algorithm.', contentBeat: 'MEMORABLE CONCLUSION' },
    ],
  };
  const goodQc = validateContentQuality(goodPlan);
  assert.equal(goodQc.hasGenericHook, false);
  assert.equal(goodQc.hasPayoff, true);
});

test('duration bands and shot planner enforce single shot for process and chart', () => {
  assert.ok(DURATION_BANDS.process.min >= 3.5);
  assert.ok(DURATION_BANDS.chart.min >= 3.5);

  const processScene = {
    id: 's03',
    purpose: 'mechanism',
    visualIntent: 'process',
    preferredPresentation: 'process',
    energy: 4,
    complexity: 4,
    requiredComprehensionTime: 5.0,
    durationHint: 6.5,
    entities: ['brain', 'prefrontal cortex'],
    sourceScenes: [{ narration: 'First dopamine spikes, then the limbic circuit overrides the prefrontal cortex.' }],
  };

  const shots = authorShots(processScene, testStrategy, 'Instant Gratification');
  assert.equal(shots.length, 1, 'Complex process scene must remain a single stable shot');
  assert.ok(shots[0].changeReason, 'Shot must have a changeReason');
});

test('pacing diagnostics identifies rapid cuts and photo runs', () => {
  const fakeTimeline = {
    fps: 30,
    durationInFrames: 300, // 10 seconds
    scenes: [
      {
        id: 's1',
        from: 0,
        durationInFrames: 300,
        contentBeat: 'HOOK',
        shots: [
          { shotId: 'sh1', durationInFrames: 30, shotType: 'cut', visualFamily: 'cinematic_frame' },
          { shotId: 'sh2', durationInFrames: 30, shotType: 'cut', visualFamily: 'cinematic_frame' },
          { shotId: 'sh3', durationInFrames: 30, shotType: 'cut', visualFamily: 'cinematic_frame' },
          { shotId: 'sh4', durationInFrames: 30, shotType: 'cut', visualFamily: 'cinematic_frame' },
          { shotId: 'sh5', durationInFrames: 30, shotType: 'cut', visualFamily: 'cinematic_frame' },
          { shotId: 'sh6', durationInFrames: 30, shotType: 'cut', visualFamily: 'cinematic_frame' },
          { shotId: 'sh7', durationInFrames: 120, shotType: 'cut', visualFamily: 'cinematic_frame' },
        ],
      },
    ],
  };

  const diagnostics = buildPacingDiagnostics(fakeTimeline);
  assert.ok(diagnostics.rapidCutWindows.length > 0, 'Must detect rapid cut window (>5 cuts in 10s)');
  assert.equal(diagnostics.maxPhotoRunLength, 7, 'Must report photo run length of 7');
});

test('timeline QC warns when average shot duration is rushed in an explainer', () => {
  const rushedTimeline = {
    fps: 30,
    durationInFrames: 300,
    clips: [
      {
        id: 's1',
        from: 0,
        durationInFrames: 300,
        enter: { type: 'cut' },
        shots: [
          { shotId: 'sh1', durationInFrames: 40, from: 0, shotType: 'cut', visualFamily: 'cinematic_frame', family: 'image' },
          { shotId: 'sh2', durationInFrames: 40, from: 40, shotType: 'cut', visualFamily: 'cinematic_frame', family: 'image' },
          { shotId: 'sh3', durationInFrames: 40, from: 80, shotType: 'cut', visualFamily: 'cinematic_frame', family: 'image' },
          { shotId: 'sh4', durationInFrames: 40, from: 120, shotType: 'cut', visualFamily: 'cinematic_frame', family: 'image' },
          { shotId: 'sh5', durationInFrames: 40, from: 160, shotType: 'cut', visualFamily: 'cinematic_frame', family: 'image' },
          { shotId: 'sh6', durationInFrames: 40, from: 200, shotType: 'cut', visualFamily: 'cinematic_frame', family: 'image' },
          { shotId: 'sh7', durationInFrames: 60, from: 240, shotType: 'cut', visualFamily: 'cinematic_frame', family: 'image' },
        ],
      },
    ],
  };

  const qc = runTimelineQc(rushedTimeline, {
    plan: { style: 'editorial_explainer', scenes: [{ id: 's1', script: 'Short test' }] },
    narration: { words: [{ word: 'Short', start: 0, end: 1 }, { word: 'test', start: 1, end: 2 }], durationInSeconds: 10 },
    pacingDiagnostics: {
      averageShotDuration: 1.33,
      rapidCutWindows: [{ startSec: 0, endSec: 10, cutCount: 6 }],
      complexityVsHoldWarnings: [],
      textReadabilityWarnings: [],
      maxPhotoRunLength: 3,
    },
  });

  assert.ok(qc.warnings.some((w) => w.id === 'pacing-average-shot'));
  assert.ok(qc.warnings.some((w) => w.id === 'pacing-rapid-cuts'));
});
