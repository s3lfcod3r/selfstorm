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
    const items = (j.alerts || []).map(x => ({ event: x.event_de || x.event_en || "Warnung", sev: x.severity, lv: SEVLV[x.severity] || 2 }));
    return { level: items.reduce((m, i) => Math.max(m, i.lv), 0), items, unknown: false };
  } catch (e) { console.error("DWD-Abruf fehlgeschlagen für", loc.name, e.message); return { level: 0, items: [], unknown: true }; }
}

// --- Ereignisse & Entprellung ---------------------------------------------------
// Ein Ereignis = zusammenhängendes Zeitfenster einer Gefahren-Kategorie ab Alarmstufe
// (Lücken bis TOL_H Stunden werden überbrückt) bzw. eine amtliche DWD-Warnung.
// state.json merkt sich pro Ort die bereits gemeldeten Ereignisse. Erneut gemeldet wird
// nur, wenn das Level eines Ereignisses steigt, ein neues Ereignis auftaucht (andere
// Kategorie oder Zeitfenster ohne Überlappung) oder nach einer Entwarnung wieder Gefahr kommt.
const TOL_H = 3;
const clock = t => Date.parse(t + "Z"); // "YYYY-MM-DDTHH:MM" (Ortszeit) → vergleichbare ms

function forecastEvents(a, threshold) {
  const open = new Map(), list = [];
  for (const e of a.events) {
    if (e.lv < threshold) continue;
    const cat = "wx:" + (H.HAZ_CAT[e.label] || e.label);
    let ev = open.get(cat);
    if (!ev || clock(e.time) - clock(ev.end) > TOL_H * 3600e3) {
      ev = { cat, level: e.lv, label: e.label, peakTime: e.time, start: e.time, end: e.time };
      open.set(cat, ev); list.push(ev);
    } else {
      ev.end = e.time;
      if (e.lv > ev.level) { ev.level = e.lv; ev.label = e.label; ev.peakTime = e.time; }
    }
  }
  return list;
}

function dwdEvents(dwd, threshold) {
  const byCat = new Map();
  for (const i of dwd.items) {
    if (i.lv < threshold) continue;
    const cat = "dwd:" + cap(i.event), prev = byCat.get(cat);
    if (!prev || i.lv > prev.level) byCat.set(cat, { cat, level: i.lv, label: cap(i.event), peakTime: null, start: null, end: null });
  }
  return [...byCat.values()];
}

function sameEvent(known, ev) {
  if (known.cat !== ev.cat) return false;
  if (!known.start || !ev.start) return true; // DWD-Warnung: kein Zeitfenster
  const tol = TOL_H * 3600e3;
  return clock(ev.start) <= clock(known.end) + tol && clock(known.start) <= clock(ev.end) + tol;
}

