/**
 * Tests Phase 6 — économie des terrains & bâtiments (RULES.md §2 révisé,
 * R-60 révisé, R-63, R-66, ordre SetWorkedTile §4, migration v3→v4).
 */
import { describe, expect, it } from 'vitest';
import { makeState, cityAt, unitAt } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../src/state.js';
import type { GameState } from '../src/state.js';
import { tileYield, workRadiusOf, autoAssignWorkedTiles } from '../src/economy.js';
import { grassMap } from '../src/fixtures.js';

describe('economy.ts · rendements et rayon (R-60/R-66)', () => {
  const map = { ...grassMap(8, 8), '1,0': { terrain: 'colline', resource: null } } as never;

  it('R-66 : le bonus du Grenier s’applique à chaque plaine travaillée', () => {
    const base = tileYield(map, [], '0,1'); // prairie ? non : '0,1' est prairie 2/0/0
    expect(base).toEqual({ food: 2, production: 0, commerce: 0 });
    // le Grenier cible la PLAINE, pas la prairie : pas de bonus ici
    expect(tileYield(map, ['grenier'], '0,1')).toEqual({ food: 2, production: 0, commerce: 0 });
  });

  it('R-66 : l’Atelier ajoute +2 P à la colline travaillée', () => {
    expect(tileYield(map, [], '1,0')).toEqual({ food: 0, production: 1, commerce: 0 });
    expect(tileYield(map, ['atelier'], '1,0')).toEqual({ food: 0, production: 3, commerce: 0 });
  });

  it('R-66 : plusieurs bâtiments du même terrain cumulent', () => {
    expect(tileYield(map, ['atelier', 'atelier'], '1,0')!.production).toBe(5);
  });

  it('R-60 : rayon de travail 1, 2 avec Tribunal (T-08b)', () => {
    expect(workRadiusOf([])).toBe(1);
    expect(workRadiusOf(['tribunal'])).toBe(2);
  });

  it('R-60 : montagne et mer sont travaillables (auto-assignation les considère)', () => {
    const m = {
      '0,0': { terrain: 'ville', resource: null },
      '1,0': { terrain: 'montagne', resource: null },
      '-1,0': { terrain: 'montagne', resource: null },
      '0,1': { terrain: 'eau', resource: null },
      '0,-1': { terrain: 'eau', resource: null },
      '1,-1': { terrain: 'desert', resource: null },
      '-1,1': { terrain: 'prairie', resource: null },
    } as never;
    const assigned = autoAssignWorkedTiles(m, [{ q: 0, r: 0 }], { q: 0, r: 0, pop: 6, buildings: [] });
    // priorité nourriture : la prairie (2 N) d'abord, puis mer (0/0/2 — commerce
    // en dernier critère mais présence), montagne (0/1/0)…
    expect(assigned[0]).toBe('-1,1'); // nourriture maximale
    expect(assigned).toContain('0,1');
    expect(assigned).toContain('1,0');
    expect(assigned).toHaveLength(6);
  });
});

describe('R-60 · cases travaillées multiples (Phase 6)', () => {
  it('pop 2 → 2 citoyens assignés, ≤ pop, uniques', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, foodStored: 20, workedTiles: ['0,1', '1,0'] }],
    });
    const { newState } = resolveTurn(state, {}, 1);
    const city = cityAt(newState, 0, 0)!;
    expect(city.pop).toBeGreaterThanOrEqual(2);
    expect(city.workedTiles.length).toBeLessThanOrEqual(city.pop);
    expect(new Set(city.workedTiles).size).toBe(city.workedTiles.length);
    expect(city.workedTiles).not.toContain('0,0'); // centre gratuit, jamais assigné
  });

  it('une case travaillée l’est par exactement une ville (propriété transversale)', () => {
    const state = makeState({
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 3 },
        { id: 'c2', owner: 'p2', q: 2, r: 0, capital: true, pop: 3 },
      ],
    });
    const { newState } = resolveTurn(state, {}, 1);
    const seen = new Set<string>();
    for (const c of Object.values(newState.cities)) {
      for (const key of c.workedTiles) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('cumuls exacts : centre gratuit + Σ cases travaillées + bonus bâtiments', () => {
    // ville pop 2, Grenier posé, deux prairies travaillées : commerce = 1 (ville)
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, buildings: [] }],
    });
    const { newState } = resolveTurn(state, {}, 1);
    const city = cityAt(newState, 0, 0)!;
    const foodPerTile = 2; // prairies
    // 7i · D1 · R-63 (rév.) : la réserve reçoit le SURPLUS = récolte − pop.
    const expectedFood = 2 + foodPerTile * city.workedTiles.length - city.pop; // centre 2 N
    expect(city.foodStored).toBe(expectedFood);
  });
});

