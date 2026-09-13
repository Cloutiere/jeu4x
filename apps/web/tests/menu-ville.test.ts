/**
 * MENU-VILLE (décisions d'Erik du 13/09) — picking de la vue inclinée
 * (fonctions pures) et décision de clic en vue ville (assignation des tuiles
 * cultivables). La vue ne change AUCUNE règle : le clic réutilise la file
 * d'ordres SetWorkedTile existante.
 */
import { describe, expect, it } from 'vitest';
import { HEX_SIZE, hexSousEcranVueVille, mondeSousEcranVueVille, poseVueVillePour, screenToHex, VUE_VILLE_PANNEAU_L, ZOOM_MAX } from '../src/lib/render/hexView.js';
import { makeState, tileKey, hexDistance } from '@game/rules';
import type { GameState } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import { clickActionVueVille } from '../src/lib/render/interaction.js';

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

describe('pose de la vue ville (zoom à plat — retour d\'Erik)', () => {
  it('aucune inclinaison : le zoom cadre TOUTES les tuiles cultivables dans l\'espace libre', () => {
    // Tribunal (rayon 2 — 18 cases), canvas 1600×900, panneau 470 px.
    const pose = poseVueVillePour(1000, 600, 1600, 900, HEX_SIZE, 2);
    expect(pose.scale).toBeGreaterThan(0);
    expect(pose.scale).toBeLessThanOrEqual(ZOOM_MAX);
    // Chaque tuile du rayon 2, ENTIÈRE (sommets compris), reste dans l'espace
    // libre (0 → 1600−470) × 900 — retour d'Erik : rien de coupé haut/bas.
    for (let dq = -2; dq <= 2; dq++) {
      for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
        const wx = 1000 + (dq + dr / 2) * Math.sqrt(3) * HEX_SIZE;
        const wy = 600 + dr * 1.5 * HEX_SIZE;
        const sx = wx * pose.scale + pose.x;
        const sy = wy * pose.scale + pose.y;
        // sommet vertical (pointy-top : demi-hauteur = size) + sommets latéraux
        expect(sy - HEX_SIZE * pose.scale).toBeGreaterThanOrEqual(-1);
        expect(sy + HEX_SIZE * pose.scale).toBeLessThanOrEqual(900 + 1);
        expect(sx - (Math.sqrt(3) / 2) * HEX_SIZE * pose.scale).toBeGreaterThanOrEqual(-1);
        expect(sx + (Math.sqrt(3) / 2) * HEX_SIZE * pose.scale).toBeLessThanOrEqual(1600 - VUE_VILLE_PANNEAU_L + 1);
      }
    }
  });

  it('rayon 1 (6 cases) : zoom plus grand que rayon 2 ; borné par ZOOM_MAX', () => {
    const r1 = poseVueVillePour(0, 0, 1600, 900, HEX_SIZE, 1);
    const r2 = poseVueVillePour(0, 0, 1600, 900, HEX_SIZE, 2);
    expect(r1.scale).toBeGreaterThan(r2.scale);
    expect(poseVueVillePour(0, 0, 4000, 2400, HEX_SIZE, 1).scale).toBe(ZOOM_MAX);
  });
});

describe('picking vue ville — la tuile cliquée est la même qu\'à plat (zoom à plat)', () => {
  it('le centre écran d\'une tuile re-pique EXACTEMENT cette tuile (transform inverse)', () => {
    const pose = poseVueVillePour(0, 0, 1600, 900, HEX_SIZE, 2);
    const cibles = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -2, r: 3 },
      { q: 3, r: -1 },
    ];
    for (const hex of cibles) {
      // Transform direct (le rendu) : centre monde → écran.
      const wx = hex.q * Math.sqrt(3) * HEX_SIZE + hex.r * (Math.sqrt(3) / 2) * HEX_SIZE;
      const wy = hex.r * 1.5 * HEX_SIZE;
      const sx = wx * pose.scale + pose.x;
      const sy = wy * pose.scale + pose.y;
      const pique = hexSousEcranVueVille(sx, sy, pose, HEX_SIZE);
      expect(pique.q + 0).toBe(hex.q); // +0 : normalise -0 (arrondi pixel)
      expect(pique.r).toBe(hex.r);
    }
  });

  it('équivale à plat : le même point monde pique la même tuile avec ou sans vue ville', () => {
    const pose = poseVueVillePour(0, 0, 1600, 900, HEX_SIZE, 2);
    const monde = { x: 173.2, y: 259.8 };
    const enVue = mondeSousEcranVueVille(monde.x * pose.scale + pose.x, monde.y * pose.scale + pose.y, pose);
    expect(enVue.x).toBeCloseTo(monde.x, 6);
    expect(enVue.y).toBeCloseTo(monde.y, 6);
    const camPlate = { x: pose.x, y: pose.y, scale: pose.scale };
    const hexVue = hexSousEcranVueVille(monde.x * pose.scale + pose.x, monde.y * pose.scale + pose.y, pose, HEX_SIZE);
    const hexPlate = screenToHex(monde.x * camPlate.scale + camPlate.x, monde.y * camPlate.scale + camPlate.y, camPlate, HEX_SIZE);
    expect(hexVue).toEqual(hexPlate);
  });
});

describe('clickActionVueVille — tuiles cliquables (même file d\'ordres SetWorkedTile)', () => {
  /** Ville p1 pop 2 en (0,0), une tuile déjà travaillée (1,0). */
  function etatVille(): GameState {
    return makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 0 }],
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: [tileKey(1, 0)], buildings: ['palais'] }],
    });
  }

  it('clic sur une tuile libre du rayon = assignation ; re-clic sur une tuile assignée = désassignation', () => {
    const view = viewOf(etatVille());
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBeLessThanOrEqual(1);
    expect(clickActionVueVille(view, 'c1', { q: 0, r: 1 })).toEqual({ kind: 'setWorkedTile', cityId: 'c1', tile: tileKey(0, 1) });
    expect(clickActionVueVille(view, 'c1', { q: 1, r: 0 })).toEqual({ kind: 'setWorkedTile', cityId: 'c1', tile: null });
  });

  it('hors du rayon de travail, sur la case de ville, ou sur une case occupée : aucun effet', () => {
    const view = viewOf(etatVille());
    expect(clickActionVueVille(view, 'c1', { q: 0, r: 3 })).toEqual({ kind: 'none' }); // hors rayon (6 cases)
    expect(clickActionVueVille(view, 'c1', { q: 0, r: 0 })).toEqual({ kind: 'none' }); // case de ville
    expect(clickActionVueVille(view, 'c1', { q: 2, r: 0 })).toEqual({ kind: 'none' }); // unité posée dessus
  });

  it('ville pleine à l\'état effectif : pas d\'assignation supplémentaire', () => {
    const state = etatVille();
    state.cities['c1']!.pop = 1; // une seule place — déjà prise par (1,0)
    const view = viewOf(state);
    expect(clickActionVueVille(view, 'c1', { q: 0, r: 1 })).toEqual({ kind: 'none' });
  });

  it('ordres non modifiables (résolution) : aucun effet — les actions de carte restent inaccessibles', () => {
    const view = viewOf(etatVille(), { phase: 'resolving' });
    expect(clickActionVueVille(view, 'c1', { q: 0, r: 1 })).toEqual({ kind: 'none' });
  });
});
