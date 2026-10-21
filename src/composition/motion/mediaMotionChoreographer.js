import { MotionPlanSchema } from '../../models/motionPlan.schema.js';
import { lifecycleFor, MOTION_DURATIONS, MOTION_DURATION_MS, MOTION_EASINGS } from './motionChoreographer.js';

export function choreographMediaMotion({ solvedScene, composition, mediaSceneSpec, durationInFrames }) {
  const frame0State = Object.fromEntries(Object.values(solvedScene.elements).map((element) => { const camera = solvedScene.cameraPaths[element.id]?.start; return [element.id, { opacity: 1, emphasis: element.importance === 'primary' ? 1 : .65, cameraScale: camera?.scale || 1, cameraFocusX: camera?.focusX ?? .5, cameraFocusY: camera?.focusY ?? .5 }]; }));
  const tracks = [];
  Object.entries(solvedScene.cameraPaths).forEach(([targetId, path]) => {
    if (path.behavior === 'STATIC') return;
    const endFrame = Math.max(1, durationInFrames - 14);
    tracks.push({ id: `${targetId}_camera_scale`, targetId, property: 'cameraScale', from: path.start.scale, to: path.end.scale, startFrame: 0, endFrame, easing: 'easeInOutCubic', triggerPhraseId: null });
    if (path.start.focusX !== path.end.focusX) tracks.push({ id: `${targetId}_camera_x`, targetId, property: 'cameraFocusX', from: path.start.focusX, to: path.end.focusX, startFrame: 0, endFrame, easing: 'easeInOutCubic', triggerPhraseId: null });
    if (path.start.focusY !== path.end.focusY) tracks.push({ id: `${targetId}_camera_y`, targetId, property: 'cameraFocusY', from: path.start.focusY, to: path.end.focusY, startFrame: 0, endFrame, easing: 'easeInOutCubic', triggerPhraseId: null });
  });
  const annotation = composition.semanticEvents.find((event) => event.type === 'annotationIntroduced');
  if (annotation) tracks.push({ id: 'media_annotation_reveal', targetId: annotation.targetId, property: 'reveal', from: 0, to: 1, startFrame: annotation.frame, endFrame: Math.min(durationInFrames - 1, annotation.frame + MOTION_DURATIONS.NORMAL), easing: 'easeOutCubic', triggerPhraseId: annotation.phraseId });
  for (const event of composition.semanticEvents.filter((item) => item.type === 'assetChanged')) {
    tracks.push({ id: `${event.targetId}_reveal`, targetId: event.targetId, property: 'reveal', from: 0, to: 1, startFrame: event.frame, endFrame: Math.min(durationInFrames - 1, event.frame + 3), easing: 'linear', triggerPhraseId: event.phraseId });
  }
  const finalStateFrame = Math.max(0, ...tracks.filter((track) => !track.property.startsWith('camera')).map((track) => track.endFrame));
  const montageStates = mediaSceneSpec.montage?.cuts.map((cut, index) => ({ state: `MONTAGE_${index + 1}`, startFrame: cut.startFrame, endFrame: cut.endFrame, primaryFocalElementId: index ? `media_support_${index}` : 'media_primary', minimumReadFrames: Math.min(12, cut.endFrame - cut.startFrame + 1) })) || [];
  const focalStates = montageStates.length ? montageStates : [
    { state: 'ESTABLISH', startFrame: 0, endFrame: Math.max(0, Math.round(durationInFrames * .3)), primaryFocalElementId: 'media_primary', minimumReadFrames: 8 },
    ...(annotation ? [{ state: 'EXPLAIN', startFrame: annotation.frame, endFrame: Math.max(annotation.frame, Math.round(durationInFrames * .72)), primaryFocalElementId: 'media_annotation', minimumReadFrames: 12 }] : []),
    { state: 'SETTLE', startFrame: Math.max(0, Math.round(durationInFrames * .72)), endFrame: durationInFrames - 1, primaryFocalElementId: mediaSceneSpec.textNeed === 'STAT' ? 'media_stat' : 'media_primary', minimumReadFrames: 8 },
  ];
  return MotionPlanSchema.parse({ version: 1, id: `motion_${solvedScene.shotId}_${solvedScene.format}`, shotId: solvedScene.shotId, durationInFrames, frame0State,
    lifecycle: lifecycleFor(composition.semanticEvents, tracks, durationInFrames), motionDensityBudget: tracks.length > 3 ? 'MEDIUM' : 'LOW', maximumSimultaneousTracks: 3, primaryMotionProperty: tracks.some((track) => track.property === 'reveal') ? 'reveal' : 'focus',
    frameQuality: { frame0Valid: true, firstMeaningfulFrame: 0, majorSemanticEvents: composition.semanticEvents.map((event) => ({ eventId: event.id, frame: event.frame, targetId: event.targetId })), finalStateFrame, minimumFinalHold: 8 }, focalStates, tracks,
    tokens: { durations: MOTION_DURATIONS, durationMs: MOTION_DURATION_MS, easings: MOTION_EASINGS } });
}
