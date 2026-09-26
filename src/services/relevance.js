import sharp from 'sharp';
import { AutoProcessor, CLIPVisionModelWithProjection, AutoTokenizer, CLIPTextModelWithProjection, RawImage } from '@xenova/transformers';

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

/** Cosine similarity between an image file and a description (≈0.18 unrelated … ≈0.33 strong match). */
export async function relevance(imageFile, text) {
  if (!relevanceEnabled() || !text) return null;
  const { proc, vis } = await load();
  const png = await sharp(imageFile).resize(336, 336, { fit: 'inside' }).png().toBuffer();
  const { image_embeds } = await vis(await proc(await RawImage.fromBlob(new Blob([png]))));
  return +dot(normalise(image_embeds.data), await embedText(text)).toFixed(4);
}
