import { getStyle } from '../shared/styles.js';
import { fontStack } from '../remotion/engine/fonts.js';
import { createFormatLayoutContext } from './layout/formatContext.js';
import { compileProcessComposition } from './compileProcessComposition.js';
import { solveProcessLayoutWithRepairs } from './layout/processLayoutSolver.js';
import { choreographProcessMotion } from './motion/motionChoreographer.js';
import { preflightSolvedScene } from '../qc/frameStatePreflight.js';
import { textMeasurementCacheStats } from './layout/textMeasurement.js';

export function compileSolvedProcessShot({ editorialPlan, overlay, alignedWords, timing, format, width, height, styleId, captionsEnabled = true }) {
  const style = getStyle(styleId);
  const formatContext = createFormatLayoutContext({ width, height, format, captionsEnabled });
  const composition = compileProcessComposition({
    editorialPlan,
    steps: overlay.steps,
    alignedWords,
    shotStartFrame: timing.startFrame,
    durationInFrames: timing.durationInFrames,
    formatContext,
    font: { display: fontStack(style.fonts.display), text: fontStack(style.fonts.text), mono: fontStack(style.fonts.mono) },
  });
  const solvedResult = solveProcessLayoutWithRepairs(composition, formatContext, { maxPasses: 2 });
  const motionPlan = choreographProcessMotion({
    solvedScene: solvedResult.solvedScene,
    composition: solvedResult.composition,
    durationInFrames: timing.durationInFrames,
  });
  const preflight = preflightSolvedScene({ solvedScene: solvedResult.solvedScene, motionPlan, composition: solvedResult.composition });
  return {
    composition: solvedResult.composition,
    solvedScene: solvedResult.solvedScene,
    motionPlan,
    preflight,
    measurementCache: textMeasurementCacheStats(),
  };
}

