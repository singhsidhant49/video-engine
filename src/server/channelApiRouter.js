import express from 'express';
import { ChannelInputSchema, ChannelPatchSchema, ChannelPerformanceInputSchema, ChannelPerformanceSnapshotSchema, ChannelProfileSchema, IdeaPatchSchema, publicChannel, publicIdea } from '../models/channel.schema.js';
import { parseCron } from './channelScheduler.js';
import { importYouTubeAnalyticsCsv } from '../services/youtubeAnalyticsImportService.js';
import { summarizeChannelPerformance } from '../services/youtubeGrowthService.js';

const errorWith = (status, code, message) => Object.assign(new Error(message), { status, code });
const IDEA_STATUSES = new Set(['draft', 'approved', 'queued', 'producing', 'ready', 'publishing', 'publish_failed', 'published', 'rejected', 'failed']);

function validateAutomation(automation) {
  try {
    if (automation?.scheduleCron) parseCron(automation.scheduleCron);
    if (automation?.timezone) new Intl.DateTimeFormat('en-US', { timeZone: automation.timezone }).format();
  } catch (error) { throw errorWith(400, 'INVALID_SCHEDULE', error.message); }
}

function validateProduction(production) {
  if (!production?.durationRanges) return;
  for (const [format, range] of Object.entries(production.durationRanges)) {
    if (range?.min != null && range?.max != null && range.min > range.max) throw errorWith(400, 'INVALID_DURATION_RANGE', `${format} minimum duration cannot exceed maximum duration`);
  }
}

