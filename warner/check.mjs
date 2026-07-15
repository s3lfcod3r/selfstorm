// SelfStorm Wächter — prüft die konfigurierten Orte und schickt bei Gefahr
// ntfy-Push + E-Mail. Läuft als GitHub Action (stündlich). Entprellung via state.json.
//
// Hinweis: Die Analyse-Heuristik ist bewusst identisch zur Webseite (index.html)
// gehalten. Wird sie dort angepasst, hier mitziehen (kleine, überschaubare Duplizierung).

import fs from "node:fs/promises";

const FC = "https://api.open-meteo.com/v1/forecast";
const SITE = "https://wetter.selfcoder.de";
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const cfgUrl = new URL("./config.json", import.meta.url);
const stateUrl = new URL("./state.json", import.meta.url);
const cfg = JSON.parse(await fs.readFile(cfgUrl, "utf8"));
let state = {};
try { state = JSON.parse(await fs.readFile(stateUrl, "utf8")); } catch { /* erster Lauf */ }

const NTFY_URL = process.env.NTFY_URL || "https://ntfy.sh";
const NTFY_TOPIC = process.env.NTFY_TOPIC || "";

const num = v => (v == null || Number.isNaN(v)) ? 0 : v;

const HAZ_ADVICE = {
  "Hagel": "Auto möglichst unterstellen oder schützen.",
  "Gewitter": "Bei Gewitter drinnen bleiben, Loses draußen sichern.",
  "Gewittergefahr": "Kräftige Gewitter mit Hagel möglich — Lage beobachten.",
  "Gewitter möglich": "Einzelne Gewitter möglich.",
  "Orkanböen": "Sturmgefahr — Loses sichern, Bäume/Gerüste meiden.",
  "Sturmböen": "Loses draußen sichern, im Wald aufpassen.",
  "Windböen": "Vereinzelt kräftige Böen.",
  "Starkregen": "Überflutung und Aquaplaning möglich.",
  "kräftiger Regen": "Zeitweise kräftiger Regen.",
  "starke Hitze": "Große Hitze — viel trinken, Mittagssonne meiden.",
  "Hitze": "Warm — viel trinken, Schatten suchen.",
  "Glatteis": "Glatteis durch gefrierenden Regen — sehr vorsichtig fahren und gehen.",
  "Glättegefahr": "Rutschgefahr durch Glätte.",
  "strenger Frost": "Strenger Frost — Frostschutz beachten.",
  "Frost": "Frost — Glätte und Kälte möglich.",
  "starker Schneefall": "Starker Schneefall — Behinderungen und Glätte.",
  "Schneefall": "Schneefall — mögliche Glätte.",
  "dichter Nebel": "Dichter Nebel — sehr schlechte Sicht im Verkehr.",
  "Nebel": "Nebel — schlechte Sicht."
};

function analyze(fc) {
  const h = fc.hourly, t = h.time, out = { events: [], peak: 0, peakTime: null, peakLabel: "", tags: new Set() };
  for (let i = 0; i < t.length; i++) {
    const code = h.weather_code[i], cape = num(h.cape[i]), gust = num(h.wind_gusts_10m[i]),
          pr = num(h.precipitation[i]), temp = num(h.temperature_2m && h.temperature_2m[i]),
          snow = num(h.snowfall && h.snowfall[i]), vis = num(h.visibility && h.visibility[i]);
    const hits = [];
    if (code === 96 || code === 99) hits.push([4, "Hagel"]);
    else if (code === 95) hits.push([cape >= 1500 ? 4 : 3, "Gewitter"]);
    if (cape >= 1200) hits.push([3, "Gewittergefahr"]); else if (cape >= 800) hits.push([2, "Gewitter möglich"]);
    if (gust >= 90) hits.push([4, "Orkanböen"]); else if (gust >= 70) hits.push([3, "Sturmböen"]); else if (gust >= 55) hits.push([2, "Windböen"]);
    if (pr >= 15) hits.push([3, "Starkregen"]); else if (pr >= 5) hits.push([2, "kräftiger Regen"]);
    if (temp >= 36) hits.push([3, "starke Hitze"]); else if (temp >= 30) hits.push([2, "Hitze"]);
    if (code === 66 || code === 67) hits.push([3, "Glatteis"]); else if (temp <= 1 && temp >= -3 && pr >= 0.1) hits.push([2, "Glättegefahr"]);
    if (temp <= -10) hits.push([3, "strenger Frost"]); else if (temp <= -5) hits.push([2, "Frost"]);
    if (snow >= 5 || code === 75 || code === 86) hits.push([3, "starker Schneefall"]); else if (snow >= 1 || code === 71 || code === 73 || code === 85) hits.push([2, "Schneefall"]);
    if (vis > 0 && vis < 200) hits.push([3, "dichter Nebel"]); else if ((vis > 0 && vis < 1000) || code === 45 || code === 48) hits.push([2, "Nebel"]);
    if (!hits.length) continue;
    hits.sort((a, b) => b[0] - a[0]);
    const lv = hits[0][0], label = hits[0][1];
    if (lv >= 2) { out.events.push({ time: t[i], lv, label }); hits.forEach(x => out.tags.add(x[1])); }
    if (lv > out.peak) { out.peak = lv; out.peakTime = t[i]; out.peakLabel = label; }
  }
  return out;
}

