import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';
const YOUTUBE_ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

const serviceError = (status, code, message) => Object.assign(new Error(message), { status, code });

const isoDate = (date) => date.toISOString().slice(0, 10);
function youtubeDurationSeconds(value) {
  const match = String(value || '').match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) return null;
  return Math.round((Number(match[1] || 0) * 86_400) + (Number(match[2] || 0) * 3_600) + (Number(match[3] || 0) * 60) + Number(match[4] || 0));
}

function reportObjects(report) {
  const headers = (report.columnHeaders || []).map((header) => header.name);
  return (report.rows || []).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

export class YouTubePublisherService {
  constructor({ store, videoService, env = process.env, fetchImpl = fetch } = {}) {
    this.store = store; this.videoService = videoService; this.env = env; this.fetch = fetchImpl;
  }

  #oauthConfig() {
    const clientId = String(this.env.YOUTUBE_CLIENT_ID || '').trim();
    const clientSecret = String(this.env.YOUTUBE_CLIENT_SECRET || '').trim();
    const redirectUri = String(this.env.YOUTUBE_REDIRECT_URI || '').trim();
    const stateSecret = String(this.env.YOUTUBE_OAUTH_STATE_SECRET || '').trim();
    const encryptionKey = String(this.env.YOUTUBE_TOKEN_ENCRYPTION_KEY || '').trim();
    if (!clientId || !clientSecret || !redirectUri || stateSecret.length < 32 || encryptionKey.length < 32) {
      throw serviceError(503, 'YOUTUBE_NOT_CONFIGURED', 'YouTube OAuth requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI, and 32+ character state/encryption secrets');
    }
    return { clientId, clientSecret, redirectUri, stateSecret, encryptionKey };
  }

  #signState(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  #verifyState(state, secret) {
    const [body, signature] = String(state || '').split('.');
    if (!body || !signature) throw serviceError(400, 'INVALID_OAUTH_STATE', 'Invalid YouTube OAuth state');
    const expected = crypto.createHmac('sha256', secret).update(body).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw serviceError(400, 'INVALID_OAUTH_STATE', 'Invalid YouTube OAuth state');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) throw serviceError(400, 'EXPIRED_OAUTH_STATE', 'YouTube OAuth state expired');
    return payload;
  }

  #key(secret) { return crypto.createHash('sha256').update(secret).digest(); }
  #encrypt(value, secret) {
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', this.#key(secret), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }
  #decrypt(value, secret) {
    const [version, iv, tag, data] = String(value || '').split('.');
    if (version !== 'v1') throw serviceError(500, 'YOUTUBE_TOKEN_INVALID', 'Stored YouTube token cannot be decrypted');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.#key(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'));
  }

  async authorizationUrl(ownerId, channelId) {
    const cfg = this.#oauthConfig();
    if (!await this.store.getChannel(ownerId, channelId)) throw serviceError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    const state = this.#signState({ ownerId, channelId, exp: Date.now() + 10 * 60_000, nonce: crypto.randomUUID() }, cfg.stateSecret);
    const url = new URL(GOOGLE_AUTH);
    url.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: SCOPES.join(' '), state }).toString();
    return url.toString();
  }

  async handleCallback({ code, state }) {
    const cfg = this.#oauthConfig(); const payload = this.#verifyState(state, cfg.stateSecret);
    const channel = await this.store.getChannel(payload.ownerId, payload.channelId);
    if (!channel) throw serviceError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    const response = await this.fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw serviceError(502, 'YOUTUBE_OAUTH_FAILED', `YouTube OAuth exchange failed (${response.status})`);
    const token = await response.json(); token.expires_at = Date.now() + (Number(token.expires_in || 3600) * 1000);
    const identityResponse = await this.fetch(`${YOUTUBE_API}/channels?part=id,snippet&mine=true`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(30_000) });
    if (!identityResponse.ok) throw serviceError(502, 'YOUTUBE_CHANNEL_LOOKUP_FAILED', `YouTube channel lookup failed (${identityResponse.status})`);
    const identity = (await identityResponse.json()).items?.[0];
    if (!identity) throw serviceError(409, 'YOUTUBE_CHANNEL_MISSING', 'The Google account has no YouTube channel');
    channel.youtube = { connected: true, channelId: identity.id, channelTitle: identity.snippet?.title || null, tokenCiphertext: this.#encrypt(token, cfg.encryptionKey) };
    channel.updatedAt = new Date().toISOString(); await this.store.putChannel(payload.ownerId, channel);
    return { ownerId: payload.ownerId, channelId: channel.id, youtubeChannelId: identity.id, channelTitle: identity.snippet?.title || null };
  }

  async disconnect(ownerId, channelId) {
    const channel = await this.store.getChannel(ownerId, channelId);
    if (!channel) throw serviceError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    channel.youtube = { connected: false, channelId: null, channelTitle: null, tokenCiphertext: null };
    channel.updatedAt = new Date().toISOString(); await this.store.putChannel(ownerId, channel);
  }

  async #accessToken(ownerId, channel) {
    const cfg = this.#oauthConfig();
    if (!channel.youtube?.connected || !channel.youtube.tokenCiphertext) throw serviceError(409, 'YOUTUBE_NOT_CONNECTED', 'Connect this channel to YouTube first');
    const token = this.#decrypt(channel.youtube.tokenCiphertext, cfg.encryptionKey);
    if (token.access_token && Number(token.expires_at || 0) > Date.now() + 60_000) return token.access_token;
    if (!token.refresh_token) throw serviceError(409, 'YOUTUBE_RECONNECT_REQUIRED', 'YouTube authorization expired; reconnect the channel');
    const response = await this.fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: token.refresh_token, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw serviceError(502, 'YOUTUBE_TOKEN_REFRESH_FAILED', `YouTube token refresh failed (${response.status})`);
    const refreshed = await response.json(); Object.assign(token, refreshed, { expires_at: Date.now() + (Number(refreshed.expires_in || 3600) * 1000) });
    channel.youtube.tokenCiphertext = this.#encrypt(token, cfg.encryptionKey); channel.updatedAt = new Date().toISOString(); await this.store.putChannel(ownerId, channel);
    return token.access_token;
  }

  async #analyticsReport(accessToken, parameters) {
    const rows = [];
    for (let startIndex = 1; startIndex <= 2_000; startIndex += 200) {
      const url = new URL(YOUTUBE_ANALYTICS_API);
      url.search = new URLSearchParams({ ...parameters, maxResults: '200', startIndex: String(startIndex) }).toString();
      const response = await this.fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        const code = response.status === 403 ? 'YOUTUBE_ANALYTICS_RECONNECT_REQUIRED' : 'YOUTUBE_ANALYTICS_FAILED';
        const message = response.status === 403
          ? 'YouTube Analytics access was denied. Reconnect the channel to grant analytics permission.'
          : `YouTube Analytics query failed (${response.status})`;
        throw serviceError(response.status === 403 ? 409 : 502, code, message);
      }
      const report = await response.json();
      const page = reportObjects(report); rows.push(...page);
      if (page.length < 200) break;
    }
    return rows;
  }

  async syncAnalytics(ownerId, channelId, { days = 90 } = {}) {
    const channel = await this.store.getChannel(ownerId, channelId);
    if (!channel) throw serviceError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    const capturedAt = new Date().toISOString();
    channel.youtube.lastAnalyticsSyncAttemptAt = capturedAt;
    channel.youtube.analyticsSyncError = null;
    channel.updatedAt = capturedAt;
    await this.store.putChannel(ownerId, channel);
    try {
      const accessToken = await this.#accessToken(ownerId, channel);
      const boundedDays = Math.max(7, Math.min(365, Number(days) || 90));
      const end = new Date(); end.setUTCDate(end.getUTCDate() - 3);
      const start = new Date(end); start.setUTCDate(start.getUTCDate() - boundedDays + 1);
      const common = { ids: 'channel==MINE', startDate: isoDate(start), endDate: isoDate(end), dimensions: 'video,creatorContentType', sort: '-views' };
      const activity = await this.#analyticsReport(accessToken, {
        ...common,
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained',
      });
      let reach = [];
      try {
        reach = await this.#analyticsReport(accessToken, {
          ...common, metrics: 'videoThumbnailImpressions,videoThumbnailImpressionsClickRate',
        });
      } catch (error) {
        console.warn(`YouTube reach metrics unavailable for ${channelId}: ${error.message}`);
      }
      const reachByVideo = new Map(reach.map((row) => [String(row.video), row]));
      const videoIds = [...new Set(activity.map((row) => String(row.video || '')).filter(Boolean))];
      const metadata = new Map();
      for (let index = 0; index < videoIds.length; index += 50) {
        const ids = videoIds.slice(index, index + 50);
        const url = new URL(`${YOUTUBE_API}/videos`);
        url.search = new URLSearchParams({ part: 'snippet,contentDetails', id: ids.join(','), maxResults: '50' }).toString();
        const response = await this.fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw serviceError(502, 'YOUTUBE_VIDEO_LOOKUP_FAILED', `YouTube video metadata lookup failed (${response.status})`);
        for (const item of (await response.json()).items || []) metadata.set(String(item.id), item);
      }
      const ideas = await this.store.listIdeas(ownerId, channelId);
      const ideasByVideo = new Map(ideas.filter((idea) => idea.youtubeVideoId).map((idea) => [String(idea.youtubeVideoId), idea]));
      const snapshots = [];
      for (const row of activity) {
        const videoId = String(row.video || '');
        if (!videoId) continue;
        const info = metadata.get(videoId); const idea = ideasByVideo.get(videoId) || null; const reachRow = reachByVideo.get(videoId) || {};
        const durationSeconds = youtubeDurationSeconds(info?.contentDetails?.duration) || idea?.durationSeconds || null;
        const snapshot = {
          channelId, ideaId: idea?.id || null, videoId,
          title: String(info?.snippet?.title || idea?.title || videoId).slice(0, 200),
          format: row.creatorContentType === 'SHORTS' ? 'shorts'
            : row.creatorContentType === 'VIDEO_ON_DEMAND' ? 'landscape'
            : idea?.format || 'landscape',
          durationSeconds,
          capturedAt,
          publishedAt: info?.snippet?.publishedAt || null,
          impressions: reachRow.videoThumbnailImpressions == null ? null : Math.max(0, Math.round(Number(reachRow.videoThumbnailImpressions))),
          views: Math.max(0, Math.round(Number(row.views || 0))),
          clickThroughRate: reachRow.videoThumbnailImpressionsClickRate == null ? null : Number(reachRow.videoThumbnailImpressionsClickRate),
          averageViewDurationSeconds: row.averageViewDuration == null ? null : Number(row.averageViewDuration),
          averageViewPercentage: row.averageViewPercentage == null ? null : Number(row.averageViewPercentage),
          retention30sPercentage: null,
          subscribersGained: Math.round(Number(row.subscribersGained || 0)),
          watchTimeHours: row.estimatedMinutesWatched == null ? null : Number((Number(row.estimatedMinutesWatched) / 60).toFixed(3)),
          revenue: null, rpm: null, trafficSources: {}, source: 'api',
        };
        const identity = JSON.stringify([
          channelId, videoId, snapshot.impressions, snapshot.views, snapshot.clickThroughRate,
          snapshot.averageViewDurationSeconds, snapshot.averageViewPercentage, snapshot.subscribersGained, snapshot.watchTimeHours,
        ]);
        snapshot.id = `metric-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
        snapshots.push(await this.store.putPerformance(ownerId, snapshot));
      }
      channel.youtube.lastAnalyticsSyncAt = capturedAt;
      channel.youtube.analyticsSyncError = null;
      channel.updatedAt = capturedAt;
      await this.store.putChannel(ownerId, channel);
      return { imported: snapshots.length, startDate: common.startDate, endDate: common.endDate, capturedAt, snapshots };
    } catch (error) {
      channel.youtube.analyticsSyncError = String(error.message || error).slice(0, 1_000);
      channel.updatedAt = new Date().toISOString();
      await this.store.putChannel(ownerId, channel).catch(() => {});
      throw error;
    }
  }

  async publishIdea(ownerId, channelId, ideaId) {
    const [channel, idea] = await Promise.all([this.store.getChannel(ownerId, channelId), this.store.getIdea(ownerId, ideaId)]);
    if (!channel || !idea || idea.channelId !== channelId) throw serviceError(404, 'IDEA_NOT_FOUND', 'Idea not found');
    if (!['ready', 'publish_failed'].includes(idea.status) || !idea.videoId) throw serviceError(409, 'VIDEO_NOT_READY', 'The generated video must be ready before publishing');
    if (idea.youtubeVideoId) return { youtubeVideoId: idea.youtubeVideoId, reused: true };
    const publishing = { ...idea, status: 'publishing', error: null, updatedAt: new Date().toISOString() };
    await this.store.putIdea(ownerId, publishing);
    try {
      const accessToken = await this.#accessToken(ownerId, channel);
      const videoPath = await this.videoService.download(ownerId, idea.videoId);
      const stat = await fsPromises.stat(videoPath);
      const videoPackage = typeof this.videoService.packaging === 'function'
        ? await this.videoService.packaging(ownerId, idea.videoId).catch(() => null)
        : null;
      const future = idea.publishAt && new Date(idea.publishAt).getTime() > Date.now() + 60_000;
      const privacy = future ? 'private' : channel.automation.publishPrivacy;
      const metadata = {
      snippet: {
        title: idea.title.slice(0, 100),
        description: String(videoPackage?.description || `${idea.primaryKeyword}: ${idea.spokenHook}\n\n${idea.narrativeArc}\n\nABOUT THIS CHANNEL:\n${channel.name} creates ${channel.niche} videos for ${channel.targetAudience}.\n\n#${idea.contentPillar.replace(/\W+/g, '')} #${channel.niche.replace(/\W+/g, '')} #YouTube`).slice(0, 5_000),
        tags: [...new Set([channel.niche, idea.contentPillar, ...channel.contentPillars])].map((tag) => tag.slice(0, 30)).slice(0, 15),
        categoryId: '27', defaultLanguage: channel.language,
      },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, ...(future ? { publishAt: idea.publishAt } : {}) },
      };
      const initiate = await this.fetch(`${YOUTUBE_UPLOAD}/videos?uploadType=resumable&part=snippet,status`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(stat.size), 'X-Upload-Content-Type': 'video/mp4' }, body: JSON.stringify(metadata), signal: AbortSignal.timeout(30_000) });
      const uploadUrl = initiate.headers.get('location');
      if (!initiate.ok || !uploadUrl) throw serviceError(502, 'YOUTUBE_UPLOAD_INIT_FAILED', `YouTube upload initialization failed (${initiate.status})`);
      const upload = await this.fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Length': String(stat.size), 'Content-Type': 'video/mp4' }, body: fs.createReadStream(videoPath), duplex: 'half', signal: AbortSignal.timeout(Number(this.env.YOUTUBE_UPLOAD_TIMEOUT_MS || 3_600_000)) });
      if (!upload.ok) throw serviceError(502, 'YOUTUBE_UPLOAD_FAILED', `YouTube video upload failed (${upload.status})`);
      const uploaded = await upload.json();
      try {
        const thumbnailPath = await this.videoService.thumbnail(ownerId, idea.videoId); const thumbStat = await fsPromises.stat(thumbnailPath);
        await this.fetch(`${YOUTUBE_UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(uploaded.id)}&uploadType=media`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/png', 'Content-Length': String(thumbStat.size) }, body: fs.createReadStream(thumbnailPath), duplex: 'half', signal: AbortSignal.timeout(120_000) });
      } catch (error) { console.warn(`YouTube thumbnail upload skipped: ${error.message}`); }
      const updated = { ...publishing, status: 'published', youtubeVideoId: uploaded.id, error: null, updatedAt: new Date().toISOString() };
      await this.store.putIdea(ownerId, updated);
      return { youtubeVideoId: uploaded.id, url: `https://www.youtube.com/watch?v=${uploaded.id}`, scheduled: Boolean(future), reused: false };
    } catch (error) {
      await this.store.putIdea(ownerId, { ...publishing, status: 'publish_failed', error: String(error.message || error).slice(0, 2_000), updatedAt: new Date().toISOString() }).catch(() => {});
      throw error;
    }
  }
}
