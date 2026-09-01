<script lang="ts">
  /**
   * Page de partie (Phase 3) : carte PixiJS (GameCanvas), barre supérieure,
   * panneaux unité/ville, journal, playback des événements (L4) et overlays
   * (résolution, victoire, toasts). La vue « état brut » reste accessible
   * (repliable) — outil de référence ; le mode reveal est sur #/debug/<code>.
   *
   * Playback (L4) : rejoue les événements reçus (TurnResult ET
   * Snapshot.missedEvents après reconnexion — §3.4-4). Un Snapshot purge
   * d'abord l'animation en cours (l'état reçu est l'autorité) via le hook
   * onMessage, appelé AVANT la mise à jour de la vue.
   */
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import type { GameEvent } from '@game/shared';
  import type { Hex } from '@game/rules';
  import { createGameClient } from '../lib/gameClient.js';
  import type { GameClient } from '../lib/gameClient.js';
  import { createUiState, selectNothing } from '../lib/render/ui.js';
  import type { UiStore } from '../lib/render/ui.js';
  import { Playback } from '../lib/render/playback.js';
  import { rightClickAction, unitsWithoutOrders, myEngineId } from '../lib/render/interaction.js';
  import type { ClickAction } from '../lib/render/interaction.js';
  import { unexecutedOrders } from '../lib/feedback.js';
  import GameCanvas from '../lib/render/GameCanvas.svelte';
  import UnitPanel from '../components/UnitPanel.svelte';
  import CityPanel from '../components/CityPanel.svelte';
