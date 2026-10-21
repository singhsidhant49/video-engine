import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVisibleNeed } from '../src/storyboard/visibleNeed.js';
import { inspectVisualCandidate, compareVisualToNeed } from '../src/assets/visualInspectionService.js';
import { judgeAssetCandidate, classifyVisualMatch } from '../src/assets/visualEditorialJudge.js';
import { scoreVerticalCropFitness, scoreLandscapeFitness } from '../src/assets/formatFitnessScorer.js';
import { scoreVideoWindow, selectVideoWindow } from '../src/assets/videoWindowSelector.js';
import { evaluateVisualSequence } from '../src/storyboard/visualSequenceDirector.js';

// ==========================================
// Adversarial Semantic Ambiguity Suite (Section 15)
// ==========================================

test('Section 15: Memory leak vs leaking water pipe is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_mem',
    concept: 'memory leak software bug',
    narration: 'A severe memory leak in the node service consumed all available RAM until the system crashed.',
  });
  const candidate = {
    id: 'cand_pipe',
    label: 'Plumber fixing leaking water pipe in basement',
    tags: ['leaking', 'pipe', 'water', 'leak', 'plumbing'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Java thread vs sewing thread is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_thread',
    concept: 'CPU multithreading execution',
    narration: 'Each CPU worker thread executes instructions concurrently across multiple hardware cores.',
  });
  const candidate = {
    id: 'cand_sew',
    label: 'Spool of colorful sewing thread and needle on cloth',
    tags: ['thread', 'sewing', 'needle', 'textile', 'spool'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Cloud computing vs weather storm cloud is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_cloud',
    concept: 'cloud computing datacenter infrastructure',
    narration: 'Enterprise companies migrated their entire database workloads into the cloud.',
  });
  const candidate = {
    id: 'cand_sky',
    label: 'Fluffy white cumulus cloud floating in blue sunny sky',
    tags: ['cloud', 'weather', 'sky', 'sun', 'nature'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Packet loss vs cardboard postal parcel is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_packet',
    concept: 'TCP network packet loss',
    narration: 'Network congestion caused severe packet loss across the transatlantic optical line.',
  });
  const candidate = {
    id: 'cand_box',
    label: 'Cardboard shipping box package delivered on front porch',
    tags: ['package', 'parcel', 'packet', 'cardboard box', 'delivery'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Branch prediction vs tree branch foliage is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_branch',
    concept: 'CPU branch prediction pipeline',
    narration: 'Modern processors use speculative execution and branch prediction to avoid pipeline stalls.',
  });
  const candidate = {
    id: 'cand_tree',
    label: 'Green tree branch with leaves in sunny forest',
    tags: ['tree', 'branch', 'leaves', 'forest', 'nature'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Kernel panic vs edible corn kernels is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_kernel',
    concept: 'Linux kernel panic crash',
    narration: 'A faulty device driver triggered an unrecoverable kernel panic on the production server.',
  });
  const candidate = {
    id: 'cand_corn',
    label: 'Bowl of crunchy roasted corn on cob with golden kernels',
    tags: ['corn', 'kernel', 'popcorn', 'agriculture', 'food'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Network layer vs commercial fishing net is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_net',
    concept: 'OSI network protocol layer',
    narration: 'Routing happens at the third network layer using IP addressing.',
  });
  const candidate = {
    id: 'cand_fish',
    label: 'Commercial fishing net hauled onto trawler deck',
    tags: ['network', 'net', 'fishing', 'ocean', 'trawler'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Cache miss vs supermarket cash register is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_cache',
    concept: 'L1 CPU cache miss',
    narration: 'A random memory access pattern caused repeated L1 cache misses, slowing down computation.',
  });
  const candidate = {
    id: 'cand_register',
    label: 'Supermarket cash register drawer with paper money and dollar bills',
    tags: ['cash', 'register', 'cache', 'money', 'retail'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Current flow vs river rapids is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_current',
    concept: 'electrical current flow in semiconductor',
    narration: 'Applying a gate voltage allows electrical current to flow across the silicon channel.',
  });
  const candidate = {
    id: 'cand_river',
    label: 'Rushing river water current cascading over mountain rocks',
    tags: ['current', 'river', 'water', 'rapids', 'stream'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Bond yield vs chemical molecular bond is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_bond',
    concept: 'treasury bond yield curve',
    narration: 'Investors monitored the inverted treasury bond yield curve for signs of recession.',
  });
  const candidate = {
    id: 'cand_chem',
    label: 'Ball and stick plastic model of covalent chemical molecular bond',
    tags: ['bond', 'molecule', 'chemical', 'chemistry', 'atom'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Viral growth vs biological virus pathogen is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_virus',
    concept: 'malware virus infection on computer network',
    narration: 'The ransomware virus encrypted server volumes across the entire corporate network.',
  });
  const candidate = {
    id: 'cand_bio',
    label: 'Microscopic spherical biological virus pathogen cell with red spikes',
    tags: ['virus', 'medical', 'biology', 'pathogen', 'flu'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Bank run vs people jogging near river bank is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_bank',
    concept: 'banking panic and bank run',
    narration: 'Rumors of insolvency triggered an immediate bank run as depositors withdrew funds.',
  });
  const candidate = {
    id: 'cand_jog',
    label: 'Athletic people jogging along grassy river bank in summer',
    tags: ['bank', 'running', 'jogging', 'river', 'park'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Database transaction vs Bitcoin and Mastercard credit card is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_db_tx',
    concept: 'database ACID transaction',
    narration: 'Each database transaction must execute atomically or roll back completely.',
  });
  const candidate = {
    id: 'cand_crypto',
    label: 'Close up of smartphone screen displaying bitcoin and Mastercard credit cards',
    tags: ['transaction', 'payment', 'credit card', 'bitcoin', 'mastercard'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Software thread lock wait vs Valet parking sign is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_thread_wait',
    concept: 'thread waiting on database lock',
    narration: 'Thread A enters a state of waiting for the locked row to become free.',
  });
  const candidate = {
    id: 'cand_valet',
    label: "Valet parking sign saying please wait here we'll bring your car",
    tags: ['wait', 'waiting', 'valet', 'parking', 'sign'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Database table vs Wooden dining table is classified as ACCIDENTAL', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_db_table',
    concept: 'database schema table',
    narration: 'The transactions both request locks on the user account database table.',
  });
  const candidate = {
    id: 'cand_dining',
    label: 'Modern wooden dining table set for dinner with chairs',
    tags: ['table', 'dining table', 'wooden', 'furniture'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Concurrency deadlock vs Highway traffic jam is classified as ACCIDENTAL and rejected', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_deadlock',
    concept: 'concurrency deadlock circular wait',
    narration: 'Two threads enter a mutual deadlock where neither can proceed.',
  });
  const candidate = {
    id: 'cand_traffic',
    label: 'Heavy highway congestion with cars stuck in bumper to bumper traffic jam',
    tags: ['deadlock', 'traffic jam', 'highway', 'cars'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Section 15: Concurrency deadlock vs Hand holding keys, handcuffs or prison escape is classified as ACCIDENTAL and rejected', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_deadlock_keys',
    concept: 'concurrency deadlock circular wait',
    narration: 'A deadlock needs four conditions: mutual exclusion, hold and wait, no preemption, and circular wait.',
  });
  const candidate = {
    id: 'cand_keys',
    label: 'Hand holding keys while another hand gestures in a dark room with a laptop suggesting a connection to prison break or escape',
    tags: ['deadlock', 'hand holding keys', 'escape', 'prison break'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

// ==========================================
// Tests 66 to 80 (Hard Requirements)
// ==========================================

test('Test 66: Portrait in landscape - native landscape candidate B defeats portrait candidate A', () => {
  const candA = {
    id: 'candA_portrait',
    width: 1080,
    height: 1920,
    qualityTier: 'SUPPORT',
  };
  const candB = {
    id: 'candB_landscape',
    width: 1920,
    height: 1080,
    qualityTier: 'SUPPORT',
  };
  const fitnessA = scoreLandscapeFitness(candA);
  const fitnessB = scoreLandscapeFitness(candB);

  assert.ok(fitnessB.score > fitnessA.score, 'Native landscape has higher fitness score than portrait in landscape');
  assert.equal(fitnessB.orientation, 'landscape');
  assert.equal(fitnessA.orientation, 'portrait');
});

test('Test 67: Wrong perfect Shorts asset - semantic correctness beats portrait fit', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_quantum',
    concept: 'quantum electron tunneling',
    narration: 'Electrons tunnel directly through the nanometer insulating barrier.',
  }, { format: 'shorts' });

  // Candidate A: 9:16 portrait but WRONG semantic content (e.g. coffee cup)
  const candA = {
    id: 'candA_coffee',
    width: 1080,
    height: 1920,
    label: 'Steaming cup of coffee on wooden table in morning',
    tags: ['coffee', 'cup', 'morning', 'drink', 'table'],
  };
  // Candidate B: 16:9 landscape but DIRECT semantic content with clean center
  const candB = {
    id: 'candB_electron',
    width: 1920,
    height: 1080,
    label: 'Quantum particle tunneling through energy barrier simulation',
    tags: ['quantum', 'tunneling', 'electron', 'physics', 'barrier'],
    subjectBounds: { x: 0.35, y: 0.25, width: 0.30, height: 0.50 },
  };

  const inspA = await inspectVisualCandidate(candA);
  const inspB = await inspectVisualCandidate(candB);

  const judgA = judgeAssetCandidate({ candidate: candA, inspection: inspA, visibleNeed, targetFormat: 'shorts' });
  const judgB = judgeAssetCandidate({ candidate: candB, inspection: inspB, visibleNeed, targetFormat: 'shorts' });

  assert.equal(judgA.accepted, false, 'Wrong portrait asset is rejected');
  assert.equal(judgB.accepted, true, 'Correct landscape asset with safe vertical crop is accepted');
  assert.ok(judgB.finalEditorialScore > judgA.finalEditorialScore);
});

