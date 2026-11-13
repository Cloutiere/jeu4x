/**
 * DEFENSE-VILLE-A (canon Erik 12/11) — tests FIRST de la politique partagée
 * (botPolicy + filtre des ordres Jev). Priorités canon :
 *   garnison > rappel > escort > exploration ;
 *   hystérésis : le rappel PERSISTE tant que la menace n'est pas dissoute ;
 *   « défendre une ville n'est pas de l'inactivité » (recadrage Erik).
 */
import { describe, expect, it } from 'vitest';
import { createRng, makeState } from '@game/rules';
import type { GameState } from '@game/rules';
import { assignerObjectifs, filtrerOrdresJevDefense, planDefenseVille, profileDuBot } from '../src/botPolicy.js';
import type { Order } from '@game/rules';

const ME = 'p1';
const ADV = 'p2';
const BAR = 'barbarien';

/** Ville jeune garnie d'un colon seul (leçon p08) + barbare qui approche. */
function etatRaze(seed = 42): GameState {
  return makeState({
    width: 14,
    height: 14,
    players: [ME, ADV],
    rngSeed: seed,
    cities: [{ id: 'c1', q: 7, r: 7, owner: ME, pop: 1 }],
    units: [
      { id: 'col', type: 'colon', owner: ME, q: 7, r: 7 },
      // u1 : première combattante = SCOUT canon (jamais un défenseur).
      { id: 'u1', type: 'guerrier', owner: ME, q: 7, r: 5 },
      // u2 : combattante de rappel (la plus proche hors scout).
      { id: 'u2', type: 'guerrier', owner: ME, q: 9, r: 9 },
      { id: 'b1', type: 'guerrier', owner: BAR, q: 7, r: 6 },
    ],
  }) as GameState;
}

