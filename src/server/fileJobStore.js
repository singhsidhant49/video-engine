import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const ORPHAN_TEMP_MAX_AGE_MS = 60 * 60 * 1000;

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export class FileJobStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.jobsDir = path.join(rootDir, 'jobs');
    this.operationsDir = path.join(rootDir, 'operations');
  }

  async init() {
    await Promise.all([
      fs.mkdir(this.jobsDir, { recursive: true }),
      fs.mkdir(this.operationsDir, { recursive: true }),
    ]);
    await Promise.all([
      this.#removeOrphanedTemps(this.jobsDir),
      this.#removeOrphanedTemps(this.operationsDir),
    ]);
  }

  async health() {
    try {
      await Promise.all([
        fs.access(this.jobsDir, fsConstants.R_OK | fsConstants.W_OK),
        fs.access(this.operationsDir, fsConstants.R_OK | fsConstants.W_OK),
      ]);
      return { healthy: true, type: 'filesystem' };
    } catch (error) {
      return { healthy: false, type: 'filesystem', code: error?.code || 'STORE_UNAVAILABLE' };
    }
  }

  async #removeOrphanedTemps(directory) {
    const now = Date.now();
    const entries = await fs.readdir(directory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile() || !/\.json\.tmp-\d+-[0-9a-f-]+$/i.test(entry.name)) return;
      const file = path.join(directory, entry.name);
      try {
        const stat = await fs.stat(file);
        if (now - stat.mtimeMs >= ORPHAN_TEMP_MAX_AGE_MS) await fs.rm(file, { force: true });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }));
  }

  jobPath(id) { return path.join(this.jobsDir, `${id}.json`); }
  operationPath(id) { return path.join(this.operationsDir, `${id}.json`); }

  async #writeAtomic(file, value) {
    const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
    await fs.writeFile(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' });
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await fs.rename(temp, file);
          return value;
        } catch (error) {
          const retryableWindowsLock = process.platform === 'win32' && ['EPERM', 'EBUSY', 'EACCES'].includes(error.code);
          if (!retryableWindowsLock || attempt >= 5) throw error;
          await new Promise((resolve) => setTimeout(resolve, 12 * (attempt + 1)));
        }
      }
    } catch (error) {
      await fs.rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }

  async putJob(job) { return this.#writeAtomic(this.jobPath(job.id), job); }
  async getJob(id) { return readJson(this.jobPath(id)); }
  async deleteJob(id) { await fs.rm(this.jobPath(id), { force: true }); }
  async putOperation(operation) { return this.#writeAtomic(this.operationPath(operation.id), operation); }
  async getOperation(id) { return readJson(this.operationPath(id)); }

  async listOperations() {
    const files = (await fs.readdir(this.operationsDir)).filter((file) => file.endsWith('.json'));
    return (await Promise.all(files.map((file) => readJson(path.join(this.operationsDir, file))))).filter(Boolean);
  }

  async findDeletion(ownerId, videoId) {
    return (await this.listOperations()).find((operation) => operation.ownerId === ownerId && operation.videoId === videoId) || null;
  }

  async listJobs() {
    const files = (await fs.readdir(this.jobsDir)).filter((file) => file.endsWith('.json'));
    return (await Promise.all(files.map((file) => readJson(path.join(this.jobsDir, file))))).filter(Boolean);
  }

  async findByIdempotency(ownerId, key) {
    if (!key) return null;
    return (await this.listJobs()).find((job) => job.ownerId === ownerId && job.idempotencyKey === key) || null;
  }
}
