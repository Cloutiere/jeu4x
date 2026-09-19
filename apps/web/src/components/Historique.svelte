<script lang="ts">
  /** HANDOFF-RESOLUTION-DEPLACEMENTS §4 — historique d'événements persistant
   *  du menu de droite (style du Journal : plus récents en tête, horodatage
   *  de tour). Alimenté par tous les toasts affichés (événements, bonus de
   *  hutte, refus d'ordre, avertissements). */
  import { eventHistory } from '../lib/eventHistory.js';

  let { max = 60 }: { max?: number } = $props();

  const recent = $derived($eventHistory.slice(-max).reverse());
</script>

<section class="panel">
  <h2>Historique ({$eventHistory.length})</h2>
  {#if recent.length === 0}
    <p class="hint">Aucun événement pour l'instant.</p>
  {:else}
    <ol>
      {#each recent as e (e.id)}
        <li class={e.kind}><span class="tour">Tour {e.turn}</span> {e.text}</li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .panel { border: 1px solid #3a4148; border-radius: 8px; padding: 0.7rem 0.85rem; background: #1d242b; min-height: 6rem; }
  h2 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  ol { margin: 0; padding-left: 1.2rem; max-height: 14rem; overflow: auto; display: flex; flex-direction: column; gap: 0.15rem; }
  li { font-size: 0.82rem; color: #c3ccd4; }
  li.good { color: #a5d6a7; }
  li.bad { color: #ef9a9a; }
  .tour { color: #7fb3ff; margin-right: 0.3rem; font-size: 0.74rem; }
  .hint { color: #8b98a5; font-size: 0.82rem; margin: 0; }
</style>