describe('DEFENSE-VILLE-A · planDefenseVille (L1+L2)', () => {
  it('ville sans combattant d=0 + menace d≤3 → RAPPEL de la combattante la plus proche (rouge avant fix)', () => {
    const state = etatRaze();
    const plan = planDefenseVille(state, ME, profileDuBot());
    expect(plan.rappels.get('u2')).toBe('c1');
  });

  it('le SCOUT canon n\u2019est jamais rappelé ni maintenu (non-régression exploration)', () => {
    const state = etatRaze();
    const plan = planDefenseVille(state, ME, profileDuBot());
    expect(plan.rappels.has('u1')).toBe(false);
  });

  it('le COLON SEUL ne compte PAS comme garnison — le rappel part quand même (leçon p08)', () => {
    const state = etatRaze();
    const plan = planDefenseVille(state, ME, profileDuBot());
    expect(plan.rappels.has('col')).toBe(false); // un colon n'est jamais rappelé
    expect(plan.rappels.get('u2')).toBe('c1');
  });

  it('HYSTÉRÉSIS : la menace s\u2019éloigne d\u2019un tour (d 2→4) → le rappel PERSISTE', () => {
    const state = etatRaze();
    state.units['b1']!.q = 7;
    state.units['b1']!.r = 3; // d=4 (> menaceDist 3, ≤ bande 5)
    const plan = planDefenseVille(state, ME, profileDuBot());
    expect(plan.rappels.get('u2')).toBe('c1');
  });

  it('menace DISSOUTE → rappel levé, l\u2019unité reprend son ordre (exploration)', () => {
    const state = etatRaze();
    state.units['b1']!.q = 0;
    state.units['b1']!.r = 0; // loin, hors bande
    const plan = planDefenseVille(state, ME, profileDuBot());
    expect(plan.rappels.size).toBe(0);
    const objectifs = assignerObjectifs(state, ME, profileDuBot());
    // Première combattante hors défense → patrouille canon (BOT-EXPLORATION D1).
    expect(objectifs.get('u1')?.kind).toBe('patrouiller');
  });

  it('la combattante déjà SUR la tuile d\u2019une ville menacée est MAINTENUE (ne part pas explorer)', () => {
    const state = etatRaze();
    state.units['u2']!.q = 7;
    state.units['u2']!.r = 7; // sur la tuile : elle EST la garnison
    const plan = planDefenseVille(state, ME, profileDuBot());
    expect(plan.maintiens.get('u2')).toBe('c1');
    const objectifs = assignerObjectifs(state, ME, profileDuBot());
    expect(objectifs.get('u2')?.kind).toBe('garnison');
    expect(objectifs.get('u2')?.cityId).toBe('c1');
  });

  it('ville DÉFICITAIRE + combattante à d=2 → objectif garnison vers LA tuile (l\u2019unité entre, p08)', () => {
    const state = etatRaze();
    const objectifs = assignerObjectifs(state, ME, profileDuBot());
    expect(objectifs.get('u2')?.kind).toBe('garnison');
    expect(objectifs.get('u2')?.cityId).toBe('c1');
  });

  it('PLUSIEURS villes menacées → priorité aux PLUS MENACÉES (plus de menaces d\u2019abord)', () => {
    const state = makeState({
      width: 20,
      height: 20,
      players: [ME, ADV],
      rngSeed: 42,
      cities: [
        { id: 'c1', q: 5, r: 5, owner: ME, pop: 1 },
        { id: 'c2', q: 12, r: 5, owner: ME, pop: 1 },
      ],
      units: [
        { id: 'col1', type: 'colon', owner: ME, q: 5, r: 5 },
        { id: 'col2', type: 'colon', owner: ME, q: 12, r: 5 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 8, r: 5 }, // scout canon
        { id: 'u2', type: 'guerrier', owner: ME, q: 8, r: 6 }, // la seule rappelable
        { id: 'b1', type: 'guerrier', owner: BAR, q: 6, r: 5 },
        { id: 'b2', type: 'guerrier', owner: BAR, q: 6, r: 6 },
        { id: 'b3', type: 'guerrier', owner: BAR, q: 12, r: 4 },
      ],
    }) as GameState;
    const plan = planDefenseVille(state, ME, profileDuBot());
    // c1 a 2 menaces, c2 en a 1 — la seule combattante rappelable va à c1.
    expect(plan.rappels.get('u2')).toBe('c1');
  });

  it('aucune menace → plan vide (zéro interférence avec exploration/escorte)', () => {
    const state = makeState({
      width: 14,
      height: 14,
      players: [ME, ADV],
      warPairs: [],
      rngSeed: 42,
      cities: [{ id: 'c1', q: 7, r: 7, owner: ME, pop: 1 }],
      units: [
        { id: 'col', type: 'colon', owner: ME, q: 7, r: 7 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 7, r: 5 },
        { id: 'p2a', type: 'guerrier', owner: ADV, q: 0, r: 0 },
      ],
    }) as GameState;
    const plan = planDefenseVille(state, ME, profileDuBot());
    expect(plan.rappels.size).toBe(0);
    expect(plan.maintiens.size).toBe(0);
  });

  it('déterminisme intégral (30 seeds) : même état → même plan', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = etatRaze(seed);
      const a = planDefenseVille(state, ME, profileDuBot());
      const b = planDefenseVille(state, ME, profileDuBot());
      expect([...a.rappels.entries()]).toEqual([...b.rappels.entries()]);
      expect([...a.maintiens.entries()]).toEqual([...b.maintiens.entries()]);
    }
  });
});

