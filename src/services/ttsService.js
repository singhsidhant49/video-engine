import fs from 'node:fs/promises';
import path from 'node:path';
import wavefile from 'wavefile';
import { config } from '../config/index.js';
import { ttsCache } from '../core/cache/cacheManager.js';
import { normalizeTextForTts } from '../audio/ttsTextNormalizer.js';

export { normalizeTextForTts };

const { WaveFile } = wavefile;
const TTS_CHUNK_CHARS = 2800;
const RETRYABLE_TTS_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);
const RETRYABLE_TTS_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function errorCode(error) {
  return error?.code || error?.cause?.code || error?.cause?.cause?.code || null;
}

export function isRetryableTtsError(error) {
  return RETRYABLE_TTS_ERROR_CODES.has(errorCode(error))
    || RETRYABLE_TTS_HTTP_STATUSES.has(Number(error?.status));
}

function waitForRetry(ms, signal) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('TTS generation cancelled'), { name: 'AbortError' }));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(Object.assign(new Error('TTS generation cancelled'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Call Kokoro with bounded retries for transient DNS, connection, and provider
 * failures. A worker must survive a short container restart without discarding
 * an otherwise valid script and production plan.
 */
export async function requestKokoroSpeech({
  url,
  payload,
  signal,
  timeoutMs,
  fetchImpl = globalThis.fetch,
  attempts = Math.max(1, Number(process.env.KOKORO_RETRY_ATTEMPTS || 5)),
  retryBaseDelayMs = Math.max(0, Number(process.env.KOKORO_RETRY_BASE_DELAY_MS || 1000)),
}) {
  const maxAttempts = Number.isFinite(Number(attempts)) ? Math.max(1, Math.floor(Number(attempts))) : 5;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error('TTS generation cancelled'), { name: 'AbortError' });
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer not-needed',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.ok) return response;
      const failure = Object.assign(
        new Error(`Kokoro TTS failed with HTTP ${response.status} ${response.statusText}`),
        { status: response.status }
      );
      if (!isRetryableTtsError(failure)) throw failure;
      lastError = failure;
    } catch (error) {
      if (signal?.aborted) throw Object.assign(new Error('TTS generation cancelled'), { name: 'AbortError' });
      const requestError = timedOut
        ? Object.assign(new Error(`Kokoro TTS request timed out after ${timeoutMs}ms`, { cause: error }), { code: 'ETIMEDOUT' })
        : error;
      lastError = requestError;
      if (!isRetryableTtsError(requestError)) throw requestError;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }

    if (attempt < maxAttempts) {
      const delayMs = Math.min(8000, retryBaseDelayMs * (2 ** (attempt - 1)));
      console.warn(`Kokoro unavailable (${errorCode(lastError) || lastError?.status || 'transient error'}); retrying ${attempt + 1}/${maxAttempts} in ${delayMs}ms...`);
      await waitForRetry(delayMs, signal);
    }
  }

  throw Object.assign(
    new Error(`Kokoro TTS is unavailable after ${maxAttempts} attempts: ${lastError?.message || 'connection failed'}`, { cause: lastError }),
    { code: 'TTS_UNAVAILABLE', resumeFrom: 'audio', retryable: true }
  );
}

/** Split long narration at paragraph/sentence boundaries for reliable TTS. */
export function splitTtsText(text, maxChars = TTS_CHUNK_CHARS) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean || clean.length <= maxChars) return clean ? [clean] : [];
  // Use lookbehind & lookahead so decimal numbers (e.g. 7.5) are never split across units
  const units = clean.match(/(?:[^.!?\n]|(?<=\d)\.(?=\d))+([.!?]+|\n+|$)/g)?.map((part) => part.trim()).filter(Boolean) || [clean];
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

async function joinWavFiles(files, gapMs = 120, silenceMs = 500) {
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
  return appendWavSilence(Buffer.from(output.toBuffer()), silenceMs);
}

/**
 * Appends safe clean silence to the end of a WAV buffer to prevent player audio truncation.
 * Shorts use a tighter 200-250ms tail to enable seamless looping, whereas long-form uses ~500ms.
 */
export function appendWavSilence(buffer, silenceMs = 500) {
  try {
    const wav = new WaveFile(buffer);
    wav.toBitDepth('32f');
    const decoded = wav.getSamples(false, Float32Array);
    const samples = Array.isArray(decoded) ? decoded[0] : decoded;
    const sampleRate = wav.fmt.sampleRate || 24000;
    const padSamples = Math.round(sampleRate * (silenceMs / 1000));
    if (padSamples <= 0) return buffer;
    const padded = new Float32Array(samples.length + padSamples);
    padded.set(samples, 0);
    const output = new WaveFile();
    output.fromScratch(1, sampleRate, '32f', padded);
    output.toBitDepth('16');
    return Buffer.from(output.toBuffer());
  } catch {
    return buffer;
  }
}

