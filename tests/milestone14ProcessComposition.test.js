import assert from 'node:assert/strict';
import test from 'node:test';

import { StoryboardSchema, VisualCoveragePlanSchema, SolvedSceneSchema, MotionPlanSchema, TimelineSchema } from '../src/models/index.js';
import { createDefaultVisualStrategy } from '../src/models/visualStrategy.schema.js';
import { buildVisualCoveragePlan } from '../src/storyboard/visualCoveragePlan.js';
import { compileSolvedProcessShot } from '../src/composition/compileSolvedProcessShot.js';
import { PROCESS_FIXTURES, editorialPlanForProcessFixture } from '../src/composition/processFixtures.js';
import { preflightSolvedScene } from '../src/qc/frameStatePreflight.js';
import { buildTimeline } from '../src/pipeline/timeline.js';
import { buildEditContinuityDiagnostics } from '../src/qc/editContinuityDiagnostics.js';

function compile(fixture, format = 'landscape', dimensions = null) {
  const vertical = format === 'shorts';
  return compileSolvedProcessShot({
    editorialPlan: editorialPlanForProcessFixture(fixture), overlay: { steps: fixture.steps }, alignedWords: fixture.alignedWords,
    timing: { startFrame: 0, durationInFrames: fixture.durationInFrames }, format,
    width: dimensions?.width || (vertical ? 1080 : 1920), height: dimensions?.height || (vertical ? 1920 : 1080), styleId: 'documentary',
  });
}

test('canonical Storyboard V2 coverage contains exactly one validated item per shot', () => {
  const shot = (id, concept) => ({ id, role: 'graphic', durationHint: 3, visualConcept: concept, assetIntent: 'concept', mediaPreference: 'procedural', searchConcepts: [], entities: [], evidenceRequirement: 'conceptual_allowed' });
  const scene = (id, shots) => ({ id, sourceSceneIds: [id], narration: 'First the system reads input, then it acts.', scriptRange: { startWord: 0, endWord: 8 }, durationHint: 6, purpose: 'explanation', visualIntent: 'explain', importance: 3, energy: 3, informationDensity: 3, evidenceRequirement: 'conceptual_allowed', entities: [], shots });
  const storyboard = StoryboardSchema.parse({ version: 2, videoId: 'coverage-v2', title: 'Coverage', topic: 'Coverage', format: 'landscape', visualStrategy: createDefaultVisualStrategy(), sections: [
    { id: 'section_1', purpose: 'explain', energy: 3, scenes: [scene('scene_1', [shot('shot_1', 'read'), shot('shot_2', 'act')])] },
    { id: 'section_2', purpose: 'finish', energy: 2, scenes: [scene('scene_2', [shot('shot_3', 'observe')])] },
  ] });
  const coverage = buildVisualCoveragePlan(storyboard);
  assert.equal(coverage.length, 3);
  assert.deepEqual(coverage.map((item) => item.shotId), ['shot_1', 'shot_2', 'shot_3']);
  assert.deepEqual(coverage.map((item) => item.sectionId), ['section_1', 'section_1', 'section_2']);
  assert.deepEqual(VisualCoveragePlanSchema.parse(coverage), coverage);
});

for (const fixture of PROCESS_FIXTURES) for (const format of ['landscape', 'shorts']) {
  test(`${fixture.id} solves and preflights in ${format}`, () => {
    const result = compile(fixture, format);
    SolvedSceneSchema.parse(result.solvedScene);
    MotionPlanSchema.parse(result.motionPlan);
    assert.equal(result.preflight.passed, true, JSON.stringify(result.preflight.hardFailures));
    assert.equal(result.solvedScene.topology, format === 'shorts' ? 'vertical' : 'horizontal');
    assert.ok(Object.values(result.solvedScene.textLayout).every((layout) => layout.lineBreaks.length > 0 && layout.metricsSource.startsWith('truetype:')));
  });
}