describe('DEFENSE-VILLE-A · filtrerOrdresJevDefense (branchement identique, zéro question LLM)', () => {
  it('le Move/MultiStep/Attack d\u2019une unité RAPPELÉE est retiré (le plan bot défend)', () => {
    const ordres: Order[] = [
      { type: 'Move', unitId: 'u1', path: [{ q: 9, r: 9 }] },
      { type: 'MultiStep', unitId: 'u1', path: [{ q: 9, r: 9 }] },
      { type: 'Attack', unitId: 'u1', target: { q: 8, r: 8 } },
      { type: 'Fortify', unitId: 'u1' },
      { type: 'Move', unitId: 'u2', path: [{ q: 3, r: 3 }] },
    ];
    const filtrés = filtrerOrdresJevDefense(ordres, new Set(['u1']));
    // Move/MultiStep/Attack de u1 retirés ; Fortify conservé ; u2 intact.
    expect(filtrés).toEqual([{ type: 'Fortify', unitId: 'u1' }, { type: 'Move', unitId: 'u2', path: [{ q: 3, r: 3 }] }]);
  });
});

describe('DEFENSE-VILLE-A2 · marqueur d\u2019état de rappel (memo de tour — canon option (c))', () => {
  it('DÉCLENCHEMENT canon : menace à d ≤ menaceDist (3) → rappel + marqueur POSÉ', () => {
    const state = etatRaze();
    const memo: Record<string, string> = {};
    const plan = planDefenseVille(state, ME, profileDuBot(), memo);
    expect(plan.rappels.get('u2')).toBe('c1');
    expect(memo['u2']).toBe('c1');
  });

  it('menace qui n\u2019a JAMAIS été à ≤ 3 (apparaît à d=4, bande seulement) → PAS de nouveau rappel (trigger canon, rouge avant fix)', () => {
    const state = etatRaze();
    state.units['b1']!.q = 7;
    state.units['b1']!.r = 3; // d=4 : bande seulement
    const memo: Record<string, string> = {};
    const plan = planDefenseVille(state, ME, profileDuBot(), memo);
    expect(plan.rappels.size).toBe(0);
    expect(Object.keys(memo).length).toBe(0);
  });

  it('HYSTÉRÉSIS à état : menace à d=4 MAIS marqueur actif → le rappel PERSISTE (tenu)', () => {
    const state = etatRaze();
    state.units['b1']!.q = 7;
    state.units['b1']!.r = 3; // d=4 : hors trigger, dans la bande
    const memo: Record<string, string> = { u2: 'c1' }; // rappel du tour précédent
    const plan = planDefenseVille(state, ME, profileDuBot(), memo);
    expect(plan.rappels.get('u2')).toBe('c1');
    expect(memo['u2']).toBe('c1'); // toujours actif
  });

  it('DISSOLUTION : menace levée → marqueur CONSOMMÉ (supprimé), l\u2019unité reprend son ordre', () => {
    const state = etatRaze();
    state.units['b1']!.q = 0;
    state.units['b1']!.r = 0;
    const memo: Record<string, string> = { u2: 'c1', u1: 'c1' };
    const plan = planDefenseVille(state, ME, profileDuBot(), memo);
    expect(plan.rappels.size).toBe(0);
    expect(plan.maintiens.size).toBe(0);
    expect(memo).toEqual({}); // consommé
  });

  it('le MAINTIEN pose aussi le marqueur ; les unités mortes sont purgées du memo', () => {
    const state = etatRaze();
    state.units['u2']!.q = 7;
    state.units['u2']!.r = 7; // sur la tuile : maintien
    const memo: Record<string, string> = { u2: 'c1', fantome: 'c1' }; // fantôme = unité morte
    const plan = planDefenseVille(state, ME, profileDuBot(), memo);
    expect(plan.maintiens.get('u2')).toBe('c1');
    expect(memo['u2']).toBe('c1');
    expect(memo['fantome']).toBeUndefined(); // purgé
  });

  it('sans memo (bots) : comportement A2 bit-à-bit (bande = déclenchement)', () => {
    const state = etatRaze();
    state.units['b1']!.q = 7;
    state.units['b1']!.r = 3; // d=4 : bande seulement
    const plan = planDefenseVille(state, ME, profileDuBot());
    expect(plan.rappels.get('u2')).toBe('c1'); // statu quo 2f95e59
  });
});
