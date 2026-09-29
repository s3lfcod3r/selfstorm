const fs=require('node:fs');
const assert=require('node:assert');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../bbk-view.js'),'utf8');
const code=src.slice(src.indexOf('function draw'),src.indexOf('gps.onclick'));
const polygon={type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,0]]]};
const multi={type:'MultiPolygon',coordinates:[polygon.coordinates,polygon.coordinates]};
let count=0;
const ctx={save:()=>{},restore:()=>{},beginPath:()=>{},closePath:()=>{},stroke:()=>{}};
ctx.moveTo=(x,y)=>assert(Number.isFinite(x)&&Number.isFinite(y));
ctx.lineTo=(x,y)=>assert(Number.isFinite(x)&&Number.isFinite(y));
ctx.fill=rule=>{assert.equal(rule,'evenodd');count++;};
const context={
  layer:{checked:true},
  status:'ready',
  point:null,
  active:()=>[{geometryStatus:'ready',geometries:[polygon,multi]}],
};
vm.createContext(context);
vm.runInContext(code,context);
context.draw(ctx,(lon,lat)=>[lon*10,lat*10]);
assert.equal(count,3);
count=0;
context.layer.checked=false;
context.draw(ctx,(lon,lat)=>[lon*10,lat*10]);
assert.equal(count,0);
console.log('PASS canvas polygon drawing');
