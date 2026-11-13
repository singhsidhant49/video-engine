import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { ChannelPatchSchema, ChannelProfileSchema, publicChannel } from '../src/models/channel.schema.js';
import { ChannelStore } from '../src/server/channelStore.js';
import { parseCron, isCronDue, findDueCronSlot, ChannelScheduler } from '../src/server/channelScheduler.js';
import { brainstormGrowthIdeas, calculateOpportunityScore, calculatePerformanceEvidence, HOOK_FORMULAS, rankGrowthIdeas, scoreTitle, summarizeChannelPerformance } from '../src/services/youtubeGrowthService.js';
import { ChannelDirectorService } from '../src/services/channelDirectorService.js';
import { YouTubePublisherService } from '../src/services/youtubePublisherService.js';
import { createChannelApiRouter } from '../src/server/channelApiRouter.js';
import { videoApiErrorHandler } from '../src/server/videoApiRouter.js';
import { importYouTubeAnalyticsCsv, parseCsv } from '../src/services/youtubeAnalyticsImportService.js';

const channel = (overrides = {}) => ChannelProfileSchema.parse({
  id: 'science-lab', name: 'Science Lab', niche: 'practical science', targetAudience: 'curious adults',
  audiencePainPoints: ['confusing explanations'], contentPillars: ['space', 'physics'],
  productionDefaults: {}, automation: {}, youtube: {},
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides,
});

test('growth ideas are ranked by opportunity quality rather than recency or model order', () => {
  const ranked = rankGrowthIdeas([
    { id: 'newest-low', compositeScore: 18, retentionScore: 90, titleScore: 90, urgency: 'trending' },
    { id: 'best', compositeScore: 37, retentionScore: 82, titleScore: 80, urgency: 'evergreen' },
    { id: 'tie-break', compositeScore: 37, retentionScore: 79, titleScore: 99, urgency: 'trending' },
  ]);
  assert.deepEqual(ranked.map((idea) => idea.id), ['best', 'tie-break', 'newest-low']);
});

test('opportunity score is a deterministic sum of inspectable factors', () => {
  const breakdown = calculateOpportunityScore({
    idea: {
      searchVolumeTier: 'high', trendDirection: 'rising', competition: 'medium',
      durationSeconds: 240, contentPillar: 'physics', primaryKeyword: 'physics experiments',
    },
    titleScore: 80, retentionScore: 90, channel: channel(),
  });
  assert.deepEqual(breakdown, { demand: 10, clickPotential: 9, nicheFit: 8, feasibility: 9, total: 36 });
});

test('reliable first-party comparisons provide only a bounded idea-ranking tie breaker', () => {
  const reliable = (score) => ({ confidence: 'reliable', weightedCtr: score, weightedAverageViewedPercentage: score * 5, subscribersPerThousandViews: score });
  const summary = {
    formats: { shorts: reliable(8), landscape: reliable(4) },
    pillars: { physics: reliable(9), space: reliable(5) },
    hookFormulas: { information_gap: reliable(7), myth_buster: reliable(3) },
  };
  const evidence = calculatePerformanceEvidence({ format: 'shorts', contentPillar: 'physics', hookFormula: 'information_gap' }, summary);
  assert.equal(evidence.score, 3); assert.match(evidence.reason, /reliable within-channel comparison/);
  const ranked = rankGrowthIdeas([
    { id: 'control', compositeScore: 30, performanceEvidenceScore: 0, retentionScore: 80, titleScore: 80 },
    { id: 'supported', compositeScore: 30, performanceEvidenceScore: 3, retentionScore: 80, titleScore: 80 },
    { id: 'better-opportunity', compositeScore: 31, performanceEvidenceScore: 0, retentionScore: 70, titleScore: 70 },
  ]);
  assert.deepEqual(ranked.map((idea) => idea.id), ['better-opportunity', 'supported', 'control']);
});

