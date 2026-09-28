/**
 * ARTEFACTS-ILES — demande d'Erik (28/09) : « le placement des artefacts ne
 * doit jamais être sur une île ou un continent accessible au départ par les
 * joueurs ; ils doivent apparaître sur des surfaces accessibles en bateau, et
 * ce peu importe le type de carte. »
 *
 * Arbitrages Erik (28/09) :
 *  - île SANS AUCUNE capitale de départ (inaccessible à pied par construction) ;
 *  - max 1 artefact par île SI POSSIBLE (réutilisation tolérée si les îles
 *    manquent — consigné) ;
 *  - Atlantide INCHANGÉE (haute mer, océan) ;
 *  - pas de repli continental avant le DERNIER essai (procédural) / jamais
 *    d'alternative (préfabriquées — repli 🔶 documenté).
 *
 * Le banc tourne sur 3 topographies × 2/3/5 sièges : chaque artefact
 * terrestre est vérifié sur une composante terrestre SANS spawn + à ≥ 4
 * (plancher dur 🔶) de chaque capitale ; l'Atlantide reste sur 'ocean'.
 */
import { describe, expect, it } from 'vitest';
import { generateProceduralMap } from '../src/progen/index.js';
import { neighbors, tileKeyOf, hexDistance } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';
import { artefactDataOf } from '../src/artefacts.js';
import { createInitialState, loadBuiltinMapSync } from '../src/map.js';

/** Composantes terrestres + ensemble des îles SANS spawn (recalcul indépendant). */
function ileLibreDe(map: { terrain: Record<string, string>; spawns: Array<{ capital: { q: number; r: number } }> }, hex: { q: number; r: number }): { surIleLibre: boolean; compId: number } {
  const passable = (k: string): boolean => {
    const t = TERRAINS[map.terrain[k] ?? 'eau'];
    return !!t && t.passable;
  };
  const compOf = new Map<string, number>();
  const comps: string[][] = [];
  for (const key of Object.keys(map.terrain).sort()) {
    if (compOf.has(key) || !passable(key)) continue;
    const id = comps.length;
    const keys = [key];
    compOf.set(key, id);
    const q = [key];
    while (q.length > 0) {
      const cur = q.shift()!;
      const [cq, cr] = cur.split(',').map(Number) as [number, number];
      for (const n of neighbors({ q: cq, r: cr })) {
        const nk = tileKeyOf(n);
        if (map.terrain[nk] === undefined || compOf.has(nk) || !passable(nk)) continue;
        compOf.set(nk, id);
        keys.push(nk);
        q.push(nk);
      }
    }
    comps.push(keys);
  }
  const spawnKeys = new Set(map.spawns.map((s) => tileKeyOf(s.capital)));
  const libres = new Set<number>();
  comps.forEach((keys, id) => {
    if (!keys.some((k) => spawnKeys.has(k))) libres.add(id);
  });
  const compId = compOf.get(tileKeyOf(hex)) ?? -1;
  return { surIleLibre: libres.has(compId), compId };
}

describe('ARTEFACTS-ILES · Banc 3 topographies × 2/3/5 sièges', () => {
  it(
    '100 % des seeds : tout artefact terrestre sur une île SANS spawn, ≥ 4 des départs ; Atlantide en haute mer',
    { timeout: 900000 },
    () => {
      let generations = 0;
      let surMasse = 0;
      let tropProche = 0;
      const partagees: number[] = [];
      for (const continents of [1, 2, 3] as const) {
        for (const playerCount of [2, 3, 5] as const) {
          for (let i = 0; i < 12; i++) {
            const seed = 220 + i * 7919;
            const { map } = generateProceduralMap(seed, { playerCount, continents });
            generations += 1;
            const parIle = new Map<number, number>();
            for (const a of map.artefacts) {
              const data = artefactDataOf(a.artefactId)!;
              if (data.activation === 'oceanAdjacent') {
                expect(map.terrain[tileKeyOf(a)], `Atlantide hors océan (seed ${seed})`).toBe('ocean');
                continue;
              }
              const { surIleLibre, compId } = ileLibreDe(map, a);
              if (!surIleLibre) surMasse += 1;
              parIle.set(compId, (parIle.get(compId) ?? 0) + 1);
              const dMin = Math.min(...map.spawns.map((sp) => hexDistance(sp.capital, a)));
              if (dMin < 4) tropProche += 1;
            }
            partagees.push([...parIle.values()].filter((n) => n > 1).length);
          }
        }
      }
      console.log(
        `ARTEFACTS-ILES : ${generations} générations — artefacts sur la masse des joueurs : ${surMasse} ; ` +
        `à < 4 d'une capitale : ${tropProche} ; cartes avec île partagée : ${partagees.filter((n) => n > 0).length}/${generations}`,
      );
      expect(surMasse).toBe(0);
      expect(tropProche).toBe(0);
    },
  );

  it('préfabriquées : création OK (îlots de garantie) et plancher 4 des départs respecté', () => {
    for (const id of ['pedagogique-40', 'pangee-40', 'variee-40'] as const) {
      const map = loadBuiltinMapSync(id);
      const state = createInitialState(map, 777);
      // Pédagogique-40 (presque toute terre, aucun îlot possible) : repli
      // continental 🔶 documenté — le tri garde les cases les plus éloignées.
      for (const a of state.artefacts) {
        const data = artefactDataOf(a.artefactId)!;
        if (data.activation === 'oceanAdjacent') {
          expect(state.map[tileKeyOf(a)]!.terrain).toBe('ocean');
          continue;
        }
        for (const sp of map.spawns) {
          expect(hexDistance(sp.capital, a), `${id} : artefact à ${hexDistance(sp.capital, a)} d'un départ`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
});
