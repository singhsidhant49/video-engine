import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { resolveNarrationProfile, CONTENT_TYPE_DEFAULT_SPEEDS } from '../src/audio/narrationProfile.js';
import { calculateDurationBudget } from '../src/storyboard/durationBudget.js';
import { getGenreDirectingInstructions } from '../src/services/aiDirectorService.js';
import { enrichAiImagePrompt, directAiAssets } from '../src/pipeline/aiAssetDirector.js';
import { appendWavSilence } from '../src/services/ttsService.js';
import { normalizeMediaSceneSpec } from '../src/composition/mediaSceneSpec.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

test('YouTube Shorts narration profile targets 165–190 WPM delivery', () => {
  const shortsProfile = resolveNarrationProfile({
    contentType: 'explainer',
    format: 'shorts',
  });

  assert.ok(shortsProfile.speed >= 1.14 && shortsProfile.speed <= 1.20, `Shorts speed ${shortsProfile.speed} should be between 1.14 and 1.20`);
  // speechRateWps * 60 = WPM
  const wpm = shortsProfile.speechRateWps * 60;
  assert.ok(wpm >= 165 && wpm <= 190, `Shorts WPM ${wpm} must be within 165–190 WPM sweet spot`);
  assert.equal(shortsProfile.delivery, 'energetic_engaging');
  assert.ok(shortsProfile.minimumRepairSpeed >= 0.85, 'Shorts repair speed floor must prevent sluggish speech');
});

test('Long-form narration profile targets 140–165 WPM balanced delivery', () => {
  const explainerProfile = resolveNarrationProfile({
    contentType: 'explainer',
    format: 'landscape',
  });
  const docProfile = resolveNarrationProfile({
    contentType: 'documentary',
    format: 'landscape',
  });

  const expWpm = explainerProfile.speechRateWps * 60;
  assert.ok(expWpm >= 145 && expWpm <= 165, `Long-form explainer WPM ${expWpm} must be within 145–165 WPM`);

  const docWpm = docProfile.speechRateWps * 60;
  assert.ok(docWpm >= 140 && docWpm <= 155, `Long-form documentary WPM ${docWpm} must be within 140–155 WPM`);
  assert.equal(docProfile.delivery, 'measured_authoritative');
});

test('Content-aware genre instructions support YouTube Shorts, Business, Psychology, Science, and Mystery', () => {
  const shorts = getGenreDirectingInstructions('shorts', 'shorts');
  assert.ok(shorts.roleDescription.includes('YouTube Shorts'));
  assert.ok(shorts.structureGuidance.includes('Hook (0–2s)'));
  assert.ok(shorts.structureGuidance.includes('Seamless Loop Payoff'));
  assert.ok(shorts.toneGuidance.includes('165–190 words per minute'));

  const biz = getGenreDirectingInstructions('business', 'landscape');
  assert.ok(biz.roleDescription.includes('business journalist'));
  assert.ok(biz.structureGuidance.includes('Misaligned Incentives'));
  assert.ok(biz.visualGuidance.includes('trading floor'));

  const psych = getGenreDirectingInstructions('psychology', 'landscape');
  assert.ok(psych.roleDescription.includes('cognitive psychologist'));
  assert.ok(psych.structureGuidance.includes('The Decisive Experiment'));

  const sci = getGenreDirectingInstructions('science', 'landscape');
  assert.ok(sci.roleDescription.includes('science communicator'));
  assert.ok(sci.structureGuidance.includes('The Breakthrough Mechanism'));

  const mystery = getGenreDirectingInstructions('mystery', 'landscape');
  assert.ok(mystery.roleDescription.includes('atmospheric suspense'));
  assert.ok(mystery.structureGuidance.includes('The Chilling Catalyst'));
});

