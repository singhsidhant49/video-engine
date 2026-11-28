import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config/index.js';
import { createConfiguredVideoJobService } from './serviceFactory.js';

import { loadMediaBankCatalog } from '../services/mediaBank.js';
import { pruneRuns } from './runPruner.js';
import { cleanCache } from '../core/cache/cacheManager.js';

/** Remove leftover Remotion / QC temporary directories left in /tmp after a crash. */
async function cleanupOrphanedTmp() {
  try {
    const tmpRoot = os.tmpdir();
    const entries = await fs.readdir(tmpRoot);
    let removed = 0;
    for (const name of entries) {
      if (name.startsWith('remotion-webpack-bundle-') || name.startsWith('rqc-') || name.startsWith('remotion-v4-')) {
        await fs.rm(path.join(tmpRoot, name), { recursive: true, force: true }).catch(() => {});
        removed += 1;
      }
    }
    if (removed > 0) console.log(`🧹 [Worker Startup] Removed ${removed} orphaned temp director${removed === 1 ? 'y' : 'ies'} from ${tmpRoot}.`);
  } catch (err) {
    console.warn('[Worker Startup] Temp cleanup warning:', err?.message);
  }
}

await cleanupOrphanedTmp();
const service = createConfiguredVideoJobService({ role: 'worker' });
await service.init();
await loadMediaBankCatalog().catch(() => {});
console.log(`Video worker ready (concurrency ${config.server.workerConcurrency}).`);

// Background maintenance: automatically clean old run directories
const retentionDays = Number(process.env.RUNS_RETENTION_DAYS || 7);
const cleanupIntervalHours = Number(process.env.RUNS_CLEANUP_INTERVAL_HOURS || 12);
const cleanupIntervalMs = Math.max(1, cleanupIntervalHours) * 60 * 60 * 1000;

async function runWorkerPruner() {
  try {
    const [res, cache] = await Promise.all([
      pruneRuns({ olderThanDays: retentionDays, keepOutputs: true }),
      cleanCache({ olderThanDays: Number(process.env.CACHE_RETENTION_DAYS || 14) }),
    ]);
    if (res.pruned > 0) {
      console.log(`🧹 [Worker Pruner] Cleaned ${res.pruned} old runs (${res.freedMb} MB freed).`);
    }
    if (cache.removedCount > 0) console.log(`🧹 [Worker Pruner] Cleaned ${cache.removedCount} cache files (${cache.freedMb} MB freed).`);
  } catch (err) {
    console.warn(`[Worker Pruner] Run cleanup error:`, err?.message);
  }
}

// Initial prune shortly after startup, then on regular interval
const initialPruneTimer = setTimeout(() => void runWorkerPruner(), 10_000);
const periodicPruneTimer = setInterval(() => void runWorkerPruner(), cleanupIntervalMs);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  clearTimeout(initialPruneTimer);
  clearInterval(periodicPruneTimer);
  console.log(`${signal} received; draining video worker...`);
  await service.shutdown({ timeoutMs: config.server.shutdownTimeoutMs });
  console.log('Video worker shutdown complete.');
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