test('channel contracts apply safe manual/private automation defaults and hide token ciphertext', () => {
  const parsed = channel({
    youtube: { connected: true, tokenCiphertext: 'secret' },
    productionDefaults: {
      imageSource: 'ai',
      imageModel: 'p-image-ideogram',
      imageQuality: 'high',
      supportedContentTypes: ['explainer', 'documentary'],
    },
  });
  assert.equal(parsed.automation.enabled, false);
  assert.equal(parsed.automation.approvalMode, 'manual_approval');
  assert.equal(parsed.automation.autoPublish, false);
  assert.equal(parsed.productionDefaults.imageModel, 'p-image-ideogram');
  assert.equal(parsed.productionDefaults.imageQuality, 'high');
  assert.deepEqual(parsed.productionDefaults.supportedContentTypes, ['explainer', 'documentary']);
  assert.deepEqual(parsed.productionDefaults.formats, ['landscape', 'shorts']);
  assert.equal(parsed.productionDefaults.durationMode, 'llm');
  assert.deepEqual(parsed.productionDefaults.durationRanges.shorts, { min: 20, max: 60 });
  assert.equal(publicChannel(parsed).youtube.tokenCiphertext, undefined);
  assert.equal(publicChannel(parsed).youtube.lastAnalyticsSyncAt, null);
});

test('channel patch contract never injects defaults for omitted fields', () => {
  assert.deepEqual(ChannelPatchSchema.parse({ automation: { enabled: true } }), { automation: { enabled: true } });
  assert.deepEqual(ChannelPatchSchema.parse({ productionDefaults: { durationRanges: { shorts: { min: 30 } } } }), {
    productionDefaults: { durationRanges: { shorts: { min: 30 } } },
  });
});

test('file channel store persists tenant-scoped channels and ideas', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'channels-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ChannelStore({ rootDir: root }); await store.init();
  await store.putChannel('acct-a', channel());
  assert.equal((await store.listChannels('acct-a')).length, 1);
  assert.equal((await store.listChannels('acct-b')).length, 0);
  const timestamp = new Date().toISOString();
  await store.putIdea('acct-a', { id: 'idea-one', channelId: 'science-lab', title: 'The Hidden Truth About Space', hookFormula: 'information_gap', spokenHook: 'One missing detail changes how space works.', narrativeArc: 'Open the question, demonstrate the mechanism, and resolve the practical consequence.', contentPillar: 'space', retentionScore: 88, titleScore: 90, status: 'draft', videoId: null, youtubeVideoId: null, publishAt: null, error: null, createdAt: timestamp, updatedAt: timestamp });
  assert.equal((await store.listIdeas('acct-a', 'science-lab')).length, 1);
  const slot = new Date('2026-11-05T12:00:00.000Z');
  assert.ok(await store.claimSchedule('acct-a', 'science-lab', slot));
  assert.equal(await store.claimSchedule('acct-a', 'science-lab', new Date('2026-11-05T12:00:30.000Z')), null);
  assert.equal(await store.deleteChannel('acct-a', 'science-lab'), true);
  assert.equal((await store.listIdeas('acct-a', 'science-lab')).length, 0);
});

test('growth engine exposes 21 formulas, scores titles, and generates unique offline ideas', async () => {
  assert.equal(HOOK_FORMULAS.length, 21);
  assert.ok(scoreTitle('The Hidden Truth About Time') > scoreTitle('An Overview of Time'));
  const ideas = await brainstormGrowthIdeas(channel(), { count: 5, useAi: false });
  assert.equal(ideas.length, 5);
  assert.equal(new Set(ideas.map((item) => item.title)).size, 5);
  assert.ok(ideas.every((item) => item.spokenHook && item.retentionScore >= 1));
  assert.deepEqual(new Set(ideas.map((item) => item.format)), new Set(['landscape', 'shorts']));
  assert.ok(ideas.every((item) => item.durationSeconds >= channel().productionDefaults.durationRanges[item.format].min));
  assert.ok(ideas.every((item) => item.durationSeconds <= channel().productionDefaults.durationRanges[item.format].max));
  assert.ok(ideas.every((item) => item.primaryKeyword && item.thumbnailConcept && item.compositeScore >= 4));
  assert.ok(ideas.every((item) => item.trafficStrategy !== 'trending' && item.trendDirection !== 'rising'), 'offline fallback must not fabricate current trends');
  const fullBatch = await brainstormGrowthIdeas(channel({ contentPillars: ['space'] }), { count: 20, useAi: false });
  assert.equal(fullBatch.length, 20, 'a single-pillar channel can still receive the maximum distinct batch');
});

