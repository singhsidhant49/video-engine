import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVisibleNeed } from '../src/storyboard/visibleNeed.js';
import { inspectVisualCandidate } from '../src/assets/visualInspectionService.js';
import { judgeAssetCandidate, classifyVisualMatch } from '../src/assets/visualEditorialJudge.js';
import { recordImageInBank, searchImageBank, deriveBankTokens } from '../src/services/imageBank.js';
import { isBlankRenderedFrame } from '../src/tools/preview.js';
import { splitTtsText } from '../src/services/ttsService.js';
import { normalizePlan, narrationCompletenessIssues, stripSpokenChapterLabel, validateContentQuality, deterministicCompress, repairIncompleteNarration } from '../src/services/aiDirectorService.js';
import { generateVideoPackage } from '../src/services/thumbnailGenerator.js';
import { buildVisualRealizationDiagnostics } from '../src/pipeline/visualRealizationDiagnostics.js';
import { applySceneRepairs, reviewVisualPlan } from '../src/services/visualCriticService.js';

test('rendered-frame blank detection permits dark detailed footage', () => {
  assert.equal(isBlankRenderedFrame({ mean: 2.37, deviation: 13.39 }), false);
  assert.equal(isBlankRenderedFrame({ mean: 0.2, deviation: 0.3 }), true);
});

test('long-form TTS splitting preserves text order and bounds request size', () => {
  const text = Array.from({ length: 80 }, (_, index) => `Sentence ${index + 1} explains the next audiobook idea clearly.`).join(' ');
  const chunks = splitTtsText(text, 240);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 240));
  assert.equal(chunks.join(' '), text);
});

test('TTS splitting never cuts a word even when one token exceeds the nominal chunk size', () => {
  const longToken = 'x'.repeat(280);
  const text = `Opening sentence. ${longToken} closing words.`;
  const chunks = splitTtsText(text, 80);
  assert.ok(chunks.includes(longToken));
  assert.equal(chunks.join(' '), text);
});

test('spoken chapter numbers are removed while chapter metadata is retained', () => {
  assert.equal(stripSpokenChapterLabel('Chapter Three: Rise of Cities. People gathered.'), 'Rise of Cities. People gathered.');
  const plan = normalizePlan({
    title: 'History',
    scenes: [{
      narration: 'Chapter Three: Rise of Cities. People gathered around the river.',
      purpose: 'chapter', section: true, kind: 'subject', visual: 'ancient river settlement',
    }],
  }, { topic: 'History', format: 'landscape' });
  assert.equal(plan.scenes[0].kind, 'chapter');
  assert.equal(plan.scenes[0].data.number, 3);
  assert.equal(plan.scenes[0].data.title, 'Rise of Cities');
  assert.ok(!/^chapter/i.test(plan.script));
});

