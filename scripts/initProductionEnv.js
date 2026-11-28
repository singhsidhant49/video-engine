import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(process.cwd(), '.env');
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const force = args.includes('--force');

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function updateEnv(text, additions) {
  const remaining = new Map(additions);
  const lines = text.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !remaining.has(match[1])) return line;
    const value = remaining.get(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}=${value}`;
  });
  if (remaining.size) {
    if (lines.at(-1)?.trim()) lines.push('');
    lines.push('# Secure dashboard administrator session');
    for (const [name, value] of remaining) lines.push(`${name}=${value}`);
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

const currentText = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const current = parseEnv(currentText);
const namedApiAccount = String(current.get('VIDEO_API_KEYS') || '')
  .split(',')
  .map((entry) => entry.trim().split(':', 1)[0])
  .find((name) => /^[a-zA-Z0-9_-]{3,64}$/.test(name));

const generatedPassword = crypto.randomBytes(18).toString('base64url');
const adminEmail = option('--email') || 'admin@videoforge.local';
const adminPassword = option('--password') || generatedPassword;
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('ADMIN_EMAIL must be a valid email address such as admin@videoforge.local');
if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters');
const desired = new Map([
  ['ADMIN_EMAIL', adminEmail],
  ['ADMIN_PASSWORD', adminPassword],
  ['ADMIN_OWNER_ID', option('--owner-id') || (namedApiAccount ? `acct_${namedApiAccount}` : 'acct_admin')],
  ['JWT_SECRET', crypto.randomBytes(48).toString('base64url')],
]);

const changes = new Map();
for (const [name, value] of desired) {
  const existing = String(current.get(name) || '').trim();
  if (force || !existing) changes.set(name, value);
}

if (!changes.size) {
  console.log('Production administrator environment is already initialized; no values changed.');
  process.exit(0);
}

fs.writeFileSync(envFile, updateEnv(currentText, changes), { encoding: 'utf8', mode: 0o600 });
console.log('Production administrator environment initialized in .env');
console.log(`ADMIN_EMAIL=${changes.get('ADMIN_EMAIL') || current.get('ADMIN_EMAIL')}`);
console.log(`ADMIN_OWNER_ID=${changes.get('ADMIN_OWNER_ID') || current.get('ADMIN_OWNER_ID')}`);
if (changes.has('ADMIN_PASSWORD')) console.log(`ONE_TIME_ADMIN_PASSWORD=${changes.get('ADMIN_PASSWORD')}`);
console.log('JWT_SECRET generated and stored (not printed).');
