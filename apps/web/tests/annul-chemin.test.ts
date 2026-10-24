/**
 * ANNUL-CHEMIN (Erik 24/10) · L1 — bouton « Annuler l'ordre » pour les ordres
 * PERSISTANTS portés par unit.order : chemin gelé (R-158), soin (Heal),
 * vigilance (Sleep). Avant : le bouton n'apparaissait que pour un ordre du
 * jour (view.orders) — une unité avec un chemin gelé du tour précédent
 * n'avait AUCUN moyen de l'annuler. Libellé contextuel (D1), mécanisme
 * existant conservé (D3 : CancelOrder via onCancelOrder).
 * Partie pure (`libelleAnnulationOrdre`) + câblage UnitPanel.svelte
 * (le rendu Svelte n'est pas rejouable en vitest — même convention que
 * fin-de-tour-blocage-ux.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeState } from '@game/rules';
import type { GameState } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';
import { annulationOrdre } from '../src/lib/render/interaction.js';
import { libelleAnnulationOrdre } from '../src/lib/annul-ordre.js';

describe('ANNUL-CHEMIN · libelleAnnulationOrdre', () => {
  it('chemin gelé (Move / MultiStep) → « Annuler le chemin »', () => {
    expect(libelleAnnulationOrdre({ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] })).toBe('Annuler le chemin');
    expect(libelleAnnulationOrdre({ type: 'MultiStep', unitId: 'u1', path: [{ q: 1, r: 0 }], final: 'foundCity' })).toBe('Annuler le chemin');
  });
  it('soin → « Annuler le soin », vigilance → « Annuler la vigilance »', () => {
    expect(libelleAnnulationOrdre({ type: 'Heal', unitId: 'u1' })).toBe('Annuler le soin');
    expect(libelleAnnulationOrdre({ type: 'Sleep', unitId: 'u1' })).toBe('Annuler la vigilance');
  });
  it('ordre du jour non persistant ou absence d\'ordre → null (libellé générique géré par le panneau)', () => {
    expect(libelleAnnulationOrdre({ type: 'Hold', unitId: 'u1' })).toBeNull();
    expect(libelleAnnulationOrdre({ type: 'Fortify', unitId: 'u1' })).toBeNull();
    expect(libelleAnnulationOrdre(null)).toBeNull();
    expect(libelleAnnulationOrdre(undefined)).toBeNull();
  });
});

describe('ANNUL-CHEMIN · annulationOrdre — chemin gelé SANS ordre du jour', () => {
  function viewOf(state: GameState, over: Partial<GameView> = {}): GameView {
    return {
      code: 'ABC123',
      playerId: 'dev:alice',
      players: [
        { id: 'dev:alice', name: 'Alice', engineId: 'p1' },
        { id: 'dev:bob', name: 'Bob', engineId: 'p2' },
      ],
      status: 'active',
      turn: 1,
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

  it('unit.order Move gelé, aucun ordre du jour → ordreExistant true (le CancelOrder PART)', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0, order: { type: 'Move', unitId: 'u1', path: [{ q: 2, r: 0 }] } }],
    });
    const r = annulationOrdre(viewOf(state), uiOf({ selectedUnitId: 'u1' }), 'u1');
    expect(r.ordreExistant).toBe(true);
  });

  it('aucun ordre du jour NI ordre persistant → ordreExistant false (inchangé)', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 }],
    });
    const r = annulationOrdre(viewOf(state), uiOf({ selectedUnitId: 'u1' }), 'u1');
    expect(r.ordreExistant).toBe(false);
  });
});

describe('ANNUL-CHEMIN · câblage UnitPanel.svelte', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/components/UnitPanel.svelte'), 'utf8');

  it('le bouton d\'annulation couvre unit.order (persistant) EN PLUS de l\'ordre du jour', () => {
    // libellé contextuel D1 issu du helper pur, repli générique ordre du jour
    expect(src).toContain("libelleAnnulationOrdre(unit.order)");
    expect(src).toContain("Annuler l'ordre");
    // le bouton n'est plus conditionné au seul currentOrder
    expect(src).not.toMatch(/\{#if currentOrder\}\s*\n\s*<button[^>]*>\s*\n?\s*Annuler l'ordre/);
    expect(src).toMatch(/\{#if libelleAnnul\}/);
  });

  it('l\'annulation passe par le mécanisme existant onCancelOrder (D3 — zéro nouveau message)', () => {
    expect(src).toContain('onCancelOrder(unit.id)');
  });
});
