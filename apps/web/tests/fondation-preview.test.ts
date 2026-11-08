/**
 * FONDATION-PREVIEW (demande Erik 05/11) — décision PURE de la case de
 * fondation teintée : le colon sous fondation (ordre FoundCity direct SUR
 * PLACE, ou chemin programmé/gelé dont l'action finale est `foundCity`)
 * fait apparaître la case visée avec le rendu culturel de SA NATION à une
 * opacité d'aperçu (le profil smoothstep du dégradé est réutilisé, le
 * rendu Pixi n'est pas rejouable en vitest — même split que colon-fondation).
 */
import { describe, expect, it } from 'vitest';
import { previewPrograms } from '@game/rules';
import { APERCU_FONDATION, arretsCanvasApercu, casesApercuFondation } from '../src/lib/render/fondation-preview.js';
import { CALIBRAGE_ZONE_CULTURELLE, profilAlpha } from '../src/lib/render/zone-culturelle.js';
import type { GameState, Order } from '@game/rules';

/** Mini-univers : deux joueurs, un colon chacun + un guerrier. */
function etat(): GameState {
  return {
    units: {
      col1: { id: 'col1', owner: 'P1', q: 3, r: 4, type: 'colon' },
      col2: { id: 'col2', owner: 'P2', q: 8, r: 1, type: 'colon' },
      g1: { id: 'g1', owner: 'P1', q: 5, r: 5, type: 'guerrier' },
    },
    players: {},
  } as unknown as GameState;
}

const uniteDe = (state: GameState) => (id: string) => (state.units as Record<string, { q: number; r: number; owner: string; type: string }>)[id] ?? null;

describe('APERCU_FONDATION — calibrage data-driven (D1, labo Erik)', () => {
  it('opacité d\'aperçu dans (0, 1]', () => {
    expect(APERCU_FONDATION.fondationPreviewAlpha).toBeGreaterThan(0);
    expect(APERCU_FONDATION.fondationPreviewAlpha).toBeLessThanOrEqual(1);
  });
});

describe('casesApercuFondation — les deux cas D2', () => {
  it('(a) ordre FoundCity direct → la case COURANTE du colon est teintée à sa nation', () => {
    const s = etat();
    const cases = casesApercuFondation({
      previews: [],
      orders: [{ type: 'FoundCity', unitId: 'col1' } as Order],
      uniteDe: uniteDe(s),
    });
    expect(cases).toEqual([{ key: '3,4', q: 3, r: 4, owner: 'P1', unitId: 'col1' }]);
  });

  it('(b) chemin programmé à action finale foundCity → la DESTINATION est teintée', () => {
    const s = etat();
    const previews = previewPrograms(s, {
      P1: [{ type: 'MultiStep', unitId: 'col1', path: [{ q: 4, r: 4 }, { q: 5, r: 4 }], final: 'foundCity' } as Order],
    });
    const cases = casesApercuFondation({ previews, orders: [], uniteDe: uniteDe(s) });
    expect(cases).toEqual([{ key: '5,4', q: 5, r: 4, owner: 'P1', unitId: 'col1' }]);
  });

  it('chemin gelé (MultiStep vivant sur l\'unité, aucun brouillon) → destination teintée aussi', () => {
    const s = etat();
    (s.units as Record<string, { order?: unknown }>).col1!.order = {
      type: 'MultiStep', unitId: 'col1', path: [{ q: 4, r: 4 }], final: 'foundCity',
    };
    const previews = previewPrograms(s, { P1: [], P2: [] });
    const cases = casesApercuFondation({ previews, orders: [], uniteDe: uniteDe(s) });
    expect(cases).toEqual([{ key: '4,4', q: 4, r: 4, owner: 'P1', unitId: 'col1' }]);
  });

  it('annulation / vente / mort (plus d\'ordre, plus d\'unité) → aucune case (dérive de l\'état, D3)', () => {
    const s = etat();
    expect(casesApercuFondation({ previews: [], orders: [], uniteDe: uniteDe(s) })).toEqual([]);
    // ordre FoundCity d'une unité disparue : la case ne peut pas exister
    expect(casesApercuFondation({
      previews: [],
      orders: [{ type: 'FoundCity', unitId: 'fantome' } as Order],
      uniteDe: uniteDe(s),
    })).toEqual([]);
  });

  it('une unité NON-colon (guerrier) → jamais teintée, même avec action finale foundCity', () => {
    const s = etat();
    const previews = previewPrograms(s, {
      P1: [{ type: 'MultiStep', unitId: 'g1', path: [{ q: 6, r: 5 }], final: 'foundCity' } as Order],
    });
    expect(casesApercuFondation({ previews, orders: [], uniteDe: uniteDe(s) })).toEqual([]);
    expect(casesApercuFondation({
      previews: [],
      orders: [{ type: 'FoundCity', unitId: 'g1' } as Order],
      uniteDe: uniteDe(s),
    })).toEqual([]);
  });

  it('chaque colon teinte SA nation (le propriétaire de l\'aperçu, pas le mien)', () => {
    const s = etat();
    const previews = previewPrograms(s, {
      P2: [{ type: 'MultiStep', unitId: 'col2', path: [{ q: 9, r: 1 }], final: 'foundCity' } as Order],
    });
    const cases = casesApercuFondation({ previews, orders: [], uniteDe: uniteDe(s) });
    expect(cases).toEqual([{ key: '9,1', q: 9, r: 1, owner: 'P2', unitId: 'col2' }]);
  });

  it('deux colons visent la même case → UNE seule teinte, gagnant déterministe (plus petit unitId)', () => {
    const s = etat();
    (s.units as Record<string, { q: number; r: number; owner: string; type: string }>).colB = { q: 0, r: 0, owner: 'P1', type: 'colon' };
    const previews = previewPrograms(s, {
      P1: [
        { type: 'MultiStep', unitId: 'col1', path: [{ q: 2, r: 2 }], final: 'foundCity' } as Order,
        { type: 'MultiStep', unitId: 'colB', path: [{ q: 2, r: 2 }], final: 'foundCity' } as Order,
      ],
    });
    const cases = casesApercuFondation({ previews, orders: [], uniteDe: uniteDe(s) });
    expect(cases).toHaveLength(1);
    expect(cases[0]!.unitId).toBe('col1');
  });
});

describe('arretsCanvasApercu — profil culturel EN MIROIR (max au centre, la teinte porte l\'opacité)', () => {
  it('même forme smoothstep inversée : alpha 1 au CENTRE, voile/alphaExt au bord du halo', () => {
    const arrets = arretsCanvasApercu();
    expect(arrets[0]).toEqual([0, 1]);
    const derniere = arrets[arrets.length - 1]!;
    expect(derniere[0]).toBe(1);
    expect(derniere[1]).toBeCloseTo(CALIBRAGE_ZONE_CULTURELLE.alphaVoile / CALIBRAGE_ZONE_CULTURELLE.alphaExt, 12);
    for (const [t, a] of arrets) {
      expect(a).toBeCloseTo(profilAlpha(1 - t, CALIBRAGE_ZONE_CULTURELLE) / CALIBRAGE_ZONE_CULTURELLE.alphaExt, 12);
    }
  });

  it('monotone DÉCROISSANT du centre vers le bord, borné [voile/alphaExt, 1] — aucune marche', () => {
    let prev = 2;
    for (const [, a] of arretsCanvasApercu()) {
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      expect(a).toBeGreaterThanOrEqual(CALIBRAGE_ZONE_CULTURELLE.alphaVoile / CALIBRAGE_ZONE_CULTURELLE.alphaExt - 1e-12);
      prev = a;
    }
  });
});
