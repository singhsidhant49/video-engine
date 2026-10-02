/**
 * Run Cloning Utility (Milestone 12).
 * 
 * Allows a user to fork/clone an existing run to iterate on visual styles, music,
 * or specific scenes without destroying original artifacts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config/index.js';

/**
 * Clones an existing run into a new run directory.
 * 
 * @param {Object} options
 * @param {string} options.sourceRunId - Existing run ID (e.g. video-2026-09-28T09-30-31)
 * @param {string} [options.targetRunId] - Optional destination ID (defaults to <source>-variant-<timestamp>)
 * @param {string} [options.runsDir] - Path to runs directory
 * @returns {Promise<{ runId: string, runDir: string }>}
 */
export async function cloneRun({
  sourceRunId,
  targetRunId,
  runsDir = path.join(config.rendersDir, 'runs'),
}) {
  const sourceDir = path.join(runsDir, sourceRunId);
  const targetId = targetRunId || `${sourceRunId}-variant-${Date.now().toString(36)}`;
  const targetDir = path.join(runsDir, targetId);

  try {
    await fs.access(sourceDir);
  } catch {
    throw new Error(`Source run directory does not exist: ${sourceDir}`);
  }

  // Copy directory recursively (skipping locks and temporary files)
  await fs.cp(sourceDir, targetDir, {
    recursive: true,
    filter: (src) => !src.endsWith('.lock') && !src.endsWith('.tmp'),
  });

  // Update manifest.json with new videoId
  try {
    const manifestPath = path.join(targetDir, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.videoId = targetId;
    manifest.clonedFrom = sourceRunId;
    manifest.clonedAt = new Date().toISOString();
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  } catch {}

  // Update project.json with new videoId
  try {
    const projectPath = path.join(targetDir, 'project.json');
    const project = JSON.parse(await fs.readFile(projectPath, 'utf8'));
    project.id = targetId;
    project.clonedFrom = sourceRunId;
    await fs.writeFile(projectPath, JSON.stringify(project, null, 2));
  } catch {}

  console.log(`📋 Cloned run "${sourceRunId}" → "${targetId}"`);
  return { runId: targetId, runDir: targetDir };
}
