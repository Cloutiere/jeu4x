/**
 * CARTE-50 — Banc de conformité 500 seeds (5 sièges, pire cas), hors CI.
 * Produit le tableau de taux par règle du rapport REPORT-CARTE-50.md.
 * Usage : npx tsx devtmp/banc-carte-50.mjs
 */
import { generateProceduralMap, resolveProgenSettings } from '../src/progen/index.js';
import { hexDistance, hexesWithinRadius, neighbors, tileKeyOf } from '../src/hex.js';
import { RESOURCES, TERRAINS } from '../src/data.js';
import { artefactsForMap } from '../src/artefacts.js';

const N = Number(process.argv[2] ?? 500);
const seeds = Array.from({ length: N }, (_, i) => 1 + i * 7919);
const taux = {};
const tick = (rule, ok) => {
  const t = (taux[rule] ??= { ok: 0, total: 0 });
  t.total += 1;
  if (ok) t.ok += 1;
};
const echecs = [];
const temps = [];
let spreads = { strict8: 0, tolr12: 0 };
let deficits = {};
let t0 = Date.now();
let generationKo = 0;

const s = resolveProgenSettings({ playerCount: 5 });
for (const seed of seeds) {
  const st = Date.now();
  try {
    const { map, report } = generateProceduralMap(seed, { playerCount: 5 });
    temps.push(Date.now() - st);
    const spawns = map.spawns.map((sp) => sp.capital);
    tick('dimensions 50×40', report.settings.libreLargeur === 50 && report.settings.libreHauteur === 40);
    let pairsOk = true;
    for (let i = 0; i < spawns.length; i++)
      for (let j = i + 1; j < spawns.length; j++)
        if (hexDistance(spawns[i], spawns[j]) < 12) pairsOk = false;
    tick('parseMap : capitales all-pairs ≥ 12', pairsOk);
    for (const cap of spawns) {
      const counts = {};
      for (const n of neighbors(cap)) counts[map.terrain[tileKeyOf(n)]] = (counts[map.terrain[tileKeyOf(n)]] ?? 0) + 1;
      const montagne = 'montagne' in counts;
      const libreOk = Object.entries(counts).every(([t]) => {
        if (t === 'foret' || t === 'prairie' || t === 'eau') return true;
        if (t === 'montagne') return false;
        const y = TERRAINS[t].yields ?? { food: 0, production: 0, commerce: 0 };
        return y.food + y.production + y.commerce > 0;
      });
      tick(`R-157 anneau (×5 spawns)`, (counts['foret'] ?? 0) >= s.spawnRingForet && (counts['prairie'] ?? 0) >= s.spawnRingPrairie && counts['eau'] === s.spawnRingEau && !montagne && libreOk);
      tick(`T-45 purge rayon 2 (×5 spawns)`, hexesWithinRadius(cap, s.spawnPurgeRadius).every((h) => !map.resources.find((r) => tileKeyOf(r) === tileKeyOf(h))));
    }
    const spread = report.multi.pairSpread;
    spreads.strict8 += spread <= 8 ? 1 : 0;
    spreads.tolr12 += spread <= 12 ? 1 : 0;
    tick('équidistance ≤ tolérance évolutive (≤ 12)', spread <= s.librePairSpreadMax + 4);
    tick('équidistance stricte 🔶 ≤ 8', spread <= s.librePairSpreadMax);
    const artefacts = artefactsForMap(map, seed >>> 0);
    tick('7o : ≥ 4 artefacts posés', artefacts.length >= 4);
    let artefactsOk = true;
    let atlantideOk = true;
    for (const a of artefacts) {
      const dMin = Math.min(...spawns.map((c) => hexDistance(c, a)));
      if (dMin < 4) artefactsOk = false;
      if (a.artefactId === 'atlantide' && map.terrain[tileKeyOf(a)] !== 'ocean') atlantideOk = false;
    }
    tick('7o : dMin(artefact, capitales) ≥ 4', artefactsOk);
    tick('7o : Atlantide en haute mer (si tirée)', atlantideOk);
    const echelle = 1.25;
    tick('7d : villages/huttes aux totaux × échelle (15+15)', map.villages.length === Math.round(s.villagesPerHalf * 2 * echelle) && map.huts.length === Math.round(s.hutsPerHalf * 2 * echelle));
    let villagesOk = true;
    for (const v of map.villages) {
      if (spawns.some((c) => hexDistance(c, v) < s.minVillageDistance)) villagesOk = false;
      if (map.villages.some((o) => o !== v && hexDistance(o, v) < s.villageSpacing)) villagesOk = false;
    }
    tick('R-96 : villages ≥ 6 des spawns et ≥ 6 entre eux', villagesOk);
    let hutsOk = true;
    for (const h of map.huts) {
      if (spawns.some((c) => hexDistance(c, h) < s.minHutDistance)) hutsOk = false;
      if (map.huts.some((o) => o !== h && hexDistance(o, h) < s.hutSpacing)) hutsOk = false;
      if (map.villages.some((v) => hexDistance(v, h) < s.hutVillageSpacing)) hutsOk = false;
    }
    tick('R-98/7d : huttes ≥ 3 spawns / ≥ 3 entre elles / ≥ 2 des villages', hutsOk);
    const terrainAt = (h) => map.terrain[tileKeyOf(h)];
    let terrainsOk = true;
    for (const r of map.resources) if (!RESOURCES[r.id].terrains.includes(terrainAt(r))) terrainsOk = false;
    tick('R-91 : chaque ressource sur un terrain légal', terrainsOk);
    let spacingOk = true;
    for (let i = 0; i < map.resources.length; i++)
      for (let j = i + 1; j < map.resources.length; j++)
        if (hexDistance(map.resources[i], map.resources[j]) < s.minResourceDistance) spacingOk = false;
    tick('R-108 : espacement ressources ≥ 2 (toutes paires)', spacingOk);
    for (const [id, d] of Object.entries(report.multi.couvertureManquants)) deficits[id] = (deficits[id] ?? 0) + d;
    tick('R-108 : couverture complète (déficit 0)', Object.keys(report.multi.couvertureManquants).length === 0);
    tick('connexité (archipel exempt)', report.connected || report.settings.continents === 3);
  } catch (e) {
    generationKo += 1;
    echecs.push(`seed ${seed} : ${e.message}`);
  }
}
const total = Date.now() - t0;
console.log(`=== CARTE-50 · banc ${N} seeds, 5 sièges, archipel (défaut) — ${total} ms ===`);
console.log(`générations échouées : ${generationKo}/${N}`);
const avg = temps.reduce((a, b) => a + b, 0) / Math.max(1, temps.length);
const p95 = temps.slice().sort((a, b) => a - b)[Math.floor(temps.length * 0.95)] ?? 0;
console.log(`temps génération : moyenne ${avg.toFixed(0)} ms, p95 ${p95} ms, max ${Math.max(...temps, 0)} ms`);
console.log(`équidistance : strict ≤ 8 sur ${spreads.strict8}/${N} seeds ; ≤ 12 (tolérance évolutive) sur ${spreads.tolr12}/${N}`);
if (Object.keys(deficits).length) console.log('déficits de couverture cumulés :', JSON.stringify(deficits));
console.log('--- tableau de conformité ---');
for (const [rule, t] of Object.entries(taux)) console.log(`${rule} : ${t.ok}/${t.total} (${((100 * t.ok) / t.total).toFixed(1)} %)`);
if (echecs.length) console.log('ÉCHECS :\n' + echecs.join('\n'));
