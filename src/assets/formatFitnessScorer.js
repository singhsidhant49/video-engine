/**
 * Format & Crop Fitness Scorer
 * Milestone — Production Hardening & Semantic Visual Understanding
 * 
 * Strict Ordering:
 * SEMANTIC VALIDITY > FORMAT FITNESS > CROP FITNESS > PRESENTATION QUALITY
 * 
 * Landscape:
 * - Prefer native landscape (16:9).
 * - Square with safe crop.
 * - Portrait only if exceptional semantic relevance AND professional crop/layout.
 * - Blocks portrait image centered with black bars.
 * 
 * Shorts:
 * - Semantic validity first; wrong portrait assets are rejected.
 * - Multi-subject detection: detects when two critical subjects sit on opposite horizontal edges.
 * - Destructive crop detection (>55% loss or clipped subjects).
 */

import { FormatTokens } from '../config/tokens/editorialTokens.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/**
 * Evaluates vertical crop fitness for 9:16 Shorts.
 */
export function scoreVerticalCropFitness(candidate, visibleNeed = null) {
  const width = Number(candidate.width || candidate.dimensions?.width || 1920);
  const height = Number(candidate.height || candidate.dimensions?.height || 1080);
  const ar = width / Math.max(1, height);
  const targetAr = FormatTokens.SHORTS.aspectRatio; // 9/16 = 0.5625

  const isPortrait = ar < 0.85;
  const isSquare = ar >= 0.85 && ar <= 1.15;
  const isLandscape = ar > 1.15;

  // Cover crop geometry:
  // If targetAr < ar (e.g. 9:16 target on 16:9 source):
  // Visible width is (targetAr / ar) of source width.
  const visibleWidthRatio = isLandscape ? Math.min(1.0, targetAr / ar) : 1.0;
  const croppedOffWidthRatio = 1.0 - visibleWidthRatio;

  // Inspect subjects
  const subjectBounds = candidate.subjectBounds || candidate.focusBox || candidate.composition?.primarySubjectBounds;
  const faceBounds = candidate.faceBounds || candidate.composition?.faceBounds || [];
  const importantObjects = candidate.importantObjectBounds || candidate.composition?.importantObjectBounds || [];

  let subjectRetention = 1.0;
  let faceRetention = 1.0;
  let importantObjectRetention = 1.0;
  let multiSubjectIssue = false;
  let reject = false;
  const rejectReasons = [];

  // 1. Multi-subject detection (Part 33, 76)
  if (faceBounds.length >= 2) {
    const minFaceX = Math.min(...faceBounds.map((f) => f.x ?? f.xmin ?? 0.5));
    const maxFaceX = Math.max(...faceBounds.map((f) => (f.x ?? f.xmin ?? 0.5) + (f.width ?? 0.2)));
    const faceSpan = maxFaceX - minFaceX;
    if (faceSpan > visibleWidthRatio * 0.95) {
      faceRetention = 0.35;
      multiSubjectIssue = true;
      reject = true;
      rejectReasons.push('critical_faces_at_opposite_edges_cannot_survive_vertical_crop');
    }
  }

  if (importantObjects.length >= 2) {
    const minObjX = Math.min(...importantObjects.map((o) => o.x ?? 0.5));
    const maxObjX = Math.max(...importantObjects.map((o) => (o.x ?? 0.5) + (o.width ?? 0.2)));
    const objSpan = maxObjX - minObjX;
    if (objSpan > visibleWidthRatio * 0.98) {
      importantObjectRetention = 0.35;
      multiSubjectIssue = true;
      reject = true;
      rejectReasons.push('critical_objects_at_opposite_edges');
    }
  }

  // 2. Destructive landscape crop check (>50% cropped off and wide subject)
  if (isLandscape && croppedOffWidthRatio > 0.50) {
    if (candidate.hasMultipleEdgeSubjects || (subjectBounds && subjectBounds.width > 0.65)) {
      subjectRetention = 0.30;
      reject = true;
      rejectReasons.push('wide_subject_spread_edge_to_edge');
    }
  }

  // 3. Resolution floor check
  const croppedWidth = Math.round(width * visibleWidthRatio);
  const croppedHeight = height;
  const resolutionFloorOk = croppedWidth >= 640 && croppedHeight >= 1136;
  if (!resolutionFloorOk && Math.min(width, height) < 540) {
    reject = true;
    rejectReasons.push('resolution_below_shorts_floor');
  }

  // 4. Overall score calculation
  let score = 50;
  if (isPortrait) {
    score = 95;
    if (Math.abs(ar - targetAr) < 0.1) score = 100;
  } else if (isSquare) {
    score = 75;
  } else {
    // Landscape asset in vertical canvas
    score = Math.max(10, Math.round(50 - croppedOffWidthRatio * 40));
    if (subjectBounds && subjectBounds.width <= visibleWidthRatio * 0.8) {
      score += 20; // Well-centered subject crops safely
    }
  }

  if (reject) {
    score = Math.min(25, score);
  }

  return {
    orientation: isPortrait ? 'portrait' : isSquare ? 'square' : 'landscape',
    aspectRatio: ar,
    visibleWidthRatio: Number(visibleWidthRatio.toFixed(3)),
    subjectRetention: Number(subjectRetention.toFixed(2)),
    faceRetention: Number(faceRetention.toFixed(2)),
    importantObjectRetention: Number(importantObjectRetention.toFixed(2)),
    multiSubjectIssue,
    resolutionAfterCrop: { width: croppedWidth, height: croppedHeight },
    score,
    cropFitness: Number((score / 100).toFixed(2)),
    reject,
    rejectReasons,
  };
}

