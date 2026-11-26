// Test der statischen Netlify-Demo. Aufruf: BASE=http://localhost:3200 SHOTS=/pfad node test/e2e/demo.js
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3200';
const SHOTS = process.env.SHOTS || '.';
const errors = [];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push('console: ' + m.text()); });
  const shot = (n) => p.screenshot({ path: `${SHOTS}/demo-${n}.png`, fullPage: true });

  await p.goto(BASE + '/#/'); await p.waitForSelector('text=Dein Auto. Der passende Profi.');
  await p.waitForSelector('.demo-banner'); await shot('1-start');
  // Betrieb: Demo-Anfragen sehen, Angebot auf Lackschaden
  await p.click('.demo-banner button:has-text("Lack-Werkstatt")'); await p.waitForSelector('h1:has-text("Dashboard")');
  await p.goto(BASE + '/#/auftraege'); await p.waitForSelector('article h3:has-text("Lackschäden")');
  const n = await p.locator('article').count(); if (n !== 3) errors.push('Erwartet 3 Demo-Anfragen, gefunden ' + n);
  await p.click('article:has-text("Lackschäden") >> text=Details ansehen'); await p.waitForSelector('text=Angebot abgeben');
  await p.click('label.choice:has-text("Beim Betrieb")');
  await p.fill('textarea[name=scope]', 'Smart Repair des Kratzers in der Werkstatt, inkl. Lackierung.');
  await p.fill('#f_appointment', 'Nächste Woche'); await p.fill('#f_duration', '1 Tag'); await p.fill('#f_price', '240');
  await p.waitForSelector('text=Dir verbleiben netto');
  const calc = await p.textContent('.calc'); if (!/240,00\s€/.test(calc) || !/36,00\s€/.test(calc)) errors.push('Provision Kleinunternehmer falsch: ' + calc);
  await p.click('button:has-text("Angebot verbindlich senden")'); await p.waitForSelector('text=liegt dem Kunden vor');
  // Kunde nimmt an
  await p.click('.demo-banner button:has-text("Kunde")'); await p.waitForSelector('h1:has-text("Meine Anfragen")'); await shot('2-kunde');
  await p.click('article:has-text("Lackschäden") >> text=Angebote vergleichen'); await p.waitForSelector('text=Demo Lack & Smart Repair');
  await p.click('article:has-text("Demo Lack") >> button:has-text("verbindlich beauftragen")');
  await p.check('dialog label.check:nth-of-type(1) input'); await p.check('dialog label.check:nth-of-type(2) input');
  await p.click('dialog button:has-text("Jetzt verbindlich beauftragen")'); await p.waitForURL(/auftrag\/\d+/);
  await p.waitForSelector('text=Werkstattweg 2'); await shot('3-auftrag');
  // Foto-Upload in neuer Anfrage (Daten bleiben nach Neuladen erhalten)
  await p.goto(BASE + '/#/mein-profil'); await p.waitForSelector('text=Demo-Familienauto');
  await p.reload(); await p.waitForSelector('text=Demo-Familienauto');
  // Verwaltung
  await p.click('.demo-banner button:has-text("Verwaltung")'); await p.waitForSelector('h1:has-text("Verwaltung")');
  await p.goto(BASE + '/#/verwaltung?tab=provisionen'); await p.waitForSelector('td:has-text("Voraussichtliche Provision")'); await shot('4-verwaltung');
  // Zurücksetzen
  p.once('dialog', (d) => d.accept());
  await p.click('.demo-banner button:has-text("Demo zurücksetzen")'); await p.waitForSelector('text=Dein Auto. Der passende Profi.');
  await p.goto(BASE + '/#/auftraege'); await p.waitForSelector('article');
  if (await p.locator('article').count() !== 3) errors.push('Reset hat nicht funktioniert');
  await browser.close();
  if (errors.length) { console.log('FEHLER:\n' + errors.join('\n')); process.exit(1); }
  console.log('Demo ok');
})().catch((e) => { console.error(e.message); console.log(errors.join('\n')); process.exit(1); });
