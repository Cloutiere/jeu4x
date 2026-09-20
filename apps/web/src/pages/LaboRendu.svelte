<script lang="ts">
  /**
   * Labo de rendu des unités (CALIBRATION-UNITES, retour d'Erik du 20/09) —
   * client-side pur (aucune partie, aucun appel /api, miroir #/progen) :
   * le RENDU RÉEL des sprites (GameCanvas) sur une case où l'on empile 1..7
   * unités, avec 1..N nations, pour valider à l'œil la pose (hauteur, pieds)
   * et la répartition GROUPÉE PAR NATION des cohabitations.
   */
  import { writable } from 'svelte/store';
  import GameCanvas from '../lib/render/GameCanvas.svelte';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { initialView } from '../lib/gameClient.js';
  import { createUiState } from '../lib/render/ui.js';
  import { Playback } from '../lib/render/playback.js';
  import { makeState, recomputeVision } from '@game/rules';
  import type { GameState } from '@game/rules';

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

  let nbUnites = $state(2);
  let nbNations = $state(2);
  const NATIONS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

  function construireEtat(): GameState {
    const nations = Math.min(nbNations, nbUnites, 6); // 6 camps max (5 joueurs + barbares)
    const units = [];
    for (let i = 0; i < nbUnites; i++) {
      units.push({
        id: `u${i + 1}`,
        // Nations réparties en entrelacé — le groupement visuel doit les
        // réunir en paquets compacts malgré l'ordre d'insertion.
        owner: NATIONS[i % nations]!,
        type: 'guerrier', // CALIBRATION-UNITES : uniquement des guerriers (retour d'Erik)
        q: 0,
        r: 0,
      });
    }
    return makeState({ width: 8, height: 8, units, cities: [] });
  }

  $effect(() => {
    nbNations;
    nbUnites;
    const state = construireEtat();
    recomputeVision(state); // brouillard : le joueur local voit autour de ses unités
    viewStore.set({
      ...initialView('labo-rendu'),
      status: 'active',
      playerId: 'lab-p1',
      players: NATIONS.map((p, i) => ({ id: `lab-${p}`, name: `Nation ${i + 1}`, engineId: p })),
      turn: 0,
      phase: 'orders',
      state,
      orders: [],
      locked: false,
      events: [],
      lastSeq: 0,
      seenEventSeq: -1,
    });
    canvasApi?.centerOnHex({ q: 0, r: 0 });
  });

  let canvasApi: { centerOnHex(hex: { q: number; r: number }): void } | null = null;
</script>

<main>
  <header>
    <h1>Labo de rendu — cohabitations d'unités</h1>
    <a href="#/lobby">← Lobby</a>
    <p class="hint">
      Rendu RÉEL (GameCanvas). Toutes les unités sont posées sur la case centrale —
      case instable (R-173) : paquets compacts par nation, répartition déterministe.
    </p>
  </header>
  <aside>
    <h2>Case instable</h2>
    <label>
      Nombre d'unités (1–7) : {nbUnites}
      <input type="range" min="1" max="7" bind:value={nbUnites} />
    </label>
    <label>
      Nombre de nations (1–{Math.min(6, nbUnites)}) : {nbNations}
      <input type="range" min="1" max={Math.min(6, Math.max(1, nbUnites))} bind:value={nbNations} />
    </label>
    <p class="hint">
      6 camps maximum (5 joueurs + barbares). Nations attribuées en entrelacé
      (u1→N1, u2→N2, …) : les paquets doivent regrouper chaque nation malgré
      l'ordre d'insertion. Zones : gauche, droite, haut-gauche, haut-droite,
      bas-gauche, bas-droite.
    </p>
  </aside>
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
        api.centerOnHex({ q: 0, r: 0 });
      }}
    />
  </div>
</main>

<style>
  main { max-width: 110rem; margin: 1rem auto; font-family: system-ui, sans-serif; padding: 0 1rem; }
  header h1 { font-size: 1.2rem; margin: 0.6rem 0 0.2rem; }
  .hint { color: #9aa; font-size: 0.85rem; }
  aside {
    margin: 0.6rem 0; padding: 0.6rem 1rem; border: 1px solid #333;
    border-radius: 8px; background: #16161d; color: #dde;
    display: flex; flex-direction: column; gap: 0.4rem; max-width: 28rem;
  }
  /* position: relative OBLIGATOIRE : le host interne de GameCanvas est
     positionné par rapport à son parent (miroir Progen). */
  .canvas-host { position: relative; height: 42rem; border-radius: 8px; overflow: hidden; }
</style>
