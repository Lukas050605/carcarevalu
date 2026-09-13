# CAR CARE VALU — Squarespace Codeblöcke

Sechs fertige Snippets. Jede Datei komplett markieren, kopieren und in Squarespace
in einen **Codeblock** einfügen (Seite bearbeiten → Block hinzufügen → Code → Modus: HTML).
Kopf- und Fußzeile liefert Squarespace, die Snippets enthalten bewusst keine Navigation.

## Welche Datei wohin

| Datei | Squarespace-Seite |
|---|---|
| `1-anfahrt-rechner.html` | Startseite — Kilometer- und Spritkostenrechner |
| `2-pakete-reinigung.html` | Normale Innenreinigung — BASIS 59 € / PREMIUM 69 € |
| `3-abo-pakete.html` | Pflege-Abo — Komfort 40 € / Exklusiv 50 € |
| `4-minispiel.html` | Minispiel „Valu Run" mit Rabatt |
| `5-vorher-nachher.html` | Leistungen — Vorher/Nachher-Regler |
| `6-abo-termin.html` | Abo-Termin für bestehende Abo-Kunden |

## Vor dem Veröffentlichen prüfen

**Bilder (nur Datei 5).** Squarespace kennt meine Bilddateien nicht. Lade die sechs Fotos
in Squarespace hoch, kopiere je die Grafikadresse und ersetze im Snippet die Platzhalter
`BILD-URL-KOFFERRAUM-VORHER` usw.

**Buchungslinks.** Eingebaut sind:
- Innenreinigung BASIS: `appointmentType=87583879`
- Aufbereitung PREMIUM: `appointmentType=87583912`
- Komfort-Abo: `catalog.php … id=2097859`
- Exklusiv-Paket: `catalog.php … id=2097867`

**Rechner-Werte** stehen oben im Skript von Datei 1: `FREI = 50` (freie Kilometer) und
`SATZ = 0.89` (Euro je Zusatzkilometer, berechnet für Hin- und Rückfahrt).

**Rabatt im Spiel** steht in Datei 4 in der Funktion `rabatt()`: 30 gefahrene Kilometer
ergeben 1 Prozent, gedeckelt bei 8 Prozent.

## Schriften

Die Snippets nutzen Archivo, Manrope und JetBrains Mono. Wenn du diese Schriften nicht in
Squarespace eingestellt hast, greifen automatisch Systemschriften. Damit sie genau wie im
Entwurf aussehen, einmalig einfügen unter **Website → Website-Tools → Code-Injektion → Header**:

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Manrope:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

## Hintergrundfarbe

Die Snippets sind auf einen hellen Beige-Hintergrund abgestimmt (`#efeae0`). Stell den
Abschnittshintergrund in Squarespace auf diesen Wert, dann passen die Karten dazu.

## Noch offen

- Datenschutzerklärung und AGB-Seite (Pflicht vor dem Livegang)
- Echte Kundenbewertungen
- Impressum: mit Squarespace-Textblöcken bauen, das ist besser für Suchmaschinen
  als ein Codeblock. Inhalt liegt in `Impressum.dc.html`.
