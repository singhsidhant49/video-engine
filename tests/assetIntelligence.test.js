import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeAssetRequest } from '../src/assets/assetSearchContext.js';
import { scoreAssetCandidate, compareCandidateScores, trustedEditorialOrigin } from '../src/assets/assetIntelligenceScorer.js';
import { VideoAssetMemory } from '../src/assets/videoAssetMemory.js';
import { normalizeProviderCandidate } from '../src/assets/providerAdapter.js';

function candidate(providerId, overrides = {}) {
  return normalizeProviderCandidate(providerId, {
    type: 'image',
    width: 2560,
    height: 1440,
    url: 'https://example.test/img.jpg',
    license: { name: 'CC-BY-4.0', nonFree: false },
    ...overrides,
  });
}

test('evidence scoring trusts the authoritative origin rather than the search index', () => {
  const request = {
    id: 'req_waterfall', concept: 'network waterfall chart', assetIntent: 'data', entities: [],
    searchConcepts: ['website performance graph'], constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
    exclusions: [], evidenceRequired: true, stagedQueries: { specific: ['network waterfall chart'], fallback: [] },
  };
  const indexed = candidate('brave-image', {
    url: 'https://web.dev/static/articles/critical-rendering-path/images/waterfall.png',
    label: 'Request waterfall chart for the web.dev website',
    license: { name: 'Web Editorial', nonFree: false, page: 'https://web.dev/articles/critical-rendering-path' },
  });
  assert.equal(trustedEditorialOrigin(indexed), true);
  const score = scoreAssetCandidate(indexed, request, analyzeAssetRequest(request));
  assert.equal(score.gates.includes('evidence_source_mismatch'), false);
  assert.ok(score.qualityRank >= 2);
});

test('traceable editorial origin clears provenance gate without authority inflation', () => {
  const request = {
    id: 'req_waterfall_editorial', concept: 'network waterfall chart', assetIntent: 'data', entities: [],
    searchConcepts: [], constraints: { orientation: 'landscape', minWidth: 1280, minHeight: 720 },
    exclusions: [], evidenceRequired: true, stagedQueries: { specific: ['network waterfall chart'], fallback: [] },
  };
  const indexed = candidate('brave-image', {
    url: 'https://www.debugbear.com/dimg/waterfall.png',
    label: 'Network request waterfall chart',
    license: { name: 'Web Editorial', nonFree: false, page: 'https://www.debugbear.com/docs/waterfall' },
  });
  assert.equal(trustedEditorialOrigin(indexed), false);
  const score = scoreAssetCandidate(indexed, request, analyzeAssetRequest(request));
  assert.equal(score.gates.includes('evidence_source_mismatch'), false);
  assert.equal(score.semantic.evidenceMatch, 0.65);
});

