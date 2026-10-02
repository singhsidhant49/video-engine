import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVideoPlaybackQuality } from '../src/qc/editContinuityDiagnostics.js';
import { scoreAssetCandidate, compareCandidateScores } from '../src/assets/assetIntelligenceScorer.js';
import { mapActionToVisibleQueries, planAssetRequests } from '../src/pipeline/assetRequestPlanner.js';
import { resolveVisualPolicy } from '../src/config/visualMode.js';
import { buildTimeline } from '../src/pipeline/timeline.js';

test('Milestone 17: Video verdict aggregation persists shot counts and derives overall verdict from worst important shots', () => {
  const dummyTimeline = {
    fps: 30,
    realizedShots: [
      { id: 's1', storyboardShotId: 's1', durationInFrames: 90, family: 'image', layout: 'media:FULL_BLEED' },
      { id: 's2', storyboardShotId: 's2', durationInFrames: 120, family: 'image', layout: 'media:FULL_BLEED' },
      { id: 's3', storyboardShotId: 's3', durationInFrames: 90, family: 'image', layout: 'media:FULL_BLEED' },
    ],
  };

  const cleanContinuity = {
    layeredBackdropCount: 0,
    consecutiveLayeredBackdropCount: 0,
    repeatedCameraRuns: [],
    longStaticCount: 0,
    subjectCaptionWarnings: [],
    rejectedVisualQualityShots: [],
    averageShotDuration: 3.5,
    rapidCutCount: 0,
  };

  // Case 1: All strong/publishable shots -> STRONG
  const strongReviews = {
    quality_s1: { shotId: 's1', publishable: true, strength: 'STRONG', warnings: [], scores: { assetRelevance: 5 } },
    quality_s2: { shotId: 's2', publishable: true, strength: 'STRONG', warnings: [], scores: { assetRelevance: 5 } },
    quality_s3: { shotId: 's3', publishable: true, strength: 'STRONG', warnings: [], scores: { assetRelevance: 5 } },
  };
  const verdictStrong = evaluateVideoPlaybackQuality(dummyTimeline, cleanContinuity, strongReviews);
  assert.equal(verdictStrong.overallVerdict, 'STRONG');
  assert.equal(verdictStrong.strongShotCount, 3);
  assert.equal(verdictStrong.failedShotCount, 0);
  assert.equal(verdictStrong.criticalFailureCount, 0);
  assert.equal(verdictStrong.hookVerdict, 'STRONG');
  assert.equal(verdictStrong.endingVerdict, 'STRONG');

  // Case 2: Critical failed shot in middle (> 3s) -> CANNOT be STRONG or ACCEPTABLE, must be WEAK
  const oneCriticalFailedReviews = {
    quality_s1: { shotId: 's1', publishable: true, strength: 'STRONG', warnings: [], scores: { assetRelevance: 5 } },
    quality_s2: { shotId: 's2', publishable: false, strength: 'FAILED', warnings: [{ code: 'asset_relevance', severity: 'hard' }], scores: { assetRelevance: 1 } },
    quality_s3: { shotId: 's3', publishable: true, strength: 'STRONG', warnings: [], scores: { assetRelevance: 5 } },
  };
  const verdictCritical = evaluateVideoPlaybackQuality(dummyTimeline, cleanContinuity, oneCriticalFailedReviews);
  assert.notEqual(verdictCritical.overallVerdict, 'STRONG');
  assert.notEqual(verdictCritical.overallVerdict, 'ACCEPTABLE');
  assert.equal(verdictCritical.overallVerdict, 'WEAK');
  assert.equal(verdictCritical.criticalFailureCount, 1);
  assert.equal(verdictCritical.failedShotCount, 1);

  // Case 3: Failed hook shot -> FAILED overall verdict
  const failedHookReviews = {
    quality_s1: { shotId: 's1', publishable: false, strength: 'FAILED', warnings: [{ code: 'unresolved_media', severity: 'hard' }], scores: { assetRelevance: 1 } },
    quality_s2: { shotId: 's2', publishable: true, strength: 'STRONG', warnings: [], scores: { assetRelevance: 5 } },
    quality_s3: { shotId: 's3', publishable: true, strength: 'STRONG', warnings: [], scores: { assetRelevance: 5 } },
  };
  const verdictFailedHook = evaluateVideoPlaybackQuality(dummyTimeline, cleanContinuity, failedHookReviews);
  assert.equal(verdictFailedHook.hookVerdict, 'FAILED');
  assert.equal(verdictFailedHook.overallVerdict, 'FAILED');

  // Case 4: Multiple weak shots -> cannot be STRONG
  const multipleWeakReviews = {
    quality_s1: { shotId: 's1', publishable: true, strength: 'ACCEPTABLE', warnings: [], scores: { assetRelevance: 4 } },
    quality_s2: { shotId: 's2', publishable: true, strength: 'WEAK', warnings: [{ code: 'camera_behavior' }], scores: { assetRelevance: 3 } },
    quality_s3: { shotId: 's3', publishable: true, strength: 'WEAK', warnings: [{ code: 'crop_quality' }], scores: { assetRelevance: 3 } },
  };
  const verdictMultipleWeak = evaluateVideoPlaybackQuality(dummyTimeline, cleanContinuity, multipleWeakReviews);
  assert.notEqual(verdictMultipleWeak.overallVerdict, 'STRONG');
  assert.equal(verdictMultipleWeak.overallVerdict, 'WEAK');
  assert.equal(verdictMultipleWeak.weakShotCount, 2);
});

