const multer = require('multer');
const crypto = require('crypto');
const { uploadDir, maxUploadBytes } = require('../config');

// The stored extension comes from this whitelist, never from the client's filename.
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + EXT[file.mimetype]),
  }),
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed')),
});

/** Single-image upload middleware that answers upload errors as clean JSON. */
module.exports = (field) => (req, res, next) =>
  upload.single(field)(req, res, (err) => (err ? res.status(400).json({ error: err.message }) : next()));
