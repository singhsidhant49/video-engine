import { SolvedSceneSchema } from '../../models/solvedScene.schema.js';
import { sceneElementMap } from '../sceneComposition.js';
import { addSolvedElement, box, clamp, occupancyFrom, solveTextElement, hierarchyFor } from './solvedHelpers.js';
import { categoricalScale, formatChartValue, linearScale, linearTicks, validateChartData } from '../chartScales.js';
import { measureTextLayout } from './textMeasurement.js';

function chartRegions(ctx) {
  const region = ctx.primaryVisualRegion;
  if (ctx.orientation === 'vertical') {
    const takeawayHeight = Math.round(region.height * 0.17);
    return {
      plotOuter: box(region.x, region.y, region.width, region.height - takeawayHeight - ctx.spacingScale.lg),
      takeaway: box(region.x, region.y + region.height - takeawayHeight, region.width, takeawayHeight),
    };
  }
  const takeawayWidth = Math.round(region.width * 0.25);
  return {
    plotOuter: box(region.x, region.y, region.width - takeawayWidth - ctx.spacingScale.xl, region.height),
    takeaway: box(region.x + region.width - takeawayWidth, region.y + region.height * 0.12, takeawayWidth, region.height * 0.62),
  };
}

function selectVisibleIndexes(count, maximum) {
  if (count <= maximum) return new Set(Array.from({ length: count }, (_, index) => index));
  const indexes = new Set([0, count - 1]);
  for (let slot = 1; slot < maximum - 1; slot++) indexes.add(Math.round(slot * (count - 1) / (maximum - 1)));
  return indexes;
}

function axisModel(chartSpec, plot, ctx, tickLimit) {
  const data = chartSpec.series.flatMap((series) => series.data);
  const values = data.map((datum) => datum.y);
  const minValue = Math.min(...values), maxValue = Math.max(...values);
  const isMagnitude = ['BAR', 'DOT', 'PROGRESS', 'SIMPLE_STACK'].includes(chartSpec.chartType);
  let yMin = isMagnitude ? Math.min(0, minValue) : minValue;
  let yMax = isMagnitude ? Math.max(0, maxValue) : maxValue;
  if (yMin === yMax) { const pad = Math.abs(yMin || 1) * 0.15; yMin -= pad; yMax += pad; }
  if (!isMagnitude) { const pad = (yMax - yMin) * 0.08; yMin -= pad; yMax += pad; }
  const verticalScale = linearScale([yMin, yMax], [plot.y + plot.height, plot.y]);
  const categories = chartSpec.series[0].data.map((datum) => datum.x);
  const horizontalCategorical = categoricalScale(categories, [plot.x, plot.x + plot.width], ctx.orientation === 'vertical' ? 0.26 : 0.2);
  const horizontalBars = chartSpec.chartType === 'BAR' && ctx.orientation === 'vertical';
  if (horizontalBars) {
    const valueScale = linearScale([yMin, yMax], [plot.x, plot.x + plot.width]);
    const categoryScale = categoricalScale(categories, [plot.y, plot.y + plot.height], 0.3);
    let valueTicks = linearTicks(valueScale.domain, tickLimit);
    if (valueTicks.length > tickLimit) {
      const visible = selectVisibleIndexes(valueTicks.length, tickLimit);
      valueTicks = valueTicks.filter((_, index) => visible.has(index));
    }
    const categoryVisible = selectVisibleIndexes(categories.length, tickLimit);
    return {
      verticalScale, horizontalCategorical, horizontalLinear: null,
      coordinate: {
        plot,
        x: { scaleType: 'linear', domain: valueScale.domain, range: valueScale.range, ticks: valueTicks.map((value) => ({ value, position: valueScale(value), label: formatChartValue(value, chartSpec.units) })), baseline: plot.y + plot.height },
        y: { scaleType: 'categorical', domain: categoryScale.domain, range: categoryScale.range, ticks: categories.map((value, index) => ({ value, position: categoryScale(value) + categoryScale.bandwidth / 2, label: String(value), index })).filter((tick) => categoryVisible.has(tick.index)).map(({ value, position, label }) => ({ value, position, label })), baseline: valueScale(0) },
      },
    };
  }
  const horizontalLinear = typeof categories[0] === 'number'
    ? linearScale([Math.min(...categories), Math.max(...categories)], [plot.x, plot.x + plot.width]) : null;
  let yTicks = linearTicks(verticalScale.domain, tickLimit);
  if (yTicks.length > tickLimit) yTicks = selectVisibleIndexes(yTicks.length, tickLimit).size
    ? yTicks.filter((_, index) => selectVisibleIndexes(yTicks.length, tickLimit).has(index)) : yTicks;
  const xVisible = selectVisibleIndexes(categories.length, tickLimit);
  const xTicks = categories.map((value, index) => ({ value, position: horizontalLinear ? horizontalLinear(Number(value)) : horizontalCategorical(value) + horizontalCategorical.bandwidth / 2, label: String(value), index })).filter((tick) => xVisible.has(tick.index));
  return {
    verticalScale, horizontalCategorical, horizontalLinear,
    coordinate: {
      plot,
      x: { scaleType: horizontalLinear ? 'linear' : 'categorical', domain: horizontalLinear ? horizontalLinear.domain : horizontalCategorical.domain, range: [plot.x, plot.x + plot.width], ticks: xTicks.map(({ value, position, label }) => ({ value, position, label })), baseline: verticalScale(0) },
      y: { scaleType: 'linear', domain: verticalScale.domain, range: [plot.y + plot.height, plot.y], ticks: yTicks.map((value) => ({ value, position: verticalScale(value), label: formatChartValue(value, chartSpec.units) })), baseline: verticalScale(0) },
    },
  };
}

