<script lang="ts">
  // Squelette Phase 1 (L1) — client complet en L6 (login, lobby, partie).
  let ready = $state(false);
  $effect(() => {
    ready = true;
  });
</script>

<main>
  <h1>4X multijoueur asynchrone</h1>
  <p>Socle Phase 1 — client minimal à venir (L6).</p>
  {#if ready}<p data-testid="ready">Client prêt.</p>{/if}
</main>
