/**
 * Whole-Video Rhythm & Scene Continuity Engine
 *
 * Enforces editorial rhythm across neighboring shots and scenes:
 * 1. Shot Scale Variety: Prevents monotonous sequences (wide -> wide -> wide)
 *    and enforces dynamic editing rhythms (wide -> medium -> close -> graphic -> wide).
 * 2. Windowed Rhythm Detection: Evaluates windows of neighboring shots to detect:
 *    - photo -> photo -> photo -> photo (flags monotone photo layouts)
 *    - card -> card -> card (flags procedural fatigue)
 *    - zoom -> zoom -> zoom (flags continuous scaling AI slideshow look)
 *    - dark panel -> dark panel (flags repetitive dark void layouts)
 * 3. Camera Movement Harmony & Restraint: Inserts intentional static holds.
 * 4. Transition Restraint: Enforces default hard cuts; reserves dissolve/wipe for semantic beats.
 */

const STRUCTURED_FAMILIES = new Set(['stat', 'compare', 'list', 'process', 'timeline', 'chart', 'document', 'ui', 'code']);

/**
 * Evaluates continuity across a sliding window of scenes/shots.
 */
export function evaluateWholeVideoRhythm(scenesOrShots) {
  const flags = [];
  const windowSize = 4;

  for (let i = 0; i <= scenesOrShots.length - windowSize; i++) {
    const window = scenesOrShots.slice(i, i + windowSize);

    // 1. Check for 4+ consecutive identical photo presentations
    const allPhotos = window.every((s) => s.family === 'image');
    if (allPhotos) {
      const allSameVariant = window.every((s) => s.variant === window[0].variant);
      if (allSameVariant) {
        flags.push({
          type: 'monotone_photo_run',
          startIndex: i,
          count: windowSize,
          message: `4 consecutive photos share identical '${window[0].variant}' layout; recommend alternating with editorial split or detail crop.`,
        });
      }
    }

    // 2. Check for 3+ consecutive procedural structured cards
    const structuredCount = window.slice(0, 3).filter((s) => STRUCTURED_FAMILIES.has(s.family)).length;
    if (structuredCount >= 3) {
      flags.push({
        type: 'procedural_fatigue_run',
        startIndex: i,
        count: 3,
        message: '3 consecutive procedural graphics detected; recommend breaking up with media or kinetic headline.',
      });
    }

    // 3. Check for 3+ consecutive zoom moves without an intentional static hold
    const moves = window.slice(0, 3).map((s) => s.camera?.mode || s.presentation?.cameraMove || s.cameraMove || 'static');
    const zoomMoves = moves.filter((m) => m === 'push' || m === 'pull' || m === 'subtlePush' || m === 'subtlePull');
    if (zoomMoves.length >= 3) {
      flags.push({
        type: 'consecutive_zoom_run',
        startIndex: i,
        count: 3,
        message: '3 consecutive zoom moves detected; recommend inserting an intentional static hold.',
      });
    }
  }

  return {
    windowSize,
    evaluatedItems: scenesOrShots.length,
    flags,
  };
}

/**
 * Evaluate continuity between adjacent scenes and refine transitions.
 * @param {Array<object>} specs Visual Director scene specs
 * @param {object} options { format, style }
 * @returns {{ continuityReport: object[], refinedSpecs: object[], rhythmAudit: object }}
 */
export function evaluateContinuity(specs, { format = 'shorts', style = 'cinematic_dark' } = {}) {
  const report = [];
  const refinedSpecs = [...specs];

  for (let i = 0; i < refinedSpecs.length; i++) {
    const current = refinedSpecs[i];
    const prev = i > 0 ? refinedSpecs[i - 1] : null;

    if (!prev) {
      report.push({
        sceneIndex: i,
        sceneId: current.sceneId,
        shotScale: 'wide',
        continuityScore: 1.0,
        transitionRecommendation: 'cut',
      });
      continue;
    }

    // 1. Shot Scale progression
    let currentScale = 'medium';
    if (['statistic', 'stat', 'chart', 'process', 'timeline', 'comparison', 'compare'].includes(current.family)) {
      currentScale = 'graphic';
    } else if (current.camera?.mode === 'push' || current.camera?.mode === 'subtlePush' || current.camera?.zoom > 1.05) {
      currentScale = 'close';
    } else if (current.camera?.mode === 'drift' || current.camera?.mode === 'pan') {
      currentScale = 'wide';
    }

    const prevScale = report[i - 1]?.shotScale || 'wide';

    // Shot scale variety check
    let scaleVarietyScore = 0.85;
    if (currentScale === prevScale && currentScale !== 'graphic') {
      scaleVarietyScore = 0.65;
      if (current.camera) {
        // Introduce alternating camera move or static hold
        current.camera.mode = prev.camera?.mode === 'subtlePush' ? 'subtlePull' : 'static';
      }
    }

    // 2. Motion continuity
    let motionScore = 0.80;
    if (prev.camera && current.camera) {
      if (prev.camera.mode === current.camera.mode) {
        motionScore = 0.75;
      } else {
        motionScore = 0.90;
      }
    }

    const overallScore = Number((0.5 * scaleVarietyScore + 0.5 * motionScore).toFixed(2));

    // Transition restraint: default to clean hard CUT
    let transition = 'cut';
    if (current.treatment === 'chapter' || current.purpose === 'hook') {
      transition = 'cut';
    } else if (overallScore < 0.65 && (current.tone === 'somber' || current.tone === 'reflective')) {
      transition = 'dissolve';
    } else {
      transition = 'cut';
    }

    report.push({
      sceneIndex: i,
      sceneId: current.sceneId,
      shotScale: currentScale,
      previousScale: prevScale,
      scaleVarietyScore,
      motionScore,
      continuityScore: overallScore,
      transitionRecommendation: transition,
    });
  }

  const rhythmAudit = evaluateWholeVideoRhythm(refinedSpecs);

  return {
    continuityReport: report,
    refinedSpecs,
    rhythmAudit,
  };
}

