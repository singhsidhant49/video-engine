import fs from 'node:fs/promises';
import path from 'node:path';
import wavefile from 'wavefile';
import { config } from '../config/index.js';
import { ttsCache } from '../core/cache/cacheManager.js';
import { appendWavSilence } from '../services/ttsService.js';

const { WaveFile } = wavefile;

export const MEDITATION_PAUSE_TYPES = Object.freeze({
  NORMAL: 'NORMAL',
  REFLECTION: 'REFLECTION',
  BREATH_IN: 'BREATH_IN',
  BREATH_OUT: 'BREATH_OUT',
  BREATH_HOLD: 'BREATH_HOLD',
  BODY_SCAN: 'BODY_SCAN',
  VISUALIZATION: 'VISUALIZATION',
  SECTION_TRANSITION: 'SECTION_TRANSITION',
});

/**
 * Pause ranges in milliseconds per meditation line intent.
 * Based on production meditation guidelines for YouTube channels.
 */
export const MEDITATION_PAUSE_RANGES = Object.freeze({
  NORMAL: [1500, 2200],
  REFLECTION: [3000, 4500],
  BREATH_IN: [4500, 5500],
  BREATH_OUT: [5000, 6500],
  BREATH_HOLD: [2500, 3500],
  BODY_SCAN: [3500, 5500],
  VISUALIZATION: [4500, 7500],
  SECTION_TRANSITION: [6000, 9000],
});

export const MEDITATION_SUBPROFILES = Object.freeze({
  guided: {
    id: 'guided',
    speed: 0.76,
    defaultVoice: 'af_heart',
    pauseMultiplier: 1.0,
    description: 'Natural 0.76x pacing with physical breath timing (4.5–6s) and deep body-scan rests.',
  },
  sleep: {
    id: 'sleep',
    speed: 0.76,
    defaultVoice: 'af_heart',
    pauseMultiplier: 1.25,
    description: 'Slower 0.76x delivery with extended silence intervals (up to 8–9s) for bedtime drift-off.',
  },
  quick_mindfulness: {
    id: 'quick_mindfulness',
    speed: 0.82,
    defaultVoice: 'af_heart',
    pauseMultiplier: 0.85,
    description: 'Crisp daytime mindfulness with concise settling pauses.',
  },
});

const BREATH_IN_RE = /\b(?:breathe?\s+in|inhale|deep\s+breath\s+in|drawing\s+(?:the\s+)?air\s+in|take\s+a\s+(?:slow\s+|deep\s+)?breath\s+in|filling\s+your\s+lungs)\b/i;
const BREATH_OUT_RE = /\b(?:breathe?\s+out|exhale|let\s+(?:it\s+)?go|release\s+(?:the\s+)?breath|slowly\s+breathe\s+out|letting\s+go|sigh\s+out|breathe\s+away)\b/i;
const BREATH_HOLD_RE = /\b(?:hold\s+(?:gently|your\s+breath|at\s+the\s+top|for\s+a\s+moment)|pause\s+gently|gentle\s+pause|retain)\b/i;
const BODY_SCAN_RE = /\b(?:jaw|shoulders?|forehead|neck|chest|belly|stomach|spine|hands?|feet|legs?|toes?|muscles?|soften|relax\s+your|release\s+tension|heavy|weight\s+of\s+your\s+body|physical\s+body|body\s+scan|sensations?)\b/i;
const VISUALIZATION_RE = /\b(?:imagine|visualiz(?:e|ing)|picture|see\s+in\s+your\s+mind|warm\s+light|golden|ocean|river|stream|sky|clouds?|forest|glow|safe\s+place|sunlight)\b/i;
const SECTION_TRANSITION_RE = /\b(?:now\s+gently|as\s+we\s+(?:begin|conclude|close)|for\s+the\s+next\s+few\s+moments|simply\s+rest|when\s+you\s+are\s+ready|bringing\s+awareness\s+back|returning\s+to\s+the\s+room|take\s+your\s+time|concluding\s+this\s+practice)\b/i;
const REFLECTION_RE = /\b(?:notice|observe|allow|feel|be\s+aware|without\s+judgment|space|stillness|peace|silence|presence|quiet|witness|rest\s+here)\b/i;

/**
 * Classifies a meditation phrase into a semantic pause category.
 *
 * @param {string} text
 * @param {object} [context]
 * @returns {string} One of MEDITATION_PAUSE_TYPES
 */
