import fs from 'node:fs/promises';
import path from 'node:path';
import { VideoProjectSchema } from '../../models/videoProject.schema.js';
import { CheckpointStore } from '../checkpoints/checkpointManifest.js';
import { acquireRunLock, releaseRunLock } from '../locks/runLock.js';

export class JobContext {
  constructor({ project, runDir, publicDir, checkpoints, lock = null }) {
    this.project = VideoProjectSchema.parse(project);
    this.runDir = runDir;
    this.publicDir = publicDir;
    this.checkpoints = checkpoints;
    this.lock = lock;
    this.activeStage = 'request';
  }

  static async create({ id, topic, channelId = 'default', format, targetDuration = null, config = {}, runsDir }) {
    const now = new Date().toISOString();
    const runDir = path.join(runsDir, id);
    const publicDir = path.join(runDir, 'public');
    await fs.mkdir(publicDir, { recursive: true });
    const lock = await acquireRunLock(runDir);
    const checkpoints = await CheckpointStore.create(runDir, id);
    const project = VideoProjectSchema.parse({
      version: 1,
      id,
      topic,
      channelId,
      format,
      targetDuration,
      status: 'running',
      currentStage: 'request',
      config,
      artifacts: {},
      errors: [],
      createdAt: now,
      updatedAt: now,
    });
    const context = new JobContext({ project, runDir, publicDir, checkpoints, lock });
    await context.persistProject();
    return context;
  }

  static async load({ id, runsDir }) {
    const runDir = path.join(runsDir, id);
    const publicDir = path.join(runDir, 'public');
    const lock = await acquireRunLock(runDir);
    const checkpoints = await CheckpointStore.load(runDir);
    const projectRaw = await fs.readFile(path.join(runDir, 'project.json'), 'utf8');
    const project = VideoProjectSchema.parse(JSON.parse(projectRaw));
    return new JobContext({ project, runDir, publicDir, checkpoints, lock });
  }

  async startStage(stage) {
    this.activeStage = stage;
    this.project.currentStage = stage;
    this.project.status = 'running';
    await this.checkpoints.start(stage);
    await this.persistProject();
  }

  async completeStage(stage, artifacts = [], metadata = {}) {
    await this.checkpoints.complete(stage, artifacts, metadata);
    this.#recordArtifacts(stage, artifacts);
    await this.persistProject();
  }

  async invalidateStage(stage, reason) {
    await this.checkpoints.invalidate(stage, reason);
    await this.persistProject();
  }

  async skipStage(stage) {
    await this.checkpoints.skip(stage);
  }

  async fail(error) {
    const message = error instanceof Error ? error.message : String(error);
    this.project.status = 'failed';
    this.project.errors.push({ stage: this.activeStage, message, at: new Date().toISOString() });
    await this.checkpoints.fail(this.activeStage, error);
    await this.persistProject();
    if (this.lock?.release) {
      await this.lock.release().catch(() => {});
    }
  }

  async finish() {
    this.project.status = 'complete';
    this.project.currentStage = 'complete';
    await this.persistProject();
    if (this.lock?.release) {
      await this.lock.release().catch(() => {});
    }
  }

  /**
   * Writes an artifact atomically to disk using a temporary file.
   */
  async writeArtifact(name, value, { schema, stage = this.activeStage } = {}) {
    const parsed = schema ? schema.parse(value) : value;
    const filePath = path.join(this.runDir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Atomic write
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(parsed, null, 2));
    await fs.rename(tmpPath, filePath);

    this.#recordArtifacts(stage, [name.split(path.sep).join('/')]);
    await this.persistProject();
    return parsed;
  }

  #recordArtifacts(stage, artifacts) {
    const existing = this.project.artifacts[stage] || [];
    this.project.artifacts[stage] = [...new Set([...existing, ...artifacts])];
  }

  async persistProject() {
    this.project.updatedAt = new Date().toISOString();
    this.project = VideoProjectSchema.parse(this.project);
    const filePath = path.join(this.runDir, 'project.json');
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(this.project, null, 2));
    await fs.rename(tmpPath, filePath);
  }
}
