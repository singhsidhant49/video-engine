import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { renderContactSheet, generateContactSheetDiagnostics, verifyRenderedContactFrames, getRunBundle } from '../tools/preview.js';
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { config } from '../config/index.js';
import { generateDirectorPlan, normalizePlan, compressPlanScript, expandPlanScript, validateContentQuality, repairIncompleteNarration, repairUnverifiedClaims, selectTargetDuration } from '../services/aiDirectorService.js';
import { generateSpeech } from '../services/ttsService.js';
import { generateMeditationSpeech } from '../audio/meditationPacer.js';
import { analyzeNarration, releaseWhisper } from '../services/audioAnalysisService.js';
import { ensureSoundEffects, ensureBackgroundMusic } from '../services/sfxGeneratorService.js';
import { calculateDurationBudget, buildDurationDiagnostics, calculateNarrationRepairSpeed, calculateNarrationTempoRepair, calculateNarrationCompressionLimits, calculateOverlongNarrationRepairSpeed } from '../storyboard/durationBudget.js';
import { resolveNarrationProfile } from '../audio/narrationProfile.js';
import { normalizeVideoBrief, resolveProductionProfile } from '../config/videoBrief.js';
import { normalizeNarrationWav, calibrateSfxAssets, buildAudioDiagnostics } from '../audio/audioMastering.js';
import { directScenes, recast } from './visualDirector.js';
import { directAssets } from './assetDirector.js';
import { directAiAssets } from './aiAssetDirector.js';
import { buildStoryboard } from './visualStoryboardDirector.js';
import { evaluateContinuity, buildPacingDiagnostics } from './continuityDirector.js';
import { reviewVisualPlan, applySceneRepairs, reviewRenderedFrames } from '../services/visualCriticService.js';
import { generateVideoPackage } from '../services/thumbnailGenerator.js';
import { buildTimeline, rngFrom, sceneWordRanges } from './timeline.js';
import { synthesizeWithSay } from '../services/devTts.js';
import { formatCredits } from '../shared/licensing.js';
import { ffmpeg, probeDuration } from '../services/ffmpeg.js';
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
import { planAssetRequests, buildAssetQueryDiagnostics } from './assetRequestPlanner.js';

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
import { AssetRequestListSchema } from '../models/assetRequest.schema.js';
import { buildVisualCoveragePlan } from '../storyboard/visualCoveragePlan.js';
import { VisualCoveragePlanSchema } from '../models/visualCoveragePlan.schema.js';
import { consolidatePlanForPacing } from '../storyboard/pacingConsolidation.js';
import { evaluateVisualSequence } from '../storyboard/visualSequenceDirector.js';
import { buildEditorialVisualPlan } from './editorialVisualPlanner.js';
import { buildVisualCoverageDiagnostics } from '../qc/visualCoverageDiagnostics.js';
import { runCreativeQaLoop, evaluateCreativeQa, applyCreativeRepairs } from '../qc/creativeQaDirector.js';
import { evaluateRunValidity } from '../core/checkpoints/invalidationGraph.js';
import { canonicalStageName } from '../core/checkpoints/stageRegistry.js';
import { metrics } from '../core/cache/cacheManager.js';
import { persistConfigSnapshot } from '../core/checkpoints/versionTracker.js';
import { buildEditContinuityDiagnostics } from '../qc/editContinuityDiagnostics.js';
import { resolveVisualPolicy } from '../config/visualMode.js';
import { applyManualVisualOverrides, materializeManualImageOverrides } from './manualVisualOverrides.js';
import { renderMediaSegmented, shouldUseSegmentedRender } from './segmentedRemotionRender.js';

function buildClaimEvidenceDiagnostics(plan) {
  const claims = plan?.claims || [];
  const byStatus = {};
  for (const claim of claims) byStatus[claim.status || 'unknown'] = (byStatus[claim.status || 'unknown'] || 0) + 1;
  return {
    totalClaims: claims.length,
    byStatus,
    productionBlockingClaims: claims.filter((claim) => claim.type === 'statistic' && claim.status === 'unverified'),
    sourcedClaims: claims.filter((claim) => claim.source_url || claim.source?.url),
    note: 'Recorded sources establish editorial provenance; final factual accuracy still requires human review.',
  };
}

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
 * @param {'MEDIA_EDITORIAL'} [o.visualMode] retained for API compatibility; MEDIA_EDITORIAL is the only supported mode
 * @param {object} [o.brief] normalized prompt/data request for application integrations
 * @param {object} [o.channelProfile] channel-level audience, tone and pacing defaults
 * @param {string} [o.videoId] caller-assigned stable video identifier
 * @param {AbortSignal} [o.signal] cooperative cancellation signal
 * @param {number} [o.generationAttempt] durable retry number used to vary rejected AI candidates deterministically
 */
export function resolveEditorialMode(contentType = '', niche = '') {
  const norm = String(contentType || '').toLowerCase().trim();
  if (norm === 'documentary') return 'DOCUMENTARY';
  if (norm === 'motivational') return 'MOTIVATIONAL';
  if (norm === 'story' || norm === 'audiobook') return 'STORY';
  if (norm === 'meditation') return 'GENERAL';
  if (norm === 'explainer' || niche === 'tech') return niche === 'tech' ? 'TECHNICAL_EXPLAINER' : 'GENERAL';
  return niche === 'tech' ? 'TECHNICAL_EXPLAINER' : 'GENERAL';
}