test('performance feedback is summarized by format without inventing missing metrics', () => {
  const summary = summarizeChannelPerformance([
    { title: 'Short A', format: 'shorts', durationSeconds: 35, views: 1_000, impressions: 2_000, clickThroughRate: 5, averageViewPercentage: 80, retention30sPercentage: 70, subscribersGained: 10 },
    { title: 'Short B', format: 'shorts', durationSeconds: 45, views: 3_000, impressions: 5_000, clickThroughRate: 7, averageViewPercentage: 60, retention30sPercentage: null, subscribersGained: 5 },
  ]);
  assert.equal(summary.sampleSize, 2);
  assert.equal(summary.formats.shorts.averageCtr, 6);
  assert.equal(summary.formats.shorts.averageViewedPercentage, 70);
  assert.equal(summary.formats.shorts.averageRetention30s, 70);
  assert.equal(summary.formats.shorts.subscribersPerThousandViews, 3.75);
  const deduplicated = summarizeChannelPerformance([
    { videoId: 'vid-one', title: 'Old', format: 'shorts', capturedAt: '2026-01-01T00:00:00.000Z', views: 100, impressions: 1000, clickThroughRate: 2, subscribersGained: 1 },
    { videoId: 'vid-one', title: 'New', format: 'shorts', capturedAt: '2026-01-02T00:00:00.000Z', views: 500, impressions: 2000, clickThroughRate: 5, subscribersGained: 3 },
  ]);
  assert.equal(deduplicated.sampleSize, 1); assert.equal(deduplicated.topVideos[0].title, 'New');
});

test('YouTube Analytics CSV parsing is quoted-field safe, linked to ideas, and idempotent', () => {
  assert.deepEqual(parseCsv('Title,Views\n"Why Space, Matters",1200\n')[1], ['Why Space, Matters', '1200']);
  const csv = [
    'Video ID,Video title,Duration,Published date,Views,Impressions,Impressions click-through rate (%),Average view duration,Average percentage viewed (%),Subscribers gained,Watch time (hours)',
    'yt-123,"Why Space, Matters",0:42,2026-11-01,1200,5000,6.5%,0:31,73.8%,14,10.3',
  ].join('\n');
  const options = {
    channelId: 'science-lab', capturedAt: '2026-11-13T10:00:00.000Z',
    ideas: [{ id: 'idea-space', youtubeVideoId: 'yt-123', title: 'Why Space, Matters' }],
  };
  const firstImport = importYouTubeAnalyticsCsv(csv, options);
  const secondImport = importYouTubeAnalyticsCsv(csv, options);
  const thirdImport = importYouTubeAnalyticsCsv(csv, { ...options, capturedAt: '2026-11-14T10:00:00.000Z' });
  assert.equal(firstImport.errors.length, 0);
  assert.equal(firstImport.snapshots[0].id, secondImport.snapshots[0].id);
  assert.equal(firstImport.snapshots[0].id, thirdImport.snapshots[0].id, 'identical metrics must not duplicate when re-imported later');
  assert.equal(firstImport.snapshots[0].ideaId, 'idea-space');
  assert.equal(firstImport.snapshots[0].format, 'shorts');
  assert.equal(firstImport.snapshots[0].durationSeconds, 42);
  assert.equal(firstImport.snapshots[0].averageViewDurationSeconds, 31);
  assert.equal(firstImport.snapshots[0].averageViewPercentage, 73.8);
  assert.equal(firstImport.snapshots[0].publishedAt, '2026-11-01T00:00:00.000Z');
});

test('performance feedback connects results to content pillars and hook formulas', () => {
  const summary = summarizeChannelPerformance([
    { ideaId: 'idea-space', title: 'Space One', format: 'shorts', views: 1000, clickThroughRate: 6, averageViewPercentage: 70, subscribersGained: 10 },
    { ideaId: 'idea-space-two', title: 'Space Two', format: 'landscape', views: 3000, clickThroughRate: 8, averageViewPercentage: 50, subscribersGained: 20 },
  ], [
    { id: 'idea-space', contentPillar: 'space', hookFormula: 'information_gap' },
    { id: 'idea-space-two', contentPillar: 'space', hookFormula: 'information_gap' },
  ]);
  assert.equal(summary.pillars.space.samples, 2);
  assert.equal(summary.pillars.space.averageCtr, 7);
  assert.equal(summary.hookFormulas.information_gap.averageViewedPercentage, 60);
  assert.equal(summary.hookFormulas.information_gap.subscribersPerThousandViews, 7.5);
});

