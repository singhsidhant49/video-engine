import { MOVEMENT_STATES, classifyMovementState } from '../remotion/engine/motion.js';
import { classifyInformationType } from '../storyboard/visualCoveragePlan.js';

const STRUCTURED = new Set(['stat', 'compare', 'list', 'process', 'timeline', 'chart', 'document', 'ui', 'code', 'diagram', 'map']);
const FAMILY_BY_KIND = {
  statistic: 'stat', comparison: 'compare', list: 'list', process: 'process', timeline: 'timeline',
  chart: 'chart', document: 'document', ui: 'ui', code: 'code', diagram: 'diagram', map: 'map', statement: 'statement', chapter: 'chapter',
  atmosphere: 'image', subject: 'image', quote: 'quote',
};
const FAMILY_BY_REPRESENTATION = {
  media: 'image', code: 'code', ui: 'ui', process: 'process', diagram: 'diagram', comparison: 'compare',
  timeline: 'timeline', map: 'map', chart: 'chart', document: 'document', typography: 'statement',
};

const last = (items) => items[items.length - 1];
const recentCount = (items, value, limit = 3) => items.slice(-limit).filter((item) => item === value).length;

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
  if (sceneAssets?.primary && (!sceneAssets.primary.storyboardShotId || sceneAssets.primary.storyboardShotId === shotId)) return [sceneAssets.primary];
  if (Array.isArray(sceneAssets)) return sceneAssets;
  return [];
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

function supportsStructured(scene, family) {
  if (family === 'statement' || family === 'chapter') return Boolean(scene.text?.headline || scene.emphasis);
  if (family === 'quote') return Boolean(scene.data?.quote);
  if (family === 'document') return Boolean(scene.data?.headline || scene.narration);
  return true;
}

function chooseFamily(shot, scene, pool, memory, spec = null, coverage = null) {
  const infoType = classifyInformationType(scene);
  const coverageFamily = coverage ? FAMILY_BY_REPRESENTATION[coverage.primaryRepresentation] : null;
  const recastedFamily = spec?.family && spec.family !== 'image' ? spec.family : null;
  const semanticFamily = recastedFamily || (FAMILY_BY_KIND[scene.kind] !== 'image' ? FAMILY_BY_KIND[scene.kind] : null) || FAMILY_BY_KIND[infoType] || 'image';
  const hasAsset = pool.length > 0;
  const specificReal = shot.entities?.length || ['entity', 'product', 'location', 'historical', 'evidence', 'document'].includes(shot.assetIntent);

  let family;
  if (shot.mediaPreference === 'real' && hasAsset) {
    family = 'image';
  } else if (coverageFamily && coverage.primaryRepresentation !== 'media' && (coverage.primaryRepresentation !== 'typography' || !hasAsset || shot.mediaPreference === 'procedural' || scene.kind === 'statement')) {
    family = coverage.primaryRepresentation === 'chart' && scene.kind === 'statistic' ? 'stat' : coverageFamily;
  } else if (recastedFamily) {
    family = recastedFamily;
  } else if (hasAsset && (specificReal || ['establishing', 'subject', 'context', 'detail', 'evidence', 'atmosphere'].includes(shot.role) || shot.mediaPreference !== 'procedural')) {
    family = 'image';
  } else if (shot.mediaPreference === 'procedural' && STRUCTURED.has(semanticFamily)) {
    family = semanticFamily;
  } else if (STRUCTURED.has(semanticFamily) && ['graphic', 'evidence'].includes(shot.role)) {
    family = semanticFamily;
  } else if (hasAsset) {
    family = 'image';
  } else if (STRUCTURED.has(semanticFamily)) {
    family = semanticFamily;
  } else {
    // When no acceptable media exists, NEVER default to image or generic statement!
    switch (infoType) {
      case 'code': family = 'code'; break;
      case 'interface': family = 'ui'; break;
      case 'process': family = 'process'; break;
      case 'comparison': family = 'compare'; break;
      case 'relationship': family = 'diagram'; break;
      case 'location': family = 'map'; break;
      case 'timeline': family = 'timeline'; break;
      case 'data': family = 'chart'; break;
      case 'evidence': family = 'document'; break;
      default:
        family = scene.text?.headline || scene.emphasis ? 'statement' : 'ground';
        break;
    }
  }

  // Prevent 3+ consecutive structured procedural cards in a row
  const recentFamilies = memory.recentFamilies.slice(-2);
  const structuredRun = recentFamilies.length === 2 && recentFamilies.every((item) => STRUCTURED.has(item));
  if (STRUCTURED.has(family) && structuredRun && hasAsset && shot.mediaPreference !== 'procedural') family = 'image';
  return family;
}

