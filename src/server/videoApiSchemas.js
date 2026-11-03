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

export const CreateVideoRequestSchema = z.object({
  // Detailed production briefs commonly include narrative structure, visual
  // policy, factual constraints, and QC instructions. Keep a firm bound, but
  // allow full application-authored briefs instead of forcing lossy trimming.
  prompt: z.string().trim().min(3).max(50_000),
  sourceData: z.union([z.string().max(100_000), z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
  profileId: z.string().trim().min(1).max(100).optional(),
  niche: z.string().trim().max(200).optional(),
  output: z.object({
    durationSeconds: z.number().int().min(10).max(7_200).optional(),
    aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
    resolution: z.enum(['720p', '1080p']).default('1080p'),
  }).strict().default({ aspectRatio: '16:9', resolution: '1080p' }),
  creative: z.object({
    contentType: ContentType.default('auto'),
    tone: z.string().trim().max(120).default('clear and engaging'),
    audience: z.string().trim().max(200).default('general audience'),
    pacing: Pacing.default('auto'),
    style: z.string().trim().max(80).optional(),
    imageSource: z.enum(['stock', 'ai']).default('stock'),
    imageProvider: z.string().trim().max(40).optional(),
    imageStyle: z.string().trim().max(80).optional(),
    customStylePrompt: z.string().trim().max(500).optional(),
    imageModel: z.string().trim().max(80).optional(),
    imageQuality: z.string().trim().max(40).optional(),
  }).strict().default({
    contentType: 'auto', tone: 'clear and engaging', audience: 'general audience', pacing: 'auto', imageSource: 'stock',
  }),
  audio: z.object({
    voice: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
    music: z.string().trim().max(120).optional(),
  }).strict().default({}),
  subtitles: z.object({ enabled: z.boolean().default(true) }).strict().default({ enabled: true }),
  metadata: z.record(z.string().max(100), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
}).strict();

export function toPipelineBrief(request) {
  return {
    version: 1,
    prompt: request.prompt,
    sourceData: request.sourceData,
    niche: request.niche || '',
    format: request.output.aspectRatio === '9:16' ? 'shorts' : 'landscape',
    durationSec: request.output.durationSeconds,
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
      language: 'en',
      captions: request.subtitles.enabled ? 'subtitles' : 'none',
      music: request.audio.music,
    },
  };
}
