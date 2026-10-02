import { z } from 'zod';

const TextVariantsSchema = z.object({ full: z.string().min(1), short: z.string().min(1), labelOnly: z.string().min(1) }).strict();

export const ComparisonSubjectSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(''),
  metricLabel: z.string().nullable().default(null),
  metricValue: z.string().nullable().default(null),
  textVariants: TextVariantsSchema,
}).strict();

export const ComparisonSpecSchema = z.object({
  version: z.literal(1),
  shotId: z.string().min(1),
  objective: z.string().min(1),
  comparisonType: z.enum(['opposition', 'before_after', 'tradeoff', 'alternatives', 'quantitative', 'conceptual']),
  subjectA: ComparisonSubjectSchema,
  subjectB: ComparisonSubjectSchema,
  dimensions: z.array(z.object({
    id: z.string().min(1), label: z.string().min(1), valueA: z.string(), valueB: z.string(), importance: z.enum(['primary', 'secondary', 'supporting']).default('secondary'),
  }).strict()).max(4).default([]),
  keyDifference: z.string().min(1),
  keyDifferenceVariants: TextVariantsSchema,
  emphasizedSide: z.enum(['A', 'B', 'BALANCED']).default('BALANCED'),
  conclusion: z.string().nullable().default(null),
  grammar: z.enum(['DUAL_FIELD', 'SHARED_BASELINE', 'SPECTRUM', 'BEFORE_AFTER', 'TWO_COLUMN_EDITORIAL', 'STACKED_VERTICAL', 'DELTA_COMPARISON']).nullable().default(null),
}).strict().superRefine((spec, ctx) => {
  if (spec.subjectA.id === spec.subjectB.id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Comparison subjects must be distinct' });
});

