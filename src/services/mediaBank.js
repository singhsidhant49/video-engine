import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { config } from '../config/index.js';
import { keywords } from './freeMediaService.js';
import { terms } from '../assets/assetSearchContext.js';

const defaultMediaBankDir = path.join(config.rootDir, 'public', 'media-bank');
let mediaBankDir = process.env.MEDIA_BANK_DIR ? path.resolve(process.env.MEDIA_BANK_DIR) : defaultMediaBankDir;
let catalogFile = path.join(mediaBankDir, 'catalog.json');
let catalogLockFile = path.join(mediaBankDir, '.catalog.lock');
const MEDIA_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov', '.webm']);
const SKIP_JSON_NAMES = new Set(['index.json', 'manifest.json', 'summary.json', 'package.json']);

let memoryCatalog = null;
let memoryCatalogMtimeMs = 0;

/** Test-only storage isolation hook. Production code should configure
 * MEDIA_BANK_DIR before process startup instead. */
export function configureMediaBankDirectory(directory = defaultMediaBankDir) {
  mediaBankDir = path.resolve(directory);
  catalogFile = path.join(mediaBankDir, 'catalog.json');
  catalogLockFile = path.join(mediaBankDir, '.catalog.lock');
  memoryCatalog = null;
  memoryCatalogMtimeMs = 0;
}

function writeJsonAtomicSync(filePath, value) {
  const temp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, filePath);
}

