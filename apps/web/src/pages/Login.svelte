<script lang="ts">
  // Page login (L6) : stub local + boutons OAuth Google/Discord.
  // Le formulaire stub est masqué quand le serveur l'interdit (production) ;
  // les échecs OAuth reviennent ici avec ?loginError=1 (redirection serveur).
  import { onMount } from 'svelte';
  import { apiBase } from '../lib/net.js';

  let name = $state('');
  let stub = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    if (new URLSearchParams(window.location.search).get('loginError')) {
      error = 'La connexion a échoué — réessayez. Si le problème persiste, contactez l\u2019administrateur.';
      history.replaceState(null, '', window.location.pathname + '#/login');
    }
    try {
      const res = await fetch(`${apiBase()}/api/auth-mode`);
      const data = (await res.json()) as { stub?: boolean };
      stub = data.stub !== false;
    } catch {
      stub = true; // en cas de doute, laisser le choix local (rejeté par le serveur si interdit)
    }
  });

  function devLogin(): void {
    const who = encodeURIComponent(name.trim() || 'Joueur');
    window.location.href = `${apiBase()}/auth/dev?name=${who}&next=${encodeURIComponent('#/lobby')}`;
  }
  function oauth(provider: 'google' | 'discord'): void {
    window.location.href = `${apiBase()}/auth/${provider}?next=${encodeURIComponent('#/lobby')}`;
  }
</script>

<main class="login">
  <h1>4X multijoueur asynchrone</h1>
  <p>Connectez-vous pour rejoindre le lobby.</p>

  {#if error}<p class="error">{error}</p>{/if}

  {#if stub}
    <fieldset>
      <legend>Connexion locale (mode stub)</legend>
      <label>
        Nom
        <input bind:value={name} placeholder="Alice" onkeydown={(e) => e.key === 'Enter' && devLogin()} />
      </label>
      <button type="button" onclick={devLogin}>Entrer</button>
    </fieldset>
  {/if}

  <fieldset>
    <legend>OAuth</legend>
    <button type="button" onclick={() => oauth('google')}>Se connecter avec Google</button>
    <button type="button" onclick={() => oauth('discord')}>Se connecter avec Discord</button>
  </fieldset>
</main>

<style>
  main { max-width: 28rem; margin: 4rem auto; font-family: system-ui, sans-serif; }
  fieldset { margin-bottom: 1rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  label { display: flex; gap: 0.5rem; align-items: center; flex: 1; }
  input { flex: 1; }
  button { padding: 0.4rem 0.8rem; cursor: pointer; }
  .error { color: #b00020; }
</style>
