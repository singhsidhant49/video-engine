import { SolvedSceneSchema } from '../../models/solvedScene.schema.js';
import { sceneElementMap } from '../sceneComposition.js';
import { fitMeasuredText, measureTextLayout } from './textMeasurement.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const box = (x, y, width, height) => ({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });

function childOf(elements, parentId, role) {
  return elements.find((element) => element.constraints.parentId === parentId && element.semanticRole === role);
}

function preliminaryWidths(groups, elementMap, region, ctx) {
  const minWidth = ctx.orientation === 'vertical' ? region.width : Math.round(region.width * 0.12);
  return groups.map((group) => {
    const label = childOf([...elementMap.values()], group.id, 'stage-label');
    const style = label.styleTokenRefs;
    const measured = measureTextLayout({
      text: label.content, fontFamily: style.fontFamily, fontWeight: Number(style.fontWeight) || 700,
      fontSize: ctx.orientation === 'vertical' ? 52 : 40, lineHeight: 1.1, maxWidth: region.width,
    });
    const importanceFactor = group.importance === 'primary' ? 1.14 : 1;
    return Math.max(minWidth, (measured.actualWidth + (ctx.orientation === 'vertical' ? 56 : 70)) * importanceFactor);
  });
}

function solveGroupBoxes(groups, elementMap, ctx, warnings) {
  const region = ctx.primaryVisualRegion;
  const desired = preliminaryWidths(groups, elementMap, region, ctx);
  if (ctx.orientation === 'vertical') {
    const gap = clamp(Math.round(region.height * 0.035), 22, 46);
    const available = region.height - gap * (groups.length - 1);
    const height = Math.floor(available / groups.length);
    return {
      topology: 'vertical',
      boxes: groups.map((group, index) => box(region.x, region.y + index * (height + gap), region.width, height)),
    };
  }

  const gap = clamp(Math.round(region.width * 0.018), 24, 42);
  const desiredTotal = desired.reduce((sum, width) => sum + width, 0) + gap * (groups.length - 1);
  if (desiredTotal <= region.width) {
    const extra = region.width - desiredTotal;
    const weights = groups.map((group) => group.importance === 'primary' ? 1.25 : 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let x = region.x;
    const height = Math.min(region.height, Math.round(region.height * 0.72));
    const y = region.y + Math.round((region.height - height) / 2);
    const boxes = groups.map((group, index) => {
      const width = desired[index] + extra * weights[index] / totalWeight;
      const result = box(x, y, width, height);
      x += width + gap;
      return result;
    });
    return { topology: 'horizontal', boxes };
  }

  warnings.push('horizontal_content_did_not_fit: switched to two-row landscape topology');
  const firstCount = Math.ceil(groups.length / 2);
  const rowGap = clamp(Math.round(region.height * 0.08), 38, 68);
  const rowHeight = Math.floor((region.height - rowGap) / 2);
  const boxes = [];
  for (let row = 0; row < 2; row++) {
    const start = row === 0 ? 0 : firstCount;
    const end = row === 0 ? firstCount : groups.length;
    const count = end - start;
    if (!count) continue;
    const localGap = gap;
    const usable = region.width - localGap * (count - 1);
    const rowDesired = desired.slice(start, end);
    const total = rowDesired.reduce((sum, value) => sum + value, 0);
    let x = region.x;
    for (let i = start; i < end; i++) {
      const width = usable * desired[i] / total;
      boxes[i] = box(x, region.y + row * (rowHeight + rowGap), width, rowHeight);
      x += width + localGap;
    }
  }
  return { topology: 'two-row', boxes };
}

function solveText(element, targetBox, ctx, options = {}) {
  const style = element.styleTokenRefs;
  const minFontSize = options.minFontSize || ctx.minimumTypeSize;
  const result = fitMeasuredText({
    text: element.content,
    fontFamily: String(style.fontFamily),
    fontWeight: Number(style.fontWeight) || 600,
    maxFontSize: options.maxFontSize,
    minFontSize,
    lineHeight: options.lineHeight,
    maxWidth: targetBox.width,
    maxHeight: targetBox.height,
    maxLines: options.maxLines,
  });
  return {
    elementId: element.id,
    fontFamily: String(style.fontFamily),
    fontWeight: Number(style.fontWeight) || 600,
    fontSize: result.fontSize,
    lineHeight: options.lineHeight,
    lineBreaks: result.lineBreaks,
    boxWidth: targetBox.width,
    boxHeight: targetBox.height,
    measuredWidth: result.actualWidth,
    measuredHeight: result.actualHeight,
    metricsSource: result.metricsSource,
    constraintUnsatisfied: result.constraintUnsatisfied,
    fitStatus: result.constraintUnsatisfied ? 'FAILED' : result.lineBreaks.length > 1 ? 'FIT_WITH_WRAP' : 'FIT',
    reductionTier: 'FULL',
  };
}

function routeConnectors(groups, solved, topology) {
  const routes = [];
  for (let i = 0; i < groups.length - 1; i++) {
    const from = solved[groups[i].id], to = solved[groups[i + 1].id];
    let type = 'straight', points, startAnchor, endAnchor;
    if (topology === 'horizontal' || (topology === 'two-row' && Math.abs(from.y - to.y) < 2)) {
      startAnchor = 'right'; endAnchor = 'left';
      points = [{ x: from.x + from.width, y: from.y + from.height / 2 }, { x: to.x, y: to.y + to.height / 2 }];
    } else if (topology === 'vertical') {
      startAnchor = 'bottom'; endAnchor = 'top';
      points = [{ x: from.x + from.width / 2, y: from.y + from.height }, { x: to.x + to.width / 2, y: to.y }];
    } else {
      type = 'elbow'; startAnchor = 'bottom'; endAnchor = 'left';
      const start = { x: from.x + from.width / 2, y: from.y + from.height };
      const end = { x: to.x, y: to.y + to.height / 2 };
      const midY = (start.y + end.y) / 2;
      points = [start, { x: start.x, y: midY }, { x: end.x - 18, y: midY }, { x: end.x - 18, y: end.y }, end];
    }
    const pathData = points.map((point, index) => `${index ? 'L' : 'M'} ${Math.round(point.x)} ${Math.round(point.y)}`).join(' ');
    routes.push({ id: `connector_${i + 1}`, from: groups[i].id, to: groups[i + 1].id, type, points, pathData, startAnchor, endAnchor });
  }
  return routes;
}

function occupancyFor(groupBoxes, region) {
  const minX = Math.min(...groupBoxes.map((item) => item.x));
  const minY = Math.min(...groupBoxes.map((item) => item.y));
  const maxX = Math.max(...groupBoxes.map((item) => item.x + item.width));
  const maxY = Math.max(...groupBoxes.map((item) => item.y + item.height));
  const bounds = box(minX, minY, maxX - minX, maxY - minY);
  return { ratio: Number(((bounds.width * bounds.height) / (region.width * region.height)).toFixed(3)), bounds };
}

export function solveProcessLayout(composition, ctx, { repairHistory = [] } = {}) {
  const elementMap = sceneElementMap(composition);
  const groups = composition.readingOrder.map((id) => elementMap.get(id)).filter(Boolean);
  const warnings = [];
  const constraintUnsatisfied = [];
  const { topology, boxes: groupBoxes } = solveGroupBoxes(groups, elementMap, ctx, warnings);
  const solved = {};
  const textLayout = {};

  const title = elementMap.get('process_title');
  const titleBox = box(ctx.titleRegion.x, ctx.titleRegion.y, ctx.titleRegion.width, ctx.titleRegion.height);
  const titleLayout = solveText(title, titleBox, ctx, { maxFontSize: ctx.orientation === 'vertical' ? 42 : 30, minFontSize: 22, lineHeight: 1.05, maxLines: 1 });
  textLayout[title.id] = titleLayout;
  solved[title.id] = { ...title, ...titleBox, zIndex: 5, parentId: null };
  if (titleLayout.constraintUnsatisfied) constraintUnsatisfied.push({ elementId: title.id, constraint: 'textFit', detail: 'Title does not fit its reserved region' });

  groups.forEach((group, index) => {
    const groupBox = groupBoxes[index];
    const paddingX = ctx.orientation === 'vertical' ? 34 : 26;
    const paddingY = ctx.orientation === 'vertical' ? 22 : 20;
    const label = childOf([...elementMap.values()], group.id, 'stage-label');
    const support = childOf([...elementMap.values()], group.id, 'stage-support');
    const shape = childOf([...elementMap.values()], group.id, 'stage-container');
    const inner = box(groupBox.x + paddingX, groupBox.y + paddingY, Math.max(1, groupBox.width - paddingX * 2), Math.max(1, groupBox.height - paddingY * 2));
    const labelHeight = support ? Math.round(inner.height * 0.55) : inner.height;
    const labelBox = box(inner.x, inner.y, inner.width, labelHeight);
    const supportBox = support ? box(inner.x, inner.y + labelHeight + 4, inner.width, Math.max(1, inner.height - labelHeight - 4)) : null;
    const labelLayout = solveText(label, labelBox, ctx, {
      maxFontSize: ctx.orientation === 'vertical' ? 58 : (group.importance === 'primary' ? 46 : 41),
      minFontSize: ctx.minimumTypeSize,
      lineHeight: 1.08,
      maxLines: 2,
    });
    textLayout[label.id] = labelLayout;
    if (labelLayout.constraintUnsatisfied) constraintUnsatisfied.push({ elementId: label.id, constraint: 'textFit', detail: `Stage label cannot fit above ${ctx.minimumTypeSize}px` });
    solved[group.id] = {
      ...group, ...groupBox, zIndex: 2, parentId: null,
      anchors: {
        left: { x: groupBox.x, y: groupBox.y + groupBox.height / 2 }, right: { x: groupBox.x + groupBox.width, y: groupBox.y + groupBox.height / 2 },
        top: { x: groupBox.x + groupBox.width / 2, y: groupBox.y }, bottom: { x: groupBox.x + groupBox.width / 2, y: groupBox.y + groupBox.height },
      },
    };
    solved[shape.id] = { ...shape, ...groupBox, zIndex: 1, parentId: group.id };
    solved[label.id] = { ...label, ...labelBox, zIndex: 3, parentId: group.id };
    if (support) {
      const supportLayout = solveText(support, supportBox, ctx, {
        maxFontSize: ctx.orientation === 'vertical' ? 34 : 27,
        minFontSize: Math.max(20, ctx.minimumTypeSize * 0.72),
        lineHeight: 1.22,
        maxLines: 2,
      });
      textLayout[support.id] = supportLayout;
      solved[support.id] = { ...support, ...supportBox, zIndex: 3, parentId: group.id };
      if (supportLayout.constraintUnsatisfied) constraintUnsatisfied.push({ elementId: support.id, constraint: 'textFit', detail: 'Support text requires reduction' });
    }
  });

  const connectorRoutes = routeConnectors(groups, solved, topology);
  for (const route of connectorRoutes) {
    const xs = route.points.map((point) => point.x), ys = route.points.map((point) => point.y);
    const routeBox = box(Math.min(...xs), Math.min(...ys), Math.max(1, Math.max(...xs) - Math.min(...xs)), Math.max(1, Math.max(...ys) - Math.min(...ys)));
    solved[route.id] = {
      id: route.id, kind: 'connector', semanticRole: 'stage-connector', importance: 'structural', content: null,
      intrinsic: {}, constraints: { protected: false }, styleTokenRefs: { stroke: 'accent' }, ...routeBox, zIndex: 0, parentId: null,
    };
  }

  const hierarchyFor = (element) => {
    const tier = element.importance === 'primary' ? 'PRIMARY' : element.importance === 'secondary' ? 'SECONDARY'
      : element.importance === 'supporting' ? 'SUPPORTING' : 'DECORATIVE';
    const roleBoost = ['stage-label', 'process-stage'].includes(element.semanticRole) ? 0.12 : 0;
    const base = { PRIMARY: 0.82, SECONDARY: 0.62, SUPPORTING: 0.42, DECORATIVE: 0.2 }[tier];
    return { tier, visualWeight: Math.min(1, base + roleBoost), reasons: [`importance:${element.importance}`, `role:${element.semanticRole}`] };
  };
  const solvedWithHierarchy = Object.fromEntries(Object.entries(solved).map(([id, element]) => [id, { ...element, visualHierarchy: hierarchyFor(element) }]));
  const output = {
    version: 1,
    id: `solved_${composition.shotId}_${ctx.format}`,
    shotId: composition.shotId,
    format: ctx.format,
    viewport: ctx.viewport,
    topology,
    elements: solvedWithHierarchy,
    connectorRoutes,
    textLayout,
    occupancy: occupancyFor(groupBoxes, ctx.primaryVisualRegion),
    constraintsSatisfied: constraintUnsatisfied.length === 0,
    warnings,
    constraintUnsatisfied,
    repairHistory,
    regions: { title: ctx.titleRegion, primary: ctx.primaryVisualRegion, captions: ctx.captionRegion },
    chartCoordinateSystem: null,
    annotationGeometry: {},
    captionBox: ctx.captionRegion,
    backgroundSelection: 'technicalGrid',
    formatPolicy: { orientation: ctx.orientation, interactionSafeApplied: ctx.format === 'shorts', maximumConcepts: ctx.format === 'shorts' ? 4 : 6, maximumTicks: ctx.format === 'shorts' ? 4 : 6 },
    complexity: { ...composition.complexityBudget, withinBudget: composition.complexityBudget.supportElements <= (composition.complexityBudget.level === 'LOW' ? 1 : composition.complexityBudget.level === 'MEDIUM' ? 3 : 5) },
  };
  return SolvedSceneSchema.parse(output);
}

export function solveProcessLayoutWithRepairs(composition, ctx, { maxPasses = 2 } = {}) {
  let candidate = composition;
  const history = [];
  for (let pass = 0; pass <= maxPasses; pass++) {
    const solved = solveProcessLayout(candidate, ctx, { repairHistory: history });
    if (solved.constraintsSatisfied) return { composition: candidate, solvedScene: solved };
    if (pass === maxPasses) return { composition: candidate, solvedScene: solved };
    const supportFailures = solved.constraintUnsatisfied.filter((item) => item.elementId.endsWith('_support'));
    if (supportFailures.length) {
      candidate = {
        ...candidate,
        elements: candidate.elements.map((element) => supportFailures.some((failure) => failure.elementId === element.id)
          ? { ...element, content: String(element.content).split(/[.;:]/)[0].split(/\s+/).slice(0, 8).join(' ') }
          : element),
      };
      history.push({ pass: pass + 1, action: 'REDUCE_SUPPORT_TEXT', reason: 'Support text exceeded measured bounds' });
    } else {
      history.push({ pass: pass + 1, action: ctx.orientation === 'vertical' ? 'INCREASE_STAGE_GAP' : 'SWITCH_TO_TWO_ROW_LANDSCAPE', reason: 'Measured stage labels did not fit' });
      // The deterministic solver already chooses the largest safe topology/type.
    }
  }
  throw new Error('unreachable');
}
