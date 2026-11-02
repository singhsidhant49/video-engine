import { classifyMovementState } from '../remotion/engine/motion.js';

export function createPresentationMemory() {
  return {
    recentFamilies: [], recentVariants: [], recentLayouts: [], recentOverlayModes: [], recentCameraMoves: [],
    recentDensities: [], recentMovementStates: [], usedAssetSources: [], shotsSinceCameraMotion: 99,
  };
}

function remember(memory, key, value, limit = 8) {
  memory[key] = [...(memory[key] || []), value].slice(-limit);
}

function assetPool(sceneAssets, shotId) {
  const shotAsset = sceneAssets?.byShot?.[shotId];
  if (shotAsset) return [shotAsset];
  if (Array.isArray(sceneAssets)) return sceneAssets;
  const pool = [];
  if (sceneAssets?.primary && (!sceneAssets.primary.storyboardShotId || sceneAssets.primary.storyboardShotId === shotId)) {
    pool.push(sceneAssets.primary);
  }
  if (Array.isArray(sceneAssets?.alternates)) {
    pool.push(...sceneAssets.alternates.filter(Boolean));
  }
  if (!pool.length && sceneAssets?.primary) {
    pool.push(sceneAssets.primary);
  }
  return pool;
}

function compositionRejection(asset, format) {
  if (!asset) return 'composition_incompatible';
  const width = Number(asset.width) || 0, height = Number(asset.height) || 0;
  if (width && height && (Math.max(width, height) < 640 || Math.min(width, height) < 360)) return 'low_resolution';
  const aspect = width && height ? width / height : null;
  if (format === 'shorts' && aspect > 1.7 && !asset.focal && !asset.subjectBounds && !asset.focusBox) return 'no_mobile_safe_crop';
  if (format === 'landscape' && aspect && aspect < .50 && !asset.focal && !asset.subjectBounds && !asset.focusBox) return 'bad_crop';
  if ((asset.cropFitness ?? asset.crop_fitness) != null && (asset.cropFitness ?? asset.crop_fitness) < .38) return 'bad_crop';
  return null;
}

function selectEditorialAsset(pool, format, memory) {
  const rejectedAlternatives = [];
  for (const candidate of pool.slice(0, 6)) {
    const reason = compositionRejection(candidate, format);
    const isDuplicate = memory.usedAssetSources?.includes(candidate.src);
    if (!reason && !isDuplicate) {
      remember(memory, 'usedAssetSources', candidate.src, 30);
      return { asset: candidate, rejectedAlternatives };
    }
    if (isDuplicate) {
      rejectedAlternatives.push({ assetId: String(candidate.id || candidate.assetId || candidate.src), reason: 'duplicate_already_used' });
    } else if (reason) {
      rejectedAlternatives.push({ assetId: String(candidate.id || candidate.assetId || candidate.src), reason });
    }
  }
  const asset = pickAsset(pool, 0, memory);
  return { asset, rejectedAlternatives };
}

function pickAsset(pool, index, memory) {
  if (!pool.length) return null;
  const fresh = pool.find((asset) => !memory.usedAssetSources.includes(asset.src));
  const asset = fresh || pool[index % pool.length];
  remember(memory, 'usedAssetSources', asset.src, 30);
  return asset;
}

/**
 * Standardized Unified Camera Selection:
 * Minimalist palette: static | subtlePush | subtlePull (with optional subtle pan for wide photos).
 * Deliberate movement states: STATIC, SUBTLE.
 * Alternates smoothly between subtlePush and subtlePull, with intentional static holds every 3-4 shots.
 * Strict maximum scale factor of 1.04 (4% max motion) across all content types.
 */
function chooseCameraMove(shot, scene, family, asset, timing, memory, format = 'landscape', fps = 30) {
  if (family === 'montage') return 'static';
  if (family === 'document' || shot.role === 'evidence') return 'static';
  if (asset?.type === 'video') return 'static';
  if (shot.motionPreference === 'stable') return 'static';

  const durationSec = (timing?.durationInFrames || 0) / Math.max(1, fps);
  if (durationSec < 3.0) return 'static';

  const aspect = Number(asset?.width) / Math.max(1, Number(asset?.height));
  const targetAspect = format === 'shorts' ? 9 / 16 : 16 / 9;
  // If extreme vertical image on landscape (pillarbox), hold static to preserve clarity
  if (aspect < targetAspect * 0.6) return 'static';

  const recentMoves = memory.recentCameraMoves.slice(-4);
  const movingRun = [...recentMoves].reverse().findIndex((move) => move === 'static');
  const consecutiveMoving = movingRun === -1 ? recentMoves.length : movingRun;

  // 2. Intermittent deliberate still rests every 3–4 shots
  if (consecutiveMoving >= 3) return 'static';

  // 3. Wide panoramic photo slack: optional subtle horizontal drift (<= 3% travel)
  const horizontalSlack = aspect > targetAspect ? 1 - targetAspect / aspect : 0;
  const focal = asset?.focalPoint || asset?.focal || { x: .5, y: .5 };
  if (horizontalSlack >= .08 && (shot.role === 'context' || shot.role === 'establishing') && !recentMoves.includes('panRight') && !recentMoves.includes('panLeft')) {
    return focal.x >= .5 ? 'panRight' : 'panLeft';
  }

  // 4. Smooth alternating cycle between subtlePush and subtlePull
  const lastDirection = [...recentMoves].reverse().find((m) => m === 'subtlePush' || m === 'subtlePull');
  if (shot.role === 'detail') return 'subtlePush';
  if (shot.role === 'establishing') return 'subtlePull';
  if (lastDirection === 'subtlePush') return 'subtlePull';
  return 'subtlePush';
}

