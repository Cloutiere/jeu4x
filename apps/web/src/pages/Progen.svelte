<script lang="ts">
  /**
   * Phase 6b L4 — Labo de calibration des cartes (#/progen).
   *
   * Génération CLIENT-SIDE (le générateur est pur — zéro IO, zéro partie) :
   *  - seed saisissable + bouton « seed aléatoire » ;
   *  - rendu carte entière SANS fog (état synthétique « tout visible ») via le
   *    GameCanvas du jeu — terrains, ressources, villages/huttes, capitales ;
   *  - calques de calibrage : rendements N/P/C, heatmap de fertilité, spawns ;
   *  - réglages = paramètres du générateur exposés en curseurs, chaque
   *    changement RÉGÈNÈRE à la volée (défauts = DEFAULT_PROGEN_SETTINGS) ;
   *  - export : télécharger la carte en JSON (format MapData — committable
   *    dans les cartes préfabriquées si Erik le souhaite) + copier le JSON.
   */
  import { writable } from 'svelte/store';
  import {
    DEFAULT_PROGEN_SETTINGS,
    countResourcesByTerrain,
    countTerrainTypes,
    createInitialState,
    fertilityHeatmap,
    generateProceduralMap,
  } from '@game/rules';
  import type { ProgenReport, ResourceTerrainCounts, TerrainCountRow } from '@game/rules';
  import type { GameState } from '@game/shared';
  import GameCanvas from '../lib/render/GameCanvas.svelte';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { initialView } from '../lib/gameClient.js';
  import { createUiState } from '../lib/render/ui.js';
  import { Playback } from '../lib/render/playback.js';

  // --- Réglages (défauts = settings du générateur) ---------------------------
  let seed = $state(20260902);
  let seedText = $state('20260902');
  let landRatio = $state(DEFAULT_PROGEN_SETTINGS.landRatio);
  let continents = $state<1 | 2>(DEFAULT_PROGEN_SETTINGS.continents);
  let rifts = $state(DEFAULT_PROGEN_SETTINGS.rifts);
  let coastWidth = $state(DEFAULT_PROGEN_SETTINGS.coastWidth);
  let mountainDensity = $state(DEFAULT_PROGEN_SETTINGS.mountainDensity);
  let hillDensity = $state(DEFAULT_PROGEN_SETTINGS.hillDensity);
  let forestDensity = $state(DEFAULT_PROGEN_SETTINGS.forestDensity);
  let desertDensity = $state(DEFAULT_PROGEN_SETTINGS.desertDensity);
  let prairieDensity = $state(DEFAULT_PROGEN_SETTINGS.prairieDensity);
  let terrainPatchScale = $state(DEFAULT_PROGEN_SETTINGS.terrainPatchScale);
  let resourceDensity = $state(DEFAULT_PROGEN_SETTINGS.resourceDensity);
  let minResourceDistance = $state(DEFAULT_PROGEN_SETTINGS.minResourceDistance);
  let minPerResourceType = $state(DEFAULT_PROGEN_SETTINGS.minPerResourceType);
  let villagesPerHalf = $state(DEFAULT_PROGEN_SETTINGS.villagesPerHalf);
  let hutsPerHalf = $state(DEFAULT_PROGEN_SETTINGS.hutsPerHalf);
  let minSpawnDistance = $state(DEFAULT_PROGEN_SETTINGS.minSpawnDistance);
  let minVillageDistance = $state(DEFAULT_PROGEN_SETTINGS.minVillageDistance);
  let minHutDistance = $state(DEFAULT_PROGEN_SETTINGS.minHutDistance);
  let villageSpacing = $state(DEFAULT_PROGEN_SETTINGS.villageSpacing);
  let hutSpacing = $state(DEFAULT_PROGEN_SETTINGS.hutSpacing);
  let hutVillageSpacing = $state(DEFAULT_PROGEN_SETTINGS.hutVillageSpacing);

  // --- Affichage --------------------------------------------------------------
  let showHeatmap = $state(true);
  let showYields = $state(true);
  let hideEntities = $state(false);
  let error = $state<string | null>(null);
  let copied = $state(false);

  let report = $state<ProgenReport | null>(null);
  let heat = $state<Record<string, number> | null>(null);
  let resCounts = $state<ResourceTerrainCounts | null>(null);
  let terrainCounts = $state<TerrainCountRow[] | null>(null);

  /** Colonnes du tableau de comptage : terrains réellement porteurs sur la
   *  carte, dans l'ordre canonique (terres puis eaux), extras triés derrière. */
  const TERRAIN_COLUMN_ORDER = ['prairie', 'plaine', 'foret', 'colline', 'montagne', 'desert', 'eau', 'ocean'];
  const TERRAIN_ABBREV: Record<string, string> = {
    prairie: 'Pra', plaine: 'Pla', foret: 'For', colline: 'Col',
    montagne: 'Mnt', desert: 'Des', eau: 'Mer', ocean: 'Océ',
  };
  let resColumns = $derived.by(() => {
    if (!resCounts) return [];
    const present = Object.keys(resCounts.byTerrain);
    const known = TERRAIN_COLUMN_ORDER.filter((t) => present.includes(t));
    const extra = present.filter((t) => !TERRAIN_COLUMN_ORDER.includes(t)).sort();
    return [...known, ...extra];
  });

  // --- État synthétique « tout visible » + faux client (aucune partie) -------
  const ui = createUiState();
  const playback = new Playback();
  const viewStore = writable<GameView>(initialView('progen'));
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

  function regenerate(): void {
    error = null;
    copied = false;
    try {
      const result = generateProceduralMap(seed, {
        landRatio,
        continents,
        rifts,
        coastWidth,
        mountainDensity,
        hillDensity,
        forestDensity,
        desertDensity,
        prairieDensity,
        terrainPatchScale,
        resourceDensity,
        minResourceDistance,
        minPerResourceType,
        villagesPerHalf,
        hutsPerHalf,
        minSpawnDistance,
        minVillageDistance,
        minHutDistance,
        villageSpacing,
        hutSpacing,
        hutVillageSpacing,
      });
      report = result.report;
      resCounts = countResourcesByTerrain(result.map);
      terrainCounts = countTerrainTypes(result.map);
      // Le MapData complet est gardé pour l'export (format des cartes
      // préfabriquées — inspectable, committable).
      lastMapData = result.map.data;
      // État initial complet, vision TOTALE des deux joueurs (sans fog).
      const state: GameState = createInitialState(result.map, seed);
      const allKeys = Object.keys(state.map).sort();
      for (const player of Object.values(state.players)) {
        player.vision = { explored: [...allKeys], visible: [...allKeys] };
      }
      viewStore.set({
        ...initialView('progen'),
        status: 'active',
        playerId: 'p1',
        players: [
          { id: 'lab-host', name: 'Joueur 1', engineId: 'p1' },
          { id: 'lab-other', name: 'Joueur 2', engineId: 'p2' },
        ],
        turn: 0,
        phase: 'orders',
        state,
        orders: [],
        locked: false,
        events: [],
        lastSeq: 0,
        seenEventSeq: 0,
      });
      heat = showHeatmap ? fertilityHeatmap(result.map) : null;
    } catch (e) {
      report = null;
      heat = null;
      resCounts = null;
      terrainCounts = null;
      lastMapData = null;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // Régénération à la volée : tout curseur/seed/toggle recalcule la carte.
  $effect(() => {
    void seed;
    void landRatio;
    void continents;
    void rifts;
    void coastWidth;
    void mountainDensity;
    void hillDensity;
    void forestDensity;
    void desertDensity;
    void prairieDensity;
    void terrainPatchScale;
    void resourceDensity;
    void minResourceDistance;
    void minPerResourceType;
    void villagesPerHalf;
    void hutsPerHalf;
    void minSpawnDistance;
    void minVillageDistance;
    void minHutDistance;
    void villageSpacing;
    void hutSpacing;
    void hutVillageSpacing;
    void showHeatmap;
    regenerate();
  });

  function randomSeed(): void {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    seed = buf[0]! >>> 0;
    seedText = String(seed);
  }

  function applySeedText(): void {
    const parsed = Number.parseInt(seedText, 10);
    if (Number.isFinite(parsed) && parsed >= 0) seed = parsed >>> 0;
    else seedText = String(seed);
  }

  function exportJson(): void {
    if (!lastMapData) return;
    const blob = new Blob([currentMapJson() ?? ''], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `procedural-40-seed${seed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyJson(): Promise<void> {
    const json = currentMapJson();
    if (!json) return;
    await navigator.clipboard.writeText(json);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  /** MapData du dernier rendu (format des cartes préfabriquées). */
  let lastMapData: unknown = null;
  function currentMapJson(): string | null {
    return lastMapData ? JSON.stringify(lastMapData, null, 2) : null;
  }
</script>

<main class="progen">
  <header>
    <h1>Labo de cartes — génération procédurale</h1>
    <a href="#/lobby">← Lobby</a>
  </header>
  <p class="hint">
    Outil de calibrage 100 % client-side (aucune partie). Le miroir 1v1 garantit
    l'équité : tout ce qui existe côté joueur 1 existe à l'identique côté joueur 2.
  </p>

  <div class="columns">
    <aside>
      <section>
        <h2>Graine</h2>
        <label>
          Seed
          <input type="number" bind:value={seedText} oninput={applySeedText} min="0" max="4294967295" />
        </label>
        <button type="button" onclick={randomSeed}>Seed aléatoire</button>
      </section>

      <section>
        <h2>Réglages du générateur</h2>
        <label>
          Ratio terre : {Math.round(landRatio * 100)} %
          <input type="range" min="0.35" max="0.7" step="0.01" bind:value={landRatio} />
        </label>
        <label>
          Continents
          <select bind:value={continents}>
            <option value={1}>Pangée (rifts intérieurs)</option>
            <option value={2}>Deux continents (rift + isthme)</option>
          </select>
        </label>
        <label>
          Rifts : {rifts}
          <input type="range" min="0" max="3" step="1" bind:value={rifts} />
        </label>
        <label>
          Largeur des côtes : {coastWidth}
          <input type="range" min="1" max="3" step="1" bind:value={coastWidth} />
        </label>
        <label>
          Montagnes : {Math.round(mountainDensity * 100)} %
          <input type="range" min="0" max="1" step="0.01" bind:value={mountainDensity} />
        </label>
        <label>
          Collines : {Math.round(hillDensity * 100)} %
          <input type="range" min="0" max="1" step="0.01" bind:value={hillDensity} />
        </label>
        <label>
          Forêts : {Math.round(forestDensity * 100)} %
          <input type="range" min="0" max="1" step="0.01" bind:value={forestDensity} />
        </label>
        <label>
          Déserts : {Math.round(desertDensity * 100)} %
          <input type="range" min="0" max="1" step="0.01" bind:value={desertDensity} />
        </label>
        <label>
          Prairies ↔ Plaines : {Math.round(prairieDensity * 100)} % de prairies
          <input type="range" min="0" max="1" step="0.01" bind:value={prairieDensity} />
        </label>
        <label>
          Mosaïque (taille des zones) : ×{terrainPatchScale.toFixed(2)}
          <input type="range" min="0.25" max="1.5" step="0.05" bind:value={terrainPatchScale} />
        </label>
        <label>
          Densité ressources : ×{resourceDensity.toFixed(1)}
          <input type="range" min="0" max="3" step="0.1" bind:value={resourceDensity} />
        </label>
        <label>
          Écart ressources : {minResourceDistance}{#if minResourceDistance > 1} (1 case vide entre deux){/if}
          <input type="range" min="1" max="4" step="1" bind:value={minResourceDistance} />
        </label>
        <label>
          Min par type : {minPerResourceType} par joueur
          <input type="range" min="0" max="2" step="1" bind:value={minPerResourceType} />
        </label>
        <label>
          Villages (par moitié) : {villagesPerHalf}
          <input type="range" min="0" max="12" step="1" bind:value={villagesPerHalf} />
        </label>
        <label>
          Huttes (par moitié) : {hutsPerHalf}
          <input type="range" min="0" max="12" step="1" bind:value={hutsPerHalf} />
        </label>
        <label>
          Distance de spawn : {minSpawnDistance}
          <input type="range" min="8" max="30" step="1" bind:value={minSpawnDistance} />
        </label>
        <label>
          Villages ↔ départs : {minVillageDistance}
          <input type="range" min="0" max="12" step="1" bind:value={minVillageDistance} />
        </label>
        <label>
          Huttes ↔ départs : {minHutDistance}
          <input type="range" min="0" max="12" step="1" bind:value={minHutDistance} />
        </label>
        <label>
          Villages entre eux : {villageSpacing}
          <input type="range" min="0" max="12" step="1" bind:value={villageSpacing} />
        </label>
        <label>
          Huttes entre elles : {hutSpacing}
          <input type="range" min="0" max="12" step="1" bind:value={hutSpacing} />
        </label>
        <label>
          Huttes ↔ villages : {hutVillageSpacing} (jamais à côté)
          <input type="range" min="0" max="12" step="1" bind:value={hutVillageSpacing} />
        </label>
      </section>

      <section>
        <h2>Calques de calibrage</h2>
        <label class="check"><input type="checkbox" bind:checked={showHeatmap} /> Heatmap de fertilité</label>
        <label class="check"><input type="checkbox" bind:checked={showYields} /> Rendements N/P/C</label>
        <label class="check"><input type="checkbox" bind:checked={hideEntities} /> Masquer entités</label>
      </section>

      <section>
        <h2>Checksum d'équité</h2>
        {#if report}
          <table>
            <tbody>
              <tr><td>Fertilité P1</td><td>{report.fertility.p1.toFixed(1)}</td></tr>
              <tr><td>Fertilité P2</td><td>{report.fertility.p2.toFixed(1)}</td></tr>
              <tr><td>Δ (miroir)</td><td class:zero={report.fertility.delta === 0}>{report.fertility.delta}</td></tr>
              <tr><td>Seuil normalisation</td><td>{report.fertility.threshold.toFixed(1)}</td></tr>
              <tr><td>Normalisée</td><td>{report.fertility.normalized ? 'oui' : 'non'}</td></tr>
              <tr><td>Ratio terre</td><td>{(report.landRatio * 100).toFixed(1)} %</td></tr>
              <tr><td>Côte / Océan</td><td>{report.coastTiles} / {report.oceanTiles}</td></tr>
              <tr><td>Connexité</td><td>{report.connected ? 'OK' : 'KO'}</td></tr>
              <tr><td>Tentatives</td><td>{report.attempts}</td></tr>
              <tr><td>Ressources</td><td>{report.counts.resources}</td></tr>
              <tr><td>Villages / Huttes</td><td>{report.counts.villages} / {report.counts.huts}</td></tr>
            </tbody>
          </table>
        {:else if !error}
          <p>Génération…</p>
        {/if}
      </section>

      <section>
        <h2>Terrains par type</h2>
        {#if terrainCounts}
          <table class="terrain-table">
            <tbody>
              {#each terrainCounts as row (row.id)}
                <tr class:absent={row.count === 0 && row.id !== 'ville'}>
                  <td>{row.name}</td>
                  <td>{row.count}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="hint-small">
            Une ligne grisée = terrain absent de cette carte (« Case de ville » n'est
            jamais générée : c'est une entité posée sur les capitales).
          </p>
        {:else if !error}
          <p>Génération…</p>
        {/if}
      </section>

      <section>
        <h2>Ressources par type et par terrain</h2>
        {#if resCounts}
          <div class="res-scroll">
            <table class="res-table">
              <thead>
                <tr>
                  <th>Ressource</th>
                  {#each resColumns as c}<th title={c}>{TERRAIN_ABBREV[c] ?? c.slice(0, 3)}</th>{/each}
                  <th>Tot</th>
                </tr>
              </thead>
              <tbody>
                {#each resCounts.byId as row (row.id)}
                  <tr class:absent={row.total === 0}>
                    <td>{row.name}</td>
                    {#each resColumns as c}
                      <td class:zero={!row.byTerrain[c]}>{row.byTerrain[c] ?? 0}</td>
                    {/each}
                    <td class="tot">{row.total}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="hint-small">
            {resCounts.total} ressources sur la carte. Une ligne grisée = ressource
            absente ; la colonne « Mer » = côte, « Océ » = océan profond.
          </p>
        {:else if !error}
          <p>Génération…</p>
        {/if}
      </section>

      <section>
        <h2>Export</h2>
        <button type="button" onclick={exportJson} disabled={!report}>Télécharger JSON (MapData)</button>
        <button type="button" onclick={copyJson} disabled={!report}>{copied ? 'Copié !' : 'Copier le JSON'}</button>
      </section>

      {#if error}
        <p class="error">Échec de génération : {error}</p>
      {/if}
    </aside>

    <div class="canvas-host">
      <GameCanvas
        client={fakeClient}
        {ui}
        {playback}
        onAction={() => {}}
        onRightClick={() => {}}
        onCancelDraft={() => {}}
        {showYields}
        {hideEntities}
        fertilityHeatmap={heat}
      />
    </div>
  </div>
</main>

<style>
  main { max-width: 110rem; margin: 1rem auto; font-family: system-ui, sans-serif; padding: 0 1rem; }
  header { display: flex; gap: 1.5rem; align-items: baseline; flex-wrap: wrap; }
  h1 { font-size: 1.3rem; }
  .hint { color: #555; font-size: 0.9rem; }
  /* Fenêtre étroite : le panneau passe au-dessus de la carte (pleine largeur)
     — jamais caché, la carte suit dessous. */
  .columns { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
  aside { width: 24rem; flex: none; max-width: 100%; }
  section { border: 1px solid #ccc; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.75rem; }
  h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  label { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
  label.check { flex-direction: row; align-items: center; }
  /* position: relative OBLIGATOIRE : le host interne de GameCanvas est
     positionné `absolute; inset: 0` (il remplit son parent positionné —
     dans la page de jeu ce parent est plein écran). Sans ancre, le canvas
     remontait au viewport entier et recouvrait le panneau de calibration. */
  .canvas-host { position: relative; flex: 1; height: 78vh; min-height: 26rem; border: 1px solid #ccc; border-radius: 6px; overflow: hidden; }
  table { width: 100%; font-size: 0.85rem; border-collapse: collapse; }
  td { padding: 0.15rem 0.3rem; }
  td:first-child { color: #555; }
  td.zero { color: #1a7f37; font-weight: 600; }
  .error { color: #b00020; font-size: 0.85rem; }
  /* Tableau de comptage : 22 ressources × terrains — compact et défilant. */
  .res-scroll { max-height: 16rem; overflow: auto; border: 1px solid #ddd; border-radius: 4px; }
  .res-table { font-size: 0.68rem; width: 100%; }
  .res-table th, .res-table td { padding: 0.1rem 0.22rem; text-align: right; white-space: nowrap; }
  .res-table th:first-child, .res-table td:first-child { text-align: left; position: sticky; left: 0; background: #fff; }
  .res-table thead th { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ccc; }
  .res-table tr.absent td { color: #b3b3b3; }
  .res-table td.zero { color: #ccc; font-weight: 400; }
  .res-table td.tot { font-weight: 600; }
  .hint-small { color: #777; font-size: 0.72rem; margin: 0.4rem 0 0; }
  .terrain-table { font-size: 0.8rem; width: 100%; }
  .terrain-table td { padding: 0.1rem 0.3rem; }
  .terrain-table td:first-child { color: #555; }
  .terrain-table td:last-child { text-align: right; font-weight: 600; }
  .terrain-table tr.absent td { color: #b3b3b3; }
  @media (max-width: 54rem) {
    aside { width: 100%; }
    .canvas-host { width: 100%; height: 62vh; }
  }
</style>
