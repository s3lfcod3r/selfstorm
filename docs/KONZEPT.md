# SelfStorm — Konzept

> **Status:** Planungsphase (nur Konzept, noch kein Code)
> **Stand:** 2026-07-15
> **Idee:** Sven

Eigener, self-hosted Unwetter-Wächter. Fragt **mehrere Wetter-APIs** ab, rechnet
für **deine Orte** eine **Konsens-Einschätzung** für Extremwetter (v. a. **Hagel**,
Sturm, Starkregen, Gewitter) und **benachrichtigt dich** rechtzeitig.

Der Unterschied zu fertigen Apps (WarnWetter, NINA, WeatherPro): SelfStorm rechnet
mehrere Quellen **transparent gegeneinander** ("3 von 4 Modellen sagen Hagel um 18 Uhr")
und läuft **bei dir** — deine Regeln, deine Schwellwerte, deine Kanäle.

---

## 1. Problem & Ziel

**Problem:** Fertige Warn-Apps zeigen eine einzelne Quelle als Wahrheit. Man weiß
nicht, wie sicher die Warnung ist, und man ist an deren Kanäle/Schwellwerte gebunden.

**Ziel:** Ein kleiner Dienst, der
1. mehrere freie Wetterquellen für **mehrere Orte** abfragt,
2. daraus eine **Konfidenz** je Gefahr ableitet (Modell-Konsens),
3. gegen die **amtliche DWD-Warnung** abgleicht,
4. und **nur dann** benachrichtigt, wenn eine Gefahr die eingestellte Schwelle
   überschreitet — über **Push (Handy)**, **SelfDashboard** und **E-Mail**.

**Explizit kein Ziel (v1):** eigene Wettermodelle rechnen, Radar-Nowcasting,
kommerzielle Nutzung.

---

## 2. Kernentscheidungen (bereits festgelegt)

| Thema | Entscheidung |
|-------|--------------|
| Umfang v1 | Erst Konzept, danach Alert-Dienst; Web-Dashboard später |
| Orte | **Mehrere** Orte (Zuhause, Arbeit, Familie …) |
| Benachrichtigung | **Push (Handy)** + **SelfDashboard** + **E-Mail** |
| Hosting | **GitHub Pages (Webseite) + GitHub Actions (Wächter-Cron)** — gewählt am 2026-07-15. Robuster als Unraid (immer erreichbar), kostenlos, HTTPS, von überall. Docker/Unraid nur noch als optionale Alternative. |
| Kosten | Nur **kostenlose** APIs ohne Kreditkarte; GitHub Pages + Actions gratis |

---

## 3. Datenquellen (alle gratis, verifiziert 2026-07-15)

| Quelle | Rolle | Key nötig? | Liefert |
|--------|-------|-----------|---------|
| **Open-Meteo** (Forecast) | Hauptmodell | Nein | CAPE, Convective Inhibition, **Hagel-Feld (Mitteleuropa)**, Böen, Niederschlag, Gewitter-Wahrscheinlichkeit |
| **Open-Meteo Ensemble** | Konsens/Streuung | Nein | Mehrere Modell-Läufe je Ort → daraus Wahrscheinlichkeit |
| **DWD amtliche Warnungen** | Ground Truth | Nein | Offizielle Warnungen als JSON, Gemeindeebene, alle ≤10 Min (`warnings_nowcast.json`) |
| **Bright Sky** | DWD-Rohdaten bequem | Nein | JSON-Wrapper um DWD-MOSMIX/Beobachtungen |
| **Met.no (Yr)** | Zweitmeinung | Nein (nur User-Agent) | Nordeuropa-Modell, gute Genauigkeit |
| *OpenWeatherMap* | *optional* | *Ja (Free-Tier)* | *später, falls mehr Streuung gewünscht* |

**Warum diese Mischung:** Open-Meteo liefert die konvektiven Parameter (der Schlüssel
für Hagel/Gewitter), das Ensemble liefert die Streuung (= Konfidenz), DWD liefert die
amtliche Wahrheit zum Abgleich. Alles ohne Kreditkarte, unter den freien Limits
(Open-Meteo: 10.000 Aufrufe/Tag).

---

## 4. Unwetter-Logik (der eigentliche Kern)

Hagel/Gewitter kommt in freien APIs selten als fertiger „ja/nein"-Wert, sondern wird
aus **konvektiven Kennzahlen** abgeleitet. Grobe Faustregeln (in der Bauphase kalibrieren):