function chooseImageVariant({ shot, asset, scene, memory, pool }) {
  if (scene.purpose === 'hook' && shot.role === 'establishing' && pool.length >= 2) return 'montage';
  const portrait = asset && asset.height > asset.width * 1.15;
  // Never use floating phone depth stamp; use editorial split or full crop
  const candidates = portrait
    ? ['editorial', 'split', 'full']
    : shot.role === 'detail' ? ['editorial', 'full']
      : shot.role === 'subject' ? ['full', 'editorial', 'split']
        : ['full', 'editorial', 'split'];
  return candidates.find((variant) => recentCount(memory.recentVariants, `image:${variant}`, 2) === 0) || candidates[0];
}

function chooseVariant(family, shot, scene, spec, asset, pool, memory) {
  if (family === 'image') return chooseImageVariant({ shot, asset, scene, memory, pool });
  if (family === 'statement') {
    const candidates = ['kinetic', 'highlight', 'words'];
    return candidates.find((v) => !memory.recentVariants.includes(`statement:${v}`)) || 'kinetic';
  }
  if (family === 'stat') return asset ? 'split' : 'hero';
  if (family === 'compare') return 'columns';
  if (family === 'list') return 'ledger';
  if (family === 'process') return 'flow';
  if (family === 'diagram') return 'nodes';
  if (family === 'map') return 'supplyChain';
  if (family === 'code') return 'syntax';
  if (family === 'ui') return 'workspace';
  return spec.variant || scene.template || 'default';
}

function chooseOverlayMode(family, shot, index) {
  if (['stat', 'compare', 'list', 'process', 'timeline', 'chart', 'quote', 'document', 'ui', 'code', 'diagram', 'map'].includes(family)) return 'primary';
  if (family === 'statement' || family === 'chapter') return 'primary';
  if (family === 'image' && index === 0 && shot.textOverlay) return 'minimal';
  return 'none';
}

/**
 * Editorial camera selection:
 * Deliberate movement states: STATIC, SUBTLE, ACTIVE.
 * Prohibits identical camera move > 2 consecutive shots.
 * Introduces intentional static holds on documents, charts, quotes, hero photos.
 */
