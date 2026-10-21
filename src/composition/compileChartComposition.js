import { createSceneComposition } from './sceneComposition.js';
import { phrasesFromAlignedWords } from './compileProcessComposition.js';
import { validateChartData } from './chartScales.js';
import { formatChartValue } from './chartScales.js';

const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
function phraseFor(text, phrases, fallbackIndex) {
  const tokens = normalize(text); let best = null;
  phrases.forEach((phrase) => { const score = tokens.filter((token) => phrase.tokens.includes(token)).length; if (!best || score > best.score) best = { phrase, score }; });
  return best?.score ? best.phrase : phrases[Math.min(fallbackIndex, Math.max(0, phrases.length - 1))] || null;
}
function element({ id, kind, role, importance, content, parentId = null, style = {}, binding = null, textVariants }) {
  return { id, kind, semanticRole: role, importance, content, intrinsic: {}, constraints: { parentId, protected: ['text', 'chart_label', 'annotation'].includes(kind), maxLines: ['text', 'chart_label', 'annotation'].includes(kind) ? 2 : undefined }, styleTokenRefs: style, semanticBinding: binding, ...(textVariants ? { textVariants } : {}) };
}

export function compileChartComposition({ editorialPlan, chartSpec, alignedWords, shotStartFrame, durationInFrames, formatContext, font }) {
  const validation = validateChartData(chartSpec);
  if (!validation.valid) throw new Error(`Invalid chart data: ${validation.issues.filter((issue) => issue.severity === 'hard').map((issue) => issue.code).join(', ')}`);
  const phrases = phrasesFromAlignedWords(alignedWords, shotStartFrame);
  const elements = [
    element({ id: 'chart_title', kind: 'text', role: 'title', importance: 'secondary', content: editorialPlan.textBlocks.title || chartSpec.question, style: { fontFamily: font.display, fontWeight: 700, color: 'accent' } }),
    element({ id: 'chart_root', kind: 'group', role: 'chart-root', importance: 'structural', content: { chartType: chartSpec.chartType, illustrative: chartSpec.illustrative }, style: {} }),
    element({ id: 'chart_x_axis', kind: 'chart_axis', role: 'x-axis', importance: 'structural', content: { axis: 'x' }, parentId: 'chart_root', style: { stroke: 'line' } }),
    element({ id: 'chart_y_axis', kind: 'chart_axis', role: 'y-axis', importance: 'structural', content: { axis: 'y' }, parentId: 'chart_root', style: { stroke: 'line' } }),
    element({ id: 'chart_takeaway', kind: 'annotation', role: 'takeaway', importance: 'primary', content: chartSpec.takeaway, style: { fontFamily: font.text, fontWeight: 700, color: 'text' }, textVariants: chartSpec.takeawayVariants, binding: { type: 'takeaway', value: chartSpec.takeaway } }),
  ];
  const relationships = [{ type: 'contains', from: 'chart_root', to: 'chart_x_axis' }, { type: 'contains', from: 'chart_root', to: 'chart_y_axis' }, { type: 'labels', from: 'chart_takeaway', to: 'chart_root' }];
  chartSpec.series.forEach((series, seriesIndex) => {
    const groupId = `chart_series_${seriesIndex}`;
    elements.push(element({ id: groupId, kind: 'group', role: 'chart-series', importance: seriesIndex === 0 ? 'primary' : 'secondary', content: { seriesId: series.id, label: series.label }, parentId: 'chart_root', style: { frame0Emphasis: 0.55 }, binding: { type: 'series', value: series.id } }));
    relationships.push({ type: 'contains', from: 'chart_root', to: groupId });
    series.data.forEach((datum, pointIndex) => {
      const pointId = `${groupId}_point_${pointIndex}`;
      elements.push(
        element({ id: pointId, kind: 'chart_mark', role: 'data-mark', importance: chartSpec.highlights.some((highlight) => highlight.seriesId === series.id && highlight.pointIndex === pointIndex) ? 'primary' : 'secondary', content: { seriesId: series.id, seriesIndex, pointIndex, x: datum.x, y: datum.y, chartType: chartSpec.chartType }, parentId: groupId, style: { fill: seriesIndex === 0 ? 'accent' : 'muted', stroke: 'accent' }, binding: { type: 'dataPoint', value: `${series.id}:${pointIndex}` } }),
        element({ id: `${pointId}_label`, kind: 'chart_label', role: 'data-label', importance: 'supporting', content: datum.label || String(datum.x), parentId: pointId, style: { fontFamily: font.text, fontWeight: 600, color: 'muted' }, binding: { type: 'dataPoint', value: `${series.id}:${pointIndex}` } }),
        element({ id: `${pointId}_value`, kind: 'chart_label', role: 'value-label', importance: chartSpec.highlights.some((highlight) => highlight.seriesId === series.id && highlight.pointIndex === pointIndex) ? 'primary' : 'supporting', content: formatChartValue(datum.y, chartSpec.units), parentId: pointId, style: { fontFamily: font.display, fontWeight: 700, color: 'text' }, binding: { type: 'dataPoint', value: `${series.id}:${pointIndex}` } }),
      );
      relationships.push({ type: 'contains', from: groupId, to: pointId }, { type: 'labels', from: `${pointId}_label`, to: pointId }, { type: 'labels', from: `${pointId}_value`, to: pointId });
    });
  });
  chartSpec.annotations.forEach((annotation) => {
    elements.push(element({ id: `chart_annotation_${annotation.id}`, kind: 'annotation', role: 'chart-annotation', importance: 'supporting', content: annotation.text, style: { fontFamily: font.text, fontWeight: 650, color: 'text' }, binding: { type: 'dataPoint', value: `${annotation.seriesId}:${annotation.pointIndex}` } }));
  });
  if (chartSpec.source) elements.push(element({ id: 'chart_source', kind: 'text', role: 'source', importance: 'supporting', content: `Source: ${chartSpec.source.name}`, style: { fontFamily: font.text, fontWeight: 400, color: 'muted' } }));
  else if (chartSpec.illustrative) elements.push(element({ id: 'chart_source', kind: 'text', role: 'source', importance: 'supporting', content: 'Illustrative', style: { fontFamily: font.text, fontWeight: 400, color: 'muted' } }));

  const sequence = chartSpec.emphasisSequence.length ? chartSpec.emphasisSequence : chartSpec.highlights.map((highlight) => ({ ...highlight, phrase: highlight.label }));
  const events = sequence.map((item, index) => {
    const phrase = phraseFor(item.phrase, phrases, index);
    const seriesIndex = chartSpec.series.findIndex((series) => series.id === item.seriesId);
    return { id: `event_chart_${index + 1}`, type: 'stepIntroduced', targetId: `chart_series_${seriesIndex}_point_${item.pointIndex}`, phraseId: phrase?.id || null, frame: phrase?.startFrame ?? Math.round(durationInFrames * (0.25 + index * 0.2)) };
  });
  const takeawayPhrase = phraseFor(chartSpec.takeaway, phrases, Math.max(0, phrases.length - 1));
  events.push({ id: 'event_chart_takeaway', type: 'conclusion', targetId: 'chart_takeaway', phraseId: takeawayPhrase?.id || null, frame: takeawayPhrase?.startFrame ?? Math.round(durationInFrames * 0.65) });
  return createSceneComposition({
    version: 1, shotId: chartSpec.shotId, format: formatContext.format, objective: chartSpec.takeaway,
    regions: [{ id: 'title', role: 'title', constraints: formatContext.titleRegion }, { id: 'primary', role: 'chart', constraints: formatContext.primaryVisualRegion }, { id: 'captions', role: 'caption-reserve', constraints: formatContext.captionRegion }],
    elements, relationships, readingOrder: ['chart_root', ...chartSpec.series.map((_, index) => `chart_series_${index}`), 'chart_takeaway'],
    captionPolicy: { mode: 'COMPACT', regionId: 'captions', equivalentTextElementIds: [] },
    backgroundIntent: { mode: 'neutralDark', texture: null }, motionIntent: { vocabulary: ['draw', 'highlight', 'emphasize'], frame0Emphasis: 0.5 },
    complexityBudget: { level: elements.filter((item) => item.kind === 'chart_mark').length > 7 ? 'HIGH' : 'MEDIUM', mainTargets: 1, supportElements: Math.min(5, elements.filter((item) => ['chart_label', 'annotation'].includes(item.kind)).length), relationships: chartSpec.series.length },
    semanticEvents: events.map((event) => ({ ...event, frame: Math.max(0, Math.min(durationInFrames - 1, event.frame)) })),
  });
}
