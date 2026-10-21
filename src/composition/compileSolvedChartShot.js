import { getStyle } from '../shared/styles.js';
import { fontStack } from '../remotion/engine/fonts.js';
import { createFormatLayoutContext } from './layout/formatContext.js';
import { normalizeChartSpec } from './chartSpec.js';
import { compileChartComposition } from './compileChartComposition.js';
import { solveChartLayoutWithRepairs } from './layout/chartLayoutSolver.js';
import { choreographChartMotion } from './motion/chartMotionChoreographer.js';
import { preflightSolvedScene } from '../qc/frameStatePreflight.js';
import { textMeasurementCacheStats } from './layout/textMeasurement.js';
import { evaluateEditorialVisualQuality } from '../qc/editorialVisualQualityGate.js';

export function compileSolvedChartShot({ editorialPlan, overlay, alignedWords, timing, format, width, height, styleId, captionsEnabled = true }) {
  const style = getStyle(styleId);
  const formatContext = createFormatLayoutContext({ width, height, format, captionsEnabled });
  const chartSpec = normalizeChartSpec({ editorialPlan, overlay });
  const compileComposition = () => compileChartComposition({ editorialPlan, chartSpec, alignedWords, shotStartFrame: timing.startFrame, durationInFrames: timing.durationInFrames, formatContext, font: { display: fontStack(style.fonts.display), text: fontStack(style.fonts.text), mono: fontStack(style.fonts.mono) } });
  let composition = compileComposition();
  let solvedResult = solveChartLayoutWithRepairs(composition, chartSpec, formatContext, { maxPasses: 2 });
  let motionPlan = choreographChartMotion({ solvedScene: solvedResult.solvedScene, composition: solvedResult.composition, chartSpec, durationInFrames: timing.durationInFrames });
  let preflight = preflightSolvedScene({ solvedScene: solvedResult.solvedScene, motionPlan, composition: solvedResult.composition });
  const labelFailure = preflight.hardFailures.some((issue) => ['chart_label_collision', 'text_overflow', 'minimum_font_size'].includes(issue.code)
    && solvedResult.solvedScene.elements[issue.elementId]?.kind === 'chart_label');
  if (labelFailure) {
    composition = compileComposition();
    solvedResult = solveChartLayoutWithRepairs(composition, chartSpec, formatContext, {
      maxPasses: 2,
      conservativeLabels: true,
      initialRepairHistory: [{ pass: 1, action: 'HIDE_REDUNDANT_LABEL', reason: 'Hard frame-state preflight requested a conservative chart-label recompile' }],
    });
    motionPlan = choreographChartMotion({ solvedScene: solvedResult.solvedScene, composition: solvedResult.composition, chartSpec, durationInFrames: timing.durationInFrames });
    preflight = preflightSolvedScene({ solvedScene: solvedResult.solvedScene, motionPlan, composition: solvedResult.composition });
  }
  const visualQuality = evaluateEditorialVisualQuality({ solvedScene: solvedResult.solvedScene, motionPlan, composition: solvedResult.composition, chartSpec });
  return { chartSpec, composition: solvedResult.composition, solvedScene: solvedResult.solvedScene, motionPlan, preflight, visualQuality, measurementCache: textMeasurementCacheStats() };
}
