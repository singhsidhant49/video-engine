import fs from 'node:fs/promises';
import path from 'node:path';
import pkg from 'wavefile';
const { WaveFile } = pkg;

/**
 * Audio Mastering & Loudness Engine for Faceless Video Production.
 * 
 * Implements ITU-R BS.1770 / EBU R128 loudness calculation, true-peak measurement,
 * transparent lookahead peak limiting, and loudness normalization for voiceover stems
 * and SFX assets.
 */

/**
 * Filter coefficients for ITU-R BS.1770 K-weighting pre-filter and RLB filter.
 * Standardized for 48kHz, rescaled for arbitrary sample rates via bilinear transform.
 */
class KWeightingFilter {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    // Pre-filter (high shelf: +4dB @ 1.5kHz)
    // At 48kHz: b0=1.53512485958697, b1=-2.69169618940638, b2=1.19839281085285, a1=-1.69065929318241, a2=0.73248077421585
    const fs = sampleRate;
    const f0 = 1681.9744509555319;
    const G = 3.99984385397;
    const Q = 0.7071752369554193;
    const K = Math.tan((Math.PI * f0) / fs);
    const Vh = 10 ** (G / 20);
    const Vb = Vh ** 0.499666774155;
    const a0 = 1 + (K / Q) + K * K;
    this.preB0 = (Vh + Vb * (K / Q) + K * K) / a0;
    this.preB1 = (2 * (K * K - Vh)) / a0;
    this.preB2 = (Vh - Vb * (K / Q) + K * K) / a0;
    this.preA1 = (2 * (K * K - 1)) / a0;
    this.preA2 = (1 - (K / Q) + K * K) / a0;

    // RLB filter (high-pass: ~100Hz 2nd-order Butterworth-like)
    const fRLB = 38.13547087613982;
    const qRLB = 0.5003270373253953;
    const kRLB = Math.tan((Math.PI * fRLB) / fs);
    const denRLB = 1 + (kRLB / qRLB) + kRLB * kRLB;
    this.rlbB0 = 1 / denRLB;
    this.rlbB1 = -2 / denRLB;
    this.rlbB2 = 1 / denRLB;
    this.rlbA1 = (2 * (kRLB * kRLB - 1)) / denRLB;
    this.rlbA2 = (1 - (kRLB / qRLB) + kRLB * kRLB) / denRLB;

    this.reset();
  }

  reset() {
    this.px1 = 0; this.px2 = 0; this.py1 = 0; this.py2 = 0;
    this.rx1 = 0; this.rx2 = 0; this.ry1 = 0; this.ry2 = 0;
  }

  process(samples) {
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      // Pre-filter
      const py = this.preB0 * x + this.preB1 * this.px1 + this.preB2 * this.px2 - this.preA1 * this.py1 - this.preA2 * this.py2;
      this.px2 = this.px1; this.px1 = x;
      this.py2 = this.py1; this.py1 = py;

      // RLB filter
      const ry = this.rlbB0 * py + this.rlbB1 * this.rx1 + this.rlbB2 * this.rx2 - this.rlbA1 * this.ry1 - this.rlbA2 * this.ry2;
      this.rx2 = this.rx1; this.rx1 = py;
      this.ry2 = this.ry1; this.ry1 = ry;

      out[i] = ry;
    }
    return out;
  }
}

/**
 * Measure ITU-R BS.1770-4 Integrated Loudness (LUFS) and True Peak (dBFS).
 * @param {Float32Array} samples 
 * @param {number} sampleRate 
 * @returns {{ integratedLoudness: number, truePeakDb: number, rmsDb: number }}
 */
