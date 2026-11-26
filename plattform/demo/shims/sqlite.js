'use strict';
// node:sqlite-Ersatz auf Basis von sql.js (SQLite als WebAssembly)
const norm = (args) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));
class DatabaseSync {
  constructor() {
    const SQL = globalThis.__SQL;
    this.db = globalThis.__DEMO_DB_BYTES ? new SQL.Database(globalThis.__DEMO_DB_BYTES) : new SQL.Database();
    globalThis.__DEMO_DB = this.db;
  }
  exec(sql) { this.db.exec(sql); }
  prepare(sql) {
    const db = this.db;
    return {
      run: (...a) => {
        db.run(sql, norm(a));
        const changes = db.getRowsModified();
        const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
        return { changes, lastInsertRowid: id };
      },
      get: (...a) => { const st = db.prepare(sql); try { st.bind(norm(a)); return st.step() ? st.getAsObject() : undefined; } finally { st.free(); } },
      all: (...a) => { const st = db.prepare(sql); try { st.bind(norm(a)); const out = []; while (st.step()) out.push(st.getAsObject()); return out; } finally { st.free(); } },
    };
  }
}
module.exports = { DatabaseSync };
