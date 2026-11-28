import crypto from 'node:crypto';

const headerKey = (value) => String(value || '').toLowerCase().replace(/[%()]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field');
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((item) => item.some((value) => String(value).trim() !== ''));
}

const numberValue = (value, fallback = null) => {
  const normalized = String(value ?? '').replace(/[,%$\u00a3\u20ac\u20b9]/g, '').trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function durationSeconds(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.round(Number(raw));
  const parts = raw.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length > 3) return null;
  return Math.round(parts.reduce((seconds, part) => (seconds * 60) + part, 0));
}

const first = (record, aliases) => {
  for (const alias of aliases) if (record[alias] != null && String(record[alias]).trim() !== '') return record[alias];
  return null;
};

function isoDate(value, fallback = null) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

export function importYouTubeAnalyticsCsv(csv, { channelId, capturedAt = new Date().toISOString(), ideas = [] } = {}) {
  if (!channelId) throw new Error('A channel ID is required');
  if (!Number.isFinite(new Date(capturedAt).getTime())) throw new Error('capturedAt must be a valid ISO date');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one data row');
  const headers = rows[0].map(headerKey);
  const ideaByVideo = new Map(); const ideaByTitle = new Map();
  for (const idea of ideas) {
    if (idea.videoId) ideaByVideo.set(String(idea.videoId), idea);
    if (idea.youtubeVideoId) ideaByVideo.set(String(idea.youtubeVideoId), idea);
    if (idea.title) ideaByTitle.set(String(idea.title).trim().toLowerCase(), idea);
  }
  const snapshots = []; const errors = [];
  for (let index = 1; index < rows.length; index++) {
    const record = Object.fromEntries(headers.map((header, column) => [header, rows[index][column] ?? '']));
    const videoId = String(first(record, ['video id', 'content', 'video']) || '').trim() || null;
    const title = String(first(record, ['video title', 'title']) || '').trim();
    if (!videoId && !title) { errors.push({ row: index + 1, message: 'Missing video ID and title' }); continue; }
    if (/^total$/i.test(videoId || '') || /^total$/i.test(title)) continue;
    const duration = durationSeconds(first(record, ['duration', 'video duration', 'duration seconds']));
    const explicitFormat = String(first(record, ['format', 'content type']) || '').toLowerCase();
    const format = /short/.test(explicitFormat) ? 'shorts' : /landscape|video/.test(explicitFormat) ? 'landscape' : duration != null && duration <= 60 ? 'shorts' : 'landscape';
    const rowCapturedAt = isoDate(first(record, ['captured at', 'snapshot date', 'date']), capturedAt);
    const publishedAt = isoDate(first(record, ['published at', 'published date', 'video publish time']), null);
    const idea = (videoId && ideaByVideo.get(videoId)) || ideaByTitle.get(title.toLowerCase()) || null;
    const snapshot = {
      channelId, ideaId: idea?.id || null, videoId, title, format, durationSeconds: duration,
      capturedAt: rowCapturedAt, publishedAt,
      impressions: numberValue(first(record, ['impressions']), null),
      views: Math.max(0, Math.round(numberValue(first(record, ['views']), 0))),
      clickThroughRate: numberValue(first(record, ['impressions click through rate', 'click through rate', 'ctr']), null),
      averageViewDurationSeconds: durationSeconds(first(record, ['average view duration', 'average view duration seconds'])),
      averageViewPercentage: numberValue(first(record, ['average percentage viewed', 'average view percentage']), null),
      retention30sPercentage: numberValue(first(record, ['retention 30s', '30 second retention', 'retention30s percentage']), null),
      subscribersGained: Math.round(numberValue(first(record, ['subscribers gained', 'subscribers']), 0)),
      watchTimeHours: numberValue(first(record, ['watch time hours', 'watch time']), null),
      revenue: numberValue(first(record, ['estimated revenue', 'revenue']), null),
      rpm: numberValue(first(record, ['rpm']), null),
      trafficSources: {}, source: 'csv',
    };
    const identity = JSON.stringify([
      channelId, videoId || title.toLowerCase(), snapshot.impressions, snapshot.views,
      snapshot.clickThroughRate, snapshot.averageViewDurationSeconds, snapshot.averageViewPercentage,
      snapshot.retention30sPercentage, snapshot.subscribersGained, snapshot.watchTimeHours,
      snapshot.revenue, snapshot.rpm,
    ]);
    snapshots.push({
      id: `metric-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`,
      ...snapshot,
    });
  }
  return { snapshots, errors };
}
