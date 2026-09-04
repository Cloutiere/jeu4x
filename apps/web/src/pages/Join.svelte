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
  import CivPicker from '../components/CivPicker.svelte';

  let { code }: { code: string } = $props();

  let client: LobbyClient | null = null;
  let message = $state('Connexion…');
  let error = $state<string | null>(null);
  let run = 0;
  let unsubs: Array<() => void> = [];
  // 7n · R-145 : le joueur B choisit SA civilisation au join 🔶 (défaut Rome).
  let joinCiv = $state<string | null>('rome');
  let joinWonder = $state<string | null>(null);
  let sessionReady = $state(false);

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
      sessionReady = true;
      const c = createLobbyClient();
      unsubs.push(
        c.error.subscribe((e) => {
          if (myRun === run && e) error = e;
        }),
      );
      client = c;
      // 7n : le join attend le CHOIX de la civ (bouton « Rejoindre »).
      message = `Choisissez votre civilisation pour rejoindre ${current}.`;
    })();
  });

  function confirmJoin(): void {
    if (!client) return;
    // Le message part même si le socket n'est pas encore ouvert : net.ts
    // le met en file et l'envoie à l'ouverture.
    client.join(code, joinCiv ?? undefined, joinCiv && joinWonder ? joinWonder : undefined);
  }

  onDestroy(() => {
    run += 1;
    for (const u of unsubs) u();
    unsubs = [];
    client?.close();
    client = null;
  });
</script>

{#if sessionReady && !error}
  <main class="joinciv">
    <h1>Rejoindre la partie {code}</h1>
    <p>{message}</p>
    <CivPicker value={joinCiv} wonder={joinWonder} onchange={(civ, wonder) => { joinCiv = civ; joinWonder = wonder ?? null; }} compact />
    <button type="button" class="confirm" onclick={confirmJoin}>Rejoindre avec cette civilisation</button>
  </main>
{:else}
  <p class="loading">{error ?? message}</p>
{/if}



<style>
  .loading { font-family: system-ui, sans-serif; margin: 4rem auto; max-width: 24rem; text-align: center; }
  .joinciv { max-width: 40rem; margin: 2rem auto; font-family: system-ui, sans-serif; display: flex; flex-direction: column; gap: 0.8rem; }
  .confirm { align-self: flex-start; padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer; }
</style>