/** Keep the public motion vocabulary intentionally small and predictable. */
function normalizeCameraMove(move, asset) {
  const focal = asset?.focalPoint || asset?.focal || { x: .5, y: .5 };
  if (['subtlePush', 'push', 'slowZoomIn', 'detailCrop', 'detailReveal'].includes(move)) return 'subtlePush';
  if (['subtlePull', 'pull', 'slowZoomOut'].includes(move)) return 'subtlePull';
  if (move === 'panLeft' || move === 'panRight') return move;
  if (['pan', 'panUp', 'panDown', 'drift', 'parallax', 'focalPan'].includes(move)) return focal.x >= .5 ? 'panRight' : 'panLeft';
  return 'static';
}

function chooseMinimalCameraMove(shot, scene, family, asset, timing, memory, fps = 30) {
  if (family !== 'image' || asset?.type === 'video' || shot.motionPreference === 'stable' || shot.role === 'evidence') return 'static';
  const durationSec = (timing?.durationInFrames || 0) / Math.max(1, fps);
  if (durationSec < 5 || Number(memory.shotsSinceCameraMotion || 0) < 3) return 'static';
  const lastMove = [...(memory.recentCameraMoves || [])].reverse().find((m) => m === 'subtlePush' || m === 'subtlePull');
  return lastMove === 'subtlePush' ? 'subtlePull' : 'subtlePush';
}

function cameraMagnitudeFor(timing, fps, move) {
  if (move === 'static') return 0;
  if (move === 'panLeft' || move === 'panRight') return .03;
  // Standardized strict maximum scale factor of 1.04 (4% max motion) across all content types
  return 0.04;
}

function cameraPath(type, asset, magnitude = 0.04, base = 1) {
  const focal = asset?.focalPoint || asset?.focal || { x: 0.5, y: 0.45 };
  // Bounded strictly between 2% and 4% (scale <= 1.04)
  const subtle = Math.min(0.04, Math.max(0.02, Number(magnitude) || 0.04));

  if (type === 'static' || type === 'hold') {
    return { type: 'static', scale: [base, base], focus: [[focal.x, focal.y], [focal.x, focal.y]] };
  }
  if (type === 'subtlePull' || type === 'pull') {
    return { type: 'subtlePull', scale: [base * (1 + subtle), base], focus: [[focal.x, focal.y], [focal.x, focal.y]] };
  }
  if (['pan', 'panLeft', 'panRight'].includes(type)) {
    const direction = type === 'panLeft' ? -1 : 1;
    const travel = Math.min(.03, Math.max(.02, magnitude || .03));
    return {
      type: type === 'pan' ? 'panRight' : type,
      scale: [base * 1.04, base * 1.04],
      focus: [[Math.max(0, Math.min(1, focal.x - direction * travel)), focal.y], [focal.x, focal.y]],
    };
  }
  return {
    type: 'subtlePush',
    scale: [base, base * (1 + subtle)],
    focus: [[focal.x, Math.min(0.6, focal.y + 0.015)], [focal.x, focal.y]],
  };
}

function densityFor(family, shot, scene, recentDensities) {
  if (family === 'montage') return 'HIGH';
  if (family === 'ground' || (family === 'image' && !shot.textOverlay && shot.role !== 'establishing')) return 'LOW';
  if (family === 'image' && shot.role === 'evidence') return 'LOW';

  // Prevent runs of 3+ HIGH or 3+ LOW
  const lastTwo = recentDensities.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((d) => d === 'HIGH')) return 'MEDIUM';
  if (lastTwo.length === 2 && lastTwo.every((d) => d === 'LOW')) return 'MEDIUM';

  return 'MEDIUM';
}

