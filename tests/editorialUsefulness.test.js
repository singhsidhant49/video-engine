import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVisibleNeed } from '../src/storyboard/visibleNeed.js';
import { inspectVisualCandidate } from '../src/assets/visualInspectionService.js';
import { judgeAssetCandidate, classifyVisualMatch } from '../src/assets/visualEditorialJudge.js';
import { evaluateEditorialUsefulness } from '../src/assets/editorialUsefulnessEvaluator.js';
import { evaluateVisualSequence } from '../src/storyboard/visualSequenceDirector.js';

// =========================================================================
// MILESTONE: Editorial Usefulness, Search Calibration & Human-Editor Gating
// Tests for Sections 49-60
// =========================================================================

// Section 49: Test Filmora Split Screen (Regression fixture only, NO Filmora integration)
test('Section 49: Filmora / video editor split-screen rejected for branching timelines', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_branching_01',
    concept: 'branching timeline alternate reality',
    narration: 'Reality branches into another timeline.',
    visualRole: 'EVIDENCE',
  });
  visibleNeed.searchExperiments = ['split screen visual', 'split screen template'];

  const candidate = {
    id: 'cand_filmora_ui',
    label: 'Edit single clip filmora split screen video editor timeline tracks',
    tags: ['filmora', 'video editor', 'split screen', 'editing', 'timeline'],
  };

  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });

  // Must not be DIRECT
  assert.notEqual(judgment.classification, 'DIRECT');
  assert.ok(['ACCIDENTAL', 'METAPHORICAL', 'WRONG'].includes(judgment.classification));
  // Usefulness must be WEAK or DISTRACTING
  assert.ok(['WEAK', 'DISTRACTING'].includes(judgment.usefulnessVerdict));
  // Must be rejected for explanation role
  assert.equal(judgment.accepted, false);
});

// Section 50: Test Valid Branching Visual
test('Section 50: Valid branching timeline visualization accepted with high usefulness', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_branching_02',
    concept: 'branching timeline',
    narration: 'Reality branches into another timeline.',
    visualRole: 'EVIDENCE',
  });

  const candidate = {
    id: 'cand_diverging_worlds',
    label: 'Two diverging timelines with parallel world paths splitting from single point',
    tags: ['diverging timeline', 'parallel world', 'branching timeline', 'alternate reality', 'diagram'],
  };

  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });

  assert.equal(judgment.classification, 'DIRECT');
  assert.ok(['STRONG', 'ESSENTIAL'].includes(judgment.usefulnessVerdict));
  assert.equal(judgment.accepted, true);
  assert.ok(judgment.communicationValue >= 0.75);
  assert.ok(judgment.viewerGain.length > 10);
});

// Section 51: Test Unrelated Neon
test('Section 51: Unrelated Chinatown typography rejected due to high distractionRisk and low specificity', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_paradox_neon',
    concept: 'grandfather paradox causal loop',
    narration: 'If you prevent your own birth, a logical grandfather paradox consumes reality.',
    visualRole: 'ACTION',
  });

  const candidate = {
    id: 'cand_chinatown_neon',
    label: 'Chinatown glowing neon typography restaurant storefront at night',
    tags: ['chinatown', 'neon', 'chinese signage', 'restaurant', 'night'],
  };

  const inspection = await inspectVisualCandidate(candidate);
  inspection.ocrText = 'CHINATOWN NOODLES OPEN';
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });

  assert.ok(['WRONG', 'ACCIDENTAL'].includes(judgment.classification));
  assert.equal(judgment.accepted, false);
  assert.ok(judgment.distractionRisk >= 0.60);
  assert.equal(judgment.usefulnessVerdict, 'DISTRACTING');
});

// Section 52: Test Random Brand Sign
test('Section 52: Unrelated commercial brand sign rejected as foreign entity distraction', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_brand_distraction',
    concept: 'grandfather paradox time loop',
    narration: 'The universe shields itself against impossible causal loops.',
    visualRole: 'HOOK',
  });

  const candidate = {
    id: 'cand_brand_sign',
    label: 'NVIDIA GeForce corporate logo billboard on commercial street',
    tags: ['nvidia', 'geforce', 'gpu', 'logo', 'billboard'],
  };

  const inspection = await inspectVisualCandidate(candidate);
  inspection.foreignEntities = ['NVIDIA'];
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });

  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.accepted, false);
});

