/**
 * REPLAY-RESOLUTION — tests du cœur pur (apps/web/src/lib/replay.ts) :
 * hexDeLEvenement (journal cliquable — L1), appliquerEvenement / état de
 * relecture (L3), fin de file = état réel, capture/purge de la paire (L2).
 */
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, ServerToClientMessage } from '@game/shared';
import {
  appliquerEvenement,
  cloneEtatReplay,
  etatsCoincident,
  hexDeLEvenement,
  reducePaireReplay,
} from '../src/lib/replay.js';

/** État minimal : seuls units/cities/players sont lus par le cœur de replay. */
function etatMinimal(units: GameState['units'] = {}, cities: GameState['cities'] = {}): GameState {
  return { units, cities } as unknown as GameState;
}

function unite(id: string, q: number, r: number, hp = 3, owner = 'p1'): GameState['units'][string] {
  return {
    id, type: 'guerrier', owner, q, r, hp, mp: 0, veteran: false, isArmy: false,
    order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false,
  };
}

function ville(id: string, q: number, r: number, owner = 'p1', pop = 3): GameState['cities'][string] {
  return {
    id, q, r, owner, pop, capital: false, foodStored: 0, production: null, workedTiles: [],
    buildings: [], conversion: 'gold', cultureCumulee: 0, wonders: [], pendingSalvage: 0,
    settledGreatPersons: [], wasCaptured: false,
  };
}

describe('hexDeLEvenement · journal cliquable (L1/D5)', () => {
  it('Move → case de destination ; Attack/UnitDestroyed/CityCaptured → case at', () => {
    expect(hexDeLEvenement({ seq: 1, type: 'Move', unitId: 'u2', owner: 'p1', from: { q: -2, r: 12 }, to: { q: -2, r: 13 } })).toEqual({ q: -2, r: 13 });
    expect(hexDeLEvenement({ seq: 2, type: 'Attack', attackerId: 'u1', defenderId: 'u2', at: { q: 3, r: 4 } })).toEqual({ q: 3, r: 4 });
    expect(hexDeLEvenement({ seq: 3, type: 'UnitDestroyed', unitId: 'u2', owner: 'p2', at: { q: 3, r: 4 }, cause: 'combat', byUnitId: 'u1' })).toEqual({ q: 3, r: 4 });
    expect(hexDeLEvenement({ seq: 4, type: 'CityCaptured', cityId: 'Ville1', fromOwner: 'p1', toOwner: 'p2', at: { q: 7, r: 8 } })).toEqual({ q: 7, r: 8 });
  });

  it('ICBM : la cible si détonée, la case du tireur sinon (refus/interception)', () => {
    expect(hexDeLEvenement({ seq: 5, type: 'NukeLaunched', unitId: 'n1', owner: 'p1', at: { q: 0, r: 0 }, target: { q: 9, r: 9 }, outcome: 'detonated' })).toEqual({ q: 9, r: 9 });
    expect(hexDeLEvenement({ seq: 6, type: 'NukeLaunched', unitId: 'n1', owner: 'p1', at: { q: 0, r: 0 }, target: { q: 9, r: 9 }, outcome: 'refused', reason: 'democratie' })).toEqual({ q: 0, r: 0 });
  });

  it('événements sans case (tech, fin de tour, victoire) → null (non cliquable)', () => {
    expect(hexDeLEvenement({ seq: 7, type: 'TechResearched', player: 'p1', tech: 'poterie' })).toBeNull();
    expect(hexDeLEvenement({ seq: 8, type: 'TurnResolved', turn: 2 })).toBeNull();
    expect(hexDeLEvenement({ seq: 9, type: 'Victory', winner: 'p1', reason: 'domination' })).toBeNull();
    expect(hexDeLEvenement({ seq: 10, type: 'BootyGold', player: 'p1', amount: 10, sourceUnitId: 'u9' })).toBeNull();
  });
});

