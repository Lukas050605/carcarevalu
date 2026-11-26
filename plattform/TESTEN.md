# Website testen – so geht's

## ⭐ Netlify-Demo: fester Link, immer wieder testen

Das ist eine Demo, die komplett im Browser läuft. Der echte Plattform-Code läuft dabei direkt im Browser. Die Daten bleiben **nur in deinem Browser**. Oben auf der Seite wechselst du per Klick zwischen **Kunde, Mobiler Betrieb, Lack-Werkstatt und Verwaltung**. Mit **„Demo zurücksetzen“** fängst du neu an.

**Einmalig einrichten:**
1. Melde dich auf https://app.netlify.com an.
2. Wähle **„Add new project“** (bzw. „Add new site“) → **„Import an existing project“** → **GitHub**.
3. Wähle das Repository **`carcarevalu`**.
4. Stelle ein:
   - **Branch to deploy:** `claude/practical-euler-l8jwmn`
   - **Base directory:** `plattform`
   - Build command und Publish directory werden automatisch aus `plattform/netlify.toml` übernommen. Lass die Felder leer bzw. so, wie sie vorausgefüllt sind.
5. Klicke auf **„Deploy“**. Nach etwa 1–2 Minuten bekommst du einen Link wie `https://irgendwas-123.netlify.app`.
6. Optional: Unter **Project configuration → Change project name** einen schönen Namen vergeben, z. B. `mhl-agentur-demo` → `https://mhl-agentur-demo.netlify.app`.

Danach wird der Link bei jeder Änderung auf dem Branch **automatisch aktualisiert**.

Deine bestehende Website auf Netlify bleibt davon unberührt, weil das ein **neues, eigenes Projekt** ist.

**Grenzen der Demo:** Andere Personen sehen deine Testdaten nicht, denn jeder Browser hat seine eigene Demo. Für echte Kunden braucht es die Server-Version mit Datenbank.


## A) Im Browser über GitHub Codespaces (ohne eigenen Server)

1. Öffne das Repository auf GitHub und wähle den Branch, den du testen willst.
2. Klicke auf den grünen Knopf **„Code“**, dann auf den Reiter **„Codespaces“** und auf **„Create codespace on …“**.
3. Warte etwa 1–2 Minuten. Die Website startet automatisch, und der Tab **„MHL Agentur Website“** (Port 3000) öffnet sich. Falls nicht, öffne unten den Reiter **„Ports“** und klicke bei Port 3000 auf das Globus-Symbol.
4. Melde dich mit einem Demo-Zugang an:

| Rolle | E-Mail | Passwort |
|---|---|---|
| Kunde | kunde@demo.test | demo-kunde-1234 |
| Mobiler Aufbereiter | betrieb@demo.test | demo-betrieb-1234 |
| Lack-Fachbetrieb / Werkstatt | werkstatt@demo.test | demo-werkstatt-1234 |
| Verwaltung (Agentur) | admin@demo.test | demo-admin-1234 |

Tipp: Teste Kunde und Betrieb gleichzeitig. Öffne dafür einen zweiten Browser oder ein privates Fenster.

**Neu anfangen mit frischen Demo-Daten:** Im Terminal des Codespace `Strg+C` drücken und dann diesen Befehl ausführen:

```bash
npm run demo:reset && npm run demo
```

**Codespace beenden:** Auf github.com/codespaces kannst du ihn stoppen oder löschen. Das kostenlose Kontingent ist begrenzt, ungenutzte Codespaces stoppen nach 30 Minuten von selbst.

Die Demo-Daten sind nur zum Testen gedacht und gehören nicht auf die echte Website.

## Öffentlicher Link (Render.com, kostenlos)

1. Öffne https://render.com/deploy?repo=https://github.com/Lukas050605/carcarevalu/tree/claude/practical-euler-l8jwmn
2. Melde dich mit **„GitHub“** an und erlaube Render den Zugriff auf das Repository `carcarevalu`.
3. Klicke auf **„Deploy Blueprint“** bzw. **„Apply“**. Die Einstellungen kommen aus `render.yaml`, du musst nichts eintragen.
4. Nach etwa 3–5 Minuten steht oben ein Link wie `https://mhl-agentur-demo.onrender.com`. Das ist deine Website.

Im Gratis-Tarif schläft die Seite nach 15 Minuten ohne Besucher ein. Der erste Aufruf dauert dann etwa 1 Minute. Die Daten werden bei jedem Neustart auf die Demo-Daten zurückgesetzt, und oben auf der Seite steht ein gelber DEMO-Hinweis. Neue Änderungen auf dem Branch landen automatisch dort.

## B) Automatische Tests auf GitHub

Bei jeder Änderung im Ordner `plattform/` laufen auf GitHub automatisch:
- **13 API-Tests**: Rechte, Provisionsrechnung, Stornierung, doppelte Abrechnung, Foto-Uploads, Filter, Kalender, Kundenprofil
- **ein Browser-Durchlauf in Handygröße**: Anfrage → Angebot → Auftrag → Bestätigung → Rechnung

So siehst du das Ergebnis: Auf GitHub den Reiter **„Actions“** öffnen und den Lauf **„Plattform testen“** wählen. Ein grüner Haken bedeutet, dass alles in Ordnung ist. Unten unter **„Artifacts → screenshots“** kannst du die Screenshots herunterladen.

Starten kannst du den Lauf auch per Hand: **Actions → Plattform testen → „Run workflow“**.

## C) Auf dem eigenen Computer

Voraussetzung ist Node.js 22. Im Ordner `plattform` ausführen:

```bash
npm install
```
```bash
npm run demo
```

Danach http://localhost:3000 öffnen.
