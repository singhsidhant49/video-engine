/**
 * Centralized Persistent Cache & Asset Deduplication Manager (Milestone 12).
 * 
 * Provides disk-backed caching across expensive pipeline operations:
 * 1. TTS Narration Cache (`.cache/tts/`)
 * 2. Whisper Alignment Cache (`.cache/alignment/`)
 * 3. Media Download & Deduplication Cache (`.cache/media/`)
 * 4. Provider Asset Search Cache (`.cache/searches/`)
 * 5. Normalized Media / Waveform / Crop Cache (`.cache/normalized/`)
 * 
 * Automatically tracks metrics (hits, misses, bytes reused, time saved) and
 * generates cache-diagnostics.json.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../../config/index.js';

const CACHE_ROOT = path.join(config.rootDir, '.cache');

class CacheMetrics {
  constructor() {
    this.ttsHits = 0;
    this.ttsMisses = 0;
    this.alignmentHits = 0;
    this.alignmentMisses = 0;
    this.assetSearchHits = 0;
    this.assetSearchMisses = 0;
    this.assetDownloadHits = 0;
    this.assetDownloadMisses = 0;
    this.normalizedMediaHits = 0;
    this.normalizedMediaMisses = 0;
    this.bytesReused = 0;
    this.estimatedTimeSavedMs = 0;
  }

  toJSON() {
    return {
      ttsHits: this.ttsHits,
      ttsMisses: this.ttsMisses,
      alignmentHits: this.alignmentHits,
      alignmentMisses: this.alignmentMisses,
      assetSearchHits: this.assetSearchHits,
      assetSearchMisses: this.assetSearchMisses,
      assetDownloadHits: this.assetDownloadHits,
      assetDownloadMisses: this.assetDownloadMisses,
      normalizedMediaHits: this.normalizedMediaHits,
      normalizedMediaMisses: this.normalizedMediaMisses,
      bytesReused: this.bytesReused,
      bytesReusedMb: Number((this.bytesReused / (1024 * 1024)).toFixed(2)),
      estimatedTimeSavedSec: Number((this.estimatedTimeSavedMs / 1000).toFixed(1)),
    };
  }
}

export const metrics = new CacheMetrics();

function hashString(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

/**
 * Ensures all cache subdirectories exist.
 */
export async function ensureCacheDirs() {
  const dirs = [
    CACHE_ROOT,
    path.join(CACHE_ROOT, 'tts'),
    path.join(CACHE_ROOT, 'alignment'),
    path.join(CACHE_ROOT, 'media'),
    path.join(CACHE_ROOT, 'searches'),
    path.join(CACHE_ROOT, 'normalized'),
  ];
  for (const d of dirs) {
    await fs.mkdir(d, { recursive: true });
  }
}

// ─── 1. TTS Narration Cache ──────────────────────────────────────────────────

export const ttsCache = {
  getKey({ text, voice, speed = 0.9, engine = 'kokoro-v1' }) {
    return hashString(`${text.trim()}|${voice}|${speed}|${engine}`);
  },

  async get(params) {
    await ensureCacheDirs();
    const key = this.getKey(params);
    const wavPath = path.join(CACHE_ROOT, 'tts', `${key}.wav`);
    try {
      const stat = await fs.stat(wavPath);
      if (stat.size > 1000) {
        metrics.ttsHits++;
        metrics.bytesReused += stat.size;
        metrics.estimatedTimeSavedMs += 15000; // ~15s Kokoro generation saved
        return { hit: true, wavPath, size: stat.size };
      }
    } catch {
      metrics.ttsMisses++;
    }
    return { hit: false, wavPath: null };
  },

  async set(params, buffer) {
    await ensureCacheDirs();
    const key = this.getKey(params);
    const wavPath = path.join(CACHE_ROOT, 'tts', `${key}.wav`);
    await fs.writeFile(wavPath, buffer);
    return wavPath;
  },
};

// ─── 2. Whisper Alignment Cache ─────────────────────────────────────────────

