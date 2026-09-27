<script lang="ts">
  /**
   * LOBBY-5 — Salle d'attente (#/attente/<code>). Vue HÔTE : toute la config
   * est éditable tant que la partie n'est pas démarrée (D6) + boutons
   * « Lancer » et « Supprimer ». Vue INVITÉ : lecture seule + « Quitter »
   * (libère son siège). Statut des sièges en temps réel via la diffusion
   * GameList du LobbyDO ; au démarrage, tout le monde bascule en jeu.
   * LOBBY-PREMIUM (27/09) — même cadre visuel que le lobby (CadreLobby :
   * fonds d'Erik, en-tête or-sur-sombre, bouton or) ; logique intacte.
   */
  import { onDestroy } from 'svelte';
  import type { ConfigPartie } from '@game/shared';
  import { configPartieErreur } from '@game/shared';
  import { createLobbyClient } from '../lib/lobbyClient.js';
  import { session } from '../lib/session.js';
  import { civName } from '../lib/labels.js';
  import CadreLobby from '../components/CadreLobby.svelte';
  import ConfigPartieEditor from '../components/ConfigPartieEditor.svelte';
  import { TOPOGRAPHIES } from '@game/rules';

  const { code }: { code: string } = $props();

  const client = createLobbyClient();
  onDestroy(() => client.close());
  const games = client.games;
  const error = client.error;
  let erreurLocale = $state<string | null>(null);

  const game = $derived(
    [...$games.mine, ...$games.waiting].find((g) => g.code === code) ?? null,
  );
  const moi = $derived($session?.id ?? null);
  const estHote = $derived(game?.players[0]?.id === moi);
  const occupantDe = $derived.by(() => {
    const map: Record<number, string | undefined> = {};
    for (const p of game?.players ?? []) {
      if (typeof p.siege === 'number') map[p.siege] = p.name;
    }
    return map;
  });
  /** D6 : tout siège humain doit être occupé pour lancer — les bots ne
   *  remplissent que les sièges bots (le serveur refuse sinon). */
  const humainVide = $derived.by(() => {
    const cfg = game?.settings.config;
    if (!cfg) return -1;
    return cfg.sieges.findIndex((s, i) => s.type === 'humain' && occupantDe[i] === undefined);
  });

  // Copie locale éditable : réinitialisée à chaque diffusion serveur SAUF
  // pendant qu'une édition est en vol (l'écho serveur la confirme).
  let cfgLocale = $state<ConfigPartie | null>(null);
  let envoyee: string | null = null;

  $effect(() => {
    const srv = game?.settings.config;
    if (!srv) return;
    const json = JSON.stringify(srv);
    if (envoyee && json === envoyee) {
      envoyee = null; // écho de notre édition : copie confirmée
    }
    if (!envoyee) cfgLocale = structuredClone(srv);
  });

  // Au démarrage (statut → active), tout le monde rejoint la partie.
  $effect(() => {
    if (game?.status === 'active') window.location.hash = `#/game/${code}`;
  });

  function appliquerEdition(c: ConfigPartie): void {
    if (!estHote) return;
    const erreur = configPartieErreur(c);
    if (erreur) {
      erreurLocale = erreur;
      return;
    }
    erreurLocale = null;
    envoyee = JSON.stringify(c);
    cfgLocale = c;
    client.updateConfig(code, c);
  }

  function lancer(): void {
    if (cfgLocale) appliquerEdition(cfgLocale); // figer la dernière édition
    client.start(code);
  }

  function quitterOuSupprimer(): void {
    client.abandon(code);
    window.location.hash = '#/lobby';
  }
</script>

