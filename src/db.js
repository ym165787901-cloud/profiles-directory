const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataDir } = require('./config');

fs.mkdirSync(dataDir, { recursive: true });

/** Minimal JSON-file collection. Swap this class for a real database without touching routes. */
class Collection {
  constructor(name) {
    this.file = path.join(dataDir, `${name}.json`);
    if (!fs.existsSync(this.file)) this.#save([]);
  }
  #save(items) {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
    fs.renameSync(tmp, this.file); // atomic replace
  }
  all() { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
  add(data) {
    const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data };
    this.#save([item, ...this.all()]);
    return item;
  }
  remove(id) {
    const items = this.all();
    const item = items.find((i) => i.id === id);
    if (!item) return null;
    this.#save(items.filter((i) => i.id !== id));
    return item;
  }
}

module.exports = { profiles: new Collection('profiles'), gallery: new Collection('gallery') };
