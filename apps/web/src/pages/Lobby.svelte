<script lang="ts">
  /**
   * Page lobby — LOBBY-5 (demande d'Erik du 24/09) : UNE SEULE voie de
   * création, 5 sièges systématiques (humains/bots), nuancier des 6 palettes
   * 4 tons, toggle « Civilisations aléatoires », topographie (l'existant du
   * progen), timer et publique/privée. Les cartes préfabriquées/miroir 1v1
   * quittent l'UI (accessibles au labo #/progen — D1). La jointure (liste
   * publique ou code) passe par un panneau de choix couleur + civ.
   * LOBBY-PREMIUM (27/09) — refonte PRÉSENTATION seule selon le mockup
   * gpt_V2 d'Erik : cadre commun CadreLobby (fonds, en-tête or-sur-sombre),
   * bouton or aux épées. Zéro changement de logique (D8) — mêmes flux,
   * mêmes appels client.
   */
  import { onDestroy } from 'svelte';
  import type { ConfigPartie } from '@game/shared';
  import { CIVILIZATIONS, TOPOGRAPHIES } from '@game/rules';
  import { configPartieDefaut, SIEGES_PAR_PARTIE } from '@game/shared';
  import { createLobbyClient } from '../lib/lobbyClient.js';
  import { civName } from '../lib/labels.js';
  import CadreLobby from '../components/CadreLobby.svelte';
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

<CadreLobby>
  <div class="bandeaus">
    <div class="bandeau panneau">
      <img class="icone-lobby" src="/interface/lobby.svg" alt="" />
      <h2>Lobby</h2>
      <p class="statut">
        <span class="point" class:ko={$status !== 'open'} aria-hidden="true"></span>
        Statut : {$status}
      </p>
    </div>
    <a class="carte-lien panneau" href="#/progen">
      <span class="texte">
        <strong>Labo de cartes</strong>
        <small>Calibrage de la génération procédurale</small>
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </a>
  </div>

  {#if $error}<p class="error">{$error}</p>{/if}

  <section class="panneau creation">
    <h2>Créer une partie — {SIEGES_PAR_PARTIE} sièges</h2>
    <ConfigPartieEditor {config} editable banderoles onchange={(c) => (config = c)} />
    <div class="options">
      <label>
        Timer (minutes, 0 = aucun)
        <input type="number" min="0" bind:value={timerMinutes} />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={isPublic} />
        Partie publique
      </label>
      <button type="button" class="bouton-or creer" onclick={creerPartie}>
        <img src="/interface/epees.svg" alt="" />
        <span>Créer la partie</span>
      </button>
    </div>
    <p class="note">
      Le duel est une configuration : 2 humains + 3 bots. Les cartes préfabriquées
      (miroir 1v1) restent disponibles au <a href="#/progen">labo</a>.
    </p>
  </section>

  <div class="duo">
    <section class="panneau">
      <h2>Parties publiques en attente</h2>
      {#if $games.waiting.length === 0}
        <p class="note">Aucune partie en attente.</p>
      {:else}
        <ul class="parties">
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

      <h2 class="suite">Mes parties</h2>
      {#if $games.mine.length === 0}
        <p class="note">Aucune partie active.</p>
      {:else}
        <ul class="parties">
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

    <section class="panneau">
      <h2>Rejoindre par code</h2>
      <div class="code">
        <input bind:value={joinCode} placeholder="ABC123" maxlength={6} />
        <button type="button" onclick={joindreCode}>Rejoindre</button>
      </div>

      {#if jointure}
        <div class="jointure">
          <h3>Rejoindre {jointure.code}</h3>
          <p class="note">Choisissez votre couleur {jointure.civsAleatoires ? '(civs tirées au démarrage)' : 'et votre civilisation'} :</p>
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
        </div>
      {/if}
    </section>
  </div>
</CadreLobby>

<style>
  h2 { font-family: var(--serif-or); color: var(--or-clair); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin: 0.2rem 0 0.6rem; font-size: 1.05rem; }
  h2.suite { margin-top: 1.4rem; }

  .creation { margin-top: 1rem; padding: 1.1rem 1.2rem; }
  .creation > h2 { font-size: 1.35rem; }

  .options { display: flex; gap: 1rem; align-items: center; margin-top: 0.9rem; flex-wrap: wrap; }
  label { display: flex; gap: 0.5rem; margin-right: 1rem; align-items: center; }
  .creer { margin-left: auto; }

  .duo { display: grid; grid-template-columns: 3fr 2fr; gap: 1rem; margin-top: 1rem; }
  .duo section { padding: 1.1rem 1.2rem; }
  .parties { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.45rem; }
  .parties li {
    border: 1px solid var(--panneau-bord-doux); border-radius: 8px; padding: 0.5rem 0.7rem;
    background: var(--rangee); font-size: 0.88rem;
  }
  .parties strong { color: var(--or-clair); font-family: var(--serif-or); letter-spacing: 0.06em; }
  .code { display: flex; gap: 0.6rem; }
  .jointure { margin-top: 1rem; border-top: 1px solid var(--panneau-bord-doux); padding-top: 0.8rem; }
  .jointure h3 { font-family: var(--serif-or); color: var(--or-clair); margin: 0 0 0.3rem; letter-spacing: 0.06em; }

  /* D7 — dégradé simple en dessous de 1920 : la grille passe en colonne. */
  @media (max-width: 1200px) {
    .duo { grid-template-columns: 1fr; }
  }
</style>