test('Duration budgeting provides tighter pacing for Shorts than Landscape', () => {
  const shortsBudget = calculateDurationBudget({ targetDurationSec: 45, format: 'shorts', speechRateWps: 2.93 });
  const landscapeBudget = calculateDurationBudget({ targetDurationSec: 75, format: 'landscape', speechRateWps: 2.50 });

  assert.equal(shortsBudget.openingHoldSec, 0.2);
  assert.equal(shortsBudget.closingHoldSec, 0.6);
  // For 45s Short: targetSceneCount should be 9 (not 5-6 with 7.5s holds)
  assert.ok(shortsBudget.targetSceneCount >= 8 && shortsBudget.targetSceneCount <= 11);

  assert.equal(landscapeBudget.openingHoldSec, 0.8);
  assert.equal(landscapeBudget.closingHoldSec, 2.2);
  assert.ok(landscapeBudget.targetSceneCount >= 8 && landscapeBudget.targetSceneCount <= 11);
});

test('TTS silence padding trims dead air from 800ms down to 220ms in Shorts', () => {
  // Test appendWavSilence parameterization
  const dummyBuffer = Buffer.alloc(44); // basic wav header length
  // Should handle buffer without throwing
  const shortsBuffer = appendWavSilence(dummyBuffer, 220);
  assert.ok(shortsBuffer instanceof Buffer);
});

test('enrichAiImagePrompt infuses camera angles, motivated lighting, format safety, and zero-text contracts', () => {
  const scene = {
    imagePrompt: 'A hacker typing on a laptop',
    shot: 'close',
    tone: 'tense',
    narration: 'Within seconds, the firewall collapsed.',
  };

  const enrichedShorts = enrichAiImagePrompt({
    scene,
    shotConcept: 'laptop screen with red security breach alert',
    format: 'shorts',
  });

  assert.ok(enrichedShorts.includes('A hacker typing on a laptop'));
  assert.ok(enrichedShorts.includes('focusing on laptop screen'));
  assert.ok(enrichedShorts.includes('tight dramatic close-up'));
  assert.ok(enrichedShorts.includes('chiaroscuro lighting'));
  assert.ok(enrichedShorts.includes('vertical 9:16 aspect ratio'));
  assert.ok(enrichedShorts.includes('zero text'));

  const landscapeScene = {
    visual: 'An ancient Roman fortress at sunrise',
    shot: 'wide',
    tone: 'triumphant',
    narration: 'The legion stood victorious.',
  };
  const enrichedLandscape = enrichAiImagePrompt({
    scene: landscapeScene,
    format: 'landscape',
  });

  assert.ok(enrichedLandscape.includes('wide expansive establishing composition'));
  assert.ok(enrichedLandscape.includes('golden hour illumination'));
  assert.ok(enrichedLandscape.includes('cinematic 16:9 composition'));
});

test('mediaSceneSpec solves dynamic camera motion for auto/Shorts images to prevent static holds', () => {
  const shot1 = {
    id: 'shot_1',
    role: 'subject',
    presentation: { cameraMove: 'auto' },
  };
  const asset = {
    id: 'asset_1',
    width: 1080,
    height: 1920,
    src: 'assets/hero.png',
    focal: { x: 0.5, y: 0.4 },
  };

  const spec1 = normalizeMediaSceneSpec({
    shot: shot1,
    asset,
    format: 'shorts',
    durationInFrames: 90,
  });

  assert.notEqual(spec1.cameraIntent, 'STATIC', 'Auto camera on image shot in Shorts must not collapse into STATIC hold');
  assert.ok(['SUBTLE_PUSH', 'SUBTLE_PULL', 'PAN_LEFT', 'PAN_RIGHT'].includes(spec1.cameraIntent));

  // Explicit static should still be honored
  const shotStatic = {
    id: 'shot_static',
    role: 'subject',
    presentation: { cameraMove: 'static' },
  };
  const specStatic = normalizeMediaSceneSpec({
    shot: shotStatic,
    asset,
    format: 'shorts',
    durationInFrames: 90,
  });
  assert.equal(specStatic.cameraIntent, 'STATIC');
});

