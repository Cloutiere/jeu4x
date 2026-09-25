/**
 * CARTE-MULTI (2-5 joueurs) — élimination, guerre universelle, migrations.
 *
 * Décisions tranchées (handoff D1-D6, défauts pilot — vetoables) :
 *  - D6 généralisé : un joueur dont la capitale ORIGINALE est capturée ou
 *    rasée est ÉLIMINÉ ; à 2 joueurs la première élimination clôt la partie
 *    (flux d'événements 1v1 IDENTIQUE — Victory seul, sans PlayerDefeated) ;
 *    à 3+ la partie continue jusqu'au DERNIER joueur en lice ;
 *  - R-58 : guerre universelle — TOUTES les paires de spawns (à 2 joueurs :
 *    la paire unique historique) ;
 *  - forfait T-06 / abandon : élimination du fautif (à 2 : fin de partie
 *    identique) ;
 *  - un joueur ÉLIMINÉ ne peut plus GAGNER (science/culture/économique) ;
 *  - migration v25 → v26 : champ additif `defeated: false`, idempotent.
 */
import { describe, expect, it } from 'vitest';
import { checkForfeit } from '../src/forfeit.js';
import { resolveTurn } from '../src/turn.js';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrateState, areAtWar } from '../src/state.js';
import type { GameState } from '../src/state.js';
import { makeState } from '../src/fixtures.js';
import type { GameEvent } from '../src/events.js';
import { FORFEIT_MISSED_TURNS } from '../src/constants.js';

const H = (q: number, r: number) => ({ q, r });

/** État 3 joueurs (fixtures — prairie partout, entités posées à la main). */
function makeState3(opts?: { units?: Array<{ id: string; owner: string; type: string; q: number; r: number; hp?: number }>; cities?: Array<{ id: string; owner: string; q: number; r: number; capital?: boolean; pop?: number }> }): GameState {
  return makeState({
    players: ['p1', 'p2', 'p3'],
    ...(opts?.units ? { units: opts.units } : {}),
    ...(opts?.cities ? { cities: opts.cities } : {}),
  });
}

describe('CARTE-MULTI · Migration v25 → v26', () => {
  it('CURRENT_SCHEMA_VERSION vaut 26 et MIGRATIONS[26] existe', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(26);
    expect(MIGRATIONS[26]).toBeDefined();
  });

  it('champ additif defeated:false sur CHAQUE joueur, idempotent', () => {
    const v25 = makeState({ players: ['p1', 'p2'] });
    const raw = { ...structuredClone(v25), schemaVersion: 25 } as unknown as Record<string, unknown>;
    const out = migrateState<GameState>(raw);
    expect(out.schemaVersion).toBe(26);
    expect(out.players['p1']!.defeated).toBe(false);
    expect(out.players['p2']!.defeated).toBe(false);
    const twice = migrateState(structuredClone(out) as unknown as Record<string, unknown>);
    expect(twice).toEqual(out);
  });
});

describe('CARTE-MULTI · Guerre universelle (R-58)', () => {
  it('à 3 joueurs : TOUTES les paires sont en guerre (FFA — pas de diplomatie)', () => {
    const st = makeState3();
    expect(st.diplomacy.war.sort()).toEqual([
      ['p1', 'p2'],
      ['p1', 'p3'],
      ['p2', 'p3'],
    ]);
    expect(areAtWar(st, 'p1', 'p3')).toBe(true);
    expect(areAtWar(st, 'p2', 'p3')).toBe(true);
  });

  it('à 2 joueurs : la paire unique historique (inchangée)', () => {
    const st = makeState();
    expect(st.diplomacy.war).toEqual([['p1', 'p2']]);
  });
});

