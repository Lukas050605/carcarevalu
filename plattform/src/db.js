'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('kunde','betrieb','admin')),
  locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS postcodes (
  plz TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  plz TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  services TEXT NOT NULL DEFAULT '[]',
  mobile INTEGER NOT NULL DEFAULT 0,
  mobile_radius_km INTEGER,
  workshop INTEGER NOT NULL DEFAULT 0,
  workshop_address TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  vat_mode TEXT NOT NULL DEFAULT 'regel' CHECK (vat_mode IN ('regel','klein')),
  self_insurance TEXT NOT NULL DEFAULT '',
  self_trade TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('gewerbe','versicherung','sonstiges')),
  note TEXT NOT NULL,
  file_id TEXT,
  valid_until TEXT,
  checked_by INTEGER NOT NULL REFERENCES users(id),
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  area TEXT NOT NULL,
  service TEXT NOT NULL,
  location_pref TEXT NOT NULL CHECK (location_pref IN ('mobil','betrieb','beides')),
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  plz TEXT NOT NULL,
  city TEXT NOT NULL,
  address_private TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL,
  timeframe TEXT NOT NULL,
  recurrence TEXT NOT NULL CHECK (recurrence IN ('einmalig','regelmaessig')),
  customer_type TEXT NOT NULL CHECK (customer_type IN ('privat','flotte')),
  fleet_count INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  budget_cents INTEGER,
  damage_part TEXT, damage_type TEXT, damage_size TEXT,
  mobile_parking TEXT, mobile_power TEXT, mobile_water TEXT,
  status TEXT NOT NULL DEFAULT 'offen',
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('request_photo','work_example','proof')),
  label TEXT NOT NULL DEFAULT '',
  request_id INTEGER REFERENCES requests(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  scope TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN ('mobil','betrieb')),
  appointment TEXT NOT NULL,
  duration TEXT NOT NULL,
  travel_included INTEGER NOT NULL DEFAULT 0,
  travel_note TEXT NOT NULL DEFAULT '',
  extras TEXT NOT NULL DEFAULT '',
  gross_cents INTEGER NOT NULL CHECK (gross_cents > 0),
  provider_vat_bp INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  commission_bp INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  agency_vat_bp INTEGER NOT NULL,
  commission_vat_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','angenommen','abgelehnt','zurueckgezogen')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_offer ON offers(request_id, company_id) WHERE status = 'offen';

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL UNIQUE REFERENCES requests(id),
  offer_id INTEGER NOT NULL UNIQUE REFERENCES offers(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  gross_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  provider_vat_bp INTEGER NOT NULL,
  commission_bp INTEGER NOT NULL,
  agency_vat_bp INTEGER NOT NULL,
  status TEXT NOT NULL,
  terms_accepted_at TEXT NOT NULL,
  started_at TEXT,
  done_reported_at TEXT,
  provider_paid_cents INTEGER,
  provider_paid_at TEXT,
  customer_paid_cents INTEGER,
  customer_confirmed_at TEXT,
  dispute_reason TEXT,
  cancelled_at TEXT,
  cancelled_by INTEGER,
  cancel_reason TEXT,
  refund_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commissions (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  net_cents INTEGER NOT NULL,
  rate_bp INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  vat_bp INTEGER NOT NULL,
  vat_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('voraussichtlich','abrechenbar','rechnung_erstellt','bezahlt','klaerung','storniert')),
  invoice_number TEXT UNIQUE,
  invoiced_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  commission_id INTEGER NOT NULL REFERENCES commissions(id),
  amount_cents INTEGER NOT NULL,
  received_on TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookmarks (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  PRIMARY KEY (company_id, request_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('request','offer','company')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','erledigt')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  last_cleaning_on TEXT,
  last_cleaning_source TEXT CHECK (last_cleaning_source IN ('manuell','plattform')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sender_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_entries (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'plattform.sqlite'));
  db.exec(SCHEMA);
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  ins.run('commission_bp', '1500');      // Startwert 15 %
  ins.run('agency_vat_bp', '1900');      // USt auf Agenturprovision; 0 falls Agentur Kleinunternehmer
  ins.run('invoice_counter', '0');

  // einfache Migrationen für bestehende Datenbanken
  const addCol = (table, col, def) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addCol('requests', 'vehicle_id', 'INTEGER REFERENCES vehicles(id) ON DELETE SET NULL');
  addCol('orders', 'scheduled_start', 'TEXT');
  addCol('orders', 'scheduled_end', 'TEXT');

  db.tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  db.setting = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value;
  return db;
}

module.exports = { openDb };
