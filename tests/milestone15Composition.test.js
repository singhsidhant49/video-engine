import assert from 'node:assert/strict';
import test from 'node:test';

import { ComparisonSpecSchema, ChartSpecSchema, TimelineSchema } from '../src/models/index.js';
import { normalizeComparisonSpec } from '../src/composition/comparisonSpec.js';
import { normalizeChartSpec } from '../src/composition/chartSpec.js';
import { categoricalScale, linearScale, validateChartData } from '../src/composition/chartScales.js';
import { compileSolvedComparisonShot } from '../src/composition/compileSolvedComparisonShot.js';
import { compileSolvedChartShot } from '../src/composition/compileSolvedChartShot.js';
import { COMPARISON_FIXTURES, CHART_FIXTURES, editorialPlanForM15Fixture } from '../src/composition/milestone15Fixtures.js';
import { preflightSolvedScene } from '../src/qc/frameStatePreflight.js';
import { buildTimeline } from '../src/pipeline/timeline.js';
import { evaluateEditorialVisualQuality } from '../src/qc/editorialVisualQualityGate.js';

const compile = (fixture, representation, format = 'landscape', overlay = fixture.overlay) => {
  const vertical = format === 'shorts';
  const compiler = representation === 'comparison' ? compileSolvedComparisonShot : compileSolvedChartShot;
  return compiler({
    editorialPlan: editorialPlanForM15Fixture(fixture, representation), overlay, alignedWords: fixture.alignedWords,
    timing: { startFrame: 0, durationInFrames: fixture.durationInFrames }, format,
    width: vertical ? 1080 : 1920, height: vertical ? 1920 : 1080, styleId: 'documentary',
  });
};

test('ComparisonSpec validates distinct semantic subjects', () => {
  const spec = normalizeComparisonSpec({ editorialPlan: editorialPlanForM15Fixture(COMPARISON_FIXTURES[0], 'comparison'), overlay: COMPARISON_FIXTURES[0].overlay });
  assert.equal(ComparisonSpecSchema.parse(spec).subjectA.label, 'IMMEDIATE REWARD');
  assert.throws(() => ComparisonSpecSchema.parse({ ...spec, subjectB: { ...spec.subjectB, id: spec.subjectA.id } }), /distinct/);
});

for (const fixture of COMPARISON_FIXTURES) for (const format of ['landscape', 'shorts']) {
  test(`${fixture.id} comparison solves and preflights in ${format}`, () => {
    const result = compile(fixture, 'comparison', format);
    assert.equal(result.preflight.passed, true, JSON.stringify(result.preflight.hardFailures));
    assert.equal(format === 'shorts' ? result.solvedScene.topology : 'landscape', format === 'shorts' ? 'stacked-vertical' : 'landscape');
    assert.ok(result.motionPlan.frame0State.comparison_side_a.opacity > 0);
    assert.ok(result.motionPlan.frame0State.comparison_side_b.opacity > 0);
  });
}

test('comparison uses measured unequal fields and phrase-driven pivot', () => {
  const fixture = { ...COMPARISON_FIXTURES[1], overlay: { ...COMPARISON_FIXTURES[1].overlay, right: { ...COMPARISON_FIXTURES[1].overlay.right, detail: 'Plans a long sequence of actions, observes changing context, repairs failures, and verifies the final result' } } };
  const result = compile(fixture, 'comparison');
  assert.equal(result.solvedScene.topology, 'two-column-editorial');
  assert.notEqual(result.solvedScene.elements.comparison_side_a.width, result.solvedScene.elements.comparison_side_b.width);
  const pivot = result.composition.semanticEvents.find((event) => event.type === 'comparisonPivot');
  const track = result.motionPlan.tracks.find((item) => item.id === 'compare_b_emphasis');
  assert.equal(track.startFrame, pivot.frame);
  assert.equal(track.triggerPhraseId, pivot.phraseId);
});

