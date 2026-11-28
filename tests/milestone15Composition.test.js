import assert from 'node:assert/strict';
import test from 'node:test';

import { compileSolvedMediaShot } from '../src/composition/compileSolvedMediaShot.js';
import { TimelineSchema } from '../src/models/index.js';
import { buildTimeline } from '../src/pipeline/timeline.js';
import { resolveVisualPolicy } from '../src/config/visualMode.js';

const asset = { id: 'evidence', type: 'image', src: 'assets/evidence.jpg', width: 2400, height: 1350, focal: { x: .5, y: .45 }, tier: 'verified' };

test('media composition solves evidence footage with typed geometry and motion', () => {
  const compiled = compileSolvedMediaShot({
    shot: { id: 'shot', role: 'evidence', visualConcept: 'primary evidence', family: 'image', presentation: { cameraMove: 'static' } },
    editorialPlan: { editorialObjective: 'Show primary evidence' }, overlay: {}, asset, alignedWords: [],
    timing: { startFrame: 0, durationInFrames: 150 }, format: 'landscape', width: 1920, height: 1080, styleId: 'documentary',
    visualPolicy: resolveVisualPolicy(),
  });
  assert.equal(compiled.preflight.passed, true);
  assert.ok(compiled.solvedScene.mediaGeometry.media_primary);
  assert.ok(compiled.motionPlan);
});

test('production timeline stores only solved media registries', () => {
  const storyboardShot = { id: 'shot', role: 'evidence', durationHint: 5, visualConcept: 'archival factory evidence', assetIntent: 'evidence', mediaPreference: 'real', searchConcepts: ['factory evidence'], entities: [], evidenceRequirement: 'required' };
  const scene = { id: 'scene', sectionId: 'section', narration: 'The archival factory evidence shows the physical process.', purpose: 'evidence', kind: 'document', intensity: 3, tone: 'neutral', treatment: 'editorial', storyboardShots: [storyboardShot] };
  const words = 'The archival factory evidence shows the physical process'.split(' ').map((text, index) => ({ text, norm: [text.toLowerCase()], startFrame: index * 15, endFrame: index * 15 + 12, endsPhrase: index === 7, endsSentence: index === 7 }));
  const timeline = buildTimeline({
    plan: { title: 'Evidence', style: 'documentary', hue: 210, scenes: [scene] },
    specs: [{ sceneId: scene.id, family: 'image', variant: 'full', treatment: 'editorial', recasts: [], accents: {}, camera: { magnitude: .04, baseScale: 1 } }],
    narration: { totalFrames: 150, words },
    assets: { [scene.id]: { primary: asset, alternates: [], byShot: { shot: asset } } },
    sfx: {}, bgm: null, videoId: 'media-only-timeline', format: 'landscape', fps: 30, audioSrc: null,
    coveragePlan: [{ shotId: 'shot', sceneId: 'scene', sectionId: 'section', primaryRepresentation: 'media', representationDecision: { selectedRepresentation: 'media' } }],
    editorialVisualPlan: [{ shotId: 'shot', sceneId: 'scene', sectionId: 'section', selectedRepresentation: 'media', communicationObjective: 'Show evidence', hierarchy: { primary: [], secondary: [], supporting: [] }, density: 'LOW', cognitiveLoad: 2, visualGrammar: 'media-editorial', assetBindings: [asset.src], textBlocks: { title: 'Evidence', steps: [], takeaway: null }, semanticEvents: [], formatHints: {}, continuityIntent: {}, coverage: {} }],
    visualPolicy: resolveVisualPolicy(),
  });
  const shot = timeline.realizedShots[0];
  assert.equal(shot.family, 'image');
  assert.equal(shot.renderMode, 'solved');
  assert.ok(timeline.solvedScenes[shot.solvedSceneId]);
  assert.ok(timeline.motionPlans[shot.motionPlanId]);
  assert.equal(shot.compositionFallback, null);
  TimelineSchema.parse(timeline);
});