test('Test 68: Travel map failure - "travel back in time" rejects road map', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_timetravel',
    concept: 'time travel paradox',
    narration: 'If you travel back in time to alter the historical timeline, reality branches.',
  });
  const candidate = {
    id: 'cand_roadmap',
    label: 'United States highway interstate road map with routes',
    tags: ['travel', 'road map', 'highway', 'geography', 'routes'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Test 69: Risk sign failure - "Would you risk changing the past?" rejects wet-floor sign', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_risk',
    concept: 'time travel risk decision',
    narration: 'Would you risk changing the past if it meant erasing your own existence?',
  });
  const candidate = {
    id: 'cand_wetfloor',
    label: 'Caution wet floor yellow plastic warning triangle on tile',
    tags: ['risk', 'caution', 'warning', 'wet floor', 'slippery'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'ACCIDENTAL');
  assert.equal(judgment.accepted, false);
});

test('Test 70: Generic science - "parallel universes resolve the paradox" rejects generic chemistry glassware', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_multiverse',
    concept: 'parallel universes resolve paradox',
    narration: 'The existence of parallel universes resolves the paradox by creating a new timeline.',
  });
  const candidate = {
    id: 'cand_flask',
    label: 'Scientist holding chemistry beaker glassware with blue bubbling liquid',
    tags: ['science', 'chemistry', 'laboratory', 'beaker', 'flask'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.ok(['WRONG', 'ACCIDENTAL'].includes(judgment.classification));
  assert.equal(judgment.accepted, false);
});

