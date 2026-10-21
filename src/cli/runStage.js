#!/usr/bin/env node
/**
 * Single-Stage Debug Runner CLI (Milestone 12).
 * 
 * Executes an individual pipeline stage for a run:
 * Example: npm run pipeline:stage -- --run video-2026-09-28T09-30-31 --stage creative-qa
 */

import path from 'node:path';
import { createFacelessVideo } from '../pipeline/videoGeneratorPipeline.js';

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const runId = getArg('--run');
const stage = getArg('--stage');

if (!runId || !stage || args.includes('--help')) {
  console.log(`Usage: npm run pipeline:stage -- --run <runId> --stage <stage>
Example: npm run pipeline:stage -- --run video-2026-09-28T09-30-31 --stage timeline
`);
  process.exit(runId && stage ? 0 : 1);
}

console.log(`\n🎯 Debugging single stage "${stage}" on run "${runId}"`);

createFacelessVideo({
  resume: runId,
  from: stage,
  render: stage === 'render' || stage === 'postRenderQa',
  onProgress: (p) => {
    if (p.message) console.log(`   [${p.step || 'stage'}] ${p.message}`);
  },
})
  .then((r) => console.log(`\n✔ Stage "${stage}" completed successfully for run ${r.videoId}`))
  .catch((err) => {
    console.error(`\n❌ Stage execution failed:`, err);
    process.exit(1);
  });