test('semantic comparison text reduction never drops below format minimum', () => {
  const fixture = COMPARISON_FIXTURES[3];
  const result = compile(fixture, 'comparison', 'shorts', { ...fixture.overlay, left: { ...fixture.overlay.left, detail: 'A very long explanation that contains several subordinate clauses and must be reduced semantically for a narrow mobile composition without using an ellipsis' } });
  assert.ok(Object.values(result.solvedScene.textLayout).every((layout) => ['FULL', 'SHORT', 'LABEL_ONLY'].includes(layout.reductionTier)));
  assert.equal(result.preflight.hardFailures.some((issue) => issue.code === 'minimum_font_size'), false);
});

test('ChartSpec requires a takeaway and validates evidence references', () => {
  const fixture = CHART_FIXTURES[0];
  const spec = normalizeChartSpec({ editorialPlan: editorialPlanForM15Fixture(fixture, 'chart'), overlay: fixture.overlay });
  assert.equal(ChartSpecSchema.parse(spec).illustrative, true);
  assert.throws(() => ChartSpecSchema.parse({ ...spec, takeaway: '' }), /too small|expected string/);
  assert.throws(() => ChartSpecSchema.parse({ ...spec, illustrative: false, source: null, evidenceRequirement: 'required' }), /source metadata/);
});

test('linear and categorical scales handle zero, negative, identical, and large ranges safely', () => {
  const identical = linearScale([5, 5], [0, 100]);
  assert.ok(Number.isFinite(identical(5)));
  const signed = linearScale([-10, 10], [100, 0]);
  assert.equal(signed(0), 50);
  assert.ok(categoricalScale(['A', 'B'], [0, 100])('B') > categoricalScale(['A', 'B'], [0, 100])('A'));
  const base = normalizeChartSpec({ editorialPlan: editorialPlanForM15Fixture(CHART_FIXTURES[1], 'chart'), overlay: CHART_FIXTURES[1].overlay });
  assert.ok(validateChartData({ ...base, series: [{ ...base.series[0], data: [{ x: 'A', y: 0 }, { x: 'B', y: 0 }] }] }).issues.some((issue) => issue.code === 'all_zero_values'));
  assert.ok(validateChartData({ ...base, series: [{ ...base.series[0], data: [{ x: 'A', y: -2 }, { x: 'B', y: 2_000_000 }] }] }).issues.some((issue) => issue.code === 'negative_values_present'));
});

for (const fixture of CHART_FIXTURES) for (const format of ['landscape', 'shorts']) {
  test(`${fixture.id} chart solves and preflights in ${format}`, () => {
    const result = compile(fixture, 'chart', format);
    assert.equal(result.preflight.passed, true, JSON.stringify(result.preflight.hardFailures));
    assert.ok(result.solvedScene.chartCoordinateSystem);
    assert.ok(result.solvedScene.chartCoordinateSystem.y.ticks.length <= (format === 'shorts' ? 6 : 8));
    assert.ok(result.motionPlan.durationInFrames - result.motionPlan.frameQuality.finalStateFrame >= result.motionPlan.frameQuality.minimumFinalHold);
  });
}

test('chart preflight detects label and caption collisions', () => {
  const result = compile(CHART_FIXTURES[1], 'chart');
  const solved = structuredClone(result.solvedScene);
  const labels = Object.values(solved.elements).filter((element) => element.kind === 'chart_label');
  labels[1].x = labels[0].x; labels[1].y = labels[0].y;
  solved.elements.chart_root.y = solved.regions.captions.y;
  const checked = preflightSolvedScene({ solvedScene: solved, motionPlan: result.motionPlan, composition: result.composition });
  const codes = new Set(checked.hardFailures.map((issue) => issue.code));
  assert.ok(codes.has('chart_label_collision'));
});

