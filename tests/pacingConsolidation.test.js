import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidatePlanForPacing } from '../src/storyboard/pacingConsolidation.js';

const timedWords = (count) => Array.from({ length: count }, (_, index) => ({ word: `w${index}`, start: index * 0.5, end: (index + 1) * 0.5 }));

test('contemplative pacing consolidates short visual scene boundaries without changing narration', () => {
  const plan = { scenes: [
    { id: 's1', narration: 'one two three four five six seven eight nine ten eleven twelve fourteen', purpose: 'hook', section: true, imageQueries: ['night'] },
    { id: 's2', narration: 'slow breath now', purpose: 'explain', imageQueries: ['breath'] },
    { id: 's3', narration: 'release the weight and settle into the quiet around you now', purpose: 'payoff', imageQueries: ['sleep'] },
  ] };
  const original = plan.scenes.map((scene) => scene.narration).join(' ');
  const result = consolidatePlanForPacing(plan, timedWords(30), { minimumShotSeconds: 7 });
  assert.equal(result.merged.length, 1);
  assert.equal(result.plan.scenes.length, 2);
  assert.equal(result.plan.script, original);
});
