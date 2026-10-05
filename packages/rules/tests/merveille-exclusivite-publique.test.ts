/**
 * MERVEILLE-EXCLUSIVITE-PUBLIQUE (Erik 05/10, feu vert 3 volets) — le
 * scénario : Stonehenge mise en file par le joueur, déjà bâtie par un bot
 * DANS LE BROUILLARD. Trois symptômes, trois fixes :
 *  1. `WonderCompleted` devient PUBLIC (PUBLIC_EVENTS) : tout le monde voit
 *     la merveille achevée dans ses chroniques, même hors vision (canon Civ) ;
 *  2. `getFilteredState` expose `worldWondersBuilt` (liste publique dérivée de
 *     l'état COMPLET — l'UI ne propose plus une merveille déjà prise) ;
 *  3. un ordre de production refusé à la résolution émet `ProductionRefused`
 *     (raison nommée) au lieu de s'évaporer en silence.
 */
import { describe, expect, it } from 'vitest';
import { filterEventsForPlayer, getFilteredState } from '../src/fog.js';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import { tileKeyOf } from '../src/hex.js';
import type { GameEvent } from '../src/events.js';
import type { GameState, ProductionItem } from '../src/state.js';

const STONEHENGE: ProductionItem = { kind: 'wonder', id: 'stonehenge' };

/** p1 en (0,0) ; ville ennemie p2 en (9,0) — hors vision de p1. */
function stateAvecMerveilleEnnemie(wonder: string): GameState {
  const state = makeState({
    width: 20,
    height: 10,
    units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    cities: [
      { id: 'cE', owner: 'p2', q: 9, r: 0, capital: true, wonders: [wonder] },
    ],
  });
  return state;
}

describe('Volet 1 — WonderCompleted est PUBLIC (chroniques de tous, canon Civ)', () => {
  it('passe le filtre de vision même si la ville du bâtisseur est invisible', () => {
    const state = stateAvecMerveilleEnnemie('stonehenge');
    const ev: GameEvent = {
      seq: 1,
      type: 'WonderCompleted',
      cityId: 'cE',
      owner: 'p2',
      wonder: 'stonehenge',
      at: { q: 9, r: 0 },
    };
    expect(filterEventsForPlayer(state, 'p1', [ev])).toContainEqual(ev);
  });

  it('un événement ordinaire (non public) référençant la même ville reste filtré', () => {
    // Garde-fou : on n'a pas ouvert la brume en grand — seul WonderCompleted passe.
    const state = stateAvecMerveilleEnnemie('stonehenge');
    const ev = {
      seq: 2,
      type: 'RushBuy',
      cityId: 'cE',
      owner: 'p2',
      wonder: 'stonehenge',
      amount: 10,
      at: { q: 9, r: 0 },
    } as GameEvent;
    expect(filterEventsForPlayer(state, 'p1', [ev])).toHaveLength(0);
  });
});

describe('Volet 2 — worldWondersBuilt publique dans l\'état filtré', () => {
  it('getFilteredState expose les merveilles du monde ENTIER, brume comprise', () => {
    const state = stateAvecMerveilleEnnemie('stonehenge');
    const fogged = getFilteredState(state, 'p1');
    expect(fogged.cities['cE']).toBeUndefined(); // ville masquée (inchangé)
    expect(fogged.worldWondersBuilt).toEqual(['stonehenge']); // l'info, elle, passe
  });

  it('trié, dédoublonné, vide sans merveille ; jamais persisté (absent de l\'état brut)', () => {
    const state = stateAvecMerveilleEnnemie('colosse_de_rhodes');
    state.cities['cE']!.wonders = ['jardins_suspendus', 'stonehenge', 'stonehenge'];
    expect(getFilteredState(state, 'p1').worldWondersBuilt).toEqual(['jardins_suspendus', 'stonehenge']);
    const sans = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    expect(getFilteredState(sans, 'p1').worldWondersBuilt).toEqual([]);
    // état BRUT : le champ n'existe pas (dérivé, non persisté — schemaVersion inchangée)
    expect(state.worldWondersBuilt).toBeUndefined();
  });
});

describe('Volet 3 — ProductionRefused : un ordre refusé ne s\'évapore plus', () => {
  it('QueueProduction d\'une merveille déjà bâtie → file vide + événement AVEC raison', () => {
    const state = stateAvecMerveilleEnnemie('stonehenge');
    // Une ville À MOI à côté du guerrier pour produire.
    state.cities['c1'] = {
      id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1,
      foodStored: 0, workedTiles: [], buildings: [], conversion: 'gold',
      cultureCumulee: 0, wonders: [], pendingSalvage: 0,
      settledGreatPersons: [], wasCaptured: false, queue: [], production: null,
    } as GameState['cities'][string];
    const { newState, events } = resolveTurn(
      state,
      { p1: [{ type: 'QueueProduction', cityId: 'c1', item: STONEHENGE }] },
      1,
    );
    expect(newState.cities['c1']!.production).toBeNull(); // refusée (exclusivité mondiale)
    const refus = events.find((e) => e.type === 'ProductionRefused') as
      | { type: 'ProductionRefused'; cityId: string; owner: string; item: ProductionItem; reason: string }
      | undefined;
    expect(refus).toBeDefined();
    expect(refus!.cityId).toBe('c1');
    expect(refus!.owner).toBe('p1');
    expect(refus!.item).toEqual(STONEHENGE);
    expect(refus!.reason).toContain('déjà construite');
    // Et l'événement atteint le joueur (chronique) : sa ville est référencée.
    expect(filterEventsForPlayer(newState, 'p1', [refus as GameEvent])).toHaveLength(1);
  });

  it('un ordre VALIDE n\'émet pas ProductionRefused (la merveille démarre)', () => {
    const state = stateAvecMerveilleEnnemie('jardins_suspendus'); // stonehenge libre
    state.cities['c1'] = {
      id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1,
      foodStored: 0, workedTiles: [], buildings: [], conversion: 'gold',
      cultureCumulee: 0, wonders: [], pendingSalvage: 0,
      settledGreatPersons: [], wasCaptured: false, queue: [], production: null,
    } as GameState['cities'][string];
    const { newState, events } = resolveTurn(
      state,
      { p1: [{ type: 'QueueProduction', cityId: 'c1', item: STONEHENGE }] },
      1,
    );
    expect(newState.cities['c1']!.production?.item).toEqual(STONEHENGE);
    expect(events.some((e) => e.type === 'ProductionRefused')).toBe(false);
  });
});
