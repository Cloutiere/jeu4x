/**
 * DEFENSE-VILLE-A (canon Erik 12/11, diag DIAG-DEFENSE-VILLE) — tests FIRST.
 *
 * Le fait déclencheur : 6 razes barbares au banc joueur-escorte, dont 4 sur
 * des villes d'1-4 tours garnies d'un COLON SEUL, prises SANS COMBAT ; 5/13
 * chutes avec des combattants à d=1-2 jamais DANS la tuile.
 *
 * Le canon (tranche A — mécanique partagée) :
 *   L1 toute ville compte ≥ 1 COMBATTANT sur sa tuile (colon exclu — leçon
 *      p08 : un colon ne défend pas) ;
 *   L2 menace visible à d ≤ N → RAPPEL des combattantes les plus proches,
 *      avec HYSTÉRÉSIS (le rappel persiste tant que la menace n'est pas
 *      dissoute — pas de ping-pong) ;
 *   L6 fondation REFUSÉE sur tout site à d ≤ 3 d'un barbare visible
 *      (« fondé sous les griffes, ce n'est pas un pari évalué »).
 *
 * Portée de MENACE au BFS (portée de MARCHE réelle — miroir escortColon),
 * hystérésis = bande de dissolution sans état (schemaVersion intacte).
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { BARBARIAN_ID } from '../src/data.js';
import { defenseDuBot, fondationProcheBarbare, garnisonDeficit, menacesVille } from '../src/defenseVille.js';
import type { GameState } from '../src/state.js';

/** Ville jeune (1 tour) + colon seul sur la tuile — leçon p08. */
function etatVilleJeune(seed = 42): GameState {
  return makeState({
    width: 12,
    height: 12,
    players: ['jev', 'p2'],
    rngSeed: seed,
    cities: [{ id: 'c1', q: 5, r: 5, owner: 'jev', pop: 1 }],
    units: [{ id: 'col', type: 'colon', owner: 'jev', q: 5, r: 5 }],
  });
}

describe('DEFENSE-VILLE-A · table data-driven (bot.json defense)', () => {
  it('la table defense existe (défauts canon tranchés, zéro durcissement)', () => {
    const d = defenseDuBot();
    expect(d.menaceDist).toBe(3); // menace à d ≤ 3 → rappel
    expect(d.hysteresisMarge).toBe(2); // bande de dissolution (anti ping-pong)
    expect(d.fondationBarbareDist).toBe(3); // fondation refusée à d ≤ 3 d'un barbare
    expect(d.seuilGarnison).toBe(1); // ≥ 1 combattant SUR la tuile
  });
});

describe('DEFENSE-VILLE-A · garnisonDeficit (L1 — le colon ne défend pas)', () => {
  it('ville garnie d\u2019un COLON SEUL → déficit 1 (leçon p08 : capture sans combat)', () => {
    const state = etatVilleJeune();
    expect(garnisonDeficit(state, state.cities['c1']!, 'jev')).toBe(1);
  });

  it('une combattante SUR la tuile comble le déficit (seuil 1)', () => {
    const state = etatVilleJeune();
    state.units['g1'] = {
      ...state.units['col']!,
      id: 'g1',
      type: 'guerrier',
    } as never;
    expect(garnisonDeficit(state, state.cities['c1']!, 'jev')).toBe(0);
  });

  it('un combattant à d=1-2 JAMAIS dans la tuile ne comble RIEN (5/13 chutes)', () => {
    const state = etatVilleJeune();
    state.units['g1'] = { ...state.units['col']!, id: 'g1', type: 'guerrier', q: 5, r: 4 } as never;
    expect(garnisonDeficit(state, state.cities['c1']!, 'jev')).toBe(1);
  });
});

describe('DEFENSE-VILLE-A · menacesVille (L2 — portée de MARCHE réelle au BFS)', () => {
  it('barbare à d=2 d\u2019une ville → menace visible', () => {
    const state = etatVilleJeune();
    state.units['b1'] = { ...state.units['col']!, id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 3 } as never;
    const menaces = menacesVille(state, state.cities['c1']!, 'jev', defenseDuBot().menaceDist);
    expect(menaces.map((m) => m.id)).toEqual(['b1']);
  });

  it('barbare BEHIND water (inatteignable à pied) → PAS une menace (BFS, pas à vol d\u2019oiseau)', () => {
    const state = makeState({
      width: 12,
      height: 12,
      players: ['jev', 'p2'],
      terrainOverrides: { '6,3': 'ocean', '6,2': 'ocean', '5,2': 'ocean', '4,3': 'ocean', '4,4': 'ocean', '5,4': 'ocean' },
      rngSeed: 42,
      cities: [{ id: 'c1', q: 5, r: 5, owner: 'jev', pop: 1 }],
      units: [
        { id: 'col', type: 'colon', owner: 'jev', q: 5, r: 5 },
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 3 },
      ],
    });
    const menaces = menacesVille(state, state.cities['c1']!, 'jev', defenseDuBot().menaceDist);
    expect(menaces).toEqual([]);
  });

  it('civ EN GUERRE à d=2 → menace (les captures bot p2 du diagnostic)', () => {
    const state = etatVilleJeune(); // warPairs canon : jev/p2 en guerre
    state.units['n1'] = { ...state.units['col']!, id: 'n1', type: 'guerrier', owner: 'p2', q: 5, r: 3 } as never;
    const menaces = menacesVille(state, state.cities['c1']!, 'jev', defenseDuBot().menaceDist);
    expect(menaces.map((m) => m.id)).toEqual(['n1']);
  });

  it('civ en PAIX → PAS une menace (R-187)', () => {
    const state = makeState({
      width: 12,
      height: 12,
      players: ['jev', 'p2'],
      warPairs: [],
      rngSeed: 42,
      cities: [{ id: 'c1', q: 5, r: 5, owner: 'jev', pop: 1 }],
      units: [
        { id: 'col', type: 'colon', owner: 'jev', q: 5, r: 5 },
        { id: 'n1', type: 'guerrier', owner: 'p2', q: 5, r: 3 },
      ],
    });
    const menaces = menacesVille(state, state.cities['c1']!, 'jev', defenseDuBot().menaceDist);
    expect(menaces).toEqual([]);
  });
});

describe('DEFENSE-VILLE-A · fondationProcheBarbare (L6 — le gate voit les griffes)', () => {
  it('site à d ≤ 3 d\u2019un barbare visible → fondation INTERDITE', () => {
    const state = etatVilleJeune();
    state.units['b1'] = { ...state.units['col']!, id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 3 } as never;
    expect(fondationProcheBarbare(state, { q: 5, r: 5 }, defenseDuBot().fondationBarbareDist)).toBe(true);
    expect(fondationProcheBarbare(state, { q: 4, r: 4 }, defenseDuBot().fondationBarbareDist)).toBe(true);
  });

  it('site loin de tout barbare → permis (le pari évalué reste possible)', () => {
    const state = etatVilleJeune();
    state.units['b1'] = { ...state.units['col']!, id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 0, r: 0 } as never;
    expect(fondationProcheBarbare(state, { q: 8, r: 8 }, defenseDuBot().fondationBarbareDist)).toBe(false);
  });

  it('d = fondationBarbareDist exactement → interdite (borne inclusive)', () => {
    const state = etatVilleJeune();
    // (5,2) est à d=3 de (5,5).
    state.units['b1'] = { ...state.units['col']!, id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 2 } as never;
    expect(fondationProcheBarbare(state, { q: 5, r: 5 }, defenseDuBot().fondationBarbareDist)).toBe(true);
  });
});
