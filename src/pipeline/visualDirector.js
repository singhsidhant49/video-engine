import { getStyle } from '../shared/styles.js';

/**
 * Visual Director — editorial intent → presentation decisions.
 *
 * Runs after narration timing (so it knows how long each scene really is) and
 * before asset search (so the Asset Director knows exactly what to look for).
 * Deterministic and seeded per video: the same plan always directs the same
 * way, different videos vary within their style.
 *
 * Per scene it decides:
 *   treatment  cinematic | graphic | typographic | quiet
 *   family     which composition family renders it
 *   variant    which layout inside that family (weighted by the style, with anti-repetition)
 *   camera     shot scale → base zoom, behaviour → preferred moves, energy → magnitude
 *   need       what imagery is required and which quality tiers are acceptable
 *
 * `recast()` then applies the fallback ladder once assets are known:
 *   VIDEO → IMAGE SEQUENCE → STILL → GRAPHIC → TYPOGRAPHY → GROUND
 */

// Set FOCUS_GROUNDING=1 only with a detector that reliably locates `focus` text in the image
// (the bundled OWL-ViT / CLIP-crop approaches were tested and are not reliable enough).
const GROUNDING = process.env.FOCUS_GROUNDING === '1';

const FAMILY_BY_KIND = {
  atmosphere: 'image', subject: 'image', statistic: 'stat', statement: 'statement', quote: 'quote',
  document: 'document', chapter: 'chapter', comparison: 'compare', list: 'list', process: 'process',
  timeline: 'timeline', chart: 'chart', ui: 'ui', code: 'code',
};
const BED_FAMILIES = new Set(['image', 'stat', 'statement', 'quote', 'chapter', 'ui', 'compare']);
const TEXTURE_FAMILIES = new Set(['list', 'process', 'timeline', 'chart', 'document']);

const TONE_ENERGY = { tense: 1.15, urgent: 1.25, somber: 0.8, reflective: 0.7, curious: 1.0, neutral: 1.0, hopeful: 0.95, triumphant: 1.15, playful: 1.2 };
const SHOT_SCALE = { wide: 1.0, medium: 1.05, close: 1.2, detail: 1.42 };
const CAMERA_MOVES = {
  still: { moves: ['drift'], factor: 0.25 },
  slow: { moves: ['drift', 'push'], factor: 0.55 },
  push: { moves: ['push'], factor: 1 },
  drift: { moves: ['drift'], factor: 1 },
  reveal: { moves: ['pull'], factor: 1 },
  track: { moves: ['pan', 'tilt'], factor: 1 },
};

function weightedPick(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[entries.length - 1][0];
}

function labelFor(scene) {
  return scene.entity?.name || scene.text?.kicker || scene.focus || null;
}

/**
 * @param {object} plan normalised plan
 * @param {{ format: string, rng: () => number, sceneSeconds: number[] }} ctx
 * @returns {object[]} one spec per scene
 */
