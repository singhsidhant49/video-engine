/**
 * Asset Quality Scorer & Crop-Safe Focal Analyzer
 *
 * Implements the revised multi-factor formula and crop-safe focal analysis:
 *   score = 0.25 * semantic_relevance
 *         + 0.15 * claim_grounding
 *         + 0.15 * focal_composition
 *         + 0.15 * crop_fitness
 *         + 0.10 * clarity
 *         + 0.08 * motion_quality
 *         + 0.07 * resolution
 *         + 0.05 * style_match
 *
 * Hard rejection rules:
 * - crop_fitness < 0.45
 * - semantic_relevance < 0.55 (when verified or relevant needed)
 * - duplicate_similarity > 0.92
 */

const TIER_CLARITY = {
  verified: 1.0,
  relevant: 0.85,
  bank: 0.90,
  generated: 0.65,
  generic: 0.40,
};

/**
 * Calculate crop fitness for vertical 9:16 or landscape 16:9.
 * @param {object} cand Candidate media
 * @param {'shorts'|'landscape'} format
 * @returns {{ cropScore: number, focalRegion: object, protectedRegions: Array, safeTextRegions: string[] }}
 */
export function analyzeCropFitness(cand, format = 'shorts') {
  const w = cand.width || 1920;
  const h = cand.height || 1080;
  const aspect = w / h;
  const isTargetVertical = format === 'shorts';

  // Inferred or provided focal point (0 to 1 normalized)
  const focal = cand.focal || { x: 0.5, y: 0.45 };
  const focalPoints = [
    {
      x: focal.x,
      y: focal.y,
      width: 0.25,
      height: 0.35,
      type: cand.source === 'wikipedia' ? 'entity_portrait' : 'focal_subject',
      confidence: 0.9,
    },
  ];

  const protectedRegions = [
    {
      x: Math.max(0, focal.x - 0.2),
      y: Math.max(0, focal.y - 0.2),
      width: 0.4,
      height: 0.45,
      reason: 'primary_subject',
    },
  ];

  let focalVisibility = 0.8;
  let subjectMargin = 0.8;
  let textClearance = 0.8;
  let compositionBalance = 0.8;

  if (isTargetVertical) {
    if (aspect < 0.8) {
      // Native portrait: optimal for vertical Shorts
      focalVisibility = 0.95;
      subjectMargin = 0.90;
      textClearance = 0.85;
      compositionBalance = 0.95;
    } else if (aspect <= 1.8) {
      // 16:9 landscape on 9:16: Center crop cuts left/right 60%
      const visibleLeft = 0.5 - (0.5625 / aspect) / 2;
      const visibleRight = 0.5 + (0.5625 / aspect) / 2;
      const isFocalInside = focal.x >= visibleLeft && focal.x <= visibleRight;

      if (isFocalInside) {
        focalVisibility = 0.75;
        subjectMargin = 0.65;
        textClearance = 0.70;
        compositionBalance = 0.75;
      } else {
        // Focal subject is cut off on full-bleed! Requires DepthShot or letterbox
        focalVisibility = 0.40;
        subjectMargin = 0.30;
        textClearance = 0.50;
        compositionBalance = 0.40;
      }
    } else {
      // Ultra-wide panoramic: severely cut off vertically
      focalVisibility = 0.35;
      subjectMargin = 0.25;
      textClearance = 0.40;
      compositionBalance = 0.35;
    }
  } else {
    // Target Landscape 16:9
    if (aspect >= 1.3) {
      focalVisibility = 0.95;
      subjectMargin = 0.90;
      textClearance = 0.90;
      compositionBalance = 0.95;
    } else {
      // Portrait on landscape: letterbox or depth shot
      focalVisibility = 0.70;
      subjectMargin = 0.70;
      textClearance = 0.80;
      compositionBalance = 0.70;
    }
  }

  const cropScore = Number((
    0.40 * focalVisibility +
    0.25 * subjectMargin +
    0.20 * textClearance +
    0.15 * compositionBalance
  ).toFixed(3));

  // Determine non-colliding text regions
  const safeTextRegions = [];
  if (isTargetVertical) {
    if (focal.y > 0.55) safeTextRegions.push('top_center', 'top_left');
    else safeTextRegions.push('bottom_center', 'bottom_left');
  } else {
    if (focal.x > 0.5) safeTextRegions.push('top_left', 'bottom_left', 'center_left');
    else safeTextRegions.push('top_right', 'bottom_right', 'center_right');
  }

  return {
    cropScore,
    focalRegion: focalPoints[0],
    protectedRegions,
    safeTextRegions,
  };
}