export function classifyMeditationPause(text = '', context = {}) {
  const clean = String(text || '').trim();
  if (context.isLastScene || context.isTransition || SECTION_TRANSITION_RE.test(clean)) {
    return MEDITATION_PAUSE_TYPES.SECTION_TRANSITION;
  }
  if (BREATH_HOLD_RE.test(clean)) return MEDITATION_PAUSE_TYPES.BREATH_HOLD;
  if (BREATH_IN_RE.test(clean)) return MEDITATION_PAUSE_TYPES.BREATH_IN;
  if (BREATH_OUT_RE.test(clean)) return MEDITATION_PAUSE_TYPES.BREATH_OUT;
  if (BODY_SCAN_RE.test(clean)) return MEDITATION_PAUSE_TYPES.BODY_SCAN;
  if (VISUALIZATION_RE.test(clean)) return MEDITATION_PAUSE_TYPES.VISUALIZATION;
  if (REFLECTION_RE.test(clean)) return MEDITATION_PAUSE_TYPES.REFLECTION;
  return MEDITATION_PAUSE_TYPES.NORMAL;
}

/**
 * Calculates deterministic pause duration in milliseconds.
 * Formula: pause = basePauseForType + sentenceImportanceAdjustment + emotionalWeightAdjustment
 *
 * @param {string} text
 * @param {string} [pauseType]
 * @param {object} [context]
 * @param {'guided'|'sleep'|'quick_mindfulness'} [subprofile='guided']
 * @returns {number} Pause in milliseconds
 */
export function calculateMeditationPauseMs(text = '', pauseType = null, context = {}, subprofile = 'guided') {
  const type = pauseType || classifyMeditationPause(text, context);
  const range = MEDITATION_PAUSE_RANGES[type] || MEDITATION_PAUSE_RANGES.NORMAL;
  const basePause = (range[0] + range[1]) / 2;

  // Sentence length adjustment: longer phrases require slightly more settling time
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const sentenceImportanceAdjustment = Math.min(500, Math.max(-300, (words - 5) * 45));

  // Emotional weight cues
  let emotionalWeightAdjustment = 0;
  if (/\b(?:deep(?:ly)?|complete(?:ly)?|total(?:ly)?|simply\s+rest|stillness|quiet|peaceful)\b/i.test(text)) {
    emotionalWeightAdjustment += 350;
  }

  const profile = MEDITATION_SUBPROFILES[subprofile] || MEDITATION_SUBPROFILES.guided;
  const rawPause = (basePause + sentenceImportanceAdjustment + emotionalWeightAdjustment) * profile.pauseMultiplier;

  const minBound = Math.round(range[0] * profile.pauseMultiplier);
  const maxBound = Math.round(range[1] * profile.pauseMultiplier);

  return Math.max(minBound, Math.min(maxBound, Math.round(rawPause)));
}

/**
 * Segments raw meditation text into concise, mindful phrases with calculated pauses.
 * Short phrases allow Kokoro to speak naturally without rushing or sounding monotonous.
 *
 * @param {string} text
 * @param {'guided'|'sleep'|'quick_mindfulness'} [subprofile='guided']
 * @returns {Array<{ text: string, pauseType: string, pauseAfterMs: number }>}
 */
export function segmentMeditationText(text = '', subprofile = 'guided') {
  const clean = String(text || '').trim();
  if (!clean) return [];

  // Split on sentence boundaries, colons, em-dashes, or linebreaks
  const rawParts = clean
    .split(/(?<=[.!?\n])\s+|—|–/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments = [];
  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    const isLast = i === rawParts.length - 1;
    const pauseType = classifyMeditationPause(part, { isLastScene: isLast });
    const pauseAfterMs = calculateMeditationPauseMs(part, pauseType, { isLastScene: isLast }, subprofile);

    segments.push({
      text: part,
      pauseType,
      pauseAfterMs,
    });
  }

  return segments;
}

/**
 * Fetch raw TTS audio WAV buffer for a single phrase from Kokoro TTS.
 */
