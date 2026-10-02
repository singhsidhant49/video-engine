import fs from 'node:fs/promises';
import path from 'node:path';
import { reviewRenderedFrames } from '../src/services/visualCriticService.js';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { config } from '../src/config/index.js';
import { runRenderQc } from '../src/qc/renderQc.js';

const runDir = path.resolve(process.argv[2] || '');
if (!runDir) throw new Error('Usage: node scripts/renderTimelineRun.js <run-dir>');
const timeline = JSON.parse(await fs.readFile(path.join(runDir, 'timeline.json'), 'utf8'));
const serveUrl = await bundle({
  entryPoint: path.join(config.rootDir, 'src/remotion/index.jsx'),
  publicDir: path.join(runDir, 'public'),
  ignoreRegisterRootWarning: true,
});
const composition = await selectComposition({
  serveUrl,
  id: timeline.format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer',
  inputProps: { timeline },
});
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(config.rendersDir, `${timeline.videoId}-${timeline.format}.mp4`);
let lastPercent = -1;
await renderMedia({
  composition,
  serveUrl,
  inputProps: { timeline },
  outputLocation: outputPath,
  codec: 'h264',
  crf: 17,
  imageFormat: 'jpeg',
  jpegQuality: 94,
  colorSpace: 'bt709',
  audioBitrate: '192k',
  onProgress: ({ progress }) => {
    const percent = Math.round(progress * 100);
    if (percent !== lastPercent && percent % 5 === 0) console.log(`render ${percent}%`);
    lastPercent = percent;
  },
});
const renderQc = await runRenderQc(outputPath, timeline);
const renderedCritic = await reviewRenderedFrames(outputPath, timeline, runDir);
const priorQc = JSON.parse(await fs.readFile(path.join(runDir, 'qc-pre.json'), 'utf8'));
await fs.writeFile(path.join(runDir, 'qc.json'), JSON.stringify({
  ...priorQc,
  render: renderQc,
  renderedCritic,
  resumedFromTimeline: true,
}, null, 2));
console.log(`Rendered ${outputPath}`);
