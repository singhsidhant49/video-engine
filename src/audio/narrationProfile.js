const DIRECT_MEDITATION_RE = /\b(?:meditat(?:e|ion|ive)?|mindfulness|body scan|breathing exercise|guided relaxation|sleep meditation|bedtime meditation|sleep story)\b/i;
const CALM_CUE_RE = /\b(?:guided|gentle|calming|relax(?:ation|ing)?|bedtime|deep sleep)\b/i;
const REST_CUE_RE = /\b(?:sleep|breath(?:e|ing)?|rest|unwind)\b/i;
const WELLNESS_RE = /\b(?:wellness|meditation|relaxation|sleep channel)\b/i;

const finitePositive = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export function isMeditationNarration({ topic = '', niche = '' } = {}) {
  const text = `${niche} ${topic}`;
  return DIRECT_MEDITATION_RE.test(text)
    || (CALM_CUE_RE.test(text) && REST_CUE_RE.test(text))
    || (WELLNESS_RE.test(niche) && REST_CUE_RE.test(topic));
}

/** Resolve cadence before script budgeting and TTS so calm content is authored
 * for a slow delivery instead of being slowed only after duration QC fails. */
export function resolveNarrationProfile({
  topic = '',
  niche = '',
  baseSpeed = 0.9,
  meditationSpeed = 0.72,
} = {}) {
  const normalSpeed = finitePositive(baseSpeed, 0.9);
  const meditation = isMeditationNarration({ topic, niche });
  const speed = meditation
    ? Math.min(normalSpeed, finitePositive(meditationSpeed, 0.72))
    : normalSpeed;
  return {
    id: meditation ? 'guided_meditation' : 'standard',
    meditation,
    speed: Number(speed.toFixed(3)),
    minimumRepairSpeed: meditation ? 0.55 : 0.7,
    speechRateWps: Number((2.35 * speed).toFixed(2)),
  };
}
