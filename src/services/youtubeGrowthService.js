import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { normalizeLanguageCode } from '../config/videoBrief.js';

export const HOOK_FORMULAS = Object.freeze([
  { id: 'present_moment_invitation', mechanism: 'relief', template: (x) => `Let your shoulders soften. For the next few moments, I will guide you through ${x}.` },
  { id: 'felt_need_validation', mechanism: 'relief', template: (x) => `If your mind feels busy right now, you do not need to force it quiet. Begin this ${x} practice with one easy breath.` },
  { id: 'guided_outcome', mechanism: 'practice', template: (x) => `Settle into a comfortable position, and let this ${x} practice carry the next few moments for you.` },
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

const MEDITATION_HOOK_IDS = new Set(['present_moment_invitation', 'felt_need_validation', 'guided_outcome']);
const MEDITATION_HOOK_FORMULAS = HOOK_FORMULAS.filter((formula) => MEDITATION_HOOK_IDS.has(formula.id));
const GENERAL_HOOK_FORMULAS = HOOK_FORMULAS.filter((formula) => !MEDITATION_HOOK_IDS.has(formula.id));

const POWER = /\b(why|hidden|secret|mistake|truth|blueprint|paradox|impossible|trap|silent|warning|nobody|exact)\b/gi;
const POWER_HINDI = /(?:क्यों|कैसे|सच|रहस्य|गलती|खतरनाक|असली|कभी|सबसे|बड़ा|फायदा|नुकसान|तरीका)/g;
const WEAK = /^(an overview of|video about|introduction to|understanding|a guide to)\b/i;
const TITLE_STOP_WORDS = new Set(['the', 'a', 'an', 'about', 'why', 'how', 'what', 'this', 'that', 'your', 'hidden', 'truth', 'mistake', 'और', 'के', 'की', 'का', 'में', 'है', 'हैं', 'से', 'को', 'पर']);
const researchCache = new Map();
const RESEARCH_CACHE_MS = 6 * 60 * 60 * 1_000;
const MEDITATION_CHANNEL_RE = /\b(?:meditat(?:e|ion|ive)?|mindful(?:ness)?|breathwork|body scan|sleep sounds?|guided relaxation|calm(?:ing)?|bedtime)\b|ध्यान|मेडिटेशन|नींद|शांति|प्राणायाम/i;
const MEDITATION_CLICKBAIT_RE = /\b(?:hidden truth|mistake|wrong|trap|warning|nobody|shocking|scandal|myth|before you try|changes everything)\b/i;

export function isMeditationChannel(channel = {}) {
  const defaults = channel.productionDefaults || {};
  if (defaults.contentType === 'meditation') return true;
  // A mixed channel may allow an occasional meditation format without being
  // a meditation channel. Do not force every brainstormed idea into a calm
  // practice merely because meditation is one of several supported types.
  const supported = defaults.supportedContentTypes || [];
  if (supported.length === 1 && supported[0] === 'meditation') return true;
  return MEDITATION_CHANNEL_RE.test(`${channel.niche || ''} ${(channel.contentPillars || []).join(' ')}`);
}

function titleSimilarity(left, right) {
  const tokens = (value) => new Set(String(value).toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)?.filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token)) || []);
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
  score += Math.min(18, ((value.match(POWER) || []).length + (value.match(POWER_HINDI) || []).length) * 7);
  if (/\d/.test(value)) score += 5;
  if (/[:?!]/.test(value)) score += 4;
  if (WEAK.test(value)) score -= 28;
  return Math.max(1, Math.min(100, Math.round(score)));
}

/** Stable production ordering. Database recency and model response order must
 * never decide which idea consumes the next scheduled production slot. */
export function rankGrowthIdeas(ideas = []) {
  const urgencyWeight = { trending: 3, seasonal: 2, evergreen: 1 };
  return [...ideas].sort((left, right) =>
    (Number(right.compositeScore || 0) - Number(left.compositeScore || 0))
    || (Number(right.performanceEvidenceScore || 0) - Number(left.performanceEvidenceScore || 0))
    || (Number(right.retentionScore || 0) - Number(left.retentionScore || 0))
    || (Number(right.titleScore || 0) - Number(left.titleScore || 0))
    || ((urgencyWeight[right.urgency] || 0) - (urgencyWeight[left.urgency] || 0))
    || String(left.id || left.title || '').localeCompare(String(right.id || right.title || '')));
}

const clampScore = (value) => Math.max(1, Math.min(10, Math.round(Number(value) || 1)));

const performanceQuality = (item) => (Number(item.weightedCtr ?? item.averageCtr ?? 0) * 2)
  + (Number(item.weightedAverageViewedPercentage ?? item.averageViewedPercentage ?? 0) / 5)
  + Number(item.subscribersPerThousandViews || 0);

function comparativeLeader(groups = {}) {
  const reliable = Object.entries(groups).filter(([, item]) => item.confidence === 'reliable');
  if (reliable.length < 2) return null;
  return reliable.sort((left, right) => performanceQuality(right[1]) - performanceQuality(left[1]))[0][0];
}

export function calculatePerformanceEvidence(idea, summary = {}) {
  const comparisons = [
    ['format', idea.format, summary.formats],
    ['pillar', idea.contentPillar, summary.pillars],
    ['hook', idea.hookFormula, summary.hookFormulas],
  ];
  const reasons = []; let score = 0;
  for (const [label, value, groups] of comparisons) {
    const leader = comparativeLeader(groups);
    if (leader && value === leader) { score++; reasons.push(`${label} ${value} leads a reliable within-channel comparison`); }
  }
  return {
    score: Math.max(-3, Math.min(3, score)),
    reason: reasons.length ? reasons.join('; ').slice(0, 500) : 'No reliable comparative channel evidence yet.',
  };
}

/** Compute the production score from normalized, inspectable factors. The LLM
 * may propose the factors, but it cannot award itself an arbitrary total. */
