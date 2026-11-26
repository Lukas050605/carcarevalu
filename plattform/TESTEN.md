# Website testen – so geht's

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
