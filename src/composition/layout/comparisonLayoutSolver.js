import { SolvedSceneSchema } from '../../models/solvedScene.schema.js';
import { sceneElementMap } from '../sceneComposition.js';
import { addSolvedElement, box, clamp, occupancyFrom, solveTextElement } from './solvedHelpers.js';
import { measureTextLayout } from './textMeasurement.js';

const children = (elements, parentId) => elements.filter((element) => element.constraints.parentId === parentId);

function desiredSideWeight(sideId, elements, ctx) {
  const sideChildren = children(elements, sideId).filter((element) => ['comparison-label', 'comparison-description', 'comparison-dimension'].includes(element.semanticRole));
  return sideChildren.reduce((total, element) => {
    const measured = measureTextLayout({ text: String(element.content), fontFamily: String(element.styleTokenRefs.fontFamily), fontWeight: Number(element.styleTokenRefs.fontWeight) || 600, fontSize: 30, lineHeight: 1.15, maxWidth: ctx.primaryVisualRegion.width });
    return total + measured.actualWidth + measured.actualHeight * 1.8;
  }, 1);
}

function solveRegions(composition, ctx, forcedGrammar = null) {
  const root = composition.elements.find((element) => element.id === 'comparison_root');
  let grammar = forcedGrammar || root.content.grammar;
  if (ctx.orientation === 'vertical') grammar = 'STACKED_VERTICAL';
  const region = ctx.primaryVisualRegion;
  const differenceHeight = Math.round(region.height * (ctx.orientation === 'vertical' ? 0.16 : 0.19));
  const compareRegion = box(region.x, region.y, region.width, region.height - differenceHeight - ctx.spacingScale.md);
  const difference = box(region.x, compareRegion.y + compareRegion.height + ctx.spacingScale.md, region.width, differenceHeight);
  if (grammar === 'STACKED_VERTICAL') {
    const gap = Math.max(ctx.spacingScale.lg, Math.round(compareRegion.height * 0.06));
    const available = compareRegion.height - gap;
    const sideA = box(compareRegion.x, compareRegion.y, compareRegion.width, available * 0.47);
    const sideB = box(compareRegion.x, sideA.y + sideA.height + gap, compareRegion.width, available - sideA.height);
    return { grammar, sideA, sideB, divider: box(compareRegion.x, sideA.y + sideA.height, compareRegion.width, gap), difference };
  }
  if (grammar === 'SPECTRUM' || grammar === 'SHARED_BASELINE') {
    const labelHeight = Math.round(compareRegion.height * 0.72);
    return {
      grammar,
      sideA: box(compareRegion.x, compareRegion.y, compareRegion.width * 0.44, labelHeight),
      sideB: box(compareRegion.x + compareRegion.width * 0.56, compareRegion.y, compareRegion.width * 0.44, labelHeight),
      divider: box(compareRegion.x + compareRegion.width * 0.08, compareRegion.y + labelHeight + ctx.spacingScale.sm, compareRegion.width * 0.84, ctx.spacingScale.sm),
      difference,
    };
  }
  const elementMap = sceneElementMap(composition), all = [...elementMap.values()];
  const aWeight = desiredSideWeight('comparison_side_a', all, ctx), bWeight = desiredSideWeight('comparison_side_b', all, ctx);
  const ratio = clamp(aWeight / (aWeight + bWeight), 0.40, 0.60);
  const gap = Math.max(ctx.spacingScale.xl, Math.round(compareRegion.width * 0.055));
  const usable = compareRegion.width - gap;
  const sideA = box(compareRegion.x, compareRegion.y, usable * ratio, compareRegion.height);
  const sideB = box(sideA.x + sideA.width + gap, compareRegion.y, usable - sideA.width, compareRegion.height);
  return { grammar, sideA, sideB, divider: box(sideA.x + sideA.width, compareRegion.y, gap, compareRegion.height), difference };
}

