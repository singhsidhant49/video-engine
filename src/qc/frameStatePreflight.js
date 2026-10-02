import { evaluateMotionValue } from '../composition/motion/motionChoreographer.js';

const intersects = (a, b, tolerance = 0) => a.x + tolerance < b.x + b.width
  && a.x + a.width - tolerance > b.x
  && a.y + tolerance < b.y + b.height
  && a.y + a.height - tolerance > b.y;

function pointInRect(point, rect, margin = 1) {
  return point.x > rect.x + margin && point.x < rect.x + rect.width - margin
    && point.y > rect.y + margin && point.y < rect.y + rect.height - margin;
}

function segmentIntersectsRect(a, b, rect) {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  if (maxX <= rect.x || minX >= rect.x + rect.width || maxY <= rect.y || minY >= rect.y + rect.height) return false;
  if (a.x === b.x) return a.x > rect.x && a.x < rect.x + rect.width;
  if (a.y === b.y) return a.y > rect.y && a.y < rect.y + rect.height;
  // Conservative bounding-box result for diagonal/curved segments.
  return true;
}

function eventFrames(motionPlan) {
  const frames = new Set([0, motionPlan.durationInFrames - 1]);
  for (const track of motionPlan.tracks) {
    frames.add(track.startFrame);
    frames.add(track.endFrame);
    frames.add(Math.round((track.startFrame + track.endFrame) / 2));
  }
  const sorted = [...frames].filter((frame) => frame >= 0 && frame < motionPlan.durationInFrames).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) frames.add(Math.round((sorted[i - 1] + sorted[i]) / 2));
  return [...frames].sort((a, b) => a - b);
}

