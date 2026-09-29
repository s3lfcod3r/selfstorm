"use strict";
function normalizeBbk(data, now = Date.now()) {
    if (!Array.isArray(data)) throw new Error('data must be an array');
    const allowedSeverity = ['Minor', 'Moderate', 'Severe', 'Extreme'];
    const result = data.map(x => {
        if (typeof x !== 'object' || x === null) throw new Error('entry must be object');
        if (typeof x.id !== 'string' || x.id.length === 0) throw new Error('invalid id');
        if (!x.i18nTitle || typeof x.i18nTitle.de !== 'string' || x.i18nTitle.de.length === 0)
            throw new Error('missing German title');
        const start = Date.parse(x.startDate);
        if (Number.isNaN(start)) throw new Error('invalid startDate');
        if (!['Alert', 'Update', 'Cancel'].includes(x.type)) throw new Error('invalid type');
        let expires = null;
        let expiresTs = null;
        if (x.expiresDate !== undefined && x.expiresDate !== null) {
            expires = x.expiresDate;
            expiresTs = Date.parse(expires);
            if (Number.isNaN(expiresTs)) throw new Error('invalid expiresDate');
        }
        return { id: x.id, title: x.i18nTitle.de, type: x.type, severity: allowedSeverity.includes(x.severity) ? x.severity : 'Unknown', start: x.startDate, expires: expires };
    });
    const filtered = result.filter(item => {
        if (item.expires === null) return true;
        const ts = Date.parse(item.expires);
        return ts > now;
    });
    return filtered.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
}

function renderBbk(list, items) {
  list.replaceChildren();
  if (!Array.isArray(items) || items.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Der BBK-Feed enthält derzeit keine aktuellen MoWaS-Meldungen.';
    list.append(li);
    return;
  }
  const severityMap = { Minor: 'Gering', Moderate: 'Mäßig', Severe: 'Erheblich', Extreme: 'Extrem', Unknown: 'Unbekannt' };
  const statusMap = { Cancel: 'Entwarnung', Update: 'Aktualisierung', Alert: 'Warnmeldung' };
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'bbk-item';
    const h3 = document.createElement('h3');
    h3.textContent = item.title;
    const p = document.createElement('p');
    p.className = 'bbk-meta';
    const status = statusMap[item.type] ?? item.type;
    const severity = severityMap[item.severity] ?? item.severity;
    const dateText = 'Meldung vom ' + new Date(item.start).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
    p.textContent = item.type==='Cancel' ? `${status} · ${dateText}` : `${status} · ${severity} · ${dateText}`;
    li.append(h3, p);
    if (item.expires && item.type !== 'Cancel') {
      const p2 = document.createElement('p');
      p2.className = 'bbk-meta';
      p2.textContent = 'Gültig bis ' + new Date(item.expires).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
      li.append(p2);
    }
    list.append(li);
  }
}

async function fetchBbk(fetcher=fetch){
  const r=await fetcher('https://warnung.bund.de/api31/mowas/mapData.json',{signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!r.ok) throw new Error('BBK HTTP '+r.status);
  return normalizeBbk(await r.json());
}

function mountBbk(root){
  const list=root.querySelector('[data-bbk-list]');
  const status=root.querySelector('[data-bbk-status]');
  const button=root.querySelector('[data-bbk-refresh]');
  let busy=false;
  async function reload(){
    if(busy)return;
    busy=true;
    button.disabled=true;
    status.textContent='BBK-Meldungen werden geladen…';
    try{
      const items=await fetchBbk();
      renderBbk(list,items);
      status.textContent=items.length+' Meldungen · Abruf '+new Date().toLocaleString('de-DE',{timeZone:'Europe/Berlin'})+' Uhr';
    }catch(e){
      list.replaceChildren();
      status.textContent='BBK-Meldungen nicht abrufbar. Bitte die Originalübersicht auf warnung.bund.de prüfen.';
    }finally{
      busy=false;
      button.disabled=false;
    }
  }
  button.addEventListener('click',reload);
  reload();
  setInterval(()=>{if(!document.hidden)reload();},300000);
}
if(typeof module==='object'&&module.exports)module.exports={normalizeBbk,fetchBbk,renderBbk,mountBbk};
if(typeof document!=='undefined'){
  const root=document.getElementById('bbk');
  if(root)mountBbk(root);
}
