import { z } from 'zod-api';

const ContentType = z.enum([
  'auto', 'documentary', 'explainer', 'meditation', 'audiobook', 'motivational', 'story',
  // Backward-compatible alias support:
  'investigative', 'educational', 'tutorial',
]).transform((val) => {
  if (val === 'investigative') return 'documentary';
  if (val === 'educational' || val === 'tutorial') return 'explainer';
  return val;
});
const Pacing = z.enum(['auto', 'contemplative', 'cinematic', 'balanced', 'energetic', 'rapid']);

export const VisualOverridesSchema = z.record(z.string().min(1).max(160), z.object({
  locked: z.boolean().default(true),
  crop: z.object({
    x: z.number().min(0).max(1), y: z.number().min(0).max(1),
    width: z.number().positive().max(1), height: z.number().positive().max(1),
  }).strict().refine((crop) => crop.x + crop.width <= 1 && crop.y + crop.height <= 1, { message: 'crop must stay inside the image' }).optional(),
  motion: z.enum(['STATIC', 'SLOW_PUSH_IN', 'SLOW_PULL_OUT', 'PAN_LEFT', 'PAN_RIGHT', 'GENTLE_DRIFT']).optional(),
  transition: z.enum(['CUT', 'CROSS_DISSOLVE']).optional(),
  durationSeconds: z.number().min(0.5).max(60).optional(),
  asset: z.object({
    mediaBankPath: z.string().trim().min(1).max(500).refine((value) => !value.includes('..') && !value.startsWith('/') && !value.startsWith('\\'), { message: 'mediaBankPath must be a safe relative path' }),
  }).strict().optional(),
}).strict()).default({});

const OutputSchema = z.object({
  durationSeconds: z.number().int().min(10).max(7_200).optional(),
  durationMode: z.enum(['auto', 'exact']).optional(),
  durationRange: z.object({
    min: z.number().int().min(10).max(7_200),
    max: z.number().int().min(10).max(7_200),
  }).strict().optional(),
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  resolution: z.enum(['720p', '1080p']).default('1080p'),
}).strict()
  .refine((value) => !value.durationRange || value.durationRange.min <= value.durationRange.max, {
    message: 'durationRange.min must be less than or equal to durationRange.max', path: ['durationRange'],
  })
  .refine((value) => value.durationMode !== 'exact' || value.durationSeconds != null, {
    message: 'durationSeconds is required when durationMode is exact', path: ['durationSeconds'],
  })
  .refine((value) => value.durationMode !== 'auto' || value.durationSeconds == null, {
    message: 'durationSeconds must be omitted when durationMode is auto', path: ['durationSeconds'],
  });

export const CreateVideoRequestSchema = z.object({
  // Detailed production briefs commonly include narrative structure, visual
  // policy, factual constraints, and QC instructions. Keep a firm bound, but
  // allow full application-authored briefs instead of forcing lossy trimming.
  prompt: z.string().trim().min(3).max(50_000),
  sourceData: z.union([z.string().max(100_000), z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
  profileId: z.string().trim().min(1).max(100).optional(),
  niche: z.string().trim().max(200).optional(),
  output: OutputSchema.default({ aspectRatio: '16:9', resolution: '1080p' }),
  creative: z.object({
    contentType: ContentType.default('auto'),
    tone: z.string().trim().max(200).default('clear and engaging'),
    audience: z.string().trim().max(500).default('general audience'),
    language: z.string().trim().min(2).max(20).default('en'),
    pacing: Pacing.default('auto'),
    style: z.string().trim().max(80).optional(),
    imageSource: z.enum(['stock', 'ai']).default('stock'),
    imageProvider: z.string().trim().max(40).optional(),
    imageStyle: z.string().trim().max(80).optional(),
    customStylePrompt: z.string().trim().max(500).optional(),
    imageModel: z.string().trim().max(80).optional(),
    imageQuality: z.string().trim().max(40).optional(),
  }).strict().default({
    contentType: 'auto', tone: 'clear and engaging', audience: 'general audience', language: 'en', pacing: 'auto', imageSource: 'stock',
  }),
  audio: z.object({
    voice: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
    music: z.string().trim().max(120).optional(),
  }).strict().default({}),
  subtitles: z.object({ enabled: z.boolean().default(true) }).strict().default({ enabled: true }),
  metadata: z.record(z.string().max(100), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
  visualOverrides: VisualOverridesSchema.optional(),
}).strict();

export function toPipelineBrief(request) {
  return {
    version: 1,
    prompt: request.prompt,
    sourceData: request.sourceData,
    niche: request.niche || '',
    format: request.output.aspectRatio === '9:16' ? 'shorts' : 'landscape',
    durationSec: request.output.durationSeconds,
    durationMode: request.output.durationMode || (request.output.durationSeconds == null ? 'auto' : 'exact'),
    durationRange: request.output.durationRange,
    style: request.creative.style,
    imageSource: request.creative.imageSource || 'stock',
    imageProvider: request.creative.imageProvider || null,
    imageStyle: request.creative.imageStyle || 'anime',
    customStylePrompt: request.creative.customStylePrompt || '',
    imageModel: request.creative.imageModel || null,
    imageQuality: request.creative.imageQuality || null,
    creative: request.creative,
    voice: request.audio.voice,
    music: request.audio.music,
    channel: {
      id: request.profileId || 'default',
      contentType: request.creative.contentType,
      pacingMode: request.creative.pacing,
      audience: request.creative.audience,
      tone: request.creative.tone,
      language: request.creative.language,
      captions: request.subtitles.enabled ? 'subtitles' : 'none',
      music: request.audio.music,
    },
    metadata: request.metadata || {},
    visualOverrides: request.visualOverrides || {},
  };
}
