import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

import { AdminAuthService, AdminUserStore, hashAdminPassword, verifyAdminPassword } from '../src/server/adminAuthService.js';
import { createAdminAuthRouter } from '../src/server/adminAuthRouter.js';
import { createApiAuth, videoApiErrorHandler } from '../src/server/videoApiRouter.js';

test('admin passwords use salted scrypt hashes', async () => {
  const encoded = await hashAdminPassword('correct horse battery staple');
  assert.match(encoded, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(await verifyAdminPassword('correct horse battery staple', encoded), true);
  assert.equal(await verifyAdminPassword('wrong password', encoded), false);
  await assert.rejects(() => hashAdminPassword('too-short'), /between 12 and 256/);
});

test('admin JWT validates signature, audience, and expiry', async () => {
  const store = { find: async () => null };
  const auth = new AdminAuthService({ store, jwtSecret: 'a'.repeat(40), ttlSeconds: 300, production: true });
  const token = auth.sign({ email: 'admin@example.com', role: 'admin', ownerId: 'acct_primary' }, 1000);
  assert.equal(auth.verify(token, 1100)?.ownerId, 'acct_primary');
  assert.equal(auth.verify(`${token}x`, 1100), null);
  assert.equal(auth.verify(token, 1301), null);
});

test('admin login cookie authenticates the owner-scoped API', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'videoforge-auth-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new AdminUserStore({ file: path.join(directory, 'admins.json'), connectionString: '', defaultOwnerId: 'acct_primary' });
  await store.init();
  await store.put({ email: 'admin@example.com', password: 'correct horse battery staple', ownerId: 'acct_primary' });
  const auth = new AdminAuthService({ store, jwtSecret: 'b'.repeat(40), production: true });
  const requireAuth = createApiAuth({ apiKeys: ['primary:' + 'k'.repeat(40)], production: true, sessionAuth: auth });
  const app = express(); app.use(express.json());
  app.use('/auth', createAdminAuthRouter({ auth, store, requireAuth }));
  app.get('/v1/whoami', requireAuth, (req, res) => res.json({ ownerId: req.ownerId, email: req.adminUser?.email }));
  app.use(videoApiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const denied = await fetch(`${base}/v1/whoami`); assert.equal(denied.status, 401);
  const loggedIn = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'correct horse battery staple' }) });
  assert.equal(loggedIn.status, 200);
  const cookie = loggedIn.headers.get('set-cookie').split(';', 1)[0];
  const accepted = await fetch(`${base}/v1/whoami`, { headers: { cookie } });
  assert.deepEqual(await accepted.json(), { ownerId: 'acct_primary', email: 'admin@example.com' });
});

test('production can use session-only auth without opening an anonymous fallback', () => {
  const sessionAuth = { verify: (token) => token === 'valid' ? { email: 'admin@example.com', role: 'admin', ownerId: 'acct_primary' } : null };
  const middleware = createApiAuth({ apiKeys: [], production: true, sessionAuth });
  const denied = { get: () => '', ip: '127.0.0.1' };
  let deniedStatus = 0;
  middleware(denied, { status: (value) => { deniedStatus = value; return { json: () => {} }; } }, () => assert.fail('anonymous production request must not pass'));
  assert.equal(deniedStatus, 401);

  const accepted = { get: (name) => name === 'cookie' ? 'vf_session=valid' : '', ip: '127.0.0.1' };
  let passed = false;
  middleware(accepted, {}, () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(accepted.ownerId, 'acct_primary');
});
