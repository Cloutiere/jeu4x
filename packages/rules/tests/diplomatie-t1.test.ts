/**
 * DIPLOMATIE-T1 (décisions Erik 19/10, HANDOFF-DIPLOMATIE-T1) — l'état de
 * guerre Paix/Guerre entre nations :
 *  - D1 : `diplomacy.war` par paire, ABSENT = Paix ; état PUBLIC ;
 *  - D2 : attaquer exige la Guerre (mêlée, distance, entrée ennemie,
 *    ville, ICBM — refus nommé) ; EXCEPTION défense territoriale (R-43 :
 *    le colon qui marche sur TA case est capturé même en Paix) ;
 *    espionnage LIBRE en Paix (ne déclenche jamais de guerre) ;
 *  - D3 : action immédiate DeclareWar — publique, mutuelle, événement
 *    WarDeclared ; re-déclaration refusée (déjà en guerre) ;
 *  - D4 : les bots ne déclarent pas (leur politique ne porte pas
 *    l'action) ; leurs attaques subissent la même gate ;
 *  - D5 : caravane intacts (livraison en guerre ET en Paix) ;
 *  - reprise : migration v27 → v28 — les anciennes parties (guerre
 *    universelle R-58) reprennent en PAIX PARTOUT.
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, unit as getUnit } from '../src/fixtures.js';
import { areAtWar, CURRENT_SCHEMA_VERSION, migrateState } from '../src/state.js';
import { applyDeclareWar } from '../src/diplomatie.js';
import { PUBLIC_EVENTS } from '../src/fog.js';
import type { GameEvent } from '../src/events.js';
import type { GameState } from '../src/state.js';

const H = (q: number, r: number) => ({ q, r });

/** État en PAIX (warPairs []) — deux guerriers adjacents. */
function etatPaix(opts: Partial<Parameters<typeof makeState>[0]> = {}): GameState {
  return makeState({
    width: 8,
    height: 6,
    warPairs: [],
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
      { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 0 },
    ],
    cities: [
      { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true },
      { id: 'c2', owner: 'p2', q: 5, r: 0, capital: true },
    ],
    ...opts,
  });
}

function evts(events: GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((e) => e.type === type);
}

// ---------------------------------------------------------------------------
// D2 — la gate d'attaque en Paix
// ---------------------------------------------------------------------------

