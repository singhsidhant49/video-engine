/**
 * Video Duration & Editorial Narration Budgeting.
 *
 * Defines and computes creative time and word budgets for videos,
 * translating --duration into actionable constraints for script generation,
 * section planning, shot holds, and pause budgets.
 */

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

export const DEFAULT_SPEECH_RATE_WPS = 2.60; // ~156 WPM (Kokoro default speed 1.0)

/**
 * Calculates complete duration and word budgets for a requested target duration.
 *
 * @param {object} options
 * @param {number} [options.targetDurationSec=75]
 * @param {'shorts'|'landscape'} [options.format='landscape']
 * @param {string} [options.style]
 * @param {number} [options.speechRateWps]
 * @returns {object} Full duration budget contract
 */
export function calculateDurationBudget({
  targetDurationSec = 75,
  format = 'landscape',
  style,
  speechRateWps = DEFAULT_SPEECH_RATE_WPS,
} = {}) {
  const target = Math.max(15, Number(targetDurationSec) || 75);
  const toleranceRatio = 0.05; // ±5% target tolerance
  const hardToleranceRatio = 0.10; // ±10% hard QC boundary

  const allowedMinDuration = Number((target * (1 - toleranceRatio)).toFixed(2));
  const allowedMaxDuration = Number((target * (1 + toleranceRatio)).toFixed(2));
  const hardMinDuration = Number((target * (1 - hardToleranceRatio)).toFixed(2));
  const hardMaxDuration = Number((target * (1 + hardToleranceRatio)).toFixed(2));

  // Breathing room reserve: opening pause, closing tail hold, and inter-beat pauses
  const openingHoldSec = format === 'shorts' ? 0.4 : 0.8;
  const closingHoldSec = format === 'shorts' ? 1.4 : 2.2;
  const pauseBudgetSec = Number(clamp(target * 0.03, 1.0, 3.5).toFixed(2));
  const totalReserveSec = Number((openingHoldSec + closingHoldSec + pauseBudgetSec).toFixed(2));

  const targetNarrationSec = Number(Math.max(10, target - totalReserveSec).toFixed(2));
  const targetWords = Math.round(targetNarrationSec * speechRateWps);
  const minWords = Math.round(targetWords * 0.93);
  const maxWords = Math.round(targetWords * 1.05); // Strict word ceiling

  // Target scene count: each scene is an authored Content Beat (6–8s average hold)
  const targetSceneCount = clamp(Math.round(target / 7.5), format === 'shorts' ? 5 : 7, 13);

  // Section time allocations (proportional to narrative arc)
  const sectionBudgets = {
    hook: {
      name: 'Hook',
      targetSec: Number(clamp(target * 0.10, 5, 9).toFixed(1)),
      targetWords: Math.round(clamp(target * 0.10, 5, 9) * speechRateWps),
    },
    why_it_matters: {
      name: 'Why It Matters / Open Question',
      targetSec: Number(clamp(target * 0.14, 8, 13).toFixed(1)),
      targetWords: Math.round(clamp(target * 0.14, 8, 13) * speechRateWps),
    },
    core_explanation: {
      name: 'Core Mechanism / Explanation',
      targetSec: Number(clamp(target * 0.38, 20, 35).toFixed(1)),
      targetWords: Math.round(clamp(target * 0.38, 20, 35) * speechRateWps),
    },
    example_evidence: {
      name: 'Example / Contrast / Evidence',
      targetSec: Number(clamp(target * 0.20, 10, 18).toFixed(1)),
      targetWords: Math.round(clamp(target * 0.20, 10, 18) * speechRateWps),
    },
    payoff_conclusion: {
      name: 'Payoff & Memorable Conclusion',
      targetSec: Number(clamp(target * 0.18, 9, 15).toFixed(1)),
      targetWords: Math.round(clamp(target * 0.18, 9, 15) * speechRateWps),
    },
  };

  return {
    targetDurationSec: target,
    format,
    style,
    toleranceRatio,
    hardToleranceRatio,
    allowedMinDuration,
    allowedMaxDuration,
    hardMinDuration,
    hardMaxDuration,
    openingHoldSec,
    closingHoldSec,
    pauseBudgetSec,
    totalReserveSec,
    targetNarrationSec,
    speechRateWps,
    targetWords,
    minWords,
    maxWords,
    targetSceneCount,
    sectionBudgets,
  };
}

