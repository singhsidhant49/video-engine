import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaAnalysis, normalizeMediaSceneSpec } from '../src/composition/mediaSceneSpec.js';
import { compileSolvedMediaShot } from '../src/composition/compileSolvedMediaShot.js';
import { evaluateMediaVisualQuality } from '../src/qc/mediaVisualQualityGate.js';
import { buildMediaCompositionDiagnostics } from '../src/qc/mediaCompositionDiagnostics.js';

const baseAsset = (overrides = {}) => ({ id: 'asset-a', type: 'image', src: 'media/media_1_1790351072989.jpg', width: 2400, height: 1350, focal: { x: .76, y: .45 }, tier: 'verified', cropFitness: .92, subjectBounds: { x: .62, y: .18, width: .28, height: .64 }, safeTextRegions: ['center_left', 'top_left'], evidenceStrength: .9, ...overrides });
const words = [{ word: 'This', norm: ['this'], startFrame: 0, endFrame: 8 }, { word: 'detail', norm: ['detail'], startFrame: 9, endFrame: 18 }, { word: 'matters', norm: ['matters'], startFrame: 19, endFrame: 28 }];
const compile = ({ asset = baseAsset(), supportingAssets = [], format = 'landscape', role = 'subject', overlay = {}, cameraMove = 'static', durationInFrames = 120 } = {}) => compileSolvedMediaShot({
  shot: { id: `m16-${format}-${role}`, role, visualConcept: 'A deliberate editorial media example', presentation: { cameraMove }, family: supportingAssets.length > 2 ? 'montage' : 'image' },
  editorialPlan: { editorialObjective: 'Show the subject clearly and preserve evidence.' }, overlay, asset, supportingAssets, alignedWords: words,
  timing: { startFrame: 0, endFrame: durationInFrames, durationInFrames }, format, width: format === 'shorts' ? 1080 : 1920, height: format === 'shorts' ? 1920 : 1080, styleId: 'documentary', captionsEnabled: true,
});

test('MediaSceneSpec preserves subject-right intelligence and selects media-dominant text-left composition', () => {
  const result = compile({ overlay: { headline: 'Precision manufacturing' } });
  assert.equal(result.mediaSceneSpec.strategy, 'MEDIA_DOMINANT_SPLIT');
  assert.ok(result.solvedScene.mediaGeometry.media_primary.rect.width > result.solvedScene.elements.media_headline.width);
  assert.ok(result.solvedScene.elements.media_headline.x < result.solvedScene.mediaGeometry.media_primary.rect.x);
});

test('subject-left intelligence places supporting text on the right', () => {
  const result = compile({ asset: baseAsset({ focal: { x: .22, y: .45 }, subjectBounds: { x: .08, y: .2, width: .28, height: .6 }, safeTextRegions: ['center_right'] }), overlay: { headline: 'Subject-aware layout' } });
  assert.ok(result.solvedScene.elements.media_headline.x > result.solvedScene.mediaGeometry.media_primary.rect.x + result.solvedScene.mediaGeometry.media_primary.rect.width);
});

test('centered strong subject with no text uses full bleed', () => {
  const result = compile({ asset: baseAsset({ focal: { x: .5, y: .45 }, subjectBounds: { x: .35, y: .15, width: .3, height: .65 }, safeTextRegions: [] }) });
  assert.equal(result.mediaSceneSpec.textNeed, 'NONE'); assert.equal(result.mediaSceneSpec.strategy, 'FULL_BLEED');
  assert.equal(result.solvedScene.mediaGeometry.media_primary.rect.width, 1920);
});

test('portrait image in landscape receives layered editorial treatment', () => {
  const result = compile({ asset: baseAsset({ width: 1200, height: 1800, focal: { x: .5, y: .4 }, subjectBounds: { x: .2, y: .1, width: .6, height: .72 }, cropFitness: .62 }), overlay: { headline: 'Portrait evidence' } });
  assert.equal(result.mediaSceneSpec.strategy, 'LAYERED_MEDIA'); assert.equal(result.solvedScene.topology, 'layered-media');
});

