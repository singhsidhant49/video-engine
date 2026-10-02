import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import wavefile from 'wavefile';
import { pipeline } from '@xenova/transformers';
import { ffmpeg, probeDuration } from './ffmpeg.js';
import { tokenizeScript, alignScriptToTranscript, estimateTiming } from './alignmentService.js';

// base.en is markedly more accurate than tiny.en on word boundaries and numbers.
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'Xenova/whisper-base.en';
let whisperPipeline = null;

async function getWhisper() {
  if (!whisperPipeline) {
    console.log(`🤖 Loading ${WHISPER_MODEL} for word timing...`);
    whisperPipeline = await pipeline('automatic-speech-recognition', WHISPER_MODEL);
  }
  return whisperPipeline;
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

/** Word-level transcript: [{ text, start, end }] in seconds. */
export async function transcribeWords(audioPath) {
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

import { alignmentCache } from '../core/cache/cacheManager.js';
import crypto from 'node:crypto';

/**
 * Time every word of the SCRIPT against the actual narration audio.
 * The script supplies the text (captions are always spelled as written);
 * the transcript supplies timing via sequence alignment.
 */
export async function analyzeNarration(audioPath, scriptText, fps) {
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
      transcript = await transcribeWords(audioPath);
      if (transcript.length < Math.max(3, scriptWords.length * 0.3)) throw new Error(`only ${transcript.length} transcript words`);
      words = alignScriptToTranscript(scriptWords, transcript, durationInSeconds);
      if (audioHash) {
        await alignmentCache.set({ audioHash, script: scriptText, model: WHISPER_MODEL }, { transcript });
      }
    } catch (err) {
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
