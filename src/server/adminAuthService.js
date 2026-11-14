import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const b64 = (value) => Buffer.from(value).toString('base64url');
const jsonB64 = (value) => b64(JSON.stringify(value));
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function validateAdminPassword(password) {
  const value = String(password || '');
  if (value.length < 12 || value.length > 256) throw Object.assign(new Error('Password must be between 12 and 256 characters'), { status: 400, code: 'INVALID_PASSWORD' });
  return value;
}

export async function hashAdminPassword(password) {
  const value = validateAdminPassword(password);
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise((resolve, reject) => crypto.scrypt(value, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyAdminPassword(password, encoded) {
  const [salt, expected, extra] = String(encoded || '').split(':');
  if (!salt || !expected || extra || !/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(expected)) return false;
  const actual = await new Promise((resolve, reject) => crypto.scrypt(String(password || ''), salt, 64, (error, key) => error ? reject(error) : resolve(key)));
  return safeEqual(actual.toString('hex'), expected);
}

export class AdminUserStore {
  constructor({ file, connectionString = process.env.DATABASE_URL, pool = null, defaultOwnerId = 'acct_admin' } = {}) {
    this.file = file;
    this.pool = pool || (connectionString ? new Pool({ connectionString }) : null);
    this.ownsPool = Boolean(!pool && connectionString);
    this.defaultOwnerId = defaultOwnerId;
    this.writeChain = Promise.resolve();
  }

  async init() {
    if (this.pool) {
      await this.pool.query(`CREATE TABLE IF NOT EXISTS admin_users (
        email text PRIMARY KEY, password_hash text NOT NULL, role text NOT NULL,
        owner_id text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      )`);
      return;
    }
    if (!this.file) throw new Error('AdminUserStore requires a file when DATABASE_URL is absent');
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try { await fs.access(this.file); } catch { await this.#writeFile([]); }
    const rows = await this.#readFile();
    if (rows.some((row) => !row.ownerId)) {
      await this.#writeFile(rows.map((row) => ({ ...row, ownerId: row.ownerId || this.defaultOwnerId })));
    }
  }

  async #readFile() {
    const rows = JSON.parse(await fs.readFile(this.file, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  }

  async #writeFile(rows) {
    const temporary = `${this.file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(rows, null, 2), { mode: 0o600 });
    await fs.rename(temporary, this.file);
  }

  #serialized(task) {
    const pending = this.writeChain.then(task, task);
    this.writeChain = pending.catch(() => {});
    return pending;
  }

  async count() {
    if (this.pool) return Number((await this.pool.query('SELECT count(*)::int AS count FROM admin_users')).rows[0].count);
    return (await this.#readFile()).length;
  }

  async find(email) {
    const normalized = normalizeEmail(email);
    if (this.pool) {
      const row = (await this.pool.query('SELECT email,password_hash,role,owner_id,created_at,updated_at FROM admin_users WHERE email=$1', [normalized])).rows[0];
      return row ? { email: row.email, passwordHash: row.password_hash, role: row.role, ownerId: row.owner_id, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() } : null;
    }
    return (await this.#readFile()).find((row) => normalizeEmail(row.email) === normalized) || null;
  }

  async list() {
    if (this.pool) {
      const { rows } = await this.pool.query('SELECT email,role,owner_id,created_at,updated_at FROM admin_users ORDER BY created_at');
      return rows.map((row) => ({ email: row.email, role: row.role, ownerId: row.owner_id, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }));
    }
    return (await this.#readFile()).map(({ passwordHash, ...user }) => user);
  }

  async put({ email, password, role = 'admin', ownerId }) {
    const normalized = normalizeEmail(email);
    if (!EMAIL_RE.test(normalized)) throw Object.assign(new Error('A valid email address is required'), { status: 400, code: 'INVALID_EMAIL' });
    if (!/^acct_[a-zA-Z0-9_-]{3,64}$/.test(String(ownerId || ''))) throw Object.assign(new Error('A valid workspace owner is required'), { status: 400, code: 'INVALID_OWNER' });
    const passwordHash = await hashAdminPassword(password);
    const now = new Date().toISOString();
    if (this.pool) {
      await this.pool.query(`INSERT INTO admin_users(email,password_hash,role,owner_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)
        ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,owner_id=EXCLUDED.owner_id,updated_at=EXCLUDED.updated_at`,
      [normalized, passwordHash, role, ownerId, now]);
      return this.find(normalized);
    }
    return this.#serialized(async () => {
      const rows = await this.#readFile();
      const previous = rows.find((row) => normalizeEmail(row.email) === normalized);
      const user = { email: normalized, passwordHash, role, ownerId, createdAt: previous?.createdAt || now, updatedAt: now };
      await this.#writeFile([...rows.filter((row) => normalizeEmail(row.email) !== normalized), user]);
      return user;
    });
  }

  async delete(email) {
    const normalized = normalizeEmail(email);
    if (this.pool) return (await this.pool.query('DELETE FROM admin_users WHERE email=$1', [normalized])).rowCount > 0;
    return this.#serialized(async () => {
      const rows = await this.#readFile();
      const next = rows.filter((row) => normalizeEmail(row.email) !== normalized);
      if (next.length === rows.length) return false;
      await this.#writeFile(next);
      return true;
    });
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}

export class AdminAuthService {
  constructor({ store, jwtSecret, issuer = 'videoforge', audience = 'videoforge-admin', ttlSeconds = 8 * 60 * 60, production = false } = {}) {
    if (!store) throw new Error('AdminAuthService requires a user store');
    if (production && String(jwtSecret || '').length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
    this.store = store;
    this.secret = String(jwtSecret || crypto.randomBytes(32).toString('hex'));
    this.issuer = issuer;
    this.audience = audience;
    this.ttlSeconds = Math.max(300, Number(ttlSeconds) || 28_800);
  }

  async bootstrap({ email, password, ownerId }) {
    if (!email && !password) return;
    if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be configured together');
    if (!await this.store.find(email)) await this.store.put({ email, password, role: 'admin', ownerId });
  }

  async login(email, password) {
    const user = await this.store.find(email);
    if (!user || !await verifyAdminPassword(password, user.passwordHash)) return null;
    return { token: this.sign(user), user: this.publicUser(user) };
  }

  publicUser(user) {
    return { email: user.email, role: user.role, ownerId: user.ownerId };
  }

  sign(user, now = Math.floor(Date.now() / 1000)) {
    const header = jsonB64({ alg: 'HS256', typ: 'JWT' });
    const payload = jsonB64({ sub: user.email, role: user.role, ownerId: user.ownerId, iss: this.issuer, aud: this.audience, iat: now, exp: now + this.ttlSeconds, jti: crypto.randomUUID() });
    const body = `${header}.${payload}`;
    const signature = crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  verify(token, now = Math.floor(Date.now() / 1000)) {
    try {
      const [header, payload, signature, extra] = String(token || '').split('.');
      if (!header || !payload || !signature || extra) return null;
      const expected = crypto.createHmac('sha256', this.secret).update(`${header}.${payload}`).digest('base64url');
      if (!safeEqual(signature, expected)) return null;
      const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (parsedHeader.alg !== 'HS256' || claims.iss !== this.issuer || claims.aud !== this.audience || !claims.sub || !claims.ownerId || claims.exp <= now || claims.iat > now + 60) return null;
      return { email: claims.sub, role: claims.role, ownerId: claims.ownerId };
    } catch { return null; }
  }
}

export function parseCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}
