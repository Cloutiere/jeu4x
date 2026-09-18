/**
 * PILE-AFFICHÉE (retour d'Erik du 17/09) — cohabitations visuelles :
 * 1. plusieurs unités sur une même case sont réduites et décalées (dispositionPile)
 *    et groupées par position DESSINÉE (pilesAffichees) ;
 * 2. une unité programmée est sélectionnable en cliquant sa case d'ARRÊT
 *    affichée, pas sa case de départ (unitesSurHex + clickAction) ;
 * 3. chaque nouveau clic sur une case cohabitée passe à l'unité suivante
 *    (cycle, avec ville en fin de cycle).
 * États de test : fixtures de @game/rules (source unique).
 */
import { describe, expect, it } from 'vitest';
import { makeState, tileKey } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';
import {
  clickAction,
  dispositionPile,
  pilesAffichees,
  positionAfficheeDe,
  unitesSurHex,
} from '../src/lib/render/interaction.js';

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

/** État : u1 guerrier p1 et u2 colon p1 COHABITANT en (0,0), u3 ennemi en (0,1). */
function makePileState(): GameState {
  return makeState({
    width: 8,
    height: 8,
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'u2', type: 'colon', owner: 'p1', q: 0, r: 0 },
      { id: 'u3', type: 'guerrier', owner: 'p2', q: 0, r: 1 },
    ],
    cities: [{ id: 'c1', owner: 'p2', q: 2, r: 1 }],
  });
}

describe('dispositionPile (calibrage 🔶)', () => {
  it('une unité seule : aucun décalage, échelle pleine', () => {
    expect(dispositionPile(1, 0)).toEqual({ dx: 0, dy: 0, echelle: 1 });
  });

  it('cohabitation : échelle réduite et décalage symétrique en éventail', () => {
    const a = dispositionPile(2, 0);
    const b = dispositionPile(2, 1);
    expect(a.echelle).toBeLessThan(1);
    expect(b.echelle).toBe(a.echelle);
    expect(b.dx).toBeGreaterThan(a.dx); // écartés horizontalement
    expect(a.dy).toBeLessThanOrEqual(b.dy); // bords jamais en retrait
    // Symétrie du centre de la pile.
    expect(a.dx + b.dx).toBeCloseTo(0);
  });

  it('index hors pile : identité (garde-fou)', () => {
    expect(dispositionPile(2, 5)).toEqual({ dx: 0, dy: 0, echelle: 1 });
  });
});

describe('pilesAffichees — groupement par position DESSINÉE', () => {
  it('deux cohabitantes : index/total cohérents, l\'ennemi dans sa propre case', () => {
    const state = makePileState();
    const piles = pilesAffichees(state, new Map());
    expect(piles.get('u1')).toEqual({ index: 0, total: 2 });
    expect(piles.get('u2')).toEqual({ index: 1, total: 2 });
    expect(piles.get('u3')).toEqual({ index: 0, total: 1 });
  });

  it('une unité programmée est groupée à sa case d\'arrêt affichée', () => {
    const state = makePileState();
    // u2 programmée vers (1,0) : affichée à sa destination.
    const positions = new Map([['u2' as const, { q: 1, r: 0 } as Hex]]);
    const piles = pilesAffichees(state, positions);
    expect(piles.get('u1')).toEqual({ index: 0, total: 1 }); // seule sur (0,0)
    expect(piles.get('u2')).toEqual({ index: 0, total: 1 }); // seule sur (1,0)
  });
});

describe('unitesSurHex — occupants au sens DESSINÉ', () => {
  it('une unité programmée est trouvée sur sa case d\'arrêt, plus sur sa case de départ', () => {
    const state = makePileState();
    const positions = new Map([['u2' as const, { q: 1, r: 0 } as Hex]]);
    expect(unitesSurHex(state, { q: 1, r: 0 }, positions).map((u) => u.id)).toEqual(['u2']);
    expect(unitesSurHex(state, { q: 0, r: 0 }, positions).map((u) => u.id)).toEqual(['u1']);
  });

  it('sans positions affichées : sémantique moteur inchangée', () => {
    const state = makePileState();
    expect(unitesSurHex(state, { q: 0, r: 0 }).map((u) => u.id)).toEqual(['u1', 'u2']);
  });
});