// Section 53: Test Generic Scientist
test('Section 53: Generic scientist in lab ranks below exact branching-timeline media and fails critical evidence role', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_sci_evidence',
    concept: 'branching timelines create alternate realities',
    narration: 'Branching timelines create alternate realities at every atomic crossroad.',
    visualRole: 'EVIDENCE',
  });

  const candidateScientist = {
    id: 'cand_scientist_lab',
    label: 'Generic scientist in lab posing with clipboard and laboratory coat',
    tags: ['scientist', 'researcher', 'lab coat', 'laboratory'],
  };

  const candidateBranching = {
    id: 'cand_exact_branching',
    label: 'Diverging timeline diagram with quantum branch visualization',
    tags: ['diverging timeline', 'branching timeline', 'diagram'],
  };

  const inspSci = await inspectVisualCandidate(candidateScientist);
  const inspBranch = await inspectVisualCandidate(candidateBranching);

  const judgSci = judgeAssetCandidate({ candidate: candidateScientist, inspection: inspSci, visibleNeed, targetFormat: 'landscape' });
  const judgBranch = judgeAssetCandidate({ candidate: candidateBranching, inspection: inspBranch, visibleNeed, targetFormat: 'landscape' });

  // Generic scientist is CONTEXTUAL, not DIRECT
  assert.equal(judgSci.classification, 'CONTEXTUAL');
  assert.ok(judgSci.specificity < 0.60);
  // Branching visual is DIRECT
  assert.equal(judgBranch.classification, 'DIRECT');
  assert.ok(judgBranch.specificity >= 0.70);

  // Exact media must score significantly higher than generic scientist
  assert.ok(judgBranch.finalEditorialScore > judgSci.finalEditorialScore);

  // For EVIDENCE role, generic scientist must be rejected because evidenceValue is insufficient
  assert.equal(judgSci.accepted, false);
});

// Section 54: Test Clock for Time Travel
test('Section 54: Clock for time travel is classified as CONTEXTUAL / METAPHORICAL, not DIRECT', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_clock_time',
    concept: 'time travel paradox',
    narration: 'Travelling backward into the deep past violates causality.',
    visualRole: 'CONTEXT',
  });

  const candidate = {
    id: 'cand_antique_clock',
    label: 'Antique grandfather clock pendulum ticking time away',
    tags: ['clock', 'pendulum', 'time', 'watch', 'antique'],
  };

  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });

  assert.notEqual(judgment.classification, 'DIRECT');
  assert.ok(['CONTEXTUAL', 'METAPHORICAL'].includes(judgment.classification));
});

// Section 55: Test Family Tree
test('Section 55: Family tree graphic for vanishing lineage is accepted as DIRECT and STRONG', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_lineage',
    concept: 'family lineage causality',
    narration: 'If your grandparents never meet, your entire family lineage disappears.',
    visualRole: 'EVIDENCE',
  });

  const candidate = {
    id: 'cand_family_tree',
    label: 'Historical family tree genealogy chart showing ancestor and descendant lineage branches',
    tags: ['family tree', 'genealogy', 'lineage', 'ancestors', 'chart'],
  };

  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });

  assert.equal(judgment.classification, 'DIRECT');
  assert.ok(['STRONG', 'ESSENTIAL'].includes(judgment.usefulnessVerdict));
  assert.equal(judgment.accepted, true);
  assert.ok(judgment.communicationValue >= 0.75);
});

// Section 56: Test No Entry Sign
test('Section 56: No-entry sign for self-consistency is METAPHORICAL: rejected for EVIDENCE, allowed for ATMOSPHERE', async () => {
  const needEvidence = buildVisibleNeed({
    id: 'shot_no_entry_ev',
    concept: 'self-consistency paradox prohibition',
    narration: 'Self-consistency strictly prevents the contradiction from ever occurring.',
    visualRole: 'EVIDENCE',
  });

  const needAtmosphere = buildVisibleNeed({
    id: 'shot_no_entry_atm',
    concept: 'self-consistency paradox prohibition',
    narration: 'Self-consistency strictly prevents the contradiction from ever occurring.',
    visualRole: 'ATMOSPHERE',
  });
  needAtmosphere.literalnessRequirement = 'METAPHOR_ALLOWED';

  const candidate = {
    id: 'cand_no_entry',
    label: 'Red circular traffic no-entry street sign',
    tags: ['no-entry sign', 'traffic sign', 'street sign', 'road sign'],
  };

  const inspection = await inspectVisualCandidate(candidate);

  const judgEvidence = judgeAssetCandidate({ candidate, inspection, visibleNeed: needEvidence, targetFormat: 'landscape' });
  const judgAtmosphere = judgeAssetCandidate({ candidate, inspection, visibleNeed: needAtmosphere, targetFormat: 'landscape' });

  assert.equal(judgEvidence.classification, 'METAPHORICAL');
  // For EVIDENCE role: rejected!
  assert.equal(judgEvidence.accepted, false);

  // For ATMOSPHERE role: accepted metaphorically
  assert.equal(judgAtmosphere.classification, 'METAPHORICAL');
  assert.equal(judgAtmosphere.accepted, true);
});

