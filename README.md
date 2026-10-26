<div align="center">

<img src="assets/logo.png" width="240" alt="SelfStorm logo" />

**Your severe-weather & hail traffic light — multiple weather models, honestly cross-checked.**<br>
*Deine Unwetter- und Hagel-Ampel — mehrere Wettermodelle, ehrlich gegeneinander gerechnet.*

![Version](https://img.shields.io/badge/version-0.4.0-33A78C)
[![License](https://img.shields.io/badge/license-All%20rights%20reserved-8A9CAA)](LICENSE)
![Web](https://img.shields.io/badge/web-HTML%20%2B%20JS-43D3AD)
![Watcher](https://img.shields.io/badge/watcher-GitHub%20Actions-1F7763)
[![Live](https://img.shields.io/badge/live-wetter.selfcoder.de-6F95AD)](https://wetter.selfcoder.de)

**[🇬🇧 English](#-english) · [🇩🇪 Deutsch](#-deutsch)**

📰 **What's new / Neuigkeiten** → [CHANGELOG.md](CHANGELOG.md)

</div>

---

<a id="-english"></a>

## 🇬🇧 English

SelfStorm shows a simple traffic light (green/yellow/orange/red) for severe weather — especially **hail**, thunderstorms, wind and heavy rain — for **your locations**. Instead of a single source it **cross-checks several weather models** ("1 of 4 models sees thunderstorms"), so you can judge how confident a warning is. Live at **[wetter.selfcoder.de](https://wetter.selfcoder.de)**.

Part of the **Self** family (SelfMailer, SelfStream, SelfArchiver, SelfDashboard …) — same design system; hosted on GitHub Pages + GitHub Actions instead of Unraid.

> **TL;DR** — hail & storm traffic light · multi-model consensus · official DWD + BBK warnings · Germany map · ntfy / e-mail watcher · no account

> **⚠️ Not an official warning service:** SelfStorm is a free hobby project. In an emergency, always rely on the German Weather Service (WarnWetter app / NINA) or your national weather service.

### 📑 Table of contents

[Features](#en-features) · [Data sources](#en-sources) · [Architecture](#en-architecture) · [Quick start](#en-quick-start) · [Configuration](#en-configuration) · [Security](#en-security) · [Tech stack](#en-tech-stack) · [Development](#en-development) · [Roadmap](#en-roadmap)

<a id="en-features"></a>

### ✨ Features

**🚦 Traffic light**
- **Location search** by place name or postal code — as many locations as you like
- **Traffic light per location** with a plain-language verdict, risk ring, hazard chips and a risk outlook per 24 h
- **Model consensus** over several weather models (ICON, GFS, ECMWF, GEM via Open-Meteo)
- **Many hazards:** hail, thunderstorm, wind, heavy rain, heat, frost, black ice, snow, fog
- **Location detail:** rain nowcast, 24 h curve, gust gauge, sunrise/sunset

**🗺️ Maps & official warnings**
- **Official DWD warnings** (Bright Sky), per municipality on the map; outages are shown as such, not as "all clear"
- **BBK / MoWaS warnings** (nationwide list and warning areas on the map, all-clears labelled, expired ones filtered, refresh every 5 min while the tab is visible + manual refresh)
- **Interactive Germany map** with drag and zoom, forecast as areas, 3-day time-lapse, rain as radar areas (mm/h), districts and villages when zooming in

**🔔 Watcher**
- **Personal watcher** via GitHub Actions (hourly): **ntfy push** and **e-mail** when a hazard reaches the set level, debounced per event

<a id="en-sources"></a>

### 🛰️ Data sources

| Source | Used for |
|---|---|
| [Open-Meteo](https://open-meteo.com) | Weather models (ICON, GFS, ECMWF, GEM) and geocoding |
| [Zippopotam](https://zippopotam.us) | Postal code lookup |
| [Bright Sky](https://brightsky.dev) | Official DWD warnings |
| [warnung.bund.de](https://warnung.bund.de/meldungen) | BBK / MoWaS warnings ([JSON](https://warnung.bund.de/api31/mowas/mapData.json)), mirrored into `bbk/` |
| DWD (`maps.dwd.de`) | Warning areas |
| OpenStreetMap (Overpass) | Place names for the map |

<a id="en-architecture"></a>

### 🧭 Architecture

```text
GitHub Pages (wetter.selfcoder.de)          GitHub Actions
┌───────────────────────────────┐    ┌──────────────────────────────────┐
│ index.html  traffic light     │    │ waechter.yml  hourly             │
│ karte.html  Germany map       │    │   warner/check.mjs → ntfy/e-mail │
│ hazards.js  shared heuristic  │◀───│ karte.yml     every 6 h          │
│ bbk*.js     BBK warnings      │    │   map/build-grid.mjs → grid.json │
│ map/        map + GeoJSON     │    │ bbk.yml       every 10 min       │
└──────────────┬────────────────┘    │   warner/bbk-sync.mjs → bbk/     │
               │                     └──────────────────────────────────┘
               ▼ browser fetches directly
     Open-Meteo · Bright Sky · Zippopotam · DWD
```

BBK warnings are mirrored into the repo by `bbk-sync.mjs`, because the browser cannot load them directly (CORS).

<a id="en-quick-start"></a>

### 🚀 Quick start

Open **[wetter.selfcoder.de](https://wetter.selfcoder.de)** → search your location → done. Locations stay in your browser.

To run it yourself: plain HTML/JS, no build, no API key — serve the folder with any static web server:

```bash
python -m http.server 8080
```

Open `http://localhost:8080` → the traffic light runs locally.

<a id="en-configuration"></a>

### ⚙️ Configuration

The **watcher** reads its locations from [`warner/config.json`](warner/config.json) (`notifyLevel`, `forecastDays`, `locations` with `name`, `lat`, `lon`) and its channels from GitHub Actions secrets:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NTFY_URL` | – | `https://ntfy.sh` | ntfy server |
| `NTFY_TOPIC` | – | – | ntfy topic for push |
| `SMTP_HOST` | – | – | Mail server (e-mail is skipped without SMTP config) |
| `SMTP_PORT` | – | `587` | Mail server port |
| `SMTP_USER` | – | – | Mail login, also the sender |
| `SMTP_PASS` | – | – | Mail password |
| `MAIL_TO` | – | – | Recipient |

> **💡 Tip:** `notifyLevel` (default `3`) is the traffic-light level from which the watcher notifies.

<a id="en-security"></a>

### 🛡️ Security

- **No account, privacy-friendly** — your locations are stored only in your browser (`localStorage`)
- **No API keys** in the website — all weather sources are free and keyless
- Warning texts are rendered with `textContent` (no HTML injection from foreign data); DWD requests with 12 s timeout and whitelist
- Watcher secrets (ntfy, SMTP) live only as **GitHub Actions secrets**
- **Deliberate trade-offs** (documented): the watcher's locations are in the public repo (`warner/config.json`); the audit of 29 Sep 2026 ([docs/PRUEFBERICHT.md](docs/PRUEFBERICHT.md)) lists open findings (e.g. watcher state saved despite a send error, missing `res.ok` check) — not yet fixed; no meteorological calibration

Security update history → [CHANGELOG.md](CHANGELOG.md) (entries marked 🔒).

<a id="en-tech-stack"></a>

### 🧱 Tech stack

| Part | Tech |
|---|---|
| Web | Plain HTML · CSS · JavaScript (no build) · Self brand tokens · Orbitron (self-hosted) |
| Map | Own map module (`map/dekarte.js`) · GeoJSON (states, municipalities) |
| Watcher | Node.js scripts · nodemailer · ntfy |
| Deploy | GitHub Pages · GitHub Actions (3 cron workflows) |

<a id="en-development"></a>

### 🛠️ Development

Concept and background: [docs/KONZEPT.md](docs/KONZEPT.md). Run the watcher once locally:

```bash
cd warner
node check.mjs
```

**Tests:**

```bash
node tests/bbk.cjs
node tests/bbk-fetch.cjs
```

<a id="en-roadmap"></a>

### 🗺️ Roadmap

- [x] **Phase 1** — live traffic-light website (GitHub Pages)
- [x] **Phase 2** — watcher with push and e-mail notifications
- [x] Official DWD warnings, interactive Germany map, BBK warnings
- [ ] **Phase 3** — polish, fix open audit findings, app

<p align="right"><a href="#-english">⬆ back to top</a></p>

---

<a id="-deutsch"></a>

## 🇩🇪 Deutsch

SelfStorm zeigt für **deine Orte** eine einfache Ampel (grün/gelb/orange/rot) für Extremwetter — besonders **Hagel**, Gewitter, Sturm und Starkregen. Statt einer einzelnen Quelle werden **mehrere Wettermodelle transparent gegeneinander gerechnet** („1 von 4 Modellen sieht Gewitter“), damit du einschätzen kannst, wie sicher eine Warnung ist. Live unter **[wetter.selfcoder.de](https://wetter.selfcoder.de)**.

Teil der **Self**-Familie (SelfMailer, SelfStream, SelfArchiver, SelfDashboard …) — gleiches Design-System; läuft auf GitHub Pages + GitHub Actions statt auf Unraid.

> **Kurz** — Hagel- und Unwetter-Ampel · Modell-Konsens · amtliche DWD- + BBK-Warnungen · Deutschlandkarte · Wächter per ntfy / E-Mail · kein Konto

> **⚠️ Keine amtliche Warnung:** SelfStorm ist ein freies Hobby-Projekt. Im Ernstfall gilt immer der Deutsche Wetterdienst (WarnWetter-App / NINA).

### 📑 Inhaltsverzeichnis

[Funktionen](#de-funktionen) · [Datenquellen](#de-quellen) · [Architektur](#de-architektur) · [Schnellstart](#de-schnellstart) · [Konfiguration](#de-konfiguration) · [Sicherheit](#de-sicherheit) · [Tech-Stack](#de-tech-stack) · [Entwicklung](#de-entwicklung) · [Roadmap](#de-roadmap)

<a id="de-funktionen"></a>

### ✨ Funktionen

**🚦 Ampel**
- **Ortssuche** nach Name oder Postleitzahl — beliebig viele Orte
- **Ampel je Ort** mit Klartext-Fazit, Risiko-Ring, Gefahren-Chips und Risiko-Ausblick je 24 Std.
- **Modell-Konsens** über mehrere Wettermodelle (ICON, GFS, ECMWF, GEM über Open-Meteo)
- **Viele Gefahren:** Hagel, Gewitter, Sturm, Starkregen, Hitze, Frost, Glätte, Schnee, Nebel
- **Orts-Detail:** Regen-Nowcast, 24-Std.-Kurve, Böen-Anzeige, Sonnenzeiten

**🗺️ Karten & amtliche Warnungen**
- **Amtliche DWD-Warnungen** (Bright Sky), gemeindegenau auf der Karte; Ausfälle werden als Ausfall gezeigt, nicht als Entwarnung
- **BBK-/MoWaS-Warnungen** (bundesweite Liste und Warngebiete auf der Karte, Entwarnungen beschriftet, abgelaufene ausgefiltert, alle 5 min neu solange der Tab sichtbar ist + manuelles Aktualisieren)
- **Interaktive Deutschlandkarte** zum Ziehen und Zoomen, Vorhersage als Flächen, 3-Tage-Zeitraffer, Regen als Radar-Fläche (mm/h), Stadtteile und Dörfer beim Heranzoomen

**🔔 Wächter**
- **Persönlicher Wächter** über GitHub Actions (stündlich): **ntfy-Push** und **E-Mail**, sobald eine Gefahr die eingestellte Stufe erreicht, pro Ereignis entprellt

<a id="de-quellen"></a>

### 🛰️ Datenquellen

| Quelle | Wofür |
|---|---|
| [Open-Meteo](https://open-meteo.com) | Wettermodelle (ICON, GFS, ECMWF, GEM) und Ortssuche |
| [Zippopotam](https://zippopotam.us) | Postleitzahl-Auflösung |
| [Bright Sky](https://brightsky.dev) | Amtliche DWD-Warnungen |
| [warnung.bund.de](https://warnung.bund.de/meldungen) | BBK-/MoWaS-Warnungen ([JSON](https://warnung.bund.de/api31/mowas/mapData.json)), gespiegelt nach `bbk/` |
| DWD (`maps.dwd.de`) | Warngebiete |
| OpenStreetMap (Overpass) | Ortsnamen für die Karte |

<a id="de-architektur"></a>

### 🧭 Architektur

```text
GitHub Pages (wetter.selfcoder.de)          GitHub Actions
┌───────────────────────────────┐    ┌──────────────────────────────────┐
│ index.html  Ampel             │    │ waechter.yml  stündlich          │
│ karte.html  Deutschlandkarte  │    │   warner/check.mjs → ntfy/E-Mail │
│ hazards.js  gemeinsame Regeln │◀───│ karte.yml     alle 6 Std.        │
│ bbk*.js     BBK-Warnungen     │    │   map/build-grid.mjs → grid.json │
│ map/        Karte + GeoJSON   │    │ bbk.yml       alle 10 min        │
└──────────────┬────────────────┘    │   warner/bbk-sync.mjs → bbk/     │
               │                     └──────────────────────────────────┘
               ▼ Browser fragt direkt ab
     Open-Meteo · Bright Sky · Zippopotam · DWD
```

BBK-Warnungen spiegelt `bbk-sync.mjs` ins Repo, weil der Browser sie nicht direkt laden darf (CORS).

<a id="de-schnellstart"></a>

### 🚀 Schnellstart

**[wetter.selfcoder.de](https://wetter.selfcoder.de)** öffnen → Ort suchen → fertig. Deine Orte bleiben in deinem Browser.

Selbst betreiben: reines HTML/JS, kein Build, kein API-Key — den Ordner mit einem beliebigen statischen Webserver ausliefern:

```bash
python -m http.server 8080
```

`http://localhost:8080` öffnen → die Ampel läuft lokal.

<a id="de-konfiguration"></a>

### ⚙️ Konfiguration

Der **Wächter** liest seine Orte aus [`warner/config.json`](warner/config.json) (`notifyLevel`, `forecastDays`, `locations` mit `name`, `lat`, `lon`) und seine Kanäle aus GitHub-Actions-Secrets:

| Variable | Pflicht | Standard | Zweck |
|---|---|---|---|
| `NTFY_URL` | – | `https://ntfy.sh` | ntfy-Server |
| `NTFY_TOPIC` | – | – | ntfy-Topic für Push |
| `SMTP_HOST` | – | – | Mailserver (ohne SMTP-Daten wird die E-Mail übersprungen) |
| `SMTP_PORT` | – | `587` | Port des Mailservers |
| `SMTP_USER` | – | – | Mail-Login, zugleich Absender |
| `SMTP_PASS` | – | – | Mail-Passwort |
| `MAIL_TO` | – | – | Empfänger |

> **💡 Tipp:** `notifyLevel` (Standard `3`) ist die Ampelstufe, ab der der Wächter Bescheid gibt.

<a id="de-sicherheit"></a>

### 🛡️ Sicherheit

- **Kein Konto, datensparsam** — deine Orte liegen nur in deinem Browser (`localStorage`)
- **Keine API-Keys** in der Webseite — alle Wetterquellen sind kostenlos und ohne Schlüssel
- Warntexte werden per `textContent` ausgegeben (kein HTML aus Fremddaten); DWD-Abfragen mit 12-s-Timeout und Erlaubnisliste
- Wächter-Zugangsdaten (ntfy, SMTP) liegen nur als **GitHub-Actions-Secrets** vor
- **Bewusste Kompromisse** (dokumentiert): Die Orte des Wächters stehen im öffentlichen Repo (`warner/config.json`); der Prüfbericht vom 29.09.2026 ([docs/PRUEFBERICHT.md](docs/PRUEFBERICHT.md)) nennt offene Befunde (z. B. Wächter-Stand wird trotz Versandfehler gespeichert, fehlende `res.ok`-Prüfung) — noch nicht behoben; keine meteorologische Kalibrierung

Verlauf der Sicherheitsupdates → [CHANGELOG.md](CHANGELOG.md) (Einträge mit 🔒).

<a id="de-tech-stack"></a>

### 🧱 Tech-Stack

| Teil | Technik |
|---|---|
| Web | Reines HTML · CSS · JavaScript (kein Build) · Self-Marken-Tokens · Orbitron (selbst gehostet) |
| Karte | Eigenes Kartenmodul (`map/dekarte.js`) · GeoJSON (Bundesländer, Gemeinden) |
| Wächter | Node.js-Skripte · nodemailer · ntfy |
| Deploy | GitHub Pages · GitHub Actions (3 Zeitplan-Workflows) |

<a id="de-entwicklung"></a>

### 🛠️ Entwicklung

Konzept und Hintergrund: [docs/KONZEPT.md](docs/KONZEPT.md). Wächter einmal lokal laufen lassen:

```bash
cd warner
node check.mjs
```

**Tests:**

```bash
node tests/bbk.cjs
node tests/bbk-fetch.cjs
```

<a id="de-roadmap"></a>

### 🗺️ Roadmap

- [x] **Phase 1** — Live-Ampel-Webseite (GitHub Pages)
- [x] **Phase 2** — Wächter mit Push- und E-Mail-Benachrichtigung
- [x] Amtliche DWD-Warnungen, interaktive Deutschlandkarte, BBK-Warnungen
- [ ] **Phase 3** — Feinschliff, offene Prüfbefunde beheben, App

<p align="right"><a href="#-deutsch">⬆ nach oben</a></p>

---

## ⚖️ Lizenz / License

**🇩🇪 Alle Rechte vorbehalten.** © 2026 s3lfcod3r / SelfCoder

Du darfst die Software **privat und nicht-kommerziell** installieren und benutzen (z. B. im Homelab, über Docker oder Unraid).

**Ohne schriftliche Erlaubnis verboten:** kommerzielle Nutzung · Kopieren · Verändern · Weitergeben · Einbauen in eigene Projekte (auch Closed Source) · Verkaufen.

Details: [LICENSE](LICENSE)

**🇬🇧 All rights reserved.** © 2026 s3lfcod3r / SelfCoder

You may install and use the software **privately and non-commercially** (e.g. in your home lab, via Docker or Unraid).

**Not permitted without written permission:** commercial use · copying · modifying · redistributing · incorporating into other projects (including closed source) · selling.

Details: [LICENSE](LICENSE)

---

---

<div align="center">

**SelfStorm** · part of the Self family · Teil der Self-Familie<br>
made with ⛈️ for self-hosting

</div>
