import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import wavefile from 'wavefile';
import { env, pipeline } from '@huggingface/transformers';
import { ffmpeg, probeDuration } from './ffmpeg.js';
import { tokenizeScript, alignScriptToTranscript, estimateTiming } from './alignmentService.js';

// base.en is markedly more accurate than tiny.en on word boundaries and numbers.
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'Xenova/whisper-base.en';
env.cacheDir = process.env.TRANSFORMERS_CACHE || path.resolve('.cache', 'huggingface');
let whisperPipeline = null;
const WHISPER_WORKER_PATH = fileURLToPath(new URL('./whisperTranscriptionWorker.js', import.meta.url));

const positiveNumber = (value, fallback, minimum = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
};

export function resolveWhisperPolicy(durationInSeconds, source = process.env) {
  const enabled = String(source.WHISPER_ENABLED || 'auto').trim().toLowerCase();
  const maxAudioSeconds = positiveNumber(source.WHISPER_MAX_AUDIO_SECONDS, 180, 0);
  const timeoutMs = positiveNumber(source.WHISPER_TIMEOUT_MS, 120_000, 5_000);
  if (['false', '0', 'off', 'disabled'].includes(enabled)) {
    return { useWhisper: false, reason: 'disabled by WHISPER_ENABLED', maxAudioSeconds, timeoutMs };
  }
  if (maxAudioSeconds > 0 && durationInSeconds > maxAudioSeconds) {
    return {
      useWhisper: false,
      reason: `audio duration ${durationInSeconds.toFixed(1)}s exceeds WHISPER_MAX_AUDIO_SECONDS=${maxAudioSeconds}`,
      maxAudioSeconds,
      timeoutMs,
    };
  }
  return { useWhisper: true, reason: 'within configured resource limits', maxAudioSeconds, timeoutMs };
}

async function getWhisper() {
  if (!whisperPipeline) {
    console.log(`🤖 Loading ${WHISPER_MODEL} for word timing...`);
    whisperPipeline = await pipeline('automatic-speech-recognition', WHISPER_MODEL);
  }
  return whisperPipeline;
}

/** Release ONNX model memory before the visual models are loaded. */
export async function releaseWhisper() {
  const active = whisperPipeline;
  whisperPipeline = null;
  await active?.dispose?.();
}

