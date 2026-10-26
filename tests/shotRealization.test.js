import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveShotTiming } from '../src/pipeline/shotTimingResolver.js';
import { createPresentationMemory, realizeSceneShots } from '../src/pipeline/visualRealizationDirector.js';
import { chooseTransitions, directSolvedShotTransitions } from '../src/pipeline/timeline.js';
import { resolveVisualPolicy } from '../src/config/visualMode.js';
import { buildVisualRealizationDiagnostics } from '../src/pipeline/visualRealizationDiagnostics.js';
import { authorShots, isAbstractEventEntity } from '../src/storyboard/shotPlanner.js';

test('shot timing preserves authored order with aligned, gap-free coverage', () => {
  const shots = [
    { id: 'a', durationHint: 2 },
    { id: 'b', durationHint: 3 },
    { id: 'c', durationHint: 2 },
  ];
  const alignedWords = Array.from({ length: 12 }, (_, index) => ({
    startFrame: 100 + index * 18,
    endFrame: 114 + index * 18,
    endsPhrase: index === 3 || index === 7,
    endsSentence: index === 7,
  }));
  const result = resolveShotTiming({
    scene: { id: 'scene', energy: 3 }, shots, alignedWords, sceneStart: 100, sceneEnd: 310, fps: 30,
  });
  assert.deepEqual(result.map((item) => item.storyboardShotId), ['a', 'b', 'c']);
  assert.equal(result[0].startFrame, 100);
  assert.equal(result.at(-1).endFrame, 310);
  result.slice(1).forEach((item, index) => assert.equal(item.startFrame, result[index].endFrame));
  assert.equal(result.reduce((sum, item) => sum + item.durationInFrames, 0), 210);
});

test('shot realization selects families per authored shot and records presentation memory', () => {
  const scene = {
    id: 'scene', kind: 'statistic', purpose: 'evidence', intensity: 4, informationDensity: 4,
    visualIntent: 'Prove a market share claim', data: { value: '98%', label: 'market share' },
    storyboardShots: [
      { id: 'real', role: 'subject', visualConcept: 'Nvidia headquarters', mediaPreference: 'real', assetIntent: 'entity', entities: ['Nvidia'], evidenceRequirement: 'supporting', motionPreference: 'stable', textOverlay: false },
      { id: 'data', role: 'graphic', visualConcept: '98 percent market share', mediaPreference: 'procedural', assetIntent: 'data', entities: [], evidenceRequirement: 'required', motionPreference: 'stable', textOverlay: true },
    ],
  };
  const timings = [
    { startFrame: 0, endFrame: 90, durationInFrames: 90, from: 0 },
    { startFrame: 90, endFrame: 180, durationInFrames: 90, from: 90 },
  ];
  const memory = createPresentationMemory();
  const result = realizeSceneShots({
    scene,
    spec: { variant: 'hero', treatment: 'editorial', camera: { magnitude: 0.05, baseScale: 1 } },
    sceneAssets: { primary: { src: 'hq.jpg', type: 'image', width: 1600, height: 900, focal: { x: 0.5, y: 0.4 } }, alternates: [] },
    timings,
    sectionId: 'section-1',
    memory,
  });
  assert.deepEqual(result.map((shot) => shot.presentation.family), ['image', 'stat']);
  assert.deepEqual(result.map((shot) => shot.storyboardShotId), ['real', 'data']);
  assert.deepEqual(memory.recentFamilies, ['image', 'stat']);
  assert.ok(result.every((shot) => shot.presentation.cameraMove));
});

test('visual realization diagnostics report exact adjacent repetition and runs', () => {
  const make = (id, family, variant, move, src = null) => ({
    id, storyboardShotId: id, family, variant, layout: `${family}:${variant}`, durationInFrames: 60,
    presentation: { cameraMove: move, visualDensity: family === 'image' ? 'LOW' : 'HIGH' },
    asset: src ? { src } : null,
  });
  const timeline = {
    fps: 30,
    realizedShots: [
      make('1', 'image', 'full', 'push', 'a.jpg'),
      make('2', 'image', 'full', 'static', 'a.jpg'),
      make('3', 'stat', 'hero', 'static'),
      make('4', 'stat', 'hero', 'static'),
    ],
    clips: [],
  };
  const diagnostics = buildVisualRealizationDiagnostics(timeline);
  assert.equal(diagnostics.shotCount, 4);
  assert.equal(diagnostics.familyRepetitionRate, 0.667);
  assert.equal(diagnostics.consecutiveStructuredCount, 2);
  assert.equal(diagnostics.consecutivePhotoCount, 2);
  assert.equal(diagnostics.assetReuseRate, 0.5);
});

