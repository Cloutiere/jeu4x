<script lang="ts">
  /**
   * Labo CULTURE-RESSOURCES (mission du 02/10, décisions d'Erik) — client
   * pur (aucune partie), miroir #/labo-rendu : le rendu RÉEL (GameCanvas)
   * d'une capitale qui travaille une case d'ENCENS (+2 culture/tour, canal
   * générique `culture > 0`, R-93) + case SOIE (identité cachée avant
   * Littératie — aucun glyphe) + GEMMES/OR (glyphe or direct R-134, qui ne
   * suit PAS la conversion R-90). Bascule Rites funéraires : encens caché
   * (aucun glyphe, 0 culture) / révélé (glyphe +2) — les captures avant/après.
   * PanneauVille RÉEL à droite : ligne culture/tour (miroir du moteur).
   */
  import { writable, get } from 'svelte/store';
  import GameCanvas from '../lib/render/GameCanvas.svelte';
  import PanneauVille from '../components/PanneauVille.svelte';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { initialView } from '../lib/gameClient.js';
  import { createUiState } from '../lib/render/ui.js';
  import { Playback } from '../lib/render/playback.js';
  import { makeState, recomputeVision, colRowToHex, tileKeyOf } from '@game/rules';
  import type { GameState } from '@game/rules';
  // Les glyphes de rendement suivent le filtre de carte du jeu réel
  // (panneau minimap) — le labo force le mode « rendements affichés ».
  import { filtresCarte } from '../lib/filtresCarte.js';

  const ui = createUiState();
  const playback = new Playback();
  const viewStore = writable<GameView>(initialView('labo-culture'));
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

  // Bascule de la mission : Rites funéraires connues (encens révélé — glyphe
  // +2 culture) ou pas (identité « inconnue » — aucun glyphe, culture 0).
  let avecTechs = $state(true);
  const VILLE_ID = 'c1';
  const POS_VILLE = colRowToHex(4, 12);
  const POS_ENCENS = tileKeyOf(colRowToHex(3, 12));
  const POS_SOIE = tileKeyOf(colRowToHex(5, 12));

  function construireEtat(): GameState {
    const state = makeState({
      width: 9,
      height: 15,
      players: ['p1', 'p2'],
      cities: [
        {
          id: VILLE_ID, owner: 'p1', q: POS_VILLE.q, r: POS_VILLE.r,
          capital: true, pop: 2, buildings: ['palais'], workedTiles: [POS_ENCENS],
        },
      ],
    });
    // Encens TRAVAILLÉ (gauche), soie NON travaillée et cachée (droite),
    // gemmes/or au-dessus (identités libres — glyphe or direct).
    // Miroir de l'état FILTRÉ (R-92) : une ressource cachée est diffusée
    // « inconnue » — tuile de terrain + jeton « ? », aucun glyphe.
    state.map[POS_ENCENS] = { terrain: 'prairie', resource: avecTechs ? 'encens' : 'inconnue' };
    state.map[POS_SOIE] = { terrain: 'plaine', resource: 'inconnue' };
    state.map[tileKeyOf(colRowToHex(4, 10))] = { terrain: 'montagne', resource: 'gemmes' };
    state.map[tileKeyOf(colRowToHex(5, 11))] = { terrain: 'montagne', resource: 'or' };
    state.players['p1']!.techsUnlocked = avecTechs ? ['rites_funeraires'] : [];
    return state;
  }

  $effect(() => {
    filtresCarte.set({ ...get(filtresCarte), rendements: 1 });
    const state = construireEtat();
    recomputeVision(state);
    // Labo : la carte est entièreRement visible (miroir labo-rendu).
    const toutesCases = Object.keys(state.map).sort();
    for (const p of Object.values(state.players)) {
      p.vision = { explored: toutesCases, visible: toutesCases };
    }
    viewStore.set({
      ...initialView('labo-culture'),
      status: 'active',
      playerId: 'lab-p1',
      players: [
        { id: 'lab-p1', name: 'Nation 1', engineId: 'p1' },
        { id: 'lab-p2', name: 'Nation 2 (bot)', engineId: 'p2' },
      ],
      turn: 1,
      phase: 'orders',
      state,
      orders: [],
      locked: false,
      events: [],
      lastSeq: 0,
      seenEventSeq: -1,
    });
    canvasApi?.centerOnHex({ q: POS_VILLE.q, r: POS_VILLE.r });
  });

  let canvasApi: { centerOnHex(hex: { q: number; r: number }): void } | null = null;
</script>

<main>
  <header>
    <h1>Labo culture-ressources — encens +2, soie cachée, or direct</h1>
    <a href="#/lobby">← Lobby</a>
    <p class="hint">
      Rendu RÉEL (GameCanvas). La capitale travaille l'ENCENS (case ouest) :
      glyphe <strong>+2 culture</strong> (icône des paliers) si Rites
      funéraires sont connues, rien sinon (identité cachée R-92). La SOIE
      (est) reste cachée avant Littératie — aucun glyphe. GEMMES +2 / OR +3 :
      glyphe or DIRECT (versé à la trésorerie, ne suit PAS la conversion
      R-90).
    </p>
    <label class="toggle">
      <input type="checkbox" bind:checked={avecTechs} />
      Rites funéraires connues (encens révélé : +2 culture/tour)
    </label>
  </header>
  <div class="canvas-host">
    <GameCanvas
      client={fakeClient}
      {ui}
      {playback}
      showYields={true}
      onAction={() => {}}
      onRightClick={() => {}}
      onCancelDraft={() => {}}
      onReady={(api) => {
        canvasApi = api;
        api.centerOnHex({ q: POS_VILLE.q, r: POS_VILLE.r });
      }}
    />
    <PanneauVille view={$viewStore} client={fakeClient} cityId={VILLE_ID} onFermer={() => {}} />
  </div>
</main>

<style>
  :global(html, body) { margin: 0; background: #101418; color: #dde; font-family: system-ui, sans-serif; }
  main { display: flex; flex-direction: column; height: 100vh; }
  header { padding: 0.4rem 1rem; border-bottom: 1px solid #2c353d; }
  header h1 { font-size: 1rem; margin: 0.1rem 0; }
  .hint { color: #8a949c; font-size: 0.8rem; margin: 0.25rem 0; max-width: 64rem; }
  .toggle { font-size: 0.85rem; }
  /* position: relative OBLIGATOIRE : le host interne de GameCanvas est
     positionné par rapport à son parent (miroir labo-rendu). */
  .canvas-host { position: relative; flex: 1; min-height: 0; overflow: hidden; }
</style>
