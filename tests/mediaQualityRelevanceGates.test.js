import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAssetCandidate } from '../src/assets/assetIntelligenceScorer.js';
import { analyzeAssetRequest } from '../src/assets/assetSearchContext.js';
import { planAssetRequests } from '../src/pipeline/assetRequestPlanner.js';
import { estimateShotDemand } from '../src/storyboard/shotPlanner.js';
import { resolveVisualPolicy } from '../src/config/visualMode.js';

test('asset scorer disqualifies abandoned/ruin clips for technical infrastructure', () => {
  const request = {
    id: 'req_server',
    concept: 'server room data center',
    assetIntent: 'concept',
    entities: [],
    evidenceRequired: false,
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
  };
  const context = analyzeAssetRequest(request);
  const candidate = {
    id: 'duga-radar',
    label: 'File:Duga-1 radar data center interior server room 2018.jpg',
    width: 2000,
    height: 1333,
    providerId: 'commons',
    license: { nonFree: false, page: 'https://commons.wikimedia.org' },
    metadata: { description: 'Abandoned Soviet radar installation interior with broken windows' },
  };

  const scored = scoreAssetCandidate(candidate, request, context);
  assert.equal(scored.resolutionStatus, 'unusable');
  assert.ok(scored.gates.includes('abandoned_mismatch'));
});

test('asset scorer disqualifies green screen phone mockup for UI smoothness and performance', () => {
  const request = {
    id: 'req_scroll',
    concept: 'smooth animation and scrolling on screen',
    assetIntent: 'interface',
    entities: [],
    evidenceRequired: false,
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
  };
  const context = analyzeAssetRequest(request);
  const candidate = {
    id: 'mockup-phone',
    label: 'A person holding a smartphone with a green screen on a white surface, ideal for mockups',
    width: 2500,
    height: 1600,
    providerId: 'pexels-image',
    license: { nonFree: false, page: 'https://pexels.com' },
    metadata: { tags: ['phone', 'green screen', 'mockup'] },
  };

  const scored = scoreAssetCandidate(candidate, request, context);
  assert.equal(scored.resolutionStatus, 'unusable');
  assert.ok(scored.gates.includes('mockup_placeholder_match'));
});

test('asset scorer disqualifies diagram and mindmap images in media editorial mode', () => {
  const request = {
    id: 'req_dom',
    concept: 'html dom tree structure',
    assetIntent: 'concept',
    entities: [],
    evidenceRequired: false,
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
  };
  const context = analyzeAssetRequest(request);
  const candidate = {
    id: 'dom-mindmap',
    label: 'HTML DOM Mindmap and Architecture Diagram',
    width: 2048,
    height: 1536,
    providerId: 'pexels-image',
    license: { nonFree: false, page: 'https://pexels.com' },
    metadata: { tags: ['html', 'dom', 'diagram', 'mindmap'] },
  };

  const scored = scoreAssetCandidate(candidate, request, context);
  assert.equal(scored.resolutionStatus, 'unusable');
  assert.ok(scored.gates.includes('diagram_image_rejected'));
});

test('asset request planner sanitizes diagram queries in media editorial mode', () => {
  const storyboard = {
    format: 'landscape',
    sections: [{
      id: 'sec_1',
      scenes: [{
        id: 'scene_dom',
        shots: [{
          id: 'shot_dom',
          visualConcept: 'html dom tree diagram',
          searchConcepts: ['dom tree diagram'],
          mediaPreference: 'auto',
          assetIntent: 'concept',
          entities: [],
          evidenceRequirement: 'none',
          durationHint: 4,
        }],
      }],
    }],
  };

  const [request] = planAssetRequests(storyboard, {
    format: 'landscape',
    visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }),
  });

  assert.ok(request.stagedQueries.specific.some((q) => q.includes('html code editor')));
  assert.ok(!request.stagedQueries.specific.some((q) => q.includes('diagram')));
  assert.ok(request.exclusions.includes('diagram'));
  assert.ok(request.exclusions.includes('mockup'));
});

test('media editorial shot planner increases shot demand for long explainer scenes', () => {
  const scene = {
    id: 'scene_http',
    purpose: 'explain',
    visualIntent: 'explain',
    preferredPresentation: 'process',
    durationHint: 8.5,
    energy: 4,
    informationDensity: 4,
    entities: ['server', 'browser'],
    sourceScenes: [{ narration: 'The browser sends an HTTP request, and the server responds with data.' }],
  };

  // In legacy procedural mode: 1 shot
  const legacyDemand = estimateShotDemand(scene, { useMediaEditorial: false, visualDensity: 0.6 });
  assert.equal(legacyDemand, 1);

  // In media editorial mode: 3 shots for an 8.5s technical explanation
  const mediaDemand = estimateShotDemand(scene, { useMediaEditorial: true, visualDensity: 0.6, format: 'landscape' });
  assert.ok(mediaDemand >= 2);
});

