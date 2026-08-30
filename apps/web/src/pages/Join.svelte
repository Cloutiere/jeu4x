<script lang="ts">
  // Lien d'invitation #/join/<code> (L4/L6) : joint la partie via le lobby
  // puis bascule sur le socket de partie. Si non connecté → login avec
  // retour automatique sur ce lien.
  import { onDestroy, onMount } from 'svelte';
  import { createLobbyClient } from '../lib/lobbyClient.js';
  import type { LobbyClient } from '../lib/lobbyClient.js';
  import { apiBase } from '../lib/net.js';
  import { loadSession } from '../lib/session.js';

  let { code }: { code: string } = $props();

  let client: LobbyClient | null = null;
  let message = $state('Connexion…');

  onMount(async () => {
    const me = await loadSession();
    if (!me) {
      const back = encodeURIComponent(`#/join/${code}`);
      window.location.href = `${apiBase()}/auth/dev?name=Joueur&next=${back}`;
      return;
    }
    message = `Rejoindre ${code}…`;
    client = createLobbyClient();
    client.join(code);
  });

  onDestroy(() => {
    client?.close();
    client = null;
  });
</script>

<p class="loading">{message}</p>

<style>
  .loading { font-family: system-ui, sans-serif; margin: 4rem auto; max-width: 24rem; text-align: center; }
</style>
