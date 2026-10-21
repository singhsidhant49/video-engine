import fs from 'node:fs';
import path from 'node:path';

const measurementCache = new Map();
const fontCache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

const WINDOWS_FONT_DIR = process.env.WINDIR ? path.join(process.env.WINDIR, 'Fonts') : 'C:\\Windows\\Fonts';
const FONT_FILES = {
  'Segoe UI': { regular: 'segoeui.ttf', bold: 'segoeuib.ttf' },
  Arial: { regular: 'arial.ttf', bold: 'arialbd.ttf' },
  Consolas: { regular: 'consola.ttf', bold: 'consolab.ttf' },
  Georgia: { regular: 'georgia.ttf', bold: 'georgiab.ttf' },
  Impact: { regular: 'impact.ttf', bold: 'impact.ttf' },
  'Times New Roman': { regular: 'times.ttf', bold: 'timesbd.ttf' },
};

const u16 = (b, o) => b.readUInt16BE(o);
const i16 = (b, o) => b.readInt16BE(o);
const u32 = (b, o) => b.readUInt32BE(o);

function fontCandidates(fontFamily) {
  return String(fontFamily || 'Segoe UI')
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => !['sans-serif', 'serif', 'monospace', 'ui-monospace'].includes(name));
}

function resolveFontFile(fontFamily, fontWeight) {
  for (const family of fontCandidates(fontFamily)) {
    const files = FONT_FILES[family];
    if (!files) continue;
    const file = path.join(WINDOWS_FONT_DIR, fontWeight >= 600 ? files.bold : files.regular);
    if (fs.existsSync(file)) return { family, file };
  }
  const fallback = path.join(WINDOWS_FONT_DIR, fontWeight >= 600 ? 'segoeuib.ttf' : 'segoeui.ttf');
  return fs.existsSync(fallback) ? { family: 'Segoe UI', file: fallback } : null;
}

function readTables(buffer) {
  const count = u16(buffer, 4);
  const tables = {};
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    tables[buffer.toString('ascii', at, at + 4)] = { offset: u32(buffer, at + 8), length: u32(buffer, at + 12) };
  }
  return tables;
}

function createCmap(buffer, table) {
  const base = table.offset;
  const count = u16(buffer, base + 2);
  let selected = null;
  for (let i = 0; i < count; i++) {
    const at = base + 4 + i * 8;
    const platform = u16(buffer, at);
    const encoding = u16(buffer, at + 2);
    const offset = u32(buffer, at + 4);
    const format = u16(buffer, base + offset);
    const score = format === 12 ? 4 : format === 4 && platform === 3 ? (encoding === 10 ? 3 : 2) : format === 4 ? 1 : 0;
    if (score && (!selected || score > selected.score)) selected = { offset: base + offset, format, score };
  }
  if (!selected) return () => 0;
  if (selected.format === 12) {
    const groups = u32(buffer, selected.offset + 12);
    return (code) => {
      let lo = 0, hi = groups - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const at = selected.offset + 16 + mid * 12;
        const start = u32(buffer, at), end = u32(buffer, at + 4);
        if (code < start) hi = mid - 1;
        else if (code > end) lo = mid + 1;
        else return u32(buffer, at + 8) + code - start;
      }
      return 0;
    };
  }
  const segCount = u16(buffer, selected.offset + 6) / 2;
  const endBase = selected.offset + 14;
  const startBase = endBase + segCount * 2 + 2;
  const deltaBase = startBase + segCount * 2;
  const rangeBase = deltaBase + segCount * 2;
  return (code) => {
    for (let i = 0; i < segCount; i++) {
      const end = u16(buffer, endBase + i * 2);
      if (code > end) continue;
      const start = u16(buffer, startBase + i * 2);
      if (code < start) return 0;
      const delta = i16(buffer, deltaBase + i * 2);
      const range = u16(buffer, rangeBase + i * 2);
      if (!range) return (code + delta) & 0xffff;
      const location = rangeBase + i * 2 + range + (code - start) * 2;
      if (location + 2 > buffer.length) return 0;
      const glyph = u16(buffer, location);
      return glyph ? (glyph + delta) & 0xffff : 0;
    }
    return 0;
  };
}

function createKerning(buffer, table) {
  if (!table) return () => 0;
  const pairs = new Map();
  const tableCount = u16(buffer, table.offset + 2);
  let cursor = table.offset + 4;
  for (let index = 0; index < tableCount && cursor + 6 <= table.offset + table.length; index++) {
    const length = u16(buffer, cursor + 2);
    const coverage = u16(buffer, cursor + 4);
    const format = coverage >> 8;
    if (format === 0 && cursor + 14 <= buffer.length) {
      const pairCount = u16(buffer, cursor + 6);
      for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
        const at = cursor + 14 + pairIndex * 6;
        if (at + 6 > buffer.length) break;
        const left = u16(buffer, at), right = u16(buffer, at + 2), value = i16(buffer, at + 4);
        pairs.set(left * 65536 + right, value);
      }
    }
    cursor += Math.max(6, length);
  }
  return (left, right) => pairs.get(left * 65536 + right) || 0;
}

