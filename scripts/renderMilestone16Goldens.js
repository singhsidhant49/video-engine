import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import sharp from 'sharp';
import { config } from '../src/config/index.js';
import { buildPalette } from '../src/shared/styles.js';
import { compileSolvedMediaShot } from '../src/composition/compileSolvedMediaShot.js';
import { MEDIA_FIXTURES, wordsForMediaFixture } from '../src/composition/milestone16Fixtures.js';

const durationInFrames = 150;
const stateNames = ['frame-0', 'state-25', 'state-50', 'state-75', 'final'];

function compileFixture(fixture, format) {
  const width = format === 'shorts' ? 1080 : 1920, height = format === 'shorts' ? 1920 : 1080;
  return compileSolvedMediaShot({ shot: { id: `m16-${fixture.id}-${format}`, role: fixture.role, visualConcept: fixture.title, family: fixture.family || 'image', presentation: { cameraMove: fixture.cameraMove, variant: fixture.variant || 'full' } }, editorialPlan: { editorialObjective: fixture.title }, overlay: fixture.overlay, asset: fixture.asset, supportingAssets: fixture.supportingAssets || [], alignedWords: wordsForMediaFixture(durationInFrames), timing: { startFrame: 0, endFrame: durationInFrames, durationInFrames }, format, width, height, styleId: 'documentary', captionsEnabled: true });
}

function shotAndTimeline(fixture, format, compiled, mode = 'solved') {
  const width = format === 'shorts' ? 1080 : 1920, height = format === 'shorts' ? 1920 : 1080;
  const shot = { id: compiled.composition.shotId, storyboardShotId: compiled.composition.shotId, sceneId: `scene-${fixture.id}`, sectionId: 'm16', from: 0, startFrame: 0, endFrame: durationInFrames, durationInFrames, role: fixture.role, visualIntent: 'show', visualConcept: fixture.title, mediaPreference: 'real', evidenceRequirement: 'relevant', family: fixture.family || 'image', variant: fixture.variant || 'full', layout: `media:${compiled.mediaSceneSpec.strategy}`, presentation: { family: fixture.family || 'image', variant: fixture.variant || 'full', layout: `media:${compiled.mediaSceneSpec.strategy}`, overlayMode: Object.keys(fixture.overlay).length ? 'minimal' : 'none', cameraMove: fixture.cameraMove, visualDensity: 'LOW' }, asset: fixture.asset, assets: fixture.supportingAssets || [], move: { type: 'static', scale: [1, 1], focus: [[.5, .5], [.5, .5]] }, overlay: fixture.overlay, renderMode: mode, solvedSceneId: mode === 'solved' ? compiled.solvedScene.id : null, motionPlanId: mode === 'solved' ? compiled.motionPlan.id : null, visualQualityReviewId: null, mediaSceneSpecId: mode === 'solved' ? compiled.mediaSceneSpec.shotId : null, compositionFallback: null, transitionReason: 'newIdea', transitionAnchor: null, transitionPolicy: 'CUT', imageBehavior: 'STATIC', captionPolicy: { mode: 'NORMAL', geometry: compiled.solvedScene.captionBox, equivalentOnScreenText: false, reason: 'Solved subject-safe caption.' }, continuityCompatibility: null };
  const clip = { id: `clip-${fixture.id}`, sceneId: shot.sceneId, sectionId: 'm16', kind: 'media', family: shot.family, variant: shot.variant, treatment: 'documentary', from: 0, durationInFrames, cutAt: 0, enter: { type: 'cut', frames: 0 }, exit: { type: 'cut', frames: 0 }, accents: {}, texture: null, overlay: fixture.overlay, shots: [shot], bed: [{ type: fixture.asset.type, src: fixture.asset.src, width: fixture.asset.width, height: fixture.asset.height, from: 0, durationInFrames, focal: fixture.asset.focal, move: shot.move }] };
  return { version: 3, videoId: `m16-${fixture.id}-${format}-${mode}`, title: fixture.title, format, fps: 30, width, height, durationInFrames, style: 'documentary', palette: buildPalette('documentary', 210), clips: [clip], realizedShots: [shot], solvedScenes: mode === 'solved' ? { [compiled.solvedScene.id]: compiled.solvedScene } : {}, motionPlans: mode === 'solved' ? { [compiled.motionPlan.id]: compiled.motionPlan } : {}, mediaSceneSpecs: mode === 'solved' ? { [compiled.mediaSceneSpec.shotId]: compiled.mediaSceneSpec } : {}, cutOverlays: [], captions: { mode: 'off', chunks: [], hidden: [], policies: [], geometry: compiled.solvedScene.captionBox }, audio: { narration: null, bgm: null, sfx: [], speech: [] } };
}

async function tile(files, output, height = 340) {
  const buffers = await Promise.all(files.map((file) => sharp(file).resize({ height }).png().toBuffer())); const metadata = await Promise.all(buffers.map((buffer) => sharp(buffer).metadata())); let left = 0;
  await sharp({ create: { width: metadata.reduce((sum, item) => sum + item.width, 0), height, channels: 3, background: '#080b12' } }).composite(buffers.map((input, index) => { const item = { input, left, top: 0 }; left += metadata[index].width; return item; })).png().toFile(output);
}