export function realizeSceneShots({ scene, spec, sceneAssets, timings, sectionId, memory, coverageByShot = new Map(), visualPolicy = null, format = 'landscape', fps = 30 }) {
  let previousShotAsset = null;
  return scene.storyboardShots.map((shot, index) => {
    const pool = assetPool(sceneAssets, shot.id);
    const coverage = coverageByShot.get(shot.id) || null;
    const familyChoice = pool.length > 2 && (scene.purpose === 'hook' || shot.role === 'montage') ? 'montage' : 'image';
    const editorialSelection = selectEditorialAsset(pool, format, memory);
    let asset = ['image', 'montage'].includes(familyChoice) ? (editorialSelection?.asset || pickAsset(pool, index, memory)) : null;
    if (asset && previousShotAsset && asset.src === previousShotAsset.src) {
      const distinct = pool.find((item) => item?.src && item.src !== asset.src && !memory.usedAssetSources?.includes(item.src))
        || pool.find((item) => item?.src && item.src !== asset.src)
        || (sceneAssets?.alternates || []).find((item) => item?.src && item.src !== asset.src);
      if (distinct) asset = distinct;
    }
    previousShotAsset = asset;
    const variantChoice = familyChoice === 'montage' ? 'montage' : 'full';
    const family = variantChoice === 'montage' ? 'montage' : familyChoice;
    const variant = family === 'montage' ? 'dynamic' : variantChoice;
    // MEDIA_EDITORIAL is intentionally just image/video plus subtitles. No
    // chapter cards, statistic cards, diagram labels, or headline templates.
    const overlayMode = 'none';
    const timing = timings[index];
    let cameraMove = 'static';
    const authoredMove = shot.presentation?.cameraMove;
    if (visualPolicy?.motionPreset === 'minimal') {
      cameraMove = chooseMinimalCameraMove(shot, scene, family, asset, timing, memory, fps);
    } else if (authoredMove && authoredMove !== 'auto') {
      cameraMove = authoredMove;
      // Persisted/LLM-authored storyboards can request the same zoom for every
      // scene. Preserve the authored move unless it would become the third
      // identical effect in a row, then let the editorial selector introduce
      // a restrained counter-move or intentional hold.
      const recentMoves = memory.recentCameraMoves.slice(-2);
      if (cameraMove !== 'static' && recentMoves.length === 2 && recentMoves.every((move) => move === cameraMove)) {
        cameraMove = chooseCameraMove({ ...shot, presentation: {} }, scene, family, asset, timing, memory, format, fps);
        if (cameraMove === authoredMove) {
          cameraMove = authoredMove === 'subtlePush' ? 'subtlePull' : 'static';
        }
      }
    } else {
      const isStillImage = asset && asset.type !== 'video';
      if (isStillImage && shot.role !== 'evidence' && scene.kind !== 'statistic') {
        cameraMove = chooseCameraMove(shot, scene, family, asset, timing, memory, format, fps);
      }
    }
    cameraMove = normalizeCameraMove(cameraMove, asset);
    const movementState = classifyMovementState(cameraMove);
    const cameraMagnitude = visualPolicy?.motionPreset === 'minimal' && cameraMove !== 'static'
      ? Math.min(.04, cameraMagnitudeFor(timing, fps, cameraMove))
      : cameraMagnitudeFor(timing, fps, cameraMove);
    const density = densityFor(family, shot, scene, memory.recentDensities);
    const layout = `${family}:${variant}`;
    const montageAssets = family === 'montage' ? pool.filter((item) => item?.src !== asset?.src && !editorialSelection?.rejectedAlternatives.some((rejected) => rejected.assetId === String(item.id || item.assetId || item.src))).slice(0, 4) : [];

    const presentation = {
      family,
      variant,
      layout,
      crop: variant === 'editorial' ? 'editorial' : 'cover',
      focalPoint: asset?.focal || null,
      overlayMode,
      cameraMove,
      cameraMagnitude,
      movementState,
      transitionIn: index === 0 ? 'scene' : 'cut',
      transitionOut: 'cut',
      treatment: spec.treatment,
      visualDensity: density,
      representationDecision: coverage ? {
        originalRepresentation: coverage.primaryRepresentation,
        selectedRepresentation: 'media',
        reason: null,
      } : null,
    };
    if (presentation.representationDecision
      && presentation.representationDecision.originalRepresentation !== presentation.representationDecision.selectedRepresentation) {
      presentation.representationDecision.reason = `Coverage representation could not be executed directly; selected family "${family}" after asset/spec resolution.`;
    }

    remember(memory, 'recentFamilies', family);
    remember(memory, 'recentVariants', `${family}:${variant}`);
    remember(memory, 'recentLayouts', layout);
    remember(memory, 'recentOverlayModes', overlayMode);
    remember(memory, 'recentCameraMoves', cameraMove);
    remember(memory, 'recentMovementStates', movementState);
    remember(memory, 'recentDensities', density);
    memory.shotsSinceCameraMotion = cameraMove === 'static'
      ? Number(memory.shotsSinceCameraMotion || 0) + 1
      : 0;

    return {
      storyboardShotId: shot.id,
      sceneId: scene.id,
      sectionId,
      role: shot.role,
      visualIntent: scene.visualIntent,
      visualConcept: shot.visualConcept,
      mediaPreference: shot.mediaPreference,
      evidenceRequirement: shot.evidenceRequirement,
      asset,
      assets: montageAssets,
      presentation,
      timing,
      move: cameraPath(cameraMove, asset, cameraMagnitude || spec.camera?.magnitude || 0.05, spec.camera?.baseScale || 1),
      rejectedAlternatives: editorialSelection?.rejectedAlternatives || [],
    };
  });
}
