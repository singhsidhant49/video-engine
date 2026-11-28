import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IMAGE_STYLE_CATALOG, getImageStyle, buildFullIdeogramPrompt, buildFluxPrompt, listSupportedImageStyles } from '../src/config/imageStyles.js';
import { resolveIdeogramAspectRatio, computePromptHash, generateIdeogramImage, normalizeIdeogramModel } from '../src/services/ideogramService.js';
import { directAiAssets } from '../src/pipeline/aiAssetDirector.js';
import { CreateVideoRequestSchema, toPipelineBrief } from '../src/server/videoApiSchemas.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';
import { resolveReplicateRetryDelay } from '../src/services/replicateService.js';

test('Replicate retry pacing honors provider retry-after limits', () => {
  assert.equal(resolveReplicateRetryDelay({ retryAfterMs: 5000 }, 1), 5000);
  assert.equal(resolveReplicateRetryDelay({}, 2), 6000);
  assert.equal(resolveReplicateRetryDelay({ retryAfterMs: 120000 }, 1), 60000);
});

test('AI Visual Style Catalog provides curated styles and correct prompt construction', () => {
  const styles = listSupportedImageStyles();
  assert.ok(styles.length >= 6, 'should provide at least 6 curated production styles');
  assert.ok(styles.some((s) => s.id === 'anime'));
  assert.ok(styles.some((s) => s.id === 'stickman'));
  assert.ok(styles.some((s) => s.id === 'cinematic_documentary'));
  assert.ok(styles.some((s) => s.id === 'dark_noir'));
  assert.ok(styles.some((s) => s.id === 'editorial_vector'));
  assert.ok(styles.some((s) => s.id === '3d_render'));

  const anime = getImageStyle('anime');
  assert.equal(anime.ideogramStyleType, 'AUTO');
  assert.ok(anime.stylePromptAnchor.includes('anime'));

  const doc = getImageStyle('cinematic_documentary');
  assert.equal(doc.ideogramStyleType, 'REALISTIC');
  assert.ok(doc.stylePromptAnchor.includes('documentary photography'));

  const noir = getImageStyle('dark_noir');
  assert.equal(noir.ideogramStyleType, 'REALISTIC');
  assert.ok(noir.stylePromptAnchor.includes('dark investigative noir'));

  const editorial = getImageStyle('editorial_vector');
  assert.equal(editorial.ideogramStyleType, 'DESIGN');
  assert.ok(editorial.stylePromptAnchor.includes('editorial vector'));

  const stickman = getImageStyle('stickman');
  assert.equal(stickman.ideogramStyleType, 'DESIGN');
  assert.ok(stickman.stylePromptAnchor.includes('stick-figure'));
  assert.ok(stickman.generationRules.includes('exactly one head, two arms and two legs'));
  assert.ok(stickman.negativePrompt.includes('hand-drawn doodle') || stickman.negativePrompt.includes('crayon'));

  // Legacy style aliases resolve cleanly
  const hyperAliased = getImageStyle('hyper_realistic');
  assert.equal(hyperAliased.id, 'cinematic_documentary');
  const comicAliased = getImageStyle('comic_book');
  assert.equal(comicAliased.id, 'dark_noir');
  const doodleAliased = getImageStyle('doodle_comic');
  assert.equal(doodleAliased.id, 'stickman');

  const fullPrompt = buildFullIdeogramPrompt({
    prompt: 'Two friends sitting on a city rooftop with a lantern',
    styleId: 'dark_noir',
  });
  assert.ok(fullPrompt.startsWith('Two friends sitting on a city rooftop with a lantern'));
  assert.ok(fullPrompt.includes('dark investigative noir'));
  assert.ok(fullPrompt.includes('Horizontal 16:9 cinematic composition'));
  assert.ok(fullPrompt.includes('Exclude:'));

  const vectorPrompt = buildFullIdeogramPrompt({
    prompt: 'A teacher demonstrates compound interest to two students',
    styleId: 'editorial_vector',
    format: 'shorts',
  });
  assert.ok(vectorPrompt.includes('premium modern editorial vector illustration'));
  assert.ok(vectorPrompt.includes('Vertical 9:16 composition'));
  assert.notEqual(vectorPrompt, fullPrompt);

  const customPrompt = buildFullIdeogramPrompt({
    prompt: 'A futuristic tower',
    styleId: 'custom',
    customStylePrompt: 'cyberpunk synthwave neon 1980s style',
  });
  assert.ok(customPrompt.includes('cyberpunk synthwave neon 1980s style'));
});

