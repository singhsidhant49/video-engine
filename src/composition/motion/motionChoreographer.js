import { MotionPlanSchema } from '../../models/motionPlan.schema.js';

export const MOTION_DURATIONS = Object.freeze({ MICRO: 5, FAST: 8, NORMAL: 14, EMPHASIS: 20 });
export const MOTION_DURATION_MS = Object.freeze({ MICRO: 160, FAST: 280, NORMAL: 460, EMPHASIS: 680 });
export const MOTION_EASINGS = Object.freeze({
  enter: 'easeOutCubic', exit: 'easeInOutCubic', move: 'easeInOutCubic', draw: 'easeOutCubic', emphasis: 'easeInOutCubic',
});

export function lifecycleFor(events, tracks, durationInFrames) {
  const lastFrame = durationInFrames - 1;
  const firstEvent = events[0]?.frame ?? MOTION_DURATIONS.FAST * 2;
  const enterEnd = Math.min(lastFrame, Math.max(1, Math.min(MOTION_DURATIONS.FAST, Math.floor(firstEvent * 0.6))));
  const explainStart = Math.max(enterEnd, Math.min(lastFrame, firstEvent));
  const lastEvent = events.at(-1)?.frame ?? explainStart;
  const emphasisStart = Math.max(explainStart, Math.min(lastFrame, lastEvent));
  const finalActivationEnd = Math.max(emphasisStart, ...tracks.map((track) => track.endFrame));
  const exitStart = Math.max(finalActivationEnd, lastFrame - MOTION_DURATIONS.MICRO);
  return [
    { phase: 'ENTER', startFrame: 0, endFrame: enterEnd, intent: 'Clean reveal of the complete subdued structure' },
    { phase: 'ESTABLISH', startFrame: enterEnd, endFrame: explainStart, intent: 'Let the viewer understand the full process topology' },
    { phase: 'EXPLAIN', startFrame: explainStart, endFrame: emphasisStart, intent: 'Advance through phrase-bound semantic stages' },
    { phase: 'EMPHASIZE', startFrame: emphasisStart, endFrame: Math.min(lastFrame, finalActivationEnd), intent: 'Make the result or takeaway dominant' },
    { phase: 'SETTLE', startFrame: Math.min(lastFrame, finalActivationEnd), endFrame: Math.min(lastFrame, exitStart), intent: 'Hold the completed composition for comprehension' },
    { phase: 'EXIT', startFrame: Math.min(lastFrame, exitStart), endFrame: lastFrame, intent: 'Remain stable for a clean editorial cut' },
  ];
}

export function choreographProcessMotion({ solvedScene, composition, durationInFrames }) {
  const tracks = [];
  const frame0State = {};
  const events = [...composition.semanticEvents].sort((a, b) => a.frame - b.frame);
  for (const element of Object.values(solvedScene.elements)) {
    frame0State[element.id] = element.kind === 'connector' ? { draw: 0.18, opacity: 0.35 } : { emphasis: 0.4, opacity: 1 };
  }
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const startFrame = Math.max(0, Math.min(durationInFrames - 1, event.frame));
    const endFrame = Math.min(durationInFrames - 1, startFrame + MOTION_DURATIONS.NORMAL);
    tracks.push({
      id: `track_${event.targetId}_emphasis`, targetId: event.targetId, property: 'emphasis', from: 0.4, to: 1,
      startFrame, endFrame, easing: MOTION_EASINGS.emphasis, triggerPhraseId: event.phraseId,
    });
    const connector = solvedScene.connectorRoutes[index - 1];
    if (connector) {
      tracks.push({
        id: `track_${connector.id}_draw`, targetId: connector.id, property: 'draw', from: 0.18, to: 1,
        startFrame: Math.max(0, startFrame - MOTION_DURATIONS.FAST), endFrame, easing: MOTION_EASINGS.draw, triggerPhraseId: event.phraseId,
      });
    }
    if (index > 0) {
      const previous = events[index - 1];
      tracks.push({
        id: `track_${previous.targetId}_settle_${index}`, targetId: previous.targetId, property: 'emphasis', from: 1, to: 0.72,
        startFrame, endFrame: Math.min(durationInFrames - 1, startFrame + MOTION_DURATIONS.FAST), easing: MOTION_EASINGS.move, triggerPhraseId: event.phraseId,
      });
    }
  }
  const focalStates = events.map((event, index) => ({
    state: index === 0 ? 'ESTABLISH' : index === events.length - 1 ? 'EMPHASIZE' : 'EXPLAIN',
    startFrame: index === 0 ? 0 : event.frame,
    endFrame: Math.max(index === 0 ? 0 : event.frame, (events[index + 1]?.frame ?? durationInFrames - MOTION_DURATIONS.MICRO) - 1),
    primaryFocalElementId: event.targetId,
    minimumReadFrames: 12,
  }));
  focalStates.push({ state: 'SETTLE', startFrame: Math.max(0, ...tracks.map((track) => track.endFrame)), endFrame: durationInFrames - 1, primaryFocalElementId: events.at(-1)?.targetId || composition.readingOrder[0], minimumReadFrames: 8 });
  return MotionPlanSchema.parse({
    version: 1,
    id: `motion_${solvedScene.shotId}_${solvedScene.format}`,
    shotId: solvedScene.shotId,
    durationInFrames,
    frame0State,
    lifecycle: lifecycleFor(events, tracks, durationInFrames),
    motionDensityBudget: 'MEDIUM',
    maximumSimultaneousTracks: 3,
    primaryMotionProperty: 'emphasis',
    frameQuality: {
      frame0Valid: true,
      firstMeaningfulFrame: 0,
      majorSemanticEvents: events.map((event) => ({ eventId: event.id, frame: event.frame, targetId: event.targetId })),
      finalStateFrame: Math.max(0, ...tracks.map((track) => track.endFrame)),
      minimumFinalHold: 8,
    },
    focalStates,
    tracks,
    tokens: { durations: MOTION_DURATIONS, durationMs: MOTION_DURATION_MS, easings: MOTION_EASINGS },
  });
}

export function evaluateMotionValue(plan, targetId, property, frame) {
  let value = plan.frame0State[targetId]?.[property] ?? (property === 'opacity' ? 1 : 0);
  const tracks = plan.tracks.filter((track) => track.targetId === targetId && track.property === property).sort((a, b) => a.startFrame - b.startFrame);
  for (const track of tracks) {
    if (frame < track.startFrame) break;
    if (frame >= track.endFrame) { value = track.to; continue; }
    const raw = (frame - track.startFrame) / Math.max(1, track.endFrame - track.startFrame);
    const t = track.easing === 'easeOutCubic' ? 1 - (1 - raw) ** 3
      : track.easing === 'easeInOutCubic' ? (raw < 0.5 ? 4 * raw ** 3 : 1 - ((-2 * raw + 2) ** 3) / 2)
        : raw;
    value = track.from + (track.to - track.from) * t;
  }
  return value;
}
