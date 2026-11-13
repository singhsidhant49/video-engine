import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createFacelessVideo } from '../src/pipeline/videoGeneratorPipeline.js';
import { evaluateProductionBenchmark, resultFromPipeline } from '../src/benchmark/productionBenchmark.js';

const PROFILES = [
  { id: 'finance', topic: 'How compound interest changes long-term wealth', niche: 'finance economics', contentType: 'explainer', pacingMode: 'balanced' },
  { id: 'technology', topic: 'How internet requests travel from browser to server', niche: 'technology', contentType: 'educational', pacingMode: 'energetic' },
  { id: 'history', topic: 'How the printing press changed European society', niche: 'history', contentType: 'documentary', pacingMode: 'cinematic' },
  { id: 'investigation', topic: 'How online marketplace scams manipulate buyers', niche: 'consumer safety', contentType: 'investigative', pacingMode: 'cinematic' },
  { id: 'meditation', topic: 'A gentle guided body scan for restful sleep', niche: 'sleep meditation', contentType: 'meditation', pacingMode: 'contemplative' },
  { id: 'audiobook', topic: 'A reflective story about patience and change', niche: 'narrated story', contentType: 'audiobook', pacingMode: 'contemplative' },
  { id: 'tutorial', topic: 'How to build a practical weekly budget', niche: 'personal finance tutorial', contentType: 'tutorial', pacingMode: 'energetic' },
  { id: 'motivation', topic: 'Why consistency matters more than intensity', niche: 'self improvement', contentType: 'motivational', pacingMode: 'energetic' },
];

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const repeatCount = Math.max(1, Number(value('--repeat', '1')) || 1);
const durationSec = Math.max(30, Number(value('--duration', '60')) || 60);
const selected = value('--profile', 'all');
const render = !args.includes('--no-render');
const offline = args.includes('--offline');
const listOnly = args.includes('--list');
const profiles = selected === 'all' ? PROFILES : PROFILES.filter((profile) => profile.id === selected);

async function writeWithRetry(file, contents, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { await fs.writeFile(file, contents); return; }
    catch (error) {
      lastError = error;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

if (listOnly) {
  console.log(PROFILES.map((profile) => `${profile.id}: ${profile.topic}`).join('\n'));
  process.exit(0);
}
if (!profiles.length) throw new Error(`Unknown profile "${selected}". Use --list to see available profiles.`);

const results = [];
for (let repeat = 1; repeat <= repeatCount; repeat++) {
  for (const profile of profiles) {
    const started = Date.now();
    console.log(`[benchmark] ${profile.id} repeat ${repeat}/${repeatCount}`);
    try {
      const result = await createFacelessVideo({
        topic: profile.topic,
        niche: profile.niche,
        format: 'landscape',
        durationSec,
        channelProfile: { id: `benchmark-${profile.id}`, contentType: profile.contentType, pacingMode: profile.pacingMode },
        visualMode: 'MEDIA_EDITORIAL',
        publishMode: 'PRODUCTION_RENDER',
        unresolvedMediaMode: 'FAIL_PRODUCTION_RENDER',
        render,
        renderScale: Number(value('--render-scale', '0.5')),
        offline,
      });
      results.push(resultFromPipeline({ profileId: profile.id, repeat, result, elapsedMs: Date.now() - started }));
    } catch (error) {
      results.push(resultFromPipeline({ profileId: profile.id, repeat, error, elapsedMs: Date.now() - started }));
      console.error(`[benchmark] ${profile.id} failed: ${error.message}`);
    }
  }
}

const verdict = evaluateProductionBenchmark(results);
const report = { generatedAt: new Date().toISOString(), render, offline, durationSec, profiles: profiles.map((item) => item.id), results, verdict };
const outputDir = path.resolve('benchmarks', 'production');
const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
const contents = JSON.stringify(report, null, 2);
let reportPath = path.join(outputDir, `benchmark-${stamp}.json`);
try {
  await fs.mkdir(outputDir, { recursive: true });
  await writeWithRetry(reportPath, contents);
  await writeWithRetry(path.join(outputDir, 'latest.json'), contents).catch((error) => {
    console.warn(`[benchmark] Could not refresh latest.json: ${error.message}`);
  });
} catch (error) {
  const fallbackDir = path.join(os.tmpdir(), 'videoforge-benchmarks');
  await fs.mkdir(fallbackDir, { recursive: true });
  reportPath = path.join(fallbackDir, `benchmark-${stamp}.json`);
  await writeWithRetry(reportPath, contents);
  console.warn(`[benchmark] Workspace report directory unavailable (${error.code || error.message}); wrote the report to a temporary directory.`);
}
console.log(JSON.stringify(verdict, null, 2));
console.log(`Report: ${reportPath}`);
if (!verdict.passed) process.exitCode = 2;
