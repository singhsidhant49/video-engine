import test from 'node:test';
import assert from 'node:assert/strict';
import { durationPolicyForShot } from '../src/storyboard/shotPlanner.js';

test('image timing policy follows editorial role instead of one universal duration', () => {
  assert.deepEqual(durationPolicyForShot({ role: 'detail', scene: {}, strategy: { format: 'landscape' } }), {
    name: 'detail', min: 2.5, ideal: 3.5, max: 4.5, advisory: true,
  });
  assert.equal(durationPolicyForShot({ role: 'evidence', scene: {}, strategy: { format: 'landscape' } }).max, 10);
  assert.equal(durationPolicyForShot({ role: 'reaction', scene: { purpose: 'reveal' }, strategy: { format: 'landscape' } }).min, 6);
  assert.equal(durationPolicyForShot({ role: 'context', scene: { energy: 1, preferredPresentation: 'sleep meditation' }, strategy: { format: 'landscape', contentType: 'meditation' } }).ideal, 14);
});

test('Shorts timing policy is compressed but remains inside the 1.5 to 4 second beat range', () => {
  for (const role of ['detail', 'evidence', 'reaction', 'context']) {
    const policy = durationPolicyForShot({ role, scene: { purpose: role === 'reaction' ? 'payoff' : 'explanation' }, strategy: { format: 'shorts' } });
    assert.ok(policy.min >= 1.5);
    assert.ok(policy.max <= 4);
    assert.ok(policy.ideal >= policy.min && policy.ideal <= policy.max);
  }
});
