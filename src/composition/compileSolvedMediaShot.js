import { getStyle } from '../shared/styles.js';
import { fontStack } from '../remotion/engine/fonts.js';
import { createFormatLayoutContext } from './layout/formatContext.js';
import { normalizeMediaSceneSpec } from './mediaSceneSpec.js';
import { compileMediaComposition } from './compileMediaComposition.js';
import { solveMediaLayout } from './layout/mediaLayoutSolver.js';
import { choreographMediaMotion } from './motion/mediaMotionChoreographer.js';
import { preflightSolvedScene } from '../qc/frameStatePreflight.js';
import { evaluateMediaVisualQuality } from '../qc/mediaVisualQualityGate.js';
import { textMeasurementCacheStats } from './layout/textMeasurement.js';

function alignMontageCutsToPhrases(spec, alignedWords, shotStartFrame, durationInFrames) {
  if (!spec.montage || spec.montage.cuts.length < 2) return;
  const candidates = alignedWords.filter((word) => word.endsPhrase)
    .map((word) => Math.max(1, Math.min(durationInFrames - 1, word.endFrame - shotStartFrame)))
    .filter((frame) => frame >= 12 && frame <= durationInFrames - 12);
  const boundaries = [0];
  for (let index = 1; index < spec.montage.cuts.length; index++) {
    const ideal = Math.round(durationInFrames * index / spec.montage.cuts.length);
    const unused = candidates.filter((frame) => frame > boundaries.at(-1) + 11);
    boundaries.push(unused.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0] || ideal);
  }
  spec.montage.cuts = spec.montage.cuts.map((cut, index) => ({
    ...cut,
    startFrame: boundaries[index],
    endFrame: index === spec.montage.cuts.length - 1 ? durationInFrames - 1 : boundaries[index + 1] - 1,
    reason: index ? 'montageProgression' : 'establishSubject',
  }));
}

export function compileSolvedMediaShot({ shot, editorialPlan, overlay, asset, supportingAssets = [], alignedWords, timing, format, width, height, styleId, captionsEnabled = true, visualPolicy = null }) {
  const startedAt = performance.now();
  const style = getStyle(styleId), formatContext = createFormatLayoutContext({ width, height, format, captionsEnabled });
  const mediaSceneSpec = normalizeMediaSceneSpec({ shot, editorialPlan, overlay, asset, supportingAssets, format, durationInFrames: timing.durationInFrames, visualPolicy: visualPolicy || shot?.visualPolicy });
  alignMontageCutsToPhrases(mediaSceneSpec, alignedWords, timing.startFrame, timing.durationInFrames);
  const composition = compileMediaComposition({ mediaSceneSpec, overlay, alignedWords, shotStartFrame: timing.startFrame, durationInFrames: timing.durationInFrames, format, font: { display: fontStack(style.fonts.display), text: fontStack(style.fonts.text), mono: fontStack(style.fonts.mono) } });
  const planningDoneAt = performance.now();
  const solvedScene = solveMediaLayout(composition, mediaSceneSpec, formatContext);
  const solveDoneAt = performance.now();
  const motionPlan = choreographMediaMotion({ solvedScene, composition, mediaSceneSpec, durationInFrames: timing.durationInFrames });
  const cameraDoneAt = performance.now();
  let preflight = preflightSolvedScene({ solvedScene, motionPlan, composition, mediaSceneSpec });
  let solvedMotionPlan = motionPlan;
  if (!preflight.passed && preflight.hardFailures.some((f) => f.code === 'camera_resolution_insufficient')) {
    mediaSceneSpec.cameraIntent = 'STATIC';
    solvedMotionPlan = choreographMediaMotion({ solvedScene, composition, mediaSceneSpec, durationInFrames: timing.durationInFrames });
    preflight = preflightSolvedScene({ solvedScene, motionPlan: solvedMotionPlan, composition, mediaSceneSpec });
  }
  const visualQuality = evaluateMediaVisualQuality({ solvedScene, motionPlan: solvedMotionPlan, mediaSceneSpec });
  const finishedAt = performance.now();
  return { mediaSceneSpec, composition, solvedScene, motionPlan: solvedMotionPlan, preflight, visualQuality, measurementCache: textMeasurementCacheStats(), performance: {
    planningMs: Number((planningDoneAt - startedAt).toFixed(3)), mediaSolveMs: Number((solveDoneAt - planningDoneAt).toFixed(3)),
    cameraSolveMs: Number((cameraDoneAt - solveDoneAt).toFixed(3)), preflightMs: Number((finishedAt - cameraDoneAt).toFixed(3)), totalMs: Number((finishedAt - startedAt).toFixed(3)),
  } };
}
