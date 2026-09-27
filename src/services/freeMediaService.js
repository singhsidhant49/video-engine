import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { runBinary, ffmpeg } from './ffmpeg.js';
import { licenseFromExtmeta } from '../shared/licensing.js';

/**
 * Media sources. Each returns candidates tagged with a quality TIER; the
 * Asset Director (src/pipeline/assetDirector.js) decides which tiers a scene
 * may use and in what order.
 *
 *   verified   the real subject: Wikipedia lead image of the entity, or a Commons file whose title names it
 *   relevant   query-matched stock/archive: Commons, Pexels, Pixabay (photo and video)
 *   generated  purpose-built image from a generator (IMAGE_GENERATOR, default pollinations)
 *   generic    curated library by topic — last resort, never for a named subject
 */

const UA = {
  'User-Agent': 'VideoEngineBot/2.0 (https://github.com/singhsidhant49/video-engine; contact: support@videoengine.org)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
};
const CACHE_DIR = path.join(config.rootDir, '.cache', 'media');
export const MIN_SHORT_SIDE = 640;

async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

const SEARCH_CACHE = path.join(config.rootDir, '.cache', 'search');
const SEARCH_TTL_MS = 7 * 24 * 3600 * 1000;
/** Search failures (rate limits, outages) this process — so reports can tell "unreachable" from "nothing found". */
export const searchStats = { ok: 0, cached: 0, failed: 0, failures: [] };

/**
 * GET JSON with a disk cache and retry/backoff on 429/5xx. Wikimedia rate-limits
 * bursts of searches; without this, repeated runs silently lose every candidate.
 */
async function getJson(url, opts, ms = 8000) {
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const file = path.join(SEARCH_CACHE, `${key}.json`);
  try {
    const st = await fs.stat(file);
    if (Date.now() - st.mtimeMs < SEARCH_TTL_MS) { searchStats.cached++; return JSON.parse(await fs.readFile(file, 'utf8')); }
  } catch { /* miss */ }
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts, ms);
      if (res.ok) {
        const data = await res.json();
        searchStats.ok++;
        await fs.mkdir(SEARCH_CACHE, { recursive: true });
        await fs.writeFile(file, JSON.stringify(data));
        return data;
      }
      if (res.status === 404) return null;
      lastErr = `HTTP ${res.status}`;
      if (res.status === 429) break; // Don't stall on rate limits when other providers are available
      if (res.status < 500) break;
      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      lastErr = err.name === 'AbortError' ? 'timeout' : err.message;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  searchStats.failed++;
  searchStats.failures.push(`${new URL(url).host}: ${lastErr}`);
  return null;
}

const WEAK = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'and', 'at', 'to', 'for', 'with', 'file', 'jpg', 'jpeg', 'png', 'photo', 'image', 'view', 'new', 'showing', 'video', 'shot', 'visual']);
export const keywords = (text) => String(text || '').toLowerCase().replace(/\.(jpe?g|png|webp)$/i, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !WEAK.has(w)).map((w) => w.replace(/s$/, ''));

