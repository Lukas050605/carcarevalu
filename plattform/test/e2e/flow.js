// Browser-Durchlauf am Handy (Playwright). Aufruf: BASE=http://localhost:3123 SHOTS=/pfad node test/e2e/flow.js
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || '.';
const errors = [];
(async () => {
  const browser = await chromium.launch();
  const mk = async () => { const c = await browser.newContext({ ...devices['iPhone 13'] }); const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/status of 400/.test(m.text())) errors.push(m.text()); }); return p; };
  const shot = async (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
  const noHScroll = async (p, n) => { const w = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (w > 1) errors.push(`${n}: horizontaler Scroll ${w}px`); };

  // Kunde
  const k = await mk();
  await k.goto(BASE + '/#/'); await k.waitForSelector('text=Dein Auto. Der passende Profi.');
  await noHScroll(k, 'start'); await shot(k, '01-start');
  await k.click('text=Kostenlos Auftrag einstellen');
  await k.waitForSelector('text=Zuerst anmelden'); await shot(k, '02-anmelden-zuerst');
  await k.click('text=Kostenlos registrieren');
  await k.fill('#f_name', 'Erika Beispiel'); await k.fill('#f_email', 'kunde@mhl.test'); await k.fill('#f_phone', '0170 000000'); await k.fill('#f_password', 'kundenpasswort1');
  await k.check('input[name=accept_terms]'); await k.click('button:has-text("Konto anlegen")');
  await k.waitForSelector('text=Wo wohnst du');
  await k.fill('#f_plz', '61130'); await k.fill('#f_city', 'Nidderau');
  await k.click('label.choice:has-text("Mobile Aufbereitung")'); await k.click('label.choice:has-text("Tierhaarentfernung")');
  await shot(k, '03-ort-leistung'); await k.click('button:has-text("Weiter")');
  await k.click('fieldset:has-text("Stellplatz") label.choice:has-text("Ja")'); await k.click('fieldset:has-text("Strom") label.choice:has-text("Nein")'); await k.click('fieldset:has-text("Wasser") label.choice:has-text("Weiß nicht")');
  await k.click('button:has-text("Weiter")');
  await k.fill('#f_vehicle_make', 'VW'); await k.fill('#f_vehicle_model', 'Touran'); await k.selectOption('#f_vehicle_type', 'van');
  await k.click('button:has-text("Weiter")');
  await k.fill('#f_description', 'Viele Hundehaare im Kofferraum und auf der Rückbank.'); await k.selectOption('#f_timeframe', 'zwei_wochen');
  await k.fill('#f_budget', '150');
  // Upload eines echten PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  await k.setInputFiles('input[name=photo_allgemein]', { name: 'kofferraum.png', mimeType: 'image/png', buffer: png });
  await k.click('button:has-text("Weiter")');
  await k.waitForSelector('text=Verdeckte Angaben'); await shot(k, '04-verdeckte-angaben');
  await k.click('button:has-text("Anfrage kostenlos einstellen")');
  await k.waitForSelector('text=Bitte Straße und Hausnummer');
  await k.fill('#f_address_private', 'Musterweg 12'); await k.click('button:has-text("Anfrage kostenlos einstellen")');
  await k.waitForSelector('text=Noch keine Angebote'); await noHScroll(k, 'anfrage'); await shot(k, '05-anfrage-online');
  const reqUrl = k.url();

  // Betrieb
  const b = await mk();
  await b.goto(BASE + '/#/registrieren?rolle=betrieb');
  await b.fill('#f_name', 'Max Glanz'); await b.fill('#f_email', 'betrieb@mhl.test'); await b.fill('#f_password', 'betriebpasswort1');
  await b.check('input[name=accept_terms]'); await b.click('button:has-text("Konto anlegen")');
  await b.waitForSelector('text=Unternehmensprofil');
  await b.fill('#f_name', 'Glanzwerk Beispiel'); await b.fill('#f_street', 'Werkstraße 1'); await b.fill('#f_plz', '61130'); await b.fill('#f_city', 'Nidderau'); await b.fill('#f_phone', '06187 1');
  await b.check('input[value=tierhaar]'); await b.check('input[name=mobile]'); await b.fill('#f_mobile_radius_km', '30');
  await b.click('button:has-text("Profil speichern")'); await b.waitForSelector('text=Dein Profil ist vollständig');
  await b.goto(BASE + '/#/auftraege'); await b.waitForSelector('article h3:has-text("Tierhaarentfernung")'); await noHScroll(b, 'auftraege'); await shot(b, '06-auftraege-finden');
  const txt = await b.textContent('main'); if (/Musterweg|Erika|0170/.test(txt)) errors.push('Private Daten in Auftragsübersicht!');
  // leeres Ergebnis
  await b.goto(BASE + '/#/auftraege?service=leder'); await b.waitForSelector('text=Keine passenden Anfragen'); await shot(b, '07-leer');
  await b.goto(BASE + '/#/auftraege'); await b.click('text=Details ansehen');
  await b.waitForSelector('text=Angebot abgeben');
  await b.fill('textarea[name=scope]', 'Tierhaare entfernen, Innenraum saugen, Kofferraum reinigen.');
  await b.fill('#f_appointment', 'KW 50 vormittags'); await b.fill('#f_duration', 'ca. 3 Stunden'); await b.fill('#f_price', '119');
  await b.waitForSelector('text=Dir verbleiben netto'); await shot(b, '08-angebot-provision');
  const calcTxt = await b.textContent('.calc'); if (!/15,00\s€/.test(calcTxt) || !/100,00\s€/.test(calcTxt)) errors.push('Provisionsvorschau falsch: ' + calcTxt);
  await b.click('button:has-text("Angebot verbindlich senden")'); await b.waitForSelector('text=liegt dem Kunden vor');

  // Kunde nimmt an
  await k.goto(reqUrl); await k.reload(); await k.waitForSelector('text=Glanzwerk Beispiel'); await shot(k, '09-angebote-vergleichen');
  await k.click('button:has-text("verbindlich beauftragen")');
  await k.click('dialog button:has-text("Jetzt verbindlich beauftragen")'); await k.waitForSelector('dialog >> text=Bitte bestätige');
  await k.check('dialog label.check:nth-of-type(1) input'); await k.check('dialog label.check:nth-of-type(2) input');
  await k.click('dialog button:has-text("Jetzt verbindlich beauftragen")');
  await k.waitForURL(/#\/auftrag\/\d+/); await k.waitForSelector('h1:has-text("Auftrag #")'); const orderUrl = k.url();
  await k.fill('textarea[name=body]', 'Parkplatz ist direkt vor dem Haus.'); await k.click('button:has-text("Senden")'); await k.waitForSelector('.msg.mine');

  // Betrieb: Termin, Kalender, Fertigstellung
  await b.goto(orderUrl); await b.reload(); await b.waitForSelector('text=Termin in Kalender eintragen').catch(async (e) => { await shot(b, 'fehler-betrieb'); console.log(await b.textContent('main')); throw e; });
  if (!/Musterweg 12/.test(await b.textContent('main'))) errors.push('Betrieb sieht nach Beauftragung keine Adresse');
  await b.fill('#f_day', '2026-12-10'); await b.fill('#f_from', '09:00'); await b.fill('#f_to', '12:00');
  await b.click('button:has-text("Termin in Kalender eintragen")'); await b.waitForSelector('text=Termin festgelegt');
  await b.goto(BASE + '/#/kalender?monat=2026-12'); await b.waitForSelector('.cal-item.order'); await noHScroll(b, 'kalender'); await shot(b, '10-kalender');
  await b.goto(orderUrl); await b.reload(); await b.waitForSelector('text=Fertigstellung melden');
  await b.check('label.check:has-text("bereits bezahlt") input'); await b.click('button:has-text("Fertigstellung melden")');
  await b.waitForSelector('text=Zahlung 119,00 € bestätigt');

  // Kunde bestätigt
  await k.goto(orderUrl); await k.reload(); await k.waitForSelector('text=Durchführung und Bezahlung bestätigen');
  await k.check('label.check:has-text("durchgeführt") input'); await k.click('button:has-text("Bestätigen")');
  await k.waitForSelector('.chip:has-text("Durchführung und Bezahlung bestätigt")'); await shot(k, '11-auftrag-bestaetigt');
  await k.goto(BASE + '/#/mein-profil'); await k.waitForSelector('text=über die Plattform bestätigt'); await shot(k, '12-kundenprofil');

  // Verwaltung
  const a = await mk();
  await a.goto(BASE + '/#/anmelden'); await a.fill('#f_email', 'admin@mhl.test'); await a.fill('#f_password', 'admin-passwort-123'); await a.click('button:has-text("Anmelden")');
  await a.waitForSelector('h1:has-text("Verwaltung")'); await a.goto(BASE + '/#/verwaltung?tab=provisionen'); await a.waitForSelector('button:has-text("Rechnung erstellen")');
  await a.click('button:has-text("Rechnung erstellen")'); await a.waitForSelector('td:has-text("AMP-")'); await shot(a, '13-verwaltung-provisionen');
  // Kunde darf nicht in die Verwaltung
  await k.goto(BASE + '/#/verwaltung'); await k.waitForSelector('text=Kein Zugriff');

  await browser.close();
  if (errors.length) { console.log('FEHLER:\n' + errors.join('\n')); process.exit(1); }
  console.log('E2E ok');
})().catch((e) => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
