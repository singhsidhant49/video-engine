/**
 * Same plan + narration rendered in every directing style, stacked into one
 * comparison sheet — to check styles differ in more than colour.
 *
 *   node scripts/styleMatrix.js --plan plan.json --audio voice.wav [--format landscape] [--styles a,b] [--topic "..."]
 *
 * Output: renders/matrix/<timestamp>/matrix.png (one row per style, one tile per clip).
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { config } from '../src/config/index.js';
import { STYLE_IDS } from '../src/shared/styles.js';
import { createFacelessVideo } from '../src/pipeline/videoGeneratorPipeline.js';
import { renderContactSheet } from '../src/tools/preview.js';

const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : d; };
const planFile = path.resolve(opt('--plan'));
const audioFile = path.resolve(opt('--audio'));
const format = opt('--format', 'shorts');
const styles = opt('--styles', STYLE_IDS.join(',')).split(',');

const outDir = path.join(config.rendersDir, 'matrix', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
await fs.mkdir(outDir, { recursive: true });
const rows = [];
for (const style of styles) {
  const r = await createFacelessVideo({ topic: opt('--topic', 'style matrix'), format, planFile, audioFile, style, render: false });
  const sheet = await renderContactSheet(r.runDir, { scale: format === 'shorts' ? 0.18 : 0.14, ats: [0.6], cols: 100 });
  rows.push({ style, sheet });
  console.log(`▦ ${style} → ${sheet}`);
}
const metas = await Promise.all(rows.map((r) => sharp(r.sheet).metadata()));
const labelW = 260, W = Math.max(...metas.map((m) => m.width)) + labelW, rowH = Math.max(...metas.map((m) => m.height));
const comps = [];
for (const [i, r] of rows.entries()) {
  comps.push({ input: await sharp(r.sheet).toBuffer(), left: labelW, top: i * rowH });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${labelW}" height="${rowH}"><text x="16" y="${rowH / 2}" fill="#fff" font-family="Helvetica" font-size="22" font-weight="700">${r.style.replace(/_/g, ' ')}</text></svg>`;
  comps.push({ input: Buffer.from(svg), left: 0, top: i * rowH });
}
const out = path.join(outDir, 'matrix.png');
await sharp({ create: { width: W, height: rowH * rows.length, channels: 3, background: '#111' } }).composite(comps).png().toFile(out);
console.log(out);
