import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IMAGE_STYLE_CATALOG, getImageStyle, buildFullIdeogramPrompt, listSupportedImageStyles } from '../src/config/imageStyles.js';
import { resolveIdeogramAspectRatio, computePromptHash, generateIdeogramImage, normalizeIdeogramModel } from '../src/services/ideogramService.js';
import { directAiAssets } from '../src/pipeline/aiAssetDirector.js';
import { CreateVideoRequestSchema, toPipelineBrief } from '../src/server/videoApiSchemas.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

test('AI Visual Style Catalog provides curated styles and correct prompt construction', () => {
  const styles = listSupportedImageStyles();
  assert.ok(styles.length >= 8, 'should provide at least 8 curated styles');
  assert.ok(styles.some((s) => s.id === 'anime'));
  assert.ok(styles.some((s) => s.id === '2d_animation'));
  assert.ok(styles.some((s) => s.id === 'stickman'));
  assert.ok(styles.some((s) => s.id === 'hyper_realistic'));

  const anime = getImageStyle('anime');
  assert.equal(anime.ideogramStyleType, 'AUTO');
  assert.ok(anime.stylePromptAnchor.includes('anime'));

  const stickman = getImageStyle('stickman');
  assert.equal(stickman.ideogramStyleType, 'DESIGN');
  assert.ok(stickman.stylePromptAnchor.includes('stick figure'));

  const fullPrompt = buildFullIdeogramPrompt({
    prompt: 'A wanderer walking under rain',
    styleId: 'anime',
  });
  assert.ok(fullPrompt.startsWith('A wanderer walking under rain'));
  assert.ok(fullPrompt.includes('cel-shaded anime aesthetic'));

  const customPrompt = buildFullIdeogramPrompt({
    prompt: 'A futuristic tower',
    styleId: 'custom',
    customStylePrompt: 'cyberpunk synthwave neon 1980s style',
  });
  assert.ok(customPrompt.includes('cyberpunk synthwave neon 1980s style'));
});

test('Ideogram Service aspect ratio, model normalization, and hash helpers behave deterministically', () => {
  assert.equal(resolveIdeogramAspectRatio('landscape', 'V_2'), 'ASPECT_16_9');
  assert.equal(resolveIdeogramAspectRatio('shorts', 'V_2'), 'ASPECT_9_16');
  assert.equal(resolveIdeogramAspectRatio('landscape', 'p-image-ideogram'), '16x9');
  assert.equal(resolveIdeogramAspectRatio('shorts', 'ideogram-4-5'), '9x16');

  assert.equal(normalizeIdeogramModel('p-image-medium'), 'p-image-ideogram');
  assert.equal(normalizeIdeogramModel('4.5'), 'ideogram-4-5');
  assert.equal(normalizeIdeogramModel('ideogram-4.0'), 'ideogram-4');
  assert.equal(normalizeIdeogramModel('turbo'), 'V_2_TURBO');

  const hash1 = computePromptHash('A lonely castle', 'anime', 'ASPECT_16_9', 42);
  const hash2 = computePromptHash('A lonely castle', 'anime', 'ASPECT_16_9', 42);
  const hash3 = computePromptHash('A lonely castle', 'stickman', 'ASPECT_16_9', 42);

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 64);
});

test('API Schema accepts imageSource and imageStyle while preserving default stock mode', () => {
  // 1. Default creation payload (stock mode)
  const defaultReq = CreateVideoRequestSchema.parse({
    prompt: 'History of coffee in ancient Ethiopia',
  });
  assert.equal(defaultReq.creative.imageSource, 'stock');
  const defaultBrief = toPipelineBrief(defaultReq);
  assert.equal(defaultBrief.imageSource, 'stock');

  // 2. AI Image creation payload (Anime)
  const aiReq = CreateVideoRequestSchema.parse({
    prompt: 'The legend of the dragon mountain',
    creative: {
      imageSource: 'ai',
      imageStyle: 'anime',
    },
  });
  assert.equal(aiReq.creative.imageSource, 'ai');
  assert.equal(aiReq.creative.imageStyle, 'anime');
  const aiBrief = toPipelineBrief(aiReq);
  assert.equal(aiBrief.imageSource, 'ai');
  assert.equal(aiBrief.imageStyle, 'anime');

  // 3. AI Image creation payload with custom prompt
  const customReq = CreateVideoRequestSchema.parse({
    prompt: 'Why clocks tick clockwise',
    creative: {
      imageSource: 'ai',
      imageStyle: 'custom',
      customStylePrompt: 'vintage 19th century woodcut engraving',
    },
  });
  const customBrief = toPipelineBrief(customReq);
  assert.equal(customBrief.imageStyle, 'custom');
  assert.equal(customBrief.customStylePrompt, 'vintage 19th century woodcut engraving');
});