test('narration completeness rejects dangling generated prose', () => {
  const issues = narrationCompletenessIssues([
    { narration: 'They planted grain, herded sheep, and.' },
    { narration: 'This is a complete explanation.' },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'incomplete_narration');
});

test('narration completeness permits natural questions and clauses ending with prepositions or particles', () => {
  const issues = narrationCompletenessIssues([
    { narration: 'So next time you deposit a check, ask: where does that money really come from?' },
    { narration: 'This is fractional reserve lending, allowing banks to create credit many times over.' },
    { narration: 'Consider what modern money is actually made of.' },
    { narration: 'There was nowhere left to turn to.' },
    { narration: 'Who was this system actually designed for?' },
    { narration: 'They had no tools to work with.' },
  ]);
  assert.equal(issues.length, 0);
});

test('creative meditation absolutes are not misclassified as factual statistics', () => {
  const plan = normalizePlan({
    title: 'Sleep meditation',
    scenes: [
      {
        id: 's1',
        kind: 'atmosphere',
        purpose: 'hook',
        narration: 'The only sound is the hush of waves, and this sanctuary is always waiting for you.',
        visual: 'Moonlit waves move slowly across a quiet beach.',
      },
    ],
  }, { topic: 'Sleep meditation', niche: 'meditation', format: 'landscape' });

  assert.equal(plan.claims.length, 0);
  assert.equal(plan.contentQuality.issues.some((issue) => issue.type === 'unverified_exact_claim'), false);
});

test('figurative first-step language is not treated as an unsourced historical superlative', () => {
  const plan = normalizePlan({
    title: 'Inflation basics',
    scenes: [
      { narration: 'Prices can rise over time, reducing purchasing power.', purpose: 'hook', kind: 'subject', imageQueries: ['grocery prices'], emphasis: 'Prices', intensity: 3 },
      { narration: 'Understanding inflation is the first step to protecting your savings.', purpose: 'payoff', kind: 'subject', imageQueries: ['person reviewing savings'], emphasis: 'first step', intensity: 3 },
    ],
  }, { topic: 'Inflation basics', durationSec: 30 });
  const result = validateContentQuality(plan);
  assert.equal(result.issues.some((issue) => issue.type === 'unverified_exact_claim'), false);
});

test('fictional first occurrence is not treated as a historical superlative', () => {
  const plan = normalizePlan({ title: 'A seed', scenes: [{
    id: 's1', kind: 'subject', purpose: 'payoff',
    narration: 'Then one day, the first green shoot breaks through the soil.',
    visual: 'A green seedling emerges from dark soil.',
  }] }, { topic: 'A reflective story about patience', niche: 'narrated story', format: 'landscape' });
  assert.equal(plan.claims.length, 0);
});

test('figurative moral and narrative superlatives in stories are not treated as unverified factual claims', () => {
  const plan = normalizePlan({
    title: 'The Little Bird and the Thirsty Tree',
    scenes: [
      { id: 's1', kind: 'subject', purpose: 'hook', narration: 'Once upon a time, a little bird lived in a beautiful forest.' },
      { id: 's2', kind: 'subject', purpose: 'payoff', narration: 'The bird sang her happiest song. Even the smallest effort can change everything. Never give up on doing good.' },
    ],
  }, { topic: 'The Little Bird and the Thirsty Tree', niche: 'children story', format: 'landscape' });
  const result = validateContentQuality(plan);
  assert.equal(plan.claims.length, 0);
  assert.equal(result.issues.some((issue) => issue.type === 'unverified_exact_claim'), false);
  assert.equal(result.valid, true);
});

test('explicit hypothetical numbers are classified as illustrative, not unsupported facts', () => {
  const plan = normalizePlan({ title: 'Weekly budget', scenes: [
    { id: 's1', kind: 'statistic', purpose: 'explain', narration: 'For example, say you earn $700 a week and essentials cost $500.', visual: 'A sample weekly budget.' },
    { id: 's2', kind: 'statistic', purpose: 'payoff', narration: 'By Friday, she has $100 left for the weekend.', visual: 'The example budget balance.' },
  ] }, { topic: 'How to build a weekly budget', niche: 'finance tutorial', format: 'landscape' });
  assert.ok(plan.claims.every((claim) => claim.status === 'illustrative'));
  assert.equal(plan.contentQuality.valid, true);
});

test('unsupported dated and numeric factual claims still require evidence', () => {
  const plan = normalizePlan({
    title: 'History',
    scenes: [
      {
        id: 's1',
        kind: 'subject',
        purpose: 'evidence',
        narration: 'In 1950, the measured population reached 20 million.',
        visual: 'An archival city photograph fills the frame.',
      },
    ],
  }, { topic: 'History', niche: 'history', format: 'landscape' });

  assert.equal(plan.claims.length, 1);
  assert.equal(plan.claims[0].status, 'unverified');
  assert.equal(plan.contentQuality.issues.some((issue) => issue.type === 'unverified_exact_claim'), true);
});

test('long-form scenes are not called fragmented when each scene has substantive narration', () => {
  const scenes = Array.from({ length: 28 }, (_, index) => ({
    id: `s${index + 1}`,
    purpose: index === 27 ? 'payoff' : 'explanation',
    narration: 'Let your breathing become softer while the quiet night settles gently around your resting body.',
  }));
  const quality = validateContentQuality({ scenes });
  assert.equal(quality.issues.some((issue) => issue.type === 'excessive_scene_fragmentation'), false);
});

test('deterministic compression never appends punctuation to a dangling word or comma', () => {
  const plan = {
    scenes: [
      { id: 's1', purpose: 'context', importance: 1, narration: 'The shoulders often carry the weight of the day, even after the room becomes quiet and dark.' },
      { id: 's2', purpose: 'explanation', importance: 2, narration: 'There is no tension in this pause, only a gentle invitation to settle more deeply.' },
      { id: 's3', purpose: 'payoff', importance: 5, narration: 'Rest now, because nothing more is asked of you tonight.' },
    ],
  };
  const compressed = deterministicCompress(plan, 24);
  assert.equal(narrationCompletenessIssues(compressed.scenes).length, 0);
  assert.equal(compressed.script.includes(',.'), false);
});

test('deterministic compression never manufactures sentence fragments from word prefixes', () => {
  const plan = {
    scenes: [
      { id: 's1', purpose: 'context', importance: 1, narration: 'Dreams feel real, yet their purpose remains mysterious. Despite decades of research, the answer remains uncertain.' },
      { id: 's2', purpose: 'explanation', importance: 2, narration: 'During REM, the brain becomes highly active. This activity helps researchers study how dreaming works.' },
      { id: 's3', purpose: 'explanation', importance: 2, narration: 'Neural signals form vivid narratives. Without logical oversight, those narratives can become surreal.' },
      { id: 's4', purpose: 'payoff', importance: 5, narration: 'Dreams reveal an active sleeping brain.' },
    ],
  };
  const compressed = deterministicCompress(plan, 28);
  assert.equal(narrationCompletenessIssues(compressed.scenes).length, 0);
  assert.equal(compressed.script.includes('This.'), false);
  assert.equal(compressed.script.includes('Without logical.'), false);
});

test('offline narration repair drops only a mechanically truncated trailing fragment', async () => {
  const plan = {
    scenes: [
      { id: 's1', narration: 'Your breathing is quiet and steady. There is nothing left to do but.' },
      { id: 's2', narration: 'Then the hips, the.' },
    ],
  };
  const repaired = await repairIncompleteNarration(plan, null);
  assert.equal(repaired.scenes[0].narration, 'Your breathing is quiet and steady.');
  assert.equal(repaired.scenes.some((scene) => scene.id === 's2'), false);
  assert.equal(narrationCompletenessIssues(repaired.scenes).length, 0);
});

test('narration repair and normalizePlan strip placeholder and meta-commentary narration', async () => {
  const plan = {
    scenes: [
      { id: 's1', narration: 'The internet is remarkably physical.' },
      { id: 's2', narration: 'The narration for this segment is incomplete.' },
      { id: 's3', narration: 'Every cable reaches across the dark ocean. The narration for this segment is incomplete.' },
      { id: 's4', narration: 'This segment is incomplete.' },
    ],
  };

  const repaired = await repairIncompleteNarration(plan, null);
  assert.equal(repaired.scenes.some((s) => s.id === 's2'), false);
  assert.equal(repaired.scenes.some((s) => s.id === 's4'), false);
  assert.equal(repaired.scenes.find((s) => s.id === 's3')?.narration, 'Every cable reaches across the dark ocean.');
  assert.equal(narrationCompletenessIssues(repaired.scenes).length, 0);

  const normalized = normalizePlan(plan, { topic: 'Subsea internet cables' });
  assert.equal(normalized.scenes.some((s) => /incomplete/i.test(s.narration)), false);
  assert.equal(normalized.scenes.length, 2);
  assert.equal(normalized.scenes[1].narration, 'Every cable reaches across the dark ocean.');
});

test('cool nighttime meditation language does not create a technical heat-dissipation query', () => {
  const need = buildVisibleNeed({
    id: 'garden-detail',
    role: 'detail',
    assetIntent: 'concept',
    visualConcept: 'A tranquil garden at night with jasmine flowers moving in a gentle breeze.',
  }, {
    scene: { id: 'scene-garden', narration: 'The air is cool while jasmine leaves move in a gentle breeze.' },
    editorialMode: 'MOTIVATIONAL',
    videoTopic: 'Guided sleep meditation',
  });
  assert.equal(need.action, 'leaves and flowers moving in a gentle breeze');
  assert.equal(need.environment, 'peaceful natural garden at night');
  assert.equal(need.editorialMode, 'MOTIVATIONAL');
  assert.equal(need.acceptableSemanticAlternatives.some((item) => /technical cutaway|engineering test rig/i.test(item)), false);
});

test('packaging emits real section chapters instead of every clip', () => {
  const plan = { title: 'Test', topic: 'Test', script: 'Test script.', scenes: [
    { id: 'scene_001', narration: 'Opening.', section: true },
    { id: 'scene_002', narration: 'Continuation.', section: false },
    { id: 'scene_003', narration: 'Natural section opening.', section: true, data: { title: 'Second Section' } },
  ] };
  const timeline = { fps: 30, clips: [
    { id: 'c1', sceneId: 'scene_001', from: 0, sectionId: 'a' },
    { id: 'c2', sceneId: 'scene_002', from: 300, sectionId: 'a' },
    { id: 'c3', sceneId: 'scene_003', from: 600, sectionId: 'b' },
  ] };
  const result = generateVideoPackage(plan, timeline);
  assert.equal(result.chapters.length, 2);
  assert.equal(result.chapters[1].title, 'Second Section');
});

test('media diagnostics classify native footage as video, not slideshow photography', () => {
  const base = { durationInFrames: 90, presentation: { cameraMove: 'static' }, variant: 'full', layout: 'image:full' };
  const diagnostics = buildVisualRealizationDiagnostics({ fps: 30, clips: [], realizedShots: [
    { ...base, family: 'image', asset: { type: 'image', src: 'a.jpg' } },
    { ...base, family: 'image', asset: { type: 'video', src: 'b.mp4' } },
  ] });
  assert.deepEqual(diagnostics.familyDistribution, { image: 1, video: 1 });
  assert.equal(diagnostics.consecutivePhotoCount, 1);
});

test('long-hold repair creates a traceable detail shot with complete coverage', () => {
  const original = {
    id: 'shot_1', storyboardShotId: 'shot_1', sceneId: 'scene_1', sectionId: 'section_1',
    from: 0, durationInFrames: 300, family: 'image', variant: 'full', layout: 'image:full',
    presentation: { layout: 'image:full', cameraMove: 'static' },
    asset: { type: 'image', src: 'a.jpg', assetIdentityChain: { timelineAssetId: 'shot_1' } },
  };
  const repaired = applySceneRepairs({ fps: 30, clips: [{ id: 'c1', sceneId: 'scene_1', from: 0, durationInFrames: 300, shots: [original] }] }, [
    { sceneId: 'scene_1', action: 'split_long_hold' },
  ]);
  assert.equal(repaired.clips[0].shots.length, 2);
  assert.equal(repaired.clips[0].shots[0].durationInFrames + repaired.clips[0].shots[1].durationInFrames, 300);
  assert.equal(repaired.clips[0].shots[1].asset.assetIdentityChain.timelineAssetId, repaired.clips[0].shots[1].storyboardShotId);
  assert.equal(Object.hasOwn(repaired.clips[0].shots[1], 'timelineStartFrame'), false);
});

test('long-hold critic does not create cuts that violate the production pacing floor', () => {
  const original = {
    id: 'shot_1', storyboardShotId: 'shot_1', sceneId: 'scene_1', sectionId: 'section_1',
    from: 0, durationInFrames: 267, family: 'image', variant: 'full', layout: 'image:full',
    presentation: { layout: 'image:full', cameraMove: 'subtlePush' },
  };
  const timeline = {
    fps: 30, format: 'landscape',
    productionProfile: { pacing: { mode: 'balanced', minimumShotSeconds: 4.8, maximumStillSeconds: 8, targetAverageShotSeconds: 5.7 } },
    clips: [{ id: 'c1', sceneId: 'scene_1', from: 0, durationInFrames: 267, shots: [original] }],
  };
  const review = reviewVisualPlan(timeline);
  assert.equal(review.sceneRepairs.length, 0);
  assert.equal(review.issues[0].type, 'paced_long_hold');
  assert.match(review.issues[0].message, /splitting it would violate/);
});

// =========================================================================
// Sections 10 & 11: Cross-Run Cache Isolation & Bank Token Decontamination
// =========================================================================

test('Sections 10 & 11: ImageBank derives tokens strictly from intrinsic metadata, preventing cross-run query pollution', () => {
  // Intrinsic metadata: image of a cloud server rack
  const tokens = deriveBankTokens({
    description: 'Server rack in modern cloud data center',
    label: 'datacenter infrastructure rack',
    query: 'branching timeline quantum paradox alternate universe', // query from another run
  });

  // Must contain intrinsic words
  assert.ok(tokens.includes('server'));
  assert.ok(tokens.includes('rack'));
  assert.ok(tokens.includes('datacenter'));

  // Must NEVER contain unrelated search query tokens from Run B
  assert.ok(!tokens.includes('timeline'), 'Dynamic query tokens must not pollute bank index');
  assert.ok(!tokens.includes('paradox'), 'Dynamic query tokens must not pollute bank index');
  assert.ok(!tokens.includes('quantum'), 'Dynamic query tokens must not pollute bank index');
  assert.ok(!tokens.includes('universe'), 'Dynamic query tokens must not pollute bank index');
});

// =========================================================================
// Section 24 & 72: Foreign Entity Intrusion Detection
// =========================================================================

test('Section 24 & 72: Foreign entity intrusion (NVIDIA) is rejected in Grandfather Paradox video', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_paradox',
    concept: 'time paradox prevents changing the past',
    narration: 'If you travel back in time and prevent your grandparents from meeting, a causal paradox emerges.',
    videoTopic: 'The Grandfather Paradox in Theoretical Physics',
  });

  const nvidiaSignCandidate = {
    id: 'cand_nvidia_sign',
    label: 'Nvidia headquarters building entrance sign in Santa Clara',
    description: 'Exterior sign of NVIDIA office building',
    tags: ['nvidia', 'sign', 'building', 'office', 'headquarters'],
  };

  const inspection = await inspectVisualCandidate(nvidiaSignCandidate, { visibleNeed });
  assert.ok(inspection.foreignEntities.some((e) => /nvidia/i.test(e)), 'NVIDIA recognized as foreign entity');

  const judgment = judgeAssetCandidate({
    candidate: nvidiaSignCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('foreign_entity_intrusion')));
});