test('performance baselines weight exposure and label small samples honestly', () => {
  const snapshots = Array.from({ length: 3 }, (_, index) => ({
    ideaId: `idea-${index}`, title: `Video ${index}`, format: 'landscape', views: index === 0 ? 900 : 100,
    impressions: index === 0 ? 9000 : 500, clickThroughRate: index === 0 ? 8 : 2,
    averageViewPercentage: index === 0 ? 60 : 30, subscribersGained: 2,
  }));
  const ideas = snapshots.map((snapshot, index) => ({
    id: snapshot.ideaId, contentPillar: 'physics', hookFormula: 'information_gap',
    packagingExperiment: { titleAngle: index ? 'contrarian' : 'curiosity_gap', hookVariant: 'curiosity', thumbnailVariant: 'object_closeup' },
  }));
  const summary = summarizeChannelPerformance(snapshots, ideas);
  assert.equal(summary.formats.landscape.confidence, 'directional');
  assert.ok(summary.formats.landscape.weightedCtr > summary.formats.landscape.averageCtr);
  assert.equal(summary.experiments.thumbnailVariants.object_closeup.samples, 3);
  assert.equal(summary.experiments.titleAngles.contrarian.samples, 2);
  assert.equal(summary.guidance.evidenceLevel, 'directional');
  assert.ok(summary.guidance.directionalTests.length > 0);
});

test('cron parser supports lists, ranges and steps with timezone-aware due checks', () => {
  assert.deepEqual([...parseCron('*/15 9-10 * * 1,3,5')[0]], [0, 15, 30, 45]);
  const mondayNineUtc = new Date('2026-11-02T09:00:00.000Z');
  assert.equal(isCronDue('0 9 * * 1,3,5', mondayNineUtc, 'UTC'), true);
  assert.equal(isCronDue('0 9 * * 1,3,5', mondayNineUtc, 'UTC', mondayNineUtc.toISOString()), false);
  assert.equal(isCronDue('0 9 1 * 1', mondayNineUtc, 'UTC'), true, 'restricted month-day and week-day use standard OR semantics');
  assert.equal(isCronDue('0 9 * * 7', new Date('2026-11-01T09:00:00.000Z'), 'UTC'), true, '7 is accepted as Sunday');
  assert.equal(findDueCronSlot('0 9 * * *', new Date('2026-11-05T10:30:00.000Z'), 'UTC', '2026-11-04T09:00:00.000Z')?.toISOString(), '2026-11-05T09:00:00.000Z');
  assert.equal(findDueCronSlot('0 9 * * *', new Date('2026-11-05T10:30:00.000Z'), 'UTC', null), null, 'a new channel does not backfill an arbitrary old slot');
});

test('channel director produces an idempotent video request and links the idea', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configuredChannel = channel({ productionDefaults: {
    imageSource: 'ai', imageProvider: 'replicate', imageModel: 'black-forest-labs/flux-schnell',
    imageQuality: 'high', imageStyle: 'watercolor', customStylePrompt: 'deep blue ink wash',
    contentType: 'documentary', voice: 'af_heart', music: 'auto', subtitles: false,
  } });
  const store = new ChannelStore({ rootDir: root }); await store.init(); await store.putChannel('acct-a', configuredChannel);
  const [idea] = await new ChannelDirectorService({ store, videoService: {} }).brainstorm('acct-a', 'science-lab', { count: 1, useAi: false });
  let captured;
  const videoService = { create: async (ownerId, request, key) => { captured = { ownerId, request, key }; return { job: { id: 'vid_test_123', status: 'queued' }, reused: false }; } };
  const result = await new ChannelDirectorService({ store, videoService }).produce('acct-a', 'science-lab', idea.id);
  assert.equal(result.idea.videoId, 'vid_test_123');
  assert.match(captured.request.prompt, /Opening spoken line/);
  assert.equal(captured.request.output.durationSeconds, idea.durationSeconds);
  assert.equal(captured.request.output.aspectRatio, idea.format === 'shorts' ? '9:16' : '16:9');
  assert.deepEqual(captured.request.creative, {
    contentType: 'documentary', tone: 'clear, compelling, and authoritative', audience: 'curious adults', pacing: 'auto',
    language: 'en',
    imageSource: 'ai', imageProvider: 'replicate', imageModel: 'black-forest-labs/flux-schnell',
    imageQuality: 'high', imageStyle: 'watercolor', customStylePrompt: 'deep blue ink wash',
  });
  assert.equal(captured.request.audio.voice, 'af_heart');
  assert.equal(captured.request.subtitles.enabled, false);
  assert.equal(captured.request.metadata.thumbnailConcept, idea.thumbnailConcept);
  assert.match(captured.key, /channel:science-lab:idea:/);
});

