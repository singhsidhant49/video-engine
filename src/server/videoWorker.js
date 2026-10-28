import { config } from '../config/index.js';
import { createConfiguredVideoJobService } from './serviceFactory.js';

import { loadMediaBankCatalog } from '../services/mediaBank.js';
import { pruneRuns } from './runPruner.js';

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
    const res = await pruneRuns({ olderThanDays: retentionDays, keepOutputs: true });
    if (res.pruned > 0) {
      console.log(`🧹 [Worker Pruner] Cleaned ${res.pruned} old runs (${res.freedMb} MB freed).`);
    }
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
