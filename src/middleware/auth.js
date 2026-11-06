const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');

const COOKIE = 'admin_token';
const TTL_MS = 2 * 60 * 60 * 1000;

const verify = (req) => {
  try {
    const payload = jwt.verify(req.cookies[COOKIE], jwtSecret);
    return payload.role === 'admin' ? payload : null;
  } catch {
    return null;
  }
};

exports.issueToken = (res, username) => {
  const token = jwt.sign({ sub: username, role: 'admin' }, jwtSecret, { expiresIn: TTL_MS / 1000 });
  res.cookie(COOKIE, token, {
    httpOnly: true, // not readable from JavaScript
    sameSite: 'strict', // blocks cross-site requests (CSRF)
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_MS,
  });
};
exports.clearToken = (res) => res.clearCookie(COOKIE);

exports.requireAdmin = (req, res, next) =>
  (req.admin = verify(req)) ? next() : res.status(401).json({ error: 'Please sign in again' });

exports.requireAdminPage = (req, res, next) =>
  verify(req) ? next() : res.redirect('/login.html');
