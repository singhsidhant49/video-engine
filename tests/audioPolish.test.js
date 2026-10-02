import assert from 'node:assert/strict';
import test from 'node:test';

import { measureLoudness, applyPeakLimiter, buildAudioDiagnostics } from '../src/audio/audioMastering.js';
import { classifyPauses, generateDuckingEnvelope, PAUSE_TYPES } from '../src/audio/duckingEngine.js';
import { authorSoundDesign, SFX_VOCABULARY } from '../src/audio/soundDesign.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

test('measureLoudness and applyPeakLimiter control audio dynamics without clipping', () => {
  const sampleRate = 48000;
  const numSamples = sampleRate * 2; // 2 seconds
  const sine = new Float32Array(numSamples);

  // Generate 1kHz sine at 0 dBFS peak (amplitude 1.0)
  for (let i = 0; i < numSamples; i++) {
    sine[i] = Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
  }

  const before = measureLoudness(sine, sampleRate);
  assert.ok(Math.abs(before.truePeakDb - 0.0) < 0.1);
  assert.ok(before.integratedLoudness > -6.0);

  // Apply peak limiter with ceiling at -1.5 dBFS
  const limited = applyPeakLimiter(sine, -1.5);
  const after = measureLoudness(limited, sampleRate);

  assert.ok(after.truePeakDb <= -1.48, `Expected peak <= -1.5 dBFS, got ${after.truePeakDb}`);
  assert.ok(after.truePeakDb >= -1.65);
});

test('classifyPauses categorizes micro, normal, and editorial gaps accurately', () => {
  const fps = 30;
  const words = [
    { startFrame: 0, endFrame: 15, word: 'Why' },          // gap: 6 frames (200ms) -> MICRO_PAUSE
    { startFrame: 21, endFrame: 40, word: 'your' },        // gap: 24 frames (800ms) -> NORMAL_PAUSE
    { startFrame: 64, endFrame: 80, word: 'brain' },       // gap: 60 frames (2000ms) -> EDITORIAL_PAUSE
    { startFrame: 140, endFrame: 160, word: 'chooses' },
  ];

  const pauses = classifyPauses(words, fps);
  assert.equal(pauses.length, 3);
  assert.equal(pauses[0].type, PAUSE_TYPES.MICRO_PAUSE);
  assert.equal(pauses[0].durationSec, 0.2);

  assert.equal(pauses[1].type, PAUSE_TYPES.NORMAL_PAUSE);
  assert.equal(pauses[1].durationSec, 0.8);

  assert.equal(pauses[2].type, PAUSE_TYPES.EDITORIAL_PAUSE);
  assert.equal(pauses[2].durationSec, 2.0);
});

test('generateDuckingEnvelope eliminates music pumping during micro-pauses', () => {
  const fps = 30;
  const totalFrames = 300; // 10 seconds
  const words = [
    { startFrame: 30, endFrame: 60, word: 'Sentence' },     // speech 1.0s - 2.0s
    // 200ms gap (6 frames): frames 60 to 66 is a MICRO_PAUSE
    { startFrame: 66, endFrame: 100, word: 'continues' },   // speech 2.2s - 3.33s
  ];

  const bgm = { base: 0.16, ducked: 0.05 };
  const { envelope, diagnostics } = generateDuckingEnvelope({
    words,
    clips: [{ from: 0, durationInFrames: totalFrames, purpose: 'explanation', family: 'statement' }],
    totalFrames,
    fps,
    bgm,
  });

  assert.equal(envelope.length, totalFrames);
  assert.equal(diagnostics.microPauseCount, 1);

  // During speech at frame 45, volume should be ducked
  assert.ok(envelope[45] <= 0.06);

  // CRITICAL TEST: During the micro-pause at frame 63, music MUST NOT pump up to base (0.16)
  assert.ok(envelope[63] <= 0.06, `Micro-pause pumped to ${envelope[63]}! Expected <= 0.06`);

  // And during speech at frame 80, still ducked
  assert.ok(envelope[80] <= 0.06);
});

