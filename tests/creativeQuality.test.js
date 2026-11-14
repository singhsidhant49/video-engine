import test from 'node:test';
import assert from 'node:assert/strict';

import { conciseThumbnailText, scoreHookQuality, selectStrongestHook } from '../src/services/creativeQuality.js';
import { strengthenPlanHook } from '../src/services/aiDirectorService.js';
import { generateVideoPackage } from '../src/services/thumbnailGenerator.js';

test('hook scoring rejects generic filler and selects concrete tension', () => {
  const generic = scoreHookQuality('Have you ever wondered about sleep?', { topic: 'sleep and memory' });
  const concrete = scoreHookQuality('Your brain stores memories all day, but sleep decides which ones you lose.', { topic: 'sleep and memory' });
  assert.ok(concrete.score >= generic.score + 30);
  assert.ok(generic.weaknesses.includes('generic_opener'));
  const selected = selectStrongestHook([
    'In this video, we explore memory.',
    'Your brain stores memories all day, but sleep decides which ones you lose.',
  ], { topic: 'sleep and memory' });
  assert.equal(selected.index, 1);
});

test('weak opening is replaced only by a materially stronger LLM candidate', async () => {
  const plan = { scenes: [{ narration: 'Today we will talk about sleep.' }, { narration: 'Sleep has several stages.' }] };
  const repaired = await strengthenPlanHook(plan, {
    topic: 'sleep and memory',
    llm: { name: 'mock' },
    call: async () => ({ candidates: [
      { narration: 'Welcome back to our sleep video.' },
      { narration: 'Your brain stores memories all day, but sleep decides which ones you lose.' },
      { narration: 'Sleep is very interesting.' },
    ] }),
  });
  assert.match(repaired.scenes[0].narration, /sleep decides/i);
  assert.equal(repaired.scenes.length, 2);
  assert.equal(repaired.hookQuality.repaired, true);
});

test('thumbnail package uses concise topic-specific copy and ranked title options', () => {
  assert.equal(conciseThumbnailText('The truth about your sleeping brain', { maxWords: 4 }), 'TRUTH SLEEPING BRAIN');
  const plan = {
    title: 'The Truth About Sleep',
    titleOptions: ['Why Sleep Chooses Which Memories Survive', 'An Overview of Sleep'],
    topic: 'sleep and memory',
    scenes: [
      { id: 's1', narration: 'Your brain stores memories all day, but sleep decides which ones you lose.', purpose: 'hook' },
      { id: 's2', narration: 'Deep sleep stabilizes selected memory traces.', purpose: 'payoff' },
    ],
  };
  const result = generateVideoPackage(plan, { fps: 30, clips: [{ sceneId: 's1', from: 0 }] });
  assert.equal(result.title, 'Why Sleep Chooses Which Memories Survive');
  assert.ok(result.thumbnails.every((item) => item.overlayText.split(/\s+/).length <= 4));
  assert.ok(result.thumbnails.every((item) => !/HOW IT HAPPENED|DATA GRAPHIC/i.test(item.overlayText)));
  assert.ok(result.titleOptions.every((item) => typeof item === 'string'));
  assert.equal(result.titleScores[0].value, result.title);
});
