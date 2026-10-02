import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateShotDemand, segmentVisualBeats, authorShots } from '../src/storyboard/shotPlanner.js';
import { normalizeMediaSceneSpec, analyzeSubtitleContrast } from '../src/composition/mediaSceneSpec.js';
import { getFormatInteractionSafeArea } from '../src/composition/layout/formatContext.js';
import { scoreAssetCandidate, GLOBAL_INVALID_GATES, CONTEXT_INVALID_GATES } from '../src/assets/assetIntelligenceScorer.js';
import { mapActionToVisibleQueries, planAssetRequests } from '../src/pipeline/assetRequestPlanner.js';
import { evaluateMediaVisualQuality } from '../src/qc/mediaVisualQualityGate.js';
import { evaluateVideoPlaybackQuality } from '../src/qc/editContinuityDiagnostics.js';

test('semantic split vs duration split: 6-second single-thought scene stays 1 shot while multi-beat scene splits', () => {
  // Scene with a single semantic thought over 6.0s
  const singleThoughtScene = {
    id: 's01',
    narration: 'Money began as something physical, scarce, and difficult to copy.',
    durationHint: 6.0,
    energy: 3,
    informationDensity: 3,
    entities: ['money'],
    sourceScenes: [{ narration: 'Money began as something physical, scarce, and difficult to copy.' }],
  };
  const singleDemand = estimateShotDemand(singleThoughtScene, { useMediaEditorial: true, format: 'landscape' });
  assert.equal(singleDemand, 1, 'A 6s scene with no semantic shift should remain 1 strong shot');

  // Scene with clear semantic sub-beats: request -> server -> response -> parse
  const multiBeatScene = {
    id: 's02',
    narration: 'The browser sends an HTTP request, then the server processes it and returns HTML, which the browser parses into the DOM.',
    durationHint: 8.5,
    energy: 4,
    informationDensity: 4,
    entities: ['browser', 'server'],
    sourceScenes: [{ narration: 'The browser sends an HTTP request, then the server processes it and returns HTML, which the browser parses into the DOM.' }],
  };
  const beats = segmentVisualBeats(multiBeatScene.narration, multiBeatScene.entities);
  assert.ok(beats.length >= 2, 'Should detect multiple visual sub-beats');
  assert.ok(beats.some((b) => b.label === 'REQUEST' || b.shift === 'NEW_ACTION'));

  const multiDemand = estimateShotDemand(multiBeatScene, { useMediaEditorial: true, format: 'landscape' });
  assert.ok(multiDemand >= 2, 'Multi-beat narration should split into 2+ shots');
});

test('blurred-backdrop fallback order throttles consecutive backdrops and triggers alternate asset', () => {
  const portraitAsset = {
    id: 'portrait_1',
    type: 'image',
    src: 'assets/portrait.jpg',
    width: 1080,
    height: 1920,
    orientation: 'portrait',
    cropFitness: 0.42,
    dimensions: { width: 1080, height: 1920 },
    focalPoint: { x: 0.5, y: 0.4 },
    subjectBounds: { x: 0.3, y: 0.2, width: 0.4, height: 0.6 },
    protectedRegions: [],
    safeTextRegions: [],
    qualityTier: 'SUPPORT',
  };

  // First occurrence with consecutive = 0: allowed as LAYERED_MEDIA
  const spec1 = normalizeMediaSceneSpec({
    shot: { id: 'shot_1', role: 'context', visualConcept: 'portrait subject' },
    asset: portraitAsset,
    format: 'landscape',
    durationInFrames: 120,
    continuity: { consecutiveLayeredBackdropCount: 0 },
  });
  assert.equal(spec1.strategy, 'LAYERED_MEDIA');

  // Second consecutive occurrence with consecutive = 1: throttled to avoid repeated blurred backdrop
  const spec2 = normalizeMediaSceneSpec({
    shot: { id: 'shot_2', role: 'context', visualConcept: 'portrait subject' },
    asset: portraitAsset,
    format: 'landscape',
    durationInFrames: 120,
    continuity: { consecutiveLayeredBackdropCount: 1 },
  });
  assert.notEqual(spec2.strategy, 'LAYERED_MEDIA', 'Should throttle consecutive blurred backdrop');
});

