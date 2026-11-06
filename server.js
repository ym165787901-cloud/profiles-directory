/**
 * Profiles Directory – Vercel-ready Express server
 *
 * - Exports the Express app (Vercel runs it as a serverless function)
 * - Only calls app.listen() when run locally (`node server.js`)
 * - Profile / gallery metadata  -> MongoDB Atlas (falls back to an in-memory
 *   mock if MONGODB_URI is not set, so the function never crashes)
 * - Images                      -> Cloudinary (multer memoryStorage, nothing
 *   is ever written to disk)
 * - Admin auth                  -> signed JWT in an httpOnly cookie
 *   (sessions in memory don't survive between serverless invocations)
 *
 * Required env vars (Vercel -> Project -> Settings -> Environment Variables):
 *   MONGODB_URI, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
 *   CLOUDINARY_API_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, JWT_SECRET
 */

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mongoose = require('mongoose');
const { v2: cloudinary } = require('cloudinary');

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

const IS_VERCEL = Boolean(process.env.VERCEL);
const IS_PROD = process.env.NODE_ENV === 'production' || IS_VERCEL;
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const {
  MONGODB_URI,
  ADMIN_USERNAME = 'admin',
  ADMIN_PASSWORD,
  JWT_SECRET,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = process.env;

// On Vercel a random secret would differ per instance, so it must be provided.
const SECRET = JWT_SECRET || (IS_PROD ? null : crypto.randomBytes(32).toString('hex'));
const COOKIE_NAME = 'admin_token';
const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 hours

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at ~4.5 MB

/* -------------------------------------------------------------------------- */
/* Cloudinary                                                                 */
/* -------------------------------------------------------------------------- */

const cloudinaryReady = Boolean(
  process.env.CLOUDINARY_URL ||
    (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)
);

if (!process.env.CLOUDINARY_URL && cloudinaryReady) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function uploadToCloudinary(buffer, folder) {
  if (!cloudinaryReady) {
    throw httpError(503, 'Image storage is not configured (missing Cloudinary env vars).');
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

async function deleteFromCloudinary(publicId) {
  if (!cloudinaryReady || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    // Don't fail the request if the remote image is already gone.
    console.warn('Cloudinary delete failed:', err.message);
  }
}

/* -------------------------------------------------------------------------- */
/* Data layer: MongoDB Atlas, with a clean in-memory mock fallback            */
/* -------------------------------------------------------------------------- */

const useMongo = Boolean(MONGODB_URI);

if (!useMongo) {
  console.warn(
    '[db] MONGODB_URI is not set – using an in-memory mock store. ' +
      'Data will NOT persist between requests/restarts.'
  );
}

// Cache the connection across warm invocations of the serverless function.
const mongoCache = global.__mongoCache || (global.__mongoCache = { conn: null, promise: null });

async function connectMongo() {
  if (mongoCache.conn) return mongoCache.conn;
  if (!mongoCache.promise) {
    mongoCache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
    });
  }
  try {
    mongoCache.conn = await mongoCache.promise;
  } catch (err) {
    mongoCache.promise = null;
    throw err;
  }
  return mongoCache.conn;
}

const imageFields = {
  imageUrl: { type: String, required: true },
  imagePublicId: { type: String, default: '' },
};

const Profile =
  mongoose.models.Profile ||
  mongoose.model(
    'Profile',
    new mongoose.Schema(
      { name: { type: String, required: true, trim: true, maxlength: 100 }, ...imageFields },
      { timestamps: true }
    )
  );

const GalleryImage =
  mongoose.models.GalleryImage ||
  mongoose.model(
    'GalleryImage',
    new mongoose.Schema(
      { title: { type: String, trim: true, maxlength: 150, default: '' }, ...imageFields },
      { timestamps: true }
    )
  );

const models = { profiles: Profile, gallery: GalleryImage };
const memory = { profiles: [], gallery: [] };

const withId = (doc) => (doc ? { ...doc, id: String(doc._id) } : null);

const store = {
  async list(kind) {
    if (!useMongo) return [...memory[kind]].reverse();
    await connectMongo();
    const docs = await models[kind].find().sort({ createdAt: -1 }).lean();
    return docs.map(withId);
  },

  async create(kind, data) {
    if (!useMongo) {
      const id = crypto.randomUUID();
      const doc = { _id: id, id, ...data, createdAt: new Date(), updatedAt: new Date() };
      memory[kind].push(doc);
      return doc;
    }
    await connectMongo();
    const doc = await models[kind].create(data);
    return withId(doc.toObject());
  },

  async remove(kind, id) {
    if (!useMongo) {
      const index = memory[kind].findIndex((d) => d.id === id);
      return index === -1 ? null : memory[kind].splice(index, 1)[0];
    }
    await connectMongo();
    if (!mongoose.isValidObjectId(id)) return null;
    return withId(await models[kind].findByIdAndDelete(id).lean());
  },
};

/* -------------------------------------------------------------------------- */
/* App + middleware                                                           */
/* -------------------------------------------------------------------------- */

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

const upload = multer({
  storage: multer.memoryStorage(), // keep files in RAM – the filesystem is read-only on Vercel
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif|avif)$/i.test(file.mimetype)) return cb(null, true);
    cb(httpError(400, 'Only JPG, PNG, WEBP, GIF or AVIF images are allowed.'));
  },
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ------------------------------- Auth ------------------------------------- */

