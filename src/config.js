const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');

module.exports = {
  port: process.env.PORT || 3000,
  // A random secret per start means sessions end on restart. Set JWT_SECRET to keep them.
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  // Single admin account. Override with ADMIN_USER / ADMIN_PASS in real deployments.
  admin: {
    username: process.env.ADMIN_USER || 'يوسف مجود',
    password: process.env.ADMIN_PASS || '12345678910',
  },
  dataDir,
  uploadDir: path.join(dataDir, 'uploads'),
  maxUploadBytes: 5 * 1024 * 1024,
};