// Section 57: Test Search Experiment Must Not Self-Validate
test('Section 57: Search experiment alone does NOT validate unrelated candidate (WEAK_SEARCH_HIT diagnostic)', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_search_exp',
    concept: 'branching reality alternate timeline',
    narration: 'A new causal reality splits into existence.',
    visualRole: 'DETAIL',
  });
  // The system experimented with a search phrase
  visibleNeed.searchExperiments = ['split screen visual effect'];

  const candidate = {
    id: 'cand_video_editor_split',
    label: 'Video editor split screen layout preset in editing software',
    tags: ['split screen', 'layout', 'editor', 'video', 'preset'],
  };

  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });

  // Candidate must NOT become DIRECT just because it matched the search experiment!
  assert.notEqual(judgment.classification, 'DIRECT');
  assert.equal(judgment.accepted, false);
  assert.equal(judgment.isWeakSearchHit, true);
});

// Section 58: Test Information Gain and Semantic Redundancy
test('Section 58: Sequence of repetitive clocks triggers semantic redundancy, while diverse causal chain has healthy information gain', () => {
  // Sequence A: clock -> watch -> hourglass -> clock tower (repetitive time cluster)
  const shotsA = [
    { id: 'shot_1', visualRole: 'HOOK', asset: { label: 'Antique clock ticking' }, visibleNeed: { primaryConcept: 'time' } },
    { id: 'shot_2', visualRole: 'CONTEXT', asset: { label: 'Wrist watch movement' }, visibleNeed: { primaryConcept: 'time' } },
    { id: 'shot_3', visualRole: 'CONTEXT', asset: { label: 'Hourglass sand running' }, visibleNeed: { primaryConcept: 'time' } },
    { id: 'shot_4', visualRole: 'PAYOFF', asset: { label: 'Clock tower dial' }, visibleNeed: { primaryConcept: 'time' } },
  ];
  const judgmentsA = {
    shot_1: { classification: 'CONTEXTUAL', editorialUsefulness: { verdict: 'USEFUL', communicationValue: 0.6 } },
    shot_2: { classification: 'CONTEXTUAL', editorialUsefulness: { verdict: 'USEFUL', communicationValue: 0.6 } },
    shot_3: { classification: 'CONTEXTUAL', editorialUsefulness: { verdict: 'USEFUL', communicationValue: 0.6 } },
    shot_4: { classification: 'CONTEXTUAL', editorialUsefulness: { verdict: 'USEFUL', communicationValue: 0.6 } },
  };

  const resultA = evaluateVisualSequence({ shots: shotsA, editorialJudgments: judgmentsA });
  assert.ok(resultA.metrics.semanticRedundancyCount >= 2);
  assert.ok(resultA.warnings.some((w) => w.code === 'low_information_gain_run'));

  // Sequence B: clock -> grandfather -> family tree -> branching timeline (healthy causal progression)
  const shotsB = [
    { id: 'shot_1', visualRole: 'HOOK', asset: { label: 'Antique clock' }, visibleNeed: { primaryConcept: 'time travel' } },
    { id: 'shot_2', visualRole: 'CONTEXT', asset: { label: 'Elderly grandfather photograph' }, visibleNeed: { primaryConcept: 'grandfather identity' } },
    { id: 'shot_3', visualRole: 'EVIDENCE', asset: { label: 'Family tree genealogy chart' }, visibleNeed: { primaryConcept: 'ancestral lineage' } },
    { id: 'shot_4', visualRole: 'PAYOFF', asset: { label: 'Branching timeline divergence' }, visibleNeed: { primaryConcept: 'multiverse branch' } },
  ];
  const judgmentsB = {
    shot_1: { classification: 'CONTEXTUAL', editorialUsefulness: { verdict: 'STRONG', communicationValue: 0.75 } },
    shot_2: { classification: 'DIRECT', editorialUsefulness: { verdict: 'STRONG', communicationValue: 0.85 } },
    shot_3: { classification: 'DIRECT', editorialUsefulness: { verdict: 'ESSENTIAL', communicationValue: 0.95 } },
    shot_4: { classification: 'DIRECT', editorialUsefulness: { verdict: 'ESSENTIAL', communicationValue: 0.95 } },
  };

  const resultB = evaluateVisualSequence({ shots: shotsB, editorialJudgments: judgmentsB });
  assert.equal(resultB.metrics.semanticRedundancyCount, 0);
  assert.ok(!resultB.warnings.some((w) => w.code === 'low_information_gain_run'));
  assert.equal(resultB.verdict, 'STRONG');
});