async function fetchKokoroWav(text, { voice, speed, signal }) {
  // Check TTS Cache first
  const cached = await ttsCache.get({ text, voice, speed });
  if (cached.hit && cached.wavPath) {
    return await fs.readFile(cached.wavPath);
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(config.kokoro.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer not-needed',
      },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice,
        response_format: 'wav',
        speed,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Kokoro TTS failed with HTTP ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    await ttsCache.set({ text, voice, speed }, rawBuffer);
    return rawBuffer;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/**
 * Assembles a master meditation narration WAV file from segments with deterministic silence insertion.
 *
 * @param {object} options
 * @param {Array<{ text: string, pauseAfterMs?: number, pauseType?: string }>} [options.segments]
 * @param {Array<{ narration: string, pauseAfterSec?: number }>} [options.scenes]
 * @param {string} [options.script]
 * @param {string} options.outputFile - Destination file path (.wav or .mp3)
 * @param {string} [options.voice='af_heart']
 * @param {number} [options.speed=0.80]
 * @param {'guided'|'sleep'|'quick_mindfulness'} [options.subprofile='guided']
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ filePath: string, wavPath: string, durationSec: number, segments: Array<object>, totalSilenceSec: number, totalSpeechSec: number }>}
 */
export async function generateMeditationSpeech({
  segments,
  scenes,
  script,
  outputFile,
  voice = 'af_heart',
  speed = 0.80,
  subprofile = 'guided',
  signal,
}) {
  if (signal?.aborted) throw Object.assign(new Error('Meditation audio generation cancelled'), { name: 'AbortError' });

  // Resolve input items to standard segments
  let items = [];
  if (Array.isArray(segments) && segments.length) {
    items = segments.map((s, idx) => ({
      text: s.text,
      pauseType: s.pauseType || classifyMeditationPause(s.text, { isLastScene: idx === segments.length - 1 }),
      pauseAfterMs: Number(s.pauseAfterMs) || calculateMeditationPauseMs(s.text, s.pauseType, { isLastScene: idx === segments.length - 1 }, subprofile),
    }));
  } else if (Array.isArray(scenes) && scenes.length) {
    items = scenes
      .filter((s) => Boolean(s?.narration && s.narration.trim()))
      .map((s, idx, arr) => {
        const text = (s.narration || '').trim();
        const isLast = idx === arr.length - 1;
        const pauseType = classifyMeditationPause(text, { isLastScene: isLast });
        const pauseAfterMs = s.pauseAfterSec
          ? Math.round(Number(s.pauseAfterSec) * 1000)
          : calculateMeditationPauseMs(text, pauseType, { isLastScene: isLast }, subprofile);
        return { text, pauseType, pauseAfterMs };
      });
  } else if (script) {
    items = segmentMeditationText(script, subprofile);
  }

  if (!items.length) {
    throw new Error('generateMeditationSpeech requires non-empty segments, scenes, or script');
  }

  const dir = path.dirname(outputFile);
  await fs.mkdir(dir, { recursive: true });
  const wavFile = outputFile.replace(/\.mp3$/i, '.wav');

  console.log(`🧘 Synthesizing ${items.length} meditation phrases (Voice: ${voice}, Speed: ${speed}x, Subprofile: ${subprofile})...`);

  const trackBuffers = [];
  let sampleRate = 24000;
  let totalSpeechSamples = 0;
  let totalSilenceSamples = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLast = i === items.length - 1;
    const phraseWavBuf = await fetchKokoroWav(item.text, { voice, speed, signal });

    const wf = new WaveFile(phraseWavBuf);
    wf.toBitDepth('32f');
    sampleRate = wf.fmt.sampleRate || 24000;
    const decoded = wf.getSamples(false, Float32Array);
    const speechSamples = Array.isArray(decoded) ? decoded[0] : decoded;

    trackBuffers.push({
      type: 'speech',
      samples: speechSamples,
      text: item.text,
    });
    totalSpeechSamples += speechSamples.length;

    // Insert pause silence (even for last phrase, add a gentle closing pause)
    const pauseMs = item.pauseAfterMs || 1500;
    const pauseSamplesCount = Math.max(0, Math.round(sampleRate * (pauseMs / 1000)));
    if (pauseSamplesCount > 0) {
      const silenceSamples = new Float32Array(pauseSamplesCount);
      trackBuffers.push({
        type: 'silence',
        samples: silenceSamples,
        pauseMs,
      });
      totalSilenceSamples += pauseSamplesCount;
    }
  }

  // Join all speech and silence buffers into a seamless continuous PCM stream
  const totalCombinedSamples = totalSpeechSamples + totalSilenceSamples;
  const joinedSamples = new Float32Array(totalCombinedSamples);
  let offset = 0;

  for (const track of trackBuffers) {
    joinedSamples.set(track.samples, offset);
    offset += track.samples.length;
  }

  const masterWf = new WaveFile();
  masterWf.fromScratch(1, sampleRate, '32f', joinedSamples);
  masterWf.toBitDepth('16');
  const masterBuffer = appendWavSilence(Buffer.from(masterWf.toBuffer()), 500);

  await fs.writeFile(wavFile, masterBuffer);
  await fs.writeFile(outputFile, masterBuffer);

  const durationSec = Number((masterBuffer.length / (sampleRate * 2)).toFixed(2));
  const totalSilenceSec = Number((totalSilenceSamples / sampleRate).toFixed(2));
  const totalSpeechSec = Number((totalSpeechSamples / sampleRate).toFixed(2));

  console.log(`✨ Master meditation audio assembled: ${durationSec}s total (Speech: ${totalSpeechSec}s, Silence: ${totalSilenceSec}s) -> ${outputFile}`);

  return {
    filePath: outputFile,
    wavPath: wavFile,
    durationSec,
    segments: items,
    totalSilenceSec,
    totalSpeechSec,
    success: true,
  };
}
