/**
 * SUR-OCCUPATION-POSE (décisions d'Erik du 02/10 — D1..D7)
 * Une unité produite alors que la case de ville est occupée par une unité
 * AMIE est posée en cohabitation temporaire (arrivante flaguée) au lieu
 * d'être bloquée (l'ancien plafonnement silencieux 20/20) ; la résolution
 * suivante reloge l'arrivante vers une case adjacente libre si le joueur
 * n'a pas séparé les deux.
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, cityAt } from '../src/fixtures.js';
import { neighbors } from '../src/hex.js';
import type { GameState } from '../src/state.js';

/** Colon p1 posé sur la case de ville — l'occupante du scénario d'Erik. */
function occupante(id: string, q: number, r: number) {
  return { id, type: 'guerrier', owner: 'p1' as const, q, r, hp: 3, mp: 2, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
}

/** État du scénario exact d'Erik : ville pop 7, guerrier sur la case de
 *  ville, colon au coût (20/20) dans la file de production. */
function etatErik(): GameState {
  return makeState({
    cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 7, workedTiles: [], production: { item: { kind: 'unit', id: 'colon' }, progress: 20 } }],
    units: [occupante('u0', 0, 0)],
  });
}

describe('SUR-OCCUPATION-POSE · D1 — pose sur case de ville occupée par une amie', () => {
  it('scénario d\u2019Erik : ville pop 7, guerrier sur la case, colon 20/20 → le colon sort en arrivante (plus de blocage)', () => {
    const { newState, events } = resolveTurn(etatErik(), {}, 1);
    const produced = events.find((e) => e.type === 'UnitProduced');
    expect(produced).toBeDefined();
    // La ville perd le coût pop du colon (R-112 : 2 → pop 5) et la file est consommée.
    expect(cityAt(newState, 0, 0)!.pop).toBe(5);
    expect(cityAt(newState, 0, 0)!.production).toBeNull();
    // Cohabitation temporaire sur la case de ville — la Phase E de CE tour
    // ne disperse pas la pile (exemption arrivante : le joueur peut séparer).
    const surCase = Object.values(newState.units).filter((u) => u.q === 0 && u.r === 0);
    expect(surCase.map((u) => u.id).sort()).toEqual(['u0', 'u1']);
    expect(newState.units['u1']!.arrivanteSurCase).toBe(true);
    expect(newState.units['u0']!.arrivanteSurCase).toBeUndefined();
  });

  it('D5bis : case de ville occupée par un ENNEMI → pas de pose (la ville est d\u2019ailleurs capturée en Phase C)', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 7, workedTiles: [], production: { item: { kind: 'unit', id: 'colon' }, progress: 20 } }],
      units: [{ id: 'e0', type: 'guerrier', owner: 'p2', q: 0, r: 0 }],
    });
    const { newState, events } = resolveTurn(state, {}, 1);
    expect(events.some((e) => e.type === 'UnitProduced')).toBe(false);
    // R-65 : ville sans défenseur investie → capturée (production purgée) —
    // le cas « occupée par un ennemi » ne survit jamais à la Phase C.
    expect(cityAt(newState, 0, 0)!.owner).toBe('p2');
    expect(cityAt(newState, 0, 0)!.production).toBeNull();
  });

  it('rush-buy sur case de ville occupée par une amie → complété, arrivante flaguée (même parcours D1)', () => {
    const state = etatErik();
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 0 };
    state.players['p1']!.treasury = 100;
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'RushBuy', cityId: 'c1' }] }, 1);
    expect(events.some((e) => e.type === 'RushBuy')).toBe(true);
    const surCase = Object.values(newState.units).filter((u) => u.q === 0 && u.r === 0);
    expect(surCase).toHaveLength(2);
    expect(surCase.find((u) => u.id !== 'u0')!.arrivanteSurCase).toBe(true);
  });
});

