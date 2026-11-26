'use strict';
// Legt einen Verwaltungszugang an (nur auf dem Server per Kommandozeile möglich).
// Aufruf: ADMIN_PASSWORD='…' npm run create-admin -- admin@example.de "Vorname Nachname"
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('../src/db');
const { hashPassword } = require('../src/auth');

const [email, name] = process.argv.slice(2);
if (!email || !name) { console.error('Aufruf: npm run create-admin -- <email> "<Name>"   (Passwort über ADMIN_PASSWORD, sonst wird eins erzeugt)'); process.exit(1); }
let pw = process.env.ADMIN_PASSWORD;
let generated = false;
if (!pw) { pw = crypto.randomBytes(15).toString('base64url'); generated = true; }
if (pw.length < 12) { console.error('Passwort muss mindestens 12 Zeichen haben'); process.exit(1); }
const db = openDb(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email.toLowerCase());
if (existing) {
  db.prepare("UPDATE users SET role = 'admin', pw_hash = ?, locked = 0 WHERE id = ?").run(hashPassword(pw), existing.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
  console.log(`Bestehendes Konto ${email} ist jetzt Administrator (vorher: ${existing.role}).`);
} else {
  db.prepare("INSERT INTO users (email, pw_hash, name, role) VALUES (?, ?, ?, 'admin')").run(email.toLowerCase(), hashPassword(pw), name);
  console.log(`Administrator ${email} angelegt.`);
}
if (generated) console.log(`Erzeugtes Passwort (nur jetzt sichtbar): ${pw}`);
