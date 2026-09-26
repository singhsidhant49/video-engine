import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Development-only narration via macOS `say`, so evals and visual work can run
 * end to end while Kokoro is unavailable. Not a production voice.
 */
export async function synthesizeWithSay(text, outFile, { voice = process.env.SAY_VOICE || 'Samantha', rate = 170 } = {}) {
  if (process.platform !== 'darwin') throw new Error('--tts say is only available on macOS');
  const txt = path.join(os.tmpdir(), `say-${process.pid}-${Date.now()}.txt`);
  await fs.writeFile(txt, text);
  try {
    await new Promise((resolve, reject) => {
      const p = spawn('say', ['-v', voice, '-r', String(rate), '-o', outFile, '--data-format=LEI16@24000', '-f', txt]);
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`say exited ${code}`))));
    });
  } finally {
    await fs.rm(txt, { force: true });
  }
  console.log(`🗣️  Dev narration (say/${voice}) → ${path.basename(outFile)}`);
}
