import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import sharp from 'sharp';
import { config } from '../src/config/index.js';
import { buildPalette } from '../src/shared/styles.js';
import { compileSolvedComparisonShot } from '../src/composition/compileSolvedComparisonShot.js';
import { compileSolvedChartShot } from '../src/composition/compileSolvedChartShot.js';
import { COMPARISON_FIXTURES, CHART_FIXTURES, editorialPlanForM15Fixture } from '../src/composition/milestone15Fixtures.js';

const STATE_NAMES = ['frame-0', 'state-25', 'state-50', 'state-75', 'final'];

function captionChunks(words) {
  const chunks = []; let current = [];
  for (const word of words) {
    current.push(word);
    if (word.endsSentence || current.length >= 8) {
      chunks.push({ startFrame: current[0].startFrame, endFrame: current.at(-1).endFrame + 5, words: current, text: current.map((item) => item.text).join(' ') });
      current = [];
    }
  }
  if (current.length) chunks.push({ startFrame: current[0].startFrame, endFrame: current.at(-1).endFrame + 5, words: current, text: current.map((item) => item.text).join(' ') });
  return chunks;
}

function legacyOverlay(fixture, family) {
  if (family === 'compare') return { ...fixture.overlay, leftAt: 2, rightAt: 18 };
  const primary = fixture.overlay.series[0];
  return { ...fixture.overlay, values: primary.data.map((item) => item.y), labels: primary.data.map((item) => String(item.x)), at: 4, drawFrames: 38 };
}

function timelineFor(fixture, representation, format, renderMode) {
  const vertical = format === 'shorts';
  const width = vertical ? 1080 : 1920, height = vertical ? 1920 : 1080;
  const family = representation === 'comparison' ? 'compare' : 'chart';
  const compiler = representation === 'comparison' ? compileSolvedComparisonShot : compileSolvedChartShot;
  const editorialPlan = editorialPlanForM15Fixture(fixture, representation);
  const compiled = compiler({ editorialPlan, overlay: fixture.overlay, alignedWords: fixture.alignedWords, timing: { startFrame: 0, durationInFrames: fixture.durationInFrames }, format, width, height, styleId: 'documentary', captionsEnabled: true });
  if (!compiled.preflight.passed) throw new Error(`${fixture.id}/${format}: ${JSON.stringify(compiled.preflight.hardFailures)}`);
  if (!compiled.visualQuality.publishable) throw new Error(`${fixture.id}/${format} failed editorial quality: ${JSON.stringify(compiled.visualQuality.warnings)}`);
  const overlay = legacyOverlay(fixture, family);
  const shot = {
    id: editorialPlan.shotId, storyboardShotId: editorialPlan.shotId, sceneId: `scene_${fixture.id}`, sectionId: 'golden',
    from: 0, startFrame: 0, endFrame: fixture.durationInFrames, durationInFrames: fixture.durationInFrames,
    role: 'graphic', family, variant: 'default', layout: `${family}:default`, visualIntent: 'explain', visualConcept: fixture.title,
    mediaPreference: 'procedural', evidenceRequirement: 'conceptual_allowed',
    presentation: { family, variant: 'default', layout: `${family}:default`, overlayMode: 'primary', cameraMove: 'static', visualDensity: 'MEDIUM' },
    overlay, assets: [], asset: null, renderMode,
    solvedSceneId: renderMode === 'solved' ? compiled.solvedScene.id : null,
    motionPlanId: renderMode === 'solved' ? compiled.motionPlan.id : null,
    compositionFallback: null, transitionReason: 'newIdea', transitionAnchor: null, transitionPolicy: 'CUT', imageBehavior: null,
    captionPolicy: { mode: 'COMPACT', geometry: compiled.solvedScene.regions.captions, equivalentOnScreenText: false, reason: 'Compact narration captions coexist with structured graphics.' },
  };
  const clip = { id: `clip_${fixture.id}`, sceneId: shot.sceneId, sectionId: 'golden', kind: representation, family, variant: 'default', treatment: 'graphic', from: 0, durationInFrames: fixture.durationInFrames, cutAt: 0, enter: { type: 'cut', frames: 0 }, exit: { type: 'cut', frames: 0 }, accents: {}, bed: null, texture: null, overlay, shots: [shot], narration: fixture.narration };
  return {
    version: 3, videoId: `m15-${representation}-${fixture.id}-${format}-${renderMode}`, title: fixture.title, format, fps: 30, width, height,
    durationInFrames: fixture.durationInFrames, style: 'documentary', palette: buildPalette('documentary', 210), clips: [clip], realizedShots: [shot],
    solvedScenes: renderMode === 'solved' ? { [compiled.solvedScene.id]: compiled.solvedScene } : {},
    motionPlans: renderMode === 'solved' ? { [compiled.motionPlan.id]: compiled.motionPlan } : {}, cutOverlays: [],
    captions: { mode: 'phrase', chunks: captionChunks(fixture.alignedWords), hidden: [], policies: [{ shotId: shot.id, startFrame: 0, endFrame: fixture.durationInFrames, ...shot.captionPolicy }], geometry: compiled.solvedScene.regions.captions },
    audio: { narration: null, bgm: null, sfx: [], speech: [] },
    _compiled: compiled,
  };
}

