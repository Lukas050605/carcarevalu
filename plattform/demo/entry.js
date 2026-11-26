'use strict';
// Browser-Demo: der echte Server-Code (src/server.js) läuft im Browser.
// Datenbank = SQLite (WebAssembly), gespeichert in IndexedDB dieses Browsers.
globalThis.process = globalThis.process || { env: {} };
process.env.DEMO_MODE = '1';

const { Buffer } = require('./shims/buffer-global.js');
const DB_NAME = 'mhl-demo', STORE = 'kv';
const SID_KEY = 'mhl_demo_sid';

// ---------- IndexedDB ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbSet(key, val) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
async function idbClear() { const d = await idb(); return new Promise((res) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).clear(); t.oncomplete = () => res(); }); }

// Jede Änderung sofort sichern (nacheinander), damit beim Neuladen nichts verloren geht
let saving = Promise.resolve();
function scheduleSave() {
  saving = saving.then(async () => {
    try {
      await idbSet('db', globalThis.__DEMO_DB.export());
      if (globalThis.__DEMO_DIRTY_FILES) {
        globalThis.__DEMO_DIRTY_FILES = false;
        await idbSet('files', [...globalThis.__DEMO_FILES.entries()].map(([k, v]) => [k, new Uint8Array(v)]));
      }
    } catch (e) { console.warn('Demo konnte nicht speichern:', e); }
  });
  return saving;
}

const getSid = () => { try { return localStorage.getItem(SID_KEY) || ''; } catch { return ''; } };
const setSid = (v) => { try { if (v) localStorage.setItem(SID_KEY, v); else localStorage.removeItem(SID_KEY); } catch { /* egal */ } };

let app;
// Eine Anfrage direkt an die Express-Routen geben (synchron)
function dispatch({ method, url, body, form, cookie }) {
  const u = new URL(url, location.origin);
  const headers = { cookie: cookie ? `sid=${cookie}` : '', 'x-requested-with': 'fetch' };
  const req = {
    method, url: u.pathname + u.search, path: u.pathname, query: Object.fromEntries(u.searchParams), headers,
    body: body || {}, _form: form, ip: '127.0.0.1', params: {},
    get(h) { return headers[h.toLowerCase()]; },
  };
  const res = {
    statusCode: 200, headers: {}, body: null, finished: false,
    status(n) { this.statusCode = n; return this; },
    set(k, v) { if (typeof k === 'object') Object.assign(this.headers, k); else this.headers[k] = v; return this; },
    json(o) { this.headers['Content-Type'] = 'application/json'; this.body = JSON.stringify(o); this.finished = true; },
    send(b) { this.body = b; this.finished = true; },
    sendFile() { this.statusCode = 404; this.body = ''; this.finished = true; },
  };
  app.handle(req, res, (err) => { if (!res.finished) res.status(err ? 500 : 404).json({ error: err ? String(err.message || err) : 'Nicht gefunden' }); });
  let newSid;
  const sc = res.headers['Set-Cookie'];
  if (sc) { const m = /sid=([^;]*)/.exec(sc); newSid = m ? m[1] : ''; if (/Max-Age=0/.test(sc)) newSid = ''; }
  return { res, newSid };
}

// ---------- fetch abfangen ----------
const origFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const u = new URL(url, location.origin);
  if (u.origin !== location.origin || !u.pathname.startsWith('/api/')) return origFetch(input, init);
  const method = (init.method || 'GET').toUpperCase();
  let body, form;
  if (init.body instanceof FormData) {
    form = { fields: {}, files: [] };
    for (const [k, v] of init.body.entries()) {
      if (v instanceof File) form.files.push({ field: k, name: v.name, size: v.size, buffer: Buffer.from(await v.arrayBuffer()) });
      else form.fields[k] = v;
    }
  } else if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = {}; } }
  const { res, newSid } = dispatch({ method, url, body, form, cookie: getSid() });
  if (newSid !== undefined) setSid(newSid);
  if (method !== 'GET') scheduleSave();
  const h = new Headers(); for (const [k, v] of Object.entries(res.headers)) if (k !== 'Set-Cookie') h.set(k, String(v));
  return new Response(res.body instanceof Uint8Array ? res.body : res.body ?? '', { status: res.statusCode, headers: h });
};

