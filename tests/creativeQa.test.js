import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCreativeQa,
  applyCreativeRepairs,
  runCreativeQaLoop,
  SHOT_QUALITY_STATE,
  ISSUE_SEVERITY,
  REPAIR_ACTIONS,
  REPAIR_PRIORITY,
} from '../src/qc/creativeQaDirector.js';

test('Creative QA: detects and repairs representation fatigue (3+ consecutive identical representations)', () => {
  const timeline = {
    fps: 30,
    format: 'shorts',
    clips: [
      {
        sceneId: 'sc1',
        from: 0,
        durationInFrames: 90,
        narration: 'The agent analyzes AST trees in the workspace.',
        family: 'code',
        variant: 'syntax',
        shots: [{ id: 'sh1', sceneId: 'sc1', family: 'code', variant: 'syntax', durationInFrames: 90 }],
      },
      {
        sceneId: 'sc2',
        from: 90,
        durationInFrames: 90,
        narration: 'It writes unit tests in the editor buffer.',
        family: 'code',
        variant: 'syntax',
        shots: [{ id: 'sh2', sceneId: 'sc2', family: 'code', variant: 'syntax', durationInFrames: 90 }],
      },
      {
        sceneId: 'sc3',
        from: 180,
        durationInFrames: 90,
        narration: 'Then it loops through the execution cycle to verify patches.',
        family: 'code',
        variant: 'syntax',
        shots: [{ id: 'sh3', sceneId: 'sc3', family: 'code', variant: 'syntax', durationInFrames: 90 }],
      },
    ],
  };

  const qaReport = evaluateCreativeQa({ timeline, topic: 'How AI Coding Agents Work' });
  assert.equal(qaReport.evaluatedShotsCount, 3);

  const shot3Eval = qaReport.shotEvaluations.find((s) => s.shotId === 'sh3');
  assert.ok(shot3Eval.issues.includes('representation_fatigue'), 'Should flag representation fatigue on 3rd code shot');
  assert.ok(shot3Eval.repairCandidates.some((c) => c.action === REPAIR_ACTIONS.CHANGE_REPRESENTATION));

  const { timeline: repairedTimeline, appliedRepairs } = applyCreativeRepairs(timeline, qaReport.repairsNeeded);
  assert.ok(appliedRepairs.length >= 1);
  const repChange = appliedRepairs.find((r) => r.action === REPAIR_ACTIONS.CHANGE_REPRESENTATION && r.shotId === 'sh3');
  assert.ok(repChange, 'Repairs should change representation of sh3');
  assert.equal(repairedTimeline.clips[2].shots[0].family, 'process');
});

test('Creative QA: repairs domain semantic inappropriateness (developer UI in psychology topic)', () => {
  const timeline = {
    fps: 30,
    clips: [
      {
        sceneId: 'sc1',
        from: 0,
        durationInFrames: 90,
        narration: 'Your brain chooses between immediate dopamine and long-term reward.',
        family: 'ui',
        variant: 'workspace',
        shots: [{ id: 'sh1', sceneId: 'sc1', family: 'ui', variant: 'workspace', durationInFrames: 90 }],
      },
    ],
  };

  const qaReport = evaluateCreativeQa({ timeline, topic: 'Why Your Brain Chooses Instant Gratification' });
  const shotEval = qaReport.shotEvaluations[0];
  assert.ok(shotEval.issues.includes('inappropriate_domain_ui'), 'Software UI should be flagged in psychology context');
  assert.equal(shotEval.qualityState, SHOT_QUALITY_STATE.WEAK);

  const { timeline: repairedTimeline, appliedRepairs } = applyCreativeRepairs(timeline, qaReport.repairsNeeded);
  assert.equal(appliedRepairs[0].action, REPAIR_ACTIONS.CHANGE_REPRESENTATION);
  assert.ok(['diagram', 'compare'].includes(repairedTimeline.clips[0].shots[0].family));
});

