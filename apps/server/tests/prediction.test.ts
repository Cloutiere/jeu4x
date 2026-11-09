import { describe, expect, it } from 'vitest';
import { makeState, resolveTurn } from '@game/rules';
import type { GameState, Order, PlayerId } from '@game/rules';
import { predireBataille } from '../src/prediction.js';

/**
 * ORACLE-VERDICT · L2 (canon Erik 09/11) — PredictBattle : le serveur exécute
 * le DÉRIVÉ (simulation complète du tour planifié) et rend le verdict CERTAIN
 * VICTOIRE/DÉFAITE. Fog : cible INVISIBLE = refus propre (jamais d'info).
 * Sans Oracle : aucune révélation. Tirs R-59 : pas de révélation (D1).
 */

/** Duel canon : guerrier a1 (0,0) p1 attaque le guerrier d1 (1,0) p2. */
function duel(avecOracle: boolean): GameState {
  const st = makeState({
    units: [
      { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'd1', type: 'guerrier', owner: 'p2', q: 1, r: 0, fortified: true },
    ],
    cities: avecOracle ? [{ id: 'cd1', q: 4, r: 4, owner: 'p1', capital: true }] : [],
  });
  st.units.d1!.stabilized = true;
  if (avecOracle) st.cities.cd1!.wonders = ['oracle_de_delphes'];
  return st;
}

const ORDRES: Record<PlayerId, Order[]> = { p1: [], p2: [] };

describe('ORACLE-VERDICT · predireBataille', () => {
  it('LE canon : le verdict prédit == l\'issue RÉELLE de la résolution (40 seeds, bit à bit)', () => {
    const st = duel(true);
    const ordres: Record<PlayerId, Order[]> = {
      p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }],
      p2: [],
    };
    for (let seed = 1; seed <= 40; seed++) {
      st.rngSeed = seed;
      const verdict = predireBataille(st, ORDRES, 'p1', { attaquant: 'a1', cible: { q: 1, r: 0 } });
      expect(['victoire', 'defaite']).toContain(verdict);
      // La résolution RÉELLE tranche : l'Oracle ne se trompe jamais.
      const reel = resolveTurn(st, ordres, seed);
      const gagne = !!reel.newState.units.a1 && !reel.newState.units.d1;
      expect(verdict, `seed ${seed} : prédiction == réalité`).toBe(gagne ? 'victoire' : 'defaite');
    }
  });

  it('la prédiction n\'exige PAS l\'ordre soumis : elle teste l\'hypothèse demandée', () => {
    const st = duel(true);
    st.rngSeed = 7;
    // ORDRES vides (le joueur planifie au survol, sans avoir soumis) — la
    // simulation injecte l'attaque hypothétique demandée.
    expect(['victoire', 'defaite']).toContain(predireBataille(st, ORDRES, 'p1', { attaquant: 'a1', cible: { q: 1, r: 0 } }));
  });

  it('sans Oracle : refus propre (aucune révélation)', () => {
    const st = duel(false);
    st.rngSeed = 7;
    expect(predireBataille(st, ORDRES, 'p1', { attaquant: 'a1', cible: { q: 1, r: 0 } })).toBe('refus');
  });

  it('fog (D2/D3) : cible INVISIBLE = refus, jamais d\'info', () => {
    const st = duel(true);
    st.rngSeed = 7;
    // d2 très loin : hors de toute vision de p1.
    st.units.d2 = { ...st.units.d1!, id: 'd2', q: 30, r: 30 };
    expect(predireBataille(st, ORDRES, 'p1', { attaquant: 'a1', cible: { q: 30, r: 30 } })).toBe('refus');
  });

  it('attaquant à distance (R-59, D1) : pas de révélation', () => {
    const st = duel(true);
    st.rngSeed = 7;
    st.units.a1!.type = 'catapulte';
    expect(predireBataille(st, ORDRES, 'p1', { attaquant: 'a1', cible: { q: 1, r: 0 } })).toBe('refus');
  });

  it('cible sans unité : refus', () => {
    const st = duel(true);
    st.rngSeed = 7;
    expect(predireBataille(st, ORDRES, 'p1', { attaquant: 'a1', cible: { q: 3, r: 0 } })).toBe('refus');
  });

  it('unité d\'un AUTRE joueur : refus (l\'Oracle ne parle que des armées de son empire)', () => {
    const st = duel(true);
    st.rngSeed = 7;
    expect(predireBataille(st, ORDRES, 'p2', { attaquant: 'a1', cible: { q: 1, r: 0 } })).toBe('refus');
  });
});