export const alignmentCache = {
  getKey({ audioHash, script, model = 'whisper-base.en' }) {
    const scriptHash = hashString(script.trim());
    return hashString(`${audioHash}|${scriptHash}|${model}`);
  },

  async get(params) {
    await ensureCacheDirs();
    const key = this.getKey(params);
    const jsonPath = path.join(CACHE_ROOT, 'alignment', `${key}.json`);
    try {
      const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
      metrics.alignmentHits++;
      metrics.estimatedTimeSavedMs += 20000; // ~20s Whisper transcription saved
      return { hit: true, data };
    } catch {
      metrics.alignmentMisses++;
    }
    return { hit: false, data: null };
  },

  async set(params, data) {
    await ensureCacheDirs();
    const key = this.getKey(params);
    const jsonPath = path.join(CACHE_ROOT, 'alignment', `${key}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
    return jsonPath;
  },
};

import sharp from 'sharp';

/**
 * Computes a 64-bit difference hash (dHash) for an image buffer.
 * Near-duplicate images have a small Hamming distance (<= 10).
 */
export async function computePerceptualHash(imageBuffer) {
  try {
    const raw = await sharp(imageBuffer)
      .resize(9, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
    let hash = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = raw[row * 9 + col];
        const right = raw[row * 9 + col + 1];
        hash += (left < right ? '1' : '0');
      }
    }
    return BigInt('0b' + hash).toString(16).padStart(16, '0');
  } catch {
    return null;
  }
}

/**
 * Computes the Hamming distance (bit differences) between two 16-hex-char perceptual hashes.
 */
export function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    const v = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    dist += (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1);
  }
  return dist;
}

// ─── 3. Media Download & Deduplication Cache ─────────────────────────────────

export const mediaCache = {
  getKey({ provider, id, url }) {
    return hashString(`${provider || 'generic'}:${id || url}`);
  },

  async get(params) {
    await ensureCacheDirs();
    const key = this.getKey(params);
    const metaPath = path.join(CACHE_ROOT, 'media', `${key}.json`);
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      const filePath = path.join(CACHE_ROOT, 'media', `${key}${meta.ext || '.bin'}`);
      const stat = await fs.stat(filePath);
      if (stat.size > 0) {
        metrics.assetDownloadHits++;
        metrics.bytesReused += stat.size;
        metrics.estimatedTimeSavedMs += 2500;
        return { hit: true, filePath, meta };
      }
    } catch {
      metrics.assetDownloadMisses++;
    }
    return { hit: false, filePath: null, meta: null };
  },

  async set(params, buffer, meta = {}) {
    await ensureCacheDirs();
    const key = this.getKey(params);
    const ext = meta.ext || (meta.type === 'video' ? '.mp4' : '.jpg');
    const filePath = path.join(CACHE_ROOT, 'media', `${key}${ext}`);
    const metaPath = path.join(CACHE_ROOT, 'media', `${key}.json`);
    
    // Compute cryptographic content hash
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Optional perceptual hash for images
    let pHash = null;
    if (ext.match(/\.(jpg|jpeg|png|webp)$/i)) {
      pHash = await computePerceptualHash(buffer);
    }

    await fs.writeFile(filePath, buffer);
    const fullMeta = {
      key,
      contentHash,
      pHash,
      ext,
      provider: meta.provider || params.provider || 'unknown',
      sourceUrl: meta.sourceUrl || params.url || null,
      license: meta.license || null,
      credit: meta.credit || null,
      retrievedAt: new Date().toISOString(),
      width: meta.width || null,
      height: meta.height || null,
    };
    await fs.writeFile(metaPath, JSON.stringify(fullMeta, null, 2));
    return { filePath, meta: fullMeta };
  },
};

// ─── 4. Search Query Cache ──────────────────────────────────────────────────

export const searchCache = {
  getKey({ provider, query, options = {} }) {
    return hashString(`${provider}:${query.toLowerCase().trim()}:${JSON.stringify(options)}`);
  },

  async get(params) {
    await ensureCacheDirs();
    const key = this.getKey(params);
    const jsonPath = path.join(CACHE_ROOT, 'searches', `${key}.json`);
    try {
      const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
      metrics.assetSearchHits++;
      metrics.estimatedTimeSavedMs += 800;
      return { hit: true, data };
    } catch {
      metrics.assetSearchMisses++;
    }
    return { hit: false, data: null };
  },

  async set(params, data) {
    await ensureCacheDirs();
    const key = this.getKey(params);
    const jsonPath = path.join(CACHE_ROOT, 'searches', `${key}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
    return jsonPath;
  },
};

// ─── 5. Cache Storage Statistics & Management ────────────────────────────────

export async function getCacheStats() {
  await ensureCacheDirs();
  const subdirs = ['tts', 'alignment', 'media', 'searches', 'normalized'];
  const breakdown = {};
  let totalBytes = 0;
  let totalFiles = 0;

  for (const sub of subdirs) {
    const dir = path.join(CACHE_ROOT, sub);
    try {
      const files = await fs.readdir(dir);
      let bytes = 0;
      for (const f of files) {
        const s = await fs.stat(path.join(dir, f));
        bytes += s.size;
      }
      breakdown[sub] = { filesCount: files.length, sizeMb: Number((bytes / (1024 * 1024)).toFixed(2)) };
      totalBytes += bytes;
      totalFiles += files.length;
    } catch {
      breakdown[sub] = { filesCount: 0, sizeMb: 0 };
    }
  }

  return {
    cacheRoot: CACHE_ROOT,
    totalFiles,
    totalSizeMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
    breakdown,
    metrics: metrics.toJSON(),
  };
}

export async function cleanCache({ olderThanDays = 14 } = {}) {
  await ensureCacheDirs();
  const subdirs = ['tts', 'alignment', 'media', 'searches', 'normalized'];
  let removedCount = 0;
  let freedBytes = 0;
  const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

  for (const sub of subdirs) {
    const dir = path.join(CACHE_ROOT, sub);
    try {
      const files = await fs.readdir(dir);
      for (const f of files) {
        const p = path.join(dir, f);
        const s = await fs.stat(p);
        if (s.mtimeMs < cutoffTime) {
          freedBytes += s.size;
          await fs.unlink(p);
          removedCount++;
        }
      }
    } catch {}
  }

  return {
    removedCount,
    freedMb: Number((freedBytes / (1024 * 1024)).toFixed(2)),
  };
}
