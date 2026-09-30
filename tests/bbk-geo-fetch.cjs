const assert = require('node:assert/strict');
const { loadGeometries } = require('../bbk-geo.js');

const input = [{ id: 'ok' }, { id: 'empty' }, { id: 'http' }, { id: 'bad' }];
const valid = { type: 'FeatureCollection', features: [{ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }] };

async function mock(url, options) {
  assert(url.startsWith('bbk/'));
  assert(options.signal);
  if (url.includes('/http.')) return { ok: false, status: 500 };
  return { ok: true, json: async () => {
    if (url.includes('/bad.')) throw Error('JSON');
    if (url.includes('/empty.')) return { type: 'FeatureCollection', features: [] };
    return valid;
  }};
}

(async () => {
  const result = await loadGeometries(input, mock);
  assert.deepEqual(result.map(i => i.geometryStatus), ['ready', 'missing', 'error', 'error']);
  assert.deepEqual(result.map(i => i.id), input.map(i => i.id));
  assert(input[0].geometries === undefined);
  console.log('PASS geo fetch');
})().catch(e => { console.error(e); process.exitCode = 1; });

