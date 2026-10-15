import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ffmpeg } from '../services/ffmpeg.js';
import { materialiseImage, materialiseVideo, mapLimit, hamming, searchStats, resetSearchStats } from '../services/freeMediaService.js';
import { recordImageInBank, searchImageBank } from '../services/imageBank.js';
import { licenseAllowed } from '../shared/licensing.js';
import { contrastiveRelevance, relevanceEnabled } from '../services/relevance.js';
import { defaultAssetProviders, searchAssetProviderStage } from '../assets/providerRegistry.js';
import { analyzeAssetRequest } from '../assets/assetSearchContext.js';
import { compareCandidateScores, scoreAssetCandidate } from '../assets/assetIntelligenceScorer.js';
import { VideoAssetMemory } from '../assets/videoAssetMemory.js';
import { inspectVisualCandidate } from '../assets/visualInspectionService.js';
import { judgeAssetCandidate } from '../assets/visualEditorialJudge.js';
import { selectVideoWindow } from '../assets/videoWindowSelector.js';

async function computeFileSha256(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch {
    return 'none';
  }
}

async function evaluateAndJudgeCandidate(item, request, format, visualInspections, editorialAssetJudgments, formatFitnessEvaluations, editorialUsefulnessRecords = {}, filePath = null, requirePixelInspection = false) {
  if (item.editorialJudgment && item.inspectedFilePath === filePath) return item.editorialJudgment;
  const visibleNeed = request.visibleNeed;
  const inspection = await inspectVisualCandidate(item.candidate, { filePath });
  item.visualInspection = inspection;
  if (filePath && item.candidate.type !== 'video' && !item.contrastive) {
    item.contrastive = await contrastiveRelevance(
      filePath,
      request.visualProposition?.positiveDescriptions || [request.concept],
      request.visualProposition?.negativeConfusers || request.exclusions || [],
    );
  }
  visualInspections[item.candidate.id] = inspection;
  const judgment = judgeAssetCandidate({
    candidate: item.candidate,
    inspection,
    visibleNeed,
    targetFormat: format,
    retrievalScore: item.score,
    editorialMode: visibleNeed?.editorialMode,
  });
  if (filePath && item.candidate.type === 'video') {
    item.videoWindowSelection = await selectVideoWindow({
      videoPath: filePath,
      requiredDurationSec: request.constraints?.durationHint || 3.5,
      visibleNeed,
      videoMetadata: item.candidate,
    });
    const semanticMargin = item.videoWindowSelection.semanticEvidence?.margin;
    if (requirePixelInspection && (!item.videoWindowSelection.semanticEvidence?.available || semanticMargin <= 0)) {
      judgment.accepted = false;
      judgment.rejected = true;
      judgment.finalEditorialScore = 0;
      judgment.rejectReasons = [...new Set([...(judgment.rejectReasons || []), 'video_window_semantic_evidence_failed'])];
    }
  }
  if (requirePixelInspection && (!inspection.pixelInspected || !inspection.semanticPixelInspected)) {
    judgment.accepted = false;
    judgment.rejected = true;
    judgment.finalEditorialScore = 0;
    judgment.rejectReasons = [...new Set([...(judgment.rejectReasons || []), 'semantic_pixel_inspection_required'])];
    judgment.selectionReason = 'Rejected: production selection requires a semantic vision result from materialized pixels';
  }
  const directRequired = request.visualProposition?.literalness === 'DIRECT' || request.evidenceRequired;
  if (directRequired && judgment.classification !== 'DIRECT') {
    judgment.accepted = false;
    judgment.rejected = true;
    judgment.finalEditorialScore = 0;
    judgment.rejectReasons = [...new Set([...(judgment.rejectReasons || []), 'direct_representation_required'])];
    judgment.selectionReason = `Rejected: ${judgment.classification} is insufficient for a DIRECT/evidence-required shot`;
  }
  if (directRequired && item.contrastive?.available && item.contrastive.margin <= 0) {
    judgment.accepted = false;
    judgment.rejected = true;
    judgment.finalEditorialScore = 0;
    judgment.rejectReasons = [...new Set([...(judgment.rejectReasons || []), 'contrastive_semantic_margin_not_positive'])];
    judgment.selectionReason = 'Rejected: visible pixels match a known confuser at least as strongly as the intended proposition';
  }
  const recordKey = `${request.storyboardShotId}:${item.candidate.id}`;
  editorialAssetJudgments[recordKey] = judgment;
  if (judgment.formatFitness) {
    formatFitnessEvaluations[recordKey] = judgment.formatFitness;
  }
  if (judgment.editorialUsefulness) {
    editorialUsefulnessRecords[recordKey] = {
      assetId: item.candidate.id || item.candidate.sourceUrl || 'candidate',
      assetHash: item.candidate.sha256ContentHash || item.hash || 'unhashed',
      shotId: request.storyboardShotId,
      matchClass: judgment.classification,
      viewerGain: judgment.editorialUsefulness.viewerGain,
      communicationValue: judgment.editorialUsefulness.communicationValue,
      specificity: judgment.editorialUsefulness.specificity,
      genericness: judgment.editorialUsefulness.genericness,
      distractionRisk: judgment.editorialUsefulness.distractionRisk,
      ambiguityRisk: judgment.editorialUsefulness.ambiguityRisk,
      usefulnessVerdict: judgment.editorialUsefulness.verdict,
      reasons: judgment.editorialUsefulness.reasons,
    };
  }
  if (judgment.rejected || !judgment.accepted) {
    item.score.resolutionStatus = 'unusable';
    item.score.qualityRank = 0;
    item.score.gates.push(...judgment.rejectReasons);
  } else {
    item.editorialJudgment = judgment;
    item.inspectedFilePath = filePath;
    if (judgment.finalEditorialScore > 0) {
      item.score.finalScore = judgment.finalEditorialScore;
    }
  }
  return judgment;
}

const acceptable = (item) => item.score.qualityRank >= 2 && item.score.resolutionStatus !== 'unusable';