test('Fixture A (HARD REGRESSION): ASML lithography machine outranks headquarters, logo, executive, and office', () => {
  const request = {
    id: 'req_asml',
    concept: 'ASML lithography machine',
    assetIntent: 'product',
    entities: ['ASML'],
    searchConcepts: ['ASML EUV machine', 'ASML Twinscan lithography equipment'],
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
    exclusions: ['corporate headquarters', 'executive portrait', 'logo-only image'],
    evidenceRequired: false,
    stagedQueries: { specific: ['ASML lithography machine'], fallback: ['ASML'] },
  };
  const context = analyzeAssetRequest(request);

  const machine = candidate('commons', {
    label: 'ASML TWINSCAN NXE:3400B EUV lithography system in cleanroom',
    title: 'ASML TWINSCAN NXE:3400B EUV lithography system in cleanroom',
    description: 'High-tech EUV scanner manufactured by ASML for semiconductor wafer fabrication',
    tags: ['ASML', 'EUV', 'lithography', 'cleanroom', 'scanner', 'semiconductor'],
    width: 1920,
    height: 1080,
  });

  const headquarters = candidate('wikipedia', {
    label: 'Headquarters of ASML in Veldhoven',
    title: 'ASML Corporate Headquarters building and campus in Veldhoven Netherlands',
    description: 'Exterior facade of the global headquarters campus of ASML',
    tags: ['ASML', 'headquarters', 'building', 'campus', 'Veldhoven', 'architecture'],
    width: 3840,
    height: 2160, // Much higher resolution than machine!
  });

  const logo = candidate('commons', {
    label: 'ASML logo and brandmark',
    title: 'Official ASML company logo vector',
    description: 'Corporate logo of ASML holding N.V.',
    tags: ['ASML', 'logo', 'logotype', 'brand'],
    width: 2000,
    height: 2000,
  });

  const executive = candidate('brave-image', {
    label: 'Peter Wennink CEO portrait',
    title: 'ASML chief executive officer Peter Wennink press portrait',
    description: 'Formal executive headshot of ASML CEO',
    tags: ['ASML', 'CEO', 'portrait', 'executive'],
    width: 2400,
    height: 1600,
  });

  const office = candidate('pexels-image', {
    label: 'Modern semiconductor office team',
    title: 'Engineers working in modern semiconductor corporate office',
    description: 'Office team meeting in corporate boardroom',
    tags: ['office', 'team', 'meeting', 'semiconductor'],
    width: 2600,
    height: 1700,
  });

  const scoreMachine = scoreAssetCandidate(machine, request, context);
  const scoreHq = scoreAssetCandidate(headquarters, request, context);
  const scoreLogo = scoreAssetCandidate(logo, request, context);
  const scoreExec = scoreAssetCandidate(executive, request, context);
  const scoreOffice = scoreAssetCandidate(office, request, context);

  // Machine must be acceptable or higher
  assert.ok(scoreMachine.qualityRank >= 3, `Machine should be good/excellent, got rank ${scoreMachine.qualityRank}`);
  assert.equal(scoreMachine.resolutionStatus === 'excellent' || scoreMachine.resolutionStatus === 'good', true);
  assert.equal(scoreMachine.gates.length, 0);

  // False matches must trigger gates and be disqualified (unusable / rank 0)
  assert.ok(scoreHq.gates.includes('building_false_match'));
  assert.equal(scoreHq.qualityRank, 0, 'Headquarters must be rank 0 unusable');

  assert.ok(scoreLogo.gates.includes('logo_false_match'));
  assert.equal(scoreLogo.qualityRank, 0, 'Logo must be rank 0 unusable');

  assert.ok(scoreExec.gates.includes('portrait_false_match'));
  assert.equal(scoreExec.qualityRank, 0, 'Executive portrait must be rank 0 unusable');

  const pool = [
    { candidate: headquarters, score: scoreHq },
    { candidate: logo, score: scoreLogo },
    { candidate: machine, score: scoreMachine },
    { candidate: executive, score: scoreExec },
    { candidate: office, score: scoreOffice },
  ].sort(compareCandidateScores);

  assert.equal(pool[0].candidate.label, machine.label, 'ASML lithography machine MUST rank #1 above headquarters, logo, executive, and office');
});

test('Fixture B: NVIDIA H100 GPU prefers actual GPU board over Jensen Huang, office, and logo', () => {
  const request = {
    id: 'req_nvidia',
    concept: 'NVIDIA H100 GPU',
    assetIntent: 'product',
    entities: ['NVIDIA'],
    searchConcepts: ['NVIDIA H100 Tensor Core GPU', 'H100 SXM5 accelerator'],
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
    exclusions: ['corporate headquarters', 'executive portrait', 'logo-only image'],
    evidenceRequired: false,
    stagedQueries: { specific: ['NVIDIA H100 GPU'], fallback: ['NVIDIA GPU'] },
  };
  const context = analyzeAssetRequest(request);

  const gpu = candidate('commons', {
    label: 'NVIDIA H100 Tensor Core GPU SXM5 board',
    title: 'NVIDIA Hopper H100 Tensor Core GPU compute module',
    description: 'Close-up of the silicon die and heat spreader of the NVIDIA H100 accelerator card',
    tags: ['NVIDIA', 'H100', 'GPU', 'Hopper', 'accelerator', 'silicon'],
    width: 1920,
    height: 1080,
  });

  const jensen = candidate('wikipedia', {
    label: 'Jensen Huang CEO headshot',
    title: 'Jensen Huang portrait chief executive of NVIDIA',
    description: 'Portrait of Jensen Huang wearing leather jacket',
    tags: ['NVIDIA', 'Jensen Huang', 'CEO', 'portrait'],
    width: 3000,
    height: 2000,
  });

  const office = candidate('brave-image', {
    label: 'NVIDIA Voyager campus building',
    title: 'NVIDIA corporate headquarters building Voyager campus Santa Clara',
    description: 'Exterior view of NVIDIA corporate headquarters',
    tags: ['NVIDIA', 'headquarters', 'building', 'campus'],
    width: 2500,
    height: 1400,
  });

  const logo = candidate('commons', {
    label: 'NVIDIA logo',
    title: 'NVIDIA green eye logo symbol',
    description: 'Brand logo of NVIDIA corporation',
    tags: ['NVIDIA', 'logo', 'brand'],
    width: 1800,
    height: 1800,
  });

  const scoreGpu = scoreAssetCandidate(gpu, request, context);
  const scoreJensen = scoreAssetCandidate(jensen, request, context);
  const scoreOffice = scoreAssetCandidate(office, request, context);
  const scoreLogo = scoreAssetCandidate(logo, request, context);

  assert.ok(scoreGpu.qualityRank >= 3);
  assert.equal(scoreJensen.qualityRank, 0);
  assert.equal(scoreOffice.qualityRank, 0);
  assert.equal(scoreLogo.qualityRank, 0);

  const pool = [
    { candidate: jensen, score: scoreJensen },
    { candidate: office, score: scoreOffice },
    { candidate: logo, score: scoreLogo },
    { candidate: gpu, score: scoreGpu },
  ].sort(compareCandidateScores);

  assert.equal(pool[0].candidate.label, gpu.label, 'NVIDIA H100 GPU must rank #1');
});

