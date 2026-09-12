// SelfStorm Gefahren-Heuristik — EINE Quelle für Webseite (index.html), Wächter
// (warner/check.mjs) und Karten-Vorrechner (map/build-grid.mjs).
// Klassisches Script ohne Build-Schritt: im Browser als window.SelfStormHazards,
// in Node per `import H from "../hazards.js"` (CommonJS-Export).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SelfStormHazards = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const HAZ_ADVICE = {
    "Hagel": "Auto möglichst unterstellen oder schützen.",
    "Gewitter": "Bei Gewitter drinnen bleiben, Loses draußen sichern.",
    "Hagel möglich": "Kräftige Gewitter, Hagel möglich — Auto lieber unterstellen.",
    "Gewitter möglich": "Einzelne Gewitter möglich.",
    "Orkanböen": "Sturmgefahr — Loses sichern, Bäume/Gerüste meiden.",
    "Sturmböen": "Loses draußen sichern, im Wald aufpassen.",
    "Windböen": "Vereinzelt kräftige Böen.",
    "Starkregen": "Überflutung und Aquaplaning möglich.",
    "kräftiger Regen": "Zeitweise kräftiger Regen.",
    "starke Hitze": "Große Hitze — viel trinken, Mittagssonne meiden.",
    "Hitze": "Warm — viel trinken, Schatten suchen.",
    "Glatteis": "Glatteis durch gefrierenden Regen — sehr vorsichtig fahren und gehen.",
    "Glättegefahr": "Rutschgefahr durch Glätte.",
    "strenger Frost": "Strenger Frost — Frostschutz beachten.",
    "Frost": "Frost — Glätte und Kälte möglich.",
    "starker Schneefall": "Starker Schneefall — Behinderungen und Glätte.",
    "Schneefall": "Schneefall — mögliche Glätte.",
    "dichter Nebel": "Dichter Nebel — sehr schlechte Sicht im Verkehr.",
    "Nebel": "Nebel — schlechte Sicht."
  };

  // Kategorien für die Karte: 1 Gewitter/Hagel, 2 Sturm, 3 Starkregen, 4 Hitze, 5 Frost/Glätte, 6 Schnee, 7 Nebel
  const HAZ_CAT = {
    "Hagel": 1, "Gewitter": 1, "Hagel möglich": 1, "Gewitter möglich": 1,
    "Orkanböen": 2, "Sturmböen": 2, "Windböen": 2,
    "Starkregen": 3, "kräftiger Regen": 3,
    "starke Hitze": 4, "Hitze": 4,
    "Glatteis": 5, "Glättegefahr": 5, "strenger Frost": 5, "Frost": 5,
    "starker Schneefall": 6, "Schneefall": 6,
    "dichter Nebel": 7, "Nebel": 7
  };

  const num = v => (v == null || Number.isNaN(v)) ? 0 : v;

  // Alle Treffer einer Stunde als [Level, Label] in fester Reihenfolge (Level 2–4).
  // Werte außer `code` bereits mit num() bereinigt übergeben.
  function hazardHits(code, cape, gust, pr, temp, snow, vis) {
    const hits = [];
    if (code === 96 || code === 99) hits.push([4, "Hagel"]);
    else if (code === 95) hits.push([cape >= 1500 ? 4 : 3, "Gewitter"]);
    if (cape >= 1200) hits.push([3, "Hagel möglich"]); else if (cape >= 800) hits.push([2, "Gewitter möglich"]);
    if (gust >= 90) hits.push([4, "Orkanböen"]); else if (gust >= 70) hits.push([3, "Sturmböen"]); else if (gust >= 55) hits.push([2, "Windböen"]);
    if (pr >= 15) hits.push([3, "Starkregen"]); else if (pr >= 5) hits.push([2, "kräftiger Regen"]);
    if (temp >= 36) hits.push([3, "starke Hitze"]); else if (temp >= 30) hits.push([2, "Hitze"]);
    if (code === 66 || code === 67) hits.push([3, "Glatteis"]); else if (temp <= 1 && temp >= -3 && pr >= 0.1) hits.push([2, "Glättegefahr"]);
    if (temp <= -10) hits.push([3, "strenger Frost"]); else if (temp <= -5) hits.push([2, "Frost"]);
    if (snow >= 5 || code === 75 || code === 86) hits.push([3, "starker Schneefall"]); else if (snow >= 1 || code === 71 || code === 73 || code === 85) hits.push([2, "Schneefall"]);
    if (vis > 0 && vis < 200) hits.push([3, "dichter Nebel"]); else if (vis > 0 && vis < 1000) hits.push([2, "Nebel"]); else if (vis <= 0 && (code === 45 || code === 48)) hits.push([2, "Nebel"]);
    return hits;
  }

  // Stärkster Treffer (bei Gleichstand der zuerst gefundene) → { lv, label, cat, hits }
  // Sortiert `hits` absichtlich in place (absteigend nach Level) — die Reihenfolge
  // der Tags/Chips hängt davon ab.
  function topHazard(hits) {
    if (!hits.length) return { lv: 0, label: "", cat: 0, hits };
    const top = hits.sort((a, b) => b[0] - a[0])[0];
    return { lv: top[0], label: top[1], cat: HAZ_CAT[top[1]], hits };
  }

  // Bereinigte Werte der Stunde i aus einem Open-Meteo-`hourly`-Block
  function hourValues(h, i) {
    return {
      code: h.weather_code[i], cape: num(h.cape[i]), gust: num(h.wind_gusts_10m[i]),
      pr: num(h.precipitation[i]), temp: num(h.temperature_2m && h.temperature_2m[i]),
      snow: num(h.snowfall && h.snowfall[i]), vis: num(h.visibility && h.visibility[i])
    };
  }

  function hourHazard(h, i) {
    const v = hourValues(h, i);
    return topHazard(hazardHits(v.code, v.cape, v.gust, v.pr, v.temp, v.snow, v.vis));
  }

  // Grundanalyse einer Vorhersage: Ereignisse ab Level 2, Höhepunkt, alle Treffer-Labels
  function analyze(fc) {
    const h = fc.hourly, t = h.time, out = { events: [], peak: 0, peakTime: null, peakLabel: "", tags: new Set() };
    for (let i = 0; i < t.length; i++) {
      const r = hourHazard(h, i);
      if (!r.lv) continue;
      if (r.lv >= 2) { out.events.push({ time: t[i], lv: r.lv, label: r.label }); r.hits.forEach(x => out.tags.add(x[1])); }
      if (r.lv > out.peak) { out.peak = r.lv; out.peakTime = t[i]; out.peakLabel = r.label; }
    }
    return out;
  }

  return { HAZ_ADVICE, HAZ_CAT, num, hazardHits, topHazard, hourValues, hourHazard, analyze };
});
