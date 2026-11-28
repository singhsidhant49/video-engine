import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

// Active locks heartbeat every minute. A lock is stale only after missing
// heartbeats for long enough to survive temporary I/O stalls.
const STALE_LOCK_MAX_AGE_MS = 10 * 60 * 1000;
const RETENTION_MARKER = '.retention-compacted.json';
const DURABLE_RUN_FILES = new Set([
  'request.json',
  // These two small files are the checkpoint index. Keeping them lets resume
  // validation invalidate only stages whose heavy artifacts were compacted,
  // instead of making every retained production record look resumable and
  // then fail with ENOENT.
  'project.json',
  'manifest.json',
  'plan.json',
  'timeline.json',
  'qc.json',
  'content-quality-diagnostics.json',
  'claim-evidence-diagnostics.json',
  'visual_critic.json',
  'creative-qa-after.json',
  'packaging.json',
  'contact-sheet.jpg',
]);

function isDurableRunFile(name) {
  return DURABLE_RUN_FILES.has(name) || /^thumbnail(?:-\d+)?\.png$/i.test(name);
}

/**
 * Calculates directory size in bytes recursively.
 */
async function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirSize(full);
      } else if (entry.isFile()) {
        const st = await fs.stat(full).catch(() => null);
        if (st) total += st.size;
      }
    }
  } catch {
    // Directory might have been removed or inaccessible
  }
  return total;
}

/**
 * Prunes historical run directories and scratch assets from renders/runs/.
 *
 * @param {object} [options]
 * @param {number} [options.olderThanDays=7] - Prune runs older than this many days (0 for all completed)
 * @param {boolean} [options.all=false] - If true, prune all runs regardless of age (skips only active locks)
 * @param {boolean} [options.dryRun=false] - If true, only reports what would be removed
 * @param {boolean} [options.keepOutputs=true] - If true, preserves final rendered .mp4 files
 * @param {string} [options.runsDir] - Path to runs directory (defaults to config.rendersDir/runs)
 * @returns {Promise<{ scanned: number, pruned: number, bytesFreed: number, freedMb: number, dryRun: boolean, details: Array<object> }>}
 */
export async function pruneRuns({
  olderThanDays = 7,
  all = false,
  dryRun = false,
  keepOutputs = true,
  runsDir = path.join(config.rendersDir, 'runs'),
} = {}) {
  const now = Date.now();
  const maxAgeMs = olderThanDays * 24 * 60 * 60 * 1000;
  const results = {
    scanned: 0,
    pruned: 0,
    bytesFreed: 0,
    freedMb: 0,
    dryRun,
    details: [],
  };

  let entries = [];
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return results;
    throw err;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    results.scanned++;
    const runPath = path.join(runsDir, entry.name);

    // Do not repeatedly compact runs during ordinary retention. Explicit
    // destructive cleanup (keepOutputs=false) must still be able to remove a
    // previously compacted run.
    if (keepOutputs) {
      try {
        await fs.access(path.join(runPath, RETENTION_MARKER));
        continue;
      } catch {
        // Not compacted yet.
      }
    }

    // 1. Check for active generation lock
    const lockFile = path.join(runPath, '.lock');
    try {
      const lockStat = await fs.stat(lockFile);
      const lockAge = now - lockStat.mtimeMs;
      if (lockAge < STALE_LOCK_MAX_AGE_MS) {
        // Active run in progress; do not touch
        continue;
      }
    } catch {
      // No lock file; run is not actively generating
    }

    // 2. Check directory age (via request.json mtime or directory stat)
    let folderMtime = 0;
    try {
      const reqStat = await fs.stat(path.join(runPath, 'request.json')).catch(() => null);
      if (reqStat) {
        folderMtime = reqStat.mtimeMs;
      } else {
        const dirStat = await fs.stat(runPath);
        folderMtime = dirStat.mtimeMs;
      }
    } catch {
      continue;
    }

    const ageMs = now - folderMtime;
    const shouldPrune = all || ageMs >= maxAgeMs;

    if (!shouldPrune) continue;

    const dirBytes = await getDirSize(runPath);

    if (dryRun) {
      results.pruned++;
      results.bytesFreed += dirBytes;
      results.details.push({ id: entry.name, path: runPath, bytes: dirBytes, action: 'would_delete' });
      continue;
    }

    try {
      if (keepOutputs) {
        // Find any output mp4 in run directory
        const runFiles = await fs.readdir(runPath).catch(() => []);
        const mp4Files = runFiles.filter((f) => f.endsWith('.mp4'));

        if (mp4Files.length > 0) {
          // If mp4 files exist, move them to renders/downloads or keep them, removing heavy intermediate files
          const downloadsDir = path.join(path.dirname(runsDir), 'downloads');
          await fs.mkdir(downloadsDir, { recursive: true });

          for (const mp4 of mp4Files) {
            const srcMp4 = path.join(runPath, mp4);
            const targetMp4 = path.join(downloadsDir, mp4.startsWith('vid_') ? mp4 : `${entry.name}_${mp4}`);
            // A failed preservation copy must abort compaction. Silently
            // continuing here could delete the only final output.
            await fs.copyFile(srcMp4, targetMp4);
          }
        }
      }

      if (keepOutputs) {
        // Keep the small artifacts used by authenticated thumbnail delivery,
        // quality review, factual audit, and production support. Remove heavy
        // downloaded media, TTS chunks, extracted frames, and render scratch.
        const entriesToCompact = await fs.readdir(runPath, { withFileTypes: true }).catch(() => []);
        await Promise.all(entriesToCompact.map(async (runEntry) => {
          if (runEntry.isFile() && isDurableRunFile(runEntry.name)) return;
          await fs.rm(path.join(runPath, runEntry.name), { recursive: true, force: true });
        }));
        await fs.writeFile(path.join(runPath, RETENTION_MARKER), JSON.stringify({
          version: 1,
          compactedAt: new Date().toISOString(),
          preserved: [...DURABLE_RUN_FILES, 'thumbnail*.png'],
        }, null, 2));
      } else {
        await fs.rm(runPath, { recursive: true, force: true });
      }
      const remainingBytes = keepOutputs ? await getDirSize(runPath) : 0;
      results.pruned++;
      results.bytesFreed += Math.max(0, dirBytes - remainingBytes);
      results.details.push({
        id: entry.name,
        path: runPath,
        bytes: Math.max(0, dirBytes - remainingBytes),
        action: keepOutputs ? 'compacted' : 'deleted',
      });
    } catch (err) {
      console.warn(`[RunPruner] Failed to delete run ${entry.name}:`, err?.message);
    }
  }

  results.freedMb = Number((results.bytesFreed / (1024 * 1024)).toFixed(2));
  return results;
}
