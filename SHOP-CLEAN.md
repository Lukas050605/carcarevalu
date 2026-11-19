# CCV Shop & Clean

Pop-up-Innenpflege am REWE Center Nidderau: Kunde scannt QR-Code, meldet sich an, gibt den Schlüssel ab,
geht einkaufen und drückt in der App auf Stopp. Abrechnung pro Minute.

| Datei | Zweck |
|---|---|
| `site/shop-clean.html` | Kunden-App (Ziel des QR-Codes auf dem Banner) |
| `site/shop-clean-team.html` | Deine Kasse (nicht verlinkt, `noindex`, Login nötig) |
| `site/shop-clean.js` / `.css` | App-Code, Einstellungen ganz oben in `CFG` |
| `firebase/firestore.rules` | Sicherheitsregeln für die Firebase-Datenbank |

**Demo-Modus:** Solange in `site/shop-clean.js` bei `CFG.firebase.apiKey` nichts steht, speichert die App nur im
Browser (zum Testen). Für den Live-Betrieb Firebase-Projekt anlegen (Firestore in `europe-west3`,
E-Mail/Passwort-Login für info@carcarevalu.de, Regeln aus `firebase/firestore.rules`) und die Web-Config in `CFG.firebase` eintragen.

Preise (Minutenpreis, Mindestbetrag, Abholzeit, Standgebühr) änderst du in der Kasse unter ⚙︎.
