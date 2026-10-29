import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeVideoBrief,
  resolveProductionProfile,
  ALLOWED_VOICES,
  normalizeSelectedVoice,
  defaultVoiceForContentType,
} from '../src/config/videoBrief.js';
import { estimateShotDemand } from '../src/storyboard/shotPlanner.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

test('structured briefs preserve prompt data and channel intent', () => {
  const brief = normalizeVideoBrief({
    prompt: 'Explain the supplied quarterly results',
    sourceData: { revenue: 42, note: 'Use only supplied figures' },
    durationSec: 180,
    channel: { id: 'finance-main', contentType: 'explainer', pacingMode: 'balanced', audience: 'new investors' },
  });
  assert.equal(brief.prompt, 'Explain the supplied quarterly results');
  assert.equal(brief.sourceData.revenue, 42);
  assert.equal(brief.channel.id, 'finance-main');
  assert.equal(brief.channel.audience, 'new investors');
});

test('production profiles adapt pacing to different YouTube channel types', () => {
  const meditation = resolveProductionProfile({ topic: 'A gentle guided sleep meditation', format: 'landscape' });
  const documentary = resolveProductionProfile({ topic: 'A documentary about Ancient Rome', format: 'landscape' });
  const explainer = resolveProductionProfile({ topic: 'How browser caching works', format: 'landscape' });
  const educationalShort = resolveProductionProfile({ topic: 'Five educational facts about space', format: 'shorts' });

  assert.equal(meditation.pacing.mode, 'contemplative');
  assert.equal(documentary.pacing.mode, 'cinematic');
  assert.equal(explainer.pacing.mode, 'balanced');
  assert.equal(educationalShort.pacing.mode, 'rapid');
  assert.ok(meditation.pacing.minimumShotSeconds > documentary.pacing.minimumShotSeconds);
  assert.ok(documentary.pacing.minimumShotSeconds > explainer.pacing.minimumShotSeconds);
  assert.ok(explainer.pacing.minimumShotSeconds > educationalShort.pacing.minimumShotSeconds);
});

test('contemplative pacing authors fewer image changes than balanced pacing', () => {
  const scene = {
    purpose: 'explanation', energy: 2, informationDensity: 2, durationHint: 12,
    narration: 'First the breath becomes quiet. Then the shoulders soften. Finally the room feels distant.',
    entities: [], preferredPresentation: 'subject',
  };
  const balanced = estimateShotDemand({ ...scene }, {
    useMediaEditorial: true, format: 'landscape',
    pacing: { minimumShotSeconds: 4.8, maximumStillSeconds: 8 },
  });
  const contemplative = estimateShotDemand({ ...scene }, {
    useMediaEditorial: true, format: 'landscape',
    pacing: { minimumShotSeconds: 7, maximumStillSeconds: 11 },
  });
  assert.ok(contemplative < balanced);
  assert.equal(contemplative, 1);
});

test('production QC blocks an edit that violates its channel pacing profile', () => {
  const fps = 30;
  const shots = Array.from({ length: 5 }, (_, index) => ({
    id: `sh${index + 1}`, storyboardShotId: `sh${index + 1}`, sceneId: 'c1', sectionId: 's1',
    from: index * 60, durationInFrames: 60, family: 'image', presentation: { layout: 'full' },
  }));
  const timeline = {
    fps,
    durationInFrames: 300,
    style: 'editorial_explainer',
    visualMode: 'MEDIA_EDITORIAL',
    productionProfile: { pacing: { mode: 'contemplative', minimumShotSeconds: 7, maximumCutsPer10Seconds: 2, targetAverageShotSeconds: 8 } },
    clips: [{ id: 'c1', from: 0, durationInFrames: 300, shots }],
    realizedShots: shots,
  };
  const qc = runTimelineQc(timeline, { publishMode: 'PRODUCTION_RENDER' });
  assert.equal(qc.checks.find((check) => check.id === 'pacing-profile-holds')?.ok, false);
  assert.equal(qc.checks.find((check) => check.id === 'pacing-profile-holds')?.severity, 'error');
  assert.equal(qc.checks.find((check) => check.id === 'pacing-rapid-cuts')?.ok, false);
  assert.equal(qc.ok, false);
});

