import { MediaSceneSpecSchema } from '../models/mediaSceneSpec.schema.js';
import { analyzeCropFitness } from '../services/assetScorer.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));
const rect = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y)
  ? { x: clamp01(value.x), y: clamp01(value.y), width: clamp01(value.width ?? value.w ?? 0), height: clamp01(value.height ?? value.h ?? 0) }
  : null;

export function normalizeMediaAnalysis(asset, format = 'landscape') {
  const width = Number(asset?.width) || null, height = Number(asset?.height) || null;
  const crop = analyzeCropFitness(asset || {}, format);
  const focalPoint = asset?.focalPoint || asset?.focal || crop.focalRegion ? {
    x: clamp01((asset?.focalPoint || asset?.focal || crop.focalRegion).x),
    y: clamp01((asset?.focalPoint || asset?.focal || crop.focalRegion).y),
  } : null;
  const subjectBounds = rect(asset?.subjectBounds || asset?.focusBox && {
    x: asset.focusBox.xmin, y: asset.focusBox.ymin,
    width: asset.focusBox.xmax - asset.focusBox.xmin, height: asset.focusBox.ymax - asset.focusBox.ymin,
  });
  const protectedRegions = (asset?.protectedRegions || asset?.protected_regions || []).map((item) => ({ ...rect(item), reason: item.reason || 'primary_subject' })).filter((item) => item.width > 0 && item.height > 0);
  const score = asset?.cropFitness ?? asset?.crop_fitness ?? asset?.score?.presentation?.cropFitness ?? crop.cropScore;
  const tierRaw = String(asset?.qualityTier || asset?.tier || asset?.score?.resolutionStatus || '').toUpperCase();
  const qualityTier = ['VERIFIED', 'EXCELLENT', 'GOOD', 'HERO'].includes(tierRaw) ? 'HERO'
    : ['RELEVANT', 'ACCEPTABLE', 'SUPPORT', 'BANK'].includes(tierRaw) ? 'SUPPORT'
      : ['WEAK', 'UNUSABLE', 'FALLBACK', 'GENERIC'].includes(tierRaw) ? 'FALLBACK' : 'UNKNOWN';
  const unknownFields = [];
  const values = { dimensions: width && height, aspectRatio: width && height, focalPoint, subjectBounds, faceBounds: asset?.faceBounds, negativeSpaceRegions: asset?.negativeSpaceRegions, cropSlack: asset?.cropSlack, visualBusyness: asset?.visualBusyness, motionPresent: asset?.motionPresent, evidenceStrength: asset?.evidenceStrength };
  Object.entries(values).forEach(([key, value]) => { if (value == null) unknownFields.push(key); });
  return {
    assetId: String(asset?.id || asset?.assetId || asset?.src || 'unknown_asset'), type: asset?.type === 'video' ? 'video' : 'image', src: String(asset?.src || asset?.localPath || ''),
    dimensions: { width, height }, aspectRatio: width && height ? width / height : null,
    orientation: width && height ? width / height > 1.08 ? 'landscape' : width / height < .92 ? 'portrait' : 'square' : 'unknown',
    focalPoint, subjectBounds, faceBounds: (asset?.faceBounds || []).map(rect).filter(Boolean), protectedRegions,
    safeTextRegions: asset?.safeTextRegions || asset?.layoutConstraints?.headline?.allowedRegions || crop.safeTextRegions || [],
    negativeSpaceRegions: (asset?.negativeSpaceRegions || []).map(rect).filter(Boolean), cropFitness: score == null ? null : clamp01(score),
    cropSlack: asset?.cropSlack ? { x: clamp01(asset.cropSlack.x), y: clamp01(asset.cropSlack.y) } : null,
    visualBusyness: asset?.visualBusyness == null ? null : clamp01(asset.visualBusyness), qualityTier,
    motionPresent: asset?.motionPresent ?? (asset?.type === 'video' ? true : null), evidenceStrength: asset?.evidenceStrength == null ? null : clamp01(asset.evidenceStrength), unknownFields,
  };
}

function roleFor(shot, count) {
  if (count > 1 && (shot?.role === 'comparison' || shot?.presentation?.variant === 'split')) return 'COMPARISON';
  if (count > 2 || shot?.family === 'montage') return 'MONTAGE';
  return ({ evidence: 'EVIDENCE', detail: 'DETAIL', context: 'CONTEXT', establishing: 'HERO', atmosphere: 'ATMOSPHERE', background: 'BACKGROUND' })[shot?.role] || 'HERO';
}

