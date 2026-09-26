import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

/**
 * Generate speech audio file using local Kokoro TTS container.
 * 
 * @param {Object} options
 * @param {string} options.text - The text to speak
 * @param {string} options.outputFile - Target destination file path (.mp3)
 * @param {string} [options.voice] - Voice ID (e.g. af_bella, am_adam, af_sarah)
 * @param {number} [options.speed] - Speech speed (e.g. 0.9, 1.0)
 * @returns {Promise<{ filePath: string, success: boolean }>}
 */
export async function generateSpeech({
  text,
  outputFile,
  voice = config.kokoro.defaultVoice,
  speed = config.kokoro.speed,
}) {
  console.log(`🗣️  Generating Kokoro TTS audio (Voice: ${voice}, Speed: ${speed})...`);

  // Ensure target directory exists
  const dir = path.dirname(outputFile);
  await fs.mkdir(dir, { recursive: true });

  try {
    const wavFile = outputFile.replace(/\.mp3$/i, '.wav');

    // Fetch raw WAV from Kokoro for instant zero-loss Whisper alignment
    const response = await fetch(config.kokoro.url, {
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
    });

    if (!response.ok) {
      throw new Error(`Kokoro TTS failed with HTTP ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fs.writeFile(wavFile, buffer);
    // Also save MP3 destination (or write buffer)
    await fs.writeFile(outputFile, buffer);
    console.log(`🔊 Voiceover saved successfully (${(buffer.length / 1024).toFixed(1)} KB) -> ${outputFile}`);

    return { filePath: outputFile, wavPath: wavFile, success: true };
  } catch (error) {
    console.error('❌ Kokoro TTS error:', error.message);
    throw error;
  }
}
