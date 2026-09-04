/**
 * Phase 7g — Naval & Espionnage (RULES.md §8.6, R-117..R-119).
 *
 * Carte de référence : 8×7 — rangées 0-2 terre (nord), rangées 3-4 eau
 * (côte), rangées 5-6 terre (sud) ; un bassin d'OCÉAN à l'est (colonnes 6-7).
 * Toutes les positions passent par K(col,row) (colRowToHex → clé "q,r").
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, unit as getUnit, unitAt } from '../src/fixtures.js';
import { colRowToHex, tileKeyOf } from '../src/hex.js';
import { registerTestUnitType, unitType } from '../src/data.js';
import { canEnterTerrain, cargoCapacityOf, isCoastalCityHex, navalSupportFor } from '../src/naval.js';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../src/state.js';
import type { GameState, Order } from '../src/state.js';
import type { TerrainId } from '../src/types.js';
import type { GameEvent } from '../src/events.js';

const K = (col: number, row: number): string => tileKeyOf(colRowToHex(col, row));
const H = (col: number, row: number) => colRowToHex(col, row);

function coastalOverrides(): Record<string, TerrainId> {
  const overrides: Record<string, TerrainId> = {};
  for (let col = 0; col < 8; col++) {
    overrides[K(col, 3)] = 'eau';
    overrides[K(col, 4)] = 'eau';
  }
  // Bassin d'océan profond à l'est (au-delà de la côte).
  overrides[K(7, 3)] = 'ocean';
  overrides[K(7, 4)] = 'ocean';
  return overrides;
}

function coastalState(extra: Parameters<typeof makeState>[0] = {}): GameState {
  return makeState({
    width: 8,
    height: 7,
    terrainOverrides: coastalOverrides(),
    ...extra,
  });
}

function eventsOf(events: GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((e) => e.type === type);
}

// Attaquant de test surpuissant : p ≈ 1, la mort du défenseur ne dépend plus
// de la graine (même convention que les tests R-59/7e).
registerTestUnitType({
  id: 'assaut-test',
  name: 'Assaut (test)',
  attack: 99,
  defense: 3,
  movement: 1,
  hpMax: 3,
  cost: 10,
  visionRadius: 2,
  canAttack: true,
  canFoundCity: false,
  isRanged: false,
});

// ---------------------------------------------------------------------------
// R-117 · Mouvement naval
// ---------------------------------------------------------------------------

describe('Phase 7g · R-117 — mouvement naval', () => {
  it('la Galère entre en CÔTE, pas en OCÉAN ; le Galion entre dans les deux (navalAccess R-107)', () => {
    // Bassin océan : K(7,3) = (6,3) et K(7,4) = (5,4) — adjacents entre eux
    // et à la côte K(6,3) = (5,3).
    // Galère : côte seule — le pas vers l'océan est refusé (chemin invalide).
    let state = coastalState({
      units: [{ id: 'u1', type: 'galere', owner: 'p1', q: H(6, 3).q, r: H(6, 3).r }],
    });
    const blocked = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [H(7, 3)] }] }, 1);
    expect(getUnit(blocked.newState, 'u1')).toMatchObject({ q: H(6, 3).q, r: H(6, 3).r });
    expect(blocked.newState.units['u1']!.order).toBeNull();

    // Galère posée DANS l'océan : pas vers une case d'océan voisine refusé aussi.
    state = coastalState({
      units: [{ id: 'u1', type: 'galere', owner: 'p1', q: H(7, 3).q, r: H(7, 3).r }],
    });
    const stuck = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [H(7, 4)] }] }, 1);
    expect(getUnit(stuck.newState, 'u1')).toMatchObject({ q: H(7, 3).q, r: H(7, 3).r });

    // Galion : côte ET océan — traverse la côte puis l'océan (M=3).
    const stateG = coastalState({
      units: [{ id: 'u1', type: 'galion', owner: 'p1', q: H(6, 3).q, r: H(6, 3).r }],
    });
    const sailed = resolveTurn(
      stateG,
      { p1: [{ type: 'Move', unitId: 'u1', path: [H(7, 3), H(7, 4)] }] },
      1,
    );
    expect(getUnit(sailed.newState, 'u1')).toMatchObject({ q: H(7, 4).q, r: H(7, 4).r });
  });

  it('les unités TERRESTRES restent bloquées sur l’eau (T-11 inchangé pour elles)', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'colon', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r },
      ],
    });
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u1', path: [H(0, 3)] },
          { type: 'Move', unitId: 'u2', path: [H(1, 3)] },
        ],
      },
      1,
    );
    expect(getUnit(result.newState, 'u1')).toMatchObject({ q: H(0, 2).q, r: H(0, 2).r });
    expect(getUnit(result.newState, 'u2')).toMatchObject({ q: H(1, 2).q, r: H(1, 2).r });
    expect(eventsOf(result.events, 'Move')).toHaveLength(0);
  });

  it('une unité navale entre dans une ville portuaire AMIE mais jamais sur un terrain terrestre', () => {
    // En partie réelle, la case d'une ville porte le terrain 'ville' — la
    // fixture le pose explicitement (makeState laisse la prairie).
    const overrides = { ...coastalOverrides(), [K(0, 2)]: 'ville' as TerrainId };
    const state = makeState({
      width: 8,
      height: 7,
      terrainOverrides: overrides,
      units: [{ id: 'u1', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r }],
      cities: [{ id: 'c1', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r, capital: true }],
    });
    expect(isCoastalCityHex(state.map, H(0, 2))).toBe(true);
    const result = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 2)] }] }, 1);
    expect(getUnit(result.newState, 'u1')).toMatchObject({ q: H(0, 2).q, r: H(0, 2).r });
  });

  it('prédicats purs : ville NON côtière interdite au naval, terre interdite, Galère côte/Galion océan', () => {
    const galere = unitType('galere');
    const galion = unitType('galion');
    const guerrier = unitType('guerrier');
    // Ville côtière vs intérieure.
    expect(canEnterTerrain(galere, 'ville', true)).toBe(true);
    expect(canEnterTerrain(galere, 'ville', false)).toBe(false);
    // Eau : Galère = côte seule, Galion = côte + océan.
    expect(canEnterTerrain(galere, 'eau', false)).toBe(true);
    expect(canEnterTerrain(galere, 'ocean', false)).toBe(false);
    expect(canEnterTerrain(galion, 'eau', false)).toBe(true);
    expect(canEnterTerrain(galion, 'ocean', false)).toBe(true);
    // Terre : interdite au naval, passable pour le terrestre.
    expect(canEnterTerrain(galere, 'prairie', false)).toBe(false);
    expect(canEnterTerrain(guerrier, 'prairie', false)).toBe(true);
    expect(canEnterTerrain(guerrier, 'eau', false)).toBe(false);
    // Capacité de transport : Galère/Galion 1, Croiseur 0, armée 0 (R-117).
    expect(cargoCapacityOf({ type: 'galere', isArmy: false })).toBe(1);
    expect(cargoCapacityOf({ type: 'galion', isArmy: false })).toBe(1);
    expect(cargoCapacityOf({ type: 'croiseur', isArmy: false })).toBe(0);
    expect(cargoCapacityOf({ type: 'galere', isArmy: true })).toBe(0);
  });

  it('combat naval en mêlée : un échange R-51 entre deux galères en mer', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r },
        { id: 'u2', type: 'galere', owner: 'p2', q: H(1, 3).q, r: H(1, 3).r },
      ],
    });
    const result = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'u1', target: H(1, 3) }] }, 1);
    const exchanges = eventsOf(result.events, 'CombatExchange');
    expect(exchanges).toHaveLength(1);
    const ex = exchanges[0] as Extract<GameEvent, { type: 'CombatExchange' }>;
    expect(ex.attackerHpAfter + ex.defenderHpAfter).toBe(5); // 3+3 PV, un round
  });

  it('production navale : ville côtière OK, ville intérieure refusée (R-117)', () => {
    const state = coastalState({
      units: [],
      cities: [
        { id: 'c1', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r, capital: true, pop: 1, production: { item: { kind: 'unit', id: 'galere' }, progress: 29 } },
        { id: 'c2', owner: 'p1', q: H(4, 0).q, r: H(4, 0).r, pop: 1 },
      ],
    });
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'galere' } },
          { type: 'SetProduction', cityId: 'c2', item: { kind: 'unit', id: 'galere' } },
        ],
      },
      1,
    );
    // c1 : progression 29 + 1 → complétion, la galère sort sur la case de ville.
    expect(eventsOf(result.events, 'UnitProduced').length).toBe(1);
    expect(unitAt(result.newState, H(0, 2).q, H(0, 2).r)?.type).toBe('galere');
    // c2 (intérieure) : le SetProduction est ignoré — aucune file.
    expect(result.newState.cities['c2']!.production).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// R-118 · Soutien naval
// ---------------------------------------------------------------------------

describe('Phase 7g · R-118 — soutien naval', () => {
  // Graine 1 : premier tir mulberry32 = 0.6271 ∈ [0.5 ; 256/257) —
  // SANS soutien (p = 0.5) l'attaquant encaisse, AVEC Galion (p ≈ 0.996)
  // le défenseur encaisse. Même graine, issue inversée par le soutien.
  const SEED = 1;

  function duelState(withShip: boolean): GameState {
    return coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 1).q, r: H(0, 1).r },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: H(0, 2).q, r: H(0, 2).r },
        ...(withShip ? [{ id: 'u3', type: 'galion', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r }] : []),
      ],
    });
  }

  function attackerHpAfter(state: GameState): { attacker: number; defender: number } {
    const result = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'u1', target: H(0, 2) }] }, SEED);
    const ex = eventsOf(result.events, 'CombatExchange')[0] as Extract<GameEvent, { type: 'CombatExchange' }>;
    return { attacker: ex.attackerHpAfter, defender: ex.defenderHpAfter };
  }

  it('un Galion en mer adjacente ajoute son navalSupport (15) à S_att — même graine, issue inversée', () => {
    const without = attackerHpAfter(duelState(false));
    const withShip = attackerHpAfter(duelState(true));
    expect(without).toEqual({ attacker: 2, defender: 3 }); // p = 0.5 → l'attaquant encaisse
    expect(withShip).toEqual({ attacker: 3, defender: 2 }); // p ≈ 0.996 → le défenseur encaisse
  });

  it('prédicat pur : MAX d’un seul navire, port exclu, navire embarqué exclu, attaquant naval = 0', () => {
    const guerrier = unitType('guerrier');
    const galere = unitType('galere');
    const eau = (q: number, r: number) => ({ terrain: 'eau' as TerrainId });
    const prairie = { terrain: 'prairie' as TerrainId };
    const ville = { terrain: 'ville' as TerrainId };
    // Carte factice : (1,0) eau, (0,1) eau, (0,-1) ville, reste prairie.
    const map = { '1,0': eau(1, 0), '0,1': eau(0, 1), '0,-1': ville, '0,0': prairie };
    const at =
      (specs: Array<{ q: number; r: number; type: string; owner: string; aboard: string | null }>) =>
      (hex: { q: number; r: number }) =>
        specs.find((s) => s.q === hex.q && s.r === hex.r);

    // Deux navires amis adjacents : le MAX compte (35, pas 50).
    const both = navalSupportFor(map, guerrier, 'p1', H(0, 0), (hex) => {
      const found = [
        { q: 1, r: 0, type: 'galion', owner: 'p1', aboard: null },
        { q: 0, r: 1, type: 'croiseur', owner: 'p1', aboard: null },
      ].find((s) => s.q === hex.q && s.r === hex.r);
      return found;
    });
    expect(both).toBe(35);
    // Un seul Galion : 15.
    const one = navalSupportFor(map, guerrier, 'p1', H(0, 0), at([
      { q: 1, r: 0, type: 'galion', owner: 'p1', aboard: null },
    ]));
    expect(one).toBe(15); // valeur de soutien du Galion (données 7e) — 7g
    // Un navire EMBARQUÉ (garde d'un autre transport — cas théorique) : exclu.
    const aboard = navalSupportFor(map, guerrier, 'p1', H(0, 0), at([
      { q: 1, r: 0, type: 'croiseur', owner: 'p1', aboard: 'u9' },
    ]));
    expect(aboard).toBe(0);
    // Attaquant naval : pas de soutien (le navire EST l'attaquant).
    const navalAttacker = navalSupportFor(map, galere, 'p1', H(0, 0), at([
      { q: 1, r: 0, type: 'cuirasse', owner: 'p1', aboard: null },
    ]));
    expect(navalAttacker).toBe(0);
    // Navire ennemi : pas de soutien.
    const enemy = navalSupportFor(map, guerrier, 'p1', H(0, 0), at([
      { q: 1, r: 0, type: 'croiseur', owner: 'p2', aboard: null },
    ]));
    expect(enemy).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// R-117 · Transport (1 unité terrestre par Galère/Galion)
// ---------------------------------------------------------------------------

describe('Phase 7g · R-117 — transport', () => {
  it('embarquement sur un transport ami à cargaison libre, position miroir, chemin gelé conservé', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r },
      ],
    });
    // Chemin [navire, pleine mer, rive sud] : embarquement ce tour, le reste gèle.
    const result = resolveTurn(
      state,
      { p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 3), H(0, 4), H(0, 5)] }] },
      1,
    );
    const embark = eventsOf(result.events, 'Embark');
    expect(embark).toHaveLength(1);
    const guerrier = getUnit(result.newState, 'u1');
    expect(guerrier.aboard).toBe('u2');
    expect(guerrier).toMatchObject({ q: H(0, 3).q, r: H(0, 3).r }); // miroir du transport
    expect(getUnit(result.newState, 'u2').cargo).toBe('u1');
    // Le reste du chemin est gelé pour le débarquement d'un tour suivant.
    expect(result.newState.units['u1']!.order).toEqual({ type: 'Move', unitId: 'u1', path: [H(0, 4), H(0, 5)] });
  });

  it('débarquement : premier pas terrestre libre adjacent au transport, sinon l’unité reste à bord', () => {
    let state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u2' },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u1' },
      ],
    });
    // Tour 1 : premier pas du chemin gelé = pleine mer → invalide, reste à bord.
    state = resolveTurn(state, {}, 1).newState;
    expect(getUnit(state, 'u1').aboard).toBe('u2');
    expect(getUnit(state, 'u2').cargo).toBe('u1');

    // Tour 2 : la galère gagne la côte sud ; la cargaison la suit (miroir).
    state = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u2', path: [H(0, 4)] }] }, 1).newState;
    expect(getUnit(state, 'u2')).toMatchObject({ q: H(0, 4).q, r: H(0, 4).r });
    expect(getUnit(state, 'u1')).toMatchObject({ q: H(0, 4).q, r: H(0, 4).r });

    // Tour 3 : débarquement sur la rive sud libre (adjacente au transport).
    const result = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 5)] }] }, 1);
    expect(eventsOf(result.events, 'Disembark')).toHaveLength(1);
    expect(getUnit(result.newState, 'u1')).toMatchObject({ q: H(0, 5).q, r: H(0, 5).r, aboard: null });
    expect(getUnit(result.newState, 'u2').cargo).toBeNull();
  });

  it('naufrage : la mort du transport détruit la cargaison (cause sunk), pas d’avancée sur l’eau', () => {
    let state = coastalState({
      units: [
        { id: 'u1', type: 'assaut-test', owner: 'p2', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u3' },
        { id: 'u3', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u2' },
      ],
    });
    // p ≈ 1 : trois tours d'attaque (1 échange/tour, R-51) pour couler la galère.
    const attack: Record<string, Order[]> = { p2: [{ type: 'Attack', unitId: 'u1', target: H(0, 3) }] };
    let sunk = false;
    for (let t = 0; t < 3 && !sunk; t++) {
      const result = resolveTurn(state, attack, 1);
      state = result.newState;
      sunk = eventsOf(result.events, 'UnitDestroyed').some(
        (e) => (e as Extract<GameEvent, { type: 'UnitDestroyed' }>).unitId === 'u3',
      );
    }
    expect(sunk).toBe(true);
    expect(state.units['u3']).toBeUndefined();
    const sunkEvents = eventsOf(state.units ? [] : [], 'UnitDestroyed'); // (placeholder — voir assertions ci-dessous)
    void sunkEvents;
    expect(state.units['u2']).toBeUndefined(); // la cargaison a sombré avec le navire
    // L'assaillant terrestre n'a JAMAIS avancé sur l'eau (R-117, interprétation).
    expect(state.units['u1']).toMatchObject({ q: H(0, 2).q, r: H(0, 2).r });
  });

  it('la cargaison sombre porte la cause « sunk » dans le journal', () => {
    // Variante directe du naufrage : on capture le journal du dernier tour.
    let state = coastalState({
      units: [
        { id: 'u1', type: 'assaut-test', owner: 'p2', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u3' },
        { id: 'u3', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u2' },
      ],
    });
    const attack: Record<string, Order[]> = { p2: [{ type: 'Attack', unitId: 'u1', target: H(0, 3) }] };
    let lastEvents: GameEvent[] = [];
    for (let t = 0; t < 3; t++) {
      const result = resolveTurn(state, attack, 1);
      state = result.newState;
      lastEvents = result.events;
      if (state.units['u3'] === undefined) break;
    }
    const causes = lastEvents
      .filter((e): e is Extract<GameEvent, { type: 'UnitDestroyed' }> => e.type === 'UnitDestroyed')
      .map((e) => ({ id: e.unitId, cause: e.cause }));
    expect(causes).toContainEqual({ id: 'u3', cause: 'combat' });
    expect(causes).toContainEqual({ id: 'u2', cause: 'sunk' });
  });
});

// ---------------------------------------------------------------------------
// R-119 · Espionnage
// ---------------------------------------------------------------------------

describe('Phase 7g · R-119 — espionnage', () => {
  it('vol de GP installé : −1 jalon à la victime, +1 au voleur, espion consommé, escalade T-27 inchangée', () => {
    const state = coastalState({
      units: [{ id: 'u1', type: 'espion', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r }],
      cities: [{ id: 'c2', owner: 'p2', q: H(1, 2).q, r: H(1, 2).r, capital: true }],
    });
    state.players['p2']!.cultureMilestones = 3; // 3 GP installés (aucune merveille)
    // 7j · D4.3 : les GP volables sont ceux de la liste d'installation.
    state.cities['c2']!.settledGreatPersons = ['artiste_penseur', 'savant', 'batisseur'];
    state.players['p2']!.greatPersonsObtained = 5;
    const result = resolveTurn(
      state,
      { p1: [{ type: 'SpyMission', unitId: 'u1', cityId: 'c2', mission: 'stealGreatPerson' }] },
      1,
    );
    expect(eventsOf(result.events, 'GreatPersonStolen')).toHaveLength(1);
    expect(state ? result.newState.players['p2']!.cultureMilestones : -1).toBe(2);
    expect(result.newState.players['p1']!.cultureMilestones).toBe(1);
    // Décision d'Erik : l'escalade est INCHANGÉE des deux côtés.
    expect(result.newState.players['p2']!.greatPersonsObtained).toBe(5);
    expect(result.newState.players['p1']!.greatPersonsObtained).toBe(0);
    // L'espion est consommé par sa mission.
    expect(result.newState.units['u1']).toBeUndefined();
    const reasons = eventsOf(result.events, 'CultureMilestone').map(
      (e) => (e as Extract<GameEvent, { type: 'CultureMilestone' }>).reason,
    );
    expect(reasons).toEqual(['gpStolen', 'gpStolen']);
  });

  it('échec : rien à voler (merveilles seulement) ou ville trop loin — l’espion SURVIT', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'espion', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'espion', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r },
      ],
      cities: [
        { id: 'c2', owner: 'p2', q: H(1, 2).q, r: H(1, 2).r, capital: true, wonders: ['stonehenge'] },
      ],
    });
    state.players['p2']!.cultureMilestones = 1; // exactement la merveille : 0 GP installé
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'SpyMission', unitId: 'u1', cityId: 'c2', mission: 'stealGreatPerson' },
          { type: 'SpyMission', unitId: 'u2', cityId: 'c2', mission: 'stealGreatPerson' }, // hors de portée
        ],
      },
      1,
    );
    const missions = eventsOf(result.events, 'SpyMission') as Array<Extract<GameEvent, { type: 'SpyMission' }>>;
    expect(missions.map((m) => m.outcome).sort()).toEqual(['failed', 'failed']);
    expect(result.newState.players['p2']!.cultureMilestones).toBe(1);
    expect(result.newState.players['p1']!.cultureMilestones).toBe(0);
    // Les deux espions survivent à un échec.
    expect(result.newState.units['u1']).toBeDefined();
    expect(result.newState.units['u2']).toBeDefined();
  });

  it('interaction R-116 : le vol fait retomber sous 20 jalons → chantier de l’ONU SUSPENDU', () => {
    const state = coastalState({
      units: [{ id: 'u1', type: 'espion', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r }],
      cities: [
        {
          id: 'c2', owner: 'p2', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 2,
          production: { item: { kind: 'wonder', id: 'nations_unies' }, progress: 250 },
        },
      ],
    });
    state.players['p2']!.cultureMilestones = 20;
    // 7j : au moins un GP installé pour que le vol réussisse.
    state.cities['c2']!.settledGreatPersons = ['artiste_penseur'];
    state.players['p2']!.techsUnlocked = ['religion']; // l'ONU exige Religion
    const result = resolveTurn(
      state,
      { p1: [{ type: 'SpyMission', unitId: 'u1', cityId: 'c2', mission: 'stealGreatPerson' }] },
      1,
    );
    // 19 jalons : la progression est gelée (marteaux conservés), l'espion a volé.
    expect(result.newState.players['p2']!.cultureMilestones).toBe(19);
    expect(result.newState.cities['c2']!.production).toEqual({
      item: { kind: 'wonder', id: 'nations_unies' },
      progress: 250,
    });
  });
});

// ---------------------------------------------------------------------------
// Migration v10 → v11
// ---------------------------------------------------------------------------

describe('Phase 7g · Migration v10 → v11', () => {
  it('champs additifs aboard/cargo (null) sur chaque unité, idempotent', () => {
    const v10 = makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
      cities: [{ id: 'c1', owner: 'p1', q: 1, r: 0, capital: true }],
    });
    const raw = { ...structuredClone(v10), schemaVersion: 10 } as unknown as Record<string, unknown>;
    const out = migrateState<GameState>(raw);
    expect(out.schemaVersion).toBe(16);
    expect(out.units['u1']).toMatchObject({ aboard: null, cargo: null });
    expect(CURRENT_SCHEMA_VERSION).toBe(16); // 7m : nukesLaunched (R-139)
    const twice = migrateState(structuredClone(out) as unknown as Record<string, unknown>);
    expect(twice).toEqual(out);
  });
});

// ---------------------------------------------------------------------------
// e2e — invasion côtière avec soutien naval + vol de GP
// ---------------------------------------------------------------------------

describe('Phase 7g · e2e naval + espionnage', () => {
  it('embarquement → traversée → débarquement → assault de ville (soutien naval) + vol de GP', () => {
    // p1 : guerrier (u1, rive nord), galère (u2), galion de soutien (u3),
    // espion (u4). p2 : capitale c3 au sud, défendue par u5 (PV 1 — il
    // PATROUILLE aux tours 1-2 pour renoncer au soin R-71), ville c4 au
    // nord-est avec 2 GP installés.
    let state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r },
        { id: 'u3', type: 'galion', owner: 'p1', q: H(1, 4).q, r: H(1, 4).r },
        { id: 'u4', type: 'espion', owner: 'p1', q: H(2, 2).q, r: H(2, 2).r },
        { id: 'u5', type: 'guerrier', owner: 'p2', q: H(1, 5).q, r: H(1, 5).r, hp: 1 },
      ],
      cities: [
        { id: 'c3', owner: 'p2', q: H(1, 5).q, r: H(1, 5).r, capital: true, pop: 1 },
        { id: 'c4', owner: 'p2', q: H(3, 2).q, r: H(3, 2).r, pop: 1 },
      ],
    });
    state.players['p2']!.cultureMilestones = 2; // GP installés (aucune merveille)
    // 7j : le vol cible un GP INSTALLÉ (liste settledGreatPersons).
    state.cities['c4']!.settledGreatPersons = ['artiste_penseur', 'savant'];

    // Tour 1 — embarquement + traversée d'un pas + vol de GP contre c4.
    const t1 = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u1', path: [H(0, 3)] }, // embarque (u2 traité ensuite)
          { type: 'Move', unitId: 'u2', path: [H(0, 4)] }, // la galère avance, cargaison miroir
          { type: 'SpyMission', unitId: 'u4', cityId: 'c4', mission: 'stealGreatPerson' },
        ],
        p2: [{ type: 'Move', unitId: 'u5', path: [H(2, 6)] }], // patrouille : pas de soin (R-71)
      },
      1,
    );
    state = t1.newState;
    expect(eventsOf(t1.events, 'Embark')).toHaveLength(1);
    expect(getUnit(state, 'u1').aboard).toBe('u2');
    expect(getUnit(state, 'u2')).toMatchObject({ q: H(0, 4).q, r: H(0, 4).r });
    expect(getUnit(state, 'u1')).toMatchObject({ q: H(0, 4).q, r: H(0, 4).r });
    expect(state.players['p2']!.cultureMilestones).toBe(1);
    expect(state.players['p1']!.cultureMilestones).toBe(1);
    expect(getUnit(state, 'u5').hp).toBe(1); // déplacé → aucun soin

    // Tour 2 — débarquement sur la rive sud ; u5 regagne la capitale (sans soin).
    const t2 = resolveTurn(
      state,
      {
        p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 5)] }],
        p2: [{ type: 'Move', unitId: 'u5', path: [H(1, 5)] }],
      },
      1,
    );
    state = t2.newState;
    expect(eventsOf(t2.events, 'Disembark')).toHaveLength(1);
    expect(getUnit(state, 'u1')).toMatchObject({ q: H(0, 5).q, r: H(0, 5).r, aboard: null });
    expect(getUnit(state, 'u5')).toMatchObject({ q: H(1, 5).q, r: H(1, 5).r, hp: 1 });

    // Tour 3 — assault de la capitale : le Galion en mer adjacente soutient
    // l'attaque (R-118) ; le défenseur tombe, la ville est capturée → victoire.
    const t3 = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'u1', target: H(1, 5) }] }, 1);
    state = t3.newState;
    const exchange = eventsOf(t3.events, 'CombatExchange')[0] as Extract<GameEvent, { type: 'CombatExchange' }>;
    expect(exchange.defenderHpAfter).toBe(0); // le défenseur encaisse le round (p ≈ 0.996)
    expect(state.units['u5']).toBeUndefined();
    expect(state.cities['c3']!.owner).toBe('p1'); // capture R-65
    expect(eventsOf(t3.events, 'CityCaptured')).toHaveLength(1);
    expect(state.winner).toBe('p1'); // capitale adverse → domination
  });
});