test('Fixture C: Steve Jobs introducing iPhone prefers keynote event over modern Apple Store or generic phone', () => {
  const request = {
    id: 'req_jobs',
    concept: 'Steve Jobs introducing iPhone',
    assetIntent: 'historical',
    entities: ['Steve Jobs', 'Apple'],
    searchConcepts: ['Steve Jobs iPhone launch 2007', 'Macworld 2007 keynote'],
    constraints: { orientation: 'landscape', minWidth: 1280, minHeight: 720 },
    exclusions: ['modern office', 'generic stock'],
    evidenceRequired: true,
    stagedQueries: { specific: ['Steve Jobs introducing iPhone'], fallback: ['Steve Jobs iPhone'] },
  };
  const context = analyzeAssetRequest(request);

  const keynote = candidate('commons', {
    label: 'Steve Jobs introducing the iPhone at Macworld 2007',
    title: 'Steve Jobs on stage presenting the original Apple iPhone at Macworld keynote January 2007',
    description: 'Steve Jobs holds the first generation iPhone during the historic launch announcement',
    tags: ['Steve Jobs', 'iPhone', 'Apple', 'Macworld', 'keynote', '2007', 'launch'],
    width: 1920,
    height: 1080,
  });

  const appleStore = candidate('pexels-image', {
    label: 'Modern Apple Store glass cube',
    title: 'Fifth avenue Apple Store modern glass building exterior',
    description: 'Apple retail store building in New York',
    tags: ['Apple', 'store', 'building', 'retail'],
    width: 3000,
    height: 2000,
  });

  const genericPhone = candidate('pexels-image', {
    label: 'Generic smartphone on wooden desk',
    title: 'Hand holding modern generic smartphone with black screen',
    description: 'A person holding a generic mobile telephone',
    tags: ['phone', 'smartphone', 'mobile', 'device'],
    width: 2400,
    height: 1600,
  });

  const scoreKeynote = scoreAssetCandidate(keynote, request, context);
  const scoreStore = scoreAssetCandidate(appleStore, request, context);
  const scorePhone = scoreAssetCandidate(genericPhone, request, context);

  assert.ok(scoreKeynote.qualityRank >= 3);
  assert.equal(scoreStore.qualityRank, 0); // Building false match
  assert.ok(scorePhone.gates.includes('entity_mismatch')); // Missing Steve Jobs and Apple

  const pool = [
    { candidate: appleStore, score: scoreStore },
    { candidate: genericPhone, score: scorePhone },
    { candidate: keynote, score: scoreKeynote },
  ].sort(compareCandidateScores);

  assert.equal(pool[0].candidate.label, keynote.label);
});

