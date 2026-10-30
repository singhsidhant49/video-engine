export const VISUAL_MODES = Object.freeze({
  HYBRID_EDITORIAL: 'HYBRID_EDITORIAL',
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
  const normalized = String(value || VISUAL_MODES.HYBRID_EDITORIAL).trim().toUpperCase();
  if (normalized === VISUAL_MODES.HYBRID_EDITORIAL) return VISUAL_MODES.HYBRID_EDITORIAL;
  if (normalized === VISUAL_MODES.LEGACY_PROCEDURAL) return VISUAL_MODES.LEGACY_PROCEDURAL;
  return VISUAL_MODES.MEDIA_EDITORIAL;
}

/** The only authority for production visual routing. JSX never reads feature flags. */
export function resolveVisualPolicy(overrides = {}) {
  const requestedMode = overrides.visualMode || process.env.VISUAL_MODE;
  const mode = normalizeVisualMode(requestedMode);
  const hybridEditorial = mode === VISUAL_MODES.HYBRID_EDITORIAL;
  const mediaEditorial = (mode === VISUAL_MODES.MEDIA_EDITORIAL || hybridEditorial)
    && envBoolean(overrides.useMediaEditorial ?? process.env.USE_MEDIA_EDITORIAL, true);
  const proceduralEnabled = (mode === VISUAL_MODES.LEGACY_PROCEDURAL || hybridEditorial)
    && envBoolean(overrides.enableProceduralGraphics ?? process.env.ENABLE_PROCEDURAL_GRAPHICS, true)
    && envBoolean(overrides.enableLegacyVisualFamilies ?? process.env.ENABLE_LEGACY_VISUAL_FAMILIES, true);
  const allowSplitLayout = envBoolean(overrides.allowSplitLayout ?? process.env.ALLOW_SPLIT_LAYOUT, false);
  const motionPreset = String(overrides.motionPreset ?? process.env.VIDEO_MOTION_PRESET ?? 'standard').trim().toLowerCase() === 'minimal'
    ? 'minimal'
    : 'standard';
  return Object.freeze({
    visualMode: hybridEditorial
      ? VISUAL_MODES.HYBRID_EDITORIAL
      : mediaEditorial ? VISUAL_MODES.MEDIA_EDITORIAL : VISUAL_MODES.LEGACY_PROCEDURAL,
    useMediaEditorial: mediaEditorial,
    enableProceduralGraphics: proceduralEnabled,
    enableLegacyVisualFamilies: proceduralEnabled,
    allowHybridRepresentations: hybridEditorial,
    preferAuthenticMedia: mode !== VISUAL_MODES.LEGACY_PROCEDURAL,
    allowGeneratedMedia: false,
    allowSplitLayout,
    motionPreset,
    defaultTransition: 'CUT',
    defaultCamera: 'STATIC',
  });
}

export const DEFAULT_VISUAL_POLICY = resolveVisualPolicy();