export function cleanQuery(q) {
  if (!q) return '';
  const clean = String(q).replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const kw = keywords(clean);
  return kw.slice(0, 3).join(' ') || clean;
}
const namedPhrases = (text) => (String(text || '').match(/(?:[A-Z][\w'&.-]*\s?)+/g) || []).map((p) => keywords(p).join(' ')).filter(Boolean);
const containsPhrase = (title, phrase) => ` ${keywords(title).join(' ')} `.includes(` ${phrase} `);

// ─── Stills ────────────────────────────────────────────────────────────────

export async function wikipediaLeadImage(title) {
  const summary = async (t) => getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/\s+/g, '_'))}`);
  let page = await summary(title);
  if (!page?.originalimage) {
    const search = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(title)}`);
    const hit = search?.query?.search?.[0]?.title;
    if (hit) page = await summary(hit);
  }
  const img = page?.originalimage;
  if (!img?.source || /\.svg($|\?)/i.test(img.source)) return [];
  // Licence of the lead image: enwiki knows both Commons files and its own local (often non-free) uploads.
  const m = /\/wikipedia\/(?:commons|en)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/.exec(img.source);
  let license = null;
  if (m) {
    const fileTitle = `File:${decodeURIComponent(m[1])}`;
    const info = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&iiextmetadatafilter=LicenseShortName|Artist|AttributionRequired|LicenseUrl|NonFree&titles=${encodeURIComponent(fileTitle)}`);
    const ii = Object.values(info?.query?.pages || {})[0]?.imageinfo?.[0];
    if (ii) license = licenseFromExtmeta(ii.extmetadata, ii.descriptionurl);
  }
  return [{ type: 'image', url: img.source, width: img.width, height: img.height, source: 'wikipedia', tier: 'verified', weight: 3.2, label: page.title, license }];
}

const COMMONS_JUNK = /\b(logo|icon|flag|map|coat of arms|seal|diagram|chart|graph|signature|svg|locator|symbol)\b/i;

/** Commons search, filtered for relevance. Hits whose title names `entityName` are tier "verified". */
export async function commonsSearch(query, entityName) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12'
    + `&gsrsearch=${encodeURIComponent(query)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=2400`
    + '&iiextmetadatafilter=LicenseShortName|Artist|AttributionRequired|LicenseUrl|NonFree';
  const data = await getJson(url);
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const wantsJunk = COMMONS_JUNK.test(query);
  const q = [...new Set(keywords(query))];
  const need = Math.max(1, Math.ceil(q.length * 0.34));
  // Capitalised runs are names ("Wall Street"): one must appear in the title as a contiguous phrase.
  const phrases = namedPhrases(query);
  const entityPhrase = entityName ? keywords(entityName).join(' ') : null;
  return pages
    .map((p) => ({ title: p.title || '', info: p.imageinfo?.[0] }))
    .filter(({ title, info }) => info && /image\/(jpeg|png|webp)/.test(info.mime) && (wantsJunk || !COMMONS_JUNK.test(title)))
    .filter(({ title }) => {
      const t = new Set(keywords(title));
      const namedOk = !phrases.length || phrases.some((p) => containsPhrase(title, p));
      return namedOk && q.filter((w) => t.has(w)).length >= need;
    })
    .map(({ title, info }, rank) => ({
      type: 'image',
      url: info.thumburl || info.url,
      width: info.thumbwidth || info.width,
      height: info.thumbheight || info.height,
      source: 'commons',
      tier: entityPhrase && containsPhrase(title, entityPhrase) ? 'verified' : 'relevant',
      weight: 2.4 - rank * 0.12,
      label: title,
      license: licenseFromExtmeta(info.extmetadata, info.descriptionurl),
    }));
}

export async function pexelsSearch(query, orientation) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const data = await getJson(`https://api.pexels.com/v1/search?per_page=8&orientation=${orientation}&query=${encodeURIComponent(query)}`, { headers: { Authorization: key } });
  return (data?.photos || []).map((p, rank) => ({ type: 'image', url: p.src.original, width: p.width, height: p.height, source: 'pexels', tier: 'relevant', weight: 2.6 - rank * 0.1, label: p.alt,
    license: { name: 'Pexels License', url: 'https://www.pexels.com/license/', author: p.photographer, attributionRequired: false, nonFree: false, page: p.url } }));
}

export async function braveImageSearch(query, orientation) {
  const key = process.env.BRAVE_SEARCH_KEY;
  if (!key) return [];
  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=10&safesearch=strict`;
  const data = await getJson(url, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': key } }, 7000);
  return (data?.results || []).map((r, rank) => {
    const p = r.properties || {};
    const imgUrl = p.url || r.thumbnail?.src;
    if (!imgUrl) return null;
    return {
      type: 'image',
      url: imgUrl,
      width: p.width || r.thumbnail?.width || 1280,
      height: p.height || r.thumbnail?.height || 720,
      source: 'brave',
      tier: 'relevant',
      weight: 2.75 - rank * 0.1,
      label: r.title || query,
      license: {
        name: 'Web Editorial (Brave Search)',
        url: r.url || null,
        author: r.source || null,
        attributionRequired: false,
        nonFree: false,
        page: r.url || null,
      },
    };
  }).filter(Boolean);
}

export async function pixabaySearch(query, orientation) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const o = orientation === 'portrait' ? 'vertical' : 'horizontal';
  const data = await getJson(`https://pixabay.com/api/?key=${key}&image_type=photo&safesearch=true&per_page=8&orientation=${o}&q=${encodeURIComponent(query)}`);
  return (data?.hits || []).map((h, rank) => ({ type: 'image', url: h.largeImageURL, width: h.imageWidth, height: h.imageHeight, source: 'pixabay', tier: 'relevant', weight: 2.2 - rank * 0.1, label: h.tags,
    license: { name: 'Pixabay Content License', url: 'https://pixabay.com/service/license-summary/', author: h.user, attributionRequired: false, nonFree: false, page: h.pageURL } }));
}

/** Purpose-built image for the scene's visual concept. Swap providers via IMAGE_GENERATOR. */
export function generatedCandidate(prompt, format, seed) {
  const provider = (process.env.IMAGE_GENERATOR || 'pollinations').toLowerCase();
  if (provider === 'none') return null;
  const [w, h] = format === 'shorts' ? [1080, 1920] : [1920, 1080];
  const p = encodeURIComponent(`documentary photograph, natural light, realistic, no text, ${prompt}`);
  return { type: 'image', url: `https://image.pollinations.ai/prompt/${p}?width=${w}&height=${h}&nologo=true&seed=${seed}`, width: w, height: h, source: 'ai', tier: 'generated', weight: 1.0, timeout: 10000, retries: 0,
    license: { name: `AI-generated (${provider})`, url: null, author: null, attributionRequired: false, nonFree: false, page: null, note: 'check the provider terms for commercial use' } };
}

const GENERIC_LIBRARY = {
  finance: ['1590283603385-17ffb3a7f29f', '1611974789855-9c2a0a7236a3', '1642790106117-e829e14a795f', '1535320903710-d993d3d77d29', '1560520653-9e0e4c89eb11'],
  technology: ['1558494949-ef010cbdcc31', '1526374965328-7f61d4dc18c5', '1550751827-4bd374c3f58b', '1518770660439-4636190af475', '1677442136019-21780ecad995'],
  history: ['1461360370896-922624d12aa1', '1564769625905-50e93615e769', '1599420186946-7a27d4917b10', '1508175688552-6655ba7bfb5e', '1575505586569-646b2ca898fc'],
  science: ['1507413245164-6160d8298b31', '1532187863486-abf9dbad1b69', '1576086213369-97a306d36557', '1451187580459-43490279c0fa', '1614935151651-0bea6508db6b'],
  business: ['1486406146926-c627a92ad1ab', '1556761175-5973dc0f32e7', '1497366216548-37526070297c', '1573164713714-d95e436ab8d6', '1553028826-f4804a6dba3b'],
  crime: ['1589391886645-d51941baf7fb', '1453873531674-2151bcd01707', '1587825140708-dfaf18c4c235', '1578328819058-b69f3a3a11ea'],
  nature: ['1470071459604-3b5ec3a7fe05', '1441974231531-c6227db76b6e', '1501854140801-50d01698950b', '1433086966358-54859d0ed716'],
  health: ['1576091160399-112ba8d25d1d', '1559757175-5700dde675bc', '1530026405186-ed1f139313f8', '1579684385127-1ef15d508118'],
  travel: ['1488085061387-422e29b40080', '1502920917128-1aa500764cbd', '1476514525535-07fb3b4ae5f1', '1500835556837-99ac94a94552'],
};

function topicCategory(text) {
  const t = ` ${text} `.toLowerCase();
  const rules = [
    ['finance', /\b(finance|financial|money|bank|stock|market|crisis|crash|debt|economy|wall street|trillion|billion)\b/],
    ['crime', /\b(crime|fraud|murder|investigation|police|prison|court|scam)\b/],
    ['history', /\b(history|ancient|empire|century|revolution|archive|medieval|war)\b/],
    ['science', /\b(science|space|physics|biology|chemistry|lab|research|quantum)\b/],
    ['health', /\b(health|medical|hospital|doctor|disease|brain|dna)\b/],
    ['technology', /\b(tech|software|code|ai|computer|chip|internet|data)\b/],
    ['travel', /\b(travel|city|country|destination|tourism|flight|hotel)\b/],
    ['nature', /\b(nature|forest|ocean|mountain|river|animal|wildlife|climate)\b/],
  ];
  return (rules.find(([, re]) => re.test(t)) || ['business'])[0];
}

export function genericCandidates(topicText, sceneIndex) {
  const lib = GENERIC_LIBRARY[topicCategory(topicText)];
  return lib.map((id, k) => ({
    type: 'image',
    url: `https://images.unsplash.com/photo-${id}?q=85&w=2000&auto=format&fit=crop`,
    source: 'generic', tier: 'generic', generic: true, weight: 0.3 - ((k + sceneIndex) % lib.length) * 0.01,
    license: { name: 'Unsplash License', url: 'https://unsplash.com/license', author: null, attributionRequired: false, nonFree: false, page: `https://unsplash.com/photos/${id}` },
  }));
}

// ─── Motion footage ────────────────────────────────────────────────────────

/** Pexels video search: clips at least `minSeconds` long, file closest to 1080–2560 on its short/long side. */
export async function pexelsVideoSearch(query, orientation, minSeconds = 4) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const data = await getJson(`https://api.pexels.com/videos/search?per_page=8&orientation=${orientation}&query=${encodeURIComponent(query)}`, { headers: { Authorization: key } });
  const out = [];
  (data?.videos || []).forEach((v, rank) => {
    if (!v.duration || v.duration < Math.min(minSeconds, 8)) return;
    const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width && f.height && Math.max(f.width, f.height) <= 2600);
    files.sort((a, b) => Math.abs(Math.min(a.width, a.height) - 1080) - Math.abs(Math.min(b.width, b.height) - 1080));
    const f = files[0];
    if (!f || Math.min(f.width, f.height) < 720) return;
    out.push({ type: 'video', url: f.link, width: f.width, height: f.height, duration: v.duration, source: 'pexels-video', tier: 'relevant', weight: 2.7 - rank * 0.1, label: v.url,
      license: { name: 'Pexels License', url: 'https://www.pexels.com/license/', author: v.user?.name, attributionRequired: false, nonFree: false, page: v.url } });
  });
  return out;
}