describe('positionAfficheeDe (pure) — case d\'arrêt de la prochaine résolution', () => {
  it('aperçu : arrêt selon les PM du type (guerrier 1 PM, colon 2 PM) ; hors aperçu : null', () => {
    const state = makePileState();
    const previews = [
      { unitId: 'u1', owner: 'p1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }], destination: { q: 2, r: 0 }, final: null, disputed: false },
      { unitId: 'u2', owner: 'p1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }], destination: { q: 2, r: 0 }, final: null, disputed: false },
    ];
    expect(positionAfficheeDe(state, previews, state.units['u1']!, 'p1')).toEqual({ q: 1, r: 0 }); // guerrier 1 PM → 1re case
    expect(positionAfficheeDe(state, previews, state.units['u2']!, 'p1')).toEqual({ q: 2, r: 0 }); // colon 2 PM → 2e case
    expect(positionAfficheeDe(state, [], state.units['u2']!, 'p1')).toBeNull();
    expect(positionAfficheeDe(state, previews, state.units['u3']!, 'p1')).toBeNull(); // pas à moi
  });
});

describe('clickAction — cycle de sélection sur case cohabitée', () => {
  it('chaque nouveau clic passe à l\'unité suivante, puis retour à la première', () => {
    const view = viewOf(makePileState());
    expect(clickAction(view, uiOf(), { q: 0, r: 0 })).toEqual({ kind: 'selectUnit', unitId: 'u1', mine: true });
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 0 })).toEqual({ kind: 'selectUnit', unitId: 'u2', mine: true });
    expect(clickAction(view, uiOf({ selectedUnitId: 'u2' }), { q: 0, r: 0 })).toEqual({ kind: 'selectUnit', unitId: 'u1', mine: true });
  });

  it('après le dernier occupant : la ville s\'il y en a une (alternance préservée)', () => {
    const state = makePileState();
    state.cities.c2 = { id: 'c2', q: 0, r: 0, owner: 'p1', pop: 1, capital: true, foodStored: 0, production: null, workedTiles: [], buildings: [], conversion: 'gold' };
    const view = viewOf(state);
    expect(clickAction(view, uiOf({ selectedUnitId: 'u2' }), { q: 0, r: 0 })).toEqual({ kind: 'selectCity', cityId: 'c2' });
    // Re-clic sur la ville sélectionnée : désélection (comportement historique —
    // fusion-menu-ville). Un nouveau clic repart du premier occupant.
    expect(clickAction(view, uiOf({ selectedCityId: 'c2' }), { q: 0, r: 0 })).toEqual({ kind: 'deselect' });
  });

  it('unité SEULE sur sa case : re-clic = désélection (comportement historique)', () => {
    const view = viewOf(makePileState());
    expect(clickAction(view, uiOf({ selectedUnitId: 'u3' }), { q: 0, r: 1 })).toEqual({ kind: 'deselect' });
  });

  it('ERIK 17/09 : une unité programmée se sélectionne en cliquant sa case d\'arrêt AFFICHÉE', () => {
    const state = makePileState();
    const view = viewOf(state);
    // u2 affichée en (1,0) : le clic là-bas la sélectionne…
    expect(clickAction(view, uiOf(), { q: 1, r: 0 }, new Map([['u2' as const, { q: 1, r: 0 } as Hex]])))
      .toEqual({ kind: 'selectUnit', unitId: 'u2', mine: true });
    // …et le clic sur sa case de DÉPART ne la resélectionne pas (elle n'y est plus visible).
    expect(clickAction(view, uiOf(), { q: 0, r: 0 }, new Map([['u2' as const, { q: 1, r: 0 } as Hex]])))
      .toEqual({ kind: 'selectUnit', unitId: 'u1', mine: true });
  });

  it('désélection par clic dans le vide inchangée (le cycle ne piège pas)', () => {
    const view = viewOf(makePileState());
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 5, r: 5 })).toEqual({ kind: 'deselect' });
  });
});
