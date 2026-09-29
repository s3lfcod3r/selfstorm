const fs = require('node:fs');
const assert = require('node:assert');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../bbk-view.js'), 'utf8');
const code = src.slice(src.indexOf('function buildPaths'), src.indexOf('gps.onclick'));
const polygon = { type: 'Polygon', coordinates: [[[0,0],[2,0],[2,2],[0,0]]] };
const multi = { type: 'MultiPolygon', coordinates: [polygon.coordinates, polygon.coordinates] };
let built = 0;
let fills = 0;
class Path2D {
  constructor() { built++; }
  moveTo(x, y) { assert(Number.isFinite(x) && Number.isFinite(y)); }
  lineTo(x, y) { assert(Number.isFinite(x) && Number.isFinite(y)); }
  closePath() {}
}
const ctx = { save: () => {}, restore: () => {}, beginPath: () => {}, stroke: () => {}, arc: () => {}, strokeText: () => {}, fillText: () => {} };
ctx.fill = (p, rule) => { if (p instanceof Path2D) { assert.equal(rule, 'evenodd'); fills++; } };
const context = {
  layer: { checked: true },
  status: 'ready',
  point: null,
  activeList: [{ geometryStatus: 'ready', geometries: [polygon, multi] }],
  pathVersion: 1,
  pathCache: { key: '', paths: [] },
  Path2D,
};
vm.createContext(context);
vm.runInContext(code, context);
const px1 = (lon, lat) => [lon * 10, lat * 10];
context.draw(ctx, px1);
assert.equal(fills, 3, 'drei Polygone gezeichnet');
assert.equal(built, 3, 'drei Pfade gebaut');
context.draw(ctx, px1);
assert.equal(fills, 6);
assert.equal(built, 3, 'Cache greift bei gleicher Projektion');
const px2 = (lon, lat) => [lon * 20, lat * 20];
context.draw(ctx, px2);
assert.equal(built, 6, 'Neuaufbau bei anderer Projektion');
context.layer.checked = false;
fills = 0;
context.draw(ctx, px1);
assert.equal(fills, 0, 'Ebene aus: nichts gezeichnet');
console.log('PASS canvas path cache drawing');
