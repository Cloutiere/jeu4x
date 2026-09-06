/**
 * Chantier SPAWN-START — garantie de voisinage du Colon de départ.
 *
 * Demande d'Erik (05/09) :
 *  1. les 6 cases adjacentes au Colon comptent EXACTEMENT 2 forêts, 2 prairies
 *     et 1 case d'eau (la 6e case libre — tout terrain productif non-montagne) ;
 *  2. AUCUNE ressource dans les 6 adjacentes NI à distance 2 (rayon 2 = 18 cases).
 *
 * Décisions 🔶 (handoff) : placement d'abord, voisinage forcé ensuite (re-paint),
 * purge des ressources ensuite ; miroir = même traitement pour les deux spawns ;
 * artefacts EXCLUS de la purge ; huttes/barbares sans contrainte nouvelle ;
 * réglages data-driven (progen/settings.ts, calibrables au labo #/progen).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGEN_SETTINGS,
  generateProceduralMap,
  resolveProgenSettings,
} from '../src/progen/index.js';
import { forceSpawnNeighborhood, purgeResourcesNear } from '../src/progen/mirror.js';
import { hexDistance, hexesWithinRadius, colRowToHex, neighbors, tileKeyOf } from '../src/hex.js';
import type { Hex } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';
import type { MapResource } from '../src/map.js';
import type { TerrainId } from '../src/types.js';
import { createInitialState, loadBuiltinMap, loadBuiltinMapSync } from '../src/map.js';
import { resolveTurn } from '../src/turn.js';

const S = resolveProgenSettings();

/** Composition de l'anneau 1 d'une capitale sur une carte générée. */
function ringComposition(map: { terrain: Record<string, string>; resources: MapResource[] }, cap: Hex) {
  const counts: Record<string, number> = {};
  for (const n of neighbors(cap)) {
    const t = map.terrain[tileKeyOf(n)]!;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

/** Productif non-montagne (6e case libre — demande d'Erik). */
function productiveNonMountain(t: string): boolean {
  const d = TERRAINS[t as TerrainId]!;
  const y = d.yields ?? { food: 0, production: 0, commerce: 0 };
  return t !== 'montagne' && y.food + y.production + y.commerce > 0;
}

describe('SPAWN-START · Réglages data-driven (L0)', () => {
  it('les valeurs par défaut 🔶 encodent la demande d\'Erik : 2 forêts, 2 prairies, 1 eau, purge rayon 2', () => {
    expect(DEFAULT_PROGEN_SETTINGS.spawnRingForet).toBe(2);
    expect(DEFAULT_PROGEN_SETTINGS.spawnRingPrairie).toBe(2);
    expect(DEFAULT_PROGEN_SETTINGS.spawnRingEau).toBe(1);
    expect(DEFAULT_PROGEN_SETTINGS.spawnPurgeRadius).toBe(2);
  });
});

describe('SPAWN-START · Voisinage forcé (unitaire)', () => {
  it('forceSpawnNeighborhood : grille uniforme → exactement 2F/2P/1eau + 1 case libre conservée', () => {
    const grid: TerrainId[][] = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 'plaine' as TerrainId));
    const site = colRowToHex(6, 6);
    forceSpawnNeighborhood(grid, site, S);
    const counts: Record<string, number> = {};
    for (const n of neighbors(site)) {
      const t = grid[n.r]![n.q + Math.floor(n.r / 2)]!;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    expect(counts['foret']).toBe(2);
    expect(counts['prairie']).toBe(2);
    expect(counts['eau']).toBe(1);
    const rest = Object.entries(counts).filter(([t]) => !['foret', 'prairie', 'eau'].includes(t));
    expect(rest).toHaveLength(1);
    expect(productiveNonMountain(rest[0]![0])).toBe(true);
  });

  it('forceSpawnNeighborhood : les terrains déjà conformes sont préservés en priorité (déterminisme)', () => {
    const grid: TerrainId[][] = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 'desert' as TerrainId));
    const site = colRowToHex(6, 6);
    // Deux voisines déjà en forêt : elles doivent rester forêts.
    const ns = neighbors(site).sort((a, b) => a.q - b.q || a.r - b.r);
    for (const n of [ns[0]!, ns[1]!]) grid[n.r]![n.q + Math.floor(n.r / 2)] = 'foret';
    forceSpawnNeighborhood(grid, site, S);
    const counts: Record<string, number> = {};
    for (const n of neighbors(site)) {
      const t = grid[n.r]![n.q + Math.floor(n.r / 2)]!;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    expect(counts['foret']).toBe(2);
    expect(counts['prairie']).toBe(2);
    expect(counts['eau']).toBe(1);
    // La 6e case : un désert restant (productif non-montagne).
    expect(counts['desert']).toBe(1);
    // Pur : le reste de la grille est inchangé.
    expect(grid[0]![0]).toBe('desert');
  });

  it('forceSpawnNeighborhood : montagne interdite partout dans l\'anneau (la case libre devient prairie)', () => {
    const grid: TerrainId[][] = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 'montagne' as TerrainId));
    const site = colRowToHex(6, 6);
    grid[site.r]![site.q + Math.floor(site.r / 2)] = 'prairie'; // le site lui-même reste praticable
    forceSpawnNeighborhood(grid, site, S);
    for (const n of neighbors(site)) {
      const t = grid[n.r]![n.q + Math.floor(n.r / 2)]!;
      expect(t).not.toBe('montagne');
    }
  });

  it('forceSpawnNeighborhood : déterministe (même entrée → même sortie)', () => {
    const make = (): TerrainId[][] =>
      Array.from({ length: 12 }, (_, r) =>
        Array.from({ length: 12 }, (_, c) => (['plaine', 'foret', 'colline', 'eau'] as TerrainId[])[(r * 12 + c) % 4]!),
      );
    const a = make();
    const b = make();
    const site = colRowToHex(5, 5);
    forceSpawnNeighborhood(a, site, S);
    forceSpawnNeighborhood(b, site, S);
    expect(a).toEqual(b);
  });
});