test('moving footage keeps native motion without synthetic camera scaling', () => {
  const scene = {
    id: 'video-scene', kind: 'subject', purpose: 'context', intensity: 3, informationDensity: 2, visualIntent: 'show action',
    storyboardShots: [{ id: 'video-shot', role: 'subject', visualConcept: 'person working', mediaPreference: 'real', assetIntent: 'action', entities: [], evidenceRequirement: 'preferred' }],
  };
  const result = realizeSceneShots({
    scene, spec: { family: 'image', variant: 'full', treatment: 'cinematic', camera: { magnitude: 0.05, baseScale: 1 } },
    sceneAssets: { primary: { src: 'action.mp4', type: 'video', width: 1920, height: 1080, focal: { x: 0.5, y: 0.5 } }, alternates: [] },
    timings: [{ startFrame: 0, endFrame: 90, durationInFrames: 90, from: 0 }], sectionId: 'section-1', memory: createPresentationMemory(),
  });
  assert.equal(result[0].presentation.cameraMove, 'static');
  assert.equal(result[0].move.type, 'static');
  assert.deepEqual(result[0].move.scale, [1, 1]);
});

test('historical economic conditions route to archival subjects instead of literal entity locks', () => {
  assert.equal(isAbstractEventEntity('1970s inflation'), true);
  const scene = {
    id: 'scene_008', narration: 'In the 1970s, inflation sharply reduced purchasing power.',
    purpose: 'evidence', visualIntent: 'identify', durationHint: 6, preferredPresentation: 'subject',
    evidenceRequirement: 'required', entities: ['1970s inflation'], energy: 3,
    sourceScenes: [{
      narration: 'In the 1970s, inflation sharply reduced purchasing power.',
      imageQueries: ['1970s gas station line', 'vintage supermarket 1970s'],
      entity: { name: '1970s inflation', wikipedia: '1970s energy crisis' },
    }],
  };
  const [shot] = authorShots(scene, { useMediaEditorial: true, format: 'landscape', pacing: { minimumShotSeconds: 4.8, maximumStillSeconds: 8 } }, 'How inflation changes money');
  assert.equal(shot.assetIntent, 'historical');
  assert.deepEqual(shot.entities, []);
  assert.equal(shot.visualConcept, '1970s energy crisis');
  assert.ok(shot.searchConcepts.includes('1970s gas station line'));
});

test('an entity absent from narration does not force an unnecessary portrait lock', () => {
  const scene = {
    id: 'scene_007', narration: 'They improved one percent at a time, turning marginal gains into lasting advantage.',
    durationHint: 6.5, visualIntent: 'identify', preferredPresentation: 'subject', evidenceRequirement: 'preferred',
    entities: ['Dave Brailsford'], energy: 3, purpose: 'reveal', sourceScenes: [{
      narration: 'They improved one percent at a time, turning marginal gains into lasting advantage.',
      entity: { name: 'Dave Brailsford', wikipedia: 'Dave Brailsford' },
      imageQueries: ['cycling coach clipboard training', 'coach explaining strategy athletes'],
      visual: 'A cycling coach points at a training clipboard.',
    }],
  };
  const [shot] = authorShots(scene, { useMediaEditorial: true, format: 'landscape', pacing: { minimumShotSeconds: 3.4, maximumStillSeconds: 6 } }, 'Why consistency matters');
  assert.equal(shot.assetIntent, 'concept');
  assert.deepEqual(shot.entities, []);
  assert.equal(shot.visualConcept, 'cycling coach clipboard training');
});

