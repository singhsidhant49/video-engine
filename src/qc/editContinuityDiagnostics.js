const increment = (target, key) => { target[key] = (target[key] || 0) + 1; };
const distribution = (values) => values.reduce((target, value) => { increment(target, value); return target; }, {});

function canonicalTransition(clip) {
  if (clip.transitionPolicy) return clip.transitionPolicy;
  if (clip.transitionAnchor && clip.enter?.type === 'cut') return 'MATCH_MOVE';
  return ({ cut: 'CUT', dissolve: 'SHORT_DISSOLVE', push: 'PUSH', wipe: 'WIPE' })[clip.enter?.type] || 'CUT';
}

function repeatedRuns(items, valueFor, { minimum = 3, ignore = new Set() } = {}) {
  const warnings = [];
  let start = 0;
  while (start < items.length) {
    const value = valueFor(items[start]);
    let end = start + 1;
    while (end < items.length && valueFor(items[end]) === value) end++;
    if (end - start >= minimum && !ignore.has(value)) warnings.push({ value, startIndex: start, count: end - start });
    start = end;
  }
  return warnings;
}

const policyAt = (policies, frame) => policies.find((item) => frame >= item.startFrame && frame < item.endFrame);

function captionCoverage(timeline) {
  const chunks = timeline.captions?.chunks || [];
  const policies = timeline.captions?.policies || [];
  const active = new Set();
  const covered = new Set();
  for (const chunk of chunks) for (const word of (chunk.words || [])) {
    for (let frame = word.startFrame; frame < word.endFrame; frame++) active.add(frame);
  }
  for (const frame of active) {
    const policy = policyAt(policies, frame);
    const chunkVisible = chunks.some((chunk) => frame >= chunk.startFrame && frame < chunk.endFrame);
    if (policy?.mode === 'INTEGRATED' && policy.equivalentOnScreenText) covered.add(frame);
    else if (!policy || ['NORMAL', 'COMPACT'].includes(policy.mode)) {
      if (chunkVisible) covered.add(frame);
    }
  }
  const uncovered = [...active].filter((frame) => !covered.has(frame)).sort((a, b) => a - b);
  const gaps = [];
  for (const frame of uncovered) {
    const last = gaps.at(-1);
    if (last && frame === last.endFrame + 1) last.endFrame = frame;
    else gaps.push({ startFrame: frame, endFrame: frame });
  }
  const longUncoveredIntervals = gaps.filter((gap) => gap.endFrame - gap.startFrame + 1 >= Math.round((timeline.fps || 30) * 0.5));
  return {
    captionCoveragePercent: active.size ? Number((covered.size / active.size * 100).toFixed(2)) : 100,
    narratedFrameCount: active.size,
    coveredNarratedFrameCount: covered.size,
    longUncoveredIntervals,
  };
}

