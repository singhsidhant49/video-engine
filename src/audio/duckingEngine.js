/**
 * Dynamic BGM Ducking & Speech Activity Envelope Engine.
 * 
 * Generates an asymmetrical Attack-Hold-Release volume automation curve for Remotion
 * using aligned word timestamps and pause classification. Eliminates music pumping
 * during micro-pauses and protects speech intelligibility and graphic comprehension.
 */

export const PAUSE_TYPES = {
  MICRO_PAUSE: 'MICRO_PAUSE',     // 100ms - 500ms: phrasing/breathing, zero pumping
  NORMAL_PAUSE: 'NORMAL_PAUSE',   // 500ms - 1.5s: sentence pause, partial gentle recovery
  EDITORIAL_PAUSE: 'EDITORIAL_PAUSE', // > 1.5s: deliberate silence, fuller swell
};

/**
 * Classifies pauses between consecutive words into micro, normal, and editorial pauses.
 * @param {Array<{ startFrame: number, endFrame: number, word?: string }>} words
 * @param {number} fps
 * @returns {Array<{ startFrame: number, endFrame: number, durationSec: number, type: string }>}
 */
export function classifyPauses(words, fps = 30) {
  const pauses = [];
  for (let i = 0; i < words.length - 1; i++) {
    const gapFrames = words[i + 1].startFrame - words[i].endFrame;
    if (gapFrames <= Math.round(fps * 0.08)) continue; // sub-80ms connected phoneme transition

    const durationSec = gapFrames / fps;
    let type = PAUSE_TYPES.MICRO_PAUSE;
    if (durationSec > 1.5) {
      type = PAUSE_TYPES.EDITORIAL_PAUSE;
    } else if (durationSec >= 0.5) {
      type = PAUSE_TYPES.NORMAL_PAUSE;
    }

    pauses.push({
      startFrame: words[i].endFrame,
      endFrame: words[i + 1].startFrame,
      durationSec: Number(durationSec.toFixed(3)),
      type,
    });
  }
  return pauses;
}

/**
 * Derives section-level base music gains and bed protection modifiers.
 * @param {Array<Object>} clips - Storyboard/timeline clips
 * @param {number} fps
 * @param {number} totalFrames
 * @returns {Float32Array} frame-by-frame ceiling modifier [0.0 - 1.2]
 */
function buildSectionEnergyModifiers(clips, fps, totalFrames) {
  const energy = new Float32Array(totalFrames);
  energy.fill(1.0);

  if (!Array.isArray(clips) || !clips.length) return energy;

  for (const clip of clips) {
    const from = Math.max(0, clip.from);
    const to = Math.min(totalFrames, clip.from + clip.durationInFrames);

    let mult = 1.0;
    const purpose = clip.purpose || clip.sectionId || '';
    const family = clip.family || '';

    // Section energy target
    if (/hook/i.test(purpose)) mult = 1.1; // energetic entry
    else if (/explanation|mechanism/i.test(purpose)) mult = 0.9;
    else if (/evidence|example/i.test(purpose)) mult = 0.85;
    else if (/payoff|conclusion/i.test(purpose)) mult = 1.05;

    // Visual bed protection: dense graphics demand quieter beds
    if (['chart', 'process', 'document', 'compare'].includes(family)) {
      mult *= 0.8; // extra ~2dB ducking under cognitive graphics
    }

    for (let f = from; f < to; f++) {
      energy[f] = mult;
    }
  }

  // Smooth energy transitions over 20 frames
  const smoothed = new Float32Array(totalFrames);
  smoothed[0] = energy[0];
  const alpha = 0.08;
  for (let f = 1; f < totalFrames; f++) {
    smoothed[f] = smoothed[f - 1] * (1 - alpha) + energy[f] * alpha;
  }

  return smoothed;
}

/**
 * Builds an Attack-Hold-Release dynamic ducking envelope for BGM.
 * 
 * Rules:
 * 1. Attack: 120ms (4 frames) smooth cosine dip when speech begins.
 * 2. Hold: 600ms (18 frames) minimum recovery hold after speech stops.
 * 3. Release: 800ms-1200ms (25-35 frames) gradual musical swell.
 * 4. Micro-pauses (100-500ms): Hold bridge prevents any volume surge.
 * 5. Normal pauses (500ms-1.5s): Partial recovery (max 45% swell).
 * 6. Editorial pauses (>1.5s): Full musical recovery allowed.
 * 7. Intro: Music starts before voice.
 * 8. Payoff tail: Music holds for 2s after voice ends.
 * 
 * @param {Object} params
 * @param {Array<{ startFrame: number, endFrame: number }>} params.words - Whisper-aligned words
 * @param {Array<Object>} params.clips - Timeline clips
 * @param {number} params.totalFrames - Total timeline frames
 * @param {number} [params.fps=30]
 * @param {Object} [params.bgm] - { base: number, ducked: number }
 * @returns {{
 *   envelope: number[],
 *   pauses: Array<Object>,
 *   diagnostics: Object
 * }}
 */