test('media storyboard defers camera direction until inspected asset geometry is available', () => {
  const base = {
    narration: 'A single complete visual thought.', purpose: 'context', visualIntent: 'identify',
    durationHint: 6, preferredPresentation: 'subject', evidenceRequirement: 'preferred',
    entities: [], energy: 3, sourceScenes: [{ narration: 'A single complete visual thought.', imageQueries: ['quiet room'] }],
  };
  const strategy = { useMediaEditorial: true, format: 'landscape', pacing: { minimumShotSeconds: 4.8, maximumStillSeconds: 8 } };
  assert.equal(authorShots({ ...base, id: 'scene_001' }, strategy, 'Silence')[0].presentation.cameraMove, 'auto');
  assert.equal(authorShots({ ...base, id: 'scene_002' }, strategy, 'Silence')[0].presentation.cameraMove, 'auto');
});

test('cinematic motion selection uses horizontal pans and intentional holds', () => {
  const visualPolicy = resolveVisualPolicy();
  const spec = { family: 'image', variant: 'full', treatment: 'cinematic', camera: { magnitude: .05, baseScale: 1 } };
  const timing = [{ startFrame: 0, endFrame: 180, durationInFrames: 180, from: 0 }];
  const makeScene = (id, role = 'context') => ({
    id, kind: 'subject', purpose: 'context', tone: 'neutral', intensity: 2, informationDensity: 2, visualIntent: 'establish',
    storyboardShots: [{ id: `${id}_shot`, role, visualConcept: 'A real environment', mediaPreference: 'auto', assetIntent: 'concept', entities: [], evidenceRequirement: 'conceptual_allowed', presentation: { cameraMove: 'auto' } }],
  });
  const wide = realizeSceneShots({
    scene: makeScene('wide'), spec,
    sceneAssets: { primary: { src: 'wide.jpg', type: 'image', width: 2400, height: 1000, focal: { x: .72, y: .5 } }, alternates: [] },
    timings: timing, sectionId: 'section', memory: createPresentationMemory(), visualPolicy, format: 'landscape', fps: 30,
  })[0];
  assert.equal(wide.presentation.cameraMove, 'panRight');
  assert.deepEqual(wide.move.scale, [1.04, 1.04]);
  assert.deepEqual(wide.move.focus[1], [.72, .5]);

  const vertical = realizeSceneShots({
    scene: makeScene('vertical', 'subject'), spec,
    sceneAssets: { primary: { src: 'tower.jpg', type: 'image', width: 800, height: 1600, focal: { x: .5, y: .3 } }, alternates: [] },
    timings: timing, sectionId: 'section', memory: createPresentationMemory(), visualPolicy, format: 'landscape', fps: 30,
  })[0];
  assert.equal(vertical.presentation.cameraMove, 'static');

  const video = realizeSceneShots({
    scene: makeScene('video'), spec,
    sceneAssets: { primary: { src: 'native.mp4', type: 'video', width: 1920, height: 1080, focal: { x: .5, y: .5 } }, alternates: [] },
    timings: timing, sectionId: 'section', memory: createPresentationMemory(), visualPolicy, format: 'landscape', fps: 30,
  })[0];
  assert.equal(video.presentation.cameraMove, 'static');
});

test('cinematic transitions use only clean cuts and cross dissolves', () => {
  const shot = (visualConcept) => [{ visualConcept }];
  const base = { id: 's1', purpose: 'hook', tone: 'urgent', intensity: 3, storyboardShots: shot('phone message') };
  const select = (candidate, extra = []) => {
    const scenes = [base, candidate, ...extra];
    return chooseTransitions(
      { scenes }, scenes.map(() => ({ family: 'image' })), { transitions: { perMinute: 3 } },
      30, 3600, resolveVisualPolicy(), { pacing: { mode: 'cinematic' } },
    );
  };
  assert.equal(select({ id: 's2', purpose: 'context', tone: 'reflective', intensity: 2, continuity: 'continue', storyboardShots: shot('ocean cable') })[1], 'dissolve');
  assert.equal(select({ id: 's2', purpose: 'transition', tone: 'neutral', intensity: 2, section: true, storyboardShots: shot('landing station') })[1], 'dissolve');
  assert.equal(select({ id: 's2', purpose: 'reveal', tone: 'tense', intensity: 5, storyboardShots: shot('damaged cable') })[1], 'cut');
  assert.equal(select({ id: 's2', purpose: 'context', tone: 'reflective', intensity: 2, storyboardShots: shot('repair ship') })[1], 'cut');

  const repeated = select(
    { id: 's2', purpose: 'transition', tone: 'neutral', intensity: 2, section: true, storyboardShots: shot('new coast') },
    [{ id: 's3', purpose: 'transition', tone: 'neutral', intensity: 2, section: true, storyboardShots: shot('data center') }],
  );
  assert.deepEqual(repeated, ['cut', 'dissolve', 'cut']);

  const mostlyCuts = select(
    { id: 's2', purpose: 'transition', tone: 'neutral', intensity: 2, section: true, storyboardShots: shot('chapter') },
    Array.from({ length: 8 }, (_, index) => ({ id: `normal_${index}`, purpose: 'context', tone: 'neutral', intensity: 2, storyboardShots: shot(`normal ${index}`) })),
  );
  assert.equal(mostlyCuts[1], 'dissolve');
  assert.ok(mostlyCuts.filter((type) => type === 'cut').length >= 8);
  assert.ok(mostlyCuts.every((type) => ['cut', 'dissolve'].includes(type)));

  const balanced = chooseTransitions(
    { scenes: [base, { id: 'balanced', purpose: 'context', tone: 'neutral', intensity: 2, storyboardShots: shot('server room') }] },
    [{ family: 'image' }, { family: 'image' }], { transitions: { perMinute: 2 } },
    30, 1800, resolveVisualPolicy(), { pacing: { mode: 'balanced' } },
  );
  assert.deepEqual(balanced, ['cut', 'cut']);
});