export function buildEditContinuityDiagnostics(timeline, { frameStatePreflight = {} } = {}) {
  const clips = timeline.clips || [];
  const shots = timeline.realizedShots || clips.flatMap((clip) => clip.shots || []);
  const transitionDistribution = {}, motionModeDistribution = {}, captionModeDistribution = {}, imageCameraDistribution = {};
  clips.forEach((clip) => increment(transitionDistribution, canonicalTransition(clip)));
  shots.forEach((shot) => {
    increment(motionModeDistribution, shot.renderMode === 'solved'
      ? timeline.motionPlans?.[shot.motionPlanId]?.motionDensityBudget || 'MEDIUM'
      : shot.presentation?.movementState || 'STATIC');
    increment(captionModeDistribution, shot.captionPolicy?.mode || 'NORMAL');
    if (shot.imageBehavior) increment(imageCameraDistribution, shot.imageBehavior);
  });

  const simultaneousMotionWarnings = Object.values(frameStatePreflight).flatMap((result) => (result.issues || [])
    .filter((issue) => issue.code === 'simultaneous_motion_budget').map((issue) => ({ shotId: result.shotId, ...issue })));
  const lateRevealWarnings = Object.values(frameStatePreflight).flatMap((result) => (result.issues || [])
    .filter((issue) => issue.code === 'late_unreadable_reveal').map((issue) => ({ shotId: result.shotId, ...issue })));
  const insufficientFinalHoldWarnings = Object.values(frameStatePreflight).flatMap((result) => (result.issues || [])
    .filter((issue) => issue.code === 'insufficient_final_hold').map((issue) => ({ shotId: result.shotId, ...issue })));
  const repeatedTransitionRuns = repeatedRuns(clips, canonicalTransition, { ignore: new Set(['CUT']) });
  const repeatedCameraRuns = repeatedRuns(shots.filter((shot) => shot.imageBehavior), (shot) => shot.imageBehavior, { ignore: new Set(['STATIC']) });
  const coverage = captionCoverage(timeline);
  const abruptSubtitleWarnings = coverage.longUncoveredIntervals.map((interval) => ({ ...interval, code: 'narration_without_subtitle_or_equivalent_text' }));
  const subjectCaptionWarnings = shots.filter((shot) => {
    if (shot.family !== 'image' || !shot.captionPolicy?.geometry) return false;
    const box = shot.captionPolicy.geometry;
    const solvedScene = shot.renderMode === 'solved' && shot.solvedSceneId ? timeline.solvedScenes?.[shot.solvedSceneId] : null;
    const mediaPrimary = solvedScene?.mediaGeometry?.media_primary;
    if (mediaPrimary?.subjectSafeRegion) {
      const region = mediaPrimary.subjectSafeRegion;
      const xOverlap = Math.max(0, Math.min(box.x + box.width, region.x + region.width) - Math.max(box.x, region.x));
      const yOverlap = Math.max(0, Math.min(box.y + box.height, region.y + region.height) - Math.max(box.y, region.y));
      return xOverlap > 0 && yOverlap > 0;
    }
    if (shot.asset?.faceBounds?.length || shot.asset?.subjectBounds) {
      const bounds = shot.asset.faceBounds?.[0] || shot.asset.subjectBounds;
      const rect = mediaPrimary?.rect || { x: 0, y: 0, width: timeline.width, height: timeline.height };
      const point = { x: rect.x + (bounds.x * rect.width), y: rect.y + (bounds.y * rect.height) };
      return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
    }
    return false;
  }).map((shot) => ({ shotId: shot.storyboardShotId, code: 'image_subject_hidden_by_caption' }));
  const perceptuallyEmptyStarts = shots.filter((shot) => !shot.asset && ['image', 'ground'].includes(shot.family)
    && !Object.keys(shot.overlay || {}).length).map((shot) => ({ shotId: shot.storyboardShotId, code: 'scene_starts_perceptually_empty' }));
  const comparisonTopologyDistribution = {}, chartTypeDistribution = {}, textReductionDistribution = {};
  const preflightRepairDistribution = {}, backgroundDistribution = {};
  for (const scene of Object.values(timeline.solvedScenes || {})) {
    increment(backgroundDistribution, scene.backgroundSelection || 'unknown');
    if (scene.chartCoordinateSystem) increment(chartTypeDistribution, scene.topology || 'unknown');
    else if (!['horizontal', 'vertical'].includes(scene.topology)) increment(comparisonTopologyDistribution, scene.topology || 'unknown');
    Object.values(scene.textLayout || {}).forEach((layout) => increment(textReductionDistribution, layout.reductionTier || 'FULL'));
    (scene.repairHistory || []).forEach((repair) => increment(preflightRepairDistribution, repair.action));
  }
  const fallbackReasons = timeline.compositionDiagnostics?.fallbackReasons || shots.map((shot) => shot.compositionFallback).filter(Boolean);
  const continuityWarnings = shots.flatMap((shot) => (shot.continuityCompatibility?.warnings || []).map((code) => ({ shotId: shot.storyboardShotId, code })));
  const transitionQualityWarnings = clips.flatMap((clip) => (clip.transitionQuality?.warnings || []).map((code) => ({ clipId: clip.id, code, replacedWithCut: clip.transitionQuality.replacedWithCut })));
  const visualQualityWarnings = Object.values(timeline.visualQualityReviews || {}).flatMap((review) => (review.warnings || []).map((warning) => ({ shotId: review.shotId, ...warning })));
  const rejectedVisualQualityShots = Object.values(timeline.visualQualityReviews || {}).filter((review) => !review.publishable).map((review) => ({ shotId: review.shotId, score: review.averageScore, summary: review.summary }));
  const durations = shots.map((shot) => shot.durationInFrames / timeline.fps).sort((a, b) => a - b);
  const averageShotDuration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  const medianShotDuration = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
  const mediaTypes = shots.map((shot) => shot.asset?.type || (shot.family === 'image' ? 'image' : 'other'));
  const assetIds = shots.map((shot) => shot.asset?.id || shot.asset?.assetId || shot.asset?.src).filter(Boolean);
  const longestRun = (values) => repeatedRuns(values.map((value) => ({ value })), (item) => item.value, { minimum: 1 }).reduce((max, run) => Math.max(max, run.count), 0);
  const rapidCutCount = durations.filter((seconds) => seconds < 1.2).length;
  const longStaticCount = shots.filter((shot) => (shot.imageBehavior || 'STATIC') === 'STATIC' && shot.durationInFrames / timeline.fps > 6).length;

  // Requirement 7: Track layered backdrop usage and avoid repeated blurred backdrops
  let layeredBackdropCount = 0;
  let maxConsecutiveLayered = 0;
  let currentConsecutiveLayered = 0;
  for (const shot of shots) {
    const spec = timeline.mediaSceneSpecs?.[shot.mediaSceneSpecId];
    if (spec?.strategy === 'LAYERED_MEDIA' || shot.layout === 'media:LAYERED_MEDIA') {
      layeredBackdropCount++;
      currentConsecutiveLayered++;
      if (currentConsecutiveLayered > maxConsecutiveLayered) maxConsecutiveLayered = currentConsecutiveLayered;
    } else {
      currentConsecutiveLayered = 0;
    }
  }
  const repetitiveLayeredWarnings = (maxConsecutiveLayered > 1 || layeredBackdropCount > 2)
    ? [{ code: 'repetitive_layered_media_treatment', count: layeredBackdropCount, consecutive: maxConsecutiveLayered }]
    : [];

  const diagnostics = {
    version: 1,
    transitionDistribution,
    transitionReasonDistribution: clips.reduce((result, clip) => { increment(result, clip.transitionReason || 'newIdea'); return result; }, {}),
    motionModeDistribution,
    motionDensityDistribution: motionModeDistribution,
    captionModeDistribution,
    backgroundDistribution,
    comparisonTopologyDistribution,
    chartTypeDistribution,
    textReductionDistribution,
    preflightRepairDistribution,
    solvedComparisonCount: timeline.compositionDiagnostics?.solvedComparisonCount || 0,
    solvedChartCount: timeline.compositionDiagnostics?.solvedChartCount || 0,
    legacyComparisonFallbackCount: timeline.compositionDiagnostics?.legacyComparisonFallbackCount || 0,
    legacyChartFallbackCount: timeline.compositionDiagnostics?.legacyChartFallbackCount || 0,
    fallbackReasons,
    continuityWarnings: [...continuityWarnings, ...repetitiveLayeredWarnings],
    transitionQualityWarnings,
    visualQualityWarnings,
    rejectedVisualQualityShots,
    imageCameraDistribution,
    averageShotDuration: Number(averageShotDuration.toFixed(3)),
    medianShotDuration: Number(medianShotDuration.toFixed(3)),
    cutsPer10Sec: Number(((Math.max(0, shots.length - 1) / Math.max(1, timeline.durationInFrames / timeline.fps)) * 10).toFixed(3)),
    rapidCutCount,
    longStaticCount,
    mediaTypeDistribution: distribution(mediaTypes),
    imageCount: mediaTypes.filter((type) => type === 'image').length,
    videoCount: mediaTypes.filter((type) => type === 'video').length,
    cameraModeDistribution: imageCameraDistribution,
    captionPositionDistribution: distribution(shots.map((shot) => timeline.mediaSceneSpecs?.[shot.mediaSceneSpecId]?.captionPosition || 'UNSOLVED')),
    transitionDistribution,
    assetReuseCount: assetIds.length - new Set(assetIds).size,
    longestSameCameraRun: longestRun(shots.map((shot) => shot.imageBehavior || 'STATIC')),
    longestSameMediaTypeRun: longestRun(mediaTypes),
    simultaneousMotionWarnings,
    repeatedTransitionRuns,
    repeatedCameraRuns,
    layeredBackdropCount,
    consecutiveLayeredBackdropCount: maxConsecutiveLayered,
    repetitiveLayeredWarnings,
    captionCoveragePercent: coverage.captionCoveragePercent,
    captionCoverage: coverage,
    lateRevealWarnings,
    insufficientFinalHoldWarnings,
    finalHoldWarnings: insufficientFinalHoldWarnings,
    abruptSubtitleWarnings,
    subjectCaptionWarnings,
    perceptuallyEmptyStarts,
    passed: simultaneousMotionWarnings.length === 0 && abruptSubtitleWarnings.length === 0
      && subjectCaptionWarnings.length === 0 && perceptuallyEmptyStarts.length === 0
      && continuityWarnings.length === 0 && rejectedVisualQualityShots.length === 0
      && repetitiveLayeredWarnings.length === 0,
  };

  // Requirement 36 & 37: Full Playback Quality Gate Verdict
  diagnostics.videoPlaybackQuality = evaluateVideoPlaybackQuality(timeline, diagnostics, timeline.visualQualityReviews || {});
  return diagnostics;
}

