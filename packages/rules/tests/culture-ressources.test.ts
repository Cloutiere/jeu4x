/**
 * Tests CULTURE-RESSOURCES — canal culture des ressources travaillées
 * (décisions d'Erik du 02/10, HANDOFF-CULTURE-RESSOURCES.md) :
 * Encens +2, Soie +3 culture/tour versées au cumul de la ville (R-114)
 * SEULEMENT si la tuile est TRAVAILLÉE et la ressource ACCESSIBLE (R-93).
 * Générique data-driven (`culture > 0`), zéro changement T-27/jalons/GP.
 *
 * Baseline culture d'une capitale pop 1 (Palais R-113 : 1 × min(1,5) = 1) :
 * `cultureCumulee` = 1 par tour sans ressource culturelle travaillée.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import { resourceAccessible } from '../src/resources.js';
import { RESOURCES } from '../src/data.js';

/** Capitale p1 (0,0) pop 1 ; la case (1,0) porte la ressource donnée. */
function stateAvec(offset: { terrain: import('../src/types.js').TerrainId; resource: import('../src/types.js').TileResource | null }) {
  const state = makeState({
    cities: [{ owner: 'p1', q: 0, r: 0, capital: true, pop: 1, buildings: ['palais'], workedTiles: ['1,0'] }],
  });
  state.map['1,0'] = offset;
  return state;
}

const BASELINE = 1; // Palais seul (R-113 : 1 × min(pop 1, 5))

describe('CULTURE-RESSOURCES · canal culture des ressources travaillées (02/10)', () => {
  it('D4-a · Encens TRAVAILLÉ et accessible (Rites funéraires) = +2 culture/tour', () => {
    const state = stateAvec({ terrain: 'prairie', resource: 'encens' });
    state.players['p1']!.techsUnlocked = ['rites_funeraires'];
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.cities['c1']!.cultureCumulee).toBe(BASELINE + 2);
  });

  it('D4-b · Encens NON travaillé = rien (baseline seule)', () => {
    const state = stateAvec({ terrain: 'prairie', resource: 'encens' });
    state.players['p1']!.techsUnlocked = ['rites_funeraires'];
    state.cities['c1']!.workedTiles = ['0,1']; // prairie sans ressource
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.cities['c1']!.cultureCumulee).toBe(BASELINE);
  });

  it('D4-c · Soie CACHÉE avant Lettres (littératie) = rien ; révélée + travaillée = +3', () => {
    const state = stateAvec({ terrain: 'plaine', resource: 'soie' });
    expect(resolveTurn(state, {}, 1).newState.cities['c1']!.cultureCumulee).toBe(BASELINE);
    const reveal = structuredClone(state);
    reveal.players['p1']!.techsUnlocked = ['litteratie'];
    expect(resolveTurn(reveal, {}, 1).newState.cities['c1']!.cultureCumulee).toBe(BASELINE + 3);
  });

  it('D4-d · Encens avant Rites funéraires = rien (accessibilité R-93, même canal que les rendements)', () => {
    const state = stateAvec({ terrain: 'prairie', resource: 'encens' }); // sans tech
    expect(resolveTurn(state, {}, 1).newState.cities['c1']!.cultureCumulee).toBe(BASELINE);
  });

  it('D4-e · Anarchie = 0 (R-122 gèle le canal culture entier)', () => {
    const state = stateAvec({ terrain: 'prairie', resource: 'encens' });
    state.players['p1']!.techsUnlocked = ['rites_funeraires'];
    state.players['p1']!.government = 'democratie';
    state.players['p1']!.anarchyUntil = state.turn + 1;
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.cities['c1']!.cultureCumulee).toBe(0);
  });

  it('D4-f · Ville capturée qui travaille : le bonus va au NOUVEAU propriétaire (techs du propriétaire lu)', () => {
    // Simulation du transfert effectif : la ville travaille encore l'encens,
    // le moteur lit les techs du PROPRIÉTAIRE ACTUEL (p2, sans Rites
    // funéraires → rien ; avec → +2). « Celui qui travaille reçoit. »
    const state = stateAvec({ terrain: 'prairie', resource: 'encens' });
    state.cities['c1']!.owner = 'p2'; // capture effectuerait ce transfert
    expect(resolveTurn(state, {}, 1).newState.cities['c1']!.cultureCumulee).toBe(BASELINE);
    const withTech = structuredClone(state);
    withTech.players['p2']!.techsUnlocked = ['rites_funeraires'];
    expect(resolveTurn(withTech, {}, 1).newState.cities['c1']!.cultureCumulee).toBe(BASELINE + 2);
  });

  it('D4-g · Invariance : villes SANS ressource culturelle travaillée — culture inchangée', () => {
    const state = stateAvec({ terrain: 'prairie', resource: null });
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.cities['c1']!.cultureCumulee).toBe(BASELINE);
  });

  it('D1 · Générique : la canal lit `culture > 0` (encens 2, soie 3 en données — inchangées)', () => {
    expect(RESOURCES['encens']!.culture).toBe(2);
    expect(RESOURCES['soie']!.culture).toBe(3);
    expect(resourceAccessible(RESOURCES['encens']!, ['rites_funeraires'])).toBe(true);
    expect(resourceAccessible(RESOURCES['soie']!, ['litteratie'])).toBe(true);
  });
});
