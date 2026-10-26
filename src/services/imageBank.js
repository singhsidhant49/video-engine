import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { keywords } from './freeMediaService.js';

const BANK_DIR = path.join(config.rootDir, '.cache', 'image_bank');
const INDEX_FILE = path.join(BANK_DIR, 'bank_index.json');
const INDEX_LOCK_FILE = path.join(BANK_DIR, '.index.lock');

let memoryIndex = null;
let memoryIndexMtimeMs = 0;

async function loadIndex({ forceRefresh = false } = {}) {
  if (memoryIndex && !forceRefresh) {
    try {
      const stat = await fs.stat(INDEX_FILE);
      if (stat.mtimeMs === memoryIndexMtimeMs) return memoryIndex;
    } catch {}
  }
  try {
    await fs.mkdir(BANK_DIR, { recursive: true });
    const data = await fs.readFile(INDEX_FILE, 'utf8');
    memoryIndex = JSON.parse(data);
    memoryIndexMtimeMs = (await fs.stat(INDEX_FILE)).mtimeMs;
  } catch {
    memoryIndex = { images: [] };
    memoryIndexMtimeMs = 0;
  }
  return memoryIndex;
}

async function saveIndex(idx) {
  try {
    await fs.mkdir(BANK_DIR, { recursive: true });
    const tempFile = `${INDEX_FILE}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(idx, null, 2), 'utf8');
    await fs.rename(tempFile, INDEX_FILE);
    memoryIndex = idx;
    memoryIndexMtimeMs = (await fs.stat(INDEX_FILE)).mtimeMs;
  } catch (err) {
    console.warn(`[ImageBank] Failed to persist index: ${err.message}`);
    throw err;
  }
}

async function withIndexLock(work, { timeoutMs = 15_000 } = {}) {
  await fs.mkdir(BANK_DIR, { recursive: true });
  const deadline = Date.now() + timeoutMs;
  while (true) {
    let handle;
    try {
      handle = await fs.open(INDEX_LOCK_FILE, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      try { return await work(); }
      finally {
        await handle.close().catch(() => {});
        await fs.unlink(INDEX_LOCK_FILE).catch(() => {});
      }
    } catch (error) {
      await handle?.close().catch(() => {});
      if (error.code !== 'EEXIST') throw error;
      try {
        const stat = await fs.stat(INDEX_LOCK_FILE);
        if (Date.now() - stat.mtimeMs > 60_000) {
          await fs.unlink(INDEX_LOCK_FILE);
          continue;
        }
      } catch {}
      if (Date.now() >= deadline) throw new Error('Timed out waiting for image bank index lock');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/**
 * Derive search tokens strictly from intrinsic metadata (description and label).
 * Dynamic search query strings from transient runs are never included.
 */
export function deriveBankTokens({ description = '', label = '' } = {}) {
  const intrinsicText = `${description} ${label}`.toLowerCase();
  return [...new Set(keywords(intrinsicText))];
}

/**
 * Save an image to the local Image Bank with metadata and searchable keywords.
 */
export async function recordImageInBank({ filePath, description = '', query = '', source = 'unknown', label = '', license = null, width = 0, height = 0, inspection = null, category = null, candidate = null }) {
  if (!filePath) return;
  try {
    const buf = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const ext = path.extname(filePath) || '.jpg';
    const bankFile = path.join(BANK_DIR, `${hash}${ext}`);

    // Copy to persistent bank storage if not already there
    try {
      await fs.access(bankFile);
    } catch {
      await fs.writeFile(bankFile, buf);
    }

    // CRITICAL: Tokens must ONLY be derived from the asset's intrinsic description and label,
    // NEVER from transient query strings of arbitrary video runs (Smoking Gun #1).
    const tokens = deriveBankTokens({ description, label });
    const verificationStatus = inspection?.pixelInspected && inspection?.inspectionConfidence >= 0.45 ? 'verified' : 'quarantined';

    await withIndexLock(async () => {
      const idx = await loadIndex({ forceRefresh: true });
      const existing = idx.images.find((img) => img.id === hash);
      if (existing) {
        existing.uses = (existing.uses || 1) + 1;
        // Do NOT append unrelated query tokens from subsequent runs!
        existing.lastUsed = new Date().toISOString();
      } else {
        idx.images.push({
        id: hash,
        file: bankFile,
        description: description.slice(0, 200),
        label: label.slice(0, 100),
        tokens,
        source,
        license,
        width,
        height,
        savedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        uses: 1,
        verificationStatus,
        inspectionVersion: 'visual-inspection-v3',
        intrinsicObservations: inspection ? {
          primarySubject: inspection.primarySubject,
          visibleObjects: inspection.visibleObjects,
          visibleAction: inspection.visibleAction,
          environment: inspection.environment,
          sceneSummary: inspection.sceneSummary,
          confidence: inspection.inspectionConfidence,
        } : null,
        });
      }

      // Keep bank index healthy (top 500 images)
      if (idx.images.length > 500) idx.images = idx.images.slice(-500);

      await saveIndex(idx);
    });

    // Also persist into the curated Media Bank
    await recordMediaInBank({
      filePath,
      type: 'image',
      description,
      query,
      source,
      label,
      license,
      width,
      height,
      inspection,
      category,
      candidate,
    });
  } catch (err) {
    // Non-fatal
  }
}

/**
 * Clean poisoned or contaminated tokens from the persistent bank index.
 */
export async function sanitizeBankIndex() {
  try {
    const idx = await loadIndex();
    for (const img of idx.images) {
      const intrinsicText = `${img.description || ''} ${img.label || ''}`.toLowerCase();
      img.tokens = [...new Set(keywords(intrinsicText))];
      if (!img.inspectionVersion || !img.intrinsicObservations) {
        img.verificationStatus = 'quarantined';
        img.quarantineReason = 'legacy entry lacks versioned pixel-grounded intrinsic observations';
      }
    }
    await saveIndex(idx);
    return {
      total: idx.images.length,
      verified: idx.images.filter((image) => image.verificationStatus === 'verified').length,
      quarantined: idx.images.filter((image) => image.verificationStatus !== 'verified').length,
    };
  } catch {}
}

import { searchMediaBank, recordMediaInBank } from './mediaBank.js';

export { searchMediaBank, recordMediaInBank };

/**
 * Search the local Image Bank (both curated public/media-bank and cached web assets).
 */
export async function searchImageBank(queryText, { minMatches = 2, limit = 4, mediaType = 'all' } = {}) {
  if (!queryText) return [];

  // 1. Search curated Media Bank catalog first (high priority, pre-tagged)
  const curatedResults = await searchMediaBank(queryText, { limit, mediaType }).catch(() => []);

  // 2. Search cached Image Bank
  const cacheResults = [];
  try {
    const idx = await loadIndex();
    const qTokens = keywords(queryText);
    if (qTokens.length) {
      const effectiveMinMatches = Math.min(minMatches, qTokens.length);
      const scored = [];
      for (const item of idx.images) {
        if (item.verificationStatus !== 'verified') continue;
        const matchCount = qTokens.filter((tk) => (item.tokens || []).includes(tk)).length;
        if (matchCount >= effectiveMinMatches) {
          const score = matchCount / Math.max(qTokens.length, 1);
          scored.push({ item, score, matchCount });
        }
      }

      scored.sort((a, b) => b.matchCount - a.matchCount || b.score - a.score);

      for (const { item } of scored.slice(0, limit)) {
        try {
          await fs.access(item.file);
          cacheResults.push({
            type: 'image',
            id: `local-bank_${item.id}`,
            contentHash: item.id,
            url: `file://${item.file.split(path.sep).join('/')}`,
            localPath: item.file,
            width: item.width || 1920,
            height: item.height || 1080,
            source: `bank:${item.source}`,
            tier: 'fallback',
            weight: 1.15,
            label: item.label || item.description,
            license: item.license || { name: 'Local Bank Asset', attributionRequired: false, verification_status: 'manual_review', commercial_use: 'unknown' },
          });
        } catch {
          // File no longer on disk
        }
      }
    }
  } catch {}

  // Merge and deduplicate by contentHash / id
  const seenHashes = new Set();
  const merged = [];

  for (const asset of curatedResults) {
    if (!seenHashes.has(asset.contentHash)) {
      seenHashes.add(asset.contentHash);
      merged.push(asset);
    }
  }

  for (const asset of cacheResults) {
    if (!seenHashes.has(asset.contentHash)) {
      seenHashes.add(asset.contentHash);
      merged.push(asset);
    }
  }

  return merged.slice(0, limit);
}
