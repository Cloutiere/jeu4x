/**
 * REGLAGES-CALIBRAGE (Erik 29/09) · Réglage 3 — menu « unités sans ordre » :
 * boutons Voir / Suivant. Le centrage passe par `centerOnHex` (journal
 * cliquable REPLAY-RESOLUTION — zoom PRÉSERVÉ, camera.centerOn ne touche pas
 * scale). On teste ici la partie pure : l'ordre déterministe (R-81) de la
 * liste, et le câblage du menu (le rendu Pixi n'est pas rejouable en vitest).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeState } from '@game/rules';
import type { GameState } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import { unitsWithoutOrders } from '../src/lib/render/interaction.js';

function viewOf(state: GameState): GameView {
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
  };
}

describe('REGLAGES-CALIBRAGE · menu unités sans ordre (Voir / Suivant)', () => {
  it('la liste est déterministe (R-81) et recyclable pour Suivant (ordre stable)', () => {
    const state = makeState({
      width: 8,
      height: 8,
      units: [
        { id: 'u7', type: 'guerrier', owner: 'p1', q: 3, r: 0 },
        { id: 'u2', type: 'colon', owner: 'p1', q: 1, r: 0 },
        { id: 'u5', type: 'guerrier', owner: 'p1', q: 2, r: 0, fortified: true }, // R-33 : hors liste
      ],
    });
    const a = unitsWithoutOrders(viewOf(state));
    const b = unitsWithoutOrders(viewOf(state));
    expect(a).toEqual(b);
    expect(a).toEqual(['u2', 'u7']); // tri déterministe, fortifiée exclue
  });

  it('le menu câble Voir (sélection + centrage) et Suivant (cycle, n / total)', () => {
    const src = readFileSync(resolve(import.meta.dirname, '../src/pages/Game.svelte'), 'utf8');
    expect(src).toMatch(/voirUniteSansOrdre/);
    expect(src).toMatch(/suivantUniteSansOrdre/);
    expect(src).toMatch(/Suivant \(\{idleIndex \+ 1\} \/ \{idleUnits\.length\}\)/);
    // Voir passe par le même pipeline que le clic carte (sélection → panneau).
    expect(src).toMatch(/selectedUnitId: u\.id/);
    // Le centrage utilise centerOnHex (zoom préservé — REPLAY-RESOLUTION).
    expect(src).toMatch(/canvasApi\?\.centerOnHex\(\{ q: u\.q, r: u\.r \}\)/);
  });
});
