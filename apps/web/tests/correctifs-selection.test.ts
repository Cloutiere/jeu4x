/**
 * CORRECTIFS-SELECTION (08/09) — trois signalements d'Erik :
 *  M1 : clic droit = changement de SÉLECTION (jamais de programmation) ;
 *  M2 : annulation d'ordre = purge UNIFIÉE (aucune flèche résiduelle) ;
 *  M3 : pointLeLongDuChemin — interpolation pure de l'aperçu animé.
 * Fonctions pures testées (le rendu Pixi/Three n'est pas rejouable en vitest).
 */
import { describe, expect, it } from 'vitest';
import { makeState, previewPrograms, tileKey } from '@game/rules';
import type { GameState } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import { removeCancelledOrders } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';
import { annulationOrdre, rightClickAction } from '../src/lib/render/interaction.js';
import { pointLeLongDuChemin } from '../src/lib/render/arrows.js';
import type { Point } from '../src/lib/render/arrows.js';

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

/** u1 guerrier p1 (0,0), u2 colon p1 (1,0), u3 guerrier p2 (0,1), ville p2 (2,1). */
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

// ---------------------------------------------------------------------------
// M1 (schéma d'Erik du 08/09) — clic gauche = sélection UNIQUEMENT,
// clic droit = destination du déplacement
// ---------------------------------------------------------------------------

describe('rightClickAction · M1 (clic droit = destination du déplacement)', () => {
  it('unité amie sélectionnée + destination valide → moveDraft (chemin complet)', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    });
    const view = viewOf(state);
    expect(rightClickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 2, r: 0 })).toEqual({
      kind: 'moveDraft',
      path: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
      unitId: 'u1',
    });
  });

  it('sans unité sélectionnée → aucun effet (le clic gauche reste la seule sélection)', () => {
    const view = viewOf(makeBattleState());
    expect(rightClickAction(view, uiOf(), { q: 2, r: 0 })).toEqual({ kind: 'none' });
  });

  it('unité ennemie sélectionnée (lecture seule) → aucun effet', () => {
    const view = viewOf(makeBattleState());
    expect(rightClickAction(view, uiOf({ selectedUnitId: 'u3' }), { q: 1, r: 1 })).toEqual({ kind: 'none' });
  });

  it('destination invalide → annulation unifiée de l\'ordre de l\'unité sélectionnée', () => {
    const view = viewOf(makeBattleState());
    expect(rightClickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 9, r: 9 })).toEqual({
      kind: 'cancelOrder',
      unitId: 'u1',
    });
  });

  it('ordres verrouillés → aucun effet', () => {
    const view = viewOf(makeBattleState(), { locked: true });
    expect(rightClickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 2, r: 0 })).toEqual({ kind: 'none' });
  });
});

// ---------------------------------------------------------------------------
// M2 — annulation : corps + pointe + brouillon purgés ENSEMBLE
// ---------------------------------------------------------------------------

describe('annulationOrdre · M2 (purge unifiée — plus de flèche orpheline)', () => {
  it("« Annuler l'ordre » : l'ordre soumis ET le brouillon UI de la même unité partent ensemble", () => {
    const view = viewOf(makeBattleState(), { orders: [{ type: 'Move', unitId: 'u2', path: [{ q: 2, r: 0 }] }] });
    const ui = uiOf({ selectedUnitId: 'u2', draft: { unitId: 'u2', path: [{ q: 2, r: 0 }] } });
    const r = annulationOrdre(view, ui, 'u2');
    expect(r.ordreExistant).toBe(true);
    expect(r.draft).toBeNull();
  });

  it('Échap sans ordre soumis : le brouillon part, aucun CancelOrder émis', () => {
    const view = viewOf(makeBattleState());
    const ui = uiOf({ selectedUnitId: 'u2', draft: { unitId: 'u2', path: [{ q: 2, r: 0 }] } });
    const r = annulationOrdre(view, ui, 'u2');
    expect(r.ordreExistant).toBe(false);
    expect(r.draft).toBeNull();
  });

  it("annuler l'ordre d'une unité ne touche pas au brouillon d'une AUTRE unité", () => {
    const view = viewOf(makeBattleState(), { orders: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] });
    const ui = uiOf({ selectedUnitId: 'u2', draft: { unitId: 'u2', path: [{ q: 2, r: 0 }] } });
    const r = annulationOrdre(view, ui, 'u1');
    expect(r.ordreExistant).toBe(true);
    expect(r.draft).toEqual({ unitId: 'u2', path: [{ q: 2, r: 0 }] });
  });

  it('verrou critique du signalement : après purge, AUCUNE source de géométrie de flèche ne subsiste (aperçu + brouillon)', () => {
    // La cause racine : deux pools (ordre soumis → flèche d'aperçu avec pointe ;
    // brouillon UI → ligne sans pointe). Après la purge unifiée, les deux sont vides.
    const path = [{ q: 2, r: 0 }, { q: 3, r: 0 }];
    const view = viewOf(makeBattleState(), { orders: [{ type: 'Move', unitId: 'u2', path }] });
    const ui = uiOf({ selectedUnitId: 'u2', draft: { unitId: 'u2', path } });
    const r = annulationOrdre(view, ui, 'u2');
    const ordersApres = r.ordreExistant ? removeCancelledOrders(view.orders, 'u2', null) : view.orders;
    const previews = previewPrograms(view.state, { p1: ordersApres });
    expect(previews.find((p) => p.unitId === 'u2')).toBeUndefined(); // plus de flèche/pointe/fantôme
    expect(r.draft).toBeNull(); // plus de ligne de brouillon orpheline
  });

  it('MultiStep (R-158) annulé : même purge (ordre composite + brouillon)', () => {
    const view = viewOf(makeBattleState(), {
      orders: [{ type: 'MultiStep', unitId: 'u2', path: [{ q: 2, r: 0 }], final: 'foundCity' }],
    });
    const ui = uiOf({ selectedUnitId: 'u2', draft: { unitId: 'u2', path: [{ q: 2, r: 0 }] } });
    const r = annulationOrdre(view, ui, 'u2');
    expect(r.ordreExistant).toBe(true);
    expect(r.draft).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// M3 — interpolation pure de l'aperçu animé
// ---------------------------------------------------------------------------

describe('pointLeLongDuChemin · M3 (aperçu animé)', () => {
  const ligne: Point[] = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 40 },
  ];

  it('distance 0 → origine ; distance ≥ longueur → destination (borné)', () => {
    expect(pointLeLongDuChemin(ligne, 0)).toEqual({ x: 0, y: 0 });
    expect(pointLeLongDuChemin(ligne, -5)).toEqual({ x: 0, y: 0 });
    expect(pointLeLongDuChemin(ligne, 1000)).toEqual({ x: 30, y: 40 });
  });

  it('interpolation au milieu du premier segment', () => {
    expect(pointLeLongDuChemin(ligne, 15)).toEqual({ x: 15, y: 0 });
  });

  it("dépassement d'un segment : report sur le segment suivant", () => {
    expect(pointLeLongDuChemin(ligne, 50)).toEqual({ x: 30, y: 20 });
  });

  it('cas dégénérés : chemin vide ou à un seul point', () => {
    expect(pointLeLongDuChemin([], 10)).toEqual({ x: 0, y: 0 });
    expect(pointLeLongDuChemin([{ x: 7, y: 9 }], 10)).toEqual({ x: 7, y: 9 });
  });
});
