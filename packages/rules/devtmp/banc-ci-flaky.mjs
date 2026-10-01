/**
 * CI-FLAKY — Banc 1v1 40×40 (miroir, défauts) reproduisant EXACTEMENT les
 * assertions des deux tests intermittents :
 *  - packages/rules/tests/progen-properties.test.ts (fast-check, seeds aléatoires)
 *    → villages.length ≥ 12, huttes.length ≥ 12, distances réglementaires ;
 *  - apps/server/tests/procedural.test.ts « procedural-40 »
 *    → 36 barbares (3/village × 12 villages) → « −3 barbares » = 1 village manquant.
 * Usage : npx tsx devtmp/banc-ci-flaky.mjs [N]
 */
import { generateProceduralMap, resolveProgenSettings } from '../src/progen/index.js';
import { hexDistance } from '../src/hex.js';

const N = Number(process.argv[2] ?? 1000);
const seeds = Array.from({ length: N }, (_, i) => 1 + i * 7919);
const s = resolveProgenSettings();
const histoVillages = {};
const histoHuttes = {};
const fautives = [];
let generationKo = 0;
let t0 = Date.now();

for (const seed of seeds) {
  let map;
  try {
    ({ map } = generateProceduralMap(seed));
  } catch (e) {
    generationKo += 1;
    fautives.push(`${seed} : génération KO — ${e.message}`);
    continue;
  }
  histoVillages[map.villages.length] = (histoVillages[map.villages.length] ?? 0) + 1;
  histoHuttes[map.huts.length] = (histoHuttes[map.huts.length] ?? 0) + 1;
  const raisons = [];
  if (map.villages.length < 2 * s.villagesPerHalf) raisons.push(`villages ${map.villages.length} < ${2 * s.villagesPerHalf}`);
  if (map.huts.length < 2 * s.hutsPerHalf) raisons.push(`huttes ${map.huts.length} < ${2 * s.hutsPerHalf}`);
  for (const v of map.villages)
    for (const sp of map.spawns)
      if (hexDistance(v, sp.capital) < s.minVillageDistance) raisons.push(`village ${v.q},${v.r} trop proche spawn`);
  for (const h of map.huts)
    for (const sp of map.spawns)
      if (hexDistance(h, sp.capital) < s.minHutDistance) raisons.push(`hutte ${h.q},${h.r} trop proche spawn`);
  if (raisons.length) fautives.push(`seed ${seed} : ${raisons.join(' ; ')}`);
}

const total = Date.now() - t0;
console.log(`=== CI-FLAKY · banc ${N} seeds, 1v1 40×40 miroir (défauts) — ${(total / 1000).toFixed(0)} s ===`);
console.log(`générations échouées : ${generationKo}/${N}`);
console.log(`histogramme villages :`, JSON.stringify(histoVillages));
console.log(`histogramme huttes   :`, JSON.stringify(histoHuttes));
const violV = Object.entries(histoVillages).filter(([k]) => Number(k) < 2 * s.villagesPerHalf).reduce((a, [, v]) => a + v, 0);
const violH = Object.entries(histoHuttes).filter(([k]) => Number(k) < 2 * s.hutsPerHalf).reduce((a, [, v]) => a + v, 0);
console.log(`seeds fautives : ${fautives.length}/${N} (${((100 * fautives.length) / N).toFixed(1)} %) — villages<12 : ${violV}, huttes<12 : ${violH}`);
if (fautives.length) console.log('SEEDS FAUTIVES :\n' + fautives.join('\n'));
