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
  // PLACEMENT-MELEE (L3) : scénario mêlée — le labo pilote le store du
  // contexte (côtés d'entrée + stabilisée) que GameCanvas consomme.
  import { contexteMelee } from '../lib/melee.js';
  import type { ContexteMelee, Cote } from '../lib/melee.js';

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
  const COTES: Array<Cote | '?'> = ['O', 'E', 'NO', 'NE', 'SO', 'SE', '?'];
  const LIBELLES_COTES: Record<string, string> = {
    O: '← ouest',
    E: 'est →',
    NO: '↖ nord-ouest',
    NE: 'nord-est ↗',
    SO: '↙ sud-ouest',
    SE: 'sud-est ↘',
    '?': '? sans info (repli zones)',
  };

  // PLACEMENT-MELEE rév. 21/09 : TOUTE cohabitation (mêlée ou pile amie)
  // est posée par côtés d'entrée — le labo ne distingue plus de régime.
  // Côté d'entrée simulé par unité (index parallèle aux unités posées) ;
  // « ? » = sans info → repli sur l'ancien remplissage par zones (D1).
  let cotes = $state<(Cote | '?')[]>([]);
  // Unité stabilisée à la création de la mêlée (index, -1 = morte/absente —
  // démo du centre vide, D3).
  let stabiliseeIdx = $state(0);

  function construireEtat(): GameState {
    const nations = Math.min(nbNations, nbUnites, 6);
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

  function contexteDuLabo(): ContexteMelee {
    const coteParUnite = new Map();
    cotes.forEach((c, i) => {
      if (c !== '?') coteParUnite.set(`u${i + 1}`, { cote: c, ordre: i + 1 });
    });
    const stabiliseeParCase = new Map();
    if (stabiliseeIdx >= 0 && stabiliseeIdx < nbUnites) {
      stabiliseeParCase.set('0,0', `u${stabiliseeIdx + 1}`);
    }
    return { coteParUnite, stabiliseeParCase };
  }

  $effect(() => {
    nbNations;
    nbUnites;
    // Les listes de côtés suivent le nombre d'unités (nouvelles = premier
    // côté libre dans l'ordre de remplissage).
    if (cotes.length !== nbUnites) {
      const anciens = cotes;
      cotes = Array.from({ length: nbUnites }, (_, i) => anciens[i] ?? COTES[i % 6]!);
    }
    if (stabiliseeIdx >= nbUnites) stabiliseeIdx = nbUnites - 1;
    const state = construireEtat();
    contexteMelee.set(contexteDuLabo());
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
      toute cohabitation (mêlée ou pile amie, rév. Erik 21/09) est posée par
      côtés d'entrée ; l'unité au centre prend le cran intermédiaire.
    </p>
  </header>
  <aside>
    <h2>Cohabitation sur la case centrale (rév. 21/09)</h2>
    <label>
      Nombre d'unités (1–7) : {nbUnites}
      <input type="range" min="1" max="7" bind:value={nbUnites} />
    </label>
    <label>
      Nombre de nations (1–{Math.min(6, nbUnites)}) : {nbNations}
      <input type="range" min="1" max={Math.min(6, Math.max(1, nbUnites))} bind:value={nbNations} />
    </label>
    <h2>Côtés d'entrée &amp; unité au centre</h2>
    {#each Array(nbUnites) as _, i (i)}
      <div class="ligne-melee">
        <span class="u">u{i + 1} · {NATIONS[i % Math.max(1, Math.min(nbNations, nbUnites, 6))]}</span>
        <select bind:value={cotes[i]}>
          {#each COTES as c (c)}
            <option value={c}>{LIBELLES_COTES[c]}</option>
          {/each}
        </select>
        <label class="radio">
          <input type="radio" name="stabilisee" checked={stabiliseeIdx === i} onchange={() => (stabiliseeIdx = i)} />
          centre
        </label>
      </div>
    {/each}
    <label class="radio">
      <input type="radio" name="stabilisee" checked={stabiliseeIdx === -1} onchange={() => (stabiliseeIdx = -1)} />
      stabilisée MORTE — centre vide (D3)
    </label>
    <p class="hint">
      Toute cohabitation (mêlée OU pile amie) : chaque unité est posée sur le
      côté par lequel elle est ENTRÉE (face au voisin d'où elle vient) ;
      l'unité au CENTRE prend le cran intermédiaire ; « ? » = sans info →
      repli sur l'ancien remplissage par zones. Ordre d'arrivée = ordre de la
      liste (les dernières se placent DERRIÈRE dans leur section).
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
  .ligne-melee { display: flex; align-items: center; gap: 0.4rem; }
  .ligne-melee .u { min-width: 6.5rem; font-size: 0.8rem; }
  .ligne-melee select { flex: 1; }
  .radio { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
  h2 { font-size: 0.9rem; margin: 0.4rem 0 0.1rem; }
</style>
