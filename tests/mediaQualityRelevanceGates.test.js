import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAssetCandidate } from '../src/assets/assetIntelligenceScorer.js';
import { analyzeAssetRequest } from '../src/assets/assetSearchContext.js';
import { planAssetRequests } from '../src/pipeline/assetRequestPlanner.js';
import { estimateShotDemand } from '../src/storyboard/shotPlanner.js';
import { resolveVisualPolicy } from '../src/config/visualMode.js';
import { buildVisibleNeed } from '../src/storyboard/visibleNeed.js';
import { judgeAssetCandidate } from '../src/assets/visualEditorialJudge.js';
import { applyMediaOnlyReuseFallbacks } from '../src/pipeline/assetDirector.js';
import { requiresNativeMotion } from '../src/config/contentVisualProfiles.js';
import { licenseAllowed } from '../src/shared/licensing.js';
import { classifyEditBoundary } from '../src/qc/renderQc.js';

test('earthquake narration is not misclassified as compute in a forest', () => {
  const need = buildVisibleNeed({
    id: 'quake-shot',
    role: 'hook',
    visualConcept: 'Valdivia earthquake 1960 collapsed buildings',
    narrationSegment: 'People run through the streets as buildings collapse and the ground splits during the earthquake.',
  }, { editorialMode: 'DOCUMENTARY' });

  assert.match(need.action, /earthquake|seismic/);
  assert.doesNotMatch(need.action, /compute/);
  assert.match(need.environment, /earthquake-affected|disaster zone/);
  assert.doesNotMatch(need.environment, /forest/);
});

test('provider URL and retrieval words cannot prove an unrelated documentary image', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'quake-proof',
    role: 'hook',
    visualConcept: 'Valdivia earthquake 1960 collapsed buildings',
    narrationSegment: 'The earthquake destroyed buildings across Valdivia in 1960.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'wrong-valdivia-video',
      providerId: 'pexels-video',
      label: 'https://www.pexels.com/video/drone-footage-of-vehicles-crossing-the-pedro-de-valdivia-bridge-chile-14916491/',
      tags: ['Valdivia earthquake 1960 collapsed buildings'],
      width: 1920,
      height: 1080,
    },
    inspection: {
      primarySubject: 'municipal garbage truck',
      sceneSummary: 'A garbage truck collecting waste on a modern city street',
      visibleObjects: ['garbage truck', 'waste bins'],
      visibleAction: 'collecting street waste',
      environment: 'modern municipal street',
      communicatedMeanings: ['municipal sanitation'],
      styleClass: 'DOCUMENTARY',
      confidence: 0.9,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, false);
  assert.notEqual(judgment.classification, 'DIRECT');
});

test('local-bank search metadata cannot turn an Airbus photo into a seismograph', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'seismograph-proof',
    role: 'evidence',
    visualConcept: 'modern seismograph instrument',
    narrationSegment: 'Modern seismographs record earthquake waves with precise instruments.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'airbus-2020',
      providerId: 'local-bank',
      label: 'File:Airbus A380 Emirates Expo 2020 Dubai.jpg',
      tags: ['modern seismograph 2020'],
      width: 1920,
      height: 1080,
    },
    inspection: {
      primarySubject: 'Airbus A380 passenger aircraft',
      sceneSummary: 'An Emirates Airbus A380 aircraft at an airport',
      visibleObjects: ['aircraft', 'airport'],
      visibleAction: 'aircraft taxiing',
      environment: 'airport runway',
      communicatedMeanings: ['commercial aviation'],
      styleClass: 'DOCUMENTARY',
      confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, false);
});

test('documentary location contradiction rejects Nepal destruction for a Chile scene', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'valdivia-damage', role: 'establishing',
    visualConcept: 'Valdivia earthquake 1960 destroyed buildings',
    narrationSegment: 'Across Valdivia, Chile, the earthquake destroyed entire blocks.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'bhaktapur-damage', providerId: 'pexels-image', width: 1920, height: 1080,
      label: 'Earthquake aftermath in Bhaktapur, Nepal, with destroyed buildings and debris',
    },
    inspection: {
      primarySubject: 'destroyed buildings in Bhaktapur Nepal',
      sceneSummary: 'Earthquake destruction in Bhaktapur, Nepal',
      visibleObjects: ['collapsed buildings', 'debris'], visibleAction: 'earthquake aftermath',
      environment: 'Bhaktapur Nepal disaster zone', communicatedMeanings: ['earthquake damage'],
      styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((reason) => reason.includes('geographic_contradiction')));
});

