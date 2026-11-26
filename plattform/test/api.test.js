'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { createApp } = require('../src/server');
const { calcOffer, parseEuroToCents } = require('../src/money');
const { hashPassword } = require('../src/auth');

let server, base, dataDir, db;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mhl-test-'));
  const app = createApp({ dataDir, authLimit: 1000 });
  db = app.locals.db;
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  db.prepare("INSERT INTO users (email, pw_hash, name, role) VALUES ('admin@test.de', ?, 'Admin', 'admin')").run(hashPassword('admin-passwort-123'));
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  const call = async (method, url, body, form) => {
    const headers = { 'X-Requested-With': 'fetch' };
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* csv etc. */ }
    return { status: res.status, body: json, text };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b ?? {}), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u), form: (u, f) => call('POST', u, undefined, f) };
}

let n = 0;
async function register(role, extra = {}) {
  const c = client();
  const r = await c.post('/api/auth/register', { role, email: `u${++n}@test.de`, password: 'sicheres-passwort', name: `Person ${n}`, phone: '0170 1234567', accept_terms: true, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}
async function admin() { const c = client(); const r = await c.post('/api/auth/login', { email: 'admin@test.de', password: 'admin-passwort-123' }); assert.equal(r.status, 200); return c; }

const REQ = {
  area: 'mobil', service: 'innen_intensiv', location_pref: 'mobil', customer_type: 'privat', vehicle_make: 'VW', vehicle_model: 'Touran', vehicle_type: 'van',
  plz: '61130', city: 'Nidderau', address_private: 'Geheimstraße 7', timeframe: 'zwei_wochen', recurrence: 'einmalig',
  description: 'Hundehaare im Kofferraum und Flecken auf den Sitzen.', budget_none: true, mobile_parking: 'ja', mobile_power: 'nein', mobile_water: 'unsicher',
};
const PAINT = { ...REQ, area: 'lack', service: 'lack', location_pref: 'beides', damage_part: 'stossfaenger_hinten', damage_type: 'kratzer', damage_size: 'unsicher', description: 'Kratzer am hinteren Stoßfänger nach dem Einparken.' };

async function provider(vat_mode = 'regel', extra = {}) {
  const c = await register('betrieb');
  const r = await c.put('/api/my/company', { name: 'Glanz GmbH', contact_person: 'Max Muster', street: 'Werkstraße 1', plz: '61130', city: 'Nidderau', email: 'info@glanz.test', phone: '06187 1111', services: ['innen_intensiv', 'lack', 'komplett'], mobile: true, mobile_radius_km: 30, workshop: true, vat_mode, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}
const OFFER = { location: 'mobil', scope: 'Innenraum komplett saugen, Tierhaare entfernen, Sitze shampoonieren.', appointment: 'KW 49, Dienstag', duration: 'ca. 4 Stunden', price: '119,00', travel_included: true };

// ---------------------------------------------------------------------------
test('Provisionsrechnung in Cent: Beispiel aus der Vorgabe und Kleinunternehmer', () => {
  const k = calcOffer(11900, 1900, 1500, 1900);
  assert.equal(k.netCents, 10000); assert.equal(k.commissionCents, 1500); assert.equal(k.commissionVatCents, 285); assert.equal(k.providerKeepsNetCents, 8500);
  const klein = calcOffer(11900, 0, 1500, 1900);
  assert.equal(klein.netCents, 11900); assert.equal(klein.commissionCents, 1785);
  assert.equal(calcOffer(9999, 1900, 1500, 0).netCents, 8403); // 99,99 / 1,19 = 84,025 → 84,03
  assert.equal(parseEuroToCents('119,5'), 11950); assert.equal(parseEuroToCents('1.5'), 150);
  assert.throws(() => parseEuroToCents('12,345')); assert.throws(() => parseEuroToCents('-5'));
});

test('Niemand kann sich selbst zum Administrator machen; Rollen werden serverseitig geprüft', async () => {
  const c = client();
  const r = await c.post('/api/auth/register', { role: 'admin', email: 'boese@test.de', password: 'sicheres-passwort', name: 'X', accept_terms: true });
  assert.equal(r.status, 400);
  const k = await register('kunde');
  assert.equal((await k.get('/api/admin/overview')).status, 403);
  assert.equal((await k.put('/api/admin/settings', { commission_percent: '1', agency_vat_bp: 0 })).status, 403);
  const anon = client();
  assert.equal((await anon.get('/api/admin/commissions')).status, 401);
  // Betrieb darf keine Kundenanfrage anlegen
  const b = await provider();
  assert.equal((await b.post('/api/requests', REQ)).status, 403);
});

test('Schreibende Aufrufe ohne Sicherheits-Header werden abgelehnt (CSRF)', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('Gesamter Ablauf: Anfrage → Angebot → Annahme → Bestätigungen → Rechnung → Zahlung', async () => {
  const kunde = await register('kunde');
  const betrieb = await provider();
  const fremd = await provider();
  const fremdKunde = await register('kunde');

  // Validierung
  assert.equal((await kunde.post('/api/requests', { ...REQ, plz: '123' })).status, 400);
  assert.equal((await kunde.post('/api/requests', { ...REQ, mobile_power: undefined })).status, 400);
  const { body: { id: rid } } = await kunde.post('/api/requests', REQ);

  // Öffentliche Übersicht enthält keine privaten Daten
  const anonList = await client().get('/api/jobs');
  const txt = JSON.stringify(anonList.body);
  assert.ok(anonList.body.jobs.some((j) => j.id === rid));
  for (const secret of ['Geheimstraße', '@test.de', '0170', 'Person']) assert.ok(!txt.includes(secret), 'öffentlich sichtbar: ' + secret);
  assert.equal(anonList.body.jobs.find((j) => j.id === rid).area_approx, '611xx');
  assert.equal((await client().get('/api/requests/' + rid)).status, 401);
  assert.equal((await fremdKunde.get('/api/requests/' + rid)).status, 404);
  const detail = await betrieb.get('/api/requests/' + rid);
  assert.equal(detail.status, 200); assert.ok(!JSON.stringify(detail.body).includes('Geheimstraße'));

  // Angebot: Vorschau und Speicherung serverseitig
  const pv = await betrieb.post('/api/offers/preview', { price: '119,00' });
  assert.equal(pv.body.calc.commissionCents, 1500);
  assert.equal((await betrieb.post(`/api/requests/${rid}/offers`, { ...OFFER, location: 'betrieb' })).status, 400); // Kunde will mobil
  const off = await betrieb.post(`/api/requests/${rid}/offers`, OFFER);
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.equal((await betrieb.post(`/api/requests/${rid}/offers`, OFFER)).status, 409); // kein zweites offenes Angebot
  const off2 = await fremd.post(`/api/requests/${rid}/offers`, { ...OFFER, price: '99' });
  assert.equal(off2.status, 200);

  // Kunde sieht Angebote, aber keine Provisionsdetails und keine Betriebs-Kontaktdaten
  const view = await kunde.get('/api/requests/' + rid);
  assert.equal(view.body.offers.length, 2);
  assert.equal(view.body.offers[0].commission_cents, undefined);
  assert.ok(!JSON.stringify(view.body).includes('06187'));

  // Annahme: Bestätigungen nötig, danach kein zweiter Auftrag
  assert.equal((await kunde.post(`/api/offers/${off.body.id}/accept`, {})).status, 400);
  assert.equal((await fremdKunde.post(`/api/offers/${off.body.id}/accept`, { accept_terms: true, acknowledge_intermediary: true })).status, 404);
  const acc = await kunde.post(`/api/offers/${off.body.id}/accept`, { accept_terms: true, acknowledge_intermediary: true });
  assert.equal(acc.status, 200);
  const oid = acc.body.order_id;
  assert.equal((await kunde.post(`/api/offers/${off2.body.id}/accept`, { accept_terms: true, acknowledge_intermediary: true })).status, 409);
  assert.equal((await kunde.put('/api/requests/' + rid, REQ)).status, 409); // nicht mehr bearbeitbar
  assert.equal((await kunde.post(`/api/requests/${rid}/withdraw`)).status, 409);

  // Kontaktdaten nur für Beteiligte
  const ob = await betrieb.get('/api/orders/' + oid);
  assert.equal(ob.body.customer_contact.address, 'Geheimstraße 7');
  assert.equal((await fremd.get('/api/orders/' + oid)).status, 404);
  assert.equal((await fremdKunde.get('/api/orders/' + oid)).status, 404);
  assert.equal(ob.body.commission.status, 'voraussichtlich');

  // Kunde kann nicht vor der Fertigmeldung bestätigen; Betrieb allein bestätigt keine Kundenzahlung
  assert.equal((await kunde.post(`/api/orders/${oid}/customer-confirm`, { work_done: true, amount: '119' })).status, 409);
  assert.equal((await betrieb.post(`/api/orders/${oid}/customer-confirm`, { work_done: true, amount: '119' })).status, 403);
  await betrieb.post(`/api/orders/${oid}/start`);
  await betrieb.post(`/api/orders/${oid}/report-done`, { payment_received: true, amount: '119,00' });
  let o = (await betrieb.get('/api/orders/' + oid)).body;
  assert.equal(o.order.status, 'fertig_gemeldet');
  assert.equal(o.commission.status, 'voraussichtlich'); // eine Seite reicht nicht

  const adm = await admin();
  const inv0 = await adm.post(`/api/admin/commissions/${o.commission.id}/invoice`);
  assert.equal(inv0.status, 409); // noch nicht abrechenbar

  await kunde.post(`/api/orders/${oid}/customer-confirm`, { work_done: true, amount: '119,00' });
  o = (await betrieb.get('/api/orders/' + oid)).body;
  assert.equal(o.order.status, 'bestaetigt');
  assert.equal(o.commission.status, 'abrechenbar');
  assert.equal(o.commission.amount_cents, 1500); assert.equal(o.commission.vat_cents, 285);
  assert.equal((await kunde.post(`/api/orders/${oid}/customer-confirm`, { work_done: true, amount: '119' })).status, 409);

  // Rechnung nur einmal
  const inv = await adm.post(`/api/admin/commissions/${o.commission.id}/invoice`);
  assert.equal(inv.status, 200); assert.match(inv.body.invoice_number, /^AMP-\d{4}-00001$/);
  assert.equal((await adm.post(`/api/admin/commissions/${o.commission.id}/invoice`)).status, 409);
  // Datenbank verhindert doppelte Provision je Auftrag
  assert.throws(() => db.prepare("INSERT INTO commissions (order_id, company_id, net_cents, rate_bp, amount_cents, vat_bp, vat_cents, status) VALUES (?,?,1,1,1,1,1,'abrechenbar')").run(oid, o.order.company_id));

  // Teilzahlung → noch nicht bezahlt; Rest → bezahlt, Auftrag abgeschlossen
  await adm.post(`/api/admin/commissions/${o.commission.id}/payment`, { amount: '10,00', received_on: '2026-12-01', reference: 'x' });
  let ks = (await adm.get('/api/admin/commissions')).body.commissions.find((k) => k.id === o.commission.id);
  assert.equal(ks.status, 'rechnung_erstellt'); assert.equal(ks.paid_cents, 1000);
  await adm.post(`/api/admin/commissions/${o.commission.id}/payment`, { amount: '7,85', received_on: '2026-12-02' });
  ks = (await adm.get('/api/admin/commissions')).body.commissions.find((k) => k.id === o.commission.id);
  assert.equal(ks.status, 'bezahlt');
  assert.equal((await kunde.get('/api/orders/' + oid)).body.order.status, 'abgeschlossen');
  const ov = (await adm.get('/api/admin/overview')).body;
  assert.equal(ov.payments_received_cents, 1785);

  const csv = await adm.get('/api/admin/export/commissions.csv');
  assert.match(csv.text, /AMP-\d{4}-00001/); assert.match(csv.text, /17,85/);
});

test('Stornierung: keine Provision, keine Rechnung möglich', async () => {
  const kunde = await register('kunde'); const betrieb = await provider();
  const { body: { id: rid } } = await kunde.post('/api/requests', REQ);
  const off = await betrieb.post(`/api/requests/${rid}/offers`, OFFER);
  const { body: { order_id } } = await kunde.post(`/api/offers/${off.body.id}/accept`, { accept_terms: true, acknowledge_intermediary: true });
  assert.equal((await kunde.post(`/api/orders/${order_id}/cancel`, { reason: '' })).status, 400);
  assert.equal((await kunde.post(`/api/orders/${order_id}/cancel`, { reason: 'Termin passt nicht mehr' })).status, 200);
  const adm = await admin();
  const k = (await adm.get('/api/admin/commissions')).body.commissions.find((x) => x.order_id === order_id);
  assert.equal(k.status, 'storniert');
  assert.equal((await adm.post(`/api/admin/commissions/${k.id}/invoice`)).status, 409);
  assert.equal((await betrieb.post(`/api/orders/${order_id}/report-done`, {})).status, 409);
});

test('Abweichende Zahlungsangaben → Klärung; Verwaltung klärt manuell; Rückerstattung passt Provision an', async () => {
  const kunde = await register('kunde'); const betrieb = await provider('klein');
  const { body: { id: rid } } = await kunde.post('/api/requests', REQ);
  const off = await betrieb.post(`/api/requests/${rid}/offers`, { ...OFFER, price: '200' });
  assert.equal(off.body.calc.netCents, 20000); // Kleinunternehmer: netto = Endpreis
  const { body: { order_id } } = await kunde.post(`/api/offers/${off.body.id}/accept`, { accept_terms: true, acknowledge_intermediary: true });
  await betrieb.post(`/api/orders/${order_id}/report-done`, { payment_received: true, amount: '200' });
  await kunde.post(`/api/orders/${order_id}/customer-confirm`, { work_done: true, amount: '150' });
  const adm = await admin();
  let o = (await adm.get('/api/admin/orders')).body.orders.find((x) => x.id === order_id);
  assert.equal(o.status, 'klaerung'); assert.equal(o.commission.status, 'klaerung');
  assert.equal((await adm.post(`/api/admin/orders/${order_id}/resolve`, { action: 'bestaetigen', paid_amount: '200', note: 'Kontoauszug des Betriebs geprüft' })).status, 200);
  o = (await adm.get('/api/admin/orders')).body.orders.find((x) => x.id === order_id);
  assert.equal(o.status, 'bestaetigt'); assert.equal(o.commission.status, 'abrechenbar'); assert.equal(o.commission.amount_cents, 3000);
  await adm.post(`/api/admin/orders/${order_id}/refund`, { amount: '50', note: 'Teilerstattung wegen Restfleck' });
  o = (await adm.get('/api/admin/orders')).body.orders.find((x) => x.id === order_id);
  assert.equal(o.commission.amount_cents, 2250); // 15 % von 150 €
  await adm.post(`/api/admin/orders/${order_id}/refund`, { amount: '150', note: 'Rest erstattet' });
  o = (await adm.get('/api/admin/orders')).body.orders.find((x) => x.id === order_id);
  assert.equal(o.commission.status, 'storniert'); assert.equal(o.status, 'storniert');
});

test('Lackschaden mobil nur mit Machbarkeitsbestätigung des Fachbetriebs', async () => {
  const kunde = await register('kunde'); const betrieb = await provider();
  assert.equal((await kunde.post('/api/requests', { ...PAINT, damage_part: undefined })).status, 400);
  const { body: { id: rid } } = await kunde.post('/api/requests', PAINT);
  const lackOffer = { ...OFFER, scope: 'Smart Repair des Kratzers, Spachteln, Lackieren und Polieren.' };
  assert.equal((await betrieb.post(`/api/requests/${rid}/offers`, lackOffer)).status, 400);
  assert.equal((await betrieb.post(`/api/requests/${rid}/offers`, { ...lackOffer, feasibility_confirmed: true })).status, 200);
});

test('Provisionssatz-Änderung gilt nur für künftige Angebote', async () => {
  const kunde = await register('kunde'); const b1 = await provider(); const b2 = await provider();
  const { body: { id: rid } } = await kunde.post('/api/requests', REQ);
  const o1 = await b1.post(`/api/requests/${rid}/offers`, OFFER);
  const adm = await admin();
  assert.equal((await adm.put('/api/admin/settings', { commission_percent: '10', agency_vat_bp: 1900 })).status, 200);
  const o2 = await b2.post(`/api/requests/${rid}/offers`, OFFER);
  assert.equal(o1.body.calc.commissionBp, 1500); assert.equal(o2.body.calc.commissionBp, 1000);
  const { body: { order_id } } = await kunde.post(`/api/offers/${o1.body.id}/accept`, { accept_terms: true, acknowledge_intermediary: true });
  const ord = (await b1.get('/api/orders/' + order_id)).body;
  assert.equal(ord.order.commission_bp, 1500); assert.equal(ord.commission.rate_bp, 1500);
  await adm.put('/api/admin/settings', { commission_percent: '15', agency_vat_bp: 1900 });
});

// minimales PNG mit Text-Metadaten
function pngWithText() {
  const crc = (buf) => { let c, crcv = 0xffffffff; for (const b of buf) { c = (crcv ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcv = (crcv >>> 8) ^ c; } return (crcv ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('GPS\0 50.1,8.9')), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
}

test('Foto-Uploads: Typprüfung, Metadaten entfernt, Zugriff nur für Berechtigte', async () => {
  const kunde = await register('kunde'); const betrieb = await provider(); const fremdKunde = await register('kunde');
  const { body: { id: rid } } = await kunde.post('/api/requests', REQ);
  const fake = new FormData(); fake.append('label', 'allgemein'); fake.append('photos', new Blob(['<script>alert(1)</script>'], { type: 'image/jpeg' }), 'boese.jpg');
  const r1 = await kunde.form(`/api/requests/${rid}/photos`, fake);
  assert.equal(r1.status, 400); assert.match(r1.body.error, /JPG oder PNG/);
  const pdf = new FormData(); pdf.append('photos', new Blob(['%PDF-1.4 ...']), 'x.pdf');
  assert.equal((await kunde.form(`/api/requests/${rid}/photos`, pdf)).status, 400);

  const ok = new FormData(); ok.append('label', 'detail'); ok.append('photos', new Blob([pngWithText()], { type: 'image/png' }), 'foto.png');
  const r2 = await kunde.form(`/api/requests/${rid}/photos`, ok);
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  const fid = r2.body.ids[0];
  const stored = fs.readFileSync(path.join(dataDir, 'uploads', fid));
  assert.ok(!stored.includes(Buffer.from('GPS')), 'Metadaten wurden nicht entfernt');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', fid)));

  // fremde Uploads auf fremde Anfrage verboten
  const ok2 = new FormData(); ok2.append('photos', new Blob([pngWithText()]), 'a.png');
  assert.equal((await fremdKunde.form(`/api/requests/${rid}/photos`, ok2)).status, 404);

  assert.equal((await client().get('/api/files/' + fid)).status, 404);
  assert.equal((await fremdKunde.get('/api/files/' + fid)).status, 404);
  assert.equal((await betrieb.get('/api/files/' + fid)).status, 200);
  assert.equal((await kunde.get('/api/files/' + fid)).status, 200);
  assert.equal((await fremdKunde.del('/api/files/' + fid)).status, 404);
  const trav = await client().get('/api/files/..%2F..%2Fplattform.sqlite');
  assert.equal(trav.status, 404);
  assert.ok(!(await client().get('/plattform.sqlite')).text.startsWith('SQLite'));

  // Nachweise (PDF) nur für Betrieb und Verwaltung
  const proof = new FormData(); proof.append('purpose', 'proof'); proof.append('label', 'Gewerbeanmeldung'); proof.append('files', new Blob(['%PDF-1.4 test']), 'g.pdf');
  const pr = await betrieb.form('/api/my/company/files', proof);
  assert.equal(pr.status, 200, JSON.stringify(pr.body));
  assert.equal((await kunde.get('/api/files/' + pr.body.ids[0])).status, 404);
  assert.equal((await (await admin()).get('/api/files/' + pr.body.ids[0])).status, 200);
});

test('Prüfsiegel erst nach dokumentierter Prüfung durch die Verwaltung', async () => {
  const b = await provider();
  const me = (await b.get('/api/my/company')).body.company;
  assert.equal((await client().get('/api/companies/' + me.id)).body.company.verified.length, 0);
  // Betrieb kann sich nicht selbst prüfen
  assert.equal((await b.post(`/api/admin/companies/${me.id}/verify`, { kind: 'gewerbe', note: 'selbst geprüft!!!' })).status, 403);
  const adm = await admin();
  assert.equal((await adm.post(`/api/admin/companies/${me.id}/verify`, { kind: 'gewerbe', note: 'kurz' })).status, 400);
  assert.equal((await adm.post(`/api/admin/companies/${me.id}/verify`, { kind: 'gewerbe', note: 'Gewerbeanmeldung im Original gesehen, Stand 11/2026' })).status, 200);
  const pub = (await client().get('/api/companies/' + me.id)).body.company;
  assert.equal(pub.verified.length, 1); assert.equal(pub.verified[0].kind, 'gewerbe');
  assert.equal(pub.self_declared.insurance, '');
  assert.ok(!JSON.stringify(pub).includes('06187'));
});

test('Filter, leere Ergebnisse und Entfernungen nur aus echten Geodaten', async () => {
  const kunde = await register('kunde');
  await kunde.post('/api/requests', { ...REQ, plz: '60311', city: 'Frankfurt', customer_type: 'flotte', fleet_count: 4, recurrence: 'regelmaessig', budget_none: false, budget: '300' });
  let r = await client().get('/api/jobs?service=leder');
  assert.equal(r.status, 200); assert.equal(r.body.jobs.length, 0);
  r = await client().get('/api/jobs?customer_type=flotte&recurrence=regelmaessig');
  assert.ok(r.body.jobs.length >= 1 && r.body.jobs.every((j) => j.customer_type === 'flotte'));
  r = await client().get('/api/jobs?budget_min=250');
  assert.ok(r.body.jobs.every((j) => j.budget_cents >= 25000));
  assert.equal((await client().get('/api/jobs?budget_min=abc')).status, 400);
  r = await client().get('/api/jobs?plz=60&sort=distance');
  assert.ok(r.body.jobs.every((j) => j.distance_km === null)); // keine Geodaten → keine erfundenen Entfernungen
  assert.ok(r.body.notices.length > 0);
  r = await client().get('/api/jobs?loc=betrieb');
  assert.ok(r.body.jobs.every((j) => j.location_pref !== 'mobil'));

  // mit echten (hier: Test-)Koordinaten wird gerechnet
  db.prepare("INSERT OR REPLACE INTO postcodes VALUES ('60311','Frankfurt',50.1109,8.6821),('61130','Nidderau',50.2380,8.8667)").run();
  const { body: { id } } = await kunde.post('/api/requests', { ...REQ, plz: '60311', city: 'Frankfurt' });
  r = await client().get('/api/jobs?plz=61130&radius=25&sort=distance');
  const j = r.body.jobs.find((x) => x.id === id);
  assert.ok(j && j.distance_km > 15 && j.distance_km < 25, JSON.stringify(j));
  r = await client().get('/api/jobs?plz=61130&radius=10');
  assert.ok(!r.body.jobs.some((x) => x.id === id));
});

test('Kunde kann Anfrage bearbeiten und zurückziehen, solange nichts vergeben ist', async () => {
  const kunde = await register('kunde'); const betrieb = await provider();
  const { body: { id } } = await kunde.post('/api/requests', REQ);
  const off = await betrieb.post(`/api/requests/${id}/offers`, OFFER);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await kunde.put('/api/requests/' + id, { ...REQ, description: 'Geänderte Beschreibung der Arbeiten.' })).status, 200);
  assert.equal((await kunde.get('/api/requests/' + id)).body.offers[0].request_changed_after, true);
  assert.equal((await kunde.post(`/api/requests/${id}/withdraw`)).status, 200);
  assert.equal((await betrieb.post(`/api/requests/${id}/offers`, OFFER)).status, 409);
  assert.equal((await kunde.post(`/api/offers/${off.body.id}/accept`, { accept_terms: true, acknowledge_intermediary: true })).status, 409);
  assert.ok(!(await client().get('/api/jobs')).body.jobs.some((j) => j.id === id));
});

test('Kundenprofil mit Fahrzeugen, letzte Reinigung wird nach bestätigtem Auftrag gespeichert', async () => {
  const kunde = await register('kunde'); const betrieb = await provider(); const fremd = await register('kunde');
  const v = await kunde.post('/api/my/vehicles', { make: 'BMW', model: '320d', vehicle_type: 'kombi', nickname: 'Firmenwagen', last_cleaning_on: '2026-01-10' });
  assert.equal(v.status, 200);
  assert.equal((await kunde.post('/api/my/vehicles', { make: 'X', model: 'Y', vehicle_type: 'kombi', last_cleaning_on: '2999-01-01' })).status, 400);
  assert.equal((await fremd.put('/api/my/vehicles/' + v.body.id, { make: 'A', model: 'B', vehicle_type: 'suv' })).status, 404);
  assert.equal((await fremd.post('/api/requests', { ...REQ, vehicle_id: v.body.id })).status, 400);
  const { body: { id: rid } } = await kunde.post('/api/requests', { ...REQ, vehicle_id: v.body.id, vehicle_make: '', vehicle_model: '' });
  assert.equal((await betrieb.get('/api/requests/' + rid)).body.request.vehicle, 'BMW 320d');
  assert.equal((await kunde.post('/api/requests', { ...REQ, address_private: '' })).status, 400); // verdeckte Angabe ist Pflicht
  const off = await betrieb.post(`/api/requests/${rid}/offers`, OFFER);
  const { body: { order_id } } = await kunde.post(`/api/offers/${off.body.id}/accept`, { accept_terms: true, acknowledge_intermediary: true });

  // Termin im Kalender des Betriebs, Nachrichten nur für Beteiligte
  assert.equal((await kunde.put(`/api/orders/${order_id}/schedule`, { start: '2026-12-08T09:00', end: '2026-12-08T13:00' })).status, 403);
  assert.equal((await betrieb.put(`/api/orders/${order_id}/schedule`, { start: '2026-12-08T09:00', end: '2026-12-08T08:00' })).status, 400);
  assert.equal((await betrieb.put(`/api/orders/${order_id}/schedule`, { start: '2026-12-08T09:00', end: '2026-12-08T13:00' })).status, 200);
  await betrieb.post('/api/my/calendar', { title: 'Urlaub', start: '2026-12-09T00:00', end: '2026-12-09T23:59' });
  const cal = (await betrieb.get('/api/my/calendar?from=2026-12-01&to=2026-12-31')).body;
  assert.equal(cal.orders.length, 1); assert.equal(cal.entries.length, 1);
  assert.equal((await kunde.get('/api/my/calendar')).status, 403);
  await kunde.post(`/api/orders/${order_id}/messages`, { body: 'Parkplatz ist hinter dem Haus.' });
  assert.equal((await fremd.post(`/api/orders/${order_id}/messages`, { body: 'Hallo' })).status, 404);
  assert.equal((await fremd.get(`/api/orders/${order_id}/messages`)).status, 404);
  const msgs = (await betrieb.get(`/api/orders/${order_id}/messages`)).body.messages;
  assert.ok(msgs.some((m) => m.system && /Termin festgelegt/.test(m.body)));
  assert.ok(msgs.some((m) => m.body === 'Parkplatz ist hinter dem Haus.'));

  await betrieb.post(`/api/orders/${order_id}/report-done`, { payment_received: true, amount: '119' });
  await kunde.post(`/api/orders/${order_id}/customer-confirm`, { work_done: true, amount: '119' });
  const veh = (await kunde.get('/api/my/profile')).body.vehicles.find((x) => x.id === v.body.id);
  assert.ok(veh.last_cleaning_on <= new Date().toISOString().slice(0, 10)); // geplanter Termin in der Zukunft → Bestätigungsdatum assert.equal(veh.last_cleaning_source, 'plattform'); assert.equal(veh.jobs_done, 1);
});
