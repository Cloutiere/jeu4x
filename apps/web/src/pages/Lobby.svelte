<script lang="ts">
  // Page lobby (L6) : créer une partie, rejoindre par code ou via la liste,
  // mes parties, abandon.
  import { onDestroy } from 'svelte';
  import { createLobbyClient } from '../lib/lobbyClient.js';
  import { logout, session } from '../lib/session.js';

  const client = createLobbyClient();
  onDestroy(() => client.close());

  const games = client.games;
  const status = client.status;
  const error = client.error;

  let mapId = $state<'pedagogique-40' | 'pangee-40' | 'variee-40'>('variee-40');
  let timerMinutes = $state(60);
  let isPublic = $state(true);
  let joinCode = $state('');

  function createGame(): void {
    client.createGame({
      mapId,
      turnTimerMinutes: timerMinutes > 0 ? timerMinutes : null,
      isPublic,
    });
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

  <section>
    <h2>Créer une partie</h2>
    <label>
      Carte
      <select bind:value={mapId}>
        <option value="variee-40">Variée 40×40 (défaut)</option>
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
    <button type="button" onclick={createGame}>Créer</button>
  </section>

  <section>
    <h2>Rejoindre par code</h2>
    <input bind:value={joinCode} placeholder="ABC123" maxlength={6} />
    <button type="button" onclick={() => client.join(joinCode.toUpperCase())}>Rejoindre</button>
  </section>

  <section>
    <h2>Parties publiques en attente</h2>
    {#if $games.waiting.length === 0}
      <p>Aucune partie en attente.</p>
    {:else}
      <ul>
        {#each $games.waiting as game (game.code)}
          <li>
            <strong>{game.code}</strong> — hôte {game.players[0]?.name ?? '?'} — timer {game.settings.turnTimerMinutes ?? '∞'}
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
            <a href={`#/game/${game.code}`}>Ouvrir</a>
            <button type="button" onclick={() => client.abandon(game.code)}>Abandonner</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  main { max-width: 40rem; margin: 2rem auto; font-family: system-ui, sans-serif; }
  header { display: flex; gap: 1rem; align-items: center; }
  section { border: 1px solid #ccc; border-radius: 6px; padding: 1rem; margin: 1rem 0; }
  label { display: flex; gap: 0.5rem; margin-right: 1rem; align-items: center; }
  .error { color: #b00020; }
</style>
