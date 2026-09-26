<script lang="ts">
  /**
   * LOBBY-5 — Salle d'attente (#/attente/<code>). Vue HÔTE : toute la config
   * est éditable tant que la partie n'est pas démarrée (D6) + boutons
   * « Lancer » et « Supprimer ». Vue INVITÉ : lecture seule + « Quitter »
   * (libère son siège). Statut des sièges en temps réel via la diffusion
   * GameList du LobbyDO ; au démarrage, tout le monde bascule en jeu.
   */
  import { onDestroy } from 'svelte';
  import type { ConfigPartie } from '@game/shared';
  import { configPartieErreur } from '@game/shared';
  import { createLobbyClient } from '../lib/lobbyClient.js';
  import { logout, session } from '../lib/session.js';
  import { civName } from '../lib/labels.js';
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

<main class="attente">
  <header>
    <h1>Salle d'attente — {code}</h1>
    <span>{$session ? `Connecté : ${$session.name}` : ''}</span>
    <button type="button" onclick={logout}>Déconnexion</button>
  </header>

  {#if $error}<p class="error">{$error}</p>{/if}
  {#if erreurLocale}<p class="error">{erreurLocale}</p>{/if}

  {#if !game}
    <p>Recherche de la partie… (vous rejoignez peut-être une partie privée par lien — <a href="#/lobby">retour au lobby</a>)</p>
  {:else}
    <p class="ligne">
      {game.players.length}/{game.settings.config?.sieges.length ?? 5} sièges pris —
      topographie {TOPOGRAPHIES.find((t) => t.id === game.settings.config?.topographie)?.nom ?? '—'} —
      timer {game.settings.turnTimerMinutes ?? '∞'} — {game.settings.isPublic ? 'publique' : 'privée'}
      — code à partager : <strong>{code}</strong>
    </p>

    {#if cfgLocale}
      <section>
        <h2>Configuration {estHote ? '(vous êtes l’hôte — modifiable jusqu’au démarrage)' : '(lecture seule)'}</h2>
        <ConfigPartieEditor config={cfgLocale} occupants={occupantDe} editable={estHote} onchange={appliquerEdition} />
      </section>
    {/if}

    <section>
      <h2>Joueurs</h2>
      <ul>
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

    <div class="actions">
      {#if estHote}
        <button type="button" class="principal" onclick={lancer} disabled={humainVide >= 0} title={humainVide >= 0 ? `Le siège ${humainVide + 1} (humain) est vide — passez-le en bot ou attendez un joueur.` : undefined}>
          Lancer la partie
        </button>
        {#if humainVide >= 0}<p class="error">Le siège {humainVide + 1} (humain) est vide — passez-le en bot ou attendez un joueur.</p>{/if}
        <button type="button" onclick={quitterOuSupprimer}>Supprimer la partie</button>
      {:else}
        <button type="button" onclick={quitterOuSupprimer}>Quitter la partie</button>
      {/if}
      <a href="#/lobby">Retour au lobby</a>
    </div>
  {/if}
</main>

<style>
  main { max-width: 62rem; margin: 2rem auto; font-family: system-ui, sans-serif; zoom: 1.25; }
  header { display: flex; gap: 1rem; align-items: center; }
  section { border: 1px solid #4a5a4e; border-radius: 6px; padding: 1rem; margin: 1rem 0; background: #16221b; }
  h2 { margin: 0.2rem 0 0.6rem; }
  .ligne { color: #bfe8cc; font-size: 0.9rem; }
  .error { color: #ff8a80; }
  .note { font-size: 0.78rem; color: #9db8a6; }
  .actions { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; }
  button, a { font: inherit; }
  button { padding: 0.3rem 0.9rem; border-radius: 4px; border: 1px solid #3c7a52; background: #24402e; color: #e8e8e8; cursor: pointer; }
  button:hover { border-color: #7fc79a; }
  button.principal { background: #2d5a3d; font-weight: 700; }
  .badge {
    display: inline-block; padding: 0.05rem 0.45rem; border-radius: 999px;
    background: #2d5a3d; color: #d9f2e3; font-size: 0.72rem; font-weight: 600;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
</style>
