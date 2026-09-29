(() => {
const isFinite = v => Number.isFinite(v);
const validCoord = c => Array.isArray(c) && c.length >= 2 && isFinite(c[0]) && isFinite(c[1]) && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90;
const ringResult = (ring, x, y) => {
  if (!ring || !ring.length) return -1;
  let inside = false;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i+1) % n];
    const onEdge = Math.abs((a[1]-y)*(b[0]-a[0]) - (a[0]-x)*(b[1]-a[1])) < 1e-12 && Math.min(a[0],b[0])-1e-12 <= x && x <= Math.max(a[0],b[0])+1e-12 && Math.min(a[1],b[1])-1e-12 <= y && y <= Math.max(a[1],b[1])+1e-12;
    if (onEdge) return 0;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1]) + a[0]) inside = !inside;
  }
  return inside ? 1 : -1;
};
function normPoly(poly) {
  if (!Array.isArray(poly) || poly.length === 0) throw new Error("empty");
  return poly.map(ring => {
    if (!Array.isArray(ring) || ring.length < 4) throw new Error("bad");
    if (!ring.every(validCoord)) throw new Error("bad");
    if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error("open");
    return ring.map(c => c.slice(0, 2));
  });
}
function normGeometry(geom) {
    if (geom === undefined || geom === null) throw new Error("geom missing");
    if (geom.type === "Polygon") {
        return { type: "Polygon", coordinates: normPoly(geom.coordinates) };
    }
    if (geom.type === "MultiPolygon") {
        if (geom.coordinates.length <= 0) throw new Error("Empty MultiPolygon");
        return { type: "MultiPolygon", coordinates: geom.coordinates.map(normPoly) };
    }
    throw new Error("Invalid geometry type");
}
const normalizeGeo = data => {
  if (!data || data.type !== 'FeatureCollection') throw new Error('not a FeatureCollection');
  if (!Array.isArray(data.features)) throw new Error('bad features');
  const out = [];
  for (const f of data.features) {
    const g = f && f.geometry;
    if (!g) throw new Error('missing geometry');
    const ng = normGeometry(g);
    out.push(ng);
  }
  return out;
};
const contains = (geometries, lon, lat) => {
  if (typeof lon !== "number" || typeof lat !== "number" || !isFinite(lon) || !isFinite(lat)) return false;
  const hit = (poly) => ringResult(poly[0], lon, lat) >= 0 && !poly.slice(1).some((r) => ringResult(r, lon, lat) === 1);
  if (!Array.isArray(geometries)) return false;
  return geometries.some((g) => {
    if (g.type === "Polygon" && Array.isArray(g.coordinates)) return hit(g.coordinates);
    if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) return g.coordinates.some(hit);
    return false;
  });
};
const matches = (items, lon, lat, now = Date.now()) =>
  items.filter(i => {
    if (i.type === 'Cancel') return false;
    if (!i.geometryStatus || i.geometryStatus !== 'ready') return false;
    const s = i.start ? Date.parse(i.start) : -Infinity;
    const e = i.expires ? Date.parse(i.expires) : Infinity;
    if (!(s <= now && now < e)) return false;
    return contains(i.geometries || [], lon, lat);
  });
const geomCache = new Map();
async function loadGeometries(items, fetcher = fetch) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      const cached = geomCache.get(item.id);
      if (cached) {
        results[index] = { ...item, geometries: cached, geometryStatus: 'ready' };
        continue;
      }
      try {
        const url = `https://warnung.bund.de/api31/warnings/${encodeURIComponent(item.id)}.geojson`;
        const response = await fetcher(url, {
          cache: 'no-store',
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const geometries = normalizeGeo(await response.json());
        if (geometries.length) {
          if (geomCache.size > 300) geomCache.clear();
          geomCache.set(item.id, geometries);
        }
        results[index] = { ...item, geometries, geometryStatus: geometries.length ? 'ready' : 'missing' };
      } catch {
        results[index] = { ...item, geometries: [], geometryStatus: 'error' };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, () => worker()));
  return results;
}
const api = {normalizeGeo, contains, matches, loadGeometries, geomCache};
if (typeof module === 'object' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.BbkGeo = api;
return api;
})();
