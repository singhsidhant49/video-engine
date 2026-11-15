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

export const generationQueueJobId = (videoId, attempt = 0) => `video-${videoId}-${attempt}`;
export const fairQueuePriority = (sameChannelDepth = 0, queuePriority = 'normal') => {
  const tierOffset = { high: 1, normal: 10, low: 20 }[queuePriority] || 10;
  return 100 + (Math.max(0, Number(sameChannelDepth) || 0) * 100) + tierOffset;
};

const leaseLostError = (jobId) => Object.assign(
  new Error(`Queue lease lost for ${jobId}; stopping the stale processor so BullMQ can retry it safely`),
  { name: 'AbortError', code: 'QUEUE_LEASE_LOST' },
);

export class BullVideoQueue {
  constructor({ redisUrl = process.env.REDIS_URL, processJobs = false, concurrency = 1, globalConcurrency = 1, queueName = process.env.VIDEO_QUEUE_NAME || 'video-generation' } = {}) {
    if (!redisUrl) throw new Error('REDIS_URL is required for the BullMQ queue');
    this.connection = connectionFromUrl(redisUrl);
    this.processJobs = processJobs;
    this.concurrency = concurrency;
    this.globalConcurrency = Math.max(1, Number(globalConcurrency) || 1);
    this.queueName = queueName;
    this.queue = new Queue(queueName, { connection: this.connection });
    this.worker = null;
  }

  async init({ onGenerate, onDelete, onFailed } = {}) {
    await this.queue.waitUntilReady();
    // Redis enforces this across every worker replica. The VPS therefore runs
    // one expensive production at a time even if a second worker is started.
    await this.queue.setGlobalConcurrency(this.globalConcurrency);
    if (this.processJobs) {
      // BullMQ owns active-job leases and stalled-job recovery. Removing active
      // jobs here can discard work that is still owned by another worker.
      this.worker = new Worker(this.queueName, async (job, _token, signal) => {
        if (job.name === 'generate') return onGenerate(job.data.videoId, { signal, queueJobId: job.id });
        if (job.name === 'delete') return onDelete(job.data.videoId, { signal, queueJobId: job.id });
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
      const leaseCancellationRequested = new Set();
      this.worker.on('active', (job) => leaseCancellationRequested.delete(job?.id));
      this.worker.on('failed', async (job, error) => {
        console.error(`BullMQ job ${job?.id || 'unknown'} failed:`, error);
        const exhausted = Number(job?.attemptsMade || 0) >= Number(job?.opts?.attempts || 1);
        if (exhausted && job?.name === 'generate' && job?.data?.videoId && typeof onFailed === 'function') {
          await onFailed(job.data.videoId, error).catch(() => {});
        }
      });
      this.worker.on('lockRenewalFailed', (jobIds) => {
        for (const jobId of jobIds) {
          if (leaseCancellationRequested.has(jobId)) continue;
          leaseCancellationRequested.add(jobId);
          console.error(`BullMQ lease lost for ${jobId}; aborting its stale processor.`);
          this.worker?.cancelJob(jobId, leaseLostError(jobId));
        }
      });
      this.worker.on('error', (error) => {
        // lockRenewalFailed above already reports the actionable error and
        // aborts the ghost processor. Avoid printing the same stack repeatedly.
        if (!String(error?.message || '').startsWith('could not renew lock for job ')) {
          console.error('BullMQ worker error:', error);
        }
      });
      await this.worker.waitUntilReady();
    }
  }

  async enqueueGeneration(videoId, attempt = 0, { channelId = 'default', queuePriority = 'normal', delayMs = 0 } = {}) {
    const jobId = generationQueueJobId(videoId, attempt);
    let existing = await this.queue.getJob(jobId);
    if (existing && ['completed', 'failed'].includes(await existing.getState())) { await existing.remove(); existing = null; }
    if (existing) return existing;
    // Priority encodes queue depth before tier: every channel's first waiting
    // video runs before any channel's second, while high priority wins ties.
    const queued = await this.queue.getJobs(['active', 'waiting', 'prioritized', 'delayed']);
    const sameChannelDepth = queued.filter((job) => job.name === 'generate' && (job.data?.channelId || 'default') === channelId).length;
    const priority = fairQueuePriority(sameChannelDepth, queuePriority);
    return this.queue.add('generate', { videoId, attempt, channelId, queuePriority }, {
      jobId, priority, delay: Math.max(0, Number(delayMs) || 0), attempts: 3, backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 1_000 }, removeOnFail: { age: 604_800, count: 2_000 },
    });
  }

  async getGenerationPositions(videoIds = []) {
    const wanted = new Set(videoIds);
    if (!wanted.size) return {};
    const [active, queued] = await Promise.all([
      this.queue.getJobs(['active']),
      this.queue.getJobs(['prioritized', 'waiting', 'delayed']),
    ]);
    const positions = {};
    for (const job of active) if (wanted.has(job.data?.videoId)) positions[job.data.videoId] = { queuePosition: 0, queueState: 'active' };
    queued.filter((job) => job.name === 'generate').forEach((job, index) => {
      if (wanted.has(job.data?.videoId)) positions[job.data.videoId] = { queuePosition: index + 1, queueState: 'waiting' };
    });
    return positions;
  }

  async hasGeneration(videoId, attempt = 0) {
    try {
      const exact = await this.queue.getJob(generationQueueJobId(videoId, attempt));
      if (exact && ['waiting', 'active', 'delayed', 'paused', 'prioritized', 'waiting-children'].includes(await exact.getState())) return true;
      // Recognize jobs created by releases that used timestamp-suffixed IDs so
      // rolling upgrades do not duplicate work already owned by Redis.
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
      return { healthy: this.processJobs || workers.length > 0, type: 'redis-bullmq', counts, workerCount: workers.length, globalConcurrency: this.globalConcurrency };
    } catch (error) {
      return { healthy: false, type: 'redis-bullmq', code: error?.code || 'QUEUE_UNAVAILABLE' };
    }
  }

  async close() {
    if (this.worker) await this.worker.close();
    await this.queue.close();
  }
}