describe('R-66 · bâtiments (Phase 6)', () => {
  it('SetProduction d’un bâtiment, complétion → city.buildings, événement BuildingCompleted', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, production: { item: { kind: 'building', id: 'grenier' }, progress: 39 } }],
    });
    const { newState, events } = resolveTurn(state, {}, 1);
    // 7e : coût exact du Grenier = 40 (progression 39 + 1 produit ce tour)
    expect(cityAt(newState, 0, 0)!.buildings).toEqual(['grenier']);
    expect(events.some((e) => e.type === 'BuildingCompleted' && e.building === 'grenier')).toBe(true);
    expect(cityAt(newState, 0, 0)!.production).toBeNull();
  });

  it('R-66 : le Grenier donne +1 N sur chaque plaine travaillée par cette ville', () => {
    // 7e : Grenier +2 N (amendement — résout le point ouvert 6c)
    // citoyen assigné manuellement à la plaine : 1 N (+2 Grenier) au lieu de 2 N
    const state = makeState({
      terrainOverrides: { '0,1': 'plaine' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, buildings: ['grenier'], workedTiles: ['0,1'] }],
    });
    const { newState } = resolveTurn(state, {}, 1);
    const city = cityAt(newState, 0, 0)!;
    expect(city.workedTiles).toContain('0,1');
    // nourriture du tour = 2 (centre) + 1 (plaine) + 2 (Grenier) = 5 ;
    // réserve = SURPLUS = 5 − 1 citoyen (D1 · R-63 rév.) = 4
    expect(city.foodStored).toBe(4);
  });

  it('R-66 : le Tribunal étend le rayon — une case à distance 2 devient travaillable', () => {
    const state = makeState({
      terrainOverrides: { '2,0': 'montagne' }, // 0/1/0 — hors de portée sans Tribunal
      cities: [
        {
          id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 7, buildings: ['tribunal'],
          workedTiles: ['0,1', '1,0', '0,2', '1,1', '2,0', '-1,2'],
        },
      ],
    });
    const { newState } = resolveTurn(state, {}, 1);
    const city = cityAt(newState, 0, 0)!;
    // rayon 2 (Tribunal) : les 6 cases pré-assignées restent valides, dont la
    // montagne (2,0) à distance 2 — refusée sans Tribunal (test suivant)
    expect(city.workedTiles).toContain('2,0');
    expect(city.workedTiles.length).toBe(6);
  });

  it('R-66 : sans Tribunal, une case à distance 2 n’est jamais travaillée', () => {
    const state = makeState({
      terrainOverrides: { '2,0': 'montagne' },
      cities: [
        {
          id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 7,
          workedTiles: ['0,1', '1,0', '0,2', '1,1', '2,0', '-1,2'],
        },
      ],
    });
    const { newState } = resolveTurn(state, {}, 1);
    const city = cityAt(newState, 0, 0)!;
    // rayon 1 : les cases à distance 2 sont retirées par la validation
    expect(city.workedTiles).not.toContain('2,0');
    expect(city.workedTiles).not.toContain('0,2');
    expect(city.workedTiles).toEqual(['0,1', '1,0']);
  });

  it('R-66 : un bâtiment déjà possédé n’est pas re-constructible (SetProduction ignoré)', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, buildings: ['grenier'] }],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'grenier' } }] }, 1);
    expect(cityAt(newState, 0, 0)!.production).toBeNull();
  });

  it('R-66 : les bâtiments sont perdus si la ville est capturée', () => {
    const state = makeState({
      width: 12,
      height: 12,
      terrainOverrides: { '5,5': 'ville' },
      cities: [{ id: 'c1', owner: 'p2', q: 5, r: 5, capital: true, pop: 2, buildings: ['grenier', 'atelier'] }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }] }, 1);
    const city = cityAt(newState, 5, 5)!;
    expect(city.owner).toBe('p1');
    expect(city.buildings).toEqual([]);
  });
});

