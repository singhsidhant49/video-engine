import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { configureMediaBankDirectory, loadMediaBankCatalog, searchMediaBank, recordMediaInBank, extractAndIndexMediaBank, normalizeCategory } from '../src/services/mediaBank.js';
import { searchImageBank } from '../src/services/imageBank.js';
import { ffmpeg } from '../src/services/ffmpeg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('MediaBank: normalizeCategory handles phycology spelling and clean names', () => {
  assert.equal(normalizeCategory('phycology'), 'psychology');
  assert.equal(normalizeCategory('Phycology'), 'psychology');
  assert.equal(normalizeCategory('Technology'), 'technology');
  assert.equal(normalizeCategory(''), 'general');
});

test('MediaBank: catalog loads extracted categories and total assets', async () => {
  const catalog = await loadMediaBankCatalog();
  assert.ok(catalog.totalAssets >= 200, `Expected at least 200 assets, found ${catalog.totalAssets}`);
  assert.ok(catalog.categories.technology, 'Expected technology category');
  assert.ok(catalog.categories.business, 'Expected business category');
  assert.ok(catalog.categories.psychology, 'Expected psychology category');
  assert.ok(catalog.categories.history, 'Expected history category');
  assert.ok(catalog.categories.science, 'Expected science category');
});

test('MediaBank: searchMediaBank finds high-relevance tech and business assets', async () => {
  const techResults = await searchMediaBank('developer coding laptop', { limit: 3 });
  assert.ok(techResults.length > 0, 'Expected results for developer coding laptop');
  assert.equal(techResults[0].category, 'technology');
  assert.ok(techResults[0].url.startsWith('file://'));
  assert.ok(fs.existsSync(techResults[0].localPath), `File must exist at ${techResults[0].localPath}`);

  const bizResults = await searchMediaBank('business strategy presentation', { limit: 3 });
  assert.ok(bizResults.length > 0, 'Expected results for business strategy presentation');
  assert.equal(bizResults[0].category, 'business');
});

test('MediaBank: searchMediaBank respects orientation and category filters', async () => {
  const landscape = await searchMediaBank('technology', { orientation: 'landscape', limit: 2 });
  assert.ok(landscape.length > 0);
  assert.equal(landscape[0].orientation, 'landscape');

  const historyResults = await searchMediaBank('ancient civilization', { category: 'history', limit: 2 });
  assert.ok(historyResults.length > 0);
  assert.equal(historyResults[0].category, 'history');
});

test('MediaBank: searchImageBank integrates curated media-bank with local-bank provider', async () => {
  const results = await searchImageBank('developer laptop coding night', { limit: 2 });
  assert.ok(results.length > 0, 'Expected searchImageBank to return curated media-bank results');
  const top = results[0];
  assert.ok(top.source.startsWith('media-bank:') || top.source.startsWith('bank:'));
  assert.ok(top.localPath && fs.existsSync(top.localPath));
});

test('MediaBank: recordMediaInBank saves a new asset with sidecar metadata and indexes it', async () => {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'video-media-bank-record-'));
  configureMediaBankDirectory(isolatedRoot);
  // Create a temporary dummy image file
  const testDir = path.join(isolatedRoot, 'images', 'test-temp');
  fs.mkdirSync(testDir, { recursive: true });
  const dummyImg = path.join(testDir, 'test_sample_neural_net.png');
  fs.writeFileSync(dummyImg, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  try {
    const recorded = await recordMediaInBank({
      filePath: dummyImg,
      type: 'image',
      description: 'Futuristic neural network visualization in glowing blue',
      query: 'neural network deep learning artificial intelligence',
      source: 'test-mock',
      label: 'Deep Learning Neural Graph',
      license: { name: 'Public Domain', attributionRequired: false },
      width: 1920,
      height: 1080,
      category: 'test-temp',
      inspection: {
        primarySubject: 'neural network graph nodes',
        visibleObjects: ['synapses', 'circuits', 'deep learning nodes'],
      },
    });

    assert.ok(recorded, 'Expected recorded object returned');
    assert.equal(recorded.category, 'test-temp');
    assert.ok(recorded.tags.includes('neural'));
    assert.ok(recorded.tags.includes('learning'));

    // Verify search finds this newly recorded asset
    const found = await searchMediaBank('deep learning neural network', { category: 'test-temp', limit: 1 });
    assert.ok(found.length > 0, 'Newly recorded asset must be immediately discoverable in search');
    assert.equal(found[0].contentHash, recorded.id);
  } finally {
    configureMediaBankDirectory();
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
});

test('MediaBank: newly fetched image is recorded and reused by searchImageBank without network fetch', async () => {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'video-media-bank-reuse-'));
  configureMediaBankDirectory(isolatedRoot);
  const testDir = path.join(isolatedRoot, 'images', 'test-reuse');
  fs.mkdirSync(testDir, { recursive: true });
  const rawSample = path.join(testDir, 'raw_fetched_web_image.jpg');
  const materializedOutput = path.join(testDir, 'shot_01_a.jpg');

  try {
    // Use an existing real image as fixture to simulate downloaded web asset
    const sourceFixture = path.join(rootDir, 'public', 'media-bank', 'images', 'technology', 'ai_assistant_workspace_001.png');
    fs.copyFileSync(sourceFixture, rawSample);
    assert.ok(fs.existsSync(rawSample), 'Raw sample image must exist');

    // Simulate system fetching new image from web and recording it in image bank
    const recorded = await recordMediaInBank({
      filePath: rawSample,
      type: 'image',
      description: 'Futuristic quantum processor chip glowing under blue laser light',
      query: 'quantum processor blue laser computing',
      source: 'pexels-image',
      label: 'Quantum Processor Unit',
      license: { name: 'Pexels License', attributionRequired: false },
      width: 1280,
      height: 720,
      category: 'test-reuse',
      inspection: {
        primarySubject: 'quantum processor chip',
        visibleObjects: ['laser light', 'semiconductor chip', 'blue circuits'],
      },
    });

    assert.ok(recorded, 'Asset must be successfully recorded in media bank');

    // System searches image bank on next run
    const candidates = await searchImageBank('quantum processor semiconductor blue circuits', { limit: 1 });
    assert.ok(candidates.length > 0, 'Asset must be returned by searchImageBank');
    const matched = candidates.find((c) => c.contentHash === recorded.id);
    assert.ok(matched, 'Newly saved asset must match search');
    assert.equal(matched.tier, 'curated_bank');
    assert.equal(matched.weight, 1.35);
    assert.ok(matched.localPath && fs.existsSync(matched.localPath), 'Candidate must point to valid local disk file');

    // Pipeline materializes it locally without HTTP fetch
    const { materialiseImage } = await import('../src/services/freeMediaService.js');
    const result = await materialiseImage(matched, materializedOutput);
    assert.ok(result, 'materialiseImage must succeed');
    assert.ok(fs.existsSync(materializedOutput), 'Materialized output file must be written to disk');
    assert.equal(result.type, 'image');
    assert.ok(result.width >= 720 && result.height >= 720);
  } finally {
    configureMediaBankDirectory();
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
});
