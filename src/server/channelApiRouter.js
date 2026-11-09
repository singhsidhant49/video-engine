import express from 'express';
import { ChannelInputSchema, ChannelPatchSchema, ChannelPerformanceInputSchema, ChannelPerformanceSnapshotSchema, ChannelProfileSchema, IdeaPatchSchema, publicChannel, publicIdea } from '../models/channel.schema.js';
import { parseCron } from './channelScheduler.js';

const errorWith = (status, code, message) => Object.assign(new Error(message), { status, code });

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

export function createChannelApiRouter({ store, director, publisher = null }) {
  const router = express.Router();
  router.get('/channels', async (req, res, next) => {
    try { res.json({ channels: (await store.listChannels(req.ownerId)).map(publicChannel) }); } catch (error) { next(error); }
  });
  router.post('/channels', async (req, res, next) => {
    try {
      const input = ChannelInputSchema.parse(req.body);
      if (input.automation?.autoPublish && !publisher) throw errorWith(503, 'PUBLISHING_DISABLED', 'YouTube publishing is disabled');
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
      if (patch.automation?.autoPublish && !publisher) throw errorWith(503, 'PUBLISHING_DISABLED', 'YouTube publishing is disabled');
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
      res.json({ ideas: (await store.listIdeas(req.ownerId, req.params.channelId)).map(publicIdea) });
    } catch (error) { next(error); }
  });
  router.get('/channels/:channelId/performance', async (req, res, next) => {
    try {
      if (!await store.getChannel(req.ownerId, req.params.channelId)) throw errorWith(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
      res.json({ snapshots: await store.listPerformance(req.ownerId, req.params.channelId, { limit: req.query.limit }) });
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
      const updated = { ...idea, ...IdeaPatchSchema.parse(req.body), updatedAt: new Date().toISOString() };
      await store.putIdea(req.ownerId, updated);
      res.json(publicIdea(updated));
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
    router.post('/channels/:channelId/ideas/:ideaId/publish', async (req, res, next) => {
      try { res.status(202).json(await publisher.publishIdea(req.ownerId, req.params.channelId, req.params.ideaId)); } catch (error) { next(error); }
    });
  }
  return router;
}