/**
 * Requirements 36 & 37: Full Playback Quality Gate
 * Evaluates pacing, repetition, hook, ending, and media continuity across the full video.
 */
export function evaluateVideoPlaybackQuality(timeline, continuityDiagnostics, visualQualityReviews = {}) {
  const failureConditions = [];
  const weakConditions = [];

  const reviews = Object.values(visualQualityReviews);
  const shots = timeline.realizedShots || timeline.clips?.flatMap((clip) => clip.shots || []) || [];

  const reviewForShot = (shot) => {
    if (!shot) return null;
    return visualQualityReviews[shot.id]
      || visualQualityReviews[shot.storyboardShotId]
      || (shot.visualQualityReviewId && visualQualityReviews[shot.visualQualityReviewId])
      || reviews.find((r) => r.shotId === shot.storyboardShotId || r.shotId === shot.id)
      || null;
  };

  const irrelevantShots = reviews.filter((r) => (r.scores?.assetRelevance != null && r.scores.assetRelevance < 3) || r.warnings?.some((w) => w.code === 'asset_relevance'));
  if (irrelevantShots.length >= 2) failureConditions.push('multiple_irrelevant_assets');
  else if (irrelevantShots.length === 1) weakConditions.push('isolated_asset_relevance_weakness');

  if (continuityDiagnostics.layeredBackdropCount > 2 || continuityDiagnostics.consecutiveLayeredBackdropCount > 1) {
    weakConditions.push('excessive_blurred_backdrops');
  }

  if (continuityDiagnostics.repeatedCameraRuns?.length > 0) {
    weakConditions.push('repetitive_camera_behavior');
  }

  if (continuityDiagnostics.longStaticCount > 2) {
    weakConditions.push('long_stale_sequence');
  }

  if (continuityDiagnostics.subjectCaptionWarnings?.length > 0) {
    weakConditions.push('caption_subject_collision');
  }

  const firstShot = shots[0];
  const firstReview = reviewForShot(firstShot);
  let hookVerdict = 'STRONG';
  if (firstReview) {
    if (!firstReview.publishable || firstReview.strength === 'FAILED') {
      hookVerdict = 'FAILED';
      failureConditions.push('weak_hook');
    } else if (firstReview.strength === 'WEAK' || (firstReview.warnings && firstReview.warnings.length > 0)) {
      hookVerdict = 'ACCEPTABLE';
    }
  }
  if (firstShot && (firstShot.family === 'diagram' || firstShot.layout === 'media:EDITORIAL_SPLIT')) {
    if (hookVerdict === 'STRONG') hookVerdict = 'ACCEPTABLE';
    weakConditions.push('weak_hook');
  }

  const lastShot = shots.at(-1);
  const lastReview = reviewForShot(lastShot);
  let endingVerdict = 'STRONG';
  if (lastReview) {
    if (!lastReview.publishable || lastReview.strength === 'FAILED') {
      endingVerdict = 'FAILED';
      weakConditions.push('weak_ending');
    } else if (lastReview.strength === 'WEAK' || (lastReview.warnings && lastReview.warnings.length > 0)) {
      endingVerdict = 'ACCEPTABLE';
    }
  }

  if (continuityDiagnostics.rejectedVisualQualityShots?.length > 0) {
    failureConditions.push('rejected_visual_quality_shots');
  }

  let strongShotCount = 0;
  let acceptableShotCount = 0;
  let weakShotCount = 0;
  let failedShotCount = 0;
  let criticalFailureCount = 0;

  for (let idx = 0; idx < shots.length; idx++) {
    const shot = shots[idx];
    const review = reviewForShot(shot);
    const durationSec = (shot.durationInFrames || 0) / (timeline.fps || 30);
    
    let strength = review?.strength;
    if (!strength) {
      if (review?.publishable === false) strength = 'FAILED';
      else if (review?.publishable === true) {
        strength = (!review.warnings || review.warnings.length === 0) && (review.scores?.assetRelevance == null || review.scores.assetRelevance >= 4) ? 'STRONG' : 'ACCEPTABLE';
      } else {
        strength = 'ACCEPTABLE';
      }
    }

    if (strength === 'STRONG') strongShotCount++;
    else if (strength === 'ACCEPTABLE') acceptableShotCount++;
    else if (strength === 'WEAK') weakShotCount++;
    else if (strength === 'FAILED') {
      failedShotCount++;
      const isHook = idx === 0;
      const isIrrelevant = (review?.scores?.assetRelevance != null && review.scores.assetRelevance < 3) || review?.warnings?.some((w) => w.code === 'asset_relevance');
      const isUnresolved = shot.unresolvedMedia || review?.warnings?.some((w) => w.code === 'unresolved_media');
      if (isHook || durationSec >= 3.0 || isIrrelevant || isUnresolved || review?.publishable === false) {
        criticalFailureCount++;
      }
    }
  }

  if (criticalFailureCount > 0 && !failureConditions.includes('critical_failed_shots')) {
    failureConditions.push('critical_failed_shots');
  }

  // Verdict aggregation rules (Requirements 1 & 33):
  // STRONG: no FAILED, max 1 minor ACCEPTABLE issue, hook >= ACCEPTABLE, ending >= ACCEPTABLE.
  // ACCEPTABLE: no critical FAILED, some ACCEPTABLE/WEAK but usable.
  // WEAK: multiple weak scenes or one major failed scene.
  // FAILED: critical semantic failure or unusable playback.
  let overallVerdict = 'STRONG';
  if (criticalFailureCount >= 2 || hookVerdict === 'FAILED' || failureConditions.includes('multiple_irrelevant_assets') || failureConditions.includes('rejected_visual_quality_shots')) {
    overallVerdict = 'FAILED';
  } else if (criticalFailureCount === 1 || weakShotCount >= 2 || weakConditions.length >= 2 || failureConditions.length > 0) {
    overallVerdict = 'WEAK';
  } else if (weakShotCount === 1 || acceptableShotCount > 1 || weakConditions.length === 1 || hookVerdict === 'ACCEPTABLE' || endingVerdict === 'ACCEPTABLE') {
    overallVerdict = 'ACCEPTABLE';
  } else {
    overallVerdict = 'STRONG';
  }

  return {
    verdict: overallVerdict,
    overallVerdict,
    strongShotCount,
    acceptableShotCount,
    weakShotCount,
    failedShotCount,
    criticalFailureCount,
    hookVerdict,
    endingVerdict,
    failureConditions: [...new Set(failureConditions)],
    weakConditions: [...new Set(weakConditions)],
    summary: overallVerdict === 'STRONG'
      ? 'Whole-video rhythm, hook, ending, and media continuity achieve professional YouTube editorial standard.'
      : overallVerdict === 'ACCEPTABLE'
        ? 'Video is publishable with good visual flow and minor editorial notes.'
        : overallVerdict === 'WEAK'
          ? 'Playback has pacing, backdrop repetition, camera repetition, or isolated scene quality weaknesses.'
          : 'Video failed core playback quality gate and must not be published.',
  };
}

