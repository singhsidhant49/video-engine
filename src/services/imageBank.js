import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { keywords } from './freeMediaService.js';

const BANK_DIR = path.join(config.rootDir, '.cache', 'image_bank');
const INDEX_FILE = path.join(BANK_DIR, 'bank_index.json');

let memoryIndex = null;

async function loadIndex() {
  if (memoryIndex) return memoryIndex;
  try {
    await fs.mkdir(BANK_DIR, { recursive: true });
    const data = await fs.readFile(INDEX_FILE, 'utf8');
    memoryIndex = JSON.parse(data);
  } catch {
    memoryIndex = { images: [] };
  }
  return memoryIndex;
}

async function saveIndex(idx) {
  memoryIndex = idx;
  try {
    await fs.mkdir(BANK_DIR, { recursive: true });
    await fs.writeFile(INDEX_FILE, JSON.stringify(idx, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[ImageBank] Failed to persist index: ${err.message}`);
  }
}

/**
 * Save an image to the local Image Bank with metadata and searchable keywords.
 */
export async function recordImageInBank({ filePath, description = '', query = '', source = 'unknown', label = '', license = null, width = 0, height = 0 }) {
  if (!filePath) return;
  try {
    const idx = await loadIndex();
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

    const allText = `${description} ${query} ${label}`.toLowerCase();
    const tokens = [...new Set(keywords(allText))];

    const existing = idx.images.find((img) => img.id === hash);
    if (existing) {
      existing.uses = (existing.uses || 1) + 1;
      existing.tokens = [...new Set([...(existing.tokens || []), ...tokens])];
      existing.lastUsed = new Date().toISOString();
    } else {
      idx.images.push({
        id: hash,
        file: bankFile,
        description: description.slice(0, 200),
        query: query.slice(0, 100),
        label: label.slice(0, 100),
        tokens,
        source,
        license,
        width,
        height,
        savedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        uses: 1,
      });
    }

    // Keep bank index healthy (top 500 images)
    if (idx.images.length > 500) {
      idx.images = idx.images.slice(-500);
    }

    await saveIndex(idx);
  } catch (err) {
    // Non-fatal
  }
}

/**
 * Search the local Image Bank for previously saved images matching a query.
 */
export async function searchImageBank(queryText, { minMatches = 1, limit = 4 } = {}) {
  if (!queryText) return [];
  try {
    const idx = await loadIndex();
    const qTokens = keywords(queryText);
    if (!qTokens.length) return [];

    const scored = [];
    for (const item of idx.images) {
      const matchCount = qTokens.filter((tk) => item.tokens.includes(tk)).length;
      if (matchCount >= minMatches) {
        const score = matchCount / Math.max(qTokens.length, 1);
        scored.push({ item, score, matchCount });
      }
    }

    scored.sort((a, b) => b.matchCount - a.matchCount || b.score - a.score);

    const results = [];
    for (const { item } of scored.slice(0, limit)) {
      try {
        await fs.access(item.file);
        results.push({
          type: 'image',
          url: `file://${item.file.split(path.sep).join('/')}`,
          localPath: item.file,
          width: item.width || 1920,
          height: item.height || 1080,
          source: `bank:${item.source}`,
          tier: 'relevant',
          weight: 2.85, // High priority because it is zero-latency local
          label: item.label || item.description,
          license: item.license || { name: 'Local Bank Asset', attributionRequired: false },
        });
      } catch {
        // File no longer on disk
      }
    }

    return results;
  } catch {
    return [];
  }
}
