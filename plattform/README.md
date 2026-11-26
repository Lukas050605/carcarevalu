# MHL Agentur – Aufbereitung mobil, in der Halle & Lackschäden

Vermittlungsplattform: Kunden stellen kostenlos Anfragen ein, Fahrzeugaufbereiter und Lack-Fachbetriebe geben Angebote ab.
Die Agentur erhält 15 % Provision (einstellbar) auf den Netto-Auftragswert vermittelter, ausgeführter und bezahlter Aufträge.

## Technik

- **Node.js ≥ 22.5** mit Express. Die Datenbank ist **SQLite** (eingebautes `node:sqlite`) und liegt dauerhaft in `data/plattform.sqlite`.
- **Anmeldung:** Passwörter werden mit scrypt gehasht. Sitzungen laufen über ein HttpOnly-Cookie mit SameSite=Lax. Schreibende Aufrufe sind gegen CSRF geschützt.
- **Rechte:** Alle Berechtigungsprüfungen laufen auf dem Server. Private Daten werden gar nicht erst ausgeliefert, nicht bloß im Frontend ausgeblendet.
- **Uploads:**
  - Der Dateityp wird an den echten Bytes erkannt. Erlaubt sind JPG und PNG, für Nachweise zusätzlich PDF.
  - EXIF-, GPS- und Text-Metadaten werden entfernt.
  - Dateien werden unter Zufallsnamen in `data/uploads/` gespeichert, nicht öffentlich. Ausgeliefert werden sie erst nach einer Rechteprüfung.
- **Geldbeträge** werden ausschließlich in Cent und auf dem Server berechnet (`src/money.js`).
- **Frontend:** Vanilla JS ohne Build-Schritt (`public/`). Schriften liegen lokal, es gibt kein externes CDN und kein Tracking.

## Starten (lokal)

```bash
cd plattform
npm install
ADMIN_PASSWORD='ein-langes-passwort' npm run create-admin -- du@example.de "Dein Name"
npm start            # http://localhost:3000
```

Einen Administrator legst du **nur per Kommandozeile** an. Über die Website kann sich niemand selbst zum Admin machen.

Umgebungsvariablen:
- `PORT` (Standard 3000)
- `DATA_DIR` (Ordner für Datenbank und Uploads, Standard `plattform/data`)
- `SECURE_COOKIES=1` hinter HTTPS

## Testen (Codespaces, Demo-Zugänge, automatische Tests)

Siehe **[TESTEN.md](TESTEN.md)**. Kurz: `npm run demo` startet die Website mit Demo-Konten, und auf GitHub laufen bei jeder Änderung alle Tests automatisch.

## Tests

```bash
npm test                                   # 13 API-Tests: Rechte, Provision, Storno, Doppelabrechnung, Uploads, Filter, Kalender …
BASE=http://localhost:3000 SHOTS=/tmp node test/e2e/flow.js   # Browser-Durchlauf am Handy (Playwright nötig)
```

## Postleitzahlen importieren (für Umkreis und Entfernung)

Ohne Geodaten zeigt die Plattform **keine** Entfernungen an und filtert nur nach PLZ-Anfang. Kilometerangaben werden nie erfunden. Echte Daten importierst du so:

```bash
curl -O https://download.geonames.org/export/zip/DE.zip && unzip DE.zip DE.txt
npm run import-plz -- DE.txt
```

Die GeoNames-Daten stehen unter der Lizenz CC BY 4.0. Die Quellenangabe „GeoNames“ musst du in Impressum oder Datenschutz ergänzen.

## Online stellen

Die bestehende Website läuft auf Netlify, das hostet aber nur statische Seiten. Diese Plattform braucht einen **Server mit dauerhaftem Speicher**, zum Beispiel:
- einen kleinen VPS (Hetzner, netcup) mit Node 22 und einem Reverse-Proxy (Caddy oder nginx) für HTTPS
- Render oder Fly.io mit einem Persistent Volume für `DATA_DIR`

Wichtig:
- Sichere `DATA_DIR` regelmäßig, also Datenbank **und** Uploads.
- Setze hinter HTTPS `SECURE_COOKIES=1`.
- Wähle einen Hoster in der EU und schließe einen Vertrag zur Auftragsverarbeitung (AV-Vertrag).

## Was tatsächlich funktioniert

- **Konten:** Registrierung und Anmeldung für Kunden und Betriebe. Administratoren entstehen nur per Kommandozeile.
- **Kundenablauf:**
  1. Anmelden
  2. Ort und Leistung angeben
  3. Ausführungsort mit Lack- und Mobil-Fragen
  4. Fahrzeug, gespeichert oder neu
  5. Beschreibung, Zeitraum, Budget und Fotos
  6. Verdeckte Angaben (Adresse, Telefon)