import ResearchPanel from '../components/ResearchPanel.svelte';
import { TECHS } from '@game/rules';
  import Journal from '../components/Journal.svelte';

  let { code }: { code: string } = $props();

  let lastReplayedSeq = -1;
  const playback = new Playback();

  // Toasts d'erreur réseau/ordres (les toasts d'événements viennent du playback).
  const toasts = playback.toasts;
  let errorToasts = $state<Array<{ id: number; text: string }>>([]);
  let errorToastId = 1;
  function pushErrorToast(text: string): void {
    const id = errorToastId++;
    errorToasts = [...errorToasts, { id, text }];
    setTimeout(() => {
      errorToasts = errorToasts.filter((t) => t.id !== id);
    }, 5000);
  }

  const client: GameClient = createGameClient(code, {
    onMessage(message) {
      // Resync/reconnexion : le snapshot reçu prime sur toute animation.
      if (message.type === 'Snapshot') playback.reset();
      // Polish Phase 5 : un ordre écarté par le moteur à la résolution est
      // signalé (le hook voit les ordres d'AVANT la mise à jour de la vue).
      if (message.type === 'TurnResult') {
        const previous = get(view).orders;
        for (const f of unexecutedOrders(previous, message.events, message.state)) {
          pushErrorToast(`Ordre non exécuté (${f.unitId}) : ${f.label}`);
        }
      }
    },
  });
  onDestroy(() => client.close());

  const view = client.view;
  const status = client.status;
  const error = client.error;
  const ui: UiStore = createUiState();
  onDestroy(() => selectNothing(ui));

  // Lien vers le mode reveal (#/debug) — jamais dans un build de production.
  const devMode = import.meta.env.DEV;

  /** Icône optionnelle : masquée silencieusement si l'asset est absent. */
  function hideImg(e: Event): void {
    (e.currentTarget as HTMLElement | null)?.style.setProperty('display', 'none');
  }

  // Rejouer tout événement fraîchement ajouté au journal (dédoublonné par seq
  // côté réducteur — cf. gameClient.ts).
  const unsubReplay = view.subscribe((v) => {
    if (v.events.length === 0) return;
    const fresh = v.events.filter((e) => e.seq > lastReplayedSeq);
    if (fresh.length === 0) return;
    lastReplayedSeq = fresh[fresh.length - 1]!.seq;
    playback.enqueue(fresh);
  });

  // ---------------------------------------------------------------------
  // Actions (L3) : décision de clic pure → ordres soumis au serveur.
  // ---------------------------------------------------------------------

  let canvasApi: { centerOnHex(hex: Hex): void; centerOnUnit(unitId: string): void } | null = $state(null);

  function handleAction(action: ClickAction): void {
    const v = get(view);
    switch (action.kind) {
      case 'selectUnit': {
        const unit = v.state?.units[action.unitId];
        const own = !!unit && unit.owner === myEngineId(v);
        // Sélection amie modifiable : arme un brouillon de déplacement vide.
        const editable = own && v.status === 'active' && v.phase === 'orders' && !v.locked;
        ui.set({ selectedUnitId: action.unitId, selectedCityId: null, draft: editable && unit ? { unitId: unit.id, path: [] } : null });
        break;
      }
      case 'selectCity':
        ui.set({ selectedUnitId: null, selectedCityId: action.cityId, draft: null });
        break;
      case 'deselect':
        selectNothing(ui);
        break;
      case 'extend':
      case 'truncate':
        ui.update((u) => {
          if (u.draft) return { ...u, draft: { ...u.draft, path: action.path } };
          // Extension sans brouillon actif (entrée dans une ville ennemie — R-57).
          const unitId = action.kind === 'extend' ? action.unitId ?? u.selectedUnitId : null;
          return unitId ? { ...u, draft: { unitId, path: action.path } } : u;
        });
        // Phase 5 L1 : soumission automatique — chaque extension/troncature
        // re-soumet le brouillon complet (plus de bouton « Valider »).
        {
          const d = get(ui).draft;
          if (d && d.path.length > 0) client.submitOrder({ type: 'Move', unitId: d.unitId, path: d.path });
        }
        break;
      case 'attack':
        client.submitOrder(action.order);
        break;
      case 'setWorkedTile':
        client.submitOrder({ type: 'SetWorkedTile', cityId: action.cityId, tile: action.tile });
        break;
      case 'none':
        break;
    }
  }

  function confirmDraft(): void {
    const d = get(ui).draft;
    if (!d || d.path.length === 0) return;
    client.submitOrder({ type: 'Move', unitId: d.unitId, path: d.path });
    // Le brouillon reste armé (vide) sur la même unité : enchaîner un autre
    // ordre de déplacement ne demande pas de re-sélection.
    ui.update((u) => ({ ...u, draft: { unitId: d.unitId, path: [] } }));
  }

  /** Clic droit (Phase 5 L1) : chemin complet soumis, ou annulation du brouillon. */
  function handleRightClick(hex: Hex): void {
    const v = get(view);
    const action = rightClickAction(v, get(ui), hex);
    if (action.kind === 'cancelDraft') {
      cancelDraft();
      return;
    }
    ui.update((u) => ({ ...u, draft: { unitId: action.unitId, path: action.path } }));
    client.submitOrder({ type: 'Move', unitId: action.unitId, path: action.path });
  }

  // ---------------------------------------------------------------------
  // Fin de tour : confirmation si des unités n'ont aucun ordre (Phase 5 L1).
  // ---------------------------------------------------------------------

  let showIdleDialog = $state(false);
  let idleUnits = $state<Array<{ id: string; label: string; pos: string }>>([]);

  function requestEndTurn(): void {
    const v = get(view);
    const ids = unitsWithoutOrders(v);
    if (ids.length === 0 || !v.state) {
      client.endTurn();
      return;
    }
    idleUnits = ids.map((id) => {
      const u = v.state!.units[id]!;
      return { id, label: u.type, pos: `(${u.q},${u.r})` };
    });
    showIdleDialog = true;
  }

  function confirmEndTurn(): void {
    showIdleDialog = false;
    client.endTurn();
  }

  function cancelDraft(): void {
    ui.update((u) => ({ ...u, draft: null }));
  }

  // ---------------------------------------------------------------------
  // Dérivés d'affichage
  // ---------------------------------------------------------------------

  let playbackActive = $state(false);
  const busy = $derived($view.phase === 'resolving' || playbackActive);

  // Phase 6 L3 : overlay des rendements N/P/C (masquable).
  let showYields = $state(false);

  // Phase 7a : menu de choix technologique (R-85).
  let showResearch = $state(false);

  const myGold = $derived.by(() => {
    const v = $view;
    const id = myEngineId(v);
    return id && v.state ? (v.state.players[id]?.gold ?? 0) : 0;
  });
  const myResearch = $derived.by(() => {
    const v = $view;
    const id = myEngineId(v);
    const p = id && v.state ? v.state.players[id] : null;
    if (!p) return { tech: null as string | null, progress: 0, cost: 0, stored: 0 };
    const tech = p.researching ? TECHS[p.researching] ?? null : null;
    return {
      tech: p.researching,
      progress: p.researching ? p.scienceProgress[p.researching] ?? 0 : 0,
      cost: tech?.cost ?? 0,
      stored: p.scienceStored ?? 0,
    };
  });
  const myResearchRatio = $derived(myResearch.cost > 0 ? Math.min(1, myResearch.progress / myResearch.cost) : 0);
  const myName = $derived.by(() => {
    const v = $view;
    return v.players.find((p) => p.id === v.playerId)?.name ?? '';
  });

  const victoryEvent = $derived.by(() => {
    const v = $view;
    for (let i = v.events.length - 1; i >= 0; i--) {
      const e = v.events[i]!;
      if (e.type === 'Victory') return e as GameEvent & { type: 'Victory' };
    }
    return null;
  });
  const showVictory = $derived(!!$view.state?.winner);

  // Toasts d'erreur réseau (déjà déclarés en tête : pushErrorToast).
  const unsubError = error.subscribe((e) => {
    if (!e) return;
    pushErrorToast(e);
    error.set(null);
  });

  onDestroy(() => {
    unsubReplay();
    unsubError();
  });
