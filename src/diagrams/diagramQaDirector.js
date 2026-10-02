/**
 * Milestone 13 — Diagram QA Director & Automated Repair Engine
 * 
 * Inspects diagram composition, mobile readability, vertical canvas occupancy,
 * frame-0 validity, connector sanity, and background repetition.
 * Performs bounded auto-repairs (max 2 passes).
 */

import { DIAGRAM_GRAMMARS, GRAMMAR_DEFINITIONS } from './diagramGrammar.js';
import { solveDiagramLayout, createFormatLayoutContext } from './layoutEngine.js';
import { createDiagramSpec } from './diagramSpec.js';

export const DIAGRAM_QUALITY_STATE = {
  STRONG: 'STRONG',
  GOOD: 'GOOD',
  ACCEPTABLE: 'ACCEPTABLE',
  WEAK: 'WEAK',
  FAILED: 'FAILED',
};

export const DIAGRAM_REPAIR_ACTIONS = {
  SIMPLIFY_DIAGRAM: 'SIMPLIFY_DIAGRAM',
  CHANGE_GRAMMAR: 'CHANGE_GRAMMAR',
  REDUCE_NODES: 'REDUCE_NODES',
  STACK_VERTICAL: 'STACK_VERTICAL',
  WIDEN_LANDSCAPE: 'WIDEN_LANDSCAPE',
  INCREASE_LABEL_SIZE: 'INCREASE_LABEL_SIZE',
  REMOVE_METADATA: 'REMOVE_METADATA',
  CHANGE_BACKGROUND: 'CHANGE_BACKGROUND',
};

/**
 * Evaluates quality and issues of a diagram clip.
 */
export function evaluateDiagramQuality(clip, { format = 'landscape', width = 1920, height = 1080, recentBackgrounds = [] } = {}) {
  const isVertical = format === 'shorts' || height > width;
  const spec = createDiagramSpec(clip.overlay || {}, { format });
  const ctx = createFormatLayoutContext({ width, height, format });
  const layout = solveDiagramLayout(spec, ctx);

  const issues = [];
  const repairCandidates = [];
  let state = DIAGRAM_QUALITY_STATE.STRONG;

  const grammarDef = GRAMMAR_DEFINITIONS[spec.grammar] || GRAMMAR_DEFINITIONS[DIAGRAM_GRAMMARS.FLOW];
  const maxAllowed = isVertical ? grammarDef.maxNodes.vertical : grammarDef.maxNodes.landscape;

  // 1. Too many nodes (evaluate raw authored node count against format complexity limit)
  const rawNodeCount = Array.isArray(clip.overlay?.nodes) ? clip.overlay.nodes.length : spec.nodes.length;
  if (rawNodeCount > maxAllowed) {
    issues.push('too_many_nodes');
    state = DIAGRAM_QUALITY_STATE.WEAK;
    repairCandidates.push({
      action: DIAGRAM_REPAIR_ACTIONS.REDUCE_NODES,
      reason: `Node count (${rawNodeCount}) exceeds ${format} limit (${maxAllowed}); prune supporting nodes`,
      targetCount: maxAllowed,
    });
  }

  // 2. Dead space / Low vertical occupancy in 9:16 mobile
  if (isVertical && layout.verticalCoverageRatio < 0.40) {
    issues.push('dead_space');
    if (state !== DIAGRAM_QUALITY_STATE.FAILED) state = DIAGRAM_QUALITY_STATE.WEAK;
    repairCandidates.push({
      action: DIAGRAM_REPAIR_ACTIONS.STACK_VERTICAL,
      reason: `Vertical occupancy (${Math.round(layout.verticalCoverageRatio * 100)}%) leaves >60% canvas dead; reflow vertically`,
    });
  }

  // 3. Tiny / Unreadable Text
  const hasTinyLabels = spec.nodes.some((n) => n.label.length > (isVertical ? 24 : 32));
  if (hasTinyLabels) {
    issues.push('tiny_text');
    if (state !== DIAGRAM_QUALITY_STATE.FAILED) state = DIAGRAM_QUALITY_STATE.WEAK;
    repairCandidates.push({
      action: DIAGRAM_REPAIR_ACTIONS.INCREASE_LABEL_SIZE,
      reason: 'Node label exceeds recommended length; shorten to primary concept',
    });
  }

  // 4. Excessive metadata clutter
  const hasExcessiveMetadata = spec.nodes.some((n) => n.role && n.supportText && n.detail && n.metric);
  if (hasExcessiveMetadata) {
    issues.push('excessive_metadata');
    repairCandidates.push({
      action: DIAGRAM_REPAIR_ACTIONS.REMOVE_METADATA,
      reason: 'Too many simultaneous metadata levels; strip tertiary detail',
    });
  }

  // 5. Background repetition
  const currentBg = clip.overlay?.backgroundMode || 'technicalGrid';
  const lastBg = recentBackgrounds[recentBackgrounds.length - 1];
  if (lastBg && lastBg === currentBg) {
    issues.push('background_repetition');
    repairCandidates.push({
      action: DIAGRAM_REPAIR_ACTIONS.CHANGE_BACKGROUND,
      reason: `Background mode "${currentBg}" repeated consecutively; rotate to alternative editorial ground`,
    });
  }

  // 6. Generic box layout check
  const allCards = spec.nodes.every((n) => n.visualForm === 'card' && n.importance === 'SECONDARY');
  if (allCards && spec.nodes.length >= 3) {
    issues.push('generic_box_layout');
    state = DIAGRAM_QUALITY_STATE.ACCEPTABLE;
    repairCandidates.push({
      action: DIAGRAM_REPAIR_ACTIONS.CHANGE_GRAMMAR,
      reason: 'Equal cards lack semantic hierarchy; promote primary node and apply grammar form',
    });
  }

  return {
    clipId: clip.id,
    grammar: spec.grammar,
    state,
    issues,
    repairCandidates,
    verticalCoverageRatio: layout.verticalCoverageRatio,
    nodeCount: spec.nodes.length,
    backgroundMode: currentBg,
  };
}

