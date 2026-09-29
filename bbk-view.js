(function () {
  const root = document.getElementById('dekarte');
  if (!root) return;

  let items = [];
  let status = 'loading';
  let point = null;
  let activeList = [];
  let cancelList = [];
  let pathVersion = 0;
  let pathCache = { key: '', paths: [] };

  const panel = document.createElement('section');
  panel.className = 'bbk-panel';
  panel.innerHTML = `
    <h3>BBK · Warngebiete und Standort</h3>
    <label>
      <input type="checkbox" data-layer checked>
      Aktuelle BBK-Warngebiete anzeigen (violett)
    </label>
    <p>BBK zeigt die aktuelle Lage, unabhängig vom Wetter-Zeitraffer. Warngebiet bedeutet nicht automatisch Evakuierungsgebiet.</p>
    <label>
      <select data-place aria-label="Ort für die BBK-Standortprüfung wählen">
        <option value="">Ganz Deutschland</option>
      </select>
    </label>
    <button data-gps>Meinen Standort prüfen</button>
    <button data-reset hidden>Auswahl zurücksetzen</button>
    <p data-message role="status"></p>
    <ul data-results class="bbk-list"></ul>
  `;
  root.append(panel);

  const layer = panel.querySelector('[data-layer]');
  const places = panel.querySelector('[data-place]');
  const gps = panel.querySelector('[data-gps]');
  const reset = panel.querySelector('[data-reset]');
  const message = panel.querySelector('[data-message]');
  const results = panel.querySelector('[data-results]');

  let saved = [];

  function locations() {
    try {
      const raw = JSON.parse(localStorage.getItem('selfstorm.locations.v1'));
      if (!Array.isArray(raw)) return [];
      return raw.filter((l) => l && Number.isFinite(l.lon) && Number.isFinite(l.lat));
    } catch {
      return [];
    }
  }

  function refreshPlaces() {
    saved = locations();
    places.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'Ganz Deutschland';
    places.append(all);
    saved.forEach((l, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = l.name;
      places.append(o);
    });
    const existing = saved.find((l) => point && l.lon === point.lon && l.lat === point.lat);
    places.value = existing ? String(saved.indexOf(existing)) : '';
  }

  places.onchange = () => {
    point = places.value === '' ? null : saved[Number(places.value)];
    render();
  };
  layer.onchange = render;
  reset.onclick = () => {
    point = null;
    places.value = '';
    render();
  };
  window.addEventListener('storage', refreshPlaces);
  window.addEventListener('selfstorm:locations', refreshPlaces);
  refreshPlaces();

  function refreshActive() {
    const now = Date.now();
    activeList = items.filter((i) => i.type !== 'Cancel' && i.startTs <= now && (i.expiresTs == null || i.expiresTs > now));
    cancelList = items.filter((i) => i.type === 'Cancel' && i.startTs <= now && (i.expiresTs == null || i.expiresTs > now));
    pathVersion++;
  }

  function render() {
    results.replaceChildren();
    reset.hidden = !point;
    if (status === 'loading') {
      message.textContent = 'BBK-Warngebiete werden geladen…';
      return;
    }
    if (status === 'error') {
      message.textContent = 'BBK nicht abrufbar – Standortauskunft nicht verfügbar.';
      return;
    }
    refreshActive();
    const all = activeList;
    const unknown = all.filter((i) => i.geometryStatus !== 'ready').length;
    const hits = point ? window.BbkGeo.matches(all, point.lon, point.lat) : all;
    const cancels = point ? cancelList.filter((i) => i.geometryStatus === 'ready' && window.BbkGeo.contains(i.geometries, point.lon, point.lat)) : [];
    let msg = (point ? point.name : 'Ganz Deutschland') + ': ' + hits.length + ' aktuelle BBK-Meldungen';
    if (unknown) {
      msg += ' Zuordnung unvollständig: ' + unknown + ' Warngebiete fehlen.';
    }
    if (point && hits.length === 0 && cancels.length === 0) {
      msg += ' Keine zugeordnete Meldung; Originalübersicht prüfen.';
    }
    message.textContent = msg;
    for (const item of cancels) {
      const li = document.createElement('li');
      li.className = 'bbk-item bbk-cancel';
      const h4 = document.createElement('h4');
      h4.textContent = item.title;
      const p = document.createElement('p');
      p.textContent = 'Entwarnung für dieses Gebiet';
      const a = document.createElement('a');
      a.href = 'https://warnung.bund.de/meldungen';
      a.textContent = 'Originalmeldung und Handlungsempfehlungen';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.append(h4, p, a);
      results.append(li);
    }
    for (const item of hits) {
      const li = document.createElement('li');
      li.className = 'bbk-item';
      const h4 = document.createElement('h4');
      h4.textContent = item.title;
      const p = document.createElement('p');
      p.textContent = 'BBK-Warngebiet · ' + (item.geometryStatus === 'ready' ? 'räumlich zugeordnet' : 'Gebietsgrenzen fehlen');
      const a = document.createElement('a');
      a.href = 'https://warnung.bund.de/meldungen';
      a.textContent = 'Originalmeldung und Handlungsempfehlungen';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.append(h4, p, a);
      results.append(li);
    }
  }
  function buildPaths(px) {
    const a = px(6, 47), b = px(15, 55);
    const key = a[0] + ',' + a[1] + ',' + b[0] + ',' + b[1] + ':' + pathVersion;
    if (pathCache.key === key) return pathCache.paths;
    const paths = [];
    for (const it of activeList) {
      if (it.geometryStatus !== 'ready') continue;
      for (const geom of it.geometries) {
        const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
        for (const poly of polygons) {
          const path = new Path2D();
          for (const ring of poly) {
            for (let i = 0; i < ring.length; i++) {
              const p = px(ring[i][0], ring[i][1]);
              if (i === 0) path.moveTo(p[0], p[1]);
              else path.lineTo(p[0], p[1]);
            }
            path.closePath();
          }
          paths.push(path);
        }
      }
    }
    pathCache = { key, paths };
    return paths;
  }
  function draw(ctx, px) {
    ctx.save();
    if (layer.checked && status === 'ready') {
      ctx.fillStyle = 'rgba(192,132,252,0.22)';
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      for (const path of buildPaths(px)) {
        ctx.fill(path, 'evenodd');
        ctx.stroke(path);
      }
    }
    if (point) {
      const [x, y] = px(point.lon, point.lat);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      const label = point.name;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.strokeText(label, x + 10, y - 4);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 10, y - 4);
    }
    ctx.restore();
  }
  gps.onclick = () => {
    if (!navigator.geolocation) {
      message.textContent = 'Standort nicht verfügbar – gespeicherten Ort auswählen.';
      return;
    }
    gps.disabled = true;
    navigator.geolocation.getCurrentPosition((pos) => {
      point = { lon: pos.coords.longitude, lat: pos.coords.latitude, name: 'Mein Standort' };
      places.value = '';
      gps.disabled = false;
      render();
    }, () => {
      gps.disabled = false;
      message.textContent = 'Standort nicht verfügbar – gespeicherten Ort auswählen.';
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  };
  window.BbkView = {
    update(next, state) {
      items = (Array.isArray(next) ? next : []).map((i) => ({
        ...i,
        startTs: Date.parse(i.start),
        expiresTs: i.expires == null ? null : Date.parse(i.expires)
      }));
      status = state;
      refreshActive();
      render();
    },
    draw,
    pick(lon, lat) {
      if (!layer.checked) return;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      point = { lon, lat, name: 'Gewählter Kartenpunkt' };
      places.value = '';
      render();
    }
  };
  render();
})();