async function withCatalogLock(work, { timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  fs.mkdirSync(mediaBankDir, { recursive: true });
  while (true) {
    let handle;
    try {
      handle = fs.openSync(catalogLockFile, 'wx');
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      try { return await work(); }
      finally {
        fs.closeSync(handle);
        try { fs.unlinkSync(catalogLockFile); } catch {}
      }
    } catch (error) {
      if (handle != null) try { fs.closeSync(handle); } catch {}
      if (error.code !== 'EEXIST') throw error;
      try {
        const stat = fs.statSync(catalogLockFile);
        if (Date.now() - stat.mtimeMs > 60_000) {
          fs.unlinkSync(catalogLockFile);
          continue;
        }
      } catch {}
      if (Date.now() >= deadline) throw new Error('Timed out waiting for media catalog lock');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export function normalizeCategory(name) {
  const clean = String(name || '').toLowerCase().trim();
  if (clean === 'phycology') return 'psychology';
  if (!clean || clean === 'unknown') return 'general';
  return clean;
}

/**
 * Load or initialize the master media bank catalog.
 */
export async function loadMediaBankCatalog({ forceRefresh = false } = {}) {
  if (memoryCatalog && !forceRefresh) {
    try {
      const stat = fs.statSync(catalogFile);
      if (stat.mtimeMs === memoryCatalogMtimeMs) return memoryCatalog;
    } catch {}
  }

  try {
    if (fs.existsSync(catalogFile)) {
      const data = fs.readFileSync(catalogFile, 'utf8');
      memoryCatalog = JSON.parse(data);
      memoryCatalogMtimeMs = fs.statSync(catalogFile).mtimeMs;
      return memoryCatalog;
    }
  } catch (err) {
    console.warn(`[MediaBank] Failed loading catalog.json: ${err.message}`);
  }

  // If catalog.json doesn't exist yet, build it now
  const syncResult = extractAndIndexMediaBank();
  try {
    const data = fs.readFileSync(catalogFile, 'utf8');
    memoryCatalog = JSON.parse(data);
    memoryCatalogMtimeMs = fs.statSync(catalogFile).mtimeMs;
    return memoryCatalog;
  } catch {
    memoryCatalog = { version: 1, totalAssets: 0, categories: {}, assets: [] };
    return memoryCatalog;
  }
}

/**
 * Extract all zip archives and index the entire media bank.
 */
export function extractAndIndexMediaBank({ cleanZips = false } = {}) {
  // 1. Fix legacy phycology folder if present
  const phycologyDir = path.join(mediaBankDir, 'images', 'phycology');
  const psychologyDir = path.join(mediaBankDir, 'images', 'psychology');
  if (fs.existsSync(phycologyDir) && !fs.existsSync(psychologyDir)) {
    try { fs.renameSync(phycologyDir, psychologyDir); } catch {}
  }

  // 2. Scan for external drop folders (imagebank, imageback)
  const candidateRoots = [
    path.join(config.rootDir, 'imagebank'),
    path.join(config.rootDir, 'imageback'),
    path.join(config.rootDir, 'public', 'imagebank'),
    path.join(config.rootDir, 'public', 'imageback'),
  ];
  for (const candidate of candidateRoots) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      const zips = fs.readdirSync(candidate).filter((f) => f.endsWith('.zip'));
      for (const zipFile of zips) {
        try {
          const zip = new AdmZip(path.join(candidate, zipFile));
          for (const entry of zip.getEntries()) {
            if (entry.isDirectory) continue;
            const ext = path.extname(entry.entryName).toLowerCase();
            const baseName = path.basename(entry.entryName);
            if (MEDIA_EXTS.has(ext) || (ext === '.json' && !SKIP_JSON_NAMES.has(baseName.toLowerCase()))) {
              const isVideo = ['.mp4', '.mov', '.webm'].includes(ext);
              const targetFolder = path.join(mediaBankDir, isVideo ? 'video' : 'images', 'imported');
              fs.mkdirSync(targetFolder, { recursive: true });
              const targetPath = path.join(targetFolder, baseName);
              if (!fs.existsSync(targetPath)) {
                fs.writeFileSync(targetPath, entry.getData());
              }
            }
          }
        } catch {}
      }
    }
  }

  const results = {
    extractedZips: 0,
    extractedFiles: 0,
    categories: {},
    totalAssets: 0,
    totalImages: 0,
    totalVideos: 0,
  };

  const mediaTypes = ['images', 'video'];

  for (const mediaType of mediaTypes) {
    const typeDir = path.join(mediaBankDir, mediaType);
    if (!fs.existsSync(typeDir)) continue;

    const categories = fs.readdirSync(typeDir).filter((f) => {
      const p = path.join(typeDir, f);
      return fs.statSync(p).isDirectory();
    });

    for (const rawCat of categories) {
      const category = normalizeCategory(rawCat);
      const catDir = path.join(typeDir, rawCat);

      // Extract zip archives in this category directory
      const filesInCat = fs.readdirSync(catDir);
      const zips = filesInCat.filter((f) => f.endsWith('.zip'));

      for (const zipName of zips) {
        const zipPath = path.join(catDir, zipName);
        try {
          const zip = new AdmZip(zipPath);
          const entries = zip.getEntries();
          let countForZip = 0;

          for (const entry of entries) {
            if (entry.isDirectory) continue;
            const ext = path.extname(entry.entryName).toLowerCase();
            const baseName = path.basename(entry.entryName);
            if (SKIP_JSON_NAMES.has(baseName.toLowerCase())) continue;

            if (MEDIA_EXTS.has(ext) || ext === '.json') {
              const targetPath = path.join(catDir, baseName);
              if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size === 0) {
                fs.writeFileSync(targetPath, entry.getData());
                countForZip++;
              }
            }
          }

          results.extractedZips++;
          results.extractedFiles += countForZip;
          if (cleanZips) fs.unlinkSync(zipPath);
        } catch {}
      }

      // Build category index
      const refreshedFiles = fs.readdirSync(catDir);
      const mediaFiles = refreshedFiles.filter((f) => MEDIA_EXTS.has(path.extname(f).toLowerCase()));
      const categoryItems = [];

      for (const mediaFile of mediaFiles) {
        const ext = path.extname(mediaFile).toLowerCase();
        const base = path.basename(mediaFile, ext);
        const isVideo = ['.mp4', '.mov', '.webm'].includes(ext);
        const jsonPath = path.join(catDir, `${base}.json`);

        let meta = null;
        if (fs.existsSync(jsonPath)) {
          try { meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch {}
        }

        const relativePath = `${mediaType}/${category}/${mediaFile}`.replace(/\\/g, '/');

        const record = {
          id: meta?.id || base,
          type: isVideo ? 'video' : 'image',
          mediaType: isVideo ? 'video' : 'image',
          title: meta?.title || base.replace(/_/g, ' '),
          path: relativePath,
          category,
          extension: ext,
          width: meta?.width || 1920,
          height: meta?.height || 1080,
          aspectRatio: meta?.aspectRatio || Number((meta?.width && meta?.height ? meta.width / meta.height : 1.7778).toFixed(4)),
          orientation: meta?.orientation || ((meta?.width && meta?.height && meta.width < meta.height) ? 'portrait' : 'landscape'),
          tags: Array.isArray(meta?.tags) ? meta.tags : [category, ...base.split('_').filter((t) => t.length > 2)],
          concepts: Array.isArray(meta?.concepts) ? meta.concepts : [category],
          subjects: Array.isArray(meta?.subjects) ? meta.subjects : [],
          actions: Array.isArray(meta?.actions) ? meta.actions : [],
          mood: Array.isArray(meta?.mood) ? meta.mood : [],
          composition: meta?.composition || { goodForFullBleed: true },
          people: Boolean(meta?.people),
          quality: meta?.quality || 'hero',
          usage: Array.isArray(meta?.usage) ? meta.usage : [],
          source: meta?.source || { provider: 'media-bank', curated: true },
          license: meta?.license ? { name: meta.license.name || meta.license.type || 'Curated Media Bank', ...meta.license } : { name: 'Curated Media Bank', type: 'curated-owned', attributionRequired: false },
        };

        if (!fs.existsSync(jsonPath)) {
          try { fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2), 'utf8'); } catch {}
        }

        categoryItems.push(record);
      }

      const categoryIndexPath = path.join(catDir, 'index.json');
      try { fs.writeFileSync(categoryIndexPath, JSON.stringify(categoryItems, null, 2), 'utf8'); } catch {}

      results.categories[category] = {
        mediaType,
        count: categoryItems.length,
        images: categoryItems.filter((i) => i.mediaType === 'image').length,
        videos: categoryItems.filter((i) => i.mediaType === 'video').length,
      };

      results.totalAssets += categoryItems.length;
      results.totalImages += results.categories[category].images;
      results.totalVideos += results.categories[category].videos;
    }
  }

  // Build master catalog
  const allCatalogItems = [];
  for (const cat of Object.keys(results.categories)) {
    const catInfo = results.categories[cat];
    const catDir = path.join(mediaBankDir, catInfo.mediaType, cat);
    const catIndexFile = path.join(catDir, 'index.json');
    if (fs.existsSync(catIndexFile)) {
      try {
        const items = JSON.parse(fs.readFileSync(catIndexFile, 'utf8'));
        allCatalogItems.push(...items);
      } catch {}
    }
  }

  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalAssets: allCatalogItems.length,
    categories: results.categories,
    assets: allCatalogItems,
  };

  try {
    writeJsonAtomicSync(catalogFile, catalog);
    memoryCatalog = catalog;
    memoryCatalogMtimeMs = fs.statSync(catalogFile).mtimeMs;
  } catch {}

  return results;
}