test('Creative QA: repairs blank composition and nearly empty screen', () => {
  const timeline = {
    fps: 30,
    clips: [
      {
        sceneId: 'sc1',
        from: 0,
        durationInFrames: 90,
        narration: 'A deep look into modern technology systems.',
        family: 'ground',
        variant: 'default',
        shots: [{ id: 'sh1', sceneId: 'sc1', family: 'ground', durationInFrames: 90 }],
      },
      {
        sceneId: 'sc2',
        from: 90,
        durationInFrames: 90,
        narration: 'Simple concept with empty screen.',
        family: 'statement',
        overlay: { headline: 'Tiny' },
        shots: [{ id: 'sh2', sceneId: 'sc2', family: 'statement', overlay: { headline: 'Tiny' }, durationInFrames: 90 }],
      },
    ],
  };

  const qaReport = evaluateCreativeQa({ timeline, topic: 'Modern Tech' });
  assert.equal(qaReport.qualitySummary.hardFailureCount, 1, 'Blank ground frame is a hard failure');
  assert.ok(qaReport.qualitySummary.editorialWarningCount >= 1, 'Nearly empty screen is an editorial warning');
  assert.equal(qaReport.qualitySummary.failedCount, 1);
  assert.equal(qaReport.isProductionReady, false);

  const { timeline: repairedTimeline } = applyCreativeRepairs(timeline, qaReport.repairsNeeded);
  assert.notEqual(repairedTimeline.clips[0].shots[0].family, 'ground');
  assert.notEqual(repairedTimeline.clips[1].shots[0].family, 'statement');
});

test('Creative QA: text overflow simplification for long headlines', () => {
  const longHeadline = 'This is an exceedingly long headline designed to test whether text overflow exceeds eighty characters and wraps awkwardly';
  const timeline = {
    fps: 30,
    clips: [
      {
        sceneId: 'sc1',
        from: 0,
        durationInFrames: 90,
        narration: 'Explaining key ideas.',
        family: 'statement',
        overlay: { headline: longHeadline },
        shots: [{ id: 'sh1', sceneId: 'sc1', family: 'statement', overlay: { headline: longHeadline }, durationInFrames: 90 }],
      },
    ],
  };

  const qaReport = evaluateCreativeQa({ timeline, topic: 'Testing' });
  const shotEval = qaReport.shotEvaluations[0];
  assert.ok(shotEval.issues.includes('clipped_text'));

  const { timeline: repairedTimeline, appliedRepairs } = applyCreativeRepairs(timeline, qaReport.repairsNeeded);
  assert.ok(appliedRepairs.some((r) => r.action === REPAIR_ACTIONS.SIMPLIFY_TEXT));
  assert.ok(repairedTimeline.clips[0].shots[0].overlay.headline.length < 50);
});

test('Creative QA: weak asset replacement with higher-scoring alternate or procedural visualization', () => {
  const timeline = {
    fps: 30,
    clips: [
      {
        sceneId: 'sc1',
        from: 0,
        durationInFrames: 90,
        narration: 'The system architecture handles message pipelines.',
        family: 'image',
        visualConcept: 'system architecture diagram',
        asset: { id: 'generic_stock_1', score: 35, tier: 'generic', generic: true },
        shots: [{
          id: 'sh1',
          sceneId: 'sc1',
          family: 'image',
          visualConcept: 'system architecture diagram',
          asset: { id: 'generic_stock_1', score: 35, tier: 'generic', generic: true },
          durationInFrames: 90,
        }],
      },
    ],
  };

  const assets = {
    sc1: {
      primary: { id: 'generic_stock_1', score: 35, tier: 'generic', generic: true },
      alternates: [{ id: 'authentic_diagram_1', score: 88, tier: 'authoritative' }],
    },
  };

  const qaReport = evaluateCreativeQa({ timeline, assets, topic: 'Distributed Architecture' });
  const shotEval = qaReport.shotEvaluations[0];
  assert.ok(shotEval.issues.includes('weak_media'));
  assert.equal(shotEval.qualityState, SHOT_QUALITY_STATE.WEAK);

  const { timeline: repairedTimeline, appliedRepairs } = applyCreativeRepairs(timeline, qaReport.repairsNeeded);
  assert.equal(appliedRepairs[0].action, REPAIR_ACTIONS.REPLACE_ASSET);
  assert.equal(repairedTimeline.clips[0].shots[0].asset.id, 'authentic_diagram_1');
});

