import React, { createContext, useContext } from 'react';
import { useVideoConfig } from 'remotion';
import { getStyle, TYPE_SCALE, SAFE_AREA } from '../../shared/styles.js';
import { fontStack } from './fonts.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ timeline, children }) {
  const { width, height } = useVideoConfig();
  const format = timeline.format === 'landscape' ? 'landscape' : 'shorts';
  const style = getStyle(timeline.style);
  const unit = Math.min(width, height) / 1080;
  const scale = TYPE_SCALE[format];
  const safe = SAFE_AREA[format];
  const size = Object.fromEntries(Object.entries(scale).map(([k, v]) => [k, Math.round(v * unit)]));
  const theme = {
    format,
    isVertical: format === 'shorts',
    width,
    height,
    unit,
    u: (px) => px * unit,
    size,
    safe: { top: safe.top * height, bottom: safe.bottom * height, left: safe.left * width, right: safe.right * width },
    style,
    palette: timeline.palette,
    font: {
      display: fontStack(style.fonts.display),
      text: fontStack(style.fonts.text),
      mono: `'${style.fonts.mono}', ui-monospace, monospace`,
    },
  };
  return React.createElement(ThemeContext.Provider, { value: theme }, children);
}

export const useTheme = () => useContext(ThemeContext);

/** Shared text styles derived from the directing style. */
export function textStyles(theme) {
  const { style, font, palette, size } = theme;
  return {
    display: {
      fontFamily: font.display,
      fontWeight: style.display.weight,
      letterSpacing: `${style.display.tracking}em`,
      lineHeight: style.display.lineHeight,
      textTransform: style.display.uppercase ? 'uppercase' : 'none',
      color: palette.text,
      margin: 0,
      textWrap: 'balance',
    },
    label: {
      fontFamily: style.label.mono ? font.mono : font.text,
      fontWeight: style.label.weight,
      letterSpacing: `${style.label.tracking}em`,
      textTransform: style.label.uppercase ? 'uppercase' : 'none',
      fontSize: size.label,
      color: palette.muted,
      lineHeight: 1.2,
    },
    body: {
      fontFamily: font.text,
      fontWeight: 500,
      fontSize: size.body,
      lineHeight: 1.3,
      color: palette.text,
      textWrap: 'pretty',
    },
  };
}

/**
 * Deterministic "fit": pick the largest size ≤ max at which the longest line
 * fits the box, using an average glyph-width ratio for the display face.
 * Avoids DOM measurement (fonts may not be laid out yet during the first pass).
 */
export function fitSize(text, boxWidth, maxSize, { lines = 2, ratio = 0.56, minSize = 24 } = {}) {
  const words = String(text).split(/\s+/);
  const total = String(text).length;
  // Longest line after a balanced split into `lines` lines.
  let longest = 0, current = 0;
  const target = total / lines;
  for (const w of words) {
    if (current && current + w.length + 1 > target * 1.15) { longest = Math.max(longest, current); current = w.length; }
    else current += (current ? 1 : 0) + w.length;
  }
  longest = Math.max(longest, current, ...words.map((w) => w.length));
  return Math.max(minSize, Math.min(maxSize, Math.floor(boxWidth / (longest * ratio))));
}

export const glyphRatio = (style) => (style.display.uppercase ? 0.6 : 0.52) * (style.fonts.display === 'Oswald' ? 0.78 : style.fonts.display === 'Instrument Serif' ? 0.86 : 1);