function solveSide(group, sideBox, elements, ctx, solved, textLayout, failures) {
  addSolvedElement(solved, group, sideBox, ctx, 2);
  const field = elements.find((element) => element.constraints.parentId === group.id && element.semanticRole === 'comparison-field');
  addSolvedElement(solved, field, sideBox, ctx, 1);
  const padding = ctx.orientation === 'vertical' ? ctx.spacingScale.lg : ctx.spacingScale.md;
  const inner = box(sideBox.x + padding, sideBox.y + padding, sideBox.width - padding * 2, sideBox.height - padding * 2);
  const label = elements.find((element) => element.constraints.parentId === group.id && element.semanticRole === 'comparison-label');
  const description = elements.find((element) => element.constraints.parentId === group.id && element.semanticRole === 'comparison-description');
  const metric = elements.find((element) => element.constraints.parentId === group.id && element.semanticRole === 'comparison-metric');
  const dimensions = elements.filter((element) => element.constraints.parentId === group.id && element.semanticRole === 'comparison-dimension');
  let cursor = inner.y;
  const labelHeight = Math.round(inner.height * 0.26);
  const labelResult = solveTextElement(label, box(inner.x, cursor, inner.width, labelHeight), ctx, { maxFontSize: ctx.orientation === 'vertical' ? 54 : 48, minFontSize: ctx.typeMinimums.primary, maxLines: 2, lineHeight: 1.04 });
  solved[label.id] = labelResult.element; textLayout[label.id] = labelResult.layout; cursor += labelHeight + ctx.spacingScale.sm;
  if (metric) {
    const metricHeight = Math.round(inner.height * 0.22);
    const metricResult = solveTextElement(metric, box(inner.x, cursor, inner.width, metricHeight), ctx, { maxFontSize: ctx.orientation === 'vertical' ? 64 : 58, minFontSize: ctx.typeMinimums.primary, maxLines: 1, lineHeight: 1 });
    solved[metric.id] = metricResult.element; textLayout[metric.id] = metricResult.layout; cursor += metricHeight + ctx.spacingScale.sm;
  }
  const dimensionHeight = dimensions.length ? Math.round(inner.height * 0.12) : 0;
  const remaining = inner.y + inner.height - cursor - dimensions.length * dimensionHeight;
  const descriptionResult = solveTextElement(description, box(inner.x, cursor, inner.width, Math.max(ctx.spacingScale.lg, remaining)), ctx, { maxFontSize: ctx.orientation === 'vertical' ? 34 : 29, minFontSize: ctx.typeMinimums.supporting, maxLines: 3, lineHeight: 1.2 });
  solved[description.id] = descriptionResult.element; textLayout[description.id] = descriptionResult.layout; cursor += Math.max(ctx.spacingScale.lg, remaining);
  dimensions.forEach((dimension) => {
    const result = solveTextElement(dimension, box(inner.x, cursor, inner.width, dimensionHeight), ctx, { maxFontSize: 24, minFontSize: ctx.typeMinimums.source, maxLines: 1, lineHeight: 1.1 });
    solved[dimension.id] = result.element; textLayout[dimension.id] = result.layout; cursor += dimensionHeight;
  });
  Object.values(textLayout).filter((layout) => layout.elementId.startsWith(group.id) && layout.constraintUnsatisfied)
    .forEach((layout) => failures.push({ elementId: layout.elementId, constraint: 'textFit', detail: `${layout.fitStatus} after semantic reduction` }));
}

