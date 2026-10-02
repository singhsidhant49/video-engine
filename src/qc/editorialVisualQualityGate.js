import { evaluateMotionValue } from '../composition/motion/motionChoreographer.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

function meaningfulBounds(elements, primary) {
  const meaningful = elements.filter((element) => {
    if (element.semanticRole?.endsWith('-root')) return false;
    if (element.importance === 'structural' && !['chart-series', 'comparison-side-a', 'comparison-side-b'].includes(element.semanticRole)) return false;
    return ['PRIMARY', 'SECONDARY'].includes(element.visualHierarchy?.tier)
      || ['chart_mark', 'chart_label', 'annotation'].includes(element.kind)
      || ['process-stage', 'comparison-side-a', 'comparison-side-b', 'chart-series'].includes(element.semanticRole);
  });
  if (!meaningful.length) return { ratio: 0, bounds: { x: primary.x, y: primary.y, width: 0, height: 0 }, count: 0 };
  const x = Math.min(...meaningful.map((item) => item.x));
  const y = Math.min(...meaningful.map((item) => item.y));
  const right = Math.max(...meaningful.map((item) => item.x + item.width));
  const bottom = Math.max(...meaningful.map((item) => item.y + item.height));
  const bounds = { x, y, width: right - x, height: bottom - y };
  return { ratio: Number((bounds.width * bounds.height / Math.max(1, primary.width * primary.height)).toFixed(3)), bounds, count: meaningful.length };
}

function minimumReadFrames(element, layout, fps = 30) {
  const words = String(element?.content || '').trim().split(/\s+/).filter(Boolean).length;
  const fontSize = layout?.fontSize || 28;
  return Math.max(8, Math.ceil((0.45 + words / 3.4) * fps * clamp(28 / fontSize, 0.75, 1.35)));
}

function focalChecks(solvedScene, motionPlan) {
  const warnings = [], states = [];
  for (const focal of motionPlan.focalStates) {
    const element = solvedScene.elements[focal.primaryFocalElementId];
    const frame = Math.round((focal.startFrame + focal.endFrame) / 2);
    if (!element) {
      warnings.push({ code: 'missing_focal_target', severity: 'hard', state: focal.state, elementId: focal.primaryFocalElementId });
      continue;
    }
    const opacity = evaluateMotionValue(motionPlan, element.id, 'opacity', frame);
    const emphasisTarget = motionPlan.tracks.some((track) => track.targetId === element.id && track.property === 'emphasis') ? element.id : element.parentId || element.id;
    const emphasis = evaluateMotionValue(motionPlan, emphasisTarget, 'emphasis', frame);
    const structuralRoot = element.semanticRole?.endsWith('-root') || element.semanticRole === 'chart-series';
    const sufficientWeight = structuralRoot || (element.visualHierarchy?.visualWeight || 0) >= 0.5;
    const isMedia = Boolean(solvedScene.mediaGeometry?.[element.id]);
    const mediaSubject = solvedScene.mediaGeometry?.[element.id]?.subjectSafeRegion;
    const occluded = isMedia
      ? Boolean(mediaSubject && intersects(mediaSubject, solvedScene.captionBox))
      : intersects(element, solvedScene.captionBox);
    if (opacity < 0.35) warnings.push({ code: 'focal_target_not_visible', severity: 'hard', state: focal.state, elementId: element.id });
    if (!sufficientWeight) warnings.push({ code: 'weak_focal_hierarchy', severity: 'editorial', state: focal.state, elementId: element.id });
    if (occluded) warnings.push({ code: 'focal_target_occluded', severity: 'hard', state: focal.state, elementId: element.id });
    const layout = solvedScene.textLayout[element.id];
    const requiredRead = layout ? minimumReadFrames(element, layout) : focal.minimumReadFrames;
    const introductionTrack = motionPlan.tracks.find((track) => track.targetId === element.id && ['opacity', 'reveal'].includes(track.property) && track.from <= 0.1 && track.to > 0.35);
    const introductionFrame = introductionTrack?.startFrame || 0;
    const available = Math.max(focal.endFrame - focal.startFrame + 1, focal.endFrame - introductionFrame + 1);
    if (available < Math.max(focal.minimumReadFrames, requiredRead)) warnings.push({ code: 'insufficient_text_read_time', severity: 'editorial', state: focal.state, elementId: element.id, availableFrames: available, requiredFrames: Math.max(focal.minimumReadFrames, requiredRead) });
    states.push({ ...focal, frame, opacity, emphasis, visualWeight: element.visualHierarchy?.visualWeight || 0, occluded, sufficientWeight });
  }
  return { warnings, states };
}

