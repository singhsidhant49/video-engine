import crypto from 'node:crypto';
import express from 'express';
import { ZodError } from 'zod-api';
import { CreateVideoRequestSchema } from './videoApiSchemas.js';
import { getAudioCatalog } from '../audio/musicCatalog.js';

function ownerForKey(key) {
  return `acct_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

export function createApiAuth({ apiKeys = [], production = false } = {}) {
  const unsafeKeys = new Set([
    'replace-this-before-exposing-the-api',
    'replace-with-a-long-random-api-key',
    'replace-with-your-api-key',
  ]);
  if (production && apiKeys.length === 0) throw new Error('VIDEO_API_KEYS is required when NODE_ENV=production');
  if (production && apiKeys.some((key) => unsafeKeys.has(key.toLowerCase()) || key.length < 32)) {
    throw new Error('VIDEO_API_KEYS must contain only non-placeholder keys of at least 32 characters in production');
  }
  const allowed = apiKeys.map((key) => ({ key, ownerId: ownerForKey(key) }));
  return (req, res, next) => {
    if (allowed.length === 0) {
      req.ownerId = 'acct_local';
      return next();
    }
    const authorization = req.get('authorization') || '';
    const supplied = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : (req.query?.token ? String(req.query.token).trim() : '');
    const suppliedHash = crypto.createHash('sha256').update(supplied).digest();
    const match = allowed.find(({ key }) => crypto.timingSafeEqual(suppliedHash, crypto.createHash('sha256').update(key).digest()));
    if (!match) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid bearer API key is required' } });
    req.ownerId = match.ownerId;
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

export function createVideoApiRouter({ service }) {
  const router = express.Router();

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
    try { res.json({ videos: await service.list(req.ownerId) }); }
    catch (error) { next(error); }
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

  router.post('/videos/:id/cancel', async (req, res, next) => {
    try { res.status(202).json(await service.cancel(req.ownerId, req.params.id)); }
    catch (error) { next(error); }
  });

  router.post('/videos/:id/retry', async (req, res, next) => {
    try {
      const created = await service.retry(req.ownerId, req.params.id);
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
