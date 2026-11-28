import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { generateIdeogramImage } from './ideogramService.js';
import { generateFluxImage } from './replicateService.js';

export function isIdeogramFallbackEligibleError(error) {
  const message = String(error?.message || error || '');
  return /credit balance ran out|insufficient[_ ]funds|payment required|HTTP 402|\(402\)|IDEOGRAM_API_KEY is not configured|authentication failed|HTTP 401|HTTP 429|rate limit|timeout|timed out|Ideogram API error/i.test(message);
}

/**
 * Crafts a high-CTR YouTube thumbnail composition prompt tailored to the
 * concept's visual layout (leaving clean negative space when overlay text is used).
 */
export function buildThumbnailHeroPrompt({
  concept = {},
  title = '',
  topic = '',
  niche = '',
} = {}) {
  const subject = String(concept.strategicBrief || concept.mainSubject || title || topic).trim();
  const hook = String(concept.overlayText || '').trim();
  const textSide = concept.layout === 'text_right_subject_left' ? 'right' : 'left';
  const subjectSide = textSide === 'left' ? 'right' : 'left';
  const noText = concept.textMode === 'none';

  const framing = noText
    ? 'Full-bleed eye-catching centered YouTube thumbnail composition with one dominant focal subject'
    : `YouTube thumbnail composition: place the dominant focal subject sharply on the ${subjectSide} half of the frame and keep clean, dark, low-detail atmospheric negative space on the ${textSide} half so bold headline typography can sit cleanly over it`;

  return [
    `High-CTR clickable YouTube thumbnail hero visual for ${niche ? `a ${niche} channel video` : 'a video'} titled "${title || topic}"`,
    `Core visual hook${hook ? ` ("${hook}")` : ''}: ${subject}`,
    framing,
    'Dramatic directional rim lighting, rich contrast, expressive focal subject clarity even at tiny mobile feed sizes, crisp depth separation',
    'Pure visual scene only — do NOT render any text, letters, words, logos, watermarks, or split collages inside the image itself',
  ].filter(Boolean).join('. ');
}

/**
 * Generates an AI hero background image for the YouTube thumbnail using the
 * configured provider/model (default: Ideogram) and automatically falls back
 * to FLUX (Replicate) if Ideogram fails or runs out of credits.
 */
export async function generateThumbnailHeroImage({
  concept = {},
  index = 0,
  title = '',
  topic = '',
  niche = '',
  styleId = 'cinematic_documentary',
  customStylePrompt = '',
  runDir,
  seed = null,
  thumbnailSettings = null,
  generateIdeogram = generateIdeogramImage,
  generateFlux = generateFluxImage,
} = {}) {
  const settings = thumbnailSettings || {};
  if (settings.enabled === false) return null;

  const primaryProvider = settings.provider || 'ideogram';
  const primaryModel = settings.model || (primaryProvider === 'replicate' ? 'black-forest-labs/flux-schnell' : 'p-image-ideogram');
  const fallbackToFlux = settings.fallbackToFlux !== false;
  const fallbackModel = settings.fallbackModel || 'black-forest-labs/flux-schnell';
  const quality = settings.quality || 'medium';
  const cacheDir = config.mediaBankDir ? path.join(config.mediaBankDir, 'ai') : path.join(config.publicDir, 'media-bank', 'ai');
  const prompt = buildThumbnailHeroPrompt({ concept, title, topic, niche });

  let generated = null;
  let usedProvider = primaryProvider;
  let usedModel = primaryModel;
  let fallbackUsed = false;

  const runIdeogram = () => generateIdeogram({
    prompt,
    styleId,
    customStylePrompt,
    format: 'landscape',
    seed,
    cacheDir,
    model: primaryProvider === 'ideogram' ? primaryModel : 'p-image-ideogram',
    quality,
  });

  const runFlux = (modelName) => generateFlux({
    prompt,
    styleId,
    customStylePrompt,
    format: 'landscape',
    seed,
    cacheDir,
    model: modelName,
    quality,
  });

  if (primaryProvider === 'replicate') {
    generated = await runFlux(primaryModel);
  } else {
    try {
      generated = await runIdeogram();
    } catch (error) {
      const hasFluxKey = Boolean((config.replicate?.apiToken || '').trim());
      if (!fallbackToFlux || !isIdeogramFallbackEligibleError(error) || (generateFlux === generateFluxImage && !hasFluxKey)) {
        throw error;
      }
      console.warn(`   ⚠️ Ideogram thumbnail generation unavailable (${error.message}); falling back to FLUX (${fallbackModel})`);
      generated = await runFlux(fallbackModel);
      usedProvider = 'replicate';
      usedModel = generated?.model || fallbackModel;
      fallbackUsed = true;
    }
  }

  if (!generated?.localPath) return null;
  const targetPath = path.join(runDir, `thumbnail-ai-hero-${index + 1}.png`);
  await fs.copyFile(generated.localPath, targetPath);
  const dataUrl = `data:image/png;base64,${(await fs.readFile(targetPath)).toString('base64')}`;
  return {
    path: targetPath,
    dataUrl,
    provider: usedProvider,
    model: usedModel,
    fallbackUsed,
  };
}
