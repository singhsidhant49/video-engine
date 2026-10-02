import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveShotTiming } from '../src/pipeline/shotTimingResolver.js';
import { createPresentationMemory, realizeSceneShots } from '../src/pipeline/visualRealizationDirector.js';
import { buildVisualRealizationDiagnostics } from '../src/pipeline/visualRealizationDiagnostics.js';

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
