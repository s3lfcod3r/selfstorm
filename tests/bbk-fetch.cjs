const assert=require('node:assert/strict');
const {fetchBbk}=require('../bbk.js');
(async()=>{try{await assert.rejects(fetchBbk(async()=>({ok:false,status:500})));
await assert.rejects(fetchBbk(async()=>{throw new Error('offline')}));
await assert.rejects(fetchBbk(async()=>({ok:true,json:async()=>({})})));
const items=await fetchBbk(async(url,opts)=>{assert.equal(url,'https://warnung.bund.de/api31/mowas/mapData.json');
assert.ok(opts.signal instanceof AbortSignal);return {ok:true,json:async()=>[]};});
assert.equal(items.length,0);console.log('PASS BBK fetch');}catch(e){console.error(e);process.exitCode=1}})();