export async function createFacelessVideo({
  brief,
  channelProfile,
  topic,
  niche,
  format,
  voice,
  style,
  durationSec,
  audioFile,
  planFile,
  render = true,
  tts,
  channelId,
  visualStrategy,
  resume = null,
  from = null,
  scene = null,
  range = null,
  contactSheetOnly = false,
  noTts = false,
  offline = false,
  visualMode,
  unresolvedMediaMode = 'FAIL_PRODUCTION_RENDER',
  publishMode = 'PRODUCTION_RENDER',
  renderScale = 1,
  onProgress = () => {},
  videoId: requestedVideoId,
  signal,
  force = false,
  imageSource = 'stock',
  imageStyle = 'anime',
  customStylePrompt = '',
  imageProvider = null,
  imageModel = null,
  imageQuality = null,
  generationAttempt = 0,
}) {
  if (global.gc) { try { global.gc(); } catch {} }
  const explicitVoiceRequested = Boolean(
    voice
    || brief?.voice
    || brief?.channel?.voice
    || brief?.channelProfile?.voice
    || channelProfile?.voice
  );
  const throwIfCancelled = () => {
    if (signal?.aborted) {
      const error = new Error('Video generation cancelled');
      error.name = 'AbortError';
      error.code = 'VIDEO_GENERATION_CANCELLED';
      throw error;
    }
  };
  throwIfCancelled();
  let normalizedBrief = null;
  if (brief || !resume) {
    normalizedBrief = normalizeVideoBrief({
      ...(brief || {}),
      prompt: topic || brief?.prompt || brief?.topic,
      niche: niche ?? brief?.niche ?? '',
      format: format || brief?.format || 'landscape',
      durationSec: durationSec ?? brief?.durationSec,
      style: style || brief?.style,
      voice: voice || brief?.voice,
      channel: channelProfile || brief?.channel || brief?.channelProfile || {},
    });
    topic = normalizedBrief.prompt;
    niche = normalizedBrief.niche;
    format = normalizedBrief.format;
    durationSec = durationSec ?? normalizedBrief.durationSec;
    style = style || normalizedBrief.style || normalizedBrief.channel.style;
    voice = voice || normalizedBrief.voice || normalizedBrief.channel.voice;
    channelProfile = normalizedBrief.channel;
    channelId = channelId || normalizedBrief.channel.id;
  }
  channelId = channelId || 'default';
  let effectiveImageSource = (normalizedBrief?.imageSource || brief?.creative?.imageSource || brief?.imageSource || imageSource || 'stock').toLowerCase();
  let effectiveImageStyle = normalizedBrief?.imageStyle || brief?.creative?.imageStyle || brief?.imageStyle || imageStyle || 'anime';
  let effectiveCustomStylePrompt = normalizedBrief?.customStylePrompt || brief?.creative?.customStylePrompt || brief?.customStylePrompt || customStylePrompt || '';
  let effectiveImageProvider = normalizedBrief?.imageProvider || brief?.creative?.imageProvider || brief?.imageProvider || imageProvider || null;
  let effectiveImageModel = normalizedBrief?.imageModel || brief?.creative?.imageModel || brief?.imageModel || imageModel || null;
  let effectiveImageQuality = normalizedBrief?.imageQuality || brief?.creative?.imageQuality || brief?.imageQuality || imageQuality || null;
  let sourceData = normalizedBrief?.sourceData;
  // Production defaults to restrained documentary editing: mostly static
  // stills and hard cuts, with sparse motion reserved for major story beats.
  const visualPolicy = resolveVisualPolicy({
    visualMode,
    motionPreset: process.env.VIDEO_MOTION_PRESET || 'standard',
  });
  const t0 = Date.now();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
  const videoId = resume || requestedVideoId || `video-${stamp}`;
  const fps = config.video.fps;
  const runsDir = path.join(config.rendersDir, 'runs');

  // For supplied narration, the audio is the duration source of truth unless
  // the caller explicitly requests a different target.
  if (audioFile && !durationSec && !resume) {
    durationSec = Number((await probeDuration(audioFile)).toFixed(2));
  }

  let job;
  const reusedStagesSet = new Set();
  let productionProfile = resolveProductionProfile({ topic, niche, format: format || 'landscape', channelProfile });
  let narrationProfile = resolveNarrationProfile({
    topic,
    niche,
    contentType: productionProfile.contentType,
    format: format || 'landscape',
    baseSpeed: config.kokoro.speed,
    meditationSpeed: config.kokoro.meditationSpeed,
  });
  const requestedMusic = normalizedBrief?.music || normalizedBrief?.bgm || channelProfile?.music || channelProfile?.bgm;

  if (resume) {
    console.log(`\n🔄 Resuming run: ${resume}`);
    job = await JobContext.load({ id: resume, runsDir, force: true });
    let savedRequest = {};
    try {
      savedRequest = JSON.parse(await fs.readFile(path.join(job.runDir, 'request.json'), 'utf8'));
    } catch {}
    topic = topic || savedRequest.topic || job.project.topic;
    niche = niche ?? savedRequest.niche ?? '';
    format = format || savedRequest.format || job.project.format || 'shorts';
    voice = voice || savedRequest.voice || job.project.config?.voice || config.kokoro.defaultVoice;
    tts = tts || savedRequest.tts || job.project.config?.tts || 'kokoro';
    // The immutable project request is the fallback source of truth. Derived
    // checkpoint loss must never silently turn a resumed 300-second job into
    // the CLI's 75-second default and destructively compress its plan.
    durationSec = durationSec || job.project.targetDuration || savedRequest.durationSec;
    style = style || job.project.config?.style || savedRequest.style;
    channelProfile = channelProfile || savedRequest.channelProfile || job.project.config?.channelProfile || {};
    sourceData = sourceData ?? savedRequest.sourceData;
    channelId = channelId || savedRequest.channelId || job.project.channelId || 'default';
    if (savedRequest.imageSource && effectiveImageSource === 'stock') effectiveImageSource = savedRequest.imageSource;
    if (savedRequest.imageStyle && effectiveImageStyle === 'anime') effectiveImageStyle = savedRequest.imageStyle;
    if (savedRequest.customStylePrompt && !effectiveCustomStylePrompt) effectiveCustomStylePrompt = savedRequest.customStylePrompt;
    productionProfile = resolveProductionProfile({ topic, niche, format, channelProfile });
    // A resumed run may have persisted an automatically selected voice from an
    // older, incorrect content profile. Preserve actual user choices, but let
    // automatic voice selection follow the freshly resolved profile.
    if (!explicitVoiceRequested) voice = productionProfile.voice;
    narrationProfile = resolveNarrationProfile({
      topic,
      niche,
      contentType: productionProfile.contentType,
      format: format || 'landscape',
      baseSpeed: config.kokoro.speed,
      meditationSpeed: config.kokoro.meditationSpeed,
    });

    const validity = await evaluateRunValidity({
      runDir: job.runDir,
      manifest: job.checkpoints.manifest?.toJSON ? job.checkpoints.manifest.toJSON() : job.checkpoints.manifest,
      currentContext: {
        topic: topic || job.project.topic,
        niche,
        format: format || job.project.format,
        style: style || job.project.config?.style,
        voice: voice || job.project.config?.voice,
        speed: narrationProfile.speed,
        durationSec,
        offline,
        visualMode: visualPolicy.visualMode,
        productionProfile,
        sourceData,
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
    niche = niche || '';
    format = format || 'shorts';
    voice = voice || productionProfile?.voice || config.kokoro.defaultVoice;
    tts = tts || 'kokoro';
    job = await JobContext.create({
      id: videoId,
      topic,
      channelId,
      format,
      targetDuration: durationSec || null,
      config: { voice, style: style || null, tts, render, visualMode: visualPolicy.visualMode, narrationProfile, channelProfile, productionProfile, assetPolicy: { allowGenerated: false } },
      runsDir,
    });
  }

  const { runDir, publicDir: runPublic } = job;
  const save = (name, data, options) => job.writeArtifact(name, data, options);
  const canReuse = (stageName) => reusedStagesSet.has(canonicalStageName(stageName));

  console.log(`\n🎬 ${videoId} · "${topic || job.project.topic}" · ${format}`);

  try {
    throwIfCancelled();
  let targetDuration;
  let durationBudget;

  if (canReuse('request')) {
    console.log(`   ✓ [Reused] request.json & duration-budget.json`);
    const reqData = JSON.parse(await fs.readFile(path.join(runDir, 'request.json'), 'utf8'));
    if (reqData.format) format = reqData.format;
    targetDuration = durationSec || reqData.durationSec;
    if (!targetDuration) {
      const durationSelection = await selectTargetDuration({ topic, niche, format, range: normalizedBrief?.durationRange, channelProfile });
      targetDuration = durationSelection.durationSeconds;
    }
    const speechRateWps = tts === 'kokoro'
      ? narrationProfile.speechRateWps
      : undefined;
    durationBudget = calculateDurationBudget({ targetDurationSec: targetDuration, format, style: style || reqData.style, speechRateWps });
    if (Number(reqData.durationSec) !== Number(targetDuration)) {
      console.warn(`   Repairing stale request duration ${reqData.durationSec}s -> ${targetDuration}s from project source of truth.`);
      await job.startStage('request');
      await save('request.json', { ...reqData, topic, niche, format, channelId, durationSec: targetDuration, voice, style: style || reqData.style || null, tts, render, offline, visualMode: visualPolicy.visualMode, channelProfile, productionProfile, sourceData, imageSource: effectiveImageSource, imageStyle: effectiveImageStyle, customStylePrompt: effectiveCustomStylePrompt });
      await save('duration-budget.json', buildDurationDiagnostics({ budget: durationBudget }));
      await job.completeStage('request', ['request.json', 'duration-budget.json']);
    }
  } else {
    await job.startStage('request');
    const durationMode = normalizedBrief?.durationMode || (durationSec ? 'exact' : 'auto');
    const durationSelection = durationSec
      ? { durationSeconds: durationSec, method: 'exact', range: normalizedBrief?.durationRange || null, rationale: 'Exact duration supplied by the user.' }
      : await selectTargetDuration({ topic, niche, format, range: normalizedBrief?.durationRange, channelProfile });
    throwIfCancelled();
    targetDuration = durationSelection.durationSeconds;
    const speechRateWps = tts === 'kokoro'
      ? narrationProfile.speechRateWps
      : undefined;
    durationBudget = calculateDurationBudget({ targetDurationSec: targetDuration, format, style, speechRateWps });
    await save('request.json', { topic, niche, format, channelId, durationSec: targetDuration, durationMode, durationRange: normalizedBrief?.durationRange || durationSelection.range || null, durationSelection, voice, style: style || null, tts, render, offline, visualMode: visualPolicy.visualMode, channelProfile, productionProfile, sourceData, imageSource: effectiveImageSource, imageStyle: effectiveImageStyle, customStylePrompt: effectiveCustomStylePrompt });
    await save('duration-budget.json', buildDurationDiagnostics({ budget: durationBudget }));
    await job.completeStage('request', ['request.json', 'duration-budget.json']);
  }

  // 1. Editorial plan.
  let plan;
  let assetEditorialMode = resolveEditorialMode(productionProfile?.contentType, niche);
  const reusablePlanStage = canReuse('plan');
  let recoveredFailedPlan = false;
  let savedPlan = null;
  if (!reusablePlanStage && resume && !from && !planFile) {
    try {
      const candidate = await repairIncompleteNarration(JSON.parse(await fs.readFile(path.join(runDir, 'plan.json'), 'utf8')), null);
      const normalizedCandidate = normalizePlan(candidate, {
        topic: topic || candidate.topic,
        niche: niche || candidate.niche,
        format: format || candidate.format,
        style: style || candidate.style,
      });
      if (normalizedCandidate.contentQuality?.valid) {
        savedPlan = candidate;
        recoveredFailedPlan = true;
      }
    } catch { /* missing or invalid failed-stage artifact: regenerate normally */ }
  }
  if (reusablePlanStage || recoveredFailedPlan) {
    savedPlan ||= JSON.parse(await fs.readFile(path.join(runDir, 'plan.json'), 'utf8'));
    savedPlan = await repairIncompleteNarration(savedPlan, null);
    // Apply current normalization and content-QC rules to resumed plans instead
    // of preserving stale claims or validator decisions from a failed run.
    plan = normalizePlan(savedPlan, {
      topic: topic || savedPlan.topic,
      niche: niche || savedPlan.niche,
      format: format || savedPlan.format,
      style: style || savedPlan.style,
    });
    plan.durationBudget = savedPlan.durationBudget || durationBudget;
    plan.compressionPasses = savedPlan.compressionPasses || 0;
    plan.expansionPasses = savedPlan.expansionPasses || 0;
    await save('plan.json', plan);
    await save('content-quality-diagnostics.json', plan.contentQuality);
    await save('claim-evidence-diagnostics.json', buildClaimEvidenceDiagnostics(plan));
    if (recoveredFailedPlan) {
      await job.startStage('plan');
      await job.completeStage('plan', ['plan.json', 'content-quality-diagnostics.json', 'claim-evidence-diagnostics.json']);
    }
    console.log(`   ✓ [Reused] plan.json ("${plan.title}" · style ${plan.style} · ${plan.scenes.length} scenes · ${plan.script.split(/\s+/).length} words)`);
  } else {
    await job.startStage('plan');
    throwIfCancelled();
    onProgress({ step: 1, message: 'Directing: script and shot intent...' });
    const speechRateWps = tts === 'kokoro'
      ? narrationProfile.speechRateWps
      : undefined;
    plan = planFile
      ? normalizePlan(JSON.parse(await fs.readFile(planFile, 'utf8')), { topic, niche, format, style, imageSource: effectiveImageSource, imageStyle: effectiveImageStyle, customStylePrompt: effectiveCustomStylePrompt })
      : await generateDirectorPlan({
          topic, niche, format, durationSec: targetDuration, style, speechRateWps, sourceData, productionProfile,
          imageSource: effectiveImageSource, imageStyle: effectiveImageStyle, customStylePrompt: effectiveCustomStylePrompt,
        });
    plan.imageSource = effectiveImageSource;
    plan.imageStyle = effectiveImageStyle;
    plan.customStylePrompt = effectiveCustomStylePrompt;
    plan.format = format;
    plan.durationBudget = plan.durationBudget || durationBudget;
    await save('plan.json', plan);
    if (plan.contentQuality) {
      await save('content-quality-diagnostics.json', plan.contentQuality);
      await save('claim-evidence-diagnostics.json', buildClaimEvidenceDiagnostics(plan));
    }
    await job.completeStage('plan', ['plan.json', ...(plan.contentQuality ? ['content-quality-diagnostics.json', 'claim-evidence-diagnostics.json'] : [])]);
    console.log(`   "${plan.title}" · style ${plan.style} · ${plan.scenes.length} scenes · ${plan.script.split(/\s+/).length} words`);
  }

  if (publishMode === 'PRODUCTION_RENDER' && plan.contentQuality?.valid === false) {
    plan = await repairIncompleteNarration(plan, null);
    plan = await repairUnverifiedClaims(plan);
    plan = normalizePlan(plan, { topic: topic || plan.topic, niche: niche || plan.niche, format, style: style || plan.style });
    await save('plan.json', plan);
    await save('content-quality-diagnostics.json', plan.contentQuality);
    await save('claim-evidence-diagnostics.json', buildClaimEvidenceDiagnostics(plan));
    await job.checkpoints.refreshArtifactChecksums('plan', ['plan.json', 'content-quality-diagnostics.json', 'claim-evidence-diagnostics.json']);
  }
  const strictQuality = String(process.env.STRICT_CONTENT_QUALITY || 'false').toLowerCase() === 'true';
  if (publishMode === 'PRODUCTION_RENDER' && plan.contentQuality?.valid === false) {
    if (strictQuality) {
      throw new Error(`Narration quality gate failed — see ${path.join(runDir, 'content-quality-diagnostics.json')}`);
    } else {
      console.warn(`⚠️  Narration quality gate has ${plan.contentQuality.issues?.length || 0} issue(s) — proceeding with diagnostics saved to content-quality-diagnostics.json`);
    }
  }

  // 2. Narration & 3. Alignment with duration check and repair loop
  let narrationFile = path.join(runPublic, 'narration.wav');
  let narration;
  let narrationNorm = null;
  let compressionPasses = plan.compressionPasses || 0;
  let expansionPasses = plan.expansionPasses || 0;
  let synthesisSpeed = narrationProfile.speed;

  if ((canReuse('audio') || noTts) && canReuse('alignment')) {
    console.log(`   ✓ [Reused] narration.wav & words.json (no audio regeneration)`);
    narration = JSON.parse(await fs.readFile(path.join(runDir, 'words.json'), 'utf8'));
    if (!narration.durationInSeconds && narration.duration) narration.durationInSeconds = narration.duration;
    if (!narration.totalFrames && narration.durationInSeconds) narration.totalFrames = Math.ceil(narration.durationInSeconds * fps);
  } else {
    for (let attempt = 0; attempt < 4; attempt++) {
      await job.startStage('audio');
      throwIfCancelled();
      onProgress({ step: 2, message: audioFile ? 'Using supplied narration audio...' : `Generating voiceover with Kokoro TTS${attempt > 0 ? ' (duration-adjusted re-synthesis)' : ''}...` });
      if (audioFile) {
        narrationFile = path.join(runPublic, `narration${path.extname(audioFile) || '.wav'}`);
        await fs.copyFile(audioFile, narrationFile);
      } else if (tts === 'say') {
        narrationFile = path.join(runPublic, 'narration.wav');
        await synthesizeWithSay(plan.script, narrationFile);
      } else {
        narrationFile = path.join(runPublic, 'narration.wav');
        if (narrationProfile.meditation) {
          console.log(`🧘 Synthesizing deterministic meditation narration with structured pauses...`);
          const medResult = await generateMeditationSpeech({
            scenes: plan.scenes,
            script: plan.script,
            outputFile: narrationFile,
            voice,
            speed: synthesisSpeed,
            subprofile: narrationProfile.subprofile || 'guided',
            signal,
          });
          if (Array.isArray(medResult.segments) && Array.isArray(plan.scenes)) {
            for (let sIdx = 0; sIdx < plan.scenes.length && sIdx < medResult.segments.length; sIdx++) {
              plan.scenes[sIdx].pauseAfterSec = Number((medResult.segments[sIdx].pauseAfterMs / 1000).toFixed(2));
            }
          }
        } else {
          const ttsText = (plan.scenes || []).map((s) => s.narration?.trim()).filter(Boolean).join('\n\n') || plan.script;
          await generateSpeech({ text: ttsText, outputFile: narrationFile, voice, speed: synthesisSpeed, format, signal });
        }
      }

      // Milestone 9 Narration Normalization & Peak Limiting
      try {
        narrationNorm = await normalizeNarrationWav(narrationFile, { targetLufs: narrationProfile.targetLufs, maxPeakDb: narrationProfile.maxPeakDb });
      } catch (normErr) {
        console.warn(`   ⚠️ Narration normalization warning: ${normErr.message}`);
      }

      await job.completeStage('audio', [path.relative(runDir, narrationFile).split(path.sep).join('/')]);

      // 3. Word timing (script aligned to what was actually said).
      await job.startStage('alignment');
      throwIfCancelled();
      onProgress({ step: 3, message: 'Aligning script to narration...' });
      narration = await analyzeNarration(narrationFile, plan.script, fps, { signal });
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

      if (actualSec < durationBudget.allowedMinDuration && attempt < 3 && !audioFile) {
        console.log(`\n⚠️ Actual narration (${actualSec.toFixed(1)}s) is below target minimum (${durationBudget.allowedMinDuration.toFixed(1)}s).`);
        if (attempt === 0) {
          const currentWords = plan.script.split(/\s+/).filter(Boolean).length;
          const measuredWps = currentWords / Math.max(1, actualSec);
          const targetWords = Math.max(currentWords + 10, Math.round(durationBudget.targetNarrationSec * measuredWps));
          const scriptBeforeExpansion = plan.script;
          plan = await expandPlanScript(plan, targetWords, Math.round(targetWords * 0.96));
          if (plan.script !== scriptBeforeExpansion) {
            expansionPasses++;
            plan.expansionPasses = expansionPasses;
            await save('plan.json', plan);
            continue;
          }
        }
        if (tts === 'say') {
          console.warn('   The development TTS engine cannot adjust speed automatically; duration QC will block the shortfall.');
          break;
        }
        // Slow guided meditation legitimately needs a much calmer cadence.
        // The measured-duration formula is still bounded to keep speech clear.
        const minimumSpeed = narrationProfile.minimumRepairSpeed;
        const adjustedSpeed = calculateNarrationRepairSpeed({
          currentSpeed: synthesisSpeed,
          actualDurationSec: actualSec,
          budget: durationBudget,
          minimumSpeed,
        });
        if (Math.abs(adjustedSpeed - synthesisSpeed) >= 0.005) {
          synthesisSpeed = Number(adjustedSpeed.toFixed(3));
          console.log(`   Adjusting narration speed to ${synthesisSpeed} for measured duration accuracy.`);
          continue;
        }
        console.warn('   Script and voice-speed repair produced no material duration change; duration QC will block the shortfall.');
        break;
      }

      if (actualSec > allowedMax && attempt < 3 && !audioFile) {
        console.log(`\n⚠️ Actual narration (${actualSec.toFixed(1)}s) exceeds target max (${allowedMax.toFixed(1)}s).`);
        console.log(`   Initiating post-TTS script compression and re-synthesis...`);
        const currentWords = plan.script.split(/\s+/).filter(Boolean).length;
        const scriptBeforeCompression = plan.script;
        const { targetWords: newTargetWords, maxWords: newMaxWords } = calculateNarrationCompressionLimits({
          currentWords,
          actualDurationSec: actualSec,
          budget: durationBudget,
        });
        plan = await compressPlanScript(plan, newTargetWords, newMaxWords);
        const repairedWords = plan.script.split(/\s+/).filter(Boolean).length;
        if (plan.script !== scriptBeforeCompression && repairedWords < currentWords) {
          compressionPasses++;
          await save('plan.json', plan);
          continue;
        }

        // Complete-sentence preservation can make extractive compression a
        // no-op. Avoid repeating the same cached TTS request; use a small,
        // bounded cadence correction instead.
        const adjustedSpeed = calculateOverlongNarrationRepairSpeed({
          currentSpeed: synthesisSpeed,
          actualDurationSec: actualSec,
          budget: durationBudget,
        });
        if (Math.abs(adjustedSpeed - synthesisSpeed) >= 0.005) {
          synthesisSpeed = adjustedSpeed;
          console.log(`   Script could not be shortened safely; adjusting narration speed to ${synthesisSpeed}.`);
          continue;
        }
        console.warn('   Script compression and bounded voice-speed repair produced no material change; duration QC will block the overrun.');
        break;
      }

      break;
    }
  }

  // Kokoro's measured duration is not perfectly linear at extreme speed
  // settings. If all authored repair passes miss the boundary only narrowly,
  // apply a transparent, bounded tempo correction rather than regenerating
  // the entire long-form narration or failing for a few seconds. Because the
  // transform is uniform, existing word timestamps can be scaled exactly.
  const tempoRepair = !audioFile ? calculateNarrationTempoRepair({
    actualDurationSec: narration?.durationInSeconds,
    budget: durationBudget,
  }) : null;
  if (tempoRepair) {
    const beforeDuration = Number(narration.durationInSeconds);
    const repairedFile = path.join(runPublic, `.narration-duration-repair-${process.pid}.wav`);
    try {
      console.log(`   ⏱️ Applying ${(tempoRepair.correctionRatio * 100).toFixed(2)}% narration tempo correction (${tempoRepair.reason}).`);
      await ffmpeg([
        '-y', '-i', narrationFile,
        '-filter:a', `atempo=${tempoRepair.tempo}`,
        '-c:a', 'pcm_s16le',
        repairedFile,
      ]);
      await fs.rename(repairedFile, narrationFile);
      const repairedDuration = await probeDuration(narrationFile);
      const timeScale = repairedDuration / beforeDuration;
      narration = {
        ...narration,
        source: `${narration.source || 'aligned'}+tempo_repair`,
        duration: repairedDuration,
        durationInSeconds: repairedDuration,
        totalFrames: Math.ceil(repairedDuration * fps),
        words: (narration.words || []).map((word) => ({
          ...word,
          start: Number((Number(word.start || 0) * timeScale).toFixed(4)),
          end: Number((Number(word.end || 0) * timeScale).toFixed(4)),
        })),
      };
      await save('words.json', {
        source: narration.source,
        matchRate: narration.matchRate,
        duration: narration.durationInSeconds,
        durationInSeconds: narration.durationInSeconds,
        totalFrames: narration.totalFrames,
        words: narration.words,
        transcript: narration.transcript,
      });
      await save('narration-duration-repair.json', {
        ...tempoRepair,
        beforeDurationSec: beforeDuration,
        actualDurationSec: repairedDuration,
        timestampScale: timeScale,
      });
      await job.checkpoints.refreshArtifactChecksums('audio', [path.relative(runDir, narrationFile).split(path.sep).join('/')]);
      await job.checkpoints.refreshArtifactChecksums('alignment', ['words.json']);
      console.log(`   ✓ Narration duration corrected: ${beforeDuration.toFixed(1)}s → ${repairedDuration.toFixed(1)}s.`);
    } catch (tempoError) {
      console.warn(`   ⚠️ Bounded narration tempo correction failed: ${tempoError.message}`);
    } finally {
      await fs.rm(repairedFile, { force: true }).catch(() => {});
    }
  }

  // Expansion/compression can change prose after the initial plan gate. Never
  // send incomplete sentences into storyboard, captions, or final rendering.
  plan = normalizePlan(plan, { topic: topic || plan.topic, niche: niche || plan.niche, format, style: style || plan.style });
  const consolidation = consolidatePlanForPacing(plan, narration.words, productionProfile.pacing);
  if (consolidation.merged.length) {
    console.log(`   ↔ Consolidated ${consolidation.merged.length} short scene boundary/boundaries for ${productionProfile.pacing.mode} pacing.`);
    plan = normalizePlan(consolidation.plan, { topic: topic || plan.topic, niche: niche || plan.niche, format, style: style || plan.style });
    plan.pacingConsolidation = consolidation.plan.pacingConsolidation;
  }
  plan.contentQuality = validateContentQuality({ scenes: plan.scenes, claims: plan.claims });
  plan.script = plan.scenes.map((sceneItem) => sceneItem.narration).join(' ');
  await save('plan.json', plan);
  await save('content-quality-diagnostics.json', plan.contentQuality);
  await save('claim-evidence-diagnostics.json', buildClaimEvidenceDiagnostics(plan));
  // Measured TTS duration can expand/compress the plan after the planning
  // checkpoint completed. Keep that checkpoint's checksums aligned with the
  // final script so timeline/render-only resumes reuse the corrected audio and
  // assets instead of restarting the entire job.
  await job.checkpoints.refreshArtifactChecksums('plan', [
    'plan.json', 'content-quality-diagnostics.json', 'claim-evidence-diagnostics.json',
  ]);
  if (publishMode === 'PRODUCTION_RENDER' && !plan.contentQuality.valid) {
    if (strictQuality) {
      throw new Error(`Narration quality gate failed after duration repair — see ${path.join(runDir, 'content-quality-diagnostics.json')}`);
    } else {
      console.warn(`⚠️  Narration quality gate has issue(s) after duration repair — proceeding with diagnostics.`);
    }
  }

  // Duration is already known from the measured narration. Do not spend time
  // or provider credits on storyboards and visual assets when the audio cannot
  // satisfy the production contract. Timeline QC remains a second line of
  // defence for frame quantization and later timeline changes.
  const measuredNarrationSec = Number(narration.durationInSeconds);
  const durationFrameTolerance = 1 / Math.max(1, fps);
  const narrationDurationValid = Number.isFinite(measuredNarrationSec)
    && measuredNarrationSec + durationFrameTolerance >= durationBudget.allowedMinDuration
    && measuredNarrationSec - durationFrameTolerance <= durationBudget.allowedMaxDuration;
  if (publishMode === 'PRODUCTION_RENDER' && !narrationDurationValid) {
    const error = new Error(
      `Narration duration repair failed: measured ${measuredNarrationSec.toFixed(1)}s; `
      + `required ${durationBudget.allowedMinDuration.toFixed(1)}-${durationBudget.allowedMaxDuration.toFixed(1)}s`,
    );
    error.code = 'NARRATION_DURATION_FAILED';
    throw error;
  }

  // Whisper and the visual transformer models are individually large. They
  // are used in separate phases, so release alignment memory before loading
  // semantic visual inspection models in the worker container.
  await releaseWhisper();
  if (global.gc) { try { global.gc(); } catch {} }

  // 4. Visual Storyboard & Visual Director.
  onProgress({ step: 4, message: 'Directing visuals and resolving imagery...' });
  throwIfCancelled();
  const ranges = sceneWordRanges(plan.scenes);
  const sceneSeconds = ranges.map(([a, b]) => Math.max(0.5, (narration.words[b]?.end || 0) - (narration.words[a]?.start || 0)));

  let resolvedVisualStrategy;
  if (canReuse('visualStrategy')) {
    resolvedVisualStrategy = JSON.parse(await fs.readFile(path.join(runDir, 'visual-strategy.json'), 'utf8'));
    console.log(`   ✓ [Reused] visual-strategy.json (${resolvedVisualStrategy.visualFlow || resolvedVisualStrategy.source || 'configured'})`);
  } else {
    await job.startStage('visualStrategy');
    resolvedVisualStrategy = selectVideoVisualStrategy({
      topic: topic || plan.title,
      plan,
      format,
      requestedStyle: style || plan.style,
      channelDefaults: { pacing: productionProfile.pacing },
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
    const reusedSceneCount = Array.isArray(storyboard.sections)
      ? storyboard.sections.reduce((count, section) => count + (section.scenes?.length || 0), 0)
      : (storyboard.scenes?.length || 0);
    console.log(`   ✓ [Reused] storyboard.json & visual-coverage-plan.json (${reusedSceneCount} scenes)`);
  } else {
    await job.startStage('storyboard');
    storyboard = buildStoryboard(plan, { format, sceneSeconds, videoId, visualStrategy: resolvedVisualStrategy, visualPolicy });
    await save('storyboard.json', storyboard, { schema: StoryboardSchema });
    const storyboardDiagnostics = buildStoryboardDiagnostics(storyboard);
    printStoryboardDiagnostics(storyboardDiagnostics);
    await save('storyboard-diagnostics.json', storyboardDiagnostics);
    visualCoveragePlan = buildVisualCoveragePlan(storyboard, { visualPolicy });
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
  let dirResult;

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

    const [sfxSources, bgmSource] = await Promise.all([
      ensureSoundEffects(),
      ensureBackgroundMusic({
        style: plan.style,
        contentType: productionProfile.contentType || plan.niche,
        topic: topic || plan.title,
        videoId,
        requestedTrack: requestedMusic,
      }),
    ]);
    sfx = Object.fromEntries(await Promise.all(Object.entries(sfxSources).map(async ([k, rel]) => [k, await copyIn(rel)])));
    bgm = { ...bgmSource, src: await copyIn(bgmSource.src) };
  } else {
    // Rebuild coverage at the asset boundary so resumed runs use the current
    // content-aware representation policy.
    visualCoveragePlan = buildVisualCoveragePlan(storyboard, { visualPolicy });
    await save('visual-coverage-plan.json', visualCoveragePlan, { schema: VisualCoveragePlanSchema });
    const rawSpecs = directScenes(storyboard, { format, rng: rngFrom(`${videoId}:visual`) });
    const evalCont = evaluateContinuity(rawSpecs, { format, style: plan.style });
    continuityReport = evalCont.continuityReport;
    specs = evalCont.refinedSpecs;
    await save('continuity.json', continuityReport);

    // 5. Asset Director: tiered search under each scene's acceptability policy
    await job.startStage('assets');
    throwIfCancelled();
    assetEditorialMode = resolveEditorialMode(productionProfile?.contentType, plan.niche);
    const assetRequests = planAssetRequests(storyboard, {
      format, visualPolicy, coveragePlan: visualCoveragePlan, editorialMode: assetEditorialMode,
      contentType: productionProfile?.contentType || 'explainer',
    });
    await save('asset-requests.json', assetRequests, { schema: AssetRequestListSchema });
    await save('visual-propositions.json', Object.fromEntries(assetRequests.map((request) => [request.storyboardShotId, request.visualProposition])));
    await save('representation-decisions.json', Object.fromEntries(assetRequests.map((request) => [request.storyboardShotId, request.representationDecision])));

    // Milestone Editorial Asset Intelligence: Visible Needs & Query Diagnostics
    const visibleNeeds = Object.fromEntries(assetRequests.map((r) => [r.storyboardShotId, r.visibleNeed || null]));
    await save('visible-needs.json', visibleNeeds);
    const queryDiagnostics = buildAssetQueryDiagnostics(assetRequests);
    await save('asset-query-diagnostics.json', queryDiagnostics);

    const isAiWorkflow = (plan?.imageSource === 'ai' || executionPlan?.imageSource === 'ai' || effectiveImageSource === 'ai');
    const visualOverrides = normalizedBrief?.visualOverrides || brief?.visualOverrides || {};
    const manualResult = await materializeManualImageOverrides({
      overrides: visualOverrides, assetRequests, publicDir: runPublic, mediaBankDir: config.mediaBankDir,
    });
    const generatedRequests = assetRequests.filter((request) => !manualResult.shotIds.has(request.storyboardShotId));
    if (isAiWorkflow) {
      dirResult = await directAiAssets(executionPlan, specs, {
        publicDir: runPublic,
        format,
        assetRequests: generatedRequests,
        imageStyle: plan.imageStyle || effectiveImageStyle,
        customStylePrompt: plan.customStylePrompt || effectiveCustomStylePrompt,
        imageProvider: plan.imageProvider || effectiveImageProvider,
        imageModel: plan.imageModel || effectiveImageModel,
        imageQuality: plan.imageQuality || effectiveImageQuality,
        generationAttempt,
        offline,
        publishMode,
      });
    } else {
      dirResult = await directAssets(executionPlan, specs, {
        publicDir: runPublic, format, assetRequests: generatedRequests, allowGenerated: false, offline, unresolvedMediaMode, publishMode, signal,
      });
    }
    for (const [sceneId, manualScene] of Object.entries(manualResult.assets)) {
      const sceneAssets = dirResult.assets[sceneId] ||= { primary: null, alternates: [], byShot: {} };
      sceneAssets.byShot = { ...sceneAssets.byShot, ...manualScene.byShot };
      if (!sceneAssets.primary) sceneAssets.primary = manualScene.primary;
      sceneAssets.alternates = [...sceneAssets.alternates, ...manualScene.alternates];
    }
    dirResult.editorialAssetJudgments = { ...dirResult.editorialAssetJudgments, ...manualResult.judgments };
    dirResult.report.requests = [...manualResult.reports, ...(dirResult.report.requests || [])];
    dirResult.report.totalRequests = assetRequests.length;
    dirResult.report.resolvedCount = dirResult.report.requests.filter((request) => request.status === 'resolved').length;
    dirResult.report.unresolvedCount = dirResult.report.requests.filter((request) => request.status !== 'resolved').length;
    assets = dirResult.assets;
    assetReport = dirResult.report;
    if (Object.keys(dirResult.mediaReuseFallbacks || {}).length) {
      await save('media-reuse-fallbacks.json', dirResult.mediaReuseFallbacks);
    }

    // Milestone Editorial Asset Intelligence & Production Hardening artifacts
    await save('visual-inspection.json', dirResult.visualInspections || {});
    await save('visual-inspections.json', dirResult.visualInspections || {});
    if (dirResult.imagePromptSpecs) await save('image-prompt-specs.json', dirResult.imagePromptSpecs);
    if (dirResult.imageCandidateEvaluations) await save('image-candidate-evaluations.json', dirResult.imageCandidateEvaluations);
    await save('editorial-asset-judgments.json', dirResult.editorialAssetJudgments || {});
    await save('editorial-usefulness.json', dirResult.editorialUsefulnessRecords || {});
    await save('format-fitness.json', dirResult.formatFitnessEvaluations || {});
    await save('video-window-selection.json', dirResult.videoWindowSelections || {});
    // Stable production-readiness artifact names. These are views over the same
    // runtime records, not synthetic reports reconstructed after rendering.
    await save('asset-shortlists.json', dirResult.requestReports || []);
    await save('pixel-inspections.json', dirResult.visualInspections || {});
    await save('semantic-judgments.json', dirResult.editorialAssetJudgments || {});
    await save('video-window-semantics.json', dirResult.videoWindowSelections || {});
    await save('query-performance.json', dirResult.queryQualityFeedback || {});

    if (publishMode === 'PRODUCTION_RENDER' && assetReport.unresolvedCount > 0) {
      const unresolvedRequests = (assetReport.requests || []).filter((request) => request.status !== 'resolved');
      const failure = {
        code: 'UNRESOLVED_PRODUCTION_MEDIA',
        message: 'One or more shots exhausted all approved image candidates.',
        generationAttempt,
        unresolvedCount: unresolvedRequests.length,
        unresolvedShots: unresolvedRequests.map((request) => ({
          shotId: request.shotId || request.storyboardShotId || null,
          sceneId: request.sceneId || null,
          source: request.source || null,
          candidateCount: request.candidateCount || 0,
          noUsableCandidate: Boolean(request.noUsableCandidate),
        })),
        generatedAt: new Date().toISOString(),
      };
      await save('asset-shortlists.json', dirResult.requestReports || []);
      await save('image-candidate-evaluations.json', dirResult.imageCandidateEvaluations || {});
      await save('asset-resolution-failure.json', failure);
      const error = new Error(`Production rendering requires every shot to have a usable, non-placeholder image (${assetReport.unresolvedCount} unresolved).`);
      error.code = 'UNRESOLVED_PRODUCTION_MEDIA';
      error.details = failure;
      throw error;
    }

    specs.forEach((spec, i) => recast(spec, executionPlan.scenes[i], assets[spec.sceneId], format, i > 0 ? specs[i - 1] : null));
    await save('direction.json', specs);
    await save('assets.json', { assets, scenes: assetReport, search: assetReport.search, diagnostics: assetReport.diagnostics });
    const selectedAssets = Object.values(assets).flatMap((sceneAssets) => Object.entries(sceneAssets.byShot || {}).map(([shotId, asset]) => ({ shotId, asset })));
    await save('provider-performance.json', assetReport.search || {});
    await save('license-verification.json', Object.fromEntries(selectedAssets.map(({ shotId, asset }) => [shotId, {
      assetId: asset?.id || asset?.assetId || null,
      provider: asset?.providerId || asset?.provider || null,
      license: asset?.license || null,
      accepted: Boolean(asset) && !asset.unresolved,
    }])));
    await save('final-selection-audit.json', (dirResult.requestReports || []).map((requestReport) => ({
      ...requestReport,
      visualProposition: assetRequests.find((request) => request.storyboardShotId === requestReport.storyboardShotId)?.visualProposition || null,
      representation: assetRequests.find((request) => request.storyboardShotId === requestReport.storyboardShotId)?.representationDecision || null,
      pixelInspection: dirResult.visualInspections?.[requestReport.storyboardShotId] || null,
      semanticJudgment: dirResult.editorialAssetJudgments?.[requestReport.storyboardShotId] || null,
      editorialUsefulness: dirResult.editorialUsefulnessRecords?.[requestReport.storyboardShotId] || null,
      formatFitness: dirResult.formatFitnessEvaluations?.[requestReport.storyboardShotId] || null,
      videoWindow: dirResult.videoWindowSelections?.[requestReport.storyboardShotId] || null,
    })));
    if (assetReport.diagnostics) {
      await save('asset-quality-diagnostics.json', assetReport.diagnostics);
    }
    const usedAssets = Object.values(assets).flatMap((a) => [a.primary, ...(a.alternates || [])]).filter(Boolean);
    await fs.writeFile(path.join(runDir, 'credits.txt'), formatCredits(executionPlan.title, usedAssets));
    const recasts = specs.flatMap((s) => s.recasts.map((r) => `${s.sceneId}: ${r}`));
    if (recasts.length) console.log(`   ↳ recast:\n     ${recasts.join('\n     ')}`);
    await calibrateSfxAssets(path.join(config.publicDir, 'audio', 'sfx')).catch(() => {});
    const [sfxSources, bgmSource] = await Promise.all([
      ensureSoundEffects(),
      ensureBackgroundMusic({
        style: plan.style,
        contentType: productionProfile.contentType || plan.niche,
        topic: topic || plan.title,
        videoId,
        requestedTrack: requestedMusic,
      }),
    ]);
    sfx = Object.fromEntries(await Promise.all(Object.entries(sfxSources).map(async ([k, rel]) => [k, await copyIn(rel)])));
    bgm = { ...bgmSource, src: await copyIn(bgmSource.src) };
    await job.completeStage('assets', [
      'asset-requests.json',
      'visible-needs.json',
      'asset-query-diagnostics.json',
      'visual-inspection.json',
      'visual-inspections.json',
      'editorial-asset-judgments.json',
      'editorial-usefulness.json',
      'format-fitness.json',
      'video-window-selection.json',
      'asset-shortlists.json',
      'pixel-inspections.json',
      'semantic-judgments.json',
      'video-window-semantics.json',
      'query-performance.json',
      'provider-performance.json',
      'license-verification.json',
      'final-selection-audit.json',
      ...(Object.keys(dirResult.mediaReuseFallbacks || {}).length ? ['media-reuse-fallbacks.json'] : []),
      'assets.json',
      'asset-quality-diagnostics.json',
      'direction.json',
      'continuity.json',
      'credits.txt',
    ]);
  }

  // 6. Timeline Director + Visual Critic & static QC.
  let timeline;
  let pacingDiagnostics;
  let durationDiagnostics;
  let audioDiagnostics;
  let visualCoverageDiagnostics;
  let realizationDiagnostics;
  let criticReview;
  let creativeQaResult;
  let editContinuityDiagnostics;
  let editorialVisualPlan;
  let editorialMediaQc = null;
  let compositionArtifacts = { sceneCompositions: {}, mediaSceneSpecs: {}, editorialVisualBeats: {}, mediaShotPlans: {}, solvedScenes: {}, motionPlans: {}, visualQualityReviews: {}, frameStatePreflight: {}, compositionFallbacks: [], mediaCompositionDiagnostics: {} };

  if (canReuse('timeline')) {
    console.log(`   ✓ [Reused] timeline.json`);
    timeline = JSON.parse(await fs.readFile(path.join(runDir, 'timeline.json'), 'utf8'));
    try {
      editorialVisualPlan = JSON.parse(await fs.readFile(path.join(runDir, 'editorial-visual-plan.json'), 'utf8'));
      compositionArtifacts = {
        sceneCompositions: JSON.parse(await fs.readFile(path.join(runDir, 'scene-compositions.json'), 'utf8')),
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
    throwIfCancelled();
    onProgress({ step: 5, message: 'Building the edit...' });
    editorialVisualPlan = buildEditorialVisualPlan({ storyboard, coveragePlan: visualCoveragePlan, specs, assets, format, visualPolicy });
    await save('editorial-visual-plan.json', editorialVisualPlan);
    productionProfile.imageSource = effectiveImageSource;
    timeline = buildTimeline({ plan: executionPlan, specs, narration, assets, sfx, bgm, videoId, format, fps, audioSrc: path.basename(narrationFile), coveragePlan: visualCoveragePlan, editorialVisualPlan, visualPolicy, productionProfile });
    timeline.imageSource = effectiveImageSource;
    const overrideResult = applyManualVisualOverrides(timeline, normalizedBrief?.visualOverrides || brief?.visualOverrides || {});
    timeline = overrideResult.timeline;
    if (overrideResult.applied.length || overrideResult.missing.length) await save('manual-visual-overrides.json', overrideResult);
    compositionArtifacts = timeline._compositionArtifacts || compositionArtifacts;
    await save('scene-compositions.json', compositionArtifacts.sceneCompositions);
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
    if (criticReview.sceneRepairs?.length) {
      timeline = applySceneRepairs(timeline, criticReview.sceneRepairs);
      criticReview = reviewVisualPlan(timeline, { plan: executionPlan, storyboard, continuityReport, assets });
    }
    await save('visual_critic.json', criticReview);
    pacingDiagnostics = buildPacingDiagnostics(timeline, executionPlan);
    durationDiagnostics = buildDurationDiagnostics({
      budget: durationBudget,
      plan: executionPlan,
      narration,
      timeline,
      compressionPasses,
      expansionPasses,
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
    // duration-budget.json starts as the immutable request budget, then gains
    // measured narration/timeline results here. Refresh the request-stage
    // checksum so a later `--from render` resume does not mistake this
    // intentional enrichment for a missing/corrupt upstream artifact.
    await job.checkpoints.refreshArtifactChecksums('request', ['duration-budget.json']);
    await save('audio-diagnostics.json', audioDiagnostics);
    await save('visual-coverage-diagnostics.json', visualCoverageDiagnostics);


    // Milestone Whole-Video Visual Sequence Review & Editorial Media QC
    let judgments = dirResult?.editorialAssetJudgments;
    if (!judgments) {
      try {
        judgments = JSON.parse(await fs.readFile(path.join(runDir, 'editorial-asset-judgments.json'), 'utf8'));
      } catch {
        judgments = {};
      }
    }
    const allRealizedShots = timeline.realizedShots || timeline.scenes?.flatMap((s) => s.shots || []) || [];
    assetEditorialMode = assetEditorialMode || resolveEditorialMode(productionProfile?.contentType, plan?.niche);
    const visualSequenceReview = evaluateVisualSequence({
      shots: allRealizedShots,
      storyboard,
      editorialJudgments: judgments,
      editorialMode: assetEditorialMode,
      format,
    });
    await save('visual-sequence-review.json', visualSequenceReview);

    editorialMediaQc = {
      version: 1,
      format,
      editorialMode: assetEditorialMode,
      sequenceVerdict: visualSequenceReview.verdict,
      sequenceMetrics: visualSequenceReview.metrics,
      sequenceWarnings: visualSequenceReview.warnings,
      shotQualityReviews: compositionArtifacts.visualQualityReviews || {},
      summary: visualSequenceReview.summary,
    };
    await save('editorial-media-qc.json', editorialMediaQc);
    await save('editorial-production-qc.json', editorialMediaQc);

    await job.completeStage('timeline', [
      'timeline.json',
      'visual-realization-diagnostics.json',
      'visual-design-diagnostics.json',
      'pacing-diagnostics.json',
      'duration-budget.json',
      'audio-diagnostics.json',
      'visual-coverage-diagnostics.json',
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
      'visual-sequence-review.json',
      'editorial-media-qc.json',
      'editorial-production-qc.json',
    ]);
  }

  let videoPackage;
  if (canReuse('package')) {
    console.log(`   ✓ [Reused] packaging.json`);
    videoPackage = JSON.parse(await fs.readFile(path.join(runDir, 'packaging.json'), 'utf8'));
  } else {
    await job.startStage('package');
    videoPackage = generateVideoPackage(executionPlan, timeline, { format, metadata: normalizedBrief?.metadata || {} });
    await save('packaging.json', videoPackage);
    await fs.writeFile(path.join(runDir, 'package.md'), `# ${videoPackage.title}\n\n${videoPackage.description}`);
    await job.completeStage('package', ['packaging.json', 'package.md']);
  }

  await job.startStage('preRenderQa');
  throwIfCancelled();
  const staticQc = runTimelineQc(timeline, { plan: executionPlan, narration, assetReport, realizationDiagnostics, pacingDiagnostics, durationDiagnostics, audioDiagnostics, visualCoverageDiagnostics, editContinuityDiagnostics, publishMode });
  await save('qc.json', staticQc);
  printQc('Timeline QC', staticQc);
  if (!staticQc.ok) throw new Error(`Timeline QC failed — see ${path.join(runDir, 'qc.json')}`);

  if (publishMode === 'PRODUCTION_RENDER' && criticReview?.status === 'major_revision') {
    throw new Error(`Production render blocked by visual critic (${criticReview.score}/10, major revision). See visual_critic.json`);
  }
  if (publishMode === 'PRODUCTION_RENDER' && criticReview?.issues?.some((issue) => issue.type === 'single_shot_hold')) {
    throw new Error(`Production render blocked by unresolved long visual holds. See visual_critic.json`);
  }

  // Creative QA Production Acceptance Gate: Hard failures or FAILED shots must block production render
  if (creativeQaResult?.creativeQaAfter?.qualitySummary?.hardFailureCount > 0 || creativeQaResult?.creativeQaAfter?.qualitySummary?.failedCount > 0) {
    throw new Error(`Creative QA hard failure blocking render: ${creativeQaResult.creativeQaAfter.qualitySummary.hardFailureCount} hard failure(s), ${creativeQaResult.creativeQaAfter.qualitySummary.failedCount} failed shot(s). See creative-qa-after.json`);
  }

  // Production Publishability Gate (Section 86 & 87)
  if (publishMode === 'PRODUCTION_RENDER') {
    let qcReport = editorialMediaQc;
    if (!qcReport) {
      try {
        qcReport = JSON.parse(await fs.readFile(path.join(runDir, 'editorial-production-qc.json'), 'utf8'));
      } catch {}
    }
    const verdict = qcReport?.sequenceVerdict;
    if (verdict === 'FAILED' || verdict === 'WEAK') {
      throw new Error(`Production render blocked by publishability gate: Sequence verdict is ${verdict}. Must be ACCEPTABLE or STRONG.`);
    }
    const hardWarnings = (qcReport?.sequenceWarnings || []).filter((w) => w.severity === 'error');
    if (hardWarnings.length > 0) {
      throw new Error(`Production render blocked: Hard editorial asset failures (${hardWarnings.map((w) => w.code).join(', ')}).`);
    }
    // Role labels alone are not a publishability failure. A documentary may
    // legitimately use many distinct establishing shots while moving through
    // places and periods. The sequence verdict, semantic information gain,
    // asset usefulness, and explicit error-severity warnings are authoritative.
  }

  let preflightContactSheet = null;
  let preRepairContactSheet = null;
  let renderedSemanticQa = null;
  if (render || contactSheetOnly) {
    onProgress({ step: 5, message: 'Rendering contact sheet preview...' });
    if (creativeQaResult?.repairsApplied?.length > 0) {
      preRepairContactSheet = await renderContactSheet(runDir, { timeline, outputFilename: 'contact-pre-repair.png', ats: [0.5] }).catch(() => null);
    }
    preflightContactSheet = await renderContactSheet(runDir, { timeline, outputFilename: 'contact-post-repair.png', ats: [0.18, 0.5, 0.82] }).catch(() => null);
    if (preflightContactSheet) {
      await fs.mkdir(path.join(runDir, 'preview'), { recursive: true });
      await fs.copyFile(preflightContactSheet, path.join(runDir, 'preview', 'contact.png')).catch(() => {});
    }
    await generateContactSheetDiagnostics(runDir, {
      timeline,
      editorialAssetJudgments: dirResult?.editorialAssetJudgments,
      editorialUsefulnessRecords: dirResult?.editorialUsefulnessRecords,
      requestReports: dirResult?.requestReports,
    }).catch(() => {});
    renderedSemanticQa = await verifyRenderedContactFrames(runDir, {
      timeline,
      production: publishMode === 'PRODUCTION_RENDER',
    });
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
  await save('pre-render-semantic-review.json', {
    version: 1,
    publishMode,
    renderedPixelReview: renderedSemanticQa,
    editorialProductionQc: editorialMediaQc || null,
    timelineQc: staticQc,
    passed: Boolean(renderedSemanticQa?.passed ?? !(render || contactSheetOnly))
      && !(staticQc?.checks || []).some((check) => check.severity === 'error' && !check.ok),
  });
  await job.completeStage('preRenderQa', [
    'qc-pre.json',
    'pre-render-semantic-review.json',
    'visual_critic.json',
    ...(preflightRelative ? [preflightRelative] : []),
    ...(preRepairRelative ? [preRepairRelative] : []),
    ...(preflightRelative ? ['preview/rendered-semantic-qa.json'] : []),
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
  throwIfCancelled();
  if (global.gc) { try { global.gc(); } catch {} }
  const renderStartedAt = Date.now();
  onProgress({ step: 6, message: 'Bundling compositions...' });
  const serveUrl = await getRunBundle(runDir);
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
  const temporaryOutputPath = `${outputPath}.partial-${process.pid}-${Date.now()}.mp4`;
  let lastPct = -1;
  const renderCancellation = makeCancelSignal();
  const cancelRender = () => renderCancellation.cancel();
  signal?.addEventListener('abort', cancelRender, { once: true });
  const chromiumOptions = {
    args: [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      ...(process.env.REMOTION_DISABLE_CHROMIUM_SANDBOX === 'true' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
    ],
  };
  const reportRenderProgress = (progress) => {
    const pct = Math.round(progress * 100);
    if (pct !== lastPct && pct % 10 === 0) console.log(`   rendering ${pct}%`);
    lastPct = pct;
    onProgress({ step: 6, message: `Rendering video: ${pct}%`, progress: pct });
  };
  const renderOptions = {
    composition,
    serveUrl,
    codec: 'h264',
    crf: 17,
    imageFormat: 'jpeg',
    jpegQuality: 94,
    colorSpace: 'bt709',
    audioBitrate: '192k',
    inputProps,
    scale: renderScale,
    concurrency: Number(process.env.REMOTION_CONCURRENCY || 1),
    cancelSignal: renderCancellation.cancelSignal,
    delayRenderTimeoutInMilliseconds: 240_000,
    timeoutInMilliseconds: 240_000,
    chromiumOptions,
  };
  try {
  if (shouldUseSegmentedRender({ totalFrames: timeline.durationInFrames, fps, frameRange })) {
    console.log(`   Rendering long-form video in resumable ${Number(process.env.REMOTION_SEGMENT_SECONDS || 60)}s segments`);
    await renderMediaSegmented({
      renderMediaFn: renderMedia,
      renderOptions,
      runDir,
      totalFrames: timeline.durationInFrames,
      fps,
      renderIdentity: {
        timeline,
        compositionId: composition.id,
        renderScale,
        codec: 'h264',
        crf: 17,
      },
      temporaryOutputPath,
      onOverallProgress: reportRenderProgress,
    });
  } else {
    await renderMedia({
      ...renderOptions,
      outputLocation: temporaryOutputPath,
      ...(frameRange ? { frameRange } : {}),
      onProgress: ({ progress: p }) => reportRenderProgress(p),
    });
  }
  // Publish only a complete encoder output. A crash or cancellation can leave
  // the .partial file, but clients can never mistake it for the final MP4.
  await fs.rename(temporaryOutputPath, outputPath);
  } finally {
    signal?.removeEventListener('abort', cancelRender);
    await fs.rm(temporaryOutputPath, { force: true }).catch(() => {});
  }
  throwIfCancelled();
  await job.completeStage('render', [path.relative(runDir, outputPath).split(path.sep).join('/')]);
  timeline.performance = { ...(timeline.performance || {}), renderOverheadMs: Date.now() - renderStartedAt };
  await save('media-editorial-performance.json', timeline.performance);

  // 8. Render upload-ready Thumbnail PNG (only if full render)
  if (!scene && !range) {
    try {
      const videoDuration = Math.max(1, Number(result.durationSeconds || timeline.durationInFrames / timeline.fps || 10));
      const storyMomentRatios = [0.08, 0.34, 0.78];
      const heroFramePaths = [];
      const heroImages = [];
      for (let index = 0; index < Math.min(3, videoPackage.thumbnails.length); index++) {
        const heroFramePath = path.join(runDir, `thumbnail-hero-${index + 1}.jpg`);
        const timeSec = Math.min(Math.max(0.5, videoDuration * storyMomentRatios[index]), Math.max(0.5, videoDuration - 0.25));
        await ffmpeg(['-ss', timeSec.toFixed(3), '-i', outputPath, '-frames:v', '1', '-q:v', '2', '-y', heroFramePath]);
        heroFramePaths.push(heroFramePath);
        heroImages.push(`data:image/jpeg;base64,${(await fs.readFile(heroFramePath)).toString('base64')}`);
      }
      const thumbnailPackage = {
        ...videoPackage,
        thumbnails: videoPackage.thumbnails.map((concept, index) => ({
          ...concept,
          heroImage: heroImages[Math.min(index, heroImages.length - 1)],
          storyMoment: ['hook', 'tension', 'payoff'][index] || 'supporting',
        })),
      };
      const thumbnailPath = path.join(runDir, 'thumbnail.png');
      for (let conceptIndex = 0; conceptIndex < Math.min(3, thumbnailPackage.thumbnails.length); conceptIndex++) {
        const inputProps = { packageData: thumbnailPackage, conceptIndex };
        const thumbComp = await selectComposition({ serveUrl, id: 'YouTubeThumbnail', inputProps });
        await renderStill({
          composition: thumbComp, serveUrl,
          output: conceptIndex === 0 ? thumbnailPath : path.join(runDir, `thumbnail-${conceptIndex + 1}.png`),
          inputProps, imageFormat: 'png', delayRenderTimeoutInMilliseconds: 120_000, chromiumOptions,
        });
      }
      await Promise.all(heroFramePaths.map((heroFramePath) => fs.rm(heroFramePath, { force: true }).catch(() => {})));
      result.thumbnail = thumbnailPath;
      console.log(`   🖼️  Three thumbnail variants generated from distinct hook, tension, and payoff frames: ${thumbnailPath}`);
    } catch (e) {
      console.warn(`Thumbnail generation failed: ${e.message}`);
      result.thumbnailError = String(e.message || e).slice(0, 500);
    }
  }

  // 9. Visual QA & Rendered Visual Critic on the actual file.
  await job.startStage('postRenderQa');
  onProgress({ step: 7, message: 'Checking the render...' });
  const renderQc = await runRenderQc(outputPath, timeline);
  printQc('Visual QA', renderQc);
  result.qc.render = renderQc;
  if (!renderQc.ok) {
    await save('qc.json', result.qc);
    throw new Error(`Post-render QC failed — see ${path.join(runDir, 'qc.json')}`);
  }

  try {
    const renderedCritic = await reviewRenderedFrames(outputPath, timeline, runDir);
    result.qc.renderedCritic = renderedCritic;
    console.log(`   📸 Rendered keyframes extracted to: ${renderedCritic.contactSheet || 'scene_frames/'}`);
  } catch (e) {
    // Graceful fallback
  }

  await save('qc.json', result.qc);
  const outputStat = await fs.stat(outputPath);
  const outputSha256 = await sha256File(outputPath);
  const persistentCreditsPath = path.join(config.rendersDir, `${videoId}.credits.txt`);
  await fs.copyFile(path.join(runDir, 'credits.txt'), persistentCreditsPath);
  const deliveryManifest = {
    version: 1,
    videoId,
    title: executionPlan.title,
    createdAt: new Date().toISOString(),
    file: { name: outputFilename, bytes: outputStat.size, sha256: outputSha256, codec: 'h264', colorSpace: 'bt709', audioBitrate: '192k' },
    durationSeconds: timeline.durationInFrames / timeline.fps,
    format: { width: timeline.width, height: timeline.height, fps: timeline.fps },
    artifacts: { credits: `${videoId}.credits.txt`, qualityReport: `runs/${videoId}/qc.json` },
    quality: { passed: result.qc.render?.ok === true, checks: result.qc.render?.checks || [] },
  };
  const deliveryManifestPath = path.join(config.rendersDir, `${videoId}.delivery.json`);
  await fs.writeFile(deliveryManifestPath, JSON.stringify(deliveryManifest, null, 2));
  result.delivery = { manifestPath: deliveryManifestPath, creditsPath: persistentCreditsPath, sha256: outputSha256, bytes: outputStat.size };
  await job.completeStage('postRenderQa', ['qc.json', ...(result.qc.renderedCritic?.contactSheet ? [result.qc.renderedCritic.contactSheet] : [])]);
  await job.finish();

  console.log(`\n🎉 ${outputPath} (completed in ${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
  if (global.gc) { try { global.gc(); } catch {} }
  return { ...result, outputPath, outputFilename };
  } catch (error) {
    await job.fail(error);
    throw error;
  }
}
