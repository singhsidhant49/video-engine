#!/usr/bin/env node
/**
 * Run Inspector CLI (Milestone 12).
 * 
 * Inspects a run directory:
 * - Stage status & duration
 * - Artifact paths
 * - Cache hits / misses
 * - Warnings & errors
 * - Render path
 * 
 * Usage: npm run run:inspect -- --run <runId>
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const runId = getArg('--run') || args[0];

if (!runId || args.includes('--help')) {
  console.log(`Usage: npm run run:inspect -- --run <runId>
Example: npm run run:inspect -- --run video-2026-09-28T09-30-31
`);
  process.exit(runId ? 0 : 1);
}

const runDir = path.isAbsolute(runId) ? runId : path.join(config.rendersDir, 'runs', runId);

async function inspect() {
  console.log(`\n🔍 Inspecting Run: ${path.basename(runDir)}`);
  console.log(`   Directory: ${runDir}`);

  // 1. Read manifest.json
  let manifest = null;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(runDir, 'manifest.json'), 'utf8'));
  } catch {
    console.error('❌ Could not read manifest.json');
  }

  // 2. Read project.json
  let project = null;
  try {
    project = JSON.parse(await fs.readFile(path.join(runDir, 'project.json'), 'utf8'));
  } catch {}

  // 3. Read config-snapshot.json
  let configSnapshot = null;
  try {
    configSnapshot = JSON.parse(await fs.readFile(path.join(runDir, 'config-snapshot.json'), 'utf8'));
  } catch {}

  // 4. Read cache-diagnostics.json
  let cacheDiagnostics = null;
  try {
    cacheDiagnostics = JSON.parse(await fs.readFile(path.join(runDir, 'cache-diagnostics.json'), 'utf8'));
  } catch {}

  if (project) {
    console.log(`   Topic: "${project.topic}"`);
    console.log(`   Format: ${project.format} · Target Duration: ${project.targetDuration || 'default'}s`);
    console.log(`   Status: ${project.status.toUpperCase()} · Current Stage: ${project.currentStage}`);
  }

  if (configSnapshot) {
    console.log(`   Git Commit: ${configSnapshot.gitCommit} · Pipeline: ${configSnapshot.pipelineVersion}`);
  }

  console.log(`\n📋 STAGES SUMMARY:`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`Stage                Status       Duration   Outputs`);
  console.log(`--------------------------------------------------------------------------------`);
  if (manifest?.stages) {
    for (const [sName, sData] of Object.entries(manifest.stages)) {
      const dur = sData.durationMs ? `${(sData.durationMs / 1000).toFixed(1)}s` : '-';
      const statusIcon = sData.status === 'complete' ? '✔' : sData.status === 'failed' ? '✖' : sData.status === 'skipped' ? '⤼' : '○';
      const outputCount = sData.artifacts?.length || sData.outputFiles?.length || 0;
      console.log(`${sName.padEnd(20)} ${statusIcon} ${sData.status.padEnd(10)} ${dur.padEnd(10)} ${outputCount} artifact(s)`);
      if (sData.error) {
        console.log(`   ↳ Error: ${sData.error}`);
      }
    }
  }

  if (cacheDiagnostics) {
    console.log(`\n⚡ CACHE METRICS:`);
    console.log(`   TTS Hits: ${cacheDiagnostics.ttsHits} / Misses: ${cacheDiagnostics.ttsMisses}`);
    console.log(`   Alignment Hits: ${cacheDiagnostics.alignmentHits} / Misses: ${cacheDiagnostics.alignmentMisses}`);
    console.log(`   Asset Search Hits: ${cacheDiagnostics.assetSearchHits} / Misses: ${cacheDiagnostics.assetSearchMisses}`);
    console.log(`   Media Download Hits: ${cacheDiagnostics.assetDownloadHits} / Misses: ${cacheDiagnostics.assetDownloadMisses}`);
    console.log(`   Bytes Reused: ${cacheDiagnostics.bytesReusedMb} MB · Time Saved: ~${cacheDiagnostics.estimatedTimeSavedSec}s`);
  }

  // Check render output
  try {
    const files = await fs.readdir(config.rendersDir);
    const renderMp4 = files.find((f) => f.startsWith(path.basename(runDir)) && f.endsWith('.mp4'));
    if (renderMp4) {
      console.log(`\n🎬 Rendered Video: ${path.join(config.rendersDir, renderMp4)}`);
    }
  } catch {}

  console.log(`--------------------------------------------------------------------------------\n`);
}

inspect().catch((err) => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
