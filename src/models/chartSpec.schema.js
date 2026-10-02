import { z } from 'zod';

const DatumSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number().finite(),
  label: z.string().nullable().default(null),
}).strict();

export const ChartSpecSchema = z.object({
  version: z.literal(1),
  shotId: z.string().min(1),
  question: z.string().min(1),
  takeaway: z.string().min(1),
  takeawayVariants: z.object({ full: z.string(), short: z.string(), labelOnly: z.string() }).strict(),
  chartType: z.enum(['BAR', 'LINE', 'AREA', 'DOT', 'PROGRESS', 'SIMPLE_STACK']),
  series: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), data: z.array(DatumSchema).min(1).max(12) }).strict()).min(1).max(3),
  dimensions: z.array(z.string()).default([]),
  xAxis: z.object({ label: z.string().nullable().default(null), scaleType: z.enum(['linear', 'categorical']) }).strict().nullable().default(null),
  yAxis: z.object({ label: z.string().nullable().default(null), scaleType: z.enum(['linear', 'categorical']) }).strict().nullable().default(null),
  units: z.string().nullable().default(null),
  source: z.object({ name: z.string().min(1), url: z.string().nullable().default(null), accessedAt: z.string().nullable().default(null) }).strict().nullable().default(null),
  illustrative: z.boolean(),
  highlights: z.array(z.object({ seriesId: z.string(), pointIndex: z.number().int().nonnegative(), label: z.string().min(1) }).strict()).min(1).max(3),
  annotations: z.array(z.object({ id: z.string(), text: z.string(), seriesId: z.string(), pointIndex: z.number().int().nonnegative() }).strict()).max(2).default([]),
  emphasisSequence: z.array(z.object({ seriesId: z.string(), pointIndex: z.number().int().nonnegative(), phrase: z.string().min(1) }).strict()).max(6).default([]),
  evidenceRequirement: z.enum(['required', 'preferred', 'conceptual_allowed']),
}).strict().superRefine((spec, ctx) => {
  const ids = new Set(spec.series.map((series) => series.id));
  if (ids.size !== spec.series.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Series IDs must be unique' });
  const lengths = spec.series.map((series) => series.data.length);
  if (spec.chartType === 'PROGRESS' && (spec.series.length !== 1 || lengths[0] !== 1)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PROGRESS requires exactly one datum' });
  if (spec.chartType === 'PROGRESS' && spec.series[0]?.data[0]?.y < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PROGRESS cannot use a negative value' });
  if (!spec.illustrative && !spec.source && spec.evidenceRequirement === 'required') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required factual charts must preserve source metadata' });
  for (const item of [...spec.highlights, ...spec.annotations, ...spec.emphasisSequence]) {
    const series = spec.series.find((candidate) => candidate.id === item.seriesId);
    if (!series || item.pointIndex >= series.data.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid chart point reference ${item.seriesId}:${item.pointIndex}` });
  }
});