- **Kundenprofil:** Name, Telefon und Fahrzeuge mit **letzter Reinigung**. Das Datum aktualisiert sich automatisch, sobald ein Auftrag über die Plattform beidseitig bestätigt ist, und lässt sich manuell eintragen.
- **Anfragen verwalten:** Kunden können Anfragen bearbeiten, Fotos ergänzen und Anfragen zurückziehen, solange nichts vergeben ist.
- **Auftragsübersicht:**
  - Betriebe sehen nur PLZ-Bereich, Ort, Leistung, Fahrzeug, Budget und Beschreibung, keine Namen und keine Kontaktdaten.
  - Filter: Ort/PLZ, Umkreis, mobil oder Werkstatt, Lack, Leistung, Budget, Privat oder Flotte, einmalig oder regelmäßig.
  - Sortierung: neueste zuerst, Entfernung, Budget.
  - Leere Ergebnisse und Fehler werden verständlich angezeigt.
- **Betriebsprofil:**
  - Firmendaten, Leistungen, mobiles Einsatzgebiet, Halle/Werkstatt und Umsatzsteuerstatus (regelbesteuert oder Kleinunternehmer).
  - Arbeitsbeispiele und Nachweise lassen sich hochladen.
  - Selbstauskunft und **von der Agentur dokumentierte Prüfungen** werden getrennt geführt.
- **Angebote:**
  - Pflichtangaben: Leistungsumfang, Ort, Termin, Endpreis inklusive Steuern, Anfahrt, Zusatzleistungen und Dauer.
  - Vor dem Absenden zeigt der Server die Provisionsvorschau: netto, Satz, Provision, Umsatzsteuer und Restbetrag.
  - Eine mobile Lackreparatur ist nur möglich, wenn der Fachbetrieb die Machbarkeit bestätigt.
- **Beauftragung:**
  - Der Kunde vergleicht die Angebote und beauftragt verbindlich.
  - Dabei bestätigt er, dass der Vertrag direkt mit dem Betrieb zustande kommt und die Agentur nur vermittelt.
  - Erst danach werden die Kontaktdaten gegenseitig freigegeben.
- **Nach der Beauftragung läuft alles über die Website:**
  - **Nachrichten** im Auftrag, nur für die Beteiligten.
  - Der Betrieb trägt den **Termin** ein, der Kunde sieht ihn.
  - Der Betrieb hat ein **Dashboard mit Kalender**: Monatsansicht und Liste, eigene Blockzeiten und Aufträge ohne festen Termin.
- **Statusablauf:**
  - Betrieb: vergeben → in Bearbeitung → Fertigstellung gemeldet.
  - Betrieb und Kunde bestätigen getrennt Durchführung und Zahlung. Weichen ihre Beträge ab, geht der Auftrag in **Klärung**.
  - Stornieren ist nur vor der Fertigmeldung möglich.
- **Provisionen:**
  - Stufen: voraussichtlich → abrechenbar (erst nach beidseitiger Bestätigung) → Rechnung erstellt (fortlaufende, eindeutige Nummer) → bezahlt (erst wenn die Zahlungseingänge erfasst sind).
  - Stornierungen und Rückerstattungen werden berücksichtigt.
  - Pro Auftrag ist nur eine Provision möglich, das sichert die Datenbank mit `UNIQUE` ab.
- **Verwaltung:**
  - Anfragen, Betriebe und Nachweise prüfen, Meldungen bearbeiten, Aufträge und Streitfälle klären, Rückerstattungen erfassen.
  - Provisionen und tatsächliche Zahlungseingänge werden getrennt ausgewertet.
  - Den Provisionssatz kann die Verwaltung ändern. Die Änderung gilt nur für künftige Angebote, der Satz wird je Angebot und Auftrag gespeichert.
  - CSV-Export und Protokoll sind enthalten.

## Noch nicht aktiv (ehrlich gekennzeichnet)

| Funktion | Was fehlt | Wie aktivieren |
|---|---|---|
| E-Mail-Benachrichtigungen (neues Angebot, Nachricht, Termin) und Passwort-Reset | SMTP-Zugang (z. B. Postmark, Brevo, eigener Mailserver) | `nodemailer` einbinden und an den Stellen `audit(...)` versenden; bis dahin sehen Nutzer Neuigkeiten nur beim Öffnen der Seite |
| Online-Zahlung | Zahlungsanbieter (z. B. Stripe Connect / Mollie) mit **echten Webhook-Bestätigungen** | Bezahlung läuft aktuell direkt beim Betrieb; es gibt bewusst keinen vorgetäuschten Bezahlknopf |
| PDF-Rechnungen der Agentur | Rechnungsvorlage mit deinen Firmendaten | Rechnungsnummer wird vergeben, Rechnung vorerst im Buchhaltungsprogramm schreiben |
| Umkreis/Entfernung | PLZ-Geodaten | `npm run import-plz` (siehe oben) |
| Virenscan für Uploads | z. B. ClamAV auf dem Server | optional, empfohlen für Nachweis-PDFs |

## Rechtliches

Die Seiten Impressum, Datenschutz, Vermittlungsbedingungen und Verbraucherinformationen sind als **Entwurf** angelegt. Fehlende Angaben sind gelb mit `[FEHLT: …]` markiert. Die Texte sind keine Rechtsberatung und müssen vor dem Livegang anwaltlich geprüft werden. Eine vollständige Rechtskonformität wird nicht behauptet.
