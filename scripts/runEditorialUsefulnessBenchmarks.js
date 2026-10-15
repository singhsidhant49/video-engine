import path from 'node:path';
import fs from 'node:fs/promises';
import { createFacelessVideo } from '../src/pipeline/videoGeneratorPipeline.js';

const benchmarks = {
  grandfather_landscape: {
    name: 'Grandfather Paradox Landscape',
    topic: 'The Grandfather Paradox and Branching Timelines',
    format: 'landscape',
    durationSec: 65,
    niche: 'science',
  },
  grandfather_shorts: {
    name: 'Grandfather Paradox Shorts',
    topic: 'The Grandfather Paradox and Branching Timelines',
    format: 'shorts',
    durationSec: 40,
    niche: 'science',
  },
  bootstrap_landscape: {
    name: 'Bootstrap Paradox Landscape (Unseen Story Topic)',
    topic: 'The Bootstrap Paradox: Objects Without an Origin',
    format: 'landscape',
    durationSec: 65,
    niche: 'science',
  },
  branch_prediction_shorts: {
    name: 'CPU Branch Prediction Shorts (Unseen Technical Topic)',
    topic: 'How CPU Branch Prediction Speeds Up Modern Processors',
    format: 'shorts',
    durationSec: 40,
    niche: 'tech',
  },
};

const target = process.argv[2] || 'grandfather_landscape';
const keys = target === 'all' ? Object.keys(benchmarks) : [target];
const shouldRender = !process.argv.includes('--no-render');

console.log(`Starting Editorial Usefulness Benchmark Runner for: ${keys.join(', ')}`);
console.log(`Render Mode: ${shouldRender ? 'FULL PRODUCTION REMOTION MP4 RENDER' : 'TIMELINE ONLY'}`);

const benchmarkResults = [];

for (const key of keys) {
  const b = benchmarks[key];
  if (!b) {
    console.error(`Unknown benchmark key: ${key}`);
    continue;
  }

  console.log(`\n======================================================`);
  console.log(`RUNNING: ${b.name}`);
  console.log(`Topic: "${b.topic}" | Format: ${b.format} | Duration: ${b.durationSec}s`);
  console.log(`======================================================\n`);

  try {
    const result = await createFacelessVideo({
      topic: b.topic,
      format: b.format,
      durationSec: b.durationSec,
      niche: b.niche,
      render: shouldRender,
      visualMode: 'MEDIA_EDITORIAL',
      unresolvedMediaMode: 'BLOCK_PRODUCTION',
      publishMode: 'PRODUCTION_RENDER',
    });

    let timelineData = null;
    try {
      timelineData = JSON.parse(await fs.readFile(path.join(result.runDir, 'timeline.json'), 'utf8'));
    } catch {}
    const qcData = result.qc?.timeline || result.qc || {};
    const shots = (timelineData?.clips || []).flatMap((c) => c.shots || []);
    console.log(`\n>>> BENCHMARK COMPLETED: ${key}`);
    console.log(`Run Directory: ${result.runDir}`);
    console.log(`Output Video: ${result.outputPath}`);
    console.log(`Total Shots: ${shots.length}`);
    console.log(`QC Status: ${qcData.ok ? 'PASS' : 'FAIL'} (Errors: ${qcData.errors?.length || 0}, Warns: ${qcData.warnings?.length || 0})`);

    benchmarkResults.push({
      key,
      name: b.name,
      runDir: result.runDir,
      outputPath: result.outputPath,
      format: b.format,
      shotsCount: shots.length,
      qcOk: qcData.ok,
      editorialCounts: qcData.editorialCounts,
    });
  } catch (err) {
    console.error(`\n>>> BENCHMARK FAILED: ${key}:`, err);
  }
}

console.log(`\n======================================================`);
console.log(`BENCHMARK RUN SUMMARY:`);
console.log(JSON.stringify(benchmarkResults, null, 2));
console.log(`======================================================\n`);