test('Section 24: Foreign entity (NVIDIA) is accepted when topic is specifically AI chip hardware', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_gpu',
    concept: 'NVIDIA GPU accelerator chips powering modern AI models',
    narration: 'NVIDIA semiconductor chips and GPUs dominate the artificial intelligence market.',
    videoTopic: 'AI Semiconductor Hardware and NVIDIA GPUs',
  });

  const nvidiaChipCandidate = {
    id: 'cand_nvidia_gpu',
    label: 'Nvidia AI chip processor hardware in server',
    description: 'Close up of high performance NVIDIA graphics accelerator chip',
    tags: ['nvidia', 'chip', 'gpu', 'semiconductor', 'hardware'],
  };

  const inspection = await inspectVisualCandidate(nvidiaChipCandidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate: nvidiaChipCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.accepted, true);
  assert.ok(judgment.classification === 'DIRECT' || judgment.classification === 'CONTEXTUAL');
});

// =========================================================================
// Sections 70–78: Known Bad Renders Benchmark Test Suite
// =========================================================================

test('Section 70 & 71: Guitar pedal "Parallel Universe" rejected for quantum multiverse concept', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_multiverse',
    concept: 'parallel universes resolve the temporal paradox',
    narration: 'In the multiverse hypothesis, quantum branching creates a parallel universe for every decision.',
    videoTopic: 'Grandfather Paradox and Multiverse Theory',
  });

  const guitarPedalCandidate = {
    id: 'cand_pedal',
    label: 'Fender Parallel Universe effects guitar stompbox pedal',
    description: 'Electric guitar effects pedal named Parallel Universe on stage',
    tags: ['parallel universe', 'guitar pedal', 'fender', 'stompbox', 'audio'],
  };

  const inspection = await inspectVisualCandidate(guitarPedalCandidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate: guitarPedalCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('accidental_keyword_match')));
});

