'use strict';
// Datei-Uploads: Typ anhand der echten Bytes prüfen (nicht anhand von Dateiname/MIME aus dem Browser),
// Metadaten (EXIF inkl. GPS) aus Fotos entfernen, unter Zufallsnamen außerhalb des öffentlichen Ordners speichern.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 8 * 1024 * 1024;

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

// Entfernt APP1..APP15 (EXIF, XMP, …) und COM-Segmente aus JPEG. APP0 (JFIF) bleibt.
function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('Beschädigtes JPEG');
    const marker = buf[i + 1];
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // Start of Scan: Rest übernehmen
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > buf.length) throw new Error('Beschädigtes JPEG');
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    const isMeta = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMeta) out.push(seg);
    i += 2 + len;
  }
  throw new Error('Beschädigtes JPEG');
}

// Entfernt Text- und EXIF-Chunks aus PNG.
function stripPng(buf) {
  const drop = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const end = i + 12 + len;
    if (end > buf.length) throw new Error('Beschädigtes PNG');
    if (!drop.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

/**
 * Prüft und speichert eine hochgeladene Datei. Gibt { id, mime, size } zurück.
 * allowPdf nur für Nachweise (nicht öffentlich).
 */
function storeUpload(uploadDir, buf, { allowPdf = false } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new Error('Leere Datei');
  if (buf.length > MAX_BYTES) throw new Error('Datei ist größer als 8 MB');
  const mime = sniff(buf);
  if (!mime || (mime === 'application/pdf' && !allowPdf)) {
    throw new Error(allowPdf ? 'Erlaubt sind JPG, PNG oder PDF' : 'Erlaubt sind nur Fotos im Format JPG oder PNG');
  }
  let clean = buf;
  if (mime === 'image/jpeg') clean = stripJpeg(buf);
  if (mime === 'image/png') clean = stripPng(buf);
  const id = crypto.randomBytes(18).toString('base64url');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, id), clean, { flag: 'wx', mode: 0o600 });
  return { id, mime, size: clean.length };
}

function filePath(uploadDir, id) {
  if (!/^[A-Za-z0-9_-]{24}$/.test(id)) return null;
  return path.join(uploadDir, id);
}

module.exports = { storeUpload, filePath, sniff, stripJpeg, stripPng, MAX_BYTES };
