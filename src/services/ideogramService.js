import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { getImageStyle, buildFullIdeogramPrompt } from '../config/imageStyles.js';

/**
 * Normalizes user/CLI model inputs to official Ideogram model names.
 */
export function normalizeIdeogramModel(rawModel = '') {
  const m = String(rawModel || '').trim().toLowerCase();
  if (!m || m === 'p-image' || m === 'p-image-medium' || m === 'p-image-ideogram' || m === 'pimage') {
    return 'p-image-ideogram';
  }
  if (m === 'ideogram-4-5' || m === 'ideogram-4.5' || m === '4.5' || m === '4-5' || m === 'ideogram4.5') {
    return 'ideogram-4-5';
  }
  if (m === 'ideogram-4' || m === 'ideogram-4.0' || m === '4.0' || m === '4' || m === 'ideogram4') {
    return 'ideogram-4';
  }
  if (m === 'ideogram-3' || m === 'ideogram-3.0' || m === '3.0' || m === '3') {
    return 'ideogram-3';
  }
  if (m === 'ideogram-2' || m === 'ideogram-2.0') {
    return 'ideogram-2';
  }
  if (m === 'v_2_turbo' || m === 'v2_turbo' || m === 'turbo' || m === 'v2-turbo') {
    return 'V_2_TURBO';
  }
  if (m === 'v_2' || m === 'v2') {
    return 'V_2';
  }
  return rawModel;
}

/**
 * Maps video format to Ideogram aspect_ratio string.
 * Supports both modern 16x9 / 9x16 syntax (v2 / p-image / 4.5 / 4.0) and legacy ASPECT_16_9 / ASPECT_9_16 syntax.
 */
export function resolveIdeogramAspectRatio(format = 'landscape', model = '') {
  const m = (model || '').toLowerCase();
  if (m.includes('p-image') || m.includes('4-5') || m.includes('4.5') || m.includes('ideogram-4') || m.includes('ideogram-3') || m.includes('ideogram-2')) {
    return format === 'shorts' ? '9x16' : '16x9';
  }
  return format === 'shorts' ? 'ASPECT_9_16' : 'ASPECT_16_9';
}

/**
 * Computes a SHA256 hash for cache keying and verification.
 */
