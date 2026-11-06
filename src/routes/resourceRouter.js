const fs = require('fs');
const path = require('path');
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const imageUpload = require('../middleware/upload');
const { uploadDir } = require('../config');

const removeFile = (name) => fs.unlink(path.join(uploadDir, path.basename(name)), () => {});

/**
 * Builds list / create / delete routes for any image-backed collection.
 * Reading is public; writing requires the admin session.
 * `toRecord(req)` validates the form fields and returns the extra data to store, or null.
 */
module.exports = ({ collection, toRecord }) => {
  const router = express.Router();

  router.get('/', (_req, res) => res.json(collection.all()));

  router.post('/', requireAdmin, imageUpload('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose an image to upload' });
    const record = toRecord(req);
    if (!record) {
      removeFile(req.file.filename);
      return res.status(400).json({ error: 'Check the form fields and try again' });
    }
    res.status(201).json(collection.add({ ...record, image: req.file.filename }));
  });

  router.delete('/:id', requireAdmin, (req, res) => {
    const item = collection.remove(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    removeFile(item.image);
    res.status(204).end();
  });

  return router;
};
