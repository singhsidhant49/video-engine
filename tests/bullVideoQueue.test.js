import assert from 'node:assert/strict';
import test from 'node:test';
import { generationQueueJobId } from '../src/server/bullVideoQueue.js';
import { VideoJobService } from '../src/server/videoJobService.js';

const timestamp = new Date().toISOString();
const queuedJob = () => ({
  version: 1,
  id: 'vid_queue_lease_test',
  ownerId: 'acct-test',
  status: 'queued',
  stage: 'queued',
  progress: 0,
  request: { output: { resolution: '1080p' } },
  pipelineBrief: { prompt: 'lease recovery test' },
  metadata: null,
  retryCount: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
  startedAt: null,
  completedAt: null,
  error: null,
});

function fakeStore(initial) {
  let value = structuredClone(initial);
  return {
    init: async () => {},
    close: async () => {},
    health: async () => ({ healthy: true }),
    listJobs: async () => [structuredClone(value)],
    getJob: async (id) => id === value.id ? structuredClone(value) : null,
    putJob: async (next) => { value = structuredClone(next); return structuredClone(value); },
    current: () => structuredClone(value),
  };
}

function fakeTaskQueue({ present = true } = {}) {
  let handlers;
  let enqueueCount = 0;
  return {
    processJobs: true,
    init: async (next) => { handlers = next; },
    close: async () => {},
    health: async () => ({ healthy: true, counts: {}, workerCount: 1 }),
    hasGeneration: async () => present,
    enqueueGeneration: async () => { enqueueCount += 1; },
    handlers: () => handlers,
    enqueueCount: () => enqueueCount,
  };
}

test('generation queue IDs are deterministic for a video attempt', () => {
  assert.equal(generationQueueJobId('vid_abc', 0), 'video-vid_abc-0');
  assert.equal(generationQueueJobId('vid_abc', 2), 'video-vid_abc-2');
});

test('worker reconciliation does not duplicate an existing queued generation', async () => {
  const store = fakeStore(queuedJob());
  const taskQueue = fakeTaskQueue({ present: true });
  const service = new VideoJobService({ store, taskQueue, generator: async () => ({}) });
  await service.init();
  assert.equal(taskQueue.enqueueCount(), 0);
  await service.shutdown({ timeoutMs: 10 });
});

test('a lost BullMQ lease aborts stale work and keeps the video resumable', async () => {
  const store = fakeStore(queuedJob());
  const taskQueue = fakeTaskQueue({ present: true });
  const generator = async ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('lease lost'), { name: 'AbortError' })), { once: true });
  });
  const service = new VideoJobService({ store, taskQueue, generator });
  await service.init();

  const controller = new AbortController();
  const running = taskQueue.handlers().onGenerate(queuedJob().id, { signal: controller.signal, queueJobId: 'video-test' });
  await new Promise((resolve) => setImmediate(resolve));
  const reason = Object.assign(new Error('lease lost'), { name: 'AbortError', code: 'QUEUE_LEASE_LOST' });
  controller.abort(reason);
  await assert.rejects(running, (error) => error.code === 'QUEUE_LEASE_LOST');

  assert.equal(store.current().status, 'queued');
  assert.equal(store.current().resumeExisting, true);
  assert.equal(store.current().completedAt, null);
  await service.shutdown({ timeoutMs: 10 });
});