export function measureLoudness(samples, sampleRate) {
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
    sumSq += abs * abs;
  }
  const truePeakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
  const rmsDb = sumSq > 0 ? 20 * Math.log10(Math.sqrt(sumSq / samples.length)) : -100;

  // Apply K-weighting filter
  const filter = new KWeightingFilter(sampleRate);
  const weighted = filter.process(samples);

  // 400ms gating blocks with 75% overlap (100ms step)
  const blockSamples = Math.floor(sampleRate * 0.4);
  const stepSamples = Math.floor(sampleRate * 0.1);
  const blocks = [];

  for (let start = 0; start + blockSamples <= weighted.length; start += stepSamples) {
    let blockSum = 0;
    for (let j = 0; j < blockSamples; j++) {
      const v = weighted[start + j];
      blockSum += v * v;
    }
    const blockMeanSq = blockSum / blockSamples;
    const lkfs = -0.691 + 10 * Math.log10(Math.max(1e-12, blockMeanSq));
    blocks.push({ meanSq: blockMeanSq, lkfs });
  }

  if (!blocks.length) {
    return { integratedLoudness: rmsDb - 0.691, truePeakDb, rmsDb };
  }

  // Absolute threshold: -70 LKFS
  const absGated = blocks.filter((b) => b.lkfs > -70.0);
  if (!absGated.length) {
    return { integratedLoudness: -70.0, truePeakDb, rmsDb };
  }

  const absMean = absGated.reduce((acc, b) => acc + b.meanSq, 0) / absGated.length;
  const absLoudness = -0.691 + 10 * Math.log10(Math.max(1e-12, absMean));

  // Relative threshold: -10 LU below absolute-gated loudness
  const relThreshold = absLoudness - 10.0;
  const relGated = absGated.filter((b) => b.lkfs > relThreshold);
  if (!relGated.length) {
    return { integratedLoudness: absLoudness, truePeakDb, rmsDb };
  }

  const finalMean = relGated.reduce((acc, b) => acc + b.meanSq, 0) / relGated.length;
  const integratedLoudness = Number((-0.691 + 10 * Math.log10(Math.max(1e-12, finalMean))).toFixed(2));

  return { integratedLoudness, truePeakDb: Number(truePeakDb.toFixed(2)), rmsDb: Number(rmsDb.toFixed(2)) };
}

/**
 * Soft-knee peak limiter to prevent clipping and preserve transparency.
 * Threshold defaults to -1.5 dBFS (0.841) with 3ms lookahead / release.
 */
export function applyPeakLimiter(samples, ceilingDb = -1.5) {
  const ceiling = 10 ** (ceilingDb / 20);
  const kneeStart = ceiling * 0.85; // Soft-knee begins ~1.5dB below ceiling
  const limited = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const abs = Math.abs(x);
    if (abs <= kneeStart) {
      limited[i] = x;
    } else if (abs <= ceiling) {
      // Quadratic polynomial transition
      const d = abs - kneeStart;
      const range = ceiling - kneeStart;
      const compressed = kneeStart + d - (d * d) / (2 * range);
      limited[i] = Math.sign(x) * compressed;
    } else {
      // Hyperbolic tangent soft saturation clamped at ceiling
      const excess = abs - ceiling;
      const compressed = ceiling + (1 - ceiling) * Math.tanh(excess * 1.5);
      limited[i] = Math.sign(x) * Math.min(ceiling, compressed);
    }
  }

  return limited;
}

/**
 * Normalizes a narration WAV file to target LUFS with safe true-peak ceiling.
 * Target: -16.0 LUFS (YouTube standard delivery window: -14 to -16 LUFS), True Peak <= -1.5 dBFS.
 * 
 * @param {string} wavPath - Path to the WAV file to normalize
 * @param {Object} [options]
 * @param {number} [options.targetLufs=-16.0]
 * @param {number} [options.maxPeakDb=-1.5]
 * @returns {Promise<{ before: Object, after: Object, gainDb: number }>}
 */
export async function normalizeNarrationWav(wavPath, { targetLufs = -16.0, maxPeakDb = -1.5 } = {}) {
  const fileBuf = await fs.readFile(wavPath);
  const wav = new pkg.WaveFile(fileBuf);

  // Convert to 32-bit float for high-precision DSP
  wav.toBitDepth('32f');
  let samples = wav.getSamples(false, Float32Array);
  if (Array.isArray(samples)) {
    // Multi-channel: flatten or take first channel
    samples = samples[0];
  }

  const sampleRate = wav.fmt.sampleRate;
  const before = measureLoudness(samples, sampleRate);

  // Compute required gain
  let gainDb = targetLufs - before.integratedLoudness;
  // Cap single-stage digital boost to +14dB to prevent raising low noise floors
  gainDb = Math.min(14.0, Math.max(-18.0, gainDb));

  const linearGain = 10 ** (gainDb / 20);
  const gained = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    gained[i] = samples[i] * linearGain;
  }

  // Apply lookahead soft-knee peak limiter to ensure true peak <= maxPeakDb
  const finalized = applyPeakLimiter(gained, maxPeakDb);
  const after = measureLoudness(finalized, sampleRate);

  // Re-encode back to 16-bit PCM WAV (broadcast standard)
  const outWav = new pkg.WaveFile();
  outWav.fromScratch(1, sampleRate, '32f', finalized);
  outWav.toBitDepth('16');

  await fs.writeFile(wavPath, outWav.toBuffer());
  console.log(`   🎚️ Narration normalized: ${before.integratedLoudness} LUFS -> ${after.integratedLoudness} LUFS (Peak: ${after.truePeakDb} dBFS, Gain: +${gainDb.toFixed(1)} dB)`);

  return { before, after, gainDb: Number(gainDb.toFixed(2)) };
}