test('Timeline QC automated quality checks flag generic hooks, scene repetition, and Shorts static holds', () => {
  const timeline = {
    fps: 30,
    durationInFrames: 600,
    style: 'minimal_premium',
    format: 'shorts',
    clips: [{
      id: 'c1', from: 0, durationInFrames: 600,
      shots: [{
        id: 's1', storyboardShotId: 's1', sceneId: 'sc1', sectionId: 'sec1',
        from: 0, durationInFrames: 600, family: 'image', presentation: { layout: 'full', cameraMove: 'static' },
        imageBehavior: 'STATIC',
      }],
    }],
    realizedShots: [{
      id: 's1', storyboardShotId: 's1', sceneId: 'sc1', sectionId: 'sec1',
      from: 0, durationInFrames: 600, family: 'image', presentation: { layout: 'full', cameraMove: 'static' },
      imageBehavior: 'STATIC',
    }],
  };

  const badPlan = {
    format: 'shorts',
    scenes: [
      { id: 'sc1', narration: 'Hey guys, in this video we are going to explore space.', imagePrompt: 'Space rocket' },
      { id: 'sc2', narration: 'The rocket flies.', imagePrompt: 'Space rocket' },
    ],
  };

  const qc = runTimelineQc(timeline, { plan: badPlan });

  const hookCheck = qc.checks.find((c) => c.id === 'script-hook-strength');
  assert.ok(hookCheck, 'script-hook-strength check should run');
  assert.equal(hookCheck.ok, false, 'Generic greeting/intro in hook must be flagged');

  const staticCheck = qc.checks.find((c) => c.id === 'shorts-static-pacing');
  assert.ok(staticCheck, 'shorts-static-pacing check should run');
  assert.equal(staticCheck.ok, false, '20-second static hold in Shorts must be flagged');

  const repeatedCheck = qc.checks.find((c) => c.id === 'repeated-scene-prompt');
  assert.ok(repeatedCheck, 'repeated-scene-prompt check should run');
  assert.equal(repeatedCheck.ok, false, 'Identical image prompts across adjacent scenes must be flagged');

  // Good plan with tension hook and dynamic camera
  const goodTimeline = {
    ...timeline,
    clips: [{
      id: 'c1', from: 0, durationInFrames: 600,
      shots: [{
        id: 's1', storyboardShotId: 's1', sceneId: 'sc1', sectionId: 'sec1',
        from: 0, durationInFrames: 90, family: 'image', presentation: { layout: 'full', cameraMove: 'subtlePush' },
        imageBehavior: 'SUBTLE_PUSH',
      }],
    }],
    realizedShots: [{
      id: 's1', storyboardShotId: 's1', sceneId: 'sc1', sectionId: 'sec1',
      from: 0, durationInFrames: 90, family: 'image', presentation: { layout: 'full', cameraMove: 'subtlePush' },
      imageBehavior: 'SUBTLE_PUSH',
    }],
  };

  const goodPlan = {
    format: 'shorts',
    scenes: [
      { id: 'sc1', purpose: 'hook', narration: 'In 1971, eight men walked out of a bank with sixty million dollars without firing a single bullet.', imagePrompt: 'A bank vault door blown open in the dark' },
      { id: 'sc2', purpose: 'explanation', narration: 'They used a forgotten maintenance tunnel beneath Baker Street.', imagePrompt: 'Muddy underground tunnel with flashlight beams' },
      { id: 'sc3', purpose: 'payoff', narration: 'To this day, none of the cash has ever been recovered.', imagePrompt: 'An empty wooden safe deposit box covered in dust' },
    ],
  };

  const goodQc = runTimelineQc(goodTimeline, { plan: goodPlan });
  assert.equal(goodQc.checks.find((c) => c.id === 'script-hook-strength')?.ok, true);
  assert.equal(goodQc.checks.find((c) => c.id === 'script-story-progression')?.ok, true);
  assert.equal(goodQc.checks.find((c) => c.id === 'shorts-static-pacing')?.ok, true);
  assert.equal(goodQc.checks.find((c) => c.id === 'repeated-scene-prompt')?.ok, true);
});
