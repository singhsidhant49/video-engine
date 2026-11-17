import crypto from 'node:crypto';
import express from 'express';
import { ZodError } from 'zod-api';
import { CreateVideoRequestSchema, VisualOverridesSchema } from './videoApiSchemas.js';
import { getAudioCatalog } from '../audio/musicCatalog.js';

function ownerForKey(key) {
  return `acct_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

export function createApiAuth({ apiKeys = [], production = false, sessionAuth = null, sessionCookie = 'vf_session' } = {}) {
  const unsafeKeys = new Set([
    'replace-this-before-exposing-the-api',
    'replace-with-a-long-random-api-key',
    'replace-with-your-api-key',
  ]);
  const credentials = apiKeys.map((entry) => {
    const value = String(entry).trim();
    const separator = value.indexOf(':');
    const account = separator > 0 ? value.slice(0, separator) : '';
    const named = /^[a-zA-Z0-9_-]{3,64}$/.test(account);
    const key = named ? value.slice(separator + 1) : value;
    return { key, ownerId: named ? `acct_${account}` : ownerForKey(key) };
  });
  if (production && credentials.length === 0 && !sessionAuth) throw new Error('Administrator sessions or VIDEO_API_KEYS are required when NODE_ENV=production');
  if (production && credentials.some(({ key }) => unsafeKeys.has(key.toLowerCase()) || key.length < 32)) {
    throw new Error('VIDEO_API_KEYS must contain only non-placeholder keys of at least 32 characters in production');
  }
  // Named entries (`client-id:secret`) decouple tenant identity from a key so
  // credentials can rotate without orphaning that client's jobs.
  const allowed = credentials;
  return (req, res, next) => {
    const cookieToken = String(req.get('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
    let sessionUser = null;
    try { sessionUser = cookieToken && sessionAuth?.verify(decodeURIComponent(cookieToken)); } catch { sessionUser = null; }
    if (sessionUser) {
      req.ownerId = sessionUser.ownerId;
      req.adminUser = sessionUser;
      req.authType = 'session';
      return next();
    }
    if (allowed.length === 0 && !sessionAuth && !production) {
      req.ownerId = 'acct_local';
      req.authType = 'local';
      return next();
    }
    const authorization = req.get('authorization') || '';
    // Credentials in URLs leak through browser history, reverse-proxy logs,
    // analytics and referrer headers. Production API keys are header-only.
    const supplied = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';
    const suppliedHash = crypto.createHash('sha256').update(supplied).digest();
    const match = allowed.find(({ key }) => crypto.timingSafeEqual(suppliedHash, crypto.createHash('sha256').update(key).digest()));
    if (!match) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid administrator session or bearer API key is required' } });
    req.ownerId = match.ownerId;
    req.authType = 'api_key';
    return next();
  };
}

export function createApiRateLimit({ windowMs = 60_000, max = 120 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = req.ownerId || req.ip || 'anonymous';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) bucket = { startedAt: now, count: 0 };
    bucket.count++;
    buckets.set(key, bucket);
    res.set('ratelimit-limit', String(max));
    res.set('ratelimit-remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.set('retry-after', String(Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000))));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many API requests' } });
    }
    if (buckets.size > 10_000) for (const [id, value] of buckets) if (now - value.startedAt >= windowMs) buckets.delete(id);
    return next();
  };
}

function operationView(operation) {
  return {
    id: operation.id, type: operation.type, videoId: operation.videoId,
    status: operation.status, error: operation.error || undefined,
    createdAt: operation.createdAt, completedAt: operation.completedAt,
  };
}

const VIDEO_STATUSES = new Set(['queued', 'preparing', 'processing', 'cancel_requested', 'completed', 'failed', 'cancelled', 'delete_requested']);
function videoStatusFilter(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!status || status === 'all') return [];
  if (status === 'active') return ['queued', 'preparing', 'processing', 'cancel_requested'];
  if (status === 'finished') return ['completed', 'failed', 'cancelled'];
  if (!VIDEO_STATUSES.has(status)) throw Object.assign(new Error('Invalid video status filter'), { status: 400, code: 'INVALID_STATUS_FILTER' });
  return [status];
}

export function createVideoApiRouter({ service }) {
  const router = express.Router();
  router.param('id', (req, res, next, id) => {
    if (!/^(?:vid|del)_[a-zA-Z0-9_-]{3,160}$/.test(id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid resource ID' } });
    return next();
  });

  router.post('/videos', async (req, res, next) => {
    try {
      const request = CreateVideoRequestSchema.parse(req.body);
      const created = await service.create(req.ownerId, request, req.get('idempotency-key')?.trim());
      res.status(created.reused ? 200 : 202).json({
        ...created.job,
        statusUrl: `/v1/videos/${created.job.id}`,
        resultUrl: `/v1/videos/${created.job.id}/result`,
      });
    } catch (error) { next(error); }
  });

  router.get('/videos', async (req, res, next) => {
    try {
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
      const cursor = req.query.cursor ? String(req.query.cursor) : null;
      const channelId = req.query.channelId ? String(req.query.channelId).trim() : null;
      if (channelId && !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(channelId)) throw Object.assign(new Error('Invalid channel filter'), { status: 400, code: 'INVALID_CHANNEL_FILTER' });
      const statuses = videoStatusFilter(req.query.status);
      const format = req.query.format ? String(req.query.format) : null;
      if (format && !['shorts', 'landscape'].includes(format)) throw Object.assign(new Error('Invalid format filter'), { status: 400, code: 'INVALID_FORMAT_FILTER' });
      const parseDate = (value, end = false) => {
        if (!value) return null;
        const text = String(value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw Object.assign(new Error('Invalid date filter'), { status: 400, code: 'INVALID_DATE_FILTER' });
        const date = new Date(`${text}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
        const [year, month, day] = text.split('-').map(Number);
        if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw Object.assign(new Error('Invalid date filter'), { status: 400, code: 'INVALID_DATE_FILTER' });
        return date.toISOString();
      };
      const dateFrom = parseDate(req.query.dateFrom); const dateTo = parseDate(req.query.dateTo, true);
      const minDuration = req.query.minDuration === undefined || req.query.minDuration === '' ? null : Math.max(0, Number(req.query.minDuration));
      const maxDuration = req.query.maxDuration === undefined || req.query.maxDuration === '' ? null : Math.max(0, Number(req.query.maxDuration));
      if ((minDuration != null && !Number.isFinite(minDuration)) || (maxDuration != null && !Number.isFinite(maxDuration)) || (minDuration != null && maxDuration != null && minDuration > maxDuration)) throw Object.assign(new Error('Invalid duration filter'), { status: 400, code: 'INVALID_DURATION_FILTER' });
      const page = typeof service.listPage === 'function'
        ? await service.listPage(req.ownerId, { limit, cursor, channelId, statuses, format, dateFrom, dateTo, minDuration, maxDuration })
        : { videos: await service.list(req.ownerId, { channelId, statuses, format, dateFrom, dateTo, minDuration, maxDuration }), nextCursor: null };
      res.json(page);
    }
    catch (error) { next(error); }
  });

  router.get('/videos-summary', async (req, res, next) => {
    try { res.json(await service.summary(req.ownerId)); } catch (error) { next(error); }
  });

  router.get('/videos/:id', async (req, res, next) => {
    try { res.json(await service.get(req.ownerId, req.params.id)); }
    catch (error) { next(error); }
  });

  router.get('/videos/:id/result', async (req, res, next) => {
    try { res.json(await service.result(req.ownerId, req.params.id)); }
    catch (error) { next(error); }
  });

  router.get('/videos/:id/download', async (req, res, next) => {
    try { res.download(await service.download(req.ownerId, req.params.id)); }
    catch (error) { next(error); }
  });

  router.get('/videos/:id/thumbnail', async (req, res, next) => {
    try { res.sendFile(await service.thumbnail(req.ownerId, req.params.id)); }
    catch (error) { next(error); }
  });

  router.get('/videos/:id/manifest', async (req, res, next) => {
    try { res.sendFile(await service.deliveryArtifact(req.ownerId, req.params.id, 'manifest')); }
    catch (error) { next(error); }
  });

  router.get('/videos/:id/credits', async (req, res, next) => {
    try { res.sendFile(await service.deliveryArtifact(req.ownerId, req.params.id, 'credits')); }
    catch (error) { next(error); }
  });

  router.get('/videos/:id/visual-diagnostics', async (req, res, next) => {
    try { res.json(await service.visualDiagnostics(req.ownerId, req.params.id)); }
    catch (error) { next(error); }
  });

  router.post('/videos/:id/cancel', async (req, res, next) => {
    try { res.status(202).json(await service.cancel(req.ownerId, req.params.id)); }
    catch (error) { next(error); }
  });

  router.post('/videos/:id/retry', async (req, res, next) => {
    try {
      const resumeFrom = req.body?.resumeFrom || null;
      const allowed = new Set(['plan', 'audio', 'alignment', 'visualStrategy', 'storyboard', 'assets', 'timeline', 'package', 'preRenderQa', 'render', 'postRenderQa']);
      if (resumeFrom && !allowed.has(resumeFrom)) throw Object.assign(new Error('Invalid retry stage'), { status: 400, code: 'INVALID_RETRY_STAGE' });
      const created = await service.retry(req.ownerId, req.params.id, { resumeFrom });
      res.status(202).json({ ...created.job, statusUrl: `/v1/videos/${created.job.id}` });
    } catch (error) { next(error); }
  });

  router.patch('/videos/:id/visual-overrides', async (req, res, next) => {
    try {
      const overrides = VisualOverridesSchema.parse(req.body?.overrides || {});
      const created = await service.applyVisualOverrides(req.ownerId, req.params.id, overrides);
      res.status(202).json({ ...created.job, statusUrl: `/v1/videos/${created.job.id}` });
    } catch (error) { next(error); }
  });

  router.delete('/videos/:id', async (req, res, next) => {
    try {
      const operation = await service.requestDeletion(req.ownerId, req.params.id);
      res.status(operation.status === 'completed' ? 200 : 202).json({
        ...operationView(operation), statusUrl: `/v1/operations/${operation.id}`,
      });
    } catch (error) { next(error); }
  });

  router.get('/operations/:id', async (req, res, next) => {
    try { res.json(operationView(await service.getOperation(req.ownerId, req.params.id))); }
    catch (error) { next(error); }
  });

  router.get('/audiotracks', async (req, res, next) => {
    try { res.json({ status: 'ok', tracks: getAudioCatalog() }); }
    catch (error) { next(error); }
  });

  router.use(videoApiErrorHandler);

  return router;
}

/**
 * Keep every API failure machine-readable, including errors raised by
 * express.json() before a request reaches the /v1 router. Mount this once on
 * the router and once after the application routes.
 */
export function videoApiErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request validation failed',
        details: error.issues,
      },
    });
  }
  if (error?.type === 'entity.too.large' || Number(error?.status) === 413) {
    return res.status(413).json({
      error: { code: 'REQUEST_TOO_LARGE', message: 'JSON request body exceeds the configured size limit' },
    });
  }
  if (error?.type === 'entity.parse.failed' || (error instanceof SyntaxError && Number(error?.status) === 400)) {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON' },
    });
  }
  const status = Number(error?.status) || 500;
  const body = {
    code: error?.code || 'INTERNAL_ERROR',
    message: status >= 500 ? 'Internal server error' : String(error?.message || 'Request failed'),
  };
  if (status >= 500) console.error('Video API error:', error);
  return res.status(status).json({ error: body });
}