function loadFont(fontFamily, fontWeight) {
  const resolved = resolveFontFile(fontFamily, fontWeight);
  if (!resolved) return null;
  const key = `${resolved.file}:${fontWeight >= 600 ? 'bold' : 'regular'}`;
  if (fontCache.has(key)) return fontCache.get(key);
  const buffer = fs.readFileSync(resolved.file);
  const tables = readTables(buffer);
  if (!tables.head || !tables.hhea || !tables.hmtx || !tables.maxp || !tables.cmap) return null;
  const unitsPerEm = u16(buffer, tables.head.offset + 18);
  const numberOfHMetrics = u16(buffer, tables.hhea.offset + 34);
  const numGlyphs = u16(buffer, tables.maxp.offset + 4);
  const advances = new Uint16Array(numGlyphs);
  let lastAdvance = 0;
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numberOfHMetrics) lastAdvance = u16(buffer, tables.hmtx.offset + i * 4);
    advances[i] = lastAdvance;
  }
  const parsed = {
    family: resolved.family, file: resolved.file, unitsPerEm, advances,
    glyphFor: createCmap(buffer, tables.cmap), kerningFor: createKerning(buffer, tables.kern),
    resolvedWeight: fontWeight >= 600 ? 700 : 400,
  };
  fontCache.set(key, parsed);
  return parsed;
}

function actualTextWidth(text, font, fontSize, letterSpacing = 0) {
  if (!font) return String(text).length * fontSize * 0.58;
  let units = 0, glyphs = 0, previousGlyph = null;
  for (const char of String(text)) {
    const glyph = font.glyphFor(char.codePointAt(0));
    if (previousGlyph !== null) units += font.kerningFor(previousGlyph, glyph);
    units += font.advances[glyph] || font.advances[0] || font.unitsPerEm * 0.55;
    glyphs++;
    previousGlyph = glyph;
  }
  return units / font.unitsPerEm * fontSize + Math.max(0, glyphs - 1) * letterSpacing;
}

function wrapText(text, width, measure) {
  const paragraphs = String(text || '').split(/\n/);
  const lines = [];
  let longestWordWidth = 0;
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      longestWordWidth = Math.max(longestWordWidth, measure(word));
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > width) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
  }
  return { lines, longestWordWidth };
}

export function measureTextLayout({
  text,
  fontFamily,
  fontWeight = 600,
  fontSize,
  lineHeight = 1.15,
  maxWidth,
  letterSpacing = 0,
}) {
  const key = JSON.stringify([fontFamily, fontWeight, fontSize, lineHeight, text, maxWidth, letterSpacing]);
  if (measurementCache.has(key)) { cacheHits++; return measurementCache.get(key); }
  cacheMisses++;
  const font = loadFont(fontFamily, fontWeight);
  const measure = (value) => actualTextWidth(value, font, fontSize, letterSpacing);
  const wrapped = wrapText(text, maxWidth, measure);
  const widths = wrapped.lines.map(measure);
  const result = Object.freeze({
    actualWidth: widths.length ? Math.max(...widths) : 0,
    actualHeight: Math.max(1, wrapped.lines.length) * fontSize * lineHeight,
    lineBreaks: wrapped.lines,
    longestWordWidth: wrapped.longestWordWidth,
    metricsSource: font ? `truetype:${path.basename(font.file)}:${font.family}` : 'fallback-advance-ratio',
    kerningApplied: Boolean(font),
    resolvedFontWeight: font?.resolvedWeight || fontWeight,
  });
  measurementCache.set(key, result);
  return result;
}

export function fitMeasuredText({
  text,
  fontFamily,
  fontWeight = 600,
  maxFontSize,
  minFontSize,
  lineHeight = 1.15,
  maxWidth,
  maxHeight,
  maxLines,
  letterSpacing = 0,
}) {
  let smallest = null;
  for (let fontSize = Math.floor(maxFontSize); fontSize >= Math.ceil(minFontSize); fontSize--) {
    const measurement = measureTextLayout({ text, fontFamily, fontWeight, fontSize, lineHeight, maxWidth, letterSpacing });
    smallest = { fontSize, ...measurement };
    if (measurement.lineBreaks.length <= maxLines
      && measurement.actualHeight <= maxHeight
      && measurement.longestWordWidth <= maxWidth) {
      return { ...smallest, constraintUnsatisfied: false, fitStatus: measurement.lineBreaks.length > 1 ? 'FIT_WITH_WRAP' : 'FIT' };
    }
  }
  const impossible = !smallest || smallest.longestWordWidth > maxWidth || minFontSize * lineHeight > maxHeight;
  return { ...smallest, constraintUnsatisfied: true, fitStatus: impossible ? 'FAILED' : 'FIT_WITH_REWRITE_REQUIRED' };
}

export function fitSemanticText({ variants, ...options }) {
  const candidates = [
    ['FULL', variants.full],
    ['SHORT', variants.short],
    ['LABEL_ONLY', variants.labelOnly],
  ].filter(([, text]) => typeof text === 'string' && text.trim());
  let last = null;
  for (const [reductionTier, text] of candidates) {
    const result = fitMeasuredText({ ...options, text });
    last = { ...result, text, reductionTier };
    if (!result.constraintUnsatisfied) return last;
  }
  return { ...last, constraintUnsatisfied: true, fitStatus: 'FAILED' };
}

export function textMeasurementCacheStats() {
  return { entries: measurementCache.size, fontEntries: fontCache.size, hits: cacheHits, misses: cacheMisses };
}

export function clearTextMeasurementCache() {
  measurementCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}