// ─── Download, validate, normalise ─────────────────────────────────────────

/**
 * Circuit breaker per download host. Major CDNs (Pexels, Unsplash, Brave, Commons)
 * are exempt from aggressive tripping so individual slow images never block the entire source.
 */
const hostFailures = new Map();
const CDN_EXEMPT = new Set(['images.pexels.com', 'images.unsplash.com', 'api.search.brave.com', 'upload.wikimedia.org', 'commons.wikimedia.org']);
export const breakerOpen = (url) => {
  try {
    const host = new URL(url).host;
    if (CDN_EXEMPT.has(host)) return false;
    return (hostFailures.get(host) || 0) >= 6;
  } catch {
    return false;
  }
};

async function downloadCached(url, timeout, retries = 0) {
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE_DIR, `${key}.bin`);
  try {
    await fs.access(file);
    return file;
  } catch { /* not cached */ }
  const host = new URL(url).host;
  if (breakerOpen(url)) throw new Error(`${host} skipped (failing this run)`);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {}, timeout || 15000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(file, buf);
      hostFailures.set(host, 0);
      return file;
    } catch (err) {
      lastErr = err;
      // 4xx is about this URL, not the host; timeouts and 5xx count against the host.
      if (!/HTTP 4\d\d/.test(err.message)) hostFailures.set(host, (hostFailures.get(host) || 0) + 1);
      if (breakerOpen(url)) { console.warn(`   ⚡ ${host} failing — skipped for the rest of this run`); break; }
    }
  }
  throw lastErr;
}

