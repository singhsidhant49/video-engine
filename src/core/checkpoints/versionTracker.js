/**
 * Version Tracker & Config Snapshot Engine (Milestone 12).
 * 
 * Captures:
 * 1. Git commit hash (if repository available)
 * 2. Pipeline and schema versions
 * 3. Exact effective configuration snapshot (defaults, style, channel, CLI overrides)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

export function getGitCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export const PIPELINE_VERSION = '1.0.0-m12';
export const SCHEMA_VERSION = 1;

/**
 * Persists an exact config snapshot and version footprint for a run.
 * 
 * @param {string} runDir
 * @param {Object} effectiveConfig
 * @returns {Promise<Object>}
 */
export async function persistConfigSnapshot(runDir, effectiveConfig = {}) {
  const snapshot = {
    pipelineVersion: PIPELINE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    gitCommit: getGitCommitHash(),
    capturedAt: new Date().toISOString(),
    config: effectiveConfig,
  };

  const filePath = path.join(runDir, 'config-snapshot.json');
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
  return snapshot;
}