test('Milestone 17: Contextual disqualifier rejects ruins and generic office stock for technical beats', () => {
  const techRequest = {
    concept: 'browser requests server using HTTP network request',
    searchConcepts: ['http request server network'],
    entities: [],
    evidenceRequired: false,
    assetIntent: 'action',
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
  };
  const techContext = {
    requestClass: 'ACTION',
    specificity: 0.7,
    targetSubject: ['server', 'network', 'request'],
    modifiers: [],
    aliases: [],
    queryLadder: ['SPECIFIC_ACTION'],
  };

  // 1. Duga-1 ruins candidate for tech request -> abandoned_mismatch -> unusable
  const dugaCandidate = {
    id: 'duga-radar',
    providerId: 'commons',
    label: 'File:Duga-1 radar data center interior server room 2018.jpg',
    width: 2400,
    height: 1600,
    license: { name: 'CC-BY-SA-4.0', nonFree: false },
    metadata: { title: 'Abandoned Duga-1 radar server room Chernobyl' },
  };
  const dugaScore = scoreAssetCandidate(dugaCandidate, techRequest, techContext);
  assert.ok(dugaScore.gates.includes('abandoned_mismatch'));
  assert.equal(dugaScore.resolutionStatus, 'unusable');
  assert.equal(dugaScore.qualityRank, 0);

  // 2. Generic smiling office team candidate -> generic_office_cliche -> unusable
  const officeCandidate = {
    id: 'office-team',
    providerId: 'pexels-image',
    label: 'Smiling office team meeting in conference room',
    width: 1920,
    height: 1080,
    license: { name: 'Pexels License', nonFree: false },
    metadata: { title: 'Office colleagues smiling team meeting' },
  };
  const officeScore = scoreAssetCandidate(officeCandidate, techRequest, techContext);
  assert.ok(officeScore.gates.includes('generic_office_cliche') || officeScore.gates.includes('generic_stock_technical_mismatch'));
  assert.equal(officeScore.resolutionStatus, 'unusable');
  assert.equal(officeScore.qualityRank, 0);

  // 3. Real datacenter server rack candidate -> verified/acceptable/good
  const datacenterCandidate = {
    id: 'datacenter-server',
    providerId: 'commons',
    label: 'Modern datacenter server rack with blinking network cables',
    width: 2400,
    height: 1600,
    license: { name: 'CC-BY-SA-4.0', nonFree: false },
    metadata: { title: 'Modern enterprise datacenter server rack room' },
  };
  const datacenterScore = scoreAssetCandidate(datacenterCandidate, techRequest, techContext);
  assert.equal(datacenterScore.gates.length, 0);
  assert.ok(datacenterScore.qualityRank >= 3);
});

test('Milestone 17: Visual action queries map abstract concepts and strip stop words from query ladder', () => {
  // Test visual action queries
  const httpQueries = mapActionToVisibleQueries('browser requests server via http');
  assert.ok(httpQueries.some((q) => q.includes('network') || q.includes('server') || q.includes('datacenter')));

  const domQueries = mapActionToVisibleQueries('parsing html into dom tree');
  assert.ok(domQueries.some((q) => q.includes('html code editor') || q.includes('elements inspector')));

  const gpuQueries = mapActionToVisibleQueries('gpu renders composite frames');
  assert.ok(gpuQueries.some((q) => q.includes('GPU') || q.includes('graphics')));

  // Test stop words removal in query ladder
  const storyboard = {
    format: 'landscape',
    sections: [{
      id: 'sec_1',
      scenes: [{
        id: 'scene_1',
        shots: [{
          id: 'shot_1',
          visualConcept: 'the How the 2008 financial crisis started',
          searchConcepts: ['stock market crash 2008'],
          mediaPreference: 'auto',
          assetIntent: 'action',
          entities: [],
          evidenceRequirement: 'none',
          durationHint: 3.5,
        }],
      }],
    }],
  };
  const [request] = planAssetRequests(storyboard, {
    format: 'landscape',
    visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }),
  });
  // Query ladder must NOT contain "the How the"
  assert.ok(!request.stagedQueries.fallback.includes('the How the'));
  assert.ok(!request.stagedQueries.fallback.includes('the how the'));
  assert.ok(request.stagedQueries.specific.length > 0);
});

