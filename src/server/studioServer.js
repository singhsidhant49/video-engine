import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config/index.js';
import { createFacelessVideo } from '../pipeline/videoGeneratorPipeline.js';
import { createConfiguredVideoJobService } from './serviceFactory.js';
import { createApiAuth, createApiRateLimit, createVideoApiRouter, videoApiErrorHandler } from './videoApiRouter.js';
import { getAudioCatalog } from '../audio/musicCatalog.js';
import { ChannelStore } from './channelStore.js';
import { ChannelDirectorService } from '../services/channelDirectorService.js';
import { ChannelScheduler } from './channelScheduler.js';
import { createChannelApiRouter } from './channelApiRouter.js';
import { YouTubePublisherService } from '../services/youtubePublisherService.js';

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const requestId = String(req.get('x-request-id') || crypto.randomUUID()).slice(0, 128);
  req.requestId = requestId;
  res.set({
    'x-request-id': requestId,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; connect-src 'self'; img-src 'self' data: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com",
  });
  if (process.env.NODE_ENV === 'production') res.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: config.server.maxRequestBytes }));

const videoJobService = createConfiguredVideoJobService({ role: process.env.VIDEO_PROCESS_ROLE || 'all' });
await videoJobService.init();
const channelStore = new ChannelStore({ rootDir: config.channelsDir });
await channelStore.init();
const channelDirector = new ChannelDirectorService({ store: channelStore, videoService: videoJobService });
const youtubePublisher = config.server.youtubePublishingEnabled
  ? new YouTubePublisherService({ store: channelStore, videoService: videoJobService })
  : null;
const channelScheduler = new ChannelScheduler({ store: channelStore, director: channelDirector, videoService: videoJobService, publisher: youtubePublisher });
const apiAuth = createApiAuth({ apiKeys: config.server.apiKeys, production: process.env.NODE_ENV === 'production' });
const apiRateLimit = createApiRateLimit({ max: Number(process.env.VIDEO_API_RATE_LIMIT_PER_MINUTE || 120) });

app.get('/health', (req, res) => res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));
app.get('/ready', process.env.NODE_ENV === 'production' ? apiAuth : (req, res, next) => next(), async (req, res) => {
  const readiness = await videoJobService.readiness();
  res.status(readiness.ready ? 200 : 503).json({ status: readiness.ready ? 'ready' : 'not_ready', ...readiness });
});
if (youtubePublisher) app.get('/oauth/youtube/callback', async (req, res) => {
  try {
    if (req.query.error) throw Object.assign(new Error('YouTube authorization was denied'), { status: 400 });
    await youtubePublisher.handleCallback({ code: String(req.query.code || ''), state: String(req.query.state || '') });
    res.type('html').send('<!doctype html><meta charset="utf-8"><title>YouTube connected</title><body style="font-family:system-ui;padding:3rem;background:#101114;color:#f8f8f2"><h1>YouTube connected</h1><p>You can close this window and return to FrameForge.</p>');
  } catch (error) {
    res.status(error.status || 500).type('html').send(`<!doctype html><meta charset="utf-8"><title>Connection failed</title><body style="font-family:system-ui;padding:3rem"><h1>Connection failed</h1><p>${String(error.message || 'Unknown error').replace(/[&<>"']/g, '')}</p>`);
  }
});
app.use('/v1', apiAuth, apiRateLimit,
  createChannelApiRouter({ store: channelStore, director: channelDirector, publisher: youtubePublisher }),
  createVideoApiRouter({ service: videoJobService }));

// Serve static assets (audio, videos, media, public files)
app.use('/audio', express.static(path.join(config.publicDir, 'audio')));
app.use('/audiotrack', express.static(path.join(config.publicDir, 'audiotrack')));
app.use('/media', express.static(path.join(config.publicDir, 'media')));
app.use('/media-bank', express.static(config.mediaBankDir));
app.use('/media-bank', express.static(path.join(config.publicDir, 'media-bank')));
app.use('/storage/media-bank', express.static(config.mediaBankDir));
if (process.env.NODE_ENV !== 'production') app.use('/renders', express.static(config.rendersDir));