function fmtWhen(t) {
  if (!t) return "";
  const dt = new Date(t);
  return WD[dt.getUTCDay()] + " " + dt.getUTCDate() + "." + (dt.getUTCMonth() + 1) + ". um " + t.slice(11, 16) + " Uhr";
}
const LEVEL = ["Ruhig", "Ruhig", "Beobachten", "Warnung", "Unwetter"];

function verdict(a) {
  const when = fmtWhen(a.peakTime), lbl = a.peakLabel, advice = HAZ_ADVICE[lbl] || "";
  const kind = a.peak === 4 ? " (Unwetter)" : "";
  return `${lbl}${kind} — Schwerpunkt ${when}.${advice ? " " + advice : ""}`;
}

async function sendNtfy(title, body, level) {
  if (!NTFY_TOPIC) { console.log("kein NTFY_TOPIC gesetzt → Push übersprungen"); return; }
  const prio = level >= 4 ? "urgent" : "high";
  const tags = level >= 4 ? "warning,cloud_with_lightning_and_rain" : "cloud_with_lightning";
  const res = await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
    method: "POST", body,
    headers: { "Title": title, "Priority": prio, "Tags": tags, "Click": SITE }
  });
  console.log("ntfy:", res.status);
}

async function sendMail(subject, text) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_TO) { console.log("keine SMTP-Config → E-Mail übersprungen"); return; }
  const nodemailer = (await import("nodemailer")).default;
  const port = +(SMTP_PORT || 587);
  const t = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await t.sendMail({ from: SMTP_USER, to: MAIL_TO, subject, text: text + "\n\n— SelfStorm · " + SITE });
  console.log("E-Mail gesendet an", MAIL_TO);
}

const todayStr = new Date().toISOString().slice(0, 10);
const threshold = cfg.notifyLevel || 3;
let changed = false;
const alerts = [];

for (const loc of cfg.locations) {
  const p = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon,
    hourly: "temperature_2m,precipitation,precipitation_probability,cape,wind_gusts_10m,weather_code,snowfall,visibility",
    timezone: "auto", forecast_days: String(cfg.forecastDays || 3)
  });
  let fc;
  try {
    const r = await fetch(`${FC}?${p}`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    fc = await r.json();
  } catch (e) { console.error("Abruf fehlgeschlagen für", loc.name, e.message); continue; }

  const a = analyze(fc);
  const key = `${loc.lat},${loc.lon}`;
  const prev = state[key] || { level: 0, date: null };

  if (a.peak >= threshold) {
    const alreadyToday = prev.date === todayStr && prev.level >= a.peak;
    if (!alreadyToday) { alerts.push({ loc, a }); state[key] = { level: a.peak, date: todayStr }; changed = true; }
  } else if (prev.level) {
    state[key] = { level: 0, date: todayStr }; changed = true; // Entwarnung merken
  }
}

for (const { loc, a } of alerts) {
  const title = `SelfStorm: ${loc.name} - ${LEVEL[a.peak]}`;
  const body = verdict(a);
  console.log("ALARM:", title, "|", body);
  try { await sendNtfy(title, body, a.peak); } catch (e) { console.error("ntfy-Fehler:", e.message); }
  try { await sendMail(title, `${loc.name}\n${body}`); } catch (e) { console.error("mail-Fehler:", e.message); }
}

if (changed) await fs.writeFile(stateUrl, JSON.stringify(state, null, 2) + "\n");
console.log(`Fertig: ${cfg.locations.length} Orte geprüft, ${alerts.length} Alarm(e).`);