describe('CARTE-MULTI · Élimination par capture de capitale', () => {
  it('à 3 joueurs : capturer la capitale de p3 ÉLIMINE p3 (PlayerDefeated public) et la partie CONTINUE', () => {
    // Déterministe : la capitale est SANS défenseur — l'entrée capture (R-65).
    const st = makeState3({
      units: [{ id: 'a', owner: 'p1', type: 'guerrier', q: 4, r: 5 }],
      cities: [
        { id: 'cap1', owner: 'p1', q: 0, r: 1, capital: true, pop: 1 },
        { id: 'cap2', owner: 'p2', q: 2, r: 0, capital: true, pop: 1 },
        { id: 'cap3', owner: 'p3', q: 4, r: 6, capital: true, pop: 1 },
      ],
    });
    const t2 = resolveTurn(st, { p1: [{ type: 'Move', unitId: 'a', path: [H(4, 6)] }] }, 1);
    const events = t2.events;
    const defaite = events.find((e): e is Extract<GameEvent, { type: 'PlayerDefeated' }> => e.type === 'PlayerDefeated');
    expect(defaite).toBeDefined();
    expect(defaite!.player).toBe('p3');
    expect(defaite!.byPlayer).toBe('p1');
    expect(defaite!.cause).toBe('capitalCaptured');
    expect(t2!.newState.players['p3']!.defeated).toBe(true);
    expect(t2!.newState.winner).toBeNull(); // la partie continue (p1 vs p2)
    expect(events.some((e) => e.type === 'Victory')).toBe(false);
  });

  it('à 2 joueurs : le flux 1v1 est IDENTIQUE — Victory seul (aucun PlayerDefeated)', () => {
    const st = makeState({
      units: [{ id: 'a', owner: 'p1', type: 'guerrier', q: 4, r: 5 }],
      cities: [
        { id: 'cap1', owner: 'p1', q: 0, r: 1, capital: true, pop: 1 },
        { id: 'cap2', owner: 'p2', q: 4, r: 6, capital: true, pop: 1 },
      ],
    });
    // capitale SANS défenseur : entrer → capture décisive (R-65)
    const t2 = resolveTurn(st, { p1: [{ type: 'Move', unitId: 'a', path: [H(4, 6)] }] }, 1);
    expect(t2.newState.cities['cap2']!.owner).toBe('p1');
    expect(t2.newState.players['p2']!.defeated).toBe(true); // marqué (état)
    expect(t2.newState.winner).toBe('p1');
    const types = t2.events.map((e) => e.type);
    expect(types).toContain('CityCaptured');
    expect(types).toContain('Victory');
    expect(types).not.toContain('PlayerDefeated'); // décisive : PAS d'événement doublon
    const victory = t2.events.find((e): e is Extract<GameEvent, { type: 'Victory' }> => e.type === 'Victory')!;
    expect(victory).toMatchObject({ winner: 'p1', reason: 'domination' });
  });

  it('à 3 joueurs : la dernière élimination est décisive — Victory domination SANS PlayerDefeated', () => {
    const st = makeState3({
      units: [{ id: 'a', owner: 'p1', type: 'guerrier', q: 4, r: 5 }],
      cities: [
        { id: 'cap1', owner: 'p1', q: 0, r: 1, capital: true, pop: 1 },
        { id: 'cap2', owner: 'p2', q: 4, r: 6, capital: true, pop: 1 },
        { id: 'cap3', owner: 'p3', q: 2, r: 0, capital: true, pop: 1 },
      ],
    });
    st.players['p3']!.defeated = true; // p3 déjà éliminé (tour précédent)
    const t2 = resolveTurn(st, { p1: [{ type: 'Move', unitId: 'a', path: [H(4, 6)] }] }, 1);
    expect(t2.newState.winner).toBe('p1');
    const victory = t2.events.find((e): e is Extract<GameEvent, { type: 'Victory' }> => e.type === 'Victory')!;
    expect(victory.reason).toBe('domination');
    expect(t2.events.some((e) => e.type === 'PlayerDefeated')).toBe(false);
  });

  it("la RECAPTURE d'une capitale déjà volée n'élimine personne (wasCaptured)", () => {
    const st = makeState3({
      units: [
        { id: 'a', owner: 'p1', type: 'guerrier', q: 4, r: 5 },
        // p2 garde une unité : la RECAPTURE seule ne doit rien éliminer
        // (sans elle, la perte de sa dernière ville annihilerait p2).
        { id: 'surv', owner: 'p2', type: 'guerrier', q: 1, r: 6 },
      ],
      cities: [
        { id: 'cap1', owner: 'p1', q: 0, r: 1, capital: true, pop: 1 },
        { id: 'cap2', owner: 'p2', q: 5, r: 5, capital: true, pop: 1 },
        { id: 'cap3', owner: 'p3', q: 2, r: 0, capital: true, pop: 1 },
      ],
    });
    // cap2 : capitale ORIGINALE de p3, volée par p2 (wasCaptured) — p3 déjà éliminé.
    st.cities['cap2']!.wasCaptured = true;
    st.players['p3']!.defeated = true;
    const t = resolveTurn(st, { p1: [{ type: 'Move', unitId: 'a', path: [H(5, 5)] }] }, 1);
    expect(t.newState.cities['cap2']!.owner).toBe('p1');
    expect(t.events.some((e) => e.type === 'PlayerDefeated')).toBe(false);
    expect(t.newState.winner).toBeNull(); // p1 vs p2 continuent
  });
});

