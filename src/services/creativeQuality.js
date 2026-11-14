const GENERIC_HOOK = /\b(?:have you ever wondered|in this video|today we(?:'ll| will)|welcome back|did you know(?: that)?|let(?:'s| us) (?:dive in|explore)|you won(?:'t| not) believe)\b/i;
const EMPTY_HYPE = /\b(?:mind[- ]blowing|insane|crazy|shocking truth|game[- ]changer|revolutionary)\b/i;
const TENSION = /\b(?:but|yet|except|instead|despite|although|until|however|paradox|contradiction|hidden|missing|wrong|fails?|cost|risk|problem|changes?|because)\b/i;
const STAKES = /\b(?:you|your|money|time|health|memory|career|life|future|risk|cost|lose|gain|protect|avoid|why it matters)\b/i;
const OPEN_LOOP = /\?|\b(?:why|how|what if|the reason|one detail|what happened|until)\b/i;
const CONCRETE = /\b(?:\d+(?:\.\d+)?%?|seconds?|minutes?|days?|years?|brain|phone|bank|market|sleep|memory|company|city|machine|system|people|person|scientist|worker|child|house|car|computer|screen|camera)\b/i;

const words = (value) => String(value || '').trim().split(/\s+/).filter(Boolean);
const tokens = (value) => new Set(String(value || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 3) || []);

export function scoreHookQuality(text, { topic = '' } = {}) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const count = words(value).length;
  let score = 30;
  const strengths = [];
  const weaknesses = [];
  if (!value) return { score: 0, wordCount: 0, strengths, weaknesses: ['missing_hook'] };
  if (count >= 8 && count <= 28) { score += 15; strengths.push('spoken_length'); }
  else if (count < 5 || count > 42) { score -= 18; weaknesses.push('poor_spoken_length'); }
  if (TENSION.test(value)) { score += 18; strengths.push('tension'); } else weaknesses.push('no_tension');
  if (STAKES.test(value)) { score += 12; strengths.push('stakes'); } else weaknesses.push('unclear_stakes');
  if (OPEN_LOOP.test(value)) { score += 12; strengths.push('open_loop'); } else weaknesses.push('no_open_loop');
  if (CONCRETE.test(value)) { score += 8; strengths.push('concrete_language'); }
  const topicTokens = tokens(topic); const hookTokens = tokens(value);
  if ([...topicTokens].some((token) => hookTokens.has(token))) { score += 10; strengths.push('topic_specific'); }
  else if (topicTokens.size) weaknesses.push('weak_topic_connection');
  if (GENERIC_HOOK.test(value)) { score -= 35; weaknesses.push('generic_opener'); }
  if (EMPTY_HYPE.test(value)) { score -= 15; weaknesses.push('empty_hype'); }
  if (/!{2,}|\?{2,}/.test(value) || value === value.toUpperCase()) { score -= 8; weaknesses.push('overwritten_delivery'); }
  return { score: Math.max(0, Math.min(100, Math.round(score))), wordCount: count, strengths, weaknesses };
}

export function selectStrongestHook(candidates = [], options = {}) {
  return candidates
    .map((candidate, index) => {
      const narration = String(candidate?.narration || candidate?.hook || candidate || '').replace(/\s+/g, ' ').trim();
      return { narration, index, quality: scoreHookQuality(narration, options) };
    })
    .filter((candidate) => candidate.narration)
    .sort((left, right) => right.quality.score - left.quality.score || left.index - right.index)[0] || null;
}

export function conciseThumbnailText(value, { maxWords = 4 } = {}) {
  const stop = new Set(['the', 'a', 'an', 'about', 'this', 'that', 'your', 'with', 'from', 'into', 'what', 'when']);
  const selected = words(String(value || '').replace(/[^a-zA-Z0-9%$\-\s]/g, ' '))
    .filter((word) => !stop.has(word.toLowerCase()))
    .slice(0, maxWords);
  return selected.join(' ').toUpperCase().slice(0, 34);
}
