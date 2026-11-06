const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cfg = require('./src/config');
const db = require('./src/db');
const resourceRouter = require('./src/routes/resourceRouter');
const { requireAdminPage } = require('./src/middleware/auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }), cookieParser());
app.use((_, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});

app.use('/uploads', express.static(cfg.uploadDir, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

// Protected page: unauthenticated visitors are redirected to the login screen.
app.get('/admin', requireAdminPage, (_, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/profiles', resourceRouter({
  collection: db.profiles,
  toRecord: (req) => {
    const name = String(req.body.name ?? '').trim();
    return name && name.length <= 80 ? { name } : null;
  },
}));
app.use('/api/gallery', resourceRouter({ collection: db.gallery, toRecord: () => ({}) }));
app.use('/api', (_, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

app.listen(cfg.port, () => console.log(`Running on http://localhost:${cfg.port}`));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