test('channel director retries the linked video job after a failed production', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-retry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ChannelStore({ rootDir: root }); await store.init(); await store.putChannel('acct-a', channel());
  const [idea] = await new ChannelDirectorService({ store, videoService: {} }).brainstorm('acct-a', 'science-lab', { count: 1, useAi: false });
  await store.putIdea('acct-a', { ...idea, status: 'failed', videoId: 'vid_failed_123', updatedAt: new Date().toISOString() });
  let retried = null;
  const result = await new ChannelDirectorService({ store, videoService: { retry: async (_owner, id) => { retried = id; return { job: { id, status: 'queued' }, reused: true }; } } }).produce('acct-a', 'science-lab', idea.id);
  assert.equal(retried, 'vid_failed_123');
  assert.equal(result.idea.status, 'queued');
});

test('automatic scheduler claims a due slot and enqueues one approved idea', async () => {
  const due = channel({ automation: { enabled: true, approvalMode: 'automatic', scheduleCron: '0 9 * * *', timezone: 'UTC' } });
  let produced = 0; let saved;
  const store = {
    listAllChannels: async () => [{ ownerId: 'acct-a', channel: due }], listIdeas: async () => [{ id: 'idea-ok', channelId: due.id, status: 'approved' }],
    putChannel: async (_owner, value) => { saved = value; }, putIdea: async () => {},
  };
  const scheduler = new ChannelScheduler({ store, director: { produce: async () => { produced++; } }, videoService: {} });
  await scheduler.tick(new Date('2026-11-05T09:00:00.000Z'));
  assert.equal(produced, 1);
  assert.ok(saved.automation.lastScheduledAt);
});

test('automatic scheduler produces the highest-ranked approved idea, not the newest row', async () => {
  const due = channel({ automation: { enabled: true, approvalMode: 'automatic', scheduleCron: '0 9 * * *', timezone: 'UTC' } });
  const produced = [];
  const store = {
    listAllChannels: async () => [{ ownerId: 'acct-a', channel: due }],
    listIdeas: async () => [
      { id: 'new-low', channelId: due.id, status: 'approved', compositeScore: 14, retentionScore: 90, titleScore: 90 },
      { id: 'best', channelId: due.id, status: 'approved', compositeScore: 38, retentionScore: 80, titleScore: 80 },
    ],
    putChannel: async () => {}, putIdea: async () => {},
  };
  const scheduler = new ChannelScheduler({ store, director: { produce: async (_owner, _channel, id) => produced.push(id) }, videoService: {} });
  await scheduler.tick(new Date('2026-11-05T09:00:00.000Z'));
  assert.deepEqual(produced, ['best']);
});

test('scheduler isolates one channel sync failure and continues later channels', async () => {
  const first = channel({ id: 'first-channel', automation: { enabled: false } });
  const second = channel({ id: 'second-channel', automation: { enabled: true, approvalMode: 'automatic', scheduleCron: '0 9 * * *', timezone: 'UTC' } });
  const produced = [];
  const store = {
    listAllChannels: async () => [{ ownerId: 'acct-a', channel: first }, { ownerId: 'acct-b', channel: second }],
    listIdeas: async (owner) => {
      if (owner === 'acct-a') throw new Error('temporary database read failure');
      return [{ id: 'second-idea', channelId: second.id, status: 'approved', compositeScore: 30 }];
    },
    putChannel: async () => {}, putIdea: async () => {},
  };
  const scheduler = new ChannelScheduler({ store, director: { produce: async (_owner, _channel, id) => produced.push(id) }, videoService: {} });
  await scheduler.tick(new Date('2026-11-05T09:00:00.000Z'));
  assert.deepEqual(produced, ['second-idea']);
});

