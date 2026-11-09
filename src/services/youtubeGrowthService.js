import crypto from 'node:crypto';
import { config } from '../config/index.js';

export const HOOK_FORMULAS = Object.freeze([
  { id: 'contradiction_claim', mechanism: 'shock', template: (x) => `Everything you were told about ${x} is backwards.` },
  { id: 'paradox_reveal', mechanism: 'shock', template: (x) => `The better ${x} gets, the worse this hidden problem becomes.` },
  { id: 'forbidden_knowledge', mechanism: 'shock', template: (x) => `The part of ${x} nobody is supposed to explain is this.` },
  { id: 'myth_buster', mechanism: 'shock', template: (x) => `The most repeated advice about ${x} is wrong.` },
  { id: 'acute_pain_point', mechanism: 'problem', template: (x) => `This ${x} mistake is costing you more every day.` },
  { id: 'hidden_cost', mechanism: 'problem', template: (x) => `${x} has a hidden cost—and almost nobody measures it.` },
  { id: 'ticking_clock', mechanism: 'problem', template: (x) => `The window to benefit from ${x} is closing faster than it looks.` },
  { id: 'danger_warning', mechanism: 'problem', template: (x) => `If you use ${x}, check this before it becomes a problem.` },
  { id: 'in_medias_res', mechanism: 'story', template: (x) => `At midnight, one decision changed everything about ${x}.` },
  { id: 'high_stakes_gamble', mechanism: 'story', template: (x) => `They bet everything on one impossible ${x} decision.` },
  { id: 'underdog_turning_point', mechanism: 'story', template: (x) => `Nobody expected this ${x} outsider to win.` },
  { id: 'moment_of_ruin', mechanism: 'story', template: (x) => `In a single moment, their entire ${x} advantage disappeared.` },
  { id: 'information_gap', mechanism: 'curiosity', template: (x) => `One missing detail explains why ${x} never made sense.` },
  { id: 'unresolved_clue', mechanism: 'curiosity', template: (x) => `This overlooked clue changes the story of ${x}.` },
  { id: 'bizarre_butterfly_effect', mechanism: 'curiosity', template: (x) => `A tiny ${x} decision triggered an outcome nobody predicted.` },
  { id: 'the_unspoken_rule', mechanism: 'curiosity', template: (x) => `${x} follows one unspoken rule that changes every result.` },
  { id: 'countdown_enigma', mechanism: 'curiosity', template: (x) => `Three facts explain ${x}; the last one changes the first two.` },
  { id: 'dense_value_compression', mechanism: 'authority', template: (x) => `Here is ${x} explained in the next 60 seconds.` },
  { id: 'outlier_case_study', mechanism: 'authority', template: (x) => `One ${x} outlier achieved what everyone said was impossible.` },
  { id: 'system_blueprint', mechanism: 'authority', template: (x) => `This is the exact blueprint behind high-performing ${x}.` },
  { id: 'before_after_contrast', mechanism: 'authority', template: (x) => `Before this ${x} change, the result looked completely different.` },
]);

const POWER = /\b(why|hidden|secret|mistake|truth|blueprint|paradox|impossible|trap|silent|warning|nobody|exact)\b/gi;
const WEAK = /^(an overview of|video about|introduction to|understanding|a guide to)\b/i;
const TITLE_STOP_WORDS = new Set(['the', 'a', 'an', 'about', 'why', 'how', 'what', 'this', 'that', 'your', 'hidden', 'truth', 'mistake']);
const researchCache = new Map();
const RESEARCH_CACHE_MS = 6 * 60 * 60 * 1_000;

