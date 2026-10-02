import { ChartSpecSchema } from '../models/chartSpec.schema.js';
import { createSemanticTextVariants } from './semanticText.js';

function inferredType(overlay, question) {
  const requested = String(overlay.chartType || overlay.type || '').toUpperCase().replace(/-/g, '_');
  if (['BAR', 'LINE', 'AREA', 'DOT', 'PROGRESS', 'SIMPLE_STACK'].includes(requested)) return requested;
  if (/time|over|trend|delay|change|growth|fall|decline/i.test(question)) return 'LINE';
  if (/target|progress|complete/i.test(question) && (overlay.values || []).length === 1) return 'PROGRESS';
  return 'BAR';
}

export function normalizeChartSpec({ editorialPlan, overlay = {} }) {
  const question = overlay.question || editorialPlan.communicationObjective || overlay.title || 'How do the values compare?';
  const values = overlay.values || [];
  const labels = overlay.labels || values.map((_, index) => `Category ${index + 1}`);
  const series = overlay.series || [{ id: 'primary', label: overlay.seriesLabel || overlay.title || 'Value', data: values.map((value, index) => ({ x: labels[index], y: Number(value), label: null })) }];
  const normalizedSeries = series.map((item, seriesIndex) => ({
    id: item.id || `series_${seriesIndex + 1}`, label: item.label || `Series ${seriesIndex + 1}`,
    data: item.data.map((datum, pointIndex) => typeof datum === 'number'
      ? { x: labels[pointIndex] || `Category ${pointIndex + 1}`, y: datum, label: null }
      : { x: datum.x, y: Number(datum.y), label: datum.label || null }),
  }));
  const chartType = inferredType(overlay, question);
  const primaryValues = normalizedSeries[0]?.data.map((datum) => datum.y) || [];
  const maxIndex = primaryValues.length ? primaryValues.indexOf(Math.max(...primaryValues)) : 0;
  const takeaway = overlay.takeaway || editorialPlan.textBlocks?.takeaway || (chartType === 'LINE'
    ? `${series[0]?.label || 'Value'} changes sharply across the sequence`
    : `${labels[maxIndex] || 'The leading category'} has the highest value`);
  const source = typeof overlay.source === 'string' ? { name: overlay.source, url: null, accessedAt: null } : overlay.source || null;
  const illustrative = overlay.illustrative ?? !source;
  return ChartSpecSchema.parse({
    version: 1, shotId: editorialPlan.shotId, question, takeaway,
    takeawayVariants: overlay.takeawayVariants || createSemanticTextVariants(takeaway), chartType,
    series: normalizedSeries,
    dimensions: overlay.dimensions || [],
    xAxis: overlay.xAxis || { label: null, scaleType: chartType === 'LINE' && typeof series[0]?.data[0]?.x === 'number' ? 'linear' : 'categorical' },
    yAxis: overlay.yAxis || { label: overlay.units || null, scaleType: 'linear' },
    units: overlay.units || null, source, illustrative,
    highlights: overlay.highlights?.length ? overlay.highlights
      : [{ seriesId: normalizedSeries[0]?.id || 'primary', pointIndex: overlay.highlightIndex != null ? overlay.highlightIndex : maxIndex, label: takeaway }],
    annotations: overlay.annotations || [], emphasisSequence: overlay.emphasisSequence || [],
    evidenceRequirement: editorialPlan.coverage?.evidenceRequirements?.level || (source ? 'preferred' : 'conceptual_allowed'),
  });
}
