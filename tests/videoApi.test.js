import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

import { CreateVideoRequestSchema, toPipelineBrief } from '../src/server/videoApiSchemas.js';
import { FileJobStore } from '../src/server/fileJobStore.js';
import { VideoJobService, resumeStageForTimelineQc } from '../src/server/videoJobService.js';
import { createApiAuth, createVideoApiRouter, videoApiErrorHandler } from '../src/server/videoApiRouter.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(read, predicate, timeoutMs = 3_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await read();
    if (predicate(value)) return value;
    await sleep(15);
  }
  throw new Error('Timed out waiting for asynchronous job state');
}

async function writeResumeCheckpoint(rendersDir, videoId) {
  const runDir = path.join(rendersDir, 'runs', videoId);
  await fs.mkdir(runDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(runDir, 'project.json'), JSON.stringify({ id: videoId })),
    fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify({ videoId, stages: {} })),
  ]);
}

test('file job store removes only stale atomic-write temp artifacts during startup', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-store-cleanup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const jobsDir = path.join(root, 'jobs');
  await fs.mkdir(jobsDir, { recursive: true });
  const stale = path.join(jobsDir, 'vid_old.json.tmp-1234-deadbeef');
  const fresh = path.join(jobsDir, 'vid_new.json.tmp-1234-cafebabe');
  const valid = path.join(jobsDir, 'vid_valid.json');
  await Promise.all([
    fs.writeFile(stale, '{}'),
    fs.writeFile(fresh, '{}'),
    fs.writeFile(valid, '{}'),
  ]);
  const old = new Date(Date.now() - (2 * 60 * 60 * 1000));
  await fs.utimes(stale, old, old);

  await new FileJobStore(root).init();

  await assert.rejects(fs.access(stale), /ENOENT/);
  await fs.access(fresh);
  await fs.access(valid);
});

test('video pagination does not skip jobs that share the same timestamp', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-pagination-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new FileJobStore(root);
  await store.init();
  const createdAt = '2026-11-14T12:00:00.000Z';
  for (const id of ['vid_same_c', 'vid_same_b', 'vid_same_a']) {
    await store.putJob({ id, ownerId: 'owner', status: 'failed', stage: 'failed', progress: 100, createdAt, updatedAt: createdAt, error: { code: 'TEST', message: 'test' } });
  }
  const service = new VideoJobService({ store });
  const first = await service.listPage('owner', { limit: 2 });
  const second = await service.listPage('owner', { limit: 2, cursor: first.nextCursor });
  assert.equal(first.videos.length, 2);
  assert.equal(second.videos.length, 1);
  assert.deepEqual(new Set([...first.videos, ...second.videos].map((video) => video.id)), new Set(['vid_same_a', 'vid_same_b', 'vid_same_c']));
});

test('video listing filters by channel and status without leaking other owners', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-channel-filters-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new FileJobStore(root);
  await store.init();
  const createdAt = '2026-11-14T12:00:00.000Z';
  const jobs = [
    { id: 'vid_alpha_done', ownerId: 'owner', status: 'completed', request: { profileId: 'alpha' } },
    { id: 'vid_alpha_queue', ownerId: 'owner', status: 'queued', request: { profileId: 'alpha' } },
    { id: 'vid_beta_done', ownerId: 'owner', status: 'completed', request: { profileId: 'beta' } },
    { id: 'vid_other_done', ownerId: 'other', status: 'completed', request: { profileId: 'alpha' } },
  ];
  for (const job of jobs) await store.putJob({ ...job, stage: job.status, progress: 0, createdAt, updatedAt: createdAt });
  const service = new VideoJobService({ store });
  const page = await service.listPage('owner', { channelId: 'alpha', statuses: ['completed'], limit: 20 });
  assert.equal(page.total, 1);
  assert.deepEqual(page.videos.map((video) => video.id), ['vid_alpha_done']);
  assert.equal(page.videos[0].channelId, 'alpha');
});