test('landscape image adapts to Shorts around its focal subject', () => {
  const result = compile({ format: 'shorts', asset: baseAsset({ width: 3840, height: 2160, focal: { x: .74, y: .44 }, cropFitness: .75 }) });
  assert.ok(result.solvedScene.mediaGeometry.media_primary.objectPosition.x > .5);
  assert.equal(result.solvedScene.formatPolicy.interactionSafeApplied, true);
});

test('safe text regions determine negative-space placement', () => {
  const result = compile({ overlay: { headline: 'Placed in negative space' } });
  assert.ok(result.solvedScene.elements.media_headline.x < result.solvedScene.mediaGeometry.media_primary.rect.x);
  assert.equal(result.visualQuality.warnings.some((w) => w.code === 'poor_negative_space_use'), false);
});

test('caption collision is solved by alternate caption geometry', () => {
  const result = compile({ asset: baseAsset({ focal: { x: .5, y: .82 }, subjectBounds: { x: .28, y: .66, width: .44, height: .3 } }) });
  assert.ok(result.solvedScene.captionBox.y < result.solvedScene.mediaGeometry.media_primary.subjectSafeRegion.y);
  assert.equal(result.preflight.issues.some((issue) => issue.code === 'subject_caption_collision'), false);
});

test('camera path is explicit, subtle, and swept during preflight', () => {
  const result = compile({ cameraMove: 'subtlePush' });
  assert.equal(result.mediaSceneSpec.cameraIntent, 'SUBTLE_PUSH');
  assert.equal(result.solvedScene.cameraPaths.media_primary.end.scale, 1.025);
  assert.ok(result.motionPlan.tracks.some((track) => track.property === 'cameraScale'));
  assert.ok(result.preflight.sweptBounds.media_primary);
});

test('video preserves focal position and native motion without synthetic camera', () => {
  const result = compile({ asset: baseAsset({ type: 'video', src: 'media/sample.mp4', motionPresent: true }), cameraMove: 'subtlePush' });
  assert.equal(result.mediaSceneSpec.cameraIntent, 'STATIC'); assert.equal(result.solvedScene.cameraPaths.media_primary.behavior, 'STATIC');
  assert.equal(result.motionPlan.tracks.some((track) => track.property.startsWith('camera')), false);
});

test('low-resolution detail crop fails swept camera resolution preflight', () => {
  const result = compile({ role: 'detail', asset: baseAsset({ width: 640, height: 480, cropFitness: .8 }) });
  assert.equal(result.preflight.passed, false); assert.ok(result.preflight.issues.some((issue) => issue.code === 'camera_resolution_insufficient'));
});

test('image plus stat preserves media as primary and stat as secondary focal', () => {
  const result = compile({ overlay: { stat: '$200M+' } });
  assert.equal(result.mediaSceneSpec.strategy, 'IMAGE_PLUS_STAT'); assert.ok(result.solvedScene.elements.media_stat);
  assert.equal(result.motionPlan.focalStates.at(-1).primaryFocalElementId, 'media_stat');
});

test('no-text selection does not invent a headline', () => {
  const result = compile(); assert.equal(result.solvedScene.elements.media_headline, undefined); assert.equal(result.mediaSceneSpec.textNeed, 'NONE');
});

test('phrase-linked annotation anchors to actual subject geometry', () => {
  const result = compile({ role: 'detail', overlay: { label: 'detail' } });
  assert.ok(result.solvedScene.annotationGeometry.media_annotation); assert.equal(result.composition.elements.find((e) => e.id === 'media_annotation').semanticBinding.phraseId != null, true);
  assert.ok(result.motionPlan.tracks.some((track) => track.targetId === 'media_annotation' && track.triggerPhraseId));
});

