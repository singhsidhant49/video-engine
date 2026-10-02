import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { config } from '../src/config/index.js';

const root = path.join(config.rootDir, 'fixtures', 'golden', 'composition-m15');
const out = path.join(root, 'regressions');
await fs.mkdir(out, { recursive: true });

async function sheet(name, relativeFiles, targetHeight) {
  const buffers = await Promise.all(relativeFiles.map((file) => sharp(path.join(root, file)).resize({ height: targetHeight }).png().toBuffer()));
  const metadata = await Promise.all(buffers.map((buffer) => sharp(buffer).metadata()));
  const width = metadata.reduce((total, item) => total + item.width, 0); let left = 0;
  const composite = buffers.map((input, index) => { const item = { input, left, top: 0 }; left += metadata[index].width; return item; });
  await sharp({ create: { width, height: targetHeight, channels: 3, background: '#080b12' } }).composite(composite).png().toFile(path.join(out, name));
}

await sheet('psychology-landscape.png', [
  'comparison/reward/landscape/frame-0.png', 'comparison/reward/landscape/final.png',
  'chart/reward-delay/landscape/frame-0.png', 'chart/reward-delay/landscape/final.png',
], 420);
await sheet('structured-landscape.png', [
  'comparison/software-agent/landscape/state-50.png', 'comparison/software-agent/landscape/final.png',
  'chart/revenue-segments/landscape/state-50.png', 'chart/revenue-segments/landscape/final.png',
], 420);
await sheet('structured-shorts.png', [
  'comparison/strategy/shorts/frame-0.png', 'comparison/strategy/shorts/final.png',
  'chart/revenue-segments/shorts/frame-0.png', 'chart/revenue-segments/shorts/final.png',
], 640);
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const visualQualityReviews = Object.fromEntries(manifest.fixtures.map((item) => [
  `quality_${item.representation}_${item.fixture}_${item.format}`,
  item.visualQuality,
]));
await fs.writeFile(path.join(root, 'visual-quality-reviews.json'), `${JSON.stringify(visualQualityReviews, null, 2)}\n`);
console.log(`Regression sheets written to ${out}`);
