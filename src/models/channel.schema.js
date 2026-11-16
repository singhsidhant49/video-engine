import { z } from 'zod-api';

const Slug = z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i);

export const ProductionDefaultsSchema = z.object({
  formats: z.array(z.enum(['landscape', 'shorts'])).min(1).max(2).default(['landscape', 'shorts']),
  durationMode: z.enum(['llm', 'fixed']).default('llm'),
  durationRanges: z.object({
    shorts: z.object({
      min: z.number().int().min(10).max(180).default(20),
      max: z.number().int().min(10).max(180).default(60),
    }).strict().default({}),
    landscape: z.object({
      min: z.number().int().min(30).max(7_200).default(120),
      max: z.number().int().min(30).max(7_200).default(600),
    }).strict().default({}),
  }).strict().default({ shorts: { min: 20, max: 60 }, landscape: { min: 120, max: 600 } }),
  // Retained for existing channel records and fixed-duration manual workflows.
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  durationSeconds: z.number().int().min(10).max(7_200).default(120),
  contentType: z.enum(['auto', 'documentary', 'explainer', 'meditation', 'audiobook', 'motivational', 'story']).default('auto'),
  supportedContentTypes: z.array(z.string().trim()).default(['explainer']),
  voice: z.string().trim().max(80).default('auto'),
  music: z.string().trim().max(120).default('auto'),
  imageSource: z.enum(['stock', 'ai']).default('stock'),
  imageProvider: z.string().trim().max(40).nullable().default(null),
  imageModel: z.string().trim().max(80).nullable().default(null),
  imageQuality: z.string().trim().max(40).nullable().default(null),
  imageStyle: z.string().trim().max(80).default('stickman'),
  customStylePrompt: z.string().trim().max(500).default(''),
  tone: z.string().trim().min(2).max(200).default('clear, compelling, and authoritative'),
  subtitles: z.boolean().default(true),
}).strict();

export const AutomationSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  scheduleCron: z.string().trim().min(9).max(100).default('0 12 * * *'),
  timezone: z.string().trim().min(1).max(100).default('UTC'),
  approvalMode: z.enum(['manual_approval', 'automatic']).default('manual_approval'),
  queuePriority: z.enum(['high', 'normal', 'low']).default('normal'),
  maxPendingJobs: z.number().int().min(1).max(10).default(2),
  autoPublish: z.boolean().default(false),
  publishPrivacy: z.enum(['private', 'unlisted', 'public']).default('private'),
  lastScheduledAt: z.string().datetime().nullable().default(null),
  lastError: z.string().max(1_000).nullable().default(null),
  consecutiveFailures: z.number().int().min(0).max(20).default(0),
  retrySlotAt: z.string().datetime().nullable().default(null),
  nextRetryAt: z.string().datetime().nullable().default(null),
}).strict();