describe('CARTE-MULTI · Élimination par rasement barbare (R-97)', () => {
  it('à 3 joueurs : capitale rasée par les barbares → joueur éliminé, partie continue', () => {
    // Scenario : capitale de p2 sans défenseur + guerrier barbare adjacent
    // qui entre (les barbares raseint — R-97). Les barbares sont injectés
    // par resolveTurn via les villages : on place directement une unité
    // barbare — le moteur accepte `barbarien` comme owner d'exécution.
    const st = makeState3({
      units: [{ id: 'bar', owner: 'barbarien', type: 'guerrier', q: 5, r: 5 }],
      cities: [
        { id: 'cap1', owner: 'p1', q: 0, r: 1, capital: true, pop: 1 },
        { id: 'cap2', owner: 'p2', q: 5, r: 5, capital: true, pop: 1 },
        { id: 'cap3', owner: 'p3', q: 2, r: 0, capital: true, pop: 1 },
      ],
    });
    const t = resolveTurn(st, {}, 1);
    expect(t.newState.cities['cap2']).toBeUndefined(); // rasée
    expect(t.newState.players['p2']!.defeated).toBe(true);
    expect(t.newState.winner).toBeNull(); // p1 vs p3 continuent
    const defaite = t.events.find((e): e is Extract<GameEvent, { type: 'PlayerDefeated' }> => e.type === 'PlayerDefeated');
    expect(defaite).toMatchObject({ player: 'p2', byPlayer: null, cause: 'capitalRazed' });
  });
});

describe('CARTE-MULTI · Forfait T-06 à N joueurs', () => {
  it('à 3 joueurs : le forfait ÉLIMINE (PlayerDefeated) et la partie continue', () => {
    const st = makeState3();
    st.players['p3']!.missedTurns = FORFEIT_MISSED_TURNS;
    const { state: out, events } = checkForfeit(st);
    expect(out.winner).toBeNull();
    expect(out.players['p3']!.defeated).toBe(true);
    expect(events).toEqual([{ seq: 1, type: 'PlayerDefeated', player: 'p3', byPlayer: null, cause: 'forfeit' }]);
  });

  it('à 3 joueurs : double forfait → dernier en lice gagne (Victory seul, déterministe R-81)', () => {
    const st = makeState3();
    st.players['p2']!.missedTurns = FORFEIT_MISSED_TURNS;
    st.players['p3']!.missedTurns = FORFEIT_MISSED_TURNS;
    st.lastEventSeq = 7;
    const { state: out, events } = checkForfeit(st);
    expect(out.winner).toBe('p1');
    // p2 forfaitise d'abord (éliminé, partie continue), p3 ensuite :
    // l'élimination de p3 est DÉCISIVE → Victory seul, sans doublon.
    expect(events).toEqual([
      { seq: 8, type: 'PlayerDefeated', player: 'p2', byPlayer: null, cause: 'forfeit' },
      { seq: 9, type: 'Victory', winner: 'p1', reason: 'forfeit' },
    ]);
  });

  it('à 2 joueurs : flux IDENTIQUE (Victory forfait pour l\'adversaire, sans PlayerDefeated)', () => {
    const st = makeState();
    st.players['p1']!.missedTurns = FORFEIT_MISSED_TURNS;
    const { state: out, events } = checkForfeit(st);
    expect(events).toEqual([{ seq: 1, type: 'Victory', winner: 'p2', reason: 'forfeit' }]);
    expect(out.winner).toBe('p2');
  });

  it('un joueur déjà éliminé ne forfait plus (déjà sorti)', () => {
    const st = makeState3();
    st.players['p2']!.defeated = true;
    st.players['p2']!.missedTurns = FORFEIT_MISSED_TURNS;
    const { state: out, events } = checkForfeit(st);
    expect(events).toHaveLength(0);
    expect(out.winner).toBeNull();
  });
});

describe('CARTE-MULTI · Un joueur éliminé ne gagne plus', () => {
  it('science : les 4 composants d\'un ÉLIMINÉ ne déclenchent rien ; ceux d\'un joueur en lice si', () => {
    const composants = ['vaisseau_habitation', 'vaisseau_support_vie', 'vaisseau_carburant', 'vaisseau_propulsion'];
    const st = makeState3({
      cities: [
        { id: 'cap1', owner: 'p1', q: 0, r: 1, capital: true, pop: 1 },
        { id: 'cap2', owner: 'p2', q: 10, r: 2, capital: true, pop: 1 },
        { id: 'cap3', owner: 'p3', q: 10, r: 6, capital: true, pop: 1 },
      ],
    });
    st.players['p3']!.defeated = true;
    st.cities['cap3']!.buildings = [...composants];
    // p1 résout un tour banal : la victoire de p3 (éliminé) ne doit pas survenir
    const t = resolveTurn(st, {}, 1);
    expect(t.newState.winner).toBeNull();
    // p2 (en lice) possède les 4 composants → victoire science au même tour
    st.cities['cap2']!.buildings = [...composants];
    const t2 = resolveTurn(st, {}, 1);
    expect(t2.newState.winner).toBe('p2');
  });
});
