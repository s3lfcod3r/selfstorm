// SelfStorm Ortsnamen: holt einmalig Städte, Stadtteile, Dörfer und Weiler aus OpenStreetMap (Overpass,
// © OpenStreetMap-Mitwirkende, ODbL) und schreibt je Bundesland eine kompakte Datei map/orte/DE-XX.json.
// Nur gelegentlich neu ausführen.
//
// Format: { n: [Namen], t: "Rang je Ort", p: [lon, lat, …] in 1/1000 Grad ab (5°, 47°) }
// Rang: 0 Großstadt · 1 Stadt · 2 Stadtteil · 3 Dorf · 4 Viertel · 5 Weiler — sortiert nach Rang
import fs from "node:fs/promises";

const RANK = { city: 0, town: 1, borough: 2, suburb: 2, village: 3, quarter: 4, hamlet: 5 };
const Q = `[out:csv(::lat,::lon,place,name;false;"\\t")][timeout:250];
area["ISO3166-1"="DE"][admin_level=2]->.de;
(node["place"~"^(city|town|village|suburb|borough|quarter|hamlet)$"]["name"](area.de););out;`;

const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: Q }), headers: { "User-Agent": "SelfStorm-Karte (github.com/s3lfcod3r/selfstorm)", Accept: "*/*" } });
if (!r.ok) throw new Error("Overpass HTTP " + r.status);
const rows = (await r.text()).trim().split("\n").map(l => l.split("\t"));

const geo = JSON.parse(await fs.readFile(new URL("./bundeslaender.geojson", import.meta.url), "utf8"));
const polys = g => g.type === "Polygon" ? [g.coordinates] : g.coordinates;
const inRing = (x, y, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
  const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
const states = geo.features.map(f => {
  const b = [180, 90, -180, -90]; polys(f.geometry).forEach(p => p[0].forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }));
  return { id: f.properties.id, g: f.geometry, b, c: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] };
});
// Grenzorte außerhalb der vereinfachten Umrisse: nächstes Land, dessen Rahmen den Ort enthält
const stateOf = (x, y) => (states.find(s => x >= s.b[0] && x <= s.b[2] && y >= s.b[1] && y <= s.b[3] && polys(s.g).some(p => inRing(x, y, p[0])))
  || states.filter(s => x >= s.b[0] - .1 && x <= s.b[2] + .1 && y >= s.b[1] - .1 && y <= s.b[3] + .1)
    .sort((a, b) => Math.hypot(x - a.c[0], y - a.c[1]) - Math.hypot(x - b.c[0], y - b.c[1]))[0])?.id;

const out = {};
for (const [lat, lon, place, name] of rows) {
  const x = +lon, y = +lat, rank = RANK[place]; if (!name || rank == null || !isFinite(x)) continue;
  const id = stateOf(x, y); if (!id) continue;
  (out[id] || (out[id] = [])).push([rank, name, Math.round((x - 5) * 1000), Math.round((y - 47) * 1000)]);
}
await fs.mkdir(new URL("./orte/", import.meta.url), { recursive: true });
for (const id in out) {
  const l = out[id].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], "de"));
  await fs.writeFile(new URL(`./orte/${id}.json`, import.meta.url),
    JSON.stringify({ n: l.map(o => o[1]), t: l.map(o => o[0]).join(""), p: l.flatMap(o => [o[2], o[3]]) }));
  console.log(id, l.length, "Orte");
}