test('caption policy selection: CLEAN_TEXT default for landscape and low busyness, COMPACT_CAPSULE on high busyness', () => {
  const cleanAsset = { visualBusyness: 0.25 };
  const busyAsset = { visualBusyness: 0.85 };

  assert.equal(analyzeSubtitleContrast(cleanAsset, 'landscape'), 'CLEAN_TEXT');
  assert.equal(analyzeSubtitleContrast(cleanAsset, 'shorts'), 'CLEAN_TEXT');
  assert.equal(analyzeSubtitleContrast(busyAsset, 'landscape'), 'COMPACT_CAPSULE');
  assert.equal(analyzeSubtitleContrast(busyAsset, 'shorts'), 'COMPACT_CAPSULE');
});

test('interaction safe area provides platform margins without magic 260px offset', () => {
  const landscapeSafe = getFormatInteractionSafeArea('landscape', { width: 1920, height: 1080 });
  assert.ok(landscapeSafe.bottom >= 90 && landscapeSafe.bottom <= 120, 'Landscape bottom margin clears player controls');

  const shortsSafe = getFormatInteractionSafeArea('shorts', { width: 1080, height: 1920 });
  assert.ok(shortsSafe.bottom >= 300, 'Shorts bottom margin clears platform creator / comments area');
  assert.ok(shortsSafe.right >= 140, 'Shorts right margin clears interaction rail');
});

test('caption position stability maintains stable zone across sequences unless collision occurs', () => {
  const normalAsset = {
    id: 'a1',
    src: 'assets/normal.jpg',
    type: 'image',
    width: 1920,
    height: 1080,
    focalPoint: { x: 0.5, y: 0.4 },
    subjectBounds: { x: 0.35, y: 0.2, width: 0.3, height: 0.4 },
    protectedRegions: [],
    safeTextRegions: ['center_left'],
  };

  const spec = normalizeMediaSceneSpec({
    shot: { id: 'shot_normal', role: 'context', visualConcept: 'server room' },
    asset: normalAsset,
    format: 'landscape',
    durationInFrames: 120,
    continuity: { lastCaptionPosition: 'LOWER_CENTER' },
  });
  assert.equal(spec.captionPosition, 'LOWER_CENTER', 'Should keep stable LOWER_CENTER position');
});

test('generic-stock context penalty rejects smiling office when technical action is narrated', () => {
  const officeCandidate = {
    id: 'office_stock',
    providerId: 'generic-library',
    label: 'Smiling office team meeting in conference room with laptops',
    sourceUrl: 'https://example.com/office.jpg',
    width: 1920,
    height: 1080,
    metadata: {
      tags: ['office', 'team', 'meeting', 'laptops', 'smiling colleagues'],
    },
    license: { allowed: true },
  };

  // Case A: Technical action narrated -> office stock penalized
  const technicalRequest = {
    concept: 'browser sends HTTP request to server',
    assetIntent: 'action',
    constraints: { minWidth: 1920, minHeight: 1080, orientation: 'landscape' },
  };
  const technicalContext = {
    requestClass: 'ACTION',
    specificity: 0.75,
    targetSubject: ['request', 'server', 'http'],
    modifiers: ['browser'],
  };
  const techScore = scoreAssetCandidate(officeCandidate, technicalRequest, technicalContext);
  assert.ok(techScore.gates.includes('generic_stock_technical_mismatch'));
  assert.ok(techScore.classification.contextInvalid.includes('generic_stock_technical_mismatch'));
  assert.equal(techScore.qualityRank, 0);

  // Case B: General human / daily web usage narrated -> office stock is allowed
  const generalRequest = {
    concept: 'people use web browsers every day',
    assetIntent: 'atmosphere',
    constraints: { minWidth: 1920, minHeight: 1080, orientation: 'landscape' },
  };
  const generalContext = {
    requestClass: 'ATMOSPHERE',
    specificity: 0.35,
    targetSubject: ['people', 'browsers'],
    modifiers: [],
  };
  const genScore = scoreAssetCandidate(officeCandidate, generalRequest, generalContext);
  assert.ok(!genScore.gates.includes('generic_stock_technical_mismatch'));
});

test('query intent generation derives replacement queries from intended visible action', () => {
  const queriesHttpRequest = mapActionToVisibleQueries('The browser sends an HTTP GET request');
  assert.ok(queriesHttpRequest.some((q) => q.includes('server rack') || q.includes('network request')));

  const queriesDom = mapActionToVisibleQueries('HTML parser builds the DOM tree');
  assert.ok(queriesDom.some((q) => q.includes('html code editor') || q.includes('developer html source')));

  const queriesGpu = mapActionToVisibleQueries('GPU rendering and compositing smooth animation');
  assert.ok(queriesGpu.some((q) => q.includes('computer GPU') || q.includes('graphics processor')));
});