describe('appliquerEvenement · état de relecture (L3/D3)', () => {
  it('Move déplace l\u2019unité dans le clone SANS toucher l\u2019état pré-résolution', () => {
    const pre = etatMinimal({ u1: unite('u1', 1, 1) });
    const clone = cloneEtatReplay(pre);
    appliquerEvenement(clone, { seq: 1, type: 'Move', unitId: 'u1', owner: 'p1', from: { q: 1, r: 1 }, to: { q: 2, r: 2 } });
    expect(clone.units['u1']!.q).toBe(2);
    expect(clone.units['u1']!.r).toBe(2);
    expect(pre.units['u1']!.q).toBe(1); // l\u2019état mémorisé reste intact
  });

  it('UnitDestroyed fait disparaître le sprite À L\u2019ÉVÉNEMENT (unité supprimée du clone)', () => {
    const clone = etatMinimal({ u1: unite('u1', 1, 1), u2: unite('u2', 1, 2, 3, 'p2') });
    appliquerEvenement(clone, { seq: 1, type: 'UnitDestroyed', unitId: 'u2', owner: 'p2', at: { q: 1, r: 2 }, cause: 'combat', byUnitId: 'u1' });
    expect(clone.units['u2']).toBeUndefined();
    expect(clone.units['u1']).toBeDefined();
  });

  it('CombatExchange applique les PV après échange (fog : unité absente ignorée)', () => {
    const clone = etatMinimal({ u1: unite('u1', 1, 1, 3) });
    appliquerEvenement(clone, { seq: 1, type: 'CombatExchange', at: { q: 1, r: 1 }, attackerId: 'u1', defenderId: 'uX', attackerHpAfter: 2, defenderHpAfter: 1 });
    expect(clone.units['u1']!.hp).toBe(2);
  });

  it('CityCaptured change le drapeau ; CityRazed retire la ville ; PopulationGrew ajuste la pop', () => {
    const clone = etatMinimal({}, { V1: ville('V1', 5, 5) });
    appliquerEvenement(clone, { seq: 1, type: 'CityCaptured', cityId: 'V1', fromOwner: 'p1', toOwner: 'p2', at: { q: 5, r: 5 } });
    expect(clone.cities['V1']!.owner).toBe('p2');
    appliquerEvenement(clone, { seq: 2, type: 'PopulationGrew', cityId: 'V1', owner: 'p2', pop: 4, at: { q: 5, r: 5 } });
    expect(clone.cities['V1']!.pop).toBe(4);
    appliquerEvenement(clone, { seq: 3, type: 'CityRazed', cityId: 'V1', owner: 'p2', byPlayer: 'p1', at: { q: 5, r: 5 } });
    expect(clone.cities['V1']).toBeUndefined();
  });

  it('CityFounded / UnitProduced font apparaître la ville / l\u2019unité à l\u2019événement', () => {
    const clone = etatMinimal();
    appliquerEvenement(clone, { seq: 1, type: 'UnitProduced', unitId: 'u9', cityId: 'V1', owner: 'p1', unitType: 'guerrier', at: { q: 3, r: 3 } });
    appliquerEvenement(clone, { seq: 2, type: 'CityFounded', cityId: 'V2', owner: 'p1', at: { q: 4, r: 4 }, capital: false, byUnitId: 'u9' });
    expect(clone.units['u9']!.q).toBe(3);
    expect(clone.cities['V2']!.owner).toBe('p1');
  });

  it('Embark masque l\u2019unité (aboard) ; Disembark la repose à la case at', () => {
    const clone = etatMinimal({ u1: unite('u1', 1, 1), g1: unite('g1', 1, 1) });
    appliquerEvenement(clone, { seq: 1, type: 'Embark', unitId: 'u1', owner: 'p1', transportId: 'g1', at: { q: 1, r: 1 } });
    expect(clone.units['u1']!.aboard).toBe('g1');
    appliquerEvenement(clone, { seq: 2, type: 'Disembark', unitId: 'u1', owner: 'p1', transportId: 'g1', at: { q: 2, r: 2 } });
    expect(clone.units['u1']!.aboard).toBeNull();
    expect(clone.units['u1']!.q).toBe(2);
  });

  it('Move applique R-175 : la fortification est perdue à tout déplacement', () => {
    const clone = etatMinimal({ u1: { ...unite('u1', 1, 1), fortified: true } });
    appliquerEvenement(clone, { seq: 1, type: 'Move', unitId: 'u1', owner: 'p1', from: { q: 1, r: 1 }, to: { q: 1, r: 2 } });
    expect(clone.units['u1']!.fortified).toBe(false);
  });
});

