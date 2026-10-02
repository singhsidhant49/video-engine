import fs from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg } from '../services/ffmpeg.js';
import { materialiseImage, materialiseVideo, mapLimit, hamming, searchStats } from '../services/freeMediaService.js';
import { recordImageInBank, searchImageBank } from '../services/imageBank.js';
import { licenseAllowed } from '../shared/licensing.js';
import { relevance, relevanceEnabled } from '../services/relevance.js';
import { defaultAssetProviders, searchAssetProviderStage } from '../assets/providerRegistry.js';
import { analyzeAssetRequest } from '../assets/assetSearchContext.js';
import { compareCandidateScores, scoreAssetCandidate } from '../assets/assetIntelligenceScorer.js';
import { VideoAssetMemory } from '../assets/videoAssetMemory.js';

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
  const file = path.join(dir, `${request.storyboardShotId}_${String.fromCharCode(97 + sequence)}.${ext}`);
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
    const clipSimilarity = candidate.type === 'image' && relevanceEnabled()
      ? await relevance(file, request.concept)
      : null;
    const { hash, ...media } = info;
    return {
      file,
      hash,
      clipSimilarity,
      asset: {
        ...media,
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

/** Resolve shot requests through staged providers, semantic gates, and video-level memory. */
export async function directAssets(plan, specs, { publicDir, format, assetRequests, providers = defaultAssetProviders, allowGenerated = false }) {
  if (allowGenerated) throw new Error('Generated media providers are disabled for V1');
  if (!assetRequests?.length) throw new Error('directAssets requires canonical-shot AssetRequest objects');
  const dir = path.join(publicDir, 'assets');
  await fs.mkdir(dir, { recursive: true });
  const pools = await mapLimit(assetRequests, 3, (request) => gather(request, providers));
  const memory = new VideoAssetMemory();
  const usedIdentities = new Set();
  const usedHashes = [];
  const assets = Object.fromEntries(plan.scenes.map((scene) => [scene.id, { primary: null, alternates: [], byShot: {} }]));
  const requestReports = [];

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
    const ranked = scoredCandidates(pool, memory, usedIdentities);
    const viable = buildMaterializationQueue(ranked);
    const materialized = [];
    const materializationRejects = [];
    for (let index = 0; index < viable.length; index++) {
      const result = await materializeCandidate(viable[index], request, dir, publicDir, index, usedHashes);
      if (result.asset) materialized.push({ ...viable[index], ...result });
      else materializationRejects.push({ candidateId: viable[index].candidate.id, reason: result.rejected });
      if (materialized.length >= 4) break;
    }

    if (!materialized.length) {
      const emergencyCandidates = ranked.filter((item) => !viable.includes(item) && item.score.qualityRank >= 1);
      for (let index = 0; index < emergencyCandidates.length; index++) {
        const result = await materializeCandidate(emergencyCandidates[index], request, dir, publicDir, viable.length + index, usedHashes);
        if (result.asset) {
          materialized.push({ ...emergencyCandidates[index], ...result });
          break;
        } else {
          materializationRejects.push({ candidateId: emergencyCandidates[index].candidate.id, reason: result.rejected });
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
          result.asset.tier = 'fallback';
          materialized.push({ ...item, ...result });
          break;
        }
      }
    }

    // CLIP is a secondary tiebreaker only; metadata quality and semantic gates remain first.
    materialized.sort((a, b) => compareCandidateScores(a, b, request.constraints?.orientation)
      || (b.clipSimilarity ?? -1) - (a.clipSimilarity ?? -1));

    const selected = materialized[0] || null;
    for (const loser of materialized.slice(1)) await fs.rm(loser.file, { force: true });

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
          description: request.concept,
          query: selected.candidate.query || request.concept,
          source: selected.asset.source,
          label: selected.asset.label || '',
          license: selected.asset.license,
          width: selected.asset.width || 1920,
          height: selected.asset.height || 1080,
        }).catch(() => {});
      }
    } else {
      // Milestone 17 Requirement 35: If asset providers cannot produce a strong replacement:
      // mark shot UNRESOLVED_MEDIA. Do not silently use weak fallback stock.
      const unresolvedFile = path.join(dir, `${request.storyboardShotId}_unresolved.jpg`);
      try {
        await ffmpeg(['-y', '-f', 'lavfi', '-i', `color=c=0x111827:s=${request.constraints?.minWidth || 1920}x${request.constraints?.minHeight || 1080}`, '-frames:v', '1', unresolvedFile]);
      } catch {
        const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        await fs.writeFile(unresolvedFile, png1x1).catch(() => {});
      }
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
        license: null,
      };
      const sceneAssets = assets[request.sceneId];
      sceneAssets.byShot[request.storyboardShotId] = unresolvedAsset;
      if (!sceneAssets.primary) sceneAssets.primary = unresolvedAsset;
    }

    const top = ranked[0];
    const resolutionStatus = selected?.score.resolutionStatus || (top?.score.qualityRank === 1 ? 'weak' : 'unresolved');
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
    });
  }

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

  return { assets, report, diagnostics, requestReports, memory: memory.selections };
}
