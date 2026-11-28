import { config } from '../config/index.js';
import { runBinary } from '../services/ffmpeg.js';

let cached = null;
const CACHE_MS = 30_000;

const safeOrigin = (value) => {
  try { return new URL(value).origin; } catch { return null; }
};

async function probeTts(url, fetchImpl) {
  const origin = safeOrigin(url);
  if (!origin) return { healthy: false, code: 'TTS_URL_INVALID', message: 'KOKORO_TTS_URL is invalid' };
  try {
    // A 404 still proves that the configured process is reachable. Kokoro
    // distributions do not all expose the same health path.
    const response = await fetchImpl(`${origin}/health`, { signal: AbortSignal.timeout(2_000) });
    return { healthy: true, endpoint: origin, status: response.status };
  } catch (error) {
    return { healthy: false, endpoint: origin, code: 'TTS_UNAVAILABLE', message: String(error.message || error).slice(0, 300) };
  }
}

async function probeMediaTools(probeTools) {
  try {
    await probeTools();
    return { healthy: true, provider: 'remotion-compositor' };
  } catch (error) {
    return { healthy: false, code: 'MEDIA_TOOLCHAIN_UNAVAILABLE', message: String(error.message || error).slice(0, 300) };
  }
}

export async function inspectProductionPreflight({
  configValue = config,
  env = process.env,
  fetchImpl = fetch,
  probeTools = async () => Promise.all([runBinary('ffmpeg', ['-version']), runBinary('ffprobe', ['-version'])]),
  useCache = true,
} = {}) {
  if (useCache && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const contentModel = {
    healthy: Boolean(configValue.deepseek?.apiKey || configValue.openai?.apiKey),
    provider: configValue.deepseek?.apiKey ? 'deepseek' : configValue.openai?.apiKey ? 'openai' : null,
    ...(!configValue.deepseek?.apiKey && !configValue.openai?.apiKey
      ? { code: 'CONTENT_MODEL_NOT_CONFIGURED', message: 'Configure DEEPSEEK_API_KEY or OPENAI_API_KEY' } : {}),
  };
  const [tts, mediaToolchain] = await Promise.all([
    probeTts(configValue.kokoro?.url, fetchImpl),
    probeMediaTools(probeTools),
  ]);
  const required = { contentModel, tts, mediaToolchain };
  const optional = {
    aiImages: {
      healthy: Boolean(configValue.ideogram?.apiKey || configValue.replicate?.apiToken),
      providers: [configValue.ideogram?.apiKey ? 'ideogram' : null, configValue.replicate?.apiToken ? 'replicate' : null].filter(Boolean),
      fallback: 'stock',
    },
    youtube: {
      healthy: Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REDIRECT_URI
        && String(env.YOUTUBE_OAUTH_STATE_SECRET || '').length >= 32 && String(env.YOUTUBE_TOKEN_ENCRYPTION_KEY || '').length >= 32),
      required: false,
      analyticsEnabled: configValue.server?.youtubeAnalyticsEnabled !== false,
      publishingEnabled: Boolean(configValue.server?.youtubePublishingEnabled),
    },
  };
  const value = { ready: Object.values(required).every((item) => item.healthy), checkedAt: new Date().toISOString(), required, optional };
  cached = { at: Date.now(), value };
  return value;
}

export function clearProductionPreflightCache() { cached = null; }
