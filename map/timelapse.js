/* SelfStorm Zeitraffer-Karte — gemeinsames Modul für Haupt- und Extra-Seite.
   Erwartet im DOM: #tl-canvas, optional #tl-when #tl-zones #tl-haz #tl-play #tl-slider #tl-speed #tl-loading.
   Lädt map/grid.json (alle Gefahren, 72h) + map/germany.geojson und animiert den Verlauf. */
(function(){
  "use strict";
  const cv=document.getElementById("tl-canvas"); if(!cv) return;
  const ctx=cv.getContext("2d");
  const WD=["So","Mo","Di","Mi","Do","Fr","Sa"];
  const COLORS={2:"#d29922",3:"#e0791f",4:"#f85149"};
  const HAZ={1:"Gewitter/Hagel",2:"Sturm",3:"Starkregen",4:"Hitze",5:"Frost/Glätte",6:"Schnee",7:"Nebel"};
  const $=id=>document.getElementById(id);

  let grid=null, outline=null, idx=0, playing=false, timer=null, speed=1;
  const SPEEDS=[1,2,4], STEP_MS=520;
  let B,kx,scale,ox,oy,cellR,W,H;
  const DPR=Math.max(1,Math.min(2,window.devicePixelRatio||1));

  Promise.all([
    fetch("map/grid.json").then(r=>r.json()),
    fetch("map/germany.geojson").then(r=>r.json())
  ]).then(([g,geo])=>{
    grid=g; outline=geo.features[0].geometry.coordinates;
    B=g.bbox; kx=Math.cos(((B.minLat+B.maxLat)/2)*Math.PI/180);
    const sl=$("tl-slider"); if(sl) sl.max=String(g.hours.length-1);
    idx=nowIndex(g.hours); if(sl) sl.value=String(idx);
    const ld=$("tl-loading"); if(ld) ld.hidden=true;
    cv.hidden=false; resize(); draw(); wire();
  }).catch(()=>{ const ld=$("tl-loading"); if(ld) ld.textContent="Karte konnte nicht geladen werden."; });

  function nowIndex(hours){ const now=Date.now(); let b=0; for(let i=0;i<hours.length;i++){ if(new Date(hours[i]+"Z").getTime()<=now) b=i; else break; } return b; }
  function resize(){
    W=cv.clientWidth||cv.parentElement.clientWidth||300;
    const gw=(B.maxLon-B.minLon)*kx, gh=(B.maxLat-B.minLat);
    H=Math.round(W*(gh/gw)); cv.style.height=H+"px";
    cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR); ctx.setTransform(DPR,0,0,DPR,0,0);
    const pad=10; scale=Math.min((W-2*pad)/gw,(H-2*pad)/gh); ox=(W-gw*scale)/2; oy=(H-gh*scale)/2; cellR=grid.step*scale*0.82;
  }
  function px(lon,lat){ return [ox+((lon-B.minLon)*kx)*scale, oy+((B.maxLat-lat))*scale]; }
  function pathOutline(){ ctx.beginPath(); for(const poly of outline){ poly[0].forEach((c,i)=>{const p=px(c[0],c[1]); i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);}); ctx.closePath(); } }
  function rgba(hex,a){ const n=parseInt(hex.slice(1),16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }
  function draw(){
    ctx.clearRect(0,0,W,H);
    pathOutline(); ctx.fillStyle="rgba(157,189,208,0.05)"; ctx.fill();
    let zones=0; const cats=new Set();
    for(const p of grid.points){
      const lv=p.lv[idx]; if(lv<2) continue;
      if(lv>=3) zones++; cats.add(p.hz[idx]);
      const c=COLORS[lv], q=px(p.lon,p.lat), g=ctx.createRadialGradient(q[0],q[1],0,q[0],q[1],cellR);
      g.addColorStop(0,rgba(c,lv>=4?0.9:0.75)); g.addColorStop(1,rgba(c,0));
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(q[0],q[1],cellR,0,6.2832); ctx.fill();
    }
    pathOutline(); ctx.strokeStyle="rgba(157,189,208,0.4)"; ctx.lineWidth=1.2; ctx.stroke();
    const d=new Date(grid.hours[idx]+"Z");
    if($("tl-when")) $("tl-when").textContent=WD[d.getDay()]+", "+d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})+" Uhr";
    if($("tl-zones")) $("tl-zones").innerHTML=zones?`<b>${zones}</b> Warn-Zonen`:"ruhig";
    if($("tl-haz")){ const names=[...cats].filter(Boolean).sort().map(c=>HAZ[c]); $("tl-haz").textContent=names.length?("Aktiv: "+names.join(" · ")):"aktuell ruhig"; }
  }
  function setIdx(i){ idx=Math.max(0,Math.min(grid.hours.length-1,i)); const sl=$("tl-slider"); if(sl) sl.value=String(idx); draw(); }
  function step(){ setIdx(idx>=grid.hours.length-1?0:idx+1); }
  function play(){ playing=true; const b=$("tl-play"); if(b) b.textContent="❚❚"; clearInterval(timer); timer=setInterval(step,STEP_MS/speed); }
  function pause(){ playing=false; const b=$("tl-play"); if(b) b.textContent="▶"; clearInterval(timer); }
  function wire(){
    const pl=$("tl-play"); if(pl) pl.onclick=()=>playing?pause():play();
    const sl=$("tl-slider"); if(sl) sl.oninput=e=>{ pause(); setIdx(+e.target.value); };
    const sp=$("tl-speed"); if(sp) sp.onclick=()=>{ speed=SPEEDS[(SPEEDS.indexOf(speed)+1)%SPEEDS.length]; sp.textContent=speed+"×"; if(playing) play(); };
    let rt; window.addEventListener("resize",()=>{ clearTimeout(rt); rt=setTimeout(()=>{resize();draw();},150); });
  }
})();