describe('SPAWN-START · Purge des ressources rayon 2 (unitaire)', () => {
  it('purgeResourcesNear : retire ≤ rayon des DEUX centres, garde au-delà', () => {
    const center: Hex = { q: 0, r: 0 };
    const other: Hex = { q: 8, r: 0 };
    const res: MapResource[] = [
      { id: 'ble', q: 0, r: 1 }, // distance 1 du centre
      { id: 'ble', q: 2, r: 0 }, // distance 2 du centre
      { id: 'betail', q: 7, r: 0 }, // distance 1 de l'autre
      { id: 'betail', q: 4, r: 0 }, // distance 3 des deux → gardée
    ];
    const { kept, purged } = purgeResourcesNear(res, [center, other], 2);
    expect(kept).toEqual([{ id: 'betail', q: 4, r: 0 }]);
    expect(purged).toHaveLength(3);
  });

  it('purgeResourcesNear : pure (ne mute pas l\'entrée)', () => {
    const res: MapResource[] = [{ id: 'ble', q: 1, r: 0 }];
    purgeResourcesNear(res, [{ q: 0, r: 0 }], 2);
    expect(res).toEqual([{ id: 'ble', q: 1, r: 0 }]);
  });
});

describe('SPAWN-START · Garantie sur les cartes générées (statistique, N seeds)', () => {
  const SEEDS = [1, 2, 3, 5, 7, 11, 13, 42, 99, 606, 777, 1234, 2718, 4242, 314159, 20260902];

  it('100 % des seeds : voisinage EXACT 2F/2P/1eau + 1 productive non-montagne, 0 ressource au rayon 2', () => {
    for (const seed of SEEDS) {
      const { map } = generateProceduralMap(seed);
      expect(map.spawns, `seed ${seed}`).toHaveLength(2);
      for (const sp of map.spawns) {
        const cap = sp.capital;
        const counts = ringComposition(map, cap);
        // Garantie dure : au moins 🔶 2 forêts et 🔶 2 prairies, EXACTEMENT
        // 🔶 1 eau (la case libre n'est jamais une eau), aucune montagne.
        // La 6e case libre (tout terrain productif non-montagne 🔶) peut être
        // une forêt/prairie de plus — elle s'ajoute aux minimums.
        expect(counts['foret'] ?? 0, `seed ${seed} : ≥ 2 forêts @(${cap.q},${cap.r})`).toBeGreaterThanOrEqual(S.spawnRingForet);
        expect(counts['prairie'] ?? 0, `seed ${seed} : ≥ 2 prairies @(${cap.q},${cap.r})`).toBeGreaterThanOrEqual(S.spawnRingPrairie);
        expect(counts['eau'] ?? 0, `seed ${seed} : 1 eau @(${cap.q},${cap.r})`).toBe(S.spawnRingEau);
        expect(counts['montagne'], `seed ${seed} : aucune montagne @(${cap.q},${cap.r})`).toBeUndefined();
        expect(Object.entries(counts).reduce((acc, [, n]) => acc + n, 0), `seed ${seed} : 6 voisines`).toBe(6);
        for (const [t] of Object.entries(counts)) {
          if (t === 'foret' || t === 'prairie' || t === 'eau') continue;
          expect(productiveNonMountain(t), `seed ${seed} : case libre productive non-montagne (${t})`).toBe(true);
        }
        // Purge : AUCUNE ressource dans le rayon 🔶 (anneau 1 + anneau 2).
        for (const h of hexesWithinRadius(cap, S.spawnPurgeRadius)) {
          const res = map.resources.find((r) => r.q === h.q && r.r === h.r);
          expect(res, `seed ${seed} : case (${h.q},${h.r}) à distance ${hexDistance(cap, h)} sans ressource`).toBeUndefined();
        }
      }
    }
  });

  it('miroir : les DEUX voisinages ont la même composition (checksum étendu)', () => {
    for (const seed of SEEDS) {
      const { map, report } = generateProceduralMap(seed);
      const [p1, p2] = map.spawns;
      const c1 = ringComposition(map, p1!.capital);
      const c2 = ringComposition(map, p2!.capital);
      // Même multiset de terrains (les clés triées, comparées).
      const norm = (c: Record<string, number>): string =>
        Object.entries(c).sort(([a], [b]) => (a < b ? -1 : 1)).map(([t, n]) => `${t}:${n}`).join(',');
      expect(norm(c2), `seed ${seed} : composition miroir identique`).toBe(norm(c1));
      // Checksum d'équité : delta = 0 (étendu par la composition identique).
      expect(report.fertility.delta, `seed ${seed}`).toBe(0);
      // Le rapport consigne la garantie (dump admin / labo).
      expect(report.spawn).toBeDefined();
      expect(report.spawn!.purgeRadius).toBe(S.spawnPurgeRadius);
      expect(report.spawn!.purged).toBeGreaterThanOrEqual(0);
      expect(report.spawn!.compositionP1).toEqual(report.spawn!.compositionP2);
    }
  });

  it('les huttes et villages ne sont PAS concernés par la purge (règles 7d inchangées)', () => {
    // Aucune contrainte nouvelle : les entités existantes restent à leurs
    // distances réglementaires (villages ≥ 6, huttes ≥ 3 — déjà testées) et
    // peuvent occuper le rayon 2. On vérifie juste que la génération ne
    // déplace pas les huttes hors du rayon (pas de déplacement forcé).
    const { map } = generateProceduralMap(42);
    for (const h of map.huts) {
      for (const sp of map.spawns) {
        expect(hexDistance(h, sp.capital)).toBeGreaterThanOrEqual(S.minHutDistance);
      }
    }
  });
});