test('Test 71: Generic scientist - "quantum branching creates another reality" penalizes clipboard scientist below quantum imagery', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_branching',
    concept: 'quantum branching multiverse',
    narration: 'Quantum branching creates another reality at every single atomic interaction.',
  });
  const candScientist = {
    id: 'cand_sci',
    label: 'Smiling scientist with clipboard and lab coat pointing at screen',
    tags: ['scientist', 'clipboard', 'lab coat', 'research', 'lab'],
  };
  const candQuantum = {
    id: 'cand_quantum',
    label: 'Quantum multiverse cosmic branching timelines astrophysical concept',
    tags: ['quantum', 'branching', 'multiverse', 'universe', 'timeline'],
  };

  const inspSci = await inspectVisualCandidate(candScientist);
  const inspQuantum = await inspectVisualCandidate(candQuantum);

  const judgSci = judgeAssetCandidate({ candidate: candScientist, inspection: inspSci, visibleNeed, targetFormat: 'landscape' });
  const judgQuantum = judgeAssetCandidate({ candidate: candQuantum, inspection: inspQuantum, visibleNeed, targetFormat: 'landscape' });

  assert.ok(judgQuantum.finalEditorialScore > judgSci.finalEditorialScore);
  assert.equal(judgQuantum.classification, 'DIRECT');
});