test('Creative QA: caption yielding suppresses floating captions during busy graphic presentation', () => {
  const timeline = {
    fps: 30,
    clips: [
      {
        sceneId: 'sc1',
        from: 0,
        durationInFrames: 90,
        family: 'diagram',
        shots: [{ id: 'sh1', sceneId: 'sc1', family: 'diagram', durationInFrames: 90 }],
      },
    ],
    captions: {
      chunks: [{ startSec: 0.5, endSec: 2.5, text: 'Examining the inner nodes' }],
      hidden: [],
    },
  };

  const qaReport = evaluateCreativeQa({ timeline, topic: 'Complex Diagram' });
  const shotEval = qaReport.shotEvaluations[0];
  assert.ok(shotEval.issues.includes('caption_competition'));

  const { timeline: repairedTimeline, appliedRepairs } = applyCreativeRepairs(timeline, qaReport.repairsNeeded);
  assert.ok(appliedRepairs.some((r) => r.action === REPAIR_ACTIONS.HIDE_CAPTION));
  assert.deepEqual(repairedTimeline.captions.hidden[0], [0, 90]);
});

test('Creative QA: preserves STRONG shots untouched', () => {
  const timeline = {
    fps: 30,
    clips: [
      {
        sceneId: 'sc1',
        from: 0,
        durationInFrames: 90,
        family: 'image',
        asset: { id: 'perfect_euv_machine', score: 95, tier: 'authoritative' },
        shots: [{
          id: 'sh1',
          sceneId: 'sc1',
          family: 'image',
          asset: { id: 'perfect_euv_machine', score: 95, tier: 'authoritative' },
          presentation: { qualityState: SHOT_QUALITY_STATE.STRONG },
          durationInFrames: 90,
        }],
      },
    ],
  };

  const qaReport = evaluateCreativeQa({ timeline, topic: 'ASML Monopoly' });
  assert.equal(qaReport.shotEvaluations[0].qualityState, SHOT_QUALITY_STATE.STRONG);
  assert.equal(qaReport.repairsNeeded.length, 0);

  const { timeline: repairedTimeline, appliedRepairs } = applyCreativeRepairs(timeline, qaReport.repairsNeeded);
  assert.equal(appliedRepairs.length, 0);
  assert.equal(repairedTimeline.clips[0].shots[0].asset.id, 'perfect_euv_machine');
});

test('Creative QA: strictly bounds repair loop to maximum 2 passes', () => {
  const timeline = {
    fps: 30,
    clips: [
      {
        sceneId: 'sc1',
        from: 0,
        durationInFrames: 90,
        family: 'statement',
        overlay: { headline: 'A long headline exceeding seventy characters which will trigger text simplification review' },
        shots: [{
          id: 'sh1',
          sceneId: 'sc1',
          family: 'statement',
          overlay: { headline: 'A long headline exceeding seventy characters which will trigger text simplification review' },
          durationInFrames: 90,
        }],
      },
    ],
  };

  const result = runCreativeQaLoop({
    timeline,
    topic: 'Test Max Passes',
    maxPasses: 2,
  });

  assert.ok(result.passesRun <= 2, `Passes run must not exceed 2 (was ${result.passesRun})`);
  assert.ok(result.creativeQaBefore);
  assert.ok(result.creativeQaAfter);
  assert.ok(Array.isArray(result.repairsApplied));
});
