import { getStyle } from '../shared/styles.js';
import { storyboardToExecutionPlan, storyboardSceneSeconds } from './storyboardCompatibility.js';

const TONE_ENERGY = { tense: 1.15, urgent: 1.2, somber: 0.8, reflective: 0.72, curious: 1, neutral: 1, hopeful: 0.95, triumphant: 1.12, playful: 1.15 };
const SHOT_SCALE = { wide: 1, medium: 1.03, close: 1.08, detail: 1.12 };
const CAMERA_MOVES = {
  still: { moves: ['drift'], factor: 0.2 }, slow: { moves: ['drift', 'push'], factor: 0.5 },
  push: { moves: ['push'], factor: 0.8 }, drift: { moves: ['drift'], factor: 0.75 },
  reveal: { moves: ['pull'], factor: 0.75 }, track: { moves: ['pan', 'tilt'], factor: 0.75 },
};

/** Every scene is directed as authentic image/video coverage. */
export function directScenes(creativePlan, { format, rng = Math.random, sceneSeconds } = {}) {
  const isStoryboard = Boolean(creativePlan?.sections);
  const strategy = isStoryboard ? creativePlan.visualStrategy : null;
  const plan = isStoryboard ? storyboardToExecutionPlan(null, creativePlan) : creativePlan;
  sceneSeconds = sceneSeconds || (isStoryboard ? storyboardSceneSeconds(creativePlan) : []);
  const style = getStyle(plan.style);

  return plan.scenes.map((scene, index) => {
    const authoredShots = scene.storyboardShots || [];
    const seconds = sceneSeconds[index] || 3;
    const behaviour = CAMERA_MOVES[scene.camera] || { moves: style.motion.moves, factor: 0.65 };
    const energy = (TONE_ENERGY[scene.tone] || 1) * (scene.intensity >= 5 ? 1.12 : scene.intensity <= 1 ? 0.75 : 1);
    const hasVideoIntent = authoredShots.some((shot) => shot.motionPreference === 'active' || shot.assetIntent === 'action');
    const desiredCount = Math.max(1, authoredShots.length || (seconds > 8 ? 2 : 1));
    return {
      sceneId: scene.id,
      family: 'image',
      variant: format === 'shorts' ? 'full' : (rng() < 0.18 && desiredCount > 1 ? 'stack' : 'full'),
      treatment: scene.treatment || 'cinematic',
      camera: {
        moves: behaviour.moves,
        magnitude: Math.min(0.7, style.motion.camera * style.motion.energy * energy * behaviour.factor * (strategy ? 0.7 + strategy.cameraMotionIntensity * 0.45 : 1)),
        baseScale: SHOT_SCALE[scene.shot] || 1,
      },
      label: scene.entity?.name || scene.text?.kicker || scene.focus || null,
      need: {
        role: scene.entity || scene.kind === 'subject' ? 'subject' : 'mood',
        count: desiredCount,
        allowVideo: true,
        preferVideo: hasVideoIntent,
        allowGenerated: false,
        allowGeneric: true,
        minSeconds: seconds,
      },
      accents: { focusPull: false, letterbox: Boolean(style.accents?.letterbox) && index === 0 },
      recasts: [],
    };
  });
}

/** Retain the media family and adjust only its presentation when assets vary. */
export function recast(spec, _scene, assets, format) {
  spec.family = 'image';
  const primary = assets?.primary;
  if (!primary) {
    spec.variant = 'full';
    spec.recasts.push('no approved asset: awaiting approved adjacent-media reuse');
    return spec;
  }
  if (spec.variant === 'stack' && !(assets.alternates?.length)) {
    spec.variant = 'full';
    spec.recasts.push('stack requires multiple approved media assets');
  }
  if (format === 'landscape' && primary.type !== 'video' && primary.width && primary.height && primary.width / primary.height < 0.85) {
    spec.variant = 'depth';
    spec.recasts.push('portrait still uses a depth layout in landscape');
  }
  return spec;
}
