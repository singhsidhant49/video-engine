import { FORMAT_SAFE_AREA } from '../composition/layout/formatContext.js';

/**
 * Directing styles: the per-video visual language.
 *
 * A style owns every craft decision the LLM must not make — type, colour
 * derivation, image grade, camera vocabulary, transition palette, caption
 * treatment and pacing. The director picks ONE style per video; everything
 * inside a video then resolves against the same tokens, which is what keeps
 * consecutive shots feeling like the same film.
 *
 * Shared by the Node resolver and the Remotion bundle, so keep it plain JS.
 *
 * `accents` switches the cinematic effects ported from the MIT-licensed React
 * Video Editor templates (letterbox, film burn, focus pull, iris) per style.
 *
 * `variants` weights which composition variant the Visual Director picks per
 * family (so two videos with the same kinds still look different by style);
 * `assets` sets the asset policy: how strongly motion footage is preferred for
 * atmosphere (0–3), and whether generated / generic images may stand in for
 * mood shots. Generic images are NEVER acceptable for a named real subject.
 */

export const STYLES = {
  cinematic_documentary: {
    label: 'Cinematic documentary',
    fonts: { display: 'Fraunces', text: 'Inter', mono: 'JetBrains Mono' },
    display: { weight: 600, uppercase: false, tracking: -0.02, lineHeight: 1.02, italicEmphasis: true },
    label: { weight: 600, uppercase: true, tracking: 0.18 },
    palette: { bgLightness: 5, bgSaturation: 18, accentSaturation: 62, accentLightness: 62, text: '#f4efe6', muted: '#b9b1a4' },
    grade: { image: 'saturate(0.86) contrast(1.06) sepia(0.08)', vignette: 0.55, grain: 0.07, shade: 0.55 },
    motion: { camera: 0.08, moves: ['subtlePush', 'pan', 'subtlePull', 'static'], reveal: 'rise', energy: 0.8 },
    transitions: { section: 'dissolve', continuation: 'cut', accent: 'cut', perMinute: 2 },
    captions: { mode: 'phrase', case: 'sentence', weight: 600, scale: 0.78 },
    pacing: { maxHoldSec: 5.2, minShotSec: 1.8 },
    layout: { textAlign: 'left' },
    variants: { image: { full: 4, editorial: 3, split: 2, annotated: 1 }, stat: { hero: 2, split: 2 }, list: { ledger: 4, stack: 1 }, compare: { columns: 3, versus: 1 }, statement: { kinetic: 3, highlight: 2, words: 2 }, chapter: { classic: 3, split: 1 }, stackWeight: 2 },
    chart: { stroke: 4, area: 0.22, grid: 'baseline', marker: 'dot' },
    accents: { letterbox: true, burn: false, focusPull: true, iris: false },
    assets: { video: 3, generatedMood: true, genericMood: false },
  },
  investigative: {
    label: 'Investigative documentary',
    fonts: { display: 'Oswald', text: 'IBM Plex Sans', mono: 'IBM Plex Mono' },
    display: { weight: 600, uppercase: true, tracking: 0.0, lineHeight: 0.98, italicEmphasis: false },
    label: { weight: 600, uppercase: true, tracking: 0.22 },
    palette: { bgLightness: 4, bgSaturation: 12, accentSaturation: 78, accentLightness: 54, text: '#eef1f4', muted: '#9aa4ae' },
    grade: { image: 'saturate(0.62) contrast(1.14) brightness(0.94)', vignette: 0.65, grain: 0.08, shade: 0.6 },
    motion: { camera: 0.08, moves: ['subtlePush', 'static', 'pan', 'subtlePull'], reveal: 'mask', energy: 0.85 },
    transitions: { section: 'cut', continuation: 'cut', accent: 'cut', perMinute: 2 },
    captions: { mode: 'phrase', case: 'sentence', weight: 500, scale: 0.76 },
    pacing: { maxHoldSec: 4.6, minShotSec: 1.6 },
    layout: { textAlign: 'left' },
    variants: { image: { full: 4, editorial: 3, annotated: 2, split: 2 }, stat: { hero: 2, split: 2 }, list: { ledger: 3, stack: 2 }, compare: { columns: 3, versus: 1 }, statement: { kinetic: 3, highlight: 2, words: 2 }, chapter: { classic: 3, split: 1 }, stackWeight: 2 },
    chart: { stroke: 5, area: 0, grid: 'full', marker: 'square' },
    accents: { letterbox: true, burn: false, focusPull: true, iris: false },
    assets: { video: 2, generatedMood: true, genericMood: false },
  },
  editorial_explainer: {
    label: 'Editorial explainer',
    fonts: { display: 'Inter Tight', text: 'Inter', mono: 'JetBrains Mono' },
    display: { weight: 800, uppercase: false, tracking: -0.035, lineHeight: 0.98, italicEmphasis: false },
    label: { weight: 700, uppercase: true, tracking: 0.14 },
    palette: { bgLightness: 7, bgSaturation: 22, accentSaturation: 82, accentLightness: 60, text: '#f7f7f5', muted: '#a8adb5' },
    grade: { image: 'saturate(0.95) contrast(1.04)', vignette: 0.4, grain: 0.04, shade: 0.5 },
    motion: { camera: 0.08, moves: ['subtlePush', 'pan', 'static', 'subtlePull'], reveal: 'rise', energy: 0.9 },
    transitions: { section: 'cut', continuation: 'cut', accent: 'cut', perMinute: 2 },
    captions: { mode: 'phrase', case: 'sentence', weight: 600, scale: 0.8 },
    pacing: { maxHoldSec: 4.4, minShotSec: 1.6 },
    layout: { textAlign: 'left' },
    variants: { image: { full: 4, editorial: 3, split: 2, annotated: 1 }, stat: { hero: 2, split: 2 }, list: { ledger: 3, stack: 2 }, compare: { columns: 3, versus: 1 }, statement: { kinetic: 3, highlight: 3, words: 2 }, chapter: { classic: 3, split: 1 }, stackWeight: 1 },
    chart: { stroke: 5, area: 0.28, grid: 'thirds', marker: 'dot' },
    accents: { letterbox: false, burn: false, focusPull: true, iris: false },
    assets: { video: 2, generatedMood: true, genericMood: true },
  },
  data_driven: {
    label: 'Data-driven explainer',
    fonts: { display: 'Space Grotesk', text: 'Inter', mono: 'JetBrains Mono' },
    display: { weight: 700, uppercase: false, tracking: -0.03, lineHeight: 1.0, italicEmphasis: false },
    label: { weight: 600, uppercase: true, tracking: 0.16 },
    palette: { bgLightness: 6, bgSaturation: 20, accentSaturation: 80, accentLightness: 58, text: '#f3f5f8', muted: '#99a2b0' },
    grade: { image: 'saturate(0.8) contrast(1.05)', vignette: 0.45, grain: 0.035, shade: 0.55 },
    motion: { camera: 0.08, moves: ['subtlePush', 'static', 'pan'], reveal: 'mask', energy: 0.85 },
    transitions: { section: 'cut', continuation: 'cut', accent: 'cut', perMinute: 2 },
    captions: { mode: 'phrase', case: 'sentence', weight: 600, scale: 0.8 },
    pacing: { maxHoldSec: 4.6, minShotSec: 1.6 },
    layout: { textAlign: 'left' },
    variants: { image: { full: 4, editorial: 3, annotated: 2, split: 1 }, stat: { hero: 2, split: 2 }, list: { ledger: 3, stack: 2 }, compare: { columns: 3, versus: 1 }, statement: { kinetic: 3, highlight: 2, words: 2 }, chapter: { classic: 3 }, stackWeight: 0 },
    chart: { stroke: 5, area: 0.28, grid: 'full', marker: 'dot' },
    accents: { letterbox: false, burn: false, focusPull: false, iris: false },
    assets: { video: 1, generatedMood: true, genericMood: true },
  },
  tech_editorial: {
    label: 'Tech editorial',
    fonts: { display: 'Space Grotesk', text: 'Inter', mono: 'JetBrains Mono' },
    display: { weight: 700, uppercase: false, tracking: -0.035, lineHeight: 0.98, italicEmphasis: false },
    label: { weight: 500, uppercase: true, tracking: 0.2, mono: true },
    palette: { bgLightness: 5, bgSaturation: 28, accentSaturation: 90, accentLightness: 62, text: '#eef2f7', muted: '#8d97a8' },
    grade: { image: 'saturate(0.8) contrast(1.08) hue-rotate(-6deg)', vignette: 0.5, grain: 0.035, shade: 0.55 },
    motion: { camera: 0.08, moves: ['subtlePush', 'static', 'pan', 'subtlePull'], reveal: 'mask', energy: 0.9 },
    transitions: { section: 'cut', continuation: 'cut', accent: 'cut', perMinute: 2 },
    captions: { mode: 'phrase', case: 'sentence', weight: 600, scale: 0.8 },
    pacing: { maxHoldSec: 4.5, minShotSec: 1.6 },
    layout: { textAlign: 'left' },
    variants: { image: { full: 4, editorial: 3, split: 2, annotated: 1 }, stat: { hero: 2, split: 2 }, list: { ledger: 3, stack: 2 }, compare: { columns: 3, versus: 1 }, statement: { kinetic: 3, highlight: 2, words: 2 }, chapter: { split: 3, classic: 1 }, stackWeight: 0 },
    chart: { stroke: 5, area: 0.25, grid: 'full', marker: 'square' },
    accents: { letterbox: false, burn: false, focusPull: true, iris: false },
    assets: { video: 2, generatedMood: true, genericMood: true },
  },
  minimal_premium: {
    label: 'Minimal premium',
    fonts: { display: 'Instrument Serif', text: 'Manrope', mono: 'JetBrains Mono' },
    display: { weight: 400, uppercase: false, tracking: -0.015, lineHeight: 1.0, italicEmphasis: true },
    label: { weight: 600, uppercase: true, tracking: 0.24 },
    palette: { bgLightness: 6, bgSaturation: 8, accentSaturation: 45, accentLightness: 70, text: '#f2f0ec', muted: '#a9a6a0' },
    grade: { image: 'saturate(0.7) contrast(1.02) brightness(0.98)', vignette: 0.35, grain: 0.04, shade: 0.5 },
    motion: { camera: 0.06, moves: ['static', 'subtlePush', 'subtlePull'], reveal: 'fade', energy: 0.6 },
    transitions: { section: 'dissolve', continuation: 'cut', accent: 'cut', perMinute: 2 },
    captions: { mode: 'phrase', case: 'sentence', weight: 500, scale: 0.72 },
    pacing: { maxHoldSec: 5.5, minShotSec: 2.2 },
    layout: { textAlign: 'left' },
    variants: { image: { full: 4, editorial: 3, split: 1 }, stat: { hero: 3, split: 1 }, list: { ledger: 4 }, compare: { columns: 3 }, statement: { kinetic: 3, words: 2 }, chapter: { classic: 4 }, stackWeight: 1 },
    chart: { stroke: 2.5, area: 0, grid: 'none', marker: 'none' },
    accents: { letterbox: true, burn: false, focusPull: true, iris: false },
    assets: { video: 2, generatedMood: true, genericMood: false },
  },
  fast_educational: {
    label: 'Fast-paced educational',
    fonts: { display: 'Archivo', text: 'Inter', mono: 'JetBrains Mono' },
    display: { weight: 800, uppercase: true, tracking: -0.02, lineHeight: 0.94, italicEmphasis: false },
    label: { weight: 700, uppercase: true, tracking: 0.12 },
    palette: { bgLightness: 8, bgSaturation: 35, accentSaturation: 92, accentLightness: 58, text: '#ffffff', muted: '#b4bac4' },
    grade: { image: 'saturate(1.05) contrast(1.08)', vignette: 0.35, grain: 0.03, shade: 0.5 },
    motion: { camera: 0.09, moves: ['subtlePush', 'pan', 'static'], reveal: 'rise', energy: 1.0 },
    transitions: { section: 'cut', continuation: 'cut', accent: 'cut', perMinute: 3 },
    captions: { mode: 'phrase', case: 'sentence', weight: 700, scale: 0.85 },
    pacing: { maxHoldSec: 3.4, minShotSec: 1.2 },
    layout: { textAlign: 'left' },
    variants: { image: { full: 4, split: 3, editorial: 2, annotated: 1 }, stat: { hero: 3, split: 1 }, list: { ledger: 3, stack: 2 }, compare: { versus: 3, columns: 2 }, statement: { kinetic: 3, highlight: 2, words: 2 }, chapter: { split: 3 }, stackWeight: 1 },
    chart: { stroke: 6, area: 0.35, grid: 'none', marker: 'dot' },
    accents: { letterbox: false, burn: false, focusPull: false, iris: false },
    assets: { video: 3, generatedMood: true, genericMood: true },
  },
};