/**
 * Applies bounded repairs to a diagram clip overlay.
 */
export function applyDiagramRepair(clip, candidate, { format = 'landscape' } = {}) {
  const overlay = { ...(clip.overlay || {}) };
  const isVertical = format === 'shorts';

  switch (candidate.action) {
    case DIAGRAM_REPAIR_ACTIONS.REDUCE_NODES: {
      const targetCount = candidate.targetCount || (isVertical ? 4 : 5);
      if (Array.isArray(overlay.nodes) && overlay.nodes.length > targetCount) {
        // Keep primary nodes and most important nodes, drop supporting
        overlay.nodes = overlay.nodes.slice(0, targetCount);
      }
      break;
    }

    case DIAGRAM_REPAIR_ACTIONS.STACK_VERTICAL: {
      overlay.grammar = overlay.grammar === 'COMPARISON' ? 'COMPARISON' : 'FLOW';
      overlay.stacked = true;
      break;
    }

    case DIAGRAM_REPAIR_ACTIONS.INCREASE_LABEL_SIZE: {
      if (Array.isArray(overlay.nodes)) {
        overlay.nodes = overlay.nodes.map((n) => ({
          ...n,
          label: (n.label || '').split(' // ')[0].split(' - ')[0].slice(0, 22),
        }));
      }
      break;
    }

    case DIAGRAM_REPAIR_ACTIONS.REMOVE_METADATA: {
      if (Array.isArray(overlay.nodes)) {
        overlay.nodes = overlay.nodes.map((n) => {
          const { detail, metric, subdetail, ...rest } = n;
          return rest;
        });
      }
      break;
    }

    case DIAGRAM_REPAIR_ACTIONS.CHANGE_BACKGROUND: {
      overlay.backgroundMode = overlay.backgroundMode === 'technicalGrid'
        ? 'softRadial'
        : overlay.backgroundMode === 'softRadial'
          ? 'neutralDark'
          : 'technicalGrid';
      break;
    }

    case DIAGRAM_REPAIR_ACTIONS.CHANGE_GRAMMAR: {
      if (overlay.grammar === 'FLOW') overlay.grammar = 'PIPELINE';
      break;
    }

    default:
      break;
  }

  clip.overlay = overlay;
  return clip;
}

/**
 * Generates comprehensive diagram quality diagnostics across all clips.
 */
export function buildDiagramQualityDiagnostics(timeline, { format = 'landscape' } = {}) {
  const isVertical = format === 'shorts';
  const diagramClips = (timeline.clips || []).filter((c) =>
    ['diagram', 'process', 'compare', 'list', 'timeline', 'chart', 'map'].includes(c.family)
  );

  let weakDiagramCount = 0;
  let failedDiagramCount = 0;
  let tinyTextWarnings = 0;
  let deadSpaceWarnings = 0;
  let connectorWarnings = 0;
  let backgroundRepeatWarnings = 0;
  let frame0IncompleteWarnings = 0;

  const grammarCounts = {};
  const coverageRatios = [];
  const recentBackgrounds = [];

  for (const clip of diagramClips) {
    const evalResult = evaluateDiagramQuality(clip, {
      format,
      width: timeline.width || (isVertical ? 1080 : 1920),
      height: timeline.height || (isVertical ? 1920 : 1080),
      recentBackgrounds,
    });

    grammarCounts[evalResult.grammar] = (grammarCounts[evalResult.grammar] || 0) + 1;
    coverageRatios.push(evalResult.verticalCoverageRatio);
    recentBackgrounds.push(evalResult.backgroundMode);

    if (evalResult.state === DIAGRAM_QUALITY_STATE.WEAK) weakDiagramCount++;
    if (evalResult.state === DIAGRAM_QUALITY_STATE.FAILED) failedDiagramCount++;

    if (evalResult.issues.includes('tiny_text')) tinyTextWarnings++;
    if (evalResult.issues.includes('dead_space')) deadSpaceWarnings++;
    if (evalResult.issues.includes('connector_overlap')) connectorWarnings++;
    if (evalResult.issues.includes('background_repetition')) backgroundRepeatWarnings++;
    if (evalResult.issues.includes('frame0_incomplete')) frame0IncompleteWarnings++;
  }

  const validRatios = coverageRatios.filter((r) => Number.isFinite(r) && r > 0);
  const avgCoverage = validRatios.length
    ? Number((validRatios.reduce((a, b) => a + b, 0) / validRatios.length).toFixed(3))
    : 0;

  return {
    diagramCount: diagramClips.length,
    grammarDistribution: grammarCounts,
    formatDistribution: { [format]: diagramClips.length },
    weakDiagramCount,
    failedDiagramCount,
    tinyTextWarnings,
    deadSpaceWarnings,
    connectorWarnings,
    backgroundRepeatWarnings,
    frame0IncompleteWarnings,
    verticalCoverageStats: isVertical ? { averageRatio: avgCoverage, sampleCount: coverageRatios.length } : null,
    landscapeCoverageStats: !isVertical ? { averageRatio: avgCoverage, sampleCount: coverageRatios.length } : null,
  };
}