export function evaluateEditorialVisualQuality({ solvedScene, motionPlan, composition, comparisonSpec = null, chartSpec = null, fps = 30 }) {
  const elements = Object.values(solvedScene.elements);
  const warnings = [];
  const meaningfulOccupancy = meaningfulBounds(elements, solvedScene.regions.primary);
  const focal = focalChecks(solvedScene, motionPlan);
  warnings.push(...focal.warnings);

  if (meaningfulOccupancy.ratio < (solvedScene.format === 'shorts' ? 0.42 : 0.36)) warnings.push({ code: 'underutilized_canvas', severity: 'editorial', ratio: meaningfulOccupancy.ratio });
  const decorativeArea = elements.filter((item) => item.visualHierarchy?.tier === 'DECORATIVE' && !item.semanticRole?.endsWith('-root'))
    .reduce((sum, item) => sum + item.width * item.height, 0);
  const meaningfulArea = Math.max(1, meaningfulOccupancy.bounds.width * meaningfulOccupancy.bounds.height);
  if (decorativeArea > meaningfulArea * 0.55) warnings.push({ code: 'decorative_dominance', severity: 'editorial' });

  const primary = elements.filter((item) => item.visualHierarchy?.tier === 'PRIMARY');
  for (const state of focal.states.filter((item) => !['ESTABLISH', 'SETTLE'].includes(item.state))) {
    const scored = primary.map((item) => {
      const target = motionPlan.tracks.some((track) => track.targetId === item.id && track.property === 'emphasis') ? item.id : item.parentId || item.id;
      const emphasis = evaluateMotionValue(motionPlan, target, 'emphasis', state.frame);
      return { id: item.id, score: item.visualHierarchy.visualWeight * (0.62 + 0.38 * Math.max(0.35, emphasis)) };
    });
    const max = Math.max(0, ...scored.map((item) => item.score));
    const competitors = scored.filter((item) => max - item.score < 0.025);
    if (competitors.length > 3) warnings.push({ code: 'attention_competition', severity: 'editorial', state: state.state, elementIds: competitors.map((item) => item.id) });
  }

  const containerCount = elements.filter((item) => item.kind === 'shape' && ['comparison-field', 'stage-container'].includes(item.semanticRole)).length;
  if (containerCount >= 3 && containerCount >= primary.length) warnings.push({ code: 'over_containerized', severity: 'editorial' });
  if (solvedScene.topology === 'dual-field' && containerCount === 2 && solvedScene.elements.comparison_divider?.width > solvedScene.regions.primary.width * 0.15) warnings.push({ code: 'template_like_composition', severity: 'editorial' });
  if (solvedScene.chartCoordinateSystem && containerCount > 1) warnings.push({ code: 'generic_dashboard_aesthetic', severity: 'editorial' });

  const previewScale = solvedScene.format === 'shorts' ? 360 / solvedScene.viewport.width : 720 / solvedScene.viewport.width;
  for (const [elementId, layout] of Object.entries(solvedScene.textLayout)) {
    const element = solvedScene.elements[elementId];
    if (!['PRIMARY', 'SECONDARY'].includes(element?.visualHierarchy?.tier)) continue;
    const previewPixels = layout.fontSize * previewScale;
    if (previewPixels < 10.5) warnings.push({ code: 'preview_readability', severity: 'editorial', elementId, previewPixels: Number(previewPixels.toFixed(2)) });
  }

  if (chartSpec) {
    if (!chartSpec.takeaway || !solvedScene.elements.chart_takeaway) warnings.push({ code: 'chart_takeaway_missing', severity: 'hard' });
    if (!chartSpec.highlights.length) warnings.push({ code: 'chart_storytelling_weak', severity: 'editorial', detail: 'No highlighted point or category encodes the conclusion.' });
  }
  if (comparisonSpec) {
    if (!comparisonSpec.keyDifference || !solvedScene.elements.comparison_difference) warnings.push({ code: 'comparison_storytelling_weak', severity: 'hard' });
    if (!['spectrum', 'shared-baseline', 'delta-comparison', 'before-after'].includes(solvedScene.topology)
      && (solvedScene.elements.comparison_difference?.visualHierarchy?.visualWeight || 0) < 0.7) {
      warnings.push({ code: 'comparison_storytelling_weak', severity: 'editorial', detail: 'Key difference relies mainly on support copy.' });
    }
  }

  const score = (base, codes) => clamp(base - warnings.filter((warning) => codes.includes(warning.code)).length * 0.8, 1, 5);
  const scores = {
    clarity: score(5, ['chart_storytelling_weak', 'comparison_storytelling_weak', 'template_like_composition']),
    hierarchy: score(5, ['weak_focal_hierarchy', 'attention_competition']),
    composition: score(5, ['underutilized_canvas', 'decorative_dominance', 'over_containerized', 'generic_dashboard_aesthetic']),
    typography: score(5, ['preview_readability', 'insufficient_text_read_time']),
    motion: score(5, ['focal_target_not_visible', 'attention_competition']),
    rhythm: score(5, ['insufficient_text_read_time']),
    consistency: ['neutralDark', 'charcoal', 'paperLight', 'softRadial', 'subtleTexture', 'technicalGrid'].includes(solvedScene.backgroundSelection) ? 5 : 3,
    mobileQuality: solvedScene.format !== 'shorts' ? 5 : ['stacked-vertical', 'bar-horizontal', 'line', 'area', 'dot', 'progress', 'simple-stack'].includes(solvedScene.topology) ? 5 : 3,
  };
  const averageScore = Number((Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length).toFixed(2));
  const blocking = warnings.filter((warning) => warning.severity === 'hard'
    || ['underutilized_canvas', 'preview_readability', 'template_like_composition', 'generic_dashboard_aesthetic'].includes(warning.code));
  const publishable = blocking.length === 0 && averageScore >= 3.75;
  const repairActions = [...new Set(warnings.flatMap((warning) => ({
    template_like_composition: ['SWITCH_COMPARISON_GRAMMAR'], weak_focal_hierarchy: ['STRENGTHEN_FOCAL_HIERARCHY'],
    over_containerized: ['REMOVE_DECORATIVE_CONTAINER'], underutilized_canvas: ['EXPAND_MEANINGFUL_CONTENT'],
    decorative_dominance: ['REDUCE_DECORATION'], generic_dashboard_aesthetic: ['SIMPLIFY_CHART'],
    attention_competition: ['REDUCE_SUPPORT_CONTRAST'], preview_readability: ['INCREASE_PRIMARY_TYPE'],
    chart_storytelling_weak: ['ADD_CHART_HIGHLIGHT'], comparison_storytelling_weak: ['ENCODE_KEY_DIFFERENCE'],
    insufficient_text_read_time: ['EXTEND_READ_HOLD'],
  })[warning.code] || []))];
  return {
    version: 1, shotId: solvedScene.shotId, solvedSceneId: solvedScene.id, publishable,
    strength: publishable && averageScore >= 4.5 && warnings.length === 0 ? 'STRONG' : publishable ? 'ACCEPTABLE' : 'WEAK',
    averageScore, scores, meaningfulOccupancy, focalStates: focal.states, warnings,
    repairRequest: publishable ? null : { requested: true, actions: repairActions, requiresRecompile: true },
    summary: publishable ? 'Editorial hierarchy, format adaptation, and semantic motion are publishable.' : `Another composition pass is required: ${blocking.map((item) => item.code).join(', ') || 'editorial score below threshold'}.`,
    compositionObjective: composition.objective,
  };
}

