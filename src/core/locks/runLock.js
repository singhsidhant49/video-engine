/**
 * Run Directory Concurrency Locker (Milestone 12).
 * 
 * Prevents concurrent pipeline processes from mutating the same run directory.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const LOCK_FILENAME = '.lock';

/**
 * Checks if a given PID is currently active.
 */
function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquires a non-blocking lock on the run directory.
 * 
 * @param {string} runDir
 * @returns {Promise<{ lockPath: string, release: () => Promise<void> }>}
 */
export async function acquireRunLock(runDir) {
  const lockPath = path.join(runDir, LOCK_FILENAME);

  try {
    const existingRaw = await fs.readFile(lockPath, 'utf8');
    const existing = JSON.parse(existingRaw);

    // If locked by our own process, we re-enter safely
    if (existing.pid === process.pid) {
      return { lockPath, pid: process.pid, release: () => releaseRunLock(runDir) };
    }

    // Check if the previous lockholder process is still running
    if (existing.pid && isPidRunning(existing.pid)) {
      throw new Error(`Run directory is locked by active process PID ${existing.pid} (started at ${existing.lockedAt})`);
    }

    // Stale lock from dead process; take over
    console.warn(`   ⚠️ Releasing stale lock from dead process PID ${existing.pid}`);
  } catch (err) {
    if (err.code !== 'ENOENT' && !err.message.includes('locked by active process')) {
      // JSON parse error or similar; safe to overwrite
    } else if (err.message.includes('locked by active process')) {
      throw err;
    }
  }

  const payload = {
    pid: process.pid,
    host: os.hostname(),
    lockedAt: new Date().toISOString(),
  };

  await fs.writeFile(lockPath, JSON.stringify(payload, null, 2));

  const release = () => releaseRunLock(runDir);
  return { lockPath, pid: process.pid, release };
}

/**
 * Releases the lock on the run directory.
 * 
 * @param {string} runDir
 */
export async function releaseRunLock(runDir) {
  const lockPath = path.join(runDir, LOCK_FILENAME);
  try {
    await fs.unlink(lockPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Ignore if already deleted
    }
  }
}
