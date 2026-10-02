import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

import { config } from '../src/config/index.js';
import { tokenizeScript, estimateTiming } from '../src/services/alignmentService.js';
import { buildTimeline } from '../src/pipeline/timeline.js';
import { buildVisualRealizationDiagnostics } from '../src/pipeline/visualRealizationDiagnostics.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

const fps = 30;
const outRoot = path.join(config.rendersDir, 'golden', 'milestone-3');
const media = [
  'assets/s01_d.jpg',
  'media/media_1_1790351072989.jpg',
  'media/media_1_1790351187106.jpg',
].map((src, index) => ({ src, type: 'image', width: 1920, height: 1080, focal: { x: 0.42 + index * 0.08, y: 0.44 }, source: 'local_fixture', license: 'fixture' }));

const shot = (id, role, visualConcept, mediaPreference, assetIntent, extras = {}) => ({
  id, role, visualConcept, mediaPreference, assetIntent, entities: [], evidenceRequirement: 'supporting',
  motionPreference: 'stable', textOverlay: mediaPreference !== 'real', durationHint: 1, searchConcepts: [], ...extras,
});

const fixtures = [
  {
    id: 'evidence-rhythm',
    scenes: [
      { id: 'er-1', sectionId: 'er-a', narration: 'A familiar company quietly captured the entire market.', purpose: 'hook', kind: 'subject', intensity: 5, informationDensity: 2, visualIntent: 'Establish the real-world subject before the claim', storyboardShots: [shot('er-1-a', 'establishing', 'An escalating three-image industrial montage', 'real', 'entity', { entities: ['industrial company'], motionPreference: 'energetic' })] },
      { id: 'er-2', sectionId: 'er-a', narration: 'Its share reached ninety eight percent, leaving almost no room.', purpose: 'evidence', kind: 'statistic', intensity: 4, informationDensity: 4, visualIntent: 'Make the scale immediately legible', data: { value: '98%', label: 'MARKET SHARE', context: 'Category control' }, storyboardShots: [shot('er-2-a', 'graphic', 'A dominant ninety-eight-percent figure', 'procedural', 'data', { evidenceRequirement: 'required', textOverlay: true })] },
      { id: 'er-3', sectionId: 'er-b', narration: 'That advantage compounds because every competitor starts far behind.', purpose: 'reveal', kind: 'statement', intensity: 4, informationDensity: 2, visualIntent: 'Land the strategic consequence', text: { headline: 'THE LEAD COMPOUNDS', kicker: 'STRUCTURAL ADVANTAGE' }, emphasis: 'compounds', storyboardShots: [shot('er-3-a', 'payoff', 'The conclusion resolves in disciplined typography', 'procedural', 'concept', { textOverlay: true })] },
    ],
  },
  {
    id: 'explanation-flow',
    scenes: [
      { id: 'ef-1', sectionId: 'ef-a', narration: 'The system begins with one verified source document.', purpose: 'context', kind: 'document', intensity: 2, informationDensity: 3, visualIntent: 'Ground the explanation in evidence', data: { headline: 'PRIMARY SOURCE', body: 'Verified report / original filing', stamp: 'REVIEWED' }, storyboardShots: [shot('ef-1-a', 'evidence', 'A full-frame editorial document crop', 'procedural', 'document', { evidenceRequirement: 'required', textOverlay: true })] },
      { id: 'ef-2', sectionId: 'ef-a', narration: 'Evidence becomes a claim, then a decision, then an outcome.', purpose: 'explanation', kind: 'process', intensity: 3, informationDensity: 4, visualIntent: 'Explain the causal chain clearly', data: { title: 'HOW IT MOVES', steps: [{ title: 'EVIDENCE' }, { title: 'CLAIM' }, { title: 'DECISION' }, { title: 'OUTCOME' }] }, storyboardShots: [shot('ef-2-a', 'graphic', 'A four-stage causal flow', 'procedural', 'process', { textOverlay: true })] },
      { id: 'ef-3', sectionId: 'ef-b', narration: 'The sequence matters more than any isolated moment.', purpose: 'payoff', kind: 'timeline', intensity: 3, informationDensity: 3, visualIntent: 'Show sequence as the key insight', data: { title: 'SEQUENCE', events: [{ date: '01', label: 'Signal' }, { date: '02', label: 'Response' }, { date: '03', label: 'Result' }] }, storyboardShots: [shot('ef-3-a', 'graphic', 'Three moments connected across time', 'procedural', 'timeline', { textOverlay: true })] },
    ],
  },
  {
    id: 'editorial-contrast',
    scenes: [
      { id: 'ec-1', sectionId: 'ec-a', narration: 'Look closely and the surface tells only half the story.', purpose: 'hook', kind: 'atmosphere', intensity: 4, informationDensity: 1, visualIntent: 'Open with restrained photographic detail', storyboardShots: [shot('ec-1-a', 'detail', 'A quiet photographic detail with room to breathe', 'real', 'context', { motionPreference: 'stable' })] },
      { id: 'ec-2', sectionId: 'ec-a', narration: 'Three forces sit underneath: access, timing, and trust.', purpose: 'explanation', kind: 'list', intensity: 3, informationDensity: 4, visualIntent: 'Organize the hidden forces', data: { title: 'UNDER THE SURFACE', items: ['ACCESS', 'TIMING', 'TRUST'] }, storyboardShots: [shot('ec-2-a', 'graphic', 'A sparse ledger of the three forces', 'procedural', 'list', { textOverlay: true })] },
      { id: 'ec-3', sectionId: 'ec-b', narration: 'Together they turn a small edge into durable power.', purpose: 'payoff', kind: 'quote', intensity: 4, informationDensity: 2, visualIntent: 'Close with one memorable synthesis', data: { quote: 'A SMALL EDGE BECOMES DURABLE POWER', author: 'EDITORIAL SYNTHESIS' }, storyboardShots: [shot('ec-3-a', 'payoff', 'A single editorial quote resolves the argument', 'procedural', 'concept', { textOverlay: true })] },
    ],
  },
];