function textNeed(overlay, role) {
  if (overlay?.stat || overlay?.value) return 'STAT';
  if (overlay?.label && !overlay?.headline) return 'LABEL';
  if (overlay?.source && role === 'EVIDENCE') return 'SOURCE';
  return overlay?.headline ? 'HEADLINE' : 'NONE';
}

/**
 * Requirement 6 & 7: Media treatment fallback hierarchy:
 * 1. subject-safe full bleed
 * 2. detail crop
 * 3. intentional editorial split
 * 4. layered/ambient backdrop (throttled)
 * 5. alternate asset
 */
function strategyFor(role, analysis, text, count, format, continuity = {}, visualPolicy = null) {
  const asset = analysis[0];
  if (text === 'HEADLINE' && analysis.chapter) return 'BACKGROUND_MEDIA';
  if (role === 'MONTAGE') return 'MONTAGE';
  if (role === 'COMPARISON' && count >= 2) return 'TWO_MEDIA_COMPARE';

  const isPortraitInLandscape = asset.orientation === 'portrait' && format === 'landscape';
  if (isPortraitInLandscape) {
    const consecutive = continuity.consecutiveLayeredBackdropCount || 0;
    if (consecutive < 1) {
      return 'LAYERED_MEDIA';
    }
    return visualPolicy?.allowSplitLayout === false ? 'LAYERED_MEDIA' : (text !== 'NONE' ? 'EDITORIAL_SPLIT' : 'FULL_BLEED');
  }

  if (visualPolicy && visualPolicy.allowSplitLayout === false) {
    if (text === 'STAT') return 'IMAGE_PLUS_STAT';
    if (role === 'DETAIL') return 'DETAIL_FOCUS';
    return 'FULL_BLEED';
  }

  if (text === 'STAT') return 'IMAGE_PLUS_STAT';
  if (role === 'DETAIL') return 'DETAIL_FOCUS';
  if (role === 'EVIDENCE') return 'EVIDENCE_FRAME';
  if (text !== 'NONE') return 'MEDIA_DOMINANT_SPLIT';
  if (asset.qualityTier === 'FALLBACK') return 'EDITORIAL_SPLIT';
  if (asset.cropFitness != null && asset.cropFitness < .48) return (format === 'shorts' && text === 'NONE') ? 'FULL_BLEED' : 'EDITORIAL_SPLIT';
  return 'FULL_BLEED';
}

function montageSpec(analysis, durationInFrames) {
  if (analysis.length < 2) return null;
  const each = Math.floor(durationInFrames / analysis.length);
  return { editorialObjective: 'Advance one semantic beat through a coherent media sequence.', assets: analysis.map((a) => a.assetId), sequenceReason: 'semanticListItems', durationInFrames,
    perAssetRole: analysis.map((_, i) => i === 0 ? 'HERO' : 'CONTEXT'), transitionStyle: 'CUT', rhythm: 'STEADY',
    cuts: analysis.map((a, i) => ({ assetId: a.assetId, startFrame: i * each, endFrame: i === analysis.length - 1 ? durationInFrames - 1 : (i + 1) * each - 1, reason: i ? 'montageProgression' : 'establishSubject' })) };
}

/**
 * Evaluates subtitle contrast and visual busyness under the subtitle region (Requirement 12).
 * Returns: 'CLEAN_TEXT' | 'SOFT_SCRIM' | 'COMPACT_CAPSULE'
 */
export function analyzeSubtitleContrast(asset, format = 'landscape') {
  const busyness = asset?.visualBusyness ?? 0.35;
  if (format === 'landscape') {
    // Landscape default is CLEAN_TEXT; use COMPACT_CAPSULE only on extreme busyness
    if (busyness > 0.72) return 'COMPACT_CAPSULE';
    if (busyness > 0.52) return 'SOFT_SCRIM';
    return 'CLEAN_TEXT';
  }
  // Shorts prefer CLEAN_TEXT or SOFT_SCRIM
  if (busyness > 0.70) return 'COMPACT_CAPSULE';
  if (busyness > 0.48) return 'SOFT_SCRIM';
  return 'CLEAN_TEXT';
}

/**
 * Caption position stability (Requirement 14):
 * Retains stable zone across sequence unless subject collision forces relocation.
 */
function solveStableCaptionPosition(primary, format, lastPosition = null) {
  const hasLowerSubject = primary.subjectBounds && (primary.subjectBounds.y + primary.subjectBounds.height > 0.78);
  if (!hasLowerSubject && lastPosition && ['LOWER_CENTER', 'NORMAL'].includes(lastPosition)) {
    return 'LOWER_CENTER';
  }
  if (format === 'shorts' && primary.subjectBounds?.y > .55) {
    return 'UPPER_SAFE';
  }
  if (primary.safeTextRegions.some((r) => r.includes('left'))) {
    return 'RIGHT_SAFE';
  }
  return 'LOWER_CENTER';
}

