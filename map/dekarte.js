/* SelfStorm Deutschland-Karte — eine zoombare Karte für alles (Haupt- und Extra-Seite).
   Erwartet im DOM: <section id="dekarte" data-link="karte.html"></section>, map/dekarte.css,
   map/vendor/leaflet (Leaflet 1.9) und hazards.js.
   Ebenen: Kartenbild (OpenStreetMap, per CSS abgedunkelt), Modell-Vorhersage aller Gefahren als Glüh-Flächen
   (map/grid.json 0,2° für Deutschland; beim Hineinzoomen Feinraster 0,1° live von Open-Meteo, weltweit),
   amtliche DWD-Warnflächen gemeindegenau (DWD-GeoServer, Ersatz: Bright Sky je Bundesland), eigene Orte.
   Bundesländer sind anklickbar; die Zeitleiste zeigt, wann wo etwas los ist. */
(function(){
  "use strict";
  const root=document.getElementById("dekarte"); if(!root) return;
  if(!window.L){ root.textContent="Karte konnte nicht geladen werden."; return; }

  const WD=["So","Mo","Di","Mi","Do","Fr","Sa"];
  const COL={2:"#f4c534",3:"#f5892f",4:"#e5484d"};
  const LVNAME=["ruhig","ruhig","Beobachten","Warnung","Unwetter"];
  const HAZ={1:"Gewitter/Hagel",2:"Sturm",3:"Starkregen",4:"Hitze",5:"Frost/Glätte",6:"Schnee",7:"Nebel"};
  const ICON={1:"⛈",2:"🌬",3:"💧",4:"🌡",5:"🧊",6:"❄",7:"🌫"};
  const SEVLV={minor:2,moderate:3,severe:4,extreme:4};
  const SEV_LABEL={minor:"Wetterwarnung",moderate:"Markante Warnung",severe:"Unwetterwarnung",extreme:"Extreme Unwetterwarnung"};
  // Landeshauptstadt je Bundesland (Zuordnung von Raster-Randpunkten)
  const CAPS={"DE-BW":[48.78,9.18],"DE-BY":[48.14,11.58],"DE-BE":[52.52,13.40],"DE-BB":[52.40,13.06],
    "DE-HB":[53.08,8.80],"DE-HH":[53.55,9.99],"DE-HE":[50.08,8.24],"DE-MV":[53.63,11.42],
    "DE-NI":[52.37,9.73],"DE-NW":[51.23,6.78],"DE-RP":[50.00,8.27],"DE-SL":[49.24,6.99],
    "DE-SN":[51.05,13.74],"DE-ST":[52.13,11.63],"DE-SH":[54.32,10.14],"DE-TH":[50.98,11.03]};
  // Amtlicher Landesschlüssel → ISO-Kürzel
  const LAND={"01":"DE-SH","02":"DE-HH","03":"DE-NI","04":"DE-HB","05":"DE-NW","06":"DE-HE","07":"DE-RP","08":"DE-BW",
    "09":"DE-BY","10":"DE-SL","11":"DE-BE","12":"DE-BB","13":"DE-MV","14":"DE-SN","15":"DE-ST","16":"DE-TH"};
  const WFS="https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&typeName=dwd:";
  const FC="https://api.open-meteo.com/v1/forecast";
  const HOURLY="cape,weather_code,wind_gusts_10m,precipitation,temperature_2m,snowfall,visibility";
  // Feinraster: 1°-Kacheln mit 0,1°-Punkten (100 Abrufe je Kachel, zählen aufs Kontingent des Besuchers)
  // Open-Meteo frei: 600 Abrufe/Minute → höchstens 4 Kacheln je Ansicht, nacheinander
  const FINE={step:0.1, n:10, minZoom:8, maxBlocks:4, ttl:3600e3, key:"selfstorm.fine.v1", keep:36};
  const TILE="https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const LOC_KEY="selfstorm.locations.v1";
  const SPEEDS=[1,2,4], STEP_MS=520;
  const DPR=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  const EMBED=!!root.dataset.link;

  const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const cap=s=>String(s||"").toLowerCase().replace(/(^|[\s/-])([a-zäöü])/g,(m,a,b)=>a+b.toUpperCase());
  const hexA=(hex,a)=>{ const n=parseInt(hex.slice(1),16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; };
  const polys=g=>g.type==="Polygon"?[g.coordinates]:g.coordinates;
  const pad2=n=>String(n).padStart(2,"0");

  root.classList.add("dk");
  root.innerHTML=`
    <div class="dk-top">
      <div>
        <h2>Deutschland-Karte</h2>
        <div class="dk-sub">Vorhersage aller Gefahren · amtliche DWD-Warnungen · zoombar bis auf Ortsebene</div>
      </div>
      ${EMBED?`<a class="dk-link" href="${esc(root.dataset.link)}">groß ansehen →</a>`:""}
    </div>
    <div class="dk-body">
      <div class="dk-left">
        <div class="dk-stage">
          <div class="dk-map" data-map></div>
          <div class="dk-hud">
            <div class="dk-when"><span data-when>—</span><span class="dk-badge" data-badge></span></div>
            <div class="dk-sum" data-sum></div>
            <div class="dk-fine" data-fine hidden></div>
          </div>
          <button class="dk-zoomout" data-zoomout hidden>← ganz Deutschland</button>
          <div class="dk-wheelhint" data-wheelhint hidden>${EMBED?"Zum Zoomen <b>Strg</b> + Mausrad – oder in die Karte klicken":""}</div>
          <div class="dk-tip" hidden></div>
          <div class="dk-loading" data-loading>Lade Karte…</div>
        </div>
        <div class="dk-time">
          <button class="dk-play" data-play aria-label="Abspielen">▶</button>
          <div class="dk-stripwrap">
            <div class="dk-strip" data-strip role="slider" tabindex="0" aria-label="Zeitpunkt">
              <div class="dk-bars" data-bars></div>
              <div class="dk-nowmark" data-nowmark><span>jetzt</span></div>
              <div class="dk-playhead" data-playhead></div>
            </div>
            <div class="dk-days" data-days></div>
          </div>
          <button class="dk-speed" data-speed aria-label="Geschwindigkeit">1×</button>
        </div>
        <div class="dk-legend">
          <span><i style="background:${COL[2]}"></i>Beobachten</span>
          <span><i style="background:${COL[3]}"></i>Warnung</span>
          <span><i style="background:${COL[4]}"></i>Unwetter</span>
          <span><i class="dk-lg-dwd"></i>amtlich (DWD)</span>
          <span><i class="dk-lg-loc"></i>deine Orte</span>
        </div>
      </div>
      <aside class="dk-side" data-side><div class="dk-empty">Lädt…</div></aside>
    </div>
    <div class="dk-foot" data-gen></div>`;

  const $=s=>root.querySelector(s);
  const stage=$(".dk-stage"), mapEl=$("[data-map]"), tip=$(".dk-tip");
  let map=null, cv=null, ctx=null;
  const base=document.createElement("canvas"), bctx=base.getContext("2d");
  const heat=document.createElement("canvas"), hctx=heat.getContext("2d");   // Vorhersage erst deckend, dann halbtransparent auflegen

  let grid=null, states=null, outline=null, hours=[], hourMs=[], deBounds=null;
  let ptState=[], stMax={}, stHz={}, hourMax=[], hourScore=[];
  let kx=1, W=0, H=0, T={s:1,ox:0,oy:0}, homeZoom=5.5;
  let idx=0, nowIdx=0, hover=null, selected=null, hoverPt=null;
  let playing=false, timer=null, speed=1, dirty=true;
  let dwd={}, warns=[], dwdReady=false, dwdFailed=false, dwdSrc="";
  const fine=new Map(), finePending=new Set(); let fineBlockedUntil=0, fineErr=false;

  Promise.all([
    fetch("map/grid.json").then(r=>r.json()),
    fetch("map/bundeslaender.geojson").then(r=>r.json()),
    fetch("map/germany.geojson").then(r=>r.json())
  ]).then(([g,bl,de])=>{
    grid=g; states=bl.features; outline=de.features[0].geometry.coordinates;
    // Raster kompakt (Ziffernfolge) oder als Array
    const arr=v=>typeof v==="string"?Array.from(v,Number):v;
    grid.points.forEach(p=>{ p.lv=arr(p.lv); p.hz=arr(p.hz); });
    hours=g.hours; hourMs=hours.map(h=>new Date(h+"Z").getTime());
    const B=g.bbox; kx=Math.cos(((B.minLat+B.maxLat)/2)*Math.PI/180);
    deBounds=L.latLngBounds([B.minLat,B.minLon],[B.maxLat,B.maxLon]);
    prepare();
    nowIdx=idx=calcNowIdx();
    $("[data-loading]").hidden=true;
    $("[data-gen]").textContent=fmtGenerated(g.generated);
    loadFineCache();
    initMap(); buildStrip(); wire(); renderSide(); update();
    requestAnimationFrame(frame);
    loadDwd(); setInterval(loadDwd,10*60e3);
  }).catch(e=>{ console.error(e); $("[data-loading]").textContent="Karte konnte nicht geladen werden."; });

  // ---------- Daten vorbereiten ----------
  function prepare(){
    const n=hours.length;
    states.forEach(f=>{ stMax[f.properties.id]=new Int8Array(n); stHz[f.properties.id]=Array.from({length:n},()=>new Set()); });
    ptState=grid.points.map(p=>{ const f=states.find(f=>inGeom(p.lon,p.lat,f.geometry)); return f?f.properties.id:nearestState(p); });
    hourMax=new Array(n).fill(0); hourScore=new Array(n).fill(0);
    grid.points.forEach((p,i)=>{
      const sid=ptState[i];
      for(let h=0;h<n;h++){
        const lv=p.lv[h]; if(lv<2) continue;
        hourMax[h]=Math.max(hourMax[h],lv); hourScore[h]+=lv>=4?6:lv===3?3:1;
        if(sid){ if(lv>stMax[sid][h]) stMax[sid][h]=lv; if(p.hz[h]) stHz[sid][h].add(p.hz[h]); }
      }
    });
  }
  // Randpunkte (Küste/Grenze) dem nächsten Landeshauptstadt-Punkt zuordnen
  function nearestState(p){ let best=null,bd=1e9; for(const id in CAPS){ const c=CAPS[id], d=(c[0]-p.lat)**2+((c[1]-p.lon)*kx)**2; if(d<bd){bd=d;best=id;} } return best; }
  function inRing(lon,lat,ring){ let ins=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1]; if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)) ins=!ins;} return ins; }
  function inGeom(lon,lat,geom){ return polys(geom).some(p=>inRing(lon,lat,p[0])); }
  function inGeomHoles(lon,lat,geom){ return polys(geom).some(p=>inRing(lon,lat,p[0])&&!p.slice(1).some(r=>inRing(lon,lat,r))); }
  function bboxOf(geom){ const b=[180,90,-180,-90]; polys(geom).forEach(p=>p[0].forEach(c=>{ if(c[0]<b[0])b[0]=c[0]; if(c[1]<b[1])b[1]=c[1]; if(c[0]>b[2])b[2]=c[0]; if(c[1]>b[3])b[3]=c[1]; })); return b; }
  function calcNowIdx(){ const now=Date.now(); let b=0; for(let i=0;i<hourMs.length;i++){ if(hourMs[i]<=now) b=i; else break; } return b; }

  // ---------- DWD ----------
  // Bevorzugt: DWD-GeoServer mit gemeindegenauen Warnflächen + Gemeindenamen.
  // Ersatz: Bright Sky (nur Zuordnung zum Bundesland über die Warnzellen).
  async function loadDwd(){
    let res=null, src="";
    try{ res=await loadDwdGeo(); src="geo"; }
    catch(e){ try{ res=await loadBrightsky(); src="bs"; }catch(e2){} }
    if(!res){ if(!dwdReady){ dwdFailed=true; dwdReady=true; dirty=true; renderSide(); update(); } return; }
    for(const id in res.dwd) res.dwd[id].sort((a,b)=>(SEVLV[b.sev]||2)-(SEVLV[a.sev]||2)||String(a.onset).localeCompare(String(b.onset)));
    dwd=res.dwd; warns=res.warns; dwdSrc=src; dwdFailed=false; dwdReady=true;
    dirty=true; renderSide(); update();
  }
  const okJson=r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); };
  const cellState=c=>{ const s=String(c); return s.length===9&&/^[178]/.test(s)?LAND[s.slice(1,3)]:null; };
  const emptyDwd=()=>Object.fromEntries(states.map(f=>[f.properties.id,[]]));
  const cleanName=n=>String(n||"").replace(/^(Gemeinde|Stadt|Kreisfreie Stadt|Markt|Flecken|Hansestadt|Universitätsstadt)\s+/,"");

  async function loadDwdGeo(){
    const [geo,names]=await Promise.all([
      fetch(WFS+"Warnungen_Gemeinden_vereinigt&propertyName=THE_GEOM,CODE,EVENT,SEVERITY,ONSET,EXPIRES,INSTRUCTION").then(okJson),
      fetch(WFS+"Warnungen_Gemeinden&propertyName=NAME,WARNCELLID,CODE,EVENT,ONSET,EXPIRES").then(okJson).catch(()=>null)
    ]);
    const by=new Map(), key=p=>[p.CODE,p.EVENT,p.ONSET,p.EXPIRES].join("|");
    (geo.features||[]).forEach(f=>{
      const p=f.properties||{}; if(!f.geometry) return;
      let w=by.get(key(p));
      if(!w){ w={event:p.EVENT||"Warnung",sev:String(p.SEVERITY||"minor").toLowerCase(),onset:p.ONSET,expires:p.EXPIRES,
        instr:p.INSTRUCTION||"",parts:[],places:{}}; by.set(key(p),w); }
      w.parts.push({g:f.geometry,b:bboxOf(f.geometry)});
    });
    if(names) (names.features||[]).forEach(f=>{
      const p=f.properties||{}, w=by.get(key(p)), sid=cellState(p.WARNCELLID); if(!w||!sid) return;
      (w.places[sid]=w.places[sid]||[]).push(cleanName(p.NAME));
    });
    const d=emptyDwd(), list=[...by.values()];
    list.forEach(w=>{
      if(!names){ // ohne Namensliste: Bundesländer über die Flächen bestimmen
        w.parts.forEach(({g,b})=>{ const lon=(b[0]+b[2])/2, lat=(b[1]+b[3])/2;
          const f=states.find(f=>inGeom(lon,lat,f.geometry))||states.find(f=>inGeom(polys(g)[0][0][0][0],polys(g)[0][0][0][1],f.geometry));
          if(f&&!w.places[f.properties.id]) w.places[f.properties.id]=[]; });
      }
      for(const sid in w.places){ if(!d[sid]) continue;
        const nm=[...new Set(w.places[sid])].sort((a,b)=>a.localeCompare(b,"de"));
        d[sid].push({event:w.event,sev:w.sev,onset:w.onset,expires:w.expires,instr:w.instr,names:nm,cells:nm.length,unit:"Gemeinde",warn:w}); }
    });
    return {dwd:d,warns:list};
  }
  async function loadBrightsky(){
    const j=await fetch("https://api.brightsky.dev/alerts?tz=Europe/Berlin").then(okJson), d=emptyDwd();
    (j.alerts||[]).forEach(x=>{
      const cells={};
      (x.warn_cell_ids||[]).forEach(c=>{ const id=cellState(c); if(id) cells[id]=(cells[id]||0)+1; });
      for(const id in cells) if(d[id]) d[id].push({event:x.event_de||x.event_en||"Warnung",sev:x.severity,onset:x.onset,expires:x.expires,
        instr:x.instruction_de||"",names:[],cells:cells[id],unit:"Warngebiet"});
    });
    return {dwd:d,warns:[]};
  }
  const isActive=(a,t)=>{ const on=a.onset?Date.parse(a.onset):-Infinity, ex=a.expires?Date.parse(a.expires):Infinity; return on<t+3600e3&&ex>t; };
  function dwdActive(id,t){
    return (dwd[id]||[]).filter(a=>isActive(a,t));
  }
  const dwdLevel=(id,t)=>dwdActive(id,t).reduce((m,a)=>Math.max(m,SEVLV[a.sev]||2),0);

  // ---------- Karte (Leaflet) ----------
  function initMap(){
    map=L.map(mapEl,{zoomControl:false,minZoom:3,maxZoom:13,zoomSnap:0.25,zoomDelta:0.5,wheelPxPerZoomLevel:90,
      worldCopyJump:true,scrollWheelZoom:!EMBED,dragging:!(EMBED&&L.Browser.mobile),tap:false});
    L.control.zoom({position:"bottomright",zoomInTitle:"Hineinzoomen",zoomOutTitle:"Herauszoomen"}).addTo(map);
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILE,{maxZoom:19,className:"dk-tiles",
      attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende · Wetter: Open-Meteo · Warnungen: DWD'}).addTo(map);
    map.createPane("dk").style.zIndex=450;
    map.getPane("dk").style.pointerEvents="none";
    cv=L.DomUtil.create("canvas","dk-canvas",map.getPane("dk")); ctx=cv.getContext("2d");
    map.setView(deBounds.getCenter(),5.5,{animate:false});   // Startansicht auch bei eingeklappter Übersicht

    resize();
    map.on("move zoom viewreset",()=>{ dirty=true; });
    map.on("zoomanim",()=>stage.classList.add("dk-zooming"));
    map.on("zoomend",()=>{ stage.classList.remove("dk-zooming"); dirty=true; });
    let ft; map.on("moveend",()=>{ updateZoomUi(); clearTimeout(ft); ft=setTimeout(ensureFine,250); });

    // Eingebettet: Mausrad nur mit Strg oder nach Klick in die Karte (Seite bleibt scrollbar)
    if(EMBED){
      const hint=$("[data-wheelhint]"); let ht;
      map.on("click",()=>map.scrollWheelZoom.enable());
      mapEl.addEventListener("mouseleave",()=>map.scrollWheelZoom.disable());
      mapEl.addEventListener("wheel",e=>{
        if(map.scrollWheelZoom.enabled()) return;
        if(e.ctrlKey||e.metaKey){ e.preventDefault(); map.setZoomAround(map.mouseEventToContainerPoint(e),map.getZoom()+(e.deltaY<0?.5:-.5)); return; }
        hint.hidden=false; clearTimeout(ht); ht=setTimeout(()=>hint.hidden=true,1400);
      },{passive:false});
    }
    if(window.ResizeObserver) new ResizeObserver(()=>resize()).observe(stage);
    else window.addEventListener("resize",()=>resize());
  }
  let fitted=false;
  function resize(){
    const w=stage.clientWidth; if(!w||!map) return;
    const B=grid.bbox, ratio=(B.maxLat-B.minLat)/((B.maxLon-B.minLon)*kx);
    const h=Math.round(Math.min(w*ratio, Math.max(380, window.innerHeight*0.74)));
    if(fitted&&w===W&&h===H) return;
    W=w; H=h; mapEl.style.height=H+"px";
    [cv,base,heat].forEach(c=>{ c.width=Math.round(W*DPR); c.height=Math.round(H*DPR); c.style&&(c.style.width=W+"px",c.style.height=H+"px"); });
    map.invalidateSize(false);
    homeZoom=map.getBoundsZoom(deBounds,false,L.point(20,20));
    if(!fitted){ map.fitBounds(deBounds,{padding:[10,10],animate:false}); fitted=true; }
    dirty=true; updateZoomUi();
  }
  function home(){ map.flyToBounds(deBounds,{padding:[10,10],duration:.6}); }
  function updateZoomUi(){
    if(!map) return;
    $("[data-zoomout]").hidden=!(selected||map.getZoom()>homeZoom+.6||!map.getBounds().intersects(deBounds));
    const z=map.getZoom(), el=$("[data-fine]");
    if(z>=FINE.minZoom){
      el.hidden=false;
      el.innerHTML=Date.now()<fineBlockedUntil?"⏳ Feinraster-Limit erreicht – später erneut"
        :finePending.size?`<span class="spin-s"></span> Feinraster 0,1° lädt…`
        :fineErr?"Feinraster gerade nicht abrufbar":"🔍 Feinraster 0,1° (~8 km)";
    } else if(z>=6.5){ el.hidden=false; el.textContent="Tipp: weiter hineinzoomen für Feinraster"; }
    else el.hidden=true;
  }

  // Web-Mercator: Pixel pro Frame einmal umrechnen, dann schnell für alle Punkte
  function syncTransform(){
    const s=256*Math.pow(2,map.getZoom()), o=map.getPixelOrigin(), pp=map._getMapPanePos?map._getMapPanePos():L.point(0,0);
    T={s, ox:o.x-pp.x, oy:o.y-pp.y};
  }
  const merc=(lon,lat)=>{ const r=Math.max(-85.05,Math.min(85.05,lat))*Math.PI/180; return [(lon+180)/360,(1-Math.log(Math.tan(Math.PI/4+r/2))/Math.PI)/2]; };
  const px=(lon,lat)=>{ const m=merc(lon,lat); return [m[0]*T.s-T.ox, m[1]*T.s-T.oy]; };
  const degPx=(lat,step)=>Math.abs(px(10,lat)[1]-px(10,lat+step)[1]);
  function addRings(c,geom){ polys(geom).forEach(poly=>{ poly[0].forEach((pt,i)=>{ const q=px(pt[0],pt[1]); i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]); }); c.closePath(); }); }
  function addAllRings(c,geom){ polys(geom).forEach(poly=>poly.forEach(ring=>{ ring.forEach((pt,i)=>{ const q=px(pt[0],pt[1]); i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]); }); c.closePath(); })); }
  function traceOutline(c){ c.beginPath(); outline.forEach(poly=>{ poly[0].forEach((pt,i)=>{ const q=px(pt[0],pt[1]); i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]); }); c.closePath(); }); }
  function stateById(id){ return states.find(f=>f.properties.id===id); }
  const hatchCache={};
  function hatch(c,col){
    if(!hatchCache[col]){ const h=document.createElement("canvas"); h.width=h.height=8; const x=h.getContext("2d");
      x.strokeStyle=hexA(col,.5); x.lineWidth=1.4; x.beginPath(); x.moveTo(-2,10); x.lineTo(10,-2); x.moveTo(6,10); x.lineTo(10,6); x.moveTo(-2,2); x.lineTo(2,-2); x.stroke();
      hatchCache[col]=h; }
    return c.createPattern(hatchCache[col],"repeat");
  }
  function myLocations(){ try{ return JSON.parse(localStorage.getItem(LOC_KEY))||[]; }catch(e){ return []; } }

  // ---------- Feinraster (live, beim Hineinzoomen) ----------
  const blockKey=(la,lo)=>la+":"+lo;
  function loadFineCache(){
    try{ const c=JSON.parse(localStorage.getItem(FINE.key)||"{}");
      for(const k in c){ const b=c[k]; if(Date.now()-b.t<FINE.ttl){ b.lv=b.lv.map(s=>Array.from(s,Number)); b.hz=b.hz.map(s=>Array.from(s,Number)); fine.set(k,b); } }
    }catch(e){}
  }
  function saveFineCache(){
    try{ const all=[...fine.entries()].sort((a,b)=>b[1].t-a[1].t).slice(0,FINE.keep), o={};
      all.forEach(([k,b])=>{ o[k]={la:b.la,lo:b.lo,t:b.t,t0:b.t0,lv:b.lv.map(a=>a.join("")),hz:b.hz.map(a=>a.join(""))}; });
      localStorage.setItem(FINE.key,JSON.stringify(o)); }catch(e){}
  }
  function ensureFine(){
    updateZoomUi();
    if(!map||map.getZoom()<FINE.minZoom||Date.now()<fineBlockedUntil) return;
    const b=map.getBounds(), c=map.getCenter(), list=[];
    for(let la=Math.floor(b.getSouth());la<=Math.floor(b.getNorth());la++){
      if(la<-80||la>79) continue;
      for(let lo=Math.floor(b.getWest());lo<=Math.floor(b.getEast());lo++){
        const L0=((lo+180)%360+360)%360-180;
        list.push([la,L0,(la+.5-c.lat)**2+((lo+.5-c.lng)*Math.cos(c.lat*Math.PI/180))**2]);
      }
    }
    fineQueue=list.sort((a,b)=>a[2]-b[2]).slice(0,FINE.maxBlocks).filter(([la,lo])=>!fine.has(blockKey(la,lo)));
    pumpFine(); updateZoomUi();
  }
  let fineQueue=[], fineBusy=false;
  async function pumpFine(){
    if(fineBusy) return; fineBusy=true;
    while(fineQueue.length&&Date.now()>=fineBlockedUntil){
      const [la,lo]=fineQueue.shift(); if(fine.has(blockKey(la,lo))) continue;
      await fetchBlock(la,lo);
    }
    fineBusy=false;
  }
  async function fetchBlock(la,lo){
    const k=blockKey(la,lo), lats=[], lons=[];
    finePending.add(k);
    for(let i=0;i<FINE.n;i++) for(let j=0;j<FINE.n;j++){ lats.push((la+(i+.5)*FINE.step).toFixed(3)); lons.push((lo+(j+.5)*FINE.step).toFixed(3)); }
    try{
      const body=new URLSearchParams({latitude:lats.join(","),longitude:lons.join(","),hourly:HOURLY,timezone:"UTC",forecast_days:"3"});
      const r=await fetch(FC,{method:"POST",body});
      if(r.status===429){ fineBlockedUntil=Date.now()+90e3; setTimeout(ensureFine,91e3); throw 0; }
      if(!r.ok) throw 0;
      const j=await r.json(), arr=Array.isArray(j)?j:[j], H=window.SelfStormHazards;
      const blk={la,lo,t:Date.now(),t0:Date.parse(arr[0].hourly.time[0]+"Z"),lv:[],hz:[]};
      arr.forEach(res=>{ const h=res.hourly, lv=[], hz=[];
        for(let q=0;q<h.time.length;q++){ const x=H.hourHazard(h,q); lv.push(x.lv||0); hz.push(x.cat||0); }
        blk.lv.push(lv); blk.hz.push(hz); });
      fine.set(k,blk); fineErr=false; saveFineCache(); dirty=true;
    }catch(e){ fineErr=true; }
    finally{ finePending.delete(k); updateZoomUi(); }
  }
  // Feinwert an einer Stelle (oder null, wenn dort kein Feinraster geladen ist)
  function fineAt(lon,lat,t){
    const b=fine.get(blockKey(Math.floor(lat),Math.floor(lon))); if(!b) return null;
    const i=Math.min(FINE.n-1,Math.floor((lat-b.la)/FINE.step)), j=Math.min(FINE.n-1,Math.floor((lon-b.lo)/FINE.step)), h=Math.round((t-b.t0)/3600e3), q=i*FINE.n+j;
    if(h<0||h>=b.lv[q].length) return {lv:0,hz:0,lat:b.la+(i+.5)*FINE.step,lon:b.lo+(j+.5)*FINE.step};
    return {lv:b.lv[q][h],hz:b.hz[q][h],lat:b.la+(i+.5)*FINE.step,lon:b.lo+(j+.5)*FINE.step};
  }

  // ---------- Zeichnen: statische Ebene (bei Bewegung/Änderung neu) ----------
  function blob(c,q,r,lv){
    const col=COL[lv], g=c.createRadialGradient(q[0],q[1],0,q[0],q[1],r);
    g.addColorStop(0,hexA(col,1)); g.addColorStop(.55,hexA(col,.85)); g.addColorStop(1,hexA(col,0));
    c.fillStyle=g; c.beginPath(); c.arc(q[0],q[1],r,0,6.2832); c.fill();
  }
  const onScreen=(q,m)=>q[0]>-m&&q[1]>-m&&q[0]<W+m&&q[1]<H+m;
  function renderBase(){
    const c=bctx; c.setTransform(DPR,0,0,DPR,0,0); c.clearRect(0,0,W,H);
    const t=hourMs[idx], z=map.getZoom(), useFine=z>=FINE.minZoom&&fine.size;

    // Hover/Auswahl; im Ersatzbetrieb (ohne Warnflächen) ganzes Bundesland einfärben
    states.forEach(f=>{
      const id=f.properties.id, lv=dwdReady&&dwdSrc==="bs"?dwdLevel(id,t):0;
      if(lv<2&&(z>=8||id!==hover&&id!==selected)) return;
      c.beginPath(); addRings(c,f.geometry);
      c.fillStyle=lv>=2?hexA(COL[lv],.17):(id===selected?"rgba(67,211,173,.06)":"rgba(157,189,208,.06)");
      c.fill();
    });

    // Vorhersage: grobes Raster (wo kein Feinraster da ist), darüber Feinraster.
    // Auf eigener Ebene deckend malen (Überlappungen addieren sich nicht), dann transparent auflegen.
    const hc=hctx; hc.setTransform(DPR,0,0,DPR,0,0); hc.clearRect(0,0,W,H);
    const rC=degPx(51,grid.step)*.85, rF=degPx(51,FINE.step)*.95;
    for(const pass of [2,3,4]){
      grid.points.forEach(p=>{
        if(p.lv[idx]!==pass) return;
        if(useFine&&fine.has(blockKey(Math.floor(p.lat),Math.floor(p.lon)))) return;
        const q=px(p.lon,p.lat); if(onScreen(q,rC)) blob(hc,q,rC*(pass>=3?1.12:1),pass);
      });
      if(useFine) fine.forEach(b=>{
        const h=Math.round((t-b.t0)/3600e3); if(h<0) return;
        for(let i=0;i<FINE.n;i++) for(let j=0;j<FINE.n;j++){
          const q0=i*FINE.n+j, lv=b.lv[q0][h]; if(lv!==pass) continue;
          const q=px(b.lo+(j+.5)*FINE.step,b.la+(i+.5)*FINE.step); if(onScreen(q,rF)) blob(hc,q,rF*(pass>=3?1.1:1),pass);
        }
      });
    }
    c.save(); c.setTransform(1,0,0,1,0,0); c.globalAlpha=z>=FINE.minZoom?.5:.62; c.drawImage(heat,0,0); c.restore();

    // Amtliche Warnflächen (gemeindegenau), schwächere zuerst
    if(dwdReady) warns.filter(w=>isActive(w,t)).sort((a,b)=>(SEVLV[a.sev]||2)-(SEVLV[b.sev]||2)).forEach(w=>{
      const col=COL[SEVLV[w.sev]||2];
      c.beginPath(); w.parts.forEach(p=>addAllRings(c,p.g));
      c.fillStyle=hexA(col,.2); c.fill("evenodd");
      c.fillStyle=hatch(c,col); c.fill("evenodd");
      c.strokeStyle=hexA(col,.95); c.lineWidth=z>=9?1.6:1.2; c.stroke();
    });

    // Grenzen
    // Umrisse sind vereinfacht: bei starkem Zoom nur noch dezent
    const close=z>=8;
    c.lineJoin="round";
    if(!close){ c.beginPath(); states.forEach(f=>addRings(c,f.geometry)); c.strokeStyle="rgba(157,189,208,.22)"; c.lineWidth=.8; c.stroke(); }
    if(dwdReady&&dwdSrc==="bs") states.forEach(f=>{
      const lv=dwdLevel(f.properties.id,t); if(lv<2) return;
      c.beginPath(); addRings(c,f.geometry); c.setLineDash([5,3]); c.strokeStyle=hexA(COL[lv],.85); c.lineWidth=1.4; c.stroke(); c.setLineDash([]);
    });
    if(!close){ traceOutline(c); c.save(); c.shadowColor="rgba(51,167,140,.55)"; c.shadowBlur=10; c.strokeStyle="rgba(157,189,208,.55)"; c.lineWidth=1.3; c.stroke(); c.restore(); }

    // Auswahl: Umgebung abdunkeln, Land hervorheben
    if(selected&&!close){ const f=stateById(selected); c.beginPath(); c.rect(0,0,W,H); addRings(c,f.geometry); c.fillStyle="rgba(8,12,17,.45)"; c.fill("evenodd"); }
    [hover,selected].forEach(id=>{
      if(!id) return; const f=stateById(id); if(!f) return;
      c.beginPath(); addRings(c,f.geometry);
      if(close){ if(id===selected){ c.setLineDash([6,5]); c.strokeStyle="rgba(67,211,173,.5)"; c.lineWidth=1.2; c.stroke(); c.setLineDash([]); } }
      else if(id===selected){ c.save(); c.shadowColor="rgba(67,211,173,.8)"; c.shadowBlur=12; c.strokeStyle="#43d3ad"; c.lineWidth=2.2; c.stroke(); c.restore(); }
      else { c.strokeStyle="rgba(238,244,247,.55)"; c.lineWidth=1.4; c.stroke(); }
    });
    dirty=false;
  }

  // ---------- Zeichnen: animierte Ebene (Pulse, eigene Orte) ----------
  let lastFrame=0;
  function frame(ts){
    requestAnimationFrame(frame);
    if(!W||!map||!fitted||root.offsetParent===null||ts-lastFrame<33) return;
    lastFrame=ts;
    syncTransform();
    L.DomUtil.setPosition(cv,map.containerPointToLayerPoint([0,0]));
    if(dirty) renderBase();
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); ctx.drawImage(base,0,0);
    ctx.setTransform(DPR,0,0,DPR,0,0);

    // Brennpunkte pulsieren (grobes Raster)
    const rC=degPx(51,grid.step);
    grid.points.forEach((p,i)=>{
      const lv=p.lv[idx]; if(lv<3) return;
      const q=px(p.lon,p.lat); if(!onScreen(q,rC)) return;
      const ph=((ts/1600)+(i%7)/7)%1;
      ctx.beginPath(); ctx.arc(q[0],q[1],rC*(.25+ph*.75),0,6.2832);
      ctx.strokeStyle=hexA(COL[lv],(1-ph)*.5); ctx.lineWidth=1.5; ctx.stroke();
    });

    if(hoverPt){ const q=px(hoverPt[0],hoverPt[1]); ctx.beginPath(); ctx.arc(q[0],q[1],4,0,6.2832); ctx.fillStyle="rgba(238,244,247,.9)"; ctx.fill(); }

    // Eigene Orte als Pins
    ctx.font='600 11px "Exo 2", system-ui, sans-serif'; ctx.textBaseline="middle";
    myLocations().forEach(l=>{
      const q=px(l.lon,l.lat); if(!onScreen(q,40)) return;
      const ph=(ts/2000)%1, name=String(l.name||"").slice(0,22), tw=ctx.measureText(name).width;
      ctx.beginPath(); ctx.arc(q[0],q[1],5+ph*10,0,6.2832); ctx.strokeStyle=`rgba(67,211,173,${(1-ph)*.6})`; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(q[0],q[1],4.5,0,6.2832); ctx.fillStyle="#43d3ad"; ctx.fill();
      ctx.lineWidth=1.6; ctx.strokeStyle="#080c11"; ctx.stroke();
      ctx.lineWidth=3; ctx.strokeStyle="rgba(8,12,17,.85)"; ctx.strokeText(name,q[0]-tw-9,q[1]);
      ctx.fillStyle="#bff5e6"; ctx.fillText(name,q[0]-tw-9,q[1]);
    });
  }

  // ---------- Zeitleiste ----------
  function buildStrip(){
    const n=hours.length, mx=Math.max(1,...hourScore);
    $("[data-bars]").innerHTML=hourScore.map((s,h)=>{
      const lv=hourMax[h], hp=s?Math.max(14,Math.round(Math.sqrt(s/mx)*100)):8;
      return `<i style="height:${hp}%;background:${lv>=2?COL[lv]:"rgba(157,189,208,.16)"}${h<nowIdx?";opacity:.35":""}"></i>`;
    }).join("");
    $("[data-nowmark]").style.left=pct(nowIdx);
    let days="";
    hourMs.forEach((ms,h)=>{
      const d=new Date(ms);
      if(d.getHours()===0||h===0) days+=`<span style="left:${pct(h)}">${h===0&&d.getHours()!==0?"":WD[d.getDay()]+" "+d.getDate()+"."}</span>`;
    });
    $("[data-days]").innerHTML=days;
  }
  const pct=h=>((h+.5)/hours.length*100).toFixed(2)+"%";

  function setIdx(i){
    const n=hours.length; i=Math.max(0,Math.min(n-1,i));
    if(i===idx) return; idx=i; dirty=true; update(); if(selected) renderSide();
  }
  function update(){
    const d=new Date(hourMs[idx]), diff=idx-nowIdx;
    $("[data-when]").textContent=`${WD[d.getDay()]}, ${pad2(d.getHours())}:00 Uhr`;
    const badge=$("[data-badge]");
    badge.textContent=diff===0?"jetzt":diff>0?`in ${diff} Std`:`vor ${-diff} Std`;
    badge.className="dk-badge"+(diff===0?" now":diff<0?" past":"");
    let zones=0; const cats=new Set();
    grid.points.forEach(p=>{ if(p.lv[idx]>=2){ if(p.lv[idx]>=3) zones++; if(p.hz[idx]) cats.add(p.hz[idx]); } });
    const off=dwdReady?states.filter(f=>dwdLevel(f.properties.id,hourMs[idx])>=2).length:0;
    const parts=[];
    if(cats.size) parts.push([...cats].sort().map(c=>`<span class="dk-hz">${ICON[c]} ${HAZ[c]}</span>`).join(""));
    if(zones) parts.push(`<span class="dk-zones"><b>${zones}</b> Warn-Zonen</span>`);
    if(off) parts.push(`<span class="dk-off">⚠ ${off} ${off===1?"Land":"Länder"} amtlich</span>`);
    $("[data-sum]").innerHTML=parts.length?parts.join(""):`<span class="dk-calm">🌤 ruhige Lage</span>`;
    $("[data-playhead]").style.left=pct(idx);
    const st=$("[data-strip]"); st.setAttribute("aria-valuemin","0"); st.setAttribute("aria-valuemax",String(hours.length-1));
    st.setAttribute("aria-valuenow",String(idx)); st.setAttribute("aria-valuetext",$("[data-when]").textContent);
  }
  function play(){ playing=true; $("[data-play]").textContent="❚❚"; $("[data-play]").setAttribute("aria-label","Pause"); clearInterval(timer);
    if(idx>=hours.length-1) setIdx(nowIdx);
    timer=setInterval(()=>setIdx(idx>=hours.length-1?nowIdx:idx+1),STEP_MS/speed); }
  function pause(){ playing=false; $("[data-play]").textContent="▶"; $("[data-play]").setAttribute("aria-label","Abspielen"); clearInterval(timer); }

  // ---------- Seitenleiste ----------
  function hotspots(){
    const n=hours.length;
    return states.map(f=>{
      const id=f.properties.id, m=stMax[id]; let max=0, first=-1, cnt=0; const hz=new Set();
      for(let h=nowIdx;h<n;h++){ if(m[h]>=2){ cnt++; stHz[id][h].forEach(x=>hz.add(x)); if(m[h]>max){max=m[h]; first=h;} } }
      return {id,name:f.properties.name,max,first,cnt,hz};
    }).filter(s=>s.max>=2).sort((a,b)=>b.max-a.max||b.cnt-a.cnt||a.first-b.first);
  }
  function fmtH(h){ const d=new Date(hourMs[h]); return `${WD[d.getDay()]} ${pad2(d.getHours())}:00`; }
  function fmtT(t){ if(!t) return ""; const d=new Date(t); return `${WD[d.getDay()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  const areaTxt=(n,unit)=>`${n} ${unit||"Warngebiet"}${n===1?"":unit==="Gemeinde"?"n":"e"}`;
  function placesHtml(a){
    if(!a.names||!a.names.length) return "";
    const first=a.names.slice(0,6).map(esc).join(", ");
    return `<div class="dk-places">📍 ${first}${a.names.length>6?`<details><summary>+ ${a.names.length-6} weitere</summary>${a.names.slice(6).map(esc).join(", ")}</details>`:""}</div>`;
  }
  const sq=lv=>`<span class="dk-sq" style="background:${COL[lv]||"#3fb56b"}"></span>`;

  function renderSide(){
    const side=$("[data-side]"); if(!grid) return;
    if(selected){ side.innerHTML=selectedHtml(selected); }
    else {
      const now=hourMs[nowIdx];
      const off=dwdReady?states.map(f=>({id:f.properties.id,name:f.properties.name,items:dwdActive(f.properties.id,now)})).filter(s=>s.items.length)
        .map(s=>({...s,lv:s.items.reduce((m,a)=>Math.max(m,SEVLV[a.sev]||2),0)})).sort((a,b)=>b.lv-a.lv):[];
      const hs=hotspots().slice(0,7);
      side.innerHTML=
        `<div class="dk-sec"><span>Amtliche Warnungen</span><span class="dk-live">● live</span></div>`+
        (!dwdReady?`<div class="dk-empty">Lädt…</div>`
          :off.length?off.map(s=>`<button class="dk-row" data-sel="${s.id}" data-go="${nowIdx}">${sq(s.lv)}<span class="dk-rt"><b>${esc(s.name)}</b><small>${esc([...new Set(s.items.map(i=>cap(i.event)))].slice(0,2).join(", "))} · ${areaTxt(Math.max(...s.items.map(i=>i.cells||0)),s.items[0].unit)}</small></span></button>`).join("")
          :dwdFailed?`<div class="dk-empty">DWD-Warnungen gerade nicht abrufbar.</div>`:`<div class="dk-empty">✓ Aktuell keine amtlichen Warnungen.</div>`)+
        `<div class="dk-sec"><span>Brennpunkte · bis ${fmtH(hours.length-1)}</span></div>`+
        (hs.length?hs.map(s=>`<button class="dk-row" data-sel="${s.id}" data-go="${s.first}">${sq(s.max)}<span class="dk-rt"><b>${esc(s.name)}</b><small>${[...s.hz].sort().map(c=>ICON[c]+" "+HAZ[c]).join(" · ")}</small></span><span class="dk-when-s">${LVNAME[s.max]}<br><small>${fmtH(s.first)}</small></span></button>`).join("")
          :`<div class="dk-empty">🌤 Keine Gefahren in Sicht — ruhige Lage in ganz Deutschland.</div>`)+
        `<div class="dk-hint">Tipp: Auf die Karte tippen, um ein Bundesland heranzuzoomen.</div>`;
    }
    side.querySelectorAll("[data-sel]").forEach(b=>b.onclick=()=>{ pause(); select(b.dataset.sel); if(b.dataset.go!=null) setIdx(+b.dataset.go); });
    side.querySelectorAll("[data-go]:not([data-sel])").forEach(b=>b.onclick=()=>{ pause(); setIdx(+b.dataset.go); });
    const x=side.querySelector("[data-close]"); if(x) x.onclick=()=>select(null);
  }
  function selectedHtml(id){
    const f=stateById(id), n=hours.length, m=stMax[id], t=hourMs[idx];
    const act=dwdReady?(dwd[id]||[]):[];
    const curLv=m[idx], curHz=[...stHz[id][idx]].sort();
    let max=0, first=-1, cnt=0; const hz=new Set();
    for(let h=nowIdx;h<n;h++){ if(m[h]>=2){ cnt++; stHz[id][h].forEach(x=>hz.add(x)); if(first<0) first=h; max=Math.max(max,m[h]); } }
    const cells=[]; for(let h=nowIdx;h<n;h++){
      const d=new Date(hourMs[h]);
      cells.push(`<button data-go="${h}" class="${h===idx?"cur":""}${d.getHours()===0?" day":""}" style="background:${m[h]>=2?COL[m[h]]:"rgba(157,189,208,.12)"}" title="${fmtH(h)} · ${LVNAME[m[h]]}"></button>`);
    }
    const dwdNow=dwdReady?dwdActive(id,t):[];
    return `<div class="dk-selhead">
        <div><div class="dk-selname">${esc(f.properties.name)}</div>
        <div class="dk-selnow">${sq(curLv)} ${fmtH(idx)}: <b>${LVNAME[curLv]}</b>${curHz.length?" · "+curHz.map(c=>ICON[c]+" "+HAZ[c]).join(", "):""}</div></div>
        <button class="dk-x" data-close aria-label="Auswahl schließen">✕</button>
      </div>
      <div class="dk-sec"><span>Amtlich (DWD)</span><span class="dk-live">● live</span></div>
      ${!dwdReady?`<div class="dk-empty">Lädt…</div>`
        :act.length?act.map(a=>`<div class="dk-alert sev-${esc(a.sev||"minor")}${dwdNow.includes(a)?" on":""}">
            <div><b>${esc(cap(a.event))}</b> <span class="dk-pill">${SEV_LABEL[a.sev]||"Warnung"}</span></div>
            <small>${a.onset?"ab "+fmtT(a.onset):""}${a.expires?" bis "+fmtT(a.expires)+" Uhr":""}${a.cells?` · ${areaTxt(a.cells,a.unit)}`:""}</small>
            ${placesHtml(a)}
            ${a.instr?`<details class="dk-instr"><summary>Was tun?</summary>${esc(a.instr)}</details>`:""}</div>`).join("")
        :dwdFailed?`<div class="dk-empty">DWD-Warnungen gerade nicht abrufbar.</div>`:`<div class="dk-empty">✓ Keine amtliche Warnung.</div>`}
      <div class="dk-sec"><span>Vorhersage · stündlich</span></div>
      <div class="dk-cells">${cells.join("")}</div>
      <div class="dk-cells-ax"><span>jetzt</span><span>${fmtH(n-1)}</span></div>
      <p class="dk-verdict">${max>=2
        ?`Höchste Stufe <b style="color:${COL[max]}">${LVNAME[max]}</b> — ${[...hz].sort().map(c=>ICON[c]+" "+HAZ[c]).join(", ")}. Erstmals ${fmtH(first)} Uhr, insgesamt ${cnt} Std betroffen.`
        :"Die Wettermodelle sehen hier bis zum Ende der Vorhersage keine Gefahr. 🌤"}</p>
      <div class="dk-hint">Kästchen antippen, um zu diesem Zeitpunkt zu springen.</div>`;
  }
  function select(id,zoom=true){
    if(id!==selected){ selected=id; hover=null; dirty=true; renderSide(); }
    if(zoom&&id){ const b=bboxOf(stateById(id).geometry); map.flyToBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[24,24],duration:.6}); }
    updateZoomUi();
  }

  // ---------- Interaktion ----------
  function wire(){
    $("[data-play]").onclick=()=>playing?pause():play();
    $("[data-speed]").onclick=e=>{ speed=SPEEDS[(SPEEDS.indexOf(speed)+1)%SPEEDS.length]; e.currentTarget.textContent=speed+"×"; if(playing) play(); };

    const strip=$("[data-strip]"); let drag=false;
    const seek=e=>{ const r=strip.getBoundingClientRect(); setIdx(Math.floor((e.clientX-r.left)/r.width*hours.length)); };
    strip.addEventListener("pointerdown",e=>{ drag=true; strip.setPointerCapture(e.pointerId); pause(); seek(e); });
    strip.addEventListener("pointermove",e=>{ if(drag) seek(e); });
    strip.addEventListener("pointerup",()=>{ drag=false; });
    strip.addEventListener("pointercancel",()=>{ drag=false; });
    strip.addEventListener("keydown",e=>{
      const k=e.key; if(k==="ArrowRight"||k==="ArrowLeft"){ pause(); setIdx(idx+(k==="ArrowRight"?1:-1)); e.preventDefault(); }
      else if(k==="Home"){ setIdx(nowIdx); e.preventDefault(); } else if(k==="End"){ setIdx(hours.length-1); e.preventDefault(); }
      else if(k===" "){ playing?pause():play(); e.preventDefault(); }
    });

    $("[data-zoomout]").onclick=()=>{ select(null,false); home(); };
    const stateAt=ll=>{ const f=states.find(f=>inGeom(ll.lng,ll.lat,f.geometry)); return f?f.properties.id:null; };
    map.on("mousemove",e=>{
      const id=stateAt(e.latlng);
      if(id!==hover){ hover=id; dirty=true; }
      showTip(id,e.latlng,e.containerPoint);
    });
    mapEl.addEventListener("mouseleave",()=>{ if(hover){ hover=null; dirty=true; } tip.hidden=true; hoverPt=null; });
    map.on("click",e=>{
      const id=stateAt(e.latlng);
      if(id) select(id, map.getZoom()<homeZoom+1.2); else if(selected) select(null,false);
      if(!matchMedia("(hover:hover)").matches) showTip(id,e.latlng,e.containerPoint);
      if(id&&window.innerWidth<760&&map.getZoom()<homeZoom+1.2) setTimeout(()=>$("[data-side]").scrollIntoView({behavior:"smooth",block:"nearest"}),650);
    });
  }
  function showTip(id,ll,cp){
    const lon=ll.lng, lat=ll.lat, t=hourMs[idx], x=cp.x, y=cp.y;
    const f=id&&stateById(id);
    // Vorhersage hier: Feinraster, sonst nächster Punkt des groben Rasters
    let lv=0, hz=0, src="";
    const fv=map.getZoom()>=FINE.minZoom?fineAt(lon,lat,t):null;
    if(fv){ lv=fv.lv; hz=fv.hz; src="fein"; hoverPt=lv>=2?[fv.lon,fv.lat]:null; }
    else {
      let best=null,bd=1e9;
      grid.points.forEach(p=>{ const d=(p.lat-lat)**2+((p.lon-lon)*kx)**2; if(d<bd){bd=d;best=p;} });
      if(best&&bd<(grid.step*.8)**2){ lv=best.lv[idx]; hz=lv>=2?best.hz[idx]:0; src="grob"; }
      hoverPt=lv>=2?[best.lon,best.lat]:null;
    }
    if(!f&&!src){ tip.hidden=true; return; }
    const off=!dwdReady?[]:dwdSrc==="geo"
      ? warns.filter(w=>isActive(w,t)&&w.parts.some(p=>lon>=p.b[0]&&lon<=p.b[2]&&lat>=p.b[1]&&lat<=p.b[3]&&inGeomHoles(lon,lat,p.g)))
      : (id?dwdActive(id,t):[]);
    tip.innerHTML=`<b>${f?esc(f.properties.name):"Vorhersage hier"}</b>
      <div>${lv>=2?`${sq(lv)} ${ICON[hz]||""} ${HAZ[hz]||"Gefahr"} · ${LVNAME[lv]}`:"🌤 hier ruhig"}</div>
      ${off.length?`<div class="dk-tip-off">⚠ amtlich${dwdSrc==="geo"?" hier":""}: ${esc([...new Set(off.map(a=>cap(a.event)))].slice(0,2).join(", "))}</div>`:""}
      <div class="dk-tip-src">${src==="fein"?"Feinraster ~8 km":"Raster ~20 km"}${f&&!selected&&map.getZoom()<homeZoom+1.2?" · antippen zum Heranzoomen":""}</div>`;
    tip.hidden=false;
    const tw=tip.offsetWidth, th=tip.offsetHeight;
    tip.style.left=Math.max(6,Math.min(W-tw-6, x+14>W-tw-6?x-tw-14:x+14))+"px";
    tip.style.top=Math.max(6,Math.min(H-th-6,y-th/2))+"px";
  }

  function fmtGenerated(g){
    if(!g) return "";
    const d=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(g)?g:g+"Z");
    if(isNaN(d.getTime())) return "";
    return `Modell-Raster ${String(grid.step).replace(".",",")}° (Stand ${WD[d.getDay()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())} Uhr) · beim Hineinzoomen live 0,1° · DWD-Warnflächen gemeindegenau`;
  }
})();
