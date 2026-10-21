import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeVideoBrief, resolveProductionProfile } from '../src/config/videoBrief.js';
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

