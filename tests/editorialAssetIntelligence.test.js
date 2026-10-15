import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVisibleNeed } from '../src/storyboard/visibleNeed.js';
import { inspectVisualCandidate } from '../src/assets/visualInspectionService.js';
import { judgeAssetCandidate } from '../src/assets/visualEditorialJudge.js';
import { scoreVerticalCropFitness, scoreLandscapeFitness } from '../src/assets/formatFitnessScorer.js';
import { selectVideoWindow, scoreVideoWindow } from '../src/assets/videoWindowSelector.js';
import { evaluateVisualSequence } from '../src/storyboard/visualSequenceDirector.js';
import { normalizeMediaSceneSpec } from '../src/composition/mediaSceneSpec.js';
import { evaluateMediaVisualQuality } from '../src/qc/mediaVisualQualityGate.js';
import { buildCaptionChunks } from '../src/services/alignmentService.js';
import { CaptionTokens } from '../src/config/tokens/editorialTokens.js';

test('Part 1 & 2: VisibleNeed builds visible action requirements and avoids generic filler', () => {
  const shot = {
    id: 'shot_req',
    concept: 'The browser sends an HTTP request to the server',
    narration: 'The browser sends an HTTP request to the server over the network.',
    assetIntent: 'network',
    entities: ['browser', 'server'],
    evidenceRequirement: 'required',
  };
  const need = buildVisibleNeed(shot, { format: 'landscape' });
  assert.ok(need.subject, 'Subject is extracted');
  assert.ok(need.action, 'Action is extracted');
  assert.ok(need.viewerNeedsToSee, 'Viewer needs to see is described');
  assert.equal(need.literalnessRequirement, 'DIRECT');
  assert.ok(need.avoidVisuals.some((term) => /generic|office|team|meeting|people/i.test(term)));
});

test('Part 71: TEST CASE: ACCIDENTAL KEYWORD MATCH (guitar pedal "Parallel Universe" rejected)', async () => {
  const visibleNeed = {
    subject: 'parallel universes or branching quantum timelines',
    action: 'branching timelines in physics',
    environment: 'space, quantum physics, cosmos',
    literalnessRequirement: 'DIRECT',
    avoidVisuals: ['guitar pedal', 'musical equipment', 'audio stompbox', 'amplifier'],
  };
  const candidate = {
    id: 'cand_pedal',
    providerId: 'pexels',
    type: 'image',
    label: 'Parallel Universe guitar pedal effects stompbox',
    description: 'A close up photo of a guitar pedal named Parallel Universe',
    tags: ['parallel universe', 'guitar', 'pedal', 'audio', 'music'],
    width: 1920,
    height: 1080,
    license: { name: 'Pexels', nonFree: false },
  };

  const inspection = await inspectVisualCandidate(candidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.rejected, true);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('accidental')));
});

test('Part 72: TEST CASE: SERVER MISMATCH (abandoned ruin titled "data center" rejected)', async () => {
  const visibleNeed = {
    subject: 'modern datacenter servers processing requests',
    action: 'servers and network equipment handling requests',
    environment: 'datacenter or server room',
    literalnessRequirement: 'DIRECT',
    avoidVisuals: ['abandoned building', 'ruin', 'decay', 'empty warehouse'],
  };
  const candidate = {
    id: 'cand_ruin',
    providerId: 'pexels',
    type: 'image',
    label: 'Old abandoned radar facility and ruined data center',
    description: 'Decaying concrete walls of an abandoned military data center bunker',
    tags: ['abandoned', 'ruins', 'data center', 'decay', 'concrete'],
    width: 1920,
    height: 1080,
    license: { name: 'Pexels', nonFree: false },
  };

  const inspection = await inspectVisualCandidate(candidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.rejected, true);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('wrong') || r.includes('prohibited')));
});