import { getSharp, getImageDimensions } from './imageUtils.js';

/** Focal point via libvips' attention strategy (edges, saturation, skin tones). */
async function focalPoint(buf) {
  const sharp = getSharp();
  if (!sharp) return { x: 0.5, y: 0.45 };
  try {
    const small = await sharp(buf).rotate().resize(480, 480, { fit: 'inside' }).toBuffer({ resolveWithObject: true });
    const { width, height } = small.info;
    const box = Math.round(Math.min(width, height) * 0.45);
    const { info } = await sharp(small.data).resize(box, box, { fit: 'cover', position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true });
    const scale = Math.max(box / width, box / height);
    const sw = width * scale, sh = height * scale;
    const cx = Number.isFinite(info.attentionX) ? info.attentionX / sw : (Math.abs(info.cropOffsetLeft || 0) + box / 2) / sw;
    const cy = Number.isFinite(info.attentionY) ? info.attentionY / sh : (Math.abs(info.cropOffsetTop || 0) + box / 2) / sh;
    const clamp = (v) => Math.min(0.8, Math.max(0.2, Number.isFinite(v) ? v : 0.5));
    return { x: +clamp(cx).toFixed(3), y: +clamp(cy).toFixed(3) };
  } catch (e) {
    return { x: 0.5, y: 0.45 };
  }
}

