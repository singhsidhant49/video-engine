import { Queue, Worker } from 'bullmq';

const connectionFromUrl = (url) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number(parsed.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
  };
};

export class BullVideoQueue {
  constructor({ redisUrl = process.env.REDIS_URL, processJobs = false, concurrency = 1, queueName = process.env.VIDEO_QUEUE_NAME || 'video-generation' } = {}) {
    if (!redisUrl) throw new Error('REDIS_URL is required for the BullMQ queue');
    this.connection = connectionFromUrl(redisUrl);
    this.processJobs = processJobs;
    this.concurrency = concurrency;
    this.queueName = queueName;
    this.queue = new Queue(queueName, { connection: this.connection });
    this.worker = null;
  }

  async init({ onGenerate, onDelete, onFailed } = {}) {
    await this.queue.waitUntilReady();
    if (this.processJobs) {
      // BullMQ owns active-job leases and stalled-job recovery. Removing active
      // jobs here can discard work that is still owned by another worker.
      this.worker = new Worker(this.queueName, async (job) => {
        if (job.name === 'generate') return onGenerate(job.data.videoId);
        if (job.name === 'delete') return onDelete(job.data.videoId);
        throw new Error(`Unknown video queue task: ${job.name}`);
      }, {
        connection: this.connection,
        concurrency: this.concurrency,
        // Rendering can keep Chromium/FFmpeg busy for minutes. Keep the Redis
        // lease long and renew it frequently so temporary CPU saturation does
        // not make BullMQ duplicate or fail a healthy render.
        lockDuration: Number(process.env.VIDEO_QUEUE_LOCK_MS || 600_000),
        lockRenewTime: Number(process.env.VIDEO_QUEUE_LOCK_RENEW_MS || 30_000),
        stalledInterval: Number(process.env.VIDEO_QUEUE_STALLED_INTERVAL_MS || 60_000),
        maxStalledCount: Number(process.env.VIDEO_QUEUE_MAX_STALLED_COUNT || 2),
      });
      this.worker.on('failed', async (job, error) => {
        console.error(`BullMQ job ${job?.id || 'unknown'} failed:`, error);
        if (job?.name === 'generate' && job?.data?.videoId && typeof onFailed === 'function') {
          await onFailed(job.data.videoId, error).catch(() => {});
        }
      });
      await this.worker.waitUntilReady();
    }
  }

  async enqueueGeneration(videoId, attempt = 0) {
    const jobId = `video-${videoId}-${attempt}-${Date.now()}`;
    return this.queue.add('generate', { videoId, attempt }, {
      jobId, attempts: 1,
      removeOnComplete: { age: 86_400, count: 1_000 }, removeOnFail: { age: 604_800, count: 2_000 },
    });
  }

  async hasGeneration(videoId) {
    try {
      const jobs = await this.queue.getJobs(['waiting', 'active', 'delayed', 'paused', 'prioritized']);
      return jobs.some((j) => j?.data?.videoId === videoId);
    } catch {
      return false;
    }
  }

  async cancelGeneration(videoId) {
    try {
      const jobs = await this.queue.getJobs(['waiting', 'delayed', 'waiting-children', 'paused']);
      let removed = false;
      for (const job of jobs) {
        if (job?.data?.videoId === videoId) {
          await job.remove().catch(() => {});
          removed = true;
        }
      }
      return removed;
    } catch {
      return false;
    }
  }

  async enqueueDeletion(videoId, operationId) {
    await this.queue.add('delete', { videoId }, {
      jobId: `delete-${operationId}`, attempts: 3, backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 86_400, count: 1_000 }, removeOnFail: { age: 604_800, count: 2_000 },
    });
  }

  async health() {
    try {
      const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      const workers = await this.queue.getWorkers();
      return { healthy: this.processJobs || workers.length > 0, type: 'redis-bullmq', counts, workerCount: workers.length };
    } catch (error) {
      return { healthy: false, type: 'redis-bullmq', code: error?.code || 'QUEUE_UNAVAILABLE' };
    }
  }

  async close() {
    if (this.worker) await this.worker.close();
    await this.queue.close();
  }
}
