import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import sharp from 'sharp';
import { config } from '../src/config/index.js';
import { buildPalette } from '../src/shared/styles.js';
import { compileSolvedMediaShot } from '../src/composition/compileSolvedMediaShot.js';
import { resolveVisualPolicy } from '../src/config/visualMode.js';

const FPS = 30;
const imageSources = [
  'media/media_1_1790351072989.jpg', 'media/media_1_1790351187106.jpg', 'media/media_1_1790351281551.jpg',
  'media/media_1_1790351319517.jpg', 'media/media_1_1790351368982.jpg', 'media/media_1_1790351494179.jpg',
  'media/media_1_1790354672591.jpg', 'media/media_1_1790401790598.jpg', 'media/media_1_1790403839572.jpg',
  'media/media_1_1790408413768.jpg', 'media/media_2_1790409605240.jpg', 'assets/s01_d.jpg',
];
const copy = [
  'Money began as something physical, scarce, and difficult to copy.',
  'Coins made value portable across cities, borders, and generations.',
  'Markets connected those stores of value to trade and investment.',
  'Banks scaled the system by recording claims instead of moving metal.',
  'Financial centers concentrated trust, information, and enormous risk.',
  'Public exchanges made prices visible and ownership easier to transfer.',
  'Modern finance still depends on institutions people recognize and trust.',
  'But the records themselves have moved from paper into software.',
  'Specialized chips now execute and verify transactions at global speed.',
  'Digital markets operate continuously across countries and time zones.',
  'The object changed from coin to code, while trust remained essential.',
  'That is how physical money became an always-on digital system.',
];

function words(text, startFrame, duration) {
  const tokens = text.split(/\s+/); const unit = Math.floor(duration / tokens.length);
  return tokens.map((token, index) => ({ text: token, word: token, norm: [token.toLowerCase().replace(/[^a-z0-9]/g, '')], startFrame: startFrame + index * unit, endFrame: Math.min(startFrame + duration - 1, startFrame + (index + 1) * unit - 2), endsPhrase: index === tokens.length - 1, endsSentence: index === tokens.length - 1 }));
}

function asset(index, useVideo = false) {
  return { id: `benchmark_asset_${index}`, type: useVideo ? 'video' : 'image', src: useVideo ? 'media/m16_native_motion.mp4' : imageSources[index % imageSources.length], width: 3840, height: index === 1 ? 2422 : 2160,
    focal: { x: index % 3 === 0 ? .68 : index % 3 === 1 ? .36 : .5, y: .44 }, subjectBounds: { x: index % 3 === 0 ? .55 : index % 3 === 1 ? .16 : .35, y: .16, width: .3, height: .62 },
    safeTextRegions: index % 3 === 0 ? ['center_left'] : ['center_right'], tier: 'verified', cropFitness: .88, evidenceStrength: .82, motionPresent: useVideo ? true : null };
}