/** 64-bit difference hash, for spotting the same photo under different URLs. */
export async function dHash(buf) {
  const sharp = getSharp();
  if (!sharp) return crypto.createHash('sha256').update(buf).digest('hex');
  try {
    const px = await sharp(buf).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
    let bits = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? '1' : '0';
    return bits;
  } catch (e) {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }
}
export const hamming = (a, b) => {
  if (!a || !b) return 64;
  if (a.length !== b.length || a.length !== 64) return a === b ? 0 : 64;
  return [...a].reduce((n, c, i) => n + (c !== b[i]), 0);
};

export async function materialiseImage(candidate, outFile) {
  let cachedPath;
  if (candidate.localPath) {
    cachedPath = candidate.localPath;
  } else if (candidate.url && candidate.url.startsWith('file://')) {
    cachedPath = candidate.url.replace(/^file:\/\//, '');
  } else {
    cachedPath = await downloadCached(candidate.url, candidate.timeout, candidate.retries);
  }
  const buf = await fs.readFile(cachedPath);
  const sharp = getSharp();
  
  if (sharp) {
    try {
      const img = sharp(buf, { failOn: 'error' }).rotate();
      const meta = await img.metadata();
      const w = meta.autoOrient?.width || meta.width, h = meta.autoOrient?.height || meta.height;
      if (!w || !h || Math.min(w, h) < MIN_SHORT_SIDE) throw new Error(`too small (${w}×${h})`);
      if (Math.max(w, h) / Math.min(w, h) > 3.2) throw new Error(`extreme aspect (${w}×${h})`);
      const out = await img.resize(2600, 2600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      await fs.writeFile(outFile, out.data);
      return { type: 'image', width: out.info.width, height: out.info.height, focal: await focalPoint(out.data), hash: await dHash(out.data) };
    } catch (err) {
      // Fallback to ffmpeg
    }
  }

  // Reliable ffmpeg transcoding & validation: transcode to standard browser-compatible JPEG
  try {
    await ffmpeg(['-y', '-i', cachedPath, '-vf', 'scale=min(2600\\,iw):-2', '-q:v', '2', outFile]);
    const { stdout } = await runBinary('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', outFile]);
    const info = JSON.parse(stdout);
    const w = info.streams?.[0]?.width;
    const h = info.streams?.[0]?.height;
    if (!w || !h || Math.min(w, h) < MIN_SHORT_SIDE) throw new Error(`too small (${w}×${h})`);
    if (Math.max(w, h) / Math.min(w, h) > 3.2) throw new Error(`extreme aspect (${w}×${h})`);
    const finalBuf = await fs.readFile(outFile);
    return { type: 'image', width: w, height: h, focal: { x: 0.5, y: 0.45 }, hash: await dHash(finalBuf) };
  } catch (err) {
    throw new Error(`invalid/corrupted image: ${err.message}`);
  }
}

export async function materialiseVideo(candidate, outFile) {
  const cached = await downloadCached(candidate.url, 90000, 1);
  const { stdout } = await runBinary('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', cached]);
  const info = JSON.parse(stdout);
  const width = info.streams?.[0]?.width, height = info.streams?.[0]?.height, duration = parseFloat(info.format?.duration);
  if (!width || !height || !Number.isFinite(duration)) throw new Error('unreadable video');
  if (Math.min(width, height) < 720) throw new Error(`video too small (${width}×${height})`);
  await fs.copyFile(cached, outFile);
  return { type: 'video', width, height, duration, focal: { x: 0.5, y: 0.45 }, hash: null };
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}
