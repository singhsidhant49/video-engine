import fs from 'node:fs/promises';
import path from 'node:path';
import wavefile from 'wavefile';
import { config } from '../config/index.js';
import { ttsCache } from '../core/cache/cacheManager.js';

const { WaveFile } = wavefile;
const TTS_CHUNK_CHARS = 2800;

/** Split long narration at paragraph/sentence boundaries for reliable TTS. */
export function splitTtsText(text, maxChars = TTS_CHUNK_CHARS) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean || clean.length <= maxChars) return clean ? [clean] : [];
  const units = clean.match(/[^.!?\n]+(?:[.!?]+|\n+|$)/g)?.map((part) => part.trim()).filter(Boolean) || [clean];
  const chunks = [];
  let current = '';
  for (const unit of units) {
    if (unit.length > maxChars) {
      if (current) chunks.push(current);
      current = '';
      // Never split a word/number by raw character offset. Pathologically long
      // tokens are kept intact as their own chunk rather than corrupting what
      // the narrator says.
      let wordChunk = '';
      for (const word of unit.split(/\s+/).filter(Boolean)) {
        const next = wordChunk ? `${wordChunk} ${word}` : word;
        if (wordChunk && next.length > maxChars) {
          chunks.push(wordChunk);
          wordChunk = word;
        } else {
          wordChunk = next;
        }
      }
      if (wordChunk) chunks.push(wordChunk);
      continue;
    }
    const next = current ? `${current} ${unit}` : unit;
    if (next.length > maxChars) {
      chunks.push(current);
      current = unit;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

async function joinWavFiles(files, gapMs = 140) {
  const tracks = [];
  let sampleRate = null;
  let totalSamples = 0;
  for (const file of files) {
    const wav = new WaveFile(await fs.readFile(file));
    wav.toBitDepth('32f');
    const decoded = wav.getSamples(false, Float32Array);
    const samples = Array.isArray(decoded) ? decoded[0] : decoded;
    if (sampleRate == null) sampleRate = wav.fmt.sampleRate;
    if (wav.fmt.sampleRate !== sampleRate) throw new Error('Kokoro returned inconsistent sample rates across TTS chunks');
    tracks.push(samples);
    totalSamples += samples.length;
  }
  const gapSamples = Math.max(0, Math.round((sampleRate || 0) * gapMs / 1000));
  const joined = new Float32Array(totalSamples + gapSamples * Math.max(0, tracks.length - 1));
  let offset = 0;
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const samples = tracks[trackIndex];
    joined.set(samples, offset);
    offset += samples.length;
    if (trackIndex < tracks.length - 1) offset += gapSamples;
  }
  const output = new WaveFile();
  output.fromScratch(1, sampleRate, '32f', joined);
  output.toBitDepth('16');
  return Buffer.from(output.toBuffer());
}

/**
 * Generate speech audio file using local Kokoro TTS container.
 * 
 * @param {Object} options
 * @param {string} options.text - The text to speak
 * @param {string} options.outputFile - Target destination file path (.mp3)
 * @param {string} [options.voice] - Voice ID (e.g. af_bella, am_adam, af_sarah)
 * @param {number} [options.speed] - Speech speed (e.g. 0.9, 1.0)
 * @returns {Promise<{ filePath: string, wavPath: string, success: boolean, cached?: boolean }>}
 */
export async function generateSpeech({
  text,
  outputFile,
  voice = config.kokoro.defaultVoice,
  speed = config.kokoro.speed,
}) {
  // Ensure target directory exists
  const dir = path.dirname(outputFile);
  await fs.mkdir(dir, { recursive: true });
  const wavFile = outputFile.replace(/\.mp3$/i, '.wav');

  // Check TTS Cache (Milestone 12)
  const cached = await ttsCache.get({ text, voice, speed });
  if (cached.hit && cached.wavPath) {
    await fs.copyFile(cached.wavPath, wavFile);
    await fs.copyFile(cached.wavPath, outputFile);
    console.log(`⚡ Reused cached Kokoro TTS audio (${(cached.size / 1024).toFixed(1)} KB) -> ${outputFile}`);
    return { filePath: outputFile, wavPath: wavFile, success: true, cached: true };
  }

  const chunks = splitTtsText(text);
  if (chunks.length > 1) {
    console.log(`Long-form narration: generating ${chunks.length} bounded TTS chunks...`);
    const chunkFiles = [];
    const chunkWavFiles = [];
    try {
      for (let index = 0; index < chunks.length; index++) {
        const chunkFile = path.join(dir, `.tts-chunk-${String(index + 1).padStart(4, '0')}.mp3`);
        const generated = await generateSpeech({ text: chunks[index], outputFile: chunkFile, voice, speed });
        chunkFiles.push(chunkFile, generated.wavPath);
        chunkWavFiles.push(generated.wavPath);
      }
      const buffer = await joinWavFiles(chunkWavFiles);
      await fs.writeFile(wavFile, buffer);
      await fs.writeFile(outputFile, buffer);
      await ttsCache.set({ text, voice, speed }, buffer);
      console.log(`Joined ${chunks.length} narration chunks (${(buffer.length / 1024 / 1024).toFixed(1)} MB) -> ${outputFile}`);
      return { filePath: outputFile, wavPath: wavFile, success: true, cached: false, chunks: chunks.length };
    } finally {
      await Promise.all([...new Set(chunkFiles)].map((file) => fs.rm(file, { force: true }).catch(() => {})));
    }
  }

  console.log(`🗣️  Generating Kokoro TTS audio (Voice: ${voice}, Speed: ${speed})...`);

  try {
    const controller = new AbortController();
    const timeoutMs = Math.min(15 * 60_000, Math.max(120_000, text.length * 45));
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // Fetch raw WAV from Kokoro for instant zero-loss Whisper alignment
    let response;
    try {
      response = await fetch(config.kokoro.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer not-needed',
        },
        body: JSON.stringify({
          model: 'kokoro',
          input: text,
          voice: voice,
          response_format: 'wav',
          speed: speed,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Kokoro TTS failed with HTTP ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fs.writeFile(wavFile, buffer);
    // Also save MP3 destination (or write buffer)
    await fs.writeFile(outputFile, buffer);
    
    // Cache for future runs
    await ttsCache.set({ text, voice, speed }, buffer);

    console.log(`🔊 Voiceover saved successfully (${(buffer.length / 1024).toFixed(1)} KB) -> ${outputFile}`);

    return { filePath: outputFile, wavPath: wavFile, success: true, cached: false };
  } catch (error) {
    console.error('❌ Kokoro TTS error:', error.message);
    throw error;
  }
}