test('scheduler backs off failed production instead of retrying every tick', async () => {
  const due = channel({ automation: { enabled: true, approvalMode: 'automatic', scheduleCron: '0 9 * * *', timezone: 'UTC' } });
  let attempts = 0;
  const store = {
    listAllChannels: async () => [{ ownerId: 'acct-a', channel: due }],
    listIdeas: async () => [{ id: 'idea-fails', channelId: due.id, status: 'approved', compositeScore: 30 }],
    putChannel: async (_owner, value) => { Object.assign(due, value); }, putIdea: async () => {},
  };
  const scheduler = new ChannelScheduler({ store, director: { produce: async () => { attempts++; throw new Error('provider unavailable'); } }, videoService: {} });
  await scheduler.tick(new Date('2026-11-05T09:00:00.000Z'));
  assert.equal(attempts, 1);
  assert.equal(due.automation.consecutiveFailures, 1);
  assert.equal(due.automation.nextRetryAt, '2026-11-05T09:00:30.000Z');
  await scheduler.tick(new Date('2026-11-05T09:00:10.000Z'));
  assert.equal(attempts, 1);
  await scheduler.tick(new Date('2026-11-05T09:00:30.000Z'));
  assert.equal(attempts, 2);
  assert.equal(due.automation.nextRetryAt, '2026-11-05T09:01:30.000Z');
});

test('YouTube OAuth uses signed state and stores encrypted tokens', async () => {
  let stored = channel();
  const store = { getChannel: async () => stored, putChannel: async (_owner, value) => { stored = value; } };
  const env = {
    YOUTUBE_CLIENT_ID: 'client-id', YOUTUBE_CLIENT_SECRET: 'client-secret',
    YOUTUBE_REDIRECT_URI: 'https://video.example.com/oauth/youtube/callback',
    YOUTUBE_OAUTH_STATE_SECRET: 's'.repeat(40), YOUTUBE_TOKEN_ENCRYPTION_KEY: 'e'.repeat(40),
  };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'plain-access-token', refresh_token: 'plain-refresh-token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ items: [{ id: 'UC123', snippet: { title: 'Science Lab' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const publisher = new YouTubePublisherService({ store, videoService: {}, env, fetchImpl });
  const authorizationUrl = new URL(await publisher.authorizationUrl('acct-a', stored.id));
  const state = authorizationUrl.searchParams.get('state');
  await publisher.handleCallback({ code: 'one-time-code', state });
  assert.equal(stored.youtube.connected, true);
  assert.equal(stored.youtube.channelId, 'UC123');
  assert.ok(stored.youtube.tokenCiphertext.startsWith('v1.'));
  assert.equal(stored.youtube.tokenCiphertext.includes('plain-access-token'), false);
  await assert.rejects(() => publisher.handleCallback({ code: 'x', state: `${state}tampered` }), /Invalid YouTube OAuth state/);
  assert.equal(calls.length, 2);
});