function tickCollisionWarnings(coordinate, ctx, fontFamily) {
  const warnings = [];
  const x = coordinate.x.ticks;
  for (let index = 1; index < x.length; index++) {
    const previous = measureTextLayout({ text: x[index - 1].label, fontFamily, fontWeight: 500, fontSize: ctx.typeMinimums.source, lineHeight: 1.1, maxWidth: coordinate.plot.width });
    const current = measureTextLayout({ text: x[index].label, fontFamily, fontWeight: 500, fontSize: ctx.typeMinimums.source, lineHeight: 1.1, maxWidth: coordinate.plot.width });
    if (x[index - 1].position + previous.actualWidth / 2 + ctx.spacingScale.xs > x[index].position - current.actualWidth / 2) warnings.push('axis_tick_collision');
  }
  return warnings;
}

function solveMarkGeometry(chartSpec, scales, plot, ctx, elements, solved, annotationTargets) {
  const categoryCount = chartSpec.series[0].data.length;
  const seriesCount = chartSpec.series.length;
  const horizontalBars = chartSpec.chartType === 'BAR' && ctx.orientation === 'vertical';
  const categoryY = horizontalBars ? categoricalScale(chartSpec.series[0].data.map((datum) => datum.x), [plot.y, plot.y + plot.height], 0.3) : null;
  const horizontalValue = horizontalBars ? linearScale(scales.verticalScale.domain, [plot.x, plot.x + plot.width]) : null;
  const pointsBySeries = [];
  chartSpec.series.forEach((series, seriesIndex) => {
    const points = [];
    series.data.forEach((datum, pointIndex) => {
      const id = `chart_series_${seriesIndex}_point_${pointIndex}`;
      const element = elements.get(id);
      const xCenter = scales.horizontalLinear ? scales.horizontalLinear(Number(datum.x)) : scales.horizontalCategorical(datum.x) + scales.horizontalCategorical.bandwidth / 2;
      const y = scales.verticalScale(datum.y), baseline = scales.verticalScale(0);
      let geometry;
      if (horizontalBars) {
        const yBase = categoryY(datum.x), band = categoryY.bandwidth / seriesCount;
        const zero = horizontalValue(0), valueX = horizontalValue(datum.y);
        geometry = box(Math.min(zero, valueX), yBase + seriesIndex * band, Math.max(2, Math.abs(valueX - zero)), band * 0.76);
      } else if (chartSpec.chartType === 'BAR') {
        const band = scales.horizontalCategorical.bandwidth / seriesCount;
        geometry = box(scales.horizontalCategorical(datum.x) + seriesIndex * band, Math.min(y, baseline), band * 0.76, Math.max(2, Math.abs(baseline - y)));
      } else if (chartSpec.chartType === 'PROGRESS') {
        const domainMax = Math.max(100, ...series.data.map((item) => item.y));
        geometry = box(plot.x, plot.y + plot.height * 0.38, plot.width * clamp(datum.y / domainMax, 0, 1), Math.max(24, plot.height * 0.22));
      } else if (chartSpec.chartType === 'SIMPLE_STACK') {
        const total = series.data.reduce((sum, item) => sum + Math.max(0, item.y), 0) || 1;
        const before = series.data.slice(0, pointIndex).reduce((sum, item) => sum + Math.max(0, item.y), 0);
        geometry = box(plot.x + plot.width * before / total, plot.y + plot.height * 0.36, plot.width * Math.max(0, datum.y) / total, Math.max(30, plot.height * 0.25));
      } else {
        const radius = ctx.orientation === 'vertical' ? 11 : 9;
        geometry = box(xCenter - radius, y - radius, radius * 2, radius * 2);
      }
      const mark = addSolvedElement(solved, element, geometry, ctx, 3);
      mark.content = { ...mark.content, geometryType: horizontalBars ? 'bar-horizontal' : chartSpec.chartType.toLowerCase(), baseline, centerX: xCenter, centerY: y };
      annotationTargets[`${series.id}:${pointIndex}`] = { x: horizontalBars ? geometry.x + geometry.width : xCenter, y: horizontalBars ? geometry.y + geometry.height / 2 : y };
      points.push({ x: xCenter, y });
    });
    pointsBySeries.push(points);
    if (['LINE', 'AREA'].includes(chartSpec.chartType) && points.length > 1) {
      const source = elements.get(`chart_series_${seriesIndex}`);
      const pathData = points.map((point, index) => `${index ? 'L' : 'M'} ${Math.round(point.x)} ${Math.round(point.y)}`).join(' ');
      const lineElement = {
        ...source, id: `chart_series_${seriesIndex}_path`, kind: 'chart_mark', semanticRole: chartSpec.chartType === 'AREA' ? 'area-path' : 'line-path', importance: seriesIndex === 0 ? 'primary' : 'secondary',
        content: { chartType: chartSpec.chartType, pathData, points, baseline: scales.verticalScale(0), seriesId: series.id, seriesIndex }, constraints: { parentId: source.id, protected: false }, styleTokenRefs: { stroke: seriesIndex === 0 ? 'accent' : 'muted', fill: chartSpec.chartType === 'AREA' ? 'accentField' : 'none' },
      };
      addSolvedElement(solved, lineElement, plot, ctx, 2);
    }
  });
  return { horizontalBars, pointsBySeries };
}