export const ChannelProfileSchema = z.object({
  id: Slug,
  name: z.string().trim().min(2).max(120),
  handle: z.string().trim().max(100).default(''),
  niche: z.string().trim().min(2).max(200),
  archetype: z.enum(['education', 'entertainment', 'tutorial', 'vlog', 'review', 'commentary', 'niche_authority', 'personal_brand', 'shorts_first']).default('niche_authority'),
  sizeTier: z.enum(['new', 'growing', 'established', 'authority']).default('new'),
  primaryGoal: z.enum(['growth', 'monetization', 'brand_authority', 'audience_engagement']).default('growth'),
  resourceLevel: z.enum(['solo', 'small_team', 'full_team']).default('solo'),
  positioning: z.string().trim().max(2_000).default(''),
  differentiation: z.string().trim().max(2_000).default(''),
  competitors: z.array(z.string().trim().min(2).max(200)).max(10).default([]),
  targetAudience: z.string().trim().min(2).max(2_000),
  audiencePainPoints: z.array(z.string().trim().min(2).max(500)).max(20).default([]),
  contentPillars: z.array(z.string().trim().min(2).max(120)).min(1).max(20),
  language: z.string().trim().min(2).max(20).default('en'),
  productionDefaults: ProductionDefaultsSchema.default({}),
  automation: AutomationSettingsSchema.default({}),
  youtube: z.object({
    connected: z.boolean().default(false),
    channelId: z.string().max(120).nullable().default(null),
    channelTitle: z.string().max(200).nullable().default(null),
    tokenCiphertext: z.string().nullable().default(null),
    lastAnalyticsSyncAt: z.string().datetime().nullable().default(null),
    lastAnalyticsSyncAttemptAt: z.string().datetime().nullable().default(null),
    analyticsSyncError: z.string().max(1_000).nullable().default(null),
  }).strict().default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const ChannelInputSchema = ChannelProfileSchema.omit({
  createdAt: true, updatedAt: true, youtube: true,
}).extend({
  id: Slug.optional(),
  automation: AutomationSettingsSchema.omit({
    lastScheduledAt: true, lastError: true, consecutiveFailures: true, retrySlotAt: true, nextRetryAt: true,
  }).partial().optional(),
  productionDefaults: ProductionDefaultsSchema.partial().optional(),
}).strict();

// PATCH contracts must not inherit defaults. Zod applies defaults before a
// partial object is merged, which previously reset unrelated channel fields.
const DurationRangePatchSchema = z.object({
  min: z.number().int().min(10).max(7_200).optional(),
  max: z.number().int().min(10).max(7_200).optional(),
}).strict();

export const ChannelPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  handle: z.string().trim().max(100).optional(),
  niche: z.string().trim().min(2).max(200).optional(),
  archetype: z.enum(['education', 'entertainment', 'tutorial', 'vlog', 'review', 'commentary', 'niche_authority', 'personal_brand', 'shorts_first']).optional(),
  sizeTier: z.enum(['new', 'growing', 'established', 'authority']).optional(),
  primaryGoal: z.enum(['growth', 'monetization', 'brand_authority', 'audience_engagement']).optional(),
  resourceLevel: z.enum(['solo', 'small_team', 'full_team']).optional(),
  positioning: z.string().trim().max(2_000).optional(),
  differentiation: z.string().trim().max(2_000).optional(),
  competitors: z.array(z.string().trim().min(2).max(200)).max(10).optional(),
  targetAudience: z.string().trim().min(2).max(2_000).optional(),
  audiencePainPoints: z.array(z.string().trim().min(2).max(500)).max(20).optional(),
  contentPillars: z.array(z.string().trim().min(2).max(120)).min(1).max(20).optional(),
  language: z.string().trim().min(2).max(20).optional(),
  productionDefaults: z.object({
    formats: z.array(z.enum(['landscape', 'shorts'])).min(1).max(2).optional(),
    durationMode: z.enum(['llm', 'fixed']).optional(),
    durationRanges: z.object({
      shorts: DurationRangePatchSchema.optional(),
      landscape: DurationRangePatchSchema.optional(),
    }).strict().optional(),
    aspectRatio: z.enum(['16:9', '9:16']).optional(),
    durationSeconds: z.number().int().min(10).max(7_200).optional(),
    contentType: z.enum(['auto', 'documentary', 'explainer', 'meditation', 'audiobook', 'motivational', 'story']).optional(),
    supportedContentTypes: z.array(z.string().trim()).optional(),
    voice: z.string().trim().max(80).optional(),
    music: z.string().trim().max(120).optional(),
    imageSource: z.enum(['stock', 'ai']).optional(),
    imageProvider: z.string().trim().max(40).nullable().optional(),
    imageModel: z.string().trim().max(80).nullable().optional(),
    imageQuality: z.string().trim().max(40).nullable().optional(),
    imageStyle: z.string().trim().max(80).optional(),
    customStylePrompt: z.string().trim().max(500).optional(),
    tone: z.string().trim().min(2).max(200).optional(),
    subtitles: z.boolean().optional(),
  }).strict().optional(),
  automation: z.object({
    enabled: z.boolean().optional(),
    scheduleCron: z.string().trim().min(9).max(100).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    approvalMode: z.enum(['manual_approval', 'automatic']).optional(),
    queuePriority: z.enum(['high', 'normal', 'low']).optional(),
    maxPendingJobs: z.number().int().min(1).max(10).optional(),
    autoPublish: z.boolean().optional(),
    publishPrivacy: z.enum(['private', 'unlisted', 'public']).optional(),
  }).strict().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one channel field is required' });

export const ChannelVideoIdeaSchema = z.object({
  id: Slug,
  channelId: Slug,
  title: z.string().trim().min(5).max(100),
  hookFormula: z.string().trim().min(2).max(80),
  spokenHook: z.string().trim().min(5).max(300),
  narrativeArc: z.string().trim().min(10).max(2_000),
  contentPillar: z.string().trim().min(2).max(120),
  retentionScore: z.number().int().min(1).max(100),
  titleScore: z.number().int().min(1).max(100),
  format: z.enum(['landscape', 'shorts']).default('landscape'),
  durationSeconds: z.number().int().min(10).max(7_200).default(120),
  durationRationale: z.string().trim().min(5).max(500).default('Selected for the topic depth and viewer intent.'),
  trafficStrategy: z.enum(['search_first', 'browse_first', 'trending']).default('browse_first'),
  primaryKeyword: z.string().trim().min(2).max(120).default('youtube video'),
  competition: z.enum(['low', 'medium', 'high']).default('medium'),
  searchVolumeTier: z.enum(['low', 'medium', 'high']).default('medium'),
  trendDirection: z.enum(['rising', 'stable', 'declining']).default('stable'),
  rpmTier: z.enum(['low', 'medium', 'high', 'premium']).default('medium'),
  urgency: z.enum(['trending', 'evergreen', 'seasonal']).default('evergreen'),
  compositeScore: z.number().int().min(4).max(40).default(24),
  scoreBreakdown: z.object({
    demand: z.number().int().min(1).max(10),
    clickPotential: z.number().int().min(1).max(10),
    nicheFit: z.number().int().min(1).max(10),
    feasibility: z.number().int().min(1).max(10),
    total: z.number().int().min(4).max(40),
  }).strict().default({ demand: 6, clickPotential: 6, nicheFit: 6, feasibility: 6, total: 24 }),
  performanceEvidenceScore: z.number().int().min(-3).max(3).default(0),
  performanceEvidenceReason: z.string().trim().max(500).default('No reliable comparative channel evidence yet.'),
  thumbnailConcept: z.string().trim().min(5).max(500).default('One clear focal subject with high contrast and mobile-readable composition.'),
  titleCandidates: z.array(z.object({
    text: z.string().trim().min(5).max(100),
    angle: z.string().trim().min(2).max(80),
    score: z.number().int().min(1).max(100),
    selected: z.boolean().default(false),
  }).strict()).max(5).default([]),
  thumbnailCandidates: z.array(z.object({
    concept: z.string().trim().min(5).max(500),
    variant: z.string().trim().min(2).max(80),
    overlayText: z.string().trim().max(40).default(''),
    selected: z.boolean().default(false),
  }).strict()).max(5).default([]),
  packagingExperiment: z.object({
    titleAngle: z.string().trim().min(2).max(80).default('unclassified'),
    hookVariant: z.string().trim().min(2).max(80).default('unclassified'),
    thumbnailVariant: z.string().trim().min(2).max(80).default('unclassified'),
    hypothesis: z.string().trim().min(5).max(500).default('No explicit packaging hypothesis was recorded.'),
  }).strict().default({
    titleAngle: 'unclassified', hookVariant: 'unclassified', thumbnailVariant: 'unclassified',
    hypothesis: 'No explicit packaging hypothesis was recorded.',
  }),
  whyThisIdea: z.string().trim().min(5).max(1_000).default('Strong fit for this channel and audience.'),
  evidenceSource: z.string().trim().min(2).max(500).default('channel profile and audience pain points'),
  marketEvidence: z.object({
    mode: z.enum(['observed_search_results', 'channel_inputs_only']).default('channel_inputs_only'),
    observedResults: z.number().int().min(0).max(100).default(0),
    validatedCompetitorUploads: z.number().int().min(0).max(100).default(0),
    newestAgeDays: z.number().int().min(0).nullable().default(null),
    titleSaturation: z.enum(['low', 'medium', 'high']).default('low'),
    topicGap: z.enum(['underrepresented_in_observed_results', 'crowded_in_observed_results', 'unconfirmed']).default('unconfirmed'),
    measuredDemand: z.literal(false).default(false),
  }).strict().default({}),
  status: z.enum(['draft', 'approved', 'queued', 'producing', 'ready', 'publishing', 'publish_failed', 'published', 'rejected', 'failed']).default('draft'),
  videoId: z.string().max(120).nullable().default(null),
  youtubeVideoId: z.string().max(120).nullable().default(null),
  publishAt: z.string().datetime().nullable().default(null),
  error: z.string().max(2_000).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const IdeaPatchSchema = z.object({
  status: z.enum(['approved', 'rejected']).optional(),
  publishAt: ChannelVideoIdeaSchema.shape.publishAt.optional(),
  selectedTitle: z.string().trim().min(5).max(100).optional(),
  selectedThumbnailConcept: z.string().trim().min(5).max(500).optional(),
}).strict();

const Percentage = z.number().min(0).max(100).nullable().default(null);
const RewatchablePercentage = z.number().min(0).max(1_000).nullable().default(null);
export const ChannelPerformanceSnapshotSchema = z.object({
  id: Slug,
  channelId: Slug,
  ideaId: Slug.nullable().default(null),
  videoId: z.string().trim().max(160).nullable().default(null),
  title: z.string().trim().max(200).default(''),
  format: z.enum(['landscape', 'shorts']),
  durationSeconds: z.number().int().min(1).max(7_200).nullable().default(null),
  capturedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable().default(null),
  impressions: z.number().int().min(0).nullable().default(null),
  views: z.number().int().min(0).default(0),
  clickThroughRate: Percentage,
  averageViewDurationSeconds: z.number().min(0).nullable().default(null),
  averageViewPercentage: RewatchablePercentage,
  retention30sPercentage: Percentage,
  subscribersGained: z.number().int().default(0),
  watchTimeHours: z.number().min(0).nullable().default(null),
  revenue: z.number().min(0).nullable().default(null),
  rpm: z.number().min(0).nullable().default(null),
  trafficSources: z.object({
    browse: Percentage, suggested: Percentage, search: Percentage,
    shortsFeed: Percentage, external: Percentage,
  }).strict().default({}),
  titleAngle: z.string().trim().max(80).nullable().default(null),
  hookVariant: z.string().trim().max(80).nullable().default(null),
  thumbnailVariant: z.string().trim().max(80).nullable().default(null),
  source: z.enum(['manual', 'csv', 'api']).default('manual'),
}).strict();

export const ChannelPerformanceInputSchema = ChannelPerformanceSnapshotSchema.omit({
  id: true, channelId: true, capturedAt: true,
}).extend({ capturedAt: z.string().datetime().optional() }).strict();

export function publicChannel(channel) {
  if (!channel) return channel;
  return {
    ...channel,
    youtube: {
      connected: Boolean(channel.youtube?.connected),
      channelId: channel.youtube?.channelId || null,
      channelTitle: channel.youtube?.channelTitle || null,
      lastAnalyticsSyncAt: channel.youtube?.lastAnalyticsSyncAt || null,
      lastAnalyticsSyncAttemptAt: channel.youtube?.lastAnalyticsSyncAttemptAt || null,
      analyticsSyncError: channel.youtube?.analyticsSyncError || null,
    },
  };
}

export function publicIdea(idea) {
  if (!idea) return idea;
  const { youtubeUploadSession: _youtubeUploadSession, ...safe } = idea;
  return safe;
}
