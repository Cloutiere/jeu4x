<script lang="ts">
  // App (L6) : routeur minimal par hash + garde de session.
  // Routes : #/login · #/lobby · #/game/<code> · #/join/<code> (lien d'invitation)
  //         · #/debug/<code> (mode reveal — dev uniquement, L0 Phase 3)
  //         · #/progen (labo de génération procédurale — Phase 6b, sans session :
  //           outil client-side pur, aucune partie ni donnée de jeu).
  import { onMount } from 'svelte';
  import { session, loadSession } from './lib/session.js';
  import Login from './pages/Login.svelte';
  import Lobby from './pages/Lobby.svelte';
  import Game from './pages/Game.svelte';
  import Join from './pages/Join.svelte';
  import Debug from './pages/Debug.svelte';
  import Progen from './pages/Progen.svelte';

  type Route =
    | { page: 'login' }
    | { page: 'lobby' }
    | { page: 'game'; code: string }
    | { page: 'join'; code: string }
    | { page: 'debug'; code: string }
    | { page: 'progen' };

  function parseHash(): Route {
    const hash = window.location.hash.replace(/^#/, '') || '/';
    if (hash === '/lobby') return { page: 'lobby' };
    if (hash === '/progen') return { page: 'progen' };
    const game = /^\/game\/([A-Z0-9]{6})$/.exec(hash);
    if (game) return { page: 'game', code: game[1]! };
    const join = /^\/join\/([A-Z0-9]{6})$/.exec(hash);
    if (join) return { page: 'join', code: join[1]! };
    const debug = /^\/debug\/([A-Z0-9]{6})$/.exec(hash);
    if (debug) return { page: 'debug', code: debug[1]! };
    return { page: 'login' };
  }

  let route = $state<Route>(parseHash());

  function onHashChange(): void {
    route = parseHash();
  }

  onMount(() => {
    window.addEventListener('hashchange', onHashChange);
    void loadSession().then((me) => {
      // Connecté et atterrissage par défaut → lobby.
      if (me && route.page === 'login') window.location.hash = '#/lobby';
    });
    return () => window.removeEventListener('hashchange', onHashChange);
  });
</script>

{#if $session === undefined}
  <p class="loading">Chargement…</p>
{:else if route.page === 'progen'}
  <!-- Labo de génération (Phase 6b) : sans session, aucune connexion requise. -->
  <Progen />
{:else if route.page === 'join'}
  <!-- La page Join gère elle-même la reconnexion si la session est absente. -->
  <Join code={route.code} />
{:else if $session === null}
  <Login />
{:else if route.page === 'lobby'}
  <Lobby />
{:else if route.page === 'game'}
  <Game code={route.code} />
{:else if route.page === 'debug'}
  <!-- Mode reveal : la page affiche elle-même l'indisponibilité hors dev. -->
  <Debug code={route.code} />
{:else}
  <Login />
{/if}

<style>
  .loading { font-family: system-ui, sans-serif; margin: 4rem auto; max-width: 20rem; text-align: center; }
</style>
