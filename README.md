<div align="center">

<img src="assets/shield.png" alt="SelfStorm" width="96" />

# SelfStorm

**Deine Unwetter- und Hagel-Ampel — mehrere Wettermodelle, ehrlich gegeneinander gerechnet.**
_Your severe-weather & hail traffic light — multiple weather models, honestly cross-checked._

🌐 **[wetter.selfcoder.de](https://wetter.selfcoder.de)** · Teil der [Self-Reihe](https://selfcoder.de)

</div>

---

## 🇩🇪 Deutsch

SelfStorm zeigt für **deine Orte** eine einfache Ampel (grün/gelb/orange/rot) für Extremwetter —
besonders **Hagel**, Gewitter, Sturm und Starkregen. Statt einer einzelnen Quelle werden **mehrere
Wettermodelle transparent gegeneinander gerechnet** ("1 von 4 Modellen sieht Gewitter"), damit du
einschätzen kannst, wie sicher eine Warnung ist.

- 🔎 **Ortssuche** nach Name oder Postleitzahl — beliebig viele Orte
- 🚦 **Ampel je Ort** mit Klartext-Fazit und 3-Tage-Zeitleiste
- 🧮 **Modell-Konsens** über mehrere Wettermodelle (Open-Meteo)
- 🔒 **Kein Konto, datensparsam** — deine Orte bleiben nur in deinem Browser
- ⚡ **Reines HTML/JS** — kein Build, kein API-Key, läuft auf GitHub Pages

> ⚠️ SelfStorm ist ein freies Hobby-Projekt und **ersetzt keine amtliche Warnung**.
> Im Ernstfall gilt immer der Deutsche Wetterdienst (WarnWetter-App / NINA).

## 🇬🇧 English

SelfStorm shows a simple traffic light (green/yellow/orange/red) for severe weather — especially
**hail**, thunderstorms, wind and heavy rain — for **your locations**. Instead of a single source it
**cross-checks several weather models** ("1 of 4 models sees thunderstorms") so you can judge how
confident a warning is.

- 🔎 Search by place name or postal code — as many locations as you like
- 🚦 Per-location traffic light with a plain-language verdict and 3-day timeline
- 🧮 Multi-model consensus (Open-Meteo)
- 🔒 No account, privacy-friendly — locations stay in your browser only
- ⚡ Plain HTML/JS — no build, no API key, runs on GitHub Pages

> ⚠️ SelfStorm is a free hobby project and is **not an official warning service**.
> In an emergency, always rely on your national weather service.

---

## 🛠️ Datenquellen / Data sources

- [Open-Meteo](https://open-meteo.com) — Wettermodelle & Geocoding (ICON, GFS, ECMWF, GEM)
- [Zippopotam](https://zippopotam.us) — PLZ-Auflösung / postal-code lookup

## 🗺️ Roadmap

- [x] **Phase 1** — Live-Ampel-Webseite (GitHub Pages)
- [x] **Phase 2** — Wächter mit Push- & E-Mail-Benachrichtigung
- [ ] **Phase 3** — Feinschliff, amtliche DWD-Warnungen, App

## 📄 Lizenz / License

**🇩🇪 Alle Rechte vorbehalten.** © 2026 s3lfcod3r / SelfCoder

Du darfst die Software **privat und nicht-kommerziell** installieren und benutzen (z. B. im Homelab, über Docker oder Unraid).

**Ohne schriftliche Erlaubnis verboten:** kommerzielle Nutzung · Kopieren · Verändern · Weitergeben · Einbauen in eigene Projekte (auch Closed Source) · Verkaufen.

Details: [LICENSE](LICENSE)

**🇬🇧 All rights reserved.** © 2026 s3lfcod3r / SelfCoder

You may install and use the software **privately and non-commercially** (e.g. in your home lab, via Docker or Unraid).

**Not permitted without written permission:** commercial use · copying · modifying · redistributing · incorporating into other projects (including closed source) · selling.

Details: [LICENSE](LICENSE)

## BBK-Warnmeldungen
Zeigt die bundesweite MoWaS-Liste auf Haupt- und Kartenseite. Keine automatische Ortszuordnung. DWD-Meldungen sind separat. Entwarnungen sind beschriftet, abgelaufene Meldungen werden ausgefiltert. Quellen: [Übersicht](https://warnung.bund.de/meldungen) · [JSON](https://warnung.bund.de/api31/mowas/mapData.json). Aktualisierung alle 5 min (solange Tab sichtbar) plus manueller Refresh. Netzwerk-/Formatfehler werden als „nicht abrufbar“ angezeigt.

Testbefehle:
node tests/bbk.cjs
node tests/bbk-fetch.cjs
