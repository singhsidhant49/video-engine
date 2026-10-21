import path from 'node:path';
import { createFacelessVideo } from '../src/pipeline/videoGeneratorPipeline.js';

const benchmarks = {
  grandfather_landscape: {
    topic: 'The Grandfather Paradox and Branching Timelines',
    format: 'landscape',
    durationSec: 65,
    niche: 'science',
    planFile: path.resolve('renders/runs/video-2026-10-02T14-38-06/plan.json'),
  },
  grandfather_shorts: {
    topic: 'The Grandfather Paradox and Branching Timelines',
    format: 'shorts',
    durationSec: 40,
    niche: 'science',
    planFile: path.resolve('renders/runs/video-2026-10-02T14-17-32/plan.json'),
  },
  cloud_shorts: {
    topic: 'How Cloud Computing Actually Works',
    format: 'shorts',
    durationSec: 40,
    niche: 'tech',
    planFile: path.resolve('renders/runs/video-2026-10-02T13-54-08/plan.json'),
  },
  memory_landscape: {
    topic: 'Why Memory Leaks Crash Production Systems',
    format: 'landscape',
    durationSec: 65,
    niche: 'tech',
    planFile: path.resolve('renders/runs/video-2026-10-02T13-50-57/plan.json'),
  },
  ship_of_theseus_landscape: {
    topic: 'The Ship of Theseus Identity Paradox',
    format: 'landscape',
    durationSec: 55,
    niche: 'philosophy',
    planFile: path.resolve('renders/runs/video-2026-10-05T16-05-42/plan.json'),
  },
  database_deadlock_landscape: {
    topic: 'How Database Deadlocks Happen and How to Prevent Them',
    format: 'landscape',
    durationSec: 55,
    niche: 'software development',
    planFile: path.resolve('renders/runs/video-2026-10-02T13-59-52/plan.json'),
  },
};

const keys = process.argv[2] === 'all'
  ? Object.keys(benchmarks)
  : (process.argv[2] ? [process.argv[2]] : ['grandfather_landscape']);

const shouldRender = !process.argv.includes('--no-render');

for (const targetKey of keys) {
  const brief = benchmarks[targetKey];
  if (!brief) {
    console.error(`Unknown benchmark key: ${targetKey}`);
    continue;
  }

  console.log(`\n======================================================`);
  console.log(`Starting benchmark pipeline for: ${targetKey} (${brief.topic}) [${brief.format}, ${brief.durationSec}s]`);
  console.log(`Plan file: ${brief.planFile}`);
  console.log(`Render mode: ${shouldRender ? 'FULL MP4 RENDER' : 'TIMELINE ONLY'}`);
  console.log(`======================================================\n`);

  try {
    const result = await createFacelessVideo({
      topic: brief.topic,
      format: brief.format,
      durationSec: brief.durationSec,
      niche: brief.niche,
      planFile: brief.planFile,
      render: shouldRender,
      visualMode: 'MEDIA_EDITORIAL',
      unresolvedMediaMode: 'BLOCK_PRODUCTION',
      publishMode: 'PRODUCTION_RENDER',
      renderScale: Number(process.env.BENCHMARK_RENDER_SCALE || '0.5'),
      offline: process.env.BENCHMARK_OFFLINE === '1',
    });
    console.log(`BENCHMARK_SUCCESS:${targetKey}:${result.runDir}:${result.timeline?.clips?.flatMap((c) => c.shots || []).length || 0}`);
  } catch (err) {
    console.error(`BENCHMARK_ERROR:${targetKey}:`, err);
  }
}