- **CAPE** (Labilität der Luft): > ~1000 J/kg = gewitterträchtig, > ~2500 = kräftig
- **Convective Inhibition (CIN):** niedrig = Gewitter kann leicht auslösen
- **Böen (wind_gusts):** Schwellwert für Sturmwarnung
- **Niederschlagsrate:** Schwellwert für Starkregen
- **Hagel-Feld** (Open-Meteo, Mitteleuropa) direkt, wenn vorhanden

**Konsens-Formel (Beispiel):**
```
Für jede Gefahr (Hagel, Sturm, Starkregen, Gewitter) und jeden Ort:
  quellen_die_warnen = Anzahl Quellen über Schwellwert
  konfidenz = quellen_die_warnen / quellen_gesamt
  amtlich   = liegt eine DWD-Warnung vor?  (hebt Konfidenz an)

  Stufe:
    amtliche DWD-Warnung .................. ROT   (immer alarmieren)
    konfidenz >= 0.75 .................... ORANGE (alarmieren)
    konfidenz >= 0.50 .................... GELB   (nur Dashboard)
    sonst ................................ GRÜN   (still)
```

Schwellwerte und Stufen sind **konfigurierbar** pro Ort. So vermeidet man Fehlalarme
(nur 1 Modell spinnt) und verpasst keine echte Lage (Mehrheit + amtlich).

---

## 5. Architektur — komplett auf GitHub (gewählt)

Zwei Teile im selben Repo `s3lfcod3r/selfstorm`, beide gratis, kein eigener Server:

```
GitHub Repo: s3lfcod3r/selfstorm
│
├─ (A) WEBSEITE  ──────────────  GitHub Pages (statisch, HTTPS, wetter.selfcoder.de)
│      Browser des Nutzers führt JS aus:
│        - fragt LIVE Open-Meteo + Met.no ab (CORS ok, kein Key)
│        - Analyzer im Browser → Ampel je Ort, 3-Tage-Vorschau
│        - Orte + Schwellwerte in URL / localStorage
│      (läuft nur, wenn Seite offen ist → reines Anzeigen)
│
└─ (B) WÄCHTER  ───────────────  GitHub Actions (schedule-Cron, z.B. stündlich)
       Läuft im Hintergrund OHNE offene Seite:
         1. Fetcher: Open-Meteo (Forecast+Ensemble), DWD-Warnungen, Met.no
         2. Analyzer: Schwellwerte + Konsens/Konfidenz + DWD-Abgleich
         3. Alert-Engine: Stufen + Entprellung (State in Repo-Artefakt/Commit,
            damit nicht bei jedem Lauf erneut alarmiert wird)
         4. Notifier ─┬─▶ Push  (ntfy)
                      └─▶ E-Mail (SMTP)
       Orte/Regeln in  config.yaml  im Repo.
       Secrets (SMTP-Login, ntfy-Topic) in GitHub Actions Secrets.
```

**Warum diese Aufteilung:**
- **(A)** deckt „ich schau mal nach" ab — Live-Ampel, kein Server nötig.
- **(B)** deckt „warne mich von selbst" ab — der Cron-Job ist der eigentliche Wächter.
- GitHub Pages allein kann **nicht** von sich aus pushen (statisch) → dafür ist (B) da.

**Bausteine:**
- **Scheduler:** GitHub Actions `on: schedule` (Cron). Kleinster sinnvoller Takt ~30–60 Min
  (Actions-Cron ist nicht minutengenau; für Wetter völlig ausreichend). Zusätzlich manuell
  auslösbar (`workflow_dispatch`).
- **Fetcher/Analyzer:** als **gemeinsamer Code** (z. B. JS/TS), den **beide** Teile nutzen —
  die Seite im Browser und der Actions-Job in Node. Kein Doppel-Code.
- **Alert-Engine:** **Entprellung** über einen kleinen State im Repo (letzte Stufe je Ort),
  damit nicht stündlich dieselbe Warnung kommt — erst bei Neu-Eintritt/Stufenwechsel.
- **Notifier:** ntfy (Push) + SMTP (Mail). Beide **serverlos** aus dem Actions-Job heraus.
- **Storage:** kein Server-DB nötig — Config + Entprellungs-State als Dateien im Repo;
  Verlauf optional als committetes JSON.

**Kein Widget mehr im SelfDashboard nötig** (die Pages-Seite IST das Dashboard), aber später
optional als Kachel einbindbar.

---

## 6. Benachrichtigungskanäle (deine Wahl)

| Kanal | Umsetzung | Aufwand |
|-------|-----------|---------|
| **Push (Handy)** | **ntfy** (self-hosted) empfohlen — kostenlos, App im Store, ein `POST` genügt; Alternative Gotify | niedrig |
| **SelfDashboard** | Kleines Widget/Endpoint, das die aktuelle Ampel je Ort zeigt | mittel (nutzt bestehendes Dashboard) |
| **E-Mail** | Über SMTP / SelfMailer versenden | niedrig |