async function gather(request, providers) {
  const context = analyzeAssetRequest(request);
  if (request.preferredSource === 'procedural') {
    return { request, context, candidates: [], providerCalls: [], resolutionStatus: 'procedural' };
  }
  if (request.preferredSource === 'generated') {
    return { request, context, candidates: [], providerCalls: [], resolutionStatus: 'unresolved', failureReason: 'generated_provider_disabled' };
  }

  const candidates = [];
  const providerCalls = [];
  const seen = new Set();
  for (const stage of context.queryLadder) {
    const result = await searchAssetProviderStage(request, context, stage, providers);
    providerCalls.push(...result.calls);
    for (const candidate of result.candidates) {
      const key = `${candidate.providerId}:${candidate.sourceUrl || candidate.localPath || candidate.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }
    const scored = candidates
      .filter((candidate) => licenseAllowed(candidate.license).ok)
      .map((candidate) => ({ candidate, score: scoreAssetCandidate(candidate, request, context) }));
    const threshold = context.specificity >= 0.65 ? 3 : 2;
    if (hasReliableSearchResult(scored, threshold)) break;
  }
  return { request, context, candidates, providerCalls };
}

export function hasReliableSearchResult(scored, threshold) {
  const strong = scored.filter((item) => item.score.qualityRank >= threshold && !item.score.gates.length);
  if (!strong.length) return false;
  // Brave indexes third-party thumbnails whose origin commonly rejects direct
  // downloads. Do not stop the query ladder on Brave metadata alone.
  return strong.some((item) => item.candidate.providerId !== 'brave-image')
    || new Set(strong.map((item) => item.candidate.providerId)).size > 1;
}

function scoredCandidates(pool, memory, usedIdentities) {
  return pool.candidates.map((candidate) => {
    const verdict = licenseAllowed(candidate.license);
    const score = scoreAssetCandidate(candidate, pool.request, pool.context, memory);
    const identity = candidate.sourceUrl || candidate.localPath || candidate.id;
    if (!verdict.ok) {
      score.resolutionStatus = 'unusable';
      score.qualityRank = 0;
      score.gates.push(`license: ${verdict.why}`);
    }
    if (usedIdentities.has(identity)) {
      score.resolutionStatus = 'unusable';
      score.qualityRank = 0;
      score.gates.push('exact_asset_reuse');
    }
    return { candidate, score };
  }).sort(compareCandidateScores);
}

/**
 * Keep quality ordering while ensuring a broken host cannot consume the whole
 * materialization budget. Search metadata can look excellent even when every
 * URL returned by one provider is hotlink-blocked or not an image.
 */
export function buildMaterializationQueue(ranked, maxAttempts = 16) {
  const viable = ranked.filter(acceptable);
  const queue = viable.slice(0, 4);
  const represented = new Set(queue.map((item) => item.candidate.providerId));

  for (const item of viable) {
    if (queue.length >= maxAttempts) break;
    if (!represented.has(item.candidate.providerId)) {
      queue.push(item);
      represented.add(item.candidate.providerId);
    }
  }
  for (const item of viable) {
    if (queue.length >= maxAttempts) break;
    if (!queue.includes(item)) queue.push(item);
  }
  return queue;
}

async function materializeCandidate(item, request, dir, publicDir, sequence, usedHashes) {
  const candidate = item.candidate;
  const ext = candidate.type === 'video' ? 'mp4' : 'jpg';
  const suffix = sequence < 26 ? String.fromCharCode(97 + sequence) : `cand_${sequence}`;
  const file = path.join(dir, `${request.storyboardShotId}_${suffix}.${ext}`);

  if (candidate.isDeliberateReuse && candidate.localPath) {
    try {
      await fs.copyFile(candidate.localPath, file);
      const sha256ContentHash = await computeFileSha256(file);
      return {
        file,
        hash: candidate.hash || sha256ContentHash,
        sha256ContentHash,
        clipSimilarity: 0.85,
        asset: {
          width: candidate.width || 1920,
          height: candidate.height || 1080,
          sha256ContentHash,
          src: path.relative(publicDir, file).split(path.sep).join('/'),
          source: candidate.providerId || 'local-bank',
          tier: 'verified',
          generic: false,
          label: candidate.label || null,
          license: candidate.license || null,
          relevance: 0.85,
          assetRequestId: request.id,
          storyboardShotId: request.storyboardShotId,
          providerCandidateId: candidate.id,
          sourceUrl: candidate.sourceUrl || candidate.url || candidate.license?.page || null,
          query: candidate.query || null,
          queryStage: candidate.queryStage || null,
        },
      };
    } catch {
      // fall through to materialise
    }
  }

  const sourceCandidate = { ...candidate, url: candidate.sourceUrl, duration: candidate.durationSeconds, source: candidate.providerId,
    minimumShortSide: request.assetIntent === 'data' ? 540 : undefined };
  try {
    const info = candidate.type === 'video'
      ? await materialiseVideo(sourceCandidate, file)
      : await materialiseImage(sourceCandidate, file);
    const { minWidth, minHeight } = materializedMinimums(request, info);
    // The composition preflight permits at most ~28% source upscaling. Apply
    // the same boundary to the real downloaded file because search indexes
    // often advertise dimensions larger than the retrievable thumbnail.
    const belowStandard = (minWidth && info.width < minWidth * .72) || (minHeight && info.height < minHeight * .72);
    const usableFallback = (info.width >= minWidth * .45 && info.height >= minHeight * .45 && Math.min(info.width, info.height) >= 360)
      || (request.assetIntent === 'data' && info.width >= minWidth * .45 && info.height >= minHeight * .5);
    if (belowStandard && !usableFallback) {
      await fs.rm(file, { force: true });
      return { rejected: `materialized_resolution_below_minimum:${info.width}x${info.height}` };
    }
    if (info.hash && usedHashes.some((hash) => hamming(hash, info.hash) <= 10)) {
      await fs.rm(file, { force: true });
      return { rejected: 'visual_duplicate' };
    }
    if (candidate.type === 'video' && info.duration < Math.min(request.constraints?.durationHint || 3, 3)) {
      await fs.rm(file, { force: true });
      return { rejected: 'clip_too_short' };
    }
    const contrastive = candidate.type === 'image' && relevanceEnabled()
      ? await contrastiveRelevance(
        file,
        request.visualProposition?.positiveDescriptions || [request.concept],
        request.visualProposition?.negativeConfusers || request.exclusions || [],
      )
      : { available: false, positiveScore: null, negativeScore: null, margin: null };
    const clipSimilarity = contrastive.positiveScore;
    const { hash, ...media } = info;
    const sha256ContentHash = await computeFileSha256(file);
    return {
      file,
      hash,
      sha256ContentHash,
      clipSimilarity,
      contrastive,
      asset: {
        ...media,
        sha256ContentHash,
        src: path.relative(publicDir, file).split(path.sep).join('/'),
        source: candidate.providerId,
        tier: belowStandard ? 'fallback' : candidate.tier,
        generic: candidate.generic,
        label: candidate.label || null,
        license: candidate.license || null,
        relevance: clipSimilarity,
        assetRequestId: request.id,
        storyboardShotId: request.storyboardShotId,
        providerCandidateId: candidate.id,
        sourceUrl: candidate.sourceUrl || candidate.url || candidate.license?.page || null,
        query: candidate.query || null,
        queryStage: candidate.queryStage || null,
      },
    };
  } catch (error) {
    return { rejected: error.message };
  }
}

export function materializedMinimums(request, media) {
  let minWidth = request.constraints?.minWidth || 0;
  const minHeight = request.constraints?.minHeight || 0;
  // Portrait sources in a landscape edit are intentionally placed in the
  // half-width layered treatment, so they do not need full-canvas width.
  if (request.constraints?.orientation === 'landscape' && media.height > media.width * 1.15) minWidth *= .5;
  return { minWidth, minHeight };
}

function buildAssetQualityDiagnostics({ assetRequests, requestReports, pools, memory }) {
  let excellent = 0;
  let good = 0;
  let acceptableCount = 0;
  let weak = 0;
  let unresolved = 0;

  let totalSemantic = 0;
  let totalPresentation = 0;
  let resolvedCount = 0;

  let subjectMismatchCount = 0;
  let entityMismatchCount = 0;
  let portraitFalseMatchCount = 0;
  let logoFalseMatchCount = 0;
  let buildingFalseMatchCount = 0;
  let clichePenaltyCount = 0;

  const queryStageUsage = { EXACT: 0, SPECIFIC_VARIANT: 0, ENTITY_SUBJECT: 0, CONCEPTUAL_FALLBACK: 0 };
  const mediaDistribution = { image: 0, video: 0, procedural: 0 };
  const providerDistribution = {};
  const providerCandidateCounts = {};
  let providerCalls = 0;

  for (const pool of pools) {
    for (const call of pool.providerCalls || []) {
      providerCalls++;
      providerCandidateCounts[call.providerId] = (providerCandidateCounts[call.providerId] || 0) + call.candidateCount;
    }
  }

  for (const report of requestReports) {
    const status = report.resolutionStatus;
    if (status === 'excellent') excellent++;
    else if (status === 'good') good++;
    else if (status === 'acceptable') acceptableCount++;
    else if (status === 'media_reuse') acceptableCount++;
    else if (status === 'weak') weak++;
    else unresolved++;

    if (report.selectedCandidate) {
      const sel = report.selectedCandidate;
      resolvedCount++;
      totalSemantic += sel.scores?.semantic?.overall || 0;
      totalPresentation += sel.scores?.presentation?.overall || 0;
      if (sel.queryStage && queryStageUsage[sel.queryStage] !== undefined) {
        queryStageUsage[sel.queryStage]++;
      }
      mediaDistribution[sel.mediaType] = (mediaDistribution[sel.mediaType] || 0) + 1;
      providerDistribution[sel.provider] = (providerDistribution[sel.provider] || 0) + 1;
    } else if (report.resolutionStatus === 'procedural') {
      mediaDistribution.procedural++;
    }

    for (const rej of report.rejectedTopCandidates || []) {
      const gates = rej.gates || [];
      if (gates.includes('subject_mismatch')) subjectMismatchCount++;
      if (gates.includes('entity_mismatch')) entityMismatchCount++;
      if (gates.includes('portrait_false_match')) portraitFalseMatchCount++;
      if (gates.includes('logo_false_match')) logoFalseMatchCount++;
      if (gates.includes('building_false_match')) buildingFalseMatchCount++;
      if (rej.penalties?.cliche > 0) clichePenaltyCount++;
    }
  }

  let exactReuseCount = 0;
  let conceptReuseCount = 0;
  for (const sel of memory.selections || []) {
    if (sel.usageCount > 1) exactReuseCount++;
  }
  for (const count of memory.concepts.values()) {
    if (count > 1) conceptReuseCount += (count - 1);
  }

  return {
    requestsTotal: assetRequests.length,
    excellent,
    good,
    acceptable: acceptableCount,
    weak,
    unresolved,
    providerCalls,
    providerCandidateCounts,
    queryStageUsage,
    averageSemanticScores: resolvedCount ? Number((totalSemantic / resolvedCount).toFixed(3)) : 0,
    averagePresentationScores: resolvedCount ? Number((totalPresentation / resolvedCount).toFixed(3)) : 0,
    subjectMismatchCount,
    entityMismatchCount,
    portraitFalseMatchCount,
    logoFalseMatchCount,
    buildingFalseMatchCount,
    clichePenaltyCount,
    exactReuseCount,
    conceptReuseCount,
    mediaDistribution,
    providerDistribution,
  };
}

/** Reuse approved media instead of introducing a procedural composition. */
export function applyMediaOnlyReuseFallbacks({ assets, requestReports, assetRequests, sceneIds = [], format = 'landscape' }) {
  const sceneIndex = new Map(sceneIds.map((id, index) => [id, index]));
  const requestByShot = new Map(assetRequests.map((request) => [request.storyboardShotId, request]));
  const approved = [];

  for (const [sceneId, sceneAssets] of Object.entries(assets)) {
    for (const [shotId, asset] of Object.entries(sceneAssets.byShot || {})) {
      if (asset && !asset.unresolved && ['image', 'video'].includes(asset.type)) {
        approved.push({ sceneId, shotId, asset, index: sceneIndex.get(sceneId) ?? Number.MAX_SAFE_INTEGER });
      }
    }
  }
  if (!approved.length) return {};

  const fallbacks = {};
  for (const report of requestReports) {
    if (!['unresolved', 'weak'].includes(report.resolutionStatus)) continue;
    const request = requestByShot.get(report.storyboardShotId);
    const target = assets[report.sceneId];
    if (!request || !target) continue;
    const targetIndex = sceneIndex.get(report.sceneId) ?? Number.MAX_SAFE_INTEGER;
    const evaluatedSources = approved.map((source) => {
      const judgment = judgeAssetCandidate({
        candidate: {
          ...source.asset,
          isDeliberateReuse: true,
          id: source.asset.id || source.asset.providerCandidateId || source.asset.src,
          label: source.asset.label || source.asset.visibleMeaning || '',
          description: source.asset.visualInspection?.sceneSummary || '',
        },
        inspection: source.asset.visualInspection || {},
        visibleNeed: request.visibleNeed,
        targetFormat: format,
        retrievalScore: { finalScore: source.asset.finalEditorialScore || 0.5 },
        editorialMode: request.visibleNeed?.editorialMode,
      });
      const directRequired = request.visualProposition?.literalness === 'DIRECT' || request.evidenceRequired;
      const valid = judgment.accepted
        && !judgment.rejected
        && !['WRONG', 'ACCIDENTAL'].includes(judgment.classification)
        && (!directRequired || judgment.classification === 'DIRECT');
      return { source, judgment, valid };
    }).filter((item) => item.valid)
      .sort((a, b) => (b.judgment.finalEditorialScore || 0) - (a.judgment.finalEditorialScore || 0)
        || Math.abs(a.source.index - targetIndex) - Math.abs(b.source.index - targetIndex));
    const evaluated = evaluatedSources[0];
    if (!evaluated) continue;
    const { source, judgment } = evaluated;

    const reuseReason = `No new approved media was available; reused nearest approved ${source.asset.type} from ${source.sceneId}.`;
    const reusedAsset = {
      ...source.asset,
      isDeliberateReuse: true,
      storyboardShotId: report.storyboardShotId,
      deliberateReuseReason: reuseReason,
      reusedFromShotId: source.shotId,
      visibleNeed: request.visibleNeed || null,
      editorialJudgment: { ...judgment, selectionReason: reuseReason },
      assetIdentityChain: source.asset.assetIdentityChain ? {
        ...source.asset.assetIdentityChain,
        solvedSceneAssetId: `${report.sceneId}:${report.storyboardShotId}`,
        timelineAssetId: report.storyboardShotId,
      } : undefined,
    };
    target.byShot[report.storyboardShotId] = reusedAsset;
    if (!target.primary) target.primary = reusedAsset;
    else if (!target.alternates.some((asset) => asset?.src === reusedAsset.src)) target.alternates.push(reusedAsset);

    report.resolutionStatus = 'media_reuse';
    report.editorialRetryReason = 'approved_media_reuse';
    report.selectedCandidate = {
      provider: reusedAsset.providerId || reusedAsset.provider || reusedAsset.source || 'approved-reuse',
      sourceId: reusedAsset.id || reusedAsset.assetId || reusedAsset.src,
      candidateId: `reuse:${source.shotId}`,
      query: request.concept,
      queryStage: 'APPROVED_MEDIA_REUSE',
      label: reusedAsset.label,
      mediaType: reusedAsset.type,
      scores: { semantic: { overall: 0.5 }, presentation: { overall: 0.8 } },
      selectionReasons: [reuseReason],
    };
    report.fallbackAuditTraces = [...(report.fallbackAuditTraces || []), {
      fallbackType: 'approved_media_reuse',
      whyTriggered: 'All new media candidates failed production gates',
      candidateBefore: report.rejectedTopCandidates?.[0]?.candidateId || null,
      candidateAfter: source.asset.id || source.asset.src,
      representationAfter: 'media',
    }];
    fallbacks[report.storyboardShotId] = { fromShotId: source.shotId, assetSrc: reusedAsset.src, reason: reuseReason };
  }
  return fallbacks;
}

/** Resolve shot requests through staged providers, semantic gates, and video-level memory. */
export async function directAssets(plan, specs, {
  publicDir,
  format,
  assetRequests,
  providers = defaultAssetProviders,
  allowGenerated = false,
  unresolvedMediaMode = 'FAIL_PRODUCTION_RENDER',
  publishMode = 'PRODUCTION_RENDER',
  offline = false,
}) {
  if (allowGenerated) throw new Error('Generated media providers are disabled for V1');
  if (!assetRequests?.length) throw new Error('directAssets requires canonical-shot AssetRequest objects');
  resetSearchStats();
  const dir = path.join(publicDir, 'assets');
  await fs.mkdir(dir, { recursive: true });
  const activeProviders = offline
    ? providers.filter((provider) => ['local-bank', 'local-assets'].includes(provider.id))
    : providers;
  const pools = await mapLimit(assetRequests, 3, (request) => gather(request, activeProviders));
  const memory = new VideoAssetMemory();
  const usedIdentities = new Set();
  const usedHashes = [];
  const assets = Object.fromEntries(plan.scenes.map((scene) => [scene.id, { primary: null, alternates: [], byShot: {} }]));
  const requestReports = [];
  const editorialAssetJudgments = {};
  const editorialUsefulnessRecords = {};
  const queryQualityFeedback = [];
  const visualInspections = {};
  const videoWindowSelections = {};
  const formatFitnessEvaluations = {};
  const representationFallbacks = {};

  for (const pool of pools) {
    const { request, context } = pool;
    if (pool.resolutionStatus === 'procedural') {
      requestReports.push({
        requestId: request.id,
        storyboardShotId: request.storyboardShotId,
        sceneId: request.sceneId,
        concept: request.concept,
        requestClass: context.requestClass,
        specificity: context.specificity,
        requestQualityWarnings: context.requestQualityWarnings,
        resolutionStatus: 'procedural',
        providerCalls: [],
        selectedCandidate: null,
        rejectedTopCandidates: [],
      });
      continue;
    }
    const fallbackAuditTraces = [];
    const ranked = scoredCandidates(pool, memory, usedIdentities);

    // Search metadata ranks the download shortlist only. It is not semantic proof.
    const viable = buildMaterializationQueue(ranked);
    const materialized = [];
    const materializationRejects = [];
    for (let index = 0; index < viable.length; index++) {
      const item = viable[index];
      const result = await materializeCandidate(item, request, dir, publicDir, index, usedHashes);
      if (result.asset) {
        const judgment = await evaluateAndJudgeCandidate(item, request, format, visualInspections, editorialAssetJudgments, formatFitnessEvaluations, editorialUsefulnessRecords, result.file, publishMode === 'PRODUCTION_RENDER');
        if (judgment.accepted && !judgment.rejected) materialized.push({ ...item, ...result });
        else {
          await fs.rm(result.file, { force: true });
          materializationRejects.push({ candidateId: item.candidate.id, reason: judgment.rejectReasons.join('; ') });
        }
      } else materializationRejects.push({ candidateId: item.candidate.id, reason: result.rejected });
      if (materialized.length >= 4) break;
    }

    if (!materialized.length) {
      const emergencyCandidates = ranked.filter((item) => !viable.includes(item) && item.score.qualityRank >= 1);
      for (let index = 0; index < emergencyCandidates.length; index++) {
        const item = emergencyCandidates[index];
        const result = await materializeCandidate(item, request, dir, publicDir, viable.length + index, usedHashes);
        if (result.asset) {
          const judgment = await evaluateAndJudgeCandidate(item, request, format, visualInspections, editorialAssetJudgments, formatFitnessEvaluations, editorialUsefulnessRecords, result.file, publishMode === 'PRODUCTION_RENDER');
          if (judgment.rejected || !judgment.accepted) {
            await fs.rm(result.file, { force: true });
            materializationRejects.push({ candidateId: item.candidate.id, reason: judgment.rejectReasons.join('; ') });
            continue;
          }
          fallbackAuditTraces.push({
            fallbackType: 'emergency_candidate',
            whyTriggered: 'Top viable candidates failed materialization',
            candidateBefore: viable[0]?.candidate?.id || null,
            candidateAfter: item.candidate.id,
            semanticClassBefore: viable[0]?.editorialJudgment?.classification || null,
            semanticClassAfter: judgment.classification,
          });
          materialized.push({ ...item, ...result });
          break;
        } else {
          materializationRejects.push({ candidateId: item.candidate.id, reason: result.rejected });
        }
      }
    }

    if (!materialized.length) {
      const fallbackQuery = context.targetSubject.join(' ') || request.concept;
      const bankResults = await searchImageBank(fallbackQuery, { limit: 3 });
      for (let index = 0; index < bankResults.length; index++) {
        const candidate = {
          ...bankResults[index],
          providerId: 'local-bank',
          tier: 'fallback',
          query: fallbackQuery,
          queryStage: 'CONCEPTUAL_FALLBACK',
        };
        const score = scoreAssetCandidate(candidate, request, context, memory);
        const item = { candidate, score };
        const result = await materializeCandidate(item, request, dir, publicDir, viable.length + index + 10, usedHashes);
        if (result.asset) {
          const judgment = await evaluateAndJudgeCandidate(item, request, format, visualInspections, editorialAssetJudgments, formatFitnessEvaluations, editorialUsefulnessRecords, result.file, publishMode === 'PRODUCTION_RENDER');
          if (judgment.rejected || !judgment.accepted) {
            await fs.rm(result.file, { force: true });
            materializationRejects.push({ candidateId: candidate.id, reason: judgment.rejectReasons.join('; ') });
            continue;
          }
          result.asset.tier = 'fallback';
          fallbackAuditTraces.push({
            fallbackType: 'local_bank',
            whyTriggered: 'Search candidates failed Gate 2 or materialization',
            candidateBefore: ranked[0]?.candidate?.id || null,
            candidateAfter: candidate.id,
            semanticClassBefore: ranked[0]?.editorialJudgment?.classification || null,
            semanticClassAfter: judgment.classification,
          });
          materialized.push({ ...item, ...result });
          break;
        }
      }
    }

    // Step 6 of Unresolved Media Repair Ladder: Deliberate asset reuse with detail crop
    if (!materialized.length && memory.selections?.length > 0) {
      let matchingPrevious = memory.selections.find((sel) => {
        const isSameEntity = context.primaryEntity && sel.concept?.toLowerCase().includes(context.primaryEntity.toLowerCase());
        const isSameConcept = sel.concept?.toLowerCase() === request.concept?.toLowerCase();
        return (isSameEntity || isSameConcept) && sel.usageCount < 2;
      });
      if (!matchingPrevious) {
        matchingPrevious = memory.selections.find((sel) => sel.usageCount < 2 && sel.candidate && !sel.candidate.unresolved);
      }
      if (matchingPrevious && matchingPrevious.candidate) {
        const reusedCandidate = {
          ...matchingPrevious.candidate,
          isDeliberateReuse: true,
          deliberateReuseReason: `Continuing narrative continuity: reusing verified visual for "${request.concept}" with detail crop`,
        };
        const score = scoreAssetCandidate(reusedCandidate, request, context, memory);
        const item = { candidate: reusedCandidate, score };
        const result = await materializeCandidate(item, request, dir, publicDir, 99, usedHashes);
        if (result.asset) {
          const judgment = await evaluateAndJudgeCandidate(item, request, format, visualInspections, editorialAssetJudgments, formatFitnessEvaluations, editorialUsefulnessRecords, result.file, publishMode === 'PRODUCTION_RENDER');
          if (judgment.classification !== 'ACCIDENTAL' && judgment.classification !== 'WRONG' && judgment.accepted && editorialUsefulnessRecords[`${request.storyboardShotId}:${reusedCandidate.id}`]?.distractionRisk < 0.60) {
            result.asset.deliberateReuseReason = reusedCandidate.deliberateReuseReason;
            fallbackAuditTraces.push({
              fallbackType: 'deliberate_reuse',
              whyTriggered: 'Search candidates exhausted or unapproved',
              candidateBefore: ranked[0]?.candidate?.id || null,
              candidateAfter: reusedCandidate.id,
              semanticClassBefore: ranked[0]?.editorialJudgment?.classification || null,
              semanticClassAfter: judgment.classification,
            });
            materialized.push({ ...item, ...result });
          } else {
            await fs.rm(result.file, { force: true });
          }
        }
      }
    }

    // CLIP is a secondary tiebreaker only; metadata quality and semantic gates remain first.
    materialized.sort((a, b) => compareCandidateScores(a, b, request.constraints?.orientation)
      || (b.clipSimilarity ?? -1) - (a.clipSimilarity ?? -1));

    // Enforce Gate 2: only select candidates that passed Gate 2!
    const validApproved = materialized.filter((item) => item.editorialJudgment && item.editorialJudgment.accepted && !item.editorialJudgment.rejected);
    let selected = validApproved[0] || null;

    // Step 6 of Unresolved Media Repair Ladder: Deliberate asset reuse if search candidates were unapproved
    if (!selected && memory.selections?.length > 0) {
      let matchingPrevious = memory.selections.find((sel) => {
        const isSameEntity = context.primaryEntity && sel.concept?.toLowerCase().includes(context.primaryEntity.toLowerCase());
        const isSameConcept = sel.concept?.toLowerCase() === request.concept?.toLowerCase();
        return (isSameEntity || isSameConcept) && sel.usageCount < 2;
      });
      if (!matchingPrevious) {
        matchingPrevious = memory.selections.find((sel) => sel.usageCount < 2 && sel.candidate && !sel.candidate.unresolved);
      }
      if (matchingPrevious && matchingPrevious.candidate) {
        const prevAsset = assets[matchingPrevious.lastUsedScene]?.byShot[matchingPrevious.lastUsedShot] || assets[matchingPrevious.lastUsedScene]?.primary;
        const prevLocalPath = prevAsset?.src ? path.join(publicDir, prevAsset.src) : (matchingPrevious.candidate.localPath || matchingPrevious.candidate.file);
        const reusedCandidate = {
          ...matchingPrevious.candidate,
          localPath: prevLocalPath,
          isDeliberateReuse: true,
          deliberateReuseReason: `Continuing narrative continuity: reusing verified visual for "${request.concept}" with detail crop`,
        };
        const score = scoreAssetCandidate(reusedCandidate, request, context, memory);
        const item = { candidate: reusedCandidate, score };
        const result = await materializeCandidate(item, request, dir, publicDir, 99, usedHashes);
        if (result.asset) {
          const judgment = await evaluateAndJudgeCandidate(item, request, format, visualInspections, editorialAssetJudgments, formatFitnessEvaluations, editorialUsefulnessRecords, result.file, publishMode === 'PRODUCTION_RENDER');
          if (judgment.classification !== 'ACCIDENTAL' && judgment.classification !== 'WRONG' && judgment.accepted && editorialUsefulnessRecords[`${request.storyboardShotId}:${reusedCandidate.id}`]?.distractionRisk < 0.60) {
            result.asset.deliberateReuseReason = reusedCandidate.deliberateReuseReason;
            fallbackAuditTraces.push({
              fallbackType: 'deliberate_reuse',
              whyTriggered: 'Search candidates unapproved or failed Gate 2',
              candidateBefore: ranked[0]?.candidate?.id || null,
              candidateAfter: reusedCandidate.id,
              semanticClassBefore: ranked[0]?.editorialJudgment?.classification || null,
              semanticClassAfter: judgment.classification,
            });
            selected = { ...item, ...result };
          } else {
            await fs.rm(result.file, { force: true });
          }
        }
      }
    }

    for (const loser of materialized.filter((item) => item !== selected)) await fs.rm(loser.file, { force: true });

    if (selected) {
      const ext = selected.candidate.type === 'video' ? 'mp4' : 'jpg';
      const canonicalFile = path.join(dir, `${request.storyboardShotId}_a.${ext}`);
      if (selected.file !== canonicalFile) {
        try {
          await fs.rename(selected.file, canonicalFile);
          selected.file = canonicalFile;
          selected.asset.src = path.relative(publicDir, canonicalFile).split(path.sep).join('/');
        } catch {}
      }

      const finalSha256 = await computeFileSha256(selected.file);
      selected.sha256ContentHash = finalSha256;
      selected.asset.sha256ContentHash = finalSha256;
      selected.asset.assetIdentityChain = {
        candidateId: selected.candidate.id || selected.candidate.sourceUrl || selected.candidate.localPath || 'candidate',
        materializedAssetId: path.basename(selected.file),
        solvedSceneAssetId: `${request.sceneId}:${request.storyboardShotId}`,
        timelineAssetId: request.storyboardShotId,
        rendererAssetId: selected.asset.src,
        sha256ContentHash: finalSha256,
      };

      // Attach selection explainability & editorial judgment (Requirement 16 & 59)
      if (selected.editorialJudgment) {
        selected.asset.editorialJudgment = selected.editorialJudgment;
        selected.asset.selectionReason = selected.editorialJudgment.selectionReason;
        selected.asset.visibleMeaning = selected.editorialJudgment.visibleMeaning;
        selected.asset.whyItMatchesNarration = selected.editorialJudgment.whyItMatchesNarration;
        selected.asset.finalEditorialScore = selected.editorialJudgment.finalEditorialScore;
      }
      selected.asset.visualInspection = selected.visualInspection || null;
      selected.asset.contrastiveRelevance = selected.contrastive || null;
      if (request.visibleNeed) {
        selected.asset.visibleNeed = request.visibleNeed;
      }

      // Video window trim selection
      if (selected.candidate.type === 'video') {
        const windowResult = selected.videoWindowSelection || await selectVideoWindow({
          videoPath: selected.file,
          requiredDurationSec: request.constraints?.durationHint || 3.5,
          visibleNeed: request.visibleNeed,
          videoMetadata: selected.asset,
        });
        videoWindowSelections[request.storyboardShotId] = windowResult;
        selected.asset.videoTrim = {
          startTime: windowResult.selectedStartTime,
          endTime: windowResult.selectedEndTime,
          score: windowResult.windowScore,
          reason: windowResult.selectionReason,
        };
      }

      const identity = selected.candidate.sourceUrl || selected.candidate.localPath || selected.candidate.id;
      usedIdentities.add(identity);
      if (selected.hash) usedHashes.push(selected.hash);
      memory.remember(selected.candidate, request, context, request.storyboardShotId, request.sceneId, selected.hash);
      const sceneAssets = assets[request.sceneId];
      sceneAssets.byShot[request.storyboardShotId] = selected.asset;
      if (!sceneAssets.primary) sceneAssets.primary = selected.asset;
      else sceneAssets.alternates.push(selected.asset);
      if (selected.asset.type === 'image') {
        recordImageInBank({
          filePath: path.join(publicDir, selected.asset.src),
          description: selected.visualInspection?.sceneSummary || '',
          query: selected.candidate.query || request.concept,
          source: selected.asset.source,
          label: selected.asset.label || '',
          license: selected.asset.license,
          width: selected.asset.width || 1920,
          height: selected.asset.height || 1080,
          inspection: selected.visualInspection,
        }).catch(() => {});
      }
    } else if (publishMode !== 'PRODUCTION_RENDER' && unresolvedMediaMode === 'ALLOW_DEV_PLACEHOLDER') {
      // Step 8: Unresolved media placeholder & audit tracking
      // Let publishability quality gates (timelineQc.js / mediaVisualQualityGate.js) enforce production policy
      const unresolvedFile = path.join(dir, `${request.storyboardShotId}_unresolved.jpg`);
      try {
        await ffmpeg(['-y', '-f', 'lavfi', '-i', `color=c=0x111827:s=${request.constraints?.minWidth || 1920}x${request.constraints?.minHeight || 1080}`, '-frames:v', '1', unresolvedFile]);
      } catch {
        const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        await fs.writeFile(unresolvedFile, png1x1).catch(() => {});
      }
      const unresolvedSha256 = await computeFileSha256(unresolvedFile);
      const unresolvedAsset = {
        type: 'image',
        src: path.relative(publicDir, unresolvedFile).split(path.sep).join('/'),
        width: request.constraints?.minWidth || 1920,
        height: request.constraints?.minHeight || 1080,
        source: 'unresolved',
        tier: 'unresolved',
        unresolved: true,
        generic: false,
        label: `[UNRESOLVED_MEDIA] ${request.concept || request.storyboardShotId}`,
        license: { name: 'Unresolved Media Placeholder', nonFree: false },
        selectionReason: 'Unresolved media placeholder created under development mode',
        visibleMeaning: 'Unresolved placeholder',
        whyItMatchesNarration: 'Placeholder awaiting asset resolution',
        sha256ContentHash: unresolvedSha256,
        assetIdentityChain: {
          candidateId: 'UNRESOLVED_MEDIA',
          materializedAssetId: path.basename(unresolvedFile),
          solvedSceneAssetId: `${request.sceneId}:${request.storyboardShotId}`,
          timelineAssetId: request.storyboardShotId,
          rendererAssetId: path.relative(publicDir, unresolvedFile).split(path.sep).join('/'),
          sha256ContentHash: unresolvedSha256,
        },
      };
      const sceneAssets = assets[request.sceneId];
      sceneAssets.byShot[request.storyboardShotId] = unresolvedAsset;
      if (!sceneAssets.primary) sceneAssets.primary = unresolvedAsset;
    }

    if (!selected && publishMode === 'PRODUCTION_RENDER') {
      const proceduralFallback = (request.representationDecision?.fallbackRepresentations || [])
        .find((representation) => !['media', 'image', 'video'].includes(representation));
      if (proceduralFallback) {
        representationFallbacks[request.storyboardShotId] = {
          from: request.representationDecision?.selectedRepresentation || 'media',
          to: proceduralFallback,
          reason: 'No licensed, pixel-inspected media candidate passed production semantic gates.',
        };
        fallbackAuditTraces.push({
          fallbackType: 'representation_escalation',
          whyTriggered: 'Media candidate set exhausted after materialization and semantic inspection',
          candidateBefore: ranked[0]?.candidate?.id || null,
          candidateAfter: null,
          representationAfter: proceduralFallback,
        });
      }
    }
    const top = ranked[0];
    const resolutionStatus = selected?.score.resolutionStatus
      || (representationFallbacks[request.storyboardShotId] ? 'procedural_fallback' : (top?.score.qualityRank === 1 ? 'weak' : 'unresolved'));

    // Query Quality Feedback & Yield Tracking (Sections 32, 33)
    const poolJudgments = pool.candidates.map((c) => editorialAssetJudgments[`${request.storyboardShotId}:${c.id}`]).filter(Boolean);
    const candidateCount = pool.candidates.length;
    const semanticValidCount = poolJudgments.filter((j) => j.accepted && j.classification !== 'ACCIDENTAL' && j.classification !== 'WRONG').length;
    const editoriallyUsefulCount = poolJudgments.filter((j) => j.editorialUsefulness && j.editorialUsefulness.verdict !== 'WEAK' && j.editorialUsefulness.verdict !== 'DISTRACTING').length;
    const queryEditorialYield = Number((editoriallyUsefulCount / Math.max(1, candidateCount)).toFixed(2));

    let editorialRetryReason = null;
    if (ranked[0] && (ranked[0].editorialJudgment?.rejected || !ranked[0].editorialJudgment?.accepted)) {
      const rej = ranked[0].editorialJudgment?.rejectReasons || [];
      if (rej.some((r) => r.includes('specificity'))) editorialRetryReason = 'low_specificity';
      else if (rej.some((r) => r.includes('distraction'))) editorialRetryReason = 'high_distraction';
      else if (rej.some((r) => r.includes('generic'))) editorialRetryReason = 'generic_stock';
      else if (rej.some((r) => r.includes('foreign_entity') || r.includes('brand'))) editorialRetryReason = 'unrelated_brand';
      else if (rej.some((r) => r.includes('unrelated_visible_text'))) editorialRetryReason = 'unrelated_visible_text';
      else if (rej.some((r) => r.includes('metaphor'))) editorialRetryReason = 'metaphor_for_direct_role';
      else if (rej.some((r) => r.includes('weak_search_hit') || r.includes('viewerGain'))) editorialRetryReason = 'weak_viewer_gain';
      else editorialRetryReason = 'low_communication_value';
    }

    const queryFeedbackItem = {
      shotId: request.storyboardShotId,
      query: request.concept,
      candidateCount,
      semanticValidCount,
      editoriallyUsefulCount,
      selectedCount: selected ? 1 : 0,
      queryEditorialYield,
      editorialRetryReason,
    };
    queryQualityFeedback.push(queryFeedbackItem);

    requestReports.push({
      requestId: request.id,
      storyboardShotId: request.storyboardShotId,
      sceneId: request.sceneId,
      concept: request.concept,
      requestClass: context.requestClass,
      specificity: context.specificity,
      searchContext: {
        primaryEntity: context.primaryEntity,
        targetSubject: context.targetSubject,
        modifiers: context.modifiers,
        aliases: context.aliases,
        excludedSubjects: context.excludedSubjects,
      },
      queryLadder: context.queryLadder,
      requestQualityWarnings: context.requestQualityWarnings,
      resolutionStatus,
      queryEditorialYield,
      editorialRetryReason,
      providerCalls: pool.providerCalls,
      selectedCandidate: selected ? {
        provider: selected.candidate.providerId,
        sourceId: selected.candidate.providerAssetId || selected.candidate.id,
        candidateId: selected.candidate.id,
        query: selected.candidate.query,
        queryStage: selected.candidate.queryStage,
        label: selected.candidate.label,
        mediaType: selected.candidate.type,
        scores: selected.score,
        clipSimilarity: selected.clipSimilarity,
        selectionReasons: selected.score.selectionReasons,
      } : null,
      rejectedTopCandidates: ranked.filter((item) => !selected || item.candidate.id !== selected.candidate.id).slice(0, 5).map((item) => ({
        candidateId: item.candidate.id,
        provider: item.candidate.providerId,
        label: item.candidate.label,
        query: item.candidate.query,
        queryStage: item.candidate.queryStage,
        resolutionStatus: item.score.resolutionStatus,
        semantic: item.score.semantic,
        gates: item.score.gates,
        penalties: item.score.penalties,
      })),
      materializationRejects,
      fallbackAuditTraces,
    });
  }

  const mediaReuseFallbacks = publishMode === 'PRODUCTION_RENDER'
    ? applyMediaOnlyReuseFallbacks({
      assets,
      requestReports,
      assetRequests,
      sceneIds: plan.scenes.map((scene) => scene.id),
      format,
    })
    : {};

  const diagnostics = buildAssetQualityDiagnostics({ assetRequests, requestReports, pools, memory });

  const report = plan.scenes.map((scene, index) => {
    const sceneAssets = assets[scene.id];
    const p = sceneAssets.primary;
    const requests = requestReports.filter((item) => item.sceneId === scene.id);
    return {
      sceneId: scene.id,
      role: specs[index].need.role,
      tier: p?.tier || 'none',
      type: p?.type || null,
      source: p?.source || null,
      label: p?.label || null,
      license: p?.license?.name || null,
      relevance: p?.relevance ?? null,
      count: Object.keys(sceneAssets.byShot).length,
      requests,
      rejected: requests.flatMap((item) => item.materializationRejects || []).slice(0, 10),
    };
  });
  report.search = { ...searchStats, failures: [...new Set(searchStats.failures)] };
  report.requests = requestReports;
  report.memory = memory.selections;
  report.diagnostics = diagnostics;
  report.queryQualityFeedback = queryQualityFeedback;

  const unresolvedRequests = requestReports.filter((item) => item.resolutionStatus === 'unresolved' || item.resolutionStatus === 'weak');
  if (publishMode === 'PRODUCTION_RENDER' && unresolvedRequests.length) {
    const failure = {
      code: 'UNRESOLVED_PRODUCTION_MEDIA',
      message: 'Production rendering requires every media-routed shot to have an approved pixel-inspected asset.',
      unresolvedRequests,
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(path.dirname(publicDir), 'asset-resolution-failure.json'), JSON.stringify(failure, null, 2)).catch(() => {});
    const error = new Error(`${failure.message} Unresolved shots: ${unresolvedRequests.map((item) => item.storyboardShotId).join(', ')}`);
    error.code = failure.code;
    error.details = failure;
    throw error;
  }

  return {
    assets,
    report,
    diagnostics,
    requestReports,
    memory: memory.selections,
    editorialAssetJudgments,
    editorialUsefulnessRecords,
    queryQualityFeedback,
    visualInspections,
    videoWindowSelections,
    formatFitnessEvaluations,
    representationFallbacks,
    mediaReuseFallbacks,
  };
}
