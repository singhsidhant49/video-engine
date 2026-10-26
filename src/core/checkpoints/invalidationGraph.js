/**
 * Stage Invalidation Graph & Safety Validator (Milestone 12).
 * 
 * Computes deterministic downstream invalidation and audits stage validity:
 * 1. Downstream transitive invalidation (e.g. script changes invalidate TTS, alignment, storyboard, timeline).
 * 2. Visual style changes invalidate visual-realization onward without touching script, TTS, or alignment.
 * 3. Audio/music changes invalidate audio-mastering and render without touching visual stages.
 * 4. Verifies artifact existence and file checksums before permitting reuse.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PIPELINE_STAGES, STAGE_DEFINITIONS, canonicalStageName } from './stageRegistry.js';
import { PIPELINE_VERSION } from './versionTracker.js';

/**
 * Computes all transitive downstream dependents of a given stage.
 * 
 * @param {string} stageId
 * @returns {Set<string>}
 */
export function getTransitiveDownstreamStages(stageId) {
  const canonical = canonicalStageName(stageId);
  const downstream = new Set();
  const queue = [canonical];

  while (queue.length > 0) {
    const current = queue.shift();
    for (const [sId, def] of Object.entries(STAGE_DEFINITIONS)) {
      if (def.dependencies.includes(current) && !downstream.has(sId)) {
        downstream.add(sId);
        queue.push(sId);
      }
    }
  }

  return downstream;
}

/**
 * Computes a SHA-256 checksum of a file.
 */