test('in-process generation queue runs multiple channels strictly one at a time', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-serial-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let active = 0; let maximumActive = 0;
  const generator = async ({ videoId }) => {
    active += 1; maximumActive = Math.max(maximumActive, active);
    await sleep(30);
    active -= 1;
    const outputPath = path.join(root, `${videoId}.mp4`);
    await fs.writeFile(outputPath, 'video');
    return { outputPath, outputFilename: path.basename(outputPath), runDir: root, durationSeconds: 10, title: videoId };
  };
  const service = new VideoJobService({ store: new FileJobStore(path.join(root, 'store')), generator, rendersDir: root, concurrency: 1 });
  await service.init();
  t.after(() => service.shutdown({ timeoutMs: 1_000 }));
  const alpha = await service.create('owner', CreateVideoRequestSchema.parse({ prompt: 'Create the alpha channel video', profileId: 'alpha' }));
  const beta = await service.create('owner', CreateVideoRequestSchema.parse({ prompt: 'Create the beta channel video', profileId: 'beta' }));
  await waitFor(async () => Promise.all([service.get('owner', alpha.job.id), service.get('owner', beta.job.id)]), (items) => items.every((item) => item.status === 'completed'));
  assert.equal(maximumActive, 1);
});

test('public prompt request maps to the existing channel-independent pipeline brief', () => {
  const request = CreateVideoRequestSchema.parse({
    prompt: 'Explain how volcanoes form',
    output: { durationSeconds: 120, aspectRatio: '16:9' },
  });
  const brief = toPipelineBrief(request);
  assert.equal(brief.prompt, request.prompt);
  assert.equal(brief.format, 'landscape');
  assert.equal(brief.durationSec, 120);
  assert.equal(brief.channel.id, 'default');
  assert.equal(brief.channel.contentType, 'auto');
});

test('auto duration and channel language survive API normalization', () => {
  const request = CreateVideoRequestSchema.parse({
    prompt: 'Explain the science of memory during sleep',
    output: { durationMode: 'auto', durationRange: { min: 150, max: 420 }, aspectRatio: '16:9' },
    creative: { language: 'hi-IN' },
  });
  const brief = toPipelineBrief(request);
  assert.equal(brief.durationMode, 'auto');
  assert.deepEqual(brief.durationRange, { min: 150, max: 420 });
  assert.equal(brief.durationSec, undefined);
  assert.equal(brief.channel.language, 'hi-IN');
});

test('duration request validation rejects inverted ranges and exact mode without seconds', () => {
  assert.throws(() => CreateVideoRequestSchema.parse({
    prompt: 'Explain a useful topic', output: { durationMode: 'auto', durationRange: { min: 90, max: 30 } },
  }), /durationRange/i);
  assert.throws(() => CreateVideoRequestSchema.parse({
    prompt: 'Explain a useful topic', output: { durationMode: 'exact' },
  }), /durationSeconds/i);
  assert.throws(() => CreateVideoRequestSchema.parse({
    prompt: 'Explain a useful topic', output: { durationMode: 'auto', durationSeconds: 60 },
  }), /durationSeconds/i);
});

test('public API accepts detailed production briefs while retaining a bounded prompt limit', () => {
  const detailed = CreateVideoRequestSchema.parse({ prompt: `Create this video. ${'visual and editorial direction '.repeat(500)}` });
  assert.ok(detailed.prompt.length > 12_000);
  assert.throws(
    () => CreateVideoRequestSchema.parse({ prompt: 'x'.repeat(50_001) }),
    /Too big|too_big|50000/i,
  );
});

test('clients can explicitly disable burned-in subtitles', () => {
  const request = CreateVideoRequestSchema.parse({ prompt: 'Create a clean client master', subtitles: { enabled: false } });
  assert.equal(toPipelineBrief(request).channel.captions, 'none');
});