/** Decode any audio file to 16 kHz mono float samples via the bundled ffmpeg. */
async function decodeTo16kMono(audioPath) {
  const tmp = path.join(os.tmpdir(), `align-${process.pid}-${Date.now()}.wav`);
  try {
    await ffmpeg(['-y', '-i', audioPath, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', tmp]);
    const wav = new wavefile.WaveFile(await fs.readFile(tmp));
    wav.toBitDepth('32f');
    let samples = wav.getSamples(false, Float32Array);
    if (Array.isArray(samples)) samples = samples[0];
    return samples;
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/** Word-level transcript executed inside the isolated Whisper process. */
async function transcribeWordsInProcess(audioPath) {
  const samples = await decodeTo16kMono(audioPath);
  const transcriber = await getWhisper();
  const result = await transcriber(samples, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  return (result?.chunks || [])
    .map((c) => ({ text: String(c.text || '').trim(), start: c.timestamp?.[0], end: c.timestamp?.[1] }))
    .filter((w) => w.text && Number.isFinite(w.start))
    .map((w) => ({ ...w, end: Number.isFinite(w.end) ? w.end : w.start + 0.3 }));
}

/** Run Whisper in a separate OS process. A timeout terminates the actual ONNX
 * computation instead of merely abandoning an in-process promise. */
export async function transcribeWords(audioPath, { timeoutMs = 120_000, signal } = {}) {
  if (process.env.WHISPER_CHILD_PROCESS === 'true') return transcribeWordsInProcess(audioPath);
  if (signal?.aborted) throw Object.assign(new Error('Whisper alignment cancelled'), { name: 'AbortError' });

  return new Promise((resolve, reject) => {
    const child = fork(WHISPER_WORKER_PATH, [audioPath], {
      env: { ...process.env, WHISPER_CHILD_PROCESS: 'true' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      execArgv: [],
      serialization: 'json',
    });
    let settled = false;
    const finish = (error, transcript) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      child.removeAllListeners();
      if (child.connected) child.disconnect();
      if (error) reject(error);
      else resolve(transcript);
    };
    const terminate = (error) => {
      if (!child.killed) child.kill('SIGKILL');
      finish(error);
    };
    const onAbort = () => terminate(Object.assign(new Error('Whisper alignment cancelled'), { name: 'AbortError' }));
    const timer = setTimeout(() => {
      const error = new Error(`Whisper transcription timed out after ${Math.round(timeoutMs / 1000)}s; isolated process terminated`);
      error.code = 'WHISPER_TIMEOUT';
      terminate(error);
    }, timeoutMs);
    timer.unref?.();
    signal?.addEventListener('abort', onAbort, { once: true });
    child.once('message', (message) => {
      if (message?.ok && Array.isArray(message.transcript)) finish(null, message.transcript);
      else finish(new Error(message?.error || 'Whisper worker returned an invalid response'));
    });
    child.once('error', (error) => finish(error));
    child.once('exit', (code, exitSignal) => {
      if (!settled) finish(new Error(`Whisper worker exited before producing timestamps (code ${code ?? 'none'}, signal ${exitSignal || 'none'})`));
    });
  });
}

import { alignmentCache } from '../core/cache/cacheManager.js';
import crypto from 'node:crypto';

/**
 * Time every word of the SCRIPT against the actual narration audio.
 * The script supplies the text (captions are always spelled as written);
 * the transcript supplies timing via sequence alignment.
 */
export async function analyzeNarration(audioPath, scriptText, fps, { signal } = {}) {
  const durationInSeconds = await probeDuration(audioPath);
  const scriptWords = tokenizeScript(scriptText);

  // Compute audio hash for alignment cache (Milestone 12)
  let audioHash = null;
  try {
    const audioBuf = await fs.readFile(audioPath);
    audioHash = crypto.createHash('sha256').update(audioBuf).digest('hex').slice(0, 16);
  } catch {}

  let words;
  let source = 'whisper';
  let transcript = [];

  // Check alignment cache
  const cached = audioHash ? await alignmentCache.get({ audioHash, script: scriptText, model: WHISPER_MODEL }) : { hit: false };
  if (cached.hit && cached.data?.transcript) {
    transcript = cached.data.transcript;
    words = alignScriptToTranscript(scriptWords, transcript, durationInSeconds);
    source = 'whisper-cache';
    console.log(`⚡ Reused cached Whisper word alignment (${transcript.length} words)`);
  } else {
    try {
      const policy = resolveWhisperPolicy(durationInSeconds);
      if (!policy.useWhisper) throw new Error(`Whisper skipped: ${policy.reason}`);
      transcript = await transcribeWords(audioPath, { timeoutMs: policy.timeoutMs, signal });
      if (transcript.length < Math.max(3, scriptWords.length * 0.3)) throw new Error(`only ${transcript.length} transcript words`);
      words = alignScriptToTranscript(scriptWords, transcript, durationInSeconds);
      if (audioHash) {
        await alignmentCache.set({ audioHash, script: scriptText, model: WHISPER_MODEL }, { transcript });
      }
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) throw err;
      console.warn(`⚠️  Word timing fell back to estimation (${err.message}). Captions and cuts will be approximate.`);
      words = estimateTiming(scriptWords, durationInSeconds);
      source = 'estimate';
    }
  }

  const matchRate = words.length ? words.filter((w) => w.matched).length / words.length : 0;
  const timed = words.map((w) => ({
    ...w,
    startFrame: Math.round(w.start * fps),
    endFrame: Math.round(w.end * fps),
  }));

  console.log(`⏱️  Narration ${durationInSeconds.toFixed(2)}s · ${timed.length} script words · ${(matchRate * 100).toFixed(0)}% matched to transcript (${source})`);
  return {
    durationInSeconds,
    totalFrames: Math.ceil(durationInSeconds * fps),
    fps,
    words: timed,
    transcript,
    source,
    matchRate,
  };
}