test('Section 72: Motherboard / circuit board rejected for cosmic censorship in physics', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_barrier',
    concept: 'cosmic censorship hypothesis shields the timeline',
    narration: 'Physics laws may forbid time paradoxes through chronology protection mechanisms.',
    videoTopic: 'Grandfather Paradox Chronology Protection',
  });

  const motherboardCandidate = {
    id: 'cand_motherboard',
    label: 'Desktop computer motherboard with SLI GTX graphics cards',
    description: 'Printed circuit board with computer chip hardware',
    tags: ['motherboard', 'circuit board', 'pc component', 'hardware'],
  };

  const inspection = await inspectVisualCandidate(motherboardCandidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate: motherboardCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('wrong_subject_match') || r.includes('foreign_entity_intrusion')));
});

test('Section 73: Currency banknotes rejected for causal timeline loop in physics', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_loop',
    concept: 'causal timeline loop in theoretical physics',
    narration: 'A causal loop implies events are both their own cause and their own effect.',
    videoTopic: 'Grandfather Paradox and Causal Loops',
  });

  const currencyCandidate = {
    id: 'cand_cash',
    label: 'Stack of Indian rupee paper currency banknotes',
    description: 'Banknotes of paper money cash on a desk',
    tags: ['currency', 'rupee', 'banknote', 'cash', 'bills'],
  };

  const inspection = await inspectVisualCandidate(currencyCandidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate: currencyCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('wrong_subject_match') || r.includes('foreign_entity_intrusion')));
});