test('phrase timing activates every AI process stage inside its expected phrase range', () => {
  const fixture = PROCESS_FIXTURES[0];
  const { motionPlan, composition } = compile(fixture);
  const activationTracks = motionPlan.tracks.filter((track) => track.property === 'emphasis' && track.to === 1);
  assert.equal(activationTracks.length, fixture.steps.length);
  activationTracks.forEach((track, index) => {
    const [min, max] = fixture.expectedActivationRanges[index];
    assert.ok(track.startFrame >= min && track.startFrame <= max, `${track.targetId} activated at ${track.startFrame}, expected ${min}-${max}`);
    assert.equal(track.triggerPhraseId, composition.semanticEvents[index].phraseId);
  });
});

test('many stages are grouped instead of shrinking below the complexity limit', () => {
  const source = PROCESS_FIXTURES[0];
  const fixture = { ...source, id: 'many', steps: Array.from({ length: 9 }, (_, index) => ({ title: `STAGE ${index + 1}` })) };
  const result = compile(fixture, 'shorts');
  assert.equal(result.composition.readingOrder.length, 4);
  assert.ok(Object.values(result.composition.elements).some((element) => String(element.content).includes('MORE STAGES')));
});

test('preflight detects text clipping, viewport escape, caption collision, and connector obstruction', () => {
  const compiled = compile(PROCESS_FIXTURES[0], 'shorts');
  const solved = structuredClone(compiled.solvedScene);
  const firstGroupId = compiled.composition.readingOrder[0];
  const secondGroupId = compiled.composition.readingOrder[1];
  solved.elements[`${firstGroupId}_label`].width = 1;
  solved.elements[firstGroupId].x = -5;
  solved.elements[secondGroupId].y = solved.regions.captions.y;
  const route = solved.connectorRoutes[0];
  const obstructed = solved.elements[compiled.composition.readingOrder[2]];
  route.points = [{ x: obstructed.x - 10, y: obstructed.y + obstructed.height / 2 }, { x: obstructed.x + obstructed.width + 10, y: obstructed.y + obstructed.height / 2 }];
  const result = preflightSolvedScene({ solvedScene: solved, motionPlan: compiled.motionPlan, composition: compiled.composition });
  const codes = new Set(result.hardFailures.map((issue) => issue.code));
  assert.ok(codes.has('text_overflow'));
  assert.ok(codes.has('element_outside_viewport'));
  assert.ok(codes.has('caption_collision'));
  assert.ok(codes.has('connector_element_intersection'));
});

test('tiny vertical viewport fails explicitly before rendering', () => {
  const result = compile(PROCESS_FIXTURES[0], 'shorts', { width: 280, height: 420 });
  assert.equal(result.preflight.passed, false);
  assert.ok(result.preflight.hardFailures.some((issue) => ['text_overflow', 'minimum_font_size', 'caption_collision'].includes(issue.code)));
});