export function computePromptHash(prompt, styleId, aspectRatio, seed = null) {
  const content = `${prompt}::${styleId}::${aspectRatio}::${seed || ''}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Downloads an image from a URL to a local destination file.
 */
export async function downloadImageToFile(url, destFilePath) {
  await fs.mkdir(path.dirname(destFilePath), { recursive: true });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(destFilePath, buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return { destFilePath, sha256, bytes: buffer.length };
}

/**
 * Generates a single image via the Ideogram API.
 * Includes local disk caching and exponential retry on rate limits.
 */
export async function generateIdeogramImage({
  prompt,
  styleId = 'anime',
  customStylePrompt = '',
  format = 'landscape',
  seed = null,
  cacheDir = null,
  retries = 2,
  timeoutMs = 120000,
  offline = false,
  model = null,
  quality = null,
  resolution = null,
}) {
  if (offline) {
    throw new Error('Offline mode requested — skipping external Ideogram network calls');
  }

  const apiKey = (config.ideogram?.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('IDEOGRAM_API_KEY is not configured in .env. An Ideogram API key is required to use AI image generation.');
  }

  const selectedModel = normalizeIdeogramModel(model || config.ideogram?.model || 'p-image-ideogram');
  const isV2Endpoint = ['p-image-ideogram', 'ideogram-4-5', 'ideogram-4', 'ideogram-3', 'ideogram-2'].includes(selectedModel);

  const styleConfig = getImageStyle(styleId);
  const fullPrompt = buildFullIdeogramPrompt({ prompt, styleId, customStylePrompt });
  const aspectRatio = resolveIdeogramAspectRatio(format, selectedModel);

  // Check persistent disk cache if cacheDir is provided
  const promptHash = computePromptHash(fullPrompt, styleId, aspectRatio, seed);
  const effectiveCacheDir = cacheDir || (config.mediaBankDir ? path.join(config.mediaBankDir, 'ai') : path.join(config.publicDir, 'media-bank', 'ai'));
  const cachedFilePath = path.join(effectiveCacheDir, `${promptHash}.png`);

  try {
    const stat = await fs.stat(cachedFilePath);
    if (stat.isFile() && stat.size > 1000) {
      const buffer = await fs.readFile(cachedFilePath);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      return {
        url: null,
        localPath: cachedFilePath,
        sha256,
        seed,
        prompt: fullPrompt,
        cached: true,
      };
    }
  } catch {
    // Check legacy cache directory in public/media-bank/ai
    const legacyCachedPath = path.join(config.publicDir, 'media-bank', 'ai', `${promptHash}.png`);
    try {
      const legacyStat = await fs.stat(legacyCachedPath);
      if (legacyStat.isFile() && legacyStat.size > 1000) {
        try {
          await fs.mkdir(effectiveCacheDir, { recursive: true });
          await fs.copyFile(legacyCachedPath, cachedFilePath);
        } catch {}
        const finalPath = await fs.stat(cachedFilePath).then(() => cachedFilePath).catch(() => legacyCachedPath);
        const buffer = await fs.readFile(finalPath);
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        return {
          url: null,
          localPath: finalPath,
          sha256,
          seed,
          prompt: fullPrompt,
          cached: true,
        };
      }
    } catch {}
    // Cache miss, proceed to generate
  }

  let apiUrl;
  let requestBody;

  if (isV2Endpoint) {
    apiUrl = (config.ideogram?.apiUrl && !config.ideogram.apiUrl.endsWith('/generate'))
      ? config.ideogram.apiUrl
      : `https://api.ideogram.ai/v2/image/generate/${selectedModel}`;

    let effectiveQuality = (quality || config.ideogram?.quality || 'medium').toLowerCase();
    requestBody = {
      prompt: fullPrompt,
      aspect_ratio: aspectRatio,
      ...(seed != null ? { seed: Number(seed) } : {}),
    };

    if (selectedModel === 'ideogram-4-5') {
      if (effectiveQuality === 'very_low') effectiveQuality = 'low';
      requestBody.quality = effectiveQuality;
      requestBody.resolution = resolution || config.ideogram?.resolution || '1k';
    } else if (selectedModel === 'p-image-ideogram') {
      requestBody.quality = effectiveQuality;
      requestBody.resolution = resolution || config.ideogram?.resolution || '1k';
    } else if (selectedModel === 'ideogram-4') {
      // ideogram-4 uses aspect_ratio directly; do not pass '1k'
      if (quality) requestBody.quality = effectiveQuality;
    } else {
      requestBody.quality = effectiveQuality;
    }

    if (config.ideogram?.magicPrompt) {
      requestBody.prompt_upsampling = config.ideogram.magicPrompt;
    }
  } else {
    const validStyleTypes = new Set(['AUTO', 'GENERAL', 'REALISTIC', 'DESIGN']);
    const requestedStyle = String(styleConfig.ideogramStyleType || 'AUTO').toUpperCase();
    const safeStyleType = validStyleTypes.has(requestedStyle) ? requestedStyle : 'AUTO';

    apiUrl = config.ideogram?.apiUrl || 'https://api.ideogram.ai/generate';
    requestBody = {
      image_request: {
        prompt: fullPrompt,
        aspect_ratio: aspectRatio,
        model: selectedModel,
        magic_prompt_option: config.ideogram?.magicPrompt || 'AUTO',
        style_type: safeStyleType,
        negative_prompt: styleConfig.negativePrompt || undefined,
        ...(seed != null ? { seed: Number(seed) } : {}),
      },
    };
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Api-Key': apiKey,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: ctl.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 402 || /insufficient_funds|credit balance ran out/i.test(errorText)) {
          throw new Error(`Ideogram API credit balance ran out (HTTP 402): Add credits at https://ideogram.ai/manage-api to resume generation.`);
        }
        if (res.status === 401 || /invalid_api_key|unauthorized/i.test(errorText)) {
          throw new Error(`Ideogram API authentication failed (HTTP 401): Check your IDEOGRAM_API_KEY in .env.`);
        }
        if (res.status === 400 && /style type/i.test(errorText) && requestBody.image_request) {
          requestBody.image_request.style_type = 'AUTO';
        }
        throw new Error(`Ideogram API error ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const data = await res.json();
      const firstResult = data.data?.[0];
      if (!firstResult || !firstResult.url) {
        throw new Error('Ideogram API returned an empty image result');
      }

      // Download directly to local cache
      let sha256;
      try {
        const downloadRes = await downloadImageToFile(firstResult.url, cachedFilePath);
        sha256 = downloadRes.sha256;
      } catch (dlErr) {
        throw new Error(`Failed to download image from Ideogram CDN (${firstResult.url}): ${dlErr.message}`);
      }

      return {
        url: firstResult.url,
        localPath: cachedFilePath,
        sha256,
        seed: firstResult.seed ?? seed,
        prompt: firstResult.prompt || fullPrompt,
        cached: false,
      };
    } catch (err) {
      lastError = err;
      if (/credit balance ran out|insufficient_funds|HTTP 402|authentication failed|HTTP 401/i.test(err.message)) {
        throw err;
      }
      const cause = err.cause
        ? ` (${err.cause.code || err.cause.message || (typeof err.cause === 'object' ? JSON.stringify(err.cause) : err.cause)})`
        : '';
      if (attempt < retries) {
        const delay = (attempt + 1) * 3000;
        console.warn(`   ⚠️ Ideogram attempt ${attempt + 1} failed: ${err.message}${cause}. Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Ideogram generation failed after ${retries + 1} attempts: ${lastError?.message}`);
}

/**
 * Concurrency-bounded map helper.
 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Batch generates AI images for all scenes in a video.
 * Enforces a cohesive seed strategy across scenes to ensure stylistic continuity.
 */
export async function batchGenerateIdeogramImages({
  scenes = [],
  format = 'landscape',
  styleId = 'anime',
  customStylePrompt = '',
  cacheDir = null,
  baseSeed = null,
  concurrency = 2,
  onProgress = null,
}) {
  // If baseSeed is not provided, generate a deterministic master seed
  const masterSeed = baseSeed != null
    ? Number(baseSeed)
    : Math.floor(Math.random() * 900000000) + 100000000;

  console.log(`🎨 Ideogram Director: Generating images for ${scenes.length} scenes in "${styleId}" style (master seed: ${masterSeed})...`);

  let completedCount = 0;
  const results = await mapLimit(scenes, concurrency, async (scene, index) => {
    // Each scene gets a contiguous seed variation (maintaining the master seed neighborhood)
    const sceneSeed = (masterSeed + index * 7) % 1000000000;
    const prompt = scene.imagePrompt || scene.visual || scene.concept || scene.narration;

    try {
      const gen = await generateIdeogramImage({
        prompt,
        styleId,
        customStylePrompt,
        format,
        seed: sceneSeed,
        cacheDir,
      });

      completedCount++;
      if (typeof onProgress === 'function') {
        onProgress({ completed: completedCount, total: scenes.length, sceneId: scene.id });
      }

      console.log(`   ✓ [Scene ${scene.id}] generated (${gen.cached ? 'cached' : 'fresh'}): "${prompt.slice(0, 60)}..."`);
      return {
        sceneId: scene.id,
        success: true,
        ...gen,
      };
    } catch (err) {
      console.error(`   ✗ [Scene ${scene.id}] generation failed: ${err.message}`);
      return {
        sceneId: scene.id,
        success: false,
        error: err.message,
      };
    }
  });

  return {
    masterSeed,
    styleId,
    results,
  };
}