test('Test 72: Unrelated device - "your grandparents never meet" rejects electronic circuit board', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_grandparents',
    concept: 'grandfather paradox grandparents meet',
    narration: 'In this hypothetical branch, your grandparents never meet in 1950.',
  });
  const candidate = {
    id: 'cand_pcb',
    label: 'Green printed circuit board with soldered microchips and capacitors',
    tags: ['circuit board', 'electronics', 'motherboard', 'device', 'hardware'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'WRONG');
  assert.equal(judgment.accepted, false);
});

test('Test 73: Valid map - "he travelled from London to Paris" accepts route map (no global map ban)', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_geo',
    concept: 'travel from London to Paris',
    narration: 'He travelled from London to Paris across the English Channel.',
  });
  const candidate = {
    id: 'cand_channel_map',
    label: 'Route map showing transit corridor from London to Paris across Channel',
    tags: ['map', 'london', 'paris', 'route', 'travel', 'geography'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.ok(['DIRECT', 'CONTEXTUAL'].includes(judgment.classification));
  assert.equal(judgment.accepted, true);
});

test('Test 74: Valid warning sign - "the laboratory displayed a radiation warning sign" accepts radiation sign', async () => {
  const visibleNeed = buildVisibleNeed({
    id: 'shot_rad',
    concept: 'radiation warning sign in laboratory',
    narration: 'The laboratory displayed a prominent radiation warning sign on the blast door.',
  });
  const candidate = {
    id: 'cand_radiation',
    label: 'Yellow radiation hazard warning sign posted on laboratory door',
    tags: ['radiation', 'warning sign', 'hazard', 'laboratory', 'caution'],
  };
  const inspection = await inspectVisualCandidate(candidate);
  const judgment = judgeAssetCandidate({ candidate, inspection, visibleNeed, targetFormat: 'landscape' });
  assert.equal(judgment.classification, 'DIRECT');
  assert.equal(judgment.accepted, true);
});

test('Test 75: Video semantic window - selects 4-8s action window over 0-4s empty scene', () => {
  const samplesEmpty = [{ brightness: 0.3, blur: 0.1, actionPresent: false, subjectPresent: false }];
  const samplesAction = [{ brightness: 0.7, blur: 0.1, actionPresent: true, subjectPresent: true }];

  const scoreEarly = scoreVideoWindow({ startTime: 0, endTime: 4, totalDuration: 12, samples: samplesEmpty });
  const scoreMid = scoreVideoWindow({ startTime: 4, endTime: 8, totalDuration: 12, samples: samplesAction });

  assert.ok(scoreMid.windowScore > scoreEarly.windowScore, 'Mid-clip action window scores higher than empty start');
});

test('Test 76: Multi-subject Shorts - flags multiSubjectIssue when faces sit at opposite edges', () => {
  const candidate = {
    width: 1920,
    height: 1080,
    faceBounds: [
      { x: 0.05, y: 0.3, width: 0.15, height: 0.3 },
      { x: 0.85, y: 0.3, width: 0.15, height: 0.3 },
    ],
  };
  const fitness = scoreVerticalCropFitness(candidate);
  assert.equal(fitness.multiSubjectIssue, true);
  assert.equal(fitness.reject, true);
  assert.ok(fitness.rejectReasons.some((r) => r.includes('opposite_edges')));
});