test('directAiAssets generates valid assets contract for Remotion and timeline', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-ai-test-'));
  const publicDir = path.join(tmpDir, 'public');
  await fs.mkdir(publicDir, { recursive: true });

  const plan = {
    scenes: [
      { id: 'scene_001', narration: 'First scene spoken words.', imagePrompt: 'An ancient library at midnight.' },
      { id: 'scene_002', narration: 'Second scene spoken words.', imagePrompt: 'A glowing magical tome.' },
    ],
  };

  const assetRequests = [
    { id: 'asset_scene_001_shot_01', sceneId: 'scene_001', storyboardShotId: 'scene_001_shot_01', concept: 'ancient library' },
    { id: 'asset_scene_002_shot_01', sceneId: 'scene_002', storyboardShotId: 'scene_002_shot_01', concept: 'glowing tome' },
  ];

  try {
    const result = await directAiAssets(plan, [], {
      publicDir,
      format: 'landscape',
      assetRequests,
      imageStyle: 'stickman',
      offline: true,
      baseSeed: 12345,
    });

    assert.ok(result.assets, 'must return assets object');
    assert.ok(result.assets.scene_001, 'must contain scene_001');
    assert.ok(result.assets.scene_001.primary, 'scene_001 must have primary asset');
    assert.equal(result.assets.scene_001.primary.source, 'ideogram');
    assert.equal(result.assets.scene_001.primary.type, 'image');
    assert.ok(result.assets.scene_001.primary.src.includes('assets/scene_001_shot_01_a.png'));

    assert.equal(result.report.totalRequests, 2);
    assert.equal(result.report.resolvedCount, 2);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Timeline QC relaxes minVideoShare when imageSource is AI while enforcing camera and hold standards', () => {
  const dummyTimeline = {
    fps: 30,
    durationInFrames: 900, // 30 seconds
    style: 'minimal_premium',
    imageSource: 'ai',
    productionProfile: {
      contentType: 'explainer', // usually demands minVideoShare: 0.10
      imageSource: 'ai',
    },
    clips: [
      {
        id: 'clip_01',
        from: 0,
        durationInFrames: 450,
        shots: [
          {
            id: 'shot_01',
            storyboardShotId: 's1_shot_01',
            sceneId: 's1',
            sectionId: 'sec_1',
            from: 0,
            durationInFrames: 450,
            imageBehavior: 'SUBTLE_PUSH',
            transitionPolicy: 'CUT',
            family: 'image',
            presentation: { layout: 'full_bleed' },
            asset: { type: 'image', source: 'ideogram' },
          },
        ],
      },
      {
        id: 'clip_02',
        from: 450,
        durationInFrames: 450,
        shots: [
          {
            id: 'shot_02',
            storyboardShotId: 's2_shot_01',
            sceneId: 's2',
            sectionId: 'sec_1',
            from: 0,
            durationInFrames: 450,
            imageBehavior: 'PAN_LEFT',
            transitionPolicy: 'CUT',
            family: 'image',
            presentation: { layout: 'full_bleed' },
            asset: { type: 'image', source: 'ideogram' },
          },
        ],
      },
    ],
  };

  const plan = {
    imageSource: 'ai',
    productionProfile: { contentType: 'explainer' },
  };

  const qc = runTimelineQc(dummyTimeline, { plan, publishMode: 'PRODUCTION_RENDER' });
  const videoShareCheck = qc.checks.find((c) => c.id === 'content-profile-video-share');
  assert.ok(videoShareCheck, 'content-profile-video-share check must exist');
  assert.equal(videoShareCheck.ok, true, 'minVideoShare must pass in AI mode without stock footage');

  const assetReuseCheck = qc.checks.find((c) => c.id === 'asset-reuse-hard-limit');
  assert.ok(assetReuseCheck, 'asset-reuse-hard-limit check must exist');
  assert.equal(assetReuseCheck.ok, true, 'asset-reuse-hard-limit must pass in AI mode with intra-scene reframing');
});