export function solveComparisonLayout(composition, ctx, { forcedGrammar = null, repairHistory = [] } = {}) {
  const elements = composition.elements, elementMap = sceneElementMap(composition);
  const layout = solveRegions(composition, ctx, forcedGrammar);
  const solved = {}, textLayout = {}, failures = [], warnings = [];
  const title = elementMap.get('comparison_title');
  const titleResult = solveTextElement(title, box(ctx.titleRegion.x, ctx.titleRegion.y, ctx.titleRegion.width, ctx.titleRegion.height), ctx, { maxFontSize: ctx.orientation === 'vertical' ? 38 : 30, minFontSize: ctx.typeMinimums.source, maxLines: 1, lineHeight: 1 });
  solved[title.id] = titleResult.element; textLayout[title.id] = titleResult.layout;
  solveSide(elementMap.get('comparison_side_a'), layout.sideA, elements, ctx, solved, textLayout, failures);
  solveSide(elementMap.get('comparison_side_b'), layout.sideB, elements, ctx, solved, textLayout, failures);
  addSolvedElement(solved, elementMap.get('comparison_root'), box(ctx.primaryVisualRegion.x, ctx.primaryVisualRegion.y, ctx.primaryVisualRegion.width, ctx.primaryVisualRegion.height), ctx, 0);
  addSolvedElement(solved, elementMap.get('comparison_divider'), layout.divider, ctx, 2);
  const difference = elementMap.get('comparison_difference');
  const differenceResult = solveTextElement(difference, layout.difference, ctx, { maxFontSize: ctx.orientation === 'vertical' ? 34 : 28, minFontSize: ctx.typeMinimums.secondary, maxLines: 2, lineHeight: 1.15, zIndex: 4 });
  solved[difference.id] = differenceResult.element; textLayout[difference.id] = differenceResult.layout;
  if (differenceResult.layout.constraintUnsatisfied) failures.push({ elementId: difference.id, constraint: 'textFit', detail: `${differenceResult.layout.fitStatus} after semantic reduction` });
  const weightA = solved.comparison_side_a.visualHierarchy.visualWeight, weightB = solved.comparison_side_b.visualHierarchy.visualWeight;
  if (Math.abs(weightA - weightB) > 0.3) warnings.push('unbalanced_visual_weight');
  const output = {
    version: 1, id: `solved_${composition.shotId}_${ctx.format}`, shotId: composition.shotId, format: ctx.format,
    viewport: ctx.viewport, topology: ({ DUAL_FIELD: 'dual-field', SHARED_BASELINE: 'shared-baseline', SPECTRUM: 'spectrum', BEFORE_AFTER: 'before-after', TWO_COLUMN_EDITORIAL: 'two-column-editorial', STACKED_VERTICAL: 'stacked-vertical', DELTA_COMPARISON: 'delta-comparison' })[layout.grammar],
    elements: solved, connectorRoutes: [], textLayout,
    occupancy: occupancyFrom(solved, ctx.primaryVisualRegion, (element) => element.id !== 'comparison_root'),
    constraintsSatisfied: failures.length === 0, warnings, constraintUnsatisfied: failures, repairHistory,
    regions: { title: ctx.titleRegion, primary: ctx.primaryVisualRegion, captions: ctx.captionRegion },
    chartCoordinateSystem: null,
    annotationGeometry: {},
    captionBox: ctx.captionRegion, backgroundSelection: 'softRadial',
    formatPolicy: { orientation: ctx.orientation, interactionSafeApplied: ctx.format === 'shorts', maximumConcepts: ctx.format === 'shorts' ? 2 : 4, maximumTicks: 0 },
    complexity: { ...composition.complexityBudget, withinBudget: composition.complexityBudget.supportElements <= (composition.complexityBudget.level === 'HIGH' ? 5 : 3) },
  };
  return SolvedSceneSchema.parse(output);
}

export function solveComparisonLayoutWithRepairs(composition, ctx, { maxPasses = 2 } = {}) {
  const history = [];
  let grammar = null;
  for (let pass = 0; pass <= maxPasses; pass++) {
    const solvedScene = solveComparisonLayout(composition, ctx, { forcedGrammar: grammar, repairHistory: history });
    if (solvedScene.constraintsSatisfied) return { composition, solvedScene };
    if (pass === maxPasses) return { composition, solvedScene };
    if (ctx.orientation === 'landscape' && solvedScene.topology !== 'stacked-vertical') {
      grammar = 'STACKED_VERTICAL';
      history.push({ pass: pass + 1, action: 'SWITCH_COMPARISON_GRAMMAR', reason: 'Measured text did not fit the wide grammar after FULL/SHORT/LABEL_ONLY reduction' });
    } else {
      history.push({ pass: pass + 1, action: 'SIMPLIFY_COMPARISON', reason: 'Semantic reduction tiers exhausted' });
    }
  }
  throw new Error('unreachable');
}
