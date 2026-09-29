# PRÜFBERICHT

**Datum:** 2026-09-29
**Geprüfter Ausgangscommit:** 1de28ba5b2b7e339adf96ffca081323105337fe7
**Status:** Teilweise geprüft – Gesamtprüfung nicht vollständig bestanden

## Geprüft
Statisch geprüft wurden `hazards.js`, `index.html`, `map/dekarte.js`, `map/build-*.mjs`, `warner/check.mjs` und beide Workflows. DWD-Fix und BBK-Integration sind umgesetzt.

## Behoben
- DWD-Ausfall versus leere Liste, 12s Timeout, Whitelist.
- BBK/MoWaS bundesweit auf Haupt/Kartenseite: keine Ortszuordnung, 5min Timer, manuell Refresh, Cancel gesondert, Ablaufdatum gefiltert, sichere textContent-Ausgabe.
- Tests `node tests/bbk.cjs` und `node tests/bbk-fetch.cjs` bestanden; Syntax + Diff bestanden.
- Im sichtbaren Browser Haupt- und Kartenseite der Vorschau mit 12 echten Meldungen und manuellem Refresh erfolgreich.

## Offene Befunde
**Hoch**
- `warner/check.mjs:204–208`: State trotz Versandfehler.
- `warner/check.mjs:106`: kein `res.ok`.
- `map/dekarte.js:167`: spätere DWD-Ladefehler nicht markiert.
- `map/dekarte.js:685`: live Label.

**Mittel**
- `index.html:565–576`: Gewitterkonsens beinhaltet vergangene Stunden/null-Arrays.
- `hazards.js:45/77`: fehlende Temp wird 0.
- `hazards.js:57`: mögliche falsche Glätte.

## Grenzen
- Kein echter Nachrichtenversand getestet.
- Kein vollständiger Sicherheitstest.
- Keine meteorologische Kalibrierung.
- 5min Timer nicht über Zeitlauf beobachtet.
- Unterschiedliche Abruf-/Modellzeiten sind kein eigenständiger Fehler.

> **Fazit:** Die geprüften Bereiche zeigen nachweisbare Verbesserungen (DWD-Fix, BBK-Integration, Tests). Die offenen Befunde sind **nicht** behoben; eine Gesamtprüfung kann daher **nicht** als vollständig bestanden bezeichnet werden.