test('YouTube Analytics sync merges activity, reach and metadata into linked snapshots', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-analytics-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ChannelStore({ rootDir: root }); await store.init(); await store.putChannel('acct-a', channel());
  const env = {
    YOUTUBE_CLIENT_ID: 'client', YOUTUBE_CLIENT_SECRET: 'secret',
    YOUTUBE_REDIRECT_URI: 'https://video.example.com/oauth/youtube/callback',
    YOUTUBE_OAUTH_STATE_SECRET: 's'.repeat(32), YOUTUBE_TOKEN_ENCRYPTION_KEY: 'e'.repeat(32),
  };
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.hostname === 'www.googleapis.com' && url.pathname.endsWith('/channels')) return new Response(JSON.stringify({ items: [{ id: 'UC123', snippet: { title: 'Science Lab' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.hostname === 'youtubeanalytics.googleapis.com') {
      const metrics = url.searchParams.get('metrics');
      const payload = metrics.includes('videoThumbnail')
        ? { columnHeaders: ['video', 'videoThumbnailImpressions', 'videoThumbnailImpressionsClickRate'].map((name) => ({ name })), rows: [['yt-analytics-1', 8000, 7.5]] }
        : { columnHeaders: ['video', 'creatorContentType', 'views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'subscribersGained'].map((name) => ({ name })), rows: [['yt-analytics-1', 'VIDEO_ON_DEMAND', 2000, 300, 90, 55, 20]] };
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname.endsWith('/videos')) return new Response(JSON.stringify({ items: [{ id: 'yt-analytics-1', snippet: { title: 'Synced Physics', publishedAt: '2026-10-01T12:00:00.000Z' }, contentDetails: { duration: 'PT3M20S' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    throw new Error(`Unexpected request: ${url}`);
  };
  const publisher = new YouTubePublisherService({ store, videoService: {}, env, fetchImpl });
  const auth = new URL(await publisher.authorizationUrl('acct-a', 'science-lab'));
  await publisher.handleCallback({ code: 'code', state: auth.searchParams.get('state') });
  const director = new ChannelDirectorService({ store, videoService: {} });
  const [idea] = await director.brainstorm('acct-a', 'science-lab', { count: 1, useAi: false });
  await store.putIdea('acct-a', { ...idea, youtubeVideoId: 'yt-analytics-1', status: 'published', updatedAt: new Date().toISOString() });
  const result = await publisher.syncAnalytics('acct-a', 'science-lab', { days: 90 });
  assert.equal(result.imported, 1);
  assert.equal(result.snapshots[0].ideaId, idea.id);
  assert.equal(result.snapshots[0].impressions, 8000);
  assert.equal(result.snapshots[0].clickThroughRate, 7.5);
  assert.equal(result.snapshots[0].durationSeconds, 200);
  assert.equal(result.snapshots[0].watchTimeHours, 5);
  const stored = await store.getChannel('acct-a', 'science-lab');
  assert.ok(stored.youtube.lastAnalyticsSyncAt); assert.equal(stored.youtube.analyticsSyncError, null);
});

test('scheduler resumes autopublishing ideas that were already ready before restart', async () => {
  const readyIdea = { id: 'idea-ready', channelId: 'science-lab', status: 'ready', videoId: 'vid_ready' };
  let published = 0;
  const store = { listAllChannels: async () => [{ ownerId: 'acct-a', channel: channel({ automation: { autoPublish: true } }) }], listIdeas: async () => [readyIdea] };
  const scheduler = new ChannelScheduler({ store, director: {}, videoService: {}, publisher: { publishIdea: async () => { published++; } } });
  await scheduler.tick(new Date('2026-11-05T09:01:00.000Z'));
  assert.equal(published, 1);
});

test('analytics synchronization remains available while YouTube publishing is disabled', async () => {
  let published = 0; let synchronized = 0;
  const connected = channel({
    automation: { autoPublish: true },
    youtube: { connected: true, channelId: 'UC123', channelTitle: 'Science Lab', tokenCiphertext: 'encrypted' },
  });
  const readyIdea = { id: 'ready-idea', channelId: connected.id, status: 'ready', videoId: 'vid-ready' };
  const store = {
    listAllChannels: async () => [{ ownerId: 'acct-a', channel: connected }],
    listIdeas: async () => [readyIdea],
  };
  const publisher = {
    publishIdea: async () => { published++; },
    syncAnalytics: async () => { synchronized++; },
  };
  const scheduler = new ChannelScheduler({ store, director: {}, videoService: {}, publisher, publishingEnabled: false });
  await scheduler.tick(new Date('2026-11-13T10:00:00.000Z'));
  assert.equal(published, 0); assert.equal(synchronized, 1);
});

test('YouTube publishing failure is persisted and not left as ready for an automatic retry loop', async () => {
  const timestamp = new Date().toISOString();
  let storedIdea = { id: 'idea-ready', channelId: 'science-lab', title: 'A Ready Video', hookFormula: 'information_gap', spokenHook: 'This opening creates a clear information gap.', narrativeArc: 'Open with a question, demonstrate the answer, and close the loop clearly.', contentPillar: 'space', retentionScore: 80, titleScore: 75, status: 'ready', videoId: 'vid_ready', youtubeVideoId: null, publishAt: null, error: null, createdAt: timestamp, updatedAt: timestamp };
  const connected = channel({ youtube: { connected: true, channelId: 'UC123', channelTitle: 'Science Lab', tokenCiphertext: 'invalid' } });
  const store = { getChannel: async () => connected, getIdea: async () => storedIdea, putIdea: async (_owner, value) => { storedIdea = value; } };
  const publisher = new YouTubePublisherService({ store, videoService: {}, env: {} });
  await assert.rejects(() => publisher.publishIdea('acct-a', connected.id, storedIdea.id), /YouTube OAuth requires/);
  assert.equal(storedIdea.status, 'publish_failed');
  assert.match(storedIdea.error, /YouTube OAuth requires/);
});

test('channel HTTP API validates schedules and completes CRUD plus brainstorming', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'channel-http-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ChannelStore({ rootDir: root }); await store.init();
  const director = new ChannelDirectorService({ store, videoService: { create: async () => ({ job: { id: 'vid_http_123' }, reused: false }) } });
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.ownerId = 'acct-http'; next(); });
  app.use('/v1', createChannelApiRouter({ store, director, publisher: {} }));
  app.use('/disabled', createChannelApiRouter({ store, director, publisher: null })); app.use(videoApiErrorHandler);
  const server = app.listen(0); t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1`;
  const invalid = await fetch(`${base}/channels`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bad schedule', niche: 'science', targetAudience: 'adults', contentPillars: ['physics'], automation: { scheduleCron: '99 99 * * *' } }) });
  assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.code, 'INVALID_SCHEDULE');
  const badRange = await fetch(`${base}/channels`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bad range', niche: 'science', targetAudience: 'adults', contentPillars: ['physics'], productionDefaults: { durationRanges: { shorts: { min: 70, max: 30 }, landscape: { min: 120, max: 600 } } } }) });
  assert.equal(badRange.status, 400); assert.equal((await badRange.json()).error.code, 'INVALID_DURATION_RANGE');
  const created = await fetch(`${base}/channels`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'api-channel', name: 'API Channel', niche: 'science', archetype: 'tutorial', positioning: 'Practical experiments', targetAudience: 'adults', contentPillars: ['physics'], automation: { scheduleCron: '15 9 * * 1', timezone: 'Asia/Calcutta' } }) });
  assert.equal(created.status, 201);
  const publishingDisabled = await fetch(`http://127.0.0.1:${server.address().port}/disabled/channels`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'publishing-disabled', name: 'No Publisher', niche: 'science', targetAudience: 'adults', contentPillars: ['physics'], automation: { autoPublish: true } }) });
  assert.equal(publishingDisabled.status, 503); assert.equal((await publishingDisabled.json()).error.code, 'PUBLISHING_DISABLED');
  const patched = await fetch(`${base}/channels/api-channel`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ automation: { enabled: true } }) });
  const patchedBody = await patched.json();
  assert.equal(patched.status, 200); assert.equal(patchedBody.automation.enabled, true);
  assert.equal(patchedBody.automation.scheduleCron, '15 9 * * 1'); assert.equal(patchedBody.automation.timezone, 'Asia/Calcutta');
  assert.equal(patchedBody.archetype, 'tutorial'); assert.equal(patchedBody.positioning, 'Practical experiments');
  const performance = await fetch(`${base}/channels/api-channel/performance`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Physics Short', format: 'shorts', durationSeconds: 42, views: 1000, impressions: 4000, clickThroughRate: 6.5, averageViewPercentage: 72, subscribersGained: 12, source: 'manual' }) });
  assert.equal(performance.status, 201); assert.equal((await performance.json()).format, 'shorts');
  const csv = 'Video ID,Video title,Duration,Views,Impressions,Impressions click-through rate (%),Average percentage viewed (%)\nyt-api,API Landscape,3:20,2500,10000,7.2%,58%';
  const imported = await fetch(`${base}/channels/api-channel/performance/import`, { method: 'POST', headers: { 'content-type': 'text/csv' }, body: csv });
  const importedBody = await imported.json();
  assert.equal(imported.status, 201); assert.equal(importedBody.imported, 1); assert.equal(importedBody.snapshots[0].format, 'landscape');
  const repeatedImport = await fetch(`${base}/channels/api-channel/performance/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv, capturedAt: importedBody.snapshots[0].capturedAt }) });
  assert.equal(repeatedImport.status, 201); assert.equal((await repeatedImport.json()).snapshots[0].id, importedBody.snapshots[0].id);
  const performanceList = await fetch(`${base}/channels/api-channel/performance`);
  assert.equal((await performanceList.json()).snapshots.length, 2);
  const performanceSummary = await fetch(`${base}/channels/api-channel/performance/summary`);
  assert.equal(performanceSummary.status, 200); assert.equal((await performanceSummary.json()).sampleSize, 2);
  const brainstorm = await fetch(`${base}/channels/api-channel/ideas/brainstorm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count: 2, useAi: false }) });
  assert.equal(brainstorm.status, 201); assert.equal((await brainstorm.json()).ideas.length, 2);
  const listed = await fetch(`${base}/channels`); assert.equal((await listed.json()).channels.length, 1);
  assert.equal((await fetch(`${base}/channels/api-channel`, { method: 'DELETE' })).status, 204);
});
