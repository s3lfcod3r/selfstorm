// SelfStorm Karten-Vorrechner: legt ein Raster über Deutschland, holt für jeden
// Rasterpunkt die 48h-Vorhersage von Open-Meteo (bulk) und schreibt map/grid.json.
// Läuft als GitHub Action (alle paar Stunden). Damit lädt die Karte nur eine fertige
// Datei — schnell und schonend für die kostenlosen API-Limits.

import fs from "node:fs/promises";

const FC = "https://api.open-meteo.com/v1/forecast";
const STEP = 0.4;          // Rasterweite in Grad (~28–44 km)
const FORECAST_DAYS = 3;   // ~72 Stunden (deckt auch übermorgen ab)
const BATCH = 100;         // Koordinaten pro API-Aufruf

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

// --- Gefahren-Level pro Stunde (gleiche Heuristik wie Seite/Warner) ---
const n = v => (v == null || Number.isNaN(v)) ? 0 : v;
function level(code, cape, gust, pr) {
  let lv = 0;
  if (code === 96 || code === 99) lv = Math.max(lv, 4);
  else if (code === 95) lv = Math.max(lv, cape >= 1500 ? 4 : 3);
  if (cape >= 1200) lv = Math.max(lv, 3); else if (cape >= 800) lv = Math.max(lv, 2);
  if (gust >= 90) lv = Math.max(lv, 4); else if (gust >= 70) lv = Math.max(lv, 3); else if (gust >= 55) lv = Math.max(lv, 2);
  if (pr >= 15) lv = Math.max(lv, 3); else if (pr >= 5) lv = Math.max(lv, 2);
  return lv;
}

// --- Open-Meteo im Batch abfragen ---
let hours = null;
for (let b = 0; b < grid.length; b += BATCH) {
  const chunk = grid.slice(b, b + BATCH);
  const p = new URLSearchParams({
    latitude: chunk.map(g => g.lat).join(","),
    longitude: chunk.map(g => g.lon).join(","),
    hourly: "cape,weather_code,wind_gusts_10m,precipitation",
    timezone: "UTC",
    forecast_days: String(FORECAST_DAYS)
  });
  const r = await fetch(`${FC}?${p}`);
  if (!r.ok) throw new Error("Open-Meteo HTTP " + r.status + " bei Batch " + b);
  const data = await r.json();
  const arr = Array.isArray(data) ? data : [data];
  arr.forEach((res, i) => {
    const h = res.hourly;
    if (!hours) hours = h.time;
    const g = chunk[i];
    g.lv = h.time.map((_, k) => level(h.weather_code[k], n(h.cape[k]), n(h.wind_gusts_10m[k]), n(h.precipitation[k])));
  });
  console.log(`Batch ${b / BATCH + 1}: ${arr.length} Punkte`);
}

// --- Ausgabe schreiben (kompakt) ---
const out = {
  generated: hours ? hours[0] : null,        // erster Vorhersagestundenwert (UTC)
  bbox: { minLat: +minLat.toFixed(3), maxLat: +maxLat.toFixed(3), minLon: +minLon.toFixed(3), maxLon: +maxLon.toFixed(3) },
  step: STEP,
  hours,                                       // 48 UTC-Zeitstempel
  points: grid.map(g => ({ lat: g.lat, lon: g.lon, lv: g.lv || [] }))
};
await fs.writeFile(new URL("./grid.json", import.meta.url), JSON.stringify(out));
console.log(`grid.json geschrieben: ${out.points.length} Punkte × ${hours ? hours.length : 0} Stunden`);