export const STYLE_IDS = Object.keys(STYLES);
export const DEFAULT_STYLE = 'editorial_explainer';

/** Every font family any style can use — loaded once by the Remotion bundle. */
export const ALL_FONT_FAMILIES = [...new Set(Object.values(STYLES).flatMap((s) => Object.values(s.fonts)))];

/** Type scale in px at a 1080px short edge; multiplied by `unit` at render time. */
export const TYPE_SCALE = {
  shorts: { hero: 250, display: 150, h1: 104, h2: 70, body: 46, label: 30, caption: 64, small: 26 },
  landscape: { hero: 300, display: 150, h1: 112, h2: 78, body: 46, label: 30, caption: 54, small: 26 },
};

/** Safe areas as fractions of the canvas. Shorts reserve platform UI at the bottom and right. */
export const SAFE_AREA = FORMAT_SAFE_AREA;

export function getStyle(id) {
  return STYLES[id] || STYLES[DEFAULT_STYLE];
}

// ─── Colour ────────────────────────────────────────────────────────────────

export function hexToHue(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

function hsl(h, s, l, a = 1) {
  return a === 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;
}

/**
 * Derive the whole palette from one hue so every colour in a video is related.
 * Text colours are fixed near-white/greys, which clear WCAG AA on every
 * background this can produce (bg lightness ≤ 10%).
 */
export function buildPalette(styleId, hue = 210) {
  const p = getStyle(styleId).palette;
  const h = ((Math.round(hue) % 360) + 360) % 360;
  return {
    hue: h,
    bg: hsl(h, p.bgSaturation, p.bgLightness),
    bgRaised: hsl(h, p.bgSaturation, p.bgLightness + 5),
    line: hsl(h, Math.min(30, p.bgSaturation + 6), 24),
    accent: hsl(h, p.accentSaturation, p.accentLightness),
    accentSoft: hsl(h, p.accentSaturation, p.accentLightness, 0.18),
    // Opposing hue for the "other side" of comparisons and negative values.
    counter: hsl((h + 180) % 360, Math.max(40, p.accentSaturation - 20), 64),
    negative: hsl(4, 78, 60),
    positive: hsl(152, 55, 52),
    text: p.text,
    muted: p.muted,
    shade: '0 0 0',
  };
}
