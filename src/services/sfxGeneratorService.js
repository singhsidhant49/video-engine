import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

/**
 * High-Fidelity Acoustic SFX Generator for Remotion Sound Design.
 * Generates natural 44.1kHz 16-bit PCM WAV sound effects (organic air whooshes,
 * cinematic sub-bass drops, tactile paper slams, and smooth ambient beds).
 */
function createWavBuffer(samples, sampleRate = 44100) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // RIFF identifier
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);

  // format chunk identifier
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);

  // data chunk identifier
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(s < 0 ? s * 0x8000 : s * 0x7FFF), 44 + i * 2);
  }

  return buffer;
}

// Seeded PRNG so every run produces byte-identical SFX (no churn in tracked files, reproducible renders).
let seed = 1;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const SFX_BUILDERS = {
  whoosh: generateOrganicWhoosh,
  impact_boom: generateCinematicImpact,
  sub_drop: generateSubDrop,
  paper_slam: generateTactilePaperSlam,
  click: generateSubtleClick,
  cash_register: generateChime,
};

/**
 * Ensure the SFX files exist and return their public paths (for staticFile()).
 * Existing files are never overwritten, so a real sound designer's WAV dropped
 * into public/audio/sfx/<name>.wav replaces the synthesized one.
 */
export async function ensureSoundEffects() {
  const sfxDir = path.join(config.publicDir, 'audio', 'sfx');
  await fs.mkdir(sfxDir, { recursive: true });
  const sampleRate = 44100;
  const results = {};
  for (const [name, build] of Object.entries(SFX_BUILDERS)) {
    const filePath = path.join(sfxDir, `${name}.wav`);
    try {
      await fs.access(filePath);
    } catch {
      seed = name.length * 7919;
      await fs.writeFile(filePath, createWavBuffer(build(sampleRate), sampleRate));
    }
    results[name] = `audio/sfx/${name}.wav`;
  }
  return results;
}

// Closest existing synthesized bed per directing style (used when no real track is supplied).
const STYLE_BED = {
  cinematic_documentary: 'history_documentary',
  investigative: 'finance_markets',
  editorial_explainer: 'business_editorial',
  data_driven: 'finance_markets',
  tech_editorial: 'technology_ui',
  minimal_premium: 'business_editorial',
  fast_educational: 'technology_ui',
};

/**
 * Pick the music bed for a directing style. Resolution order:
 *   public/audio/bgm/<style>.(mp3|m4a|wav)  ← drop licensed music here
 *   public/audio/bgm/cinematic_ambient_<legacy>.wav
 *   a generated ambient pad (last resort)
 * @returns {Promise<{src: string, synthetic: boolean}>}
 */
export async function ensureBackgroundMusic(style = 'editorial_explainer') {
  const bgmDir = path.join(config.publicDir, 'audio', 'bgm');
  await fs.mkdir(bgmDir, { recursive: true });
  for (const ext of ['mp3', 'm4a', 'wav']) {
    try {
      await fs.access(path.join(bgmDir, `${style}.${ext}`));
      return { src: `audio/bgm/${style}.${ext}`, synthetic: false };
    } catch { /* try next */ }
  }
  const legacy = `cinematic_ambient_${STYLE_BED[style] || 'business_editorial'}.wav`;
  const filePath = path.join(bgmDir, legacy);
  try {
    await fs.access(filePath);
    return { src: `audio/bgm/${legacy}`, synthetic: true };
  } catch { /* generate */ }
  {
    // Generate 45-second rich, velvety ambient score
    const sampleRate = 22050;
    const duration = 45.0;
    const numSamples = Math.floor(sampleRate * duration);
    const samples = new Float32Array(numSamples);

    // Deep harmonic pad frequencies (C minor / D minor cinematic foundation)
    const freqs = [65.41, 98.0, 130.81, 196.0, 246.94];

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let s = 0;
      const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.08 * t);
      const subLfo = 0.5 + 0.5 * Math.cos(2 * Math.PI * 0.05 * t);

      for (let f = 0; f < freqs.length; f++) {
        const microPitch = freqs[f] * (1.0 + 0.0015 * Math.sin(2 * Math.PI * 0.2 * t + f));
        s += Math.sin(2 * Math.PI * microPitch * t) * (0.22 / (f + 1));
      }

      const fadeIn = Math.min(1, t / 3.0);
      const fadeOut = Math.min(1, (duration - t) / 3.0);
      samples[i] = s * (lfo * 0.6 + subLfo * 0.4) * fadeIn * fadeOut * 0.38;
    }

    await fs.writeFile(filePath, createWavBuffer(samples, sampleRate));
    return { src: `audio/bgm/${legacy}`, synthetic: true };
  }
}

// 1. Organic Cinema Whoosh: Multi-band filtered pink noise air rush (no synthetic laser sweep)
function generateOrganicWhoosh(sampleRate) {
  const duration = 0.38;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples;
    // Asymmetric organic envelope: quick rise (35%), gentle release (65%)
    const env = t < 0.35
      ? Math.sin((t / 0.35) * (Math.PI / 2)) ** 2
      : Math.cos(((t - 0.35) / 0.65) * (Math.PI / 2)) ** 2;

    // Pink noise filter algorithm (Paul Kellet method)
    const white = rand() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;

    // Subtle low-mid resonant body without any melodic tone
    const sub = Math.sin(2 * Math.PI * (70 + t * 40) * (i / sampleRate)) * 0.25;

    samples[i] = (pink * 0.85 + sub * 0.15) * env * 0.75;
  }
  return samples;
}

// 2. Cinematic Impact: Low-end acoustic sub thud + subtle transient hit
function generateCinematicImpact(sampleRate) {
  const duration = 0.85;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 6.5);
    const freq = 42 + 75 * Math.exp(-t * 22);
    const sub = Math.sin(2 * Math.PI * freq * t);
    const airPuff = (i < 300 ? (rand() * 2 - 1) * Math.exp(-t * 80) : 0);

    samples[i] = (sub * 0.88 + airPuff * 0.2) * env;
  }
  return samples;
}

// 3. Sub Drop: Heavy cinematic bass drop (75Hz -> 26Hz)
function generateSubDrop(sampleRate) {
  const duration = 1.1;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 2.8);
    const freq = 26 + 50 * Math.exp(-t * 3.8);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.85;
  }
  return samples;
}

// 4. Tactile Paper Slam: Realistic document slap on desk
function generateTactilePaperSlam(sampleRate) {
  const duration = 0.32;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 18.0);
    const noise = (rand() * 2 - 1) * Math.exp(-t * 45.0);
    const thud = Math.sin(2 * Math.PI * 65 * t) * env;
    samples[i] = (noise * 0.55 + thud * 0.45) * 0.8;
  }
  return samples;
}

// 5. Subtle Click / Tap: 10ms tactile UI impulse
function generateSubtleClick(sampleRate) {
  const duration = 0.04;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 120.0);
    const tone = Math.sin(2 * Math.PI * 1400 * t);
    samples[i] = tone * env * 0.5;
  }
  return samples;
}

// 6. High-End Chime: Soft harmonic shimmer
function generateChime(sampleRate) {
  const duration = 0.6;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 5.5);
    const tone1 = Math.sin(2 * Math.PI * 1567.98 * t); // G6
    const tone2 = Math.sin(2 * Math.PI * 2093.00 * t); // C7
    samples[i] = (tone1 * 0.6 + tone2 * 0.4) * env * 0.6;
  }
  return samples;
}

