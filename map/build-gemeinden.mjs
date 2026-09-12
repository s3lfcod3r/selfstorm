// SelfStorm Gemeinde-Grenzen: holt einmalig die DWD-Warngebiete auf Gemeindeebene
// (dwd:Warngebiete_Gemeinden, © GeoBasis-DE / BKG, Daten modifiziert durch DWD) und schreibt
// je Bundesland eine kompakte Datei map/gemeinden/DE-XX.json. Nur bei Gebietsreformen neu ausführen.
//
// Format: { k: [Kreisnamen], g: [[Warnzellen-ID, Name, Kreis-Index, [Ring, …]], …] }
// Ring = [lon0, lat0, dlon, dlat, …] in 1/10000 Grad (Deltas); Füllregel evenodd (Löcher/Exklaven).
import fs from "node:fs/promises";

const URL_WFS = "https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeName=dwd:Warngebiete_Gemeinden&outputFormat=application/json&propertyName=SHAPE,WARNCELLID,KURZNAME,KREIS,BLID";
const LAND = { "01":"DE-SH","02":"DE-HH","03":"DE-NI","04":"DE-HB","05":"DE-NW","06":"DE-HE","07":"DE-RP","08":"DE-BW",
  "09":"DE-BY","10":"DE-SL","11":"DE-BE","12":"DE-BB","13":"DE-MV","14":"DE-SN","15":"DE-ST","16":"DE-TH" };

const r = await fetch(URL_WFS);
if (!r.ok) throw new Error("DWD-GeoServer HTTP " + r.status);
const geo = await r.json();
const out = {};
for (const f of geo.features) {
  const p = f.properties, id = LAND[p.BLID]; if (!id || !f.geometry) continue;
  const st = out[id] || (out[id] = { k: [], g: [] });
  let ki = st.k.indexOf(p.KREIS || ""); if (ki < 0) { st.k.push(p.KREIS || ""); ki = st.k.length - 1; }
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) for (const ring of poly) {
    const pts = ring.slice(0, ring.length > 3 ? -1 : ring.length).map(c => [Math.round(c[0] * 1e4), Math.round(c[1] * 1e4)]);
    const flat = [pts[0][0], pts[0][1]];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      if (dx || dy) flat.push(dx, dy);
    }
    if (flat.length >= 6) rings.push(flat);
  }
  if (rings.length) st.g.push([p.WARNCELLID, p.KURZNAME || "", ki, rings]);
}
await fs.mkdir(new URL("./gemeinden/", import.meta.url), { recursive: true });
for (const id in out) {
  out[id].g.sort((a, b) => a[1].localeCompare(b[1], "de"));
  await fs.writeFile(new URL(`./gemeinden/${id}.json`, import.meta.url), JSON.stringify(out[id]));
  console.log(id, out[id].g.length, "Gemeinden");
}
