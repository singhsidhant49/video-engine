import assert from 'node:assert/strict';
import test from 'node:test';

import { StoryboardSchema } from '../src/models/storyboard.schema.js';
import { buildStoryboard } from '../src/pipeline/visualStoryboardDirector.js';
import { estimateShotDemand } from '../src/storyboard/shotPlanner.js';
import { selectVideoVisualStrategy } from '../src/storyboard/visualStrategySelector.js';

const strategy = selectVideoVisualStrategy({
  topic: 'A company turnaround',
  format: 'landscape',
  plan: { style: 'editorial_explainer', scenes: [] },
});

const demandScene = (overrides = {}) => ({
  purpose: 'explanation', visualIntent: 'explain', preferredPresentation: 'subject',
  durationHint: 7, importance: 3, energy: 2, informationDensity: 2,
  ...overrides,
});

test('low-energy explanation does not automatically receive three shots', () => {
  assert.ok(estimateShotDemand(demandScene(), strategy) <= 2);
});

test('high-energy hook has greater shot demand than a low-energy explanation', () => {
  const low = estimateShotDemand(demandScene(), strategy);
  const high = estimateShotDemand(demandScene({ purpose: 'hook', energy: 5, importance: 5, durationHint: 9 }), strategy);
  assert.ok(high > low);
});

test('hero statistic can intentionally remain a stable single shot', () => {
  const demand = estimateShotDemand(demandScene({
    purpose: 'evidence', visualIntent: 'quantify', preferredPresentation: 'statistic',
    energy: 5, informationDensity: 5, importance: 5, durationHint: 10,
  }), strategy);
  assert.equal(demand, 1);
});

test('visual strategy responds to video content rather than niche alone', () => {
  const evidence = selectVideoVisualStrategy({
    topic: 'A product investigation', format: 'landscape',
    plan: { style: 'editorial_explainer', scenes: [
      { kind: 'document', purpose: 'evidence', intensity: 3 },
      { kind: 'statistic', purpose: 'evidence', intensity: 3 },
      { kind: 'timeline', purpose: 'context', intensity: 2 },
    ] },
  });
  const cinematic = selectVideoVisualStrategy({
    topic: 'A product investigation', format: 'landscape',
    plan: { style: 'cinematic_documentary', scenes: [
      { kind: 'atmosphere', purpose: 'context', intensity: 2 },
      { kind: 'subject', purpose: 'context', intensity: 2 },
      { kind: 'atmosphere', purpose: 'explain', intensity: 2 },
    ] },
  });
  assert.equal(evidence.visualFlow, 'evidence');
  assert.equal(cinematic.visualFlow, 'cinematic');
  assert.ok(evidence.graphicDensity > cinematic.graphicDensity);
});

const scene = (id, narration, overrides = {}) => ({
  id,
  narration,
  purpose: 'context',
  kind: 'subject',
  visual: 'Nokia headquarters and mobile phone products',
  imageQueries: ['Nokia headquarters', 'Nokia mobile phones'],
  entity: { name: 'Nokia', wikipedia: 'Nokia' },
  text: null,
  emphasis: null,
  data: null,
  intensity: 2,
  importance: 3,
  section: false,
  tone: 'neutral',
  shot: 'medium',
  focus: null,
  camera: 'slow',
  continuity: 'continue',
  treatment: 'cinematic',
  ...overrides,
});

function fixturePlan() {
  const scenes = [
    scene('s01', 'Nokia already dominated the mobile phone market.'),
    scene('s02', 'Its devices were sold in almost every major region.'),
    scene('s03', 'Then a new chapter began.', { purpose: 'chapter', kind: 'chapter', section: true, entity: null, imageQueries: [], visual: 'A clear chapter transition', intensity: 3 }),
    scene('s04', 'The company was close to collapse.', { purpose: 'evidence', kind: 'document', visual: 'Newspaper coverage of Nokia losses', imageQueries: ['Nokia losses newspaper headline 2012'], intensity: 4, importance: 5 }),
  ];
  return {
    title: 'Nokia test', topic: 'How Nokia changed', format: 'landscape', style: 'editorial_explainer', hue: 210,
    scenes, script: scenes.map((item) => item.narration).join(' '), claims: [], diagnostics: {},
  };
}

test('related script sentences can merge into one editorial scene', () => {
  const plan = fixturePlan();
  const storyboard = buildStoryboard(plan, {
    format: 'landscape', videoId: 'merge-test', visualStrategy: strategy, sceneSeconds: [3, 3, 2, 4],
  });
  const scenes = storyboard.sections.flatMap((section) => section.scenes);
  assert.deepEqual(scenes[0].sourceSceneIds, ['s01', 's02']);
  assert.match(scenes[0].narration, /market\. Its devices/);
});

test('section transitions create an explicit new scene and section boundary', () => {
  const storyboard = buildStoryboard(fixturePlan(), {
    format: 'landscape', videoId: 'section-test', visualStrategy: strategy, sceneSeconds: [3, 3, 2, 4],
  });
  assert.ok(storyboard.sections.length >= 2);
  const transition = storyboard.sections.flatMap((section) => section.scenes).find((item) => item.sourceSceneIds.includes('s03'));
  assert.equal(transition.purpose, 'transition');
  assert.equal(storyboard.sections.some((section) => section.scenes[0].id === transition.id), true);
});

test('shot concepts are semantic, preserve exact entities, and do not copy narration', () => {
  const storyboard = buildStoryboard(fixturePlan(), {
    format: 'landscape', videoId: 'concept-test', visualStrategy: strategy, sceneSeconds: [3, 3, 2, 4],
  });
  const scenes = storyboard.sections.flatMap((section) => section.scenes);
  const evidence = scenes.find((item) => item.sourceSceneIds.includes('s04'));
  const concepts = evidence.shots.flatMap((shot) => shot.searchConcepts);
  assert.ok(concepts.includes('Nokia'));
  assert.ok(concepts.includes('Nokia losses newspaper headline 2012'));
  assert.equal(concepts.includes('The company was close to collapse.'), false);
});

test('beats are a derived compatibility alias of canonical sections', () => {
  const storyboard = buildStoryboard(fixturePlan(), {
    format: 'landscape', videoId: 'beats-test', visualStrategy: strategy, sceneSeconds: [3, 3, 2, 4],
  });
  StoryboardSchema.parse(storyboard);
  assert.deepEqual(
    storyboard.beats,
    storyboard.sections.map((section) => ({ beatId: section.id, purpose: section.purpose, scenes: section.scenes })),
  );
});
