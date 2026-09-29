const assert = require('node:assert/strict');
const { loadGeometries, geomCache } = require('../bbk-geo.js');
let calls = 0;
const fetcher = async () => {
  calls++;
  return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } }] }) };
};
(async () => {
  geomCache.clear();
  const items = [{ id: 'cache-a' }];
  const first = await loadGeometries(items, fetcher);
  assert.equal(first[0].geometryStatus, 'ready');
  const second = await loadGeometries(items, fetcher);
  assert.equal(second[0].geometryStatus, 'ready');
  assert.equal(calls, 1, 'Geometrie muss aus dem Cache kommen');
  const err = await loadGeometries([{ id: 'cache-b' }], async () => { throw new Error('down'); });
  assert.equal(err[0].geometryStatus, 'error');
  assert.equal(geomCache.has('cache-b'), false, 'Fehler duerfen nicht gecacht werden');
  console.log('PASS geometry cache');
})().catch((e) => { console.error(e); process.exit(1); });
