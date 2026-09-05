<script lang="ts">
  /** Journal des événements filtrés (L5) — réutilise les libellés L4.
   *  Chantier BOT-SOLO : les ids moteur sont résolus en noms (« Bot »). */
  import type { GameView } from '../lib/gameClient.js';
  import { eventLabel } from '../lib/labels.js';

  let { view, max = 200 }: { view: GameView; max?: number } = $props();

  const recent = $derived(view.events.slice(-max).reverse());
  const nameOf = $derived.by(() => {
    const byEngineId = new Map(view.players.map((p) => [p.engineId, p.name]));
    return (id: string) => byEngineId.get(id) ?? id;
  });
</script>

<section class="panel">
  <h2>Journal ({view.events.length})</h2>
  {#if recent.length === 0}
    <p class="hint">Aucun événement pour l'instant.</p>
  {:else}
    <ol>
      {#each recent as event (event.seq)}
        <li><code>#{event.seq}</code> {eventLabel(event, nameOf)}</li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .panel { border: 1px solid #3a4148; border-radius: 8px; padding: 0.7rem 0.85rem; background: #1d242b; min-height: 6rem; }
  h2 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  ol { margin: 0; padding-left: 1.2rem; max-height: 14rem; overflow: auto; display: flex; flex-direction: column; gap: 0.15rem; }
  li { font-size: 0.82rem; color: #c3ccd4; }
  code { color: #7fb3ff; margin-right: 0.3rem; }
  .hint { color: #8b98a5; font-size: 0.82rem; margin: 0; }
</style>
