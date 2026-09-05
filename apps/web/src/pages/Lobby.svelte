<script lang="ts">
  // Page lobby (L6) : créer une partie, rejoindre par code ou via la liste,
  // mes parties, abandon. Chantier BOT-SOLO : case « Partie solo (contre le
  // bot) » — création avec p2 = bot, démarrage immédiat, badge « solo ».
  import { onDestroy } from 'svelte';
  import type { MapId } from '@game/shared';
  import { CIVILIZATIONS } from '@game/rules';
  import { createLobbyClient } from '../lib/lobbyClient.js';
  import { logout, session } from '../lib/session.js';
  import CivPicker from '../components/CivPicker.svelte';
  import { civName } from '../lib/labels.js';

  const client = createLobbyClient();
  onDestroy(() => client.close());

  const games = client.games;
  const status = client.status;
  const error = client.error;

  // Phase 6b : la carte aléatoire procédurale devient le choix par défaut
  // des parties (seed de partie → carte déterministe et rejouable).
  let mapId = $state<MapId>('procedural-40');
  let timerMinutes = $state(60);
  let isPublic = $state(true);
  let joinCode = $state('');
  // 7n · R-145 : choix de civilisation (hôte à la création, invité au join 🔶).
  let hostCiv = $state<string | null>('amerique');
  let hostWonder = $state<string | null>(null);
  let joinCiv = $state<string | null>('rome');
  let joinWonder = $state<string | null>(null);
  let showCivPicker = $state(true);
  // Chantier BOT-SOLO : partie solo (le bot rejoint en p2, civ au choix —
  // « aléatoire » = tirage seedé par la partie).
  let solo = $state(false);
  let botCiv = $state<string>('random');
  const CIV_IDS = Object.keys(CIVILIZATIONS.civs).sort();

  function createGame(): void {
    client.createGame({
      mapId,
      turnTimerMinutes: timerMinutes > 0 ? timerMinutes : null,
      isPublic,
      ...(hostCiv ? { civId: hostCiv } : {}),
      ...(hostCiv && hostWonder ? { wonderId: hostWonder } : {}),
      ...(solo ? { solo: true } : {}),
      ...(solo && botCiv !== 'random' ? { botCivId: botCiv } : {}),
    });
  }

  function joinWithCiv(code: string): void {
    client.join(code, joinCiv ?? undefined, joinCiv && joinWonder ? joinWonder : undefined);
  }
</script>

<main class="lobby">
  <header>
    <h1>Lobby</h1>
    <span>{$session ? `Connecté : ${$session.name}` : ''}</span>
    <button type="button" onclick={logout}>Déconnexion</button>
  </header>

  <p>Statut lobby : {$status}</p>
  {#if $error}<p class="error">{$error}</p>{/if}

  <p class="progen-link">
    <a href="#/progen">Labo de cartes (calibrage de la génération procédurale)</a>
  </p>

  <section>
    <h2>Créer une partie</h2>
    <label>
      Carte
      <select bind:value={mapId}>
        <option value="procedural-40">Carte aléatoire (seed de partie)</option>
        <option value="variee-40">Variée 40×40</option>
        <option value="pedagogique-40">Pédagogique 40×40</option>
        <option value="pangee-40">Pangée 40×40</option>
      </select>
    </label>
    <label>
      Timer (minutes, 0 = aucun)
      <input type="number" min="0" bind:value={timerMinutes} />
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={isPublic} />
      Partie publique
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={solo} />
      Partie solo (contre le bot)
    </label>
    {#if solo}
      <label>
        Civilisation du bot
        <select bind:value={botCiv}>
          <option value="random">Aléatoire</option>
          {#each CIV_IDS as id (id)}
            <option value={id}>{civName(id)}</option>
          {/each}
        </select>
      </label>
    {/if}
    <button type="button" onclick={createGame}>Créer</button>
    <h3>Choisissez votre civilisation <em>(16 — 7n)</em></h3>
    <CivPicker value={hostCiv} wonder={hostWonder} onchange={(civ, wonder) => { hostCiv = civ; hostWonder = wonder ?? null; }} />
  </section>

  <section>
    <h2>Rejoindre par code</h2>
    <input bind:value={joinCode} placeholder="ABC123" maxlength={6} />
    <button type="button" onclick={() => joinWithCiv(joinCode.toUpperCase())}>Rejoindre</button>
    <details>
      <summary>Choisir la civilisation de l'invité ({civName(joinCiv)})</summary>
      <CivPicker value={joinCiv} wonder={joinWonder} onchange={(civ, wonder) => { joinCiv = civ; joinWonder = wonder ?? null; }} compact />
    </details>
  </section>

  <section>
    <h2>Parties publiques en attente</h2>
    {#if $games.waiting.length === 0}
      <p>Aucune partie en attente.</p>
    {:else}
      <ul>
        {#each $games.waiting as game (game.code)}
          <li>
            <strong>{game.code}</strong> — hôte {game.players[0]?.name ?? '?'}{game.players[0]?.civId ? ` (${civName(game.players[0].civId)})` : ''} — timer {game.settings.turnTimerMinutes ?? '∞'}
            <button type="button" onclick={() => client.join(game.code)}>Rejoindre</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h2>Mes parties</h2>
    {#if $games.mine.length === 0}
      <p>Aucune partie active.</p>
    {:else}
      <ul>
        {#each $games.mine as game (game.code)}
          <li>
            <strong>{game.code}</strong> — {game.status} — tour {game.turn}
            {#if game.settings.solo}<span class="badge">solo</span>{/if}
            {#if game.players.some((p) => p.bot)}
              — contre {game.players.find((p) => p.bot)?.name ?? 'Bot'}{#if game.players.find((p) => p.bot)?.civId} ({civName(game.players.find((p) => p.bot)!.civId!)}){/if}
            {/if}
            <a href={`#/game/${game.code}`}>Ouvrir</a>
            <button type="button" onclick={() => client.abandon(game.code)}>Abandonner</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  main { max-width: 56rem; margin: 2rem auto; font-family: system-ui, sans-serif; }
  h3 { margin: 0.8rem 0 0.4rem; font-size: 0.95rem; }
  h3 em { color: #9db8a6; font-style: normal; font-weight: 400; }
  header { display: flex; gap: 1rem; align-items: center; }
  section { border: 1px solid #ccc; border-radius: 6px; padding: 1rem; margin: 1rem 0; }
  label { display: flex; gap: 0.5rem; margin-right: 1rem; align-items: center; }
  .error { color: #b00020; }
  .progen-link { font-size: 0.9rem; }
  .badge {
    display: inline-block;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: #2d5a3d;
    color: #d9f2e3;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
