import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisualPolicy } from '../src/config/visualMode.js';
import { planAssetRequests } from '../src/pipeline/assetRequestPlanner.js';
import { createPresentationMemory, realizeSceneShots } from '../src/pipeline/visualRealizationDirector.js';
import { compileSolvedMediaShot } from '../src/composition/compileSolvedMediaShot.js';
import { createEditorialVisualBeat, createMediaShotPlan } from '../src/pipeline/mediaEditorialPlanner.js';
import { analyzeAssetRequest } from '../src/assets/assetSearchContext.js';
import { createProvider } from '../src/assets/providerAdapter.js';
import { routeAssetProviders } from '../src/assets/providerRegistry.js';
import { buildMaterializationQueue, hasReliableSearchResult, materializedMinimums } from '../src/pipeline/assetDirector.js';

const asset = { id: 'factory', type: 'image', src: 'assets/s01_d.jpg', width: 2400, height: 1350, focal: { x: .72, y: .45 }, subjectBounds: { x: .58, y: .15, width: .3, height: .7 }, cropFitness: .92, tier: 'verified', safeTextRegions: ['center_left'] };

test('production visual policy defaults to media editorial and keeps legacy explicit', () => {
  const current = resolveVisualPolicy({ visualMode: undefined });
  assert.equal(current.visualMode, 'MEDIA_EDITORIAL');
  assert.equal(current.enableProceduralGraphics, false);
  assert.equal(current.enableLegacyVisualFamilies, false);
  assert.equal(current.defaultTransition, 'CUT');
  const legacy = resolveVisualPolicy({ visualMode: 'LEGACY_PROCEDURAL' });
  assert.equal(legacy.enableProceduralGraphics, true);
});

test('media editorial converts procedural preferences into real-media requests', () => {
  const storyboard = { format: 'landscape', sections: [{ id: 's', scenes: [{ id: 'scene', shots: [{ id: 'shot', visualConcept: 'semiconductor factory floor', searchConcepts: ['chip factory'], mediaPreference: 'procedural', assetIntent: 'data', entities: [], evidenceRequirement: 'preferred', durationHint: 3 }] }] }] };
  const [request] = planAssetRequests(storyboard, { format: 'landscape', visualPolicy: resolveVisualPolicy() });
  assert.notEqual(request.preferredSource, 'procedural');
  assert.deepEqual([request.constraints.minWidth, request.constraints.minHeight], [1920, 1080]);
});

test('media editorial data requests route to real-media providers', () => {
  const storyboard = { format: 'landscape', sections: [{ id: 's', scenes: [{ id: 'scene', shots: [{ id: 'shot', visualConcept: 'fast website loading', searchConcepts: ['website loading'], mediaPreference: 'procedural', assetIntent: 'data', entities: [], evidenceRequirement: 'conceptual_allowed', durationHint: 3 }] }] }] };
  const [request] = planAssetRequests(storyboard, { format: 'landscape', visualPolicy: resolveVisualPolicy() });
  const provider = createProvider({ id: 'pexels-image', supports: () => true, search: async () => [] });
  const routed = routeAssetProviders(request, analyzeAssetRequest(request), [provider]);
  assert.deepEqual(routed.map((entry) => entry.provider.id), ['pexels-image']);
});

test('interface requests retain stock and generic media fallbacks', () => {
  const storyboard = { format: 'landscape', sections: [{ id: 's', scenes: [{ id: 'scene', shots: [{ id: 'shot', visualConcept: 'browser address bar close up', searchConcepts: ['typing on laptop keyboard'], mediaPreference: 'procedural', assetIntent: 'interface', entities: [], evidenceRequirement: 'conceptual_allowed', durationHint: 4 }] }] }] };
  const [request] = planAssetRequests(storyboard, { format: 'landscape', visualPolicy: resolveVisualPolicy() });
  const providers = ['pexels-image', 'generic-library'].map((id) => createProvider({ id, supports: () => true, search: async () => [] }));
  const context = analyzeAssetRequest(request);
  const routed = routeAssetProviders(request, context, providers, 'CONCEPTUAL_FALLBACK');
  assert.deepEqual(routed.map((entry) => entry.provider.id), ['pexels-image', 'generic-library']);
  assert.deepEqual(context.targetSubject, ['browser', 'address', 'bar']);
});

