import express from 'express';

function loginRateLimit({ windowMs = 15 * 60_000, max = 10 } = {}) {
  const attempts = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const current = attempts.get(key);
    const bucket = !current || now - current.startedAt >= windowMs ? { startedAt: now, count: 1 } : { ...current, count: current.count + 1 };
    attempts.set(key, bucket);
    if (attempts.size > 5_000) {
      for (const [entryKey, entry] of attempts) {
        if (now - entry.startedAt >= windowMs) attempts.delete(entryKey);
      }
    }
    if (bucket.count > max) {
      res.set('retry-after', String(Math.ceil((windowMs - (now - bucket.startedAt)) / 1000)));
      return res.status(429).json({ error: { code: 'LOGIN_RATE_LIMITED', message: 'Too many login attempts. Try again later.' } });
    }
    return next();
  };
}

export function createAdminAuthRouter({ auth, store, requireAuth, production = false, cookieName = 'vf_session' }) {
  const router = express.Router();
  const cookieOptions = `HttpOnly; Path=/; SameSite=Strict; Max-Age=${auth.ttlSeconds}${production ? '; Secure' : ''}`;

  router.post('/login', loginRateLimit({}), async (req, res, next) => {
    try {
      const result = await auth.login(req.body?.email, req.body?.password);
      if (!result) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } });
      res.set('set-cookie', `${cookieName}=${encodeURIComponent(result.token)}; ${cookieOptions}`);
      res.set('cache-control', 'no-store');
      return res.json({ user: result.user, expiresIn: auth.ttlSeconds });
    } catch (error) { return next(error); }
  });

  router.post('/logout', (req, res) => {
    res.set('set-cookie', `${cookieName}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`);
    res.set('cache-control', 'no-store');
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    if (!req.adminUser) return res.status(401).json({ error: { code: 'SESSION_REQUIRED', message: 'Administrator login is required' } });
    res.set('cache-control', 'no-store');
    return res.json({ user: req.adminUser });
  });

  router.get('/users', requireAuth, async (req, res, next) => {
    try {
      if (req.adminUser?.role !== 'admin') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Administrator access is required' } });
      return res.json({ users: await store.list() });
    } catch (error) { return next(error); }
  });

  router.post('/users', requireAuth, async (req, res, next) => {
    try {
      if (req.adminUser?.role !== 'admin') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Administrator access is required' } });
      const user = await store.put({ email: req.body?.email, password: req.body?.password, role: 'admin', ownerId: req.ownerId });
      return res.status(201).json({ user: auth.publicUser(user) });
    } catch (error) { return next(error); }
  });

  router.delete('/users/:email', requireAuth, async (req, res, next) => {
    try {
      const email = String(req.params.email || '').toLowerCase();
      if (req.adminUser?.role !== 'admin') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Administrator access is required' } });
      if (email === req.adminUser.email.toLowerCase()) return res.status(409).json({ error: { code: 'SELF_DELETE_FORBIDDEN', message: 'You cannot delete your active administrator account' } });
      if (await store.count() <= 1) return res.status(409).json({ error: { code: 'LAST_ADMIN', message: 'The final administrator cannot be deleted' } });
      if (!await store.delete(email)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Administrator not found' } });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  return router;
}
