'use strict';
// BBK-Daten-Synchronisation für die Warnseite (wetter.selfcoder.de).
// Läuft in der GitHub-Action (Node 20, globale fetch). Keine npm-Pakete.
// Holt die ROHEN Daten von warnung.bund.de und legt sie lokal unter bbk/ ab,
// damit die Seite sie ohne CORS-Blockade von der eigenen Domain laden kann.
// Die Seite wendet normalizeBbk (bbk.js) bzw. normalizeGeo (bbk-geo.js)
// selbst an – deshalb wird rohes JSON gespeichert.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://warnung.bund.de/api31';
const BBK_DIR = path.join(__dirname, '..', 'bbk');
const NOW = Date.now();
const TIMEOUT_MS = 30000;
const UA = 'SelfStorm-bot/1.0 (wetter.selfcoder.de)';

function isNotExpired(x) {
  if (!x || typeof x !== 'object') return false;
  if (x.expiresDate == null) return true;
  const ts = Date.parse(x.expiresDate);
  return !Number.isNaN(ts) && ts > NOW;
}

function fileFor(id) {
  return path.join(BBK_DIR, `${encodeURIComponent(id)}.geojson`);
}

async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
    headers: { accept: 'application/json', 'user-agent': UA }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}

async function main() {
  fs.mkdirSync(BBK_DIR, { recursive: true });

  const raw = await getJson(`${API}/mowas/mapData.json`);
  if (!Array.isArray(raw)) throw new Error('mapData.json ist kein Array');
  fs.writeFileSync(path.join(BBK_DIR, 'mapData.json'), JSON.stringify(raw), 'utf8');

  const wanted = new Set();
  for (const x of raw) {
    if (x && typeof x.id === 'string' && x.id.length > 0 && isNotExpired(x)) wanted.add(x.id);
  }

  for (const id of wanted) {
    const geo = await getJson(`${API}/warnings/${encodeURIComponent(id)}.geojson`);
    fs.writeFileSync(fileFor(id), JSON.stringify(geo), 'utf8');
  }

  // veraltete geojson-Dateien entfernen (Warnung abgelaufen oder entwarnt)
  for (const name of fs.readdirSync(BBK_DIR)) {
    if (!name.endsWith('.geojson')) continue;
    const id = decodeURIComponent(name.replace(/\.geojson$/, ''));
    if (!wanted.has(id)) fs.unlinkSync(path.join(BBK_DIR, name));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