describe('SUR-OCCUPATION-POSE · D3/D4 — régularisation à la résolution suivante', () => {
  /** Tour 1 du scénario d'Erik : le colon est posé en arrivante. */
  function apresPose(): { state: GameState; colonId: string } {
    const r1 = resolveTurn(etatErik(), {}, 1);
    return { state: r1.newState, colonId: idArrivante(r1.newState) };
  }
  function idArrivante(state: GameState): string {
    const u = Object.values(state.units).find((x) => x.arrivanteSurCase);
    expect(u).toBeDefined();
    return u!.id;
  }

  it('D3 : le joueur ne bouge rien → l\u2019arrivante est relogée sur la première adjacente libre (tri q, r) avec événement', () => {
    const { state } = apresPose();
    const colonId = idArrivante(state);
    const { newState, events } = resolveTurn(state, {}, 1);
    const reg = events.find((e) => e.type === 'ArrivanteRegularisee');
    expect(reg).toBeDefined();
    // Première case adjacente libre de (0,0) dans la carte fixture (tri q, r
    // — R-81 ; la régularisation miroite la dispersion R-179-b).
    const premiereLibre = neighbors({ q: 0, r: 0 })
      .filter((h) => newState.map[`${h.q},${h.r}`])
      .sort((a, b) => a.q - b.q || a.r - b.r)[0]!;
    expect(newState.units[colonId]!.q).toBe(premiereLibre.q);
    expect(newState.units[colonId]!.r).toBe(premiereLibre.r);
    expect(newState.units[colonId]!.arrivanteSurCase).toBeUndefined();
    expect(newState.units['u0']!.q).toBe(0); // l'occupante reste
    expect(newState.units['u0']!.r).toBe(0);
  });

  it('D4 : le joueur bouge l\u2019ARRIVANTE pendant son tour → aucun relogement, flag nettoyé', () => {
    const { state } = apresPose();
    const colonId = idArrivante(state);
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: colonId, path: [{ q: 0, r: 1 }] }] }, 1);
    expect(events.some((e) => e.type === 'ArrivanteRegularisee')).toBe(false);
    expect(newState.units[colonId]).toMatchObject({ q: 0, r: 1 });
    expect(newState.units[colonId]!.arrivanteSurCase).toBeUndefined();
  });

  it('D4 : le joueur bouge l\u2019OCCUPANTE → plus de sur-occupation, flag nettoyé sans relogement', () => {
    const { state } = apresPose();
    const colonId = idArrivante(state);
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u0', path: [{ q: 0, r: 1 }] }] }, 1);
    expect(events.some((e) => e.type === 'ArrivanteRegularisee')).toBe(false);
    expect(newState.units[colonId]).toMatchObject({ q: 0, r: 0 }); // reste sur sa ville
    expect(newState.units[colonId]!.arrivanteSurCase).toBeUndefined();
  });

  it('D3 : AUCUNE case adjacente libre → la pile PERSISTE (flag conservé), relogement dès qu\u2019une case se libère', () => {
    const { state } = apresPose();
    const colonId = idArrivante(state);
    // Toutes les adjacentes EXISTANTES de (0,0) sont occupées par des amies.
    const voisins = neighbors({ q: 0, r: 0 }).filter((h) => state.map[`${h.q},${h.r}`]);
    for (const [i, h] of voisins.entries()) {
      state.units[`b${i}`] = { id: `b${i}`, type: 'guerrier', owner: 'p1', q: h.q, r: h.r, hp: 3, mp: 0, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    }
    const r2 = resolveTurn(state, {}, 1);
    expect(r2.events.some((e) => e.type === 'ArrivanteRegularisee')).toBe(false);
    expect(r2.newState.units[colonId]).toMatchObject({ q: 0, r: 0, arrivanteSurCase: true });
    // Une case se libère → la régularisation repart au tour suivant.
    delete r2.newState.units['b0'];
    const r3 = resolveTurn(r2.newState, {}, 1);
    expect(r3.events.some((e) => e.type === 'ArrivanteRegularisee')).toBe(true);
    expect(r3.newState.units[colonId]).toMatchObject({ q: voisins[0]!.q, r: voisins[0]!.r });
    expect(r3.newState.units[colonId]!.arrivanteSurCase).toBeUndefined();
  });

  it('D7 : champ sans migration — un état 27 sans le champ est accepté tel quel (schemaVersion inchangée)', () => {
    const { state } = apresPose();
    expect(state.schemaVersion).toBe(27);
    // Aucune unité préexistante ne porte le champ.
    for (const u of Object.values(state.units)) {
      if (u.id === idArrivante(state)) continue;
      expect(u.arrivanteSurCase).toBeUndefined();
    }
  });
});
