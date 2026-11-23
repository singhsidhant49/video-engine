const DIRECT_MEDITATION_RE = /\b(?:meditat(?:e|ion|ive)?|mindfulness|body scan|breathing exercise|guided relaxation|sleep meditation|bedtime meditation|sleep story)\b/i;
const CALM_CUE_RE = /\b(?:guided|gentle|calming|relax(?:ation|ing)?|bedtime|deep sleep)\b/i;
const REST_CUE_RE = /\b(?:sleep|breath(?:e|ing)?|rest|unwind)\b/i;
const WELLNESS_RE = /\b(?:wellness|meditation|relaxation|sleep channel)\b/i;

const finitePositive = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export const CONTENT_TYPE_DEFAULT_SPEEDS = Object.freeze({
  meditation: 0.76,
  audiobook: 0.82,
  documentary: 0.96,
  investigative: 0.94,
  story: 0.93,
  explainer: (format) => (format === 'shorts' ? 1.08 : 0.99),
  educational: (format) => (format === 'shorts' ? 1.08 : 0.99),
  tutorial: (format) => (format === 'shorts' ? 1.06 : 0.96),
  motivational: (format) => (format === 'shorts' ? 1.10 : 1.03),
  business: (format) => (format === 'shorts' ? 1.08 : 1.00),
  finance: (format) => (format === 'shorts' ? 1.08 : 1.00),
  psychology: (format) => (format === 'shorts' ? 1.06 : 0.98),
  science: (format) => (format === 'shorts' ? 1.06 : 1.00),
  technology: (format) => (format === 'shorts' ? 1.08 : 1.00),
  tech: (format) => (format === 'shorts' ? 1.08 : 1.00),
  mystery: (format) => (format === 'shorts' ? 1.04 : 0.94),
  horror: (format) => (format === 'shorts' ? 1.02 : 0.92),
});

export function isMeditationNarration({ topic = '', niche = '', contentType = '' } = {}) {
  if (contentType === 'meditation') return true;
  if (contentType === 'audiobook') return false;
  const text = `${niche} ${topic}`;
  return DIRECT_MEDITATION_RE.test(text)
    || (CALM_CUE_RE.test(text) && REST_CUE_RE.test(text))
    || (WELLNESS_RE.test(niche) && REST_CUE_RE.test(topic));
}

/**
 * Detect meditation subprofile: guided (0.76x), sleep (0.76x), quick mindfulness (0.82x).
 */
export function resolveMeditationSubprofile({ topic = '', niche = '' } = {}) {
  const topicLower = String(topic || '').toLowerCase();
  const nicheLower = String(niche || '').toLowerCase();
  // 1. Give priority to explicit topic keywords:
  if (/\b(?:morning|wake\s*up|wake|energy|alert|daytime|work\s+break|focus|quick|micro|reset|5\s*min(?:ute)?)\b/.test(topicLower)) {
    return 'quick_mindfulness';
  }
  if (/\b(?:sleep|bedtime|deep\s+sleep|unwind|night|drift\s+off|insomnia)\b/.test(topicLower)) {
    return 'sleep';
  }
  // 2. Fall back to niche cues if the topic itself is neutral:
  if (/\b(?:sleep|bedtime|night|drift\s+off|insomnia)\b/.test(nicheLower)) {
    return 'sleep';
  }
  if (/\b(?:morning|daytime|quick|focus)\b/.test(nicheLower)) {
    return 'quick_mindfulness';
  }
  return 'guided';
}

/** Resolve cadence before script budgeting and TTS so calm content is authored
 * for a slow delivery instead of being slowed only after duration QC fails. */
export function resolveNarrationProfile({
  topic = '',
  niche = '',
  contentType = '',
  format = 'landscape',
  baseSpeed = null,
  meditationSpeed = 0.76,
} = {}) {
  const isShorts = format === 'shorts';
  const defaultBaseSpeed = isShorts ? 1.15 : 1.02;
  const normalSpeed = finitePositive(baseSpeed, defaultBaseSpeed);
  const meditation = isMeditationNarration({ topic, niche, contentType });

  let speed;
  let minimumRepairSpeed;
  let id;
  let subprofile = null;

  if (meditation) {
    subprofile = resolveMeditationSubprofile({ topic, niche });
    id = subprofile === 'sleep' ? 'sleep_meditation' : (subprofile === 'quick_mindfulness' ? 'quick_mindfulness' : 'guided_meditation');
    
    // Default 0.76x for guided and sleep meditation, 0.82x for quick mindfulness
    let targetMedSpeed = meditationSpeed;
    if (isShorts) {
      targetMedSpeed = 0.96; // Calm and intelligible, while still compact enough for Shorts
    } else if (meditationSpeed === 0.76 || meditationSpeed === 0.80 || meditationSpeed === 0.58) {
      if (subprofile === 'sleep') targetMedSpeed = 0.76;
      else if (subprofile === 'quick_mindfulness') targetMedSpeed = 0.82;
      else targetMedSpeed = 0.76;
    }

    speed = Math.min(normalSpeed, finitePositive(targetMedSpeed, isShorts ? 1.02 : 0.76));
    // Articulation suffers below 0.72x on Kokoro; tranquility comes from silence pauses
    minimumRepairSpeed = isShorts ? 0.85 : 0.72;
  } else if (contentType && CONTENT_TYPE_DEFAULT_SPEEDS[contentType]) {
    id = contentType;
    const mapped = CONTENT_TYPE_DEFAULT_SPEEDS[contentType];
    speed = typeof mapped === 'function' ? mapped(format) : mapped;
    minimumRepairSpeed = isShorts ? 0.85 : contentType === 'motivational' ? 0.78 : 0.70;
  } else {
    id = 'standard';
    speed = normalSpeed;
    minimumRepairSpeed = isShorts ? 0.85 : 0.70;
  }

  // Content-aware speech budgeting:
  // - Shorts: 165-190 WPM (fast, energetic delivery)
  // - Long-form/Landscape: 140-165 WPM (balanced, natural narration)
  // - Meditation: ~70-75 WPM (effective rate accounting for intentional silence pauses)
  const speechRateWps = meditation
    ? (isShorts ? Number((2.10 * speed).toFixed(2)) : Number((1.55 * speed).toFixed(2)))
    : isShorts
      ? Number((2.55 * speed).toFixed(2))
      : Number((2.45 * speed).toFixed(2));

  const targetLufs = meditation
    ? -18
    : ['audiobook', 'story', 'mystery', 'horror'].includes(contentType)
      ? -17
      : contentType === 'motivational'
        ? -15.5
        : -16;

  const maxPeakDb = meditation ? -2 : -1.5;

  const delivery = meditation
    ? 'soft_spacious'
    : ['documentary', 'investigative'].includes(contentType)
      ? 'measured_authoritative'
      : ['mystery', 'horror'].includes(contentType)
        ? 'tense_suspenseful'
        : contentType === 'motivational'
          ? (isShorts ? 'high_energy_punchy' : 'energetic_controlled')
          : ['story', 'audiobook'].includes(contentType)
            ? 'warm_narrative'
            : (isShorts ? 'energetic_engaging' : 'clear_conversational');

  return {
    id,
    meditation,
    subprofile,
    speed: Number(speed.toFixed(3)),
    minimumRepairSpeed,
    speechRateWps,
    targetLufs,
    maxPeakDb,
    delivery,
  };
}