test('meaningless empty region and Shorts occupancy are flagged by media visual quality gate', () => {
  // Empty region with small media and no text
  const emptyScene = {
    shotId: 'shot_empty',
    id: 'solved_shot_empty_landscape',
    format: 'landscape',
    viewport: { width: 1920, height: 1080 },
    mediaGeometry: {
      media_primary: { rect: { x: 100, y: 100, width: 600, height: 350 } }, // ~10% area
    },
    captionBox: { x: 100, y: 900, width: 800, height: 100 },
    elements: {},
    formatPolicy: { interactionSafeApplied: false },
  };
  const emptySpec = {
    strategy: 'EDITORIAL_SPLIT',
    textNeed: 'NONE',
    cameraIntent: 'STATIC',
    transitionIntent: { entry: 'CUT' },
    assets: [{ cropFitness: 0.8, orientation: 'landscape', safeTextRegions: [] }],
  };
  const quality = evaluateMediaVisualQuality({ solvedScene: emptyScene, motionPlan: { tracks: [] }, mediaSceneSpec: emptySpec });
  assert.ok(quality.warnings.some((w) => w.code === 'meaningless_empty_region' || w.code === 'tiny_media_region'));

  // Shorts under-occupancy (small media in 9:16)
  const shortsScene = {
    shotId: 'shot_shorts_tiny',
    id: 'solved_shot_shorts_tiny_shorts',
    format: 'shorts',
    viewport: { width: 1080, height: 1920 },
    mediaGeometry: {
      media_primary: { rect: { x: 100, y: 400, width: 880, height: 600 } }, // height 600 < 1920 * 0.58
    },
    captionBox: { x: 80, y: 1500, width: 920, height: 140 },
    elements: {},
    formatPolicy: { interactionSafeApplied: true },
  };
  const shortsQuality = evaluateMediaVisualQuality({ solvedScene: shortsScene, motionPlan: { tracks: [] }, mediaSceneSpec: emptySpec });
  assert.ok(shortsQuality.warnings.some((w) => w.code === 'shorts_under_occupancy'));
});

test('video-level quality verdict assigns STRONG, ACCEPTABLE, WEAK, or FAILED based on whole-video continuity', () => {
  const dummyTimeline = {
    realizedShots: [
      { id: 's1', family: 'image', layout: 'media:FULL_BLEED' },
      { id: 's2', family: 'image', layout: 'media:FULL_BLEED' },
    ],
  };

  // Case 1: Clean video -> STRONG
  const cleanContinuity = {
    layeredBackdropCount: 0,
    consecutiveLayeredBackdropCount: 0,
    repeatedCameraRuns: [],
    longStaticCount: 0,
    subjectCaptionWarnings: [],
    rejectedVisualQualityShots: [],
    averageShotDuration: 4.2,
    rapidCutCount: 0,
  };
  const cleanReviews = {
    s1: { publishable: true, scores: { assetRelevance: 5 } },
    s2: { publishable: true, scores: { assetRelevance: 5 } },
  };
  const verdictClean = evaluateVideoPlaybackQuality(dummyTimeline, cleanContinuity, cleanReviews);
  assert.equal(verdictClean.verdict, 'STRONG');

  // Case 2: Excessive backdrops + repeated camera -> WEAK
  const weakContinuity = {
    layeredBackdropCount: 3,
    consecutiveLayeredBackdropCount: 2,
    repeatedCameraRuns: [{ value: 'subtlePush', count: 3 }],
    longStaticCount: 0,
    subjectCaptionWarnings: [],
    rejectedVisualQualityShots: [],
    averageShotDuration: 3.5,
    rapidCutCount: 0,
  };
  const verdictWeak = evaluateVideoPlaybackQuality(dummyTimeline, weakContinuity, cleanReviews);
  assert.equal(verdictWeak.verdict, 'WEAK');

  // Case 3: Multiple irrelevant assets -> FAILED
  const failedReviews = {
    s1: { publishable: false, scores: { assetRelevance: 1 } },
    s2: { publishable: false, scores: { assetRelevance: 2 } },
  };
  const verdictFailed = evaluateVideoPlaybackQuality(dummyTimeline, cleanContinuity, failedReviews);
  assert.equal(verdictFailed.verdict, 'FAILED');
});