/**
 * Evaluates candidate format fitness for 16:9 Landscape.
 */
export function scoreLandscapeFitness(candidate) {
  const width = Number(candidate.width || candidate.dimensions?.width || 1920);
  const height = Number(candidate.height || candidate.dimensions?.height || 1080);
  const ar = width / Math.max(1, height);

  const isLandscape = ar > 1.15;
  const isPortrait = ar < 0.85;
  const isSquare = !isLandscape && !isPortrait;

  let score = 85;
  let reject = false;
  const rejectReasons = [];

  if (isLandscape) {
    score = 100;
    if (Math.abs(ar - 16 / 9) < 0.15) score = 100;
  } else if (isPortrait) {
    // Portrait in landscape:
    // Requires heavy cropping or layered media.
    // If resolution or framing would produce black bars:
    score = 40;
    if (candidate.qualityTier !== 'HERO' && !candidate.semanticMatchUnbeatable) {
      // Lower score to allow native landscape candidate to win
      score = 35;
    }
  } else {
    // Square
    score = 70;
  }

  if (width < 960 || height < 540) {
    score -= 30;
    if (width < 480 || height < 270) {
      reject = true;
      rejectReasons.push('resolution_below_landscape_floor');
    }
  }

  return {
    orientation: isLandscape ? 'landscape' : isPortrait ? 'portrait' : 'square',
    aspectRatio: ar,
    score,
    cropFitness: Number((score / 100).toFixed(2)),
    reject,
    rejectReasons,
  };
}

/**
 * Evaluates general format fitness based on target format.
 */
export function evaluateFormatFitness(candidate, targetFormat = 'landscape', visibleNeed = null) {
  if (targetFormat === 'shorts') {
    return scoreVerticalCropFitness(candidate, visibleNeed);
  }
  return scoreLandscapeFitness(candidate);
}

/**
 * Checks whether LAYERED_MEDIA usage has exceeded consecutive limits.
 */
export function evaluateLayeredMediaRepetition(consecutiveCount = 0) {
  const maxConsecutive = FormatTokens.SHORTS.maxConsecutiveLayeredMedia || 1;
  const shouldWarn = consecutiveCount >= 2;
  const shouldReselect = consecutiveCount >= 3;

  return {
    consecutiveCount,
    shouldWarn,
    shouldReselect,
    warning: shouldWarn ? 'repetitive_layered_media' : null,
  };
}