test('editorial quality gate persists focal states and rejects preview-unreadable primary text', () => {
  const result = compile(CHART_FIXTURES[1], 'chart');
  assert.equal(result.visualQuality.publishable, true);
  assert.ok(result.motionPlan.focalStates.every((state) => result.solvedScene.elements[state.primaryFocalElementId]));
  const solved = structuredClone(result.solvedScene);
  const primaryTextId = Object.keys(solved.textLayout).find((id) => solved.elements[id].visualHierarchy.tier === 'PRIMARY');
  solved.textLayout[primaryTextId].fontSize = 10;
  const review = evaluateEditorialVisualQuality({ solvedScene: solved, motionPlan: result.motionPlan, composition: result.composition, chartSpec: result.chartSpec });
  assert.equal(review.publishable, false);
  assert.ok(review.warnings.some((warning) => warning.code === 'preview_readability'));
});

test('frame-state preflight rejects a missing persisted focal target', () => {
  const result = compile(COMPARISON_FIXTURES[0], 'comparison');
  const motionPlan = structuredClone(result.motionPlan);
  motionPlan.focalStates[0].primaryFocalElementId = 'missing_focal_element';
  const checked = preflightSolvedScene({ solvedScene: result.solvedScene, motionPlan, composition: result.composition });
  assert.ok(checked.hardFailures.some((failure) => failure.code === 'missing_focal_target'));
});

test('hard chart-label preflight requests a conservative recompile', () => {
  const fixture = CHART_FIXTURES[2];
  const overlay = {
    ...fixture.overlay,
    series: [
      { id: 'one', label: 'Series one', data: [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }] },
      { id: 'two', label: 'Series two', data: [{ x: 1, y: 11 }, { x: 2, y: 21 }, { x: 3, y: 30 }] },
    ],
    highlightIndex: 2,
  };
  const result = compile(fixture, 'chart', 'landscape', overlay);
  assert.equal(result.preflight.passed, true, JSON.stringify(result.preflight.hardFailures));
  assert.ok(result.solvedScene.repairHistory.some((repair) => repair.action === 'HIDE_REDUNDANT_LABEL'));
});

function productionTimeline(fixture, representation, { invalid = false } = {}) {
  const family = representation === 'comparison' ? 'compare' : 'chart';
  const shot = { id: `shot_${fixture.id}`, role: 'graphic', durationHint: 6, visualConcept: fixture.title, assetIntent: 'concept', mediaPreference: 'procedural', searchConcepts: [], entities: [], evidenceRequirement: 'conceptual_allowed' };
  const data = invalid ? { ...fixture.overlay, values: [], series: undefined } : fixture.overlay;
  const scene = { id: `scene_${fixture.id}`, sectionId: 'section_1', narration: fixture.narration, purpose: representation === 'comparison' ? 'contrast' : 'evidence', kind: representation, data, intensity: 3, tone: 'neutral', treatment: 'graphic', storyboardShots: [shot] };
  const coverage = [{ shotId: shot.id, sceneId: scene.id, sectionId: scene.sectionId, informationType: representation === 'chart' ? 'data' : 'comparison', primaryRepresentation: representation, fallbackRepresentations: ['diagram'], semanticPayload: { communicationObjective: fixture.overlay.question || fixture.title, visualConcept: fixture.title, entities: [], role: 'graphic' }, evidenceRequirements: { level: 'conceptual_allowed', authenticSourceRequired: false }, mediaConstraints: { preference: 'procedural', orientation: 'landscape', focalPointHint: null, motionPreference: null }, rationale: 'Structured information', confidence: 0.95, coverageStatus: 'UNRESOLVED' }];
  return buildTimeline({ plan: { title: fixture.title, style: 'documentary', hue: 210, scenes: [scene] }, specs: [{ sceneId: scene.id, family, variant: 'default', treatment: 'graphic', recasts: [], accents: {} }], narration: { totalFrames: fixture.durationInFrames, words: fixture.alignedWords }, assets: { [scene.id]: { primary: null, alternates: [] } }, sfx: {}, bgm: null, videoId: `m15-${representation}`, format: 'landscape', fps: 30, audioSrc: null, coveragePlan: coverage, editorialVisualPlan: [editorialPlanForM15Fixture(fixture, representation)] });
}

