export const DEFAULT_PRODUCTION_THRESHOLDS = Object.freeze({
  minimumRuns: 30,
  minimumFirstPassRate: 0.95,
  minimumDurationCompliance: 0.98,
  maximumHardQcFailures: 0,
  maximumUnresolvedMedia: 0,
  maximumWrongAssets: 0,
  maximumBlankFrames: 0,
  maximumFrozenMotion: 0,
});

const failedCheck = (result, id) => (result.qcChecks || []).some((check) => check.id === id && check.ok === false);

export function classifyBenchmarkFailure(error) {
  const text = String(error || '');
  if (!text) return null;
  if (/Narration quality gate/i.test(text)) return 'narration_quality';
  if (/Timeline QC/i.test(text)) return 'timeline_qc';
  if (/Rendered-frame semantic QA|frozen/i.test(text)) return 'rendered_motion_qc';
  if (/asset|media/i.test(text)) return 'asset_resolution';
  if (/Compositor|No frame found|render/i.test(text)) return 'render';
  return 'unknown';
}

export function evaluateProductionBenchmark(results = [], thresholds = DEFAULT_PRODUCTION_THRESHOLDS) {
  const total = results.length;
  const count = (predicate) => results.filter(predicate).length;
  const successful = count((result) => result.success);
  const firstPass = count((result) => result.success && (result.attempts || 1) === 1);
  const durationCompliant = count((result) => result.success && result.durationCompliant === true);
  const hardQcFailures = results.reduce((sum, result) => sum + (result.hardQcFailures || 0), 0);
  const unresolvedMedia = results.reduce((sum, result) => sum + (result.unresolvedMedia || 0), 0);
  const wrongAssets = results.reduce((sum, result) => sum + (result.wrongAssets || 0), 0);
  const blankFrames = count((result) => failedCheck(result, 'blank-frames'));
  const frozenMotion = count((result) => failedCheck(result, 'frozen-motion') || failedCheck(result, 'frozen-clips'));
  const ratio = (value) => total ? Number((value / total).toFixed(4)) : 0;
  const metrics = {
    totalRuns: total,
    successfulRuns: successful,
    firstPassRate: ratio(firstPass),
    durationCompliance: successful ? Number((durationCompliant / successful).toFixed(4)) : 0,
    hardQcFailures,
    unresolvedMedia,
    wrongAssets,
    blankFrames,
    frozenMotion,
    failureCategories: Object.fromEntries([...new Set(results.filter((result) => !result.success).map((result) => result.failureCategory || classifyBenchmarkFailure(result.error) || 'unknown'))].sort().map((category) => [category, count((result) => !result.success && (result.failureCategory || classifyBenchmarkFailure(result.error) || 'unknown') === category)])),
  };
  const failures = [];
  if (total < thresholds.minimumRuns) failures.push(`needs ${thresholds.minimumRuns - total} more run(s)`);
  if (metrics.firstPassRate < thresholds.minimumFirstPassRate) failures.push(`first-pass rate ${metrics.firstPassRate} < ${thresholds.minimumFirstPassRate}`);
  if (metrics.durationCompliance < thresholds.minimumDurationCompliance) failures.push(`duration compliance ${metrics.durationCompliance} < ${thresholds.minimumDurationCompliance}`);
  for (const [metric, limit] of [
    ['hardQcFailures', thresholds.maximumHardQcFailures], ['unresolvedMedia', thresholds.maximumUnresolvedMedia],
    ['wrongAssets', thresholds.maximumWrongAssets], ['blankFrames', thresholds.maximumBlankFrames],
    ['frozenMotion', thresholds.maximumFrozenMotion],
  ]) if (metrics[metric] > limit) failures.push(`${metric} ${metrics[metric]} > ${limit}`);
  return { version: 1, passed: failures.length === 0, metrics, thresholds, failures };
}

export function resultFromPipeline({ profileId, repeat, result, error, elapsedMs = 0 }) {
  const timelineChecks = result?.qc?.timeline?.checks || [];
  const renderChecks = result?.qc?.render?.checks || [];
  const checks = [...timelineChecks, ...renderChecks];
  const check = (id) => checks.find((item) => item.id === id);
  const errorText = error ? String(error.message || error) : null;
  const failureCategory = classifyBenchmarkFailure(errorText);
  return {
    profileId,
    repeat,
    success: !error && Boolean(result),
    attempts: 1,
    elapsedMs,
    runDir: result?.runDir || error?.details?.runDir || null,
    outputPath: result?.outputPath || null,
    error: errorText,
    failureCategory,
    durationCompliant: error ? null : check('duration-tolerance')?.ok !== false,
    hardQcFailures: checks.filter((item) => item.severity === 'error' && !item.ok).length,
    unresolvedMedia: error?.code === 'UNRESOLVED_PRODUCTION_MEDIA'
      ? error?.details?.unresolvedRequests?.length || 1
      : result?.qc?.timeline?.editorialCounts?.unresolvedMedia || 0,
    wrongAssets: result?.qc?.timeline?.editorialCounts?.semanticErrors || 0,
    qcChecks: checks,
  };
}
