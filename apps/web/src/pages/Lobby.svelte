<script lang="ts">
  /**
   * Page lobby — LOBBY-5 (demande d'Erik du 24/09) : UNE SEULE voie de
   * création, 5 sièges systématiques (humains/bots), nuancier des 7 palettes
   * 4 tons, toggle « Civilisations aléatoires », topographie (l'existant du
   * progen), timer et publique/privée. Les cartes préfabriquées/miroir 1v1
   * quittent l'UI (accessibles au labo #/progen — D1). La jointure (liste
   * publique ou code) passe par un panneau de choix couleur + civ.
   */
  import { onDestroy } from 'svelte';
  import type { ConfigPartie } from '@game/shared';
  import { CIVILIZATIONS, TOPOGRAPHIES } from '@game/rules';
  import { configPartieDefaut, SIEGES_PAR_PARTIE } from '@game/shared';
  import { createLobbyClient } from '../lib/lobbyClient.js';
  import { logout, session } from '../lib/session.js';
  import { civName } from '../lib/labels.js';
  import ConfigPartieEditor from '../components/ConfigPartieEditor.svelte';
  import Nuancier from '../components/Nuancier.svelte';

  const client = createLobbyClient();
  onDestroy(() => client.close());

  const games = client.games;
  const status = client.status;
  const error = client.error;

  let timerMinutes = $state(60);
  let isPublic = $state(true);
  let joinCode = $state('');
  let config = $state<ConfigPartie>(configPartieDefaut('amerique'));

  // Jointure : partie sélectionnée (liste publique ou code saisi) + choix.
  let jointure = $state<{ code: string; civsAleatoires: boolean; prises: Record<string, string | undefined> } | null>(null);
  let joinPalette = $state<string | null>(null);
  let joinCiv = $state<string>('rome');

  const CIV_IDS = Object.keys(CIVILIZATIONS.civs).sort();

  function creerPartie(): void {
    client.createGame({
      mapId: 'procedural-40',
      turnTimerMinutes: timerMinutes > 0 ? timerMinutes : null,
      isPublic,
      config: $state.snapshot(config) as ConfigPartie,
    });
  }

  /** Ouvre le panneau de jointure pour une partie : `prises` = paletteId →
   *  nom du preneur (temps réel — nuancier grisant les couleurs occupées). */
  function ouvrirJointure(code: string, civsAleatoires: boolean, prises: Record<string, string | undefined>): void {
    jointure = { code, civsAleatoires, prises };
    joinPalette = null;
  }

  function joindreCode(): void {
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return;
    // Les palettes libres d'une partie privée ne sont pas connues : le
    // serveur validera (refus explicite si prise entre-temps).
    ouvrirJointure(code, false, {});
  }

  function confirmerJointure(): void {
    if (!jointure || !joinPalette) return;
    client.join(jointure.code, jointure.civsAleatoires ? undefined : joinCiv, joinPalette);
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
    <h2>Créer une partie — {SIEGES_PAR_PARTIE} sièges</h2>
    <ConfigPartieEditor {config} editable onchange={(c) => (config = c)} />
    <div class="options">
      <label>
        Timer (minutes, 0 = aucun)
        <input type="number" min="0" bind:value={timerMinutes} />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={isPublic} />
        Partie publique
      </label>
      <button type="button" onclick={creerPartie}>Créer la partie</button>
    </div>
    <p class="note">
      Le duel est une configuration : 2 humains + 3 bots. Les cartes préfabriquées
      (miroir 1v1) restent disponibles au <a href="#/progen">labo</a>.
    </p>
  </section>

  <section>
    <h2>Rejoindre par code</h2>
    <input bind:value={joinCode} placeholder="ABC123" maxlength={6} />
    <button type="button" onclick={joindreCode}>Rejoindre</button>
  </section>

  {#if jointure}
    <section class="jointure">
      <h2>Rejoindre {jointure.code}</h2>
      <p>Choisissez votre couleur {jointure.civsAleatoires ? '(civs tirées au démarrage)' : 'et votre civilisation'} :</p>
      <Nuancier value={joinPalette} prises={jointure.prises} onchange={(p) => (joinPalette = p)} />
      {#if !jointure.civsAleatoires}
        <label>
          Civilisation
          <select bind:value={joinCiv}>
            {#each CIV_IDS as id (id)}
              <option value={id}>{civName(id)}</option>
            {/each}
          </select>
        </label>
      {/if}
      <div class="options">
        <button type="button" onclick={confirmerJointure} disabled={!joinPalette}>Confirmer</button>
        <button type="button" class="secondaire" onclick={() => (jointure = null)}>Annuler</button>
      </div>
    </section>
  {/if}

  <section>
    <h2>Parties publiques en attente</h2>
    {#if $games.waiting.length === 0}
      <p>Aucune partie en attente.</p>
    {:else}
      <ul>
        {#each $games.waiting as game (game.code)}
          {@const cfg = game.settings.config}
          {@const humainsLibres = cfg ? cfg.sieges.filter((s) => s.type === 'humain').length - game.players.length : 0}
          {@const libres = (cfg ? cfg.sieges.length : game.settings.playerCount ?? 2) - game.players.length}
          <li>
            <strong>{game.code}</strong> — hôte {game.players[0]?.name ?? '?'} — {game.players.length}/{cfg ? cfg.sieges.length : game.settings.playerCount ?? 2} sièges ({libres} libres{cfg ? `, dont ${Math.max(0, humainsLibres)} humain${humainsLibres > 1 ? 's' : ''}` : ''}) — {cfg ? TOPOGRAPHIES.find((t) => t.id === cfg.topographie)?.nom ?? cfg.topographie : 'carte historique'} — timer {game.settings.turnTimerMinutes ?? '∞'}
            {#if cfg}
              {@const prises = Object.fromEntries(game.players.filter((p) => p.paletteId).map((p) => [p.paletteId, p.name]))}
              <button type="button" onclick={() => ouvrirJointure(game.code, cfg.civsAleatoires, prises)}>Rejoindre</button>
            {:else}
              <button type="button" onclick={() => client.join(game.code)}>Rejoindre</button>
            {/if}
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
              {@const bots = game.players.filter((p) => p.bot)}
              — contre {bots.map((b) => `${b.name}${b.civId ? ` (${civName(b.civId)})` : ''}`).join(', ')}
            {/if}
            {#if game.status === 'waiting'}
              <a href={`#/attente/${game.code}`}>Salle d'attente</a>
            {:else}
              <a href={`#/game/${game.code}`}>Ouvrir</a>
            {/if}
            <button type="button" onclick={() => client.abandon(game.code)}>Abandonner</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  /* FENETRE-GRANDE : zoom de lisibilité global (conservé). */
  main { max-width: 62rem; margin: 2rem auto; font-family: system-ui, sans-serif; zoom: 1.25; }
  h2 { margin: 0.2rem 0 0.6rem; }
  header { display: flex; gap: 1rem; align-items: center; }
  section { border: 1px solid #4a5a4e; border-radius: 6px; padding: 1rem; margin: 1rem 0; background: #16221b; }
  label { display: flex; gap: 0.5rem; margin-right: 1rem; align-items: center; }
  .options { display: flex; gap: 1rem; align-items: center; margin-top: 0.8rem; flex-wrap: wrap; }
  .error { color: #ff8a80; }
  .progen-link { font-size: 0.9rem; }
  .note { font-size: 0.78rem; color: #9db8a6; margin-top: 0.6rem; }
  .jointure { border-color: #ffd54f; }
  input, select { background: #14201a; color: #e8e8e8; border: 1px solid #3c7a52; border-radius: 4px; padding: 0.25rem 0.4rem; font: inherit; }
  button { font: inherit; padding: 0.25rem 0.7rem; border-radius: 4px; border: 1px solid #3c7a52; background: #24402e; color: #e8e8e8; cursor: pointer; }
  button:hover { border-color: #7fc79a; }
  button.secondaire { background: transparent; }
  .badge {
    display: inline-block; padding: 0.05rem 0.45rem; border-radius: 999px;
    background: #2d5a3d; color: #d9f2e3; font-size: 0.72rem; font-weight: 600;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
</style>