function isEvent(x) {
  return x && typeof x.cat === "string" && Number.isFinite(x.level) &&
    (x.start == null || (typeof x.start === "string" && typeof x.end === "string"));
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

// Open-Meteo liefert stündlich ab 00:00 des Tages. Stunden vor der aktuellen Stunde
// (Ortszeit des Orts laut utc_offset_seconds) zählen für den Alarm nicht mehr.
function upcomingHours(fc, nowMs = Date.now()) {
  const h = fc.hourly;
  if (!h || !Array.isArray(h.time)) return fc;
  const nowHour = new Date(nowMs + (fc.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  let from = h.time.findIndex(t => String(t).slice(0, 13) >= nowHour);
  if (from < 0) from = h.time.length;
  const hourly = {};
  for (const [k, v] of Object.entries(h)) hourly[k] = Array.isArray(v) ? v.slice(from) : v;
  return { ...fc, hourly };
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
  const a = fc ? analyze(upcomingHours(fc)) : { events: [], peak: 0, peakTime: null, peakLabel: "", tags: new Set(), unknown: true };
  const dwd = await fetchDwd(loc);
  const key = `${loc.lat},${loc.lon}`;
  const prev = (state[key] && typeof state[key] === "object") ? state[key] : {};
  const prevLevel = Number.isFinite(prev.level) ? prev.level : 0;
  const known = Array.isArray(prev.events) ? prev.events.filter(isEvent).map(x => ({ ...x })) : [];
  // Altes Format { level, date }: am selben Tag nicht erneut auf gleicher/niedrigerer Stufe melden
  const legacyLevel = (!Array.isArray(prev.events) && prev.date === todayStr) ? prevLevel : 0;
  const events = [...forecastEvents(a, threshold), ...dwdEvents(dwd, threshold)];

  if (events.length) {
    // abgelaufene Vorhersage-Ereignisse vergessen (nur wenn die Ortszeit bekannt ist)
    const nowClock = fc ? Date.now() + (fc.utc_offset_seconds || 0) * 1000 : null;
    const kept = known.filter(k => !k.end || nowClock == null || clock(k.end) >= nowClock - TOL_H * 3600e3);
    const triggered = [];
    for (const ev of events) {
      const k = kept.find(x => sameEvent(x, ev));
      if (!k) {
        if (ev.level > legacyLevel) triggered.push(ev);
        kept.push({ ...ev });
        continue;
      }
      if (ev.level > k.level) { triggered.push(ev); Object.assign(k, { level: ev.level, label: ev.label, peakTime: ev.peakTime }); }
      if (k.start && ev.start) { if (ev.start < k.start) k.start = ev.start; if (ev.end > k.end) k.end = ev.end; }
    }
    const next = {
      level: kept.reduce((m, k) => Math.max(m, k.level), 0),
      date: triggered.length ? todayStr : (prev.date || todayStr),
      events: kept
    };
    if (triggered.length) {
      triggered.sort((x, y) => y.level - x.level || String(x.start || "").localeCompare(String(y.start || "")));
      alerts.push({ loc, a, dwd, triggered });
    }
    if (JSON.stringify(next) !== JSON.stringify(state[key])) { state[key] = next; changed = true; }
  } else if ((prevLevel || known.length) && !a.unknown && !dwd.unknown) {
    state[key] = { level: 0, date: todayStr, events: [] }; changed = true; // Entwarnung nur bei vollständiger Datenlage
  }
}

for (const { loc, a, dwd, triggered } of alerts) {
  const top = triggered[0], level = top.level;
  const dwdTrig = triggered.find(e => e.cat.startsWith("dwd:"));
  const wxTrig = triggered.filter(e => e.cat.startsWith("wx:"));
  const official = dwdTrig ? `Amtliche DWD-Warnung: ${dwdTrig.label}. `
    : dwd.items.length ? `Amtliche DWD-Warnung: ${cap(dwd.items[0].event)}. ` : "";
  const title = `SelfStorm: ${loc.name} - ${LEVEL[level]}`;
  const missing = a.unknown ? "Wettervorhersage nicht abrufbar — Warnung beruht allein auf der amtlichen DWD-Meldung. "
    : dwd.unknown ? "DWD-Warnungen nicht abrufbar — Einschätzung nur aus der Wettervorhersage. " : "";
  const wx = wxTrig.length ? wxTrig.map(e => verdict({ peak: e.level, peakTime: e.peakTime, peakLabel: e.label })).join(" ")
    : (!a.unknown && a.peak >= 2) ? verdict(a) : "";
  const body = (missing + official + wx).trim();
  console.log("ALARM:", title, "|", body);
  try { await sendNtfy(title, body, level); } catch (e) { console.error("ntfy-Fehler:", e.message); }
  try { await sendMail(title, `${loc.name}\n${body}`); } catch (e) { console.error("mail-Fehler:", e.message); }
}

if (changed) await fs.writeFile(stateUrl, JSON.stringify(state, null, 2) + "\n");
console.log(`Fertig: ${cfg.locations.length} Orte geprüft, ${alerts.length} Alarm(e).`);
