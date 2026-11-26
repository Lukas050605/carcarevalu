'use strict';
// Importiert echte Postleitzahl-Koordinaten für Umkreissuche und Entfernungen.
// Unterstützt das GeoNames-Format (DE.txt aus https://download.geonames.org/export/zip/DE.zip, Lizenz CC BY 4.0 –
// Quellenangabe „GeoNames“ im Impressum/Datenschutz ergänzen) sowie CSV „plz;ort;lat;lng“.
// Aufruf: npm run import-plz -- /pfad/zu/DE.txt
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');

const file = process.argv[2];
if (!file) { console.error('Aufruf: npm run import-plz -- <DE.txt | plz.csv>'); process.exit(1); }
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const acc = new Map();
for (const line of lines) {
  if (!line.trim()) continue;
  let plz, city, lat, lng;
  const t = line.split('\t');
  if (t.length >= 11) { [, plz, city] = t; lat = Number(t[9]); lng = Number(t[10]); }
  else { const c = line.split(/[;,]/); if (c.length < 4) continue; [plz, city] = c; lat = Number(c[2]); lng = Number(c[3]); }
  if (!/^\d{5}$/.test(plz) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  const a = acc.get(plz) || { city, lat: 0, lng: 0, n: 0 };
  a.lat += lat; a.lng += lng; a.n++; acc.set(plz, a);
}
const db = openDb(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const ins = db.prepare('INSERT OR REPLACE INTO postcodes (plz, city, lat, lng) VALUES (?, ?, ?, ?)');
db.tx(() => { for (const [plz, a] of acc) ins.run(plz, a.city, a.lat / a.n, a.lng / a.n); });
// Koordinaten bestehender Anfragen und Betriebe nachtragen
db.exec(`UPDATE requests SET lat = (SELECT lat FROM postcodes p WHERE p.plz = requests.plz), lng = (SELECT lng FROM postcodes p WHERE p.plz = requests.plz) WHERE lat IS NULL;
         UPDATE companies SET lat = (SELECT lat FROM postcodes p WHERE p.plz = companies.plz), lng = (SELECT lng FROM postcodes p WHERE p.plz = companies.plz) WHERE lat IS NULL;`);
console.log(`${acc.size} Postleitzahlen importiert.`);
