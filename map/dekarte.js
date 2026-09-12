/* SelfStorm Deutschland-Karte — eine Karte für alles (Haupt- und Extra-Seite).
   Erwartet im DOM: <section id="dekarte" data-link="karte.html"></section> + map/dekarte.css.
   Ebenen: Modell-Vorhersage aller Gefahren (map/grid.json, ~72h) als Glüh-Flächen,
   amtliche DWD-Warnflächen gemeindegenau (DWD-GeoServer, Ersatz: Bright Sky je Bundesland),
   Städte, eigene Orte. Bundesländer sind anklickbar und werden herangezoomt;
   die Zeitleiste zeigt, wann wo etwas los ist. */
(function(){
  "use strict";
  const root=document.getElementById("dekarte"); if(!root) return;

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
  // [Name, lon, lat, Stufe] — 1 immer, 0 ab mittlerer Breite, 2 nur herangezoomt
  const CITIES=[["Berlin",13.40,52.52,1],["Hamburg",9.99,53.55,1],["München",11.58,48.14,1],["Köln",6.96,50.94,1],
    ["Frankfurt",8.68,50.11,1],["Stuttgart",9.18,48.78,1],["Hannover",9.73,52.37,0],["Dresden",13.74,51.05,0],
    ["Nürnberg",11.08,49.45,0],["Bremen",8.80,53.08,0],["Rostock",12.10,54.09,0],["Erfurt",11.03,50.98,0],
    ["Kiel",10.14,54.32,2],["Lübeck",10.69,53.87,2],["Flensburg",9.44,54.79,2],["Husum",9.05,54.48,2],["Heide",9.10,54.20,2],
    ["Cuxhaven",8.69,53.86,2],["Oldenburg",8.21,53.14,2],["Emden",7.21,53.37,2],["Osnabrück",8.05,52.28,2],["Braunschweig",10.52,52.27,2],
    ["Göttingen",9.93,51.54,2],["Lüneburg",10.41,53.25,2],["Schwerin",11.42,53.63,2],["Greifswald",13.38,54.10,2],["Stralsund",13.09,54.31,2],
    ["Neubrandenburg",13.26,53.56,2],["Potsdam",13.06,52.40,2],["Cottbus",14.33,51.76,2],["Frankfurt (Oder)",14.55,52.35,2],
    ["Magdeburg",11.63,52.13,2],["Halle",11.97,51.48,2],["Leipzig",12.37,51.34,2],["Chemnitz",12.92,50.83,2],["Görlitz",14.99,51.15,2],
    ["Jena",11.59,50.93,2],["Gera",12.08,50.88,2],["Suhl",10.69,50.61,2],["Düsseldorf",6.78,51.23,2],["Dortmund",7.47,51.51,2],
    ["Münster",7.63,51.96,2],["Bielefeld",8.53,52.02,2],["Aachen",6.08,50.78,2],["Siegen",8.02,50.87,2],["Kassel",9.48,51.31,2],
    ["Fulda",9.68,50.55,2],["Wiesbaden",8.24,50.08,2],["Darmstadt",8.65,49.87,2],["Mainz",8.27,50.00,2],["Koblenz",7.59,50.36,2],
    ["Trier",6.64,49.75,2],["Kaiserslautern",7.77,49.44,2],["Saarbrücken",6.99,49.24,2],["Mannheim",8.47,49.49,2],["Karlsruhe",8.40,49.01,2],
    ["Freiburg",7.85,47.99,2],["Konstanz",9.18,47.66,2],["Ulm",9.99,48.40,2],["Heilbronn",9.22,49.14,2],["Würzburg",9.95,49.79,2],
    ["Bamberg",10.89,49.89,2],["Hof",11.92,50.31,2],["Regensburg",12.10,49.01,2],["Passau",13.43,48.57,2],["Ingolstadt",11.43,48.77,2],
    ["Augsburg",10.90,48.37,2],["Kempten",10.31,47.73,2],["Rosenheim",12.13,47.86,2],["Garmisch-P.",11.10,47.49,2]];
  const WFS="https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&typeName=dwd:";
  // Amtlicher Landesschlüssel → ISO-Kürzel
  const LAND={"01":"DE-SH","02":"DE-HH","03":"DE-NI","04":"DE-HB","05":"DE-NW","06":"DE-HE","07":"DE-RP","08":"DE-BW",
    "09":"DE-BY","10":"DE-SL","11":"DE-BE","12":"DE-BB","13":"DE-MV","14":"DE-SN","15":"DE-ST","16":"DE-TH"};
  const LOC_KEY="selfstorm.locations.v1";
  const SPEEDS=[1,2,4], STEP_MS=520;
  const DPR=Math.max(1,Math.min(2,window.devicePixelRatio||1));

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
        <div class="dk-sub">Vorhersage aller Gefahren · amtliche DWD-Warnungen · Bundesland antippen</div>
      </div>
      ${root.dataset.link?`<a class="dk-link" href="${esc(root.dataset.link)}">groß ansehen →</a>`:""}
    </div>
    <div class="dk-body">
      <div class="dk-left">
        <div class="dk-stage">
          <canvas></canvas>
          <div class="dk-hud">
            <div class="dk-when"><span data-when>—</span><span class="dk-badge" data-badge></span></div>
            <div class="dk-sum" data-sum></div>
          </div>
          <button class="dk-zoomout" data-zoomout hidden>← ganz Deutschland</button>
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
  const stage=$(".dk-stage"), cv=$("canvas"), ctx=cv.getContext("2d"), tip=$(".dk-tip");
  const base=document.createElement("canvas"), bctx=base.getContext("2d");

  let grid=null, states=null, outline=null, hours=[], hourMs=[];
  let ptState=[], stMax={}, stHz={}, hourMax=[], hourScore=[];
  let B,V,kx,scale,ox,oy,W=0,H=0,cellR=10,fullScale=1,anim=null;
  let idx=0, nowIdx=0, hover=null, selected=null, hoverPt=null;
  let playing=false, timer=null, speed=1, dirty=true;
  let dwd={}, warns=[], dwdReady=false, dwdFailed=false, dwdSrc="";

  Promise.all([
    fetch("map/grid.json").then(r=>r.json()),
    fetch("map/bundeslaender.geojson").then(r=>r.json()),
    fetch("map/germany.geojson").then(r=>r.json())
  ]).then(([g,bl,de])=>{
    grid=g; states=bl.features; outline=de.features[0].geometry.coordinates;
    hours=g.hours; hourMs=hours.map(h=>new Date(h+"Z").getTime());
    B=g.bbox; V={...B}; kx=Math.cos(((B.minLat+B.maxLat)/2)*Math.PI/180);
    prepare();
    nowIdx=idx=calcNowIdx();
    $("[data-loading]").hidden=true;
    $("[data-gen]").textContent=fmtGenerated(g.generated);
    buildStrip(); resize(); wire(); renderSide(); update();
    requestAnimationFrame(frame);
    loadDwd(); setInterval(loadDwd,10*60e3);
  }).catch(()=>{ $("[data-loading]").textContent="Karte konnte nicht geladen werden."; });

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

  // ---------- Geometrie ----------
  function resize(){
    const w=stage.clientWidth; if(!w||!grid) return;
    const gw=(B.maxLon-B.minLon)*kx, gh=(B.maxLat-B.minLat), ratio=gh/gw;
    W=w; H=Math.round(Math.min(W*ratio, Math.max(380, window.innerHeight*0.74)));
    cv.style.height=H+"px";
    [cv,base].forEach(c=>{ c.width=Math.round(W*DPR); c.height=Math.round(H*DPR); });
    fullScale=Math.min((W-28)/gw,(H-28)/gh);
    if(anim){ V={...anim.to}; anim=null; }
    setProj();
  }
  function setProj(){
    const gw=(V.maxLon-V.minLon)*kx, gh=(V.maxLat-V.minLat), pad=14;
    scale=Math.min((W-2*pad)/gw,(H-2*pad)/gh); ox=(W-gw*scale)/2; oy=(H-gh*scale)/2;
    cellR=grid.step*scale*0.95; dirty=true;
  }
  // Ausschnitt weich auf ein Bundesland (oder ganz Deutschland) fahren
  function zoomTo(id){
    let to={...B};
    const f=id&&stateById(id);
    if(f){ const b=bboxOf(f.geometry), padLon=(b[2]-b[0])*.12+.08, padLat=(b[3]-b[1])*.12+.06;
      to={minLon:b[0]-padLon,maxLon:b[2]+padLon,minLat:b[1]-padLat,maxLat:b[3]+padLat}; }
    anim={from:{...V},to,start:performance.now()};
    $("[data-zoomout]").hidden=!f;
  }
  const zoomLevel=()=>scale/fullScale;
  const px=(lon,lat)=>[ox+(lon-V.minLon)*kx*scale, oy+(V.maxLat-lat)*scale];
  const unpx=(x,y)=>[V.minLon+(x-ox)/(scale*kx), V.maxLat-(y-oy)/scale];
  function addAllRings(c,geom){ polys(geom).forEach(poly=>poly.forEach(ring=>{ ring.forEach((pt,i)=>{ const q=px(pt[0],pt[1]); i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]); }); c.closePath(); })); }
  const hatchCache={};
  function hatch(c,col){
    if(!hatchCache[col]){ const h=document.createElement("canvas"); h.width=h.height=8; const x=h.getContext("2d");
      x.strokeStyle=hexA(col,.45); x.lineWidth=1.4; x.beginPath(); x.moveTo(-2,10); x.lineTo(10,-2); x.moveTo(6,10); x.lineTo(10,6); x.moveTo(-2,2); x.lineTo(2,-2); x.stroke();
      hatchCache[col]=h; }
    return c.createPattern(hatchCache[col],"repeat");
  }
  function addRings(c,geom){ polys(geom).forEach(poly=>{ poly[0].forEach((pt,i)=>{ const q=px(pt[0],pt[1]); i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]); }); c.closePath(); }); }
  function traceOutline(c){ c.beginPath(); outline.forEach(poly=>{ poly[0].forEach((pt,i)=>{ const q=px(pt[0],pt[1]); i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]); }); c.closePath(); }); }
  function stateById(id){ return states.find(f=>f.properties.id===id); }

  function myLocations(){ try{ return (JSON.parse(localStorage.getItem(LOC_KEY))||[]).filter(l=>l.lat>=B.minLat&&l.lat<=B.maxLat&&l.lon>=B.minLon&&l.lon<=B.maxLon); }catch(e){ return []; } }

  // ---------- Zeichnen: statische Ebene (nur bei Änderung) ----------
  function renderBase(){
    const c=bctx; c.setTransform(DPR,0,0,DPR,0,0); c.clearRect(0,0,W,H);
    const t=hourMs[idx];

    // Landfläche mit sanftem Leuchten
    traceOutline(c);
    c.save(); c.shadowColor="rgba(51,167,140,.28)"; c.shadowBlur=28; c.fillStyle="#111821"; c.fill(); c.restore();
    const lg=c.createLinearGradient(0,0,0,H); lg.addColorStop(0,"rgba(67,211,173,.05)"); lg.addColorStop(1,"rgba(29,184,212,.02)");
    c.fillStyle=lg; c.fill();

    // Hover/Auswahl; im Ersatzbetrieb (ohne Warnflächen) ganzes Bundesland einfärben
    states.forEach(f=>{
      const id=f.properties.id, lv=dwdReady&&dwdSrc==="bs"?dwdLevel(id,t):0;
      if(lv<2&&id!==hover&&id!==selected) return;
      c.beginPath(); addRings(c,f.geometry);
      c.fillStyle=lv>=2?hexA(COL[lv],.17):(id===selected?"rgba(67,211,173,.07)":"rgba(157,189,208,.06)");
      c.fill();
    });

    // Vorhersage als Glüh-Flächen, auf Deutschland zugeschnitten
    c.save(); traceOutline(c); c.clip();
    for(const pass of [2,3,4]){
      grid.points.forEach(p=>{
        if(p.lv[idx]!==pass) return;
        const q=px(p.lon,p.lat), r=cellR*(pass>=3?1.12:1), col=COL[pass];
        const g=c.createRadialGradient(q[0],q[1],0,q[0],q[1],r);
        g.addColorStop(0,hexA(col,pass>=3?.85:.7)); g.addColorStop(.5,hexA(col,pass>=3?.45:.32)); g.addColorStop(1,hexA(col,0));
        c.fillStyle=g; c.beginPath(); c.arc(q[0],q[1],r,0,6.2832); c.fill();
      });
    }
    c.restore();

    // Amtliche Warnflächen (gemeindegenau), schwächere zuerst
    if(dwdReady) warns.filter(w=>isActive(w,t)).sort((a,b)=>(SEVLV[a.sev]||2)-(SEVLV[b.sev]||2)).forEach(w=>{
      const col=COL[SEVLV[w.sev]||2];
      c.beginPath(); w.parts.forEach(p=>addAllRings(c,p.g));
      c.fillStyle=hexA(col,.2); c.fill("evenodd");
      c.fillStyle=hatch(c,col); c.fill("evenodd");
      c.strokeStyle=hexA(col,.95); c.lineWidth=1.2; c.stroke();
    });

    // Grenzen
    c.lineJoin="round";
    c.beginPath(); states.forEach(f=>addRings(c,f.geometry));
    c.strokeStyle="rgba(157,189,208,.17)"; c.lineWidth=.8; c.stroke();
    if(dwdReady&&dwdSrc==="bs") states.forEach(f=>{
      const lv=dwdLevel(f.properties.id,t); if(lv<2) return;
      c.beginPath(); addRings(c,f.geometry); c.setLineDash([5,3]); c.strokeStyle=hexA(COL[lv],.85); c.lineWidth=1.4; c.stroke(); c.setLineDash([]);
    });
    traceOutline(c); c.strokeStyle="rgba(157,189,208,.5)"; c.lineWidth=1.3; c.stroke();

    // Herangezoomt: Umgebung abdunkeln, gewähltes Land hervorheben
    if(selected){ const f=stateById(selected); c.beginPath(); c.rect(0,0,W,H); addRings(c,f.geometry); c.fillStyle="rgba(8,12,17,.5)"; c.fill("evenodd"); }
    [hover,selected].forEach(id=>{
      if(!id) return; const f=stateById(id); if(!f) return;
      c.beginPath(); addRings(c,f.geometry);
      if(id===selected){ c.save(); c.shadowColor="rgba(67,211,173,.8)"; c.shadowBlur=12; c.strokeStyle="#43d3ad"; c.lineWidth=2.2; c.stroke(); c.restore(); }
      else { c.strokeStyle="rgba(238,244,247,.55)"; c.lineWidth=1.4; c.stroke(); }
    });

    // Städte (mehr Namen, je näher herangezoomt; ohne Überlappung)
    const small=W<420, z=zoomLevel(), boxes=[];
    c.font=`500 ${small?10:11}px "Exo 2", system-ui, sans-serif`; c.textBaseline="middle";
    CITIES.forEach(([name,lon,lat,tier])=>{
      if(tier===2&&z<1.6) return; if(tier===0&&small&&z<1.6) return;
      const q=px(lon,lat); if(q[0]<0||q[1]<0||q[0]>W||q[1]>H) return;
      const bw=c.measureText(name).width, bx=[q[0]-3,q[1]-7,q[0]+8+bw,q[1]+7];
      if(boxes.some(o=>bx[0]<o[2]&&bx[2]>o[0]&&bx[1]<o[3]&&bx[3]>o[1])) return; boxes.push(bx);
      c.fillStyle="rgba(188,217,233,.75)"; c.beginPath(); c.arc(q[0],q[1],tier===1?2.4:1.8,0,6.2832); c.fill();
      c.lineWidth=3; c.strokeStyle="rgba(8,12,17,.75)"; c.strokeText(name,q[0]+6,q[1]);
      c.fillStyle=tier===2?"rgba(188,217,233,.5)":"rgba(188,217,233,.62)"; c.fillText(name,q[0]+6,q[1]);
    });
    dirty=false;
  }

  // ---------- Zeichnen: animierte Ebene (Pulse, eigene Orte) ----------
  let lastFrame=0;
  function frame(ts){
    requestAnimationFrame(frame);
    if(!W||root.offsetParent===null||ts-lastFrame<33) return;
    lastFrame=ts;
    if(anim){ const k=Math.min(1,(performance.now()-anim.start)/550), e=1-Math.pow(1-k,3);
      for(const key in V) V[key]=anim.from[key]+(anim.to[key]-anim.from[key])*e;
      setProj(); if(k>=1) anim=null; }
    if(dirty) renderBase();
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); ctx.drawImage(base,0,0);
    ctx.setTransform(DPR,0,0,DPR,0,0);

    // Brennpunkte pulsieren
    grid.points.forEach((p,i)=>{
      const lv=p.lv[idx]; if(lv<3) return;
      const ph=((ts/1600)+(i%7)/7)%1, q=px(p.lon,p.lat);
      ctx.beginPath(); ctx.arc(q[0],q[1],cellR*(.25+ph*.75),0,6.2832);
      ctx.strokeStyle=hexA(COL[lv],(1-ph)*.55); ctx.lineWidth=1.5; ctx.stroke();
    });

    // Gewählter Hover-Punkt
    if(hoverPt){ ctx.beginPath(); ctx.arc(hoverPt[0],hoverPt[1],4,0,6.2832); ctx.fillStyle="rgba(238,244,247,.9)"; ctx.fill(); }

    // Eigene Orte als Pins
    const locs=myLocations();
    ctx.font='600 11px "Exo 2", system-ui, sans-serif'; ctx.textBaseline="middle";
    locs.forEach(l=>{
      const q=px(l.lon,l.lat), ph=(ts/2000)%1;
      ctx.beginPath(); ctx.arc(q[0],q[1],5+ph*10,0,6.2832); ctx.strokeStyle=`rgba(67,211,173,${(1-ph)*.6})`; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(q[0],q[1],4.5,0,6.2832); ctx.fillStyle="#43d3ad"; ctx.fill();
      ctx.lineWidth=1.6; ctx.strokeStyle="#080c11"; ctx.stroke();
      const name=String(l.name||"").slice(0,22);
      ctx.lineWidth=3; ctx.strokeStyle="rgba(8,12,17,.85)"; ctx.strokeText(name,q[0]-ctx.measureText(name).width-9,q[1]);
      ctx.fillStyle="#bff5e6"; ctx.fillText(name,q[0]-ctx.measureText(name).width-9,q[1]);
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
  function select(id){ if(id===selected) return; selected=id; hover=null; dirty=true; zoomTo(id); renderSide(); }

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

    $("[data-zoomout]").onclick=()=>select(null);
    const at=e=>{ const r=cv.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; };
    const stateAt=(x,y)=>{ const [lon,lat]=unpx(x,y); const f=states.find(f=>inGeom(lon,lat,f.geometry)); return f?f.properties.id:null; };
    cv.addEventListener("pointermove",e=>{
      if(e.pointerType==="touch") return;
      const [x,y]=at(e), id=stateAt(x,y);
      if(id!==hover){ hover=id; dirty=true; }
      cv.style.cursor=id?"pointer":"default";
      if(!id){ tip.hidden=true; hoverPt=null; return; }
      showTip(id,x,y);
    });
    cv.addEventListener("pointerleave",()=>{ if(hover){ hover=null; dirty=true; } tip.hidden=true; hoverPt=null; });
    cv.addEventListener("click",e=>{
      const [x,y]=at(e), id=stateAt(x,y);
      select(id);
      if(e.pointerType==="touch"||!matchMedia("(hover:hover)").matches){ if(id) showTip(id,x,y); else tip.hidden=true; }
      if(id&&window.innerWidth<760) $("[data-side]").scrollIntoView({behavior:"smooth",block:"nearest"});
    });

    if(window.ResizeObserver) new ResizeObserver(()=>resize()).observe(stage);
    else window.addEventListener("resize",resize);
    // Orte auf der Hauptseite können sich ändern — Brennpunkte bleiben, Pins werden je Frame gelesen
  }
  function showTip(id,x,y){
    const f=stateById(id), [lon,lat]=unpx(x,y);
    let best=null,bd=1e9;
    grid.points.forEach(p=>{ const d=(p.lat-lat)**2+((p.lon-lon)*kx)**2; if(d<bd){bd=d;best=p;} });
    const lv=best&&bd<(grid.step*.8)**2?best.lv[idx]:0, hz=lv>=2?best.hz[idx]:0;
    hoverPt=lv>=2?px(best.lon,best.lat):null;
    const t=hourMs[idx];
    const off=!dwdReady?[]:dwdSrc==="geo"
      ? warns.filter(w=>isActive(w,t)&&w.parts.some(p=>lon>=p.b[0]&&lon<=p.b[2]&&lat>=p.b[1]&&lat<=p.b[3]&&inGeomHoles(lon,lat,p.g)))
      : dwdActive(id,t);
    tip.innerHTML=`<b>${esc(f.properties.name)}</b>
      <div>${lv>=2?`${sq(lv)} ${ICON[hz]||""} ${HAZ[hz]||"Gefahr"} · ${LVNAME[lv]}`:"🌤 hier ruhig"}</div>
      ${off.length?`<div class="dk-tip-off">⚠ amtlich${dwdSrc==="geo"?" hier":""}: ${esc([...new Set(off.map(a=>cap(a.event)))].slice(0,2).join(", "))}</div>`:""}`;
    tip.hidden=false;
    const tw=tip.offsetWidth, th=tip.offsetHeight;
    tip.style.left=Math.max(6,Math.min(W-tw-6, x+14>W-tw-6?x-tw-14:x+14))+"px";
    tip.style.top=Math.max(6,Math.min(H-th-6,y-th/2))+"px";
  }

  function fmtGenerated(g){
    if(!g) return "";
    const d=new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(g)?g:g+"Z");
    if(isNaN(d.getTime())) return "";
    return `Modell-Raster ~0,4° · Stand ${WD[d.getDay()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())} Uhr · DWD-Warnflächen gemeindegenau`;
  }
})();
