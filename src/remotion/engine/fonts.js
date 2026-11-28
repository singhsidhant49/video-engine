// Rendering must remain deterministic and work without network access. Keep
// font stacks local; named faces fall through to metrically stable platform
// families when they are not installed on the render host.
const SERIF = new Set(['Fraunces', 'Instrument Serif']);
const CONDENSED = new Set(['Oswald', 'Archivo']);
const MONO = new Set(['JetBrains Mono', 'IBM Plex Mono']);

export const fontStack = (family) => {
  if (SERIF.has(family)) return `'${family}', 'Noto Serif Devanagari', 'Noto Sans Devanagari', 'Kohinoor Devanagari', Georgia, 'Times New Roman', serif`;
  if (CONDENSED.has(family)) return `'${family}', 'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Arial Narrow', Impact, sans-serif`;
  if (MONO.has(family)) return `'${family}', 'Noto Sans Devanagari', Consolas, 'Courier New', monospace`;
  return `'${family}', 'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Segoe UI', Arial, sans-serif`;
};