export async function getFileChecksum(filePath) {
  try {
    const buf = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * Evaluates whether completed stages in an existing run can be safely reused or must be invalidated.
 * 
 * @param {Object} options
 * @param {string} options.runDir - Path to run directory
 * @param {Object} options.manifest - Existing checkpoint manifest
 * @param {Object} options.currentContext - Current execution parameters and hashes
 * @param {string} [options.fromStage] - Explicit CLI resume target stage (invalidates this stage onward)
 * @returns {Promise<{ reusedStages: Array<Object>, invalidatedStages: Array<Object>, canResume: boolean }>}
 */
export async function evaluateRunValidity({
  runDir,
  manifest,
  currentContext = {},
  fromStage = null,
}) {
  const reusedStages = [];
  const invalidatedStages = [];
  const forcedInvalidation = new Set();
  const fromInvalidation = new Set();

  if (fromStage) {
    const canonicalFrom = canonicalStageName(fromStage);
    forcedInvalidation.add(canonicalFrom);
    fromInvalidation.add(canonicalFrom);
    const downstream = getTransitiveDownstreamStages(canonicalFrom);
    for (const d of downstream) {
      forcedInvalidation.add(d);
      fromInvalidation.add(d);
    }
  }

  // Detect script changes vs previous plan
  let scriptChanged = false;
  try {
    const oldPlanPath = path.join(runDir, 'plan.json');
    const oldPlan = JSON.parse(await fs.readFile(oldPlanPath, 'utf8'));
    if (currentContext.script && oldPlan.script && currentContext.script.trim() !== oldPlan.script.trim()) {
      scriptChanged = true;
      const downstream = getTransitiveDownstreamStages('plan');
      for (const d of downstream) forcedInvalidation.add(d);
    }
  } catch {
    // Plan not present or unreadable
  }

  // Request changes must invalidate the stage that owns the changed input.
  // Previously a resume could reuse an old plan/audio merely because the old
  // files still existed.
  try {
    const oldReq = JSON.parse(await fs.readFile(path.join(runDir, 'request.json'), 'utf8'));
    const requestChanged = ['topic', 'niche', 'format'].some((key) => currentContext[key] != null && currentContext[key] !== oldReq[key])
      || (currentContext.durationSec != null && Number(currentContext.durationSec) !== Number(oldReq.durationSec))
      || (currentContext.productionProfile != null && JSON.stringify(currentContext.productionProfile) !== JSON.stringify(oldReq.productionProfile || null))
      || (currentContext.sourceData != null && JSON.stringify(currentContext.sourceData) !== JSON.stringify(oldReq.sourceData || null));
    if (requestChanged) {
      forcedInvalidation.add('request');
      for (const stage of getTransitiveDownstreamStages('request')) forcedInvalidation.add(stage);
    }
    if (currentContext.voice && oldReq.voice && currentContext.voice !== oldReq.voice) {
      forcedInvalidation.add('audio');
      for (const stage of getTransitiveDownstreamStages('audio')) forcedInvalidation.add(stage);
    }
    if (currentContext.offline != null && oldReq.offline != null && Boolean(currentContext.offline) !== Boolean(oldReq.offline)) {
      forcedInvalidation.add('assets');
      for (const stage of getTransitiveDownstreamStages('assets')) forcedInvalidation.add(stage);
    }
  } catch {
    // Request absence is handled by output validation below.
  }

  // Detect visual style changes vs previous run
  let styleChanged = false;
  try {
    const oldReqPath = path.join(runDir, 'request.json');
    const oldReq = JSON.parse(await fs.readFile(oldReqPath, 'utf8'));
    if (currentContext.style && oldReq.style && currentContext.style !== oldReq.style) {
      styleChanged = true;
      // Invalidate visual stages only (visualStrategy, visual-coverage-plan, direction, timeline, render)
      const visualDownstream = getTransitiveDownstreamStages('visualStrategy');
      for (const d of visualDownstream) forcedInvalidation.add(d);
    }
  } catch {
    // Request not present
  }

  // Visual-mode changes preserve script/audio but invalidate media selection and every visual artifact.
  try {
    const oldReq = JSON.parse(await fs.readFile(path.join(runDir, 'request.json'), 'utf8'));
    if (currentContext.visualMode && (oldReq.visualMode || 'LEGACY_PROCEDURAL') !== currentContext.visualMode) {
      for (const stage of ['visualStrategy', 'storyboard', 'assets', 'timeline', 'package', 'preRenderQa', 'render', 'postRenderQa']) forcedInvalidation.add(stage);
    }
  } catch {
    // Request absence is handled by the normal artifact checks.
  }

  const stagesToCheck = PIPELINE_STAGES;

  for (const stage of stagesToCheck) {
    const stageDef = STAGE_DEFINITIONS[stage];
    if (!stageDef) continue;

    const manifestStage = manifest.stages?.[stage];

    // Check if explicitly invalidated downstream
    if (forcedInvalidation.has(stage)) {
      invalidatedStages.push({
        stage,
        reason: fromStage && fromInvalidation.has(stage)
          ? `Forced restart from --from ${fromStage}`
          : scriptChanged
            ? 'Script content changed; downstream artifacts invalidated'
            : styleChanged
              ? 'Visual style changed; visual realization invalidated'
              : 'Dependency invalidated upstream',
      });
      continue;
    }

    // Check if previously marked complete
    if (!manifestStage || manifestStage.status !== 'complete') {
      invalidatedStages.push({
        stage,
        reason: !manifestStage ? 'Stage never recorded' : `Stage status is ${manifestStage.status}`,
      });
      // Invalidate downstream of any incomplete stage
      const downstream = getTransitiveDownstreamStages(stage);
      for (const d of downstream) forcedInvalidation.add(d);
      continue;
    }

    // Legacy manifests predate code-version tracking. Keep them resumable and
    // start enforcing the version once a stage has been completed by a
    // version-aware pipeline.
    if (manifestStage.codeVersion && manifestStage.codeVersion !== PIPELINE_VERSION) {
      invalidatedStages.push({
        stage,
        reason: `Pipeline version changed (${manifestStage.codeVersion || 'unversioned'} -> ${PIPELINE_VERSION})`,
      });
      const downstream = getTransitiveDownstreamStages(stage);
      for (const d of downstream) forcedInvalidation.add(d);
      continue;
    }

    // Check file existence for outputs (prefer recorded outputFiles, fallback to stageDef.outputs)
    const outputs = (manifestStage && Array.isArray(manifestStage.outputFiles) && manifestStage.outputFiles.length > 0)
      ? manifestStage.outputFiles
      : (stageDef.outputs || []);
    let allOutputsExist = true;
    let missingFile = null;

    for (const outFile of outputs) {
      const candidates = [
        path.join(runDir, outFile),
        path.join(runDir, 'public', outFile),
        path.isAbsolute(outFile) ? outFile : path.resolve(runDir, outFile),
      ];
      let exists = false;
      for (const cand of candidates) {
        try {
          await fs.access(cand);
          const expectedChecksum = manifestStage.outputChecksums?.[outFile];
          if (expectedChecksum) {
            const actualChecksum = await getFileChecksum(cand);
            if (actualChecksum !== expectedChecksum) continue;
          }
          exists = true;
          break;
        } catch {
          // try next candidate
        }
      }
      if (!exists) {
        allOutputsExist = false;
        missingFile = outFile;
        break;
      }
    }

    if (!allOutputsExist) {
      invalidatedStages.push({
        stage,
        reason: `Required output artifact missing from disk: ${missingFile}`,
      });
      const downstream = getTransitiveDownstreamStages(stage);
      for (const d of downstream) forcedInvalidation.add(d);
      continue;
    }

    // All checks passed; stage can be safely reused
    reusedStages.push({
      stage,
      outputs,
      completedAt: manifestStage.completedAt,
      durationMs: manifestStage.durationMs,
    });
  }

  return {
    reusedStages,
    invalidatedStages,
    canResume: reusedStages.length > 0,
  };
}
