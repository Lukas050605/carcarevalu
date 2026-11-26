'use strict';
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');
const C = require('./catalog');
const { openDb } = require('./db');
const { calcOffer, parseEuroToCents, formatCents } = require('./money');
const auth = require('./auth');
const { storeUpload, filePath } = require('./uploads');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => new HttpError(400, m);
const forbidden = (m = 'Keine Berechtigung') => new HttpError(403, m);
const notFound = (m = 'Nicht gefunden') => new HttpError(404, m);

// ---------- Validierung ----------
function str(v, label, { min = 0, max = 2000, required = true } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(`${label}: ungültige Eingabe`);
  v = v.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  if (required && v.length === 0) throw bad(`${label} fehlt`);
  if (v.length < min) throw bad(`${label} ist zu kurz (mindestens ${min} Zeichen)`);
  if (v.length > max) throw bad(`${label} ist zu lang (höchstens ${max} Zeichen)`);
  return v;
}
function oneOf(v, map, label) {
  if (typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(map, v)) throw bad(`${label}: bitte auswählen`);
  return v;
}
function plzOf(v) {
  if (typeof v !== 'string' || !/^\d{5}$/.test(v.trim())) throw bad('Postleitzahl: bitte 5 Ziffern angeben');
  return v.trim();
}
function intIn(v, label, min, max) {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label}: Zahl zwischen ${min} und ${max} angeben`);
  return n;
}
function emailOf(v) {
  v = str(v, 'E-Mail', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw bad('E-Mail-Adresse ist ungültig');
  return v;
}
const optEuro = (v) => (v === undefined || v === null || v === '' ? null : parseEuroToCentsSafe(v));
function parseEuroToCentsSafe(v) { try { return parseEuroToCents(v); } catch (e) { throw bad(e.message); } }
const truthy = (v) => v === true || v === 'true' || v === '1' || v === 1 || v === 'on';

// ---------- Geo (nur echte Daten aus der Tabelle postcodes) ----------
function haversineKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function createApp({ dataDir, secureCookies = false, authLimit = 10 } = {}) {
  dataDir = dataDir || path.join(__dirname, '..', 'data');
  const db = openDb(dataDir);
  const uploadDir = path.join(dataDir, 'uploads');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const geo = (plz) => db.prepare('SELECT plz, city, lat, lng FROM postcodes WHERE plz = ?').get(plz) || null;
  const geoAvailable = () => db.prepare('SELECT COUNT(*) AS n FROM postcodes').get().n > 0;
  const audit = (userId, action, entity, id, detail = '') =>
    db.prepare('INSERT INTO audit (user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)').run(userId ?? null, action, entity, id ?? null, String(detail));

  // ---------- Grundschutz ----------
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    next();
  });
  app.use('/api', express.json({ limit: '200kb' }));
  // CSRF-Schutz: schreibende API-Aufrufe brauchen einen eigenen Header (Browser senden ihn fremdseitig nicht ohne CORS-Freigabe)
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('X-Requested-With') !== 'fetch') {
      return next(forbidden('Anfrage abgelehnt (fehlender Sicherheits-Header)'));
    }
    next();
  });
  app.use((req, res, next) => { req.user = auth.sessionUser(db, req); next(); });

  const need = (...roles) => (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Bitte melde dich an'));
    if (roles.length && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
  const h = (fn) => (req, res, next) => { try { const r = fn(req, res); if (r !== undefined) res.json(r); } catch (e) { next(e); } };

  // einfache Bremse gegen Passwort-Raten
  const attempts = new Map();
  function throttle(key) {
    const now = Date.now(), list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60000);
    if (list.length >= authLimit) throw new HttpError(429, 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.');
    list.push(now); attempts.set(key, list);
  }

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 8, fields: 10 } });

  const companyOf = (userId) => db.prepare('SELECT * FROM companies WHERE user_id = ?').get(userId);
  const requireCompany = (req) => {
    const c = companyOf(req.user.id);
    if (!c) throw forbidden('Kein Unternehmensprofil vorhanden');
    return c;
  };
  const profileComplete = (c) => !!(c.name && c.contact_person && c.street && c.plz && c.city && c.email && c.phone && (c.mobile || c.workshop) && JSON.parse(c.services).length);

  // ================= Auth =================
  app.post('/api/auth/register', h((req, res) => {
    throttle('reg:' + req.ip);
    const b = req.body || {};
    // Administratoren werden ausschließlich per Kommandozeile angelegt (scripts/create-admin.js)
    const role = oneOf(b.role, { kunde: 1, betrieb: 1 }, 'Rolle');
    const email = emailOf(b.email);
    const password = str(b.password, 'Passwort', { min: 10, max: 200 });
    const name = str(b.name, 'Name', { max: 120 });
    const phone = str(b.phone, 'Telefon', { max: 40, required: false });
    if (!truthy(b.accept_terms)) throw bad('Bitte bestätige die Vermittlungsbedingungen und die Datenschutzinformationen');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Für diese E-Mail-Adresse besteht bereits ein Konto');
    const id = db.tx(() => {
      const r = db.prepare('INSERT INTO users (email, pw_hash, name, phone, role) VALUES (?,?,?,?,?)').run(email, auth.hashPassword(password), name, phone, role);
      const uid = Number(r.lastInsertRowid);
      if (role === 'betrieb') db.prepare('INSERT INTO companies (user_id, contact_person, email, phone) VALUES (?,?,?,?)').run(uid, name, email, phone);
      return uid;
    });
    audit(id, 'register', 'user', id, role);
    res.set('Set-Cookie', auth.cookieHeader(auth.createSession(db, id), secureCookies));
    return { ok: true };
  }));

  app.post('/api/auth/login', h((req, res) => {
    throttle('login:' + req.ip);
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !auth.verifyPassword(String(b.password || ''), u.pw_hash)) throw new HttpError(401, 'E-Mail oder Passwort ist falsch');
    if (u.locked) throw forbidden('Dieses Konto ist gesperrt. Bitte wende dich an die Agentur.');
    res.set('Set-Cookie', auth.cookieHeader(auth.createSession(db, u.id), secureCookies));
    return { ok: true };
  }));

  app.post('/api/auth/logout', h((req, res) => {
    auth.destroySession(db, req);
    res.set('Set-Cookie', auth.cookieHeader('', secureCookies));
    return { ok: true };
  }));

  app.get('/api/me', h((req) => {
    if (!req.user) return { user: null };
    const c = req.user.role === 'betrieb' ? companyOf(req.user.id) : null;
    return { user: req.user, company: c ? { id: c.id, name: c.name, complete: profileComplete(c) } : null };
  }));

  app.get('/api/meta', h(() => ({
    areas: C.AREAS, services: C.SERVICES, locations: C.LOCATIONS, vehicleTypes: C.VEHICLE_TYPES, timeframes: C.TIMEFRAMES,
    damageTypes: C.DAMAGE_TYPES, damageSizes: C.DAMAGE_SIZES, parts: C.PARTS, tristate: C.TRISTATE,
    requestStatus: C.REQUEST_STATUS, commissionStatus: C.COMMISSION_STATUS,
    commissionBp: Number(db.setting('commission_bp')), agencyVatBp: Number(db.setting('agency_vat_bp')),
    geoAvailable: geoAvailable(),
  })));

  // ================= Anfragen (Kunde) =================
  function readRequest(b, userId) {
    // gespeichertes Fahrzeug aus dem Kundenprofil übernehmen
    let vehicle_id = null;
    if (b.vehicle_id) {
      const v = db.prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?').get(Number(b.vehicle_id), userId);
      if (!v) throw bad('Fahrzeug nicht gefunden');
      vehicle_id = v.id; b = { ...b, vehicle_make: v.make, vehicle_model: v.model, vehicle_type: v.vehicle_type };
    }
    const area = oneOf(b.area, C.AREAS, 'Hauptbereich');
    const service = oneOf(b.service, C.SERVICES, 'Leistung');
    if (area === 'lack' && service !== 'lack') throw bad('Im Bereich Lackschäden bitte die Leistung „Lackschäden und Smart Repair“ wählen');
    const location_pref = oneOf(b.location_pref, C.LOCATIONS, 'Ausführungsort');
    const customer_type = oneOf(b.customer_type, { privat: 1, flotte: 1 }, 'Kundenart');
    const plz = plzOf(b.plz);
    const g = geo(plz);
    const r = {
      area, service, location_pref, customer_type,
      vehicle_make: str(b.vehicle_make, 'Fahrzeugmarke', { max: 60 }),
      vehicle_model: str(b.vehicle_model, 'Modell', { max: 60 }),
      vehicle_type: oneOf(b.vehicle_type, C.VEHICLE_TYPES, 'Fahrzeugtyp'),
      plz,
      city: str(b.city, 'Ort', { max: 80 }),
      address_private: str(b.address_private, 'Straße und Hausnummer (verdeckte Angabe)', { min: 4, max: 200 }),
      lat: g ? g.lat : null, lng: g ? g.lng : null,
      timeframe: oneOf(b.timeframe, C.TIMEFRAMES, 'Zeitraum'),
      recurrence: oneOf(b.recurrence, { einmalig: 1, regelmaessig: 1 }, 'Einmalig oder regelmäßig'),
      fleet_count: customer_type === 'flotte' ? intIn(b.fleet_count, 'Anzahl Fahrzeuge', 1, 5000) : 1,
      description: str(b.description, 'Beschreibung', { min: 10, max: 3000 }),
      budget_cents: truthy(b.budget_none) ? null : optEuro(b.budget),
      damage_part: null, damage_type: null, damage_size: null, mobile_parking: null, mobile_power: null, mobile_water: null,
      vehicle_id,
    };
    if (service === 'lack') {
      r.damage_part = oneOf(b.damage_part, C.PARTS, 'Betroffenes Bauteil');
      r.damage_type = oneOf(b.damage_type, C.DAMAGE_TYPES, 'Schadensart');
      r.damage_size = oneOf(b.damage_size, C.DAMAGE_SIZES, 'Ungefähre Größe');
    }
    if (location_pref !== 'betrieb') {
      r.mobile_parking = oneOf(b.mobile_parking, C.TRISTATE, 'Stellplatz');
      r.mobile_power = oneOf(b.mobile_power, C.TRISTATE, 'Strom');
      r.mobile_water = oneOf(b.mobile_water, C.TRISTATE, 'Wasser');
    }
    return r;
  }
  const REQ_COLS = ['area', 'service', 'location_pref', 'customer_type', 'vehicle_make', 'vehicle_model', 'vehicle_type', 'plz', 'city', 'address_private', 'lat', 'lng', 'timeframe', 'recurrence', 'fleet_count', 'description', 'budget_cents', 'damage_part', 'damage_type', 'damage_size', 'mobile_parking', 'mobile_power', 'mobile_water', 'vehicle_id'];

  app.post('/api/requests', need('kunde'), h((req) => {
    const r = readRequest(req.body || {}, req.user.id);
    if (!r.vehicle_id && truthy((req.body || {}).save_vehicle)) {
      r.vehicle_id = Number(db.prepare('INSERT INTO vehicles (user_id, make, model, vehicle_type) VALUES (?,?,?,?)').run(req.user.id, r.vehicle_make, r.vehicle_model, r.vehicle_type).lastInsertRowid);
    }
    const res = db.prepare(`INSERT INTO requests (customer_id, ${REQ_COLS.join(',')}) VALUES (?, ${REQ_COLS.map(() => '?').join(',')})`)
      .run(req.user.id, ...REQ_COLS.map((k) => r[k]));
    const id = Number(res.lastInsertRowid);
    audit(req.user.id, 'create', 'request', id);
    return { id };
  }));

  const getRequest = (id) => db.prepare('SELECT * FROM requests WHERE id = ?').get(Number(id));
  const orderOfRequest = (id) => db.prepare('SELECT * FROM orders WHERE request_id = ?').get(id);
  const offerCount = (id) => db.prepare("SELECT COUNT(*) AS n FROM offers WHERE request_id = ? AND status = 'offen'").get(id).n;
  const displayStatus = (r) => (r.status === 'offen' && offerCount(r.id) > 0 ? 'angebote' : r.status);
  const ownRequest = (req) => {
    const r = getRequest(req.params.id);
    if (!r || r.customer_id !== req.user.id) throw notFound();
    return r;
  };

  app.put('/api/requests/:id', need('kunde'), h((req) => {
    const old = ownRequest(req);
    if (old.status !== 'offen' || orderOfRequest(old.id)) throw new HttpError(409, 'Die Anfrage kann nicht mehr bearbeitet werden, weil der Auftrag bereits vergeben ist');
    const r = readRequest(req.body || {}, req.user.id);
    db.prepare(`UPDATE requests SET ${REQ_COLS.map((k) => k + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...REQ_COLS.map((k) => r[k]), old.id);
    audit(req.user.id, 'update', 'request', old.id);
    return { ok: true };
  }));

  app.post('/api/requests/:id/withdraw', need('kunde'), h((req) => {
    const r = ownRequest(req);
    if (r.status !== 'offen' || orderOfRequest(r.id)) throw new HttpError(409, 'Ein vergebener Auftrag kann nicht zurückgezogen werden. Nutze „Stornieren“ im Auftrag.');
    db.tx(() => {
      db.prepare("UPDATE requests SET status = 'zurueckgezogen', updated_at = datetime('now') WHERE id = ?").run(r.id);
      db.prepare("UPDATE offers SET status = 'abgelehnt' WHERE request_id = ? AND status = 'offen'").run(r.id);
    });
    audit(req.user.id, 'withdraw', 'request', r.id);
    return { ok: true };
  }));

  app.post('/api/requests/:id/photos', need('kunde'), upload.array('photos', 8), h((req) => {
    const r = ownRequest(req);
    if (r.status !== 'offen') throw new HttpError(409, 'Fotos können nur bei offenen Anfragen ergänzt werden');
    const label = oneOf(req.body.label || 'allgemein', { allgemein: 1, detail: 1, uebersicht: 1 }, 'Bildart');
    const have = db.prepare("SELECT COUNT(*) AS n FROM files WHERE request_id = ? AND purpose = 'request_photo'").get(r.id).n;
    const files = req.files || [];
    if (!files.length) throw bad('Keine Datei ausgewählt');
    if (have + files.length > 8) throw bad('Höchstens 8 Fotos pro Anfrage');
    const saved = files.map((f) => {
      let s; try { s = storeUpload(uploadDir, f.buffer); } catch (e) { throw bad(`${f.originalname}: ${e.message}`); }
      db.prepare("INSERT INTO files (id, owner_user_id, purpose, label, request_id, mime, size) VALUES (?,?,'request_photo',?,?,?,?)").run(s.id, req.user.id, label, r.id, s.mime, s.size);
      return s.id;
    });
    return { ids: saved };
  }));

  app.get('/api/my/requests', need('kunde'), h((req) => {
    const rows = db.prepare('SELECT * FROM requests WHERE customer_id = ? ORDER BY id DESC').all(req.user.id);
    return { requests: rows.map((r) => ({ ...publicRequest(r, null, true), status: displayStatus(r), offers: offerCount(r.id), order_id: orderOfRequest(r.id)?.id ?? null })) };
  }));

  // Öffentliche Sicht: keine Namen, Kontaktdaten oder genaue Anschrift
  function publicRequest(r, origin, full = false) {
    let distance_km = null;
    if (origin && r.lat != null && origin.lat != null) distance_km = Math.round(haversineKm(origin, r) * 10) / 10;
    const photos = db.prepare("SELECT id, label FROM files WHERE request_id = ? AND purpose = 'request_photo' ORDER BY created_at").all(r.id);
    const o = {
      id: r.id, area: r.area, service: r.service, location_pref: r.location_pref,
      vehicle: `${r.vehicle_make} ${r.vehicle_model}`, vehicle_type: r.vehicle_type,
      area_approx: r.plz.slice(0, 3) + 'xx', city: r.city,
      timeframe: r.timeframe, recurrence: r.recurrence, customer_type: r.customer_type, fleet_count: r.fleet_count,
      budget_cents: r.budget_cents, description: full ? r.description : (r.description.length > 220 ? r.description.slice(0, 217) + '…' : r.description),
      status: displayStatus(r), created_at: r.created_at, updated_at: r.updated_at, photo_count: photos.length, distance_km,
    };
    if (full) {
      Object.assign(o, { damage_part: r.damage_part, damage_type: r.damage_type, damage_size: r.damage_size, mobile_parking: r.mobile_parking, mobile_power: r.mobile_power, mobile_water: r.mobile_water, photos });
    }
    return o;
  }

  function publicCompany(c) {
    const ver = db.prepare('SELECT kind, checked_at, valid_until FROM verifications WHERE company_id = ? AND revoked_at IS NULL ORDER BY checked_at').all(c.id);
    const examples = db.prepare("SELECT id FROM files WHERE company_id = ? AND purpose = 'work_example' ORDER BY created_at").all(c.id).map((f) => f.id);
    return {
      id: c.id, name: c.name, city: c.city, plz_area: c.plz ? c.plz.slice(0, 3) + 'xx' : '', services: JSON.parse(c.services),
      mobile: !!c.mobile, mobile_radius_km: c.mobile_radius_km, workshop: !!c.workshop, description: c.description,
      vat_mode: c.vat_mode,
      self_declared: { insurance: c.self_insurance, trade: c.self_trade },
      verified: ver, examples,
    };
  }

  app.get('/api/companies/:id', h((req) => {
    const c = db.prepare('SELECT c.* FROM companies c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND u.locked = 0').get(Number(req.params.id));
    if (!c || !c.name) throw notFound();
    return { company: publicCompany(c) };
  }));

  // Detailansicht je nach Rolle
  app.get('/api/requests/:id', need(), h((req) => {
    const r = getRequest(req.params.id);
    if (!r) throw notFound();
    const order = orderOfRequest(r.id);
    const u = req.user;
    if (u.role === 'admin' || r.customer_id === u.id) {
      const offers = db.prepare('SELECT o.*, c.id AS cid FROM offers o JOIN companies c ON c.id = o.company_id WHERE o.request_id = ? ORDER BY o.gross_cents').all(r.id)
        .map((o) => ({ ...customerOffer(o, r), company: publicCompany(companyById(o.company_id)) }));
      return { request: { ...publicRequest(r, null, true), plz: r.plz, address_private: r.address_private, vehicle_make: r.vehicle_make, vehicle_model: r.vehicle_model, vehicle_id: r.vehicle_id }, offers, order_id: order?.id ?? null, editable: r.status === 'offen' && !order };
    }
    if (u.role === 'betrieb') {
      const c = requireCompany(req);
      const mine = db.prepare('SELECT * FROM offers WHERE request_id = ? AND company_id = ? ORDER BY id DESC').all(r.id, c.id);
      const isMyOrder = order && order.company_id === c.id;
      if (r.hidden || (!['offen'].includes(r.status) && !mine.length && !isMyOrder)) throw notFound('Diese Anfrage ist nicht mehr verfügbar');
      const origin = c.lat != null ? { lat: c.lat, lng: c.lng } : null;
      const bm = !!db.prepare('SELECT 1 FROM bookmarks WHERE company_id = ? AND request_id = ?').get(c.id, r.id);
      return { request: publicRequest(r, origin, true), my_offers: mine.map((o) => customerOffer(o, r, true)), bookmarked: bm, order_id: isMyOrder ? order.id : null };
    }
    throw notFound();
  }));

  const companyById = (id) => db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  function customerOffer(o, r, forProvider = false) {
    const x = {
      id: o.id, request_id: o.request_id, company_id: o.company_id, scope: o.scope, location: o.location, appointment: o.appointment, duration: o.duration,
      travel_included: !!o.travel_included, travel_note: o.travel_note, extras: o.extras, gross_cents: o.gross_cents,
      provider_vat_bp: o.provider_vat_bp, status: o.status, created_at: o.created_at,
      request_changed_after: r ? r.updated_at > o.created_at : false,
    };
    if (forProvider) Object.assign(x, { net_cents: o.net_cents, commission_bp: o.commission_bp, commission_cents: o.commission_cents, agency_vat_bp: o.agency_vat_bp, commission_vat_cents: o.commission_vat_cents });
    return x;
  }

  // ================= Aufträge finden (öffentlich ansehbar, ohne private Daten) =================
  app.get('/api/jobs', h((req) => {
    const q = req.query;
    const where = ["r.status = 'offen'", 'r.hidden = 0'];
    const args = [];
    const locs = String(q.loc || '').split(',').filter((x) => ['mobil', 'betrieb'].includes(x));
    if (locs.length === 1) { where.push("(r.location_pref = ? OR r.location_pref = 'beides')"); args.push(locs[0]); }
    if (q.lack === '1') where.push("r.service = 'lack'");
    if (q.service && C.SERVICES[q.service]) { where.push('r.service = ?'); args.push(q.service); }
    if (q.customer_type && ['privat', 'flotte'].includes(q.customer_type)) { where.push('r.customer_type = ?'); args.push(q.customer_type); }
    if (q.recurrence && ['einmalig', 'regelmaessig'].includes(q.recurrence)) { where.push('r.recurrence = ?'); args.push(q.recurrence); }
    if (q.budget_min) { try { const v = parseEuroToCents(String(q.budget_min)); where.push('r.budget_cents >= ?'); args.push(v); } catch { throw bad('Budget ab: ungültiger Betrag'); } }
    if (q.budget_max) { try { const v = parseEuroToCents(String(q.budget_max)); where.push('r.budget_cents <= ?'); args.push(v); } catch { throw bad('Budget bis: ungültiger Betrag'); } }

    let company = null;
    if (req.user && req.user.role === 'betrieb') company = companyOf(req.user.id);
    if (q.matching === '1' && company) {
      const svc = JSON.parse(company.services);
      if (svc.length) { where.push(`r.service IN (${svc.map(() => '?').join(',')})`); args.push(...svc); }
      if (company.mobile && !company.workshop) where.push("r.location_pref IN ('mobil','beides')");
      if (!company.mobile && company.workshop) where.push("r.location_pref IN ('betrieb','beides')");
    }

    const notices = [];
    let origin = null;
    const plz = String(q.plz || '').trim();
    if (plz) {
      if (!/^\d{2,5}$/.test(plz)) throw bad('Postleitzahl: bitte 2 bis 5 Ziffern angeben');
      const g = plz.length === 5 ? geo(plz) : null;
      if (g) origin = g;
      else { where.push('r.plz LIKE ?'); args.push(plz + '%'); if (q.radius) notices.push('Umkreissuche nicht möglich: Für diese Postleitzahl liegen keine Standortdaten vor. Es wird nach Postleitzahl-Anfang gefiltert.'); }
    } else if (company && company.lat != null) origin = { lat: company.lat, lng: company.lng };
    if (!geoAvailable()) notices.push('Entfernungen werden nicht angezeigt, weil noch keine Postleitzahl-Geodaten importiert sind.');

    let rows = db.prepare(`SELECT r.* FROM requests r WHERE ${where.join(' AND ')}`).all(...args).map((r) => publicRequest(r, origin));
    const radius = q.radius ? intIn(q.radius, 'Umkreis', 1, 500) : null;
    if (radius && origin) rows = rows.filter((r) => r.distance_km !== null && r.distance_km <= radius);
    const sort = q.sort || 'new';
    if (sort === 'distance') {
      if (!origin) notices.push('Sortierung nach Entfernung nicht möglich: kein Standort mit Geodaten angegeben.');
      rows.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) || b.id - a.id);
    } else if (sort === 'budget') rows.sort((a, b) => (b.budget_cents ?? -1) - (a.budget_cents ?? -1) || b.id - a.id);
    else rows.sort((a, b) => b.id - a.id);
    if (company) {
      const bm = new Set(db.prepare('SELECT request_id FROM bookmarks WHERE company_id = ?').all(company.id).map((x) => x.request_id));
      rows.forEach((r) => { r.bookmarked = bm.has(r.id); });
    }
    return { jobs: rows.slice(0, 200), total: rows.length, notices, origin: origin ? { plz: origin.plz || company?.plz, city: origin.city || company?.city } : null };
  }));

  app.post('/api/jobs/:id/bookmark', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const r = getRequest(req.params.id); if (!r || r.hidden) throw notFound();
    db.prepare('INSERT OR IGNORE INTO bookmarks (company_id, request_id) VALUES (?, ?)').run(c.id, r.id);
    return { ok: true };
  }));
  app.delete('/api/jobs/:id/bookmark', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    db.prepare('DELETE FROM bookmarks WHERE company_id = ? AND request_id = ?').run(c.id, Number(req.params.id));
    return { ok: true };
  }));
  app.get('/api/my/bookmarks', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const rows = db.prepare('SELECT r.* FROM bookmarks b JOIN requests r ON r.id = b.request_id WHERE b.company_id = ? AND r.hidden = 0 ORDER BY r.id DESC').all(c.id);
    const origin = c.lat != null ? { lat: c.lat, lng: c.lng } : null;
    return { jobs: rows.map((r) => ({ ...publicRequest(r, origin), bookmarked: true })) };
  }));

  // ================= Unternehmensprofil =================
  app.get('/api/my/company', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const files = db.prepare("SELECT id, purpose, label, mime, created_at FROM files WHERE company_id = ? AND purpose IN ('work_example','proof') ORDER BY created_at").all(c.id);
    const ver = db.prepare('SELECT id, kind, note, checked_at, valid_until, revoked_at FROM verifications WHERE company_id = ? ORDER BY checked_at').all(c.id);
    return { company: { ...c, services: JSON.parse(c.services), mobile: !!c.mobile, workshop: !!c.workshop }, files, verifications: ver, complete: profileComplete(c) };
  }));

  app.put('/api/my/company', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const b = req.body || {};
    const services = Array.isArray(b.services) ? [...new Set(b.services)] : [];
    services.forEach((s) => oneOf(s, C.SERVICES, 'Leistung'));
    if (!services.length) throw bad('Bitte mindestens eine Leistung auswählen');
    const mobile = truthy(b.mobile), workshop = truthy(b.workshop);
    if (!mobile && !workshop) throw bad('Bitte angeben: mobil, mit Halle/Werkstatt oder beides');
    const plz = plzOf(b.plz);
    const g = geo(plz);
    const v = {
      name: str(b.name, 'Firmenname', { max: 120 }), contact_person: str(b.contact_person, 'Ansprechpartner', { max: 120 }),
      street: str(b.street, 'Straße und Hausnummer', { max: 120 }), plz, city: str(b.city, 'Ort', { max: 80 }),
      email: emailOf(b.email), phone: str(b.phone, 'Telefon', { max: 40 }),
      services: JSON.stringify(services), mobile: mobile ? 1 : 0,
      mobile_radius_km: mobile ? intIn(b.mobile_radius_km, 'Mobiles Einsatzgebiet (km)', 1, 300) : null,
      workshop: workshop ? 1 : 0, workshop_address: workshop ? str(b.workshop_address, 'Adresse Halle/Werkstatt', { max: 200, required: false }) : '',
      description: str(b.description, 'Beschreibung', { max: 3000, required: false }),
      vat_mode: oneOf(b.vat_mode, { regel: 1, klein: 1 }, 'Umsatzsteuer'),
      self_insurance: str(b.self_insurance, 'Angaben zur Versicherung', { max: 500, required: false }),
      self_trade: str(b.self_trade, 'Angaben zur gewerblichen Tätigkeit', { max: 500, required: false }),
      lat: g ? g.lat : null, lng: g ? g.lng : null,
    };
    const keys = Object.keys(v);
    db.prepare(`UPDATE companies SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...keys.map((k) => v[k]), c.id);
    audit(req.user.id, 'update', 'company', c.id);
    return { ok: true };
  }));

  app.post('/api/my/company/files', need('betrieb'), upload.array('files', 8), h((req) => {
    const c = requireCompany(req);
    const purpose = oneOf(req.body.purpose, { work_example: 1, proof: 1 }, 'Dateiart');
    const files = req.files || [];
    if (!files.length) throw bad('Keine Datei ausgewählt');
    const have = db.prepare('SELECT COUNT(*) AS n FROM files WHERE company_id = ? AND purpose = ?').get(c.id, purpose).n;
    if (have + files.length > 12) throw bad('Höchstens 12 Dateien dieser Art');
    const label = purpose === 'proof' ? str(req.body.label, 'Bezeichnung des Nachweises', { max: 80 }) : '';
    return { ids: files.map((f) => {
      let s; try { s = storeUpload(uploadDir, f.buffer, { allowPdf: purpose === 'proof' }); } catch (e) { throw bad(`${f.originalname}: ${e.message}`); }
      db.prepare('INSERT INTO files (id, owner_user_id, purpose, label, company_id, mime, size) VALUES (?,?,?,?,?,?,?)').run(s.id, req.user.id, purpose, label, c.id, s.mime, s.size);
      return s.id;
    }) };
  }));

  // ================= Dateien: Zugriff serverseitig geprüft =================
  function canReadFile(user, f) {
    if (f.purpose === 'work_example') return true; // Arbeitsbeispiele sind Teil des öffentlichen Profils
    if (!user) return false;
    if (user.role === 'admin' || f.owner_user_id === user.id) return true;
    if (f.purpose === 'request_photo' && user.role === 'betrieb') {
      const r = getRequest(f.request_id); const c = companyOf(user.id);
      if (!r || !c || r.hidden) return false;
      if (r.status === 'offen') return true;
      return !!db.prepare('SELECT 1 FROM offers WHERE request_id = ? AND company_id = ?').get(r.id, c.id);
    }
    return false;
  }
  app.get('/api/files/:id', (req, res, next) => {
    try {
      const f = db.prepare('SELECT * FROM files WHERE id = ?').get(String(req.params.id));
      if (!f || !canReadFile(req.user, f)) throw notFound();
      const p = filePath(uploadDir, f.id);
      if (!p || !fs.existsSync(p)) throw notFound();
      res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': f.mime === 'application/pdf' ? 'attachment' : 'inline', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox" });
      fs.createReadStream(p).pipe(res);
    } catch (e) { next(e); }
  });
  app.delete('/api/files/:id', need(), h((req) => {
    const f = db.prepare('SELECT * FROM files WHERE id = ?').get(String(req.params.id));
    if (!f || f.owner_user_id !== req.user.id) throw notFound();
    if (f.purpose === 'request_photo' && getRequest(f.request_id)?.status !== 'offen') throw new HttpError(409, 'Fotos vergebener Aufträge bleiben zur Nachvollziehbarkeit erhalten');
    if (f.purpose === 'proof' && db.prepare('SELECT 1 FROM verifications WHERE file_id = ?').get(f.id)) throw new HttpError(409, 'Dieser Nachweis wurde bereits geprüft und bleibt gespeichert');
    db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
    const p = filePath(uploadDir, f.id); if (p) fs.rmSync(p, { force: true });
    return { ok: true };
  }));

  // ================= Angebote =================
  const currentRates = () => ({ commissionBp: Number(db.setting('commission_bp')), agencyVatBp: Number(db.setting('agency_vat_bp')) });
  const vatBpOf = (c) => (c.vat_mode === 'klein' ? 0 : 1900);

  app.post('/api/offers/preview', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const gross = parseEuroToCentsSafe((req.body || {}).price);
    if (gross <= 0) throw bad('Preis muss größer als 0 sein');
    const { commissionBp, agencyVatBp } = currentRates();
    return { calc: calcOffer(gross, vatBpOf(c), commissionBp, agencyVatBp), vat_mode: c.vat_mode };
  }));

  app.post('/api/requests/:id/offers', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    if (!profileComplete(c)) throw bad('Bitte vervollständige zuerst dein Unternehmensprofil');
    const r = getRequest(req.params.id);
    if (!r || r.hidden || r.status !== 'offen') throw new HttpError(409, 'Für diese Anfrage können keine Angebote mehr abgegeben werden');
    const b = req.body || {};
    const location = oneOf(b.location, { mobil: 1, betrieb: 1 }, 'Ausführungsort');
    if (r.location_pref !== 'beides' && r.location_pref !== location) throw bad(`Der Kunde wünscht: ${C.LOCATIONS[r.location_pref]}`);
    if (location === 'mobil' && !c.mobile) throw bad('Laut Profil bietest du keine mobilen Einsätze an');
    if (location === 'betrieb' && !c.workshop) throw bad('Laut Profil hast du keine Halle/Werkstatt');
    if (r.service === 'lack' && location === 'mobil' && !truthy(b.feasibility_confirmed)) {
      throw bad('Bitte bestätige, dass du die mobile Reparatur anhand der Angaben für machbar hältst – oder biete die Reparatur im Betrieb an');
    }
    const gross = parseEuroToCentsSafe(b.price);
    if (gross <= 0 || gross > 10000000) throw bad('Preis bitte zwischen 0,01 € und 100.000 € angeben');
    const { commissionBp, agencyVatBp } = currentRates();
    const k = calcOffer(gross, vatBpOf(c), commissionBp, agencyVatBp);
    const o = {
      scope: str(b.scope, 'Leistungsumfang', { min: 10, max: 3000 }),
      appointment: str(b.appointment, 'Termin oder Zeitfenster', { max: 200 }),
      duration: str(b.duration, 'Geschätzte Dauer', { max: 100 }),
      travel_included: truthy(b.travel_included) ? 1 : 0,
      travel_note: str(b.travel_note, 'Anfahrt', { max: 200, required: false }),
      extras: str(b.extras, 'Zusatzleistungen', { max: 1000, required: false }),
    };
    if (location === 'mobil' && !o.travel_included && !o.travel_note) throw bad('Bitte angeben, ob Anfahrtskosten im Endpreis enthalten sind');
    if (db.prepare("SELECT 1 FROM offers WHERE request_id = ? AND company_id = ? AND status = 'offen'").get(r.id, c.id)) throw new HttpError(409, 'Du hast bereits ein offenes Angebot. Ziehe es zurück, um ein neues abzugeben.');
    const res = db.prepare(`INSERT INTO offers (request_id, company_id, scope, location, appointment, duration, travel_included, travel_note, extras, gross_cents, provider_vat_bp, net_cents, commission_bp, commission_cents, agency_vat_bp, commission_vat_cents)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.id, c.id, o.scope, location, o.appointment, o.duration, o.travel_included, o.travel_note, o.extras, k.grossCents, k.providerVatBp, k.netCents, k.commissionBp, k.commissionCents, k.agencyVatBp, k.commissionVatCents);
    audit(req.user.id, 'create', 'offer', Number(res.lastInsertRowid), formatCents(gross));
    return { id: Number(res.lastInsertRowid), calc: k };
  }));

  app.post('/api/offers/:id/withdraw', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const o = db.prepare('SELECT * FROM offers WHERE id = ? AND company_id = ?').get(Number(req.params.id), c.id);
    if (!o) throw notFound();
    if (o.status !== 'offen') throw new HttpError(409, 'Nur offene Angebote können zurückgezogen werden');
    db.prepare("UPDATE offers SET status = 'zurueckgezogen' WHERE id = ?").run(o.id);
    return { ok: true };
  }));

  app.get('/api/my/offers', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const rows = db.prepare('SELECT o.*, r.service, r.vehicle_make, r.vehicle_model, r.city, r.plz, r.updated_at AS r_updated FROM offers o JOIN requests r ON r.id = o.request_id WHERE o.company_id = ? ORDER BY o.id DESC').all(c.id);
    return { offers: rows.map((o) => ({ ...customerOffer(o, { updated_at: o.r_updated }, true), service: o.service, vehicle: `${o.vehicle_make} ${o.vehicle_model}`, area_approx: o.plz.slice(0, 3) + 'xx', city: o.city, order_id: db.prepare('SELECT id FROM orders WHERE offer_id = ?').get(o.id)?.id ?? null })) };
  }));

  // Kunde nimmt Angebot an → verbindlicher Auftrag zwischen Kunde und Betrieb
  app.post('/api/offers/:id/accept', need('kunde'), h((req) => {
    const b = req.body || {};
    if (!truthy(b.accept_terms) || !truthy(b.acknowledge_intermediary)) throw bad('Bitte bestätige die Hinweise zur Beauftragung');
    const id = db.tx(() => {
      const o = db.prepare('SELECT * FROM offers WHERE id = ?').get(Number(req.params.id));
      if (!o) throw notFound();
      const r = getRequest(o.request_id);
      if (!r || r.customer_id !== req.user.id) throw notFound();
      if (r.status !== 'offen' || orderOfRequest(r.id)) throw new HttpError(409, 'Für diese Anfrage wurde bereits ein Auftrag vergeben');
      if (o.status !== 'offen') throw new HttpError(409, 'Dieses Angebot ist nicht mehr gültig');
      const res = db.prepare(`INSERT INTO orders (request_id, offer_id, company_id, customer_id, gross_cents, net_cents, provider_vat_bp, commission_bp, agency_vat_bp, status, terms_accepted_at)
        VALUES (?,?,?,?,?,?,?,?,?,'vergeben',datetime('now'))`).run(r.id, o.id, o.company_id, r.customer_id, o.gross_cents, o.net_cents, o.provider_vat_bp, o.commission_bp, o.agency_vat_bp);
      const orderId = Number(res.lastInsertRowid);
      db.prepare("UPDATE offers SET status = 'angenommen' WHERE id = ?").run(o.id);
      db.prepare("UPDATE offers SET status = 'abgelehnt' WHERE request_id = ? AND id <> ? AND status = 'offen'").run(r.id, o.id);
      db.prepare("UPDATE requests SET status = 'vergeben' WHERE id = ?").run(r.id);
      // voraussichtliche Provision – wird erst nach beidseitiger Bestätigung abrechenbar
      db.prepare("INSERT INTO commissions (order_id, company_id, net_cents, rate_bp, amount_cents, vat_bp, vat_cents, status) VALUES (?,?,?,?,?,?,?,'voraussichtlich')")
        .run(orderId, o.company_id, o.net_cents, o.commission_bp, o.commission_cents, o.agency_vat_bp, o.commission_vat_cents);
      return orderId;
    });
    audit(req.user.id, 'accept', 'order', id);
    return { order_id: id };
  }));

  // ================= Auftragsabwicklung =================
  const setOrderStatus = (o, status, extra = {}) => {
    const keys = Object.keys(extra);
    db.prepare(`UPDATE orders SET status = ?, ${keys.map((k) => k + ' = ?').join(', ')}${keys.length ? ',' : ''} updated_at = datetime('now') WHERE id = ?`).run(status, ...keys.map((k) => extra[k]), o.id);
    db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(status, o.request_id);
  };
  const commissionOf = (orderId) => db.prepare('SELECT * FROM commissions WHERE order_id = ?').get(orderId);
  const setCommission = (orderId, status, note) => {
    const k = commissionOf(orderId);
    if (!k) return;
    if (['rechnung_erstellt', 'bezahlt'].includes(k.status) && status !== 'klaerung') return; // bereits abgerechnet → nur Klärung
    db.prepare(`UPDATE commissions SET status = ?, note = CASE WHEN ? = '' THEN note ELSE ? END, updated_at = datetime('now') WHERE id = ?`).run(status, note || '', note || '', k.id);
  };

  function loadOrder(req) {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
    if (!o) throw notFound();
    const u = req.user;
    let role = null;
    if (u.role === 'admin') role = 'admin';
    else if (u.role === 'kunde' && o.customer_id === u.id) role = 'kunde';
    else if (u.role === 'betrieb' && companyOf(u.id)?.id === o.company_id) role = 'betrieb';
    if (!role) throw notFound();
    return { o, role };
  }

  // Letzte Reinigung am Fahrzeug des Kunden vermerken (nur Pflege-/Reinigungsleistungen, nicht reine Lackreparatur)
  function markCleaned(o) {
    const r = getRequest(o.request_id);
    if (!r.vehicle_id || r.service === 'lack') return;
    const today = new Date().toISOString().slice(0, 10);
    const planned = o.scheduled_start ? o.scheduled_start.slice(0, 10) : today;
    const day = planned < today ? planned : today; // nie ein Datum in der Zukunft
    db.prepare("UPDATE vehicles SET last_cleaning_on = ?, last_cleaning_source = 'plattform' WHERE id = ? AND user_id = ? AND (last_cleaning_on IS NULL OR last_cleaning_on <= ?)").run(day, r.vehicle_id, o.customer_id, day);
  }

  // Nach beidseitiger Bestätigung prüfen, ob die Provision abrechenbar wird
  function evaluateConfirmations(orderId) {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (o.status !== 'fertig_gemeldet' || o.provider_paid_cents == null || o.customer_paid_cents == null) return;
    if (o.provider_paid_cents !== o.customer_paid_cents) {
      setOrderStatus(o, 'klaerung', { dispute_reason: `Abweichende Zahlungsangaben: Betrieb ${formatCents(o.provider_paid_cents)}, Kunde ${formatCents(o.customer_paid_cents)}` });
      setCommission(o.id, 'klaerung', 'Zahlungsangaben weichen ab');
    } else if (o.provider_paid_cents !== o.gross_cents - o.refund_cents) {
      setOrderStatus(o, 'klaerung', { dispute_reason: `Bezahlter Betrag ${formatCents(o.provider_paid_cents)} weicht vom vereinbarten Preis ${formatCents(o.gross_cents)} ab` });
      setCommission(o.id, 'klaerung', 'Bezahlter Betrag weicht vom Angebotspreis ab');
    } else {
      setOrderStatus(o, 'bestaetigt');
      setCommission(o.id, 'abrechenbar', '');
      markCleaned(o);
    }
  }

  app.get('/api/orders/:id', need(), h((req) => {
    const { o, role } = loadOrder(req);
    const r = getRequest(o.request_id);
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(o.offer_id);
    const c = companyById(o.company_id);
    const cust = db.prepare('SELECT name, email, phone FROM users WHERE id = ?').get(o.customer_id);
    const out = {
      order: o, role, request: { ...publicRequest(r, null, true), plz: r.plz },
      offer: customerOffer(offer, null, role !== 'kunde'),
      // Kontaktdaten nur für die Beteiligten dieses Auftrags (zweckgebunden)
      company_contact: { id: c.id, name: c.name, contact_person: c.contact_person, street: c.street, plz: c.plz, city: c.city, email: c.email, phone: c.phone, workshop_address: c.workshop_address, vat_mode: c.vat_mode },
      customer_contact: role === 'kunde' ? null : { name: cust.name, email: cust.email, phone: cust.phone, address: r.address_private, plz: r.plz, city: r.city },
    };
    if (role !== 'kunde') out.commission = commissionOf(o.id);
    return out;
  }));

  app.get('/api/my/orders', need('kunde', 'betrieb'), h((req) => {
    const rows = req.user.role === 'kunde'
      ? db.prepare('SELECT o.*, r.service, r.vehicle_make, r.vehicle_model, c.name AS company_name FROM orders o JOIN requests r ON r.id = o.request_id JOIN companies c ON c.id = o.company_id WHERE o.customer_id = ? ORDER BY o.id DESC').all(req.user.id)
      : db.prepare('SELECT o.*, r.service, r.vehicle_make, r.vehicle_model, c.name AS company_name FROM orders o JOIN requests r ON r.id = o.request_id JOIN companies c ON c.id = o.company_id WHERE o.company_id = ? ORDER BY o.id DESC').all(requireCompany(req).id);
    return { orders: rows.map((o) => ({ id: o.id, status: o.status, service: o.service, vehicle: `${o.vehicle_make} ${o.vehicle_model}`, company_name: o.company_name, gross_cents: o.gross_cents, created_at: o.created_at, commission: req.user.role === 'betrieb' ? commissionOf(o.id) : undefined })) };
  }));

  app.post('/api/orders/:id/start', need('betrieb'), h((req) => {
    const { o } = loadOrder(req);
    if (o.status !== 'vergeben') throw new HttpError(409, 'Auftrag kann in diesem Status nicht begonnen werden');
    setOrderStatus(o, 'in_bearbeitung', { started_at: new Date().toISOString() });
    sysMsg(o.id, 'Der Betrieb hat mit der Arbeit begonnen.');
    return { ok: true };
  }));

  app.post('/api/orders/:id/report-done', need('betrieb'), h((req) => {
    const { o } = loadOrder(req);
    if (!['vergeben', 'in_bearbeitung'].includes(o.status)) throw new HttpError(409, 'Fertigstellung kann in diesem Status nicht gemeldet werden');
    db.tx(() => {
      setOrderStatus(o, 'fertig_gemeldet', { done_reported_at: new Date().toISOString() });
      sysMsg(o.id, 'Der Betrieb hat die Fertigstellung gemeldet. Bitte Durchführung und Zahlung bestätigen.');
      const b = req.body || {};
      if (truthy(b.payment_received)) {
        db.prepare("UPDATE orders SET provider_paid_cents = ?, provider_paid_at = datetime('now') WHERE id = ?").run(parseEuroToCentsSafe(b.amount), o.id);
      }
      evaluateConfirmations(o.id);
    });
    audit(req.user.id, 'report_done', 'order', o.id);
    return { ok: true };
  }));

  app.post('/api/orders/:id/provider-payment', need('betrieb'), h((req) => {
    const { o } = loadOrder(req);
    if (o.status !== 'fertig_gemeldet') throw new HttpError(409, 'Zahlungseingang kann erst nach gemeldeter Fertigstellung bestätigt werden');
    if (o.provider_paid_cents != null) throw new HttpError(409, 'Zahlungseingang wurde bereits bestätigt');
    db.tx(() => {
      db.prepare("UPDATE orders SET provider_paid_cents = ?, provider_paid_at = datetime('now') WHERE id = ?").run(parseEuroToCentsSafe((req.body || {}).amount), o.id);
      evaluateConfirmations(o.id);
    });
    audit(req.user.id, 'provider_payment', 'order', o.id);
    return { ok: true };
  }));

  app.post('/api/orders/:id/customer-confirm', need('kunde'), h((req) => {
    const { o } = loadOrder(req);
    if (o.status !== 'fertig_gemeldet') throw new HttpError(409, 'Bestätigung ist erst möglich, wenn der Betrieb die Fertigstellung gemeldet hat');
    if (o.customer_paid_cents != null) throw new HttpError(409, 'Du hast bereits bestätigt');
    const b = req.body || {};
    if (!truthy(b.work_done)) throw bad('Bitte bestätige die Durchführung oder melde ein Problem');
    db.tx(() => {
      db.prepare("UPDATE orders SET customer_paid_cents = ?, customer_confirmed_at = datetime('now') WHERE id = ?").run(parseEuroToCentsSafe(b.amount), o.id);
      evaluateConfirmations(o.id);
    });
    audit(req.user.id, 'customer_confirm', 'order', o.id);
    return { ok: true };
  }));

  app.post('/api/orders/:id/dispute', need('kunde', 'betrieb'), h((req) => {
    const { o } = loadOrder(req);
    if (['storniert', 'abgeschlossen', 'klaerung'].includes(o.status)) throw new HttpError(409, 'In diesem Status ist keine Klärung möglich');
    const reason = str((req.body || {}).reason, 'Beschreibung des Problems', { min: 10, max: 1000 });
    db.tx(() => { setOrderStatus(o, 'klaerung', { dispute_reason: `${req.user.role === 'kunde' ? 'Kunde' : 'Betrieb'}: ${reason}` }); setCommission(o.id, 'klaerung', 'Auftrag in Klärung'); });
    audit(req.user.id, 'dispute', 'order', o.id, reason);
    return { ok: true };
  }));

  app.post('/api/orders/:id/cancel', need('kunde', 'betrieb'), h((req) => {
    const { o } = loadOrder(req);
    if (!['vergeben', 'in_bearbeitung'].includes(o.status)) throw new HttpError(409, 'Nach gemeldeter Fertigstellung ist keine einseitige Stornierung möglich. Bitte „Problem melden“ nutzen.');
    const reason = str((req.body || {}).reason, 'Grund der Stornierung', { min: 3, max: 500 });
    db.tx(() => { setOrderStatus(o, 'storniert', { cancelled_at: new Date().toISOString(), cancelled_by: req.user.id, cancel_reason: reason }); setCommission(o.id, 'storniert', 'Auftrag storniert'); });
    audit(req.user.id, 'cancel', 'order', o.id, reason);
    return { ok: true };
  }));

  // ================= Nachrichten im Auftrag (nur Beteiligte) =================
  app.get('/api/orders/:id/messages', need(), h((req) => {
    const { o } = loadOrder(req);
    return { messages: db.prepare(`SELECT m.id, m.body, m.system, m.created_at, m.sender_id, u.role AS sender_role,
      CASE WHEN u.role = 'betrieb' THEN (SELECT name FROM companies WHERE user_id = u.id) ELSE u.name END AS sender_name
      FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.order_id = ? ORDER BY m.id`).all(o.id).map((m) => ({ ...m, mine: m.sender_id === req.user.id })) };
  }));
  app.post('/api/orders/:id/messages', need('kunde', 'betrieb'), h((req) => {
    const { o } = loadOrder(req);
    if (o.status === 'storniert') throw new HttpError(409, 'Der Auftrag ist storniert');
    const body = str((req.body || {}).body, 'Nachricht', { max: 2000 });
    db.prepare('INSERT INTO messages (order_id, sender_id, body) VALUES (?,?,?)').run(o.id, req.user.id, body);
    return { ok: true };
  }));
  const sysMsg = (orderId, text) => db.prepare('INSERT INTO messages (order_id, sender_id, body, system) VALUES (?, NULL, ?, 1)').run(orderId, text);

  // ================= Termine & Kalender (Betrieb) =================
  const dt = (v, label) => { v = str(v, label, { max: 16 }); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || isNaN(new Date(v))) throw bad(`${label}: Datum und Uhrzeit angeben`); return v; };
  app.put('/api/orders/:id/schedule', need('betrieb'), h((req) => {
    const { o } = loadOrder(req);
    if (!['vergeben', 'in_bearbeitung'].includes(o.status)) throw new HttpError(409, 'Termin kann in diesem Status nicht geändert werden');
    const b = req.body || {};
    const start = dt(b.start, 'Beginn'), end = dt(b.end, 'Ende');
    if (end <= start) throw bad('Ende muss nach dem Beginn liegen');
    db.prepare("UPDATE orders SET scheduled_start = ?, scheduled_end = ?, updated_at = datetime('now') WHERE id = ?").run(start, end, o.id);
    const fmt = (x) => x.slice(8, 10) + '.' + x.slice(5, 7) + '.' + x.slice(0, 4) + ' ' + x.slice(11);
    sysMsg(o.id, `Termin ${o.scheduled_start ? 'geändert' : 'festgelegt'}: ${fmt(start)} bis ${fmt(end).slice(11)} Uhr`);
    return { ok: true };
  }));
  app.get('/api/my/calendar', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from)) ? String(req.query.from) : new Date().toISOString().slice(0, 10);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to)) ? String(req.query.to) : '9999-12-31';
    const orders = db.prepare(`SELECT o.id, o.status, o.scheduled_start, o.scheduled_end, r.service, r.city, r.plz, r.vehicle_make, r.vehicle_model, of.location
      FROM orders o JOIN requests r ON r.id = o.request_id JOIN offers of ON of.id = o.offer_id
      WHERE o.company_id = ? AND o.status NOT IN ('storniert') AND o.scheduled_start IS NOT NULL AND substr(o.scheduled_start,1,10) BETWEEN ? AND ? ORDER BY o.scheduled_start`).all(c.id, from, to);
    const unscheduled = db.prepare(`SELECT o.id, o.status, r.service, r.city, of.appointment FROM orders o JOIN requests r ON r.id = o.request_id JOIN offers of ON of.id = o.offer_id
      WHERE o.company_id = ? AND o.status IN ('vergeben','in_bearbeitung') AND o.scheduled_start IS NULL ORDER BY o.id`).all(c.id);
    const entries = db.prepare('SELECT * FROM calendar_entries WHERE company_id = ? AND substr(starts_at,1,10) BETWEEN ? AND ? ORDER BY starts_at').all(c.id, from, to);
    return { orders, entries, unscheduled };
  }));
  app.post('/api/my/calendar', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const b = req.body || {};
    const start = dt(b.start, 'Beginn'), end = dt(b.end, 'Ende');
    if (end <= start) throw bad('Ende muss nach dem Beginn liegen');
    const r = db.prepare('INSERT INTO calendar_entries (company_id, title, starts_at, ends_at, note) VALUES (?,?,?,?,?)').run(c.id, str(b.title, 'Titel', { max: 120 }), start, end, str(b.note, 'Notiz', { max: 500, required: false }));
    return { id: Number(r.lastInsertRowid) };
  }));
  app.delete('/api/my/calendar/:id', need('betrieb'), h((req) => {
    const c = requireCompany(req);
    const r = db.prepare('DELETE FROM calendar_entries WHERE id = ? AND company_id = ?').run(Number(req.params.id), c.id);
    if (!r.changes) throw notFound();
    return { ok: true };
  }));

  // ================= Kundenprofil & Fahrzeuge =================
  app.get('/api/my/profile', need(), h((req) => {
    const u = req.user;
    const vehicles = u.role === 'kunde' ? db.prepare(`SELECT v.*, (SELECT COUNT(*) FROM requests r JOIN orders o ON o.request_id = r.id WHERE r.vehicle_id = v.id AND o.status IN ('bestaetigt','abgeschlossen')) AS jobs_done
      FROM vehicles v WHERE v.user_id = ? ORDER BY v.id`).all(u.id) : [];
    return { profile: { name: u.name, email: u.email, phone: u.phone }, vehicles };
  }));
  app.put('/api/my/profile', need(), h((req) => {
    const b = req.body || {};
    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(str(b.name, 'Name', { max: 120 }), str(b.phone, 'Telefon', { max: 40, required: false }), req.user.id);
    return { ok: true };
  }));
  const readVehicle = (b) => {
    const last = b.last_cleaning_on ? str(b.last_cleaning_on, 'Letzte Reinigung', { max: 10 }) : null;
    if (last && (!/^\d{4}-\d{2}-\d{2}$/.test(last) || last > new Date().toISOString().slice(0, 10))) throw bad('Letzte Reinigung: gültiges Datum, nicht in der Zukunft');
    return { make: str(b.make, 'Marke', { max: 60 }), model: str(b.model, 'Modell', { max: 60 }), vehicle_type: oneOf(b.vehicle_type, C.VEHICLE_TYPES, 'Fahrzeugtyp'), nickname: str(b.nickname, 'Bezeichnung', { max: 60, required: false }), last };
  };
  app.post('/api/my/vehicles', need('kunde'), h((req) => {
    const v = readVehicle(req.body || {});
    if (db.prepare('SELECT COUNT(*) AS n FROM vehicles WHERE user_id = ?').get(req.user.id).n >= 50) throw bad('Höchstens 50 Fahrzeuge');
    const r = db.prepare('INSERT INTO vehicles (user_id, make, model, vehicle_type, nickname, last_cleaning_on, last_cleaning_source) VALUES (?,?,?,?,?,?,?)').run(req.user.id, v.make, v.model, v.vehicle_type, v.nickname, v.last, v.last ? 'manuell' : null);
    return { id: Number(r.lastInsertRowid) };
  }));
  app.put('/api/my/vehicles/:id', need('kunde'), h((req) => {
    const old = db.prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!old) throw notFound();
    const v = readVehicle(req.body || {});
    const src = v.last === old.last_cleaning_on ? old.last_cleaning_source : (v.last ? 'manuell' : null);
    db.prepare('UPDATE vehicles SET make = ?, model = ?, vehicle_type = ?, nickname = ?, last_cleaning_on = ?, last_cleaning_source = ? WHERE id = ?').run(v.make, v.model, v.vehicle_type, v.nickname, v.last, src, old.id);
    return { ok: true };
  }));
  app.delete('/api/my/vehicles/:id', need('kunde'), h((req) => {
    const r = db.prepare('DELETE FROM vehicles WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    if (!r.changes) throw notFound();
    return { ok: true };
  }));

  // ================= Meldungen =================
  app.post('/api/reports', need(), h((req) => {
    const b = req.body || {};
    const t = oneOf(b.target_type, { request: 1, offer: 1, company: 1 }, 'Art');
    const id = intIn(b.target_id, 'ID', 1, 1e12);
    db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?,?,?,?)').run(req.user.id, t, id, str(b.reason, 'Grund', { min: 5, max: 1000 }));
    return { ok: true };
  }));

  // ================= Verwaltung (nur Rolle admin, serverseitig geprüft) =================
  const admin = express.Router();
  admin.use(need('admin'));

  admin.get('/overview', h(() => {
    const cnt = (sql, ...a) => db.prepare(sql).get(...a).n;
    const sum = (status) => db.prepare('SELECT COALESCE(SUM(amount_cents + vat_cents),0) AS s, COUNT(*) AS n FROM commissions WHERE status = ?').get(status);
    const out = {};
    for (const s of Object.keys(C.COMMISSION_STATUS)) out[s] = sum(s);
    return {
      requests_open: cnt("SELECT COUNT(*) AS n FROM requests WHERE status = 'offen'"),
      orders_total: cnt('SELECT COUNT(*) AS n FROM orders'),
      disputes: cnt("SELECT COUNT(*) AS n FROM orders WHERE status = 'klaerung'"),
      reports_open: cnt("SELECT COUNT(*) AS n FROM reports WHERE status = 'offen'"),
      companies: cnt('SELECT COUNT(*) AS n FROM companies'),
      commissions: out,
      payments_received_cents: db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS s FROM payments').get().s,
      geo_available: geoAvailable(),
    };
  }));

  admin.get('/requests', h(() => ({ requests: db.prepare('SELECT r.*, u.email AS customer_email FROM requests r JOIN users u ON u.id = r.customer_id ORDER BY r.id DESC LIMIT 500').all().map((r) => ({ ...r, display_status: displayStatus(r) })) })));
  admin.post('/requests/:id/hide', h((req) => {
    const r = getRequest(req.params.id); if (!r) throw notFound();
    db.prepare('UPDATE requests SET hidden = ? WHERE id = ?').run(truthy((req.body || {}).hidden) ? 1 : 0, r.id);
    audit(req.user.id, 'hide', 'request', r.id, String((req.body || {}).hidden));
    return { ok: true };
  }));

  admin.get('/companies', h(() => ({ companies: db.prepare('SELECT c.*, u.email AS login_email, u.locked FROM companies c JOIN users u ON u.id = c.user_id ORDER BY c.id DESC').all().map((c) => ({
    ...c, services: JSON.parse(c.services), complete: profileComplete(c),
    files: db.prepare("SELECT id, purpose, label, mime, created_at FROM files WHERE company_id = ? AND purpose = 'proof'").all(c.id),
    verifications: db.prepare('SELECT v.*, u.email AS checked_by_email FROM verifications v JOIN users u ON u.id = v.checked_by WHERE v.company_id = ? ORDER BY v.id').all(c.id),
  })) })));
  admin.post('/companies/:id/verify', h((req) => {
    const c = companyById(Number(req.params.id)); if (!c) throw notFound();
    const b = req.body || {};
    const kind = oneOf(b.kind, { gewerbe: 1, versicherung: 1, sonstiges: 1 }, 'Nachweisart');
    const note = str(b.note, 'Prüfvermerk (was wurde wie geprüft?)', { min: 10, max: 1000 });
    let fileId = null;
    if (b.file_id) {
      const f = db.prepare("SELECT id FROM files WHERE id = ? AND company_id = ? AND purpose = 'proof'").get(String(b.file_id), c.id);
      if (!f) throw bad('Nachweisdatei nicht gefunden'); fileId = f.id;
    }
    const valid = b.valid_until ? str(b.valid_until, 'Gültig bis', { max: 10 }) : null;
    if (valid && !/^\d{4}-\d{2}-\d{2}$/.test(valid)) throw bad('Gültig bis: Datum im Format JJJJ-MM-TT');
    db.prepare('INSERT INTO verifications (company_id, kind, note, file_id, valid_until, checked_by) VALUES (?,?,?,?,?,?)').run(c.id, kind, note, fileId, valid, req.user.id);
    audit(req.user.id, 'verify', 'company', c.id, kind);
    return { ok: true };
  }));
  admin.post('/verifications/:id/revoke', h((req) => {
    db.prepare("UPDATE verifications SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").run(Number(req.params.id));
    audit(req.user.id, 'revoke', 'verification', Number(req.params.id));
    return { ok: true };
  }));
  admin.post('/companies/:id/lock', h((req) => {
    const c = companyById(Number(req.params.id)); if (!c) throw notFound();
    const locked = truthy((req.body || {}).locked) ? 1 : 0;
    db.prepare('UPDATE users SET locked = ? WHERE id = ?').run(locked, c.user_id);
    if (locked) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(c.user_id);
    audit(req.user.id, locked ? 'lock' : 'unlock', 'company', c.id);
    return { ok: true };
  }));

  admin.get('/reports', h(() => ({ reports: db.prepare('SELECT rp.*, u.email AS reporter_email FROM reports rp JOIN users u ON u.id = rp.reporter_id ORDER BY rp.status, rp.id DESC').all() })));
  admin.post('/reports/:id/resolve', h((req) => {
    const rp = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(req.params.id)); if (!rp) throw notFound();
    const b = req.body || {};
    db.tx(() => {
      db.prepare("UPDATE reports SET status = 'erledigt', admin_note = ? WHERE id = ?").run(str(b.note, 'Vermerk', { max: 1000, required: false }), rp.id);
      if (truthy(b.hide_target) && rp.target_type === 'request') db.prepare('UPDATE requests SET hidden = 1 WHERE id = ?').run(rp.target_id);
      if (truthy(b.hide_target) && rp.target_type === 'offer') db.prepare("UPDATE offers SET status = 'zurueckgezogen' WHERE id = ? AND status = 'offen'").run(rp.target_id);
    });
    audit(req.user.id, 'resolve', 'report', rp.id);
    return { ok: true };
  }));

  admin.get('/orders', h((req) => {
    const st = req.query.status && C.REQUEST_STATUS[req.query.status] ? String(req.query.status) : null;
    const rows = db.prepare(`SELECT o.*, c.name AS company_name, u.email AS customer_email, r.service FROM orders o JOIN companies c ON c.id = o.company_id JOIN users u ON u.id = o.customer_id JOIN requests r ON r.id = o.request_id ${st ? 'WHERE o.status = ?' : ''} ORDER BY o.id DESC`).all(...(st ? [st] : []));
    return { orders: rows.map((o) => ({ ...o, commission: commissionOf(o.id) })) };
  }));

  // Streitfall manuell klären
  admin.post('/orders/:id/resolve', h((req) => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id)); if (!o) throw notFound();
    const b = req.body || {};
    const action = oneOf(b.action, { bestaetigen: 1, stornieren: 1 }, 'Aktion');
    const note = str(b.note, 'Klärungsvermerk', { min: 5, max: 1000 });
    if (!['klaerung', 'fertig_gemeldet', 'vergeben', 'in_bearbeitung'].includes(o.status)) throw new HttpError(409, 'Auftrag ist nicht in Klärung');
    db.tx(() => {
      if (action === 'stornieren') {
        setOrderStatus(o, 'storniert', { cancelled_at: new Date().toISOString(), cancelled_by: req.user.id, cancel_reason: 'Verwaltung: ' + note });
        setCommission(o.id, 'storniert', note);
        const k = commissionOf(o.id);
        if (k && ['rechnung_erstellt', 'bezahlt'].includes(k.status)) db.prepare("UPDATE commissions SET status = 'klaerung', note = ? WHERE id = ?").run('Storniert nach Rechnungsstellung – Gutschrift/Erstattung prüfen. ' + note, k.id);
      } else {
        // bestätigter, tatsächlich bezahlter Bruttobetrag (beide Seiten oder Nachweis)
        const paid = parseEuroToCentsSafe(b.paid_amount);
        const k = commissionOf(o.id);
        if (k && ['rechnung_erstellt', 'bezahlt'].includes(k.status)) throw new HttpError(409, 'Provision ist bereits abgerechnet. Änderungen nur per Gutschrift.');
        const calc = calcOffer(paid, o.provider_vat_bp, o.commission_bp, o.agency_vat_bp);
        setOrderStatus(o, 'bestaetigt', { provider_paid_cents: paid, customer_paid_cents: paid, dispute_reason: (o.dispute_reason || '') + ' | Geklärt: ' + note });
        db.prepare("UPDATE commissions SET net_cents = ?, amount_cents = ?, vat_cents = ?, status = 'abrechenbar', note = ?, updated_at = datetime('now') WHERE order_id = ?").run(calc.netCents, calc.commissionCents, calc.commissionVatCents, 'Nach Klärung: ' + note, o.id);
        markCleaned(o);
      }
    });
    audit(req.user.id, 'resolve_' + action, 'order', o.id, note);
    return { ok: true };
  }));

  // Rückerstattung an den Kunden erfassen → Provision anpassen
  admin.post('/orders/:id/refund', h((req) => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id)); if (!o) throw notFound();
    const b = req.body || {};
    const refund = parseEuroToCentsSafe(b.amount);
    const note = str(b.note, 'Vermerk', { min: 3, max: 500 });
    if (refund <= 0 || o.refund_cents + refund > o.gross_cents) throw bad('Erstattung muss größer 0 und darf nicht höher als der Auftragswert sein');
    db.tx(() => {
      const totalRefund = o.refund_cents + refund;
      db.prepare("UPDATE orders SET refund_cents = ?, updated_at = datetime('now') WHERE id = ?").run(totalRefund, o.id);
      const k = commissionOf(o.id);
      if (!k || k.status === 'storniert') return;
      if (['rechnung_erstellt', 'bezahlt'].includes(k.status)) {
        db.prepare("UPDATE commissions SET status = 'klaerung', note = ?, updated_at = datetime('now') WHERE id = ?").run(`Rückerstattung ${formatCents(refund)} nach Rechnungsstellung – Gutschrift erstellen. ${note}`, k.id);
        return;
      }
      if (totalRefund === o.gross_cents) {
        db.prepare("UPDATE commissions SET status = 'storniert', amount_cents = 0, vat_cents = 0, net_cents = 0, note = ?, updated_at = datetime('now') WHERE id = ?").run('Vollständig erstattet. ' + note, k.id);
        setOrderStatus(o, 'storniert', { cancel_reason: 'Vollständige Rückerstattung', cancelled_at: new Date().toISOString(), cancelled_by: req.user.id });
      } else {
        const calc = calcOffer(o.gross_cents - totalRefund, o.provider_vat_bp, o.commission_bp, o.agency_vat_bp);
        db.prepare("UPDATE commissions SET net_cents = ?, amount_cents = ?, vat_cents = ?, note = ?, updated_at = datetime('now') WHERE id = ?").run(calc.netCents, calc.commissionCents, calc.commissionVatCents, `Teilerstattung ${formatCents(refund)}. ${note}`, k.id);
      }
    });
    audit(req.user.id, 'refund', 'order', o.id, formatCents(refund));
    return { ok: true };
  }));

  admin.get('/commissions', h((req) => {
    const st = req.query.status && C.COMMISSION_STATUS[req.query.status] ? String(req.query.status) : null;
    const rows = db.prepare(`SELECT k.*, c.name AS company_name, o.status AS order_status, o.gross_cents,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments p WHERE p.commission_id = k.id) AS paid_cents
      FROM commissions k JOIN companies c ON c.id = k.company_id JOIN orders o ON o.id = k.order_id ${st ? 'WHERE k.status = ?' : ''} ORDER BY k.id DESC`).all(...(st ? [st] : []));
    return { commissions: rows };
  }));

  // Rechnungsnummer vergeben – nur für abrechenbare Provisionen, nie doppelt
  admin.post('/commissions/:id/invoice', h((req) => {
    const out = db.tx(() => {
      const k = db.prepare('SELECT * FROM commissions WHERE id = ?').get(Number(req.params.id));
      if (!k) throw notFound();
      if (k.status !== 'abrechenbar') throw new HttpError(409, 'Rechnung nur für abrechenbare Provisionen (Durchführung und Zahlung beidseitig bestätigt)');
      if (k.invoice_number) throw new HttpError(409, 'Für diese Provision existiert bereits eine Rechnung');
      const n = Number(db.setting('invoice_counter')) + 1;
      db.prepare("UPDATE settings SET value = ? WHERE key = 'invoice_counter'").run(String(n));
      const number = `AMP-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`;
      db.prepare("UPDATE commissions SET status = 'rechnung_erstellt', invoice_number = ?, invoiced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(number, k.id);
      return number;
    });
    audit(req.user.id, 'invoice', 'commission', Number(req.params.id), out);
    return { invoice_number: out };
  }));

  // Tatsächlichen Zahlungseingang erfassen (manuell aus dem Kontoauszug)
  admin.post('/commissions/:id/payment', h((req) => {
    const b = req.body || {};
    db.tx(() => {
      const k = db.prepare('SELECT * FROM commissions WHERE id = ?').get(Number(req.params.id));
      if (!k) throw notFound();
      if (!['rechnung_erstellt', 'klaerung'].includes(k.status) || !k.invoice_number) throw new HttpError(409, 'Zahlungseingänge nur für Provisionen mit Rechnung');
      const amount = parseEuroToCentsSafe(b.amount);
      if (amount <= 0) throw bad('Betrag muss größer 0 sein');
      const day = str(b.received_on, 'Eingangsdatum', { max: 10 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw bad('Eingangsdatum im Format JJJJ-MM-TT');
      db.prepare('INSERT INTO payments (commission_id, amount_cents, received_on, reference, recorded_by) VALUES (?,?,?,?,?)').run(k.id, amount, day, str(b.reference, 'Verwendungszweck', { max: 200, required: false }), req.user.id);
      const paid = db.prepare('SELECT SUM(amount_cents) AS s FROM payments WHERE commission_id = ?').get(k.id).s;
      if (k.status === 'rechnung_erstellt' && paid >= k.amount_cents + k.vat_cents) {
        db.prepare("UPDATE commissions SET status = 'bezahlt', updated_at = datetime('now') WHERE id = ?").run(k.id);
        const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(k.order_id);
        if (o.status === 'bestaetigt') setOrderStatus(o, 'abgeschlossen');
      }
    });
    audit(req.user.id, 'payment', 'commission', Number(req.params.id), String(b.amount));
    return { ok: true };
  }));

  admin.post('/commissions/:id/status', h((req) => {
    const b = req.body || {};
    const status = oneOf(b.status, { klaerung: 1, abrechenbar: 1, storniert: 1 }, 'Status');
    const note = str(b.note, 'Vermerk', { min: 3, max: 500 });
    const k = db.prepare('SELECT * FROM commissions WHERE id = ?').get(Number(req.params.id)); if (!k) throw notFound();
    const o = db.prepare('SELECT status FROM orders WHERE id = ?').get(k.order_id);
    if (status === 'abrechenbar' && (k.invoice_number || !['bestaetigt', 'abgeschlossen'].includes(o.status))) throw new HttpError(409, 'Abrechenbar nur bei bestätigtem Auftrag ohne bestehende Rechnung');
    if (status === 'storniert' && k.invoice_number) throw new HttpError(409, 'Bereits in Rechnung gestellt – bitte Gutschrift außerhalb erstellen und als Klärung vermerken');
    db.prepare("UPDATE commissions SET status = ?, note = ?, updated_at = datetime('now') WHERE id = ?").run(status, note, k.id);
    audit(req.user.id, 'commission_status', 'commission', k.id, status + ': ' + note);
    return { ok: true };
  }));

  admin.get('/settings', h(() => ({ commission_bp: Number(db.setting('commission_bp')), agency_vat_bp: Number(db.setting('agency_vat_bp')) })));
  admin.put('/settings', h((req) => {
    const b = req.body || {};
    const pct = String(b.commission_percent ?? '').replace(',', '.');
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(pct)) throw bad('Provisionssatz in Prozent, z. B. 15 oder 12,5');
    const bp = Math.round(Number(pct) * 100);
    if (bp < 0 || bp > 5000) throw bad('Provisionssatz zwischen 0 und 50 %');
    const vat = intIn(Number(b.agency_vat_bp), 'USt auf Provision', 0, 1900);
    if (![0, 1900].includes(vat)) throw bad('USt auf Provision: 19 % oder 0 % (Kleinunternehmer)');
    const old = db.setting('commission_bp');
    db.prepare("UPDATE settings SET value = ? WHERE key = 'commission_bp'").run(String(bp));
    db.prepare("UPDATE settings SET value = ? WHERE key = 'agency_vat_bp'").run(String(vat));
    audit(req.user.id, 'settings', 'settings', null, `commission_bp ${old} → ${bp}, agency_vat_bp ${vat}`);
    return { ok: true, note: 'Gilt nur für künftig abgegebene Angebote. Bestehende Angebote und Aufträge behalten ihren gespeicherten Satz.' };
  }));

  admin.get('/audit', h(() => ({ audit: db.prepare('SELECT a.*, u.email FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300').all() })));

  admin.get('/export/commissions.csv', (req, res, next) => {
    try {
      const rows = db.prepare(`SELECT k.id, k.invoice_number, k.invoiced_at, k.status, c.name AS betrieb, c.street, c.plz, c.city, k.order_id, k.net_cents, k.rate_bp, k.amount_cents, k.vat_bp, k.vat_cents,
        (SELECT COALESCE(SUM(amount_cents),0) FROM payments p WHERE p.commission_id = k.id) AS paid_cents, k.note
        FROM commissions k JOIN companies c ON c.id = k.company_id ORDER BY k.id`).all();
      const eur = (c) => (c / 100).toFixed(2).replace('.', ',');
      const esc = (v) => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
      const head = ['Provision-ID', 'Rechnungsnummer', 'Rechnungsdatum', 'Status', 'Betrieb', 'Straße', 'PLZ', 'Ort', 'Auftrag', 'Netto-Auftragswert €', 'Satz %', 'Provision netto €', 'USt %', 'USt €', 'Provision brutto €', 'Zahlungseingang €', 'Offen €', 'Vermerk'];
      const lines = rows.map((r) => [r.id, r.invoice_number, r.invoiced_at, C.COMMISSION_STATUS[r.status], r.betrieb, r.street, r.plz, r.city, r.order_id, eur(r.net_cents), (r.rate_bp / 100).toFixed(2).replace('.', ','), eur(r.amount_cents), (r.vat_bp / 100).toFixed(0), eur(r.vat_cents), eur(r.amount_cents + r.vat_cents), eur(r.paid_cents), eur(['storniert', 'voraussichtlich'].includes(r.status) ? 0 : r.amount_cents + r.vat_cents - r.paid_cents), r.note].map(esc).join(';'));
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="provisionen.csv"' });
      res.send('﻿' + [head.map(esc).join(';'), ...lines].join('\r\n'));
    } catch (e) { next(e); }
  });

  app.use('/api/admin', admin);

  // ---------- Frontend ----------
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: '1h' }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannte Schnittstelle' }));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  // ---------- Fehler ----------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Datei ist größer als 8 MB' : err.code === 'LIMIT_FILE_COUNT' ? 'Höchstens 8 Dateien auf einmal' : 'Upload fehlgeschlagen';
      return res.status(400).json({ error: msg });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültige Daten' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Daten zu groß' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Interner Fehler. Bitte später erneut versuchen.' : err.message });
  });

  app.locals.db = db;
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const app = createApp({ dataDir: process.env.DATA_DIR, secureCookies: process.env.SECURE_COOKIES === '1' });
  app.listen(port, () => console.log(`MHL Agentur läuft auf http://localhost:${port}`));
}

module.exports = { createApp };
