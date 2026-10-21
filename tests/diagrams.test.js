import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DIAGRAM_GRAMMARS,
  NODE_IMPORTANCE,
  NODE_VISUAL_FORMS,
  BACKGROUND_MODES,
  GRAMMAR_DEFINITIONS,
  inferDiagramGrammar,
} from '../src/diagrams/diagramGrammar.js';

import {
  createDiagramSpec,
  normalizeDiagramEdges,
} from '../src/diagrams/diagramSpec.js';

import {
  createFormatLayoutContext,
  solveDiagramLayout,
} from '../src/diagrams/layoutEngine.js';

import {
  pickNonRepetitiveBackground,
} from '../src/diagrams/backgroundModes.js';

import {
  evaluateDiagramQuality,
  applyDiagramRepair,
  buildDiagramQualityDiagnostics,
  DIAGRAM_QUALITY_STATE,
  DIAGRAM_REPAIR_ACTIONS,
} from '../src/diagrams/diagramQaDirector.js';

import { GOLDEN_DIAGRAM_FIXTURES } from '../src/diagrams/referenceFixtures.js';

test('Diagram Grammar: infers semantic grammar from narration and concepts', () => {
  assert.equal(
    inferDiagramGrammar({ narration: 'The limbic system competes with the prefrontal cortex in direct conflict.' }),
    DIAGRAM_GRAMMARS.COMPARISON,
    'Conflict/versus context should select COMPARISON'
  );

  assert.equal(
    inferDiagramGrammar({ narration: 'The dopamine habit loop resets with each compulsive search cycle.' }),
    DIAGRAM_GRAMMARS.CYCLE,
    'Loop/cycle context should select CYCLE'
  );

  assert.equal(
    inferDiagramGrammar({ narration: 'Autonomous agents move through a multi-stage pipeline from plan to tool execution.' }),
    DIAGRAM_GRAMMARS.PIPELINE,
    'Pipeline/stage context should select PIPELINE'
  );

  assert.equal(
    inferDiagramGrammar({ narration: 'Total revenue breakdown shows cloud infrastructure driving majority of enterprise growth.' }),
    DIAGRAM_GRAMMARS.HIERARCHY,
    'Breakdown/hierarchy context should select HIERARCHY'
  );

  assert.equal(
    inferDiagramGrammar({ narration: 'The push notification triggers an immediate urge that compels physical action.' }),
    DIAGRAM_GRAMMARS.CAUSE_EFFECT,
    'Trigger/urge causal chain should select CAUSE_EFFECT'
  );
});

test('Diagram Spec: normalizes raw nodes, caps limits, and avoids default generic cards', () => {
  const rawData = {
    nodes: [
      { label: 'One' },
      { label: 'Two' },
      { label: 'Three' },
      { label: 'Four' },
      { label: 'Five' },
      { label: 'Six' },
      { label: 'Seven' },
      { label: 'Eight' },
    ],
  };

  const specShorts = createDiagramSpec(rawData, { format: 'shorts' });
  assert.ok(specShorts.nodes.length <= 5, 'Vertical 9:16 must prune excess nodes to max 5');
  assert.ok(specShorts.nodes.some((n) => n.importance === NODE_IMPORTANCE.PRIMARY), 'Must identify primary concept');
  assert.notEqual(specShorts.nodes[0].visualForm, NODE_VISUAL_FORMS.CARD, 'Default node must not be a generic card');

  const specLandscape = createDiagramSpec(rawData, { format: 'landscape' });
  assert.ok(specLandscape.nodes.length <= 7, 'Landscape 16:9 must cap node count to 7');
});

