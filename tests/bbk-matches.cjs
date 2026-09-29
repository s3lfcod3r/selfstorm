const assert = require('node:assert/strict');
const { matches } = require('../bbk-geo.js');
const geometries=[{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}];
const item={id:'ok',type:'Alert',start:'2020-01-01T00:00:00Z',expires:'2030-01-01T00:00:00Z',geometryStatus:'ready',geometries};
const now=Date.parse('2026-01-01T00:00:00Z');
const list=[
  item,
  {...item,id:'cancel',type:'Cancel'},
  {...item,id:'expired',expires:'2025-01-01T00:00:00Z'},
  {...item,id:'future',start:'2027-01-01T00:00:00Z'},
  {...item,id:'error',geometryStatus:'error'}
];
assert.deepEqual(matches(list,5,5,now).map(i=>i.id),['ok']);
assert.deepEqual(matches(list,15,5,now),[]);
console.log('PASS active location warnings');
