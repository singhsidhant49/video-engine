import { getStyle } from '../shared/styles.js';
import { fontStack } from '../remotion/engine/fonts.js';
import { createFormatLayoutContext } from './layout/formatContext.js';
import { normalizeComparisonSpec } from './comparisonSpec.js';
import { compileComparisonComposition } from './compileComparisonComposition.js';
import { solveComparisonLayoutWithRepairs } from './layout/comparisonLayoutSolver.js';
import { choreographComparisonMotion } from './motion/comparisonMotionChoreographer.js';
import { preflightSolvedScene } from '../qc/frameStatePreflight.js';
import { textMeasurementCacheStats } from './layout/textMeasurement.js';
import { evaluateEditorialVisualQuality } from '../qc/editorialVisualQualityGate.js';

export function compileSolvedComparisonShot({ editorialPlan, overlay, alignedWords, timing, format, width, height, styleId, captionsEnabled = true }) {
  const style = getStyle(styleId);
  const formatContext = createFormatLayoutContext({ width, height, format, captionsEnabled });
  const comparisonSpec = normalizeComparisonSpec({ editorialPlan, overlay });
  const composition = compileComparisonComposition({
    editorialPlan, comparisonSpec, alignedWords, shotStartFrame: timing.startFrame, durationInFrames: timing.durationInFrames,
    formatContext, font: { display: fontStack(style.fonts.display), text: fontStack(style.fonts.text), mono: fontStack(style.fonts.mono) },
  });
  const solvedResult = solveComparisonLayoutWithRepairs(composition, formatContext, { maxPasses: 2 });
  const motionPlan = choreographComparisonMotion({ solvedScene: solvedResult.solvedScene, composition: solvedResult.composition, durationInFrames: timing.durationInFrames });
  const preflight = preflightSolvedScene({ solvedScene: solvedResult.solvedScene, motionPlan, composition: solvedResult.composition });
  const visualQuality = evaluateEditorialVisualQuality({ solvedScene: solvedResult.solvedScene, motionPlan, composition: solvedResult.composition, comparisonSpec });
  return { comparisonSpec, composition: solvedResult.composition, solvedScene: solvedResult.solvedScene, motionPlan, preflight, visualQuality, measurementCache: textMeasurementCacheStats() };
}
