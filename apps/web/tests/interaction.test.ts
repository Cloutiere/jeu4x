/**
 * Tests de la logique de clic pure (L3) : sélection, attaque adjacente,
 * construction de chemin — le client n'invente rien hors de l'état filtré.
 * États de test : fixtures de @game/rules (source unique).
 */
import { describe, expect, it } from 'vitest';
import { makeState, tileKey } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';
import { clickAction, ordersEditable, passableKnown, pathTo, rightClickAction } from '../src/lib/render/interaction.js';

function viewOf(state: GameState, over: Partial<GameView> = {}): GameView {
  return {
    code: 'ABC123',
    playerId: 'dev:alice',
    players: [
      { id: 'dev:alice', name: 'Alice', engineId: 'p1' },
      { id: 'dev:bob', name: 'Bob', engineId: 'p2' },
    ],
    status: 'active',
    turn: 0,
    phase: 'orders',
    state,
    orders: [],
    locked: false,
    events: [],
    lastSeq: 0,
    seenEventSeq: -1,
    ...over,
  };
}

function uiOf(over: Partial<UiState> = {}): UiState {
  return { selectedUnitId: null, selectedCityId: null, draft: null, ...over };
}

/** État : u1 guerrier p1 en (0,0), u2 colon p1 en (1,0), u3 guerrier p2 en (0,1) (adjacente à u1), ville p2 en (2,1). */
function makeBattleState(): GameState {
  return makeState({
    width: 8,
    height: 8,
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'u2', type: 'colon', owner: 'p1', q: 1, r: 0 },
      { id: 'u3', type: 'guerrier', owner: 'p2', q: 0, r: 1 },
    ],
    cities: [{ id: 'c1', owner: 'p2', q: 2, r: 1 }],
    terrainOverrides: { [tileKey(4, 4)]: 'eau' },
  });
}

