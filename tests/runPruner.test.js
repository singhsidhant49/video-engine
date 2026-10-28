import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';

import { pruneRuns } from '../src/server/runPruner.js';

test('run pruner skips runs with active lock and prunes expired runs', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'run-pruner-test-'));
  const testRunsDir = path.join(tmpRoot, 'runs');
  await fs.mkdir(testRunsDir, { recursive: true });

  const oldRun = path.join(testRunsDir, 'vid_old_01');
  const activeRun = path.join(testRunsDir, 'vid_active_02');
  const recentRun = path.join(testRunsDir, 'vid_recent_03');

  await fs.mkdir(oldRun, { recursive: true });
  await fs.mkdir(activeRun, { recursive: true });
  await fs.mkdir(recentRun, { recursive: true });

  // Create mock files
  await fs.writeFile(path.join(oldRun, 'narration.wav'), 'dummy wav audio content');
  await fs.writeFile(path.join(oldRun, 'output.mp4'), 'dummy video output content');
  await fs.writeFile(path.join(activeRun, 'request.json'), '{}');
  await fs.writeFile(path.join(activeRun, '.lock'), 'pid: 1234');
  await fs.writeFile(path.join(recentRun, 'request.json'), '{}');

  // Backdate oldRun mtime by 10 days
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  await fs.utimes(oldRun, tenDaysAgo, tenDaysAgo);

  // Test dry run
  const dryRes = await pruneRuns({ olderThanDays: 7, dryRun: true, runsDir: testRunsDir });
  assert.equal(dryRes.scanned, 3);
  assert.equal(dryRes.pruned, 1);
  assert.equal(dryRes.dryRun, true);
  // Directory should still exist after dry run
  const oldRunExistsAfterDry = await fs.stat(oldRun).then(() => true).catch(() => false);
  assert.equal(oldRunExistsAfterDry, true);

  // Test active run with keepOutputs
  const activeRes = await pruneRuns({ olderThanDays: 7, dryRun: false, keepOutputs: true, runsDir: testRunsDir });
  assert.equal(activeRes.pruned, 1);

  // oldRun should be removed
  const oldRunExists = await fs.stat(oldRun).then(() => true).catch(() => false);
  assert.equal(oldRunExists, false);

  // activeRun (with lock) and recentRun should remain
  const activeExists = await fs.stat(activeRun).then(() => true).catch(() => false);
  const recentExists = await fs.stat(recentRun).then(() => true).catch(() => false);
  assert.equal(activeExists, true);
  assert.equal(recentExists, true);

  // Cleanup
  await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
});
