import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDurationBudget, estimateScriptDuration, buildDurationDiagnostics } from '../src/storyboard/durationBudget.js';
import { compressPlanScript } from '../src/services/aiDirectorService.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

test('calculateDurationBudget derives balanced word and time constraints for 75s explainer', () => {
  const budget = calculateDurationBudget({ targetDurationSec: 75, format: 'landscape' });

  assert.equal(budget.targetDurationSec, 75);
  assert.equal(budget.allowedMinDuration, 71.25);
  assert.equal(budget.allowedMaxDuration, 78.75);
  assert.equal(budget.hardMinDuration, 67.5);
  assert.equal(budget.hardMaxDuration, 82.5);

  // Target words should be around ~180-185 words (2.6 words/sec * ~70s narration)
  assert.ok(budget.targetWords >= 175 && budget.targetWords <= 190);
  assert.ok(budget.maxWords >= 185 && budget.maxWords <= 200);

  // Scene count should be between 8 and 11 content beats for 75s
  assert.ok(budget.targetSceneCount >= 8 && budget.targetSceneCount <= 11);

  // Section budgets exist and cover the 5 narrative sections
  assert.ok(budget.sectionBudgets.hook);
  assert.ok(budget.sectionBudgets.why_it_matters);
  assert.ok(budget.sectionBudgets.core_explanation);
  assert.ok(budget.sectionBudgets.example_evidence);
  assert.ok(budget.sectionBudgets.payoff_conclusion);
});

test('estimateScriptDuration computes word count and estimated speech seconds', () => {
  const script = 'A rat in a cage will press a lever thousands of times for a hit of sugar.';
  const est = estimateScriptDuration(script, 0.5, 2.6);

  assert.equal(est.wordCount, 17);
  assert.ok(Math.abs(est.estimatedSpeechSec - (17 / 2.6)) < 0.05);
  assert.ok(Math.abs(est.estimatedTotalSec - (17 / 2.6 + 0.5)) < 0.05);
});

test('compressPlanScript deterministically compresses overlong scripts while preserving hook and payoff', async () => {
  const overlongPlan = {
    title: 'Test Overlong Script',
    scenes: [
      { id: 's01', purpose: 'hook', narration: 'We know the long-term choice is always better, but our immediate impulses keep overriding logic completely.', importance: 5 },
      { id: 's02', purpose: 'context', narration: 'Every single modern human being experiences this exact cognitive tug-of-war dozens of times every single day without even realizing it.', importance: 2 },
      { id: 's03', purpose: 'explanation', narration: 'The ancient limbic system fires immediately upon noticing any potential food or digital stimulation in our surroundings.', importance: 4 },
      { id: 's04', purpose: 'explanation', narration: 'Meanwhile the highly evolved prefrontal cortex attempts to calculate long-term probabilistic outcomes and retirement savings plans.', importance: 3 },
      { id: 's05', purpose: 'example', narration: 'When a smartphone notification buzzes on your mahogany desk while you are attempting to write an important quarterly financial report.', importance: 2 },
      { id: 's06', purpose: 'payoff', narration: 'By deliberately redesigning your physical environment and inserting friction, you regain control over your attention.', importance: 5 },
    ],
  };

  const initialWords = overlongPlan.scenes.map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
  assert.ok(initialWords > 90);

  const targetWords = 60;
  const compressed = await compressPlanScript(overlongPlan, targetWords, targetWords + 5, null);
  const finalWords = compressed.scenes.map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;

  assert.ok(finalWords <= targetWords + 5, `Expected <= ${targetWords + 5} words, got ${finalWords}`);
  assert.equal(compressed.scenes.length, 6, 'Must preserve all scene IDs');
  assert.equal(compressed.scenes[0].purpose, 'hook');
  assert.equal(compressed.scenes[5].purpose, 'payoff');
});

test('timeline QC enforces duration tolerance and reports hard failure outside 10%', () => {
  const budget = calculateDurationBudget({ targetDurationSec: 75 });

  // 1. Compliant timeline (74s)
  const compliantTimeline = {
    fps: 30,
    durationInFrames: 30 * 74,
    clips: [{ id: 'c1', from: 0, durationInFrames: 30 * 74, enter: { type: 'cut' }, shots: [{ id: 'sh1', durationInFrames: 30 * 74, from: 0 }] }],
  };
  const compliantDiagnostics = buildDurationDiagnostics({ budget, timeline: compliantTimeline });
  const qcPass = runTimelineQc(compliantTimeline, { durationDiagnostics: compliantDiagnostics });
  assert.ok(qcPass.checks.find((c) => c.id === 'duration-tolerance')?.ok);

  // 2. Overlong timeline (115s - like the Milestone 7 regression)
  const overlongTimeline = {
    fps: 30,
    durationInFrames: 30 * 115,
    clips: [{ id: 'c1', from: 0, durationInFrames: 30 * 115, enter: { type: 'cut' }, shots: [{ id: 'sh1', durationInFrames: 30 * 115, from: 0 }] }],
  };
  const overlongDiagnostics = buildDurationDiagnostics({ budget, timeline: overlongTimeline });
  const qcFail = runTimelineQc(overlongTimeline, { durationDiagnostics: overlongDiagnostics });
  const durCheck = qcFail.checks.find((c) => c.id === 'duration-tolerance');
  assert.equal(durCheck.ok, false, 'Timeline exceeding hard limits must fail duration-tolerance check');
  assert.equal(durCheck.severity, 'error');
});
