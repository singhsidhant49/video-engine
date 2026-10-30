import { z } from 'zod-api';
import { SolvedSceneSchema } from './solvedScene.schema.js';
import { MotionPlanSchema } from './motionPlan.schema.js';
import { EditorialVisualBeatSchema } from './editorialVisualBeat.schema.js';
import { MediaShotPlanSchema } from './mediaShotPlan.schema.js';

const FrameRangeSchema = z.object({
  from: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
}).passthrough();

const ShotTransitionSchema = z.object({
  type: z.enum(['cut', 'dissolve']),
  frames: z.number().int().nonnegative(),
}).strict();

export const TimelineShotSchema = FrameRangeSchema.extend({
  id: z.string().min(1),
  storyboardShotId: z.string().min(1),
  sceneId: z.string().min(1),
  sectionId: z.string().min(1),
  role: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  visualIntent: z.string().optional(),
  visualConcept: z.string().optional(),
  mediaPreference: z.string().optional(),
  evidenceRequirement: z.string().optional(),
  family: z.string().min(1),
  variant: z.string().min(1),
  layout: z.string().min(1),
  presentation: z.object({
    family: z.string().min(1),
    variant: z.string().min(1),
    layout: z.string().min(1),
    overlayMode: z.string().min(1),
    cameraMove: z.string().min(1),
    visualDensity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  }).passthrough(),
  renderMode: z.enum(['legacy', 'solved']).default('legacy'),
  solvedSceneId: z.string().nullable().default(null),
  motionPlanId: z.string().nullable().default(null),
  visualQualityReviewId: z.string().nullable().default(null),
  mediaSceneSpecId: z.string().nullable().default(null),
  compositionFallback: z.object({
    shotId: z.string().min(1),
    representation: z.enum(['process', 'comparison', 'chart', 'media']),
    failureStage: z.string().min(1),
    constraint: z.string().min(1),
    fallbackRenderer: z.enum(['ProcessShot', 'CompareShot', 'ChartShot', 'PhotoShot']),
    reason: z.string().min(1),
  }).strict().nullable().default(null),
  unresolvedMedia: z.boolean().optional(),
  transitionReason: z.enum(['newIdea', 'newEvidence', 'newEntity', 'comparisonPivot', 'reveal', 'sectionChange', 'detailChange', 'continuation']),
  transitionAnchor: z.object({ type: z.enum(['entity', 'concept', 'subject', 'detail', 'screen_region', 'location']), value: z.string() }).strict().nullable(),
  transitionPolicy: z.enum(['CUT', 'SHORT_DISSOLVE']),
  enter: ShotTransitionSchema.default({ type: 'cut', frames: 0 }),
  exit: ShotTransitionSchema.default({ type: 'cut', frames: 0 }),
  imageBehavior: z.enum(['STATIC', 'SUBTLE_PUSH', 'SUBTLE_PULL', 'PAN_LEFT', 'PAN_RIGHT']).nullable(),
  captionPolicy: z.object({
    mode: z.enum(['NORMAL', 'COMPACT', 'INTEGRATED', 'HIDDEN']),
    style: z.enum(['CLEAN_TEXT', 'SOFT_SCRIM', 'COMPACT_CAPSULE', 'INTEGRATED']).optional(),
    geometry: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().nonnegative() }).strict(),
    equivalentOnScreenText: z.boolean(),
    reason: z.string(),
  }).strict(),
  continuityCompatibility: z.object({
    score: z.number().min(0).max(1), compatible: z.boolean(), warnings: z.array(z.string()), comparisons: z.record(z.string(), z.unknown()),
  }).strict().nullable().default(null),
  asset: z.unknown().nullable().optional(),
  assets: z.array(z.unknown()).default([]),
  move: z.unknown().optional(),
  overlay: z.record(z.string(), z.unknown()).default({}),
  editorialApproval: z.object({
    classification: z.string(),
    confidence: z.number(),
    semanticDistance: z.number(),
    judgeVersion: z.string(),
    visibleNeedHash: z.string(),
    assetHash: z.string(),
    approved: z.boolean(),
    selectionReason: z.string().optional(),
  }).passthrough().optional(),
}).strict().superRefine((shot, ctx) => {
  if (shot.renderMode === 'solved' && (!shot.solvedSceneId || !shot.motionPlanId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Solved shots require solvedSceneId and motionPlanId' });
  }
  if (Object.hasOwn(shot, 'solvedScene') || Object.hasOwn(shot, 'geometry')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Solved geometry must be referenced from the typed timeline registries, not embedded as an unknown blob' });
  }
});

export const TimelineClipSchema = FrameRangeSchema.extend({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  family: z.string().min(1),
  shots: z.array(TimelineShotSchema).min(1),
}).passthrough();

export const TimelineSchema = z.object({
  version: z.number().int().positive(),
  videoId: z.string().min(1),
  title: z.string().min(1),
  format: z.enum(['shorts', 'landscape']),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationInFrames: z.number().int().positive(),
  visualMode: z.enum(['HYBRID_EDITORIAL', 'MEDIA_EDITORIAL', 'LEGACY_PROCEDURAL']).default('HYBRID_EDITORIAL'),
  visualPolicy: z.object({
    visualMode: z.enum(['HYBRID_EDITORIAL', 'MEDIA_EDITORIAL', 'LEGACY_PROCEDURAL']), useMediaEditorial: z.boolean(), enableProceduralGraphics: z.boolean(),
    allowHybridRepresentations: z.boolean().optional(), preferAuthenticMedia: z.boolean().optional(),
    enableLegacyVisualFamilies: z.boolean(), allowGeneratedMedia: z.literal(false), allowSplitLayout: z.boolean().default(false), defaultTransition: z.literal('CUT'), defaultCamera: z.literal('STATIC'),
    motionPreset: z.enum(['minimal', 'standard']).default('standard'),
  }).strict(),
  clips: z.array(TimelineClipSchema).min(1),
  realizedShots: z.array(TimelineShotSchema).min(1),
  solvedScenes: z.record(z.string(), SolvedSceneSchema).default({}),
  motionPlans: z.record(z.string(), MotionPlanSchema).default({}),
  visualQualityReviews: z.record(z.string(), z.unknown()).default({}),
  mediaSceneSpecs: z.record(z.string(), z.unknown()).default({}),
  editorialVisualBeats: z.record(z.string(), EditorialVisualBeatSchema).default({}),
  mediaShotPlans: z.record(z.string(), MediaShotPlanSchema).default({}),
  captions: z.object({
    chunks: z.array(z.unknown()), hidden: z.array(z.unknown()),
    policies: z.array(z.unknown()).default([]),
    geometry: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().nonnegative() }).optional(),
  }).passthrough(),
  audio: z.object({ narration: z.string().nullable().optional(), bgm: z.unknown().nullable().optional(), sfx: z.array(z.unknown()), speech: z.array(z.unknown()) }).passthrough(),
}).passthrough();
