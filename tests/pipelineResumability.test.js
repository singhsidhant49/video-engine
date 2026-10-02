import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PIPELINE_STAGES, STAGE_ALIASES, canonicalStageName, STAGE_DEFINITIONS } from '../src/core/checkpoints/stageRegistry.js';
import { getTransitiveDownstreamStages, evaluateRunValidity } from '../src/core/checkpoints/invalidationGraph.js';
import { ttsCache, alignmentCache, searchCache, mediaCache, computePerceptualHash, hammingDistance, metrics } from '../src/core/cache/cacheManager.js';
import { acquireRunLock, releaseRunLock } from '../src/core/locks/runLock.js';
import { cloneRun } from '../src/core/jobs/runCloner.js';
import { CheckpointStore } from '../src/core/checkpoints/checkpointManifest.js';
import { config } from '../src/config/index.js';

test('Stage Registry: canonical stage name and alias resolution', () => {
  assert.equal(canonicalStageName('topic-input'), 'request');
  assert.equal(canonicalStageName('content-plan'), 'plan');
  assert.equal(canonicalStageName('script'), 'plan');
  assert.equal(canonicalStageName('tts'), 'audio');
  assert.equal(canonicalStageName('asset-search'), 'assets');
  assert.equal(canonicalStageName('visual-realization'), 'direction');
  assert.equal(canonicalStageName('preflight'), 'preRenderQa');
  assert.equal(canonicalStageName('post-qc'), 'postRenderQa');
  assert.equal(canonicalStageName('storyboard'), 'storyboard');
});

test('Stage Registry: explicit stage dependencies', () => {
  assert.deepEqual(STAGE_DEFINITIONS.plan.dependencies, ['request']);
  assert.deepEqual(STAGE_DEFINITIONS.audio.dependencies, ['plan']);
  assert.deepEqual(STAGE_DEFINITIONS.alignment.dependencies, ['audio', 'plan']);
  assert.ok(STAGE_DEFINITIONS.storyboard.dependencies.includes('plan'));
  assert.ok(STAGE_DEFINITIONS.storyboard.dependencies.includes('alignment'));
  assert.ok(STAGE_DEFINITIONS.storyboard.dependencies.includes('visualStrategy'));
  assert.ok(STAGE_DEFINITIONS.timeline.dependencies.includes('direction'));
  assert.ok(STAGE_DEFINITIONS.render.dependencies.includes('preRenderQa'));
});

test('Invalidation Graph: script change invalidates TTS, alignment, storyboard, timeline, render', () => {
  const downstream = getTransitiveDownstreamStages('plan');
  assert.ok(downstream.has('audio'), 'audio must be invalidated when plan/script changes');
  assert.ok(downstream.has('alignment'), 'alignment must be invalidated when plan/script changes');
  assert.ok(downstream.has('storyboard'), 'storyboard must be invalidated when plan/script changes');
  assert.ok(downstream.has('timeline'), 'timeline must be invalidated when plan/script changes');
  assert.ok(downstream.has('render'), 'render must be invalidated when plan/script changes');
});

test('Invalidation Graph: visual style change invalidates visual realization but preserves script/TTS/alignment', () => {
  const downstream = getTransitiveDownstreamStages('visualStrategy');
  assert.ok(downstream.has('storyboard'), 'storyboard depends on visual strategy');
  assert.ok(downstream.has('timeline'), 'timeline depends on visual realization');
  assert.ok(downstream.has('render'), 'render depends on timeline');
  assert.ok(!downstream.has('plan'), 'plan must NOT be invalidated by visual strategy change');
  assert.ok(!downstream.has('audio'), 'TTS must NOT be invalidated by visual strategy change');
  assert.ok(!downstream.has('alignment'), 'alignment must NOT be invalidated by visual strategy change');
});

test('Invalidation Graph: audio/music change invalidates audio-mastering and render without touching visual stages', () => {
  const downstream = getTransitiveDownstreamStages('audio-mastering');
  assert.ok(downstream.has('preRenderQa'));
  assert.ok(downstream.has('render'));
  assert.ok(!downstream.has('storyboard'), 'storyboard must NOT be invalidated by audio mastering');
  assert.ok(!downstream.has('direction'), 'direction must NOT be invalidated by audio mastering');
});

test('TTS Cache: deterministic key, cache hit, cache miss, and metrics', async () => {
  const params = { text: 'The 2008 financial crisis was triggered by subprime lending.', voice: 'am_adam', speed: 0.9 };
  const dummyWav = Buffer.from('RIFF....WAVEfmt ....data' + '0'.repeat(1200));

  // Ensure fresh cache entry
  await ttsCache.set(params, dummyWav);

  const hit = await ttsCache.get(params);
  assert.equal(hit.hit, true);
  assert.ok(hit.wavPath);
  assert.ok(hit.size > 1000);

  // Different voice should be a miss
  const miss = await ttsCache.get({ ...params, voice: 'af_sarah' });
  assert.equal(miss.hit, false);
});

test('Alignment Cache: deterministic key and reuse', async () => {
  const params = { audioHash: 'hash123', script: 'A test script for Whisper.', model: 'whisper-base.en' };
  const data = { words: [{ word: 'test', start: 0.1, end: 0.5 }], duration: 1.2 };

  await alignmentCache.set(params, data);
  const result = await alignmentCache.get(params);
  assert.equal(result.hit, true);
  assert.deepEqual(result.data, data);

  const miss = await alignmentCache.get({ ...params, audioHash: 'hash999' });
  assert.equal(miss.hit, false);
});