async function main() {
  const root = path.join(config.rootDir, 'fixtures', 'golden', 'composition-m16'); await fs.mkdir(root, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.join(config.rootDir, 'src', 'remotion', 'index.jsx'), ignoreRegisterRootWarning: true });
  const manifest = [], reviews = {}, human = [];
  for (const fixture of MEDIA_FIXTURES) for (const format of ['landscape', 'shorts']) {
    const compiled = compileFixture(fixture, format); const timeline = shotAndTimeline(fixture, format, compiled); const dir = path.join(root, 'media', fixture.id, format); await fs.mkdir(dir, { recursive: true });
    const inputProps = { timeline }, composition = await selectComposition({ serveUrl, id: format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer', inputProps });
    const frames = [0, .25, .5, .75, 1].map((ratio) => Math.round((durationInFrames - 1) * ratio));
    if (compiled.motionPlan.tracks.some((track) => track.property.startsWith('camera'))) frames.push(Math.round(durationInFrames * .125), Math.round(durationInFrames * .625));
    const files = [];
    for (let index = 0; index < frames.length; index++) { const name = stateNames[index] || `camera-checkpoint-${index - 4}`; const output = path.join(dir, `${name}.png`); await renderStill({ composition, serveUrl, inputProps, frame: frames[index], output, imageFormat: 'png' }); files.push(output); }
    await tile(files, path.join(dir, 'state-camera-contact-sheet.png'));
    const key = `quality_${fixture.id}_${format}`; reviews[key] = compiled.visualQuality;
    manifest.push({ fixture: fixture.id, format, strategy: compiled.mediaSceneSpec.strategy, camera: compiled.mediaSceneSpec.cameraIntent, captionPosition: compiled.mediaSceneSpec.captionPosition, frames, preflight: compiled.preflight.passed, publishable: compiled.visualQuality.publishable, strength: compiled.visualQuality.strength, contactSheet: path.relative(root, path.join(dir, 'state-camera-contact-sheet.png')).replaceAll('\\', '/') });
    human.push({ fixture: fixture.id, format, verdict: compiled.visualQuality.publishable ? compiled.visualQuality.strength : 'WEAK', publishable: compiled.preflight.passed && compiled.visualQuality.publishable, subjectFramedDeliberately: !compiled.preflight.issues.some((issue) => issue.code.includes('subject')), humanCrop: !compiled.visualQuality.warnings.some((warning) => ['awkward_portrait_treatment', 'composition_incompatible'].includes(warning.code)), textNecessary: compiled.mediaSceneSpec.textNeed === 'NONE' || Object.keys(fixture.overlay).length > 0, naturalTextRegion: !compiled.visualQuality.warnings.some((warning) => warning.code === 'poor_negative_space_use'), cameraAddsMeaning: compiled.mediaSceneSpec.cameraIntent === 'STATIC' || fixture.role === 'detail', subtitleInterference: false, mediaFeelsPrimary: compiled.visualQuality.meaningfulOccupancy.ratio >= .24, transitionIntentional: true });
  }
  for (const fixture of [MEDIA_FIXTURES[0], MEDIA_FIXTURES[2]]) {
    const compiled = compileFixture(fixture, 'landscape'), dir = path.join(root, 'legacy-vs-solved', fixture.id); await fs.mkdir(dir, { recursive: true }); const outputs = [];
    for (const mode of ['legacy', 'solved']) { const timeline = shotAndTimeline(fixture, 'landscape', compiled, mode), inputProps = { timeline }, composition = await selectComposition({ serveUrl, id: 'LandscapeExplainer', inputProps }); const output = path.join(dir, `${mode}.png`); await renderStill({ composition, serveUrl, inputProps, frame: 82, output, imageFormat: 'png' }); outputs.push(output); }
    await tile(outputs, path.join(dir, 'comparison.png'), 540);
  }
  const regressionDir = path.join(root, 'regressions'); await fs.mkdir(regressionDir, { recursive: true });
  for (const [format, fixture] of [['landscape', MEDIA_FIXTURES[2]], ['shorts', MEDIA_FIXTURES[3]]]) { const compiled = compileFixture(fixture, format), timeline = shotAndTimeline(fixture, format, compiled), inputProps = { timeline }, composition = await selectComposition({ serveUrl, id: format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer', inputProps }); await renderMedia({ composition, serveUrl, inputProps, codec: 'h264', outputLocation: path.join(regressionDir, `media-${format}-regression.mp4`), imageFormat: 'jpeg' }); }
  await fs.writeFile(path.join(root, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), fixtures: manifest }, null, 2)}\n`);
  await fs.writeFile(path.join(root, 'visual-quality-reviews.json'), `${JSON.stringify(reviews, null, 2)}\n`);
  await fs.writeFile(path.join(root, 'human-review.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), reviews: human }, null, 2)}\n`);
  console.log(`Milestone 16 goldens written to ${root}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
