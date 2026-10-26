import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const mediaBankDir = path.join(rootDir, 'public', 'media-bank');

const MEDIA_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov', '.webm']);
const SKIP_JSON_NAMES = new Set(['index.json', 'manifest.json', 'summary.json', 'package.json']);

export function normalizeCategory(name) {
  const clean = String(name || '').toLowerCase().trim();
  if (clean === 'phycology') return 'psychology';
  return clean;
}

export function extractAndIndexMediaBank({ cleanZips = false } = {}) {
  console.log(`\n📦 Processing Media Bank at: ${mediaBankDir}`);

  // 1. Check for legacy phycology directory
  const phycologyDir = path.join(mediaBankDir, 'images', 'phycology');
  const psychologyDir = path.join(mediaBankDir, 'images', 'psychology');
  if (fs.existsSync(phycologyDir)) {
    if (!fs.existsSync(psychologyDir)) {
      fs.renameSync(phycologyDir, psychologyDir);
      console.log('  ↳ Renamed phycology -> psychology');
    }
  }

  // Also check for any root imagebank / imageback directory
  const candidateRoots = [
    path.join(rootDir, 'imagebank'),
    path.join(rootDir, 'imageback'),
    path.join(rootDir, 'public', 'imagebank'),
    path.join(rootDir, 'public', 'imageback'),
  ];
  for (const candidate of candidateRoots) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      console.log(`  ↳ Found external drop folder: ${candidate}`);
      // Process zips in candidate
      const zips = fs.readdirSync(candidate).filter(f => f.endsWith('.zip'));
      for (const zipFile of zips) {
        const zipPath = path.join(candidate, zipFile);
        console.log(`    Extracting external zip: ${zipFile}`);
        try {
          const zip = new AdmZip(zipPath);
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
        } catch (err) {
          console.warn(`    ⚠️ Failed extracting ${zipFile}: ${err.message}`);
        }
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

    const categories = fs.readdirSync(typeDir).filter(f => {
      const p = path.join(typeDir, f);
      return fs.statSync(p).isDirectory();
    });

    for (const rawCat of categories) {
      const category = normalizeCategory(rawCat);
      const catDir = path.join(typeDir, rawCat);

      // Extract any zip archives in this category directory
      const filesInCat = fs.readdirSync(catDir);
      const zips = filesInCat.filter(f => f.endsWith('.zip'));

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

            // Skip generic package/index/manifest files inside zip
            if (SKIP_JSON_NAMES.has(baseName.toLowerCase())) continue;

            if (MEDIA_EXTS.has(ext) || ext === '.json') {
              const targetPath = path.join(catDir, baseName);
              // Extract if not already extracted or empty
              if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size === 0) {
                fs.writeFileSync(targetPath, entry.getData());
                countForZip++;
              }
            }
          }

          results.extractedZips++;
          results.extractedFiles += countForZip;
          console.log(`  ✓ Extracted ${countForZip} files from ${zipName} into ${category}`);

          if (cleanZips) {
            fs.unlinkSync(zipPath);
          }
        } catch (err) {
          console.warn(`  ⚠️ Error extracting ${zipName}: ${err.message}`);
        }
      }

      // 2. Build Category Index
      const refreshedFiles = fs.readdirSync(catDir);
      const mediaFiles = refreshedFiles.filter(f => MEDIA_EXTS.has(path.extname(f).toLowerCase()));
      const categoryItems = [];

      for (const mediaFile of mediaFiles) {
        const ext = path.extname(mediaFile).toLowerCase();
        const base = path.basename(mediaFile, ext);
        const isVideo = ['.mp4', '.mov', '.webm'].includes(ext);
        const jsonPath = path.join(catDir, `${base}.json`);

        let meta = null;
        if (fs.existsSync(jsonPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          } catch {}
        }

        const relativePath = `${mediaType}/${category}/${mediaFile}`.replace(/\\/g, '/');

        // Form standardized metadata record
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
          tags: Array.isArray(meta?.tags) ? meta.tags : [category, ...base.split('_').filter(t => t.length > 2)],
          concepts: Array.isArray(meta?.concepts) ? meta.concepts : [category],
          subjects: Array.isArray(meta?.subjects) ? meta.subjects : [],
          actions: Array.isArray(meta?.actions) ? meta.actions : [],
          mood: Array.isArray(meta?.mood) ? meta.mood : [],
          composition: meta?.composition || { goodForFullBleed: true },
          people: Boolean(meta?.people),
          quality: meta?.quality || 'hero',
          usage: Array.isArray(meta?.usage) ? meta.usage : [],
          source: meta?.source || { provider: 'media-bank', curated: true },
          license: meta?.license || { type: 'curated-owned', attributionRequired: false },
        };

        // If sidecar JSON doesn't exist, create it so each media file has its persistent sidecar
        if (!fs.existsSync(jsonPath)) {
          fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2), 'utf8');
        }

        categoryItems.push(record);
      }

      // Write category index.json
      const categoryIndexPath = path.join(catDir, 'index.json');
      fs.writeFileSync(categoryIndexPath, JSON.stringify(categoryItems, null, 2), 'utf8');

      results.categories[category] = {
        mediaType,
        count: categoryItems.length,
        images: categoryItems.filter(i => i.mediaType === 'image').length,
        videos: categoryItems.filter(i => i.mediaType === 'video').length,
      };

      results.totalAssets += categoryItems.length;
      results.totalImages += results.categories[category].images;
      results.totalVideos += results.categories[category].videos;
    }
  }

  // 3. Write Master Catalog JSON
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

  const catalogPath = path.join(mediaBankDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    totalAssets: allCatalogItems.length,
    categories: results.categories,
    assets: allCatalogItems,
  }, null, 2), 'utf8');

  console.log(`\n🎉 Media Bank Sync Complete:`);
  console.log(`   - Extracted Zips: ${results.extractedZips}`);
  console.log(`   - Total Assets Indexed: ${results.totalAssets} (${results.totalImages} images, ${results.totalVideos} videos)`);
  for (const [cat, info] of Object.entries(results.categories)) {
    console.log(`   • ${cat}: ${info.count} assets (${info.images} imgs, ${info.videos} vids)`);
  }

  return results;
}

if (process.argv[1] && process.argv[1].endsWith('extractMediaBank.js')) {
  extractAndIndexMediaBank({ cleanZips: process.argv.includes('--clean-zips') });
}