describe('clickAction (L3)', () => {
  it('une unité amie est sélectionnée ; l\'ennemi visible aussi (lecture seule)', () => {
    const view = viewOf(makeBattleState());
    expect(clickAction(view, uiOf(), { q: 0, r: 0 })).toEqual({ kind: 'selectUnit', unitId: 'u1', mine: true });
    expect(clickAction(view, uiOf(), { q: 0, r: 1 })).toEqual({ kind: 'selectUnit', unitId: 'u3', mine: false });
  });

  it('CORRECTIFS-SELECTION (schéma du 08/09) : le clic gauche est SÉLECTION UNIQUE — cliquer un ennemi adjacent le sélectionne (lecture), il ne programme plus ni attaque ni chemin', () => {
    const view = viewOf(makeBattleState());
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 1 })).toEqual({
      kind: 'selectUnit',
      unitId: 'u3',
      mine: false,
    });
  });

  it('CORRECTIFS-SELECTION : ville ennemie adjacente cliquée au gauche → sélection de ville (la capture par entrée R-57/R-65 passe par le clic droit)', () => {
    const state = makeBattleState();
    state.cities.c9 = { id: 'c9', q: -1, r: 1, owner: 'p2', pop: 1, capital: false, foodStored: 0, production: null, workedTile: null };
    const view = viewOf(state);
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: -1, r: 1 })).toEqual({ kind: 'selectCity', cityId: 'c9' });
  });

  it('le colon (non-combattant) ne produit pas d\'attaque — sélection au clic', () => {
    const view = viewOf(makeBattleState());
    const action = clickAction(view, uiOf({ selectedUnitId: 'u2' }), { q: 0, r: 1 });
    expect(action).toEqual({ kind: 'selectUnit', unitId: 'u3', mine: false });
  });

  it('CORRECTIFS-SELECTION : le clic gauche ne trace JAMAIS de chemin — case adjacente vide → désélection, re-clic sur l\'unité → désélection', () => {
    const view = viewOf(makeBattleState());
    const ui = uiOf({ selectedUnitId: 'u1' });
    // Case vide adjacente : pas d'extension (la programmation est au clic droit).
    expect(clickAction(view, ui, { q: 1, r: 1 })).toEqual({ kind: 'deselect' });
    // Re-clic sur l'unité sélectionnée : désélection (demande explicite d'Erik).
    expect(clickAction(view, ui, { q: 0, r: 0 })).toEqual({ kind: 'deselect' });
  });

  it('CORRECTIFS-SELECTION : une case inconnue (brouillard) clic-gauchée → désélection, jamais inventée', () => {
    const state = makeBattleState();
    delete (state.map as Record<string, unknown>)[tileKey(-1, 1)]; // voisine de u1 mais hors état filtré
    const view = viewOf(state);
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: -1, r: 1 }).kind).toBe('deselect');
  });

  it('ordres verrouillés : la sélection reste possible, aucun ordre programmable (verrou)', () => {
    const view = viewOf(makeBattleState(), { locked: true });
    expect(ordersEditable(view)).toBe(false);
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 1 })).toEqual({
      kind: 'selectUnit',
      unitId: 'u3',
      mine: false,
    });
    // Le clic droit verrouillé ne programme pas (aucune destination).
    expect(rightClickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 1, r: 1 })).toEqual({ kind: 'none' });
  });

  it('clic sur une ville → sélection de ville ; clic dans le vide → déselection', () => {
    const view = viewOf(makeBattleState());
    expect(clickAction(view, uiOf(), { q: 2, r: 1 })).toEqual({ kind: 'selectCity', cityId: 'c1' });
    expect(clickAction(view, uiOf(), { q: 6, r: 6 })).toEqual({ kind: 'deselect' });
  });

  it('capitale défendue : 1er clic l\'unité, 2e clic la ville (alternance)', () => {
    const state = makeBattleState();
    // Ville amie sous le guerrier u1 en (0,0).
    state.cities.c2 = { id: 'c2', q: 0, r: 0, owner: 'p1', pop: 1, capital: true, foodStored: 0, production: null, workedTiles: [], buildings: [], conversion: 'gold' };
    const view = viewOf(state);
    expect(clickAction(view, uiOf(), { q: 0, r: 0 })).toEqual({ kind: 'selectUnit', unitId: 'u1', mine: true });
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 0 })).toEqual({ kind: 'selectCity', cityId: 'c2' });
  });

  it('CORRECTIFS-SELECTION : clic droit = destination — ville AMIE ADJACENTE atteignable (entrée = garnison, R-30), ville amie distante aussi (BFS)', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
      cities: [{ id: 'c2', owner: 'p1', q: 1, r: 0 }], // ville amie VIDE adjacente
    });
    const view = viewOf(state);
    expect(rightClickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 1, r: 0 })).toEqual({
      kind: 'moveDraft',
      path: [{ q: 1, r: 0 }],
      unitId: 'u1',
    });
  });

  it('CORRECTIFS-SELECTION : ville amie NON adjacente — le clic GAUCHE sélectionne la ville (sélection pure)', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
      cities: [{ id: 'c2', owner: 'p1', q: 3, r: 0 }], // ville amie éloignée
    });
    const view = viewOf(state);
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 3, r: 0 })).toEqual({ kind: 'selectCity', cityId: 'c2' });
    // … et le clic droit la PROGRAMME (chemin BFS complet).
    expect(rightClickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 3, r: 0 })).toEqual({
      kind: 'moveDraft',
      path: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }],
      unitId: 'u1',
    });
  });

  it('CORRECTIFS-SELECTION : clic droit sur un ENNEMI adjacent → moveDraft (le dernier pas déclenche le combat d\'entrée, R-42)', () => {
    const view = viewOf(makeBattleState());
    expect(rightClickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 1 })).toEqual({
      kind: 'moveDraft',
      path: [{ q: 0, r: 1 }],
      unitId: 'u1',
    });
    // Sans destination valide (case inconnue non adjacente) : annulation unifiée de l'ordre.
    expect(rightClickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 9, r: 9 })).toEqual({
      kind: 'cancelOrder',
      unitId: 'u1',
    });
  });

  it('INTERACTION-3D : ville PLEINE — le re-clic après désélection fonctionne (le prédicat tient compte de l\'ordre SetWorkedTile en attente)', () => {

    const state = makeState({

      width: 8,

      height: 8,

      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 5 }],

      cities: [{ id: 'c1', owner: 'p1', q: 2, r: 1, pop: 2, capital: true, workedTiles: ['1,1', '2,2'] }],

      terrainOverrides: { [tileKey(1, 2)]: 'foret' },

    });

    const view = viewOf(state, { orders: [{ type: 'SetWorkedTile', cityId: 'c1', tile: null }] });

    const ui = uiOf({ selectedCityId: 'c1' });

    // Un ordre de désassignation est EN ATTENTE : il reste un citoyen effectif

    // à placer → le clic sur une case libre du rayon assigne (le re-clic

    // fonctionne, retour d'Erik en 3D ; le prédicat est partagé 2D/3D).

    expect(clickAction(view, ui, { q: 1, r: 2 })).toEqual({ kind: 'setWorkedTile', cityId: 'c1', tile: '1,2' });

    // Sans l'ordre en attente (ville pleine sur l'état connu) : refus honnête.

    const view2 = viewOf(state);

    expect(clickAction(view2, ui, { q: 1, r: 2 })).toEqual({ kind: 'none' });

    // Case déjà travaillée à l'état effectif : désassignation.

    expect(clickAction(view, ui, { q: 1, r: 1 })).toEqual({ kind: 'setWorkedTile', cityId: 'c1', tile: null });

  });



  it('passableKnown refuse l\'eau et les cases absentes du JSON filtré', () => {
    const state = makeBattleState();
    expect(passableKnown(state, { q: 4, r: 4 })).toBe(false); // eau
    expect(passableKnown(state, { q: 9, r: 9 })).toBe(false); // hors carte
    expect(passableKnown(state, { q: 3, r: 3 })).toBe(true); // prairie
  });
});

