import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config/index.js';
import { compileSolvedComparisonShot } from '../src/composition/compileSolvedComparisonShot.js';
import { compileSolvedChartShot } from '../src/composition/compileSolvedChartShot.js';
import { clearTextMeasurementCache, textMeasurementCacheStats } from '../src/composition/layout/textMeasurement.js';
import { COMPARISON_FIXTURES, CHART_FIXTURES, editorialPlanForM15Fixture } from '../src/composition/milestone15Fixtures.js';

function argsFor(fixture, representation) {
  return { editorialPlan: editorialPlanForM15Fixture(fixture, representation), overlay: fixture.overlay, alignedWords: fixture.alignedWords, timing: { startFrame: 0, durationInFrames: fixture.durationInFrames }, format: 'landscape', width: 1920, height: 1080, styleId: 'documentary' };
}

function benchmark(name, compiler, args, warmIterations = 100) {
  clearTextMeasurementCache();
  const coldStart = performance.now(); compiler(args); const coldMs = performance.now() - coldStart;
  const warmStart = performance.now();
  for (let index = 0; index < warmIterations; index++) compiler(args);
  const warmAverageMs = (performance.now() - warmStart) / warmIterations;
  return { name, coldMs: Number(coldMs.toFixed(3)), warmAverageMs: Number(warmAverageMs.toFixed(3)), warmIterations, cache: textMeasurementCacheStats() };
}

const results = [
  benchmark('comparison', compileSolvedComparisonShot, argsFor(COMPARISON_FIXTURES[1], 'comparison')),
  benchmark('chart', compileSolvedChartShot, argsFor(CHART_FIXTURES[0], 'chart')),
];
const output = path.join(config.rootDir, 'fixtures', 'golden', 'composition-m15', 'performance.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));

