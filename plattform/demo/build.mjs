// Baut die Browser-Demo für Netlify nach demo-dist/ (statische Dateien, kein Server nötig).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'demo-dist');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });

const shims = { express: 'express.js', multer: 'multer.js', 'node:sqlite': 'sqlite.js', 'node:fs': 'fs.js', 'node:path': 'path.js', 'node:crypto': 'crypto.js' };
await esbuild.build({
  entryPoints: [path.join(root, 'demo/entry.js')],
  bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true,
  outfile: path.join(out, 'demo.js'),
  inject: [path.join(root, 'demo/shims/buffer-global.js')],
  define: { __dirname: '"/app/src"' },
  plugins: [{ name: 'shims', setup(b) {
    b.onResolve({ filter: /^(express|multer|node:sqlite|node:fs|node:path|node:crypto)$/ }, (a) => ({ path: path.join(root, 'demo/shims', shims[a.path]) }));
  } }],
  logLevel: 'warning',
});
for (const f of ['sql-wasm.js', 'sql-wasm.wasm']) fs.copyFileSync(path.join(root, 'node_modules/sql.js/dist', f), path.join(out, f));

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html.replace('<script src="/js/start.js" defer></script>', '<script src="/sql-wasm.js" defer></script>\n<script src="/demo.js" defer></script>')
  .replace('<title>', '<meta name="robots" content="noindex">\n<title>DEMO – ');
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: same-origin
  X-Frame-Options: DENY
  X-Robots-Tag: noindex
  Content-Security-Policy: default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'
`);
console.log('Demo gebaut:', path.relative(process.cwd(), out));