test('materialization queue includes provider fallbacks after a dominant top-ranked host', () => {
  const item = (id, providerId, qualityRank = 4) => ({ candidate: { id, providerId }, score: { qualityRank, resolutionStatus: 'excellent' } });
  const ranked = [
    item('blocked-1', 'brave-image'), item('blocked-2', 'brave-image'),
    item('blocked-3', 'brave-image'), item('blocked-4', 'brave-image'),
    item('fallback', 'pexels-image', 2),
  ];
  assert.ok(buildMaterializationQueue(ranked).some((entry) => entry.candidate.id === 'fallback'));
});

test('query ladder does not stop on Brave thumbnails alone', () => {
  const scored = [{ candidate: { providerId: 'brave-image' }, score: { qualityRank: 4, gates: [] } }];
  assert.equal(hasReliableSearchResult(scored, 3), false);
  scored.push({ candidate: { providerId: 'generic-library' }, score: { qualityRank: 3, gates: [] } });
  assert.equal(hasReliableSearchResult(scored, 3), true);
});

test('materialized resolution gate accounts for layered portrait media', () => {
  const request = { constraints: { orientation: 'landscape', minWidth: 1920, minHeight: 1080 } };
  assert.deepEqual(materializedMinimums(request, { width: 1090, height: 2600 }), { minWidth: 960, minHeight: 1080 });
  assert.deepEqual(materializedMinimums(request, { width: 1345, height: 785 }), { minWidth: 1920, minHeight: 1080 });
});

test('static fallback-quality data media can use restrained editorial upscaling', () => {
  const chart = { id: 'chart', type: 'image', src: 'assets/chart.jpg', width: 890, height: 606, focal: { x: .5, y: .45 }, tier: 'fallback' };
  const result = compileSolvedMediaShot({ shot: { id: 'chart-shot', role: 'graphic', visualConcept: 'network waterfall chart', family: 'image', presentation: { cameraMove: 'static' } }, editorialPlan: { editorialObjective: 'Show the request waterfall' }, overlay: {}, asset: chart, alignedWords: [], timing: { startFrame: 0, endFrame: 150, durationInFrames: 150 }, format: 'landscape', width: 1920, height: 1080, styleId: 'tech_editorial' });
  assert.equal(result.mediaSceneSpec.strategy, 'EDITORIAL_SPLIT');
  assert.equal(result.preflight.issues.some((issue) => issue.code === 'camera_resolution_insufficient'), false);
});

test('media editorial realization never selects a procedural family and defaults stills to static', () => {
  const scene = { id: 'scene', kind: 'process', purpose: 'evidence', intensity: 3, informationDensity: 3, visualIntent: 'Show manufacturing evidence', storyboardShots: [{ id: 'shot', role: 'graphic', visualConcept: 'factory process', mediaPreference: 'procedural', assetIntent: 'data', entities: [], evidenceRequirement: 'required' }] };
  const [shot] = realizeSceneShots({ scene, spec: { family: 'process', variant: 'flow', treatment: 'editorial', camera: { magnitude: .05, baseScale: 1 } }, sceneAssets: { primary: asset, alternates: [] }, timings: [{ startFrame: 0, endFrame: 90, durationInFrames: 90 }], sectionId: 'section', memory: createPresentationMemory(), visualPolicy: resolveVisualPolicy(), format: 'landscape' });
  assert.equal(shot.presentation.family, 'image');
  assert.equal(shot.presentation.cameraMove, 'static');
});

test('editorial beat and media shot plan persist crop, camera reason, captions and cut rationale', () => {
  const words = [{ word: 'Factory', norm: ['factory'], startFrame: 0, endFrame: 12, endsPhrase: false }, { word: 'evidence', norm: ['evidence'], startFrame: 13, endFrame: 28, endsPhrase: true }];
  const shot = { id: 'shot', storyboardShotId: 'shot', role: 'evidence', visualConcept: 'semiconductor factory evidence', evidenceRequirement: 'required', family: 'image', startFrame: 0, durationInFrames: 90, transitionReason: 'newEvidence', transitionAnchor: null, presentation: { cameraMove: 'static' } };
  const compiled = compileSolvedMediaShot({ shot, editorialPlan: { editorialObjective: 'Show evidence' }, overlay: {}, asset, alignedWords: words, timing: { startFrame: 0, endFrame: 90, durationInFrames: 90 }, format: 'landscape', width: 1920, height: 1080, styleId: 'documentary' });
  const beat = createEditorialVisualBeat({ shot, scene: { purpose: 'evidence', tone: 'serious', intensity: 3, informationDensity: 2 }, timing: { startFrame: 0, endFrame: 90, durationInFrames: 90 }, alignedWords: words, visualChangeReason: 'newEvidence' });
  const plan = createMediaShotPlan({ beat, mediaSceneSpec: compiled.mediaSceneSpec, solvedScene: compiled.solvedScene, shot, visualQuality: compiled.visualQuality });
  assert.equal(plan.cameraPlan.mode, 'STATIC');
  assert.equal(plan.cameraPlan.reason, null);
  assert.equal(plan.transitionIn.type, 'CUT');
  assert.equal(plan.visualChangeReason, 'NEW_EVIDENCE');
  assert.equal(plan.subtitlePlan.maximumLines, 2);
  assert.ok(plan.cropPlan.crop.width > 0);
});