export function normalizeMediaSceneSpec({ shot, editorialPlan = null, overlay = {}, asset, supportingAssets = [], format = 'landscape', durationInFrames, continuity = {}, visualPolicy = null }) {
  const rawAssets = [asset, ...supportingAssets].filter(Boolean);
  if (!rawAssets.length) throw new Error('Solved media requires at least one asset');
  const assets = rawAssets.map((item) => normalizeMediaAnalysis(item, format));
  const role = roleFor(shot, assets.length), need = textNeed(overlay, role);
  assets.chapter = Boolean(overlay?.chapter);
  const strategy = strategyFor(role, assets, need, assets.length, format, continuity, visualPolicy);
  const primary = assets[0];
  const consecutiveLayered = (continuity.consecutiveLayeredBackdropCount || 0) + (strategy === 'LAYERED_MEDIA' ? 1 : 0);

  const fallbackThreshold = visualPolicy?.allowSplitLayout === false ? .32 : .48;
  const incompatible = (primary.cropFitness != null && primary.cropFitness < .35)
    || (primary.qualityTier === 'FALLBACK' && strategy === 'FULL_BLEED' && primary.cropFitness != null && primary.cropFitness < fallbackThreshold)
    || (format === 'shorts' && primary.orientation === 'landscape' && strategy === 'FULL_BLEED' && (
      (primary.subjectBounds && (() => { const coverWidth = (9 / 16) / (primary.aspectRatio || 16 / 9); return primary.subjectBounds.width > coverWidth * .96; })())
      || (primary.cropFitness != null && primary.cropFitness < .38)
    ) && !supportingAssets.length)
    || (strategy === 'LAYERED_MEDIA' && consecutiveLayered > 1);

  const nativeVideo = primary.type === 'video' && primary.motionPresent !== false;
  let cameraIntent = nativeVideo || role === 'EVIDENCE' ? 'STATIC' : shot?.presentation?.cameraMove === 'detailCrop' || role === 'DETAIL' ? 'DETAIL_CROP'
    : shot?.presentation?.cameraMove === 'pan' ? 'FOCAL_PAN' : ['subtlePush', 'push'].includes(shot?.presentation?.cameraMove) ? 'SUBTLE_PUSH'
      : ['subtlePull', 'pull'].includes(shot?.presentation?.cameraMove) ? 'SUBTLE_PULL' : 'STATIC';
  if (cameraIntent !== 'STATIC' && ((primary.dimensions.width || 0) < (format === 'shorts' ? 800 : 1280) || primary.qualityTier === 'FALLBACK')) {
    cameraIntent = 'STATIC';
  }

  const captionPosition = solveStableCaptionPosition(primary, format, continuity.lastCaptionPosition);

  return MediaSceneSpecSchema.parse({ version: 1, shotId: shot.id || shot.storyboardShotId, mediaRole: role,
    editorialObjective: editorialPlan?.editorialObjective || editorialPlan?.communicationObjective || shot.visualConcept || 'Use the selected media as the primary editorial evidence.',
    primaryAssetId: primary.assetId, supportingAssetIds: assets.slice(1).map((a) => a.assetId), subjectIntent: shot.visualConcept || 'Preserve the primary subject',
    evidenceIntent: role === 'EVIDENCE' ? 'Preserve authentic source framing and attribution.' : 'Support the narrated claim without overstating evidence.',
    textNeed: need, annotationNeed: overlay?.annotation || overlay?.label && role === 'DETAIL' ? 'LABEL' : 'NONE', cameraIntent,
    transitionIntent: { entry: 'CUT', exit: 'CUT', anchor: shot.transitionAnchor || null },
    durationIntent: { durationInFrames, rationale: ['narration_span', assets.length > 1 ? 'visual_novelty' : 'asset_complexity', need !== 'NONE' ? 'text_read_time' : 'clean_hold'] },
    imageChangeReason: role === 'MONTAGE' ? 'montageProgression' : ({ EVIDENCE: 'newEvidence', DETAIL: 'newDetail', CONTEXT: 'newLocation' })[role] || 'newIdea',
    strategy, captionPosition,
    assets, montage: role === 'MONTAGE' ? montageSpec(assets, durationInFrames) : null,
    alternateAssetRequest: incompatible ? { requested: true, reason: 'composition_incompatible', rejectedAssetId: primary.assetId, requirements: ['safe_subject_crop', format === 'shorts' ? 'portrait_compatible' : 'landscape_compatible', 'sufficient_resolution'] } : null,
  });
}

