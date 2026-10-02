import { z } from 'zod';

const Reason = z.enum(['NEW_IDEA', 'NEW_ENTITY', 'NEW_EVIDENCE', 'NEW_LOCATION', 'NEW_EXAMPLE', 'NEW_ACTION', 'DETAIL_SHIFT', 'EMOTIONAL_SHIFT', 'CHAPTER_CHANGE', 'MONTAGE_PROGRESSION', 'CONTINUATION']);
const Transition = z.object({ type: z.enum(['CUT', 'SHORT_DISSOLVE', 'MATCH_CUT', 'SIMPLE_PUSH', 'MASK_REVEAL']), durationInFrames: z.number().int().nonnegative(), reason: Reason, anchor: z.object({ type: z.string(), value: z.string() }).strict().nullable() }).strict();

export const MediaShotPlanSchema = z.object({
  version: z.literal(1),
  shotId: z.string().min(1),
  editorialBeatId: z.string().min(1),
  editorialPurpose: z.string().min(1),
  assetId: z.string().min(1),
  assetType: z.enum(['IMAGE', 'VIDEO']),
  mediaRole: z.enum(['HERO', 'EVIDENCE', 'CONTEXT', 'DETAIL', 'ATMOSPHERE', 'BACKGROUND', 'MONTAGE_ITEM']),
  startFrame: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  compositionStrategy: z.enum(['FULL_BLEED_MEDIA', 'FULL_BLEED_MEDIA_WITH_SUBTITLE', 'MEDIA_WITH_LABEL', 'MEDIA_WITH_STAT', 'MEDIA_WITH_CALLOUT', 'EDITORIAL_SPLIT', 'DETAIL_FOCUS', 'TWO_MEDIA_COMPARE', 'MONTAGE', 'CHAPTER_HEADING']),
  cropPlan: z.object({ crop: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() }).strict(), objectPosition: z.object({ x: z.number(), y: z.number() }).strict(), subjectSafeRegion: z.unknown().nullable() }).strict(),
  cameraPlan: z.object({ mode: z.enum(['STATIC', 'SUBTLE_PUSH', 'SUBTLE_PULL', 'SLOW_PAN', 'FOCAL_PAN', 'DETAIL_CROP', 'REFRAME']), reason: z.enum(['increaseFocus', 'moveToDetail', 'followSubject', 'emotionalEmphasis', 'reframeForText', 'matchNextShot']).nullable(), start: z.object({ scale: z.number(), focusX: z.number(), focusY: z.number() }).strict(), end: z.object({ scale: z.number(), focusX: z.number(), focusY: z.number() }).strict() }).strict(),
  textOverlayPlan: z.unknown().nullable(),
  subtitlePlan: z.object({ position: z.string(), geometry: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().nonnegative() }).strict(), animation: z.enum(['DIRECT_REPLACE', 'SHORT_FADE']), maximumLines: z.number().int().min(1).max(2) }).strict(),
  annotationPlan: z.unknown().nullable(),
  transitionIn: Transition,
  transitionOut: Transition,
  visualChangeReason: Reason,
  transitionAnchor: z.object({ type: z.string(), value: z.string() }).strict().nullable(),
  qualityTier: z.enum(['HERO', 'SUPPORT', 'FALLBACK', 'UNKNOWN']),
  minimumReadFrames: z.number().int().nonnegative(),
  minimumFinalHoldFrames: z.number().int().nonnegative(),
  rejectedAlternatives: z.array(z.object({ assetId: z.string(), reason: z.enum(['bad_crop', 'subject_cutoff', 'low_resolution', 'no_mobile_safe_crop', 'composition_incompatible', 'caption_conflict', 'poor_subject_scale']) }).strict()),
  qualityVerdict: z.enum(['STRONG', 'ACCEPTABLE', 'WEAK', 'FAILED']),
  repairHistory: z.array(z.object({ action: z.string(), reason: z.string() }).strict()),
}).strict();

export const MediaShotPlanListSchema = z.array(MediaShotPlanSchema);
