import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

import { ChannelProfileSchema } from '../src/models/channel.schema.js';
import { CreateVideoRequestSchema } from '../src/server/videoApiSchemas.js';
import { ChannelStore } from '../src/server/channelStore.js';
import { ChannelScheduler, findNextPublishSlot } from '../src/server/channelScheduler.js';
import { createChannelApiRouter } from '../src/server/channelApiRouter.js';
import { createVideoApiRouter, videoApiErrorHandler } from '../src/server/videoApiRouter.js';
import { FileJobStore } from '../src/server/fileJobStore.js';
import { VideoJobService, isAutomaticallyRetryableFailure } from '../src/server/videoJobService.js';
import { buildOwnerAlerts } from '../src/server/alertsService.js';
import { selectOptimalPackaging } from '../src/services/youtubeGrowthService.js';
import { YouTubePublisherService } from '../src/services/youtubePublisherService.js';
import { releaseRelevanceModels } from '../src/services/relevance.js';
import { releaseRunBundle } from '../src/tools/preview.js';
import { runRenderQc } from '../src/qc/renderQc.js';
import { StudioSettingsStore } from '../src/server/studioSettingsStore.js';
import { generateThumbnailHeroImage } from '../src/services/thumbnailImageService.js';

const makeChannel = (overrides = {}) => ChannelProfileSchema.parse({
  id: 'auto-lab',
  name: 'Auto Lab',
  niche: 'practical science',
  targetAudience: 'curious adults',
  contentPillars: ['physics', 'space'],
  productionDefaults: {},
  automation: {},
  youtube: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

test('selectOptimalPackaging selects highest-scoring non-fatigued title and thumbnail winners', () => {
  const idea = {
    title: 'An Overview of Physics',
    titleScore: 30,
    thumbnailConcept: 'Weak static chart',
    titleCandidates: [
      { text: 'An Overview of Physics', angle: 'overused', score: 30, selected: true },
      { text: 'Why Physics Breaks Everyday Logic', angle: 'contrarian', score: 88, selected: false },
    ],
    thumbnailCandidates: [
      { concept: 'Plain textbook page', variant: 'minimal_symbol', overlayText: 'MANY WORDS HERE TOO LONG', selected: true },
      { concept: 'High contrast floating magnet experiment', variant: 'object_closeup', overlayText: 'WHY?', selected: false },
    ],
    packagingExperiment: { titleAngle: 'overused', hookVariant: 'curiosity', thumbnailVariant: 'minimal_symbol', hypothesis: 'Test' },
  };
  const recentIdeas = Array.from({ length: 4 }, () => ({ packagingExperiment: { titleAngle: 'overused', thumbnailVariant: 'minimal_symbol' } }));
  const updated = selectOptimalPackaging(idea, {
    performanceSummary: { guidance: { reliableComparisons: { titleAngles: 'contrarian', thumbnailVariants: 'object_closeup' } } },
    recentIdeas,
  });
  assert.equal(updated.title, 'Why Physics Breaks Everyday Logic');
  assert.equal(updated.titleCandidates[1].selected, true);
  assert.equal(updated.titleCandidates[0].selected, false);
  assert.equal(updated.thumbnailConcept, 'High contrast floating magnet experiment');
  assert.equal(updated.thumbnailCandidates[1].selected, true);
});

test('findNextPublishSlot picks the next open future slot skipping occupied slots', () => {
  const from = new Date('2026-11-27T10:00:00.000Z');
  const first = findNextPublishSlot({
    expression: '0 12 * * *',
    timeZone: 'UTC',
    from,
    minLeadMinutes: 60,
    occupiedIsoDates: [],
  });
  assert.equal(first, '2026-11-27T12:00:00.000Z');
  const second = findNextPublishSlot({
    expression: '0 12 * * *',
    timeZone: 'UTC',
    from,
    minLeadMinutes: 60,
    occupiedIsoDates: ['2026-11-27T12:00:00.000Z'],
  });
  assert.equal(second, '2026-11-28T12:00:00.000Z');
});

test('billing and auth errors fail closed as non-retryable even without originalError', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-billing-fail-'));
  test.after(() => fs.rm(root, { recursive: true, force: true }));
  const service = new VideoJobService({
    store: new FileJobStore(path.join(root, 'store')),
    rendersDir: path.join(root, 'renders'),
    generator: async () => {
      throw new Error('Replicate API credit balance ran out (HTTP 402): Add credits on replicate.com');
    },
  });
  await service.init();
  const created = await service.create('acct-a', CreateVideoRequestSchema.parse({
    prompt: 'Explain dark energy cleanly',
    output: { aspectRatio: '16:9', resolution: '1080p', durationSeconds: 60 },
  }));
  for (let i = 0; i < 40; i++) {
    const job = await service.get('acct-a', created.job.id);
    if (job.status === 'failed') {
      assert.equal(job.error.code, 'PROVIDER_CREDITS_EXHAUSTED');
      assert.match(job.error.message, /Replicate credits exhausted/i);
      assert.equal(isAutomaticallyRetryableFailure(job.error), false);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail('Expected job to reach failed status');
});

test('automatic scheduler assigns calendar publishAt slot and replenishes backlog', async () => {
  const ch = makeChannel({
    automation: { enabled: true, approvalMode: 'automatic', scheduleCron: '0 12 * * *', timezone: 'UTC' },
  });
  const savedIdeas = [];
  let brainstormed = 0;
  let producedId = null;
  const store = {
    listAllChannels: async () => [{ ownerId: 'acct-a', channel: ch }],
    listIdeas: async () => [{ id: 'idea-1', channelId: ch.id, status: 'approved', compositeScore: 35, publishAt: null }],
    putChannel: async () => {},
    putIdea: async (_owner, idea) => { savedIdeas.push(idea); },
  };
  const director = {
    produce: async (_owner, _ch, ideaId) => { producedId = ideaId; },
    brainstorm: async () => { brainstormed += 1; return []; },
  };
  const scheduler = new ChannelScheduler({ store, director, videoService: {} });
  await scheduler.tick(new Date('2026-11-27T12:00:00.000Z'));
  assert.equal(producedId, 'idea-1');
  assert.equal(savedIdeas[0].publishAt, '2026-11-28T12:00:00.000Z');
  assert.equal(brainstormed, 1);
});

test('bulk video delete purges files, DB jobs, and unlinks ideas', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-bulk-delete-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  const channelStore = new ChannelStore({ rootDir: path.join(root, 'channels') });
  await channelStore.init();
  await channelStore.putChannel('acct-a', makeChannel());
  const nowIso = new Date().toISOString();
  await channelStore.putIdea('acct-a', {
    id: 'idea-linked', channelId: 'auto-lab', title: 'Linked Video Idea', hookFormula: 'information_gap',
    spokenHook: 'One overlooked detail explains this.', narrativeArc: 'Open the gap, show evidence, resolve clearly.',
    contentPillar: 'physics', retentionScore: 80, titleScore: 80, status: 'ready', videoId: 'vid_del_1',
    createdAt: nowIso, updatedAt: nowIso,
  });

  const jobStore = new FileJobStore(path.join(root, 'jobs'));
  await jobStore.init();
  for (const id of ['vid_del_1', 'vid_del_2']) {
    const runDir = path.join(rendersDir, 'runs', id);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'plan.json'), '{}');
    await fs.writeFile(path.join(rendersDir, `${id}-landscape.mp4`), 'video');
    await jobStore.putJob({ id, ownerId: 'acct-a', status: 'completed', stage: 'completed', progress: 100, createdAt: nowIso, updatedAt: nowIso, result: { outputPath: path.join(rendersDir, `${id}-landscape.mp4`) } });
  }

  const service = new VideoJobService({
    store: jobStore,
    rendersDir,
    onVideoDeleted: (job) => channelStore.unlinkDeletedVideo(job.ownerId, job.id),
  });
  await service.init();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.ownerId = 'acct-a'; next(); });
  app.use('/v1', createVideoApiRouter({ service }));
  app.use(videoApiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));

  const res = await fetch(`http://127.0.0.1:${server.address().port}/v1/videos/bulk-delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: ['vid_del_1', 'vid_del_2'] }),
  });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.requested, 2);
  assert.equal(body.operations.length, 2);

  for (let i = 0; i < 40; i++) {
    const j1 = await jobStore.getJob('vid_del_1');
    const j2 = await jobStore.getJob('vid_del_2');
    if (!j1 && !j2) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(await jobStore.getJob('vid_del_1'), null);
  assert.equal(await jobStore.getJob('vid_del_2'), null);
  await assert.rejects(fs.access(path.join(rendersDir, `${'vid_del_1'}-landscape.mp4`)));
  const updatedIdea = await channelStore.getIdea('acct-a', 'idea-linked');
  assert.equal(updatedIdea.videoId, null);
  assert.equal(updatedIdea.status, 'draft');
});

test('alerts service and calendar router expose aggregated diagnostics and YouTube account chooser', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-alerts-calendar-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ChannelStore({ rootDir: root });
  await store.init();
  await store.putChannel('acct-a', makeChannel({
    automation: { enabled: true, lastError: 'Schedule failed once', consecutiveFailures: 3 },
  }));
  const nowIso = new Date().toISOString();
  await store.putIdea('acct-a', {
    id: 'idea-cal-1', channelId: 'auto-lab', title: 'Scheduled Science Video', hookFormula: 'information_gap',
    spokenHook: 'Wait until you see this.', narrativeArc: 'Explain mechanism with clear evidence and conclusion.',
    contentPillar: 'physics', retentionScore: 84, titleScore: 82, status: 'ready', videoId: 'vid_ready_1',
    publishAt: '2026-12-01T12:00:00.000Z', createdAt: nowIso, updatedAt: nowIso,
  });

  const alerts = await buildOwnerAlerts({
    ownerId: 'acct-a',
    channelStore: store,
    videoService: {
      listPage: async () => ({
        videos: [{ id: 'vid_fail_1', channelId: 'auto-lab', status: 'failed', stage: 'assets', error: { code: 'PROVIDER_CREDITS_EXHAUSTED', message: 'Replicate credits exhausted' }, createdAt: nowIso }],
      }),
      summary: async () => ({ storageBytes: 1024 }),
    },
    readiness: { storage: { healthy: true }, queue: { healthy: true, workerCount: 1 } },
    preflight: { required: { tts: { healthy: true } } },
  });
  assert.equal(alerts.counts.critical, 2);
  assert.equal(alerts.alerts[0].severity, 'critical');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.ownerId = 'acct-a'; next(); });
  app.use('/v1', createChannelApiRouter({
    store,
    director: {},
    videoService: { get: async () => ({ id: 'vid_ready_1', status: 'completed', progress: 100 }) },
    publishingEnabled: false,
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const calRes = await fetch(`http://127.0.0.1:${server.address().port}/v1/calendar`);
  assert.equal(calRes.status, 200);
  const calBody = await calRes.json();
  assert.equal(calBody.items.length, 1);
  assert.equal(calBody.items[0].channelName, 'Auto Lab');
  assert.equal(calBody.items[0].video.status, 'completed');

  const publisher = new YouTubePublisherService({
    store,
    videoService: {},
    env: {
      YOUTUBE_CLIENT_ID: 'cid',
      YOUTUBE_CLIENT_SECRET: 'csec',
      YOUTUBE_REDIRECT_URI: 'https://video.example.com/oauth/youtube/callback',
      YOUTUBE_OAUTH_STATE_SECRET: 's'.repeat(40),
      YOUTUBE_TOKEN_ENCRYPTION_KEY: 'e'.repeat(40),
    },
  });
  const authUrl = new URL(await publisher.authorizationUrl('acct-a', 'auto-lab'));
  assert.equal(authUrl.searchParams.get('prompt'), 'consent select_account');
  await releaseRelevanceModels();

  const bundleRunDir = path.join(root, 'run-bundle-test');
  await fs.mkdir(path.join(bundleRunDir, 'remotion-bundle', 'public'), { recursive: true });
  await fs.writeFile(path.join(bundleRunDir, 'remotion-bundle', 'index.html'), '<html></html>');
  await releaseRunBundle(bundleRunDir);
  await assert.rejects(fs.access(path.join(bundleRunDir, 'remotion-bundle')));

  const missingRenderQc = await runRenderQc(path.join(root, 'does-not-exist.mp4'), {
    fps: 30, width: 1920, height: 1080, durationInFrames: 90, motionPlans: {
      m1: { durationInFrames: 90, tracks: [{ property: 'cameraScale', from: 1, to: 1.04 }] },
    }, clips: [{
      from: 0, shots: [{ id: 'shot_1', from: 0, durationInFrames: 90, motionPlanId: 'm1', asset: { type: 'image', src: 'a.jpg' } }],
    }],
  }).catch(() => null);
  assert.equal(missingRenderQc, null);
});

