'use strict';
const crypto = require('node:crypto');

const SESSION_DAYS = 30;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(pw, stored) {
  const [alg, s, h] = String(stored).split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const expected = Buffer.from(h, 'base64');
  const actual = crypto.scryptSync(pw, Buffer.from(s, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha(token), userId, Date.now() + SESSION_DAYS * 86400000);
  return token;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionUser(db, req) {
  const token = parseCookies(req.headers.cookie).sid;
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.email, u.name, u.phone, u.role, u.locked, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha(token));
  if (!row || row.expires_at < Date.now() || row.locked) return null;
  return { id: row.id, email: row.email, name: row.name, phone: row.phone, role: row.role };
}

function destroySession(db, req) {
  const token = parseCookies(req.headers.cookie).sid;
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

function cookieHeader(token, secure) {
  const base = `sid=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return token ? `${base}; Max-Age=${SESSION_DAYS * 86400}` : `${base}; Max-Age=0`;
}

module.exports = { hashPassword, verifyPassword, createSession, sessionUser, destroySession, cookieHeader };