test('persistent video service generates asynchronously and reuses idempotent requests', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-api-create-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  await fs.mkdir(rendersDir, { recursive: true });
  let calls = 0;
  const generator = async ({ videoId, brief, onProgress }) => {
    calls++;
    onProgress({ step: 1, message: 'scripting' });
    const runDir = path.join(rendersDir, 'runs', videoId);
    await fs.mkdir(runDir, { recursive: true });
    const outputPath = path.join(rendersDir, `${videoId}-landscape.mp4`);
    await fs.writeFile(outputPath, 'video');
    return { outputPath, outputFilename: path.basename(outputPath), runDir, durationSeconds: 12, title: brief.prompt };
  };
  const service = new VideoJobService({ store: new FileJobStore(path.join(root, 'api')), generator, rendersDir });
  await service.init();
  const request = CreateVideoRequestSchema.parse({ prompt: 'A useful test video' });
  const first = await service.create('account-a', request, 'request-1');
  assert.equal(first.job.status, 'queued');
  const completed = await waitFor(() => service.get('account-a', first.job.id), (job) => job.status === 'completed');
  assert.equal(completed.result.durationSeconds, 12);
  const duplicate = await service.create('account-a', request, 'request-1');
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.job.id, first.job.id);
  assert.equal(calls, 1);
  await assert.rejects(
    service.create('account-a', CreateVideoRequestSchema.parse({ prompt: 'A different request' }), 'request-1'),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT',
  );
});

test('completed videos recover a missing thumbnail from the final MP4 once', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-thumbnail-fallback-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  await fs.mkdir(rendersDir, { recursive: true });
  const generator = async ({ videoId }) => {
    const runDir = path.join(rendersDir, 'runs', videoId);
    const outputPath = path.join(rendersDir, `${videoId}-landscape.mp4`);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(outputPath, 'test video fixture');
    return { outputPath, outputFilename: path.basename(outputPath), runDir, durationSeconds: 90, title: 'Thumbnail recovery' };
  };
  let extractions = 0;
  const thumbnailGenerator = async ({ input, output, durationSeconds }) => {
    extractions++;
    assert.equal(durationSeconds, 90);
    await fs.access(input);
    await fs.writeFile(output, 'generated png fixture');
  };
  const service = new VideoJobService({
    store: new FileJobStore(path.join(root, 'api')), generator, rendersDir, thumbnailGenerator,
  });
  await service.init();
  const created = await service.create('account-a', CreateVideoRequestSchema.parse({ prompt: 'Recover my thumbnail' }));
  await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'completed');

  const [first, second] = await Promise.all([
    service.thumbnail('account-a', created.job.id), service.thumbnail('account-a', created.job.id),
  ]);
  assert.equal(first, second);
  assert.equal(extractions, 1);
  assert.equal(await fs.readFile(first, 'utf8'), 'generated png fixture');
  assert.equal(await service.thumbnail('account-a', created.job.id), first);
  assert.equal(extractions, 1);
});

test('video service reports real readiness and enforces bounded per-owner admission', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-api-capacity-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  await fs.mkdir(rendersDir, { recursive: true });
  const generator = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('shutdown'), { name: 'AbortError' })), { once: true });
  });
  const service = new VideoJobService({
    store: new FileJobStore(path.join(root, 'api')), generator, rendersDir,
    concurrency: 1, maxQueuedJobs: 3, maxOwnerPendingJobs: 1,
  });
  assert.equal((await service.readiness()).ready, false);
  await service.init();
  assert.equal((await service.readiness()).ready, true);
  const request = CreateVideoRequestSchema.parse({ prompt: 'A capacity-controlled video' });
  await service.create('account-a', request);
  await assert.rejects(service.create('account-a', request), (error) => error.code === 'OWNER_QUEUE_LIMIT_EXCEEDED');
  service.stopAccepting();
  assert.equal((await service.readiness()).ready, false);
  await assert.rejects(service.create('account-b', request), (error) => error.code === 'SERVICE_UNAVAILABLE');
  await service.shutdown({ timeoutMs: 5 });
});

