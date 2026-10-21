import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config/index.js';

/**
 * Locate the ffmpeg/ffprobe binaries that ship with Remotion's compositor
 * package, so the pipeline needs no system ffmpeg. Note this is a minimal
 * build: no fps/tile/signalstats filters, and no raw PCM muxers.
 */
function findCompositorDir() {
  const base = path.join(config.rootDir, 'node_modules', '@remotion');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => d.startsWith('compositor-')) : [];
  const preferred = dirs.find((d) => d.includes(process.platform) && d.includes(process.arch)) || dirs[0];
  if (!preferred) throw new Error('Remotion compositor package not found — run npm install');
  return path.join(base, preferred);
}

export function runBinary(name, args, { encoding = 'utf8' } = {}) {
  const dir = findCompositorDir();
  const bin = path.join(dir, process.platform === 'win32' ? `${name}.exe` : name);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, DYLD_LIBRARY_PATH: dir, LD_LIBRARY_PATH: dir },
    });
    const out = [];
    let err = '';
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${name} exited ${code}: ${err.slice(-600)}`));
      const buf = Buffer.concat(out);
      resolve({ stdout: encoding ? buf.toString(encoding) : buf, stderr: err });
    });
  });
}

export const ffmpeg = (args, opts) => runBinary('ffmpeg', ['-hide_banner', '-v', 'error', ...args], opts);

export async function probeDuration(file) {
  const { stdout } = await runBinary('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = parseFloat(stdout.trim());
  if (!Number.isFinite(d)) throw new Error(`Could not read duration of ${file}`);
  return d;
}
