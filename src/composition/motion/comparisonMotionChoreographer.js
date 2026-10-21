import { MotionPlanSchema } from '../../models/motionPlan.schema.js';
import { lifecycleFor, MOTION_DURATIONS, MOTION_DURATION_MS, MOTION_EASINGS } from './motionChoreographer.js';

export function choreographComparisonMotion({ solvedScene, composition, durationInFrames }) {
  const events = [...composition.semanticEvents].sort((a, b) => a.frame - b.frame);
  const frame0State = Object.fromEntries(Object.values(solvedScene.elements).map((element) => [element.id, {
    opacity: 1,
    emphasis: ['comparison_side_a', 'comparison_side_b'].includes(element.id) ? 0.58 : element.id === 'comparison_difference' ? 0.45 : 0.5,
  }]));
  const tracks = [];
  const eventA = events.find((event) => event.targetId === 'comparison_side_a');
  const pivot = events.find((event) => event.type === 'comparisonPivot');
  const conclusion = events.find((event) => event.targetId === 'comparison_difference');
  if (eventA) tracks.push({ id: 'compare_a_emphasis', targetId: 'comparison_side_a', property: 'emphasis', from: 0.58, to: 1, startFrame: eventA.frame, endFrame: Math.min(durationInFrames - 1, eventA.frame + MOTION_DURATIONS.NORMAL), easing: MOTION_EASINGS.emphasis, triggerPhraseId: eventA.phraseId });
  if (pivot) {
    tracks.push(
      { id: 'compare_a_settle', targetId: 'comparison_side_a', property: 'emphasis', from: 1, to: 0.62, startFrame: pivot.frame, endFrame: Math.min(durationInFrames - 1, pivot.frame + MOTION_DURATIONS.FAST), easing: MOTION_EASINGS.move, triggerPhraseId: pivot.phraseId },
      { id: 'compare_b_emphasis', targetId: 'comparison_side_b', property: 'emphasis', from: 0.58, to: 1, startFrame: pivot.frame, endFrame: Math.min(durationInFrames - 1, pivot.frame + MOTION_DURATIONS.NORMAL), easing: MOTION_EASINGS.emphasis, triggerPhraseId: pivot.phraseId },
    );
  }
  if (conclusion) tracks.push({ id: 'compare_difference_highlight', targetId: 'comparison_difference', property: 'highlight', from: 0.35, to: 1, startFrame: conclusion.frame, endFrame: Math.min(durationInFrames - 1, conclusion.frame + MOTION_DURATIONS.EMPHASIS), easing: MOTION_EASINGS.emphasis, triggerPhraseId: conclusion.phraseId });
  const finalStateFrame = Math.max(...tracks.map((track) => track.endFrame), 0);
  const pivotFrame = pivot?.frame ?? Math.round(durationInFrames * 0.42);
  const conclusionFrame = conclusion?.frame ?? Math.round(durationInFrames * 0.68);
  const focalStates = [
    { state: 'ESTABLISH', startFrame: 0, endFrame: Math.max(0, (eventA?.frame ?? 8) - 1), primaryFocalElementId: 'comparison_root', minimumReadFrames: 8 },
    { state: 'EXPLAIN_A', startFrame: eventA?.frame ?? 8, endFrame: Math.max(eventA?.frame ?? 8, pivotFrame - 1), primaryFocalElementId: 'comparison_side_a', minimumReadFrames: 12 },
    { state: 'PIVOT', startFrame: pivotFrame, endFrame: Math.max(pivotFrame, pivotFrame + MOTION_DURATIONS.FAST - 1), primaryFocalElementId: 'comparison_divider', minimumReadFrames: 6 },
    { state: 'EXPLAIN_B', startFrame: Math.min(durationInFrames - 1, pivotFrame + MOTION_DURATIONS.FAST), endFrame: Math.max(Math.min(durationInFrames - 1, pivotFrame + MOTION_DURATIONS.FAST), conclusionFrame - 1), primaryFocalElementId: 'comparison_side_b', minimumReadFrames: 12 },
    { state: 'EMPHASIZE', startFrame: conclusionFrame, endFrame: Math.max(conclusionFrame, finalStateFrame), primaryFocalElementId: 'comparison_difference', minimumReadFrames: 16 },
    { state: 'SETTLE', startFrame: finalStateFrame, endFrame: durationInFrames - 1, primaryFocalElementId: 'comparison_difference', minimumReadFrames: 8 },
  ];
  return MotionPlanSchema.parse({
    version: 1, id: `motion_${solvedScene.shotId}_${solvedScene.format}`, shotId: solvedScene.shotId, durationInFrames, frame0State,
    lifecycle: lifecycleFor(events, tracks, durationInFrames), motionDensityBudget: 'MEDIUM', maximumSimultaneousTracks: 3, primaryMotionProperty: 'emphasis',
    frameQuality: { frame0Valid: true, firstMeaningfulFrame: 0, majorSemanticEvents: events.map((event) => ({ eventId: event.id, frame: event.frame, targetId: event.targetId })), finalStateFrame, minimumFinalHold: 8 },
    focalStates,
    tracks, tokens: { durations: MOTION_DURATIONS, durationMs: MOTION_DURATION_MS, easings: MOTION_EASINGS },
  });
}
