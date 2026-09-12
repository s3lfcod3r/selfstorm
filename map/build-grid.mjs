// SelfStorm Karten-Vorrechner: legt ein Raster über Deutschland, holt für jeden
// Rasterpunkt die ~72h-Vorhersage von Open-Meteo (bulk) und schreibt map/grid.json.
// Läuft als GitHub Action (alle paar Stunden). Damit lädt die Karte nur eine fertige
// Datei — schnell und schonend für die kostenlosen API-Limits.

import fs from "node:fs/promises";
import H from "../hazards.js";

const FC = "https://api.open-meteo.com/v1/forecast";
const STEP = 0.2;          // Rasterweite in Grad (~14–22 km)
// Open-Meteo (frei) zählt jeden Punkt als Abruf: ~1.150 Punkte × 4 Läufe/Tag ≈ 4.600 von 10.000/Tag.
// Feinere Details lädt die Karte beim Hineinzoomen im Browser nach (map/dekarte.js).
const FORECAST_DAYS = 3;   // ~72 Stunden (deckt auch übermorgen ab)
const BATCH = 100;         // Koordinaten pro API-Aufruf
const PAUSE_MS = 7000;     // Pause zwischen Batches (Limit 600 Abrufe/Minute)
const sleep = ms => new Promise(r => setTimeout(r, ms));

const geo = JSON.parse(await fs.readFile(new URL("./germany.geojson", import.meta.url), "utf8"));
const multi = geo.features[0].geometry.coordinates; // MultiPolygon

// --- Punkt-in-Polygon (Ray Casting), nur äußere Ringe ---
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const hit = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
function inGermany(lon, lat) {
  for (const poly of multi) if (inRing(lon, lat, poly[0])) return true;
  return false;
}

// --- bbox aus GeoJSON ---
let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
(function scan(c){ if (typeof c[0] === "number") { minLon=Math.min(minLon,c[0]);maxLon=Math.max(maxLon,c[0]);minLat=Math.min(minLat,c[1]);maxLat=Math.max(maxLat,c[1]); } else c.forEach(scan); })(multi);

// --- Raster erzeugen (nur Punkte innerhalb Deutschlands) ---
const grid = [];
for (let lat = Math.ceil(minLat / STEP) * STEP; lat <= maxLat; lat += STEP) {
  for (let lon = Math.ceil(minLon / STEP) * STEP; lon <= maxLon; lon += STEP) {
    if (inGermany(lon, lat)) grid.push({ lat: +lat.toFixed(2), lon: +lon.toFixed(2) });
  }
}
console.log(`Rasterpunkte in Deutschland: ${grid.length}`);

// --- Gefahren-Level + Art pro Stunde: gemeinsame Heuristik aus ../hazards.js ---
// Kategorien: 1 Gewitter/Hagel, 2 Sturm, 3 Starkregen, 4 Hitze, 5 Frost/Glätte, 6 Schnee, 7 Nebel

// --- Open-Meteo im Batch abfragen ---
let hours = null;
for (let b = 0; b < grid.length; b += BATCH) {
  const chunk = grid.slice(b, b + BATCH);
  const p = new URLSearchParams({
    latitude: chunk.map(g => g.lat).join(","),
    longitude: chunk.map(g => g.lon).join(","),
    hourly: "cape,weather_code,wind_gusts_10m,precipitation,temperature_2m,snowfall,visibility",
    timezone: "UTC",
    forecast_days: String(FORECAST_DAYS)
  });
  if (b) await sleep(PAUSE_MS);
  let r = await fetch(FC, { method: "POST", body: p });
  if (r.status === 429) { await sleep(65000); r = await fetch(FC, { method: "POST", body: p }); }
  if (!r.ok) throw new Error("Open-Meteo HTTP " + r.status + " bei Batch " + b);
  const data = await r.json();
  const arr = Array.isArray(data) ? data : [data];
  arr.forEach((res, i) => {
    const h = res.hourly;
    if (!hours) hours = h.time;
    const g = chunk[i]; g.lv = []; g.hz = [];
    for (let k = 0; k < h.time.length; k++) {
      const r = H.hourHazard(h, k);
      g.lv.push(r.lv); g.hz.push(r.cat);
    }
  });
  console.log(`Batch ${b / BATCH + 1}: ${arr.length} Punkte`);
}

// --- Ausgabe schreiben (kompakt) ---
const out = {
  generated: new Date().toISOString(),       // Zeitpunkt der Berechnung (ISO, UTC)
  bbox: { minLat: +minLat.toFixed(3), maxLat: +maxLat.toFixed(3), minLon: +minLon.toFixed(3), maxLon: +maxLon.toFixed(3) },
  step: STEP,
  hours,                                       // ~72 UTC-Zeitstempel
  // lv/hz kompakt als Ziffernfolge: ein Zeichen pro Stunde
  points: grid.map(g => ({ lat: g.lat, lon: g.lon, lv: (g.lv || []).join(""), hz: (g.hz || []).join("") }))
};
await fs.writeFile(new URL("./grid.json", import.meta.url), JSON.stringify(out));
console.log(`grid.json geschrieben: ${out.points.length} Punkte × ${hours ? hours.length : 0} Stunden`);
