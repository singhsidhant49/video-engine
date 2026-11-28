import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import 'dotenv/config';
import { BullVideoQueue } from '../src/server/bullVideoQueue.js';
import { PostgresJobStore } from '../src/server/postgresJobStore.js';

const databasePassword = encodeURIComponent(process.env.POSTGRES_PASSWORD || 'video_dev_password');
const databaseUrl = process.env.DATABASE_TEST_URL || process.env.DATABASE_URL
  || `postgresql://video:${databasePassword}@127.0.0.1:${process.env.POSTGRES_PORT || 54320}/videogenerator`;
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:63790/0';
const id = `infra_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const queueName = `video-infrastructure-test-${id}`;
const timestamp = new Date().toISOString();
const store = new PostgresJobStore({ connectionString: databaseUrl });
const queue = new BullVideoQueue({ redisUrl, processJobs: true, concurrency: 1, queueName });

try {
  await store.init();
  assert.equal((await store.health()).healthy, true);
  await store.putJob({
    id, ownerId: 'infra-test', status: 'queued', stage: 'queued', progress: 0,
    idempotencyKey: id, requestHash: id, createdAt: timestamp, updatedAt: timestamp,
  });
  assert.equal((await store.getJob(id)).id, id);

  let resolveDelivery;
  const delivered = new Promise((resolve) => { resolveDelivery = resolve; });
  await queue.init({ onGenerate: async (videoId) => resolveDelivery(videoId), onDelete: async () => {} });
  await queue.enqueueGeneration(id, 0);
  const result = await Promise.race([
    delivered,
    new Promise((_, reject) => setTimeout(() => reject(new Error('BullMQ delivery timed out')), 10_000)),
  ]);
  assert.equal(result, id);
  assert.equal((await queue.health()).healthy, true);
  console.log('Docker infrastructure OK: PostgreSQL persistence and BullMQ delivery verified.');
} finally {
  await store.deleteJob(id).catch(() => {});
  await queue.close().catch(() => {});
  await store.close().catch(() => {});
}
