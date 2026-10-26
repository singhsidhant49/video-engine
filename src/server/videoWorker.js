import { config } from '../config/index.js';
import { createConfiguredVideoJobService } from './serviceFactory.js';

import { loadMediaBankCatalog } from '../services/mediaBank.js';

const service = createConfiguredVideoJobService({ role: 'worker' });
await service.init();
await loadMediaBankCatalog().catch(() => {});
console.log(`Video worker ready (concurrency ${config.server.workerConcurrency}).`);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received; draining video worker...`);
  await service.shutdown({ timeoutMs: config.server.shutdownTimeoutMs });
  console.log('Video worker shutdown complete.');
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