app.get('/api/audiotracks', (req, res) => {
  res.json({ status: 'ok', tracks: getAudioCatalog() });
});

// Endpoint: Trigger Video Generation
app.post('/api/generate', process.env.NODE_ENV === 'production' ? apiAuth : (req, res, next) => next(), async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(410).json({ error: { code: 'LEGACY_ENDPOINT_DISABLED', message: 'Use POST /v1/videos for asynchronous generation' } });
  }
  const input = req.body?.brief || req.body || {};
  const topic = input.prompt || input.topic;

  if (!topic) {
    return res.status(400).json({ error: 'A topic or brief.prompt is required' });
  }

  try {
    const contentType = input.contentType || input.niche;
    const channelProfile = input.channel || input.channelProfile || (contentType ? { contentType, voice: input.voice } : {});
    const result = await createFacelessVideo({
      brief: req.body?.brief,
      topic,
      niche: input.niche || contentType,
      format: input.format,
      voice: input.voice || undefined,
      style: input.style,
      durationSec: input.durationSec ? Number(input.durationSec) : undefined,
      channelId: input.channelId || input.channel?.id,
      channelProfile,
      onProgress: (progress) => {
        // Simple console logging for progress
      },
    });

    res.json({
      success: true,
      message: 'Video generated successfully!',
      videoUrl: `/renders/${path.basename(result.outputPath)}`,
      filename: path.basename(result.outputPath),
      durationSeconds: result.durationSeconds,
      title: result.title,
      scriptPayload: result.scriptPayload,
    });
  } catch (error) {
    console.error('API Video Generation Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate video' });
  }
});

// Endpoint: List Generated Videos
app.get('/api/renders', process.env.NODE_ENV === 'production' ? apiAuth : (req, res, next) => next(), async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(410).json({ error: { code: 'LEGACY_ENDPOINT_DISABLED', message: 'Use GET /v1/videos for account-scoped video records' } });
  }
  try {
    const files = await fs.readdir(config.rendersDir);
    const mp4Files = files.filter(f => f.endsWith('.mp4')).reverse();
    const list = mp4Files.map(filename => ({
      filename,
      url: `/renders/${filename}`,
      created: new Date().toISOString(),
    }));
    res.json({ videos: list });
  } catch (err) {
    res.json({ videos: [] });
  }
});

// Serve the route-based Studio dashboard. Keeping these as real URLs makes
// navigation, refreshes and browser history work without a client router.
const studioPages = ['/', '/dashboard', '/dashboard/overview', '/dashboard/production', '/dashboard/channels', '/dashboard/ideas', '/dashboard/analytics', '/dashboard/settings'];
app.get(studioPages, (req, res) => {
  res.sendFile(path.join(config.publicDir, 'dashboard', 'studio.html'));
});
app.get('/dashboard/index.html', (req, res) => res.redirect(308, '/dashboard/overview'));
app.get(['/dashboard/app.js', '/dashboard/styles.css'], (req, res) => res.status(410).end());
app.use('/dashboard', express.static(path.join(config.publicDir, 'dashboard')));

// Body-parser failures happen before the /v1 router is entered. Keep those
// failures on the same JSON contract instead of returning Express HTML and a
// local stack trace.
app.use(videoApiErrorHandler);

const PORT = config.server.port;
const server = app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`✨ Faceless Video Studio Running at: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
channelScheduler.start();
server.on('error', (error) => {
  console.error(`Video API failed to listen on port ${PORT}:`, error);
  process.exitCode = 1;
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received; stopping new work and draining active video jobs...`);
  videoJobService.stopAccepting();
  channelScheduler.stop();
  const closeServer = new Promise((resolve) => server.close(resolve));
  await videoJobService.shutdown({ timeoutMs: config.server.shutdownTimeoutMs });
  await channelStore.close();
  await closeServer;
  console.log('Video API shutdown complete.');
}
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
