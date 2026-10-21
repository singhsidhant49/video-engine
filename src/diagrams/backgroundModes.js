/**
 * Milestone 13 — Editorial Diagram Background System
 * 
 * Replaces monolithic green grids with controlled background modes:
 * - neutralDark: Deep obsidian editorial void with restrained ambient vignette
 * - softRadial: Focused spotlight under primary diagram area
 * - technicalGrid: Clean ultra-subtle hairline coordinate grid (opacity <= 0.08)
 * - paperLight: High-end architectural blueprint / archival paper tone
 * - mediaBlur: Heavy blurred texture from real footage with strong dark scrim
 * - charcoal: Deep matte textured graphite tone
 * - subtleTexture: Fine filmic grain / architectural dot matrix
 */

export const BACKGROUND_MODES = {
  NEUTRAL_DARK: 'neutralDark',
  SOFT_RADIAL: 'softRadial',
  TECHNICAL_GRID: 'technicalGrid',
  PAPER_LIGHT: 'paperLight',
  MEDIA_BLUR: 'mediaBlur',
  CHARCOAL: 'charcoal',
  SUBTLE_TEXTURE: 'subtleTexture',
};

const MODE_ROTATION = [
  BACKGROUND_MODES.SOFT_RADIAL,
  BACKGROUND_MODES.NEUTRAL_DARK,
  BACKGROUND_MODES.TECHNICAL_GRID,
  BACKGROUND_MODES.CHARCOAL,
  BACKGROUND_MODES.SUBTLE_TEXTURE,
];

/**
 * Selects an appropriate background mode based on grammar, content, and recent usage.
 * 
 * @param {Object} options
 * @param {string} options.grammar - Diagram grammar
 * @param {string} options.topic - Video topic
 * @param {Array<string>} options.recentModes - Recently used background modes
 * @returns {string} Selected background mode
 */
export function selectBackgroundMode({ grammar, topic = '', recentModes = [] }) {
  const isTechnical = /code|agent|software|semiconductor|asml|gpu|chip|system|hardware/i.test(topic);
  const isScientific = /brain|psychology|neuro|dopamine|study|limbic|gratification/i.test(topic);

  let candidates = [];
  if (grammar === 'SYSTEM_ARCHITECTURE' || grammar === 'PIPELINE') {
    candidates = [BACKGROUND_MODES.TECHNICAL_GRID, BACKGROUND_MODES.SOFT_RADIAL, BACKGROUND_MODES.CHARCOAL];
  } else if (grammar === 'RELATIONSHIP' || grammar === 'COMPARISON') {
    candidates = [BACKGROUND_MODES.SOFT_RADIAL, BACKGROUND_MODES.NEUTRAL_DARK, BACKGROUND_MODES.CHARCOAL];
  } else if (grammar === 'CYCLE' || grammar === 'FLOW') {
    candidates = [BACKGROUND_MODES.SOFT_RADIAL, BACKGROUND_MODES.SUBTLE_TEXTURE, BACKGROUND_MODES.NEUTRAL_DARK];
  } else if (grammar === 'NETWORK') {
    candidates = [BACKGROUND_MODES.TECHNICAL_GRID, BACKGROUND_MODES.NEUTRAL_DARK, BACKGROUND_MODES.SOFT_RADIAL];
  } else {
    candidates = MODE_ROTATION;
  }

  // Filter out the most recently used background mode to avoid grid -> grid repetition
  const lastMode = recentModes[recentModes.length - 1];
  const fresh = candidates.filter((m) => m !== lastMode);
  return fresh[0] || candidates[0] || BACKGROUND_MODES.NEUTRAL_DARK;
}

/**
 * Convenience helper to pick a non-repetitive background mode.
 */
export function pickNonRepetitiveBackground(topic = '', recentModes = []) {
  return selectBackgroundMode({ topic, recentModes });
}

/**
 * Returns rendering styles and SVG overlays for a selected background mode.
 */
export function getBackgroundStyles(mode, theme) {
  const { palette } = theme;
  const bg = palette?.bg || '#090b10';
  const bgRaised = palette?.bgRaised || '#121620';
  const accent = palette?.accent || '#6366f1';
  const line = palette?.line || 'rgba(255, 255, 255, 0.08)';

  switch (mode) {
    case BACKGROUND_MODES.SOFT_RADIAL:
      return {
        containerStyle: {
          background: `radial-gradient(ellipse at 50% 46%, ${palette?.accentSoft || 'rgba(99, 102, 241, 0.14)'} 0%, ${bg} 68%)`,
        },
        overlay: null,
      };

    case BACKGROUND_MODES.TECHNICAL_GRID:
      return {
        containerStyle: {
          background: `linear-gradient(160deg, ${bg} 0%, ${bgRaised} 100%)`,
        },
        overlayType: 'grid',
        gridSize: theme.isVertical ? 48 : 64,
        gridColor: line,
        gridOpacity: 0.08, // Very subtle, never harsh
      };

    case BACKGROUND_MODES.CHARCOAL:
      return {
        containerStyle: {
          background: `radial-gradient(circle at 50% 50%, #151821 0%, #0b0d12 100%)`,
        },
        overlay: null,
      };

    case BACKGROUND_MODES.SUBTLE_TEXTURE:
      return {
        containerStyle: {
          background: `linear-gradient(145deg, ${bg} 0%, #0f131a 100%)`,
        },
        overlayType: 'dots',
        dotSize: theme.isVertical ? 32 : 44,
        dotColor: line,
        dotOpacity: 0.09,
      };

    case BACKGROUND_MODES.PAPER_LIGHT:
      return {
        containerStyle: {
          background: `linear-gradient(180deg, #181d26 0%, #0d1017 100%)`,
        },
        overlayType: 'architectural',
      };

    case BACKGROUND_MODES.NEUTRAL_DARK:
    default:
      return {
        containerStyle: {
          background: `radial-gradient(ellipse at 50% 50%, ${bgRaised} 0%, ${bg} 100%)`,
        },
        overlay: null,
      };
  }
}