function safeEqual(a = '', b = '') {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readSession(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token || !SECRET) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  if (readSession(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/login', (req, res) => {
  if (!SECRET || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Server auth is not configured (ADMIN_PASSWORD / JWT_SECRET).' });
  }
  const { username, password } = req.body || {};
  const ok = safeEqual(username, ADMIN_USERNAME) && safeEqual(password, ADMIN_PASSWORD);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

  const token = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: TOKEN_TTL_SECONDS });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ admin: Boolean(readSession(req)) });
});

/* ------------------------------ Profiles ---------------------------------- */

app.get(
  '/api/profiles',
  wrap(async (req, res) => {
    res.json(await store.list('profiles'));
  })
);

app.post(
  '/api/profiles',
  requireAdmin,
  upload.single('image'),
  wrap(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) throw httpError(400, 'Name is required.');
    if (!req.file) throw httpError(400, 'An image is required.');

    const result = await uploadToCloudinary(req.file.buffer, 'profiles');
    try {
      const profile = await store.create('profiles', {
        name,
        imageUrl: result.secure_url,
        imagePublicId: result.public_id,
      });
      res.status(201).json(profile);
    } catch (err) {
      await deleteFromCloudinary(result.public_id); // avoid orphaned uploads
      throw err;
    }
  })
);

app.delete(
  '/api/profiles/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const removed = await store.remove('profiles', req.params.id);
    if (!removed) throw httpError(404, 'Profile not found.');
    await deleteFromCloudinary(removed.imagePublicId);
    res.json({ ok: true });
  })
);

/* ------------------------------- Gallery ---------------------------------- */

app.get(
  '/api/gallery',
  wrap(async (req, res) => {
    res.json(await store.list('gallery'));
  })
);

app.post(
  '/api/gallery',
  requireAdmin,
  upload.single('image'),
  wrap(async (req, res) => {
    if (!req.file) throw httpError(400, 'An image is required.');

    const result = await uploadToCloudinary(req.file.buffer, 'gallery');
    try {
      const image = await store.create('gallery', {
        title: (req.body.title || '').trim(),
        imageUrl: result.secure_url,
        imagePublicId: result.public_id,
      });
      res.status(201).json(image);
    } catch (err) {
      await deleteFromCloudinary(result.public_id);
      throw err;
    }
  })
);

app.delete(
  '/api/gallery/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const removed = await store.remove('gallery', req.params.id);
    if (!removed) throw httpError(404, 'Image not found.');
    await deleteFromCloudinary(removed.imagePublicId);
    res.json({ ok: true });
  })
);

/* -------------------------------------------------------------------------- */
/* Static files + fallbacks                                                   */
/* -------------------------------------------------------------------------- */

app.use(express.static(PUBLIC_DIR));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* -------------------------------------------------------------------------- */
/* Error handler                                                              */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';

  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Image is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`
        : err.message;
  }

  if (status >= 500) {
    console.error(err);
    message = IS_PROD ? 'Something went wrong on the server.' : message;
  }
  res.status(status).json({ error: message });
});

/* -------------------------------------------------------------------------- */
/* Start locally / export for Vercel                                          */
/* -------------------------------------------------------------------------- */

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

module.exports = app;

