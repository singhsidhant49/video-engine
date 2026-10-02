import { z } from 'zod';

export const MotionTrackSchema = z.object({
  id: z.string(),
  targetId: z.string(),
  property: z.enum(['reveal', 'emphasis', 'draw', 'highlight', 'focus', 'fade', 'slide', 'mask', 'scale', 'translateX', 'translateY', 'cameraScale', 'cameraFocusX', 'cameraFocusY']),
  from: z.number(),
  to: z.number(),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().nonnegative(),
  easing: z.enum(['linear', 'easeOutCubic', 'easeInOutCubic']),
  triggerPhraseId: z.string().nullable(),
}).strict().refine((track) => track.endFrame >= track.startFrame, { message: 'motion track must not run backwards' });

export const MotionPlanSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  shotId: z.string(),
  durationInFrames: z.number().int().positive(),
  frame0State: z.record(z.string(), z.record(z.string(), z.number())),
  lifecycle: z.array(z.object({
    phase: z.enum(['ENTER', 'ESTABLISH', 'EXPLAIN', 'EMPHASIZE', 'SETTLE', 'EXIT']),
    startFrame: z.number().int().nonnegative(),
    endFrame: z.number().int().nonnegative(),
    intent: z.string(),
  }).strict().refine((phase) => phase.endFrame >= phase.startFrame, { message: 'lifecycle phase must not run backwards' })).length(6),
  motionDensityBudget: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  maximumSimultaneousTracks: z.number().int().positive(),
  primaryMotionProperty: z.enum(['reveal', 'emphasis', 'draw', 'highlight', 'focus', 'fade', 'slide', 'mask']),
  frameQuality: z.object({
    frame0Valid: z.boolean(),
    firstMeaningfulFrame: z.number().int().nonnegative(),
    majorSemanticEvents: z.array(z.object({ eventId: z.string(), frame: z.number().int().nonnegative(), targetId: z.string() }).strict()),
    finalStateFrame: z.number().int().nonnegative(),
    minimumFinalHold: z.number().int().positive(),
  }).strict(),
  focalStates: z.array(z.object({
    state: z.string().min(1),
    startFrame: z.number().int().nonnegative(),
    endFrame: z.number().int().nonnegative(),
    primaryFocalElementId: z.string().min(1),
    minimumReadFrames: z.number().int().nonnegative(),
  }).strict().refine((state) => state.endFrame >= state.startFrame, { message: 'focal state must not run backwards' })).min(1),
  tracks: z.array(MotionTrackSchema),
  tokens: z.object({
    durations: z.object({ MICRO: z.number(), FAST: z.number(), NORMAL: z.number(), EMPHASIS: z.number() }).strict(),
    durationMs: z.object({ MICRO: z.number(), FAST: z.number(), NORMAL: z.number(), EMPHASIS: z.number() }).strict(),
    easings: z.object({ enter: z.string(), exit: z.string(), move: z.string(), draw: z.string(), emphasis: z.string() }).strict(),
  }).strict(),
}).strict();
