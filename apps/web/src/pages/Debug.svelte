<script lang="ts">
  // Mode reveal (L0, Phase 3) — DÉVELOPPEMENT UNIQUEMENT : dump NON filtré
  // d'une partie via l'endpoint admin existant (`/admin/game/<code>`,
  // protégé par ADMIN_TOKEN côté Worker). Le token de dev est fourni par
  // `.env.local` (gitignored) et ce code est éliminé des builds de production
  // par la garde `import.meta.env.DEV` (Vite remplace le bloc par false).
  import { apiBase } from '../lib/net.js';

  let { code }: { code: string } = $props();

  const DEV = import.meta.env.DEV;
  const token = import.meta.env.VITE_DEV_ADMIN_TOKEN as string | undefined;

  interface AdminDump {
    meta: unknown;
    state: unknown;
    orders: unknown;
    locked: unknown;
    resolving: unknown;
    lastEvents: unknown;
  }

  /** Phase 6b : rapport de génération d'une carte procédurale (meta.progen). */
  const progenOf = (meta: unknown): Record<string, unknown> | null => {
    const p = (meta as { progen?: Record<string, unknown> } | null)?.progen;
    return p ?? null;
  };

  let dump = $state<AdminDump | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!DEV || !token) return;
    dump = null;
    error = null;
    const current = code;
    void fetch(`${apiBase()}/admin/game/${current}`, {
      headers: { authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (current !== code) return;
      if (!res.ok) {
        error = `GET /admin/game/${current} : ${res.status}`;
        return;
      }
      dump = (await res.json()) as AdminDump;
    });
  });
</script>

<main class="debug">
  <header>
    <a href={`#/game/${code}`}>← Partie {code}</a>
    <strong>Mode reveal (état NON filtré)</strong>
  </header>

  {#if !DEV}
    <p class="error">Mode reveal indisponible : réservé au développement (import.meta.env.DEV).</p>
  {:else if !token}
    <p class="error">
      Token manquant : définir <code>VITE_DEV_ADMIN_TOKEN</code> dans <code>apps/web/.env.local</code>
      (copier <code>.env.local.example</code>), avec la valeur de <code>ADMIN_TOKEN</code> du serveur.
    </p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if !dump}
    <p>Chargement du dump…</p>
  {:else}
    <section>
      <h2>meta</h2>
      <pre>{JSON.stringify(dump.meta, null, 2)}</pre>
    </section>
    {#if progenOf(dump.meta)}
      <section>
        <h2>génération procédurale (seed · ratio terre · checksum de fertilité)</h2>
        <pre>{JSON.stringify(progenOf(dump.meta), null, 2)}</pre>
      </section>
    {/if}
    <section>
      <h2>state (non filtré — toutes les unités, villes et la graine)</h2>
      <pre>{JSON.stringify(dump.state, null, 2)}</pre>
    </section>
    <section>
      <h2>orders / locked / resolving</h2>
      <pre>{JSON.stringify({ orders: dump.orders, locked: dump.locked, resolving: dump.resolving }, null, 2)}</pre>
    </section>
    <section>
      <h2>lastEvents</h2>
      <pre>{JSON.stringify(dump.lastEvents, null, 2)}</pre>
    </section>
  {/if}
</main>

<style>
  main { max-width: 60rem; margin: 1rem auto; font-family: system-ui, sans-serif; }
  header { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.75rem; }
  section { margin: 1rem 0; border: 1px solid #ccc; border-radius: 6px; padding: 0.75rem; }
  pre { max-height: 26rem; overflow: auto; font-size: 0.72rem; }
  .error { color: #b00020; }
</style>
