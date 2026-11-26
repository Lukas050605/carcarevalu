'use strict';
// Legt DEMO-Konten und Beispielanfragen an – nur für Test-Umgebungen (Codespaces, lokal).
// Alle Inhalte sind als „Demo“ gekennzeichnet. Läuft nur, wenn die Datenbank noch leer ist.
// Aufruf: DATA_DIR=./demo-data node scripts/demo-data.js
const path = require('node:path');
const { createApp } = require('../src/server');
const { hashPassword } = require('../src/auth');

if (process.env.NODE_ENV === 'production') { console.error('Demo-Daten werden in Produktion nicht angelegt.'); process.exit(1); }
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const ACCOUNTS = {
  admin: ['admin@demo.test', 'demo-admin-1234'],
  kunde: ['kunde@demo.test', 'demo-kunde-1234'],
  betrieb: ['betrieb@demo.test', 'demo-betrieb-1234'],
  werkstatt: ['werkstatt@demo.test', 'demo-werkstatt-1234'],
};

(async () => {
  const app = createApp({ dataDir, authLimit: 1000 });
  const db = app.locals.db;
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) { console.log('Datenbank enthält schon Konten – keine Demo-Daten angelegt.'); printAccounts(); process.exit(0); }
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const client = () => {
    let cookie = '';
    return async (method, url, body) => {
      const headers = { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const json = await res.json();
      if (!res.ok) throw new Error(`${method} ${url}: ${json.error}`);
      return json;
    };
  };
  const register = async (role, [email, password], name, phone) => { const c = client(); await c('POST', '/api/auth/register', { role, email, password, name, phone, accept_terms: true }); return c; };

  db.prepare("INSERT INTO users (email, pw_hash, name, role) VALUES (?, ?, 'Demo-Verwaltung', 'admin')").run(ACCOUNTS.admin[0], hashPassword(ACCOUNTS.admin[1]));

  const kunde = await register('kunde', ACCOUNTS.kunde, 'Demo Kundin', '0000 000000');
  const betrieb = await register('betrieb', ACCOUNTS.betrieb, 'Demo Inhaber', '0000 111111');
  const werkstatt = await register('betrieb', ACCOUNTS.werkstatt, 'Demo Lackierer', '0000 222222');

  await betrieb('PUT', '/api/my/company', {
    name: 'Demo Mobile Aufbereitung', contact_person: 'Demo Inhaber', street: 'Demostraße 1', plz: '61130', city: 'Nidderau',
    email: ACCOUNTS.betrieb[0], phone: '0000 111111', services: ['innen', 'innen_intensiv', 'polster', 'tierhaar', 'aussen', 'komplett'],
    mobile: true, mobile_radius_km: 30, workshop: false, vat_mode: 'regel',
    description: 'DEMO-Betrieb zum Testen der Plattform. Keine echte Firma.', self_insurance: 'Demo-Angabe', self_trade: 'Demo-Angabe',
  });
  await werkstatt('PUT', '/api/my/company', {
    name: 'Demo Lack & Smart Repair', contact_person: 'Demo Lackierer', street: 'Werkstattweg 2', plz: '63450', city: 'Hanau',
    email: ACCOUNTS.werkstatt[0], phone: '0000 222222', services: ['lack', 'politur', 'versiegelung', 'komplett'],
    mobile: true, mobile_radius_km: 20, workshop: true, workshop_address: 'Werkstattweg 2, 63450 Hanau', vat_mode: 'klein',
    description: 'DEMO-Fachbetrieb für Lackschäden. Keine echte Firma.',
  });

  const v = await kunde('POST', '/api/my/vehicles', { make: 'VW', model: 'Touran', vehicle_type: 'van', nickname: 'Demo-Familienauto', last_cleaning_on: '2026-06-15' });
  const base1 = { customer_type: 'privat', plz: '61130', city: 'Nidderau', address_private: 'Demoweg 5', recurrence: 'einmalig' };
  const r1 = await kunde('POST', '/api/requests', { ...base1, area: 'mobil', service: 'tierhaar', location_pref: 'mobil', vehicle_id: v.id, timeframe: 'zwei_wochen',
    description: 'DEMO: Hundehaare im Kofferraum und auf der Rückbank.', budget: '150', mobile_parking: 'ja', mobile_power: 'ja', mobile_water: 'unsicher' });
  await kunde('POST', '/api/requests', { ...base1, area: 'lack', service: 'lack', location_pref: 'beides', vehicle_make: 'Audi', vehicle_model: 'A4', vehicle_type: 'kombi', timeframe: 'flexibel',
    description: 'DEMO: Kratzer am hinteren Stoßfänger nach dem Einparken.', budget_none: true, damage_part: 'stossfaenger_hinten', damage_type: 'kratzer', damage_size: 'mittel',
    mobile_parking: 'ja', mobile_power: 'nein', mobile_water: 'nein' });
  await kunde('POST', '/api/requests', { ...base1, area: 'halle', service: 'komplett', location_pref: 'betrieb', customer_type: 'flotte', fleet_count: 4, recurrence: 'regelmaessig',
    vehicle_make: 'Skoda', vehicle_model: 'Octavia', vehicle_type: 'kombi', timeframe: 'monat', description: 'DEMO: Monatliche Aufbereitung von 4 Firmenfahrzeugen.', budget_none: true });
  await betrieb('POST', `/api/requests/${r1.id}/offers`, { location: 'mobil', scope: 'DEMO-Angebot: Tierhaare entfernen, Innenraum saugen, Kofferraum reinigen.', appointment: 'Nächste Woche vormittags', duration: 'ca. 3 Stunden', price: '119', travel_included: true });

  server.close();
  console.log('Demo-Daten angelegt.');
  printAccounts();
})().catch((e) => { console.error(e); process.exit(1); });

function printAccounts() {
  console.log('\nDemo-Zugänge (nur zum Testen):');
  for (const [role, [email, pw]] of Object.entries(ACCOUNTS)) console.log(`  ${role.padEnd(10)} ${email.padEnd(22)} ${pw}`);
}