export function createChannelApiRouter({ store, director, videoService = null, publisher = null, publishingEnabled = Boolean(publisher) }) {
  const router = express.Router();
  router.get('/channels', async (req, res, next) => {
    try { res.json({ channels: (await store.listChannels(req.ownerId)).map(publicChannel), publishingEnabled }); } catch (error) { next(error); }
  });

  router.get('/calendar', async (req, res, next) => {
    try {
      const channelFilter = req.query.channelId ? String(req.query.channelId).trim() : null;
      const fromMs = req.query.from ? Date.parse(String(req.query.from)) : null;
      const toMs = req.query.to ? Date.parse(String(req.query.to)) : null;
      const channels = (await store.listChannels(req.ownerId)).filter((ch) => !channelFilter || ch.id === channelFilter);
      const ideasLists = await Promise.all(channels.map((channel) => store.listIdeas(req.ownerId, channel.id)));
      const videoCache = new Map();
      const getVideo = async (videoId) => {
        if (!videoId || !videoService || typeof videoService.get !== 'function') return null;
        if (videoCache.has(videoId)) return videoCache.get(videoId);
        const video = await videoService.get(req.ownerId, videoId).catch(() => null);
        videoCache.set(videoId, video);
        return video;
      };
      const items = [];
      for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        for (const idea of ideasLists[i] || []) {
          if (idea.status === 'rejected') continue;
          const slotIso = idea.publishAt || null;
          if ((fromMs || toMs) && slotIso) {
            const slotMs = Date.parse(slotIso);
            if (Number.isFinite(fromMs) && slotMs < fromMs) continue;
            if (Number.isFinite(toMs) && slotMs > toMs) continue;
          }
          const video = await getVideo(idea.videoId);
          items.push({
            ...publicIdea(idea),
            channelName: channel.name,
            channelNiche: channel.niche,
            timezone: channel.automation?.timezone || 'UTC',
            youtubeConnected: Boolean(channel.youtube?.connected),
            youtubeChannelTitle: channel.youtube?.channelTitle || null,
            autoPublish: Boolean(channel.automation?.autoPublish),
            publishPrivacy: channel.automation?.publishPrivacy || 'private',
            video: video ? {
              id: video.id,
              status: video.status,
              stage: video.stage,
              progress: video.progress,
              error: video.error || null,
              durationSeconds: video.result?.durationSeconds || null,
            } : null,
          });
        }
      }
      items.sort((a, b) => {
        const aTime = a.publishAt ? Date.parse(a.publishAt) : Number.MAX_SAFE_INTEGER;
        const bTime = b.publishAt ? Date.parse(b.publishAt) : Number.MAX_SAFE_INTEGER;
        return aTime - bTime || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      });
      res.json({ items, publishingEnabled });
    } catch (error) { next(error); }
  });
  router.post('/channels', async (req, res, next) => {
    try {
      const input = ChannelInputSchema.parse(req.body);
      if (input.automation?.autoPublish && !publishingEnabled) throw errorWith(503, 'PUBLISHING_DISABLED', 'YouTube publishing is disabled');
      const id = input.id || store.createId('channel', input.name);
      if (await store.getChannel(req.ownerId, id)) throw errorWith(409, 'CHANNEL_EXISTS', 'Channel ID already exists');
      validateAutomation(input.automation);
      validateProduction(input.productionDefaults);
      const timestamp = new Date().toISOString();
      const channel = ChannelProfileSchema.parse({ ...input, id, productionDefaults: input.productionDefaults || {}, automation: input.automation || {}, youtube: {}, createdAt: timestamp, updatedAt: timestamp });
      await store.putChannel(req.ownerId, channel);
      res.status(201).json(publicChannel(channel));
    } catch (error) { next(error); }
  });
  router.get('/channels/:channelId', async (req, res, next) => {
    try {
      const channel = await store.getChannel(req.ownerId, req.params.channelId);
      if (!channel) throw errorWith(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
      res.json(publicChannel(channel));
    } catch (error) { next(error); }
  });
  router.patch('/channels/:channelId', async (req, res, next) => {
    try {
      const existing = await store.getChannel(req.ownerId, req.params.channelId);
      if (!existing) throw errorWith(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
      const patch = ChannelPatchSchema.parse(req.body);
      if (patch.automation?.autoPublish && !publishingEnabled) throw errorWith(503, 'PUBLISHING_DISABLED', 'YouTube publishing is disabled');
      validateAutomation(patch.automation);
      const productionDefaults = {
        ...existing.productionDefaults, ...(patch.productionDefaults || {}),
        durationRanges: {
          shorts: { ...existing.productionDefaults.durationRanges.shorts, ...(patch.productionDefaults?.durationRanges?.shorts || {}) },
          landscape: { ...existing.productionDefaults.durationRanges.landscape, ...(patch.productionDefaults?.durationRanges?.landscape || {}) },
        },
      };
      validateProduction(productionDefaults);
      const channel = ChannelProfileSchema.parse({ ...existing, ...patch, productionDefaults, automation: { ...existing.automation, ...(patch.automation || {}) }, youtube: existing.youtube, updatedAt: new Date().toISOString() });
      await store.putChannel(req.ownerId, channel);
      res.json(publicChannel(channel));
    } catch (error) { next(error); }
  });
  router.delete('/channels/:channelId', async (req, res, next) => {
    try {
      if (!await store.deleteChannel(req.ownerId, req.params.channelId)) throw errorWith(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
      res.status(204).end();
    } catch (error) { next(error); }
  });
  router.get('/channels/:channelId/ideas', async (req, res, next) => {
    try {
      if (!await store.getChannel(req.ownerId, req.params.channelId)) throw errorWith(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
      const status = String(req.query.status || '').trim().toLowerCase();
      if (status && status !== 'all' && !IDEA_STATUSES.has(status)) throw errorWith(400, 'INVALID_STATUS_FILTER', 'Invalid idea status filter');
      const ideas = await store.listIdeas(req.ownerId, req.params.channelId);
      res.json({ ideas: ideas.filter((idea) => !status || status === 'all' || idea.status === status).map(publicIdea) });
    } catch (error) { next(error); }
  });
  router.get('/channels/:channelId/performance', async (req, res, next) => {
    try {
      if (!await store.getChannel(req.ownerId, req.params.channelId)) throw errorWith(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
      res.json({ snapshots: await store.listPerformance(req.ownerId, req.params.channelId, { limit: req.query.limit }) });
    } catch (error) { next(error); }
  });
  router.get('/channels/:channelId/performance/summary', async (req, res, next) => {
    try {
      if (!await store.getChannel(req.ownerId, req.params.channelId)) throw errorWith(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
      const [snapshots, ideas] = await Promise.all([
        store.listPerformance(req.ownerId, req.params.channelId, { limit: req.query.limit || 500 }),
        store.listIdeas(req.ownerId, req.params.channelId),
      ]);
      res.json(summarizeChannelPerformance(snapshots, ideas));
    } catch (error) { next(error); }
  });
  router.post('/channels/:channelId/performance', async (req, res, next) => {
    try {
      if (!await store.getChannel(req.ownerId, req.params.channelId)) throw errorWith(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
      const input = ChannelPerformanceInputSchema.parse(req.body);
      const snapshot = ChannelPerformanceSnapshotSchema.parse({
        ...input, id: store.createId('metric', input.videoId || input.title || 'snapshot'), channelId: req.params.channelId,
        capturedAt: input.capturedAt || new Date().toISOString(),
      });
      res.status(201).json(await store.putPerformance(req.ownerId, snapshot));
    } catch (error) { next(error); }
  });
  router.post('/channels/:channelId/performance/import', express.text({
    type: ['text/csv', 'application/csv', 'text/plain'], limit: '2mb',
  }), async (req, res, next) => {
    try {
      if (!await store.getChannel(req.ownerId, req.params.channelId)) throw errorWith(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
      const csv = typeof req.body === 'string' ? req.body : req.body?.csv;
      if (!csv || typeof csv !== 'string') throw errorWith(400, 'ANALYTICS_CSV_REQUIRED', 'Send a YouTube Analytics CSV file or a JSON body containing csv');
      let imported;
      try {
        imported = importYouTubeAnalyticsCsv(csv, {
          channelId: req.params.channelId,
          capturedAt: typeof req.body === 'object' ? req.body?.capturedAt : undefined,
          ideas: await store.listIdeas(req.ownerId, req.params.channelId),
        });
      } catch (error) {
        throw errorWith(400, 'INVALID_ANALYTICS_CSV', error.message);
      }
      if (!imported.snapshots.length) throw errorWith(400, 'ANALYTICS_CSV_EMPTY', 'No valid video rows were found in the CSV');
      const snapshots = [];
      for (const value of imported.snapshots) {
        const snapshot = ChannelPerformanceSnapshotSchema.parse(value);
        snapshots.push(await store.putPerformance(req.ownerId, snapshot));
      }
      res.status(201).json({ imported: snapshots.length, skipped: imported.errors.length, errors: imported.errors, snapshots });
    } catch (error) { next(error); }
  });
  router.post('/channels/:channelId/ideas/brainstorm', async (req, res, next) => {
    try {
      const ideas = await director.brainstorm(req.ownerId, req.params.channelId, { count: Math.max(1, Math.min(20, Number(req.body?.count) || 5)), useAi: req.body?.useAi !== false });
      res.status(201).json({ ideas: ideas.map(publicIdea) });
    } catch (error) { next(error); }
  });
  router.patch('/channels/:channelId/ideas/:ideaId', async (req, res, next) => {
    try {
      const idea = await store.getIdea(req.ownerId, req.params.ideaId);
      if (!idea || idea.channelId !== req.params.channelId) throw errorWith(404, 'IDEA_NOT_FOUND', 'Idea not found');
      const patch = IdeaPatchSchema.parse(req.body);
      const selectedTitle = patch.selectedTitle;
      const selectedThumbnailConcept = patch.selectedThumbnailConcept;
      const editsPackaging = Boolean(selectedTitle || selectedThumbnailConcept || patch.title || patch.spokenHook || patch.narrativeArc || patch.thumbnailConcept);
      if (editsPackaging && !['draft', 'approved', 'failed'].includes(idea.status)) {
        throw errorWith(409, 'EXPERIMENT_ALREADY_IN_PRODUCTION', 'Packaging and script details cannot change after production has started');
      }
      if (patch.status && !['draft', 'approved', 'rejected', 'failed'].includes(idea.status)) {
        throw errorWith(409, 'IDEA_STATUS_LOCKED', `Cannot change status while idea is ${idea.status}`);
      }
      const titleCandidate = selectedTitle && idea.titleCandidates.find((item) => item.text === selectedTitle);
      const thumbnailCandidate = selectedThumbnailConcept && idea.thumbnailCandidates.find((item) => item.concept === selectedThumbnailConcept);
      if (selectedTitle && !titleCandidate) throw errorWith(400, 'INVALID_EXPERIMENT_SELECTION', 'Selected title must be one of the stored title candidates');
      if (selectedThumbnailConcept && !thumbnailCandidate) throw errorWith(400, 'INVALID_EXPERIMENT_SELECTION', 'Selected thumbnail must be one of the stored thumbnail candidates');
      const updated = {
        ...idea, ...patch,
        ...(editsPackaging ? { packagingEdited: true } : {}),
        ...(selectedTitle ? { title: selectedTitle, titleScore: titleCandidate.score, titleCandidates: idea.titleCandidates.map((item) => ({ ...item, selected: item.text === selectedTitle })), packagingExperiment: { ...idea.packagingExperiment, titleAngle: titleCandidate.angle } } : {}),
        ...(selectedThumbnailConcept ? { thumbnailConcept: selectedThumbnailConcept, thumbnailCandidates: idea.thumbnailCandidates.map((item) => ({ ...item, selected: item.concept === selectedThumbnailConcept })), packagingExperiment: { ...idea.packagingExperiment, ...(selectedTitle ? { titleAngle: titleCandidate.angle } : {}), thumbnailVariant: thumbnailCandidate.variant } } : {}),
        updatedAt: new Date().toISOString(),
      };
      delete updated.selectedTitle; delete updated.selectedThumbnailConcept;
      await store.putIdea(req.ownerId, updated);
      res.json(publicIdea(updated));
    } catch (error) { next(error); }
  });
  router.delete('/channels/:channelId/ideas/:ideaId', async (req, res, next) => {
    try {
      const idea = await store.getIdea(req.ownerId, req.params.ideaId);
      if (!idea || idea.channelId !== req.params.channelId) throw errorWith(404, 'IDEA_NOT_FOUND', 'Idea not found');
      if (['queued', 'producing', 'publishing'].includes(idea.status)) {
        throw errorWith(409, 'IDEA_ACTIVE', `Cannot delete idea while status is ${idea.status}`);
      }
      if (typeof store.deleteIdea === 'function') await store.deleteIdea(req.ownerId, idea.id);
      res.status(204).end();
    } catch (error) { next(error); }
  });
  router.post('/channels/:channelId/ideas/:ideaId/produce', async (req, res, next) => {
    try { res.status(202).json(await director.produce(req.ownerId, req.params.channelId, req.params.ideaId)); } catch (error) { next(error); }
  });
  if (publisher) {
    router.get('/channels/:channelId/youtube/connect', async (req, res, next) => {
      try { res.json({ authorizationUrl: await publisher.authorizationUrl(req.ownerId, req.params.channelId) }); } catch (error) { next(error); }
    });
    router.post('/channels/:channelId/youtube/disconnect', async (req, res, next) => {
      try { await publisher.disconnect(req.ownerId, req.params.channelId); res.status(204).end(); } catch (error) { next(error); }
    });
    router.post('/channels/:channelId/youtube/analytics/sync', async (req, res, next) => {
      try {
        res.json(await publisher.syncAnalytics(req.ownerId, req.params.channelId, { days: req.body?.days }));
      } catch (error) { next(error); }
    });
    if (publishingEnabled) {
      router.post('/channels/:channelId/ideas/:ideaId/publish', async (req, res, next) => {
        try { res.status(202).json(await publisher.publishIdea(req.ownerId, req.params.channelId, req.params.ideaId)); } catch (error) { next(error); }
      });
    }
  }
  return router;
}