test('per-channel admission prevents one channel from monopolizing the queue', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-channel-capacity-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const generator = ({ signal }) => new Promise((resolve, reject) => {
    const fail = () => reject(Object.assign(new Error('shutdown'), { name: 'AbortError' }));
    if (signal.aborted) fail(); else signal.addEventListener('abort', fail, { once: true });
  });
  const service = new VideoJobService({
    store: new FileJobStore(path.join(root, 'store')), generator, rendersDir: root,
    concurrency: 1, maxQueuedJobs: 10, maxOwnerPendingJobs: 10, maxChannelPendingJobs: 1,
  });
  await service.init();
  const alpha = CreateVideoRequestSchema.parse({ prompt: 'Alpha channel production', profileId: 'alpha' });
  const beta = CreateVideoRequestSchema.parse({ prompt: 'Beta channel production', profileId: 'beta' });
  await service.create('owner', alpha);
  await assert.rejects(service.create('owner', alpha), (error) => error.code === 'CHANNEL_QUEUE_LIMIT_EXCEEDED');
  assert.equal((await service.create('owner', beta)).job.channelId, 'beta');
  await service.shutdown({ timeoutMs: 5 });
});

test('one permanent deletion removes output, run artifacts, partial outputs, and the job record', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-api-delete-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  await fs.mkdir(rendersDir, { recursive: true });
  const generator = async ({ videoId }) => {
    const runDir = path.join(rendersDir, 'runs', videoId);
    await fs.mkdir(path.join(runDir, 'public'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'public', 'narration.wav'), 'audio');
    const outputPath = path.join(rendersDir, `${videoId}-landscape.mp4`);
    await fs.writeFile(outputPath, 'video');
    await fs.writeFile(path.join(rendersDir, `${videoId}-scene_001.mp4`), 'partial');
    return { outputPath, outputFilename: path.basename(outputPath), runDir, durationSeconds: 10, title: 'Delete me' };
  };
  const store = new FileJobStore(path.join(root, 'api'));
  const service = new VideoJobService({ store, generator, rendersDir });
  await service.init();
  const created = await service.create('account-a', CreateVideoRequestSchema.parse({ prompt: 'Delete this complete video' }));
  await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'completed');
  const operation = await service.requestDeletion('account-a', created.job.id);
  const deleted = await waitFor(() => service.getOperation('account-a', operation.id), (op) => op.status === 'completed');
  assert.equal(deleted.status, 'completed');
  await assert.rejects(fs.access(path.join(rendersDir, 'runs', created.job.id)));
  await assert.rejects(fs.access(path.join(rendersDir, `${created.job.id}-landscape.mp4`)));
  await assert.rejects(fs.access(path.join(rendersDir, `${created.job.id}-scene_001.mp4`)));
  await assert.rejects(service.get('account-a', created.job.id), (error) => error.code === 'VIDEO_NOT_FOUND');
  const repeated = await service.requestDeletion('account-a', created.job.id);
  assert.equal(repeated.id, operation.id);
});

test('deleting a running video cancels generation before purging its files', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-api-active-delete-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  await fs.mkdir(rendersDir, { recursive: true });
  let observedAbort = false;
  const generator = ({ videoId, signal }) => new Promise(async (resolve, reject) => {
    const runDir = path.join(rendersDir, 'runs', videoId);
    await fs.mkdir(runDir, { recursive: true });
    signal.addEventListener('abort', () => {
      observedAbort = true;
      reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    }, { once: true });
  });
  const service = new VideoJobService({ store: new FileJobStore(path.join(root, 'api')), generator, rendersDir });
  await service.init();
  const created = await service.create('account-a', CreateVideoRequestSchema.parse({ prompt: 'Delete this running video' }));
  await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'processing');
  const operation = await service.requestDeletion('account-a', created.job.id);
  await waitFor(() => service.getOperation('account-a', operation.id), (op) => op.status === 'completed');
  assert.equal(observedAbort, true);
  await assert.rejects(fs.access(path.join(rendersDir, 'runs', created.job.id)));
});