test('Fixture D: Roman Colosseum prefers exact monument over generic Rome cityscape', () => {
  const request = {
    id: 'req_colosseum',
    concept: 'Roman Colosseum',
    assetIntent: 'location',
    entities: [],
    searchConcepts: ['Colosseum Rome exterior', 'Flavian Amphitheatre'],
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
    exclusions: ['generic office', 'unrelated employees'],
    evidenceRequired: false,
    stagedQueries: { specific: ['Roman Colosseum'], fallback: ['Colosseum'] },
  };
  const context = analyzeAssetRequest(request);

  const colosseum = candidate('commons', {
    label: 'Colosseum amphitheatre in Rome Italy',
    title: 'The Roman Colosseum ancient amphitheatre monument exterior sunny day',
    description: 'Iconic exterior architecture of the Flavian Amphitheatre in Rome Italy',
    tags: ['Colosseum', 'Rome', 'Italy', 'ancient', 'monument', 'amphitheatre'],
    width: 2560,
    height: 1440,
  });

  const genericRome = candidate('pexels-image', {
    label: 'Rome city street with scooters',
    title: 'Cobblestone alley street in Rome Italy with parked mopeds and cafe tables',
    description: 'Atmospheric street view in residential Rome neighborhood',
    tags: ['Rome', 'street', 'city', 'Italy', 'cafe'],
    width: 2800,
    height: 1600,
  });

  const scoreColosseum = scoreAssetCandidate(colosseum, request, context);
  const scoreRome = scoreAssetCandidate(genericRome, request, context);

  assert.ok(scoreColosseum.qualityRank >= 3);
  assert.ok(scoreRome.gates.includes('subject_mismatch'));

  const pool = [
    { candidate: genericRome, score: scoreRome },
    { candidate: colosseum, score: scoreColosseum },
  ].sort(compareCandidateScores);

  assert.equal(pool[0].candidate.label, colosseum.label);
});

test('Fixture E: Developer writing React code allows authentic stock action/coding media', () => {
  const request = {
    id: 'req_dev',
    concept: 'software developer writing React code',
    assetIntent: 'action',
    entities: [],
    searchConcepts: ['programmer coding React application', 'developer typing JavaScript code'],
    constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 },
    exclusions: ['low resolution', 'watermark'],
    evidenceRequired: false,
    stagedQueries: { specific: ['software developer writing React code'], fallback: ['developer coding'] },
  };
  const context = analyzeAssetRequest(request);

  const coding = candidate('pexels-image', {
    label: 'Programmer coding in dark room IDE',
    title: 'Software engineer typing React JavaScript source code on laptop in code editor',
    description: 'Close-up of fingers typing programming syntax and React component on screen',
    tags: ['coding', 'developer', 'React', 'programming', 'code', 'software', 'laptop'],
    width: 2560,
    height: 1440,
  });

  const scoreCoding = scoreAssetCandidate(coding, request, context);
  assert.ok(scoreCoding.qualityRank >= 3);
  assert.equal(scoreCoding.resolutionStatus === 'excellent' || scoreCoding.resolutionStatus === 'good', true);
  assert.equal(scoreCoding.gates.length, 0);
});

test('Fixture F: Video asset memory penalizes immediate repeat and concept runs', () => {
  const memory = new VideoAssetMemory();
  const request = {
    id: 'req_logo_1',
    concept: 'ASML logo',
    assetIntent: 'concept',
    entities: ['ASML'],
    searchConcepts: [],
    constraints: { orientation: 'landscape' },
    exclusions: [],
    evidenceRequired: false,
    stagedQueries: { specific: ['ASML logo'], fallback: ['ASML'] },
  };
  const context = analyzeAssetRequest(request);

  const logoCand = candidate('commons', {
    providerAssetId: 'asml_logo_vector_svg',
    label: 'ASML logo',
    sourceUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/ASML_logo.svg',
  });

  const firstScore = scoreAssetCandidate(logoCand, request, context, memory);
  assert.equal(firstScore.diversity.assetReusePenalty, 0);

  memory.remember(logoCand, request, context, 'shot-1', 'scene-1', 'hash123');

  const secondScore = scoreAssetCandidate(logoCand, request, context, memory);
  assert.ok(secondScore.diversity.assetReusePenalty >= 0.8, 'Reusing exact asset ID must trigger strong reuse penalty');
  assert.ok(secondScore.diversity.conceptReusePenalty > 0, 'Reusing same concept must trigger concept reuse penalty');
});