</script>

<main class="game">
  <header class="bar">
    <a href="#/lobby">← Lobby</a>
    <strong>Partie {code}</strong>
    <span>Tour <strong>{$view.turn}</strong></span>
    <span class="chip" class:resolving={$view.phase === 'resolving'}>{$view.phase === 'resolving' ? 'Résolution…' : 'Ordres'}</span>
    <span class="res" title="Or du joueur">
      <img src="/art/icone_or.png" alt="Or" onerror={hideImg} />
      {myGold}
    </span>
    <button type="button" class="research" title="Choix technologique (R-85)" onclick={() => (showResearch = !showResearch)}>
      <img src="/art/icone_science.png" alt="Science" onerror={hideImg} />
      {#if myResearch.tech}
        {TECHS[myResearch.tech]?.name ?? myResearch.tech}
        <span class="minibar"><span class="minifill" style:width={`${myResearchRatio * 100}%`}></span></span>
        {myResearch.progress}/{myResearch.cost}
      {:else if myResearch.stored > 0}
        <em class="reserve">Choisir… ({myResearch.stored} en attente)</em>
      {:else}
        Recherche
      {/if}
    </button>
    <span class="net net-{$status}">{$status}</span>
    {#if $view.locked}<span class="chip locked">Verrouillé</span>{/if}
    <button type="button" class="primary" disabled={$view.locked || $view.phase !== 'orders' || $view.status !== 'active'} onclick={requestEndTurn}>
      Fin de tour
    </button>
    <button type="button" onclick={() => client.resync()}>Resync</button>
    <button type="button" class:active-toggle={showYields} title="Afficher/masquer les rendements N/P/C sur les cases" onclick={() => (showYields = !showYields)}>
      Rendements
    </button>
    {#if devMode}<a href={`#/debug/${code}`}>Debug</a>{/if}
  </header>

  {#if $view.status === 'waiting'}
    <div class="center">
      <p class="waiting">En attente du joueur 2.</p>
      <p>Lien d'invitation : <code>/#/join/{code}</code> — ou lancez le bot : <code>pnpm --filter @game/server bot -- {code} Bot</code></p>
    </div>
  {:else if !$view.state}
    <div class="center"><p>Chargement de l'état…</p></div>
  {:else}
    <div class="body">
      <div class="map-area">
        <GameCanvas
          {client}
          {ui}
          {playback}
          {showYields}
          onAction={handleAction}
          onRightClick={handleRightClick}
          onCancelDraft={cancelDraft}
          onReady={(api) => (canvasApi = api)}
          onPlaybackActive={(a) => (playbackActive = a)}
        />
        {#if showIdleDialog}
          <div class="victory idle-dialog">
            <h2>Unités sans ordre</h2>
            <p>Ces unités n'ont aucun ordre pour ce tour :</p>
            <ul>
              {#each idleUnits as u (u.id)}
                <li><strong>{u.id}</strong> — {u.label} {u.pos}</li>
              {/each}
            </ul>
            <div class="btns">
              <button type="button" class="primary-btn" onclick={confirmEndTurn}>Finir le tour quand même</button>
              <button type="button" onclick={() => (showIdleDialog = false)}>Revenir aux ordres</button>
            </div>
          </div>
        {/if}
        {#if busy}
          <div class="banner">
            {#if $view.phase === 'resolving'}Résolution du tour…{:else}Relecture du tour — clic sur la carte pour accélérer{/if}
          </div>
        {/if}
        {#if showVictory}
          <div class="victory">
            <h1>{victoryEvent?.winner === myEngineId($view) ? 'Victoire !' : 'Défaite…'}</h1>
            <p>
              {victoryEvent
                ? `Vainqueur : ${victoryEvent.winner} — motif : ${victoryEvent.reason === 'forfeit' ? 'forfait' : 'domination (capitale capturée)'}`
                : `Vainqueur : ${$view.state?.winner ?? '?'}`}
            </p>
            <a class="primary-btn" href="#/lobby">Retour au lobby</a>
          </div>
        {/if}
      </div>

      <aside class="side">
        {#if myName}<p class="me">Vous jouez : <strong>{myName}</strong></p>{/if}
        <UnitPanel view={$view} ui={$ui} {client} onCancelDraft={cancelDraft} onConfirmDraft={confirmDraft} onCenterUnit={(id) => canvasApi?.centerOnUnit(id)} />
        <CityPanel view={$view} ui={$ui} {client} />
        <Journal view={$view} />
        <details class="raw">
          <summary>État brut (debug)</summary>
          <pre>{JSON.stringify($view.state, null, 2)}</pre>
        </details>
      </aside>
    </div>
  {/if}

  {#if showResearch && $view.state}
    <ResearchPanel view={$view} {client} onClose={() => (showResearch = false)} />
  {/if}

  <div class="toasts" role="status">
    {#each $toasts as t (t.id)}
      <div class="toast {t.kind}">{t.text}</div>
    {/each}
    {#each errorToasts as t (t.id)}
      <div class="toast bad">{t.text}</div>
    {/each}
  </div>
</main>

<style>
  main.game { display: flex; flex-direction: column; height: 100vh; font-family: system-ui, sans-serif; color: #e3e8ec; background: #10151a; }
  .bar { display: flex; gap: 0.9rem; align-items: center; flex-wrap: wrap; border-bottom: 2px solid #2c353d; padding: 0.45rem 0.9rem; background: #171e24; }
  .bar a { color: #7fb3ff; }
  .chip { padding: 0.1rem 0.55rem; border-radius: 999px; border: 1px solid #3c4a55; font-size: 0.8rem; background: #1f2a33; }
  .chip.resolving { border-color: #8d6e63; background: #332a24; }
  .chip.locked { border-color: #7a5b3c; background: #2e251c; }
  .research { display: inline-flex; align-items: center; gap: 0.35rem; }
  .research img { width: 16px; height: 16px; }
  .research .minibar { display: inline-block; width: 4rem; height: 7px; background: #12161a; border: 1px solid #3a4148; border-radius: 4px; overflow: hidden; }
  .research .minifill { display: block; height: 100%; background: #6fa3b8; }
  .research .reserve { color: #ffe082; font-style: normal; }
  .net { font-size: 0.8rem; color: #8b98a5; }
  .res { display: inline-flex; align-items: center; gap: 0.25rem; font-weight: 600; }
  .res img { width: 18px; height: 18px; vertical-align: middle; }
  .net-open { color: #81c784; }
  .net-connecting { color: #ffd54f; }
  .net-closed { color: #e57373; }
  button { padding: 0.35rem 0.8rem; cursor: pointer; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; }
  button:disabled { opacity: 0.45; cursor: default; }
  button.primary { background: #2e5e3f; border-color: #3c7a52; }
  .body { display: flex; flex: 1; min-height: 0; }
  .map-area { position: relative; flex: 1; min-width: 0; }
  .side { width: 350px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 0.6rem; border-left: 2px solid #2c353d; background: #141a20; }
  .me { margin: 0; font-size: 0.85rem; color: #9aa7b2; }
  .banner { position: absolute; top: 0.7rem; left: 50%; transform: translateX(-50%); background: #000000cc; padding: 0.4rem 1rem; border-radius: 999px; font-size: 0.9rem; pointer-events: none; }
  .victory { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8rem; background: #000000b8; text-align: center; }
  .victory h1 { font-size: 2.4rem; margin: 0; }
  .idle-dialog { justify-content: center; background: #000000a8; z-index: 5; }
  .idle-dialog h2 { margin: 0; }
  .idle-dialog ul { text-align: left; max-height: 40vh; overflow: auto; }
  .idle-dialog .btns { display: flex; gap: 0.6rem; }
  .idle-dialog button { padding: 0.4rem 1rem; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; cursor: pointer; }
  .primary-btn { background: #2e5e3f; border: 1px solid #3c7a52; padding: 0.5rem 1.2rem; border-radius: 6px; color: inherit; text-decoration: none; }
  .center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; text-align: center; }
  .waiting { font-size: 1.2rem; }
  .toasts { position: fixed; right: 1rem; top: 3.2rem; display: flex; flex-direction: column; gap: 0.4rem; z-index: 10; max-width: 22rem; }
  .toast { padding: 0.45rem 0.8rem; border-radius: 6px; font-size: 0.88rem; box-shadow: 0 2px 8px #00000080; }
  .toast.info { background: #24404f; }
  .toast.good { background: #2c4a33; }
  .toast.bad { background: #54262a; }
  .raw summary { cursor: pointer; color: #8b98a5; font-size: 0.82rem; }
  .raw pre { max-height: 18rem; overflow: auto; font-size: 0.68rem; color: #93a1ad; }
</style>
