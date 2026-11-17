import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFacelessVideo } from '../pipeline/videoGeneratorPipeline.js';
import { config } from '../config/index.js';
import { FileJobStore } from './fileJobStore.js';
import { toPipelineBrief } from './videoApiSchemas.js';
import { ffmpeg } from '../services/ffmpeg.js';

const now = () => new Date().toISOString();
const requestHash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const publicJob = (job) => ({
  id: job.id, status: job.status, stage: job.stage, progress: job.progress,
  channelId: job.request?.profileId || job.pipelineBrief?.channel?.id || 'default',
  createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt,
  error: job.error || undefined, metadata: job.metadata || undefined,
  retryCount: job.retryCount || 0, lastError: job.lastError || undefined,
  costEstimate: job.costEstimate || undefined,
});

const estimateProviderCost = (request) => {
  const seconds = Number(request.output?.durationSeconds || request.output?.durationRange?.max || 120);
  const imageCount = request.creative?.imageSource === 'ai' ? Math.max(1, Math.ceil(seconds / (request.output?.aspectRatio === '9:16' ? 3 : 7))) : 0;
  const imageRate = Math.max(0, Number(process.env.AI_IMAGE_ESTIMATED_COST_USD || 0.003));
  const llmEstimate = Math.max(0, Number(process.env.LLM_ESTIMATED_COST_PER_VIDEO_USD || 0.02));
  return { currency: 'USD', estimated: true, imageCount, amount: Number((llmEstimate + (imageCount * imageRate)).toFixed(3)) };
};

export function resolveVideoJobTimeoutMs(job = {}, env = process.env) {
  const configured = Math.max(60_000, Number(env.VIDEO_JOB_TIMEOUT_MS || 90 * 60_000));
  const durationSeconds = Math.max(0, Number(
    job.request?.output?.durationSeconds
      || job.pipelineBrief?.durationSec
      || job.request?.output?.durationRange?.max
      || 0
  ));
  // CPU-only Remotion renders scale with output duration. Preserve the
  // configured minimum for Shorts while budgeting an additional 20 seconds of
  // processing per output second for long-form planning, assets, and render.
  const durationAware = configured + (durationSeconds * 20_000);
  const maximum = Math.max(configured, Number(env.VIDEO_JOB_MAX_TIMEOUT_MS || 12 * 60 * 60_000));
  return Math.min(maximum, Math.ceil(durationAware));
}

const matchesJobFilters = (job, { channelId = null, statuses = [], format = null, dateFrom = null, dateTo = null, minDuration = null, maxDuration = null } = {}) => {
  const jobChannelId = job.request?.profileId || job.pipelineBrief?.channel?.id || 'default';
  const jobFormat = job.request?.output?.aspectRatio === '9:16' || job.pipelineBrief?.format === 'shorts' ? 'shorts' : 'landscape';
  const duration = Number(job.result?.durationSeconds || job.request?.output?.durationSeconds || job.pipelineBrief?.durationSec || 0);
  return (!channelId || jobChannelId === channelId) && (!statuses.length || statuses.includes(job.status))
    && (!format || jobFormat === format) && (!dateFrom || job.createdAt >= dateFrom) && (!dateTo || job.createdAt <= dateTo)
    && (minDuration == null || duration >= minDuration) && (maxDuration == null || duration <= maxDuration);
};