test('place names enforce geography even when narration omits the country', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'valdivia-local-bank-damage', role: 'establishing',
    visualConcept: 'Valdivia earthquake 1960 destroyed buildings',
    narrationSegment: 'Entire blocks fell as the earthquake continued.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'bhaktapur-local-bank', providerId: 'local-bank', width: 1920, height: 1080,
      label: 'Monochrome earthquake aftermath in Bhaktapur, showing destroyed buildings',
    },
    inspection: {
      primarySubject: 'destroyed buildings in Bhaktapur',
      sceneSummary: 'Earthquake destruction in Bhaktapur',
      visibleObjects: ['collapsed buildings', 'debris'], visibleAction: 'earthquake aftermath',
      environment: 'Bhaktapur disaster zone', communicatedMeanings: ['earthquake damage'],
      styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((reason) => reason.includes('geographic_contradiction')));
});

test('generic disaster footage cannot claim a named documentary location', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'generic-village-for-valdivia', role: 'establishing',
    visualConcept: 'Valdivia earthquake 1960 destroyed buildings',
    narrationSegment: 'Villages were flattened and foundations disappeared.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'generic-earthquake-village', providerId: 'pexels-image', width: 1920, height: 1080,
      label: 'A village destroyed by an earthquake, showing damaged buildings and debris',
    },
    inspection: {
      primarySubject: 'earthquake-damaged village',
      sceneSummary: 'Collapsed buildings and debris after an earthquake',
      visibleObjects: ['collapsed buildings', 'debris'], visibleAction: 'earthquake aftermath',
      environment: 'damaged village', communicatedMeanings: ['earthquake damage'],
      styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, false);
  assert.equal(judgment.classification, 'CONTEXTUAL');
  assert.ok(judgment.rejectReasons.some((reason) => reason.includes('direct_visual_required')));
});

test('generic event photo cannot substitute for a requested memorial', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'valdivia-memorial', role: 'payoff',
    visualConcept: 'Valdivia earthquake memorial',
    narrationSegment: 'The memorial preserves the memory of those who lived through the disaster.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'valdivia-aftermath', providerId: 'wikipedia', width: 1920, height: 1080,
      label: '1960 Valdivia earthquake aftermath',
    },
    inspection: {
      primarySubject: 'earthquake-damaged buildings', sceneSummary: 'Historic earthquake destruction',
      visibleObjects: ['collapsed buildings'], visibleAction: 'earthquake aftermath',
      environment: 'Valdivia Chile', communicatedMeanings: ['disaster damage'],
      styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((reason) => reason.includes('representation_mismatch')));
});

test('authentic survivor commemoration can satisfy a remembrance shot', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'valdivia-survivors', role: 'payoff',
    visualConcept: 'Valdivia earthquake memorial',
    narrationSegment: 'Survivors and descendants remember the disaster across generations.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'valdivia-survivor-anniversary', providerId: 'commons', width: 1920, height: 1080,
      label: 'Valdivia earthquake survivors at the 1960 disaster anniversary commemoration',
    },
    inspection: {
      primarySubject: 'earthquake survivors at a remembrance ceremony',
      sceneSummary: 'Valdivia survivors and descendants at an anniversary commemoration',
      visibleObjects: ['survivors', 'memorial flowers'], visibleAction: 'remembering the disaster',
      environment: 'Valdivia Chile ceremony', communicatedMeanings: ['intergenerational remembrance'],
      styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, true);
  assert.equal(judgment.classification, 'DIRECT');
});

test('Spanish Commons memorial title is a direct match for the Valdivia remembrance shot', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'puerto-saavedra-memorial', role: 'payoff',
    visualConcept: 'Valdivia earthquake memorial',
    narrationSegment: 'Survivors and descendants remember the disaster across generations.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'commons-puerto-saavedra', providerId: 'commons', width: 1214, height: 911,
      label: 'Memorial Terremoto de Valdivia en 1960 en Puerto Saavedra',
    },
    inspection: {
      primarySubject: 'memorial monument',
      sceneSummary: 'Memorial Terremoto de Valdivia in Puerto Saavedra, Chile',
      visibleObjects: ['memorial', 'plaque'], visibleAction: 'commemorating the earthquake',
      environment: 'Puerto Saavedra Chile', communicatedMeanings: ['earthquake remembrance'],
      styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, true);
  assert.equal(judgment.classification, 'DIRECT');
});

