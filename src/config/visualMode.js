export const VISUAL_MODES = Object.freeze({
  MEDIA_EDITORIAL: 'MEDIA_EDITORIAL',
});

const falseLike = new Set(['0', 'false', 'off', 'no']);
const trueLike = new Set(['1', 'true', 'on', 'yes']);

function envBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (trueLike.has(normalized)) return true;
  if (falseLike.has(normalized)) return false;
  return fallback;
}

export function normalizeVisualMode(value = process.env.VISUAL_MODE) {
  const normalized = String(value || process.env.VISUAL_MODE || VISUAL_MODES.MEDIA_EDITORIAL).trim().toUpperCase();
  if (normalized && normalized !== VISUAL_MODES.MEDIA_EDITORIAL) {
    throw new Error(`Unsupported visual mode "${normalized}". Only MEDIA_EDITORIAL is available.`);
  }
  return VISUAL_MODES.MEDIA_EDITORIAL;
}

/** The only authority for production visual routing. JSX never reads feature flags. */
export function resolveVisualPolicy(overrides = {}) {
  normalizeVisualMode(overrides.visualMode || process.env.VISUAL_MODE);
  const allowSplitLayout = envBoolean(overrides.allowSplitLayout ?? process.env.ALLOW_SPLIT_LAYOUT, false);
  const motionPreset = String(overrides.motionPreset ?? process.env.VIDEO_MOTION_PRESET ?? 'standard').trim().toLowerCase() === 'minimal'
    ? 'minimal'
    : 'standard';
  return Object.freeze({
    visualMode: VISUAL_MODES.MEDIA_EDITORIAL,
    useMediaEditorial: true,
    preferAuthenticMedia: true,
    allowGeneratedMedia: false,
    allowSplitLayout,
    motionPreset,
    defaultTransition: 'CUT',
    defaultCamera: 'STATIC',
  });
}

export const DEFAULT_VISUAL_POLICY = resolveVisualPolicy();