/**
 * Search the curated Media Bank for images or video clips matching a query.
 */
export async function searchMediaBank(queryText, { mediaType = 'all', orientation = 'any', category = null, limit = 4, minScore = 0.4 } = {}) {
  if (!queryText) return [];

  const catalog = await loadMediaBankCatalog();
  if (!catalog || !catalog.assets || catalog.assets.length === 0) return [];

  const searchTokens = [...new Set([...terms(queryText), ...keywords(queryText)])];
  if (!searchTokens.length) return [];

  const candidates = [];

  for (const asset of catalog.assets) {
    if (asset.verificationStatus === 'quarantined') continue;
    // Media type filter
    if (mediaType !== 'all') {
      const assetType = asset.mediaType || asset.type;
      if (mediaType === 'video' && assetType !== 'video') continue;
      if (mediaType === 'image' && assetType !== 'image') continue;
    }

    // Category filter
    if (category && normalizeCategory(category) !== normalizeCategory(asset.category)) {
      // Allow cross-category if score is strong, but weight current category
    }

    // Full searchable text fields with weights
    // Compare normalized whole terms. Substring checks made short concepts such
    // as "ai" match unrelated words such as "train" and polluted relevance.
    const tokenSet = (values) => new Set(terms((values || []).join(' ')));
    const tags = tokenSet(asset.intrinsicTags || asset.tags);
    const subjects = tokenSet(asset.subjects);
    const concepts = tokenSet(asset.concepts);
    const actions = tokenSet(asset.actions);
    const moods = tokenSet(asset.mood);
    const title = new Set(terms(asset.title || ''));
    const cat = new Set(terms(asset.category || ''));

    let score = 0;
    let matchedTerms = 0;

    for (const token of searchTokens) {
      let matched = false;
      if (tags.has(token)) { score += 3.0; matched = true; }
      if (subjects.has(token)) { score += 2.5; matched = true; }
      if (concepts.has(token)) { score += 2.2; matched = true; }
      if (title.has(token)) { score += 2.0; matched = true; }
      if (actions.has(token)) { score += 1.8; matched = true; }
      if (cat.has(token)) { score += 1.5; matched = true; }
      if (moods.has(token)) { score += 1.0; matched = true; }
      if (matched) matchedTerms++;
    }

    if (matchedTerms === 0) continue;

    // Normalize score by token count
    const normalizedScore = (score / (searchTokens.length * 3.0)) * (matchedTerms / searchTokens.length);

    // Orientation match bonus
    let orientationBonus = 0;
    if (orientation !== 'any' && asset.orientation) {
      if (orientation === asset.orientation) orientationBonus = 0.2;
    }

    const requestedCategory = category ? normalizeCategory(category) : null;
    const categoryAdjustment = requestedCategory
      ? (requestedCategory === normalizeCategory(asset.category) ? 0.25 : -0.1)
      : 0;
    const totalScore = normalizedScore + orientationBonus + categoryAdjustment;

    if (totalScore >= minScore || matchedTerms >= Math.min(2, searchTokens.length)) {
      const absolutePath = path.join(mediaBankDir, asset.path);
      if (fs.existsSync(absolutePath)) {
        candidates.push({
          asset,
          score: totalScore,
          matchedTerms,
          absolutePath,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.matchedTerms - a.matchedTerms);

  return candidates.slice(0, limit).map(({ asset, absolutePath, score }) => {
    const isVideo = asset.mediaType === 'video' || asset.type === 'video' || ['.mp4', '.mov', '.webm'].includes(asset.extension);
    return {
      type: isVideo ? 'video' : 'image',
      id: `media-bank_${asset.id}`,
      contentHash: asset.id,
      url: `file://${absolutePath.replace(/\\/g, '/')}`,
      localPath: absolutePath,
      src: `media-bank/${asset.path}`.replace(/\\/g, '/'),
      width: asset.width || 1920,
      height: asset.height || 1080,
      aspectRatio: asset.aspectRatio || 1.7778,
      orientation: asset.orientation || 'landscape',
      source: `media-bank:${asset.category}`,
      tier: 'curated_bank',
      weight: 1.35,
      score,
      label: asset.title || asset.id,
      tags: asset.tags || [],
      concepts: asset.concepts || [],
      license: asset.license || { name: 'Curated Media Bank', attributionRequired: false },
      category: asset.category,
      focalPoint: asset.composition?.focalPoint || null,
      safeTextAreas: asset.composition?.safeTextAreas || null,
    };
  });
}

/**
 * Save any newly fetched image or video into the persistent Media Bank.
 */
export async function recordMediaInBank({
  filePath,
  type = 'image',
  description = '',
  query = '',
  source = 'unknown',
  label = '',
  license = null,
  width = 0,
  height = 0,
  inspection = null,
  category = null,
  candidate = null,
}) {
  if (!filePath || !fs.existsSync(filePath)) return null;

  try {
    return await withCatalogLock(async () => {
    const ext = path.extname(filePath).toLowerCase() || (type === 'video' ? '.mp4' : '.jpg');
    const isVideo = type === 'video' || ['.mp4', '.mov', '.webm'].includes(ext);
    const mediaTypeDir = isVideo ? 'video' : 'images';

    const buf = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const targetCat = normalizeCategory(category || candidate?.category || 'saved-from-web');

    const destDir = path.join(mediaBankDir, mediaTypeDir, targetCat);
    fs.mkdirSync(destDir, { recursive: true });

    const assetId = `${targetCat}_${hash}`;
    const destMediaFile = path.join(destDir, `${assetId}${ext}`);
    const destJsonFile = path.join(destDir, `${assetId}.json`);

    // Copy media file into media bank if not already present
    if (!fs.existsSync(destMediaFile)) {
      fs.writeFileSync(destMediaFile, buf);
    }

    const relativePath = `${mediaTypeDir}/${targetCat}/${assetId}${ext}`.replace(/\\/g, '/');
    // Search queries describe the request, not necessarily what is visible in
    // the downloaded pixels. Persist only intrinsic/pixel-grounded metadata.
    const derivedTags = [...new Set([
      targetCat,
      ...keywords(`${description} ${label}`),
      ...(candidate?.tags || []),
      ...(inspection?.visibleObjects || []),
    ])];

    const record = {
      id: assetId,
      type: isVideo ? 'video' : 'image',
      mediaType: isVideo ? 'video' : 'image',
      title: label || description.slice(0, 80) || `${targetCat} ${isVideo ? 'video' : 'image'}`,
      path: relativePath,
      category: targetCat,
      extension: ext,
      width: width || candidate?.width || 1920,
      height: height || candidate?.height || 1080,
      aspectRatio: Number((width && height ? width / height : 1.7778).toFixed(4)),
      orientation: (width && height && width < height) ? 'portrait' : 'landscape',
      tags: derivedTags,
      intrinsicTags: derivedTags,
      concepts: candidate?.concepts || [targetCat],
      subjects: inspection?.primarySubject ? [inspection.primarySubject] : (candidate?.subjects || []),
      actions: inspection?.visibleAction ? [inspection.visibleAction] : [],
      mood: inspection?.environment ? [inspection.environment] : [],
      composition: {
        focalPoint: inspection?.focalPoint || null,
        goodForFullBleed: true,
      },
      quality: 'curated',
      verificationStatus: inspection?.pixelInspected === false ? 'quarantined' : 'verified',
      source: {
        provider: source,
        originalQuery: query,
        savedAt: new Date().toISOString(),
      },
      license: license || {
        type: 'web-curated',
        source,
        attributionRequired: Boolean(license?.attributionRequired),
      },
    };

    fs.writeFileSync(destJsonFile, JSON.stringify(record, null, 2), 'utf8');

    // Update in-memory catalog
    let catalog = { version: 1, totalAssets: 0, categories: {}, assets: [] };
    try { catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8')); } catch {}
    const existingIndex = catalog.assets.findIndex((a) => a.id === assetId);
    if (existingIndex >= 0) {
      catalog.assets[existingIndex] = record;
    } else {
      catalog.assets.push(record);
      catalog.totalAssets = catalog.assets.length;
    }

    writeJsonAtomicSync(catalogFile, catalog);
    memoryCatalog = catalog;
    memoryCatalogMtimeMs = fs.statSync(catalogFile).mtimeMs;
    return record;
    });
  } catch (err) {
    console.warn(`[MediaBank] Failed recording asset in bank: ${err.message}`);
    return null;
  }
}