test('FLUX prompt keeps the visible scene first and avoids oversized negative-prompt blocks', () => {
  const prompt = buildFluxPrompt({
    prompt: 'A neuroscientist labels two memory samples inside a quiet sleep laboratory',
    styleId: 'hyper_realistic',
    format: 'landscape',
  });
  assert.ok(prompt.startsWith('Scene: A neuroscientist labels two memory samples'));
  assert.match(prompt, /Horizontal 16:9 cinematic frame/);
  assert.match(prompt, /no words, captions, logos, watermarks/);
  assert.doesNotMatch(prompt, /Exclude:/);
  assert.ok(prompt.length <= 2200);
});

test('high-quality FLUX Schnell request uses the production quality controls', async () => {
  const { generateFluxImage } = await import('../src/services/replicateService.js');
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-flux-request-'));
  const originalFetch = global.fetch;
  const originalToken = process.env.REPLICATE_API_TOKEN;
  let requestInput = null;
  process.env.REPLICATE_API_TOKEN = 'test-token';
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('api.replicate.com')) {
      requestInput = JSON.parse(options.body).input;
      return { ok: true, json: async () => ({ status: 'succeeded', output: ['https://images.local/result.png'] }) };
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array(2048).buffer };
  };
  try {
    await generateFluxImage({
      prompt: 'A scientist studies a labeled memory sample in a sleep laboratory',
      styleId: 'hyper_realistic', format: 'shorts', seed: 41, quality: 'high', cacheDir, retries: 0,
    });
    assert.equal(requestInput.aspect_ratio, '9:16');
    assert.equal(requestInput.num_outputs, 1);
    assert.equal(requestInput.num_inference_steps, 4);
    assert.equal(requestInput.go_fast, false);
    assert.equal(requestInput.megapixels, '1');
    assert.equal(requestInput.seed, 41);
  } finally {
    global.fetch = originalFetch;
    if (originalToken == null) delete process.env.REPLICATE_API_TOKEN;
    else process.env.REPLICATE_API_TOKEN = originalToken;
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test('FLUX Dev applies a deterministic local continuity reference with img2img controls', async () => {
  const { generateFluxImage } = await import('../src/services/replicateService.js');
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-flux-reference-'));
  const referencePath = path.join(cacheDir, 'character.png');
  await fs.writeFile(referencePath, Buffer.alloc(2048, 7));
  const originalFetch = global.fetch;
  const originalToken = process.env.REPLICATE_API_TOKEN;
  let requestInput = null;
  process.env.REPLICATE_API_TOKEN = 'test-token';
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('api.replicate.com')) {
      requestInput = JSON.parse(options.body).input;
      return { ok: true, json: async () => ({ status: 'succeeded', output: ['https://images.local/reference-result.png'] }) };
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array(2048).buffer };
  };
  try {
    const result = await generateFluxImage({
      prompt: 'The same woman enters the hallway', model: 'flux-dev', seed: 73,
      referenceImagePath: referencePath, referenceStrength: 0.68, cacheDir, retries: 0,
    });
    assert.match(requestInput.image, /^data:image\/png;base64,/);
    assert.equal(requestInput.prompt_strength, 0.68);
    assert.equal(result.referenceApplied, true);
  } finally {
    global.fetch = originalFetch;
    if (originalToken == null) delete process.env.REPLICATE_API_TOKEN;
    else process.env.REPLICATE_API_TOKEN = originalToken;
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test('every image style has a complete distinct production prompt and both dashboards expose every option', async () => {
  const styles = Object.values(IMAGE_STYLE_CATALOG);
  const prompts = new Set();
  for (const style of styles) {
    assert.ok(style.generationRules?.length >= 100, `${style.id} needs composition rules`);
    assert.ok(style.negativePrompt?.includes('text'), `${style.id} must reject accidental text`);
    assert.ok(style.llmGuidance?.length >= 80, `${style.id} needs scene-authoring guidance`);
    const prompt = buildFullIdeogramPrompt({
      prompt: 'A researcher discovers an unexpected result in a busy laboratory', styleId: style.id, format: 'landscape',
      customStylePrompt: style.id === 'custom' ? 'charcoal and gold editorial illustration' : '',
    });
    assert.ok(prompt.includes('Composition contract:'), `${style.id} must reach the provider with its composition contract`);
    assert.ok(prompt.includes('Horizontal 16:9 cinematic composition'));
    assert.ok(prompt.includes('Exclude:'));
    prompts.add(prompt);
  }
  assert.equal(prompts.size, styles.length, 'every style must create a distinct provider prompt');

  const optionEntries = (html, selectId) => {
    const select = html.match(new RegExp(`<select id="${selectId}">([\\s\\S]*?)<\\/select>`))?.[1] || '';
    return [...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map((match) => ({
      id: match[1], label: match[2].replaceAll('&amp;', '&').trim(),
    }));
  };
  const [studioHtml, legacyHtml] = await Promise.all([
    fs.readFile(path.resolve('public/dashboard/studio.html'), 'utf8'),
    fs.readFile(path.resolve('public/dashboard/index.html'), 'utf8'),
  ]);
  const catalogEntries = styles.map(({ id, label }) => ({ id, label }));
  assert.deepEqual(optionEntries(studioHtml, 'channelImageStyle'), catalogEntries);
  assert.deepEqual(optionEntries(legacyHtml, 'imageStyle'), catalogEntries);
  assert.deepEqual(optionEntries(legacyHtml, 'channelImageStyle'), catalogEntries);
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

test('FLUX Schnell via Replicate helper and directAiAssets routing works correctly', async () => {
  const { resolveFluxAspectRatio, normalizeFluxModel } = await import('../src/services/replicateService.js');
  assert.equal(resolveFluxAspectRatio('landscape'), '16:9');
  assert.equal(resolveFluxAspectRatio('shorts'), '9:16');

  // Verify model normalization
  assert.equal(normalizeFluxModel('flux-schnell'), 'black-forest-labs/flux-schnell');
  assert.equal(normalizeFluxModel('flux'), 'black-forest-labs/flux-schnell');
  assert.equal(normalizeFluxModel('schnell'), 'black-forest-labs/flux-schnell');
  assert.equal(normalizeFluxModel('black-forest-labs/flux-schnell'), 'black-forest-labs/flux-schnell');
  assert.equal(normalizeFluxModel('flux-dev'), 'black-forest-labs/flux-dev');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-flux-test-'));
  const publicDir = path.join(tmpDir, 'public');
  await fs.mkdir(publicDir, { recursive: true });

  const plan = {
    scenes: [
      { id: 'scene_001', narration: 'Intro words.', imagePrompt: 'A futuristic city' },
    ],
  };

  const assetRequests = [
    { id: 'asset_scene_001_shot_01', sceneId: 'scene_001', storyboardShotId: 'scene_001_shot_01', concept: 'futuristic city' },
  ];

  try {
    const result = await directAiAssets(plan, [], {
      publicDir,
      format: 'landscape',
      assetRequests,
      imageStyle: 'anime',
      imageModel: 'flux-schnell',
      offline: true,
      baseSeed: 999,
    });

    assert.ok(result.assets.scene_001.primary, 'scene_001 must have primary asset');
    assert.equal(result.assets.scene_001.primary.source, 'replicate');
    assert.equal(result.assets.scene_001.primary.type, 'image');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