test('timeline references typed solved registries and coverage overrides a legacy family', () => {
  const fixture = PROCESS_FIXTURES[0];
  const narrationText = fixture.alignedWords.map((word) => word.text).join(' ');
  const authoredShot = { id: 'shot_ai-agent', role: 'graphic', durationHint: 5, visualConcept: 'AI agent process', assetIntent: 'concept', mediaPreference: 'procedural', searchConcepts: [], entities: [], evidenceRequirement: 'conceptual_allowed' };
  const scene = { id: 'scene_ai', sectionId: 'section_1', narration: narrationText, purpose: 'explanation', kind: 'process', visualIntent: 'explain', data: { steps: fixture.steps }, intensity: 3, tone: 'neutral', treatment: 'graphic', continuity: 'new', storyboardShots: [authoredShot] };
  const coverage = VisualCoveragePlanSchema.parse([{ shotId: authoredShot.id, sceneId: scene.id, sectionId: scene.sectionId, informationType: 'process', primaryRepresentation: 'process', fallbackRepresentations: ['diagram'], semanticPayload: { communicationObjective: 'explain', visualConcept: 'AI agent process', entities: [], role: 'graphic' }, evidenceRequirements: { level: 'conceptual_allowed', authenticSourceRequired: false }, mediaConstraints: { preference: 'procedural', orientation: 'landscape', focalPointHint: null, motionPreference: null }, rationale: 'Process information requires a directed flow.', confidence: 0.95, coverageStatus: 'UNRESOLVED' }]);
  const timeline = buildTimeline({
    plan: { title: 'AI agent', style: 'technical', hue: 215, scenes: [scene] },
    specs: [{ sceneId: scene.id, family: 'image', variant: 'full', treatment: 'technical', recasts: [], accents: {} }],
    narration: { totalFrames: fixture.durationInFrames, words: fixture.alignedWords }, assets: { [scene.id]: { primary: null, alternates: [] } },
    sfx: {}, bgm: null, videoId: 'timeline-solved', format: 'landscape', fps: 30, audioSrc: null,
    coveragePlan: coverage, editorialVisualPlan: [editorialPlanForProcessFixture(fixture)],
  });
  const shot = timeline.realizedShots[0];
  assert.equal(shot.family, 'process');
  assert.equal(shot.renderMode, 'solved');
  assert.equal(shot.presentation.representationDecision.originalRepresentation, 'process');
  assert.ok(timeline.solvedScenes[shot.solvedSceneId]);
  assert.ok(timeline.motionPlans[shot.motionPlanId]);
  assert.deepEqual(timeline.motionPlans[shot.motionPlanId].lifecycle.map((phase) => phase.phase), ['ENTER', 'ESTABLISH', 'EXPLAIN', 'EMPHASIZE', 'SETTLE', 'EXIT']);
  assert.ok(timeline.motionPlans[shot.motionPlanId].lifecycle.every((phase) => phase.endFrame >= phase.startFrame));
  assert.ok(timeline.motionPlans[shot.motionPlanId].lifecycle.find((phase) => phase.phase === 'ESTABLISH').endFrame
    > timeline.motionPlans[shot.motionPlanId].lifecycle.find((phase) => phase.phase === 'ESTABLISH').startFrame);
  assert.equal(timeline.motionPlans[shot.motionPlanId].maximumSimultaneousTracks, 3);
  assert.equal(shot.captionPolicy.mode, 'INTEGRATED');
  assert.equal(shot.captionPolicy.equivalentOnScreenText, true);
  assert.equal(shot.transitionReason, 'newIdea');
  assert.equal(shot.transitionPolicy, 'CUT');
  const editDiagnostics = buildEditContinuityDiagnostics(timeline, { frameStatePreflight: timeline._compositionArtifacts.frameStatePreflight });
  assert.equal(editDiagnostics.captionCoveragePercent, 100);
  assert.equal(editDiagnostics.simultaneousMotionWarnings.length, 0);
  assert.equal(editDiagnostics.insufficientFinalHoldWarnings.length, 0);
  TimelineSchema.parse(timeline);
  assert.throws(() => TimelineSchema.parse({ ...timeline, realizedShots: [{ ...shot, geometry: { x: 1 } }] }), /geometry must be referenced|Unrecognized key/);
});

test('professional edit diagnostics flag uncovered narration and repetitive effects', () => {
  const words = [{ text: 'one', startFrame: 0, endFrame: 20 }, { text: 'two', startFrame: 20, endFrame: 40 }];
  const shots = Array.from({ length: 3 }, (_, index) => ({
    storyboardShotId: `image_${index}`, family: 'image', imageBehavior: 'SUBTLE_PUSH',
    captionPolicy: { mode: 'HIDDEN', geometry: { x: 0, y: 800, width: 1000, height: 100 }, equivalentOnScreenText: false },
    presentation: { movementState: 'SUBTLE' },
  }));
  const timeline = {
    fps: 30, width: 1920, height: 1080, durationInFrames: 120, realizedShots: shots, motionPlans: {},
    clips: shots.map((shot, index) => ({ enter: { type: 'dissolve' }, transitionReason: 'continuation', transitionAnchor: null, shots: [shot], from: index * 40 })),
    captions: { chunks: [{ startFrame: 0, endFrame: 40, words }], policies: [{ startFrame: 0, endFrame: 40, mode: 'HIDDEN', equivalentOnScreenText: false }] },
  };
  const diagnostics = buildEditContinuityDiagnostics(timeline);
  assert.equal(diagnostics.captionCoveragePercent, 0);
  assert.equal(diagnostics.repeatedTransitionRuns[0].value, 'SHORT_DISSOLVE');
  assert.equal(diagnostics.repeatedCameraRuns[0].value, 'SUBTLE_PUSH');
  assert.ok(diagnostics.abruptSubtitleWarnings.length > 0);
});