async function tile(files, output, targetHeight = 340) {
  const buffers = await Promise.all(files.map((file) => sharp(file).resize({ height: targetHeight }).png().toBuffer()));
  const metas = await Promise.all(buffers.map((buffer) => sharp(buffer).metadata()));
  const width = metas.reduce((sum, meta) => sum + meta.width, 0); let left = 0;
  await sharp({ create: { width, height: targetHeight, channels: 3, background: '#080b12' } }).composite(buffers.map((input, index) => { const entry = { input, left, top: 0 }; left += metas[index].width; return entry; })).png().toFile(output);
}

async function main() {
  const outRoot = path.join(config.rootDir, 'fixtures', 'golden', 'composition-m15');
  await fs.mkdir(outRoot, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.join(config.rootDir, 'src', 'remotion', 'index.jsx'), ignoreRegisterRootWarning: true });
  const manifest = [];
  for (const [representation, fixtures] of [['comparison', COMPARISON_FIXTURES], ['chart', CHART_FIXTURES]]) for (const fixture of fixtures) for (const format of ['landscape', 'shorts']) {
    const timeline = timelineFor(fixture, representation, format, 'solved');
    const dir = path.join(outRoot, representation, fixture.id, format); await fs.mkdir(dir, { recursive: true });
    const inputProps = { timeline: { ...timeline, _compiled: undefined } };
    const composition = await selectComposition({ serveUrl, id: format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer', inputProps });
    const frames = [0, .25, .5, .75, 1].map((ratio) => Math.round((timeline.durationInFrames - 1) * ratio));
    const files = [];
    for (let index = 0; index < frames.length; index++) {
      const output = path.join(dir, `${STATE_NAMES[index]}.png`);
      await renderStill({ composition, serveUrl, inputProps, frame: frames[index], output, imageFormat: 'png' }); files.push(output);
    }
    await tile(files, path.join(dir, 'lifecycle-contact-sheet.png'));
    manifest.push({ representation, fixture: fixture.id, format, topology: timeline._compiled.solvedScene.topology, frames, preflight: timeline._compiled.preflight.passed, visualQuality: timeline._compiled.visualQuality, contactSheet: path.relative(outRoot, path.join(dir, 'lifecycle-contact-sheet.png')).replaceAll('\\', '/') });
  }
  for (const [representation, fixture] of [['comparison', COMPARISON_FIXTURES[0]], ['chart', CHART_FIXTURES[1]]]) {
    const solved = timelineFor(fixture, representation, 'landscape', 'solved');
    const legacy = timelineFor(fixture, representation, 'landscape', 'legacy');
    const dir = path.join(outRoot, 'legacy-vs-solved', representation); await fs.mkdir(dir, { recursive: true });
    const frame = Math.round((fixture.durationInFrames - 1) * .62); const outputs = [];
    for (const [mode, timeline] of [['legacy', legacy], ['solved', solved]]) {
      const inputProps = { timeline: { ...timeline, _compiled: undefined } };
      const composition = await selectComposition({ serveUrl, id: 'LandscapeExplainer', inputProps });
      const output = path.join(dir, `${mode}.png`); await renderStill({ composition, serveUrl, inputProps, frame, output, imageFormat: 'png' }); outputs.push(output);
    }
    await tile(outputs, path.join(dir, 'comparison.png'), 540);
  }
  await fs.writeFile(path.join(outRoot, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), states: STATE_NAMES, fixtures: manifest }, null, 2)}\n`);
  console.log(`Milestone 15 goldens written to ${outRoot}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