export function solveChartLayout(composition, chartSpec, ctx, { tickLimit = null, annotationOffset = 0, repairHistory = [], conservativeLabels = false } = {}) {
  const validation = validateChartData(chartSpec);
  const elements = sceneElementMap(composition), solved = {}, textLayout = {}, failures = [], warnings = validation.issues.filter((issue) => issue.severity !== 'hard').map((issue) => issue.code);
  const regions = chartRegions(ctx);
  const leftMargin = ctx.orientation === 'vertical' && chartSpec.chartType === 'BAR' ? 190 : ctx.orientation === 'vertical' ? 76 : 92;
  const bottomMargin = ctx.orientation === 'vertical' ? 92 : 72, topMargin = ctx.spacingScale.md;
  const plot = box(regions.plotOuter.x + leftMargin, regions.plotOuter.y + topMargin, regions.plotOuter.width - leftMargin - ctx.spacingScale.sm, regions.plotOuter.height - bottomMargin - topMargin);
  const maximumTicks = tickLimit || (ctx.orientation === 'vertical' ? 4 : 6);
  const scales = axisModel(chartSpec, plot, ctx, maximumTicks);
  warnings.push(...tickCollisionWarnings(scales.coordinate, ctx, String(elements.get('chart_title').styleTokenRefs.fontFamily)));

  const titleResult = solveTextElement(elements.get('chart_title'), box(ctx.titleRegion.x, ctx.titleRegion.y, ctx.titleRegion.width, ctx.titleRegion.height), ctx, { maxFontSize: ctx.orientation === 'vertical' ? 38 : 30, minFontSize: ctx.typeMinimums.source, maxLines: 1, lineHeight: 1 });
  solved.chart_title = titleResult.element; textLayout.chart_title = titleResult.layout;
  addSolvedElement(solved, elements.get('chart_root'), regions.plotOuter, ctx, 0);
  const xAxis = addSolvedElement(solved, elements.get('chart_x_axis'), box(plot.x, scales.coordinate.x.baseline, plot.width, Math.max(1, regions.plotOuter.y + regions.plotOuter.height - scales.coordinate.x.baseline)), ctx, 1);
  xAxis.content = { axis: 'x', ...scales.coordinate.x, plot, fontSize: ctx.typeMinimums.source, fontFamily: String(elements.get('chart_title').styleTokenRefs.fontFamily) };
  const yAxis = addSolvedElement(solved, elements.get('chart_y_axis'), box(regions.plotOuter.x, plot.y, leftMargin, plot.height), ctx, 1);
  yAxis.content = { axis: 'y', ...scales.coordinate.y, plot, fontSize: ctx.typeMinimums.source, fontFamily: String(elements.get('chart_title').styleTokenRefs.fontFamily) };
  chartSpec.series.forEach((_, index) => addSolvedElement(solved, elements.get(`chart_series_${index}`), plot, ctx, 1));
  const annotationTargets = {};
  const markResult = solveMarkGeometry(chartSpec, scales, plot, ctx, elements, solved, annotationTargets);

  const categoryVisible = selectVisibleIndexes(chartSpec.series[0].data.length, maximumTicks);
  chartSpec.series.forEach((series, seriesIndex) => series.data.forEach((datum, pointIndex) => {
    const markId = `chart_series_${seriesIndex}_point_${pointIndex}`, mark = solved[markId];
    const label = elements.get(`${markId}_label`), value = elements.get(`${markId}_value`);
    // Axis ticks own category labels except in the mobile horizontal-bar topology,
    // where labels sit beside their bars and the axis remains value-oriented.
    if (categoryVisible.has(pointIndex) && seriesIndex === 0 && markResult.horizontalBars && scales.coordinate.y.ticks.length === 0) {
      const labelBox = markResult.horizontalBars
        ? box(regions.plotOuter.x, mark.y, leftMargin - ctx.spacingScale.sm, mark.height)
        : box(mark.x - Math.max(18, (scales.horizontalCategorical?.step || 60) * 0.18), plot.y + plot.height + ctx.spacingScale.sm, Math.max(36, (scales.horizontalCategorical?.step || 80) * 0.9), bottomMargin - ctx.spacingScale.sm);
      const result = solveTextElement(label, labelBox, ctx, { maxFontSize: ctx.orientation === 'vertical' ? 28 : 21, minFontSize: ctx.typeMinimums.supporting, maxLines: ctx.orientation === 'vertical' ? 2 : 1, lineHeight: 1.08 });
      solved[label.id] = result.element; textLayout[label.id] = result.layout;
      if (result.layout.constraintUnsatisfied) failures.push({ elementId: label.id, constraint: 'labelFit', detail: result.layout.fitStatus });
    }
    const highlighted = chartSpec.highlights.some((highlight) => highlight.seriesId === series.id && highlight.pointIndex === pointIndex);
    const annotated = chartSpec.annotations.some((annotation) => annotation.seriesId === series.id && annotation.pointIndex === pointIndex);
    const sparseLineLabel = ['LINE', 'AREA'].includes(chartSpec.chartType)
      ? (pointIndex === 0 || pointIndex === series.data.length - 1 || highlighted) && !annotated
      : chartSpec.series[0].data.length <= (ctx.orientation === 'vertical' ? 5 : 7);
    const showValue = (sparseLineLabel || highlighted) && !annotated && (!conservativeLabels || highlighted);
    if (showValue) {
      const directSeriesLabel = chartSpec.series.length > 1 && ['LINE', 'AREA'].includes(chartSpec.chartType) && pointIndex === series.data.length - 1;
      const valueElement = directSeriesLabel ? { ...value, content: `${series.label} · ${value.content}` } : value;
      const valueBox = markResult.horizontalBars
        ? (mark.width >= 148
          ? box(mark.x + mark.width - 140, mark.y, 132, Math.max(mark.height, ctx.typeMinimums.secondary * 1.15))
          : box(mark.x + mark.width + ctx.spacingScale.xs, mark.y, Math.max(70, plot.x + plot.width - mark.x - mark.width), Math.max(mark.height, ctx.typeMinimums.supporting * 1.15)))
        : directSeriesLabel
          ? box(Math.max(plot.x, mark.x - 300), Math.max(plot.y, mark.y - (ctx.typeMinimums.primary + ctx.spacingScale.sm)), 300, ctx.typeMinimums.primary + ctx.spacingScale.sm)
          : box(mark.x - 55, Math.max(plot.y, mark.y - (ctx.typeMinimums.secondary + ctx.spacingScale.sm) + seriesIndex * (ctx.typeMinimums.secondary + ctx.spacingScale.md)), Math.max(130, mark.width + 110), ctx.typeMinimums.secondary + ctx.spacingScale.sm);
      const primaryValue = value.importance === 'primary';
      const result = solveTextElement(valueElement, valueBox, ctx, {
        maxFontSize: ctx.orientation === 'vertical' ? (primaryValue ? 38 : 30) : (primaryValue ? 30 : 24),
        minFontSize: primaryValue ? (ctx.orientation === 'vertical' ? ctx.typeMinimums.secondary : ctx.typeMinimums.primary) : ctx.typeMinimums.supporting,
        maxLines: 1, lineHeight: 1,
      });
      solved[value.id] = result.element; textLayout[value.id] = result.layout;
      if (result.layout.constraintUnsatisfied) failures.push({ elementId: value.id, constraint: 'valueLabelFit', detail: result.layout.fitStatus });
    }
  }));

  const takeawayResult = solveTextElement(elements.get('chart_takeaway'), regions.takeaway, ctx, { maxFontSize: ctx.orientation === 'vertical' ? 34 : 30, minFontSize: ctx.typeMinimums.secondary, maxLines: 3, lineHeight: 1.13, zIndex: 5 });
  solved.chart_takeaway = takeawayResult.element; textLayout.chart_takeaway = takeawayResult.layout;
  if (takeawayResult.layout.constraintUnsatisfied) failures.push({ elementId: 'chart_takeaway', constraint: 'takeawayFit', detail: takeawayResult.layout.fitStatus });

  const annotationGeometry = {};
  chartSpec.annotations.forEach((annotation, index) => {
    const id = `chart_annotation_${annotation.id}`, target = annotationTargets[`${annotation.seriesId}:${annotation.pointIndex}`];
    if (!target) return;
    const width = Math.min(ctx.orientation === 'vertical' ? 300 : 340, plot.width * 0.34), height = ctx.orientation === 'vertical' ? 92 : 76;
    const x = clamp(target.x + ctx.spacingScale.sm, plot.x, plot.x + plot.width - width);
    const y = clamp(target.y - height - ctx.spacingScale.md + annotationOffset * (index + 1), plot.y, plot.y + plot.height - height);
    const targetBox = box(x, y, width, height);
    const result = solveTextElement(elements.get(id), targetBox, ctx, { maxFontSize: ctx.orientation === 'vertical' ? 28 : 23, minFontSize: ctx.typeMinimums.supporting, maxLines: 2, lineHeight: 1.1, zIndex: 6 });
    solved[id] = result.element; textLayout[id] = result.layout;
    annotationGeometry[id] = { ...targetBox, targetX: target.x, targetY: target.y };
    if (result.layout.constraintUnsatisfied) failures.push({ elementId: id, constraint: 'annotationFit', detail: result.layout.fitStatus });
  });
  const source = elements.get('chart_source');
  if (source) {
    const sourceBox = box(regions.takeaway.x, regions.takeaway.y + regions.takeaway.height - ctx.typeMinimums.source * 1.5, regions.takeaway.width, ctx.typeMinimums.source * 1.5);
    const result = solveTextElement(source, sourceBox, ctx, { maxFontSize: ctx.typeMinimums.source, minFontSize: ctx.typeMinimums.source, maxLines: 1, lineHeight: 1 });
    solved[source.id] = result.element; textLayout[source.id] = result.layout;
  }
  if (scales.coordinate.y.domain[0] > 0 && ['BAR', 'DOT'].includes(chartSpec.chartType)) failures.push({ elementId: 'chart_y_axis', constraint: 'misleadingBaseline', detail: 'Magnitude comparison must include a zero baseline' });
  if (warnings.includes('axis_tick_collision')) failures.push({ elementId: 'chart_x_axis', constraint: 'tickCollision', detail: 'Measured axis labels collide' });
  const topology = chartSpec.chartType === 'BAR' ? (markResult.horizontalBars ? 'bar-horizontal' : 'bar-vertical') : chartSpec.chartType.toLowerCase().replace('_', '-');
  const output = {
    version: 1, id: `solved_${composition.shotId}_${ctx.format}`, shotId: composition.shotId, format: ctx.format, viewport: ctx.viewport, topology,
    elements: solved, connectorRoutes: [], textLayout, occupancy: occupancyFrom(solved, ctx.primaryVisualRegion, (element) => element.id !== 'chart_root'),
    constraintsSatisfied: failures.length === 0, warnings: [...new Set(warnings)], constraintUnsatisfied: failures, repairHistory,
    regions: { title: ctx.titleRegion, primary: ctx.primaryVisualRegion, captions: ctx.captionRegion, plot },
    chartCoordinateSystem: scales.coordinate, annotationGeometry, captionBox: ctx.captionRegion, backgroundSelection: 'neutralDark',
    formatPolicy: { orientation: ctx.orientation, interactionSafeApplied: ctx.format === 'shorts', maximumConcepts: ctx.format === 'shorts' ? 5 : 7, maximumTicks },
    complexity: { ...composition.complexityBudget, withinBudget: chartSpec.series.flatMap((series) => series.data).length <= (composition.complexityBudget.level === 'HIGH' ? 12 : 7) },
  };
  return SolvedSceneSchema.parse(output);
}

