import { z } from 'zod';

const NormalizedPoint = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const NormalizedRect = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }).strict();

export const MediaAnalysisSchema = z.object({
  assetId: z.string().min(1),
  type: z.enum(['image', 'video']),
  src: z.string().min(1),
  dimensions: z.object({ width: z.number().positive().nullable(), height: z.number().positive().nullable() }).strict(),
  aspectRatio: z.number().positive().nullable(),
  orientation: z.enum(['landscape', 'portrait', 'square', 'unknown']),
  focalPoint: NormalizedPoint.nullable(),
  subjectBounds: NormalizedRect.nullable(),
  faceBounds: z.array(NormalizedRect),
  protectedRegions: z.array(NormalizedRect.extend({ reason: z.string().optional() })),
  safeTextRegions: z.array(z.string()),
  negativeSpaceRegions: z.array(NormalizedRect),
  cropFitness: z.number().min(0).max(1).nullable(),
  cropSlack: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict().nullable(),
  visualBusyness: z.number().min(0).max(1).nullable(),
  qualityTier: z.enum(['HERO', 'SUPPORT', 'FALLBACK', 'UNKNOWN']),
  motionPresent: z.boolean().nullable(),
  evidenceStrength: z.number().min(0).max(1).nullable(),
  unknownFields: z.array(z.string()),
}).strict();

export const MontageSpecSchema = z.object({
  editorialObjective: z.string().min(1),
  assets: z.array(z.string().min(1)).min(2),
  sequenceReason: z.enum(['spokenEntities', 'examples', 'beats', 'musicAccents', 'semanticListItems']),
  durationInFrames: z.number().int().positive(),
  perAssetRole: z.array(z.enum(['HERO', 'EVIDENCE', 'CONTEXT', 'DETAIL', 'ATMOSPHERE', 'COMPARISON', 'BACKGROUND'])),
  transitionStyle: z.enum(['CUT', 'SHORT_DISSOLVE', 'MATCH_MOVE']),
  rhythm: z.enum(['STEADY', 'BUILD', 'DECELERATE']),
  cuts: z.array(z.object({ assetId: z.string(), startFrame: z.number().int().nonnegative(), endFrame: z.number().int().nonnegative(), reason: z.string().min(1) }).strict()),
}).strict();

export const MediaSceneSpecSchema = z.object({
  version: z.literal(1),
  shotId: z.string().min(1),
  mediaRole: z.enum(['HERO', 'EVIDENCE', 'CONTEXT', 'DETAIL', 'ATMOSPHERE', 'COMPARISON', 'BACKGROUND', 'MONTAGE']),
  editorialObjective: z.string().min(1),
  primaryAssetId: z.string().min(1),
  supportingAssetIds: z.array(z.string()),
  subjectIntent: z.string().min(1),
  evidenceIntent: z.string().min(1),
  textNeed: z.enum(['NONE', 'HEADLINE', 'STAT', 'LABEL', 'SOURCE']),
  annotationNeed: z.enum(['NONE', 'POINTER', 'LABEL', 'BRACKET', 'OUTLINE', 'HIGHLIGHT_REGION']),
  cameraIntent: z.enum(['STATIC', 'SUBTLE_PUSH', 'SUBTLE_PULL', 'FOCAL_PAN', 'DETAIL_CROP', 'REFRAME', 'MATCH_MOVE']),
  transitionIntent: z.object({ entry: z.enum(['CUT', 'SHORT_DISSOLVE', 'MATCH_MOVE', 'MASK_REVEAL']), exit: z.enum(['CUT', 'SHORT_DISSOLVE', 'MATCH_MOVE', 'MASK_REVEAL']), anchor: z.object({ type: z.string(), value: z.string() }).strict().nullable() }).strict(),
  durationIntent: z.object({ durationInFrames: z.number().int().positive(), rationale: z.array(z.string()).min(1) }).strict(),
  imageChangeReason: z.enum(['newEntity', 'newEvidence', 'newLocation', 'newDetail', 'newIdea', 'emotionalShift', 'montageProgression']),
  strategy: z.enum(['FULL_BLEED', 'EDITORIAL_SPLIT', 'MEDIA_DOMINANT_SPLIT', 'DETAIL_FOCUS', 'IMAGE_PLUS_STAT', 'IMAGE_PLUS_CALLOUT', 'EVIDENCE_FRAME', 'TWO_MEDIA_COMPARE', 'LAYERED_MEDIA', 'BACKGROUND_MEDIA', 'MONTAGE']),
  captionPosition: z.enum(['LOWER_CENTER', 'MID_LOWER', 'UPPER_SAFE', 'LEFT_SAFE', 'RIGHT_SAFE']),
  assets: z.array(MediaAnalysisSchema).min(1),
  montage: MontageSpecSchema.nullable(),
  alternateAssetRequest: z.object({ requested: z.boolean(), reason: z.literal('composition_incompatible'), rejectedAssetId: z.string(), requirements: z.array(z.string()) }).strict().nullable(),
}).strict();