test('thumbnail settings persist per owner and Ideogram falls back to FLUX when credits run out', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-thumb-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const settingsStore = new StudioSettingsStore({ file: path.join(root, 'studio_settings.json'), connectionString: null });
  await settingsStore.init();
  const initial = await settingsStore.get('acct-a');
  assert.equal(initial.thumbnail.provider, 'ideogram');
  assert.equal(initial.thumbnail.model, 'p-image-ideogram');
  assert.equal(initial.thumbnail.fallbackToFlux, true);

  const updated = await settingsStore.update('acct-a', {
    thumbnail: { provider: 'ideogram', model: 'ideogram-4-5', quality: 'high', fallbackToFlux: true, fallbackModel: 'black-forest-labs/flux-dev' },
  });
  assert.equal(updated.thumbnail.model, 'ideogram-4-5');
  assert.equal((await settingsStore.get('acct-a')).thumbnail.fallbackModel, 'black-forest-labs/flux-dev');

  const sourcePng = path.join(root, 'mock-flux.png');
  await fs.writeFile(sourcePng, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]));
  const runDir = path.join(root, 'run');
  await fs.mkdir(runDir, { recursive: true });

  let fluxCalledModel = null;
  const result = await generateThumbnailHeroImage({
    concept: { overlayText: 'STOP THIS TRAP', mainSubject: 'Person staring at chess clock', layout: 'text_left_subject_right', strategicBrief: 'Dramatic chess clock moment' },
    title: 'Why You Sabotage Good Things',
    topic: 'self sabotage psychology',
    niche: 'psychology',
    runDir,
    thumbnailSettings: updated.thumbnail,
    generateIdeogram: async () => {
      throw new Error('Ideogram API credit balance ran out (HTTP 402): Add credits at https://ideogram.ai/manage-api to resume generation.');
    },
    generateFlux: async ({ model }) => {
      fluxCalledModel = model;
      return { localPath: sourcePng, model, provider: 'replicate' };
    },
  });

  assert.equal(fluxCalledModel, 'black-forest-labs/flux-dev');
  assert.equal(result.provider, 'replicate');
  assert.equal(result.fallbackUsed, true);
  assert.ok(result.dataUrl.startsWith('data:image/png;base64,'));

  let passedThumbSettings = null;
  const service = new VideoJobService({
    store: new FileJobStore(path.join(root, 'jobs')),
    rendersDir: path.join(root, 'renders'),
    settingsStore,
    generator: async ({ thumbnailSettings }) => {
      passedThumbSettings = thumbnailSettings;
      return { outputPath: sourcePng, outputFilename: 'out.mp4', durationSeconds: 30, title: 'T', runDir };
    },
  });
  await service.init();
  const created = await service.create('acct-a', CreateVideoRequestSchema.parse({
    prompt: 'Test thumbnail settings forwarding cleanly',
    output: { aspectRatio: '16:9', resolution: '1080p', durationSeconds: 30 },
  }));
  for (let i = 0; i < 40; i++) {
    const job = await service.get('acct-a', created.job.id);
    if (job.status === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(passedThumbSettings?.model, 'ideogram-4-5');
  assert.equal(passedThumbSettings?.fallbackToFlux, true);
});