test('Türkiye alias is recognized as a conflicting country for Chile footage', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'turkiye-for-chile', role: 'evidence',
    visualConcept: '1960 Chile earthquake aftermath',
    narrationSegment: 'The 1960 earthquake remains the most powerful ever recorded.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'antakya-aftermath', providerId: 'pexels-image', width: 1920, height: 1080,
      label: 'Destruction and recovery in Antakya, Türkiye, after a devastating earthquake',
    },
    inspection: {
      primarySubject: 'earthquake destruction in Antakya',
      sceneSummary: 'Recovery after the Türkiye earthquake',
      visibleObjects: ['damaged buildings'], visibleAction: 'disaster recovery',
      environment: 'Antakya Türkiye', communicatedMeanings: ['earthquake aftermath'],
      styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((reason) => reason.includes('geographic_contradiction')));
});

test('documentary concrete subject rejects thematic calendar image for seismograph shot', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'modern-seismograph', role: 'establishing',
    visualConcept: 'modern seismograph 2020',
    narrationSegment: 'Modern seismographs reveal earthquake motion in real time.',
  }, { editorialMode: 'DOCUMENTARY' });
  assert.equal(visibleNeed.literalnessRequirement, 'DIRECT');
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'calendar-phone', providerId: 'pexels-image', width: 1920, height: 1080,
      label: 'A smartphone with a 2020 calendar beside a dartboard and pen',
    },
    inspection: {
      primarySubject: 'smartphone and calendar', sceneSummary: 'Phone beside a paper calendar',
      visibleObjects: ['smartphone', 'calendar', 'pen'], visibleAction: 'static presentation',
      environment: 'white desk', communicatedMeanings: ['calendar planning'],
      styleClass: 'STOCK', confidence: 0.9,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((reason) => reason.includes('direct_visual_required')));
});

test('location-independent modern instrument does not inherit historical geography from narration', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'modern-seismograph-location-independent', role: 'establishing',
    visualConcept: 'modern seismograph 2020',
    narrationSegment: 'After Chile changed seismology, modern instruments became more precise.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'loomis-seismograph', providerId: 'commons', width: 1920, height: 1080,
      label: 'Loomis Seismograph Station in June 2020',
    },
    inspection: {
      primarySubject: 'modern seismograph station',
      sceneSummary: 'A seismograph station and monitoring instrument',
      visibleObjects: ['seismograph', 'monitoring instrument'], visibleAction: 'recording ground motion',
      environment: 'seismograph station', communicatedMeanings: ['seismic monitoring'],
      styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.equal(judgment.accepted, true);
  assert.equal(judgment.classification, 'DIRECT');
});

test('scientific analysis can illustrate a named event without pretending to depict its location', () => {
  const visibleNeed = buildVisibleNeed({
    id: 'chile-seismograph-analysis', role: 'establishing',
    visualConcept: 'seismograph record 1960 Chile earthquake',
    narrationSegment: 'Scientists analyzed the seismic record and transformed earthquake monitoring.',
  }, { editorialMode: 'DOCUMENTARY' });
  const judgment = judgeAssetCandidate({
    candidate: {
      id: 'scientist-seismograph', providerId: 'local-bank', width: 1920, height: 1080,
      label: 'Scientist analyzing seismograph data',
    },
    inspection: {
      primarySubject: 'scientist analyzing seismograph data',
      sceneSummary: 'A scientist studies a seismic recording instrument',
      visibleObjects: ['scientist', 'seismograph', 'seismic record'], visibleAction: 'analyzing seismic data',
      environment: 'seismology laboratory', communicatedMeanings: ['earthquake research'],
      styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });

  assert.ok(!judgment.rejectReasons.some((reason) => reason.includes('geographic_evidence_missing')));
});

test('asset request planner removes alternatives that abandon the concrete shot subject', () => {
  const storyboard = {
    format: 'landscape', topic: 'How earthquake monitoring changed after Valdivia',
    sections: [{ id: 'section', scenes: [{
      id: 'scene', narration: 'Modern seismographs record ground motion in real time.',
      shots: [{
        id: 'seismograph', role: 'establishing', visualConcept: 'modern seismograph 2020',
        searchConcepts: ['tsunami warning siren coast', 'digital seismograph instrument'],
        assetIntent: 'concept', entities: [], evidenceRequirement: 'none', durationHint: 5,
      }],
    }] }],
  };
  const [request] = planAssetRequests(storyboard, {
    format: 'landscape', editorialMode: 'DOCUMENTARY', contentType: 'documentary',
    visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }),
  });
  const queries = [...request.stagedQueries.specific, ...request.stagedQueries.fallback].join(' ').toLowerCase();

  assert.doesNotMatch(queries, /tsunami warning siren/);
  assert.match(queries, /seismograph/);
  assert.ok(request.searchConcepts.includes('digital seismograph instrument'));
  assert.ok(!request.searchConcepts.includes('tsunami warning siren coast'));
});