describe('fin de file = état réel (L4)', () => {
  it('après application de tous les événements, l\u2019état de relecture coïncide avec le post-résolution', () => {
    const pre = etatMinimal({ u1: unite('u1', 1, 1, 3), u2: unite('u2', 3, 3, 3, 'p2') }, { V1: ville('V1', 5, 5, 'p1') });
    const events: GameEvent[] = [
      { seq: 1, type: 'Move', unitId: 'u1', owner: 'p1', from: { q: 1, r: 1 }, to: { q: 2, r: 2 } },
      { seq: 2, type: 'Attack', attackerId: 'u1', defenderId: 'u2', at: { q: 3, r: 3 } },
      { seq: 3, type: 'CombatExchange', at: { q: 3, r: 3 }, attackerId: 'u1', defenderId: 'u2', attackerHpAfter: 2, defenderHpAfter: 0 },
      { seq: 4, type: 'UnitDestroyed', unitId: 'u2', owner: 'p2', at: { q: 3, r: 3 }, cause: 'combat', byUnitId: 'u1' },
      { seq: 5, type: 'PopulationGrew', cityId: 'V1', owner: 'p1', pop: 4, at: { q: 5, r: 5 } },
    ];
    const reel = etatMinimal({ u1: unite('u1', 2, 2, 2) }, { V1: ville('V1', 5, 5, 'p1', 4) });
    const clone = cloneEtatReplay(pre);
    for (const ev of events) appliquerEvenement(clone, ev);
    expect(etatsCoincident(clone, reel)).toBe(true);
  });

  it('un écart résiduel (position, PV, unité manquante) est détecté', () => {
    const a = etatMinimal({ u1: unite('u1', 1, 1, 3) });
    expect(etatsCoincident(a, etatMinimal({ u1: unite('u1', 1, 2, 3) }))).toBe(false);
    expect(etatsCoincident(a, etatMinimal({ u1: unite('u1', 1, 1, 2) }))).toBe(false);
    expect(etatsCoincident(a, etatMinimal({}))).toBe(false);
    expect(etatsCoincident(a, a)).toBe(true);
  });
});

describe('capture/purge de la paire (L2/D1)', () => {
  const state = etatMinimal({ u1: unite('u1', 1, 1) }) as unknown as ReturnType<typeof etatMinimal>;

  it('TurnResult mémorise {pré-état, événements, tour} ; la paire suivante REMPLACE', () => {
    const events: GameEvent[] = [{ seq: 1, type: 'TurnResolved', turn: 1 }];
    const m: ServerToClientMessage = { proto: 1, type: 'TurnResult', seq: 1, turn: 1, events, state: etatMinimal() as unknown as GameState };
    const p1 = reducePaireReplay(null, m, state as unknown as GameState);
    expect(p1).not.toBeNull();
    expect(p1!.tour).toBe(1);
    expect(p1!.events).toBe(events);
    expect(p1!.statePre).toBe(state);
    // Tour suivant : remplacement (jamais d'accumulation).
    const m2: ServerToClientMessage = { proto: 1, type: 'TurnResult', seq: 2, turn: 2, events: [], state: etatMinimal() as unknown as GameState };
    const p2 = reducePaireReplay(p1, m2, etatMinimal() as unknown as GameState);
    expect(p2!.tour).toBe(2);
    expect(p2!.statePre).not.toBe(state);
  });

  it('Snapshot (chargement/reconnexion) purge la paire — relecture indisponible', () => {
    const snap: ServerToClientMessage = { proto: 1, type: 'Snapshot', seq: 5, state: state as unknown as GameState, orders: [], missedEvents: [], locked: false };
    expect(reducePaireReplay({ statePre: state as unknown as GameState, events: [], tour: 1 }, snap, null)).toBeNull();
  });

  it('sans pré-état (aucun état affiché), le TurnResult ne crée pas de paire', () => {
    const m: ServerToClientMessage = { proto: 1, type: 'TurnResult', seq: 1, turn: 1, events: [], state: etatMinimal() as unknown as GameState };
    expect(reducePaireReplay(null, m, null)).toBeNull();
  });
});
