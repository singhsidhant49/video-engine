import path from 'node:path';
import fs from 'node:fs/promises';
import { renderContactSheet } from '../tools/preview.js';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { config } from '../config/index.js';
import { generateDirectorPlan, normalizePlan, compressPlanScript, deterministicCompress } from '../services/aiDirectorService.js';
import { generateSpeech } from '../services/ttsService.js';
import { analyzeNarration } from '../services/audioAnalysisService.js';
import { ensureSoundEffects, ensureBackgroundMusic } from '../services/sfxGeneratorService.js';
import { calculateDurationBudget, buildDurationDiagnostics } from '../storyboard/durationBudget.js';
import { normalizeNarrationWav, calibrateSfxAssets, buildAudioDiagnostics } from '../audio/audioMastering.js';
import { directScenes, recast } from './visualDirector.js';
import { directAssets } from './assetDirector.js';
import { buildStoryboard } from './visualStoryboardDirector.js';
import { evaluateContinuity, buildPacingDiagnostics } from './continuityDirector.js';
import { reviewVisualPlan, applySceneRepairs, reviewRenderedFrames } from '../services/visualCriticService.js';
import { generateVideoPackage } from '../services/thumbnailGenerator.js';
import { buildTimeline, rngFrom, sceneWordRanges } from './timeline.js';
import { synthesizeWithSay } from '../services/devTts.js';
import { formatCredits } from '../shared/licensing.js';
import { runTimelineQc, printQc } from '../qc/timelineQc.js';
import { runRenderQc } from '../qc/renderQc.js';
import { JobContext } from '../core/jobs/jobContext.js';
import { VideoVisualStrategySchema } from '../models/visualStrategy.schema.js';
import { StoryboardSchema } from '../models/storyboard.schema.js';
import { TimelineSchema } from '../models/timeline.schema.js';
import { selectVideoVisualStrategy } from '../storyboard/visualStrategySelector.js';
import { buildStoryboardDiagnostics, printStoryboardDiagnostics } from '../storyboard/storyboardDiagnostics.js';
import { storyboardToExecutionPlan } from './storyboardCompatibility.js';
import { buildVisualRealizationDiagnostics } from './visualRealizationDiagnostics.js';
import { planAssetRequests } from './assetRequestPlanner.js';
import { AssetRequestListSchema } from '../models/assetRequest.schema.js';
import { buildVisualCoveragePlan } from '../storyboard/visualCoveragePlan.js';
import { VisualCoveragePlanSchema } from '../models/visualCoveragePlan.schema.js';
import { buildEditorialVisualPlan } from './editorialVisualPlanner.js';
import { buildVisualCoverageDiagnostics } from '../qc/visualCoverageDiagnostics.js';
import { runCreativeQaLoop, evaluateCreativeQa, applyCreativeRepairs } from '../qc/creativeQaDirector.js';
import { buildDiagramQualityDiagnostics } from '../diagrams/diagramQaDirector.js';
import { evaluateRunValidity } from '../core/checkpoints/invalidationGraph.js';
import { canonicalStageName } from '../core/checkpoints/stageRegistry.js';
import { metrics } from '../core/cache/cacheManager.js';
import { persistConfigSnapshot } from '../core/checkpoints/versionTracker.js';
import { buildEditContinuityDiagnostics } from '../qc/editContinuityDiagnostics.js';
import { resolveVisualPolicy } from '../config/visualMode.js';

/**
 * Editorial Plan (LLM) → narration → alignment → Visual Director → Asset
 * Director → recast → Timeline Director → static QC → render → render QC.
 *
 * The LLM decides editorial intent and feel; every presentation decision
 * after that is deterministic code.
 *
 * Every intermediate is written to renders/runs/<videoId>/ so a run can be
 * inspected, and re-rendered from its plan without calling the LLM again.
 *
 * @param {object} o
 * @param {string} o.topic
 * @param {string} [o.niche]
 * @param {'shorts'|'landscape'} [o.format]
 * @param {string} [o.voice]         Kokoro voice
 * @param {string} [o.style]         directing style id (see src/shared/styles.js); otherwise the director picks
 * @param {number} [o.durationSec]   target length
 * @param {string} [o.audioFile]     use this narration instead of TTS (its words should follow the plan's script)
 * @param {string} [o.planFile]      reuse a saved plan.json instead of calling the LLM
 * @param {boolean} [o.render=true]  false = stop after timeline + QC
 * @param {'kokoro'|'say'} [o.tts]   'say' = macOS dev narration (for evals while Kokoro is unavailable)
 * @param {string} [o.resume]        run ID to resume
 * @param {string} [o.from]          force re-execution from this stage onward
 * @param {string} [o.scene]         render partial scene only
 * @param {string} [o.range]         render partial frame/second range only
 * @param {boolean} [o.contactSheetOnly] stop after preflight contact sheet
 * @param {boolean} [o.noTts]        reuse narration audio without TTS re-synthesis
 * @param {boolean} [o.offline]      use cached/local media only
 * @param {'MEDIA_EDITORIAL'|'LEGACY_PROCEDURAL'} [o.visualMode] centralized visual routing mode
 */
