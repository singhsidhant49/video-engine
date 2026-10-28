import assert from 'node:assert/strict';
import test from 'node:test';

import { isMeditationNarration, resolveNarrationProfile, resolveMeditationSubprofile } from '../src/audio/narrationProfile.js';
import {
  classifyMeditationPause,
  calculateMeditationPauseMs,
  segmentMeditationText,
  MEDITATION_PAUSE_TYPES,
} from '../src/audio/meditationPacer.js';

test('meditation narration starts at natural speed and budgets fewer words for silence holds', () => {
  const profile = resolveNarrationProfile({
    topic: 'A gentle guided sleep meditation',
    niche: 'wellness',
    baseSpeed: 0.9,
    meditationSpeed: 0.72,
  });
  assert.equal(profile.id, 'sleep_meditation');
  assert.equal(profile.speed, 0.72);
  assert.equal(profile.minimumRepairSpeed, 0.72);
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
  assert.equal(isMeditationNarration({ contentType: 'audiobook' }), false);
  assert.equal(isMeditationNarration({ contentType: 'meditation' }), true);
});

test('meditation subprofiles distinguish guided, sleep, and quick mindfulness', () => {
  assert.equal(resolveMeditationSubprofile({ topic: 'Deep sleep and relaxation for bedtime' }), 'sleep');
  assert.equal(resolveMeditationSubprofile({ topic: '5 minute quick morning mindfulness reset' }), 'quick_mindfulness');
  assert.equal(resolveMeditationSubprofile({ topic: 'Calm presence and breathing' }), 'guided');

  const sleepProfile = resolveNarrationProfile({ contentType: 'meditation', topic: 'Bedtime sleep story' });
  assert.equal(sleepProfile.speed, 0.76);

  const quickProfile = resolveNarrationProfile({ contentType: 'meditation', topic: 'Quick focus reset' });
  assert.equal(quickProfile.speed, 0.82);

  const guidedProfile = resolveNarrationProfile({ contentType: 'meditation', topic: 'Finding inner stillness' });
  assert.equal(guidedProfile.speed, 0.76);
});

test('meditation pause classifier categorizes phrases correctly', () => {
  assert.equal(classifyMeditationPause('Take a slow, deep breath in.'), MEDITATION_PAUSE_TYPES.BREATH_IN);
  assert.equal(classifyMeditationPause('And gently let it go, releasing the breath.'), MEDITATION_PAUSE_TYPES.BREATH_OUT);
  assert.equal(classifyMeditationPause('Hold gently at the top.'), MEDITATION_PAUSE_TYPES.BREATH_HOLD);
  assert.equal(classifyMeditationPause('Allow your shoulders to soften and relax your jaw.'), MEDITATION_PAUSE_TYPES.BODY_SCAN);
  assert.equal(classifyMeditationPause('Imagine a warm golden light flowing over you.'), MEDITATION_PAUSE_TYPES.VISUALIZATION);
  assert.equal(classifyMeditationPause('Notice the gentle space of stillness within.'), MEDITATION_PAUSE_TYPES.REFLECTION);
  assert.equal(classifyMeditationPause('For the next few moments, simply rest in stillness.'), MEDITATION_PAUSE_TYPES.SECTION_TRANSITION);
  assert.equal(classifyMeditationPause('Welcome to this practice.'), MEDITATION_PAUSE_TYPES.NORMAL);
});

test('meditation pause duration respects specified millisecond ranges', () => {
  const breathInPause = calculateMeditationPauseMs('Take a slow breath in.', MEDITATION_PAUSE_TYPES.BREATH_IN);
  assert.ok(breathInPause >= 4500 && breathInPause <= 5500, `Expected 4.5-5.5s for breath in, got ${breathInPause}ms`);

  const breathOutPause = calculateMeditationPauseMs('And slowly breathe out.', MEDITATION_PAUSE_TYPES.BREATH_OUT);
  assert.ok(breathOutPause >= 5000 && breathOutPause <= 6500, `Expected 5-6.5s for breath out, got ${breathOutPause}ms`);

  const bodyScanPause = calculateMeditationPauseMs('Relax your jaw.', MEDITATION_PAUSE_TYPES.BODY_SCAN);
  assert.ok(bodyScanPause >= 3500 && bodyScanPause <= 5500, `Expected 3.5-5.5s for body scan, got ${bodyScanPause}ms`);
});

test('meditation segmentation splits text into short mindful phrases with pauses', () => {
  const script = 'Close your eyes gently. Take a slow breath in. And slowly breathe out. Relax your jaw.';
  const segments = segmentMeditationText(script);
  assert.equal(segments.length, 4);
  assert.equal(segments[0].pauseType, MEDITATION_PAUSE_TYPES.NORMAL);
  assert.equal(segments[1].pauseType, MEDITATION_PAUSE_TYPES.BREATH_IN);
  assert.equal(segments[2].pauseType, MEDITATION_PAUSE_TYPES.BREATH_OUT);
  assert.equal(segments[3].pauseType, MEDITATION_PAUSE_TYPES.SECTION_TRANSITION); // last segment is transition/hold
});

test('content-type tailored speech speed curve applies accurately across YouTube channel formats', () => {
  // Meditation default: 0.76 (guided & sleep)
  const med = resolveNarrationProfile({ contentType: 'meditation' });
  assert.equal(med.id, 'guided_meditation');
  assert.equal(med.speed, 0.76);
  assert.equal(med.minimumRepairSpeed, 0.72);

  // Audiobook: 0.82 (British storyteller relaxed pacing)
  const audio = resolveNarrationProfile({ contentType: 'audiobook' });
  assert.equal(audio.id, 'audiobook');
  assert.equal(audio.speed, 0.82);
  assert.equal(audio.meditation, false);

  // Documentary: 0.95, Investigative: 0.92
  const doc = resolveNarrationProfile({ contentType: 'documentary' });
  assert.equal(doc.speed, 0.95);
  const inv = resolveNarrationProfile({ contentType: 'investigative' });
  assert.equal(inv.speed, 0.92);

  // Story: 0.92
  const story = resolveNarrationProfile({ contentType: 'story' });
  assert.equal(story.speed, 0.92);

  // Explainer: 1.00 for Shorts, 0.98 for Landscape
  const expShorts = resolveNarrationProfile({ contentType: 'explainer', format: 'shorts' });
  assert.equal(expShorts.speed, 1.00);
  const expLand = resolveNarrationProfile({ contentType: 'explainer', format: 'landscape' });
  assert.equal(expLand.speed, 0.98);

  // Educational: 1.00 for Shorts, 0.98 for Landscape
  const eduShorts = resolveNarrationProfile({ contentType: 'educational', format: 'shorts' });
  assert.equal(eduShorts.speed, 1.00);
  const eduLand = resolveNarrationProfile({ contentType: 'educational', format: 'landscape' });
  assert.equal(eduLand.speed, 0.98);

  // Tutorial: 1.00 for Shorts, 0.95 for Landscape
  const tutShorts = resolveNarrationProfile({ contentType: 'tutorial', format: 'shorts' });
  assert.equal(tutShorts.speed, 1.00);
  const tutLand = resolveNarrationProfile({ contentType: 'tutorial', format: 'landscape' });
  assert.equal(tutLand.speed, 0.95);

  // Motivational: 0.98
  const mot = resolveNarrationProfile({ contentType: 'motivational' });
  assert.equal(mot.speed, 0.98);
  assert.equal(mot.minimumRepairSpeed, 0.75);
});

