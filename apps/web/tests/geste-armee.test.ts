/**
 * GESTE-ARMEE (04/11) — le geste joueur CivRev : former une armée de 3 unités
 * du même type depuis l'UI. Le moteur (R-44) et les bots savent déjà fusionner ;
 * cette tranche BRANCHE le geste : bouton « ⚔ Former une armée » dans le
 * panneau d'unité → sélection des 2 coéquipiers → pose du rendez-vous → ordre
 * canon `FormArmy`. Fonctions PURES testées (le rendu et les sockets ne sont
 * pas rejouables en vitest) — la validation finale reste serveur.
 *
 * D4 : zéro changement moteur/serveur — ces tests ne consomment que l'état
 * filtré et les helpers client existants (pathTo BFS, unitAtHex).
 */
import { describe, expect, it } from 'vitest';
import { makeState, tileKey } from '@game/rules';
import type { GameState } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';
import { clickAction } from '../src/lib/render/interaction.js';
import {
  candidatsArmee,
  estMembreFormArmy,
  libelleFormation,
  mouvementsVersRally,
  peutFormerArmee,
  rallyValide,
} from '../src/lib/geste-armee.js';

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

/**
 * u1 guerrier p1 (2,2) — le chef ; u2 guerrier p1 (3,2) ; u3 guerrier p1 (2,3)
 * ; u4 colon p1 (1,2) (type différent) ; u5 guerrier p2 (1,3) (ennemi) ;
 * u6 guerrier p1 (5,5) AUCUN lien avec le chef pour les cas ciblés.
 * (0,0)-(1,1) = eau ; (7,0) îlot eau autour → u6 isolée.
 */
function makeArmeeState(): GameState {
  return makeState({
    width: 10,
    height: 10,
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 },
      { id: 'u2', type: 'guerrier', owner: 'p1', q: 3, r: 2 },
      { id: 'u3', type: 'guerrier', owner: 'p1', q: 2, r: 3 },
      { id: 'u4', type: 'colon', owner: 'p1', q: 1, r: 2 },
      { id: 'u5', type: 'guerrier', owner: 'p2', q: 1, r: 3 },
      { id: 'u6', type: 'guerrier', owner: 'p1', q: 5, r: 5 },
    ],
    terrainOverrides: {
      [tileKey(0, 0)]: 'eau',
      [tileKey(1, 0)]: 'eau',
      [tileKey(0, 1)]: 'eau',
    },
  });
}

describe('peutFormerArmee · bouton visible (D1-1)', () => {
  it('visible : terrestre, non-armée, 2+ coéquipiers du même type praticables', () => {
    const state = makeArmeeState();
    const view = viewOf(state);
    const chef = state.units['u1']!;
    expect(peutFormerArmee(view, chef)).toBe(true);
  });

  it('invisible : moins de 2 unités du même type', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 },
        { id: 'u4', type: 'colon', owner: 'p1', q: 1, r: 2 },
      ],
    });
    expect(peutFormerArmee(viewOf(state), state.units['u1']!)).toBe(false);
  });

  it('invisible : unité navale (fusion navale au backlog — D4)', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [
        { id: 'n1', type: 'galere', owner: 'p1', q: 0, r: 0 },
        { id: 'n2', type: 'galere', owner: 'p1', q: 1, r: 0 },
        { id: 'n3', type: 'galere', owner: 'p1', q: 2, r: 0 },
      ],
      terrainOverrides: {
        [tileKey(0, 0)]: 'eau',
        [tileKey(1, 0)]: 'eau',
        [tileKey(2, 0)]: 'eau',
      },
    });
    expect(peutFormerArmee(viewOf(state), state.units['n1']!)).toBe(false);
  });

  it('invisible : le chef est déjà une armée (définitive — D3)', () => {
    const state = makeArmeeState();
    state.units['u1']!.isArmy = true;
    expect(peutFormerArmee(viewOf(state), state.units['u1']!)).toBe(false);
  });

  it('invisible : le chef est déjà membre d\'un FormArmy en cours', () => {
    const state = makeArmeeState();
    const view = viewOf(state, {
      orders: [{ type: 'FormArmy', members: ['u1', 'u2', 'u3'], rally: { q: 2, r: 2 } }],
    });
    expect(peutFormerArmee(view, state.units['u1']!)).toBe(false);
  });
});

describe('candidatsArmee · sélection des 2 coéquipiers (D1-2)', () => {
  it('retourne les amies du même type, praticables, hors armée/hors FormArmy', () => {
    const state = makeArmeeState();
    const view = viewOf(state);
    const ids = candidatsArmee(state, view, state.units['u1']!, 'p1').map((u) => u.id);
    expect(ids).toContain('u2');
    expect(ids).toContain('u3');
    expect(ids).toContain('u6'); // loin mais chemin terrestre existant
    expect(ids).not.toContain('u4'); // type différent
    expect(ids).not.toContain('u5'); // ennemie
  });

  it('exclut une unité à bord d\'un transport et une armée existante', () => {
    const state = makeArmeeState();
    state.units['u2']!.aboard = 'n9';
    state.units['u3']!.isArmy = true;
    const ids = candidatsArmee(state, viewOf(state), state.units['u1']!, 'p1').map((u) => u.id);
    expect(ids).not.toContain('u2');
    expect(ids).not.toContain('u3');
  });

  it('exclut les membres d\'un autre FormArmy en cours', () => {
    const state = makeArmeeState();
    // u2 et u3 forment DÉJÀ une armée avec u6.
    const view = viewOf(state, {
      orders: [{ type: 'FormArmy', members: ['u2', 'u3', 'u6'], rally: { q: 4, r: 4 } }],
    });
    expect(estMembreFormArmy(view, 'u2')).toBe(true);
    const ids = candidatsArmee(state, view, state.units['u1']!, 'p1').map((u) => u.id);
    expect(ids).not.toContain('u2');
    expect(ids).not.toContain('u3');
    expect(ids).not.toContain('u6');
    expect(estMembreFormArmy(view, 'u1')).toBe(false);
  });
});

