import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { config } from '../src/config/index.js';

async function main() {
  const entryPoint = path.join(config.rootDir, 'src/remotion/index.jsx');
  console.log('Bundling...');
  const bundled = await bundle({
    entryPoint,
    ignoreRegisterRootWarning: true,
  });

  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'DynamicShorts',
  });

  const frames = [15, 60, 120, 180, 240, 290];
  const outDir = path.join(config.rootDir, 'renders/stills');
  await fs.mkdir(outDir, { recursive: true });

  for (const f of frames) {
    const outFile = path.join(outDir, `still_frame_${f}.png`);
    console.log(`Rendering frame ${f}...`);
    await renderStill({
      composition,
      serveUrl: bundled,
      output: outFile,
      frame: f,
    });
    console.log(`Saved: ${outFile}`);
  }
}

main().catch(console.error);