/**
 * Estimates narration duration from word count and pause metadata.
 */
export function estimateScriptDuration(text = '', pauseAfterTotalSec = 0, speechRateWps = DEFAULT_SPEECH_RATE_WPS) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const estimatedSpeechSec = Number((wordCount / speechRateWps).toFixed(2));
  const estimatedTotalSec = Number((estimatedSpeechSec + Number(pauseAfterTotalSec || 0)).toFixed(2));

  return {
    wordCount,
    speechRateWps,
    estimatedSpeechSec,
    pauseAfterTotalSec: Number(pauseAfterTotalSec || 0),
    estimatedTotalSec,
  };
}

/**
 * Formats a duration diagnostic summary payload for persistence.
 */
export function buildDurationDiagnostics({
  budget,
  plan,
  narration,
  timeline,
  compressionPasses = 0,
  expansionPasses = 0,
}) {
  const words = (plan?.script || '').trim().split(/\s+/).filter(Boolean);
  const actualWordCount = words.length;
  const estimatedNarrationDuration = Number((actualWordCount / (budget?.speechRateWps || DEFAULT_SPEECH_RATE_WPS)).toFixed(2));
  const rawDuration = narration?.durationInSeconds ?? narration?.duration ?? narration?.durationSec;
  const actualNarrationDuration = rawDuration != null ? Number(Number(rawDuration).toFixed(2)) : estimatedNarrationDuration;
  const fps = timeline?.fps || 30;
  const finalVideoDuration = timeline ? Number((timeline.durationInFrames / fps).toFixed(2)) : actualNarrationDuration;

  let totalPauses = 0;
  for (const s of (plan?.scenes || [])) {
    if (s.pauseAfterSec) totalPauses += Number(s.pauseAfterSec);
  }

  const durationVarianceSec = Number((finalVideoDuration - (budget?.targetDurationSec || 75)).toFixed(2));
  const durationVariancePercent = Number(((durationVarianceSec / (budget?.targetDurationSec || 75)) * 100).toFixed(2));

  const isWithinTolerance = finalVideoDuration >= (budget?.allowedMinDuration || 0)
    && finalVideoDuration <= (budget?.allowedMaxDuration || 9999);
  const isWithinHardBounds = finalVideoDuration >= (budget?.hardMinDuration || 0)
    && finalVideoDuration <= (budget?.hardMaxDuration || 9999);

  return {
    requestedDuration: budget?.targetDurationSec || 75,
    allowedRange: {
      min: budget?.allowedMinDuration || 71.25,
      max: budget?.allowedMaxDuration || 78.75,
    },
    hardLimits: {
      min: budget?.hardMinDuration || 67.5,
      max: budget?.hardMaxDuration || 82.5,
    },
    finalVideoDuration,
    actualNarrationDuration,
    estimatedNarrationDuration,
    durationVarianceSec,
    durationVariancePercent,
    isWithinTolerance,
    isWithinHardBounds,
    scriptWordBudget: {
      target: budget?.targetWords || 180,
      min: budget?.minWords || 165,
      max: budget?.maxWords || 195,
      actual: actualWordCount,
    },
    pauseBudget: {
      budgetedSec: budget?.pauseBudgetSec || 2.0,
      actualSec: Number(totalPauses.toFixed(2)),
    },
    sectionBudgets: budget?.sectionBudgets || {},
    compressionPasses,
    expansionPasses,
  };
}
