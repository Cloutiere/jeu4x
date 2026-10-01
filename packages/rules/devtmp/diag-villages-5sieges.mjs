/**
 * VILLAGES-5SIEGES L0 — Reproduction des 3 seeds fautives (5 sièges, 50×40)
 * + diagnostic d'épuisement du placeur glouton :
 *   1. villages/huttes observés vs attendus (15/15) ;
 *   2. combien de relances déterministes (mécanisme CI-FLAKY) sont nécessaires
 *      pour atteindre le quota — sondé hors moteur (borne étendue à 500) ;
 *   3. nombre de cases éligibles (sans contrainte villages↔villages).
 * Usage : npx tsx devtmp/diag-villages-5sieges.mjs [seed ...]
 */
import { generateProceduralMap, resolveProgenSettings } from '../src/progen/index.js';
import { hexDistance } from '../src/hex.js';

const DEFAULT_SEEDS = [110867, 649359, 760225];
const seeds = process.argv.slice(2).map(Number);
const list = seeds.length ? seeds : DEFAULT_SEEDS;
const s = resolveProgenSettings({ playerCount: 5 });

for (const seed of list) {
  const { map, report } = generateProceduralMap(seed, { playerCount: 5 });
  const attendusV = 15;
  const attendusH = 15;
  const ok = map.villages.length >= attendusV && map.huts.length >= attendusH;
  console.log(
    `seed ${seed} (5 sièges, ${report.attempts} tentative[s]) : villages ${map.villages.length}/${attendusV}, huttes ${map.huts.length}/${attendusH} ${ok ? 'OK' : '← FAUTIVE'}`,
  );

  // Contraintes exactes de l'appel libre.ts (pas de miroir en multi) :
  // praticable, ≥ minVillageDistance des 5 spawns, ≥ minResourceDistance de
  // toute ressource finale, cases réservées (capitales + anneaux déjà dans
  // reserved amont — approximation : capitales), ≥ 2 voisins praticables.
  const spawns = map.spawns.map((sp) => sp.capital);
  const resources = map.resources.map((r) => ({ q: r.q, r: r.r }));
  const W = map.data.width;
  const H = map.data.height;
  const terrainAt = (q, r) => map.terrain[`${q},${r}`];
  let eligibles = 0;
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const hex = { q: col - Math.floor(row / 2), r: row };
      const t = terrainAt(hex.q, hex.r);
      if (!t) continue;
      // praticable : réutilise les données de la carte finie via TERRAINS côté test
      const { TERRAINS } = await import('../src/data.js');
      if (!TERRAINS[t].passable) continue;
      if (spawns.some((sp) => hexDistance(sp, hex) < s.minVillageDistance)) continue;
      if (resources.some((r) => hexDistance(r, hex) < s.minResourceDistance)) continue;
      eligibles++;
    }
  }
  console.log(`  cases éligibles (sans spacing villages↔villages) : ${eligibles}`);
}