test('HTTP v1 routes require a bearer key and return asynchronous creation contracts', async (t) => {
  const apiKey = 'unit-test-key-0123456789abcdef012345';
  const service = {
    create: async (ownerId) => ({
      reused: false,
      job: { id: 'vid_http_test', status: 'queued', stage: 'queued', progress: 0, createdAt: new Date().toISOString(), ownerId },
    }),
    list: async () => [],
  };
  const app = express();
  app.use(express.json());
  app.use('/v1', createApiAuth({ apiKeys: [apiKey], production: true }), createVideoApiRouter({ service }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/videos`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'A valid video prompt' }),
  });
  assert.equal(unauthorized.status, 401);
  const accepted = await fetch(`http://127.0.0.1:${port}/v1/videos`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'A valid video prompt' }),
  });
  assert.equal(accepted.status, 202);
  const payload = await accepted.json();
  assert.equal(payload.id, 'vid_http_test');
  assert.equal(payload.statusUrl, '/v1/videos/vid_http_test');

  const queryAccepted = await fetch(`http://127.0.0.1:${port}/v1/videos?token=${apiKey}`, {
    method: 'GET',
  });
  assert.equal(queryAccepted.status, 401, 'credentials in query strings must be rejected');
});

test('production auth rejects placeholder and short API keys', () => {
  assert.throws(
    () => createApiAuth({ apiKeys: ['replace-with-a-long-random-api-key'], production: true }),
    /non-placeholder keys of at least 32 characters/,
  );
  assert.throws(
    () => createApiAuth({ apiKeys: ['too-short'], production: true }),
    /non-placeholder keys of at least 32 characters/,
  );
});

test('named API credentials preserve tenant identity across key rotation', async (t) => {
  const owners = [];
  const service = { list: async (ownerId) => { owners.push(ownerId); return []; } };
  const oldKey = 'old-rotation-key-000000000000000000000000';
  const newKey = 'new-rotation-key-000000000000000000000000';
  const app = express();
  app.use('/v1', createApiAuth({ apiKeys: [`client-a:${oldKey}`, `client-a:${newKey}`], production: true }), createVideoApiRouter({ service }));
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  for (const key of [oldKey, newKey]) await fetch(`http://127.0.0.1:${port}/v1/videos`, { headers: { authorization: `Bearer ${key}` } });
  assert.deepEqual(owners, ['acct_client-a', 'acct_client-a']);
});

test('HTTP API accepts the detailed-brief size used by production clients', async (t) => {
  let acceptedPromptLength = 0;
  const service = {
    create: async (ownerId, request) => {
      acceptedPromptLength = request.prompt.length;
      return {
        reused: false,
        job: { id: 'vid_long_prompt', status: 'queued', stage: 'queued', progress: 0, createdAt: new Date().toISOString(), ownerId },
      };
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/v1', createApiAuth(), createVideoApiRouter({ service }));
  app.use(videoApiErrorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const prompt = `Create a complete documentary. ${'Detailed visual and editorial direction. '.repeat(400)}`;
  assert.ok(prompt.length > 12_000 && prompt.length < 50_000);
  const response = await fetch(`http://127.0.0.1:${port}/v1/videos`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }),
  });
  assert.equal(response.status, 202);
  assert.equal(acceptedPromptLength, prompt.trim().length);
});

