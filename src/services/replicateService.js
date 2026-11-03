import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { getImageStyle, buildFullIdeogramPrompt } from '../config/imageStyles.js';
import { downloadImageToFile } from './ideogramService.js';

/**
 * Maps video format to FLUX supported aspect_ratio string.
 */
export function resolveFluxAspectRatio(format = 'landscape') {
  return format === 'shorts' ? '9:16' : '16:9';
}

/**
 * Normalizes user-facing or CLI model aliases to canonical Replicate owner/model paths.
 */
export function normalizeFluxModel(model) {
  if (!model || typeof model !== 'string') {
    return (config.replicate?.model || 'black-forest-labs/flux-schnell').trim();
  }
  const trimmed = model.trim();
  if (trimmed.includes('/')) {
    return trimmed;
  }
  if (/dev/i.test(trimmed)) {
    return 'black-forest-labs/flux-dev';
  }
  // All other flux variants default to fast flux-schnell
  return 'black-forest-labs/flux-schnell';
}

/**
 * Generates an image using FLUX Schnell via Replicate API.
 * Includes local disk caching, fast fail-fast error checking, and retry handling.
 */
export async function generateFluxImage({
  prompt,
  styleId = 'anime',
  customStylePrompt = '',
  format = 'landscape',
  seed = null,
  cacheDir = null,
  retries = 2,
  timeoutMs = 90000,
  offline = false,
  model = null,
}) {
  if (offline) {
    throw new Error('Offline mode requested — skipping external Replicate network calls');
  }

  const apiToken = (config.replicate?.apiToken || '').trim();
  if (!apiToken) {
    throw new Error(
      'REPLICATE_API_TOKEN (or FluxSchellKey) is not configured in .env. A Replicate API token is required to use FLUX Schnell.'
    );
  }

  const selectedModel = normalizeFluxModel(model);
  const fullPrompt = buildFullIdeogramPrompt({ prompt, styleId, customStylePrompt });
  const aspectRatio = resolveFluxAspectRatio(format);

  // Check persistent disk cache
  const content = `${fullPrompt}::${styleId}::${aspectRatio}::${seed || ''}::${selectedModel}`;
  const promptHash = crypto.createHash('sha256').update(content).digest('hex');
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
        provider: 'replicate',
        model: selectedModel,
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
          provider: 'replicate',
          model: selectedModel,
        };
      }
    } catch {}
    // Cache miss, proceed to generate
  }

  const endpointUrl = `https://api.replicate.com/v1/models/${selectedModel}/predictions`;
  const requestBody = {
    input: {
      prompt: fullPrompt,
      aspect_ratio: aspectRatio,
      output_format: 'png',
      disable_safety_checker: true,
      ...(seed != null ? { seed: Number(seed) } : {}),
    },
  };

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait',
          },
          body: JSON.stringify(requestBody),
          signal: ctl.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 402 || /insufficient_funds|credit balance ran out|payment required/i.test(errorText)) {
          throw new Error('Replicate API credit balance ran out (HTTP 402): Add credits on replicate.com to resume generation.');
        }
        if (res.status === 401 || /unauthenticated|unauthorized|invalid token/i.test(errorText)) {
          throw new Error('Replicate API authentication failed (HTTP 401): Check REPLICATE_API_TOKEN in .env.');
        }
        throw new Error(`Replicate API error ${res.status}: ${errorText.slice(0, 300)}`);
      }

      let data = await res.json();

      // If status is not yet succeeded (polling fallback for asynchronous jobs)
      if (data.status === 'starting' || data.status === 'processing') {
        const pollUrl = data.urls?.get;
        if (!pollUrl) {
          throw new Error(`Replicate returned status ${data.status} without a polling URL.`);
        }

        const pollStart = Date.now();
        while (data.status === 'starting' || data.status === 'processing') {
          if (Date.now() - pollStart > timeoutMs) {
            throw new Error(`Replicate generation timed out after ${timeoutMs / 1000}s`);
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const pollRes = await fetch(pollUrl, {
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Accept': 'application/json',
            },
          });
          if (pollRes.ok) {
            data = await pollRes.json();
          }
        }
      }

      if (data.status === 'failed') {
        throw new Error(`Replicate generation failed: ${data.error || 'Unknown error'}`);
      }

      const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Replicate did not return a valid image URL in output');
      }

      // Download directly to persistent local cache
      const downloadRes = await downloadImageToFile(imageUrl, cachedFilePath);

      return {
        url: imageUrl,
        localPath: cachedFilePath,
        sha256: downloadRes.sha256,
        seed,
        prompt: fullPrompt,
        cached: false,
        provider: 'replicate',
        model: selectedModel,
      };
    } catch (err) {
      lastError = err;
      if (/credit balance ran out|HTTP 402|authentication failed|HTTP 401/i.test(err.message)) {
        throw err;
      }
      if (attempt < retries) {
        const delay = (attempt + 1) * 3000;
        console.warn(`   ⚠️ Replicate FLUX attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`FLUX generation failed after ${retries + 1} attempts: ${lastError?.message}`);
}