function buildTimeline(format) {
  const width = format === 'shorts' ? 1080 : 1920, height = format === 'shorts' ? 1920 : 1080;
  const count = format === 'shorts' ? 9 : 12, duration = format === 'shorts' ? 120 : 150;
  const solvedScenes = {}, motionPlans = {}, mediaSceneSpecs = {}, clips = [], realizedShots = [], chunks = [], policies = [];
  for (let index = 0; index < count; index++) {
    const start = index * duration, text = copy[index], alignedWords = words(text, start, duration);
    const overlay = index === 0 ? { headline: format === 'shorts' ? 'FROM COINS TO CODE' : 'HOW MONEY BECAME DIGITAL', chapter: true }
      : index === 7 ? { stat: '24/7', label: 'digital markets' }
        : index === 4 ? { label: 'Trust concentrates here' } : {};
    const shot = { id: `benchmark_${format}_${index}`, role: index === 4 ? 'detail' : index === 0 ? 'establishing' : 'context', visualConcept: text, family: 'image', presentation: { cameraMove: index === 4 ? 'detailCrop' : index === 9 ? 'subtlePush' : 'static' } };
    const compiled = compileSolvedMediaShot({ shot, editorialPlan: { editorialObjective: text }, overlay, asset: asset(index, index === 2), alignedWords, timing: { startFrame: start, endFrame: start + duration, durationInFrames: duration }, format, width, height, styleId: 'documentary' });
    solvedScenes[compiled.solvedScene.id] = compiled.solvedScene; motionPlans[compiled.motionPlan.id] = compiled.motionPlan; mediaSceneSpecs[compiled.mediaSceneSpec.shotId] = compiled.mediaSceneSpec;
    const timelineShot = { id: shot.id, storyboardShotId: shot.id, sceneId: `scene_${index}`, sectionId: index < 4 ? 'hook' : index < 9 ? 'explanation' : 'conclusion', from: 0, startFrame: start, endFrame: start + duration, durationInFrames: duration, role: shot.role, family: 'image', variant: 'full', layout: `media:${compiled.mediaSceneSpec.strategy}`, presentation: { family: 'image', variant: 'full', layout: `media:${compiled.mediaSceneSpec.strategy}`, overlayMode: Object.keys(overlay).length ? 'minimal' : 'none', cameraMove: shot.presentation.cameraMove, visualDensity: 'LOW' }, asset: asset(index, index === 2), assets: [], overlay, renderMode: 'solved', solvedSceneId: compiled.solvedScene.id, motionPlanId: compiled.motionPlan.id, mediaSceneSpecId: compiled.mediaSceneSpec.shotId, imageBehavior: compiled.mediaSceneSpec.cameraIntent, captionPolicy: { mode: 'NORMAL', geometry: compiled.solvedScene.captionBox, equivalentOnScreenText: false, reason: 'Solved subject-safe subtitle geometry.' } };
    realizedShots.push(timelineShot);
    clips.push({ id: `clip_${index}`, sceneId: timelineShot.sceneId, family: 'image', from: start, durationInFrames: duration, enter: { type: 'cut', frames: 0 }, exit: { type: 'cut', frames: 0 }, accents: {}, shots: [timelineShot] });
    const wordsPerChunk = format === 'shorts' ? 5 : 8;
    for (let offset = 0; offset < alignedWords.length; offset += wordsPerChunk) {
      const group = alignedWords.slice(offset, offset + wordsPerChunk);
      chunks.push({ startFrame: group[0].startFrame, endFrame: offset + wordsPerChunk >= alignedWords.length ? start + duration : group.at(-1).endFrame + 1, text: group.map((item) => item.text).join(' '), words: group });
    }
    policies.push({ shotId: shot.id, startFrame: start, endFrame: start + duration, ...timelineShot.captionPolicy });
  }
  return { version: 3, videoId: `media-editorial-${format}-benchmark`, title: 'How Money Moved From Coins to Code', format, fps: FPS, width, height, durationInFrames: count * duration,
    visualMode: 'MEDIA_EDITORIAL', visualPolicy: resolveVisualPolicy(), style: 'documentary', palette: buildPalette('documentary', 210), clips, realizedShots, solvedScenes, motionPlans, mediaSceneSpecs,
    cutOverlays: [], captions: { mode: 'phrase', chunks, hidden: [], policies, geometry: policies[0].geometry }, audio: { narration: null, bgm: { src: 'audio/bgm/cinematic_ambient_technology_ui.wav', base: .1, ducked: .1 }, duckingEnvelope: [], sfx: [], speech: [] } };
}

async function contactSheet(files, output, format) {
  const thumbWidth = format === 'shorts' ? 180 : 320, thumbHeight = 180;
  const buffers = await Promise.all(files.map((file) => sharp(file).resize({ width: thumbWidth, height: thumbHeight, fit: 'contain', background: '#05070a' }).png().toBuffer()));
  const columns = format === 'shorts' ? 5 : 4, rows = Math.ceil(buffers.length / columns);
  await sharp({ create: { width: columns * thumbWidth, height: rows * thumbHeight, channels: 3, background: '#05070a' } }).composite(buffers.map((input, index) => ({ input, left: (index % columns) * thumbWidth, top: Math.floor(index / columns) * thumbHeight }))).png().toFile(output);
}

async function main() {
  const root = path.join(config.rendersDir, 'media-editorial-benchmarks'); await fs.mkdir(root, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.join(config.rootDir, 'src/remotion/index.jsx'), publicDir: config.publicDir, ignoreRegisterRootWarning: true });
  const manifest = { generatedAt: new Date().toISOString(), outputs: [] };
  for (const format of ['landscape', 'shorts']) {
    const timeline = buildTimeline(format), inputProps = { timeline }, composition = await selectComposition({ serveUrl, id: format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer', inputProps });
    const video = path.join(root, `${format}.mp4`), renderStartedAt = Date.now();
    const videoExists = await fs.access(video).then(() => true).catch(() => false);
    if (!videoExists || process.argv.includes('--force')) await renderMedia({ composition, serveUrl, inputProps, codec: 'h264', crf: 20, imageFormat: 'jpeg', outputLocation: video });
    const frameDir = path.join(root, `${format}-frames`); await fs.mkdir(frameDir, { recursive: true }); const frames = [];
    for (const shot of timeline.realizedShots) { const frame = shot.startFrame + Math.floor(shot.durationInFrames / 2); const output = path.join(frameDir, `mid-${String(frame).padStart(5, '0')}.png`); await renderStill({ composition, serveUrl, inputProps, frame, output, imageFormat: 'png' }); frames.push(output); }
    const sheet = path.join(root, `${format}-contact-sheet.png`); await contactSheet(frames, sheet, format);
    const stat = await fs.stat(video); manifest.outputs.push({ format, video: path.relative(root, video).replaceAll('\\', '/'), contactSheet: path.relative(root, sheet).replaceAll('\\', '/'), durationSeconds: timeline.durationInFrames / FPS, shotCount: timeline.realizedShots.length, bytes: stat.size, renderMs: videoExists && !process.argv.includes('--force') ? null : Date.now() - renderStartedAt, sampleFrames: frames.map((file) => path.basename(file)) });
  }
  await fs.writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Media-editorial benchmarks written to ${root}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
