/**
 * FUSION-MENU-VILLE (décisions d'Erik du 14/09) — CityPanel est supprimé ;
 * clic simple sur une ville = sélection muette, seul le double-clic ouvre la
 * vue ville. Les barres (nourriture / culture / construction) et le contrôle
 * de conversion R-90 migrent dans CityView — les jauges sont des fonctions
 * pures (`lib/jauges.ts`) testées ici : valeurs, plafond, palier.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { jaugeCroissance, jaugeCulture, jaugeProduction } from '../src/lib/jauges.js';
import { greatPersonThresholdFor, makeState, tileKey } from '@game/rules';
import type { GameState } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import { clickAction, clickActionVueVille } from '../src/lib/render/interaction.js';

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

describe('jaugeCroissance — barre nourriture de la vue ville (R-63)', () => {
  it('seuil LINÉAIRE 10 × pop ACTUELLE : pop 2 → 20, pop 3 → 30', () => {
    expect(jaugeCroissance(2, 0, 0).seuil).toBe(20);
    expect(jaugeCroissance(3, 0, 0).seuil).toBe(30);
  });

  it('ratio = réserve / seuil, plafonné à [0, 1]', () => {
    expect(jaugeCroissance(2, 10, 0).ratio).toBe(0.5);
    expect(jaugeCroissance(2, 35, 0).ratio).toBe(1); // surplus conservé — jauge pleine
    expect(jaugeCroissance(2, 0, 0).ratio).toBe(0);
  });

  it('réduction de seuil (Aqueduc 🔶 0,33 / Zoulous ÷2) appliquée comme au moteur', () => {
    expect(jaugeCroissance(2, 0, 0.5).seuil).toBe(10);
  });

  it('plafond de population (31) : jauge pleine, aucun seuil', () => {
    const g = jaugeCroissance(31, 0, 0);
    expect(g.plafond).toBe(true);
    expect(g.seuil).toBe(0);
    expect(g.ratio).toBe(1);
  });
});

describe('jaugeCulture — barre palier T-27 (cumul EMPIRE)', () => {
  it('seuil = grandPersonThresholdFor(paliers) — palier 1 puis paliers suivants croissants', () => {
    expect(jaugeCulture(0, 0).seuil).toBe(greatPersonThresholdFor(0));
    expect(jaugeCulture(0, 3).seuil).toBe(greatPersonThresholdFor(3));
    expect(jaugeCulture(0, 3).seuil).toBeGreaterThan(jaugeCulture(0, 0).seuil);
  });

  it('ratio = cumul empire / seuil, plafonné à [0, 1]', () => {
    const seuil = greatPersonThresholdFor(0);
    expect(jaugeCulture(Math.floor(seuil / 2), 0).ratio).toBeCloseTo(0.5, 6);
    expect(jaugeCulture(seuil * 5, 0).ratio).toBe(1);
    expect(jaugeCulture(0, 0).ratio).toBe(0);
  });
});

describe('jaugeProduction — barre de la carte Production (marteaux / coût)', () => {
  it('progression partielle et plafond', () => {
    expect(jaugeProduction(30, 60)).toBe(0.5);
    expect(jaugeProduction(90, 60)).toBe(1);
    expect(jaugeProduction(0, 60)).toBe(0);
  });

  it('état vide honnête : coût infini (aucun item) → jauge vide', () => {
    expect(jaugeProduction(10, Infinity)).toBe(0);
    expect(jaugeProduction(10, 0)).toBe(0);
  });
});

describe('FUSION-MENU-VILLE — CityPanel supprimé, clic simple = sélection muette', () => {
  function etatVille(): GameState {
    return makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 0 }],
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: [tileKey(1, 0)], buildings: ['palais'] }],
    });
  }

  it('clic simple sur une ville : selectCity (sélection muette — worked tiles à la carte conservés)', () => {
    const view = viewOf(etatVille());
    expect(clickAction(view, { selectedUnitId: null, selectedCityId: null, draft: null }, { q: 0, r: 0 })).toEqual({
      kind: 'selectCity',
      cityId: 'c1',
    });
    // alternances existantes : re-clic sur la ville sélectionnée = désélection,
    // worked tiles de la ville sélectionnée inchangés (R-60)
    expect(clickAction(view, { selectedUnitId: null, selectedCityId: 'c1', draft: null }, { q: 0, r: 0 })).toEqual({ kind: 'deselect' });
    expect(clickAction(view, { selectedUnitId: null, selectedCityId: 'c1', draft: null }, { q: 0, r: 1 })).toEqual({
      kind: 'setWorkedTile',
      cityId: 'c1',
      tile: tileKey(0, 1),
    });
  });

  it('double-clic inchangé : la vue ville reste cliquable tuile par tuile (miroir R-60)', () => {
    const view = viewOf(etatVille());
    expect(clickActionVueVille(view, 'c1', { q: 0, r: 1 })).toEqual({ kind: 'setWorkedTile', cityId: 'c1', tile: tileKey(0, 1) });
  });

  it('aucun flux mort : CityPanel n\'est plus monté ni importé (commentaires tolérés)', () => {
    const game = readFileSync(fileURLToPath(new URL('../src/pages/Game.svelte', import.meta.url)), 'utf8');
    expect(game).not.toContain('<CityPanel');
    expect(game).not.toContain("components/CityPanel.svelte'");
    expect(readFileSync(fileURLToPath(new URL('../src/components/CityView.svelte', import.meta.url)), 'utf8')).toContain('SetConversion');
  });
});
