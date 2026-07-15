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

function analyze(fc) {
  const h = fc.hourly, t = h.time, out = { events: [], peak: 0, peakTime: null, tags: new Set() };
  for (let i = 0; i < t.length; i++) {
    const code = h.weather_code[i], cape = num(h.cape[i]), gust = num(h.wind_gusts_10m[i]),
          pr = num(h.precipitation[i]), pp = num(h.precipitation_probability[i]);
    let lv = 0; const tags = [];
    if (code === 96 || code === 99) { lv = Math.max(lv, 4); tags.push("Hagel"); }
    else if (code === 95) { lv = Math.max(lv, cape >= 1500 ? 4 : 3); tags.push("Gewitter"); }
    if (cape >= 1200) { lv = Math.max(lv, 3); tags.push("sehr labil"); }
    else if (cape >= 800) { lv = Math.max(lv, 2); tags.push("labil"); }
    if (gust >= 90) { lv = Math.max(lv, 4); tags.push("Orkanböen"); }
    else if (gust >= 70) { lv = Math.max(lv, 3); tags.push("Sturmböen"); }
    else if (gust >= 55) { lv = Math.max(lv, 2); tags.push("Windböen"); }
    if (pr >= 15) { lv = Math.max(lv, 3); tags.push("Starkregen"); }
    else if (pr >= 5) { lv = Math.max(lv, 2); tags.push("kräftiger Regen"); }
    if (lv >= 2) { out.events.push({ time: t[i], code, cape, gust, lv }); tags.forEach(x => out.tags.add(x)); }
    if (lv > out.peak) { out.peak = lv; out.peakTime = t[i]; }
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
  const when = fmtWhen(a.peakTime);
  const hail = a.tags.has("Hagel");
  if (a.peak === 4) return (hail ? "Hagelgefahr" : "Unwettergefahr") + " — Schwerpunkt " + when +
    ". " + (hail ? "Auto möglichst unterstellen oder schützen." : "Empfindliches im Freien sichern.");
  if (a.peak === 3) return "Gewitter-/Sturmgefahr — Schwerpunkt " + when + ". Lage im Auge behalten.";
  return "Leicht labile Lage — Schwerpunkt " + when + ".";
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
    hourly: "precipitation,precipitation_probability,cape,wind_gusts_10m,weather_code",
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