test('historical seismograph requests include archival seismogram terminology', () => {
  const storyboard = {
    format: 'landscape', topic: 'The 1960 Valdivia earthquake',
    sections: [{ id: 'section', scenes: [{
      id: 'scene', narration: 'Scientists studied the seismic record from Chile.',
      shots: [{
        id: 'seismic-record', role: 'evidence', visualConcept: 'seismograph record 1960 Chile earthquake',
        searchConcepts: [], assetIntent: 'concept', entities: [], evidenceRequirement: 'none', durationHint: 5,
      }],
    }] }],
  };
  const [request] = planAssetRequests(storyboard, {
    format: 'landscape', editorialMode: 'DOCUMENTARY', contentType: 'documentary',
    visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }),
  });

  assert.ok(request.stagedQueries.specific.some((query) => /seismogram/i.test(query)));
  assert.ok(request.stagedQueries.specific.some((query) => /valdivia.*seismogram/i.test(query)));
});

test('Valdivia memorial requests include monument and Spanish archival terminology', () => {
  const storyboard = {
    format: 'landscape', topic: 'The 1960 Valdivia earthquake',
    sections: [{ id: 'section', scenes: [{
      id: 'scene', narration: 'Survivors and descendants remember the disaster across generations.',
      shots: [{
        id: 'memorial', role: 'payoff', visualConcept: 'Valdivia earthquake memorial',
        searchConcepts: [], assetIntent: 'historical', entities: [], evidenceRequirement: 'none', durationHint: 5,
      }],
    }] }],
  };
  const [request] = planAssetRequests(storyboard, {
    format: 'landscape', editorialMode: 'DOCUMENTARY', contentType: 'documentary',
    visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }),
  });
  const exact = request.stagedQueries.specific.join(' ');

  assert.match(exact, /Valdivia earthquake monument/i);
  assert.match(exact, /Puerto Saavedra/i);
  assert.match(exact, /memorial terremoto Valdivia 1960/i);
  assert.equal(request.assetIntent, 'historical');
});

test('media-only fallback leaves unrelated shots unresolved instead of forcing nearest asset', () => {
  const sourceAsset = {
    id: 'aircraft', src: 'assets/aircraft.jpg', type: 'image', width: 1920, height: 1080,
    providerId: 'commons', label: 'Airbus passenger aircraft at airport',
    visualInspection: {
      primarySubject: 'passenger aircraft', sceneSummary: 'Aircraft at airport',
      visibleObjects: ['aircraft'], visibleAction: 'taxiing', environment: 'airport',
      communicatedMeanings: ['aviation'], styleClass: 'DOCUMENTARY', confidence: 0.95,
    },
  };
  const assets = {
    scene_aircraft: { primary: sourceAsset, alternates: [], byShot: { shot_aircraft: sourceAsset } },
    scene_quake: { primary: { unresolved: true }, alternates: [], byShot: {} },
  };
  const reports = [{ sceneId: 'scene_quake', storyboardShotId: 'shot_quake', resolutionStatus: 'unresolved' }];
  const requests = [{
    sceneId: 'scene_quake', storyboardShotId: 'shot_quake', concept: 'Valdivia earthquake collapsed buildings',
    visualProposition: { literalness: 'DIRECT' }, evidenceRequired: true,
    visibleNeed: buildVisibleNeed({ id: 'shot_quake', role: 'evidence', visualConcept: 'Valdivia earthquake collapsed buildings' }, { editorialMode: 'DOCUMENTARY' }),
  }];

  const fallbacks = applyMediaOnlyReuseFallbacks({
    assets, requestReports: reports, assetRequests: requests,
    sceneIds: ['scene_aircraft', 'scene_quake'], format: 'landscape',
  });

  assert.deepEqual(fallbacks, {});
  assert.equal(assets.scene_quake.byShot.shot_quake, undefined);
  assert.equal(reports[0].resolutionStatus, 'unresolved');
});

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

  // Media editorial adds enough coverage to avoid a stale 8.5-second hold.
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

