/**
 * Contact sheet of stills from a run's timeline.json — fast visual review without a full render.
 *
 *   node scripts/previewRun.js renders/runs/<videoId> [--scale 0.4] [--at 0.2,0.85]
 */
import path from 'node:path';
import { renderContactSheet } from '../src/tools/preview.js';

const args = process.argv.slice(2);
const opt = (flag, fallback) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : fallback; };
const sheet = await renderContactSheet(path.resolve(args[0] || ''), { scale: Number(opt('--scale', '0.4')), ats: opt('--at', '0.2,0.85').split(',').map(Number) });
console.log(sheet);
