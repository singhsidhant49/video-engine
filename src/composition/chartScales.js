export function validateChartData(spec) {
  const issues = [];
  const points = spec.series.flatMap((series) => series.data.map((datum, pointIndex) => ({ ...datum, seriesId: series.id, pointIndex })));
  if (!points.length) issues.push({ code: 'missing_values', severity: 'hard' });
  if (points.some((point) => !Number.isFinite(point.y))) issues.push({ code: 'invalid_values', severity: 'hard' });
  if (points.every((point) => point.y === 0)) issues.push({ code: 'all_zero_values', severity: 'warning' });
  if (new Set(points.map((point) => point.y)).size === 1) issues.push({ code: 'identical_values', severity: 'warning' });
  if (points.some((point) => point.y < 0)) issues.push({ code: 'negative_values_present', severity: 'info' });
  const labels = points.map((point) => String(point.x));
  if (labels.some((label) => !label.trim())) issues.push({ code: 'invalid_labels', severity: 'hard' });
  const nonZero = points.map((point) => Math.abs(point.y)).filter(Boolean);
  if (nonZero.length && Math.max(...nonZero) / Math.min(...nonZero) > 1000) issues.push({ code: 'large_magnitude_range', severity: 'warning' });
  return { issues, valid: !issues.some((issue) => issue.severity === 'hard') };
}

export function linearScale(domain, range) {
  let [d0, d1] = domain, [r0, r1] = range;
  if (d0 === d1) { const pad = Math.abs(d0 || 1) * 0.1 || 1; d0 -= pad; d1 += pad; }
  const scale = (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
  scale.domain = [d0, d1]; scale.range = [r0, r1];
  return scale;
}

export function categoricalScale(domain, range, padding = 0.18) {
  const unique = [...new Set(domain.map(String))];
  const [r0, r1] = range;
  const step = (r1 - r0) / Math.max(1, unique.length);
  const bandwidth = step * (1 - padding);
  const offset = (step - bandwidth) / 2;
  const scale = (value) => r0 + Math.max(0, unique.indexOf(String(value))) * step + offset;
  scale.domain = unique; scale.range = [r0, r1]; scale.bandwidth = bandwidth; scale.step = step;
  return scale;
}

function niceStep(span, count) {
  const rough = span / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, Number.EPSILON)));
  const error = rough / power;
  const factor = error >= 5 ? 5 : error >= 2 ? 2 : 1;
  return factor * power;
}

export function linearTicks(domain, count = 5) {
  const [min, max] = domain;
  if (min === max) return [min];
  const step = niceStep(max - min, count);
  const start = Math.floor(min / step) * step, end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = start; value <= end + step * 0.01 && ticks.length <= count + 2; value += step) ticks.push(Number(value.toPrecision(12)));
  return ticks;
}

export function formatChartValue(value, units = null) {
  const abs = Math.abs(value);
  const compact = abs >= 1e9 ? `${(value / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`
    : abs >= 1e6 ? `${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`
      : abs >= 1e3 ? `${(value / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`
        : Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
  return units === '%' ? `${compact}%` : units ? `${compact} ${units}` : compact;
}