export function calculateOpportunityScore({ idea, titleScore, retentionScore, channel }) {
  const demandBase = { low: 3, medium: 6, high: 9 }[idea.searchVolumeTier] || 4;
  const trendAdjustment = idea.trendDirection === 'rising' ? 1 : idea.trendDirection === 'declining' ? -1 : 0;
  const audienceText = `${channel.targetAudience || ''} ${(channel.audiencePainPoints || []).join(' ')} ${(channel.contentPillars || []).join(' ')}`.toLowerCase();
  const keywordTokens = String(idea.primaryKeyword || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const keywordMatches = keywordTokens.filter((token) => token.length > 3 && audienceText.includes(token)).length;
  const nicheBase = (channel.contentPillars || []).includes(idea.contentPillar) ? 7 : 4;
  const durationPenalty = Number(idea.durationSeconds || 0) > 600 ? 2 : Number(idea.durationSeconds || 0) > 300 ? 1 : 0;
  const competitionPenalty = idea.competition === 'high' ? 2 : idea.competition === 'medium' ? 1 : 0;
  const resourcePenalty = channel.resourceLevel === 'solo' && Number(idea.durationSeconds || 0) > 480 ? 1 : 0;
  const breakdown = {
    demand: clampScore(demandBase + trendAdjustment),
    clickPotential: clampScore((Number(titleScore || 0) + Number(retentionScore || 0)) / 20),
    nicheFit: clampScore(nicheBase + Math.min(3, keywordMatches)),
    feasibility: clampScore(10 - durationPenalty - competitionPenalty - resourcePenalty),
  };
  return { ...breakdown, total: Object.values(breakdown).reduce((sum, value) => sum + value, 0) };
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

const youtubeVideoId = (value) => {
  try {
    const url = new URL(value);
    if (url.hostname.endsWith('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || null;
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null;
    return url.searchParams.get('v');
  } catch { return null; }
};

const ageDays = (value) => {
  const relative = String(value || '').toLowerCase().match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/);
  if (relative) {
    const multipliers = { minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 };
    return Math.max(0, Math.floor(Number(relative[1]) * multipliers[relative[2]]));
  }
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 86_400_000)) : null;
};

async function researchCurrentYouTubeMarket(channel) {
  const apiKey = String(process.env.BRAVE_SEARCH_KEY || '').trim();
  if (!apiKey) return [];
  const queries = [
    { type: 'niche', query: `site:youtube.com/watch OR site:youtube.com/shorts ${channel.niche} ${channel.contentPillars.slice(0, 5).join(' ')}` },
    ...channel.competitors.slice(0, 4).map((competitor) => ({ type: 'competitor', competitor, query: `site:youtube.com/watch "${competitor}" ${channel.niche}` })),
  ];
  const cacheKey = JSON.stringify(queries);
  const cached = researchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RESEARCH_CACHE_MS) return cached.results;
  try {
    const attempts = await Promise.allSettled(queries.map(async (entry) => {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.search = new URLSearchParams({ q: entry.query, count: entry.type === 'competitor' ? '8' : '15', safesearch: 'moderate', freshness: 'pm' }).toString();
      const response = await fetch(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      return (body.web?.results || []).map((item) => ({ item, entry }));
    }));
    const batches = attempts.filter((attempt) => attempt.status === 'fulfilled').map((attempt) => attempt.value);
    if (!batches.length) throw attempts.find((attempt) => attempt.status === 'rejected')?.reason || new Error('No market research query succeeded');
    const unique = new Map();
    for (const { item, entry } of batches.flat()) {
      const id = youtubeVideoId(item.url);
      if (!id || unique.has(id)) continue;
      const publishedValue = item.page_age || item.age || null;
      unique.set(id, {
        videoId: id, title: String(item.title || '').replace(/\s*[-|]\s*YouTube\s*$/i, '').slice(0, 180), url: item.url,
        description: String(item.description || '').slice(0, 400), publishedAt: publishedValue,
        ageDays: ageDays(publishedValue), competitor: entry.competitor || null, queryType: entry.type,
        source: 'brave_recent_youtube_search', capturedAt: new Date().toISOString(),
        metricsObserved: false,
      });
    }
    const results = await Promise.all([...unique.values()].slice(0, 30).map(async (result) => {
      if (!result.competitor) return result;
      try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(result.url)}&format=json`, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) return { ...result, competitorValidated: false };
        const author = String((await response.json()).author_name || '');
        const expected = result.competitor.toLowerCase().replace(/[^a-z0-9]/g, '');
        const actual = author.toLowerCase().replace(/[^a-z0-9]/g, '');
        return { ...result, author, competitorValidated: Boolean(expected && (actual.includes(expected) || expected.includes(actual))) };
      } catch { return { ...result, competitorValidated: false }; }
    }));
    researchCache.set(cacheKey, { at: Date.now(), results });
    return results;
  } catch (error) {
    console.warn(`Current YouTube market research unavailable: ${error.message}`);
    return [];
  }
}

function marketSignalsForIdea({ title, primaryKeyword, contentPillar }, results) {
  const tokens = String(`${primaryKeyword} ${contentPillar}`).toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 3) || [];
  const matches = results.filter((result) => tokens.some((token) => result.title.toLowerCase().includes(token)));
  const similarTitles = results.filter((result) => titleSimilarity(title, result.title) >= 0.42);
  const dated = matches.map((result) => result.ageDays).filter(Number.isFinite);
  return {
    mode: results.length ? 'observed_search_results' : 'channel_inputs_only',
    observedResults: matches.length,
    validatedCompetitorUploads: matches.filter((result) => result.competitorValidated).length,
    newestAgeDays: dated.length ? Math.min(...dated) : null,
    titleSaturation: similarTitles.length >= 5 ? 'high' : similarTitles.length >= 2 ? 'medium' : 'low',
    topicGap: results.length && matches.length <= 1 ? 'underrepresented_in_observed_results' : matches.length >= 6 ? 'crowded_in_observed_results' : 'unconfirmed',
    measuredDemand: false,
  };
}

function buildTitleCandidates(item, selectedTitle, fallbackAngle) {
  const supplied = Array.isArray(item.titleCandidates) ? item.titleCandidates : [];
  const tailoredFallbacks = item.meditationChannel ? [
    { text: `${item.contentPillar || 'Guided Meditation'} for a Calmer Mind`, angle: 'practice_outcome' },
    { text: `A Gentle ${item.contentPillar || 'Mindfulness'} Practice`, angle: 'gentle_invitation' },
  ] : [
    { text: `Why ${item.contentPillar || item.primaryKeyword || 'This'} Changes Everything`, angle: 'outcome_reveal' },
    { text: `The Hidden ${item.contentPillar || item.primaryKeyword || 'Truth'} Mistake`, angle: 'curiosity_gap' },
  ];
  const candidates = [
    { text: selectedTitle, angle: item.packagingExperiment?.titleAngle || fallbackAngle },
    ...supplied.map((value) => typeof value === 'string' ? { text: value, angle: 'alternative' } : value),
    ...tailoredFallbacks,
  ];
  const seen = new Set();
  return candidates.map((candidate) => ({
    text: String(candidate?.text || '').trim().slice(0, 100),
    angle: String(candidate?.angle || 'alternative').trim().slice(0, 80),
  })).filter((candidate) => candidate.text.length >= 5
    && !(item.meditationChannel && MEDITATION_CLICKBAIT_RE.test(candidate.text))
    && !seen.has(candidate.text.toLowerCase()) && seen.add(candidate.text.toLowerCase()))
    .slice(0, 4).map((candidate, index) => ({ ...candidate, score: scoreTitle(candidate.text), selected: index === 0 }));
}

function buildThumbnailCandidates(item, selectedConcept, fallbackVariant) {
  const supplied = Array.isArray(item.thumbnailCandidates) ? item.thumbnailCandidates : [];
  const selectedSupplied = supplied.find((candidate) => typeof candidate === 'object' && candidate?.concept === selectedConcept);
  const selectedOverlayText = String(selectedSupplied?.overlayText
    ?? supplied.find((candidate) => typeof candidate === 'object' && candidate?.overlayText)?.overlayText
    ?? '').trim();
  const tailoredFallbacks = item.meditationChannel ? [
    { concept: `One calm subject in a natural breathing posture, relaxed expression, soft light, uncluttered negative space`, variant: 'calm_portrait', overlayText: 'BREATHE' },
    { concept: `A peaceful environment that represents ${item.contentPillar || 'rest'}, one focal light source, no people required`, variant: 'calm_environment', overlayText: '' },
  ] : [
    { concept: `A single expressive subject confronting ${item.contentPillar || item.primaryKeyword || 'the central problem'}, strong emotional contrast, uncluttered background`, variant: 'expressive_subject', overlayText: 'WHY?' },
    { concept: `Before-and-after visual contrast for ${item.contentPillar || item.primaryKeyword || 'the outcome'}, one clear transformation, mobile-readable composition`, variant: 'before_after', overlayText: 'BEFORE / AFTER' },
  ];
  const candidates = [
    { concept: selectedConcept, variant: item.packagingExperiment?.thumbnailVariant || fallbackVariant, overlayText: selectedOverlayText },
    ...supplied.map((value) => typeof value === 'string' ? { concept: value, variant: 'alternative', overlayText: '' } : value),
    ...tailoredFallbacks,
  ];
  const seen = new Set();
  return candidates.map((candidate) => ({
    concept: String(candidate?.concept || '').trim().slice(0, 500),
    variant: String(candidate?.variant || 'alternative').trim().slice(0, 80),
    overlayText: String(candidate?.overlayText || '').trim().slice(0, 40),
  })).filter((candidate) => candidate.concept.length >= 5 && !seen.has(candidate.concept.toLowerCase()) && seen.add(candidate.concept.toLowerCase()))
    .slice(0, 4).map((candidate, index) => ({ ...candidate, selected: index === 0 }));
}

export function summarizeChannelPerformance(snapshots = [], ideas = []) {
  const latestByVideo = new Map();
  for (const item of snapshots) {
    if (!item || !(item.views > 0 || item.impressions > 0)) continue;
    const identity = item.videoId || item.ideaId || `${item.format}:${String(item.title || '').trim().toLowerCase()}`;
    const existing = latestByVideo.get(identity);
    if (!existing || String(item.capturedAt || '') > String(existing.capturedAt || '')) latestByVideo.set(identity, item);
  }
  const usable = [...latestByVideo.values()];
  if (!usable.length) return {
    sampleSize: 0, formats: {}, pillars: {}, hookFormulas: {}, experiments: { titleAngles: {}, thumbnailVariants: {} },
    guidance: { evidenceLevel: 'insufficient', reliableComparisons: {}, directionalTests: [], nextExperiments: [], caution: 'Collect results from at least three unique videos before adapting strategy.' },
    topVideos: [],
  };
  const ideasById = new Map(ideas.filter(Boolean).map((idea) => [idea.id, idea]));
  const ideasByVideo = new Map();
  const ideasByTitle = new Map();
  for (const idea of ideas.filter(Boolean)) {
    if (idea.videoId) ideasByVideo.set(String(idea.videoId), idea);
    if (idea.youtubeVideoId) ideasByVideo.set(String(idea.youtubeVideoId), idea);
    if (idea.title) ideasByTitle.set(String(idea.title).trim().toLowerCase(), idea);
  }
  const linked = usable.map((snapshot) => ({
    snapshot,
    idea: ideasById.get(snapshot.ideaId) || ideasByVideo.get(String(snapshot.videoId || ''))
      || ideasByTitle.get(String(snapshot.title || '').trim().toLowerCase()) || null,
  }));
  const summarizeRows = (rows) => {
    const average = (key) => {
      const values = rows.map(({ snapshot }) => snapshot[key]).filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number).filter(Number.isFinite);
      return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
    };
    const views = rows.reduce((sum, { snapshot }) => sum + Number(snapshot.views || 0), 0);
    const subscribers = rows.reduce((sum, { snapshot }) => sum + Number(snapshot.subscribersGained || 0), 0);
    const impressions = rows.reduce((sum, { snapshot }) => sum + Number(snapshot.impressions || 0), 0);
    const ctrReach = rows.filter(({ snapshot }) => Number(snapshot.impressions) > 0 && Number.isFinite(Number(snapshot.clickThroughRate)));
    const viewedReach = rows.filter(({ snapshot }) => Number(snapshot.views) > 0 && Number.isFinite(Number(snapshot.averageViewPercentage)));
    const confidence = rows.length >= 10 && (views >= 10_000 || impressions >= 10_000)
      ? 'reliable' : rows.length >= 3 && (views >= 1_000 || impressions >= 1_000) ? 'directional' : 'insufficient';
    return {
      samples: rows.length,
      views,
      impressions,
      confidence,
      averageCtr: average('clickThroughRate'),
      weightedCtr: ctrReach.length ? Number((ctrReach.reduce((sum, { snapshot }) => sum + (Number(snapshot.clickThroughRate) * Number(snapshot.impressions)), 0)
        / ctrReach.reduce((sum, { snapshot }) => sum + Number(snapshot.impressions), 0)).toFixed(2)) : null,
      averageViewedPercentage: average('averageViewPercentage'),
      weightedAverageViewedPercentage: viewedReach.length ? Number((viewedReach.reduce((sum, { snapshot }) => sum + (Number(snapshot.averageViewPercentage) * Number(snapshot.views)), 0)
        / viewedReach.reduce((sum, { snapshot }) => sum + Number(snapshot.views), 0)).toFixed(2)) : null,
      averageRetention30s: average('retention30sPercentage'),
      subscribersPerThousandViews: Number(((subscribers / Math.max(1, views)) * 1_000).toFixed(2)),
    };
  };
  const formats = {};
  for (const format of ['landscape', 'shorts']) {
    const rows = linked.filter(({ snapshot }) => snapshot.format === format);
    if (!rows.length) continue;
    formats[format] = summarizeRows(rows);
  }
  const groupByIdeaField = (field) => {
    const groups = {};
    for (const row of linked) {
      const value = field.split('.').reduce((current, part) => current?.[part], row.idea);
      const key = String(value || '').trim();
      if (!key) continue;
      (groups[key] ||= []).push(row);
    }
    return Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, summarizeRows(rows)]));
  };
  const groupByExperimentField = (snapshotField, ideaField) => {
    const groups = {};
    for (const row of linked) {
      const value = row.snapshot[snapshotField] || ideaField.split('.').reduce((current, part) => current?.[part], row.idea);
      const key = String(value || '').trim();
      if (!key) continue;
      (groups[key] ||= []).push(row);
    }
    return Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, summarizeRows(rows)]));
  };
  const pillars = groupByIdeaField('contentPillar');
  const hookFormulas = groupByIdeaField('hookFormula');
  const titleAngles = groupByExperimentField('titleAngle', 'packagingExperiment.titleAngle');
  const thumbnailVariants = groupByExperimentField('thumbnailVariant', 'packagingExperiment.thumbnailVariant');
  const comparisonGroups = { formats, pillars, hookFormulas, titleAngles, thumbnailVariants };
  const reliableComparisons = Object.fromEntries(Object.entries(comparisonGroups).flatMap(([name, groups]) => {
    const leader = comparativeLeader(groups); return leader ? [[name, leader]] : [];
  }));
  const directionalTests = Object.entries(comparisonGroups).flatMap(([dimension, groups]) => Object.entries(groups)
    .filter(([, item]) => item.confidence === 'directional')
    .map(([variant, item]) => ({ dimension, variant, samples: item.samples, signalScore: Number(performanceQuality(item).toFixed(2)) })))
    .sort((left, right) => right.signalScore - left.signalScore).slice(0, 5);
  const nextExperiments = [
    ...Object.entries(titleAngles).filter(([, item]) => item.confidence === 'insufficient').map(([variant, item]) => ({ dimension: 'titleAngle', variant, samples: item.samples })),
    ...Object.entries(thumbnailVariants).filter(([, item]) => item.confidence === 'insufficient').map(([variant, item]) => ({ dimension: 'thumbnailVariant', variant, samples: item.samples })),
  ].sort((left, right) => left.samples - right.samples).slice(0, 5);
  const allGroups = Object.values(comparisonGroups).flatMap((groups) => Object.values(groups));
  const evidenceLevel = allGroups.some((item) => item.confidence === 'reliable') ? 'reliable'
    : allGroups.some((item) => item.confidence === 'directional') ? 'directional' : 'insufficient';
  const guidance = {
    evidenceLevel, reliableComparisons, directionalTests, nextExperiments,
    caution: evidenceLevel === 'reliable'
      ? 'Reliable means repeatable within this channel dataset, not guaranteed causation or future virality.'
      : 'Treat current signals as experiments, not winners; keep testing before changing the whole channel strategy.',
  };
  const topVideos = [...usable].sort((a, b) => {
    const quality = (item) => (Number(item.views || 0) * 0.2) + (Number(item.clickThroughRate || 0) * 1_000)
      + (Number(item.averageViewPercentage || 0) * 100) + (Number(item.subscribersGained || 0) * 500);
    return quality(b) - quality(a);
  }).slice(0, 5).map((item) => ({
    title: item.title || item.videoId || 'Untitled video', format: item.format, durationSeconds: item.durationSeconds,
    views: item.views, ctr: item.clickThroughRate, averageViewedPercentage: item.averageViewPercentage,
    retention30s: item.retention30sPercentage, subscribersGained: item.subscribersGained,
  }));
  return { sampleSize: usable.length, formats, pillars, hookFormulas, experiments: { titleAngles, thumbnailVariants }, guidance, topVideos };
}

function cleanMeditationPhrase(value, fallback) {
  const phrase = String(value || fallback || '').replace(/[^\p{L}\p{M}\p{N}' -]/gu, ' ').replace(/\s+/g, ' ').trim();
  return phrase.split(/\s+/).slice(0, 7).join(' ') || fallback;
}

function titleCase(value) {
  return String(value || '').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function meditationHeuristicIdeas(channel, count, history, performance) {
  const used = new Set(history.map((idea) => String(idea.title || '').toLowerCase()));
  const formats = channel.productionDefaults?.formats?.length
    ? channel.productionDefaults.formats
    : [channel.productionDefaults?.aspectRatio === '9:16' ? 'shorts' : 'landscape'];
  const ranges = channel.productionDefaults?.durationRanges || { shorts: { min: 20, max: 60 }, landscape: { min: 300, max: 1_800 } };
  const pillars = channel.contentPillars?.length ? channel.contentPillars : ['guided meditation', 'mindful breathing', 'body scan'];
  const needs = channel.audiencePainPoints?.length ? channel.audiencePainPoints : [
    'a busy mind', 'bedtime tension', 'calm focus', 'emotional overwhelm', 'gentle morning energy',
  ];
  const formulas = ['present_moment_invitation', 'felt_need_validation', 'guided_outcome'];
  const results = [];
  for (let index = 0; results.length < count && index < count * 10; index++) {
    const format = formats[index % formats.length];
    const range = ranges[format] || (format === 'shorts' ? { min: 20, max: 60 } : { min: 300, max: 1_800 });
    const durationSeconds = channel.productionDefaults?.durationMode === 'fixed'
      ? Math.max(range.min, Math.min(range.max, Number(channel.productionDefaults.durationSeconds || range.min)))
      : Math.round(range.min + ((range.max - range.min) * (format === 'shorts' ? 0.45 : 0.38)));
    const pillar = cleanMeditationPhrase(pillars[index % pillars.length], 'guided meditation');
    const need = cleanMeditationPhrase(needs[index % needs.length], 'a calmer mind');
    const durationText = durationLabel(durationSeconds);
    const patterns = format === 'shorts' ? [
      `${durationText} to Settle a Busy Mind`,
      `A Gentle Breathing Reset for ${titleCase(need)}`,
      `${titleCase(pillar)} for Calm Focus`,
      `Pause and Breathe With Me for ${durationText}`,
    ] : [
      `${titleCase(pillar)} for ${titleCase(need)} (${durationText})`,
      `A Gentle ${titleCase(pillar)} Practice Before Sleep`,
      `Release Tension With This Guided ${titleCase(pillar)}`,
      `Morning ${titleCase(pillar)} for Calm, Clear Focus`,
      `Guided Body Scan to Unwind and Rest`,
    ];
    const title = patterns[index % patterns.length].slice(0, 100);
    if (used.has(title.toLowerCase()) || history.some((idea) => titleSimilarity(idea.title, title) >= 0.6)
      || results.some((idea) => titleSimilarity(idea.title, title) >= 0.8)) continue;
    const hookFormula = formulas[index % formulas.length];
    const formula = HOOK_FORMULAS.find((entry) => entry.id === hookFormula);
    const titleScore = Math.min(100, scoreTitle(title) + (/(?:minute|second|sleep|calm|breathe|guided)/i.test(title) ? 10 : 0));
    const overlayText = /sleep|bedtime/i.test(title) ? 'SLEEP GENTLY' : /breath/i.test(title) ? 'BREATHE WITH ME' : 'FIND YOUR CALM';
    results.push({
      title,
      hookFormula,
      spokenHook: formula.template(pillar),
      narrativeArc: `Begin with immediate physical settling and permission to arrive as the viewer is. Guide one coherent ${pillar} practice with clear sensory cues, comfortable silence, and no abrupt topic changes. Close gently with an optional return to the room; do not use a loud CTA or make a medical promise.`,
      contentPillar: pillar,
      titleScore,
      retentionScore: Math.min(94, titleScore + 5),
      format,
      durationSeconds,
      durationRationale: `${durationText} supports the promised practice and its necessary pauses without padding or rushing the instructions.`,
      trafficStrategy: 'search_first',
      primaryKeyword: `${pillar} ${need}`.slice(0, 120),
      competition: 'medium', searchVolumeTier: 'medium', trendDirection: 'stable', rpmTier: 'medium', urgency: 'evergreen',
      compositeScore: Math.max(4, Math.min(40, Math.round((titleScore / 100) * 16 + 20))),
      thumbnailConcept: `One serene focal subject in a safe, uncluttered environment that matches ${pillar}; soft depth, clear face or breathing posture, calm color contrast, generous negative space, no alarmed expression. Overlay: ${overlayText}.`,
      thumbnailCandidates: [
        { concept: `Peaceful close portrait with relaxed expression and clean negative space, visually communicating ${pillar}`, variant: 'calm_portrait', overlayText },
        { concept: `Simple atmospheric environment associated with ${need}, one focal light source, no visual clutter`, variant: 'calm_environment', overlayText: '' },
        { concept: `Comfortable breathing posture with hands naturally resting, soft directional light, safe and welcoming composition`, variant: 'guided_practice', overlayText: 'BREATHE' },
      ],
      packagingExperiment: {
        titleAngle: 'specific_practice_outcome', hookVariant: 'gentle_invitation', thumbnailVariant: 'calm_portrait',
        hypothesis: 'A clearly named practice, use case, and calm mobile-readable image will attract qualified viewers without creating anxiety or a false promise.',
      },
      whyThisIdea: `Directly serves the viewer need “${need}” through the channel pillar “${pillar}” with a usable, repeatable practice.`,
      evidenceSource: performance.sampleSize
        ? `channel profile plus ${performance.sampleSize} first-party performance snapshot(s); no live demand was inferred`
        : 'channel meditation pillars, audience needs, format guardrails, and evergreen practice intent; no measured demand claimed',
    });
  }
  return results;
}

function heuristicIdeas(channel, count, history, performance) {
  if (isMeditationChannel(channel)) return meditationHeuristicIdeas(channel, count, history, performance);
  const isHindi = normalizeLanguageCode(channel.language) === 'hi';
  const used = new Set(history.map((idea) => idea.title.toLowerCase()));
  const seed = crypto.createHash('sha256').update(`${channel.id}:${new Date().toISOString().slice(0, 10)}:${history.length}`).digest();
  const results = [];
  for (let index = 0; results.length < count && index < count * 8; index++) {
    const pillar = channel.contentPillars[(seed[index % seed.length] + index) % channel.contentPillars.length];
    const formula = GENERAL_HOOK_FORMULAS[(seed[(index + 7) % seed.length] + index) % GENERAL_HOOK_FORMULAS.length];
    const patterns = isHindi ? [
      `${pillar} का वह सच जो कोई नहीं बताता`,
      `ज्यादातर लोग ${pillar} में यह बड़ी गलती क्यों करते हैं`,
      `${pillar}: वह तरीका जो सच में काम करता है`,
      `${pillar} शुरू करने से पहले यह जरूर जान लें`,
      `जब ${pillar} बदलता है तो असली असर क्या होता है?`,
      `${pillar} की असली कहानी और अनदेखा नुकसान`,
      `${pillar} को आसान शब्दों में कैसे समझें`,
      `${pillar} से जुड़े सबसे बड़े भ्रम और असली तथ्य`,
    ] : [
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
    const titleAngles = ['curiosity_gap', 'contrarian', 'blueprint', 'mistake_warning', 'outcome_reveal'];
    const thumbnailVariants = ['expressive_subject', 'object_closeup', 'before_after', 'scale_contrast', 'minimal_symbol'];
    const titleAngle = titleAngles[index % titleAngles.length];
    const thumbnailVariant = thumbnailVariants[index % thumbnailVariants.length];
    results.push({
      title,
      hookFormula: formula.id,
      spokenHook: isHindi ? `${pillar} के बारे में एक जरूरी बात जो ज्यादातर लोग नजरअंदाज कर देते हैं।` : formula.template(pillar),
      narrativeArc: isHindi
        ? `${pillar} से जुड़े एक अनदेखे पहलू से शुरुआत करें; असली कारण और उदाहरण दिखाएं; और ${channel.targetAudience} के लिए साफ निष्कर्ष पर समाप्त करें।`
        : `Open with a concrete contradiction about ${pillar}; reveal the overlooked mechanism with a specific example; resolve the opening promise with an actionable conclusion for ${channel.targetAudience}.`,
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
      packagingExperiment: {
        titleAngle,
        hookVariant: formula.mechanism,
        thumbnailVariant,
        hypothesis: `${titleAngle.replaceAll('_', ' ')} packaging paired with a ${formula.mechanism} hook and ${thumbnailVariant.replaceAll('_', ' ')} thumbnail will improve qualified clicks without reducing retention.`,
      },
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

function scorePackagingTitleCandidate(candidate, { performanceSummary, recentIdeas = [], isMeditation = false } = {}) {
  const text = String(candidate?.text || '').trim();
  let score = scoreTitle(text);
  const angle = String(candidate?.angle || '').trim();
  const winner = performanceSummary?.guidance?.reliableComparisons?.titleAngles;
  if (winner && angle === winner) score += 12;
  const recentUses = recentIdeas.slice(0, 10).filter((item) => item?.packagingExperiment?.titleAngle === angle).length;
  if (recentUses >= 3 && winner !== angle) score -= 8;
  if (isMeditation && MEDITATION_CLICKBAIT_RE.test(text)) score -= 100;
  return score;
}

function scorePackagingThumbnailCandidate(candidate, { performanceSummary, recentIdeas = [], isMeditation = false } = {}) {
  const variant = String(candidate?.variant || '').trim();
  const overlay = String(candidate?.overlayText || '').trim();
  const words = overlay ? overlay.split(/\s+/).filter(Boolean).length : 0;
  let score = 50;
  if (isMeditation) {
    if (/calm|guided|sleep|gentle/i.test(variant)) score += 14;
    if (words === 0) score += 8;
    else if (words <= 3 && !/WHY\?|BEFORE \/ AFTER/i.test(overlay)) score += 6;
    else score -= 18;
  } else {
    if (words >= 1 && words <= 3) score += 10;
    else if (words === 0) score += 2;
    else score -= 10;
    if (/expressive|before_after|object_closeup|scale_contrast/i.test(variant)) score += 6;
  }
  const winner = performanceSummary?.guidance?.reliableComparisons?.thumbnailVariants;
  if (winner && variant === winner) score += 12;
  const recentUses = recentIdeas.slice(0, 10).filter((item) => item?.packagingExperiment?.thumbnailVariant === variant).length;
  if (recentUses >= 3 && winner !== variant) score -= 8;
  return score;
}

/** Pick the highest-scoring non-fatigued title & thumbnail candidate automatically. */
export function selectOptimalPackaging(idea = {}, { performanceSummary = null, recentIdeas = [], isMeditation = false, excludedTitles = [] } = {}) {
  let updated = { ...idea };
  const titleCandidates = Array.isArray(idea.titleCandidates) ? idea.titleCandidates : [];
  if (titleCandidates.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    const isExcluded = (text) => excludedTitles.some((other) => {
      const a = String(other || '').trim().toLowerCase();
      const b = String(text || '').trim().toLowerCase();
      return a && b && (a === b || titleSimilarity(a, b) >= 0.75);
    });
    const scored = titleCandidates.map((candidate, index) => {
      const baseScore = scoreTitle(candidate.text);
      const rankScore = scorePackagingTitleCandidate(candidate, { performanceSummary, recentIdeas, isMeditation })
        - (isExcluded(candidate.text) ? 1_000 : 0);
      if (rankScore > bestScore) { bestScore = rankScore; bestIndex = index; }
      return { ...candidate, score: baseScore };
    });
    const winner = scored[bestIndex];
    updated = {
      ...updated,
      title: winner.text,
      titleScore: winner.score,
      titleCandidates: scored.map((candidate, index) => ({ ...candidate, selected: index === bestIndex })),
      packagingExperiment: {
        ...(updated.packagingExperiment || {}),
        titleAngle: winner.angle || updated.packagingExperiment?.titleAngle || 'unclassified',
      },
    };
  }
  const thumbnailCandidates = Array.isArray(idea.thumbnailCandidates) ? idea.thumbnailCandidates : [];
  if (thumbnailCandidates.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    thumbnailCandidates.forEach((candidate, index) => {
      const rankScore = scorePackagingThumbnailCandidate(candidate, { performanceSummary, recentIdeas, isMeditation });
      if (rankScore > bestScore) { bestScore = rankScore; bestIndex = index; }
    });
    const winner = thumbnailCandidates[bestIndex];
    updated = {
      ...updated,
      thumbnailConcept: winner.concept,
      thumbnailCandidates: thumbnailCandidates.map((candidate, index) => ({ ...candidate, selected: index === bestIndex })),
      packagingExperiment: {
        ...(updated.packagingExperiment || {}),
        thumbnailVariant: winner.variant || updated.packagingExperiment?.thumbnailVariant || 'unclassified',
      },
    };
  }
  return updated;
}

export async function brainstormGrowthIdeas(channel, { count = 5, history = [], performance = [], useAi = true } = {}) {
  const bounded = Math.max(1, Math.min(20, Number(count) || 5));
  const meditationChannel = isMeditationChannel(channel);
  const performanceSummary = summarizeChannelPerformance(performance, history);
  const marketResearch = useAi ? await researchCurrentYouTubeMarket(channel) : [];
  let raw = null;
  if (useAi) {
    const formulas = (meditationChannel ? MEDITATION_HOOK_FORMULAS : GENERAL_HOOK_FORMULAS).map((item) => item.id).join(', ');
    const supportedFormats = channel.productionDefaults?.formats?.length
      ? channel.productionDefaults.formats
      : [channel.productionDefaults?.aspectRatio === '9:16' ? 'shorts' : 'landscape'];
    const ranges = channel.productionDefaults?.durationRanges || { shorts: { min: 20, max: 60 }, landscape: { min: 120, max: 600 } };
    const meditationRules = meditationChannel ? `
MEDITATION CHANNEL RULES:
- Every idea must be an actual guided practice, sleep session, breathing exercise, body scan, visualization, or practical mindfulness session—not a generic explainer about meditation.
- Lead with the viewer's desired state, use case, practice type, and honest duration. Avoid fear, controversy, “hidden truth”, “mistake”, “wrong”, “trap”, “warning”, myths, scandals, and medical guarantees.
- The spokenHook must begin the experience with a calming instruction or validating reassurance. Never use a high-pressure curiosity hook.
- Build the narrativeArc as a safe guided progression: arrival, settling, coherent practice, intentional silence, and gentle close. Account for silence in the chosen duration.
- Thumbnail concepts must feel calm and trustworthy: one focal subject or environment, natural relaxed posture, negative space, and at most three simple overlay words. Never use shock faces or danger styling.
` : '';
    const isHindiChannel = normalizeLanguageCode(channel.language) === 'hi';
    const hindiRules = isHindiChannel ? `
HINDI CHANNEL LANGUAGE RULES:
- Write title, titleCandidates[].text, spokenHook, narrativeArc, primaryKeyword, whyThisIdea, and thumbnailCandidates[].overlayText (1-3 punchy Hindi words) in natural everyday Hindi (Devanagari script).
- Keep thumbnailConcept and thumbnailCandidates[].concept in concise ENGLISH visual scene descriptions (subjects, objects, facial emotion, lighting) so image generation models render accurate scenes.
` : '';
    const prompt = `Create ${bounded} distinct YouTube video ideas as a JSON array using the Claude-YouTube ideation framework.
Channel language: ${channel.language || 'en'}
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
${meditationRules}${hindiRules}

IDEATION RULES:
- Mix search-first and browse-first opportunities. Label an idea trending only when the supplied recent market evidence directly supports it, and cite the supporting URL in evidenceSource.
- Match the channel archetype, authority level, production resources, primary goal, positioning, and differentiator. A new channel must not target only saturated head terms.
- Treat competitor names only as research targets and differentiation context; never copy titles, scripts, branding, or unverified claims.
- Rank each idea across audience demand, click potential, production feasibility, and niche fit. compositeScore is their integer total from 4-40.
- Choose format and exact duration independently for each topic. Use the shortest duration that completely delivers the promise; never pad.
- Title and thumbnail must split information instead of repeating one another. Keep the title's main promise within the first 45 characters.
- A Short needs a 1-3 second scroll stop and frequent resets; landscape needs Grab 0-5s, Promise 5-15s, Stakes 15-30s, meaningful developments, and a final payoff.
- Do not fabricate search volume, trends, competitor findings, RPM, facts, or sources. When live research is unavailable, use tier estimates and set evidenceSource to the channel inputs used.
- Use first-party performance only at its stated confidence level. Prefer repeatable viewer needs and packaging patterns, not copies of past titles. Never treat insufficient or directional evidence as a proven causal winner.
- Assign explicit packaging experiment labels so outcomes can be compared later: titleAngle, hookVariant, thumbnailVariant, and a falsifiable hypothesis. Reuse a small stable vocabulary across the batch instead of inventing a unique label for every idea.
- Supply 3 genuinely different titleCandidates and 3 thumbnailCandidates. Each title candidate has text and angle. Each thumbnail candidate has concept, variant, and optional overlayText. Do not create trivial punctuation-only variants.

Each item must contain: title, titleCandidates, hookFormula, spokenHook, narrativeArc, contentPillar, retentionScore (1-100), format (landscape or shorts), durationSeconds, durationRationale, trafficStrategy (search_first, browse_first, or trending), primaryKeyword, competition (low/medium/high), searchVolumeTier (low/medium/high), trendDirection (rising/stable/declining), rpmTier (low/medium/high/premium), urgency (trending/evergreen/seasonal), compositeScore (4-40), thumbnailConcept, thumbnailCandidates, packagingExperiment {titleAngle, hookVariant, thumbnailVariant, hypothesis}, whyThisIdea, and evidenceSource. Return JSON only.`;
    try { raw = await callIdeaModel(prompt); } catch (error) { console.warn(`Idea model unavailable; using deterministic fallback: ${error.message}`); }
  }
  const fallback = heuristicIdeas(channel, bounded, history, performanceSummary);
  const allowed = new Set((meditationChannel ? MEDITATION_HOOK_FORMULAS : GENERAL_HOOK_FORMULAS).map((item) => item.id));
  const prior = new Set(history.map((idea) => idea.title.trim().toLowerCase()));
  const pickEnum = (value, choices, fallbackValue) => choices.includes(value) ? value : fallbackValue;
  const supportedFormats = channel.productionDefaults?.formats?.length
    ? channel.productionDefaults.formats
    : [channel.productionDefaults?.aspectRatio === '9:16' ? 'shorts' : 'landscape'];
  const ranges = channel.productionDefaults?.durationRanges || { shorts: { min: 20, max: 60 }, landscape: { min: 120, max: 600 } };
  const allowedTrafficStrategies = marketResearch.length ? ['search_first', 'browse_first', 'trending'] : ['search_first', 'browse_first'];
  const recentExperiments = history.slice(0, 10);
  const usageCount = (field, value) => recentExperiments.filter((idea) => idea.packagingExperiment?.[field] === value).length;
  const chosenBatchTitles = history.map((item) => item.title).filter(Boolean);
  const candidates = Array.isArray(raw) ? [...raw, ...fallback] : fallback;
  const normalized = candidates.map((item, index) => {
    const base = fallback[index % Math.max(1, fallback.length)] || heuristicIdeas(channel, 1, [], performanceSummary)[0];
    let title = String(item.title || base.title || '').trim().slice(0, 100);
    if (meditationChannel && MEDITATION_CLICKBAIT_RE.test(title)) title = base.title;
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
    const retentionScore = Math.max(1, Math.min(100, Math.round(Number(item.retentionScore) || titleScore)));
    const competition = pickEnum(item.competition, ['low', 'medium', 'high'], base.competition);
    const searchVolumeTier = pickEnum(item.searchVolumeTier, ['low', 'medium', 'high'], base.searchVolumeTier);
    const trendDirection = trafficStrategy === 'trending'
      ? pickEnum(item.trendDirection, ['rising', 'stable'], 'stable')
      : pickEnum(item.trendDirection, ['stable', 'declining'], base.trendDirection);
    const contentPillar = channel.contentPillars.includes(item.contentPillar) ? item.contentPillar : channel.contentPillars[index % channel.contentPillars.length];
    const primaryKeyword = String(item.primaryKeyword || base.primaryKeyword).trim().slice(0, 120);
    const thumbnailConcept = String(item.thumbnailConcept || base.thumbnailConcept).trim().slice(0, 500);
    const titleAngle = String(item.packagingExperiment?.titleAngle || base.packagingExperiment.titleAngle).trim().slice(0, 80);
    const hookVariant = String(item.packagingExperiment?.hookVariant || base.packagingExperiment.hookVariant).trim().slice(0, 80);
    const thumbnailVariant = String(item.packagingExperiment?.thumbnailVariant || base.packagingExperiment.thumbnailVariant).trim().slice(0, 80);
    const scoreBreakdown = calculateOpportunityScore({
      idea: { searchVolumeTier, trendDirection, competition, durationSeconds, contentPillar, primaryKeyword },
      titleScore, retentionScore, channel,
    });
    const provenTitleWinner = performanceSummary.guidance?.reliableComparisons?.titleAngles;
    const provenThumbnailWinner = performanceSummary.guidance?.reliableComparisons?.thumbnailVariants;
    const fatigue = (usageCount('titleAngle', titleAngle) >= 3 && provenTitleWinner !== titleAngle ? 1 : 0)
      + (usageCount('thumbnailVariant', thumbnailVariant) >= 3 && provenThumbnailWinner !== thumbnailVariant ? 1 : 0);
    if (fatigue) {
      scoreBreakdown.clickPotential = Math.max(1, scoreBreakdown.clickPotential - fatigue);
      scoreBreakdown.total = Object.entries(scoreBreakdown).filter(([key]) => key !== 'total').reduce((sum, [, value]) => sum + value, 0);
    }
    const performanceEvidence = calculatePerformanceEvidence({ format: requestedFormat, contentPillar, hookFormula }, performanceSummary);
    let spokenHook = String(item.spokenHook || formula.template(channel.niche)).trim().slice(0, 300);
    let narrativeArc = String(item.narrativeArc || base.narrativeArc).trim().slice(0, 2_000);
    if (meditationChannel && (MEDITATION_CLICKBAIT_RE.test(spokenHook) || !/\b(?:breathe|breath|settle|soften|notice|allow|comfortable|gently|mind|body)\b/i.test(spokenHook))) {
      spokenHook = base.spokenHook;
    }
    if (meditationChannel && !/\b(?:guide|practice|breath|settle|silence|pause|body|close|return|rest)\b/i.test(narrativeArc)) {
      narrativeArc = base.narrativeArc;
    }
    const baseIdea = {
      title, hookFormula,
      spokenHook,
      narrativeArc,
      contentPillar,
      titleScore,
      retentionScore,
      format: requestedFormat,
      durationSeconds,
      durationRationale: String(item.durationRationale || base.durationRationale).trim().slice(0, 500),
      trafficStrategy,
      primaryKeyword,
      competition,
      searchVolumeTier,
      trendDirection,
      rpmTier: pickEnum(item.rpmTier, ['low', 'medium', 'high', 'premium'], base.rpmTier),
      urgency: pickEnum(item.urgency, trafficStrategy === 'trending' ? ['trending', 'evergreen', 'seasonal'] : ['evergreen', 'seasonal'], base.urgency),
      compositeScore: scoreBreakdown.total,
      scoreBreakdown,
      performanceEvidenceScore: performanceEvidence.score,
      performanceEvidenceReason: performanceEvidence.reason,
      thumbnailConcept,
      titleCandidates: buildTitleCandidates({ ...item, contentPillar, primaryKeyword, meditationChannel }, title, item.packagingExperiment?.titleAngle || base.packagingExperiment.titleAngle),
      thumbnailCandidates: buildThumbnailCandidates({ ...item, contentPillar, primaryKeyword, meditationChannel }, thumbnailConcept, item.packagingExperiment?.thumbnailVariant || base.packagingExperiment.thumbnailVariant),
      packagingExperiment: {
        titleAngle,
        hookVariant,
        thumbnailVariant,
        hypothesis: String(item.packagingExperiment?.hypothesis || base.packagingExperiment.hypothesis).trim().slice(0, 500),
      },
      whyThisIdea: String(item.whyThisIdea || base.whyThisIdea).trim().slice(0, 1_000),
      evidenceSource,
      marketEvidence: marketSignalsForIdea({ title, primaryKeyword, contentPillar }, marketResearch),
    };
    const selected = selectOptimalPackaging(baseIdea, {
      performanceSummary, recentIdeas: history, isMeditation: meditationChannel, excludedTitles: chosenBatchTitles,
    });
    chosenBatchTitles.push(selected.title);
    return selected;
  }).filter((item, index, all) => item.title.length >= 5
    && !prior.has(item.title.toLowerCase())
    && !history.some((priorIdea) => titleSimilarity(priorIdea.title, item.title) >= 0.6)
    && all.findIndex((candidate) => titleSimilarity(candidate.title, item.title) >= 0.85) === index);
  const ranked = rankGrowthIdeas(normalized);
  if (ranked.length) return ranked.slice(0, bounded);
  const fallbackTitles = history.map((item) => item.title).filter(Boolean);
  return rankGrowthIdeas(fallback.map((idea) => {
    const scoreBreakdown = calculateOpportunityScore({ idea, titleScore: idea.titleScore, retentionScore: idea.retentionScore, channel });
    const performanceEvidence = calculatePerformanceEvidence(idea, performanceSummary);
    const selected = selectOptimalPackaging({
      ...idea, compositeScore: scoreBreakdown.total, scoreBreakdown,
      performanceEvidenceScore: performanceEvidence.score, performanceEvidenceReason: performanceEvidence.reason,
      titleCandidates: buildTitleCandidates(idea, idea.title, idea.packagingExperiment.titleAngle),
      thumbnailCandidates: buildThumbnailCandidates(idea, idea.thumbnailConcept, idea.packagingExperiment.thumbnailVariant),
      marketEvidence: marketSignalsForIdea(idea, marketResearch),
    }, { performanceSummary, recentIdeas: history, isMeditation: meditationChannel, excludedTitles: fallbackTitles });
    fallbackTitles.push(selected.title);
    return selected;
  })).slice(0, bounded);
}
