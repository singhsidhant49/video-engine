import assert from 'node:assert/strict';
import test from 'node:test';

import { isMeditationNarration, resolveNarrationProfile } from '../src/audio/narrationProfile.js';

test('meditation narration starts slowly and budgets fewer words', () => {
  const profile = resolveNarrationProfile({
    topic: 'A gentle guided sleep meditation',
    niche: 'wellness',
    baseSpeed: 0.9,
    meditationSpeed: 0.72,
  });
  assert.equal(profile.id, 'guided_meditation');
  assert.equal(profile.speed, 0.72);
  assert.equal(profile.minimumRepairSpeed, 0.55);
  assert.ok(profile.speechRateWps < 2);
});

test('standard documentary narration retains the configured speed', () => {
  const profile = resolveNarrationProfile({ topic: 'How Ancient Rome expanded', baseSpeed: 0.9 });
  assert.equal(profile.id, 'standard');
  assert.equal(profile.speed, 0.9);
  assert.equal(profile.minimumRepairSpeed, 0.7);
});

test('meditation detection includes breathing and body scan language', () => {
  assert.equal(isMeditationNarration({ topic: 'A calming body scan before bedtime' }), true);
  assert.equal(isMeditationNarration({ topic: 'How sleep deprivation affects productivity', niche: 'science explainer' }), false);
});