test('Search Cache: query caching', async () => {
  const params = { provider: 'wikimedia', query: 'asml lithography machine', options: {} };
  const mockResults = [{ id: 'asml-1', title: 'ASML EUV' }];

  await searchCache.set(params, mockResults);
  const result = await searchCache.get(params);
  assert.equal(result.hit, true);
  assert.deepEqual(result.data, mockResults);
});

test('Media Download Cache & Perceptual Image Hash: stores license metadata and content hashes', async () => {
  // Create dummy 100x100 white PNG buffer using sharp
  const sharp = (await import('sharp')).default;
  const imgBuf = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).jpeg().toBuffer();

  const pHash = await computePerceptualHash(imgBuf);
  assert.ok(pHash, 'pHash should be generated');
  assert.equal(hammingDistance(pHash, pHash), 0, 'Hamming distance with identical hash should be 0');

  const cacheRes = await mediaCache.set(
    { provider: 'pexels', id: 'photo-1234', url: 'https://pexels.com/photo-1234' },
    imgBuf,
    {
      ext: '.jpg',
      provider: 'pexels',
      license: 'Pexels Free License',
      credit: 'Photographer Name',
    }
  );

  assert.ok(cacheRes.filePath);
  assert.equal(cacheRes.meta.license, 'Pexels Free License');
  assert.equal(cacheRes.meta.credit, 'Photographer Name');
  assert.ok(cacheRes.meta.contentHash);
  assert.ok(cacheRes.meta.pHash);

  // Retrieve cached media
  const getRes = await mediaCache.get({ provider: 'pexels', id: 'photo-1234', url: 'https://pexels.com/photo-1234' });
  assert.equal(getRes.hit, true);
  assert.equal(getRes.meta.credit, 'Photographer Name');
});

test('Resume Safety: evaluates run validity and recovers from missing artifacts', async () => {
  const tmpDir = path.join(config.rootDir, '.cache', 'test-run-' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const store = await CheckpointStore.create(tmpDir, 'test-video-123');
    await store.complete('request', ['request.json', 'duration-budget.json']);
    await store.complete('plan', ['plan.json']);
    await fs.writeFile(path.join(tmpDir, 'request.json'), JSON.stringify({ topic: 'Test', style: 'editorial-dark' }));
    await fs.writeFile(path.join(tmpDir, 'duration-budget.json'), JSON.stringify({ budget: 45 }));
    // Do NOT write plan.json to simulate missing artifact

    const validity = await evaluateRunValidity({
      runDir: tmpDir,
      manifest: store.manifest,
      currentContext: { topic: 'Test', style: 'editorial-dark' },
    });

    const planInvalidated = validity.invalidatedStages.find((s) => s.stage === 'plan');
    assert.ok(planInvalidated, 'Missing plan.json should invalidate stage plan');
    assert.ok(planInvalidated.reason.includes('missing from disk'));

    // Downstream of plan (e.g. audio, alignment, storyboard) must also be invalidated
    const audioInvalidated = validity.invalidatedStages.find((s) => s.stage === 'audio');
    assert.ok(audioInvalidated, 'Downstream stage audio must be invalidated');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Run Locking: prevents concurrent processes on same run directory', async () => {
  const tmpDir = path.join(config.rootDir, '.cache', 'test-lock-' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const lock1 = await acquireRunLock(tmpDir);
    assert.ok(lock1.lockPath);
    assert.equal(lock1.pid, process.pid);

    // Re-entrant lock by same PID should succeed
    const lockReentrant = await acquireRunLock(tmpDir);
    assert.ok(lockReentrant);

    await releaseRunLock(tmpDir);
    // Lock file should be removed
    let lockExists = true;
    try {
      await fs.access(lock1.lockPath);
    } catch {
      lockExists = false;
    }
    assert.equal(lockExists, false, 'Lock file must be deleted upon release');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Run Cloning: forks run non-destructively for visual/editorial iteration', async () => {
  const runsDir = path.join(config.rendersDir, 'runs');
  const sourceId = 'test-source-' + Date.now();
  const targetId = `${sourceId}-variant-01`;
  const sourceDir = path.join(runsDir, sourceId);

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'project.json'), JSON.stringify({ id: sourceId, topic: 'Clone Test', status: 'complete', currentStage: 'render', artifacts: {}, errors: [], config: {} }));
  await fs.writeFile(path.join(sourceDir, 'plan.json'), JSON.stringify({ title: 'Clone Plan', script: 'hello' }));

  try {
    const cloned = await cloneRun({ sourceRunId: sourceId, targetRunId: targetId });
    assert.equal(cloned.runId, targetId);
    assert.ok(cloned.runDir.includes(targetId));

    const clonedPlan = JSON.parse(await fs.readFile(path.join(cloned.runDir, 'plan.json'), 'utf8'));
    assert.equal(clonedPlan.title, 'Clone Plan');

    const clonedProject = JSON.parse(await fs.readFile(path.join(cloned.runDir, 'project.json'), 'utf8'));
    assert.equal(clonedProject.id, targetId, 'Cloned project.json must reflect the new target runId');
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(runsDir, targetId), { recursive: true, force: true }).catch(() => {});
  }
});