/**
 * Generate speech audio file using local Kokoro TTS container.
 * 
 * @param {Object} options
 * @param {string} options.text - The text to speak
 * @param {string} options.outputFile - Target destination file path (.mp3)
 * @param {string} [options.voice] - Voice ID (e.g. af_bella, am_adam, af_sarah)
 * @param {number} [options.speed] - Speech speed (e.g. 0.9, 1.0)
 * @param {AbortSignal} [options.signal] - optional cancellation signal
 * @returns {Promise<{ filePath: string, wavPath: string, success: boolean, cached?: boolean }>}
 */
export async function generateSpeech({
  text,
  outputFile,
  voice = config.kokoro.defaultVoice,
  speed = config.kokoro.speed,
  format = 'landscape',
  silenceMs = null,
  gapMs = null,
  signal,
}) {
  if (signal?.aborted) throw Object.assign(new Error('TTS generation cancelled'), { name: 'AbortError' });
  const effectiveSilenceMs = silenceMs != null ? silenceMs : (format === 'shorts' ? 220 : 500);
  const effectiveGapMs = gapMs != null ? gapMs : (format === 'shorts' ? 50 : 120);
  const spokenText = normalizeTextForTts(text);

  // Ensure target directory exists
  const dir = path.dirname(outputFile);
  await fs.mkdir(dir, { recursive: true });
  const wavFile = outputFile.replace(/\.mp3$/i, '.wav');

  // Check TTS Cache (Milestone 12) keyed on normalized spoken text
  const cached = await ttsCache.get({ text: spokenText, voice, speed });
  if (cached.hit && cached.wavPath) {
    await fs.copyFile(cached.wavPath, wavFile);
    await fs.copyFile(cached.wavPath, outputFile);
    console.log(`⚡ Reused cached Kokoro TTS audio (${(cached.size / 1024).toFixed(1)} KB) -> ${outputFile}`);
    return { filePath: outputFile, wavPath: wavFile, success: true, cached: true };
  }

  const chunks = splitTtsText(spokenText);
  if (chunks.length > 1) {
    console.log(`Long-form narration: generating ${chunks.length} bounded TTS chunks...`);
    const chunkFiles = [];
    const chunkWavFiles = [];
    try {
      for (let index = 0; index < chunks.length; index++) {
        const chunkFile = path.join(dir, `.tts-chunk-${String(index + 1).padStart(4, '0')}.mp3`);
        const generated = await generateSpeech({ text: chunks[index], outputFile: chunkFile, voice, speed, format, silenceMs: 0, signal });
        chunkFiles.push(chunkFile, generated.wavPath);
        chunkWavFiles.push(generated.wavPath);
      }
      const buffer = await joinWavFiles(chunkWavFiles, effectiveGapMs, effectiveSilenceMs);
      await fs.writeFile(wavFile, buffer);
      await fs.writeFile(outputFile, buffer);
      await ttsCache.set({ text: spokenText, voice, speed }, buffer);
      console.log(`Joined ${chunks.length} narration chunks (${(buffer.length / 1024 / 1024).toFixed(1)} MB) -> ${outputFile}`);
      return { filePath: outputFile, wavPath: wavFile, success: true, cached: false, chunks: chunks.length };
    } finally {
      await Promise.all([...new Set(chunkFiles)].map((file) => fs.rm(file, { force: true }).catch(() => {})));
    }
  }

  console.log(`🗣️  Generating Kokoro TTS audio (Voice: ${voice}, Speed: ${speed})...`);

  try {
    const timeoutMs = Math.min(15 * 60_000, Math.max(120_000, spokenText.length * 45));
    // Fetch raw WAV from Kokoro for instant zero-loss Whisper alignment
    const response = await requestKokoroSpeech({
      url: config.kokoro.url,
      signal,
      timeoutMs,
      payload: {
          model: 'kokoro',
          input: spokenText,
          voice: voice,
          response_format: 'wav',
          speed: speed,
      },
    });

    const arrayBuffer = await response.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    const buffer = appendWavSilence(rawBuffer, effectiveSilenceMs);

    await fs.writeFile(wavFile, buffer);
    // Also save MP3 destination (or write buffer)
    await fs.writeFile(outputFile, buffer);
    
    // Cache for future runs
    await ttsCache.set({ text: spokenText, voice, speed }, buffer);

    console.log(`🔊 Voiceover saved successfully (${(buffer.length / 1024).toFixed(1)} KB) -> ${outputFile}`);

    return { filePath: outputFile, wavPath: wavFile, success: true, cached: false };
  } catch (error) {
    console.error('❌ Kokoro TTS error:', error.message);
    throw error;
  }
}
