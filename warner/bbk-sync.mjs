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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mit Wiederholung: warnung.bund.de liefert gelegentlich eine unvollständige
// Zertifikatskette (UNABLE_TO_VERIFY_LEAF_SIGNATURE) oder läuft ins Timeout.
async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(i * 10000);
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
        headers: { accept: 'application/json', 'user-agent': UA }
      });
      if (res.status >= 400 && res.status < 500) throw Object.assign(new Error('HTTP ' + res.status + ' ' + url), { final: true });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (err.final) break;
    }
  }
  throw lastErr;
}

const reason = (err) => err?.cause?.code || err?.message || String(err);

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
    try {
      const geo = await getJson(`${API}/warnings/${encodeURIComponent(id)}.geojson`);
      fs.writeFileSync(fileFor(id), JSON.stringify(geo), 'utf8');
    } catch (err) {
      // eine fehlende Fläche ist kein Grund, den ganzen Lauf scheitern zu lassen;
      // eine schon vorhandene Datei bleibt stehen
      console.log(`::warning::BBK-Fläche ${id} nicht abrufbar (${reason(err)})`);
    }
  }

  // veraltete geojson-Dateien entfernen (Warnung abgelaufen oder entwarnt)
  for (const name of fs.readdirSync(BBK_DIR)) {
    if (!name.endsWith('.geojson')) continue;
    const id = decodeURIComponent(name.replace(/\.geojson$/, ''));
    if (!wanted.has(id)) fs.unlinkSync(path.join(BBK_DIR, name));
  }
}

main().catch((err) => {
  // Quelle nicht erreichbar: alter Spiegel bleibt stehen, der nächste Lauf (in 10 min) holt nach.
  console.log(`::warning::BBK-Daten nicht abrufbar (${reason(err)}) — Spiegel bleibt auf altem Stand`);
});
