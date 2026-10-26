import { getSharp } from './imageUtils.js';
import path from 'node:path';
import { env, AutoProcessor, CLIPVisionModelWithProjection, AutoTokenizer, CLIPTextModelWithProjection, RawImage } from '@huggingface/transformers';

/**
 * CLIP image↔text relevance.
 *
 * Measured on real candidates: CLIP reliably separates KINDS of scene
 * ("a modern trading floor" ranks a 2020s exchange above a 1900s one; a video
 * store scores ~0.30 vs ~0.21 for unrelated photos) but does NOT know
 * identities (it cannot tell the Lehman tower from the NYSE). So it is used to
 * rank mood/atmosphere candidates and to police extra images — never to
 * overrule a verified entity image.
 *
 * Disable with RELEVANCE=off.
 */

const MODEL = 'Xenova/clip-vit-base-patch32';
env.cacheDir = process.env.TRANSFORMERS_CACHE || path.resolve('.cache', 'huggingface');
let models = null;
const textCache = new Map();

async function load() {
  if (!models) {
    const [proc, vis, tok, txt] = await Promise.all([
      AutoProcessor.from_pretrained(MODEL), CLIPVisionModelWithProjection.from_pretrained(MODEL),
      AutoTokenizer.from_pretrained(MODEL), CLIPTextModelWithProjection.from_pretrained(MODEL),
    ]);
    models = { proc, vis, tok, txt };
  }
  return models;
}

const normalise = (d) => {
  let n = 0;
  for (const x of d) n += x * x;
  n = Math.sqrt(n) || 1;
  return Array.from(d, (x) => x / n);
};
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

export const relevanceEnabled = () => process.env.RELEVANCE !== 'off';

async function embedText(text) {
  if (!textCache.has(text)) {
    const { tok, txt } = await load();
    const { text_embeds } = await txt(tok([`a photo of ${text}`], { padding: true, truncation: true }));
    textCache.set(text, normalise(text_embeds.data));
  }
  return textCache.get(text);
}

export async function relevance(imageFile, text) {
  if (!relevanceEnabled() || !text) return null;
  try {
    const { proc, vis } = await load();
    const sharp = getSharp();
    let imgInput;
    if (sharp) {
      const png = await sharp(imageFile).resize(336, 336, { fit: 'inside' }).png().toBuffer();
      imgInput = await RawImage.fromBlob(new Blob([png]));
    } else {
      imgInput = await RawImage.read(imageFile);
    }
    const { image_embeds } = await vis(await proc(imgInput));
    return +dot(normalise(image_embeds.data), await embedText(text)).toFixed(4);
  } catch (e) {
    // A failed model call is unknown evidence, never a synthetic positive.
    return null;
  }
}

export async function contrastiveRelevance(imageFile, positiveDescriptions = [], negativeDescriptions = []) {
  const positives = [...new Set(positiveDescriptions.filter(Boolean))].slice(0, 8);
  const negatives = [...new Set(negativeDescriptions.filter(Boolean))].slice(0, 8);
  if (!relevanceEnabled() || !positives.length) {
    return { available: false, positiveScore: null, negativeScore: null, margin: null };
  }
  const positiveScores = await Promise.all(positives.map((description) => relevance(imageFile, description)));
  const negativeScores = await Promise.all(negatives.map((description) => relevance(imageFile, description)));
  const validPositive = positiveScores.filter(Number.isFinite);
  const validNegative = negativeScores.filter(Number.isFinite);
  if (!validPositive.length) {
    return { available: false, positiveScore: null, negativeScore: null, margin: null };
  }
  const positiveScore = Math.max(...validPositive);
  const negativeScore = validNegative.length ? Math.max(...validNegative) : 0;
  return {
    available: true,
    positiveScore: Number(positiveScore.toFixed(4)),
    negativeScore: Number(negativeScore.toFixed(4)),
    margin: Number((positiveScore - negativeScore).toFixed(4)),
    positiveDescriptions: positives,
    negativeDescriptions: negatives,
  };
}
