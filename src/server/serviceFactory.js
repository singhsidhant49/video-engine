import path from 'node:path';
import { config } from '../config/index.js';
import { BullVideoQueue } from './bullVideoQueue.js';
import { FileJobStore } from './fileJobStore.js';
import { PostgresJobStore } from './postgresJobStore.js';
import { VideoJobService } from './videoJobService.js';

export function createConfiguredVideoJobService({ role = process.env.VIDEO_PROCESS_ROLE || 'all' } = {}) {
  const store = config.server.jobStore === 'postgres'
    ? new PostgresJobStore()
    : new FileJobStore(path.join(config.rendersDir, 'api'));
  const taskQueue = config.server.queueBackend === 'bullmq'
    ? new BullVideoQueue({ processJobs: ['worker', 'all'].includes(role), concurrency: config.server.workerConcurrency })
    : null;
  if (role === 'api' && !taskQueue) {
    throw new Error('VIDEO_PROCESS_ROLE=api requires VIDEO_QUEUE_BACKEND=bullmq; otherwise no worker can receive jobs');
  }
  return new VideoJobService({ store, taskQueue });
}
