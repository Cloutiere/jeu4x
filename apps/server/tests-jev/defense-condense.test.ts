/**
 * DEFENSE-VILLE-C (canon Erik 13/11) — tests FIRST : L4 condensé localisé
 * (menaces avec SA ville, garnison `def` par ville) + L5 question défense
 * dédiée (énumération fermée, repli mécanique). Le diagnostic a prouvé que
 * la menace était VISIBLE mais non localisée — Jev ne peut pas choisir ce
 * qu'on ne lui montre pas.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeState } from '@game/rules';
import { condenseJoueur, construireQuestionsJoueur, traduireDefense } from '../src/jev/joueur.js';
import { condenserEtat } from '../src/jev/condense.js';
import type { GameState } from '@game/rules';

const ME = 'p1';
const ADV = 'p2';
const BAR = 'barbarien';

/** Ville jeune (7,7) + barbare qui approche (7,6) + combattante lointaine. */
function etatMenace(seed = 42): GameState {
  return makeState({
    width: 16,
    height: 16,
    players: [ME, ADV],
    rngSeed: seed,
    cities: [{ id: 'c1', q: 7, r: 7, owner: ME, pop: 1 }],
    units: [
      { id: 'col', type: 'colon', owner: ME, q: 7, r: 7 },
      { id: 'u1', type: 'guerrier', owner: ME, q: 7, r: 5 }, // combattante à d=2 de la ville
      { id: 'b1', type: 'guerrier', owner: BAR, q: 7, r: 6 }, // menace à d=1
    ],
  }) as GameState;
}

describe('DEFENSE-VILLE-C · L4 — condensé localisé (menaces avec SA ville)', () => {
  it('chaque menace porte villeId + distanceVille À CETTE ville (rouge avant fix)', () => {
    const state = etatMenace();
    const c = condenseJoueur(state, ME) as any;
    expect(c.menaces.length).toBeGreaterThan(0);
    for (const m of c.menaces) {
      expect(m.villeId).toBe('c1');
      expect(m.distanceVille).toBe(1);
    }
  });

  it('deux villes : chaque menace est localisée sur SA ville (BFS portée réelle)', () => {
    const state = makeState({
      width: 24,
      height: 24,
      players: [ME, ADV],
      rngSeed: 42,
      cities: [
        { id: 'c1', q: 5, r: 5, owner: ME, pop: 1 },
        { id: 'c2', q: 16, r: 5, owner: ME, pop: 1 },
      ],
      units: [
        { id: 'b1', type: 'guerrier', owner: BAR, q: 5, r: 3 }, // menace c1
        { id: 'b2', type: 'guerrier', owner: BAR, q: 16, r: 4 }, // menace c2
      ],
    }) as GameState;
    const c = condenseJoueur(state, ME) as any;
    const parVille = Object.fromEntries(c.menaces.map((m: any) => [m.villeId, m.distanceVille]));
    expect(parVille['c1']).toBe(2);
    expect(parVille['c2']).toBe(1);
  });

  it('empire.villes[].def porte la garnison : colon SEUL → nbDef 0, déficit 1 (leçon p08)', () => {
    const state = etatMenace();
    const c = condenseJoueur(state, ME) as any;
    const v = c.empire.villes.find((x: any) => x.id === 'c1');
    expect(v.def).toEqual({ nbDef: 0, force: 0, deficit: 1 });
  });

  it('un combattant SUR la tuile → nbDef 1, déficit 0 ; un combattant à d=2 ne compte PAS', () => {
    const state = etatMenace();
    state.units['g1'] = { ...state.units['col']!, id: 'g1', type: 'guerrier' } as never;
    let c = condenseJoueur(state, ME) as any;
    let v = c.empire.villes.find((x: any) => x.id === 'c1');
    expect(v.def).toEqual({ nbDef: 1, force: 1, deficit: 0 });
    delete (state.units as any)['g1'];
    // u1 à (7,5) — à d=2 de la tuile, PAS dans la tuile.
    c = condenseJoueur(state, ME) as any;
    v = c.empire.villes.find((x: any) => x.id === 'c1');
    expect(v.def.nbDef).toBe(0);
  });

  it('déterminisme 30 seeds : même état → même condensé localisé', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const a = condenseJoueur(etatMenace(seed), ME) as any;
      const b = condenseJoueur(etatMenace(seed), ME) as any;
      expect(a.menaces).toEqual(b.menaces);
      expect(a.empire.villes.map((v: any) => v.def)).toEqual(b.empire.villes.map((v: any) => v.def));
    }
  });
});

