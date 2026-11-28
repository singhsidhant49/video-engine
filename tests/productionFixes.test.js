import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeTextForTts } from '../src/audio/ttsTextNormalizer.js';
import { splitTtsText } from '../src/services/ttsService.js';
import { resolveWhisperPolicy, findSilenceCutPoint } from '../src/services/audioAnalysisService.js';
import { directAiAssets, generateDistinctSceneVisual } from '../src/pipeline/aiAssetDirector.js';
import { applyMediaOnlyReuseFallbacks } from '../src/pipeline/assetDirector.js';

test('Issue 3: normalizeTextForTts accurately normalizes decimals, percentages, currencies and abbreviations', () => {
  // Decimals (e.g. "7.5" -> "7 point 5")
  assert.equal(normalizeTextForTts('Inflation rose by 7.5% in the third quarter.'), 'Inflation rose by 7 point 5 percent in the third quarter.');
  assert.equal(normalizeTextForTts('The multiplier was 2.5x normal volume.'), 'The multiplier was 2 point 5 times normal volume.');
  assert.equal(normalizeTextForTts('It dropped from 10.5 to 7.2 over time.'), 'It dropped from 10 point 5 to 7 point 2 over time.');

  // Currencies
  assert.equal(normalizeTextForTts('The acquisition was valued at $7.5M today.'), 'The acquisition was valued at 7 point 5 million dollars today.');
  assert.equal(normalizeTextForTts('They spent $7.5 million on the project.'), 'They spent 7 point 5 million dollars on the project.');
  assert.equal(normalizeTextForTts('The price is $19.99 per unit.'), 'The price is 19 dollars and 99 cents per unit.');
  assert.equal(normalizeTextForTts('Total reserve is $50 billion.'), 'Total reserve is 50 billion dollars.');

  // Number commas and ranges
  assert.equal(normalizeTextForTts('Over 10,000 people attended, between 5-10 miles away.'), 'Over 10000 people attended, between 5 to 10 miles away.');

  // Common abbreviations with periods
  assert.equal(normalizeTextForTts('In the U.S. and U.K., Dr. Smith studied the phenomenon vs. conventional theories.'), 'In the US and UK, Doctor Smith studied the phenomenon versus conventional theories.');
});

test('Issue 3: splitTtsText never breaks sentences on decimal numbers', () => {
  const sentence = 'In 2024, the central bank raised the target interest rate to 7.5% to combat inflation, which surprised Wall Street.';
  const chunks = splitTtsText(sentence, 500);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].includes('7.5%'));
});

test('Issue 2: resolveWhisperPolicy defaults to 900s (15 min) allowing 8-minute videos to use Whisper', () => {
  const eightMin = resolveWhisperPolicy(480, {});
  assert.equal(eightMin.useWhisper, true);
  assert.equal(eightMin.maxAudioSeconds, 900);
  assert.ok(eightMin.timeoutMs >= 720000);

  // Still respects explicit lower limit if user/env explicitly requests it
  const constrained = resolveWhisperPolicy(480, { WHISPER_MAX_AUDIO_SECONDS: '180' });
  assert.equal(constrained.useWhisper, false);
});

test('Issue 2: findSilenceCutPoint locates lowest-energy pause window', () => {
  const sampleRate = 16000;
  const totalSamples = sampleRate * 35; // 35 seconds
  const samples = new Float32Array(totalSamples);

  // Fill with simulated audio (amplitude 0.5) except a silence window at 27.5s - 28.5s
  samples.fill(0.5);
  const silenceStart = Math.round(27.5 * sampleRate);
  const silenceEnd = Math.round(28.5 * sampleRate);
  for (let i = silenceStart; i < silenceEnd; i++) {
    samples[i] = 0.001;
  }

  const cut = findSilenceCutPoint(samples, 0, sampleRate, 28, 4);
  const cutSec = cut / sampleRate;
  assert.ok(cutSec >= 27.4 && cutSec <= 28.6, `Cut point ${cutSec}s must land in silence window (27.5 - 28.5s)`);
});

