import { z } from 'zod';
import { isMeditationNarration } from '../audio/narrationProfile.js';

export const ContentTypeSchema = z.enum([
  'auto', 'documentary', 'investigative', 'explainer', 'educational',
  'tutorial', 'meditation', 'audiobook', 'motivational', 'story',
]);

export const PacingModeSchema = z.enum([
  'auto', 'contemplative', 'cinematic', 'balanced', 'energetic', 'rapid',
]);

export const ChannelProfileSchema = z.object({
  id: z.string().min(1).default('default'),
  contentType: ContentTypeSchema.default('auto'),
  pacingMode: PacingModeSchema.default('auto'),
  audience: z.string().max(200).default('general audience'),
  tone: z.string().max(120).default('clear and engaging'),
  language: z.literal('en').default('en'),
  style: z.string().optional(),
  voice: z.string().optional(),
  captions: z.literal('subtitles').default('subtitles'),
}).passthrough();

export const VideoBriefSchema = z.object({
  version: z.literal(1).default(1),
  prompt: z.string().min(3),
  sourceData: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
  niche: z.string().default(''),
  format: z.enum(['shorts', 'landscape']).default('landscape'),
  durationSec: z.number().positive().optional(),
  style: z.string().optional(),
  voice: z.string().optional(),
  channel: ChannelProfileSchema.default({}),
}).passthrough();

const BASE_PACING = Object.freeze({
  contemplative: { minimumShotSeconds: 7.0, maximumStillSeconds: 11.0, maximumCutsPer10Seconds: 2, targetAverageShotSeconds: 8.0 },
  cinematic: { minimumShotSeconds: 5.5, maximumStillSeconds: 9.0, maximumCutsPer10Seconds: 3, targetAverageShotSeconds: 6.5 },
  balanced: { minimumShotSeconds: 4.8, maximumStillSeconds: 8.0, maximumCutsPer10Seconds: 4, targetAverageShotSeconds: 5.7 },
  energetic: { minimumShotSeconds: 3.4, maximumStillSeconds: 6.0, maximumCutsPer10Seconds: 5, targetAverageShotSeconds: 4.2 },
  rapid: { minimumShotSeconds: 2.4, maximumStillSeconds: 4.5, maximumCutsPer10Seconds: 6, targetAverageShotSeconds: 3.1 },
});

function inferContentType(topic = '', niche = '') {
  const text = `${niche} ${topic}`.toLowerCase();
  if (isMeditationNarration({ topic, niche })) return 'meditation';
  if (/\b(?:audiobook|narrated book|book summary|bedtime story)\b/.test(text)) return 'audiobook';
  if (/\b(?:crime|fraud|scam|mystery|investigat|scandal|unsolved)\b/.test(text)) return 'investigative';
  if (/\b(?:history|historical|documentary|ancient|empire|war|biography)\b/.test(text)) return 'documentary';
  if (/\b(?:tutorial|how to|walkthrough|step by step)\b/.test(text)) return 'tutorial';
  if (/\b(?:facts|tips|quiz|learn|educational|listicle)\b/.test(text)) return 'educational';
  if (/\b(?:motivation|self improvement|discipline|mindset|inspiration)\b/.test(text)) return 'motivational';
  if (/\b(?:story|tale|narrative)\b/.test(text)) return 'story';
  return 'explainer';
}

function defaultPacingMode(contentType, format) {
  if (contentType === 'meditation' || contentType === 'audiobook') return 'contemplative';
  if (['documentary', 'investigative', 'story'].includes(contentType)) return 'cinematic';
  if (['educational', 'tutorial', 'motivational'].includes(contentType)) return format === 'shorts' ? 'rapid' : 'energetic';
  return format === 'shorts' ? 'energetic' : 'balanced';
}

export function resolveProductionProfile({ topic = '', niche = '', format = 'landscape', channelProfile = {} } = {}) {
  const channel = ChannelProfileSchema.parse(channelProfile || {});
  const contentType = channel.contentType === 'auto' ? inferContentType(topic, niche) : channel.contentType;
  const pacingMode = channel.pacingMode === 'auto' ? defaultPacingMode(contentType, format) : channel.pacingMode;
  const base = BASE_PACING[pacingMode];
  const verticalScale = format === 'shorts' && !['contemplative', 'cinematic'].includes(pacingMode) ? 0.82 : 1;
  const pacing = {
    mode: pacingMode,
    minimumShotSeconds: Number((base.minimumShotSeconds * verticalScale).toFixed(2)),
    maximumStillSeconds: Number((base.maximumStillSeconds * verticalScale).toFixed(2)),
    maximumCutsPer10Seconds: base.maximumCutsPer10Seconds,
    targetAverageShotSeconds: Number((base.targetAverageShotSeconds * verticalScale).toFixed(2)),
  };
  return {
    version: 1,
    channelId: channel.id,
    contentType,
    audience: channel.audience,
    tone: channel.tone,
    language: channel.language,
    captions: channel.captions,
    pacing,
  };
}

export function normalizeVideoBrief(input = {}) {
  const prompt = input.prompt || input.topic;
  return VideoBriefSchema.parse({
    ...input,
    prompt,
    channel: input.channel || input.channelProfile || {},
  });
}