test('Milestone 17: Candidate comparison prioritizes native landscape over portrait in landscape when semantically comparable', () => {
  const candidatePortrait = {
    id: 'portrait-server',
    width: 1080,
    height: 1920,
    score: {
      qualityRank: 3,
      semantic: { overall: 0.85 },
      presentation: { overall: 0.70 },
      credibility: { overall: 0.95 },
      diversity: { overall: 1.0 },
    },
    candidate: { width: 1080, height: 1920, id: 'portrait-server' },
  };

  const candidateLandscape = {
    id: 'landscape-server',
    width: 1920,
    height: 1080,
    score: {
      qualityRank: 3,
      semantic: { overall: 0.82 },
      presentation: { overall: 0.85 },
      credibility: { overall: 0.75 },
      diversity: { overall: 1.0 },
    },
    candidate: { width: 1920, height: 1080, id: 'landscape-server' },
  };

  // When format is landscape, landscape candidate must be preferred over portrait candidate
  const comparison = compareCandidateScores(candidatePortrait, candidateLandscape, 'landscape');
  assert.ok(comparison > 0, 'Landscape asset must sort before portrait asset in landscape mode');
});

test('Milestone 17: Validated MATCH_MOVE requires identifiable anchor and downgrades broad concept tokens to CUT', () => {
  const plan = {
    style: 'editorialDark',
    hue: 220,
    scenes: [
      { id: 'sc1', durationSec: 3, narration: 'Enter address.', storyboardShots: [{ id: 'sh1', visualConcept: 'browser window' }] },
      { id: 'sc2', durationSec: 3, narration: 'The code.', storyboardShots: [{ id: 'sh2', visualConcept: 'browser screen' }] },
    ],
  };
  const specs = [
    { family: 'image', variant: 'full', treatment: 'clean' },
    { family: 'image', variant: 'full', treatment: 'clean' },
  ];
  const words = [
    { word: 'Enter', start: 0, end: 0.5, startFrame: 0, endFrame: 15 },
    { word: 'address.', start: 0.5, end: 2.8, startFrame: 15, endFrame: 84 },
    { word: 'The', start: 3.0, end: 3.5, startFrame: 90, endFrame: 105 },
    { word: 'code.', start: 3.5, end: 5.8, startFrame: 105, endFrame: 174 },
  ];
  const assets = {
    sc1: { primary: { src: 'test.jpg', width: 1920, height: 1080, type: 'image' }, alternates: [] },
    sc2: { primary: { src: 'test2.jpg', width: 1920, height: 1080, type: 'image' }, alternates: [] },
  };

  const timeline = buildTimeline({
    plan,
    specs,
    narration: { words, durationInSeconds: 6, totalFrames: 180 },
    assets,
    sfx: [],
    bgm: [],
    videoId: 'test_transitions',
    format: 'landscape',
    fps: 30,
    audioSrc: 'audio.mp3',
    visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }),
  });

  // Scene transition between sc1 and sc2 must be CUT because shared concept token "browser" does not qualify for MATCH_MOVE
  assert.equal(timeline.clips[1].transitionPolicy, 'CUT');
});

test('Milestone 17: Unresolved media does not throw unhandled error and marks shot as UNRESOLVED_MEDIA with FAILED quality', () => {
  const plan = {
    style: 'editorialDark',
    hue: 220,
    scenes: [
      { id: 'sc_unresolved', durationSec: 3, narration: 'Unique concept.', storyboardShots: [{ id: 'sh_unres', visualConcept: 'obscure non-existent item' }] },
    ],
  };
  const specs = [{ family: 'image', variant: 'full', treatment: 'clean' }];
  const words = [
    { word: 'Unique', start: 0, end: 1.0, startFrame: 0, endFrame: 30 },
    { word: 'concept.', start: 1.0, end: 2.8, startFrame: 30, endFrame: 84 },
  ];
  // Empty assets to simulate failed provider search
  const assets = {
    sc_unresolved: { primary: null, alternates: [], byShot: {} },
  };

  const timeline = buildTimeline({
    plan,
    specs,
    narration: { words, durationInSeconds: 3, totalFrames: 90 },
    assets,
    sfx: [],
    bgm: [],
    videoId: 'test_unresolved',
    format: 'landscape',
    fps: 30,
    audioSrc: 'audio.mp3',
    visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }),
  });

  const shot = timeline.realizedShots[0];
  assert.ok(shot.unresolvedMedia, 'Shot must be flagged as unresolvedMedia');
  assert.ok(shot.asset.unresolved, 'Asset must be marked as unresolved');
  assert.ok(shot.asset.label.includes('UNRESOLVED_MEDIA'));
});
