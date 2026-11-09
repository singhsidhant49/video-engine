import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectVisualCandidate, compareVisualToNeed } from '../src/assets/visualInspectionService.js';
import {
  buildMaterializationQueue,
  directAssets,
  resolveMaterializationAttemptLimits,
  shouldPreferVideoForCoverage,
} from '../src/pipeline/assetDirector.js';

test('phone use in bed directly matches an insomnia bedroom shot', async () => {
  const inspection = await inspectVisualCandidate({
    id: 'pexels-phone-bed-regression',
    type: 'video',
    label: 'a man using a mobile phone on bed',
    title: 'a man using a mobile phone on bed',
  });
  const comparison = compareVisualToNeed(inspection, {
    primaryConcept: 'insomnia anxious person in dark bedroom phone screen glow',
    subject: 'anxious person with insomnia',
    action: 'using a smartphone in bed',
    environment: 'dark bedroom at night',
  });

  assert.ok(comparison.subjectMatch >= 0.75, JSON.stringify(comparison));
  assert.ok(comparison.actionMatch >= 0.75, JSON.stringify(comparison));
  assert.ok(comparison.environmentMatch >= 0.60, JSON.stringify(comparison));
});

test('human eye close-up directly matches a tired-eyes shot', async () => {
  const inspection = await inspectVisualCandidate({
    id: 'pexels-eye-regression',
    type: 'video',
    label: 'close-up of human eye',
    title: 'close-up of human eye',
  });
  const comparison = compareVisualToNeed(inspection, {
    primaryConcept: 'close up tired eyes wide open at night',
    subject: 'tired human eyes',
    action: 'eyes open in a close-up gaze',
    environment: 'dark night',
  });

  assert.ok(comparison.subjectMatch >= 0.90, JSON.stringify(comparison));
  assert.ok(comparison.actionMatch >= 0.90, JSON.stringify(comparison));
});

test('materialization retries stay bounded with invalid or excessive configuration', () => {
  assert.deepEqual(resolveMaterializationAttemptLimits({
    ASSET_PRIMARY_MATERIALIZATION_ATTEMPTS: 'invalid',
    ASSET_EMERGENCY_MATERIALIZATION_ATTEMPTS: 'invalid',
  }), { primary: 6, emergency: 3 });
  assert.deepEqual(resolveMaterializationAttemptLimits({
    ASSET_PRIMARY_MATERIALIZATION_ATTEMPTS: '999',
    ASSET_EMERGENCY_MATERIALIZATION_ATTEMPTS: '999',
  }), { primary: 12, emergency: 6 });

  const ranked = Array.from({ length: 20 }, (_, index) => ({
    candidate: { id: `candidate-${index}`, providerId: `provider-${index}`, type: 'video' },
    score: { qualityRank: 3, resolutionStatus: 'good', gates: [] },
  }));
  assert.equal(buildMaterializationQueue(ranked, 3).length, 3);
  assert.equal(buildMaterializationQueue(ranked, Number.NaN).length, 10);
});

test('asset resolution stops immediately when its queue lease is cancelled', async () => {
  const controller = new AbortController();
  const reason = Object.assign(new Error('lease lost'), { name: 'AbortError', code: 'QUEUE_LEASE_LOST' });
  controller.abort(reason);
  await assert.rejects(
    directAssets([], [], { signal: controller.signal }),
    (error) => error === reason && error.code === 'QUEUE_LEASE_LOST',
  );
});

test('asset selection requests motion before an explainer photo run exceeds its profile', () => {
  const request = { preferredMediaType: 'either', nativeMotionRequired: false };
  assert.equal(shouldPreferVideoForCoverage({
    request,
    currentVideoDuration: 20,
    totalPlannedDuration: 100,
    minVideoShare: 0.10,
    consecutiveImageSelections: 4,
    maxPhotoRun: 5,
  }), true);
  assert.equal(shouldPreferVideoForCoverage({
    request,
    currentVideoDuration: 20,
    totalPlannedDuration: 100,
    minVideoShare: 0.10,
    consecutiveImageSelections: 3,
    maxPhotoRun: 5,
  }), false);
  assert.equal(shouldPreferVideoForCoverage({
    request: { preferredMediaType: 'image' },
    currentVideoDuration: 0,
    totalPlannedDuration: 100,
    minVideoShare: 0.50,
    consecutiveImageSelections: 10,
    maxPhotoRun: 5,
  }), false);
});