test('HTTP API returns safe JSON for malformed and oversized request bodies', async (t) => {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.use('/v1', createApiAuth(), createVideoApiRouter({ service: {} }));
  app.use(videoApiErrorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const malformed = await fetch(`http://127.0.0.1:${port}/v1/videos`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":',
  });
  assert.equal(malformed.status, 400);
  assert.match(malformed.headers.get('content-type'), /^application\/json/);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');

  const oversized = await fetch(`http://127.0.0.1:${port}/v1/videos`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'x'.repeat(2_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.match(oversized.headers.get('content-type'), /^application\/json/);
  assert.equal((await oversized.json()).error.code, 'REQUEST_TOO_LARGE');
});

test('startup recovers an interrupted permanent deletion', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-api-delete-recovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  const store = new FileJobStore(path.join(root, 'api'));
  await store.init();
  const id = 'vid_recover_delete';
  const operationId = 'del_recover_delete';
  const runDir = path.join(rendersDir, 'runs', id);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'plan.json'), '{}');
  await fs.writeFile(path.join(rendersDir, `${id}-landscape.mp4`), 'video');
  await store.putJob({ id, ownerId: 'account-a', status: 'delete_requested', deletionOperationId: operationId });
  await store.putOperation({
    id: operationId, ownerId: 'account-a', videoId: id, type: 'video.deletion',
    status: 'processing', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null,
  });
  const service = new VideoJobService({ store, generator: async () => assert.fail('generation must not restart'), rendersDir });
  await service.init();
  await waitFor(() => service.getOperation('account-a', operationId), (operation) => operation.status === 'completed');
  assert.equal(await store.getJob(id), null);
  await assert.rejects(fs.access(runDir));
  await assert.rejects(fs.access(path.join(rendersDir, `${id}-landscape.mp4`)));
});

test('post-render QC retry preserves the video ID and recompiles the timeline', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-api-retry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  await fs.mkdir(rendersDir, { recursive: true });
  const calls = [];
  const generator = async (options) => {
    calls.push({ videoId: options.videoId, resume: options.resume, from: options.from });
    if (calls.length === 1) await writeResumeCheckpoint(rendersDir, options.videoId);
    if (calls.length === 1) throw new Error('Post-render QC failed — test fixture');
    const outputPath = path.join(rendersDir, `${options.videoId}-landscape.mp4`);
    await fs.writeFile(outputPath, 'video');
    return { outputPath, outputFilename: path.basename(outputPath), runDir: path.join(rendersDir, 'runs', options.videoId), durationSeconds: 10, title: 'Retried' };
  };
  const service = new VideoJobService({ store: new FileJobStore(path.join(root, 'api')), generator, rendersDir });
  await service.init();
  const created = await service.create('account-a', CreateVideoRequestSchema.parse({ prompt: 'Retry this video safely' }));
  const failed = await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'failed');
  assert.equal(failed.error.code, 'POST_RENDER_QC_FAILED');
  assert.equal(failed.error.stage, 'preparing');
  const retried = await service.retry('account-a', created.job.id);
  assert.equal(retried.job.id, created.job.id);
  await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'completed');
  assert.deepEqual(calls, [
    { videoId: created.job.id, resume: null, from: null },
    { videoId: created.job.id, resume: created.job.id, from: 'timeline' },
  ]);
});

test('narration duration failure retries from audio without regenerating assets first', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-api-duration-retry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  await fs.mkdir(rendersDir, { recursive: true });
  const calls = [];
  const generator = async (options) => {
    calls.push({ resume: options.resume, from: options.from });
    if (calls.length === 1) await writeResumeCheckpoint(rendersDir, options.videoId);
    if (calls.length === 1) {
      const error = new Error('Narration duration repair failed: measured 292.6s; required 313.5-346.5s');
      error.code = 'NARRATION_DURATION_FAILED';
      throw error;
    }
    const outputPath = path.join(rendersDir, `${options.videoId}-landscape.mp4`);
    await fs.writeFile(outputPath, 'video');
    return { outputPath, outputFilename: path.basename(outputPath), runDir: path.join(rendersDir, 'runs', options.videoId), durationSeconds: 330, title: 'Duration repaired' };
  };
  const service = new VideoJobService({ store: new FileJobStore(path.join(root, 'api')), generator, rendersDir });
  await service.init();
  const created = await service.create('account-a', CreateVideoRequestSchema.parse({ prompt: 'Repair narration duration before assets' }));
  const failed = await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'failed');
  assert.equal(failed.error.code, 'NARRATION_DURATION_FAILED');
  assert.equal(failed.error.message, 'Narration could not meet the requested duration');
  await service.retry('account-a', created.job.id);
  await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'completed');
  assert.deepEqual(calls, [
    { resume: null, from: null },
    { resume: created.job.id, from: 'audio' },
  ]);
});