test('documentary content does not force nativeMotionRequired on active camera motion', () => {
  const activeDocumentaryShot = {
    role: 'establishing',
    assetIntent: 'historical',
    motionPreference: 'active',
    mediaPreference: 'auto',
  };
  assert.equal(requiresNativeMotion({ contentType: 'documentary', shot: activeDocumentaryShot }), false);

  const videoRequestedShot = {
    role: 'action',
    assetIntent: 'historical',
    motionPreference: 'active',
    mediaPreference: 'video',
  };
  assert.equal(requiresNativeMotion({ contentType: 'documentary', shot: videoRequestedShot }), true);
});

test('explainer payoff can use an exact licensed still when active footage is unavailable', () => {
  const payoffStillFallback = {
    role: 'payoff',
    assetIntent: 'concept',
    motionPreference: 'active',
    mediaPreference: 'auto',
  };
  assert.equal(requiresNativeMotion({ contentType: 'explainer', shot: payoffStillFallback }), false);

  assert.equal(requiresNativeMotion({
    contentType: 'explainer',
    shot: { ...payoffStillFallback, role: 'action' },
  }), true);
  assert.equal(requiresNativeMotion({
    contentType: 'explainer',
    shot: { ...payoffStillFallback, mediaPreference: 'video' },
  }), true);
});

test('entityMatch does not score 1.0 or claim exact entity metadata match when entities array is empty', () => {
  const request = {
    concept: 'modern seismograph 2020',
    entities: [],
    assetIntent: 'concept',
    exclusions: [],
    constraints: { minWidth: 1920, minHeight: 1080, orientation: 'landscape' },
  };
  const context = analyzeAssetRequest(request);
  const candidate = {
    id: 'airplane-photo',
    providerId: 'local-bank',
    label: 'File:A6-EDS Airbus A.388 Emirates With Expo 2020 Dubai UAE Titles.jpg',
    width: 2600,
    height: 1733,
    license: { name: 'CC BY 2.0', nonFree: false },
    metadata: { description: 'Airbus airplane at airport runway with Expo 2020 titles' },
  };
  const scored = scoreAssetCandidate(candidate, request, context);
  assert.ok(scored.semantic.entityMatch < 0.8, `entityMatch should be low, got ${scored.semantic.entityMatch}`);
  assert.ok(!scored.selectionReasons.includes('exact entity metadata match'), 'Must not report exact entity metadata match');
});

test('licenseAllowed permits Brave web discovery results under editorial policy but blocks under commercial policy', () => {
  const braveLicense = {
    name: 'Brave Search discovery result',
    url: 'https://example.com/image.jpg',
    verification_status: 'discovery_only',
    commercial_use: 'unknown',
  };
  const commercialVerdict = licenseAllowed(braveLicense, 'commercial');
  assert.equal(commercialVerdict.ok, false);
  assert.match(commercialVerdict.why, /discovery result has no verified asset licence/);

  const editorialVerdict = licenseAllowed(braveLicense, 'editorial');
  assert.equal(editorialVerdict.ok, true);
  assert.equal(editorialVerdict.status, 'editorial_only');
});

test('dissolve transitions permit luma changes between scenes without fatal error', () => {
  const normalDissolve = classifyEditBoundary({
    before: { mean: 25, stdev: 10 },
    after: { mean: 90, stdev: 20 },
    transitionType: 'dissolve',
  });
  assert.equal(normalDissolve.harshDissolve, false, 'A 65 luma delta across a cross-dissolve must not be flagged harsh');

  const harshDissolve = classifyEditBoundary({
    before: { mean: 10, stdev: 5 },
    after: { mean: 110, stdev: 30 },
    transitionType: 'dissolve',
  });
  assert.equal(harshDissolve.harshDissolve, true, 'A 100 luma delta across a cross-dissolve is flagged harsh');
});