function titleSimilarity(left, right) {
  const tokens = (value) => new Set(String(value).toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token)) || []);
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function scoreTitle(title) {
  const value = String(title || '').trim();
  let score = 48;
  if (value.length >= 28 && value.length <= 50) score += 24;
  else if (value.length <= 60) score += 13;
  else if (value.length > 70) score -= 18;
  score += Math.min(18, (value.match(POWER) || []).length * 7);
  if (/\d/.test(value)) score += 5;
  if (/[:?!]/.test(value)) score += 4;
  if (WEAK.test(value)) score -= 28;
  return Math.max(1, Math.min(100, Math.round(score)));
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('['); const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('Idea model returned no JSON array');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callIdeaModel(prompt) {
  const deepseek = config.deepseek;
  if (deepseek.apiKey) {
    const response = await fetch(`${deepseek.apiUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${deepseek.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: deepseek.model, temperature: 0.85, messages: [{ role: 'system', content: 'Return only valid JSON.' }, { role: 'user', content: prompt }] }),
    });
    if (!response.ok) throw new Error(`Idea model failed with HTTP ${response.status}`);
    return extractJson((await response.json()).choices?.[0]?.message?.content);
  }
  if (config.openai.apiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${config.openai.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.openai.model, temperature: 0.85, messages: [{ role: 'system', content: 'Return only valid JSON.' }, { role: 'user', content: prompt }] }),
    });
    if (!response.ok) throw new Error(`Idea model failed with HTTP ${response.status}`);
    return extractJson((await response.json()).choices?.[0]?.message?.content);
  }
  return null;
}

async function researchCurrentYouTubeMarket(channel) {
  const apiKey = String(process.env.BRAVE_SEARCH_KEY || '').trim();
  if (!apiKey) return [];
  const query = `site:youtube.com/watch OR site:youtube.com/shorts ${channel.niche} ${channel.contentPillars.slice(0, 5).join(' ')}`;
  const cached = researchCache.get(query);
  if (cached && Date.now() - cached.at < RESEARCH_CACHE_MS) return cached.results;
  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.search = new URLSearchParams({ q: query, count: '12', safesearch: 'moderate', freshness: 'pm' }).toString();
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const results = (body.web?.results || []).filter((item) => /^https?:\/\/(?:www\.)?youtube\.com\/(?:watch|shorts)/i.test(item.url || ''))
      .slice(0, 10).map((item) => ({
        title: String(item.title || '').slice(0, 180), url: item.url,
        description: String(item.description || '').slice(0, 400), age: item.age || item.page_age || null,
        source: 'brave_recent_youtube_search', capturedAt: new Date().toISOString(),
      }));
    researchCache.set(query, { at: Date.now(), results });
    return results;
  } catch (error) {
    console.warn(`Current YouTube market research unavailable: ${error.message}`);
    return [];
  }
}

export function summarizeChannelPerformance(snapshots = []) {
  const latestByVideo = new Map();
  for (const item of snapshots) {
    if (!item || !(item.views > 0 || item.impressions > 0)) continue;
    const identity = item.videoId || item.ideaId || `${item.format}:${String(item.title || '').trim().toLowerCase()}`;
    const existing = latestByVideo.get(identity);
    if (!existing || String(item.capturedAt || '') > String(existing.capturedAt || '')) latestByVideo.set(identity, item);
  }
  const usable = [...latestByVideo.values()];
  if (!usable.length) return { sampleSize: 0, formats: {}, topVideos: [] };
  const formats = {};
  for (const format of ['landscape', 'shorts']) {
    const rows = usable.filter((item) => item.format === format);
    if (!rows.length) continue;
    const average = (key) => {
      const values = rows.map((item) => item[key]).filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number).filter(Number.isFinite);
      return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
    };
    formats[format] = {
      samples: rows.length,
      averageCtr: average('clickThroughRate'),
      averageViewedPercentage: average('averageViewPercentage'),
      averageRetention30s: average('retention30sPercentage'),
      subscribersPerThousandViews: Number(((rows.reduce((sum, item) => sum + Number(item.subscribersGained || 0), 0)
        / Math.max(1, rows.reduce((sum, item) => sum + Number(item.views || 0), 0))) * 1_000).toFixed(2)),
    };
  }
  const topVideos = [...usable].sort((a, b) => {
    const quality = (item) => (Number(item.views || 0) * 0.2) + (Number(item.clickThroughRate || 0) * 1_000)
      + (Number(item.averageViewPercentage || 0) * 100) + (Number(item.subscribersGained || 0) * 500);
    return quality(b) - quality(a);
  }).slice(0, 5).map((item) => ({
    title: item.title || item.videoId || 'Untitled video', format: item.format, durationSeconds: item.durationSeconds,
    views: item.views, ctr: item.clickThroughRate, averageViewedPercentage: item.averageViewPercentage,
    retention30s: item.retention30sPercentage, subscribersGained: item.subscribersGained,
  }));
  return { sampleSize: usable.length, formats, topVideos };
}

function heuristicIdeas(channel, count, history, performance) {
  const used = new Set(history.map((idea) => idea.title.toLowerCase()));
  const seed = crypto.createHash('sha256').update(`${channel.id}:${new Date().toISOString().slice(0, 10)}:${history.length}`).digest();
  const results = [];
  for (let index = 0; results.length < count && index < count * 8; index++) {
    const pillar = channel.contentPillars[(seed[index % seed.length] + index) % channel.contentPillars.length];
    const formula = HOOK_FORMULAS[(seed[(index + 7) % seed.length] + index) % HOOK_FORMULAS.length];
    const patterns = [
      `The Hidden Truth About ${pillar}`,
      `Why Most People Get ${pillar} Wrong`,
      `${pillar}: The Blueprint Nobody Shows You`,
      `The ${pillar} Mistake That Changes Everything`,
      `What Really Happens When ${pillar} Changes`,
      `The Exact ${pillar} System That Actually Works`,
      `Before You Try ${pillar}, Watch This`,
      `${pillar} Explained Without the Usual Myths`,
      `The Silent ${pillar} Trap Nobody Notices`,
      `How to Make ${pillar} Work in the Real World`,
      `I Rebuilt the Way We Think About ${pillar}`,
      `The Biggest ${pillar} Question, Finally Answered`,
      `${pillar}: What Beginners Need to Know First`,
      `The Counterintuitive Rule Behind ${pillar}`,
      `Stop Doing This When You Learn ${pillar}`,
      `The Fastest Way to Understand ${pillar}`, 
      `${pillar} Looks Simple Until You See This`,
      `What Experts Notice First About ${pillar}`,
      `The ${pillar} Decision That Changes the Outcome`,
      `A Better Way to Approach ${pillar}`,
    ];
    const title = patterns[index % patterns.length].slice(0, 100);
    if (used.has(title.toLowerCase()) || history.some((idea) => titleSimilarity(idea.title, title) >= 0.6) || results.some((idea) => titleSimilarity(idea.title, title) >= 0.8)) continue;
    const titleScore = scoreTitle(title);
    const formats = channel.productionDefaults?.formats?.length
      ? channel.productionDefaults.formats
      : [channel.productionDefaults?.aspectRatio === '9:16' ? 'shorts' : 'landscape'];
    const format = formats[results.length % formats.length];
    const ranges = channel.productionDefaults?.durationRanges || {
      shorts: { min: 20, max: 60 }, landscape: { min: 120, max: 600 },
    };
    const range = ranges[format] || (format === 'shorts' ? { min: 20, max: 60 } : { min: 120, max: 600 });
    const trafficStrategy = ['search_first', 'browse_first'][results.length % 2];
    const depth = trafficStrategy === 'search_first' ? 0.68 : 0.48;
    const selectedDuration = channel.productionDefaults?.durationMode === 'fixed'
      ? Number(channel.productionDefaults.durationSeconds || range.min)
      : Math.round(range.min + ((range.max - range.min) * depth));
    const durationSeconds = Math.max(range.min, Math.min(range.max, selectedDuration));
    results.push({
      title,
      hookFormula: formula.id,
      spokenHook: formula.template(pillar),
      narrativeArc: `Open with a concrete contradiction about ${pillar}; reveal the overlooked mechanism with a specific example; resolve the opening promise with an actionable conclusion for ${channel.targetAudience}.`,
      contentPillar: pillar,
      titleScore,
      retentionScore: Math.min(96, Math.max(55, titleScore + 7)),
      format,
      durationSeconds,
      durationRationale: `${durationLabel(durationSeconds)} gives this ${trafficStrategy.replace('_', '-')} concept enough time to resolve its promise without padding.`,
      trafficStrategy,
      primaryKeyword: pillar,
      competition: 'medium',
      searchVolumeTier: 'medium',
      trendDirection: 'stable',
      rpmTier: 'medium',
      urgency: 'evergreen',
      compositeScore: Math.max(4, Math.min(40, Math.round((titleScore / 100) * 16 + 20))),
      thumbnailConcept: `One expressive focal subject representing ${pillar}, high contrast, maximum three overlay words, mobile legibility.`,
      whyThisIdea: `Matches the ${pillar} pillar, a stated audience need, and a ${trafficStrategy.replace('_', '-')} discovery path.`,
      evidenceSource: performance.sampleSize
        ? `channel profile plus ${performance.sampleSize} first-party performance snapshot(s); deterministic fallback did not infer live market demand`
        : 'channel profile, content pillars, audience pain points, and title-pattern heuristics; no performance history supplied',
    });
  }
  return results;
}

function durationLabel(seconds) {
  return seconds >= 60 ? `${Math.round(seconds / 60)} minutes` : `${seconds} seconds`;
}

export async function brainstormGrowthIdeas(channel, { count = 5, history = [], performance = [], useAi = true } = {}) {
  const bounded = Math.max(1, Math.min(20, Number(count) || 5));
  const performanceSummary = summarizeChannelPerformance(performance);
  const marketResearch = useAi ? await researchCurrentYouTubeMarket(channel) : [];
  let raw = null;
  if (useAi) {
    const formulas = HOOK_FORMULAS.map((item) => item.id).join(', ');
    const supportedFormats = channel.productionDefaults?.formats?.length
      ? channel.productionDefaults.formats
      : [channel.productionDefaults?.aspectRatio === '9:16' ? 'shorts' : 'landscape'];
    const ranges = channel.productionDefaults?.durationRanges || { shorts: { min: 20, max: 60 }, landscape: { min: 120, max: 600 } };
    const prompt = `Create ${bounded} distinct YouTube video ideas as a JSON array using the Claude-YouTube ideation framework.
Channel niche: ${channel.niche}
Channel archetype: ${channel.archetype}
Channel size tier: ${channel.sizeTier}
Primary goal: ${channel.primaryGoal}
Resource level: ${channel.resourceLevel}
Positioning: ${channel.positioning || 'not specified'}
Differentiation: ${channel.differentiation || 'not specified'}
Known competitors: ${channel.competitors.join('; ') || 'not specified'}
Audience: ${channel.targetAudience}
Pain points: ${channel.audiencePainPoints.join('; ') || 'not specified'}
Pillars: ${channel.contentPillars.join('; ')}
Supported video formats: ${supportedFormats.join(', ')}
Duration mode: ${channel.productionDefaults?.durationMode || 'llm'}
Shorts duration range: ${ranges.shorts.min}-${ranges.shorts.max} seconds
Landscape duration range: ${ranges.landscape.min}-${ranges.landscape.max} seconds
Avoid prior titles: ${history.slice(0, 50).map((idea) => idea.title).join(' | ') || 'none'}
First-party performance evidence (JSON; empty means no evidence): ${JSON.stringify(performanceSummary)}
Recent YouTube market evidence (JSON; search discovery is directional, not proof of demand): ${JSON.stringify(marketResearch)}
Allowed hookFormula values: ${formulas}

IDEATION RULES:
- Mix search-first and browse-first opportunities. Label an idea trending only when the supplied recent market evidence directly supports it, and cite the supporting URL in evidenceSource.
- Match the channel archetype, authority level, production resources, primary goal, positioning, and differentiator. A new channel must not target only saturated head terms.
- Treat competitor names only as research targets and differentiation context; never copy titles, scripts, branding, or unverified claims.
- Rank each idea across audience demand, click potential, production feasibility, and niche fit. compositeScore is their integer total from 4-40.
- Choose format and exact duration independently for each topic. Use the shortest duration that completely delivers the promise; never pad.
- Title and thumbnail must split information instead of repeating one another. Keep the title's main promise within the first 45 characters.
- A Short needs a 1-3 second scroll stop and frequent resets; landscape needs Grab 0-5s, Promise 5-15s, Stakes 15-30s, meaningful developments, and a final payoff.
- Do not fabricate search volume, trends, competitor findings, RPM, facts, or sources. When live research is unavailable, use tier estimates and set evidenceSource to the channel inputs used.
- Use first-party performance only as directional evidence. Prefer repeatable viewer needs and packaging patterns, not copies of past titles. When the sample is small, say so in evidenceSource and avoid confident causal claims.

Each item must contain: title, hookFormula, spokenHook, narrativeArc, contentPillar, retentionScore (1-100), format (landscape or shorts), durationSeconds, durationRationale, trafficStrategy (search_first, browse_first, or trending), primaryKeyword, competition (low/medium/high), searchVolumeTier (low/medium/high), trendDirection (rising/stable/declining), rpmTier (low/medium/high/premium), urgency (trending/evergreen/seasonal), compositeScore (4-40), thumbnailConcept, whyThisIdea, and evidenceSource. Return JSON only.`;
    try { raw = await callIdeaModel(prompt); } catch (error) { console.warn(`Idea model unavailable; using deterministic fallback: ${error.message}`); }
  }
  const fallback = heuristicIdeas(channel, bounded, history, performanceSummary);
  const allowed = new Set(HOOK_FORMULAS.map((item) => item.id));
  const prior = new Set(history.map((idea) => idea.title.trim().toLowerCase()));
  const pickEnum = (value, choices, fallbackValue) => choices.includes(value) ? value : fallbackValue;
  const supportedFormats = channel.productionDefaults?.formats?.length
    ? channel.productionDefaults.formats
    : [channel.productionDefaults?.aspectRatio === '9:16' ? 'shorts' : 'landscape'];
  const ranges = channel.productionDefaults?.durationRanges || { shorts: { min: 20, max: 60 }, landscape: { min: 120, max: 600 } };
  const allowedTrafficStrategies = marketResearch.length ? ['search_first', 'browse_first', 'trending'] : ['search_first', 'browse_first'];
  const candidates = Array.isArray(raw) ? [...raw, ...fallback] : fallback;
  const normalized = candidates.map((item, index) => {
    const base = fallback[index % Math.max(1, fallback.length)] || heuristicIdeas(channel, 1, [], performanceSummary)[0];
    const title = String(item.title || base.title || '').trim().slice(0, 100);
    const hookFormula = allowed.has(item.hookFormula) ? item.hookFormula : base.hookFormula || 'information_gap';
    const formula = HOOK_FORMULAS.find((entry) => entry.id === hookFormula);
    const titleScore = scoreTitle(title);
    const requestedFormat = supportedFormats.includes(item.format) ? item.format : base.format;
    const durationRange = ranges[requestedFormat] || (requestedFormat === 'shorts' ? { min: 20, max: 60 } : { min: 120, max: 600 });
    const proposedDuration = channel.productionDefaults?.durationMode === 'fixed'
      ? Number(channel.productionDefaults.durationSeconds)
      : Math.round(Number(item.durationSeconds) || base.durationSeconds);
    const durationSeconds = Math.max(durationRange.min, Math.min(durationRange.max, proposedDuration));
    const evidenceSource = String(item.evidenceSource || base.evidenceSource).trim().slice(0, 500);
    const citesCurrentResearch = marketResearch.some((result) => evidenceSource.includes(result.url));
    const requestedTrafficStrategy = pickEnum(item.trafficStrategy, allowedTrafficStrategies, base.trafficStrategy);
    const trafficStrategy = requestedTrafficStrategy === 'trending' && !citesCurrentResearch ? 'browse_first' : requestedTrafficStrategy;
    return {
      title, hookFormula,
      spokenHook: String(item.spokenHook || formula.template(channel.niche)).trim().slice(0, 300),
      narrativeArc: String(item.narrativeArc || base.narrativeArc).trim().slice(0, 2_000),
      contentPillar: channel.contentPillars.includes(item.contentPillar) ? item.contentPillar : channel.contentPillars[index % channel.contentPillars.length],
      titleScore,
      retentionScore: Math.max(1, Math.min(100, Math.round(Number(item.retentionScore) || titleScore))),
      format: requestedFormat,
      durationSeconds,
      durationRationale: String(item.durationRationale || base.durationRationale).trim().slice(0, 500),
      trafficStrategy,
      primaryKeyword: String(item.primaryKeyword || base.primaryKeyword).trim().slice(0, 120),
      competition: pickEnum(item.competition, ['low', 'medium', 'high'], base.competition),
      searchVolumeTier: pickEnum(item.searchVolumeTier, ['low', 'medium', 'high'], base.searchVolumeTier),
      trendDirection: trafficStrategy === 'trending'
        ? pickEnum(item.trendDirection, ['rising', 'stable'], 'stable')
        : pickEnum(item.trendDirection, ['stable', 'declining'], base.trendDirection),
      rpmTier: pickEnum(item.rpmTier, ['low', 'medium', 'high', 'premium'], base.rpmTier),
      urgency: pickEnum(item.urgency, trafficStrategy === 'trending' ? ['trending', 'evergreen', 'seasonal'] : ['evergreen', 'seasonal'], base.urgency),
      compositeScore: Math.max(4, Math.min(40, Math.round(Number(item.compositeScore) || base.compositeScore))),
      thumbnailConcept: String(item.thumbnailConcept || base.thumbnailConcept).trim().slice(0, 500),
      whyThisIdea: String(item.whyThisIdea || base.whyThisIdea).trim().slice(0, 1_000),
      evidenceSource,
    };
  }).filter((item, index, all) => item.title.length >= 5
    && !prior.has(item.title.toLowerCase())
    && !history.some((priorIdea) => titleSimilarity(priorIdea.title, item.title) >= 0.6)
    && all.findIndex((candidate) => titleSimilarity(candidate.title, item.title) >= 0.85) === index);
  return normalized.slice(0, bounded).length ? normalized.slice(0, bounded) : fallback;
}