// -------------------------------------------------------------------------
// DEPLACEMENT-PLANIFIE · R-161 (D6) : pathTo respecte la limite de fog —
// au plus UN pas terminal dans une case inconnue (absente de l'état filtré),
// jamais de transit par l'inconnu.
// -------------------------------------------------------------------------
describe('pathTo · limite fog (R-161/D6, DEPLACEMENT-PLANIFIE)', () => {
  function fogState(): GameState {
    const s = makeState({
      width: 8,
      height: 8,
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    });
    // exploré : (0,0), (1,0), (2,0) — le reste est inconnu. Miroir d'un état
    // FILTRÉ : les cases inexplorées sont ABSENTES de state.map — on les
    // retire pour simuler ce que diffuse le serveur.
    const explored = new Set(['0,0', '1,0', '2,0']);
    s.players['p1']!.vision.explored = [...explored];
    for (const key of Object.keys(s.map)) {
      if (!explored.has(key)) delete s.map[key];
    }
    return s;
  }

  it('chemin entièrement connu : inchangé', () => {
    const path = pathTo(fogState(), { q: 0, r: 0 }, { q: 2, r: 0 });
    expect(path?.map((h) => `${h.q},${h.r}`)).toEqual(['1,0', '2,0']);
  });

  it('destination inconnue ADJACENTE au connu : un pas terminal dans l\'inconnu', () => {
    const path = pathTo(fogState(), { q: 0, r: 0 }, { q: 3, r: 0 });
    expect(path?.map((h) => `${h.q},${h.r}`)).toEqual(['1,0', '2,0', '3,0']);
  });

  it('destination inconnue non adjacente au connu : inatteignable (jamais traversé l\'inconnu)', () => {
    const path = pathTo(fogState(), { q: 0, r: 0 }, { q: 4, r: 0 });
    expect(path).toBeNull();
  });
});