export async function createFacelessVideo({
  topic,
  niche = '',
  format = 'shorts',
  voice = config.kokoro.defaultVoice,
  style,
  durationSec,
  audioFile,
  planFile,
  render = true,
  tts = 'kokoro',
  channelId = 'default',
  visualStrategy,
  resume = null,
  from = null,
  scene = null,
  range = null,
  contactSheetOnly = false,
  noTts = false,
  offline = false,
  visualMode,
  onProgress = () => {},
}) {
  const visualPolicy = resolveVisualPolicy({ visualMode });
  const t0 = Date.now();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const videoId = resume || `video-${stamp}`;
  const fps = config.video.fps;
  const runsDir = path.join(config.rendersDir, 'runs');

  let job;
  const reusedStagesSet = new Set();

  if (resume) {
    console.log(`\n🔄 Resuming run: ${resume}`);
    job = await JobContext.load({ id: resume, runsDir });

    const validity = await evaluateRunValidity({
      runDir: job.runDir,
      manifest: job.checkpoints.manifest?.toJSON ? job.checkpoints.manifest.toJSON() : job.checkpoints.manifest,
      currentContext: {
        topic: topic || job.project.topic,
        niche,
        format: format || job.project.format,
        style: style || job.project.config?.style,
        voice: voice || job.project.config?.voice,
        speed: config.kokoro.speed,
        offline,
        visualMode: visualPolicy.visualMode,
      },
      fromStage: from,
    });

    console.log(`\n==================================================`);
    console.log(`RESUME DIAGNOSTICS: Run ${resume}`);
    console.log(`==================================================`);
    console.log(`REUSED STAGES:`);
    if (validity.reusedStages.length === 0) {
      console.log(`   (none)`);
    } else {
      for (const r of validity.reusedStages) {
        console.log(`   ✓ ${r.stage} (${(r.outputs || []).join(', ')})`);
        reusedStagesSet.add(r.stage);
      }
    }
    console.log(`INVALIDATED STAGES:`);
    if (validity.invalidatedStages.length === 0) {
      console.log(`   (none)`);
    } else {
      for (const inv of validity.invalidatedStages) {
        console.log(`   ✗ ${inv.stage}: ${inv.reason}`);
        await job.invalidateStage(inv.stage, inv.reason);
      }
    }
    console.log(`==================================================\n`);
  } else {
    job = await JobContext.create({
      id: videoId,
      topic,
      channelId,
      format,
      targetDuration: durationSec || null,
      config: { voice, style: style || null, tts, render, visualMode: visualPolicy.visualMode, assetPolicy: { allowGenerated: false } },
      runsDir,
    });
  }

  const { runDir, publicDir: runPublic } = job;
  const save = (name, data, options) => job.writeArtifact(name, data, options);
  const canReuse = (stageName) => reusedStagesSet.has(canonicalStageName(stageName));

  console.log(`\n🎬 ${videoId} · "${topic || job.project.topic}" · ${format}`);

  try {
  let targetDuration;
  let durationBudget;

  if (canReuse('request')) {
    console.log(`   ✓ [Reused] request.json & duration-budget.json`);
    const reqData = JSON.parse(await fs.readFile(path.join(runDir, 'request.json'), 'utf8'));
    if (reqData.format) format = reqData.format;
    targetDuration = durationSec || reqData.durationSec || (format === 'shorts' ? 45 : 75);
    const speechRateWps = tts === 'kokoro' && config.kokoro?.speed
      ? Number((2.35 * (config.kokoro.speed / 1.0)).toFixed(2))
      : undefined;
    durationBudget = calculateDurationBudget({ targetDurationSec: targetDuration, format, style: style || reqData.style, speechRateWps });
  } else {
    await job.startStage('request');
    targetDuration = durationSec || (format === 'shorts' ? 45 : 75);
    const speechRateWps = tts === 'kokoro' && config.kokoro?.speed
      ? Number((2.35 * (config.kokoro.speed / 1.0)).toFixed(2))
      : undefined;
    durationBudget = calculateDurationBudget({ targetDurationSec: targetDuration, format, style, speechRateWps });
    await save('request.json', { topic, niche, format, channelId, durationSec: targetDuration, voice, style: style || null, tts, render, visualMode: visualPolicy.visualMode });
    await save('duration-budget.json', buildDurationDiagnostics({ budget: durationBudget }));
    await job.completeStage('request', ['request.json', 'duration-budget.json']);
  }

  // 1. Editorial plan.
  let plan;
  if (canReuse('plan')) {
    plan = JSON.parse(await fs.readFile(path.join(runDir, 'plan.json'), 'utf8'));
    console.log(`   ✓ [Reused] plan.json ("${plan.title}" · style ${plan.style} · ${plan.scenes.length} scenes · ${plan.script.split(/\s+/).length} words)`);
  } else {
    await job.startStage('plan');
    onProgress({ step: 1, message: 'Directing: script and shot intent...' });
    const speechRateWps = tts === 'kokoro' && config.kokoro?.speed
      ? Number((2.35 * (config.kokoro.speed / 1.0)).toFixed(2))
      : undefined;
    plan = planFile
      ? normalizePlan(JSON.parse(await fs.readFile(planFile, 'utf8')), { topic, niche, format, style })
      : await generateDirectorPlan({ topic, niche, format, durationSec: targetDuration, style, speechRateWps });
    plan.format = format;
    plan.durationBudget = plan.durationBudget || durationBudget;
    await save('plan.json', plan);
    if (plan.contentQuality) {
      await save('content-quality-diagnostics.json', plan.contentQuality);
    }
    await job.completeStage('plan', ['plan.json', ...(plan.contentQuality ? ['content-quality-diagnostics.json'] : [])]);
    console.log(`   "${plan.title}" · style ${plan.style} · ${plan.scenes.length} scenes · ${plan.script.split(/\s+/).length} words`);
  }

  // 2. Narration & 3. Alignment with duration check and repair loop
  let narrationFile = path.join(runPublic, 'narration.wav');
  let narration;
  let narrationNorm = null;
  let compressionPasses = plan.compressionPasses || 0;

  if ((canReuse('audio') || noTts) && canReuse('alignment')) {
    console.log(`   ✓ [Reused] narration.wav & words.json (no audio regeneration)`);
    narration = JSON.parse(await fs.readFile(path.join(runDir, 'words.json'), 'utf8'));
    if (!narration.durationInSeconds && narration.duration) narration.durationInSeconds = narration.duration;
    if (!narration.totalFrames && narration.durationInSeconds) narration.totalFrames = Math.ceil(narration.durationInSeconds * fps);
  } else {
    for (let attempt = 0; attempt < 3; attempt++) {
      await job.startStage('audio');
      onProgress({ step: 2, message: audioFile ? 'Using supplied narration audio...' : `Generating voiceover with Kokoro TTS${attempt > 0 ? ' (compressed re-synthesis)' : ''}...` });
      if (audioFile) {
        narrationFile = path.join(runPublic, `narration${path.extname(audioFile) || '.wav'}`);
        await fs.copyFile(audioFile, narrationFile);
      } else if (tts === 'say') {
        narrationFile = path.join(runPublic, 'narration.wav');
        await synthesizeWithSay(plan.script, narrationFile);
      } else {
        narrationFile = path.join(runPublic, 'narration.wav');
        await generateSpeech({ text: plan.script, outputFile: narrationFile, voice, speed: config.kokoro.speed });
      }

      // Milestone 9 Narration Normalization & Peak Limiting
      try {
        narrationNorm = await normalizeNarrationWav(narrationFile, { targetLufs: -16.0, maxPeakDb: -1.5 });
      } catch (normErr) {
        console.warn(`   ⚠️ Narration normalization warning: ${normErr.message}`);
      }

      await job.completeStage('audio', [path.relative(runDir, narrationFile).split(path.sep).join('/')]);

      // 3. Word timing (script aligned to what was actually said).
      await job.startStage('alignment');
      onProgress({ step: 3, message: 'Aligning script to narration...' });
      narration = await analyzeNarration(narrationFile, plan.script, fps);
      await save('words.json', {
        source: narration.source,
        matchRate: narration.matchRate,
        duration: narration.durationInSeconds,
        durationInSeconds: narration.durationInSeconds,
        totalFrames: narration.totalFrames,
        words: narration.words,
        transcript: narration.transcript,
      });
      await job.completeStage('alignment', ['words.json']);

      // Post-TTS Duration Check (Milestone 8, Step 6)
      const actualSec = narration.durationInSeconds;
      const allowedMax = durationBudget.allowedMaxDuration;
      const hardMax = durationBudget.hardMaxDuration;

      if (actualSec > allowedMax && attempt === 0 && !audioFile) {
        console.log(`\n⚠️ Actual narration (${actualSec.toFixed(1)}s) exceeds target max (${allowedMax.toFixed(1)}s).`);
        console.log(`   Initiating post-TTS script compression and re-synthesis...`);
        const ratio = durationBudget.targetNarrationSec / actualSec;
        const currentWords = plan.script.split(/\s+/).filter(Boolean).length;
        const newTargetWords = Math.max(10, Math.round(currentWords * ratio));
        plan = await compressPlanScript(plan, newTargetWords, Math.round(newTargetWords * 1.05));
        compressionPasses++;
        await save('plan.json', plan);
        continue;
      }

      if (actualSec > hardMax && attempt === 1 && !audioFile) {
        console.log(`\n⚠️ Actual narration (${actualSec.toFixed(1)}s) still exceeds hard max (${hardMax.toFixed(1)}s).`);
        console.log(`   Applying final deterministic trim pass to ensure timeline compliance...`);
        const currentWords = plan.script.split(/\s+/).filter(Boolean).length;
        const measuredWps = currentWords / actualSec;
        const targetWords = Math.max(10, Math.floor(durationBudget.targetNarrationSec * measuredWps * 0.96));
        plan = deterministicCompress(plan, targetWords);
        compressionPasses++;
        await save('plan.json', plan);
        continue;
      }
      break;
    }
  }

  // 4. Visual Storyboard & Visual Director.
  onProgress({ step: 4, message: 'Directing visuals and resolving imagery...' });
  const ranges = sceneWordRanges(plan.scenes);
  const sceneSeconds = ranges.map(([a, b]) => Math.max(0.5, (narration.words[b]?.end || 0) - (narration.words[a]?.start || 0)));

  let resolvedVisualStrategy;
  if (canReuse('visualStrategy')) {
    resolvedVisualStrategy = JSON.parse(await fs.readFile(path.join(runDir, 'visual-strategy.json'), 'utf8'));
    console.log(`   ✓ [Reused] visual-strategy.json (${resolvedVisualStrategy.family})`);
  } else {
    await job.startStage('visualStrategy');
    resolvedVisualStrategy = selectVideoVisualStrategy({
      topic: topic || plan.title,
      plan,
      format,
      requestedStyle: style || plan.style,
      overrides: { ...visualStrategy, useMediaEditorial: visualPolicy.useMediaEditorial, format },
    });
    await save('visual-strategy.json', resolvedVisualStrategy, { schema: VideoVisualStrategySchema });
    await job.completeStage('visualStrategy', ['visual-strategy.json']);
  }

  let storyboard;
  let visualCoveragePlan;
  if (canReuse('storyboard')) {
    storyboard = JSON.parse(await fs.readFile(path.join(runDir, 'storyboard.json'), 'utf8'));
    visualCoveragePlan = JSON.parse(await fs.readFile(path.join(runDir, 'visual-coverage-plan.json'), 'utf8'));
    console.log(`   ✓ [Reused] storyboard.json & visual-coverage-plan.json (${storyboard.scenes?.length || 0} scenes)`);
  } else {
    await job.startStage('storyboard');
    storyboard = buildStoryboard(plan, { format, sceneSeconds, videoId, visualStrategy: resolvedVisualStrategy, visualPolicy });
    await save('storyboard.json', storyboard, { schema: StoryboardSchema });
    const storyboardDiagnostics = buildStoryboardDiagnostics(storyboard);
    printStoryboardDiagnostics(storyboardDiagnostics);
    await save('storyboard-diagnostics.json', storyboardDiagnostics);
    visualCoveragePlan = buildVisualCoveragePlan(storyboard);
    await save('visual-coverage-plan.json', visualCoveragePlan, { schema: VisualCoveragePlanSchema });
    await job.completeStage('storyboard', ['storyboard.json', 'storyboard-diagnostics.json', 'visual-coverage-plan.json']);
  }

  const executionPlan = storyboardToExecutionPlan(plan, storyboard);
  let specs;
  let continuityReport;
  let assets;
  let assetReport;
  let sfx;
  let bgm;

  const copyIn = async (rel) => {
    await fs.mkdir(path.dirname(path.join(runPublic, rel)), { recursive: true });
    await fs.copyFile(path.join(config.publicDir, rel), path.join(runPublic, rel));
    return rel;
  };

  if (canReuse('assets')) {
    console.log(`   ✓ [Reused] direction.json & assets.json`);
    specs = JSON.parse(await fs.readFile(path.join(runDir, 'direction.json'), 'utf8'));
    try {
      continuityReport = JSON.parse(await fs.readFile(path.join(runDir, 'continuity.json'), 'utf8'));
    } catch {}
    const assetsData = JSON.parse(await fs.readFile(path.join(runDir, 'assets.json'), 'utf8'));
    assetReport = assetsData;
    assets = assetsData.assets || assetsData.scenes || {};

    const [sfxSources, bgmSource] = await Promise.all([ensureSoundEffects(), ensureBackgroundMusic(plan.style)]);
    sfx = Object.fromEntries(await Promise.all(Object.entries(sfxSources).map(async ([k, rel]) => [k, await copyIn(rel)])));
    bgm = { ...bgmSource, src: await copyIn(bgmSource.src) };
  } else {
    const rawSpecs = directScenes(storyboard, { format, rng: rngFrom(`${videoId}:visual`) });
    const evalCont = evaluateContinuity(rawSpecs, { format, style: plan.style });
    continuityReport = evalCont.continuityReport;
    specs = evalCont.refinedSpecs;
    await save('continuity.json', continuityReport);

    // 5. Asset Director: tiered search under each scene's acceptability policy
    await job.startStage('assets');
    const assetRequests = planAssetRequests(storyboard, { format, visualPolicy });
    await save('asset-requests.json', assetRequests, { schema: AssetRequestListSchema });
    const dirResult = await directAssets(executionPlan, specs, {
      publicDir: runPublic, format, assetRequests, allowGenerated: false, offline,
    });
    assets = dirResult.assets;
    assetReport = dirResult.report;

    if (visualPolicy.enableLegacyVisualFamilies) specs.forEach((spec, i) => recast(spec, executionPlan.scenes[i], assets[spec.sceneId], format, i > 0 ? specs[i - 1] : null));
    await save('direction.json', specs);
    await save('assets.json', { assets, scenes: assetReport, search: assetReport.search, diagnostics: assetReport.diagnostics });
    if (assetReport.diagnostics) {
      await save('asset-quality-diagnostics.json', assetReport.diagnostics);
    }
    const usedAssets = Object.values(assets).flatMap((a) => [a.primary, ...(a.alternates || [])]).filter(Boolean);
    await fs.writeFile(path.join(runDir, 'credits.txt'), formatCredits(executionPlan.title, usedAssets));
    const recasts = specs.flatMap((s) => s.recasts.map((r) => `${s.sceneId}: ${r}`));
    if (recasts.length) console.log(`   ↳ recast:\n     ${recasts.join('\n     ')}`);
    await calibrateSfxAssets(path.join(config.publicDir, 'audio', 'sfx')).catch(() => {});
    const [sfxSources, bgmSource] = await Promise.all([ensureSoundEffects(), ensureBackgroundMusic(plan.style)]);
    sfx = Object.fromEntries(await Promise.all(Object.entries(sfxSources).map(async ([k, rel]) => [k, await copyIn(rel)])));
    bgm = { ...bgmSource, src: await copyIn(bgmSource.src) };
    await job.completeStage('assets', ['asset-requests.json', 'assets.json', 'asset-quality-diagnostics.json', 'direction.json', 'continuity.json', 'credits.txt']);
  }

  // 6. Timeline Director + Visual Critic & static QC.
  let timeline;
  let pacingDiagnostics;
  let durationDiagnostics;
  let audioDiagnostics;
  let visualCoverageDiagnostics;
  let realizationDiagnostics;
  let diagramDiagnostics;
  let criticReview;
  let creativeQaResult;
  let editContinuityDiagnostics;
  let editorialVisualPlan;
  let compositionArtifacts = { sceneCompositions: {}, comparisonSpecs: {}, chartSpecs: {}, mediaSceneSpecs: {}, editorialVisualBeats: {}, mediaShotPlans: {}, solvedScenes: {}, motionPlans: {}, visualQualityReviews: {}, frameStatePreflight: {}, compositionFallbacks: [], mediaCompositionDiagnostics: {} };

  if (canReuse('timeline')) {
    console.log(`   ✓ [Reused] timeline.json`);
    timeline = JSON.parse(await fs.readFile(path.join(runDir, 'timeline.json'), 'utf8'));
    try {
      editorialVisualPlan = JSON.parse(await fs.readFile(path.join(runDir, 'editorial-visual-plan.json'), 'utf8'));
      compositionArtifacts = {
        sceneCompositions: JSON.parse(await fs.readFile(path.join(runDir, 'scene-compositions.json'), 'utf8')),
        comparisonSpecs: await fs.readFile(path.join(runDir, 'comparison-specs.json'), 'utf8').then(JSON.parse).catch(() => ({})),
        chartSpecs: await fs.readFile(path.join(runDir, 'chart-specs.json'), 'utf8').then(JSON.parse).catch(() => ({})),
        mediaSceneSpecs: await fs.readFile(path.join(runDir, 'media-scene-specs.json'), 'utf8').then(JSON.parse).catch(() => ({})),
        editorialVisualBeats: await fs.readFile(path.join(runDir, 'editorial-visual-beats.json'), 'utf8').then(JSON.parse).catch(() => ({})),
        mediaShotPlans: await fs.readFile(path.join(runDir, 'media-shot-plan.json'), 'utf8').then(JSON.parse).catch(() => ({})),
        solvedScenes: JSON.parse(await fs.readFile(path.join(runDir, 'solved-scenes.json'), 'utf8')),
        motionPlans: JSON.parse(await fs.readFile(path.join(runDir, 'motion-plans.json'), 'utf8')),
        visualQualityReviews: await fs.readFile(path.join(runDir, 'visual-quality-reviews.json'), 'utf8').then(JSON.parse).catch(() => ({})),
        frameStatePreflight: JSON.parse(await fs.readFile(path.join(runDir, 'frame-state-preflight.json'), 'utf8')),
        compositionFallbacks: await fs.readFile(path.join(runDir, 'composition-fallbacks.json'), 'utf8').then(JSON.parse).catch(() => ([])),
        mediaCompositionDiagnostics: await fs.readFile(path.join(runDir, 'media-composition-diagnostics.json'), 'utf8').then(JSON.parse).catch(() => ({})),
      };
    } catch {}
    try {
      pacingDiagnostics = JSON.parse(await fs.readFile(path.join(runDir, 'pacing-diagnostics.json'), 'utf8'));
      durationDiagnostics = JSON.parse(await fs.readFile(path.join(runDir, 'duration-budget.json'), 'utf8'));
      audioDiagnostics = JSON.parse(await fs.readFile(path.join(runDir, 'audio-diagnostics.json'), 'utf8'));
      visualCoverageDiagnostics = JSON.parse(await fs.readFile(path.join(runDir, 'visual-coverage-diagnostics.json'), 'utf8'));
      realizationDiagnostics = JSON.parse(await fs.readFile(path.join(runDir, 'visual-realization-diagnostics.json'), 'utf8'));
      diagramDiagnostics = JSON.parse(await fs.readFile(path.join(runDir, 'diagram-quality-diagnostics.json'), 'utf8'));
      criticReview = JSON.parse(await fs.readFile(path.join(runDir, 'visual_critic.json'), 'utf8'));
      creativeQaResult = {
        creativeQaBefore: JSON.parse(await fs.readFile(path.join(runDir, 'creative-qa-before.json'), 'utf8')),
        repairsApplied: JSON.parse(await fs.readFile(path.join(runDir, 'creative-repairs.json'), 'utf8')),
        creativeQaAfter: JSON.parse(await fs.readFile(path.join(runDir, 'creative-qa-after.json'), 'utf8')),
        timeline,
      };
      editContinuityDiagnostics = JSON.parse(await fs.readFile(path.join(runDir, 'edit-continuity-diagnostics.json'), 'utf8'));
    } catch {}
  } else {
    await job.startStage('timeline');
    onProgress({ step: 5, message: 'Building the edit...' });
    editorialVisualPlan = buildEditorialVisualPlan({ storyboard, coveragePlan: visualCoveragePlan, specs, assets, format, visualPolicy });
    await save('editorial-visual-plan.json', editorialVisualPlan);
    timeline = buildTimeline({ plan: executionPlan, specs, narration, assets, sfx, bgm, videoId, format, fps, audioSrc: path.basename(narrationFile), coveragePlan: visualCoveragePlan, editorialVisualPlan, visualPolicy });
    compositionArtifacts = timeline._compositionArtifacts || compositionArtifacts;
    await save('scene-compositions.json', compositionArtifacts.sceneCompositions);
    await save('comparison-specs.json', compositionArtifacts.comparisonSpecs);
    await save('chart-specs.json', compositionArtifacts.chartSpecs);
    await save('media-scene-specs.json', compositionArtifacts.mediaSceneSpecs);
    await save('editorial-visual-beats.json', compositionArtifacts.editorialVisualBeats);
    await save('media-shot-plan.json', compositionArtifacts.mediaShotPlans);
    await save('solved-scenes.json', compositionArtifacts.solvedScenes);
    await save('motion-plans.json', compositionArtifacts.motionPlans);
    await save('visual-quality-reviews.json', compositionArtifacts.visualQualityReviews);
    await save('frame-state-preflight.json', compositionArtifacts.frameStatePreflight);
    await save('composition-fallbacks.json', compositionArtifacts.compositionFallbacks);
    await save('media-composition-diagnostics.json', compositionArtifacts.mediaCompositionDiagnostics);

    criticReview = reviewVisualPlan(timeline, { plan: executionPlan, storyboard, continuityReport, assets });
    await save('visual_critic.json', criticReview);
    if (criticReview.sceneRepairs?.length) {
      timeline = applySceneRepairs(timeline, criticReview.sceneRepairs);
    }
    pacingDiagnostics = buildPacingDiagnostics(timeline, executionPlan);
    durationDiagnostics = buildDurationDiagnostics({
      budget: durationBudget,
      plan: executionPlan,
      narration,
      timeline,
      compressionPasses,
    });
    audioDiagnostics = buildAudioDiagnostics({
      narrationLoudness: narrationNorm,
      duckingDiagnostics: timeline.audio?.duckingDiagnostics,
      sfxDiagnostics: timeline.audio?.sfxDiagnostics,
      bgmConfig: timeline.audio?.bgm,
    });
    visualCoverageDiagnostics = buildVisualCoverageDiagnostics(timeline, visualCoveragePlan);

    const initialTimeline = JSON.parse(JSON.stringify(timeline));
    creativeQaResult = runCreativeQaLoop({
      timeline,
      storyboard,
      visualCoveragePlan,
      assets,
      durationDiagnostics,
      pacingDiagnostics,
      visualCoverageDiagnostics,
      audioDiagnostics,
      topic: topic || plan.title,
      format,
      maxPasses: 2,
    });

    timeline = creativeQaResult.timeline;
    await save('creative-qa-before.json', creativeQaResult.creativeQaBefore);
    await save('creative-repairs.json', creativeQaResult.repairsApplied);
    await save('creative-qa-after.json', creativeQaResult.creativeQaAfter);

    if (creativeQaResult.repairsApplied.length > 0) {
      console.log(`   🎨 Creative QA repaired ${creativeQaResult.repairsApplied.length} shot issue(s) across ${creativeQaResult.passesRun} pass(es):`);
      for (const r of creativeQaResult.repairsApplied) {
        console.log(`      ↳ [${r.action}] shot ${r.shotId}: ${r.reason}`);
      }
      pacingDiagnostics = buildPacingDiagnostics(timeline, executionPlan);
      visualCoverageDiagnostics = buildVisualCoverageDiagnostics(timeline, visualCoveragePlan);
    }

    editContinuityDiagnostics = buildEditContinuityDiagnostics(timeline, { frameStatePreflight: compositionArtifacts.frameStatePreflight });
    await save('edit-continuity-diagnostics.json', editContinuityDiagnostics);

    await save('timeline.json', timeline, { schema: TimelineSchema });
    realizationDiagnostics = buildVisualRealizationDiagnostics(timeline);
    await save('visual-realization-diagnostics.json', realizationDiagnostics);
    await save('visual-design-diagnostics.json', realizationDiagnostics);
    await save('pacing-diagnostics.json', pacingDiagnostics);
    await save('duration-budget.json', durationDiagnostics);
    await save('audio-diagnostics.json', audioDiagnostics);
    await save('visual-coverage-diagnostics.json', visualCoverageDiagnostics);

    diagramDiagnostics = buildDiagramQualityDiagnostics(timeline, { format });
    await save('diagram-quality-diagnostics.json', diagramDiagnostics);

    await job.completeStage('timeline', [
      'timeline.json',
      'visual-realization-diagnostics.json',
      'visual-design-diagnostics.json',
      'pacing-diagnostics.json',
      'duration-budget.json',
      'audio-diagnostics.json',
      'visual-coverage-diagnostics.json',
      'diagram-quality-diagnostics.json',
      'creative-qa-before.json',
      'creative-repairs.json',
      'creative-qa-after.json',
      'editorial-visual-plan.json',
      'editorial-visual-beats.json',
      'media-shot-plan.json',
      'scene-compositions.json',
      'media-scene-specs.json',
      'solved-scenes.json',
      'motion-plans.json',
      'frame-state-preflight.json',
      'edit-continuity-diagnostics.json',
      'media-composition-diagnostics.json',
    ]);
  }

  let videoPackage;
  if (canReuse('package')) {
    console.log(`   ✓ [Reused] packaging.json`);
    videoPackage = JSON.parse(await fs.readFile(path.join(runDir, 'packaging.json'), 'utf8'));
  } else {
    await job.startStage('package');
    videoPackage = generateVideoPackage(executionPlan, timeline, { format });
    await save('packaging.json', videoPackage);
    await fs.writeFile(path.join(runDir, 'package.md'), `# ${videoPackage.title}\n\n${videoPackage.description}`);
    await job.completeStage('package', ['packaging.json', 'package.md']);
  }

  await job.startStage('preRenderQa');
  const staticQc = runTimelineQc(timeline, { plan: executionPlan, narration, assetReport, realizationDiagnostics, pacingDiagnostics, durationDiagnostics, audioDiagnostics, visualCoverageDiagnostics, editContinuityDiagnostics });
  await save('qc.json', staticQc);
  printQc('Timeline QC', staticQc);
  if (!staticQc.ok) throw new Error(`Timeline QC failed — see ${path.join(runDir, 'qc.json')}`);

  // Creative QA Production Acceptance Gate: Hard failures or FAILED shots must block production render
  if (creativeQaResult?.creativeQaAfter?.qualitySummary?.hardFailureCount > 0 || creativeQaResult?.creativeQaAfter?.qualitySummary?.failedCount > 0) {
    throw new Error(`Creative QA hard failure blocking render: ${creativeQaResult.creativeQaAfter.qualitySummary.hardFailureCount} hard failure(s), ${creativeQaResult.creativeQaAfter.qualitySummary.failedCount} failed shot(s). See creative-qa-after.json`);
  }

  let preflightContactSheet = null;
  let preRepairContactSheet = null;
  if (render || contactSheetOnly) {
    onProgress({ step: 5, message: 'Rendering contact sheet preview...' });
    if (creativeQaResult?.repairsApplied?.length > 0) {
      preRepairContactSheet = await renderContactSheet(runDir, { timeline, outputFilename: 'contact-pre-repair.png', ats: [0.5] }).catch(() => null);
    }
    preflightContactSheet = await renderContactSheet(runDir, { timeline, outputFilename: 'contact-post-repair.png', ats: [0.5] }).catch(() => null);
    if (preflightContactSheet) {
      await fs.mkdir(path.join(runDir, 'preview'), { recursive: true });
      await fs.copyFile(preflightContactSheet, path.join(runDir, 'preview', 'contact.png')).catch(() => {});
    }
  }
  const preflightRelative = preflightContactSheet
    ? path.relative(runDir, preflightContactSheet).split(path.sep).join('/')
    : null;
  const preRepairRelative = preRepairContactSheet
    ? path.relative(runDir, preRepairContactSheet).split(path.sep).join('/')
    : null;
  await save('qc-pre.json', {
    timeline: staticQc,
    critic: criticReview,
    creativeQa: creativeQaResult?.creativeQaAfter,
    preflightContactSheet: preflightRelative,
    preRepairContactSheet: preRepairRelative,
  });
  await job.completeStage('preRenderQa', [
    'qc-pre.json',
    'visual_critic.json',
    ...(preflightRelative ? [preflightRelative] : []),
    ...(preRepairRelative ? [preRepairRelative] : []),
  ]);

  // Persist exact config snapshot and cache diagnostics (Milestone 12)
  await persistConfigSnapshot(runDir, {
    topic: topic || plan.title,
    niche,
    format,
    voice,
    style: style || plan.style,
    durationSec: targetDuration,
    render,
    tts,
    contactSheetOnly,
    offline,
  });
  await save('cache-diagnostics.json', metrics.toJSON());

  const result = {
    success: true,
    videoId,
    title: plan.title,
    runDir,
    durationSeconds: narration.durationInSeconds,
    totalFrames: timeline.durationInFrames,
    scriptPayload: plan,
    qc: { timeline: staticQc, critic: criticReview, creativeQa: creativeQaResult?.creativeQaAfter },
    creativeQa: {
      before: creativeQaResult?.creativeQaBefore,
      after: creativeQaResult?.creativeQaAfter,
      repairs: creativeQaResult?.repairsApplied || [],
    },
    visualRealizationDiagnostics: realizationDiagnostics,
    pacingDiagnostics,
    durationDiagnostics,
    audioDiagnostics,
    visualCoveragePlan,
    visualCoverageDiagnostics,
    diagramQualityDiagnostics: diagramDiagnostics,
    editContinuityDiagnostics,
    preflightContactSheet,
    preRepairContactSheet,
    package: videoPackage,
    credits: path.join(runDir, 'credits.txt'),
  };

  // Requirement 20: Contact Sheet Only mode returns immediately after contact sheet
  if (contactSheetOnly) {
    console.log(`\n🖼️  Contact sheet generated: ${preflightContactSheet}`);
    await job.skipStage('render');
    await job.skipStage('postRenderQa');
    await job.finish();
    return { ...result, contactSheetOnly: true };
  }

  if (!render) {
    await save('qc.json', result.qc);
    await job.skipStage('render');
    await job.skipStage('postRenderQa');
    await job.finish();
    return result;
  }

  // 7. Render.
  await job.startStage('render');
  const renderStartedAt = Date.now();
  onProgress({ step: 6, message: 'Bundling compositions...' });
  const serveUrl = await bundle({ entryPoint: path.join(config.rootDir, 'src/remotion/index.jsx'), publicDir: runPublic, ignoreRegisterRootWarning: true });
  const inputProps = { timeline };
  const composition = await selectComposition({ serveUrl, id: format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer', inputProps });

  let frameRange = null;
  let outputFilename = `${videoId}-${format}.mp4`;

  // Requirement 19: Partial Render support
  if (scene) {
    const targetClip = timeline.clips.find((c) => c.id === scene || c.sceneId === scene || c.shotId === scene);
    if (!targetClip) {
      const avail = timeline.clips.map((c) => c.id || c.sceneId || c.shotId).filter(Boolean).join(', ');
      throw new Error(`Scene/Shot "${scene}" not found in timeline clips. Available: ${avail}`);
    }
    const startFrame = targetClip.from;
    const endFrame = targetClip.from + targetClip.durationInFrames - 1;
    frameRange = [startFrame, endFrame];
    outputFilename = `${videoId}-${scene}.mp4`;
    console.log(`   🎬 Partial render for scene "${scene}": frames ${startFrame}..${endFrame} (~${(targetClip.durationInFrames / fps).toFixed(1)}s)`);
  } else if (range) {
    const [startSecStr, endSecStr] = range.split(':');
    const startSec = parseFloat(startSecStr) || 0;
    const endSec = parseFloat(endSecStr) || (timeline.durationInFrames / fps);
    const startFrame = Math.max(0, Math.round(startSec * fps));
    const endFrame = Math.min(timeline.durationInFrames - 1, Math.round(endSec * fps));
    frameRange = [startFrame, endFrame];
    outputFilename = `${videoId}-range-${startSec}-${endSec}.mp4`;
    console.log(`   🎬 Partial render for range "${range}": frames ${startFrame}..${endFrame} (~${((endFrame - startFrame) / fps).toFixed(1)}s)`);
  }

  const outputPath = path.join(config.rendersDir, outputFilename);
  let lastPct = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 17,
    imageFormat: 'jpeg',
    jpegQuality: 94,
    colorSpace: 'bt709',
    audioBitrate: '192k',
    outputLocation: outputPath,
    inputProps,
    ...(frameRange ? { frameRange } : {}),
    onProgress: ({ progress: p }) => {
      const pct = Math.round(p * 100);
      if (pct !== lastPct && pct % 10 === 0) console.log(`   rendering ${pct}%`);
      lastPct = pct;
      onProgress({ step: 6, message: `Rendering video: ${pct}%`, progress: pct });
    },
  });
  await job.completeStage('render', [path.relative(runDir, outputPath).split(path.sep).join('/')]);
  timeline.performance = { ...(timeline.performance || {}), renderOverheadMs: Date.now() - renderStartedAt };
  await save('media-editorial-performance.json', timeline.performance);

  // 8. Render upload-ready Thumbnail PNG (only if full render)
  if (!scene && !range) {
    try {
      const thumbComp = await selectComposition({ serveUrl, id: 'YouTubeThumbnail', inputProps: { packageData: videoPackage } });
      const thumbnailPath = path.join(runDir, 'thumbnail.png');
      await renderStill({
        composition: thumbComp,
        serveUrl,
        output: thumbnailPath,
        inputProps: { packageData: videoPackage },
        imageFormat: 'png',
      });
      result.thumbnail = thumbnailPath;
      console.log(`   🖼️  Thumbnail generated: ${thumbnailPath}`);
    } catch (e) {
      // Graceful fallback if thumbnail composition has a minor issue
    }
  }

  // 9. Visual QA & Rendered Visual Critic on the actual file.
  await job.startStage('postRenderQa');
  onProgress({ step: 7, message: 'Checking the render...' });
  const renderQc = await runRenderQc(outputPath, timeline);
  printQc('Visual QA', renderQc);
  result.qc.render = renderQc;

  try {
    const renderedCritic = await reviewRenderedFrames(outputPath, timeline, runDir);
    result.qc.renderedCritic = renderedCritic;
    console.log(`   📸 Rendered keyframes extracted to: ${renderedCritic.contactSheet || 'scene_frames/'}`);
  } catch (e) {
    // Graceful fallback
  }

  await save('qc.json', result.qc);
  await job.completeStage('postRenderQa', ['qc.json', ...(result.qc.renderedCritic?.contactSheet ? [result.qc.renderedCritic.contactSheet] : [])]);
  await job.finish();

  console.log(`\n🎉 ${outputPath} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
  return { ...result, outputPath, outputFilename };
  } catch (error) {
    await job.fail(error);
    throw error;
  }
}