test('Issue 1: directAiAssets produces distinct, scene-specific visuals across multiple scenes', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-distinct-assets-'));
  const publicDir = path.join(tmpDir, 'public');
  await fs.mkdir(publicDir, { recursive: true });

  const scenes = [
    { id: 'scene_001', sceneId: 'scene_001', narration: 'The ancient Library of Alexandria was founded in Egypt.', visual: 'Ancient Alexandria scrolls library' },
    { id: 'scene_002', sceneId: 'scene_002', narration: 'Centuries later, Wall Street automated trading floors took over.', visual: 'Modern Wall Street financial trading floor' },
    { id: 'scene_003', sceneId: 'scene_003', narration: 'In deep space, the James Webb Telescope captures newborn stars.', visual: 'Deep space cosmic nebula glowing stars' },
  ];

  const assetRequests = scenes.map((s, i) => ({
    id: `req_${i + 1}`,
    sceneId: s.id,
    storyboardShotId: `shot_${i + 1}`,
    concept: s.visual,
    visualProposition: { positiveDescriptions: [s.visual] },
    visibleNeed: { visualGoal: s.visual, focalSubject: s.visual },
  }));

  try {
    const result = await directAiAssets(
      { scenes },
      {},
      {
        assetRequests,
        publicDir,
        imageSource: 'flux',
        imageStyle: 'anime',
        format: 'landscape',
        offline: true, // test fallback path
        baseSeed: 42,
      }
    );

    assert.equal(result.report.totalRequests, 3);
    assert.equal(result.report.resolvedCount, 3);

    const shot1 = result.assets['scene_001'].byShot['shot_1'];
    const shot2 = result.assets['scene_002'].byShot['shot_2'];
    const shot3 = result.assets['scene_003'].byShot['shot_3'];

    assert.ok(shot1 && shot2 && shot3);

    // Each scene MUST have its own distinct visual file and hash, NOT a blind copy of shot 1!
    assert.notEqual(shot1.src, shot2.src, 'Shot 1 and Shot 2 must have distinct asset paths');
    assert.notEqual(shot2.src, shot3.src, 'Shot 2 and Shot 3 must have distinct asset paths');
    assert.notEqual(shot1.sha256ContentHash, shot2.sha256ContentHash, 'Shot 1 and Shot 2 must have distinct content hashes');
    assert.notEqual(shot2.sha256ContentHash, shot3.sha256ContentHash, 'Shot 2 and Shot 3 must have distinct content hashes');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Issue 1: applyMediaOnlyReuseFallbacks enforces hard limit of maximum 2 reuses per asset', () => {
  const sceneIds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  const singleApprovedAsset = {
    type: 'image',
    src: 'stock_photo_1.jpg',
    finalEditorialScore: 0.9,
    visualInspection: { sceneSummary: 'financial graph' },
  };

  const assets = {
    s1: { byShot: { shot_1: singleApprovedAsset }, primary: singleApprovedAsset, alternates: [] },
    s2: { byShot: { shot_2: { unresolved: true } }, primary: null, alternates: [] },
    s3: { byShot: { shot_3: { unresolved: true } }, primary: null, alternates: [] },
    s4: { byShot: { shot_4: { unresolved: true } }, primary: null, alternates: [] },
    s5: { byShot: { shot_5: { unresolved: true } }, primary: null, alternates: [] },
  };

  const assetRequests = sceneIds.slice(0, 5).map((id, i) => ({
    sceneId: id,
    storyboardShotId: `shot_${i + 1}`,
    visibleNeed: { visualGoal: 'financial graph', focalSubject: 'financial graph', editorialMode: 'illustrative' },
  }));

  const requestReports = assetRequests.slice(1).map((req) => ({
    storyboardShotId: req.storyboardShotId,
    sceneId: req.sceneId,
    resolutionStatus: 'unresolved',
  }));

  applyMediaOnlyReuseFallbacks({
    assets,
    requestReports,
    assetRequests,
    sceneIds,
    format: 'landscape',
  });

  // Count how many times stock_photo_1.jpg appears across all shots
  let totalAppearances = 0;
  for (const scene of Object.values(assets)) {
    for (const asset of Object.values(scene.byShot || {})) {
      if (asset?.src === 'stock_photo_1.jpg') totalAppearances++;
    }
  }

  // With maxReuseCount = 2, it can appear at most 2 times (1 initial + 1 reuse), never 5 or 70 times!
  assert.ok(totalAppearances <= 2, `Asset appeared ${totalAppearances} times, must be <= 2`);
});
