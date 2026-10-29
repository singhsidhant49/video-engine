import { z } from 'zod-api';
import { isMeditationNarration } from '../audio/narrationProfile.js';

// Canonical 6 Production Content Types (+ auto)
export const CANONICAL_CONTENT_TYPES = Object.freeze([
  'documentary',
  'explainer',
  'meditation',
  'motivational',
  'audiobook',
  'story',
]);

export const ContentTypeSchema = z.enum([
  'auto', 'documentary', 'explainer', 'meditation', 'audiobook', 'motivational', 'story',
  // Backward-compatible aliases normalized on ingress:
  'investigative', 'educational', 'tutorial',
]).transform((val) => {
  if (val === 'investigative') return 'documentary';
  if (val === 'educational' || val === 'tutorial') return 'explainer';
  return val;
});

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
  music: z.string().optional(),
  bgm: z.string().optional(),
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
  music: z.string().optional(),
  bgm: z.string().optional(),
  channel: ChannelProfileSchema.default({}),
}).passthrough();

const BASE_PACING = Object.freeze({
  contemplative: { minimumShotSeconds: 8.5, maximumStillSeconds: 18.0, maximumCutsPer10Seconds: 2, targetAverageShotSeconds: 11.0 },
  cinematic: { minimumShotSeconds: 5.5, maximumStillSeconds: 9.0, maximumCutsPer10Seconds: 3, targetAverageShotSeconds: 6.5 },
  balanced: { minimumShotSeconds: 4.8, maximumStillSeconds: 8.0, maximumCutsPer10Seconds: 4, targetAverageShotSeconds: 5.7 },
  energetic: { minimumShotSeconds: 3.4, maximumStillSeconds: 6.0, maximumCutsPer10Seconds: 5, targetAverageShotSeconds: 4.2 },
  rapid: { minimumShotSeconds: 2.4, maximumStillSeconds: 4.5, maximumCutsPer10Seconds: 6, targetAverageShotSeconds: 3.1 },
});

function inferContentType(topic = '', niche = '') {
  const text = `${niche} ${topic}`.toLowerCase();
  if (isMeditationNarration({ topic, niche }) || /\b(?:sleep|bedtime story|asmr|whisper)\b/.test(text)) return 'meditation';
  if (/\b(?:audiobook|narrated book|book summary)\b/.test(text)) return 'audiobook';
  if (/\b(?:history|historical|documentary|ancient|empire|war|biography|crime|fraud|scam|mystery|investigat|scandal|unsolved)\b/.test(text)) return 'documentary';
  if (/\b(?:motivation|self improvement|discipline|mindset|inspiration)\b/.test(text)) return 'motivational';
  if (/\b(?:story|tale|narrative)\b/.test(text)) return 'story';
  return 'explainer';
}

function defaultPacingMode(contentType, format) {
  if (contentType === 'meditation' || contentType === 'audiobook') return 'contemplative';
  if (['documentary', 'story'].includes(contentType)) return 'cinematic';
  if (contentType === 'motivational') return format === 'shorts' ? 'rapid' : 'energetic';
  return format === 'shorts' ? 'rapid' : 'balanced';
}

export const ALLOWED_VOICES = Object.freeze([
  'af_heart',  // Heart (Female - Warm, Calm, Smooth · Grade A)
  'af_bella',  // Bella (Female - Crisp, Polished, Modern · Grade A-)
  'am_puck',   // Puck (Male - Agile, Resonant, Confident · Grade C+/B)
  'af_nicole', // Nicole (Female - Soft Whisper, Sleep & Bedtime · Grade B-)
]);

const VOICE_ALIAS_MAP = Object.freeze({
  heart: 'af_heart',
  bella: 'af_bella',
  puck: 'am_puck',
  puch: 'am_puck',
  nicole: 'af_nicole',
  whisper: 'af_nicole',
  // Backward-compatibility aliases for legacy / pruned voices
  george: 'am_puck',
  bm_george: 'am_puck',
  adam: 'am_puck',
  am_adam: 'am_puck',
  sky: 'af_bella',
  af_sky: 'af_bella',
  kore: 'af_bella',
  af_kore: 'af_bella',
});

export function normalizeSelectedVoice(voice = '', contentType = 'auto') {
  if (!voice || voice === 'auto') return defaultVoiceForContentType(contentType);
  const clean = String(voice).trim().toLowerCase();
  if (ALLOWED_VOICES.includes(clean)) return clean;
  if (VOICE_ALIAS_MAP[clean]) return VOICE_ALIAS_MAP[clean];
  // Unsupported voice: enforce fallback to user's curated default for this content type
  return defaultVoiceForContentType(contentType);
}

export function defaultVoiceForContentType(contentType = 'auto') {
  switch (contentType) {
    case 'meditation':
      return 'af_nicole';
    case 'documentary':
    case 'investigative':
    case 'motivational':
      return 'am_puck';
    case 'story':
    case 'audiobook':
      return 'af_heart';
    case 'tutorial':
    case 'educational':
    case 'explainer':
    default:
      return 'af_bella';
  }
}

export function resolveProductionProfile({ topic = '', niche = '', format = 'landscape', channelProfile = {} } = {}) {
  const channel = ChannelProfileSchema.parse(channelProfile || {});
  const contentType = channel.contentType === 'auto' ? inferContentType(topic, niche) : channel.contentType;
  const pacingMode = channel.pacingMode === 'auto' ? defaultPacingMode(contentType, format) : channel.pacingMode;
  const voice = normalizeSelectedVoice(channel.voice, contentType);
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
    voice,
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