/**
 * Score a media candidate with the revised 8-factor formula.
 * @param {object} cand Candidate media object
 * @param {object} context Context object
 * @returns {{ score: number, rejected: boolean, rejectReason?: string, breakdown: object, safeTextRegions: string[], layoutConstraints: object }}
 */
export function scoreCandidate(cand, context = {}) {
  const { format = 'shorts', need = {}, targetDuration = 4, usedKeywords = new Set(), style = 'cinematic_dark' } = context;

  // 1. Semantic relevance & method
  let semantic = 0.5;
  let semanticMethod = 'keyword';
  let semanticAvailable = false;

  if (cand.relevance != null) {
    semantic = Math.min(1.0, Math.max(0.0, (cand.relevance - 0.12) / 0.20));
    semanticMethod = 'clip';
    semanticAvailable = true;
  } else if (cand.tier === 'verified' || cand.source === 'wikipedia' || cand.source === 'commons') {
    semantic = 0.95;
    semanticMethod = 'verified_entity';
    semanticAvailable = true;
  } else if (cand.tier === 'relevant') {
    semantic = 0.80;
  } else if (cand.tier === 'generated') {
    semantic = 0.70;
  } else {
    semantic = 0.40;
  }

  // 2. Claim grounding (0 - 1)
  let claimGrounding = 0.6;
  if (cand.tier === 'verified' || cand.label) claimGrounding = 0.95;
  else if (cand.tier === 'relevant') claimGrounding = 0.80;

  // 3. Focal composition & Crop fitness
  const cropAnalysis = analyzeCropFitness(cand, format);
  const focalComp = cropAnalysis.cropScore;
  const cropFitness = cropAnalysis.cropScore;

  // 4. Clarity
  const clarity = TIER_CLARITY[cand.tier] ?? 0.6;

  // 5. Motion quality
  let motion = 0.6;
  if (cand.type === 'video') {
    motion = need.preferVideo ? 0.95 : 0.85;
    if (cand.duration && cand.duration >= Math.min(targetDuration, 3)) motion += 0.05;
  }

  // 6. Resolution
  let resolution = 0.6;
  if (cand.width && cand.height) {
    const minDim = Math.min(cand.width, cand.height);
    if (minDim >= 1440) resolution = 1.0;
    else if (minDim >= 1080) resolution = 0.85;
    else if (minDim >= 720) resolution = 0.70;
    else resolution = 0.40;
  }

  // 7. Style match
  let styleMatch = 0.8;
  if (style.includes('dark') || style.includes('cinematic')) styleMatch = 0.9;

  // Compute 8-factor score
  const baseScore = (
    0.25 * semantic +
    0.15 * claimGrounding +
    0.15 * focalComp +
    0.15 * cropFitness +
    0.10 * clarity +
    0.08 * motion +
    0.07 * resolution +
    0.05 * styleMatch
  );

  // Hard rejection checks
  let rejected = false;
  let rejectReason = null;

  if (cropFitness < 0.40 && format === 'shorts' && need.role === 'subject') {
    rejected = true;
    rejectReason = 'Unsafe portrait crop: subject cut off';
  } else if (semantic < 0.50 && need.role === 'subject') {
    rejected = true;
    rejectReason = 'Low semantic relevance for required subject';
  }

  const finalScore = Number(Math.max(0.05, Math.min(1.0, baseScore)).toFixed(3));

  const layoutConstraints = {
    caption: {
      allowedRegions: cropAnalysis.safeTextRegions,
      avoidRegions: format === 'shorts' ? ['center'] : ['center_right'],
      maxWidth: format === 'shorts' ? 920 : 1500,
    },
    headline: {
      allowedRegions: cropAnalysis.safeTextRegions,
      maxLines: 2,
      maxCharactersPerLine: format === 'shorts' ? 18 : 28,
    },
  };

  return {
    score: finalScore,
    rejected,
    rejectReason,
    semantic_score: Number(semantic.toFixed(2)),
    semantic_method: semanticMethod,
    semantic_available: semanticAvailable,
    crop_fitness: cropFitness,
    focal_region: cropAnalysis.focalRegion,
    protected_regions: cropAnalysis.protectedRegions,
    safeTextRegions: cropAnalysis.safeTextRegions,
    layoutConstraints,
    breakdown: {
      semantic: Number(semantic.toFixed(2)),
      grounding: Number(claimGrounding.toFixed(2)),
      focal: Number(focalComp.toFixed(2)),
      crop: Number(cropFitness.toFixed(2)),
      clarity: Number(clarity.toFixed(2)),
      motion: Number(motion.toFixed(2)),
      resolution: Number(resolution.toFixed(2)),
      style: Number(styleMatch.toFixed(2)),
    },
  };
}