test('named Pullman railroad car is rejected for Roald Amundsen explorer request', () => {
  const request = {
    id: 'req_amundsen',
    concept: 'Roald Amundsen archival photo',
    entities: ['Roald Amundsen'],
    assetIntent: 'portrait',
    evidenceRequired: true,
    constraints: { minWidth: 1920, minHeight: 1080, orientation: 'landscape' },
  };
  const context = analyzeAssetRequest(request);
  const candidate = {
    id: 'commons_pullman',
    providerId: 'commons',
    provider: 'commons',
    label: 'File:Roald Amundsen Pullman Private Railroad Car set for Christmas Dinner.jpg',
    title: 'File:Roald Amundsen Pullman Private Railroad Car set for Christmas Dinner.jpg',
    width: 2400,
    height: 1600,
    license: { name: 'Public Domain', nonFree: false },
    metadata: { description: 'Pullman Private Railroad Car dining room interior' },
  };

  const scored = scoreAssetCandidate(candidate, request, context);
  assert.ok(scored.gates.includes('named_vehicle_facility_false_match'), 'Must gate Pullman car for explorer portrait');

  const visibleNeed = buildVisibleNeed({
    id: 'shot_amundsen',
    role: 'hook',
    visualConcept: 'Roald Amundsen archival photo',
    narrationSegment: 'Roald Amundsen prepared his expedition with meticulous precision.',
  }, { editorialMode: 'DOCUMENTARY' });

  const judgment = judgeAssetCandidate({
    candidate,
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Tibetan prayer flags in Ladakh India rejected for Antarctic flag snow request', () => {
  const request = {
    id: 'req_flag',
    concept: 'Antarctic flag wind snow',
    entities: ['Antarctica'],
    assetIntent: 'detail',
    evidenceRequired: false,
    constraints: { minWidth: 1920, minHeight: 1080, orientation: 'landscape' },
  };
  const context = analyzeAssetRequest(request);
  const candidate = {
    id: 'bank_ladakh',
    providerId: 'local-bank',
    provider: 'local-bank',
    label: 'Vibrant Tibetan prayer flags fluttering in the wind at Ladakh, India, symbolizing peace',
    title: 'Vibrant Tibetan prayer flags fluttering in the wind at Ladakh, India',
    width: 1920,
    height: 1080,
    license: { name: 'CC BY 4.0', nonFree: false },
    metadata: { description: 'Vibrant Tibetan prayer flags fluttering in the wind at Ladakh, India' },
  };

  const scored = scoreAssetCandidate(candidate, request, context);
  assert.ok(scored.gates.includes('geographic_mismatch'), 'Must gate Ladakh prayer flags for Antarctic concept');

  const visibleNeed = buildVisibleNeed({
    id: 'shot_flag',
    role: 'payoff',
    visualConcept: 'Antarctic flag wind snow',
    narrationSegment: 'A lone flag whips in the fierce Antarctic wind amid the endless snow.',
  }, { editorialMode: 'DOCUMENTARY' });

  const judgment = judgeAssetCandidate({
    candidate,
    visibleNeed,
    editorialMode: 'DOCUMENTARY',
  });
  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.accepted, false);
});

test('query ladder sanitizes synthetic editorial phrases and avoids pollution', () => {
  const storyboard = {
    topic: 'Race to the South Pole 1911',
    sections: [
      {
        id: 'sec_1',
        scenes: [
          {
            id: 'scene_1',
            narration: 'Roald Amundsen and Robert Falcon Scott raced to the South Pole.',
            shots: [
              {
                id: 'shot_1',
                visualConcept: 'Roald Amundsen and Robert Falcon Scott archival photo',
                narrationSegment: 'Scott was laying depots along the treacherous path.',
                entities: ['Roald Amundsen', 'Robert Falcon Scott'],
                assetIntent: 'historical',
              },
            ],
          },
        ],
      },
    ],
  };

  const requests = planAssetRequests(storyboard, {
    editorialMode: 'DOCUMENTARY',
    contentType: 'documentary',
    visualPolicy: { useMediaEditorial: true },
  });

  assert.equal(requests.length, 1);
  const queryLadder = requests[0].queryLadder || {};
  const allQueries = [
    ...(requests[0].searchConcepts || []),
    ...(queryLadder.level1SpecificAction || []),
    ...(queryLadder.level2SubjectAction || []),
    ...(queryLadder.level3SubjectEnvironment || []),
    ...(queryLadder.level4ContextualEvidence || []),
    ...(queryLadder.level5BroaderTopic || []),
  ];

  for (const q of allQueries) {
    assert.doesNotMatch(q, /installing or stretching infrastructure/i, `Query polluted: "${q}"`);
    assert.doesNotMatch(q, /active demonstration or relevant physical phenomenon/i, `Query polluted: "${q}"`);
    assert.doesNotMatch(q, /authentic real-world environment matching context/i, `Query polluted: "${q}"`);
  }
});
