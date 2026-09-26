import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

export const config = {
  rootDir: ROOT_DIR,
  publicDir: path.join(ROOT_DIR, 'public'),
  rendersDir: path.join(ROOT_DIR, 'renders'),
  tempDir: path.join(ROOT_DIR, 'temp'),

  get deepseek() {
    dotenv.config();
    return {
      apiKey: (process.env.DEEPSEEK_API_KEY || '').trim(),
      apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    };
  },

  get openai() {
    dotenv.config();
    return {
      apiKey: (process.env.OPENAI_API_KEY || '').trim(),
      model: 'gpt-4o-mini',
    };
  },

  kokoro: {
    url: process.env.KOKORO_TTS_URL || 'http://localhost:8880/v1/audio/speech',
    defaultVoice: process.env.KOKORO_VOICE || 'af_bella',
    speed: parseFloat(process.env.KOKORO_SPEED || '0.9'),
  },

  video: {
    fps: parseInt(process.env.OUTPUT_FPS || '30', 10),
    widthVertical: 1080,
    heightVertical: 1920,
    widthLandscape: 1920,
    heightLandscape: 1080,
  },

  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  }
};