test('Part 73: TEST CASE: GENERIC OFFICE (smiling team around laptop penalized for technical beat)', async () => {
  const visibleNeed = {
    subject: 'web browser and server communication',
    action: 'sending HTTP request or inspecting network devtools',
    environment: 'browser devtools or server infrastructure',
    literalnessRequirement: 'DIRECT',
    avoidVisuals: ['generic office team', 'smiling business meeting', 'happy corporate colleagues'],
  };
  const officeCandidate = {
    id: 'cand_office',
    providerId: 'pexels',
    type: 'image',
    label: 'Smiling corporate business team in office meeting around laptop',
    description: 'Colleagues laughing at a conference table with coffee and laptops',
    tags: ['office', 'team', 'meeting', 'laptop', 'corporate'],
    width: 1920,
    height: 1080,
    license: { name: 'Pexels', nonFree: false },
  };
  const serverCandidate = {
    id: 'cand_server',
    providerId: 'pexels',
    type: 'image',
    label: 'Server rack in modern cloud data center with flashing fiber optic lights',
    description: 'Rows of illuminated server blades and high-speed network switches',
    tags: ['server', 'data center', 'network', 'infrastructure'],
    width: 1920,
    height: 1080,
    license: { name: 'Pexels', nonFree: false },
  };

  const officeInspection = await inspectVisualCandidate(officeCandidate, { visibleNeed });
  const officeJudgment = judgeAssetCandidate({
    candidate: officeCandidate,
    inspection: officeInspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  const serverInspection = await inspectVisualCandidate(serverCandidate, { visibleNeed });
  const serverJudgment = judgeAssetCandidate({
    candidate: serverCandidate,
    inspection: serverInspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.ok(serverJudgment.finalEditorialScore > officeJudgment.finalEditorialScore);
  assert.equal(serverJudgment.classification, 'DIRECT');
  assert.ok(officeJudgment.classification === 'WRONG' || officeJudgment.classification === 'CONTEXTUAL');
});

test('Part 74: TEST CASE: CONTEXTUAL VALIDITY (people with laptops accepted when narration describes everyday users)', async () => {
  const visibleNeed = {
    subject: 'people using internet browsers in everyday life',
    action: 'browsing the web or working on laptop computers',
    environment: 'coffee shop, home, or office',
    literalnessRequirement: 'CONTEXTUAL_ALLOWED',
    avoidVisuals: ['abandoned building', 'datacenter server blades'],
  };
  const candidate = {
    id: 'cand_user',
    providerId: 'pexels',
    type: 'image',
    label: 'Person typing on laptop computer drinking coffee',
    description: 'Young professional using a web browser on laptop in a bright cafe',
    tags: ['laptop', 'typing', 'internet', 'browsing', 'cafe'],
    width: 1920,
    height: 1080,
    license: { name: 'Pexels', nonFree: false },
  };

  const inspection = await inspectVisualCandidate(candidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.rejected, false);
  assert.ok(['DIRECT', 'CONTEXTUAL'].includes(judgment.classification));
});

test('Part 75: TEST CASE: SHORTS CROP (wide photo with critical subjects near opposite edges rejected)', () => {
  // A wide 16:9 photo with subjects at x=0.05 and x=0.90
  const candidate = {
    width: 1920,
    height: 1080,
    importantObjectBounds: [
      { x: 0.05, y: 0.4, width: 0.2, height: 0.3 },
      { x: 0.85, y: 0.4, width: 0.2, height: 0.3 },
    ],
    subjectBounds: { x: 0.05, y: 0.4, width: 0.9, height: 0.4 },
  };
  const score = scoreVerticalCropFitness(candidate);
  assert.ok(score.subjectRetention < 0.60, 'Critical subjects cannot both survive 9:16 crop');
  assert.ok(score.cropFitness < 0.45, 'Crop fitness is low');
});

test('Part 76: TEST CASE: PORTRAIT PREFERENCE (native portrait beats landscape candidate for Shorts)', () => {
  const landscapeCandidate = {
    width: 1920,
    height: 1080,
    subjectBounds: { x: 0.2, y: 0.3, width: 0.6, height: 0.5 },
  };
  const portraitCandidate = {
    width: 1080,
    height: 1920,
    subjectBounds: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 },
    focalPoint: { x: 0.5, y: 0.4 },
  };

  const scoreL = scoreVerticalCropFitness(landscapeCandidate);
  const scoreP = scoreVerticalCropFitness(portraitCandidate);

  assert.ok(scoreP.cropFitness > scoreL.cropFitness, 'Native portrait achieves higher vertical crop fitness');
  assert.ok(scoreP.subjectRetention >= 0.90, 'Native portrait retains subjects cleanly');
});

test('Part 77: TEST CASE: VIDEO WINDOW (action-aware window selection avoids black/settling frames)', async () => {
  // Mock window scoring with settle at start and action in the middle
  const window0to3 = scoreVideoWindow({
    startTime: 0,
    endTime: 3,
    samples: [
      { timestamp: 0.2, brightness: 0.02, contrast: 0.05, blur: 0.8, motionEnergy: 0.05, sceneCut: false, subjectPresent: false, actionPresent: false },
      { timestamp: 1.5, brightness: 0.15, contrast: 0.2, blur: 0.5, motionEnergy: 0.1, sceneCut: false, subjectPresent: true, actionPresent: false },
    ],
    visibleNeed: { action: 'cable installation machinery running' },
  });

  const window6to9 = scoreVideoWindow({
    startTime: 6,
    endTime: 9,
    samples: [
      { timestamp: 6.5, brightness: 0.55, contrast: 0.6, blur: 0.1, motionEnergy: 0.45, sceneCut: false, subjectPresent: true, actionPresent: true },
      { timestamp: 8.0, brightness: 0.58, contrast: 0.62, blur: 0.08, motionEnergy: 0.50, sceneCut: false, subjectPresent: true, actionPresent: true },
    ],
    visibleNeed: { action: 'cable installation machinery running' },
  });

  assert.ok(window6to9.windowScore > window0to3.windowScore, 'Mid-clip action window scores higher than settling window');
  assert.ok(window0to3.penalties.some((p) => p.includes('black') || p.includes('low_action') || p.includes('blur')));
});

test('Part 78: TEST CASE: STATIC CAMERA (strong still image defaults to static hold without artificial zoom)', () => {
  const shot = {
    id: 'shot_still',
    visualConcept: 'Global internet submarine cable route map',
    role: 'HERO',
    presentation: { cameraMove: 'static' },
  };
  const asset = {
    id: 'asset_map',
    width: 2560,
    height: 1440,
    src: 'assets/map.jpg',
    qualityTier: 'HERO',
    visualBusyness: 0.4,
  };
  const spec = normalizeMediaSceneSpec({
    shot,
    asset,
    format: 'landscape',
    durationInFrames: 114, // 3.8s at 30fps
  });
  assert.equal(spec.cameraIntent, 'STATIC');
  assert.equal(spec.cameraReason, 'STATIC_HOLD');
});

test('Part 79: TEST CASE: PUSH (narration intensifying focus uses SUBTLE_PUSH with explicit reason)', () => {
  const shot = {
    id: 'shot_push',
    visualConcept: 'Close inspection of silicon microprocessor lithography',
    role: 'DETAIL',
    presentation: { cameraMove: 'subtlePush' },
  };
  const asset = {
    id: 'asset_microprocessor',
    width: 3840,
    height: 2160,
    src: 'assets/chip.jpg',
    qualityTier: 'HERO',
    visualBusyness: 0.35,
  };
  const spec = normalizeMediaSceneSpec({
    shot,
    asset,
    format: 'landscape',
    durationInFrames: 90,
  });
  assert.equal(spec.cameraIntent, 'SUBTLE_PUSH');
  assert.equal(spec.cameraReason, 'INTENSIFY_FOCUS');
});

test('Part 80 & 81: Subtitle chunking adapts to format (Landscape vs Shorts)', () => {
  const words = [
    { word: 'Undersea', start: 0.0, end: 0.4 },
    { word: 'cables', start: 0.4, end: 0.8 },
    { word: 'carry', start: 0.8, end: 1.1 },
    { word: 'ninety-nine', start: 1.1, end: 1.6 },
    { word: 'percent', start: 1.6, end: 2.0 },
    { word: 'of', start: 2.0, end: 2.2 },
    { word: 'all', start: 2.2, end: 2.4 },
    { word: 'intercontinental', start: 2.4, end: 3.1 },
    { word: 'traffic.', start: 3.1, end: 3.6 },
  ];

  const landscapeChunks = buildCaptionChunks(words, 30, { maxWords: 7, maxChars: 42 });
  const shortsChunks = buildCaptionChunks(words, 30, { maxWords: 4, maxChars: 26 });

  // Landscape keeps longer natural chunks (4-8 words), Shorts uses tighter 2-4 word punches
  assert.ok(landscapeChunks.length <= shortsChunks.length, 'Landscape chunks contain more words per phrase than Shorts');
  assert.equal(CaptionTokens.LANDSCAPE.defaultEmphasis, 'NONE', 'Landscape default emphasis mode is NONE, no karaoke');
  assert.ok(['KEYWORD', 'ACTIVE_WORD'].includes(CaptionTokens.SHORTS.defaultEmphasis), 'Shorts emphasis mode supports punchy KEYWORD or ACTIVE_WORD');
});

test('Part 82: VisualSequenceDirector catches repeated generic stock run', () => {
  const shots = [
    { id: 's1', visualRole: 'HOOK', asset: { label: 'corporate office meeting' } },
    { id: 's2', visualRole: 'CONTEXT', asset: { label: 'generic business team' } },
    { id: 's3', visualRole: 'CONTEXT', asset: { label: 'smiling colleagues in office' } },
    { id: 's4', visualRole: 'CONTEXT', asset: { label: 'corporate team around table' } },
    { id: 's5', visualRole: 'PAYOFF', asset: { label: 'business discussion' } },
  ];
  const review = evaluateVisualSequence({
    shots,
    editorialJudgments: {},
    editorialMode: 'TECHNICAL_EXPLAINER',
  });
  assert.ok(review.warnings.some((w) => w.code === 'repeated_visual_role'), 'Flags repeated visual role run');
});

test('Part 83: VisualSequenceDirector catches metaphor run in technical video', () => {
  const shots = [
    { id: 's1', visualRole: 'HOOK' },
    { id: 's2', visualRole: 'CONTEXT' },
    { id: 's3', visualRole: 'DETAIL' },
    { id: 's4', visualRole: 'EVIDENCE' },
    { id: 's5', visualRole: 'PAYOFF' },
  ];
  const judgments = {
    s1: { classification: 'DIRECT' },
    s2: { classification: 'METAPHORICAL' },
    s3: { classification: 'METAPHORICAL' },
    s4: { classification: 'METAPHORICAL' },
    s5: { classification: 'DIRECT' },
  };
  const review = evaluateVisualSequence({
    shots,
    editorialJudgments: judgments,
    editorialMode: 'TECHNICAL_EXPLAINER',
  });
  assert.ok(review.warnings.some((w) => w.code === 'metaphor_run'), 'Flags 3+ consecutive metaphors in technical explainer');
});

test('Part 84: VisualSequenceDirector catches layered media overuse', () => {
  const shots = [
    { id: 's1', strategy: 'LAYERED_MEDIA' },
    { id: 's2', strategy: 'LAYERED_MEDIA' },
    { id: 's3', strategy: 'LAYERED_MEDIA' },
    { id: 's4', strategy: 'FULL_BLEED' },
  ];
  const review = evaluateVisualSequence({ shots });
  assert.ok(review.warnings.some((w) => w.code === 'layered_media_overuse'), 'Flags consecutive layered media shots');
});

test('Part 85 & 50: Media visual quality gate flags editorial mismatches and unresolved media', () => {
  const solvedScene = {
    id: 'solved_test',
    shotId: 'shot_test',
    viewport: { width: 1920, height: 1080 },
    mediaGeometry: {
      media_primary: { rect: { x: 0, y: 0, width: 1920, height: 1080 } },
    },
    captionBox: null,
    elements: {},
    format: 'landscape',
  };
  const motionPlan = { tracks: [] };
  const mediaSceneSpec = {
    strategy: 'FULL_BLEED',
    textNeed: 'NONE',
    cameraIntent: 'STATIC',
    transitionIntent: { entry: 'CUT', exit: 'CUT' },
    assets: [{
      src: 'assets/shot_unresolved.jpg',
      assetId: 'shot_unresolved',
      type: 'image',
      safeTextRegions: [],
    }],
    editorialJudgment: {
      classification: 'ACCIDENTAL',
      rejectReasons: ['accidental_keyword_match'],
    },
    visibleNeed: { literalnessRequirement: 'DIRECT' },
  };

  const qc = evaluateMediaVisualQuality({ solvedScene, motionPlan, mediaSceneSpec });
  assert.equal(qc.publishable, false);
  assert.ok(qc.warnings.some((w) => w.code === 'accidental_keyword_match'));
  assert.ok(qc.warnings.some((w) => w.code === 'unresolved_media'));
});

test('Part 86: Authentic Wikipedia entity match is classified as DIRECT', async () => {
  const visibleNeed = {
    subject: 'Agbogbloshie',
    primaryConcept: 'Agbogbloshie',
    requiredEntities: ['Agbogbloshie'],
    literalnessRequirement: 'DIRECT',
    avoidVisuals: [],
  };
  const candidate = {
    id: 'cand_agbogbloshie',
    providerId: 'wikipedia',
    type: 'image',
    label: 'Agbogbloshie, Ghana 2019',
    description: 'A view of the Agbogbloshie e-waste scrapyard in Accra, Ghana',
    tags: ['Agbogbloshie', 'Ghana', 'Accra'],
    width: 1920,
    height: 1080,
    license: { name: 'CC-BY-SA', nonFree: false },
  };

  const inspection = await inspectVisualCandidate(candidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'DIRECT');
  assert.equal(judgment.accepted, true);
});

