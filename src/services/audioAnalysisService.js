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
  const maxAudioSeconds = positiveNumber(source.WHISPER_MAX_AUDIO_SECONDS, 900, 0);
  const timeoutMs = positiveNumber(source.WHISPER_TIMEOUT_MS, Math.max(180_000, Math.ceil(durationInSeconds * 1_500)), 5_000);
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

/**
 * Whisper can repeat the tail of one internal window at the beginning of the
 * next and occasionally returns that repeated phrase with timestamps several
 * seconds in the past. Caption alignment must never consume a non-monotonic
 * transcript. Drop punctuation-only hallucinations, adjacent duplicates and
 * the repeated portion until timestamps catch back up to the accepted audio.
 */
export function sanitizeTranscriptTimeline(transcript = []) {
  const output = [];
  let catchUpAt = null;
  for (const item of transcript) {
    const text = String(item?.text || '').trim();
    const start = Number(item?.start);
    const rawEnd = Number(item?.end);
    if (!text || !/[\p{L}\p{N}]/u.test(text) || !Number.isFinite(start)) continue;
    const end = Number.isFinite(rawEnd) ? Math.max(start + 0.01, rawEnd) : start + 0.3;

    if (catchUpAt != null) {
      if (start < catchUpAt) continue;
      catchUpAt = null;
    }

    const previous = output.at(-1);
    if (previous && start < previous.start - 0.35) {
      catchUpAt = previous.end;
      if (start < catchUpAt) continue;
      catchUpAt = null;
    }

    const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const previousNormalized = String(previous?.text || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (previous && normalized && normalized === previousNormalized && start < previous.end + 0.15) continue;

    output.push({ ...item, text, start, end });
  }
  return output;
}

/**
 * Locates the lowest energy (silence) point within a window to avoid cutting in the middle of a spoken word.
 */
export function findSilenceCutPoint(samples, startOffset, sampleRate = 16000, targetSec = 28, windowSec = 4) {
  const targetSample = startOffset + Math.round(targetSec * sampleRate);
  if (targetSample >= samples.length) return samples.length;

  const minSample = Math.max(startOffset + Math.round((targetSec - windowSec) * sampleRate), startOffset + sampleRate * 10);
  const maxSample = Math.min(samples.length, startOffset + Math.round((targetSec + windowSec) * sampleRate));

  const step = Math.round(sampleRate * 0.05); // 50ms step
  const win = Math.round(sampleRate * 0.1); // 100ms window
  let bestSample = targetSample;
  let minEnergy = Infinity;

  for (let s = minSample; s + win <= maxSample; s += step) {
    let sum = 0;
    for (let j = 0; j < win; j += 4) {
      const val = samples[s + j];
      sum += val * val;
    }
    if (sum < minEnergy) {
      minEnergy = sum;
      bestSample = s + Math.round(win / 2);
    }
  }
  return bestSample;
}

/** Word-level transcript executed inside the isolated Whisper process. */
async function transcribeWordsInProcess(audioPath) {
  const samples = await decodeTo16kMono(audioPath);
  const transcriber = await getWhisper();
  const sampleRate = 16000;

  if (samples.length <= sampleRate * 29) {
    const result = await transcriber(samples, { return_timestamps: 'word' });
    return sanitizeTranscriptTimeline((result?.chunks || [])
      .map((c) => ({ text: String(c.text || '').trim(), start: c.timestamp?.[0], end: c.timestamp?.[1] }))
      .filter((w) => w.text && Number.isFinite(w.start))
      .map((w) => ({ ...w, end: Number.isFinite(w.end) ? w.end : w.start + 0.3 })));
  }

  // Multi-chunk transcription: cleanly slice long audio (e.g. 8-15 min) at sentence pauses
  // to prevent memory blowout, DTW cross-attention thrashing, or timestamp drift.
  const allWords = [];
  let currentOffset = 0;

  while (currentOffset < samples.length) {
    // Keep each manual window below Whisper's 30-second receptive field so
    // the model does not add its own overlapping stride on top of ours.
    const cutPoint = findSilenceCutPoint(samples, currentOffset, sampleRate, 26, 3);
    const chunkSamples = samples.subarray(currentOffset, cutPoint);
    const chunkOffsetSec = currentOffset / sampleRate;

    if (chunkSamples.length >= sampleRate * 0.25) {
      const result = await transcriber(chunkSamples, { return_timestamps: 'word' });

      const chunkWords = (result?.chunks || [])
        .map((c) => ({
          text: String(c.text || '').trim(),
          start: Number.isFinite(c.timestamp?.[0]) ? c.timestamp[0] + chunkOffsetSec : null,
          end: Number.isFinite(c.timestamp?.[1]) ? c.timestamp[1] + chunkOffsetSec : null,
        }))
        .filter((w) => w.text && Number.isFinite(w.start))
        .map((w) => ({ ...w, end: Number.isFinite(w.end) ? w.end : w.start + 0.3 }));

      allWords.push(...chunkWords);
    }

    if (cutPoint >= samples.length || cutPoint <= currentOffset) break;
    currentOffset = cutPoint;
  }

  return sanitizeTranscriptTimeline(allWords);
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
    transcript = sanitizeTranscriptTimeline(cached.data.transcript);
    words = alignScriptToTranscript(scriptWords, transcript, durationInSeconds);
    source = 'whisper-cache';
    console.log(`⚡ Reused cached Whisper word alignment (${transcript.length} words)`);
  } else {
    try {
      const policy = resolveWhisperPolicy(durationInSeconds);
      if (!policy.useWhisper) throw new Error(`Whisper skipped: ${policy.reason}`);
      transcript = sanitizeTranscriptTimeline(await transcribeWords(audioPath, { timeoutMs: policy.timeoutMs, signal }));
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
