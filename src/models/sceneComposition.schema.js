import { z } from 'zod';

const BoxConstraintSchema = z.object({
  minWidth: z.number().nonnegative().optional(),
  maxWidth: z.number().positive().optional(),
  minHeight: z.number().nonnegative().optional(),
  maxHeight: z.number().positive().optional(),
  maxLines: z.number().int().positive().optional(),
  parentId: z.string().nullable().optional(),
  protected: z.boolean().default(false),
}).strict();

export const SceneElementSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['text', 'shape', 'connector', 'group', 'media', 'icon', 'chart_axis', 'chart_mark', 'chart_label', 'annotation', 'region']),
  semanticRole: z.string().min(1),
  importance: z.enum(['primary', 'secondary', 'supporting', 'structural']),
  content: z.union([z.string(), z.record(z.string(), z.unknown())]).nullable(),
  intrinsic: z.object({
    width: z.number().nonnegative().optional(),
    height: z.number().nonnegative().optional(),
  }).strict(),
  constraints: BoxConstraintSchema,
  styleTokenRefs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  semanticBinding: z.object({ type: z.string(), value: z.string(), phraseId: z.string().nullable().optional() }).strict().nullable().default(null),
  textVariants: z.object({ full: z.string(), short: z.string(), labelOnly: z.string() }).strict().optional(),
}).strict();

export const SceneCompositionSchema = z.object({
  version: z.literal(1),
  shotId: z.string().min(1),
  format: z.enum(['landscape', 'shorts']),
  objective: z.string().min(1),
  regions: z.array(z.object({
    id: z.string().min(1),
    role: z.string().min(1),
    constraints: z.record(z.string(), z.unknown()),
  }).strict()),
  elements: z.array(SceneElementSchema),
  relationships: z.array(z.object({
    type: z.enum(['contains', 'precedes', 'connects', 'labels']),
    from: z.string().min(1),
    to: z.string().min(1),
  }).strict()),
  readingOrder: z.array(z.string().min(1)),
  captionPolicy: z.object({
    mode: z.enum(['NORMAL', 'COMPACT', 'INTEGRATED', 'HIDDEN']),
    regionId: z.string(),
    equivalentTextElementIds: z.array(z.string()).default([]),
  }).strict(),
  backgroundIntent: z.object({ mode: z.string(), texture: z.string().nullable() }).strict(),
  motionIntent: z.object({ vocabulary: z.array(z.enum(['reveal', 'emphasize', 'draw', 'highlight', 'focus', 'fade', 'slide', 'mask', 'scale', 'translate'])), frame0Emphasis: z.number().min(0).max(1) }).strict(),
  complexityBudget: z.object({
    level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    mainTargets: z.number().int().nonnegative(),
    supportElements: z.number().int().nonnegative(),
    relationships: z.number().int().nonnegative(),
  }).strict(),
  semanticEvents: z.array(z.object({
    id: z.string(),
    type: z.enum(['stepIntroduced', 'stageComplete', 'comparisonPivot', 'resultIntroduced', 'conclusion', 'mediaEstablished', 'annotationIntroduced', 'assetChanged']),
    targetId: z.string(),
    phraseId: z.string().nullable(),
    frame: z.number().int().nonnegative(),
  }).strict()),
}).strict();
