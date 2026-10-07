/**
 * REMPLACEMENTS-BATIMENTS (signalement Erik 06/10) — R-111 complète sur les
 * 3 paires : complétion = remplacement RÉEL (Université ← Bibliothèque,
 * Cathédrale ← Temple ; Banque ← Marché déjà verrouillée en phase7e) et
 * `canSetProduction` aligné (le remplaçant est productible dès que le
 * remplacé est présent — D1/D3). Le multiplicateur du remplacé disparaît
 * avec lui (science ×4 seule, pas ×5,5).
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { conversionGains } from '../src/conversion.js';
import { canSetProduction } from '../src/techs.js';
import { makeState } from '../src/fixtures.js';
import type { GameState } from '../src/state.js';

function villeBatiments(buildings: string[]): GameState {
  return makeState({
    cities: [{
      id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2,
      workedTiles: ['1,0', '0,1'], buildings,
      production: null,
    }],
  });
}

describe('R-111 · Complétion = remplacement réel (3 paires)', () => {
  it('l’Université RETIRE la Bibliothèque (science ×4 seule — conversionGains 12 science → 48, pas 54)', () => {
    const state = villeBatiments(['bibliotheque']);
    state.players['p1']!.techsUnlocked = ['litteratie', 'universite'];
    state.cities['c1']!.production = { item: { kind: 'building', id: 'universite' }, progress: 160 };
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.buildings).toEqual(['universite']);
    expect(conversionGains(12, 'science', newState.cities['c1']!.buildings)).toEqual({ gold: 0, science: 48 });
  });

  it('la Cathédrale RETIRE le Temple', () => {
    const state = villeBatiments(['temple']);
    state.players['p1']!.techsUnlocked = ['religion'];
    state.cities['c1']!.production = { item: { kind: 'building', id: 'cathedrale' }, progress: 160 };
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.buildings).toEqual(['cathedrale']);
  });

  it('Banque ← Marché : régression verrouillée (mirroir phase7e)', () => {
    const state = villeBatiments(['marche']);
    state.players['p1']!.techsUnlocked = ['monnaie', 'banque'];
    state.cities['c1']!.production = { item: { kind: 'building', id: 'banque' }, progress: 120 };
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.buildings).toEqual(['banque']);
  });
});

describe('R-111 · canSetProduction aligné (D3) — le remplaçant suit son remplacé', () => {
  it('Université productible AVEC Bibliothèque, refusée SANS ; Cathédrale idem avec Temple', () => {
    expect(canSetProduction({ kind: 'building', id: 'universite' }, ['litteratie', 'universite'], ['bibliotheque'])).toBe(true);
    expect(canSetProduction({ kind: 'building', id: 'universite' }, ['litteratie', 'universite'], [])).toBe(false);
    expect(canSetProduction({ kind: 'building', id: 'cathedrale' }, ['religion'], ['temple'])).toBe(true);
    expect(canSetProduction({ kind: 'building', id: 'cathedrale' }, ['religion'], [])).toBe(false);
  });
});