test('Sections 75 & 76: Botanical tree branches downgraded to METAPHORICAL for timeline branching', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_branching',
    concept: 'branching timelines split into alternate histories',
    narration: 'Each decision point creates a branching timeline where history unfolds differently.',
    videoTopic: 'Grandfather Paradox Branching Timelines',
  });

  const treeBranchCandidate = {
    id: 'cand_tree_branch',
    label: 'Bare tree twigs and branches growing in park',
    description: 'Botanical tree branch splitting into leafless twigs under overcast sky',
    tags: ['tree', 'branch', 'twigs', 'nature', 'wood'],
  };

  const inspection = await inspectVisualCandidate(treeBranchCandidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate: treeBranchCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  // Direct explainer requires DIRECT evidence; botanical branch is at best METAPHORICAL and rejected when DIRECT required
  assert.equal(judgment.classification, 'METAPHORICAL');
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('metaphorical_downgrade') || r.includes('requires direct')));
});

test('Sections 77 & 78: Municipal street sanitation worker rejected for software garbage collector', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_gc',
    concept: 'V8 engine garbage collector reclaims heap memory',
    narration: 'The JavaScript V8 engine garbage collector automatically reclaims unreferenced heap memory.',
    videoTopic: 'JavaScript Memory Leaks and V8 Garbage Collection',
  });

  const sanitationWorkerCandidate = {
    id: 'cand_street_cleaner',
    label: 'Municipal sanitation worker on a city street collecting waste',
    description: 'City sanitation worker cleaning trash on a street at dusk',
    tags: ['sanitation worker', 'garbage collector', 'waste collection', 'street cleaner', 'trash'],
  };

  const inspection = await inspectVisualCandidate(sanitationWorkerCandidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate: sanitationWorkerCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('accidental_keyword_match')));
});

