#!/usr/bin/env node
/**
 * Cache Statistics & Management CLI (Milestone 12).
 * 
 * Usage:
 *   npm run cache:stats
 *   npm run cache:clean [--days <num>]
 */

import { getCacheStats, cleanCache } from '../core/cache/cacheManager.js';

const command = process.argv[2] || 'stats';
const args = process.argv.slice(3);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

async function main() {
  if (command === 'clean') {
    const days = Number(getArg('--days', '14'));
    console.log(`\n🧹 Cleaning cache entries older than ${days} days...`);
    const res = await cleanCache({ olderThanDays: days });
    console.log(`   Removed ${res.removedCount} items (${res.freedMb} MB freed)`);
    return;
  }

  console.log(`\n📦 CACHE STORAGE STATISTICS:`);
  console.log(`--------------------------------------------------------------------------------`);
  const stats = await getCacheStats();
  console.log(`Location: ${stats.cacheRoot}`);
  console.log(`Total Files: ${stats.totalFiles} · Total Size: ${stats.totalSizeMb} MB\n`);

  console.log(`Subsystem Breakdown:`);
  for (const [sub, data] of Object.entries(stats.breakdown)) {
    console.log(`   ${sub.padEnd(16)} : ${String(data.filesCount).padStart(4)} file(s) · ${data.sizeMb.toFixed(2)} MB`);
  }

  console.log(`\nCumulative Session Metrics:`);
  console.log(`   TTS Hits: ${stats.metrics.ttsHits} · Misses: ${stats.metrics.ttsMisses}`);
  console.log(`   Alignment Hits: ${stats.metrics.alignmentHits} · Misses: ${stats.metrics.alignmentMisses}`);
  console.log(`   Asset Search Hits: ${stats.metrics.assetSearchHits} · Misses: ${stats.metrics.assetSearchMisses}`);
  console.log(`   Media Download Hits: ${stats.metrics.assetDownloadHits} · Misses: ${stats.metrics.assetDownloadMisses}`);
  console.log(`   Bytes Reused: ${stats.metrics.bytesReusedMb} MB · Time Saved: ~${stats.metrics.estimatedTimeSavedSec}s`);
  console.log(`--------------------------------------------------------------------------------\n`);
}

main().catch((err) => {
  console.error('Cache command failed:', err);
  process.exit(1);
});