test('voice curation: ALLOWED_VOICES is strictly heart, bella, puck, and nicole whisper', () => {
  assert.deepEqual([...ALLOWED_VOICES].sort(), ['af_bella', 'af_heart', 'af_nicole', 'am_puck']);
  assert.ok(!ALLOWED_VOICES.includes('bm_george'), 'george must be removed');
  assert.ok(!ALLOWED_VOICES.includes('af_sky'), 'sky must be removed');
  assert.ok(!ALLOWED_VOICES.includes('am_adam'), 'adam must be removed');
  assert.ok(!ALLOWED_VOICES.includes('af_kore'), 'kore must be removed');
});

test('voice curation: defaultVoiceForContentType assigns nicole whisper to meditation and puck to documentary', () => {
  assert.equal(defaultVoiceForContentType('meditation'), 'af_nicole');
  assert.equal(defaultVoiceForContentType('documentary'), 'am_puck');
  assert.equal(defaultVoiceForContentType('investigative'), 'am_puck');
  assert.equal(defaultVoiceForContentType('motivational'), 'am_puck');
  assert.equal(defaultVoiceForContentType('story'), 'af_heart');
  assert.equal(defaultVoiceForContentType('audiobook'), 'af_heart');
  assert.equal(defaultVoiceForContentType('explainer'), 'af_bella');
  assert.equal(defaultVoiceForContentType('educational'), 'af_bella');
  assert.equal(defaultVoiceForContentType('tutorial'), 'af_bella');
  assert.equal(defaultVoiceForContentType('unknown'), 'af_bella');
});

test('voice curation: normalizeSelectedVoice handles aliases and safe legacy fallbacks', () => {
  // Curated voices pass through
  assert.equal(normalizeSelectedVoice('af_nicole', 'explainer'), 'af_nicole');
  assert.equal(normalizeSelectedVoice('af_heart', 'explainer'), 'af_heart');
  assert.equal(normalizeSelectedVoice('af_bella', 'explainer'), 'af_bella');
  assert.equal(normalizeSelectedVoice('am_puck', 'explainer'), 'am_puck');

  // Friendly short aliases
  assert.equal(normalizeSelectedVoice('nicole', 'explainer'), 'af_nicole');
  assert.equal(normalizeSelectedVoice('whisper', 'explainer'), 'af_nicole');
  assert.equal(normalizeSelectedVoice('heart', 'explainer'), 'af_heart');
  assert.equal(normalizeSelectedVoice('bella', 'explainer'), 'af_bella');
  assert.equal(normalizeSelectedVoice('puck', 'explainer'), 'am_puck');

  // Legacy removed voices map safely without throwing:
  // Male removed voices map to am_puck
  assert.equal(normalizeSelectedVoice('george', 'documentary'), 'am_puck');
  assert.equal(normalizeSelectedVoice('bm_george', 'documentary'), 'am_puck');
  assert.equal(normalizeSelectedVoice('adam', 'documentary'), 'am_puck');
  assert.equal(normalizeSelectedVoice('am_adam', 'documentary'), 'am_puck');

  // Female removed voices map to af_bella
  assert.equal(normalizeSelectedVoice('sky', 'explainer'), 'af_bella');
  assert.equal(normalizeSelectedVoice('af_sky', 'explainer'), 'af_bella');
  assert.equal(normalizeSelectedVoice('kore', 'explainer'), 'af_bella');
  assert.equal(normalizeSelectedVoice('af_kore', 'explainer'), 'af_bella');

  // Auto / empty uses content type default
  assert.equal(normalizeSelectedVoice('auto', 'meditation'), 'af_nicole');
  assert.equal(normalizeSelectedVoice('', 'documentary'), 'am_puck');
});

test('voice curation: resolveProductionProfile auto-assigns nicole whisper for meditation and sleep', () => {
  const meditation = resolveProductionProfile({ topic: 'Deep sleep and relaxation meditation', format: 'landscape' });
  assert.equal(meditation.contentType, 'meditation');
  assert.equal(meditation.voice, 'af_nicole');

  const documentary = resolveProductionProfile({ topic: 'The rise of the Roman Empire', format: 'landscape' });
  assert.equal(documentary.contentType, 'documentary');
  assert.equal(documentary.voice, 'am_puck');
});