export function solveChartLayoutWithRepairs(composition, chartSpec, ctx, { maxPasses = 2, conservativeLabels = false, initialRepairHistory = [] } = {}) {
  const history = [...initialRepairHistory]; let tickLimit = ctx.orientation === 'vertical' ? 4 : 6, annotationOffset = 0;
  for (let pass = 0; pass <= maxPasses; pass++) {
    const solvedScene = solveChartLayout(composition, chartSpec, ctx, { tickLimit, annotationOffset, repairHistory: history, conservativeLabels });
    if (solvedScene.constraintsSatisfied) return { composition, solvedScene };
    if (pass === maxPasses) return { composition, solvedScene };
    if (solvedScene.constraintUnsatisfied.some((failure) => failure.constraint === 'tickCollision')) {
      tickLimit = Math.max(2, tickLimit - 2);
      history.push({ pass: pass + 1, action: 'REDUCE_CHART_TICKS', reason: 'Measured tick labels collided' });
    } else if (solvedScene.constraintUnsatisfied.some((failure) => failure.constraint === 'annotationFit')) {
      annotationOffset += ctx.spacingScale.lg;
      history.push({ pass: pass + 1, action: 'MOVE_ANNOTATION', reason: 'Annotation did not fit its initial target position' });
    } else {
      tickLimit = Math.max(2, tickLimit - 1);
      history.push({ pass: pass + 1, action: 'REMOVE_REDUNDANT_LABEL', reason: 'Chart labels exceeded format capacity' });
    }
  }
  throw new Error('unreachable');
}
