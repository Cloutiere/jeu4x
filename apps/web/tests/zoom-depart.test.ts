import { describe, expect, it } from 'vitest';
import { PAS_ZOOM_MOLETTE, ZOOM_DEPART, ZOOM_MAX, ZOOM_MIN } from '../src/lib/render/hexView.js';

// Retour d'Erik du 22/09 (captures « visuel souhaité ») : le zoom de départ
// vaut 4 crans de molette depuis ×1 (×1,75) — la carte remplit la vue.
describe('zoom de départ de la caméra', () => {
  it('vaut exactement 4 crans de molette depuis ×1', () => {
    expect(PAS_ZOOM_MOLETTE).toBe(1.15);
    expect(ZOOM_DEPART).toBeCloseTo(1.15 ** 4, 12);
  });

  it('reste dans les bornes de zoom de la carte', () => {
    expect(ZOOM_DEPART).toBeGreaterThan(ZOOM_MIN);
    expect(ZOOM_DEPART).toBeLessThan(ZOOM_MAX);
  });
});
