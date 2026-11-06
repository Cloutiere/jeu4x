/**
 * FLUIDITE-SELECTION (Erik 05/11, tranche 1) — tests FIRST :
 * - D-A : la machine à états explicite `fsm-interaction.ts` (états documentés
 *   + transitions nommées) — le refactoring REMPLACE les drapeaux ad hoc de
 *   l'UiState SANS changer un seul comportement observable (non-régression
 *   verrouillée par interaction.test.ts, qui reste vert) ;
 * - D-B/D-C : le cyclage « prochaine unité disponible » (helper pur,
 *   ordre stable par id, pas de rebouclage en auto) ;
 * - la caméra qui GLISSE (easing pur + seuil data-driven 400 ms).
 * Le §4 tactile (tranche 2) est HORS périmètre.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeState, tileKey } from '@game/rules';
import type { GameState } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';
import {
  ETATS_INTERACTION,
  SEUILS_FLUIDITE,
  etatInteraction,
  easingGlissement,
  prochaineUniteDisponible,
  transitionValide,
} from '../src/lib/render/fsm-interaction.js';
import { clickAction } from '../src/lib/render/interaction.js';

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

function makeTroisUnits(): GameState {
  return makeState({
    width: 8,
    height: 8,
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'u2', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
      { id: 'u3', type: 'guerrier', owner: 'p1', q: 2, r: 0 },
      { id: 'u4', type: 'guerrier', owner: 'p2', q: 0, r: 1 },
    ],
    cities: [],
    terrainOverrides: {},
  });
}

describe('FLUIDITE-SELECTION · D-A — FSM de sélection', () => {
  it('les cinq états documentés existent', () => {
    expect([...ETATS_INTERACTION].sort()).toEqual(
      ['formationArmee', 'inactif', 'nukeArmed', 'previsualisation', 'uniteSelectionnee'].sort(),
    );
  });

  it('lecture d état : chaque drapeau UiState mappe sur SON état', () => {
    expect(etatInteraction(uiOf())).toBe('inactif');
    expect(etatInteraction(uiOf({ selectedUnitId: 'u1' }))).toBe('uniteSelectionnee');
    expect(
      etatInteraction(uiOf({ selectedUnitId: 'u1', draft: { unitId: 'u1', path: [{ q: 1, r: 0 }] } })),
    ).toBe('previsualisation');
    expect(etatInteraction(uiOf({ armyDraft: { chef: 'u1', coequipiers: [] } }))).toBe('formationArmee');
    expect(etatInteraction(uiOf({ nukeArmed: 'u9' }))).toBe('nukeArmed');
    // Une VILLE sélectionnée ne pilote aucune unité : l'état reste inactif
    // (consigné — le document d'Erik ne décrit pas d'état ville).
    expect(etatInteraction(uiOf({ selectedCityId: 'c1' }))).toBe('inactif');
  });

  it('priorités : nukeArmed ÉCRASE tout (tout clic devient une cible), formationArmee prime sur la prévisualisation', () => {
    expect(
      etatInteraction(
        uiOf({ nukeArmed: 'u9', selectedUnitId: 'u1', armyDraft: { chef: 'u1', coequipiers: [] } }),
      ),
    ).toBe('nukeArmed');
    expect(
      etatInteraction(
        uiOf({ armyDraft: { chef: 'u1', coequipiers: [] }, selectedUnitId: 'u1', draft: { unitId: 'u1', path: [{ q: 1, r: 0 }] } }),
      ),
    ).toBe('formationArmee');
  });

  it('transitions nommées : les passages légaux sont admis, les sauts illégaux refusés', () => {
    for (const de of ETATS_INTERACTION) {
      expect(transitionValide(de, 'inactif')).toBe(true); // tout état se vide
    }
    expect(transitionValide('inactif', 'uniteSelectionnee')).toBe(true);
    expect(transitionValide('uniteSelectionnee', 'previsualisation')).toBe(true);
    expect(transitionValide('uniteSelectionnee', 'nukeArmed')).toBe(true);
    expect(transitionValide('uniteSelectionnee', 'formationArmee')).toBe(true);
    // Un saut direct prévisualisation → nukeArmed (sans repasser par la
    // sélection) n est pas un geste du document d Erik : refusé.
    expect(transitionValide('previsualisation', 'nukeArmed')).toBe(false);
    expect(transitionValide('nukeArmed', 'formationArmee')).toBe(false);
  });

  it('NON-RÉGRESSION : clickAction emprunte la FSM et reste bit-à-bit (nuke armé, formation, sélection)', () => {
    const state = makeTroisUnits();
    const view = viewOf(state);
    // nukeArmed : tout clic carte = cible (miroir de la branche historique).
    expect(clickAction(view, uiOf({ nukeArmed: 'u9' }), { q: 3, r: 3 })).toEqual({ kind: 'nukeTarget', hex: { q: 3, r: 3 } });
    // formationArmee : le clic sur un candidat (u2, même type amie) reste le
    // geste armyPick HISTORIQUE ; toute autre case est inerte.
    expect(clickAction(view, uiOf({ armyDraft: { chef: 'u1', coequipiers: [] } }), { q: 1, r: 0 })).toEqual({ kind: 'armyPick', unitId: 'u2' });
    expect(clickAction(view, uiOf({ armyDraft: { chef: 'u1', coequipiers: [] } }), { q: 3, r: 3 })).toEqual({ kind: 'none' });
    // uniteSelectionnee : re-clic sur sa case seule = désélection (historique).
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 0 })).toEqual({ kind: 'deselect' });
    // inactif : clic sur une unité = sélection.
    expect(clickAction(view, uiOf(), { q: 1, r: 0 })).toEqual({ kind: 'selectUnit', unitId: 'u2', mine: true });
  });
});

describe('FLUIDITE-SELECTION · D-B/D-C — prochaine unité disponible', () => {
  it('ordre stable par id, candidats = à moi, PM > 0, ni ordre ni fortifiée ni programmée, pas à bord', () => {
    const state = makeTroisUnits();
    state.units.u2!.order = { type: 'Move', unitId: 'u2', path: [{ q: 2, r: 0 }], final: null } as never;
    state.units.u3!.fortified = true;
    const view = viewOf(state, { orders: [{ type: 'Heal', unitId: 'u1' } as never] });
    expect(prochaineUniteDisponible(view, null, { boucler: false })).toBeNull();
  });

  it('cyclage AUTO : l unité suivante APRÈS la courante par id ; fin de file = null (pas de rebouclage vertigineux)', () => {
    const view = viewOf(makeTroisUnits());
    expect(prochaineUniteDisponible(view, 'u1', { boucler: false })).toBe('u2');
    expect(prochaineUniteDisponible(view, 'u2', { boucler: false })).toBe('u3');
    expect(prochaineUniteDisponible(view, 'u3', { boucler: false })).toBeNull();
    // Sans unité courante : la première disponible.
    expect(prochaineUniteDisponible(view, null, { boucler: false })).toBe('u1');
  });

  it('cyclage MANUEL (touche N) : rebouclage en fin de file', () => {
    const view = viewOf(makeTroisUnits());
    expect(prochaineUniteDisponible(view, 'u3', { boucler: true })).toBe('u1');
    expect(prochaineUniteDisponible(view, 'u2', { boucler: true })).toBe('u3');
  });

  it('les ennemis, les cargaisons embarquées et les PM épuisées ne sont jamais candidates', () => {
    const state = makeTroisUnits();
    state.units.u4!.owner = 'p1'; // redevient amie pour le test de mp
    state.units.u4!.aboard = 'navire'; // embarquée : pas une entité de carte
    const view = viewOf(state);
    expect(prochaineUniteDisponible(view, 'u2', { boucler: false })).toBe('u3');
    state.units.u4!.aboard = null;
    state.units.u4!.mp = 0; // PM épuisées ce tour : rien à ordonner
    expect(prochaineUniteDisponible(view, 'u2', { boucler: false })).toBe('u3');
  });
});

describe('FLUIDITE-SELECTION · caméra qui glisse (D-B/D-C)', () => {
  it('seuil data-driven : 400 ms par défaut', () => {
    expect(SEUILS_FLUIDITE.cameraLerpMs).toBe(400);
  });

  it('easing : 0 → 0, 1 → 1, monotone, symétrique autour de 0,5', () => {
    expect(easingGlissement(0)).toBe(0);
    expect(easingGlissement(1)).toBe(1);
    expect(easingGlissement(0.5)).toBeCloseTo(0.5, 10);
    let precedent = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easingGlissement(i / 20);
      expect(v).toBeGreaterThanOrEqual(precedent);
      precedent = v;
    }
    expect(easingGlissement(0.25)).toBeCloseTo(1 - easingGlissement(0.75), 10);
  });
});

describe('FLUIDITE-SELECTION · câblage Game.svelte / GameCanvas.svelte', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/pages/Game.svelte'), 'utf8');
  const canvas = readFileSync(resolve(import.meta.dirname, '../src/lib/render/GameCanvas.svelte'), 'utf8');

  it('D-C — la touche N cycle manuellement (raccourci dédié, Espace intact)', () => {
    expect(src).toContain('raccourciCyclage');
    expect(src).toMatch(/'n'/);
    expect(canvas).not.toMatch(/case 'n'/); // le gestionnaire carte ne vol pas la touche
  });

  it('D-B — le cyclage auto passe par le helper pur + la caméra glissante (centerOnHexAnime)', () => {
    expect(src).toContain('prochaineUniteDisponible');
    expect(src).toContain('centerOnHexAnime');
    expect(canvas).toContain('centerOnHexAnime');
    expect(canvas).toContain('easingGlissement');
  });

  it('D-D — le toggle est dans la barre DEV, à côté de God mode, état ACTIVÉ par défaut', () => {
    const calque = src.slice(src.indexOf('{#if $calqueDev}'), src.indexOf('</header>'));
    expect(calque).toContain('cyclageAuto');
    expect(calque).toContain('God mode');
    expect(src).toMatch(/cyclageAuto[^;]*=\s*\$state\(true\)/);
  });

  it('les raccourcis existants restent ENTIERS (test verrou : F/H/S/Z/Espace/B)', () => {
    expect(src).toContain("['f', 'h', 's', 'z', ' ', 'b']");
  });
});
