#!/usr/bin/env node
/**
 * Run Directory Maintenance & Cleanup CLI.
 * 
 * Usage:
 *   npm run runs:clean                   # Cleans runs older than 7 days (default)
 *   npm run runs:clean -- --days 3        # Cleans runs older than 3 days
 *   npm run runs:clean -- --all           # Cleans all historical runs
 *   npm run runs:clean -- --dry-run       # Previews what would be deleted
 *   npm run runs:clean -- --delete-outputs # Also deletes preserved output mp4s
 */

import { pruneRuns } from '../server/runPruner.js';

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const hasFlag = (flag) => args.includes(flag);

async function main() {
  const days = Number(getArg('--days', '7'));
  const all = hasFlag('--all');
  const dryRun = hasFlag('--dry-run');
  const deleteOutputs = hasFlag('--delete-outputs');
  const keepOutputs = !deleteOutputs;

  console.log(`\n🧹 RUN CLEANUP UTILITY:`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no files deleted)' : 'ACTIVE PURGE'}`);
  console.log(`Filter: ${all ? 'ALL completed runs' : `Runs older than ${days} day(s)`}`);
  console.log(`Output preservation: ${keepOutputs ? 'YES (final MP4s preserved in renders/downloads)' : 'NO (all removed)'}\n`);

  const result = await pruneRuns({
    olderThanDays: days,
    all,
    dryRun,
    keepOutputs,
  });

  console.log(`Scanned: ${result.scanned} run directories`);
  console.log(`${dryRun ? 'Eligible for pruning' : 'Pruned'}: ${result.pruned} run directories`);
  console.log(`Disk space ${dryRun ? 'to be freed' : 'freed'}: ${result.freedMb} MB (${result.bytesFreed} bytes)`);
  console.log(`--------------------------------------------------------------------------------\n`);
}

main().catch((err) => {
  console.error('Run cleanup failed:', err);
  process.exit(1);
});
