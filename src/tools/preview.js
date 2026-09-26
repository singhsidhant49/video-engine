import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { config } from '../config/index.js';

/**
 * Render stills from a run's timeline.json at relative points of every clip
 * and tile them into <run>/preview/contact.png. Returns the contact sheet path.
 */
export async function renderContactSheet(runDir, { scale = 0.4, ats = [0.2, 0.85], cols } = {}) {
  const timeline = JSON.parse(await fs.readFile(path.join(runDir, 'timeline.json'), 'utf8'));
  const outDir = path.join(runDir, 'preview');
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.join(config.rootDir, 'src/remotion/index.jsx'), publicDir: path.join(runDir, 'public'), ignoreRegisterRootWarning: true });
  const id = timeline.format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer';
  const composition = await selectComposition({ serveUrl, id, inputProps: { timeline } });

  const files = [];
  for (const c of timeline.clips) {
    const start = c.from + c.cutAt;
    const end = c.from + c.durationInFrames - (c.exit.frames || 0);
    for (const a of ats) {
      const frame = Math.min(timeline.durationInFrames - 1, Math.round(start + (end - start) * a));
      const file = path.join(outDir, `${String(frame).padStart(5, '0')}_${c.id}-${c.family}-${c.variant || ''}.png`);
      await renderStill({ composition, serveUrl, inputProps: { timeline }, frame, output: file, scale });
      files.push(file);
    }
  }
  const meta = await sharp(files[0]).metadata();
  const n = cols ? Math.min(cols, files.length) : (timeline.format === 'shorts' ? Math.min(8, files.length) : Math.min(4, files.length));
  const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).toBuffer(), left: (i % n) * meta.width, top: Math.floor(i / n) * meta.height })));
  const sheet = path.join(outDir, 'contact.png');
  await sharp({ create: { width: meta.width * n, height: meta.height * Math.ceil(files.length / n), channels: 3, background: '#222' } }).composite(tiles).png().toFile(sheet);
  return sheet;
}