test('composition-incompatible Shorts crop requests alternate asset', () => {
  const spec = normalizeMediaSceneSpec({ shot: { id: 'bad', role: 'subject', visualConcept: 'Unsafe crop', presentation: { cameraMove: 'static' } }, asset: baseAsset({ width: 1200, height: 600, cropFitness: .25, focal: { x: .02, y: .5 }, subjectBounds: { x: 0, y: .2, width: .2, height: .6 } }), format: 'shorts', durationInFrames: 90 });
  assert.equal(spec.alternateAssetRequest.reason, 'composition_incompatible');
});

test('montage timing records semantic image-change reasons', () => {
  const result = compile({ supportingAssets: [baseAsset({ id: 'b', src: 'media/b.jpg' }), baseAsset({ id: 'c', src: 'media/c.jpg' })], durationInFrames: 90 });
  assert.equal(result.mediaSceneSpec.strategy, 'MONTAGE'); assert.equal(result.mediaSceneSpec.montage.cuts.length, 3);
  assert.deepEqual(result.mediaSceneSpec.montage.cuts.map((cut) => cut.startFrame), [0, 30, 60]);
  assert.equal(result.mediaSceneSpec.imageChangeReason, 'montageProgression');
});

test('two-media comparison solves both crops together', () => {
  const spec = normalizeMediaSceneSpec({ shot: { id: 'compare', role: 'comparison', visualConcept: 'Before and after', presentation: { cameraMove: 'static', variant: 'split' } }, asset: baseAsset(), supportingAssets: [baseAsset({ id: 'after', src: 'media/after.jpg', focal: { x: .28, y: .5 } })], format: 'landscape', durationInFrames: 100 });
  assert.equal(spec.strategy, 'TWO_MEDIA_COMPARE');
  const result = compile({ role: 'comparison', supportingAssets: [baseAsset({ id: 'after', src: 'media/after.jpg' })] });
  assert.equal(Object.keys(result.solvedScene.mediaGeometry).length, 2);
  assert.equal(result.solvedScene.mediaGeometry.media_primary.rect.width, result.solvedScene.mediaGeometry.media_support_1.rect.width);
});

test('unknown analysis fields remain explicitly unknown', () => {
  const analysis = normalizeMediaAnalysis({ id: 'minimal', src: 'media/minimal.jpg' }, 'landscape');
  assert.ok(analysis.unknownFields.includes('dimensions')); assert.equal(analysis.dimensions.width, null);
});

test('media quality gate rejects template-like awkward portrait treatment', () => {
  const result = compile();
  const badSpec = { ...result.mediaSceneSpec, strategy: 'FULL_BLEED', assets: [{ ...result.mediaSceneSpec.assets[0], orientation: 'portrait', cropFitness: .3 }] };
  const review = evaluateMediaVisualQuality({ solvedScene: result.solvedScene, motionPlan: result.motionPlan, mediaSceneSpec: badSpec });
  assert.equal(review.publishable, false); assert.ok(review.warnings.some((warning) => warning.code === 'awkward_portrait_treatment'));
  assert.equal(review.repairRequest.requiresRecompile, true);
});

test('media diagnostics track solved/fallback, role, layout, camera, caption and quality distributions', () => {
  const result = compile();
  const diagnostics = buildMediaCompositionDiagnostics({ shots: [{ family: 'image', renderMode: 'solved', mediaSceneSpecId: result.mediaSceneSpec.shotId, asset: baseAsset() }, { family: 'image', renderMode: 'legacy', asset: baseAsset({ id: 'bad' }) }], mediaSceneSpecs: { [result.mediaSceneSpec.shotId]: result.mediaSceneSpec }, visualQualityReviews: { one: result.visualQuality }, compositionFallbacks: [{ representation: 'media' }] });
  assert.equal(diagnostics.solvedMediaCount, 1); assert.equal(diagnostics.legacyFallbackCount, 1);
  assert.equal(diagnostics.mediaRoleDistribution.HERO, 1); assert.equal(Object.values(diagnostics.qualityVerdicts).reduce((sum, value) => sum + value, 0), 1);
});