test('Format-Aware Layout: Landscape uses horizontal canvas and maintains spacing without collision', () => {
  const spec = createDiagramSpec({
    grammar: DIAGRAM_GRAMMARS.PIPELINE,
    nodes: [
      { id: 'n1', label: 'Input' },
      { id: 'n2', label: 'Processing' },
      { id: 'n3', label: 'Output' },
    ],
  }, { format: 'landscape' });

  const ctx = createFormatLayoutContext({ width: 1920, height: 1080, format: 'landscape' });
  const layout = solveDiagramLayout(spec, ctx);

  assert.equal(layout.nodes.length, 3);
  assert.ok(layout.nodes[0].x < layout.nodes[1].x, 'Pipeline nodes must advance horizontally');
  assert.ok(layout.nodes[1].x < layout.nodes[2].x, 'Pipeline nodes must advance horizontally');
  assert.ok(layout.connectors.length >= 2, 'Connectors must connect pipeline stages');

  // Verify non-collision
  for (let i = 0; i < layout.nodes.length - 1; i++) {
    const a = layout.nodes[i];
    const b = layout.nodes[i + 1];
    assert.ok(a.x + a.w <= b.x + 2, 'Consecutive nodes in horizontal layout must not overlap');
  }
});

test('Format-Aware Layout: Vertical 9:16 enforces meaningful canvas occupancy', () => {
  const spec = createDiagramSpec({
    grammar: DIAGRAM_GRAMMARS.FLOW,
    nodes: [
      { id: 's1', label: 'Stimulus' },
      { id: 's2', label: 'Dopamine Release' },
      { id: 's3', label: 'Craving' },
      { id: 's4', label: 'Action' },
    ],
  }, { format: 'shorts' });

  const ctx = createFormatLayoutContext({ width: 1080, height: 1920, format: 'shorts' });
  const layout = solveDiagramLayout(spec, ctx);

  assert.ok(
    layout.verticalCoverageRatio >= 0.40,
    `Vertical coverage ratio (${layout.verticalCoverageRatio}) must occupy >= 40% of canvas`
  );

  // Vertical nodes must descend downwards
  for (let i = 0; i < layout.nodes.length - 1; i++) {
    assert.ok(layout.nodes[i].y < layout.nodes[i + 1].y, 'Nodes must stack vertically in 9:16 mobile');
  }

  // Safe area checks: nodes must stay inside top and caption-safe bounds
  for (const n of layout.nodes) {
    assert.ok(n.y >= ctx.safeArea.top - 10, 'Node must stay below top safe area');
    assert.ok(n.y + n.h <= (ctx.height - ctx.safeArea.bottom) + 10, 'Node must stay above caption safe area');
  }
});

test('Frame-0 Completeness: layout positions and anchors are defined and finite', () => {
  for (const [key, fixture] of Object.entries(GOLDEN_DIAGRAM_FIXTURES)) {
    const spec = createDiagramSpec(fixture, { format: 'landscape' });
    const ctx = createFormatLayoutContext({ width: 1920, height: 1080, format: 'landscape' });
    const layout = solveDiagramLayout(spec, ctx);

    for (const n of layout.nodes) {
      assert.ok(Number.isFinite(n.x) && !Number.isNaN(n.x), `Node ${n.id} in ${key} has invalid x`);
      assert.ok(Number.isFinite(n.y) && !Number.isNaN(n.y), `Node ${n.id} in ${key} has invalid y`);
      assert.ok(Number.isFinite(n.ax) && !Number.isNaN(n.ax), `Anchor ax in ${key} must be finite`);
      assert.ok(Number.isFinite(n.ay) && !Number.isNaN(n.ay), `Anchor ay in ${key} must be finite`);
    }

    for (const c of layout.connectors) {
      assert.ok(c.path && c.path.startsWith('M'), `Connector in ${key} must have valid SVG path: ${c.path}`);
      assert.ok(Number.isFinite(c.fromX) && Number.isFinite(c.toX), `Connector coordinates in ${key} must be finite`);
    }
  }
});

test('Background System: non-repetitive background selection rotates modes cleanly', () => {
  const bg1 = pickNonRepetitiveBackground('technology', ['technicalGrid']);
  assert.notEqual(bg1, 'technicalGrid', 'Must not repeat technicalGrid consecutively');

  const bg2 = pickNonRepetitiveBackground('psychology', ['softRadial']);
  assert.notEqual(bg2, 'softRadial', 'Must not repeat softRadial consecutively');

  const bg3 = pickNonRepetitiveBackground('business', ['paperLight']);
  assert.notEqual(bg3, 'paperLight', 'Must not repeat paperLight consecutively');
});