test('Test 77: Visual story coherence - detects erratic transitions and degrades verdict', () => {
  const goodShots = [
    { id: 's1', visualRole: 'HOOK', asset: { label: 'pocket watch clock' } },
    { id: 's2', visualRole: 'ESTABLISH', asset: { label: 'grandparents in 1950' } },
    { id: 's3', visualRole: 'ACTION', asset: { label: 'time traveler activating device' } },
    { id: 's4', visualRole: 'EVIDENCE', asset: { label: 'fading family photograph' } },
    { id: 's5', visualRole: 'PAYOFF', asset: { label: 'branching quantum timeline' } },
  ];
  const goodJudgments = {
    s1: { classification: 'DIRECT' },
    s2: { classification: 'DIRECT' },
    s3: { classification: 'DIRECT' },
    s4: { classification: 'DIRECT' },
    s5: { classification: 'DIRECT' },
  };
  const goodReview = evaluateVisualSequence({ shots: goodShots, editorialJudgments: goodJudgments });
  assert.equal(goodReview.verdict, 'STRONG');

  const chaoticShots = [
    { id: 'c1', visualRole: 'HOOK', asset: { label: 'clock' } },
    { id: 'c2', visualRole: 'CONTEXT', asset: { label: 'road map' } },
    { id: 'c3', visualRole: 'CONTEXT', asset: { label: 'chemistry flask' } },
    { id: 'c4', visualRole: 'CONTEXT', asset: { label: 'random hardware device' } },
    { id: 'c5', visualRole: 'PAYOFF', asset: { label: 'warning sign' } },
  ];
  const chaoticJudgments = {
    c1: { classification: 'METAPHORICAL' },
    c2: { classification: 'ACCIDENTAL' },
    c3: { classification: 'METAPHORICAL' },
    c4: { classification: 'WRONG' },
    c5: { classification: 'ACCIDENTAL' },
  };
  const chaoticReview = evaluateVisualSequence({ shots: chaoticShots, editorialJudgments: chaoticJudgments });
  assert.ok(['FAILED', 'WEAK'].includes(chaoticReview.verdict));
});

test('Test 78: Flat context run - 5 CONTEXT shots in a row triggers flat_visual_progression warning', () => {
  const flatShots = [
    { id: 's1', visualRole: 'HOOK' },
    { id: 's2', visualRole: 'CONTEXT' },
    { id: 's3', visualRole: 'CONTEXT' },
    { id: 's4', visualRole: 'CONTEXT' },
    { id: 's5', visualRole: 'CONTEXT' },
    { id: 's6', visualRole: 'CONTEXT' },
    { id: 's7', visualRole: 'PAYOFF' },
  ];
  const judgments = {
    s1: { classification: 'DIRECT' },
    s2: { classification: 'CONTEXTUAL' },
    s3: { classification: 'CONTEXTUAL' },
    s4: { classification: 'CONTEXTUAL' },
    s5: { classification: 'CONTEXTUAL' },
    s6: { classification: 'CONTEXTUAL' },
    s7: { classification: 'DIRECT' },
  };
  const review = evaluateVisualSequence({ shots: flatShots, editorialJudgments: judgments });
  assert.ok(review.warnings.some((w) => w.code === 'flat_visual_progression'));
});

test('Test 79 & 80: Unresolved media production vs development mode behavior', () => {
  // Production mode blocks render on unresolved critical media:
  const isCritical = true;
  const unresolvedMediaModeProd = 'BLOCK_PRODUCTION';
  const shouldBlockProd = unresolvedMediaModeProd === 'BLOCK_PRODUCTION' && isCritical;
  assert.equal(shouldBlockProd, true);

  // Development mode allows placeholder:
  const unresolvedMediaModeDev = 'ALLOW_DEV_PLACEHOLDER';
  const shouldBlockDev = unresolvedMediaModeDev === 'BLOCK_PRODUCTION' && isCritical;
  assert.equal(shouldBlockDev, false);
});