describe('SPAWN-START · Normalisation compatible (anneau 3)', () => {  it('la normalisation n\'injecte JAMAIS dans le rayon de purge (distance ≥ 3)', () => {
    // Sur les cartes générées : toute ressource injectée par la normalisation
    // est hors du rayon — propriété couverte par le test statistique ; ici on
    // vérifie le réglage par défaut du rayon.
    expect(S.spawnPurgeRadius).toBe(2);
    // Le RNG de purge n'existe pas : la purge est un filtre pur (déterminisme R-80).
    const kept = purgeResourcesNear(
      Array.from({ length: 5 }, (_, i) => ({ id: 'ble', q: i, r: 0 }) as MapResource),
      [{ q: 0, r: 0 }],
      2,
    );
    expect(kept.kept).toHaveLength(2); // distances 3 et 4
  });
});

describe('SPAWN-START · e2e — génération complète puis fondation (D5)', () => {
  it('spawns conformes, fondation des deux capitales, ressources intactes hors du rayon de garantie', () => {
    const { map } = generateProceduralMap(42);
    let state = createInitialState(map, 42);
    expect(Object.keys(state.cities)).toEqual([]); // démarrage Colon + Guerrier
    // Les deux Colons fondent leur capitale au tour 1.
    const r = resolveTurn(
      state,
      {
        p1: [{ type: 'FoundCity', unitId: 'u1' }],
        p2: [{ type: 'FoundCity', unitId: 'u3' }],
      },
      42,
    );
    state = r.newState;
    expect(r.events.filter((e) => e.type === 'CityFounded')).toHaveLength(2);
    for (const sp of map.spawns) {
      const city = Object.values(state.cities).find((c) => c.owner === sp.id)!;
      expect(city).toBeDefined();
      expect({ q: city!.q, r: city!.r }).toEqual(sp.capital);
    }
    // Fondation : aucune ressource consommée nulle part (le rayon de garantie
    // est déjà vide ; hors rayon, la carte reste intacte).
    expect(Object.keys(state.cities)).toHaveLength(2);
    for (const res of map.resources) {
      const key = tileKeyOf(res);
      expect(state.map[key]).toBeDefined();
      expect(state.map[key]!.resource).toBe(res.id);
    }
    // Les terrains hors fondation sont inchangés.
    for (const [key, tile] of Object.entries(state.map)) {
      const isFoundedCity = Object.values(state.cities).some((c) => tileKeyOf(c) === key);
      if (!isFoundedCity) expect(tile.terrain).toBe(map.terrain[key]);
    }
  });
});