const CONFIG = JSON.parse(readFileSync(new URL('../src/jev/questions-joueur.json', import.meta.url), 'utf8'));

describe('DEFENSE-VILLE-C · L5 — question défense dédiée', () => {
  it('menace à d ≤ 2 → question defense POSÉE avec énumération fermée', () => {
    const state = etatMenace();
    const condense = condenseJoueur(state, ME) as any;
    const { questions, meta } = construireQuestionsJoueur(CONFIG, condense, state, ME, {}) as any;
    expect(questions.defense).toBeDefined();
    expect(Object.keys(questions.defense.criteria).sort()).toEqual(
      ['abandonner', 'produireGuerrier', 'rappeler', 'tenir'].sort(),
    );
    expect(meta.defense.ville.id).toBe('c1');
  });

  it('aucune menace → question defense NON posée', () => {
    const state = makeState({
      width: 16,
      height: 16,
      players: [ME, ADV],
      rngSeed: 42,
      cities: [{ id: 'c1', q: 7, r: 7, owner: ME, pop: 1 }],
      units: [
        { id: 'col', type: 'colon', owner: ME, q: 7, r: 7 },
        { id: 'p2a', type: 'guerrier', owner: ADV, q: 0, r: 0 },
      ],
    }) as GameState;
    const condense = condenseJoueur(state, ME) as any;
    const { questions } = construireQuestionsJoueur(CONFIG, condense, state, ME, {}) as any;
    expect(questions.defense).toBeUndefined();
  });
});

describe('DEFENSE-VILLE-C · L5 — traduction des réponses (auditées, repli mécanique)', () => {
  const meta = { defense: { ville: { id: 'c1', q: 7, r: 7 } } };

  it('réponse HORS énumération → repli mécanique (zéro ordre)', () => {
    const res = traduireDefense({ choice: 'detruireTout', confidence: 0.9 }, meta.defense, etatMenace(), ME, new Set());
    expect(res.ordres).toEqual([]);
    expect(res.attentes).toEqual([]);
  });

  it('« rappeler » : Move des combattantes disponibles vers LA ville — JAMAIS une unité du plan défensif (exclues)', () => {
    const state = etatMenace();
    state.units['u2'] = { ...state.units['col']!, id: 'u2', type: 'guerrier', q: 9, r: 9 } as never;
    const res = traduireDefense({ choice: 'rappeler', confidence: 0.8 }, meta.defense, state, ME, new Set(['u1']));
    expect(res.ordres.length).toBeGreaterThan(0);
    for (const o of res.ordres) {
      expect(o.type).toBe('Move');
      expect(o.unitId).not.toBe('u1'); // exclue (plan défensif) — se compose avec L1
    }
  });

  it('« produireGuerrier » : SetProduction guerrier DANS la ville menacée', () => {
    const res = traduireDefense({ choice: 'produireGuerrier', confidence: 0.8 }, meta.defense, etatMenace(), ME, new Set());
    expect(res.ordres).toEqual([
      { type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } },
    ]);
  });

  it('« tenir » / « abandonner » : zéro ordre (audité au journal)', () => {
    for (const choice of ['tenir', 'abandonner']) {
      const res = traduireDefense({ choice, confidence: 0.7 }, meta.defense, etatMenace(), ME, new Set());
      expect(res.ordres).toEqual([]);
    }
  });

  it('confiance sous le seuil → repli mécanique (zéro ordre)', () => {
    const res = traduireDefense({ choice: 'rappeler', confidence: 0.1 }, meta.defense, etatMenace(), ME, new Set());
    expect(res.ordres).toEqual([]);
  });
});