test('generateDuckingEnvelope applies hold and bed protection under cognitive graphics', () => {
  const fps = 30;
  const totalFrames = 300;
  const words = [
    { startFrame: 30, endFrame: 90, word: 'Speaking' },
  ];

  const clips = [
    { from: 0, durationInFrames: 150, purpose: 'explanation', family: 'chart' }, // complex graphic
    { from: 150, durationInFrames: 150, purpose: 'payoff', family: 'image' },
  ];

  const { envelope } = generateDuckingEnvelope({
    words,
    clips,
    totalFrames,
    fps,
    bgm: { base: 0.16, ducked: 0.05 },
  });

  // Chart scene has bed protection multiplier (~0.8x)
  // Ducked gain under chart should be quieter than standard ducked
  assert.ok(envelope[50] < 0.05);

  // In hold window (frames 91 to 105), volume stays ducked
  assert.ok(envelope[100] < 0.05);
});

test('authorSoundDesign enforces minimum gap and restrained volume budget', () => {
  const clips = [
    { from: 0, durationInFrames: 60, sceneId: 's01', shots: [{ family: 'image' }] },
    { from: 60, durationInFrames: 60, sceneId: 's02', shots: [{ family: 'stat', overlay: { at: 10 } }], intensity: 5 }, // triggers impact_boom
    { from: 120, durationInFrames: 60, sceneId: 's03', shots: [{ family: 'stat', overlay: { at: 10 } }], intensity: 5 }, // too close! should be rejected (< 6s gap)
    { from: 320, durationInFrames: 60, sceneId: 's04', shots: [{ family: 'document' }] }, // >6s later, triggers paper_slam
  ];

  const sfxPaths = {
    whoosh: 'audio/sfx/whoosh.wav',
    impact_boom: 'audio/sfx/impact_boom.wav',
    paper_slam: 'audio/sfx/paper_slam.wav',
    click: 'audio/sfx/click.wav',
  };

  const { events, diagnostics } = authorSoundDesign({
    clips,
    transitions: ['cut', 'cut', 'cut', 'cut'],
    sfxPaths,
    fps: 30,
    format: 'landscape',
  });

  assert.equal(events.length, 2, 'Must reject rapid-fire SFX event occurring within min gap');
  assert.equal(events[0].type, SFX_VOCABULARY.IMPACT_BOOM);
  assert.equal(events[1].type, SFX_VOCABULARY.PAPER_SLAM);

  assert.ok(diagnostics.minGapSeconds >= 6.0, `Expected min gap >= 6.0s, got ${diagnostics.minGapSeconds}`);
  assert.ok(diagnostics.sfxPeak <= 0.25, 'SFX volume must sit comfortably below voiceover');
});

test('timeline QC validates audio diagnostics and loudness targets', () => {
  const timeline = {
    fps: 30,
    durationInFrames: 30 * 75,
    clips: [{ id: 'c1', from: 0, durationInFrames: 30 * 75, enter: { type: 'cut' }, shots: [{ id: 'sh1', durationInFrames: 30 * 75, from: 0 }] }],
    audio: {
      duckingDiagnostics: { microPauseCount: 5 },
      sfxDiagnostics: { sfxCount: 2, minGapSeconds: 8.5 },
    },
  };

  // 1. Compliant audio diagnostics (-15.5 LUFS, -1.5 dBTP)
  const compliantAudio = {
    narrationIntegratedLoudness: -16.0,
    masterIntegratedLoudness: -15.2,
    truePeakDb: -1.5,
  };

  const qcPass = runTimelineQc(timeline, { audioDiagnostics: compliantAudio });
  assert.ok(qcPass.checks.find((c) => c.id === 'audio-loudness-target')?.ok);
  assert.ok(qcPass.checks.find((c) => c.id === 'audio-peak-headroom')?.ok);
  assert.ok(qcPass.checks.find((c) => c.id === 'audio-pumping-risk')?.ok);
  assert.ok(qcPass.checks.find((c) => c.id === 'audio-sfx-budget')?.ok);

  // 2. Clipping true-peak violation
  const clippingAudio = {
    narrationIntegratedLoudness: -16.0,
    truePeakDb: +0.2, // severe clip!
  };
  const qcFail = runTimelineQc(timeline, { audioDiagnostics: clippingAudio });
  const clipCheck = qcFail.checks.find((c) => c.id === 'audio-peak-headroom');
  assert.equal(clipCheck.ok, false);
  assert.equal(clipCheck.severity, 'error');
});