test('media editorial shot planner limits shot duration in Shorts to prevent static holds', () => {
  const shortScene = {
    id: 'scene_server',
    purpose: 'explain',
    visualIntent: 'explain',
    preferredPresentation: 'process',
    durationHint: 5.5,
    energy: 4,
    informationDensity: 4,
    entities: ['server'],
    sourceScenes: [{ narration: 'Requests travel to data centers across the globe.' }],
  };

  const shortsDemand = estimateShotDemand(shortScene, { useMediaEditorial: true, visualDensity: 0.7, format: 'shorts' });
  assert.equal(shortsDemand, 2, 'A 5.5s Shorts scene should split into 2 shots so each is under 3s');
});

test('real ancient ruins are accepted and prioritized for historical civilization topics', () => {
  const request = {
    id: 'req_rome',
    concept: 'Ancient Roman Colosseum ruins',
    assetIntent: 'historical',
    entities: ['Ancient Rome'],
    evidenceRequired: false,
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
  };
  const context = analyzeAssetRequest(request);
  const candidate = {
    id: 'colosseum-ruins',
    label: 'Roman Colosseum amphitheatre ancient ruins in Rome Italy',
    width: 2560,
    height: 1440,
    providerId: 'pexels-image',
    license: { nonFree: false, page: 'https://pexels.com' },
    metadata: { description: 'Sunlight shining on ancient Roman Colosseum stone ruins in Rome' },
  };

  const scored = scoreAssetCandidate(candidate, request, context);
  assert.equal(scored.resolutionStatus, 'excellent');
  assert.ok(!scored.gates.includes('abandoned_mismatch'), 'Ruins must not be rejected for historical topics');
  assert.ok(scored.semantic.overall >= 0.70, `Expected high score for authentic historical ruins, got ${scored.semantic.overall}`);
});

test('real Dubai skyline is prioritized and matches target entity', () => {
  const request = {
    id: 'req_dubai',
    concept: 'Dubai Burj Khalifa skyline',
    assetIntent: 'location',
    entities: ['Dubai'],
    evidenceRequired: false,
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
  };
  const context = analyzeAssetRequest(request);
  const candidate = {
    id: 'dubai-burj',
    label: 'Dubai Burj Khalifa skyscraper skyline evening aerial view',
    width: 3840,
    height: 2160,
    providerId: 'pexels-image',
    license: { nonFree: false, page: 'https://pexels.com' },
    metadata: { description: 'Dubai city aerial view showing Burj Khalifa and modern downtown skyscrapers' },
  };

  const scored = scoreAssetCandidate(candidate, request, context);
  assert.equal(scored.resolutionStatus, 'excellent');
  assert.ok(scored.semantic.overall >= 0.75, `Expected high score for real Dubai landmark, got ${scored.semantic.overall}`);
});

test('asset request planner preserves ancient ruins and does not replace with datacenter', () => {
  const historyStoryboard = {
    format: 'landscape',
    sections: [{
      id: 'section-history',
      scenes: [{
        id: 'scene-rome',
        narration: 'The Ancient Roman Empire built massive monuments like the Colosseum.',
        shots: [{
          id: 'shot-rome-1',
          role: 'subject',
          visualConcept: 'Ancient Roman Colosseum ruins',
          assetIntent: 'historical',
          mediaPreference: 'real',
          searchConcepts: ['Ancient Roman ruins Colosseum Rome'],
          entities: ['Ancient Rome'],
          durationHint: 4,
        }],
      }],
    }],
  };

  const [req] = planAssetRequests(historyStoryboard, {
    visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }),
  });

  assert.ok(!req.exclusions.includes('ruins'), 'Ruins should not be in exclusions for historical topic');
  assert.ok(!req.exclusions.includes('abandoned'), 'Abandoned should not be in exclusions for historical topic');
  const allQueries = [...req.stagedQueries.specific, ...req.stagedQueries.fallback].join(' ').toLowerCase();
  assert.ok(!allQueries.includes('datacenter'), 'Ruins should NOT be replaced by datacenter for historical topic');
  assert.ok(allQueries.includes('colosseum') || allQueries.includes('ruins') || allQueries.includes('rome'), 'Must contain historical keywords');
});