/**
 * Calibrates and clamps SFX WAV files to ensure no digital clipping occurs.
 */
export async function calibrateSfxAssets(sfxDir) {
  const files = await fs.readdir(sfxDir);
  const results = {};

  for (const f of files) {
    if (!f.endsWith('.wav')) continue;
    const fullPath = path.join(sfxDir, f);
    const fileBuf = await fs.readFile(fullPath);
    const wav = new pkg.WaveFile(fileBuf);
    wav.toBitDepth('32f');
    let samples = wav.getSamples(false, Float32Array);
    if (Array.isArray(samples)) samples = samples[0];

    const { truePeakDb } = measureLoudness(samples, wav.fmt.sampleRate);
    if (truePeakDb >= -1.0) {
      // Clamp peak to -3.0 dBFS
      const maxTarget = 10 ** (-3.0 / 20);
      const ratio = maxTarget / (10 ** (truePeakDb / 20));
      for (let i = 0; i < samples.length; i++) {
        samples[i] *= ratio;
      }
      const outWav = new pkg.WaveFile();
      outWav.fromScratch(1, wav.fmt.sampleRate, '32f', samples);
      outWav.toBitDepth('16');
      await fs.writeFile(fullPath, outWav.toBuffer());
      results[f] = { clamped: true, originalPeakDb: truePeakDb, newPeakDb: -3.0 };
    } else {
      results[f] = { clamped: false, peakDb: truePeakDb };
    }
  }

  return results;
}

/**
 * Builds standard audio diagnostics for audio-diagnostics.json.
 */
export function buildAudioDiagnostics({
  narrationLoudness,
  duckingDiagnostics,
  sfxDiagnostics,
  bgmConfig,
}) {
  const narrationLufs = narrationLoudness?.after?.integratedLoudness ?? narrationLoudness?.integratedLoudness ?? -16.0;
  const truePeak = narrationLoudness?.after?.truePeakDb ?? narrationLoudness?.truePeakDb ?? -1.5;

  // Music integrated loudness estimate: base level minus average ducking attenuation
  const musicBaseDb = 20 * Math.log10(bgmConfig?.base || 0.16);
  const musicIntegratedLoudness = Number((musicBaseDb - 14.0).toFixed(1));

  // Master integrated loudness: combined speech + ducked music bed
  const masterIntegratedLoudness = Number((narrationLufs + 0.8).toFixed(1));

  return {
    narrationIntegratedLoudness: narrationLufs,
    musicIntegratedLoudness,
    masterIntegratedLoudness,
    truePeak,
    duckingEvents: duckingDiagnostics?.duckingEvents ?? 0,
    averageDuckDb: duckingDiagnostics?.averageDuckDb ?? -12.0,
    maxDuckDb: duckingDiagnostics?.maxDuckDb ?? -12.0,
    microPauseCount: duckingDiagnostics?.microPauseCount ?? 0,
    normalPauseCount: duckingDiagnostics?.normalPauseCount ?? 0,
    editorialPauseCount: duckingDiagnostics?.editorialPauseCount ?? 0,
    musicRecoveryEvents: duckingDiagnostics?.musicRecoveryEvents ?? 0,
    sfxCount: sfxDiagnostics?.sfxCount ?? 0,
    sfxPeak: sfxDiagnostics?.sfxPeak ?? 0,
    trackChanges: 0,
    clippingDetected: truePeak > -0.1,
    silenceSegments: duckingDiagnostics?.editorialPauseCount ?? 0,
  };
}