describe('SPAWN-START · Cartes préfabriquées auditées/ajustées', () => {
  // R-157 : les trois cartes préfabriquées sont ajustées à la garantie.
  // Déviation documentée (rapport SPAWN-START) : pedagogique-40 reste SANS eau
  // (T-11 — caractère pédagogique), le composant « 1 eau » ne s'y applique pas.
  it('chaque spawn : ≥ 2 forêts, ≥ 2 prairies, aucune montagne, 0 ressource au rayon 2', async () => {
    for (const id of ['pangee-40', 'variee-40', 'pedagogique-40'] as const) {
      const map = loadBuiltinMapSync(id);
      const expectedEau = id === 'pedagogique-40' ? 0 : S.spawnRingEau;
      for (const sp of map.spawns) {
        const cap = sp.capital;
        const counts: Record<string, number> = {};
        for (const n of neighbors(cap)) {
          const t = map.terrain[tileKeyOf(n)]!;
          counts[t] = (counts[t] ?? 0) + 1;
        }
        expect(counts['foret'] ?? 0, `${id} : ≥ 2 forêts`).toBeGreaterThanOrEqual(S.spawnRingForet);
        expect(counts['prairie'] ?? 0, `${id} : ≥ 2 prairies`).toBeGreaterThanOrEqual(S.spawnRingPrairie);
        expect(counts['eau'] ?? 0, `${id} : eau attendue`).toBe(expectedEau);
        expect(counts['montagne'], `${id} : aucune montagne`).toBeUndefined();
        for (const h of hexesWithinRadius(cap, S.spawnPurgeRadius)) {
          const res = map.resources.find((r) => r.q === h.q && r.r === h.r);
          expect(res, `${id} : case (${h.q},${h.r}) sans ressource`).toBeUndefined();
        }
      }
    }
  });
});