test('production timeline stores solved comparison and chart in typed registries', () => {
  for (const [fixture, representation] of [[COMPARISON_FIXTURES[0], 'comparison'], [CHART_FIXTURES[1], 'chart']]) {
    const timeline = productionTimeline(fixture, representation);
    const shot = timeline.realizedShots[0];
    assert.equal(shot.renderMode, 'solved');
    assert.ok(timeline.solvedScenes[shot.solvedSceneId]);
    assert.ok(timeline.motionPlans[shot.motionPlanId]);
    assert.ok(timeline.visualQualityReviews[shot.visualQualityReviewId]);
    assert.equal(timeline.visualQualityReviews[shot.visualQualityReviewId].publishable, true);
    assert.equal(shot.continuityCompatibility.compatible, true);
    assert.equal(shot.compositionFallback, null);
    TimelineSchema.parse(timeline);
  }
});

test('production chart compiler records explicit legacy fallback on failure', () => {
  const timeline = productionTimeline(CHART_FIXTURES[1], 'chart', { invalid: true });
  const shot = timeline.realizedShots[0];
  assert.equal(shot.renderMode, 'legacy');
  assert.equal(shot.compositionFallback.fallbackRenderer, 'ChartShot');
  assert.equal(shot.compositionFallback.failureStage, 'chart_compile');
  assert.ok(shot.compositionFallback.reason);
});

test('transition quality replaces an unanchored comparison push with a cut', () => {
  const fixtures = [COMPARISON_FIXTURES[0], COMPARISON_FIXTURES[1]];
  const scenes = fixtures.map((fixture, index) => {
    const shot = { id: `shot_${fixture.id}`, role: 'graphic', durationHint: 6, visualConcept: index ? 'autonomous planning' : 'delayed value', assetIntent: 'concept', mediaPreference: 'procedural', searchConcepts: [], entities: [], evidenceRequirement: 'conceptual_allowed' };
    return { id: `scene_${fixture.id}`, sectionId: 'section_1', narration: fixture.narration, purpose: index ? 'contrast' : 'explanation', kind: 'comparison', data: fixture.overlay, intensity: 3, tone: 'neutral', treatment: 'graphic', storyboardShots: [shot] };
  });
  const words = fixtures.flatMap((fixture, index) => fixture.alignedWords.map((word) => ({ ...word, startFrame: word.startFrame + index * 180, endFrame: word.endFrame + index * 180, start: word.start + index * 6, end: word.end + index * 6 })));
  const coveragePlan = scenes.map((scene, index) => ({ shotId: scene.storyboardShots[0].id, sceneId: scene.id, sectionId: scene.sectionId, informationType: 'comparison', primaryRepresentation: 'comparison', fallbackRepresentations: ['diagram'], semanticPayload: { communicationObjective: fixtures[index].title, visualConcept: scene.storyboardShots[0].visualConcept, entities: [], role: 'graphic' }, evidenceRequirements: { level: 'conceptual_allowed', authenticSourceRequired: false }, mediaConstraints: { preference: 'procedural', orientation: 'landscape', focalPointHint: null, motionPreference: null }, rationale: 'Comparison', confidence: 0.95, coverageStatus: 'UNRESOLVED' }));
  const timeline = buildTimeline({ plan: { title: 'Transition quality', style: 'documentary', hue: 210, scenes }, specs: scenes.map((scene) => ({ sceneId: scene.id, family: 'compare', variant: 'default', treatment: 'graphic', recasts: [], accents: {} })), narration: { totalFrames: 360, words }, assets: Object.fromEntries(scenes.map((scene) => [scene.id, { primary: null, alternates: [] }])), sfx: {}, bgm: null, videoId: 'transition-quality', format: 'landscape', fps: 30, audioSrc: null, coveragePlan, editorialVisualPlan: fixtures.map((fixture) => editorialPlanForM15Fixture(fixture, 'comparison')) });
  assert.equal(timeline.clips[1].transitionQuality.replacedWithCut, true);
  assert.equal(timeline.clips[1].enter.type, 'cut');
  assert.equal(timeline.clips[1].transitionQuality.warnings[0], 'missing_transition_anchor');
});
