import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
const source = await fs.readFile(envFile, 'utf8');
const values = Object.fromEntries(source.split(/\r?\n/).map((line) => {
  const at = line.indexOf('=');
  return at > 0 && !line.trimStart().startsWith('#') ? [line.slice(0, at).trim(), line.slice(at + 1).trim()] : [null, null];
}).filter(([key]) => key));
const oldCredential = String(values.VIDEO_API_KEYS || '').split(',')[0].trim();
if (!oldCredential) throw new Error('VIDEO_API_KEYS is missing from .env');
const migrateCurrentOnly = process.argv.includes('--migrate-current');

const account = oldCredential.includes(':') ? oldCredential.slice(0, oldCredential.indexOf(':')) : 'primary';
const safeAccount = /^[a-zA-Z0-9_-]{3,64}$/.test(account) ? account : 'primary';
const newCredential = migrateCurrentOnly ? oldCredential : `${safeAccount}:${crypto.randomBytes(32).toString('base64url')}`;
if (!migrateCurrentOnly) process.env.OLD_VIDEO_API_KEY = oldCredential;
process.env.NEW_VIDEO_API_KEY = newCredential;
if (!process.env.DATABASE_URL && values.POSTGRES_PASSWORD) {
  const password = encodeURIComponent(values.POSTGRES_PASSWORD);
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(values.POSTGRES_USER || 'video')}:${password}@127.0.0.1:${values.POSTGRES_PORT || '54320'}/${encodeURIComponent(values.POSTGRES_DB || 'videogenerator')}`;
}

await import(`./migrateVideoOwner.js?rotation=${Date.now()}`);
if (migrateCurrentOnly) {
  console.log(JSON.stringify({ rotated: false, migratedCurrentCredential: true, account: safeAccount }));
  process.exit(0);
}
const line = `VIDEO_API_KEYS=${newCredential}`;
const updated = /^VIDEO_API_KEYS=.*$/m.test(source) ? source.replace(/^VIDEO_API_KEYS=.*$/m, line) : `${source.trimEnd()}\n${line}\n`;
const temp = `${envFile}.${process.pid}.tmp`;
await fs.writeFile(temp, updated, { encoding: 'utf8', mode: 0o600 });
await fs.rename(temp, envFile);
console.log(JSON.stringify({ rotated: true, account: safeAccount, credentialLength: newCredential.length }));