function apiError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function safeGenerationFailure(error) {
  const message = String(error?.message || '');
  const known = [
    ['Narration quality gate failed', 'NARRATION_QC_FAILED', 'Narration quality checks failed'],
    ['Narration is ', 'SCRIPT_DURATION_BUDGET_FAILED', 'Script could not meet the selected duration before speech generation'],
    ['Narration duration repair failed', 'NARRATION_DURATION_FAILED', 'Narration could not meet the requested duration'],
    ['Kokoro TTS is unavailable', 'TTS_UNAVAILABLE', 'Voice provider is temporarily unavailable; retry will resume from voiceover'],
    ['Timeline QC failed', 'TIMELINE_QC_FAILED', 'Timeline quality checks failed'],
    ['Production render blocked by visual critic', 'VISUAL_CRITIC_FAILED', 'Visual quality review requires revision'],
    ['Production render blocked by unresolved long visual holds', 'VISUAL_PACING_FAILED', 'Visual pacing contains unresolved long holds'],
    ['Creative QA hard failure', 'CREATIVE_QC_FAILED', 'Creative quality checks failed'],
    ['Production render blocked by publishability gate', 'PUBLISHABILITY_FAILED', 'The editorial sequence did not pass publishability checks'],
    ['Production rendering requires every media-routed shot', 'UNRESOLVED_PRODUCTION_MEDIA', 'One or more shots could not resolve approved production media'],
    ['Production rendering requires every shot', 'UNRESOLVED_PRODUCTION_MEDIA', 'One or more shots could not resolve approved production media'],
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

const AUTOMATIC_RETRY_CODES = new Set([
  'GENERATION_FAILED',
  'TTS_UNAVAILABLE',
  'VIDEO_JOB_TIMEOUT',
  'RENDER_STALLED_OR_CRASHED',
  'UNRESOLVED_PRODUCTION_MEDIA',
]);

export function isAutomaticallyRetryableFailure(failure, originalError = null) {
  const message = String(originalError?.message || failure?.message || '');
  if (/authentication failed|unauthorized|invalid api key|invalid token|credit balance ran out|insufficient[_ ]funds|payment required|not configured/i.test(message)) return false;
  return AUTOMATIC_RETRY_CODES.has(failure?.code);
}

export function resumeStageForFailure(failure) {
  if (failure?.resumeFrom) return failure.resumeFrom;
  if (failure?.code === 'TTS_UNAVAILABLE') return 'audio';
  if (failure?.code === 'VIDEO_JOB_TIMEOUT' && /render/i.test(String(failure?.stage || ''))) return 'render';
  if (['UNRESOLVED_PRODUCTION_MEDIA', 'EDITORIAL_ASSET_QC_FAILED'].includes(failure?.code)) return 'assets';
  if (failure?.code === 'NARRATION_DURATION_FAILED') return 'audio';
  if (failure?.code === 'POST_RENDER_QC_FAILED') return 'timeline';
  return null;
}

const failedQcChecks = (qc) => Array.isArray(qc?.checks)
  ? qc.checks.filter((check) => check?.ok === false && check?.severity === 'error')
  : [];

export function resumeStageForTimelineQc(qc) {
  const failedIds = new Set(failedQcChecks(qc).map((check) => check.id));
  // Duration is authored by the script/TTS stages. Restarting from assets can
  // never fix it and only repeats expensive provider downloads.
  if (failedIds.has('duration-tolerance')) return 'audio';
  const assetFailures = [
    'visual-coverage-unresolved',
    'editorial-unresolved-media',
    'editorial-wrong-assets',
    'editorial-accidental-assets',
    'editorial-foreign-entity',
    'editorial-distracting-critical',
    'editorial-weak-critical-shots',
    'asset-identity-drift',
    'asset-reuse-hard-limit',
    'content-profile-video-share',
    'content-profile-image-share',
    'content-profile-structured-share',
    'content-profile-photo-run',
  ];
  if (assetFailures.some((id) => failedIds.has(id))) return 'assets';
  return 'timeline';
}

async function readTimelineQc(rendersDir, id) {
  try {
    return JSON.parse(await fs.readFile(path.join(rendersDir, 'runs', id, 'qc.json'), 'utf8'));
  } catch {
    return null;
  }
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

async function extractThumbnailFromVideo({ input, output, durationSeconds = 10 }) {
  const seekSeconds = Math.max(1, Number(durationSeconds || 10) * 0.22);
  await ffmpeg([
    '-ss', String(seekSeconds), '-i', input, '-frames:v', '1',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
    '-y', output,
  ]);
}

export class VideoJobService {
  constructor({
    store = new FileJobStore(path.join(config.rendersDir, 'api')),
    generator = createFacelessVideo,
    rendersDir = config.rendersDir,
    concurrency = config.server.workerConcurrency,
    maxQueuedJobs = config.server.maxQueuedJobs,
    maxOwnerPendingJobs = config.server.maxOwnerPendingJobs,
    maxChannelPendingJobs = config.server.maxChannelPendingJobs,
    taskQueue = null,
    thumbnailGenerator = extractThumbnailFromVideo,
  } = {}) {
    this.store = store;
    this.generator = generator;
    this.rendersDir = rendersDir;
    this.concurrency = Math.max(1, concurrency);
    this.maxQueuedJobs = Math.max(1, maxQueuedJobs);
    this.maxOwnerPendingJobs = Math.max(1, maxOwnerPendingJobs);
    this.maxChannelPendingJobs = Math.max(1, maxChannelPendingJobs);
    this.taskQueue = taskQueue;
    this.thumbnailGenerator = thumbnailGenerator;
    this.thumbnailGeneration = new Map();
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
        onGenerate: (id, options) => this.#runExternal(id, options),
        onDelete: (id) => this.#runExternalDeletion(id),
        onFailed: (id, err) => this.#handleQueueFailure(id, err),
      });
      // API replicas enqueue newly-created requests but must not replay every
      // persisted job when they start. Reconciliation belongs to workers.
      // Reconcile oldest first so a worker restart cannot reverse FIFO order
      // inside a channel while rebuilding fair queue priorities.
      const recoveryJobs = this.taskQueue.processJobs
        ? [...jobs].sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')) || String(left.id).localeCompare(String(right.id)))
        : [];
      for (const job of recoveryJobs) {
        if (job.status === 'queued') {
          const queued = typeof this.taskQueue.hasGeneration === 'function'
            ? await this.taskQueue.hasGeneration(job.id, job.retryCount || 0)
            : false;
          if (!queued) {
            job.resumeExisting = Boolean(job.startedAt || job.resumeExisting);
            await this.store.putJob(job);
            await this.taskQueue.enqueueGeneration(job.id, job.retryCount || 0, { channelId: job.request?.profileId || 'default', queuePriority: job.metadata?.queuePriority });
          }
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
            await this.taskQueue.enqueueGeneration(job.id, job.retryCount || 0, { channelId: job.request?.profileId || 'default', queuePriority: job.metadata?.queuePriority });
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
      costEstimate: estimateProviderCost(request),
      startedAt: null, completedAt: null,
    };
    if (typeof this.store.createJob === 'function') {
      const created = await this.store.createJob(job, {
        maxQueuedJobs: this.maxQueuedJobs,
        maxOwnerPendingJobs: this.maxOwnerPendingJobs,
        maxChannelPendingJobs: Math.min(this.maxChannelPendingJobs, Number(job.metadata?.maxPendingJobs) || this.maxChannelPendingJobs),
      });
      if (created.existing) {
        if (created.existing.requestHash !== job.requestHash) throw apiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with a different request');
        return { job: publicJob(created.existing), reused: true };
      }
      if (created.limit === 'global') throw apiError(429, 'QUEUE_CAPACITY_EXCEEDED', 'Video generation queue is currently full');
      if (created.limit === 'owner') throw apiError(429, 'OWNER_QUEUE_LIMIT_EXCEEDED', 'Too many videos are already pending for this API account');
      if (created.limit === 'channel') throw apiError(429, 'CHANNEL_QUEUE_LIMIT_EXCEEDED', 'This channel already has the maximum number of pending videos');
    } else {
      const jobs = await this.store.listJobs();
      const pendingStatuses = new Set(['queued', 'preparing', 'processing', 'cancel_requested']);
      const globallyPending = jobs.filter((item) => pendingStatuses.has(item.status)).length;
      const ownerPending = jobs.filter((item) => item.ownerId === ownerId && pendingStatuses.has(item.status)).length;
      const channelId = request.profileId || 'default';
      const channelPending = jobs.filter((item) => item.ownerId === ownerId && pendingStatuses.has(item.status) && (item.request?.profileId || 'default') === channelId).length;
      if (globallyPending >= this.maxQueuedJobs) throw apiError(429, 'QUEUE_CAPACITY_EXCEEDED', 'Video generation queue is currently full');
      if (ownerPending >= this.maxOwnerPendingJobs) throw apiError(429, 'OWNER_QUEUE_LIMIT_EXCEEDED', 'Too many videos are already pending for this API account');
      if (channelPending >= Math.min(this.maxChannelPendingJobs, Number(job.metadata?.maxPendingJobs) || this.maxChannelPendingJobs)) throw apiError(429, 'CHANNEL_QUEUE_LIMIT_EXCEEDED', 'This channel already has the maximum number of pending videos');
      await this.store.putJob(job);
    }
    if (this.taskQueue) await this.taskQueue.enqueueGeneration(id, 0, { channelId: request.profileId || 'default', queuePriority: job.metadata?.queuePriority });
    else { this.queue.push(id); this.#pump(); }
    return { job: publicJob(job), reused: false };
  }

  async get(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    return (await this.#withQueueDetails([{ ...publicJob(job), ...(job.status === 'completed' ? { result: this.#publicResult(job) } : {}) }]))[0];
  }

  async #withQueueDetails(videos) {
    if (!this.taskQueue || typeof this.taskQueue.getGenerationPositions !== 'function') return videos;
    const pending = videos.filter((video) => ['queued', 'preparing', 'processing'].includes(video.status));
    if (!pending.length) return videos;
    const positions = await this.taskQueue.getGenerationPositions(pending.map((video) => video.id)).catch(() => ({}));
    const estimateMinutes = config.server.estimatedJobMinutes;
    return videos.map((video) => {
      const detail = positions[video.id];
      return detail ? { ...video, ...detail, estimatedStartMinutes: detail.queuePosition * estimateMinutes } : video;
    });
  }

  async list(ownerId, filters = {}) {
    const jobs = (await this.store.listJobs()).filter((job) => job.ownerId === ownerId && matchesJobFilters(job, filters));
    return this.#withQueueDetails(jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map((job) => ({
      ...publicJob(job), ...(job.status === 'completed' ? { result: this.#publicResult(job) } : {}),
    })));
  }

  async listPage(ownerId, { limit = 50, cursor = null, channelId = null, statuses = [], format = null, dateFrom = null, dateTo = null, minDuration = null, maxDuration = null } = {}) {
    const filters = { channelId, statuses, format, dateFrom, dateTo, minDuration, maxDuration };
    if (typeof this.store.listJobsPage === 'function') {
      const page = await this.store.listJobsPage(ownerId, { limit, cursor, ...filters });
      return {
        videos: await this.#withQueueDetails(page.videos.map((job) => ({
          ...publicJob(job), ...(job.status === 'completed' ? { result: this.#publicResult(job) } : {}),
        }))),
        total: page.total,
        nextCursor: page.nextCursor,
      };
    }
    const all = await this.list(ownerId, filters);
    const separator = cursor ? cursor.lastIndexOf('|') : -1;
    const cursorDate = separator > 0 ? cursor.slice(0, separator) : cursor;
    const cursorId = separator > 0 ? cursor.slice(separator + 1) : null;
    const eligible = cursorDate ? all.filter((job) => job.createdAt < cursorDate
      || (cursorId && job.createdAt === cursorDate && job.id < cursorId)) : all;
    const videos = eligible.slice(0, limit);
    const last = videos.at(-1);
    return { videos, total: all.length, nextCursor: eligible.length > limit && last ? `${last.createdAt}|${last.id}` : null };
  }

  async summary(ownerId) {
    const jobs = (await this.store.listJobs(ownerId)).filter((job) => job.ownerId === ownerId);
    const perChannel = {}; const failureStages = {}; let storageBytes = 0; let estimatedProviderCostUsd = 0;
    for (const job of jobs) {
      const channelId = job.request?.profileId || 'default';
      const bucket = perChannel[channelId] ||= { total: 0, active: 0, completed: 0, failed: 0 };
      bucket.total++;
      if (['queued', 'preparing', 'processing', 'cancel_requested'].includes(job.status)) bucket.active++;
      if (job.status === 'completed') bucket.completed++;
      if (job.status === 'failed') { bucket.failed++; const stage = job.error?.stage || job.error?.resumeFrom || job.error?.code || 'unknown'; failureStages[stage] = (failureStages[stage] || 0) + 1; }
      storageBytes += Number(job.result?.delivery?.bytes || 0);
      estimatedProviderCostUsd += Number(job.costEstimate?.amount || 0);
    }
    return { total: jobs.length, perChannel, failureStages, storageBytes, estimatedProviderCostUsd: Number(estimatedProviderCostUsd.toFixed(2)) };
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

  async retry(ownerId, id, { resumeFrom = null } = {}) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (!['failed', 'cancelled', 'cancel_requested'].includes(job.status)) throw apiError(409, 'VIDEO_NOT_RETRYABLE', `Video is ${job.status}`);
    const failedCode = job.error?.code;
    job.status = 'queued';
    job.stage = 'queued';
    job.error = null;
    job.completedAt = null;
    job.updatedAt = now();
    job.retryCount = (job.retryCount || 0) + 1;
    // A user-requested retry starts a fresh bounded recovery budget. Automatic
    // retries remain isolated per failure stage below.
    job.automaticRetryCounts = {};
    job.resumeExisting = true;
    // Resume from the earliest stage capable of repairing the failed check.
    // This avoids repeating asset downloads for narration-duration failures.
    const timelineQc = failedCode === 'TIMELINE_QC_FAILED'
      ? await readTimelineQc(this.rendersDir, id)
      : null;
    job.resumeFrom = failedCode === 'POST_RENDER_QC_FAILED'
      ? 'timeline'
      : (failedCode === 'NARRATION_DURATION_FAILED'
          ? 'audio'
          : (failedCode === 'TIMELINE_QC_FAILED' ? resumeStageForTimelineQc(timelineQc) : null));
    if (resumeFrom) job.resumeFrom = resumeFrom;
    await this.store.putJob(job);
    if (this.taskQueue) await this.taskQueue.enqueueGeneration(id, job.retryCount, { channelId: job.request?.profileId || 'default', queuePriority: job.metadata?.queuePriority });
    else { this.queue.push(id); this.#pump(); }
    return { job: publicJob(job), reused: true };
  }

  async applyVisualOverrides(ownerId, id, overrides) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (['queued', 'preparing', 'processing', 'cancel_requested', 'delete_requested'].includes(job.status)) {
      throw apiError(409, 'VIDEO_ACTIVE', 'Visual overrides can only be applied when generation is not active');
    }
    job.request = { ...job.request, visualOverrides: overrides };
    job.pipelineBrief = { ...job.pipelineBrief, visualOverrides: overrides };
    job.status = 'queued'; job.stage = 'queued'; job.error = null; job.completedAt = null; job.updatedAt = now();
    job.retryCount = (job.retryCount || 0) + 1;
    job.resumeExisting = true;
    job.resumeFrom = Object.values(overrides).some((override) => override.asset) ? 'assets' : 'timeline';
    await this.store.putJob(job);
    if (this.taskQueue) await this.taskQueue.enqueueGeneration(id, job.retryCount, { channelId: job.request?.profileId || 'default', queuePriority: job.metadata?.queuePriority });
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
      sha256: job.result?.delivery?.sha256,
      bytes: job.result?.delivery?.bytes,
      manifestUrl: `/v1/videos/${job.id}/manifest`,
      creditsUrl: `/v1/videos/${job.id}/credits`,
      package: job.result?.package || null,
      thumbnailError: job.result?.thumbnailError || null,
    };
  }

  async packaging(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (job.status !== 'completed') throw apiError(409, 'VIDEO_NOT_READY', `Video is ${job.status}`);
    return job.result?.package || null;
  }

  async visualDiagnostics(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    const runDir = safeOwnedPath(this.rendersDir, path.join(this.rendersDir, 'runs', id));
    const artifacts = {
      promptSpecs: 'image-prompt-specs.json',
      candidates: 'image-candidate-evaluations.json',
      inspections: 'visual-inspections.json',
      judgments: 'editorial-asset-judgments.json',
      overrides: 'manual-visual-overrides.json',
      critic: 'visual_critic.json',
      qc: 'qc.json',
    };
    const result = {};
    for (const [key, filename] of Object.entries(artifacts)) {
      try { result[key] = JSON.parse(await fs.readFile(path.join(runDir, filename), 'utf8')); } catch { result[key] = null; }
    }
    return { videoId: id, status: job.status, artifacts: result };
  }

  async download(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (job.status !== 'completed' || !job.result?.outputPath) throw apiError(409, 'VIDEO_NOT_READY', `Video is ${job.status}`);
    const file = safeOwnedPath(this.rendersDir, job.result.outputPath);
    try {
      await fs.access(file);
    } catch {
      throw apiError(404, 'OUTPUT_FILE_NOT_FOUND', 'Video file not found on disk');
    }
    return file;
  }

  async thumbnail(ownerId, id) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (job.status !== 'completed' || !job.result?.runDir || !job.result?.outputPath) {
      throw apiError(409, 'VIDEO_NOT_READY', `Video is ${job.status}`);
    }
    const file = safeOwnedPath(this.rendersDir, path.join(job.result.runDir, 'thumbnail.png'));
    try {
      await fs.access(file);
      return file;
    } catch {
      // Recover thumbnails for old videos or successful productions whose
      // dedicated thumbnail render failed.
    }

    let pending = this.thumbnailGeneration.get(id);
    if (!pending) {
      pending = (async () => {
        const input = safeOwnedPath(this.rendersDir, job.result.outputPath);
        await fs.access(input).catch(() => { throw apiError(404, 'OUTPUT_FILE_NOT_FOUND', 'Video file not found on disk'); });
        await fs.mkdir(path.dirname(file), { recursive: true });
        const temporary = path.join(path.dirname(file), `.thumbnail-${process.pid}-${crypto.randomUUID()}.png`);
        try {
          await this.thumbnailGenerator({ input, output: temporary, durationSeconds: job.result.durationSeconds });
          try {
            await fs.rename(temporary, file);
          } catch (error) {
            // Another API replica may have generated it concurrently.
            await fs.access(file).catch(() => { throw error; });
          }
        } finally {
          await fs.rm(temporary, { force: true }).catch(() => {});
        }
      })().finally(() => this.thumbnailGeneration.delete(id));
      this.thumbnailGeneration.set(id, pending);
    }
    try {
      await pending;
    } catch (error) {
      if (error?.status) throw error;
      console.warn(`Thumbnail fallback failed for ${id}: ${error.message}`);
      throw apiError(500, 'THUMBNAIL_GENERATION_FAILED', 'Thumbnail could not be generated');
    }
    return file;
  }

  async deliveryArtifact(ownerId, id, kind) {
    const job = await this.store.getJob(id);
    if (!job || job.ownerId !== ownerId) throw apiError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (job.status !== 'completed') throw apiError(409, 'VIDEO_NOT_READY', `Video is ${job.status}`);
    const suffix = kind === 'manifest' ? 'delivery.json' : kind === 'credits' ? 'credits.txt' : null;
    if (!suffix) throw apiError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found');
    const file = safeOwnedPath(this.rendersDir, path.join(this.rendersDir, `${job.id}.${suffix}`));
    try { await fs.access(file); } catch { throw apiError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found'); }
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

  async #runExternal(id, { signal = null } = {}) {
    if (this.active.has(id)) return this.active.get(id).promise;
    const controller = new AbortController();
    const abortFromQueue = () => controller.abort(signal?.reason || Object.assign(new Error('Queue processor cancelled'), { name: 'AbortError' }));
    if (signal?.aborted) abortFromQueue();
    else signal?.addEventListener('abort', abortFromQueue, { once: true });
    const entry = { controller, promise: null };
    entry.promise = this.#run(id, controller, { queueSignal: signal }).finally(() => {
      signal?.removeEventListener('abort', abortFromQueue);
      this.active.delete(id);
    });
    this.active.set(id, entry);
    return entry.promise;
  }

  async #runExternalDeletion(id) {
    const job = await this.store.getJob(id);
    if (!job || job.status !== 'delete_requested') return;
    return this.#beginDeletion(job, this.active.get(id)?.promise || null);
  }

  async #handleQueueFailure(id, err) {
    const job = await this.store.getJob(id);
    if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) return;
    job.status = 'failed';
    job.stage = 'failed';
    job.error = {
      code: 'RENDER_STALLED_OR_CRASHED',
      message: err?.message || 'Worker process crashed or stalled during rendering',
    };
    job.completedAt = now();
    job.updatedAt = now();
    await this.store.putJob(job);
  }

  async #run(id, controller, { queueSignal = null } = {}) {
    let job = await this.store.getJob(id);
    if (!job || !['queued', 'preparing', 'processing'].includes(job.status)) return;
    job.status = 'processing'; job.stage = 'preparing'; job.startedAt ||= now(); job.updatedAt = now();
    await this.store.putJob(job);
    let progressWrites = Promise.resolve();
    let timedOut = false;
    const jobTimeoutMs = resolveVideoJobTimeoutMs(job);
    const jobTimeout = setTimeout(() => { timedOut = true; controller.abort(); }, jobTimeoutMs);
    const cancelPoll = this.taskQueue ? setInterval(() => {
      void this.store.getJob(id).then((current) => {
        if (['cancel_requested', 'delete_requested'].includes(current?.status)) controller.abort();
      }).catch(() => {});
    }, 1_000) : null;
    try {
      const result = await this.generator({
        // Resume checkpoints, but never force-break a live run-directory lock.
        // Stale locks are detected by PID/host/heartbeat in the lock manager.
        videoId: id, resume: job.resumeExisting ? id : null, from: job.resumeFrom || null, force: false, brief: job.pipelineBrief, signal: controller.signal,
        renderScale: job.request.output.resolution === '720p' ? 2 / 3 : 1,
        onProgress: (event) => {
          const step = Math.max(0, Number(event.step) || 0);
          const renderFraction = event.progress == null ? 0 : Math.max(0, Math.min(100, Number(event.progress))) / 100;
          job.stage = String(event.message || `stage_${step}`);
          job.progress = Math.min(99, Math.round((step / 8) * 100 + renderFraction * 10));
          job.updatedAt = now();
          const snapshot = JSON.parse(JSON.stringify(job));
          progressWrites = progressWrites.then(() => this.store.putJob(snapshot)).catch((error) => {
            console.error(`Failed to persist progress for ${id}:`, error?.message || error);
          });
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
        delivery: result.delivery || null, package: result.package || null,
        thumbnailError: result.thumbnailError || null,
      };
      job.resumeExisting = false;
      job.resumeFrom = null;
      await this.store.putJob(job);
    } catch (error) {
      console.error(`❌ [Job ${id}] Video generation error:`, error);
      await progressWrites;
      const failedStage = job.stage;
      const latest = await this.store.getJob(id);
      if (latest?.status === 'delete_requested') return;
      const cancelled = !timedOut && (controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'VIDEO_GENERATION_CANCELLED');
      const queueAbortReason = queueSignal?.reason;
      const leaseLost = cancelled && queueAbortReason?.code === 'QUEUE_LEASE_LOST';
      const interruptedForShutdown = cancelled && this.shuttingDown;
      const recoverableInterruption = interruptedForShutdown || leaseLost;
      job.status = recoverableInterruption ? 'queued' : cancelled ? 'cancelled' : 'failed';
      job.stage = job.status; job.completedAt = now(); job.updatedAt = job.completedAt;
      job.progress = recoverableInterruption ? 0 : job.progress;
      job.completedAt = recoverableInterruption ? null : job.completedAt;
      if (recoverableInterruption) job.resumeExisting = true;
      job.error = timedOut ? { code: 'VIDEO_JOB_TIMEOUT', message: `Video generation exceeded ${Math.round(jobTimeoutMs / 60_000)} minutes` } : cancelled ? null : safeGenerationFailure(error);
      if (job.error) job.error.stage = failedStage;
      if (job.error?.code === 'TIMELINE_QC_FAILED') {
        const timelineQc = await readTimelineQc(this.rendersDir, id);
        const failures = failedQcChecks(timelineQc);
        job.error.failedChecks = failures.map(({ id: checkId, detail }) => ({ id: checkId, detail }));
        job.error.resumeFrom = resumeStageForTimelineQc(timelineQc);
      }
      const automaticRetryLimit = Math.max(0, Number(process.env.VIDEO_AUTOMATIC_RETRY_LIMIT ?? 2));
      const automaticResumeFrom = resumeStageForFailure(job.error);
      const automaticRetryKey = `${job.error?.code || 'GENERATION_FAILED'}:${automaticResumeFrom || failedStage || 'unknown'}`;
      const automaticRetryCounts = { ...(job.automaticRetryCounts || {}) };
      const stageRetryCount = Math.max(0, Number(automaticRetryCounts[automaticRetryKey] || 0));
      const canAutomaticallyRetry = !cancelled && this.taskQueue
        && stageRetryCount < automaticRetryLimit
        && isAutomaticallyRetryableFailure(job.error, error);
      if (canAutomaticallyRetry) {
        const retryNumber = (job.retryCount || 0) + 1;
        const stageRetryNumber = stageRetryCount + 1;
        const delayMs = Math.min(15 * 60_000, 30_000 * (2 ** (stageRetryNumber - 1)));
        job.lastError = job.error;
        job.error = null;
        job.status = 'queued';
        job.stage = 'queued';
        job.completedAt = null;
        job.updatedAt = now();
        job.retryCount = retryNumber;
        job.automaticRetryCounts = { ...automaticRetryCounts, [automaticRetryKey]: stageRetryNumber };
        job.resumeExisting = true;
        job.resumeFrom = automaticResumeFrom;
        await this.store.putJob(job);
        await this.taskQueue.enqueueGeneration(id, retryNumber, {
          channelId: job.request?.profileId || 'default',
          queuePriority: job.metadata?.queuePriority,
          delayMs,
        });
      } else {
        await this.store.putJob(job);
      }
      // Let BullMQ retain/retry the queue item instead of marking an interrupted
      // processor complete while the durable video record is still queued.
      if (recoverableInterruption && this.taskQueue) throw (queueAbortReason || error);
    } finally {
      if (cancelPoll) clearInterval(cancelPoll);
      clearTimeout(jobTimeout);
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
      if (entry.isFile() && (entry.name.startsWith(`${job.id}-`) || entry.name === `${job.id}.credits.txt` || entry.name === `${job.id}.delivery.json`)) {
        targets.add(safeOwnedPath(this.rendersDir, path.join(this.rendersDir, entry.name)));
      }
    }
    await Promise.all([...targets].map((target) => fs.rm(target, { recursive: true, force: true })));
  }
}

export { apiError, publicJob };
