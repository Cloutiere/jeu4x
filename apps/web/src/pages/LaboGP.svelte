<script lang="ts">
  /**
   * Labo GP-ART (27/09) — client-side pur (miroir #/labo-rendu, aucun appel
   * /api) : les 6 classes de Personnages Illustres = SVG d'Erik (import_svg.mjs
   * profils gp-*) posées SEULES sur leurs tuiles, à côté du guerrier (calibre
   * de référence : même hauteur de contenu à l'écran). Barbare + camp : le
   * sprite peint d'Erik (vérification post-cache, D5).
   */
  import { writable } from 'svelte/store';
  import GameCanvas from '../lib/render/GameCanvas.svelte';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { initialView } from '../lib/gameClient.js';
  import { createUiState } from '../lib/render/ui.js';
  import { Playback } from '../lib/render/playback.js';
  import { makeState, recomputeVision, colRowToHex, tileKeyOf } from '@game/rules';
  import type { GameState, TerrainId } from '@game/rules';

  const ui = createUiState();
  const playback = new Playback();
  const viewStore = writable<GameView>(initialView('labo-rendu'));
  const fakeClient = {
    view: viewStore,
    status: writable('connected'),
    error: writable(null),
    submitOrder: () => {},
    cancelOrderFor: () => {},
    cancelCityOrder: () => {},
    endTurn: () => {},
    setResearch: () => {},
    setConversion: () => {},
    resync: () => {},
    close: () => {},
  } as unknown as GameClient;

  function construireEtat(): GameState {
    const units: Array<{ id: string; owner: string; type: string; q: number; r: number }> = [];
    const TERRAINS_DEMO: Record<string, string> = {};
    // Rangée principale r=2 : guerrier (calibre référence) puis les 6 GP,
    // une unité SEULE par tuile (lecture individuelle, calibre comparable).
    const RANGEE: Array<[string, string]> = [
      ['guerrier', 'p1'],
      ['artiste_penseur', 'p1'],
      ['batisseur', 'p2'],
      ['humanitaire', 'p3'],
      ['explorateur', 'p4'],
      ['leader', 'p5'],
      ['savant', 'p6'],
    ];
    RANGEE.forEach(([type, owner], i) => {
      const h = colRowToHex(i, 2);
      TERRAINS_DEMO[tileKeyOf(h)] = 'prairie';
      units.push({ id: `gp${i + 1}`, owner, type, q: h.q, r: h.r });
    });
    // Barbare (sprite peint d'Erik) + son camp — vérification D5 post-cache.
    const hb = colRowToHex(0, 0);
    TERRAINS_DEMO[tileKeyOf(hb)] = 'prairie';
    units.push({ id: 'barb1', owner: 'barbarien', type: 'guerrier', q: hb.q, r: hb.r });
    const terrainOverrides: Record<string, TerrainId> = Object.fromEntries(
      Object.entries(TERRAINS_DEMO).map(([k, t]) => [k, t as TerrainId]),
    );
    const state = makeState({
      width: 8, height: 5, units, cities: [], terrainOverrides,
      villages: [(() => { const h = colRowToHex(2, 0); return { q: h.q, r: h.r }; })()],
    });
    return state;
  }

  $effect(() => {
    const state = construireEtat();
    recomputeVision(state);
    // Labo : la carte est entièrement visible (brouillard désactivé) —
    // APRÈS recomputeVision, qui sinon rétablit le brouillard des non-p1.
    const toutesCases = Object.keys(state.map).sort();
    for (const p of Object.values(state.players)) {
      p.vision = { explored: toutesCases, visible: toutesCases };
    }
    viewStore.set({
      ...initialView('labo-rendu'),
      status: 'active',
      playerId: 'lab-p1',
      players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((p, i) => ({ id: `lab-${p}`, name: `Nation ${i + 1}`, engineId: p })),
      turn: 0,
      phase: 'orders',
      state,
      orders: [],
      locked: false,
      events: [],
      lastSeq: 0,
      seenEventSeq: -1,
    });
    canvasApi?.centerOnHex({ q: 3, r: 2 });
  });

  let canvasApi: { centerOnHex(hex: { q: number; r: number }): void } | null = null;
</script>

<main>
  <header>
    <h1>Labo GP-ART — Personnages Illustres (SVG d'Erik)</h1>
    <a href="#/lobby">← Lobby</a>
    <p class="hint">
      Rangée du bas : guerrier (calibre de référence) puis artiste/penseur,
      bâtisseur, humanitaire, explorateur (= industriel), leader, savant —
      une unité seule par tuile, même hauteur de contenu à l'écran.
      En haut à gauche : barbare + camp (vérification post-cache).
    </p>
  </header>
  <div class="canvas-host">
    <GameCanvas
      client={fakeClient}
      {ui}
      {playback}
      onAction={() => {}}
      onRightClick={() => {}}
      onCancelDraft={() => {}}
      onReady={(api) => {
        canvasApi = api;
        api.centerOnHex({ q: 3, r: 2 });
      }}
    />
  </div>
</main>

<style>
  main { max-width: 110rem; margin: 1rem auto; font-family: system-ui, sans-serif; padding: 0 1rem; }
  header h1 { font-size: 1.2rem; margin: 0.6rem 0 0.2rem; }
  .hint { color: #9aa; font-size: 0.85rem; }
  /* position: relative OBLIGATOIRE : le host interne de GameCanvas est
     positionné par rapport à son parent (miroir Progen). */
  .canvas-host { position: relative; height: 42rem; border-radius: 8px; overflow: hidden; }
</style>
