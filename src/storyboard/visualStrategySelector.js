import { VideoVisualStrategySchema } from '../models/visualStrategy.schema.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const round = (value) => Number(clamp(value).toFixed(2));

function mergeStrategy(base, overlay = {}) {
  return {
    ...base,
    ...overlay,
    assetPreference: { ...base.assetPreference, ...(overlay.assetPreference || {}) },
    pacing: { ...base.pacing, ...(overlay.pacing || {}) },
    rationale: [...(base.rationale || []), ...(overlay.rationale || [])],
  };
}

/** Select video-level behavior from this video's actual plan, with defaults/overrides as inputs. */
export function selectVideoVisualStrategy({ topic = '', plan, format = 'landscape', requestedStyle, channelDefaults, overrides } = {}) {
  const scenes = plan?.scenes || [];
  const count = Math.max(1, scenes.length);
  const ratio = (predicate) => scenes.filter(predicate).length / count;
  const entityRatio = ratio((scene) => Boolean(scene.entity));
  const evidenceRatio = ratio((scene) => ['statistic', 'quote', 'document', 'timeline'].includes(scene.kind) || scene.purpose === 'evidence');
  const graphicRatio = ratio((scene) => ['statistic', 'comparison', 'list', 'process', 'timeline', 'chart', 'ui', 'code'].includes(scene.kind));
  const cinematicRatio = ratio((scene) => ['atmosphere', 'subject'].includes(scene.kind));
  const avgEnergy = scenes.reduce((sum, scene) => sum + (Number(scene.intensity) || 3), 0) / count / 5;
  const styleText = `${requestedStyle || plan?.style || ''} ${topic}`.toLowerCase();
  const fastStyle = /fast|energetic|breaking/.test(styleText) ? 0.1 : 0;
  const quietStyle = /minimal|quiet|reflective/.test(styleText) ? 0.1 : 0;

  const rawReal = 0.48 + entityRatio * 0.3 + evidenceRatio * 0.16 + cinematicRatio * 0.08;
  const rawProcedural = 0.3 + graphicRatio * 0.48 + (1 - entityRatio) * 0.08;
  const weightTotal = rawReal + rawProcedural;
  const visualFlow = evidenceRatio >= 0.48
    ? 'evidence'
    : graphicRatio >= 0.52 ? 'explanatory' : cinematicRatio >= 0.62 ? 'cinematic' : 'hybrid';
  const continuityMode = entityRatio >= 0.55 ? 'topic' : entityRatio <= 0.15 && graphicRatio >= 0.4 ? 'concept' : 'mixed';
  const segmentEnergy = (segment, fallback) => segment.length
    ? segment.reduce((sum, scene) => sum + (Number(scene.intensity) || 3), 0) / segment.length / 5
    : fallback;
  const edge = Math.max(1, Math.ceil(scenes.length * 0.2));

  let strategy = {
    version: 1,
    continuityMode,
    visualFlow,
    assetPreference: {
      realMediaWeight: round(rawReal / weightTotal),
      proceduralWeight: round(rawProcedural / weightTotal),
    },
    pacing: {
      introEnergy: round(segmentEnergy(scenes.slice(0, edge), avgEnergy) + fastStyle - quietStyle),
      bodyEnergy: round(segmentEnergy(scenes.slice(edge, -edge || undefined), avgEnergy) + fastStyle - quietStyle),
      endingEnergy: round(segmentEnergy(scenes.slice(-edge), avgEnergy) + fastStyle - quietStyle),
    },
    visualDensity: round(0.42 + avgEnergy * 0.25 + graphicRatio * 0.18 + (format === 'shorts' ? 0.08 : 0) + fastStyle - quietStyle),
    graphicDensity: round(0.2 + graphicRatio * 0.68),
    evidenceDensity: round(0.22 + evidenceRatio * 0.7),
    captionDensity: round(format === 'shorts' ? 0.78 : 0.52 + graphicRatio * 0.08),
    transitionIntensity: round(0.2 + avgEnergy * 0.3 + fastStyle - quietStyle),
    cameraMotionIntensity: round(0.28 + cinematicRatio * 0.35 + avgEnergy * 0.2 + fastStyle - quietStyle),
    source: 'director',
    rationale: [
      `${Math.round(entityRatio * 100)}% entity-led scenes`,
      `${Math.round(evidenceRatio * 100)}% evidence-oriented scenes`,
      `${Math.round(graphicRatio * 100)}% structured-graphic scenes`,
    ],
  };
  strategy = mergeStrategy(strategy, channelDefaults);
  strategy = mergeStrategy(strategy, overrides);
  if (overrides && Object.keys(overrides).length) strategy.source = 'video-override';
  else if (channelDefaults && Object.keys(channelDefaults).length) strategy.source = 'channel-default';
  return VideoVisualStrategySchema.parse(strategy);
}