test('post-solve transition directing covers internal shot boundaries without changing timing', () => {
  const makeShot = (id, role, concept, focalX) => ({
    id, storyboardShotId: id, sceneId: 'calm', role, visualConcept: concept,
    startFrame: Number(id.slice(-1)) * 150, from: Number(id.slice(-1)) * 150,
    durationInFrames: 150, transitionPolicy: 'CUT', transitionReason: 'newIdea', transitionAnchor: null,
    presentation: { cameraMove: 'static' }, asset: { type: 'image', src: `${id}.jpg`, focal: { x: focalX, y: .5 } },
    enter: { type: 'cut', frames: 0 }, exit: { type: 'cut', frames: 0 },
  });
  const shots = [
    makeShot('shot0', 'establishing', 'quiet coast', .3),
    makeShot('shot1', 'subject', 'distant lighthouse', .7),
    makeShot('shot2', 'context', 'evening water', .4),
    makeShot('shot3', 'subject', 'harbour lights', .6),
    makeShot('shot4', 'context', 'night horizon', .5),
  ];
  const originalTiming = shots.map((shot) => [shot.from, shot.durationInFrames]);
  const clips = [{ id: 'c01', transitionPolicy: 'CUT', enter: { type: 'cut', frames: 0 }, shots }];
  directSolvedShotTransitions({ clips, scenes: [{ id: 'calm', tone: 'reflective' }], fps: 30 });

  assert.equal(shots.filter((shot) => shot.enter.type === 'dissolve').length, 1);
  assert.ok(shots.slice(1).every((shot) => ['cut', 'dissolve'].includes(shot.enter.type)));
  assert.ok(shots.slice(1).every((shot) => shot.enter && shot.transitionPolicy));
  assert.deepEqual(shots.map((shot) => [shot.from, shot.durationInFrames]), originalTiming);
});

test('post-solve directing keeps compatible motion boundaries as clean cuts', () => {
  const first = { id: 'a', storyboardShotId: 'a', sceneId: 's', role: 'context', visualConcept: 'same turbine', durationInFrames: 150, presentation: { cameraMove: 'panRight' }, asset: { type: 'image', src: 'a.jpg', focal: { x: .55, y: .5 } }, enter: { type: 'cut', frames: 0 }, exit: { type: 'cut', frames: 0 }, transitionPolicy: 'CUT', transitionReason: 'newIdea', transitionAnchor: null };
  const second = { ...first, id: 'b', storyboardShotId: 'b', asset: { type: 'image', src: 'b.jpg', focal: { x: .58, y: .5 } } };
  const clips = [{ id: 'c01', transitionPolicy: 'CUT', enter: { type: 'cut', frames: 0 }, shots: [first, second] }];
  directSolvedShotTransitions({ clips, scenes: [{ id: 's', tone: 'neutral' }], fps: 30 });
  assert.equal(second.transitionPolicy, 'CUT');
  assert.equal(second.transitionAnchor, null);
  assert.deepEqual(second.enter, { type: 'cut', frames: 0 });
});
