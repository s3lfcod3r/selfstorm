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

// --- Gefahren-Level + Art pro Stunde (gleiche Heuristik wie Seite/Warner) ---
// Kategorien: 1 Gewitter/Hagel, 2 Sturm, 3 Starkregen, 4 Hitze, 5 Frost/Glätte, 6 Schnee, 7 Nebel
const n = v => (v == null || Number.isNaN(v)) ? 0 : v;
function haz(code, cape, gust, pr, temp, snow, vis) {
  const hits = [];
  if (code === 96 || code === 99) hits.push([4, 1]);
  else if (code === 95) hits.push([cape >= 1500 ? 4 : 3, 1]);
  if (cape >= 1200) hits.push([3, 1]); else if (cape >= 800) hits.push([2, 1]);
  if (gust >= 90) hits.push([4, 2]); else if (gust >= 70) hits.push([3, 2]); else if (gust >= 55) hits.push([2, 2]);
  if (pr >= 15) hits.push([3, 3]); else if (pr >= 5) hits.push([2, 3]);
  if (temp >= 36) hits.push([3, 4]); else if (temp >= 30) hits.push([2, 4]);
  if (code === 66 || code === 67) hits.push([3, 5]); else if (temp <= 1 && temp >= -3 && pr >= 0.1) hits.push([2, 5]);
  if (temp <= -10) hits.push([3, 5]); else if (temp <= -5) hits.push([2, 5]);
  if (snow >= 5 || code === 75 || code === 86) hits.push([3, 6]); else if (snow >= 1 || code === 71 || code === 73 || code === 85) hits.push([2, 6]);
  if (vis > 0 && vis < 200) hits.push([3, 7]); else if ((vis > 0 && vis < 1000) || code === 45 || code === 48) hits.push([2, 7]);
  if (!hits.length) return [0, 0];
  hits.sort((a, b) => b[0] - a[0]);
  return hits[0];
}

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
  const r = await fetch(`${FC}?${p}`);
  if (!r.ok) throw new Error("Open-Meteo HTTP " + r.status + " bei Batch " + b);
  const data = await r.json();
  const arr = Array.isArray(data) ? data : [data];
  arr.forEach((res, i) => {
    const h = res.hourly;
    if (!hours) hours = h.time;
    const g = chunk[i]; g.lv = []; g.hz = [];
    for (let k = 0; k < h.time.length; k++) {
      const r = haz(h.weather_code[k], n(h.cape[k]), n(h.wind_gusts_10m[k]), n(h.precipitation[k]),
                    n(h.temperature_2m && h.temperature_2m[k]), n(h.snowfall && h.snowfall[k]), n(h.visibility && h.visibility[k]));
      g.lv.push(r[0]); g.hz.push(r[1]);
    }
  });
  console.log(`Batch ${b / BATCH + 1}: ${arr.length} Punkte`);
}

// --- Ausgabe schreiben (kompakt) ---
const out = {
  generated: hours ? hours[0] : null,        // erster Vorhersagestundenwert (UTC)
  bbox: { minLat: +minLat.toFixed(3), maxLat: +maxLat.toFixed(3), minLon: +minLon.toFixed(3), maxLon: +maxLon.toFixed(3) },
  step: STEP,
  hours,                                       // 48 UTC-Zeitstempel
  points: grid.map(g => ({ lat: g.lat, lon: g.lon, lv: g.lv || [], hz: g.hz || [] }))
};
await fs.writeFile(new URL("./grid.json", import.meta.url), JSON.stringify(out));
console.log(`grid.json geschrieben: ${out.points.length} Punkte × ${hours ? hours.length : 0} Stunden`);
