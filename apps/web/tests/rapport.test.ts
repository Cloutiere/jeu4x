/**
 * RAPPORT-ENGAGEMENT (L1) — tests de l'agrégation pure `resumesDeCase`.
 * Fixtures d'événements couvrant : échange simple, mêlée 3 participants
 * (rôles R-180), destruction, expulsion, capture, plusieurs combats sur la
 * même case, case sans combat (null), PV avant depuis le pré-état.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, Unit } from '@game/shared';
import { casesDeCombat, resumesDeCase } from '../src/lib/rapport.js';

const HEX = { q: 3, r: -2 };
const AUTRE = { q: 0, r: 0 };

function unite(id: string, owner: string, type: string, hp: number): Unit {
  return {
    id, owner, type, q: HEX.q, r: HEX.r, hp, mp: 0, veteran: false,
    isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false,
  } as Unit;
}

function etat(units: Unit[]): GameState {
  return { units: Object.fromEntries(units.map((u) => [u.id, u])) } as unknown as GameState;
}

describe('resumesDeCase', () => {
  it('cas null : case sans combat', () => {
    const events: GameEvent[] = [{ seq: 1, type: 'Move', unitId: 'u1', owner: 'p1', from: AUTRE, to: AUTRE }];
    expect(resumesDeCase(events, HEX)).toBeNull();
  });

  it('échange simple : PV avant depuis le pré-état, aucun sort', () => {
    const events: GameEvent[] = [
      { seq: 1, type: 'Attack', attackerId: 'u1', defenderId: 'u2', at: HEX },
      { seq: 2, type: 'CombatExchange', attackerId: 'u1', defenderId: 'u2', at: HEX, attackerHpAfter: 3, defenderHpAfter: 2 },
    ];
    const pre = etat([unite('u1', 'p1', 'guerrier', 3), unite('u2', 'p2', 'guerrier', 3)]);
    const r = resumesDeCase(events, HEX, pre)!;
    expect(r.melee).toBe(false);
    expect(r.participants).toHaveLength(2);
    const u1 = r.participants.find((p) => p.unitId === 'u1')!;
    const u2 = r.participants.find((p) => p.unitId === 'u2')!;
    expect(u1).toMatchObject({ owner: 'p1', type: 'guerrier', pvAvant: 3, pvApres: 3, sort: 'reste' });
    expect(u2).toMatchObject({ owner: 'p2', type: 'guerrier', pvAvant: 3, pvApres: 2, sort: 'reste' });
    expect(u1.role).toBeUndefined();
  });

  it('chaîne d\'échanges : le PV avant reste celui du pré-état', () => {
    const events: GameEvent[] = [
      { seq: 1, type: 'CombatExchange', attackerId: 'u1', defenderId: 'u2', at: HEX, attackerHpAfter: 2, defenderHpAfter: 1 },
      { seq: 2, type: 'CombatExchange', attackerId: 'u1', defenderId: 'u2', at: HEX, attackerHpAfter: 2, defenderHpAfter: 0 },
    ];
    const pre = etat([unite('u1', 'p1', 'legion', 3), unite('u2', 'p2', 'guerrier', 3)]);
    const r = resumesDeCase(events, HEX, pre)!;
    expect(r.participants.find((p) => p.unitId === 'u2')).toMatchObject({ pvAvant: 3, pvApres: 0 });
  });

  it('mêlée 3 participants : rôles triés vainqueur → milieu → perdant', () => {
    const events: GameEvent[] = [
      { seq: 1, type: 'MeleeResolved', at: HEX, participants: ['uA', 'uB', 'uC'], results: [
        { unitId: 'uA', role: 'winner', hpAfter: 3 },
        { unitId: 'uB', role: 'loser', hpAfter: 1 },
        { unitId: 'uC', role: 'middle', hpAfter: 2 },
      ] },
    ];
    const pre = etat([unite('uA', 'p1', 'legion', 3), unite('uB', 'p2', 'guerrier', 3), unite('uC', 'p3', 'archer', 3)]);
    const r = resumesDeCase(events, HEX, pre)!;
    expect(r.melee).toBe(true);
    expect(r.participants.map((p) => p.unitId)).toEqual(['uA', 'uC', 'uB']);
    expect(r.participants.map((p) => p.role)).toEqual(['winner', 'middle', 'loser']);
    expect(r.participants.map((p) => p.pvApres)).toEqual([3, 2, 1]);
  });

  it('destruction : sort detruit, owner repris de l\'événement', () => {
    const events: GameEvent[] = [
      { seq: 1, type: 'CombatExchange', attackerId: 'u1', defenderId: 'u2', at: HEX, attackerHpAfter: 3, defenderHpAfter: 0 },
      { seq: 2, type: 'UnitDestroyed', unitId: 'u2', owner: 'p2', at: HEX, cause: 'combat', byUnitId: 'u1' },
    ];
    const pre = etat([unite('u1', 'p1', 'guerrier', 3), unite('u2', 'p2', 'guerrier', 3)]);
    const r = resumesDeCase(events, HEX, pre)!;
    expect(r.participants.find((p) => p.unitId === 'u2')).toMatchObject({ sort: 'detruit', pvApres: 0, owner: 'p2' });
  });

  it('expulsion : sort expulse avec destination', () => {
    const dest = { q: 4, r: -2 };
    const events: GameEvent[] = [
      { seq: 1, type: 'MeleeResolved', at: HEX, participants: ['u1'], results: [{ unitId: 'u1', role: 'winner', hpAfter: 2 }] },
      { seq: 2, type: 'UnitDispersed', unitId: 'u1', owner: 'p1', from: HEX, to: dest },
    ];
    const pre = etat([unite('u1', 'p1', 'guerrier', 3)]);
    const r = resumesDeCase(events, HEX, pre)!;
    const p = r.participants[0]!;
    expect(p.sort).toBe('expulse');
    expect(p.deplaceVers).toEqual(dest);
    expect(p.role).toBe('winner');
  });

  it('capture pacifique : destroyed / detained', () => {
    const events: GameEvent[] = [
      { seq: 1, type: 'Captured', unitId: 'u1', owner: 'p1', byPlayer: 'p2', at: HEX, outcome: 'detained' },
    ];
    const pre = etat([unite('u1', 'p1', 'caravane', 3)]);
    expect(resumesDeCase(events, HEX, pre)!.participants[0]!.sort).toBe('capture');
    const events2: GameEvent[] = [{ ...events[0]!, seq: 2, outcome: 'destroyed' } as GameEvent];
    expect(resumesDeCase(events2, HEX, pre)!.participants[0]!.sort).toBe('detruit');
  });

  it('plusieurs combats sur la même case le même tour : tous les participants agrégés', () => {
    const events: GameEvent[] = [
      { seq: 1, type: 'CombatExchange', attackerId: 'u1', defenderId: 'u2', at: HEX, attackerHpAfter: 3, defenderHpAfter: 1 },
      { seq: 2, type: 'CombatExchange', attackerId: 'u3', defenderId: 'u2', at: HEX, attackerHpAfter: 2, defenderHpAfter: 0 },
      { seq: 3, type: 'UnitDestroyed', unitId: 'u2', owner: 'p2', at: HEX, cause: 'combat', byUnitId: 'u3' },
    ];
    const pre = etat([
      unite('u1', 'p1', 'guerrier', 3), unite('u2', 'p2', 'guerrier', 3), unite('u3', 'p3', 'archer', 2),
    ]);
    const r = resumesDeCase(events, HEX, pre)!;
    expect(r.participants).toHaveLength(3);
    expect(r.participants.find((p) => p.unitId === 'u2')).toMatchObject({ pvAvant: 3, pvApres: 0, sort: 'detruit' });
  });

  it('unité hors pré-état : pvAvant null, repli sur l\'état après pour owner/type', () => {
    const events: GameEvent[] = [
      { seq: 1, type: 'CombatExchange', attackerId: 'u9', defenderId: 'u1', at: HEX, attackerHpAfter: 2, defenderHpAfter: 3 },
    ];
    const pre = etat([unite('u1', 'p1', 'guerrier', 3)]);
    const post = etat([unite('u1', 'p1', 'guerrier', 3), unite('u9', 'barbare', 'milice', 2)]);
    const r = resumesDeCase(events, HEX, pre, post)!;
    const u9 = r.participants.find((p) => p.unitId === 'u9')!;
    expect(u9).toMatchObject({ owner: 'barbare', type: 'milice', pvAvant: null, pvApres: 2 });
  });

  it('ne retient que les événements de la case demandée', () => {
    const events: GameEvent[] = [
      { seq: 1, type: 'CombatExchange', attackerId: 'u1', defenderId: 'u2', at: AUTRE, attackerHpAfter: 0, defenderHpAfter: 3 },
    ];
    expect(resumesDeCase(events, HEX)).toBeNull();
  });

  it('casesDeCombat : clés "q,r" de toutes les cases portant un combat', () => {
    const events: GameEvent[] = [
      { seq: 1, type: 'Attack', attackerId: 'u1', defenderId: 'u2', at: HEX },
      { seq: 2, type: 'MeleeResolved', at: AUTRE, participants: ['u1'], results: [{ unitId: 'u1', role: 'winner', hpAfter: 3 }] },
      { seq: 3, type: 'Move', unitId: 'u1', owner: 'p1', from: AUTRE, to: AUTRE },
    ];
    const cases = casesDeCombat(events);
    expect(cases.has('3,-2')).toBe(true);
    expect(cases.has('0,0')).toBe(true);
    expect(cases.size).toBe(2);
  });
});
