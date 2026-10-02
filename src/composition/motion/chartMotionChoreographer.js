import { MotionPlanSchema } from '../../models/motionPlan.schema.js';
import { lifecycleFor, MOTION_DURATIONS, MOTION_DURATION_MS, MOTION_EASINGS } from './motionChoreographer.js';

export function choreographChartMotion({ solvedScene, composition, chartSpec, durationInFrames }) {
  const events = [...composition.semanticEvents].sort((a, b) => a.frame - b.frame);
  const frame0State = Object.fromEntries(Object.values(solvedScene.elements).map((element) => [element.id, {
    opacity: 1, emphasis: element.kind === 'chart_mark' ? 0.5 : 0.6,
    draw: element.semanticRole === 'line-path' || element.semanticRole === 'area-path' || element.semanticRole === 'chart-series' ? 0.12 : 1,
    reveal: element.kind === 'chart_mark' || element.semanticRole === 'chart-series' ? 0.16 : 1,
    highlight: element.id === 'chart_takeaway' ? 0.35 : 0,
  }]));
  const tracks = [];
  const firstEventFrame = events[0]?.frame ?? MOTION_DURATIONS.FAST;
  chartSpec.series.forEach((series, index) => {
    const targetId = `chart_series_${index}`;
    const property = ['LINE', 'AREA'].includes(chartSpec.chartType) ? 'draw' : 'reveal';
    tracks.push({
      id: `track_${targetId}_${property}`, targetId, property, from: ['LINE', 'AREA'].includes(chartSpec.chartType) ? 0.12 : 0.16, to: 1,
      startFrame: Math.max(0, firstEventFrame - MOTION_DURATIONS.FAST), endFrame: Math.min(durationInFrames - 1, firstEventFrame + MOTION_DURATIONS.NORMAL),
      easing: property === 'draw' ? MOTION_EASINGS.draw : MOTION_EASINGS.enter, triggerPhraseId: events[0]?.phraseId || null,
    });
  });
  events.filter((event) => event.targetId !== 'chart_takeaway').forEach((event, index) => {
    tracks.push({ id: `track_chart_point_${index}`, targetId: event.targetId, property: 'emphasis', from: 0.5, to: 1, startFrame: event.frame, endFrame: Math.min(durationInFrames - 1, event.frame + MOTION_DURATIONS.NORMAL), easing: MOTION_EASINGS.emphasis, triggerPhraseId: event.phraseId });
  });
  const takeaway = events.find((event) => event.targetId === 'chart_takeaway');
  if (takeaway) tracks.push({ id: 'track_chart_takeaway', targetId: 'chart_takeaway', property: 'highlight', from: 0.35, to: 1, startFrame: takeaway.frame, endFrame: Math.min(durationInFrames - 1, takeaway.frame + MOTION_DURATIONS.EMPHASIS), easing: MOTION_EASINGS.emphasis, triggerPhraseId: takeaway.phraseId });
  const finalStateFrame = Math.max(0, ...tracks.map((track) => track.endFrame));
  const highlightEvent = events.find((event) => event.targetId !== 'chart_takeaway');
  const takeawayFrame = takeaway?.frame ?? Math.round(durationInFrames * 0.65);
  const focalStates = [
    { state: 'ESTABLISH', startFrame: 0, endFrame: Math.max(0, firstEventFrame - 1), primaryFocalElementId: 'chart_root', minimumReadFrames: 8 },
    { state: 'EXPLAIN', startFrame: Math.max(0, firstEventFrame), endFrame: Math.max(firstEventFrame, (highlightEvent?.frame ?? takeawayFrame) - 1), primaryFocalElementId: 'chart_series_0', minimumReadFrames: 12 },
    { state: 'EMPHASIZE', startFrame: highlightEvent?.frame ?? firstEventFrame, endFrame: Math.max(highlightEvent?.frame ?? firstEventFrame, takeawayFrame - 1), primaryFocalElementId: highlightEvent?.targetId || 'chart_series_0', minimumReadFrames: 12 },
    { state: 'SETTLE', startFrame: takeawayFrame, endFrame: durationInFrames - 1, primaryFocalElementId: 'chart_takeaway', minimumReadFrames: 16 },
  ];
  return MotionPlanSchema.parse({
    version: 1, id: `motion_${solvedScene.shotId}_${solvedScene.format}`, shotId: solvedScene.shotId, durationInFrames, frame0State,
    lifecycle: lifecycleFor(events, tracks, durationInFrames), motionDensityBudget: 'MEDIUM', maximumSimultaneousTracks: 3,
    primaryMotionProperty: ['LINE', 'AREA'].includes(chartSpec.chartType) ? 'draw' : 'reveal',
    frameQuality: { frame0Valid: true, firstMeaningfulFrame: 0, majorSemanticEvents: events.map((event) => ({ eventId: event.id, frame: event.frame, targetId: event.targetId })), finalStateFrame, minimumFinalHold: 8 },
    focalStates,
    tracks, tokens: { durations: MOTION_DURATIONS, durationMs: MOTION_DURATION_MS, easings: MOTION_EASINGS },
  });
}
