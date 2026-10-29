import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFacelessVideo } from '../pipeline/videoGeneratorPipeline.js';
import { config } from '../config/index.js';
import { FileJobStore } from './fileJobStore.js';
import { toPipelineBrief } from './videoApiSchemas.js';

const now = () => new Date().toISOString();
const requestHash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const publicJob = (job) => ({
  id: job.id, status: job.status, stage: job.stage, progress: job.progress,
  createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt,
  error: job.error || undefined, metadata: job.metadata || undefined,
});

function apiError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function safeGenerationFailure(error) {
  const message = String(error?.message || '');
  const known = [
    ['Narration quality gate failed', 'NARRATION_QC_FAILED', 'Narration quality checks failed'],
    ['Timeline QC failed', 'TIMELINE_QC_FAILED', 'Timeline quality checks failed'],
    ['Production render blocked by visual critic', 'VISUAL_CRITIC_FAILED', 'Visual quality review requires revision'],
    ['Production render blocked by unresolved long visual holds', 'VISUAL_PACING_FAILED', 'Visual pacing contains unresolved long holds'],
    ['Creative QA hard failure', 'CREATIVE_QC_FAILED', 'Creative quality checks failed'],
    ['Production render blocked by publishability gate', 'PUBLISHABILITY_FAILED', 'The editorial sequence did not pass publishability checks'],
    ['Production rendering requires every media-routed shot', 'UNRESOLVED_PRODUCTION_MEDIA', 'One or more shots could not resolve approved production media'],
    ['Production render blocked: Hard editorial asset failures', 'EDITORIAL_ASSET_QC_FAILED', 'One or more selected visual assets failed editorial quality checks'],
    ['Rendered-frame semantic QA failed', 'RENDERED_FRAME_QA_FAILED', 'Rendered-frame semantic quality checks failed'],
    ['Post-render QC failed', 'POST_RENDER_QC_FAILED', 'The encoded video did not pass final quality checks'],
    ['Scene/Shot "', 'RENDER_MAPPING_FAILED', 'The render plan contains a scene or shot that is missing from the timeline'],
  ];
  const match = known.find(([prefix]) => message.startsWith(prefix));
  return match
    ? { code: error?.code || match[1], message: match[2] }
    : { code: error?.code || 'GENERATION_FAILED', message: 'Video generation failed' };
}