export function preflightSolvedScene({ solvedScene, motionPlan, composition, mediaSceneSpec = null }) {
  const issues = [];
  const viewport = { x: 0, y: 0, width: solvedScene.viewport.width, height: solvedScene.viewport.height };
  const caption = solvedScene.regions.captions;
  const elements = Object.values(solvedScene.elements);
  const groups = elements.filter((element) => element.kind === 'group');
  const layoutGroups = groups.filter((element) => !element.semanticRole.endsWith('-root') && element.semanticRole !== 'chart-series');
  const protectedElements = elements.filter((element) => element.kind === 'group' || (['text', 'chart_label', 'annotation'].includes(element.kind) && element.semanticRole !== 'title'));

  for (const element of elements) {
    if (element.x < viewport.x || element.y < viewport.y || element.x + element.width > viewport.width || element.y + element.height > viewport.height) {
      issues.push({ code: 'element_outside_viewport', severity: 'hard', elementId: element.id });
    }
    if (['text', 'chart_label', 'annotation'].includes(element.kind)) {
      const text = solvedScene.textLayout[element.id];
      if (!text || text.constraintUnsatisfied || text.measuredWidth > element.width + 1 || text.measuredHeight > element.height + 1) {
        issues.push({ code: 'text_overflow', severity: 'hard', elementId: element.id });
      }
      const minimum = element.semanticRole === 'source' ? (solvedScene.format === 'shorts' ? 22 : 17)
        : element.semanticRole === 'title' ? (solvedScene.format === 'shorts' ? 22 : 20)
          : element.visualHierarchy?.tier === 'PRIMARY' ? (solvedScene.format === 'shorts' ? 32 : 24)
            : (solvedScene.format === 'shorts' ? 26 : 20);
      if (text && text.fontSize < minimum) issues.push({ code: 'minimum_font_size', severity: 'hard', elementId: element.id, fontSize: text.fontSize, minimum });
    }
  }

  for (const group of layoutGroups) {
    if (!intersects(group, solvedScene.regions.primary)
      || group.x < solvedScene.regions.primary.x || group.y < solvedScene.regions.primary.y
      || group.x + group.width > solvedScene.regions.primary.x + solvedScene.regions.primary.width
      || group.y + group.height > solvedScene.regions.primary.y + solvedScene.regions.primary.height) {
      issues.push({ code: 'element_outside_safe_area', severity: 'hard', elementId: group.id });
    }
    if (intersects(group, caption)) issues.push({ code: 'caption_collision', severity: 'hard', elementId: group.id });
  }
  for (let i = 0; i < layoutGroups.length; i++) for (let j = i + 1; j < layoutGroups.length; j++) {
    if (intersects(layoutGroups[i], layoutGroups[j], 1)) issues.push({ code: 'element_overlap', severity: 'hard', elementId: layoutGroups[i].id, otherId: layoutGroups[j].id });
  }

  for (const route of solvedScene.connectorRoutes) {
    for (const target of protectedElements.filter((element) => ![route.from, route.to, element.parentId].includes(element.id)
      && ![route.from, route.to].includes(element.parentId))) {
      for (let i = 1; i < route.points.length; i++) {
        if (segmentIntersectsRect(route.points[i - 1], route.points[i], target)) {
          issues.push({ code: target.kind === 'text' ? 'connector_label_collision' : 'connector_element_intersection', severity: 'hard', elementId: route.id, otherId: target.id });
          break;
        }
      }
    }
  }

  if (solvedScene.occupancy.ratio < (solvedScene.format === 'shorts' ? 0.55 : 0.45)) {
    issues.push({ code: 'dead_space', severity: 'warning', ratio: solvedScene.occupancy.ratio });
  }
  const required = new Set([
    ...elements.filter((element) => element.semanticRole === 'title').map((element) => element.id),
    ...composition.readingOrder,
  ]);
  for (const id of required) if (!solvedScene.elements[id]) issues.push({ code: 'required_element_absent', severity: 'hard', elementId: id });

  const frames = eventFrames(motionPlan);
  const frameStates = frames.map((frame) => ({
    frame,
    activeTrackCount: motionPlan.tracks.filter((track) => frame >= track.startFrame && frame < track.endFrame).length,
    state: Object.fromEntries(required.size ? [...required].filter((id) => id !== 'process_title').map((id) => [id, {
      emphasis: evaluateMotionValue(motionPlan, id, 'emphasis', frame),
      opacity: evaluateMotionValue(motionPlan, id, 'opacity', frame),
    }]) : []),
  }));
  const frame0 = frameStates.find((state) => state.frame === 0);
  for (const id of composition.readingOrder.filter((item) => solvedScene.elements[item]?.kind === 'group')) {
    if (!frame0?.state[id] || frame0.state[id].emphasis < 0.35 || frame0.state[id].opacity <= 0) {
      issues.push({ code: 'frame0_incompleteness', severity: 'hard', elementId: id });
    }
  }
  for (const track of motionPlan.tracks.filter((item) => item.property === 'emphasis' && item.to >= 1)) {
    if (track.startFrame > motionPlan.durationInFrames * 0.85) issues.push({ code: 'late_unreadable_reveal', severity: 'hard', elementId: track.targetId });
    if (motionPlan.durationInFrames - track.endFrame < 8) issues.push({ code: 'insufficient_final_hold', severity: 'hard', elementId: track.targetId });
  }

  for (const state of frameStates) {
    if (state.activeTrackCount > motionPlan.maximumSimultaneousTracks) {
      issues.push({ code: 'simultaneous_motion_budget', severity: 'warning', frame: state.frame, activeTracks: state.activeTrackCount, budget: motionPlan.maximumSimultaneousTracks });
    }
  }
  const lifecycleOrder = ['ENTER', 'ESTABLISH', 'EXPLAIN', 'EMPHASIZE', 'SETTLE', 'EXIT'];
  if (motionPlan.lifecycle.map((phase) => phase.phase).join('|') !== lifecycleOrder.join('|')) {
    issues.push({ code: 'invalid_shot_lifecycle', severity: 'hard' });
  }
  const settle = motionPlan.lifecycle.find((phase) => phase.phase === 'SETTLE');
  if (!settle || settle.endFrame - settle.startFrame < motionPlan.frameQuality.minimumFinalHold) {
    issues.push({ code: 'insufficient_final_hold', severity: 'hard', elementId: solvedScene.shotId });
  }
  if (composition.captionPolicy.mode === 'INTEGRATED') {
    const missingEquivalent = composition.captionPolicy.equivalentTextElementIds.filter((id) => !solvedScene.elements[id]);
    if (!composition.captionPolicy.equivalentTextElementIds.length || missingEquivalent.length) {
      issues.push({ code: 'integrated_caption_equivalence_missing', severity: 'hard', elementIds: missingEquivalent });
    }
  }

  if (!motionPlan.frameQuality.frame0Valid || motionPlan.frameQuality.firstMeaningfulFrame > Math.round(motionPlan.durationInFrames * 0.15)) {
    issues.push({ code: 'frame0_incompleteness', severity: 'hard', elementId: solvedScene.shotId });
  }
  if (motionPlan.durationInFrames - motionPlan.frameQuality.finalStateFrame < motionPlan.frameQuality.minimumFinalHold) {
    issues.push({ code: 'insufficient_final_hold', severity: 'hard', elementId: solvedScene.shotId });
  }

  for (const focal of motionPlan.focalStates || []) {
    const element = solvedScene.elements[focal.primaryFocalElementId];
    if (!element) {
      issues.push({ code: 'missing_focal_target', severity: 'hard', elementId: focal.primaryFocalElementId, state: focal.state });
      continue;
    }
    const frame = Math.round((focal.startFrame + focal.endFrame) / 2);
    if (evaluateMotionValue(motionPlan, element.id, 'opacity', frame) < 0.35) issues.push({ code: 'focal_target_not_visible', severity: 'hard', elementId: element.id, state: focal.state });
    if (!element.semanticRole.endsWith('-root') && element.semanticRole !== 'chart-series' && element.visualHierarchy.visualWeight < 0.5) issues.push({ code: 'weak_focal_hierarchy', severity: 'warning', elementId: element.id, state: focal.state });
    const isMedia = Boolean(solvedScene.mediaGeometry?.[element.id]);
    const mediaSubject = solvedScene.mediaGeometry?.[element.id]?.subjectSafeRegion;
    if (isMedia) {
      if (mediaSubject && intersects(mediaSubject, caption)) {
        issues.push({ code: 'subject_caption_collision', severity: 'hard', elementId: element.id, state: focal.state });
      }
    } else if (intersects(element, caption)) {
      issues.push({ code: 'focal_target_occluded', severity: 'hard', elementId: element.id, state: focal.state });
    }
    if (focal.endFrame - focal.startFrame + 1 < focal.minimumReadFrames) issues.push({ code: 'insufficient_text_read_time', severity: 'warning', elementId: element.id, state: focal.state });
  }

  if (solvedScene.topology.includes('comparison') || ['dual-field', 'shared-baseline', 'spectrum', 'before-after', 'two-column-editorial', 'stacked-vertical'].includes(solvedScene.topology)) {
    const sideA = solvedScene.elements.comparison_side_a, sideB = solvedScene.elements.comparison_side_b;
    if (sideA && sideB) {
      const ratio = (sideA.width * sideA.height) / Math.max(1, sideB.width * sideB.height);
      if (ratio > 2.2 || ratio < 1 / 2.2) issues.push({ code: 'unbalanced_comparison_sides', severity: 'warning', ratio });
    }
    const pivot = composition.semanticEvents.find((event) => event.type === 'comparisonPivot');
    if (pivot && pivot.frame > motionPlan.durationInFrames * 0.65) issues.push({ code: 'late_second_side_emphasis', severity: 'hard', frame: pivot.frame });
    const divider = solvedScene.elements.comparison_divider;
    if (divider && divider.width * divider.height > solvedScene.regions.primary.width * solvedScene.regions.primary.height * 0.18) {
      issues.push({ code: 'oversized_comparison_divider', severity: 'warning', elementId: divider.id });
    }
  }

  const chartLabels = elements.filter((element) => ['chart_label', 'annotation'].includes(element.kind));
  for (let i = 0; i < chartLabels.length; i++) for (let j = i + 1; j < chartLabels.length; j++) {
    if (chartLabels[i].parentId !== chartLabels[j].parentId && intersects(chartLabels[i], chartLabels[j], 2)) {
      issues.push({ code: 'chart_label_collision', severity: 'hard', elementId: chartLabels[i].id, otherId: chartLabels[j].id });
    }
  }

  if (mediaSceneSpec) {
    for (const [elementId, geometry] of Object.entries(solvedScene.mediaGeometry || {})) {
      const path = solvedScene.cameraPaths[elementId];
      const subject = geometry.subjectSafeRegion;
      if (subject) {
        const maxScale = Math.max(path?.start.scale || 1, path?.end.scale || 1);
        const insetX = geometry.rect.width * (maxScale - 1) / (2 * maxScale), insetY = geometry.rect.height * (maxScale - 1) / (2 * maxScale);
        const visible = { x: geometry.rect.x + insetX, y: geometry.rect.y + insetY, width: geometry.rect.width - insetX * 2, height: geometry.rect.height - insetY * 2 };
        if (!intersects(subject, visible) || subject.x < visible.x || subject.y < visible.y || subject.x + subject.width > visible.x + visible.width || subject.y + subject.height > visible.y + visible.height) issues.push({ code: 'camera_subject_clipped', severity: 'hard', elementId });
        if (intersects(subject, solvedScene.captionBox)) issues.push({ code: 'subject_caption_collision', severity: 'hard', elementId });
      }
      const sourceWidth = geometry.sourceDimensions.width || 0;
      const requiredSourceWidth = geometry.rect.width / Math.max(.01, geometry.crop.width) * Math.max(path?.start.scale || 1, path?.end.scale || 1);
      const assetSpec = mediaSceneSpec.assets.find((item) => item.assetId === geometry.assetId);
      const resolutionFloor = assetSpec?.qualityTier === 'FALLBACK' && mediaSceneSpec.cameraIntent === 'STATIC' ? .55 : .72;
      if (sourceWidth && sourceWidth + 1 < requiredSourceWidth * resolutionFloor) issues.push({ code: 'camera_resolution_insufficient', severity: 'hard', elementId, sourceWidth, requiredSourceWidth: Math.round(requiredSourceWidth) });
      if (geometry.nativeMotion && path?.behavior !== 'STATIC') issues.push({ code: 'synthetic_motion_over_native_video', severity: 'hard', elementId });
    }
    if (mediaSceneSpec.alternateAssetRequest) issues.push({ code: 'alternate_asset_required', severity: 'hard', elementId: 'media_primary' });
  }

  const sweptBounds = Object.fromEntries(elements.map((element) => {
    const tracks = motionPlan.tracks.filter((track) => track.targetId === element.id);
    const xValues = [0], yValues = [0], scales = [1];
    tracks.forEach((track) => {
      if (track.property === 'translateX' || track.property === 'slide') xValues.push(track.from, track.to);
      if (track.property === 'translateY') yValues.push(track.from, track.to);
      if (track.property === 'scale') scales.push(track.from, track.to);
    });
    const maxScale = Math.max(...scales), minX = Math.min(...xValues), maxX = Math.max(...xValues), minY = Math.min(...yValues), maxY = Math.max(...yValues);
    const extraX = element.width * (maxScale - 1) / 2, extraY = element.height * (maxScale - 1) / 2;
    const swept = { x: element.x + minX - extraX, y: element.y + minY - extraY, width: element.width * maxScale + maxX - minX, height: element.height * maxScale + maxY - minY };
    if (swept.x < 0 || swept.y < 0 || swept.x + swept.width > viewport.width || swept.y + swept.height > viewport.height) {
      issues.push({ code: 'motion_envelope_outside_viewport', severity: 'hard', elementId: element.id });
    }
    return [element.id, swept];
  }));
  const hardFailures = issues.filter((issue) => issue.severity === 'hard');
  return {
    shotId: solvedScene.shotId,
    solvedSceneId: solvedScene.id,
    motionPlanId: motionPlan.id,
    evaluatedFrames: frames,
    frameStates,
    sweptBounds,
    issues,
    hardFailures,
    passed: hardFailures.length === 0,
  };
}