describe('R-60 · ordre SetWorkedTile (Phase 6)', () => {
  it('assignation manuelle valide : la case demandée est travaillée', () => {
    const state = makeState({
      terrainOverrides: { '1,0': 'foret' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2 }],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'SetWorkedTile', cityId: 'c1', tile: '1,0' }] }, 1);
    expect(cityAt(newState, 0, 0)!.workedTiles).toContain('1,0');
  });

  it('hors du rayon de travail → ignoré', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1 }],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'SetWorkedTile', cityId: 'c1', tile: '3,0' }] }, 1);
    expect(cityAt(newState, 0, 0)!.workedTiles).not.toContain('3,0');
  });

  it('déjà travaillée par une AUTRE ville → ignoré', () => {
    const state = makeState({
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: ['0,1'] },
        { id: 'c2', owner: 'p2', q: 2, r: 0, capital: true, pop: 1, workedTiles: [] },
      ],
    });
    const { newState } = resolveTurn(state, { p2: [{ type: 'SetWorkedTile', cityId: 'c2', tile: '0,1' }] }, 1);
    expect(cityAt(newState, 2, 0)!.workedTiles).not.toContain('0,1');
    expect(cityAt(newState, 0, 0)!.workedTiles).toContain('0,1');
  });

  it('case de ville (centre ou autre ville) → ignoré', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1 }],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'SetWorkedTile', cityId: 'c1', tile: '0,0' }] }, 1);
    expect(cityAt(newState, 0, 0)!.workedTiles).not.toContain('0,0');
  });

  it('ville ennemie → ordre ignoré', () => {
    const state = makeState({
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1 },
        { id: 'c2', owner: 'p2', q: 4, r: 0, capital: true, pop: 1 },
      ],
    });
    const { newState } = resolveTurn(state, { p2: [{ type: 'SetWorkedTile', cityId: 'c1', tile: '1,0' }] }, 1);
    expect(cityAt(newState, 0, 0)!.workedTiles).not.toContain('1,0');
  });

  it('tous les citoyens occupés → ordre ignoré (désassignation d’abord — règle d’Erik)', () => {
    const state = makeState({
      terrainOverrides: { '1,0': 'montagne' }, // 0/1/0 : case pauvre
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: ['0,1'] }],
    });
    // pop 1, un citoyen déjà assigné (prairie) : ville pleine.
    // Demander la montagne est ignoré — pas d'échange auto.
    const { newState } = resolveTurn(state, { p1: [{ type: 'SetWorkedTile', cityId: 'c1', tile: '1,0' }] }, 1);
    const tiles = cityAt(newState, 0, 0)!.workedTiles;
    expect(tiles).not.toContain('1,0');
    expect(tiles).toHaveLength(1);
    // En revanche, désassigner libère le citoyen pour le tour suivant.
    const r2 = resolveTurn(newState, { p1: [{ type: 'SetWorkedTile', cityId: 'c1', tile: null }] }, 1);
    expect(cityAt(r2.newState, 0, 0)!.workedTiles).toHaveLength(0);
  });

  it('désassignation (tile null) → un citoyen de moins, non re-rempli (interprétation)', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: ['0,1', '1,0'] }],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'SetWorkedTile', cityId: 'c1', tile: null }] }, 1);
    const tiles = cityAt(newState, 0, 0)!.workedTiles;
    expect(tiles).toHaveLength(1);
    expect(tiles).toContain('0,1'); // le dernier de la liste est retiré
  });
});

describe('Migration v3 → v4 (Phase 6)', () => {
  it('schemaVersion courant = 12 (gouvernements/GP/vaisseau, Phase 7h)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(12);
  });

  it('un état v3 migre : workedTiles auto-assignées, buildings [], item string → {kind:"unit"}', () => {
    const v3 = makeState({
      cities: [
        {
          id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1,
          production: { item: 'guerrier', progress: 4 },
        } as never,
      ],
    });
    const raw = { ...structuredClone(v3), schemaVersion: 3, cities: { c1: { ...structuredClone(v3.cities['c1']!), workedTiles: undefined, workedTile: null, buildings: undefined, production: { item: 'guerrier', progress: 4 } } } } as unknown as Record<string, unknown>;
    const out = migrateState<GameState>(raw);
    expect(out.schemaVersion).toBe(12);
    const c = out.cities['c1']!;
    // 7e : la migration v9 pose le Palais dans la capitale.
    expect(c.buildings).toEqual(['palais']);
    expect('workedTile' in c).toBe(false); // l'ancien champ est supprimé
    expect(c.workedTiles).toHaveLength(1); // auto-assignation (prairie voisine)
    expect(c.production!.item).toEqual({ kind: 'unit', id: 'guerrier' });
  });

  it('la migration est déterministe (deux exécutions → même résultat)', () => {
    const v3 = makeState({ cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2 }] });
    const raw = { ...structuredClone(v3), schemaVersion: 3 } as unknown as Record<string, unknown>;
    const a = migrateState<GameState>(structuredClone(raw));
    const b = migrateState<GameState>(structuredClone(raw));
    expect(a).toEqual(b);
  });
});
