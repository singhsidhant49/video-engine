import assert from 'node:assert/strict';
import test from 'node:test';

import { selectTargetDuration } from '../src/services/aiDirectorService.js';

test('AI duration selection is clamped to the channel guardrails', async () => {
  const selection = await selectTargetDuration({
    topic: 'Why memory changes during sleep', format: 'landscape', range: { min: 120, max: 360 },
    llm: { name: 'test' }, call: async () => ({ durationSeconds: 900, rationale: 'A deep subject.' }),
  });
  assert.equal(selection.durationSeconds, 360);
  assert.equal(selection.method, 'llm');
  assert.deepEqual(selection.range, { min: 120, max: 360 });
});

test('duration selection remains bounded when no LLM is configured', async () => {
  const selection = await selectTargetDuration({
    topic: 'A short explanation of sleep', format: 'shorts', range: { min: 20, max: 55 }, llm: null,
  });
  assert.equal(selection.method, 'heuristic');
  assert.ok(selection.durationSeconds >= 20 && selection.durationSeconds <= 55);
});

test('missing provider duration is treated as a heuristic fallback, not zero seconds', async () => {
  const selection = await selectTargetDuration({
    topic: 'Explain a complex scientific mechanism', format: 'landscape', range: { min: 120, max: 300 },
    llm: { name: 'test' }, call: async () => ({ durationSeconds: null, rationale: 'No duration returned.' }),
  });
  assert.equal(selection.method, 'heuristic');
  assert.ok(selection.durationSeconds >= 120 && selection.durationSeconds <= 300);
});

test('duration selection safely falls back when the provider fails', async () => {
  const selection = await selectTargetDuration({
    topic: 'A detailed historical investigation', format: 'landscape', range: { min: 180, max: 480 },
    llm: { name: 'test' }, call: async () => { throw new Error('provider unavailable'); },
  });
  assert.equal(selection.method, 'heuristic');
  assert.ok(selection.durationSeconds >= 180 && selection.durationSeconds <= 480);
});
