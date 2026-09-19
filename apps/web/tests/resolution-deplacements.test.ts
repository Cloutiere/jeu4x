/**
 * HANDOFF-RESOLUTION-DEPLACEMENTS · bug 2 — le refus d'échange de cases entre
 * deux unités amies est correct, mais le message doit nommer la cause.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '@game/rules';
import type { GameEvent } from '@game/shared';
import { unexecutedOrders } from '../src/lib/feedback.js';

describe('échange de cases — message nommé (bug 2)', () => {
  it('deux amies programmées pour interverter leurs positions → message explicite', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
      ],
    });
    // Résolution refusée : aucune n'a bougé, aucune n'a de chemin gelé.
    const events: GameEvent[] = [];
    const out = unexecutedOrders(
      [
        { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] },
        { type: 'Move', unitId: 'u2', path: [{ q: 0, r: 0 }] },
      ],
      events,
      state,
    );
    expect(out).toHaveLength(2);
    for (const o of out) {
      expect(o.label).toBe('Deux unités ne peuvent pas interchanger de position');
    }
  });

  it('un blocage simple (pas un échange) garde le message générique', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 3, r: 3 },
      ],
    });
    const out = unexecutedOrders([{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }], [], state);
    expect(out).toEqual([{ unitId: 'u1', label: 'Déplacement impossible (chemin bloqué ou invalide)' }]);
  });
});