// Section 59: Test Generic Stock Run
test('Section 59: Consecutive generic stock shots trigger generic_stock_run warning', () => {
  const shots = [
    { id: 'shot_1', visualRole: 'HOOK', asset: { label: 'Scientist with clipboard' }, visibleNeed: { primaryConcept: 'research' } },
    { id: 'shot_2', visualRole: 'CONTEXT', asset: { label: 'Researcher smiling in lab' }, visibleNeed: { primaryConcept: 'research' } },
    { id: 'shot_3', visualRole: 'CONTEXT', asset: { label: 'Generic office business team' }, visibleNeed: { primaryConcept: 'collaboration' } },
    { id: 'shot_4', visualRole: 'PAYOFF', asset: { label: 'Laboratory glassware' }, visibleNeed: { primaryConcept: 'chemistry' } },
  ];
  const judgments = {
    shot_1: { classification: 'CONTEXTUAL', genericness: 0.65, editorialUsefulness: { genericness: 0.65, verdict: 'USEFUL', communicationValue: 0.6 } },
    shot_2: { classification: 'CONTEXTUAL', genericness: 0.65, editorialUsefulness: { genericness: 0.65, verdict: 'USEFUL', communicationValue: 0.6 } },
    shot_3: { classification: 'CONTEXTUAL', genericness: 0.75, editorialUsefulness: { genericness: 0.75, verdict: 'WEAK', communicationValue: 0.4 } },
    shot_4: { classification: 'CONTEXTUAL', genericness: 0.65, editorialUsefulness: { genericness: 0.65, verdict: 'USEFUL', communicationValue: 0.6 } },
  };

  const result = evaluateVisualSequence({ shots, editorialJudgments: judgments });
  assert.ok(result.warnings.some((w) => w.code === 'generic_stock_run'));
  assert.ok(result.metrics.genericStockRun >= 3);
});

// Section 60: Test Critical Role Gating
test('Section 60: Critical roles (HOOK, ACTION, DETAIL, EVIDENCE, PAYOFF) reject WEAK editorial usefulness', async () => {
  const visibleNeedHook = buildVisibleNeed({
    id: 'shot_hook',
    concept: 'time paradox',
    narration: 'Can you travel back and undo your own origin?',
    visualRole: 'HOOK',
  });

  const visibleNeedDetail = buildVisibleNeed({
    id: 'shot_detail',
    concept: 'memory allocation reference',
    narration: 'Objects remain reachable because memory references are alive.',
    visualRole: 'DETAIL',
  });

  // Weak generic candidate
  const weakCandidate = {
    id: 'cand_abstract',
    label: 'Abstract technology plexus lines and glowing dots',
    tags: ['technology', 'abstract', 'lines', 'dots', 'future'],
  };

  const insp = await inspectVisualCandidate(weakCandidate);

  const judgHook = judgeAssetCandidate({ candidate: weakCandidate, inspection: insp, visibleNeed: visibleNeedHook, targetFormat: 'landscape' });
  const judgDetail = judgeAssetCandidate({ candidate: weakCandidate, inspection: insp, visibleNeed: visibleNeedDetail, targetFormat: 'landscape' });

  assert.equal(judgHook.accepted, false);
  assert.equal(judgDetail.accepted, false);
  assert.ok(judgHook.rejectReasons.some((r) => r.includes('usefulness') || r.includes('hook')));
  assert.ok(judgDetail.rejectReasons.some((r) => r.includes('usefulness') || r.includes('detail')));
});