test('retry cleanly regenerates from the durable request when retention removed checkpoints', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-api-expired-retry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  await fs.mkdir(rendersDir, { recursive: true });
  const calls = [];
  const generator = async (options) => {
    calls.push({ resume: options.resume, from: options.from });
    if (calls.length === 1) throw new Error('Post-render QC failed - expired fixture');
    const outputPath = path.join(rendersDir, `${options.videoId}-landscape.mp4`);
    await fs.writeFile(outputPath, 'video');
    return { outputPath, outputFilename: path.basename(outputPath), runDir: path.join(rendersDir, 'runs', options.videoId), durationSeconds: 10, title: 'Cleanly regenerated' };
  };
  const service = new VideoJobService({ store: new FileJobStore(path.join(root, 'api')), generator, rendersDir });
  await service.init();
  const created = await service.create('account-a', CreateVideoRequestSchema.parse({ prompt: 'Recover an expired production run' }));
  await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'failed');

  await service.retry('account-a', created.job.id);
  const completed = await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'completed');

  assert.deepEqual(calls, [
    { resume: null, from: null },
    { resume: null, from: null },
  ]);
  assert.equal(completed.recovery.mode, 'clean_restart');
  assert.equal(completed.recovery.reason, 'checkpoints_expired');
});

test('a completed video can be explicitly reprocessed from alignment to repair subtitles', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-api-caption-resync-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rendersDir = path.join(root, 'renders');
  await fs.mkdir(rendersDir, { recursive: true });
  const calls = [];
  const generator = async (options) => {
    calls.push({ resume: options.resume, from: options.from });
    await writeResumeCheckpoint(rendersDir, options.videoId);
    const outputPath = path.join(rendersDir, `${options.videoId}-landscape.mp4`);
    await fs.writeFile(outputPath, `video-${calls.length}`);
    return { outputPath, outputFilename: path.basename(outputPath), runDir: path.join(rendersDir, 'runs', options.videoId), durationSeconds: 300, title: 'Caption resync' };
  };
  const service = new VideoJobService({ store: new FileJobStore(path.join(root, 'api')), generator, rendersDir });
  await service.init();
  const created = await service.create('account-a', CreateVideoRequestSchema.parse({ prompt: 'A long captioned production' }));
  await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'completed');

  await service.retry('account-a', created.job.id, { resumeFrom: 'alignment' });
  await waitFor(() => service.get('account-a', created.job.id), (job) => job.status === 'completed' && job.retryCount === 1);

  assert.deepEqual(calls, [
    { resume: null, from: null },
    { resume: created.job.id, from: 'alignment' },
  ]);
});

test('timeline QC retry restarts from audio when duration failed', () => {
  const qc = {
    checks: [
      { id: 'duration-tolerance', ok: false, severity: 'error', detail: '334s is below the requested range' },
      { id: 'content-profile-transition-share', ok: false, severity: 'error', detail: 'too few dissolves' },
    ],
  };
  assert.equal(resumeStageForTimelineQc(qc), 'audio');
});

test('timeline QC retry restarts only the stage capable of repairing its failure', () => {
  assert.equal(resumeStageForTimelineQc({
    checks: [{ id: 'alignment', ok: false, severity: 'error' }],
  }), 'alignment');
  assert.equal(resumeStageForTimelineQc({
    checks: [{ id: 'caption-timestamp-order', ok: false, severity: 'error' }],
  }), 'alignment');
  assert.equal(resumeStageForTimelineQc({
    checks: [{ id: 'content-profile-transition-share', ok: false, severity: 'error' }],
  }), 'timeline');
  assert.equal(resumeStageForTimelineQc({
    checks: [{ id: 'visual-coverage-unresolved', ok: false, severity: 'error' }],
  }), 'assets');
  assert.equal(resumeStageForTimelineQc(null), 'timeline');
});
