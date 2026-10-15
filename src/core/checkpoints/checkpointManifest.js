import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { CheckpointManifestSchema } from '../../models/checkpointManifest.schema.js';
import { canonicalStageName } from './stageRegistry.js';

export const CHECKPOINT_STAGES = [
  'request', 'plan', 'audio', 'alignment', 'visualStrategy', 'storyboard',
  'assets', 'timeline', 'preRenderQa', 'render', 'postRenderQa', 'package',
];

const emptyStage = () => ({
  status: 'pending',
  startedAt: null,
  completedAt: null,
  durationMs: null,
  artifacts: [],
  outputFiles: [],
  outputChecksums: {},
  inputHashes: {},
  schemaVersion: 1,
  codeVersion: null,
  configHash: null,
  error: null,
});

export function createCheckpointManifest(videoId, now = new Date().toISOString()) {
  return CheckpointManifestSchema.parse({
    version: 1,
    videoId,
    projectFile: 'project.json',
    createdAt: now,
    updatedAt: now,
    stages: Object.fromEntries(CHECKPOINT_STAGES.map((stage) => [stage, emptyStage()])),
  });
}

export class CheckpointStore {
  constructor(runDir, manifest) {
    this.runDir = runDir;
    this.filePath = path.join(runDir, 'manifest.json');
    this.manifest = CheckpointManifestSchema.parse(manifest);
  }

  static async create(runDir, videoId) {
    await fs.mkdir(runDir, { recursive: true });
    const store = new CheckpointStore(runDir, createCheckpointManifest(videoId));
    await store.flush();
    return store;
  }

  static async load(runDir) {
    const manifestPath = path.join(runDir, 'manifest.json');
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    return new CheckpointStore(runDir, parsed);
  }

  /**
   * Atomically flushes manifest to disk by writing to .tmp then renaming.
   */
  async flush() {
    this.manifest.updatedAt = new Date().toISOString();
    this.manifest = CheckpointManifestSchema.parse(this.manifest);
    const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(this.manifest, null, 2));
    await fs.rename(tmpPath, this.filePath);
  }

  async start(stage) {
    const checkpoint = this.#stage(stage);
    checkpoint.status = 'in_progress';
    checkpoint.startedAt = new Date().toISOString();
    checkpoint.completedAt = null;
    checkpoint.durationMs = null;
    checkpoint.error = null;
    await this.flush();
  }

  async complete(stage, artifacts = [], metadata = {}) {
    const checkpoint = this.#stage(stage);
    const completedAt = new Date();
    checkpoint.status = 'complete';
    checkpoint.completedAt = completedAt.toISOString();
    checkpoint.durationMs = checkpoint.startedAt
      ? Math.max(0, completedAt.getTime() - new Date(checkpoint.startedAt).getTime())
      : 0;
    checkpoint.artifacts = [...new Set([...checkpoint.artifacts, ...artifacts])];
    checkpoint.outputFiles = [...new Set([...(checkpoint.outputFiles || []), ...artifacts])];
    checkpoint.outputChecksums = checkpoint.outputChecksums || {};
    for (const artifact of artifacts) {
      const candidates = [path.resolve(this.runDir, artifact), path.resolve(this.runDir, 'public', artifact)];
      for (const candidate of candidates) {
        try {
          const content = await fs.readFile(candidate);
          checkpoint.outputChecksums[artifact] = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
          break;
        } catch {}
      }
    }
    if (metadata.inputHashes) checkpoint.inputHashes = metadata.inputHashes;
    if (metadata.codeVersion) checkpoint.codeVersion = metadata.codeVersion;
    if (metadata.configHash) checkpoint.configHash = metadata.configHash;
    checkpoint.error = null;
    await this.flush();
  }

  /** Refresh checksums when a stage intentionally enriches a shared artifact
   * owned by an earlier stage (for example measured duration diagnostics).
   * This preserves the original stage timing/status while keeping resume
   * validation consistent with the bytes on disk. */
  async refreshArtifactChecksums(stage, artifacts = []) {
    const checkpoint = this.#stage(stage);
    checkpoint.outputChecksums = checkpoint.outputChecksums || {};
    for (const artifact of artifacts) {
      const candidates = [path.resolve(this.runDir, artifact), path.resolve(this.runDir, 'public', artifact)];
      let refreshed = false;
      for (const candidate of candidates) {
        try {
          const content = await fs.readFile(candidate);
          checkpoint.outputChecksums[artifact] = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
          refreshed = true;
          break;
        } catch {}
      }
      if (!refreshed) throw new Error(`Cannot refresh checksum for missing artifact: ${artifact}`);
    }
    await this.flush();
  }

  async invalidate(stage, reason = 'downstream invalidation') {
    const checkpoint = this.#stage(stage);
    checkpoint.status = 'invalidated';
    checkpoint.error = reason;
    await this.flush();
  }

  async skip(stage) {
    const checkpoint = this.#stage(stage);
    checkpoint.status = 'skipped';
    checkpoint.completedAt = new Date().toISOString();
    checkpoint.durationMs = 0;
    await this.flush();
  }

  async fail(stage, error) {
    const checkpoint = this.#stage(stage);
    const completedAt = new Date();
    checkpoint.status = 'failed';
    checkpoint.completedAt = completedAt.toISOString();
    checkpoint.durationMs = checkpoint.startedAt
      ? Math.max(0, completedAt.getTime() - new Date(checkpoint.startedAt).getTime())
      : 0;
    checkpoint.error = error instanceof Error ? error.message : String(error);
    await this.flush();
  }

  #stage(stage) {
    const canonical = canonicalStageName(stage);
    const checkpoint = this.manifest.stages[canonical] || this.manifest.stages[stage];
    if (!checkpoint) {
      return { status: 'pending', artifacts: [], outputFiles: [], inputHashes: {} };
    }
    return checkpoint;
  }
}
