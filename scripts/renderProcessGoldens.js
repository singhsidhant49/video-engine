import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import sharp from 'sharp';
import { config } from '../src/config/index.js';
import { buildPalette } from '../src/shared/styles.js';
import { compileSolvedProcessShot } from '../src/composition/compileSolvedProcessShot.js';
import { PROCESS_FIXTURES, editorialPlanForProcessFixture } from '../src/composition/processFixtures.js';

const STATE_NAMES = ['frame-0', 'state-25', 'state-50', 'state-75', 'final'];

function timelineFor(fixture, format, renderMode) {
  const vertical = format === 'shorts';
  const width = vertical ? 1080 : 1920, height = vertical ? 1920 : 1080;
  const durationInFrames = fixture.durationInFrames;
  const editorialPlan = editorialPlanForProcessFixture(fixture);
  const compiled = compileSolvedProcessShot({
    editorialPlan, overlay: { steps: fixture.steps }, alignedWords: fixture.alignedWords,
    timing: { startFrame: 0, durationInFrames }, format, width, height, styleId: 'technical', captionsEnabled: true,
  });
  if (!compiled.preflight.passed) throw new Error(`${fixture.id}/${format} failed preflight: ${JSON.stringify(compiled.preflight.hardFailures)}`);
  const shot = {
    id: editorialPlan.shotId, storyboardShotId: editorialPlan.shotId, sceneId: `scene_${fixture.id}`, sectionId: 'golden',
    from: 0, startFrame: 0, endFrame: durationInFrames, durationInFrames, role: 'graphic', family: 'process', variant: 'flow',
    layout: 'process:flow', presentation: { family: 'process', variant: 'flow', layout: 'process:flow', overlayMode: 'primary', cameraMove: 'static', visualDensity: 'MEDIUM' },
    overlay: { title: fixture.title, steps: fixture.steps, ats: compiled.composition.semanticEvents.map((event) => event.frame) },
    assets: [], asset: null, renderMode, solvedSceneId: renderMode === 'solved' ? compiled.solvedScene.id : null,
    motionPlanId: renderMode === 'solved' ? compiled.motionPlan.id : null,
    transitionReason: 'newIdea', transitionAnchor: null, transitionPolicy: 'CUT', imageBehavior: null,
    captionPolicy: {
      mode: renderMode === 'solved' ? 'INTEGRATED' : 'NORMAL', geometry: compiled.solvedScene.regions.captions,
      equivalentOnScreenText: renderMode === 'solved', reason: renderMode === 'solved' ? 'Stage labels integrate the narrated process.' : 'Legacy comparison retains phrase subtitles.',
    },
  };
  const clip = {
    id: `clip_${fixture.id}`, sceneId: shot.sceneId, sectionId: 'golden', kind: 'process', family: 'process', variant: 'flow',
    treatment: 'technical', from: 0, durationInFrames, cutAt: 0, enter: { type: 'cut', frames: 0 }, exit: { type: 'cut', frames: 0 },
    accents: {}, bed: null, texture: null, overlay: shot.overlay, shots: [shot], narration: '',
  };
  return {
    version: 3, videoId: `golden-${fixture.id}-${format}-${renderMode}`, title: fixture.title, format, fps: 30, width, height,
    durationInFrames, style: 'technical', palette: buildPalette('technical', 215), clips: [clip], realizedShots: [shot],
    solvedScenes: renderMode === 'solved' ? { [compiled.solvedScene.id]: compiled.solvedScene } : {},
    motionPlans: renderMode === 'solved' ? { [compiled.motionPlan.id]: compiled.motionPlan } : {},
    cutOverlays: [], captions: {
      mode: 'phrase',
      chunks: fixture.alignedWords.filter((word) => word.endsPhrase).map((endWord, phraseIndex) => {
        const words = fixture.alignedWords.filter((word) => Math.floor((word.startFrame - 8) / 34) === phraseIndex);
        return { startFrame: words[0].startFrame, endFrame: endWord.endFrame + 8, words, text: words.map((word) => word.text).join(' ') };
      }),
      hidden: renderMode === 'solved' ? [[0, durationInFrames]] : [],
      policies: [{ shotId: shot.id, startFrame: 0, endFrame: durationInFrames, ...shot.captionPolicy }],
      geometry: compiled.solvedScene.regions.captions,
    },
    audio: { narration: null, bgm: null, sfx: [], speech: [] },
  };
}

async function tile(files, output) {
  const targetHeight = 360;
  const buffers = await Promise.all(files.map((file) => sharp(file).resize({ height: targetHeight }).png().toBuffer()));
  const metas = await Promise.all(buffers.map((buffer) => sharp(buffer).metadata()));
  const width = metas.reduce((sum, meta) => sum + meta.width, 0);
  let left = 0;
  const composites = buffers.map((input, index) => {
    const entry = { input, left, top: 0 };
    left += metas[index].width;
    return entry;
  });
  await sharp({ create: { width, height: targetHeight, channels: 3, background: '#080b12' } }).composite(composites).png().toFile(output);
}

async function main() {
  const outRoot = path.join(config.rootDir, 'fixtures', 'golden', 'process-m14');
  await fs.mkdir(outRoot, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.join(config.rootDir, 'src', 'remotion', 'index.jsx'), ignoreRegisterRootWarning: true });
  const manifest = [];
  for (const fixture of PROCESS_FIXTURES) for (const format of ['landscape', 'shorts']) {
    const timeline = timelineFor(fixture, format, 'solved');
    const dir = path.join(outRoot, fixture.id, format);
    await fs.mkdir(dir, { recursive: true });
    const composition = await selectComposition({ serveUrl, id: format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer', inputProps: { timeline } });
    const frames = [0, Math.round((timeline.durationInFrames - 1) * 0.25), Math.round((timeline.durationInFrames - 1) * 0.5), Math.round((timeline.durationInFrames - 1) * 0.75), timeline.durationInFrames - 1];
    const files = [];
    for (let index = 0; index < frames.length; index++) {
      const output = path.join(dir, `${STATE_NAMES[index]}.png`);
      await renderStill({ composition, serveUrl, inputProps: { timeline }, frame: frames[index], output, imageFormat: 'png' });
      files.push(output);
    }
    const contactSheet = path.join(dir, 'state-contact-sheet.png');
    await tile(files, contactSheet);
    manifest.push({ fixture: fixture.id, format, frames, contactSheet: path.relative(outRoot, contactSheet).replaceAll('\\', '/') });

    if (fixture.id === 'ai-agent') {
      const legacy = timelineFor(fixture, format, 'legacy');
      const legacyComposition = await selectComposition({ serveUrl, id: format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer', inputProps: { timeline: legacy } });
      const before = path.join(dir, 'legacy-before.png');
      const after = path.join(dir, 'solved-after.png');
      const comparisonFrame = frames[2];
      await renderStill({ composition: legacyComposition, serveUrl, inputProps: { timeline: legacy }, frame: comparisonFrame, output: before, imageFormat: 'png' });
      await fs.copyFile(files[2], after);
      await tile([before, after], path.join(dir, 'legacy-vs-solved.png'));
    }
  }
  await fs.writeFile(path.join(outRoot, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), states: STATE_NAMES, fixtures: manifest }, null, 2)}\n`);
  console.log(`Process goldens written to ${outRoot}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
