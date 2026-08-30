<script lang="ts">
  // Lien d'invitation #/join/<code> (L4/L6) : joint la partie via le lobby
  // puis bascule sur le socket de partie. Si non connecté → login avec
  // retour automatique sur ce lien. Réagit au changement de code (même route)
  // et affiche les erreurs du lobby — sinon la page reste bloquée sans motif.
  import { onDestroy } from 'svelte';
  import { createLobbyClient } from '../lib/lobbyClient.js';
  import type { LobbyClient } from '../lib/lobbyClient.js';
  import { apiBase } from '../lib/net.js';
  import { loadSession } from '../lib/session.js';

  let { code }: { code: string } = $props();

  let client: LobbyClient | null = null;
  let message = $state('Connexion…');
  let error = $state<string | null>(null);
  let run = 0;
  let unsubs: Array<() => void> = [];

  $effect(() => {
    const current = code;
    const myRun = ++run;
    for (const u of unsubs) u();
    unsubs = [];
    client?.close();
    client = null;
    message = `Rejoindre ${current}…`;
    error = null;
    void (async () => {
      const me = await loadSession();
      if (myRun !== run) return;
      if (!me) {
        const back = encodeURIComponent(`#/join/${current}`);
        window.location.href = `${apiBase()}/auth/dev?name=Joueur&next=${back}`;
        return;
      }
      const c = createLobbyClient();
      unsubs.push(
        c.error.subscribe((e) => {
          if (myRun === run && e) error = e;
        }),
      );
      client = c;
      // Le message part même si le socket n'est pas encore ouvert : net.ts
      // le met en file et l'envoie à l'ouverture.
      c.join(current);
    })();
  });

  onDestroy(() => {
    run += 1;
    for (const u of unsubs) u();
    unsubs = [];
    client?.close();
    client = null;
  });
</script>

<p class="loading">{error ?? message}</p>

<style>
  .loading { font-family: system-ui, sans-serif; margin: 4rem auto; max-width: 24rem; text-align: center; }
</style>