function safeOwnedPath(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  const relative = path.relative(base, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing unsafe deletion target outside owned namespace: ${target}`);
  }
  return target;
}

export class VideoJobService {
  constructor({
    store = new FileJobStore(path.join(config.rendersDir, 'api')),
    generator = createFacelessVideo,
    rendersDir = config.rendersDir,
    concurrency = config.server.workerConcurrency,
    maxQueuedJobs = config.server.maxQueuedJobs,
    maxOwnerPendingJobs = config.server.maxOwnerPendingJobs,
    taskQueue = null,
  } = {}) {
    this.store = store;
    this.generator = generator;
    this.rendersDir = rendersDir;
    this.concurrency = Math.max(1, concurrency);
    this.maxQueuedJobs = Math.max(1, maxQueuedJobs);
    this.maxOwnerPendingJobs = Math.max(1, maxOwnerPendingJobs);
    this.taskQueue = taskQueue;
    this.queue = [];
    this.active = new Map();
    this.createChain = Promise.resolve();
    this.deletionRequests = new Map();
    this.initialized = false;
    this.accepting = false;
    this.shuttingDown = false;
  }

  async init() {
    await this.store.init();
    const jobs = await this.store.listJobs();
    for (const job of jobs) {
      if (['queued', 'preparing', 'processing'].includes(job.status)) {
        if (!this.taskQueue) {
          job.status = 'queued';
          job.stage = 'queued';
          job.progress = 0;
          job.updatedAt = now();
          await this.store.putJob(job);
          this.queue.push(job.id);
        }
      } else if (job.status === 'delete_requested') {
        const operation = job.deletionOperationId ? await this.store.getOperation(job.deletionOperationId) : null;
        if (operation?.status === 'processing') {
          operation.status = 'queued';
          operation.updatedAt = now();
          await this.store.putOperation(operation);
        }
        if (!this.taskQueue) void this.#beginDeletion(job, null);
      }
    }
    if (this.taskQueue) {
      await this.taskQueue.init({
        onGenerate: (id) => this.#runExternal(id),
        onDelete: (id) => this.#runExternalDeletion(id),
      });
      // API replicas enqueue newly-created requests but must not replay every
      // persisted job when they start. Reconciliation belongs to workers.
      for (const job of this.taskQueue.processJobs ? jobs : []) {
        if (job.status === 'queued') {
          job.resumeExisting = Boolean(job.startedAt || job.resumeExisting);
          await this.store.putJob(job);
          await this.taskQueue.enqueueGeneration(job.id, job.retryCount || 0);
        } else if (['preparing', 'processing'].includes(job.status)) {
          const queued = typeof this.taskQueue.hasGeneration === 'function'
            ? await this.taskQueue.hasGeneration(job.id, job.retryCount || 0)
            : true;
          if (!queued) {
            job.status = 'queued';
            job.stage = 'queued';
            job.resumeExisting = true;
            job.updatedAt = now();
            await this.store.putJob(job);
            await this.taskQueue.enqueueGeneration(job.id, job.retryCount || 0);
          }
        } else if (job.status === 'delete_requested' && job.deletionOperationId) {
          await this.taskQueue.enqueueDeletion(job.id, job.deletionOperationId);
        }
      }
    }
    this.initialized = true;
    this.accepting = true;
    this.#pump();
  }

  status() {
    return {
      initialized: this.initialized,
      accepting: this.accepting,
      queueDepth: this.queue.length,
      activeWorkers: this.active.size,
      workerConcurrency: this.concurrency,
    };
  }

  async readiness() {
    const storage = typeof this.store.health === 'function' ? await this.store.health() : { healthy: true, type: 'unknown' };
    const queue = this.taskQueue ? await this.taskQueue.health() : { healthy: true, type: 'in-process', counts: { waiting: this.queue.length, active: this.active.size } };
    return { ready: this.initialized && this.accepting && storage.healthy && queue.healthy, ...this.status(), storage, queue };
  }

  stopAccepting() { this.accepting = false; }

  async shutdown({ timeoutMs = config.server.shutdownTimeoutMs } = {}) {
    this.accepting = false;
    this.shuttingDown = true;
    const active = [...this.active.values()];
    if (active.length) {
      let timer;
      const timedOut = await Promise.race([
        Promise.allSettled(active.map((entry) => entry.promise)).then(() => false),
        new Promise((resolve) => { timer = setTimeout(() => resolve(true), timeoutMs); }),
      ]);
      if (timer) clearTimeout(timer);
      if (timedOut) {
        active.forEach((entry) => entry.controller.abort());
        await Promise.allSettled(active.map((entry) => entry.promise));
      }
    }
    if (this.taskQueue) await this.taskQueue.close();
    if (typeof this.store.close === 'function') await this.store.close();
  }

  create(ownerId, request, idempotencyKey) {
    const execute = () => this.#create(ownerId, request, idempotencyKey);
    const pending = this.createChain.then(execute, execute);
    this.createChain = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async #create(ownerId, request, idempotencyKey) {
    if (idempotencyKey) {
      const existing = await this.store.findByIdempotency(ownerId, idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash(request)) throw apiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with a different request');
        return { job: publicJob(existing), reused: true };
      }
    }
    if (!this.accepting) throw apiError(503, 'SERVICE_UNAVAILABLE', 'Video generation is temporarily unavailable');
    const id = `vid_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
    const timestamp = now();
    const job = {
      version: 1, id, ownerId, status: 'queued', stage: 'queued', progress: 0,
      request, pipelineBrief: toPipelineBrief(request), metadata: request.metadata || null,
      idempotencyKey: idempotencyKey || null, requestHash: requestHash(request),
      result: null, error: null, createdAt: timestamp, updatedAt: timestamp,
      startedAt: null, completedAt: null,
    };
    if (typeof this.store.createJob === 'function') {
      const created = await this.store.createJob(job, {
        maxQueuedJobs: this.maxQueuedJobs,
        maxOwnerPendingJobs: this.maxOwnerPendingJobs,
      });
      if (created.existing) {
        if (created.existing.requestHash !== job.requestHash) throw apiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with a different request');
        return { job: publicJob(created.existing), reused: true };
      }
      if (created.limit === 'global') throw apiError(429, 'QUEUE_CAPACITY_EXCEEDED', 'Video generation queue is currently full');
      if (created.limit === 'owner') throw apiError(429, 'OWNER_QUEUE_LIMIT_EXCEEDED', 'Too many videos are already pending for this API account');
    } else {
      const jobs = await this.store.listJobs();
      const pendingStatuses = new Set(['queued', 'preparing', 'processing', 'cancel_requested']);
      const globallyPending = jobs.filter((item) => pendingStatuses.has(item.status)).length;
      const ownerPending = jobs.filter((item) => item.ownerId === ownerId && pendingStatuses.has(item.status)).length;
      if (globallyPending >= this.maxQueuedJobs) throw apiError(429, 'QUEUE_CAPACITY_EXCEEDED', 'Video generation queue is currently full');
      if (ownerPending >= this.maxOwnerPendingJobs) throw apiError(429, 'OWNER_QUEUE_LIMIT_EXCEEDED', 'Too many videos are already pending for this API account');
      await this.store.putJob(job);
    }
    if (this.taskQueue) await this.taskQueue.enqueueGeneration(id, 0);
    else { this.queue.push(id); this.#pump(); }
    return { job: publicJob(job), reused: false };
  }

  async get(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    return { ...publicJob(job), ...(job.status === 'completed' ? { result: this.#publicResult(job) } : {}) };
  }

  async list(ownerId) {
    const jobs = (await this.store.listJobs()).filter((job) => job.ownerId === ownerId);
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((job) => ({
      ...publicJob(job), ...(job.status === 'completed' ? { result: this.#publicResult(job) } : {}),
    }));
  }

  async result(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (job.status !== 'completed') throw apiError(409, 'VIDEO_NOT_READY', `Video is ${job.status}`);
    return this.#publicResult(job);
  }

  async cancel(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return publicJob(job);
    const removedFromQueue = this.taskQueue
      ? await this.taskQueue.cancelGeneration(job.id, job.retryCount || 0).catch(() => false)
      : false;
    const remotelyActive = this.taskQueue && !removedFromQueue && ['preparing', 'processing'].includes(job.status);
    job.status = this.active.has(id) || remotelyActive ? 'cancel_requested' : 'cancelled';
    job.stage = job.status;
    job.updatedAt = now();
    if (job.status === 'cancelled') job.completedAt = job.updatedAt;
    await this.store.putJob(job);
    this.active.get(id)?.controller.abort();
    return publicJob(job);
  }

  requestDeletion(ownerId, id) {
    const key = `${ownerId}:${id}`;
    const existing = this.deletionRequests.get(key);
    if (existing) return existing;
    const pending = this.#requestDeletion(ownerId, id).finally(() => this.deletionRequests.delete(key));
    this.deletionRequests.set(key, pending);
    return pending;
  }

  async #requestDeletion(ownerId, id) {
    let job = await this.store.getJob(id);
    if (!job) {
      const previous = await this.store.findDeletion(ownerId, id);
      if (previous) return previous;
      throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    }
    if (job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (job.deletionOperationId) {
      const operation = await this.store.getOperation(job.deletionOperationId);
      if (operation) {
        if (operation.status === 'failed') {
          operation.status = 'queued'; operation.error = null; operation.updatedAt = now();
          await this.store.putOperation(operation);
          void this.#beginDeletion(job, this.active.get(id)?.promise);
        }
        return operation;
      }
    }
    const operation = {
      version: 1, id: `del_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`,
      type: 'video.deletion', videoId: id, ownerId, status: 'queued', error: null,
      createdAt: now(), updatedAt: now(), completedAt: null,
    };
    let durableOperation = operation;
    if (typeof this.store.requestDeletion === 'function') {
      const transition = await this.store.requestDeletion(ownerId, id, operation);
      if (transition.forbidden) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
      if (!transition.job) {
        if (transition.operation) return transition.operation;
        throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
      }
      job = transition.job;
      durableOperation = transition.operation || operation;
    } else {
      job.status = 'delete_requested';
      job.stage = 'delete_requested';
      job.deletionOperationId = operation.id;
      job.updatedAt = now();
      await Promise.all([this.store.putJob(job), this.store.putOperation(operation)]);
    }
    const active = this.active.get(id);
    active?.controller.abort();
    await this.taskQueue?.cancelGeneration(job.id, job.retryCount || 0).catch(() => false);
    if (this.taskQueue) await this.taskQueue.enqueueDeletion(id, durableOperation.id);
    else void this.#beginDeletion(job, active?.promise);
    return durableOperation;
  }

  async getOperation(ownerId, id) {
    const operation = await this.store.getOperation(id);
    if (!operation || operation.ownerId !== ownerId) throw apiError(404, 'OPERATION_NOT_FOUND', 'Operation not found');
    return operation;
  }

  async retry(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (!['failed', 'cancelled'].includes(job.status)) throw apiError(409, 'VIDEO_NOT_RETRYABLE', `Video is ${job.status}`);
    const failedCode = job.error?.code;
    job.status = 'queued';
    job.stage = 'queued';
    job.error = null;
    job.completedAt = null;
    job.updatedAt = now();
    job.retryCount = (job.retryCount || 0) + 1;
    job.resumeExisting = true;
    // A failed timeline/QC checkpoint is not reusable. Rebuild it and every
    // downstream artifact while preserving expensive script, audio and asset
    // work from the same video ID.
    job.resumeFrom = failedCode === 'TIMELINE_QC_FAILED' ? 'timeline' : null;
    await this.store.putJob(job);
    if (this.taskQueue) await this.taskQueue.enqueueGeneration(id, job.retryCount);
    else { this.queue.push(id); this.#pump(); }
    return { job: publicJob(job), reused: true };
  }

  #publicResult(job) {
    return {
      videoUrl: `/v1/videos/${job.id}/download`,
      thumbnailUrl: `/v1/videos/${job.id}/thumbnail`,
      filename: job.result?.outputFilename,
      durationSeconds: job.result?.durationSeconds,
      title: job.result?.title,
    };
  }

  async download(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (job.status !== 'completed' || !job.result?.outputPath) throw apiError(409, 'VIDEO_NOT_READY', `Video is ${job.status}`);
    const file = safeOwnedPath(this.rendersDir, job.result.outputPath);
    await fs.access(file);
    return file;
  }

  async thumbnail(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (!job.result?.runDir) throw apiError(409, 'VIDEO_NOT_READY', `Video is ${job.status}`);
    const file = safeOwnedPath(this.rendersDir, path.join(job.result.runDir, 'thumbnail.png'));
    await fs.access(file);
    return file;
  }

  #pump() {
    while (this.accepting && this.active.size < this.concurrency && this.queue.length) {
      const id = this.queue.shift();
      if (this.active.has(id)) continue;
      const controller = new AbortController();
      const entry = { controller, promise: null };
      entry.promise = this.#run(id, controller).finally(() => {
        this.active.delete(id);
        this.#pump();
      });
      this.active.set(id, entry);
    }
  }

  async #runExternal(id) {
    if (this.active.has(id)) return;
    const controller = new AbortController();
    const entry = { controller, promise: null };
    entry.promise = this.#run(id, controller).finally(() => this.active.delete(id));
    this.active.set(id, entry);
    return entry.promise;
  }

  async #runExternalDeletion(id) {
    const job = await this.store.getJob(id);
    if (!job || job.status !== 'delete_requested') return;
    return this.#beginDeletion(job, this.active.get(id)?.promise || null);
  }

  async #run(id, controller) {
    let job = await this.store.getJob(id);
    if (!job || !['queued', 'preparing', 'processing'].includes(job.status)) return;
    job.status = 'processing'; job.stage = 'preparing'; job.startedAt ||= now(); job.updatedAt = now();
    await this.store.putJob(job);
    let progressWrites = Promise.resolve();
    const cancelPoll = this.taskQueue ? setInterval(() => {
      void this.store.getJob(id).then((current) => {
        if (['cancel_requested', 'delete_requested'].includes(current?.status)) controller.abort();
      }).catch(() => {});
    }, 1_000) : null;
    try {
      const result = await this.generator({
        videoId: id, resume: job.resumeExisting ? id : null, from: job.resumeFrom || null, force: Boolean(job.resumeExisting), brief: job.pipelineBrief, signal: controller.signal,
        renderScale: job.request.output.resolution === '720p' ? 2 / 3 : 1,
        onProgress: (event) => {
          const step = Math.max(0, Number(event.step) || 0);
          const renderFraction = event.progress == null ? 0 : Math.max(0, Math.min(100, Number(event.progress))) / 100;
          job.stage = String(event.message || `stage_${step}`);
          job.progress = Math.min(99, Math.round((step / 8) * 100 + renderFraction * 10));
          job.updatedAt = now();
          const snapshot = JSON.parse(JSON.stringify(job));
          progressWrites = progressWrites.then(() => this.store.putJob(snapshot)).catch(() => {});
        },
      });
      await progressWrites;
      const latest = await this.store.getJob(id);
      if (latest?.status === 'delete_requested') return;
      if (latest?.status === 'cancel_requested') {
        job.status = 'cancelled'; job.stage = 'cancelled'; job.completedAt = now(); job.updatedAt = job.completedAt; job.error = null;
        await this.store.putJob(job);
        return;
      }
      job.status = 'completed'; job.stage = 'completed'; job.progress = 100; job.completedAt = now(); job.updatedAt = job.completedAt;
      job.result = {
        outputPath: result.outputPath, outputFilename: result.outputFilename,
        durationSeconds: result.durationSeconds, title: result.title, runDir: result.runDir,
      };
      job.resumeExisting = false;
      job.resumeFrom = null;
      await this.store.putJob(job);
    } catch (error) {
      await progressWrites;
      const latest = await this.store.getJob(id);
      if (latest?.status === 'delete_requested') return;
      const cancelled = controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'VIDEO_GENERATION_CANCELLED';
      const interruptedForShutdown = cancelled && this.shuttingDown;
      job.status = interruptedForShutdown ? 'queued' : cancelled ? 'cancelled' : 'failed';
      job.stage = job.status; job.completedAt = now(); job.updatedAt = job.completedAt;
      job.progress = interruptedForShutdown ? 0 : job.progress;
      job.completedAt = interruptedForShutdown ? null : job.completedAt;
      job.error = cancelled ? null : safeGenerationFailure(error);
      await this.store.putJob(job);
    } finally {
      if (cancelPoll) clearInterval(cancelPoll);
    }
  }

  async #beginDeletion(job, activePromise) {
    const operation = await this.store.getOperation(job.deletionOperationId);
    if (!operation || ['processing', 'completed'].includes(operation.status)) return;
    operation.status = 'processing'; operation.updatedAt = now();
    await this.store.putOperation(operation);
    try {
      if (activePromise) await activePromise.catch(() => {});
      await this.#waitForRunRelease(job.id);
      await this.#purgeVideoFiles(job);
      await this.store.deleteJob(job.id);
      operation.status = 'completed'; operation.completedAt = now(); operation.updatedAt = operation.completedAt;
      await this.store.putOperation(operation);
    } catch (error) {
      operation.status = 'failed'; operation.updatedAt = now();
      console.error(`Deletion failed for ${job.id}:`, error);
      operation.error = { code: 'DELETION_FAILED', message: 'Permanent video deletion failed' };
      await this.store.putOperation(operation);
    }
  }

  async #waitForRunRelease(id) {
    const lockFile = path.join(this.rendersDir, 'runs', id, '.lock');
    const deadline = Date.now() + Math.max(60_000, Number(process.env.VIDEO_DELETE_WAIT_MS || 600_000));
    while (Date.now() < deadline) {
      try {
        await fs.access(lockFile);
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw Object.assign(new Error(`Timed out waiting for active generation to release ${id}`), { code: 'VIDEO_DELETE_BUSY' });
  }

  async #purgeVideoFiles(job) {
    const targets = new Set();
    targets.add(safeOwnedPath(this.rendersDir, path.join(this.rendersDir, 'runs', job.id)));
    if (job.result?.outputPath) targets.add(safeOwnedPath(this.rendersDir, job.result.outputPath));
    const downloadsDir = path.join(this.rendersDir, 'downloads');
    const downloadEntries = await fs.readdir(downloadsDir, { withFileTypes: true }).catch(() => []);
    for (const entry of downloadEntries) {
      if (entry.isFile() && (entry.name === `${job.id}.mp4` || entry.name.startsWith(`${job.id}-`))) {
        targets.add(safeOwnedPath(this.rendersDir, path.join(downloadsDir, entry.name)));
      }
    }
    const rootEntries = await fs.readdir(this.rendersDir, { withFileTypes: true }).catch(() => []);
    for (const entry of rootEntries) {
      if (entry.isFile() && entry.name.startsWith(`${job.id}-`)) {
        targets.add(safeOwnedPath(this.rendersDir, path.join(this.rendersDir, entry.name)));
      }
    }
    await Promise.all([...targets].map((target) => fs.rm(target, { recursive: true, force: true })));
  }
}

export { apiError, publicJob };