test('native-motion video stays static while retaining focal reframe metadata', () => {
  const result = compileSolvedMediaShot({ shot: { id: 'video', role: 'context', visualConcept: 'working machinery', family: 'image', presentation: { cameraMove: 'subtlePush' } }, editorialPlan: { editorialObjective: 'Show machinery' }, overlay: {}, asset: { ...asset, id: 'video', type: 'video', src: 'media/sample.mp4', motionPresent: true }, alignedWords: [], timing: { startFrame: 0, endFrame: 90, durationInFrames: 90 }, format: 'shorts', width: 1080, height: 1920, styleId: 'documentary' });
  assert.equal(result.solvedScene.cameraPaths.media_primary.behavior, 'STATIC');
  assert.ok(result.solvedScene.mediaGeometry.media_primary.objectPosition.x > .5);
});

test('portrait media without overlay uses a layered landscape composition', () => {
  const portrait = { ...asset, id: 'portrait', src: 'assets/portrait.jpg', width: 1730, height: 2600, focal: { x: .38, y: .2 }, subjectBounds: null };
  const result = compileSolvedMediaShot({ shot: { id: 'portrait-landscape', role: 'establishing', visualConcept: 'server racks', family: 'image', presentation: { cameraMove: 'static' } }, editorialPlan: { editorialObjective: 'Show the infrastructure' }, overlay: {}, asset: portrait, alignedWords: [], timing: { startFrame: 0, endFrame: 120, durationInFrames: 120 }, format: 'landscape', width: 1920, height: 1080, styleId: 'documentary' });
  assert.equal(result.mediaSceneSpec.strategy, 'LAYERED_MEDIA');
  assert.equal(result.preflight.issues.some((issue) => issue.code === 'camera_subject_clipped'), false);
});

test('chapter heading uses full media geometry, readable measured text, and a scrim', () => {
  const result = compileSolvedMediaShot({ shot: { id: 'chapter', role: 'establishing', visualConcept: 'chapter', family: 'image', presentation: { cameraMove: 'static' } }, editorialPlan: { editorialObjective: 'Open chapter' }, overlay: { headline: 'FROM COINS TO CODE', chapter: true }, asset, alignedWords: [], timing: { startFrame: 0, endFrame: 120, durationInFrames: 120 }, format: 'landscape', width: 1920, height: 1080, styleId: 'documentary' });
  assert.equal(result.mediaSceneSpec.strategy, 'BACKGROUND_MEDIA');
  assert.equal(result.solvedScene.mediaGeometry.media_primary.treatment.scrim, 'subtle-gradient');
  assert.ok(result.solvedScene.elements.media_headline.width > 500);
  assert.equal(result.solvedScene.textLayout.media_headline.constraintUnsatisfied, false);
});

test('face bounds participate in crop and subtitle collision protection', () => {
  const faceAsset = { ...asset, focal: { x: .5, y: .72 }, subjectBounds: null, faceBounds: [{ x: .42, y: .7, width: .16, height: .18 }] };
  const result = compileSolvedMediaShot({ shot: { id: 'face', role: 'subject', visualConcept: 'speaker', family: 'image', presentation: { cameraMove: 'static' } }, editorialPlan: { editorialObjective: 'Protect the face' }, overlay: {}, asset: faceAsset, alignedWords: [], timing: { startFrame: 0, endFrame: 120, durationInFrames: 120 }, format: 'landscape', width: 1920, height: 1080, styleId: 'documentary' });
  assert.ok(result.solvedScene.mediaGeometry.media_primary.subjectSafeRegion);
  assert.equal(result.visualQuality.warnings.some((warning) => warning.code === 'subject_caption_collision'), false);
});