describe('D2 · attaquer exige la Guerre', () => {
  it('ordre Attack explicite en Paix → refus NOMMÉ (AttackRefused), zéro combat, zéro PM', () => {
    const st = etatPaix();
    const r = resolveTurn(st, { p1: [{ type: 'Attack', unitId: 'u1', target: H(2, 0) }] }, 101);
    expect(evts(r.events, 'CombatExchange')).toHaveLength(0);
    expect(evts(r.events, 'Attack')).toHaveLength(0);
    const refus = evts(r.events, 'AttackRefused') as Array<Extract<GameEvent, { type: 'AttackRefused' }>>;
    expect(refus).toHaveLength(1);
    expect(refus[0]!.player).toBe('p1');
    expect(refus[0]!.unitId).toBe('u1');
    expect(refus[0]!.target).toEqual(H(2, 0));
    expect(refus[0]!.reason).toBe('paix');
    // l'attaquant est intact : mêmes PV, même case, AUCUN PM consommé.
    const u1 = r.newState.units['u1']!;
    expect(u1.hp).toBe(st.units['u1']!.hp);
    expect(u1.mp).toBe(st.units['u1']!.mp);
    expect(u1.q).toBe(1);
    // le défenseur non plus.
    expect(r.newState.units['u2']!.hp).toBe(st.units['u2']!.hp);
  });

  it('marcher SUR l’ennemi en Paix → refus nommé, l’unité s’arrête DEVANT (chemin gelé)', () => {
    const st = etatPaix();
    const r = resolveTurn(st, { p1: [{ type: 'Move', unitId: 'u1', path: [H(2, 0)] }] }, 102);
    expect(evts(r.events, 'CombatExchange')).toHaveLength(0);
    expect(r.newState.units['u1']!.q).toBe(1); // jamais entrée
    const refus = evts(r.events, 'AttackRefused') as Array<Extract<GameEvent, { type: 'AttackRefused' }>>;
    expect(refus).toHaveLength(1);
    expect(refus[0]!.unitId).toBe('u1');
  });

  it('tir à distance en Paix → même refus (aucune portée sans guerre)', () => {
    const st = etatPaix({
      units: [
        { id: 'arch', type: 'archer', owner: 'p1', q: 1, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 0 },
      ],
    });
    const r = resolveTurn(st, { p1: [{ type: 'Attack', unitId: 'arch', target: H(2, 0) }] }, 103);
    expect(evts(r.events, 'CombatExchange')).toHaveLength(0);
    expect(evts(r.events, 'AttackRefused')).toHaveLength(1);
  });

  it('entrer dans une ville étrangère NON défendue en Paix → capture REFUSÉE (arrêt devant)', () => {
    const st = etatPaix({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 0 },
      ],
    });
    const r = resolveTurn(st, { p1: [{ type: 'Move', unitId: 'u1', path: [H(5, 0)] }] }, 104);
    expect(Object.keys(r.newState.cities)).toContain('c2');
    expect(r.newState.cities['c2']!.owner).toBe('p2');
    expect(r.newState.units['u1']!.q).toBe(4); // arrêté devant
    expect(evts(r.events, 'CityCaptured')).toHaveLength(0);
    expect(evts(r.events, 'AttackRefused')).toHaveLength(1);
  });

  it('EXCEPTION défense territoriale (D2 🔶) : un colon qui marche sur TA case en Paix est CAPTURÉ (détenu)', () => {
    const st = etatPaix({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
        { id: 'col', type: 'colon', owner: 'p2', q: 3, r: 0 },
      ],
    });
    const r = resolveTurn(st, { p2: [{ type: 'Move', unitId: 'col', path: [H(1, 0)] }] }, 105);
    const cap = evts(r.events, 'Captured') as Array<Extract<GameEvent, { type: 'Captured' }>>;
    expect(cap).toHaveLength(1);
    expect(cap[0]!.outcome).toBe('detained'); // Paix : détention (pas destruction)
    expect(r.newState.units['col']!.detainedBy).toBe('p1');
  });

  it('ICBM en Paix → refus nommé « paix », missile CONSERVÉ', () => {
    const st = etatPaix({
      units: [
        { id: 'nuke', type: 'icbm', owner: 'p1', q: 2, r: 2 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 0 },
      ],
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true },
        { id: 'c2', owner: 'p2', q: 2, r: 0, capital: true },
      ],
    });
    const r = resolveTurn(st, { p1: [{ type: 'Launch', unitId: 'nuke', target: H(2, 0) }] }, 106);
    const nukes = evts(r.events, 'NukeLaunched') as Array<Extract<GameEvent, { type: 'NukeLaunched' }>>;
    expect(nukes).toHaveLength(1);
    expect(nukes[0]!.outcome).toBe('refused');
    expect(nukes[0]!.reason).toBe('paix');
    expect(r.newState.units['nuke']).toBeDefined(); // missile conservé
    expect(evts(r.events, 'CityNuked')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// D3 — DeclareWar : publique, mutuelle, re-déclaration refusée
// ---------------------------------------------------------------------------

describe('D3 · DeclareWar', () => {
  it('déclare la guerre : paire ajoutée, événement WarDeclared, attaques DÉBLOQUÉES des deux côtés', () => {
    const st = etatPaix();
    const res = applyDeclareWar(st, 'p1', 'p2');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(areAtWar(res.state, 'p1', 'p2')).toBe(true);
    const wd = res.events.filter((e) => e.type === 'WarDeclared');
    expect(wd).toHaveLength(1);
    // MUTUALITÉ : l'ancien joueur visé peut attaquer à son tour.
    const r = resolveTurn(res.state, { p2: [{ type: 'Attack', unitId: 'u2', target: H(1, 0) }] }, 107);
    expect(evts(r.events, 'CombatExchange')).toHaveLength(1);
    expect(evts(r.events, 'AttackRefused')).toHaveLength(0);
  });

  it('la guerre débloque aussi l’ATTAQUANT initial (le même ordre passe après déclaration)', () => {
    const st = etatPaix();
    const res = applyDeclareWar(st, 'p1', 'p2');
    if (!res.ok) throw new Error('déclaration refusée');
    const r = resolveTurn(res.state, { p1: [{ type: 'Attack', unitId: 'u1', target: H(2, 0) }] }, 108);
    expect(evts(r.events, 'CombatExchange')).toHaveLength(1);
    expect(evts(r.events, 'AttackRefused')).toHaveLength(0);
  });

  it('refus : cible inconnue, soi-même, ou déjà en guerre', () => {
    const st = etatPaix();
    expect(applyDeclareWar(st, 'p1', 'p1').ok).toBe(false);
    expect(applyDeclareWar(st, 'p1', 'inconnu').ok).toBe(false);
    const res = applyDeclareWar(st, 'p2', 'p1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      const re = applyDeclareWar(res.state, 'p1', 'p2');
      expect(re.ok).toBe(false);
    }
  });

  it('événement WarDeclared PUBLIC (passe le fog — filtrage R-73)', () => {
    expect(PUBLIC_EVENTS.has('WarDeclared')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D5 / exceptions — espionnage libre, caravane intacts
// ---------------------------------------------------------------------------

describe('D5 · exceptions en Paix', () => {
  it('espionnage LIBRE en Paix : vol de GP réussi SANT guerre, sans Incident', () => {
    const st = etatPaix({
      units: [
        { id: 'u1', type: 'espion', owner: 'p1', q: 1, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 4, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true },
        { id: 'c2', owner: 'p2', q: 2, r: 0, capital: true, settledGreatPersons: ['savant'] },
      ],
    });
    const r = resolveTurn(st, { p1: [{ type: 'SpyMission', unitId: 'u1', cityId: 'c2', mission: 'stealGreatPerson' }] }, 109);
    expect(evts(r.events, 'GreatPersonStolen')).toHaveLength(1);
    expect(r.newState.cities['c2']!.settledGreatPersons).toEqual([]);
    // l'espionnage ne déclenche JAMAIS de guerre.
    expect(areAtWar(r.newState, 'p1', 'p2')).toBe(false);
  });

  it('caravane livrée en PAIX (inchangée) et après déclaration de guerre (D5)', () => {
    const base = () =>
      etatPaix({
        units: [
          { id: 'car', type: 'caravane', owner: 'p1', q: 3, r: 2 },
          { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 0 },
        ],
      });
    // en Paix : livraison normale (D5 — caravane intacts).
    const r1 = resolveTurn(base(), { p1: [{ type: 'Move', unitId: 'car', path: [H(5, 0)] }] }, 110);
    expect(evts(r1.events, 'CaravanDelivered')).toHaveLength(1);
    expect(r1.newState.units['car']).toBeUndefined();
    // en guerre : inchangée aussi (même code, gate absente pour les pacifiques).
    const res = applyDeclareWar(base(), 'p1', 'p2');
    if (!res.ok) throw new Error('déclaration refusée');
    const r2 = resolveTurn(res.state, { p1: [{ type: 'Move', unitId: 'car', path: [H(5, 0)] }] }, 111);
    expect(evts(r2.events, 'CaravanDelivered')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Reprise d'anciennes parties — migration v27 → v28 (Paix partout)
// ---------------------------------------------------------------------------

describe('reprise · migration v27 → v28', () => {
  it('les anciennes parties (guerre universelle R-58) reprennent en PAIX PARTOUT', () => {
    const ancien = {
      schemaVersion: 27,
      diplomacy: { war: [['p1', 'p2']] },
    } as unknown as Record<string, unknown>;
    const migre = migrateState<GameState>(ancien as never);
    expect(migre.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(28);
    expect(migre.diplomacy.war).toEqual([]);
    expect(areAtWar(migre, 'p1', 'p2')).toBe(false);
  });

  it('les nouvelles parties naissent en Paix (la carte ne pose plus la guerre universelle)', async () => {
    const { createInitialState, loadBuiltinMapSync } = await import('../src/map.js');
    const carte = loadBuiltinMapSync('pedagogique-40');
    const st = createInitialState(carte, 42);
    expect(st.diplomacy.war).toEqual([]);
  });
});