// Bilder und Links auf /api/... (z. B. Fotos, CSV-Export) über die Demo auflösen
const blobCache = new Map();
async function blobUrl(path) {
  if (blobCache.has(path)) return blobCache.get(path);
  const r = await window.fetch(path);
  if (!r.ok) return null;
  const u = URL.createObjectURL(await r.blob());
  blobCache.set(path, u); return u;
}
const origSetAttr = Element.prototype.setAttribute;
Element.prototype.setAttribute = function (name, value) {
  if (this.tagName === 'IMG' && name === 'src' && typeof value === 'string' && value.startsWith('/api/')) {
    origSetAttr.call(this, 'data-demo-src', value);
    blobUrl(value).then((u) => { if (u) origSetAttr.call(this, 'src', u); });
    return;
  }
  return origSetAttr.call(this, name, value);
};
document.addEventListener('click', async (e) => {
  const a = e.target.closest && e.target.closest('a[href^="/api/"]');
  if (!a) return;
  e.preventDefault();
  const r = await window.fetch(a.getAttribute('href'));
  if (!r.ok) { alert('Datei nicht verfügbar'); return; }
  const blob = await r.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const cd = r.headers.get('Content-Disposition') || '';
  if (/attachment/.test(cd) || a.getAttribute('href').endsWith('.csv')) link.download = (/filename="([^"]+)"/.exec(cd) || [])[1] || 'datei';
  else link.target = '_blank';
  link.click();
}, true);

// ---------- Demo-Daten ----------
const ACCOUNTS = {
  kunde: ['kunde@demo.test', 'demo-kunde-1234', 'Kunde'],
  betrieb: ['betrieb@demo.test', 'demo-betrieb-1234', 'Mobiler Betrieb'],
  werkstatt: ['werkstatt@demo.test', 'demo-werkstatt-1234', 'Lack-Werkstatt'],
  admin: ['admin@demo.test', 'demo-admin-1234', 'Verwaltung'],
};
function seed(db, hashPassword) {
  const jar = {};
  const call = (who, method, url, body) => {
    const { res, newSid } = dispatch({ method, url, body, cookie: jar[who] });
    if (newSid !== undefined) jar[who] = newSid;
    const json = JSON.parse(res.body || '{}');
    if (res.statusCode >= 400) throw new Error(`${url}: ${json.error}`);
    return json;
  };
  db.prepare("INSERT INTO users (email, pw_hash, name, role) VALUES (?, ?, 'Demo-Verwaltung', 'admin')").run(ACCOUNTS.admin[0], hashPassword(ACCOUNTS.admin[1]));
  const reg = (who, role, name, phone) => call(who, 'POST', '/api/auth/register', { role, email: ACCOUNTS[who][0], password: ACCOUNTS[who][1], name, phone, accept_terms: true });
  reg('kunde', 'kunde', 'Demo Kundin', '0000 000000');
  reg('betrieb', 'betrieb', 'Demo Inhaber', '0000 111111');
  reg('werkstatt', 'betrieb', 'Demo Lackierer', '0000 222222');
  call('betrieb', 'PUT', '/api/my/company', { name: 'Demo Mobile Aufbereitung', contact_person: 'Demo Inhaber', street: 'Demostraße 1', plz: '61130', city: 'Nidderau', email: ACCOUNTS.betrieb[0], phone: '0000 111111', services: ['innen', 'innen_intensiv', 'polster', 'tierhaar', 'aussen', 'komplett'], mobile: true, mobile_radius_km: 30, workshop: false, vat_mode: 'regel', description: 'DEMO-Betrieb zum Testen. Keine echte Firma.', self_insurance: 'Demo-Angabe', self_trade: 'Demo-Angabe' });
  call('werkstatt', 'PUT', '/api/my/company', { name: 'Demo Lack & Smart Repair', contact_person: 'Demo Lackierer', street: 'Werkstattweg 2', plz: '63450', city: 'Hanau', email: ACCOUNTS.werkstatt[0], phone: '0000 222222', services: ['lack', 'politur', 'versiegelung', 'komplett'], mobile: true, mobile_radius_km: 20, workshop: true, workshop_address: 'Werkstattweg 2, 63450 Hanau', vat_mode: 'klein', description: 'DEMO-Fachbetrieb für Lackschäden. Keine echte Firma.' });
  const v = call('kunde', 'POST', '/api/my/vehicles', { make: 'VW', model: 'Touran', vehicle_type: 'van', nickname: 'Demo-Familienauto', last_cleaning_on: '2026-06-15' });
  const b = { customer_type: 'privat', plz: '61130', city: 'Nidderau', address_private: 'Demoweg 5', recurrence: 'einmalig' };
  const r1 = call('kunde', 'POST', '/api/requests', { ...b, area: 'mobil', service: 'tierhaar', location_pref: 'mobil', vehicle_id: v.id, timeframe: 'zwei_wochen', description: 'DEMO: Hundehaare im Kofferraum und auf der Rückbank.', budget: '150', mobile_parking: 'ja', mobile_power: 'ja', mobile_water: 'unsicher' });
  call('kunde', 'POST', '/api/requests', { ...b, area: 'lack', service: 'lack', location_pref: 'beides', vehicle_make: 'Audi', vehicle_model: 'A4', vehicle_type: 'kombi', timeframe: 'flexibel', description: 'DEMO: Kratzer am hinteren Stoßfänger nach dem Einparken.', budget_none: true, damage_part: 'stossfaenger_hinten', damage_type: 'kratzer', damage_size: 'mittel', mobile_parking: 'ja', mobile_power: 'nein', mobile_water: 'nein' });
  call('kunde', 'POST', '/api/requests', { ...b, area: 'halle', service: 'komplett', location_pref: 'betrieb', customer_type: 'flotte', fleet_count: 4, recurrence: 'regelmaessig', vehicle_make: 'Skoda', vehicle_model: 'Octavia', vehicle_type: 'kombi', timeframe: 'monat', description: 'DEMO: Monatliche Aufbereitung von 4 Firmenfahrzeugen.', budget_none: true });
  call('betrieb', 'POST', `/api/requests/${r1.id}/offers`, { location: 'mobil', scope: 'DEMO-Angebot: Tierhaare entfernen, Innenraum saugen, Kofferraum reinigen.', appointment: 'Nächste Woche vormittags', duration: 'ca. 3 Stunden', price: '119', travel_included: true });
}

