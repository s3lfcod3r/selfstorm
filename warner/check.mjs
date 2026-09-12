// SelfStorm Wächter — prüft die konfigurierten Orte und schickt bei Gefahr
// ntfy-Push + E-Mail. Läuft als GitHub Action (stündlich). Entprellung via state.json.
//
// Die Gefahren-Heuristik kommt aus ../hazards.js (gemeinsam mit Webseite und Karte).

import fs from "node:fs/promises";
import H from "../hazards.js";

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

const { HAZ_ADVICE, analyze } = H;

function fmtWhen(t) {
  if (!t) return "";
  const dt = new Date(t);
  return WD[dt.getUTCDay()] + " " + dt.getUTCDate() + "." + (dt.getUTCMonth() + 1) + ". um " + t.slice(11, 16) + " Uhr";
}
const LEVEL = ["Ruhig", "Ruhig", "Beobachten", "Warnung", "Unwetter"];
const cap = s => String(s || "").toLowerCase().replace(/(^|[\s/-])([a-zäöü])/g, (m, a, b) => a + b.toUpperCase());

// Amtliche DWD-Warnungen (Bright Sky) — autoritative Ebene, deckt auch Sturmflut/Hitze usw.
async function fetchDwd(loc) {
  try {
    const r = await fetch(`https://api.brightsky.dev/alerts?lat=${loc.lat}&lon=${loc.lon}&tz=Europe/Berlin`);
    if (!r.ok) { console.error("DWD-Abruf fehlgeschlagen für", loc.name, "HTTP " + r.status); return { level: 0, items: [], unknown: true }; }
    const j = await r.json();
    const SEVLV = { minor: 2, moderate: 3, severe: 4, extreme: 4 };
    const items = (j.alerts || []).map(x => ({ event: x.event_de || x.event_en || "Warnung", sev: x.severity }));
    return { level: items.reduce((m, i) => Math.max(m, SEVLV[i.sev] || 2), 0), items, unknown: false };
  } catch (e) { console.error("DWD-Abruf fehlgeschlagen für", loc.name, e.message); return { level: 0, items: [], unknown: true }; }
}

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

const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
const threshold = cfg.notifyLevel || 3;
let changed = false;
const alerts = [];

for (const loc of cfg.locations) {
  const p = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon,
    hourly: "temperature_2m,precipitation,precipitation_probability,cape,wind_gusts_10m,weather_code,snowfall,visibility",
    timezone: "auto", forecast_days: String(cfg.forecastDays || 3)
  });
  let fc = null;
  try {
    const r = await fetch(`${FC}?${p}`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    fc = await r.json();
  } catch (e) { console.error("Wetter-Abruf fehlgeschlagen für", loc.name, e.message); }

  // Vorhersage weg: Ort NICHT überspringen — die amtliche DWD-Ebene wird trotzdem geprüft.
  const a = fc ? analyze(fc) : { events: [], peak: 0, peakTime: null, peakLabel: "", tags: new Set(), unknown: true };
  const dwd = await fetchDwd(loc);
  const peak = Math.max(a.peak, dwd.level);
  const key = `${loc.lat},${loc.lon}`;
  const prev = state[key] || { level: 0, date: null };

  if (peak >= threshold) {
    const alreadyToday = prev.date === todayStr && prev.level >= peak;
    if (!alreadyToday) { alerts.push({ loc, a, dwd, peak }); state[key] = { level: peak, date: todayStr }; changed = true; }
  } else if (prev.level && !a.unknown && !dwd.unknown) {
    state[key] = { level: 0, date: todayStr }; changed = true; // Entwarnung nur bei vollständiger Datenlage
  }
}

for (const { loc, a, dwd, peak } of alerts) {
  const official = dwd.items.length ? `Amtliche DWD-Warnung: ${cap(dwd.items[0].event)}. ` : "";
  const title = `SelfStorm: ${loc.name} - ${LEVEL[peak]}`;
  const missing = a.unknown ? "Wettervorhersage nicht abrufbar — Warnung beruht allein auf der amtlichen DWD-Meldung. "
    : dwd.unknown ? "DWD-Warnungen nicht abrufbar — Einschätzung nur aus der Wettervorhersage. " : "";
  const body = missing + official + (a.unknown ? "" : verdict(a));
  console.log("ALARM:", title, "|", body);
  try { await sendNtfy(title, body, peak); } catch (e) { console.error("ntfy-Fehler:", e.message); }
  try { await sendMail(title, `${loc.name}\n${body}`); } catch (e) { console.error("mail-Fehler:", e.message); }
}

if (changed) await fs.writeFile(stateUrl, JSON.stringify(state, null, 2) + "\n");
console.log(`Fertig: ${cfg.locations.length} Orte geprüft, ${alerts.length} Alarm(e).`);
