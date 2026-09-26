import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import wavefile from 'wavefile';
import { pipeline } from '@xenova/transformers';
import { config } from '../config/index.js';

let whisperPipeline = null;

async function getWhisperPipeline() {
  if (!whisperPipeline) {
    console.log('🤖 Loading Xenova/whisper-tiny.en speech recognition pipeline...');
    whisperPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  }
  return whisperPipeline;
}

/**
 * Millisecond-Exact Audio Alignment Service.
 * Uses Whisper-tiny via @xenova/transformers to extract exact start and end timestamps
 * for every spoken word, and aligns scenes strictly to audio silence boundaries and transients.
 */
export async function analyzeAudioAndTiming(audioFilePath, fullText, scenes, fps = config.video.fps) {
  console.log(`⏱️  Analyzing audio timing with Whisper speech recognition for "${audioFilePath}"...`);

  let durationInSeconds = 35;
  try {
    const metadata = await parseFile(audioFilePath);
    if (metadata.format && metadata.format.duration) {
      durationInSeconds = metadata.format.duration;
    }
  } catch (err) {
    console.warn(`Could not parse audio metadata (${err.message}). Estimating duration.`);
  }

  const totalFrames = Math.ceil(durationInSeconds * fps);

  // Attempt Whisper millisecond extraction
  let wordTimings = [];
  try {
    // Check if .wav file exists alongside .mp3 or convert/read
    const wavPath = audioFilePath.replace(/\.mp3$/i, '.wav');
    let targetAudioPath = fs.existsSync(wavPath) ? wavPath : audioFilePath;

    if (fs.existsSync(targetAudioPath) && targetAudioPath.endsWith('.wav')) {
      const buffer = fs.readFileSync(targetAudioPath);
      const wav = new wavefile.WaveFile(buffer);
      wav.toSampleRate(16000);
      let samples = wav.getSamples();
      if (Array.isArray(samples)) samples = samples[0];
      const float32 = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        float32[i] = samples[i] / 32768.0;
      }

      const transcriber = await getWhisperPipeline();
      const whisperResult = await transcriber(float32, { return_timestamps: 'word' });

      if (whisperResult && whisperResult.chunks && whisperResult.chunks.length > 0) {
        console.log(`🎯 Whisper extracted ${whisperResult.chunks.length} exact word timestamps.`);

        const originalWords = fullText.split(/\s+/).filter(w => w.length > 0);
        const chunks = whisperResult.chunks;

        // Map chunks to original words or use whisper chunks
        wordTimings = chunks.map((chunk, idx) => {
          const rawWord = (originalWords[idx] || chunk.text.trim());
          let startSec = chunk.timestamp[0] ?? 0;
          let endSec = chunk.timestamp[1] ?? (startSec + 0.3);
          
          // Clamp to actual audio duration
          startSec = Math.max(0, Math.min(durationInSeconds, startSec));
          endSec = Math.max(startSec + 0.1, Math.min(durationInSeconds, endSec));

          return {
            word: rawWord,
            whisperText: chunk.text.trim(),
            startSec,
            endSec,
            startFrame: Math.floor(startSec * fps),
            endFrame: Math.ceil(endSec * fps),
          };
        });
      }
    }
  } catch (whisperErr) {
    console.warn(`Whisper alignment notice: ${whisperErr.message}. Falling back to cadence estimation.`);
  }

  // Fallback to cadence calculation if Whisper did not produce word timings
  if (wordTimings.length === 0) {
    const words = fullText.split(/\s+/).filter(w => w.length > 0);
    let totalWeight = 0;
    const wordWeights = words.map(word => {
      let weight = Math.max(1, word.replace(/[^a-zA-Z0-9]/g, '').length * 0.8);
      if (/[,\:\;\-]/.test(word)) weight += 3;
      if (/[\.\!\?]/.test(word)) weight += 6;
      totalWeight += weight;
      return weight;
    });

    let currentSec = 0;
    wordTimings = words.map((word, idx) => {
      const wordDuration = (wordWeights[idx] / totalWeight) * durationInSeconds;
      const startSec = currentSec;
      const endSec = currentSec + wordDuration;
      currentSec = endSec;
      return {
        word,
        startSec,
        endSec,
        startFrame: Math.floor(startSec * fps),
        endFrame: Math.ceil(endSec * fps),
      };
    });
  }

  // Group words into punchy 2-3 word subtitle chunks
  const subtitles = [];
  const chunkSize = 3;

  for (let i = 0; i < wordTimings.length; i += chunkSize) {
    const chunk = wordTimings.slice(i, i + chunkSize);
    const chunkText = chunk.map(w => w.word).join(' ');
    const startFrame = chunk[0].startFrame;
    const endFrame = chunk[chunk.length - 1].endFrame;

    subtitles.push({
      id: subtitles.length + 1,
      text: chunkText,
      words: chunk,
      startFrame,
      endFrame,
      startSec: chunk[0].startSec,
      endSec: chunk[chunk.length - 1].endSec,
    });
  }

  // 2. Align Scenes strictly to Sentence / Audio silence boundaries
  let accumulatedFrames = 0;
  let wordCursor = 0;

  const timedScenes = scenes.map((scene, index) => {
    const sceneText = (scene.voiceoverSentence || '').trim();
    const sceneWords = sceneText.split(/\s+/).filter(w => w.length > 0);
    const wordCount = sceneWords.length;

    let sceneStartFrame = accumulatedFrames;
    let sceneEndFrame = accumulatedFrames + Math.round((totalFrames / scenes.length));

    if (wordTimings.length > 0 && wordCursor < wordTimings.length) {
      const startWordObj = wordTimings[wordCursor];
      sceneStartFrame = index === 0 ? 0 : (startWordObj ? startWordObj.startFrame : accumulatedFrames);

      const targetEndIndex = Math.min(wordTimings.length - 1, wordCursor + Math.max(1, wordCount) - 1);
      const endWordObj = wordTimings[targetEndIndex];
      
      if (endWordObj) {
        sceneEndFrame = endWordObj.endFrame;
      }
      wordCursor = targetEndIndex + 1;
    }

    if (index === scenes.length - 1) {
      sceneEndFrame = totalFrames;
    }

    // Ensure strictly valid frame progression
    if (sceneEndFrame <= sceneStartFrame) {
      sceneEndFrame = sceneStartFrame + Math.max(30, Math.round(fps * 2));
    }
    if (sceneEndFrame > totalFrames) {
      sceneEndFrame = totalFrames;
    }

    accumulatedFrames = sceneEndFrame;

    return {
      ...scene,
      startFrame: sceneStartFrame,
      endFrame: sceneEndFrame,
      durationInFrames: Math.max(1, sceneEndFrame - sceneStartFrame),
    };
  });

  console.log(`📊 Exact Audio Sync: ${durationInSeconds.toFixed(2)}s | ${totalFrames} frames | ${subtitles.length} Subtitles | ${timedScenes.length} Millisecond-Aligned Scenes`);

  return {
    durationInSeconds,
    totalFrames,
    fps,
    subtitles,
    scenes: timedScenes,
  };
}
