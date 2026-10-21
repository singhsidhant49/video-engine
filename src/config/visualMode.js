export const VISUAL_MODES = Object.freeze({
  MEDIA_EDITORIAL: 'MEDIA_EDITORIAL',
  LEGACY_PROCEDURAL: 'LEGACY_PROCEDURAL',
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
  const normalized = String(value || VISUAL_MODES.MEDIA_EDITORIAL).trim().toUpperCase();
  if (normalized === VISUAL_MODES.LEGACY_PROCEDURAL) return VISUAL_MODES.LEGACY_PROCEDURAL;
  return VISUAL_MODES.MEDIA_EDITORIAL;
}

/** The only authority for production visual routing. JSX never reads feature flags. */
export function resolveVisualPolicy(overrides = {}) {
  const requestedMode = overrides.visualMode || process.env.VISUAL_MODE;
  const mode = normalizeVisualMode(requestedMode);
  const mediaEditorial = mode === VISUAL_MODES.MEDIA_EDITORIAL
    && envBoolean(overrides.useMediaEditorial ?? process.env.USE_MEDIA_EDITORIAL, true);
  const proceduralEnabled = mode === VISUAL_MODES.LEGACY_PROCEDURAL
    && envBoolean(overrides.enableProceduralGraphics ?? process.env.ENABLE_PROCEDURAL_GRAPHICS, true)
    && envBoolean(overrides.enableLegacyVisualFamilies ?? process.env.ENABLE_LEGACY_VISUAL_FAMILIES, true);
  const allowSplitLayout = envBoolean(overrides.allowSplitLayout ?? process.env.ALLOW_SPLIT_LAYOUT, false);
  return Object.freeze({
    visualMode: mediaEditorial ? VISUAL_MODES.MEDIA_EDITORIAL : VISUAL_MODES.LEGACY_PROCEDURAL,
    useMediaEditorial: mediaEditorial,
    enableProceduralGraphics: proceduralEnabled,
    enableLegacyVisualFamilies: proceduralEnabled,
    allowGeneratedMedia: false,
    allowSplitLayout,
    defaultTransition: 'CUT',
    defaultCamera: 'STATIC',
  });
}

export const DEFAULT_VISUAL_POLICY = resolveVisualPolicy();
