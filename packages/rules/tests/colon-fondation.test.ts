/**
 * COLON-FONDATION (chantier 2D, décisions Erik 13/09) — M1 : détection PURE
 * de l'état « en train de fonder ». Le Colon affiche son état dès l'ordre
 * posé (tranché 2 = A) : le prédicat lit l'aperçu existant (scenePreviews —
 * ordres brouillons ET chemins gelés R-158), jamais recalculé par frame, et
 * tombe à faux à l'annulation comme à la consommation (miroir du moteur —
 * aucun état UI inventé). Zéro gameplay : la résolution R-64 est intouchée.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { fondeAFinDuChemin, fondateursDe, previewPrograms } from '../src/preview.js';
import type { Order } from '../src/state.js';

function colonSeul() {
  return makeState({ units: [{ id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 }] });
}

describe('fondeAFinDuChemin · M1 (état « en train de fonder » dès l\'ordre posé)', () => {
  it('ordre MultiStep avec action finale foundCity → true (visuel basculé immédiatement)', () => {
    const state = colonSeul();
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }], final: 'foundCity' }],
    };
    const previews = previewPrograms(state, orders);
    const p = previews.find((pv) => pv.unitId === 'col')!;
    expect(fondeAFinDuChemin(p)).toBe(true);
    expect(fondateursDe(previews, 'p1')).toEqual(new Set(['col']));
  });

  it('ordre sans action finale (Move, MultiStep nu) → false', () => {
    const state = colonSeul();
    const previews = previewPrograms(state, {
      p1: [
        { type: 'Move', unitId: 'col', path: [{ q: 1, r: 0 }] },
      ],
    });
    expect(fondateursDe(previews, 'p1')).toEqual(new Set());
  });

  it('MultiStep sans final → false (déplacement simple, pas de fondation)', () => {
    const state = colonSeul();
    const previews = previewPrograms(state, {
      p1: [{ type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }],
    });
    expect(fondateursDe(previews, 'p1')).toEqual(new Set());
  });

  it('chemin gelé (unit.order MultiStep final foundCity) → true — le visuel persiste', () => {
    const state = colonSeul();
    state.units.col!.order = { type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }], final: 'foundCity' };
    const previews = previewPrograms(state, { p1: [] });
    expect(fondateursDe(previews, 'p1')).toEqual(new Set(['col']));
  });

  it('annulation (ordre purgé) → false — le visuel disparaît, aucune trace résiduelle', () => {
    const state = colonSeul();
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }], final: 'foundCity' }],
    };
    expect(fondateursDe(previewPrograms(state, orders), 'p1').size).toBe(1);
    // purge existante (clic droit/Échap) : l'ordre quitte simplement la vue
    expect(fondateursDe(previewPrograms(state, { p1: [] }), 'p1').size).toBe(0);
  });

  it('consommation à la résolution (order consommé, colon devenu ville) → false', () => {
    const state = colonSeul();
    state.units.col!.order = { type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }], final: 'foundCity' };
    // à la consommation, le moteur retire l'ordre (fondation R-64) — l'état
    // filtré ne porte plus l'action finale, l'aperçu non plus.
    state.units.col!.order = null;
    expect(fondateursDe(previewPrograms(state, { p1: [] }), 'p1').size).toBe(0);
  });

  it('filtre par propriétaire : le Colon ENNEMI ne fait pas basculer le visuel (unité amie seulement)', () => {
    const state = makeState({
      units: [
        { id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'colE', type: 'colon', owner: 'p2', q: 5, r: 5 },
      ],
    });
    state.units.colE!.order = { type: 'MultiStep', unitId: 'colE', path: [{ q: 6, r: 5 }], final: 'foundCity' };
    const previews = previewPrograms(state, { p1: [] });
    expect(fondateursDe(previews, 'p1')).toEqual(new Set());
    expect(fondateursDe(previews, 'p2')).toEqual(new Set(['colE']));
  });
});
