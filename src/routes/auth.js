const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { admin } = require('../config');
const { issueToken, clearToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const norm = (s) => String(s ?? '').normalize('NFC').trim(); // consistent Arabic text comparison
const digest = (s) => crypto.createHash('sha256').update(s).digest();
const sameText = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
const passwordHash = bcrypt.hashSync(admin.password, 12);

// Basic brute-force protection: 5 failures per IP locks login for 15 minutes.
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000, fails = new Map();
const isLocked = (ip) => { const f = fails.get(ip); return f && f.count >= MAX_FAILS && Date.now() < f.until; };

router.post('/login', async (req, res) => {
  if (isLocked(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const userOk = sameText(norm(req.body.username), norm(admin.username));
  const passOk = await bcrypt.compare(String(req.body.password ?? ''), passwordHash);
  if (!(userOk && passOk)) {
    fails.set(req.ip, { count: (fails.get(req.ip)?.count ?? 0) + 1, until: Date.now() + LOCK_MS });
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  fails.delete(req.ip);
  issueToken(res, norm(admin.username));
  res.json({ ok: true });
});

router.post('/logout', (_req, res) => { clearToken(res); res.status(204).end(); });
router.get('/me', requireAdmin, (req, res) => res.json({ username: req.admin.sub }));

module.exports = router;