test('Visual Relevance: Supermarket food shelves rejected for bank vault concept', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_vault',
    concept: 'bank vault door opening dark',
    narration: 'Most people believe banks lend out money deposited by savers in a vault.',
    videoTopic: 'How Banks Create Money and Fractional Reserve Lending',
  });

  const supermarketCandidate = {
    id: 'cand_supermarket',
    label: 'High angle of empty and full shelves in supermarket with price tags and cardboard boxes',
    description: 'Empty grocery store aisle shelves with price tags',
    tags: ['shelves', 'supermarket', 'grocery', 'aisle', 'store'],
  };

  const inspection = await inspectVisualCandidate(supermarketCandidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate: supermarketCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('wrong_subject_match')));
});

test('Visual Relevance: Kitchen oven dial rejected for central bank interest rates', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_fed_rates',
    concept: 'central bank adjusts interest rates',
    narration: 'Central banks manipulate interest rates to influence the economic cycle.',
    videoTopic: 'Central Banking and Interest Rates',
  });

  const ovenDialCandidate = {
    id: 'cand_oven_dial',
    label: 'Hand adjusting the temperature dial on a modern stainless steel oven in a contemporary kitchen',
    description: 'Close up of hand turning oven temperature dial in kitchen',
    tags: ['hand', 'adjusting', 'dial', 'oven', 'kitchen', 'stove'],
  };

  const inspection = await inspectVisualCandidate(ovenDialCandidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate: ovenDialCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('wrong_subject_match')));
});

test('Visual Relevance: Tibetan prayer flags rejected for financial bank statement', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_bank_statement',
    concept: 'bank statement paper close up',
    narration: 'The bank statement showed the newly created ledger balance.',
    videoTopic: 'How Banks Create Money',
  });

  const prayerFlagCandidate = {
    id: 'cand_prayer_flags',
    label: 'Vibrant Tibetan prayer flags fluttering in the wind at Ladakh, India',
    description: 'Colorful Buddhist prayer flags in high mountain wind',
    tags: ['prayer flags', 'tibetan', 'ladakh', 'wind'],
  };

  const inspection = await inspectVisualCandidate(prayerFlagCandidate, { visibleNeed });
  const judgment = judgeAssetCandidate({
    candidate: prayerFlagCandidate,
    inspection,
    visibleNeed,
    targetFormat: 'landscape',
  });

  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.rejectReasons.some((r) => r.includes('wrong_subject_match')));
});