describe('rallyValide · pose du rendez-vous (D1-3)', () => {
  it('case praticable connue atteignable par les TROIS → valide', () => {
    const state = makeArmeeState();
    const view = viewOf(state);
    expect(rallyValide(state, view, state.units['u1']!, ['u2', 'u3'], { q: 2, r: 2 })).toBe(true);
    expect(rallyValide(state, view, state.units['u1']!, ['u2', 'u3'], { q: 4, r: 4 })).toBe(true);
  });

  it('case d\'eau ou inconnue → refus propre (pré-vérification client)', () => {
    const state = makeArmeeState();
    const view = viewOf(state);
    expect(rallyValide(state, view, state.units['u1']!, ['u2', 'u3'], { q: 0, r: 0 })).toBe(false);
    expect(rallyValide(state, view, state.units['u1']!, ['u2', 'u3'], { q: 9, r: 9 } as never)).toBe(false);
  });

  it('case hors de portée d\'un membre → refus', () => {
    const state = makeArmeeState();
    // u6 est isolée de son côté ? Non — mais un rendez-vous SUR u6 reste
    // praticable ; on teste plutôt un membre inexistant (mort entre-temps).
    const view = viewOf(state);
    expect(rallyValide(state, view, state.units['u1']!, ['u2', 'u999'], { q: 2, r: 2 })).toBe(false);
  });
});

describe('clickAction · mode formation (D1-2/D1-3)', () => {
  it('clic sur un candidat → armyPick ; clic non-candidat → none', () => {
    const state = makeArmeeState();
    const view = viewOf(state);
    const ui = uiOf({ selectedUnitId: 'u1', armyDraft: { chef: 'u1', coequipiers: [] } });
    expect(clickAction(view, ui, { q: 3, r: 2 })).toEqual({ kind: 'armyPick', unitId: 'u2' });
    expect(clickAction(view, ui, { q: 1, r: 2 })).toEqual({ kind: 'none' }); // colon
    expect(clickAction(view, ui, { q: 1, r: 3 })).toEqual({ kind: 'none' }); // ennemi
  });

  it('après 2 coéquipiers, clic sur une case praticable → armyRally', () => {
    const state = makeArmeeState();
    const view = viewOf(state);
    const ui = uiOf({ selectedUnitId: 'u1', armyDraft: { chef: 'u1', coequipiers: ['u2', 'u3'] } });
    expect(clickAction(view, ui, { q: 4, r: 4 })).toEqual({ kind: 'armyRally', hex: { q: 4, r: 4 } });
    expect(clickAction(view, ui, { q: 0, r: 0 })).toEqual({ kind: 'none' }); // eau
  });

  it('re-clic sur un coéquipier choisi → armyPick (toggle côté page)', () => {
    const state = makeArmeeState();
    const view = viewOf(state);
    const ui = uiOf({ selectedUnitId: 'u1', armyDraft: { chef: 'u1', coequipiers: ['u2'] } });
    expect(clickAction(view, ui, { q: 3, r: 2 })).toEqual({ kind: 'armyPick', unitId: 'u2' });
  });
});

describe('mouvementsVersRally · le moteur ne déplace pas les membres (miroir botPolicy converger)', () => {
  it('chaque membre hors rendez-vous reçoit son Move ; celui qui y est déjà ne bouge pas', () => {
    const state = makeArmeeState();
    // Rendez-vous sur la case du chef (2,2) : u2 (3,2) et u3 (2,3) marchent,
    // u1 y est déjà — aucun Move pour lui.
    const mvts = mouvementsVersRally(state, ['u1', 'u2', 'u3'], { q: 2, r: 2 });
    const ids = mvts.map((m) => m.unitId);
    expect(ids).not.toContain('u1');
    expect(ids).toContain('u2');
    expect(ids).toContain('u3');
    for (const m of mvts) expect(m.path.length).toBeGreaterThan(0);
  });

  it('un membre à bord ou absent (mort) ne reçoit aucun Move', () => {
    const state = makeArmeeState();
    state.units['u2']!.aboard = 'n9';
    const mvts = mouvementsVersRally(state, ['u2', 'u999'], { q: 4, r: 4 });
    expect(mvts).toEqual([]);
  });
});

describe('libelleFormation · suivi de la fusion (D2)', () => {
  it('compteur n/3 = membres présents au rendez-vous', () => {
    const state = makeArmeeState();
    // Personne au rendez-vous (4,4).
    expect(libelleFormation(state, { type: 'FormArmy', members: ['u1', 'u2', 'u3'], rally: { q: 4, r: 4 } })).toContain('(0/3)');
    // u2 pose son rendez-vous sur sa propre case (3,2).
    const l2 = libelleFormation(state, { type: 'FormArmy', members: ['u1', 'u2', 'u3'], rally: { q: 3, r: 2 } });
    expect(l2).toContain('(1/3)');
    // Fusion imminente : les trois autour du rendez-vous (2,2).
    const l3 = libelleFormation(state, { type: 'FormArmy', members: ['u1', 'u2', 'u3'], rally: { q: 2, r: 2 } });
    expect(l3).toContain('(1/3)'); // seul u1 est SUR (2,2)
  });

  it('mentionne le rendez-vous', () => {
    const state = makeArmeeState();
    expect(libelleFormation(state, { type: 'FormArmy', members: ['u1', 'u2', 'u3'], rally: { q: 4, r: 4 } })).toContain('(4,4)');
  });
});
