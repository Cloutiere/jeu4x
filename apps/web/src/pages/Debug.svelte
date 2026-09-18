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

  // HANDOFF-TRACE-RESOLUTION · Trace de résolution du vrai jeu (même endpoint
  // admin, même token). La trace est instrumentation passive : la résolution
  // est bit à bit identique avec ou sans (verrouillé par test moteur).
  interface TraceIndex { tours: number[] }
  interface TraceReponse extends TraceIndex {
    trace: { tour: number; seed: number } | null;
    lisible: string[];
  }
  let toursTraces = $state<number[]>([]);
  let tourSelectionne = $state<number | null>(null);
  let traceReponse = $state<TraceReponse | null>(null);
  let traceErreur = $state<string | null>(null);

  async function chargerIndexTraces(): Promise<void> {
    const res = await fetch(`${apiBase()}/admin/game/${code}/trace`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      traceErreur = `GET /admin/game/${code}/trace : ${res.status}`;
      return;
    }
    toursTraces = ((await res.json()) as TraceIndex).tours;
    traceErreur = null;
  }

  async function chargerTrace(tour: number): Promise<void> {
    tourSelectionne = tour;
    traceReponse = null;
    const res = await fetch(`${apiBase()}/admin/game/${code}/trace?turn=${tour}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      traceErreur = `GET /admin/game/${code}/trace?turn=${tour} : ${res.status}`;
      return;
    }
    traceReponse = (await res.json()) as TraceReponse;
    traceErreur = null;
  }

  function telechargerTraceJson(): void {
    if (!traceReponse?.trace) return;
    const json = JSON.stringify(traceReponse.trace, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-partie-${code}-tour${traceReponse.trace.tour + 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
    void chargerIndexTraces();
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
    <section>
      <h2>Trace de résolution (décisions du moteur, règles citées, compte de seed)</h2>
      {#if traceErreur}<p class="error">{traceErreur}</p>{/if}
      {#if toursTraces.length === 0}
        <p>Aucune trace disponible — résous un tour de la partie, puis recharge.</p>
      {:else}
        <p class="hint">
          Tours tracés :
          {#each toursTraces as t (t)}
            <button type="button" class:actif={t === tourSelectionne} onclick={() => chargerTrace(t)}>Tour {t + 1}</button>
          {/each}
        </p>
      {/if}
      {#if traceReponse?.trace}
        <p>
          <button type="button" onclick={telechargerTraceJson}>💾 Télécharger le JSON (tour {traceReponse.trace.tour + 1}, seed {traceReponse.trace.seed})</button>
        </p>
        <pre>{traceReponse.lisible.join('\n')}</pre>
      {/if}
    </section>
  {/if}
</main>

<style>
  main { max-width: 60rem; margin: 1rem auto; font-family: system-ui, sans-serif; color: #e2e6ea; }
  header { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.75rem; }
  section { margin: 1rem 0; border: 1px solid #4a5158; border-radius: 6px; padding: 0.75rem; background: #191e24; }
  h2 { color: #9aa7b2; font-size: 0.95rem; margin: 0 0 0.4rem; }
  pre { max-height: 26rem; overflow: auto; font-size: 0.72rem; color: #d8d5cd; }
  .error { color: #b00020; }
  .hint { font-size: 0.8rem; display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center; }
  button.actif { background: #1f2937; color: #fff; }
</style>