export function continuityCompatibility(previousShot, shot, timeline) {
  if (!previousShot) return { score: 1, compatible: true, warnings: [], comparisons: {} };
  const previousScene = timeline.solvedScenes?.[previousShot.solvedSceneId];
  const scene = timeline.solvedScenes?.[shot.solvedSceneId];
  const comparisons = {
    backgroundFamily: [previousScene?.backgroundSelection || 'legacy', scene?.backgroundSelection || 'legacy'],
    accentUsage: 'shared-video-palette',
    headlinePosition: [previousScene?.regions?.title?.y ?? null, scene?.regions?.title?.y ?? null],
    motionIntensity: [timeline.motionPlans?.[previousShot.motionPlanId]?.motionDensityBudget || previousShot.presentation?.movementState || 'STATIC', timeline.motionPlans?.[shot.motionPlanId]?.motionDensityBudget || shot.presentation?.movementState || 'STATIC'],
    captionMode: [previousShot.captionPolicy?.mode, shot.captionPolicy?.mode],
    visualDensity: [previousShot.presentation?.visualDensity, shot.presentation?.visualDensity],
  };
  const warnings = [];
  if (comparisons.backgroundFamily[0] === 'paperLight' && comparisons.backgroundFamily[1] !== 'paperLight'
    || comparisons.backgroundFamily[1] === 'paperLight' && comparisons.backgroundFamily[0] !== 'paperLight') warnings.push('jarring_background_change');
  if (comparisons.motionIntensity[0] === 'HIGH' && comparisons.motionIntensity[1] === 'HIGH') warnings.push('adjacent_high_motion');
  const score = Number(clamp(1 - warnings.length * 0.3, 0, 1).toFixed(2));
  return { score, compatible: score >= 0.7, warnings, comparisons };
}