> ntfy passt am besten zum Self-Ökosystem (self-hosted, keine Fremd-Cloud). Für den
> ersten Test ist Telegram noch schneller, aber du hast Push gewählt → ntfy.

---

## 7. Tech-Stack (Vorschlag)

Ein **gemeinsamer Kern** in **JavaScript/TypeScript**, den Webseite *und* Actions-Job nutzen:

- **Kern-Logik (`/src`):** Fetcher (je Quelle ein Adapter) + Analyzer (Konsens/Schwellwerte).
  Reines JS/TS, läuft im Browser **und** in Node — kein Doppel-Code.
- **Webseite (`/site` oder `/docs`):** statisches HTML/JS (Single-Page reicht), importiert
  den Kern; Ampel je Ort, 3-Tage-Vorschau. Optional Vite-Build, aber auch vanilla möglich.
- **Wächter:** GitHub Actions Workflow (`.github/workflows/wächter.yml`), `on: schedule` +
  `workflow_dispatch`; ruft den Kern in Node auf und sendet Push/Mail.
- **Config:** `config.yaml` im Repo — Orte (Koordinaten + DWD-Warnzelle), Schwellwerte,
  Kanäle. Secrets (SMTP, ntfy-Topic) als **GitHub Actions Secrets**.
- **Kein SQLite/Container nötig.** Entprellungs-State als kleine JSON-Datei im Repo.
- **Tests:** Analyzer mit festen Beispiel-Wetterlagen (AAA) — hier liegt die eigentliche
  Logik, also hohe Testabdeckung.

*(Docker/FastAPI bleibt als Alternative im Hinterkopf, falls später doch ein Dauerdienst mit
Minuten-Takt gewünscht ist — für den Start ist GitHub schlanker und robuster.)*

---

## 8. Roadmap

**Phase 0 — Konzept (dieses Dokument).** ✅

**Phase 1 — Webseite auf GitHub Pages (Live-Ampel, sofort nützlich):**
1. Kern: Fetcher Open-Meteo + Met.no, Analyzer mit Konsens-Logik + Schwellwerten.
2. Statische Single-Page: Ampel je Ort + 3-Tage-Vorschau (wie die Handanalyse für 22145).
3. Orte + Schwellwerte in localStorage; mehrere Orte.
4. Auf `wetter.selfcoder.de` (oder `s3lfcod3r.github.io/selfstorm`) veröffentlichen.

**Phase 2 — Wächter (GitHub Actions Cron, echte Benachrichtigung):**
5. Workflow `on: schedule` (~stündlich) + `workflow_dispatch`.
6. DWD amtliche Warnungen dazu (Ground Truth), Alert-Engine mit Entprellung.
7. Notifier: **ntfy-Push** + **E-Mail** (SMTP). Secrets in Actions.
8. `config.yaml` für Orte/Regeln.

**Phase 3 — Feinschliff:**
- Self-Look/Branding, Karte, Verlauf, Regeln in der UI bearbeitbar.
- Optional Kachel im SelfDashboard.

**Phase 4 — optional:**
- APK (WebView), mehr Quellen, Blitz-/Radar-Daten, feinere Hagel-Kalibrierung.

---

## 9. Offene Punkte / in Bauphase zu klären

- Genaue Feldnamen & Verfügbarkeit je Ort bei Open-Meteo (Hagel-Feld nur Mitteleuropa)
  → beim ersten Fetch pro Ort prüfen, sonst auf CAPE+Böen ableiten.
- DWD-Warnungen: Zuordnung Ort → **Gemeinde-/Warnzellen-ID** (Mapping nötig).
- Schwellwerte kalibrieren (echte Lagen gegen amtliche Warnungen prüfen).
- ntfy: eigene Instanz oder ntfy.sh? (self-hosted bevorzugt).
- Rate-Limits im Blick behalten (viele Orte × viele Quellen × alle 10 Min).

---

## 10. Quellen

- Open-Meteo Doku & Features: https://open-meteo.com/en/docs , https://open-meteo.com/en/features
- Open-Meteo Ensemble-API: https://open-meteo.com/en/docs/ensemble-api
- DWD API (Community/OpenAPI): https://dwd.api.bund.dev/ , https://github.com/bundesAPI/dwd-api
- DWD Warnungen einbinden: https://www.dwd.de/DE/wetter/warnungen_aktuell/objekt_einbindung/objekteinbindung.html
- Bright Sky (freie DWD-JSON-API): https://brightsky.dev/