function chooseCameraMove(shot, scene, family, asset, timing, memory, format = 'landscape', fps = 30) {
  // Charts, quotes, code, ui, diagrams, maps, and montage are always intentionally static
  if (['chart', 'quote', 'code', 'ui', 'diagram', 'map', 'montage'].includes(family)) return 'static';
  if (family === 'document' || shot.role === 'evidence') return 'static';
  // Moving footage already supplies motion; never stack synthetic Ken Burns motion on it.
  if (asset?.type === 'video') return 'static';
  if (shot.motionPreference === 'stable') return 'static';

  const durationSec = (timing?.durationInFrames || 0) / Math.max(1, fps);
  if (durationSec < 3.6) return 'static';

  const recentMoves = memory.recentCameraMoves.slice(-3);
  const focal = asset?.focalPoint || asset?.focal || { x: .5, y: .5 };
  const aspect = Number(asset?.width) / Math.max(1, Number(asset?.height));
  const targetAspect = format === 'shorts' ? 9 / 16 : 16 / 9;
  const horizontalSlack = aspect > targetAspect ? 1 - targetAspect / aspect : 0;
  const importantMoment = ['hook', 'reveal', 'payoff'].includes(scene?.purpose) || Number(scene?.intensity || 0) >= 4;
  const candidates = new Map([['static', 1]]);
  const add = (move, score) => candidates.set(move, Math.max(candidates.get(move) ?? -Infinity, score));

  if (shot.role === 'detail') add('subtlePush', 8);
  if (shot.role === 'establishing' || ['conclusion', 'transition'].includes(scene?.purpose)) add('subtlePull', 6);
  if (importantMoment || shot.assetIntent === 'action' || shot.visualIntent === 'identify') add('subtlePush', 5.5);

  // Judge pan feasibility from the real cover crop, not from a coarse portrait/
  // landscape label. A common 3:2 photograph has useful vertical travel on a
  // 16:9 canvas even though it is not a portrait image.
  if (horizontalSlack >= .08) add(focal.x >= .5 ? 'panRight' : 'panLeft', shot.role === 'context' ? 6.2 : 4.4);

  const last = recentMoves.at(-1);
  const lastTwo = recentMoves.slice(-2);
  const movingRun = [...recentMoves].reverse().findIndex((move) => move === 'static');
  const consecutiveMoving = movingRun === -1 ? recentMoves.length : movingRun;
  const consecutiveStatic = [...recentMoves].reverse().findIndex((move) => move !== 'static');
  const staticRun = consecutiveStatic === -1 ? recentMoves.length : consecutiveStatic;

  for (const [move, score] of candidates) {
    let adjusted = score;
    if (move === last && move !== 'static') adjusted -= 3.5;
    if (lastTwo.length === 2 && lastTwo.every((value) => value === move)) adjusted -= 6;
    if (move === 'static' && consecutiveMoving >= 3) adjusted += 5;
    if (move !== 'static' && staticRun >= 2) adjusted += 5;
    candidates.set(move, adjusted);
  }

  // STATIC remains a deliberate option, but variety is achieved by choosing a
  // different feasible motion before freezing a healthy still image.
  return [...candidates.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
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
  if (durationSec < 6 || Number(memory.shotsSinceCameraMotion || 0) < 4) return 'static';
  const majorBeat = ['hook', 'reveal', 'payoff', 'conclusion'].includes(scene?.purpose);
  if (!majorBeat) return 'static';
  return scene?.purpose === 'hook' || scene?.purpose === 'conclusion' ? 'subtlePull' : 'subtlePush';
}

function cameraMagnitudeFor(timing, fps, move) {
  if (move === 'static') return 0;
  if (move === 'panLeft' || move === 'panRight') return .03;
  const durationSec = (timing?.durationInFrames || 0) / Math.max(1, fps);
  if (durationSec <= 3.5) return 0.04;
  if (durationSec >= 7.0) return 0.08;
  const t = (durationSec - 3.5) / (7.0 - 3.5);
  return Number((0.04 + t * 0.04).toFixed(3));
}

function cameraPath(type, asset, magnitude = 0.06, base = 1) {
  const focal = asset?.focalPoint || asset?.focal || { x: 0.5, y: 0.45 };
  const subtle = Math.min(0.08, Math.max(0.04, Number(magnitude) || 0.06));

  if (type === 'static' || type === 'hold') {
    return { type: 'static', scale: [base, base], focus: [[focal.x, focal.y], [focal.x, focal.y]] };
  }
  if (type === 'subtlePull' || type === 'pull') {
    return { type: 'subtlePull', scale: [base * (1 + subtle), base], focus: [[focal.x, focal.y], [focal.x, focal.y]] };
  }
  if (['pan', 'panLeft', 'panRight'].includes(type)) {
    const direction = type === 'panLeft' ? -1 : 1;
    const travel = Math.min(.04, Math.max(.02, magnitude || .03));
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
  if (family === 'montage' || (STRUCTURED.has(family) && ['compare', 'timeline', 'chart'].includes(family))) return 'HIGH';
  if (family === 'ground' || (family === 'image' && !shot.textOverlay && shot.role !== 'establishing')) return 'LOW';
  if (family === 'image' && shot.role === 'evidence') return 'LOW';

  // Prevent runs of 3+ HIGH or 3+ LOW
  const lastTwo = recentDensities.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((d) => d === 'HIGH')) return 'MEDIUM';
  if (lastTwo.length === 2 && lastTwo.every((d) => d === 'LOW')) return 'MEDIUM';

  return 'MEDIUM';
}

export function realizeSceneShots({ scene, spec, sceneAssets, timings, sectionId, memory, coverageByShot = new Map(), visualPolicy = null, format = 'landscape', fps = 30 }) {
  return scene.storyboardShots.map((shot, index) => {
    const pool = assetPool(sceneAssets, shot.id);
    const coverage = coverageByShot.get(shot.id) || null;
    const routedRepresentation = coverage?.representationDecision?.selectedRepresentation || coverage?.primaryRepresentation;
    const mediaEditorial = visualPolicy?.useMediaEditorial === true
      && shot.mediaPreference !== 'procedural'
      && (!coverage || routedRepresentation === 'media');
    const familyChoice = mediaEditorial ? (pool.length > 2 && (scene.purpose === 'hook' || shot.role === 'montage') ? 'montage' : 'image') : chooseFamily(shot, scene, pool, memory, spec, coverage);
    const editorialSelection = mediaEditorial ? selectEditorialAsset(pool, format, memory) : null;
    const asset = ['image', 'montage'].includes(familyChoice) ? (editorialSelection?.asset || pickAsset(pool, index, memory)) : null;
    const variantChoice = mediaEditorial ? (familyChoice === 'montage' ? 'montage' : 'full') : chooseVariant(familyChoice, shot, scene, spec, asset, pool, memory);
    const family = variantChoice === 'montage' ? 'montage' : familyChoice;
    const variant = family === 'montage' ? 'dynamic' : variantChoice;
    // MEDIA_EDITORIAL is intentionally just image/video plus subtitles. No
    // chapter cards, statistic cards, diagram labels, or headline templates.
    const overlayMode = mediaEditorial ? 'none' : chooseOverlayMode(family, shot, index);
    const timing = timings[index];
    let cameraMove = 'static';
    const authoredMove = shot.presentation?.cameraMove;
    if (mediaEditorial && visualPolicy?.motionPreset === 'minimal') {
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
    } else if (mediaEditorial) {
      const isStillImage = asset && asset.type !== 'video';
      if (isStillImage && shot.role !== 'evidence' && scene.kind !== 'statistic') {
        cameraMove = chooseCameraMove(shot, scene, family, asset, timing, memory, format, fps);
      }
    } else {
      cameraMove = chooseCameraMove(shot, scene, family, asset, timing, memory, format, fps);
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
        selectedRepresentation: family === 'image' || family === 'montage' ? 'media'
          : family === 'compare' ? 'comparison'
            : family === 'stat' ? 'chart'
              : ['statement', 'chapter', 'quote', 'ground'].includes(family) ? 'typography' : family,
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