test('Diagram QA: detects issues and applies bounded auto-repairs', () => {
  // Test 1: Too many nodes
  const crowdedClip = {
    id: 'clip_crowded',
    family: 'diagram',
    overlay: {
      grammar: DIAGRAM_GRAMMARS.FLOW,
      nodes: [
        { label: 'One' }, { label: 'Two' }, { label: 'Three' },
        { label: 'Four' }, { label: 'Five' }, { label: 'Six' }, { label: 'Seven' },
      ],
    },
  };

  const evalCrowded = evaluateDiagramQuality(crowdedClip, { format: 'shorts' });
  assert.ok(evalCrowded.issues.includes('too_many_nodes'), 'Must detect too_many_nodes in 9:16');
  assert.equal(evalCrowded.state, DIAGRAM_QUALITY_STATE.WEAK);

  const candidateReduce = evalCrowded.repairCandidates.find((c) => c.action === DIAGRAM_REPAIR_ACTIONS.REDUCE_NODES);
  assert.ok(candidateReduce, 'Must offer REDUCE_NODES candidate');

  const repairedClip = applyDiagramRepair(crowdedClip, candidateReduce, { format: 'shorts' });
  assert.ok(repairedClip.overlay.nodes.length <= 4, 'Repaired clip must prune nodes to format limit');

  // Test 2: Background repetition
  const bgClip = {
    id: 'clip_bg',
    family: 'diagram',
    overlay: {
      grammar: DIAGRAM_GRAMMARS.FLOW,
      backgroundMode: BACKGROUND_MODES.TECHNICAL_GRID,
      nodes: [{ label: 'A' }, { label: 'B' }],
    },
  };

  const evalBg = evaluateDiagramQuality(bgClip, {
    format: 'landscape',
    recentBackgrounds: [BACKGROUND_MODES.TECHNICAL_GRID],
  });
  assert.ok(evalBg.issues.includes('background_repetition'), 'Must detect background repetition');
  const bgCandidate = evalBg.repairCandidates.find((c) => c.action === DIAGRAM_REPAIR_ACTIONS.CHANGE_BACKGROUND);
  assert.ok(bgCandidate, 'Must propose CHANGE_BACKGROUND');

  const bgRepaired = applyDiagramRepair(bgClip, bgCandidate, { format: 'landscape' });
  assert.notEqual(bgRepaired.overlay.backgroundMode, BACKGROUND_MODES.TECHNICAL_GRID, 'Background must rotate');
});

test('Golden Reference Fixtures: all 6 fixtures compile and build valid diagnostics in 16:9 and 9:16', () => {
  const timelineMock = {
    clips: Object.values(GOLDEN_DIAGRAM_FIXTURES).map((fixture, idx) => ({
      id: `c_${idx}`,
      family: 'diagram',
      overlay: fixture,
    })),
  };

  const diagLandscape = buildDiagramQualityDiagnostics(timelineMock, { format: 'landscape' });
  assert.equal(diagLandscape.diagramCount, 6);
  assert.equal(diagLandscape.failedDiagramCount, 0, 'No golden fixture may fail QA');
  assert.ok(diagLandscape.grammarDistribution.COMPARISON >= 1);
  assert.ok(diagLandscape.grammarDistribution.CYCLE >= 1);
  assert.ok(diagLandscape.grammarDistribution.PIPELINE >= 1);
  assert.ok(diagLandscape.grammarDistribution.NETWORK >= 1);
  assert.ok(diagLandscape.grammarDistribution.HIERARCHY >= 1);
  assert.ok(diagLandscape.grammarDistribution.CAUSE_EFFECT >= 1);

  const diagShorts = buildDiagramQualityDiagnostics(timelineMock, { format: 'shorts' });
  assert.equal(diagShorts.diagramCount, 6);
  assert.equal(diagShorts.failedDiagramCount, 0, 'No golden fixture may fail QA in vertical shorts');
  assert.ok(diagShorts.verticalCoverageStats.averageRatio >= 0.45, 'Average vertical coverage must be >= 45%');
});