// Für den Banner: Rolle wechseln und Demo zurücksetzen
window.DEMO = {
  accounts: ACCOUNTS,
  async switchTo(who) {
    await window.fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } });
    const [email, password] = ACCOUNTS[who];
    await window.fetch('/api/auth/login', { method: 'POST', headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    await saving;
    location.hash = who === 'admin' ? '#/verwaltung' : who === 'kunde' ? '#/meine-anfragen' : '#/kalender';
    location.reload();
  },
  async reset() {
    if (!confirm('Alle Demo-Daten in diesem Browser löschen und neu anlegen?')) return;
    await saving; await idbClear(); setSid(''); location.hash = '#/'; location.reload();
  },
};

// ---------- Start ----------
(async () => {
  const status = document.getElementById('app');
  try {
    globalThis.__SQL = await window.initSqlJs({ locateFile: (f) => '/' + f });
    const [dbBytes, files] = await Promise.all([idbGet('db'), idbGet('files')]);
    if (dbBytes) globalThis.__DEMO_DB_BYTES = dbBytes;
    globalThis.__DEMO_FILES = new Map((files || []).map(([k, v]) => [k, Buffer.from(v)]));
    const { createApp } = require('../src/server.js');
    const { hashPassword } = require('../src/auth.js');
    app = createApp({ dataDir: '/data', authLimit: 1000 });
    const db = app.locals.db;
    if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) { seed(db, hashPassword); scheduleSave(); }
  } catch (e) {
    console.error(e);
    status.textContent = 'Die Demo konnte nicht starten: ' + (e.message || e) + ' – bitte Seite neu laden oder einen aktuellen Browser verwenden.';
    return;
  }
  const s = document.createElement('script'); s.src = '/js/start.js'; document.body.append(s);
})();