export function generateDuckingEnvelope({
  words,
  clips,
  totalFrames,
  fps = 30,
  bgm = { base: 0.16, ducked: 0.05 },
}) {
  const baseGain = bgm.base || 0.16;
  const duckedGain = bgm.ducked || 0.05;

  const ATTACK_FRAMES = Math.max(3, Math.round(fps * 0.12)); // ~120ms
  const HOLD_FRAMES = Math.max(12, Math.round(fps * 0.60));  // ~600ms
  const RELEASE_FRAMES = Math.max(20, Math.round(fps * 0.90)); // ~900ms

  const sortedWords = [...(words || [])].sort((a, b) => a.startFrame - b.startFrame);
  const pauses = classifyPauses(sortedWords, fps);
  const sectionModifiers = buildSectionEnergyModifiers(clips, fps, totalFrames);

  // 1. Identify speech presence array (with micro-pause bridging)
  const isSpeechActive = new Uint8Array(totalFrames);
  for (const w of sortedWords) {
    const s = Math.max(0, Math.min(totalFrames - 1, w.startFrame));
    const e = Math.max(0, Math.min(totalFrames - 1, w.endFrame));
    for (let f = s; f <= e; f++) isSpeechActive[f] = 1;
  }

  // Bridge micro-pauses so ducking stays firmly down between closely phrased words
  for (const p of pauses) {
    if (p.type === PAUSE_TYPES.MICRO_PAUSE) {
      for (let f = p.startFrame; f <= p.endFrame && f < totalFrames; f++) {
        isSpeechActive[f] = 1; // treat as continuous speech for ducking
      }
    }
  }

  // First speech start and last speech end
  const firstWordFrame = sortedWords.length ? sortedWords[0].startFrame : 0;
  const lastWordFrame = sortedWords.length ? sortedWords[sortedWords.length - 1].endFrame : totalFrames;

  // 2. Compute raw target duck factor: 0.0 = fully ducked, 1.0 = fully open
  const rawTarget = new Float32Array(totalFrames);
  rawTarget.fill(1.0);

  for (let f = 0; f < totalFrames; f++) {
    if (isSpeechActive[f]) {
      rawTarget[f] = 0.0;
    } else {
      // Find distance to preceding speech end
      let prevEnd = -Infinity;
      for (const w of sortedWords) {
        if (w.endFrame <= f) prevEnd = w.endFrame;
        else break;
      }

      // Find distance to upcoming speech start
      let nextStart = Infinity;
      for (const w of sortedWords) {
        if (w.startFrame > f) {
          nextStart = w.startFrame;
          break;
        }
      }

      const framesSinceSpeech = f - prevEnd;
      const framesToNextSpeech = nextStart - f;

      // Inside a normal pause: cap recovery to 45% of base
      const inNormalPause = pauses.find((p) => p.type === PAUSE_TYPES.NORMAL_PAUSE && f >= p.startFrame && f <= p.endFrame);

      if (framesSinceSpeech < HOLD_FRAMES) {
        // In hold window: remain fully ducked
        rawTarget[f] = 0.0;
      } else if (framesToNextSpeech < ATTACK_FRAMES) {
        // Pre-speech anticipatory attack
        const t = Math.max(0, framesToNextSpeech / ATTACK_FRAMES);
        rawTarget[f] = 0.5 - 0.5 * Math.cos(t * Math.PI);
      } else {
        // Release ramp
        const releaseProgress = Math.min(1.0, (framesSinceSpeech - HOLD_FRAMES) / RELEASE_FRAMES);
        const smoothRelease = 0.5 - 0.5 * Math.cos(releaseProgress * Math.PI);
        const maxCap = inNormalPause ? 0.45 : 1.0;
        rawTarget[f] = smoothRelease * maxCap;
      }
    }
  }

  // 3. Construct final volume envelope with section modifiers & intro/outro fades
  const envelope = new Array(totalFrames);
  let duckingEvents = 0;
  let musicRecoveryEvents = 0;
  let wasDucked = false;

  for (let f = 0; f < totalFrames; f++) {
    const duckFactor = rawTarget[f]; // 0.0 (ducked) to 1.0 (open)
    const currentBase = baseGain * sectionModifiers[f];
    const currentDucked = duckedGain * sectionModifiers[f];

    let v = currentDucked + (currentBase - currentDucked) * duckFactor;

    // Head intro: smoothly fade in music from frame 0 to frame 20 (0.66s)
    const introFade = Math.min(1.0, f / Math.max(1, Math.round(fps * 0.6)));

    // Tail outro: hold music for 2s after last word, then fade over 45 frames (1.5s)
    const tailStart = lastWordFrame + Math.round(fps * 2.0);
    let outroFade = 1.0;
    if (f >= tailStart) {
      const framesIntoTail = f - tailStart;
      outroFade = Math.max(0.0, 1.0 - (framesIntoTail / Math.round(fps * 1.5)));
    }

    v = v * introFade * outroFade;
    envelope[f] = Number(Math.max(0.0, v).toFixed(4));

    // Diagnostics counting
    if (duckFactor < 0.2 && !wasDucked) {
      duckingEvents++;
      wasDucked = true;
    } else if (duckFactor > 0.6 && wasDucked) {
      musicRecoveryEvents++;
      wasDucked = false;
    }
  }

  const duckDb = 20 * Math.log10(duckedGain / baseGain);
  const diagnostics = {
    totalFrames,
    duckingEvents,
    musicRecoveryEvents,
    averageDuckDb: Number(duckDb.toFixed(1)),
    maxDuckDb: Number(duckDb.toFixed(1)),
    microPauseCount: pauses.filter((p) => p.type === PAUSE_TYPES.MICRO_PAUSE).length,
    normalPauseCount: pauses.filter((p) => p.type === PAUSE_TYPES.NORMAL_PAUSE).length,
    editorialPauseCount: pauses.filter((p) => p.type === PAUSE_TYPES.EDITORIAL_PAUSE).length,
    hasMusicTail: (totalFrames - lastWordFrame) >= fps * 1.5,
  };

  return { envelope, pauses, diagnostics };
}