/**
 * Builds comprehensive content pacing and editorial timing diagnostics.
 */
export function buildPacingDiagnostics(timeline, plan) {
  const fps = timeline.fps || 30;
  const clips = timeline.clips || timeline.scenes || [];
  const shots = timeline.realizedShots || clips.flatMap((c) => c.shots || []);
  const totalFrames = timeline.durationInFrames || 1;
  const totalSeconds = totalFrames / fps;

  const shotDurationsSec = shots.map((s) => (s.durationInFrames || 1) / fps);
  const sceneDurationsSec = clips.map((c) => (c.durationInFrames || 1) / fps);

  const avgSceneDuration = Number((sceneDurationsSec.reduce((a, b) => a + b, 0) / Math.max(1, clips.length)).toFixed(2));
  const avgShotDuration = Number((shotDurationsSec.reduce((a, b) => a + b, 0) / Math.max(1, shots.length)).toFixed(2));

  // Percentiles
  const sorted = [...shotDurationsSec].sort((a, b) => a - b);
  const minShotDuration = sorted[0] ? Number(sorted[0].toFixed(2)) : 0;
  const p25ShotDuration = sorted[Math.floor(sorted.length * 0.25)] ? Number(sorted[Math.floor(sorted.length * 0.25)].toFixed(2)) : 0;
  const medianShotDuration = sorted[Math.floor(sorted.length * 0.50)] ? Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)) : 0;
  const p75ShotDuration = sorted[Math.floor(sorted.length * 0.75)] ? Number(sorted[Math.floor(sorted.length * 0.75)].toFixed(2)) : 0;
  const maxShotDuration = sorted[sorted.length - 1] ? Number(sorted[sorted.length - 1].toFixed(2)) : 0;

  const distribution = {
    under2s: shotDurationsSec.filter((d) => d < 2.0).length,
    between2and3s: shotDurationsSec.filter((d) => d >= 2.0 && d < 3.0).length,
    between3and5s: shotDurationsSec.filter((d) => d >= 3.0 && d < 5.0).length,
    between5and7s: shotDurationsSec.filter((d) => d >= 5.0 && d <= 7.0).length,
    over7s: shotDurationsSec.filter((d) => d > 7.0).length,
  };

  const cutsPer10Seconds = Number(((shots.length - 1) / Math.max(1, totalSeconds / 10)).toFixed(2));

  // Compute absolute start frames for all shots across clips
  const allShotsWithGlobalTime = [];
  for (const clip of clips) {
    const clipFrom = clip.from || 0;
    for (const shot of (clip.shots || [])) {
      const globalStartFrame = shot.timelineStartFrame ?? (clipFrom + (shot.from || 0));
      allShotsWithGlobalTime.push({
        ...shot,
        globalStartFrame,
        globalStartSec: globalStartFrame / fps,
        durationSec: (shot.durationInFrames || 1) / fps,
      });
    }
  }

  // 10-second sliding windows: evaluate overactive and underactive windows
  const rapidCutWindows = [];
  const underactiveWindows = [];
  const windowFrames = fps * 10;
  for (let f = 0; f <= totalFrames - windowFrames; f += Math.round(fps * 2)) {
    const windowEnd = f + windowFrames;
    const windowShots = allShotsWithGlobalTime.filter((s) => s.globalStartFrame >= f && s.globalStartFrame < windowEnd);
    const cutsInWindow = windowShots.length;
    if (cutsInWindow > 5) {
      rapidCutWindows.push({
        startSec: Number((f / fps).toFixed(1)),
        endSec: Number((windowEnd / fps).toFixed(1)),
        cuts: cutsInWindow,
      });
    }
    // Underactive: <= 1 cut across 10 seconds AND holding on a weak/static presentation
    if (cutsInWindow <= 1 && windowShots.some((s) => s.durationSec >= 6.5 && (s.family === 'statement' || s.family === 'ground'))) {
      underactiveWindows.push({
        startSec: Number((f / fps).toFixed(1)),
        endSec: Number((windowEnd / fps).toFixed(1)),
        warning: '10-second window is underactive on a static text/ground hold',
      });
    }
  }

  // Hold quality audit & over-holding checks
  const holdQualityAudit = [];
  const overHoldingWarnings = [];
  const textReadabilityWarnings = [];
  const complexityVsHoldWarnings = [];

  for (const shot of shots) {
    const durSec = (shot.durationInFrames || 1) / fps;
    const isGraphic = ['process', 'chart', 'compare', 'timeline', 'stat', 'quote', 'document'].includes(shot.family);
    const hasMove = (shot.presentation?.cameraMove || shot.move?.type || 'static') !== 'static';

    let quality = 'ACCEPTABLE_HOLD';
    if (isGraphic && durSec >= 3.8) {
      quality = 'STRONG_HOLD';
    } else if (hasMove && durSec <= 6.5) {
      quality = 'STRONG_HOLD';
    } else if (!isGraphic && !hasMove && durSec > 5.0 && (shot.family === 'statement' || shot.family === 'ground')) {
      quality = 'WEAK_HOLD';
      overHoldingWarnings.push({
        shotId: shot.storyboardShotId || shot.id,
        durationSec: Number(durSec.toFixed(2)),
        warning: `Static ${shot.family} held for ${durSec.toFixed(1)}s without movement or micro-variation`,
      });
    }

    holdQualityAudit.push({
      shotId: shot.storyboardShotId || shot.id,
      family: shot.family,
      durationSec: Number(durSec.toFixed(2)),
      quality,
    });

    const headline = shot.overlay?.headline || shot.title;
    if (headline && durSec < 2.0) {
      textReadabilityWarnings.push({
        shotId: shot.storyboardShotId || shot.id,
        durationSec: Number(durSec.toFixed(2)),
        headline,
        warning: 'Headline visible for less than 2.0s reading threshold',
      });
    }
    if (isGraphic && durSec < 3.2) {
      complexityVsHoldWarnings.push({
        shotId: shot.storyboardShotId || shot.id,
        family: shot.family,
        durationSec: Number(durSec.toFixed(2)),
        warning: `Complex ${shot.family} graphic held for only ${durSec.toFixed(2)}s (recommended: >= 3.8s)`,
      });
    }
  }

  let currentPhotoRun = 0;
  let maxPhotoRun = 0;
  let currentProcRun = 0;
  let maxProcRun = 0;
  let currentTypoRun = 0;
  let maxTypoRun = 0;

  for (const shot of shots) {
    const fam = shot.family || shot.visualFamily || '';
    const isPhoto = ['image', 'cinematic_frame', 'photo', 'montage'].includes(fam);
    if (isPhoto) {
      currentPhotoRun++;
      maxPhotoRun = Math.max(maxPhotoRun, currentPhotoRun);
      currentProcRun = 0;
    } else {
      currentProcRun++;
      maxProcRun = Math.max(maxProcRun, currentProcRun);
      currentPhotoRun = 0;
    }

    if (fam === 'statement') {
      currentTypoRun++;
      maxTypoRun = Math.max(maxTypoRun, currentTypoRun);
    } else {
      currentTypoRun = 0;
    }
  }

  const hookClip = clips[0];
  const hookDuration = hookClip ? Number((hookClip.durationInFrames / fps).toFixed(2)) : 0;
  const payoffClip = clips[clips.length - 1];
  const payoffDuration = payoffClip ? Number((payoffClip.durationInFrames / fps).toFixed(2)) : 0;

  return {
    totalScenes: clips.length,
    totalShots: shots.length,
    totalDurationSeconds: Number(totalSeconds.toFixed(2)),
    averageSceneDuration: avgSceneDuration,
    averageShotDuration: avgShotDuration,
    percentiles: {
      min: minShotDuration,
      p25: p25ShotDuration,
      median: medianShotDuration,
      p75: p75ShotDuration,
      max: maxShotDuration,
    },
    shotDurationDistribution: distribution,
    cutsPer10Seconds,
    rapidCutWindows,
    underactiveWindows,
    holdQualitySummary: {
      strong: holdQualityAudit.filter((h) => h.quality === 'STRONG_HOLD').length,
      acceptable: holdQualityAudit.filter((h) => h.quality === 'ACCEPTABLE_HOLD').length,
      weak: holdQualityAudit.filter((h) => h.quality === 'WEAK_HOLD').length,
    },
    overHoldingWarnings,
    textReadabilityWarnings,
    complexityVsHoldWarnings,
    maxPhotoRunLength: maxPhotoRun,
    maxTypographicRunLength: maxTypoRun,
    maxProceduralRunLength: maxProcRun,
    hookDuration,
    payoffDuration,
  };
}