export function directScenes(plan, { format, rng, sceneSeconds }) {
  const style = getStyle(plan.style);
  const specs = [];
  const imageHistory = []; // variants of recent photo-led clips

  plan.scenes.forEach((scene, i) => {
    const seconds = sceneSeconds[i] || 3;
    let family = FAMILY_BY_KIND[scene.kind] || 'image';
    let treatment = scene.treatment;
    let variant = 'default';
    const label = labelFor(scene);
    const hasText = Boolean(scene.text?.headline || scene.text?.kicker || scene.entity?.name);

    // Typographic treatment of a photo scene: the words become the image (over the photo if one is found).
    if (family === 'image' && treatment === 'typographic' && (scene.text?.headline || scene.emphasis)) family = 'statement';

    if (family === 'image') {
      const w = { ...(style.variants?.image || { full: 1 }) };
      // Photo stack (adapted from the RVE Photo Stack template): real prints dropping in — for sequences of artifacts.
      if (style.variants?.stackWeight && (scene.imageQueries.length > 1 || scene.entity)) w.stack = style.variants.stackWeight;
      // Annotation points at a specific thing; without a grounding model that can locate it, don't pretend.
      if (!label || !GROUNDING) delete w.annotated;
      if (!hasText) delete w.editorial;
      if (treatment === 'quiet') Object.keys(w).forEach((k) => { if (k !== 'full' && k !== 'depth') delete w[k]; });
      if (scene.importance >= 4 && w.full) w.full *= 2;             // key moments: let the photograph carry it
      if (scene.shot === 'detail' || scene.shot === 'close') { if (w.full) w.full *= 1.5; if (w.annotated) w.annotated *= 1.5; }
      if (scene.continuity === 'contrast' && w.split) w.split *= 3;
      // Anti-slideshow: never three plain full-frames in a row; don't repeat the last variant unless continuing.
      const last = imageHistory[imageHistory.length - 1];
      if (imageHistory.slice(-2).length === 2 && imageHistory.slice(-2).every((v) => v === 'full') && treatment !== 'quiet') delete w.full;
      if (last && scene.continuity !== 'continue') for (const k of Object.keys(w)) if (k === last && k !== 'full') w[k] *= 0.25;
      // Explicit editorial treatments are decisions, not weights.
      if (treatment === 'graphic' && label) variant = GROUNDING ? 'annotated' : 'editorial';
      else if (treatment === 'quiet') variant = w.depth && scene.shot === 'wide' ? 'depth' : 'full';
      else variant = scene.continuity === 'continue' && last && w[last] ? last : weightedPick(w, rng) || 'full';
      imageHistory.push(variant);
    } else if (family === 'stat') {
      variant = scene.template || weightedPick(style.variants?.stat || { hero: 1 }, rng) || 'hero';
      imageHistory.push(`stat-${variant}`);
    } else if (family === 'statement' || family === 'chapter') {
      variant = scene.template || weightedPick(style.variants?.[family] || { highlight: 1, bubblePop: 1, floatingChip: 1, typewriter: 1, words: 1 }, rng) || 'highlight';
      imageHistory.push(`${family}-${variant}`);
    } else if (family === 'list' || family === 'compare') {
      variant = scene.template || weightedPick(style.variants?.[family] || { default: 1 }, rng) || 'default';
      imageHistory.push(`${family}-${variant}`);
    } else {
      if (scene.template) variant = scene.template;
      imageHistory.push(family);
    }

    const toneEnergy = TONE_ENERGY[scene.tone] || 1;
    const intensityEnergy = scene.intensity >= 5 ? 1.25 : scene.intensity <= 1 ? 0.7 : 1;
    const behaviour = CAMERA_MOVES[scene.camera] || { moves: style.motion.moves, factor: 1 };
    const quietFactor = treatment === 'quiet' ? 0.5 : 1;
    const camera = {
      moves: behaviour.moves,
      magnitude: style.motion.camera * style.motion.energy * toneEnergy * intensityEnergy * behaviour.factor * quietFactor,
      baseScale: SHOT_SCALE[scene.shot] || 1,
    };

    // What imagery this scene needs, and which tiers are acceptable.
    let role = 'none';
    if (family === 'image' || (family === 'statement' && scene.kind !== 'statement')) role = scene.entity || scene.kind === 'subject' ? 'subject' : 'mood';
    else if (BED_FAMILIES.has(family)) role = 'mood';
    else if (TEXTURE_FAMILIES.has(family)) role = 'texture';
    const wantsImages = scene.imageQueries.length > 0 || scene.entity;
    const long = seconds > style.pacing.maxHoldSec * 1.8;
    const need = {
      role: wantsImages ? role : 'none',
      count: variant === 'split' ? 2 : variant === 'stack' ? 3 : long && treatment !== 'quiet' ? 3 : 2,
      // Motion footage suits atmosphere; a named subject needs the verified still of *that* subject.
      allowVideo: role === 'mood' && family === 'image' && (style.assets?.video || 0) > 0 && treatment !== 'graphic',
      preferVideo: role === 'mood' && family === 'image' && (style.assets?.video || 0) >= 2,
      allowGenerated: true,
      allowGeneric: true,
      minSeconds: seconds,
    };

    // Cinematic accents ported from the RVE templates, switched per style.
    const acc = style.accents || {};
    const accents = {
      focusPull: Boolean(acc.focusPull) && BED_FAMILIES.has(family) && (['hook', 'reveal'].includes(scene.purpose) || scene.importance >= 5),
      letterbox: Boolean(acc.letterbox) && (i === 0 || family === 'chapter'),
    };

    specs.push({
      sceneId: scene.id,
      family,
      variant,
      treatment,
      camera,
      label,
      need,
      accents,
      recasts: [],
    });
  });
  return specs;
}

/**
 * Fallback ladder once assets are resolved. Mutates and returns the spec.
 * @param {object} spec
 * @param {object} scene
 * @param {{primary: object|null, alternates: object[]}} assets
 * @param {string} format
 */
export function recast(spec, scene, assets, format) {
  const note = (why) => spec.recasts.push(why);
  const primary = assets?.primary;

  if (spec.family === 'image' && !primary) {
    // GRAPHIC/TYPOGRAPHY rung: say the thing in type rather than show the wrong picture.
    const text = scene.text?.headline || scene.entity?.name || scene.text?.kicker || scene.emphasis;
    if (text) { spec.family = 'statement'; spec.variant = 'title'; note(`no acceptable ${spec.need.role} image → typographic title "${text}"`); }
    else { spec.family = 'ground'; note('no acceptable image and no text → plain ground'); }
    return spec;
  }
  if (spec.family === 'image') {
    if (spec.variant === 'split' && (format === 'shorts' || !(assets.alternates?.length))) { spec.variant = 'full'; note('split in vertical shorts → full cinematic frame'); }
    if (spec.variant === 'annotated' && (!spec.label || primary.type === 'video' || !primary.focusBox)) { spec.variant = 'editorial'; note('annotation needs a grounded subject location → editorial'); }
    if (spec.variant === 'editorial' && primary.type === 'video') spec.variant = 'full';
    // A portrait photo in a 16:9 frame loses most of itself to a cover crop: present it with depth instead.
    const aspect = primary.width / primary.height;
    if (format === 'landscape' && aspect < 0.85 && spec.variant === 'full' && primary.type !== 'video') { spec.variant = 'depth'; note('portrait still in landscape → depth'); }
  }
  if (spec.family === 'image' && spec.variant === 'stack' && (assets.alternates?.length || 0) < 1) { spec.variant = 'full'; note('photo stack needs 2+ images → full'); }
  if (spec.family === 'image' && spec.variant === 'stack' && primary?.type === 'video') spec.variant = 'full';
  if (spec.family === 'stat' && spec.variant === 'split' && !primary) { spec.variant = 'hero'; note('stat split needs a photo → hero'); }
  return spec;
}
