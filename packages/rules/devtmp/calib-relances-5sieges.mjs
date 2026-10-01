/**
 * VILLAGES-5SIEGES L1 — Calibration du nombre de relances : simulation
 * Monte-Carlo du glouton EXACT (mêmes contraintes que entityCandidates côté
 * libre.ts, reconstruction approximation fidèle depuis la carte finie) sur
 * les 3 seeds fautives : quelle proportion d'essais RNG atteint 15 villages ?
 * → borne de relances nécessaire pour un banc 100 % vert.
 * Usage : npx tsx devtmp/calib-relances-5sieges.mjs [essais]
 */
import { generateProceduralMap, resolveProgenSettings } from '../src/progen/index.js';
import { colRowToHex, hexDistance, neighbors } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';
import { createRng } from '../src/rng.js';

const ESSAIS = Number(process.argv[2] ?? 500);
const SEEDS = process.argv.slice(3).map(Number);
const list = SEEDS.length ? SEEDS : [110867, 649359, 760225];
const s = resolveProgenSettings({ playerCount: 5 });
const TARGET = 15;

for (const seed of list) {
  const { map } = generateProceduralMap(seed, { playerCount: 5 });
  const W = map.data.width;
  const H = map.data.height;
  const spawns = map.spawns.map((sp) => sp.capital);
  const cle = (h) => `${h.q},${h.r}`;
  const camps = new Set([...map.villages, ...map.huts].map(cle));
  const resources = map.resources.filter((r) => !camps.has(cle(r))).map((r) => ({ q: r.q, r: r.r }));
  const reserved = new Set(spawns.map(cle));

  const candidats = [];
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const hex = colRowToHex(col, row);
      const t = map.terrain[cle(hex)];
      if (!t || !TERRAINS[t].passable) continue;
      if (reserved.has(cle(hex))) continue;
      if (spawns.some((sp) => hexDistance(sp, hex) < s.minVillageDistance)) continue;
      if (resources.some((r) => hexDistance(r, hex) < s.minResourceDistance)) continue;
      const pass = neighbors(hex).filter((n) => {
        const nt = map.terrain[cle(n)];
        return nt !== undefined && TERRAINS[nt].passable;
      }).length;
      if (pass < 2) continue;
      candidats.push(hex);
    }
  }

  const histo = {};
  let ok = 0;
  for (let e = 0; e < ESSAIS; e++) {
    const rng = createRng((seed * 2654435761 + e * 40503) >>> 0);
    const posés = [];
    for (let i = 0; i < TARGET; i++) {
      const libres = candidats.filter((c) => !posés.some((p) => hexDistance(p, c) < s.villageSpacing));
      if (libres.length === 0) break;
      posés.push(libres[rng.nextInt(libres.length)]);
    }
    histo[posés.length] = (histo[posés.length] ?? 0) + 1;
    if (posés.length >= TARGET) ok++;
  }
  console.log(
    `seed ${seed} : ${candidats.length} éligibles, succès ${ok}/${ESSAIS} (${((100 * ok) / ESSAIS).toFixed(1)} %), histogramme ${JSON.stringify(histo)}`,
  );
}
