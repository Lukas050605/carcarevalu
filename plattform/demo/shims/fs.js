'use strict';
// Dateisystem-Ersatz: Uploads liegen im Speicher und werden in IndexedDB gesichert
const files = globalThis.__DEMO_FILES || (globalThis.__DEMO_FILES = new Map());
module.exports = {
  mkdirSync() {},
  writeFileSync(p, data) { files.set(p, data); globalThis.__DEMO_DIRTY_FILES = true; },
  existsSync(p) { return files.has(p); },
  rmSync(p) { files.delete(p); globalThis.__DEMO_DIRTY_FILES = true; },
  readFileSync(p) { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p); },
  createReadStream(p) { return { pipe(res) { res.send(files.get(p)); } }; },
};