function makeTimeline(fixture) {
  const script = fixture.scenes.map((scene) => scene.narration).join(' ');
  const seconds = 18;
  const words = estimateTiming(tokenizeScript(script), seconds).map((word) => ({
    ...word, startFrame: Math.round(word.start * fps), endFrame: Math.round(word.end * fps),
  }));
  const plan = { title: fixture.id, style: 'editorial_explainer', hue: 218, scenes: fixture.scenes };
  const specs = fixture.scenes.map((scene) => ({
    sceneId: scene.id, variant: 'default', treatment: 'editorial', recasts: [], accents: [],
    camera: { magnitude: 0.05, baseScale: 1 },
  }));
  const assets = Object.fromEntries(fixture.scenes.map((scene, index) => [scene.id, {
    primary: ['subject', 'atmosphere'].includes(scene.kind) ? media[index % media.length] : null,
    alternates: scene.purpose === 'hook' ? media.slice(1) : [],
  }]));
  return buildTimeline({
    plan, specs, narration: { totalFrames: seconds * fps, words }, assets, sfx: {}, bgm: null,
    videoId: `golden-${fixture.id}`, format: 'landscape', fps, audioSrc: null,
  });
}

async function contactSheet(serveUrl, composition, timeline, fixtureDir) {
  const framesDir = path.join(fixtureDir, 'frames');
  await fs.mkdir(framesDir, { recursive: true });
  const files = [];
  for (const shotItem of timeline.realizedShots) {
    const frame = Math.min(timeline.durationInFrames - 1, Math.round(shotItem.startFrame + shotItem.durationInFrames / 2));
    const file = path.join(framesDir, `${shotItem.storyboardShotId}.jpg`);
    await renderStill({ composition, serveUrl, inputProps: { timeline }, frame, output: file, scale: 0.5, imageFormat: 'jpeg' });
    files.push(file);
  }
  const width = 640;
  const height = 360;
  const buffers = await Promise.all(files.map((file) => sharp(file).resize(width, height, { fit: 'cover' }).toBuffer()));
  const output = path.join(fixtureDir, 'contact-sheet.jpg');
  await sharp({ create: { width: width * buffers.length, height, channels: 3, background: '#080b12' } })
    .composite(buffers.map((input, index) => ({ input, left: index * width, top: 0 })))
    .jpeg({ quality: 92 }).toFile(output);
  return output;
}

await fs.mkdir(outRoot, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(config.rootDir, 'src/remotion/index.jsx'), publicDir: config.publicDir, ignoreRegisterRootWarning: true });
for (const fixture of fixtures) {
  const fixtureDir = path.join(outRoot, fixture.id);
  await fs.mkdir(fixtureDir, { recursive: true });
  const timeline = makeTimeline(fixture);
  const diagnostics = buildVisualRealizationDiagnostics(timeline);
  const qc = runTimelineQc(timeline, { realizationDiagnostics: diagnostics });
  if (!qc.ok) throw new Error(`${fixture.id} failed timeline QC`);
  await fs.writeFile(path.join(fixtureDir, 'timeline.json'), JSON.stringify(timeline, null, 2));
  await fs.writeFile(path.join(fixtureDir, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
  await fs.writeFile(path.join(fixtureDir, 'qc.json'), JSON.stringify(qc, null, 2));
  const composition = await selectComposition({ serveUrl, id: 'LandscapeExplainer', inputProps: { timeline } });
  await contactSheet(serveUrl, composition, timeline, fixtureDir);
  await renderMedia({
    composition, serveUrl, inputProps: { timeline }, outputLocation: path.join(fixtureDir, `${fixture.id}.mp4`),
    codec: 'h264', crf: 18, imageFormat: 'jpeg', jpegQuality: 92, colorSpace: 'bt709',
  });
  console.log(`Rendered ${fixture.id}`);
}
