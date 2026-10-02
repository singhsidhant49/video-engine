import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { config } from '../src/config/index.js';
import { buildPalette } from '../src/shared/styles.js';
import { GOLDEN_DIAGRAM_FIXTURES } from '../src/diagrams/referenceFixtures.js';

async function generateGoldenDiagrams() {
  console.log('🎨 Starting Golden Diagram Suite Generation (Milestone 13)...');

  const entryPoint = path.join(config.rootDir, 'src/remotion/index.jsx');
  console.log('📦 Bundling Remotion root...');
  const serveUrl = await bundle({
    entryPoint,
    ignoreRegisterRootWarning: true,
  });

  const baseOutDir = path.join(config.rootDir, 'fixtures', 'golden', 'diagrams');

  for (const [key, fixture] of Object.entries(GOLDEN_DIAGRAM_FIXTURES)) {
    const fixtureDir = path.join(baseOutDir, key);
    await fs.mkdir(fixtureDir, { recursive: true });

    // 1. Landscape 16:9
    const landscapeTimeline = {
      version: 2,
      title: fixture.name,
      format: 'landscape',
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 90,
      style: 'technical',
      palette: buildPalette('technical', 215),
      cutOverlays: [],
      audio: { narration: null, bgm: null, sfx: [], speech: [] },
      captions: { mode: 'highlight', chunks: [], hidden: [] },
      clips: [
        {
          id: 'clip_diag_land',
          sceneId: 'sc1',
          kind: 'diagram',
          family: 'diagram',
          variant: 'nodes',
          from: 0,
          durationInFrames: 90,
          cutAt: 0,
          enter: { type: 'cut', frames: 0 },
          exit: { type: 'cut', frames: 0 },
          bed: null,
          texture: null,
          narration: '',
          overlay: fixture,
        },
      ],
    };

    const compLandscape = await selectComposition({
      serveUrl,
      id: 'LandscapeExplainer',
      inputProps: { timeline: landscapeTimeline },
    });

    const landscapeOut = path.join(fixtureDir, 'landscape.png');
    console.log(`   ↳ Rendering ${key} (16:9 landscape) -> ${landscapeOut}`);
    await renderStill({
      composition: compLandscape,
      serveUrl,
      inputProps: { timeline: landscapeTimeline },
      frame: 45,
      output: landscapeOut,
    });

    // 2. Vertical 9:16 Shorts
    const verticalTimeline = {
      version: 2,
      title: fixture.name,
      format: 'shorts',
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 90,
      style: 'technical',
      palette: buildPalette('technical', 215),
      cutOverlays: [],
      audio: { narration: null, bgm: null, sfx: [], speech: [] },
      captions: { mode: 'highlight', chunks: [], hidden: [] },
      clips: [
        {
          id: 'clip_diag_vert',
          sceneId: 'sc1',
          kind: 'diagram',
          family: 'diagram',
          variant: 'nodes',
          from: 0,
          durationInFrames: 90,
          cutAt: 0,
          enter: { type: 'cut', frames: 0 },
          exit: { type: 'cut', frames: 0 },
          bed: null,
          texture: null,
          narration: '',
          overlay: fixture,
        },
      ],
    };

    const compVertical = await selectComposition({
      serveUrl,
      id: 'DynamicShorts',
      inputProps: { timeline: verticalTimeline },
    });

    const verticalOut = path.join(fixtureDir, 'vertical.png');
    console.log(`   ↳ Rendering ${key} (9:16 vertical) -> ${verticalOut}`);
    await renderStill({
      composition: compVertical,
      serveUrl,
      inputProps: { timeline: verticalTimeline },
      frame: 45,
      output: verticalOut,
    });
  }

  console.log('✅ Golden Diagram Suite generated successfully!');
}

generateGoldenDiagrams().catch((err) => {
  console.error('❌ Failed to generate golden diagrams:', err);
  process.exit(1);
});