<CadreLobby>
  <div class="bandeaus">
    <div class="bandeau panneau">
      <img class="icone-lobby" src="/interface/lobby.svg" alt="" />
      <h2>Salle d'attente — {code}</h2>
      {#if game}
        <p class="statut">
          <span class="point" class:ko={game.status !== 'waiting'} aria-hidden="true"></span>
          {game.players.length}/{game.settings.config?.sieges.length ?? 5} sièges —
          {TOPOGRAPHIES.find((t) => t.id === game.settings.config?.topographie)?.nom ?? '—'} —
          timer {game.settings.turnTimerMinutes ?? '∞'} — {game.settings.isPublic ? 'publique' : 'privée'}
        </p>
      {/if}
    </div>
    <a class="carte-lien panneau" href="#/lobby">
      <span class="texte">
        <strong>Retour au lobby</strong>
        <small>Code à partager : <strong class="code">{code}</strong></small>
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </a>
  </div>

  {#if $error}<p class="error">{$error}</p>{/if}
  {#if erreurLocale}<p class="error">{erreurLocale}</p>{/if}

  {#if !game}
    <section class="panneau section">
      <p class="note">Recherche de la partie… (vous rejoignez peut-être une partie privée par lien — <a href="#/lobby">retour au lobby</a>)</p>
    </section>
  {:else}
    <div class="contenu">
      <div class="gauche">
        {#if cfgLocale}
          <section class="panneau section">
            <h2>Configuration {estHote ? '(vous êtes l’hôte — modifiable jusqu’au démarrage)' : '(lecture seule)'}</h2>
            <ConfigPartieEditor config={cfgLocale} occupants={occupantDe} editable={estHote} banderoles onchange={appliquerEdition} />
          </section>
        {/if}
      </div>

      <div class="colonne">
        <section class="panneau section joueurs">
          <h2>Joueurs</h2>
          <ul class="liste">
            {#each game.players as p (p.id)}
              <li>
                <strong>{p.name}</strong>
                {#if p.bot}<span class="badge">bot</span>{/if}
                {#if p.civId && !game.settings.config?.civsAleatoires} — {civName(p.civId)}{/if}
                {#if p.id === moi}<em> (vous)</em>{/if}
              </li>
            {/each}
          </ul>
          {#if game.settings.config?.civsAleatoires}
            <p class="note">Civilisations aléatoires : tirage seedé (16 distinctes) au démarrage, révélé à tous.</p>
          {:else}
            <p class="note">Les sièges bots sans civ reçoivent une civilisation tirée au démarrage.</p>
          {/if}
        </section>

        <section class="panneau section actions">
          <h2>Partie</h2>
          {#if estHote}
            <button type="button" class="bouton-or" onclick={lancer} disabled={humainVide >= 0} title={humainVide >= 0 ? `Le siège ${humainVide + 1} (humain) est vide — passez-le en bot ou attendez un joueur.` : undefined}>
              <span>Lancer la partie</span>
            </button>
            {#if humainVide >= 0}<p class="error">Le siège {humainVide + 1} (humain) est vide — passez-le en bot ou attendez un joueur.</p>{/if}
            <button type="button" class="secondaire" onclick={quitterOuSupprimer}>Supprimer la partie</button>
          {:else}
            <button type="button" class="bouton-or" onclick={quitterOuSupprimer}>
              <span>Quitter la partie</span>
            </button>
          {/if}
          <a href="#/lobby">Retour au lobby</a>
        </section>
      </div>
    </div>
  {/if}
</CadreLobby>

<style>
  /* v2 (retour Erik 27/09) : Configuration à gauche, JOUEURS + PARTIE en
     colonne à droite — tout tient dans l'écran. */
  .contenu {
    display: grid; grid-template-columns: minmax(0, 1fr) 26rem; gap: 1rem;
    margin-top: 0.5rem; flex: 1; min-height: 0; align-items: start;
  }
  .section { padding: 1.1rem 1.2rem; }
  h2 { font-family: var(--serif-or); color: var(--or-clair); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin: 0.2rem 0 0.6rem; font-size: 1.05rem; }
  .code { color: var(--or-clair); letter-spacing: 0.08em; }
  .colonne { display: flex; flex-direction: column; gap: 1rem; }
  .liste { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.45rem; }
  .liste li {
    border: 1px solid var(--panneau-bord-doux); border-radius: 8px; padding: 0.5rem 0.7rem;
    background: var(--rangee); font-size: 0.88rem;
  }
  .liste strong { color: var(--or-clair); font-family: var(--serif-or); letter-spacing: 0.06em; }
  .actions { display: flex; flex-direction: column; gap: 0.7rem; align-items: flex-start; }
  .actions .bouton-or { align-self: stretch; justify-content: center; }

  /* D7 — dégradé simple en dessous de 1920 : retour à la pile + défilement. */
  @media (max-width: 1200px) {
    .contenu { grid-template-columns: 1fr; }
  }
</style>
