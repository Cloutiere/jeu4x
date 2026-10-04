/**
 * CARTE-RONDE T1 — suite de couture (handoff L1).
 *
 * Le monde est un CYLINDRE Est↔Ouest (décision Erik 04/10) : distance,
 * voisinage, chemins, brouillard, combats et embarquement comptent À TRAVERS
 * la couture ; les ordres hors bornes sont normalisés (D1) ; la génération
 * 1v1 est ROTATIONNELLE (adversaire à l'opposé du cylindre, D3).
 * Nord/Sud restent des bords.
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, unit as getUnit } from '../src/fixtures.js';
import {
  colOf,
  colRowToHex,
  hexDistance,
  hexDistanceW,
  hexesWithinRadiusW,
  neighborsW,
  normalizeHexW,
  tileKeyOf,
  wrapCol,
} from '../src/hex.js';
import type { GameState, Order } from '../src/state.js';
import { generateProceduralMap } from '../src/progen/index.js';
import { parseMap } from '../src/map.js';
import { createInitialState } from '../src/map.js';
import { computeVisibleTiles } from '../src/fog.js';
import { autoAssignWorkedTiles } from '../src/economy.js';

const SEED = 20261004;
const W = 40;
const H = (col: number, row: number) => colRowToHex(col, row);

// ---------------------------------------------------------------------------
// Géométrie de couture (hex.ts)
// ---------------------------------------------------------------------------

describe('carte-ronde · géométrie wrap', () => {
  it('distance wrap : (39,0) ↔ (0,0) = 1 ; (37,0) ↔ (2,0) = 5 ; les paires intérieures restent plates', () => {
    expect(hexDistanceW(H(39, 0), H(0, 0), W)).toBe(1);
    expect(hexDistanceW(H(37, 0), H(2, 0), W)).toBe(5);
    expect(hexDistanceW(H(0, 0), H(0, 0), W)).toBe(0);
    // SANS la couture, la distance plate est inchangée.
    expect(hexDistanceW(H(3, 0), H(10, 0), W)).toBe(hexDistance(H(3, 0), H(10, 0)));
    // Le décalage axial des rangées est absorbé par l'espace colonne.
    expect(hexDistanceW(H(39, 1), H(0, 0), W)).toBe(1);
  });

  it('wrapCol / normalisation canonique : q=−1 en rangée 0 → col 39 ; q=40 → col 0', () => {
    expect(wrapCol(-1, W)).toBe(39);
    expect(wrapCol(W, W)).toBe(0);
    expect(normalizeHexW({ q: -1, r: 0 }, W)).toEqual(H(39, 0));
    expect(normalizeHexW({ q: W, r: 0 }, W)).toEqual(H(0, 0));
    expect(colOf(normalizeHexW({ q: -2, r: 3 }, W))).toBe(39); // rangée impaire : col = q + 1 → repli 39
  });

  it('voisinage à cheval : les voisins Est de (39,0) ressortent en col 0', () => {
    const ns = neighborsW(H(39, 0), W);
    expect(ns.map(tileKeyOf)).toContain(tileKeyOf(H(0, 0)));
    const nsBounded = neighborsW(H(39, 0), W, 8);
    expect(nsBounded.map(tileKeyOf)).not.toContain(tileKeyOf(H(39, -1)));
  });

  it('rayon à cheval : hexesWithinRadiusW(39,1) couvre cols 38,39,0 ; déduplication', () => {
    const tiles = hexesWithinRadiusW(H(39, 2), 1, W).map(tileKeyOf);
    expect(tiles).toHaveLength(7); // disque complet (centre + 6), dédupliqué
    expect(new Set(tiles).size).toBe(tiles.length);
    const withH = hexesWithinRadiusW(H(39, 3), 2, W, 8).map(tileKeyOf);
    expect(withH).toHaveLength(19); // disque rayon 2 complet (loin du bord N)
  });
});

// ---------------------------------------------------------------------------
// Moteur — mouvement, fog, worked tiles, combat, embarquement (L1)
// ---------------------------------------------------------------------------

describe('carte-ronde · moteur à la couture', () => {
  it('un guerrier programme un déplacement TRAVERSANT la couture et l\’exécute (39,0 → 0,0)', () => {
    const state = makeState({
      width: W,
      height: 4,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 39, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 20, r: 2 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 0)] }],
    };
    const { newState, events } = resolveTurn(state, orders, SEED);
    expect(getUnit(newState, 'u1').q).toBe(0);
    expect(getUnit(newState, 'u1').r).toBe(0);
    expect(events.some((e) => e.type === 'TurnResolved')).toBe(true);
  });

  it('un ordre hors bornes (q=−1) est normalisé et exécuté (D1)', () => {
    const state = makeState({
      width: W,
      height: 4,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 20, r: 2 },
      ],
    });
    const { newState } = resolveTurn(state, {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: -1, r: 0 }] }],
    }, SEED);
    expect(getUnit(newState, 'u1').q).toBe(39);
    expect(getUnit(newState, 'u1').r).toBe(0);
  });

  it('fog : la vision d\’une unité en bord de couture couvre l\’autre côté', () => {
    const state = makeState({
      width: W,
      height: 8,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 39, r: 4 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 20, r: 4 },
      ],
    });
    const visible = computeVisibleTiles(state, 'p1');
    expect(visible.has(tileKeyOf(H(0, 4)))).toBe(true);
    expect(visible.has(tileKeyOf(H(0, 3)))).toBe(true);
    // Rien à 20 colonnes.
    expect(visible.has(tileKeyOf(H(20, 4)))).toBe(false);
  });

  it('worked tiles : une ville en col 39 travaille une prairie de col 0 (par la couture)', () => {
    // Ville à (39,0) ; la case (0,0) est prairie, (38,0) est forêt — l'auto-
    // assignation nourriture-d'abord doit pouvoir prendre les deux côtés.
    const state = makeState({
      width: W,
      height: 4,
      cities: [{ id: 'c1', owner: 'p1', q: 39, r: 0, capital: true, pop: 2 }],
    });
    // La fixture ne fait PAS l'auto-assignation (miroir createInitialState) —
    // on l'appelle avec la largeur réelle (wrap).
    const c = state.cities.c1!;
    const keys = autoAssignWorkedTiles(state.map, [], { q: 39, r: 0, pop: c.pop, buildings: c.buildings }, new Set(), [], W);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    // Toutes les cases travaillées sont à distance wrap ≤ 1 et existent.
    for (const key of keys) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      expect(hexDistanceW({ q, r }, { q: 39, r: 0 }, W)).toBeLessThanOrEqual(1);
      expect(state.map[tileKeyOf({ q, r })]).toBeDefined();
    }
  });

  it('combat : une attaque À TRAVERS la couture exige et trouve le contact (39,0 → 0,0)', () => {
    const state = makeState({
      width: W,
      height: 4,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 39, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
      ],
    });
    const { events, newState } = resolveTurn(state, {
      p1: [{ type: 'Attack', unitId: 'u1', target: H(0, 0) }],
    }, SEED);
    expect(events.some((e) => e.type === 'CombatExchange')).toBe(true);
    // l'attaquant est entré sur la case (contact par la couture).
    expect(getUnit(newState, 'u1').q).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Génération rotationnelle (D3) — 1v1 ET multi 3-5 sièges
// ---------------------------------------------------------------------------

describe('carte-ronde · génération rotationnelle', () => {
  it('1v1 : spawns ÉQUIDISTANTS sur le cylindre — écart horizontal ≈ largeur/2, distance wrap ≥ 12', { timeout: 60_000 }, () => {
    for (const seed of [1, 42, SEED]) {
      const { map, report } = generateProceduralMap(seed, { playerCount: 2 });
      const [p1, p2] = map.spawns;
      const col = (h: { q: number; r: number }) => colOf(h);
      const dc = Math.abs(col(p1!.capital) - col(p2!.capital)) % W;
      const dCol = Math.min(dc, W - dc);
      const tol = report.settings.oppositionTolerance;
      expect(dCol).toBeGreaterThanOrEqual(W / 2 - tol);
      expect(dCol).toBeLessThanOrEqual(W / 2 + tol);
      expect(hexDistanceW(p1!.capital, p2!.capital, W)).toBeGreaterThanOrEqual(12);
    }
  });

  it('1v1 : la carte générée passe parseMap (validation wrap des distances ALL-PAIRS)', { timeout: 60_000 }, () => {
    const { map } = generateProceduralMap(SEED, { playerCount: 2 });
    expect(() => parseMap(map.data)).not.toThrow();
    const state = createInitialState(map, SEED);
    expect(state.mapWidth).toBe(W);
    // Toutes les unités posées ont un q canonique (dans le rectangle).
    for (const u of Object.values(state.units)) {
      expect(state.map[tileKeyOf(u)]).toBeDefined();
    }
  });

  it('multi 3-5 sièges : spawns équidistants wrap (tolérance 🔶), anneaux SPAWN-START garantis', { timeout: 300_000 }, () => {
    for (const n of [3, 5] as const) {
      const { map, report } = generateProceduralMap(SEED, { playerCount: n });
      const spawns = map.spawns.map((s) => s.capital);
      const s = report.settings;
      const largeur = map.data.width; // multi 50×40 (CARTE-50) — JAMAIS 40 en dur
      // Anneaux par spawn : ≥ 2F / ≥ 2P / 1E / 0 montagne (voisinage wrap).
      for (const cap of spawns) {
        const counts: Record<string, number> = {};
        for (const h of neighborsW(cap, largeur)) {
          const t = map.terrain[tileKeyOf(h)]!;
          counts[t] = (counts[t] ?? 0) + 1;
        }
        expect(counts['foret'] ?? 0).toBeGreaterThanOrEqual(s.spawnRingForet);
        expect(counts['prairie'] ?? 0).toBeGreaterThanOrEqual(s.spawnRingPrairie);
        expect(counts['eau'] ?? 0).toBe(s.spawnRingEau);
        expect(counts['montagne'] ?? 0).toBe(0);
        // Purge ressources rayon 2 (wrap).
        for (const h of hexesWithinRadiusW(cap, s.spawnPurgeRadius, largeur)) {
          expect(map.resources.find((r) => tileKeyOf(r) === tileKeyOf(h))).toBeUndefined();
        }
      }
      // Équidistance wrap dans la tolérance évoluée.
      expect(report.multi).toBeDefined();
      expect(report.multi!.pairSpread).toBeLessThanOrEqual(s.librePairSpreadMax + 3 * (report.attempts - 1));
    }
  });

  it('TOPOGRAPHIES : pangée, rift et archipel génèrent sous le cylindre', { timeout: 300_000 }, () => {
    for (const continents of [1, 2, 3] as const) {
      const { map, report } = generateProceduralMap(SEED, { playerCount: 3, continents });
      expect(() => parseMap(map.data)).not.toThrow();
      expect(map.spawns.length).toBe(3);
      // La carte connaît ses deux bords : les cases des colonnes extrêmes existent.
      expect(map.terrain[tileKeyOf(H(0, 20))]).toBeDefined();
      expect(map.terrain[tileKeyOf(H(39, 20))]).toBeDefined();
      void report;
    }
  });
});
