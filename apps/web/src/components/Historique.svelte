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
  /* UI-JEU-T2 · D3 — habillage AAA (tokens or-sur-sombre, serif). */
  .panel {
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    border-radius: 10px;
    padding: 0.7rem 0.85rem;
    background: linear-gradient(180deg, #241f16 0%, #1b1712 100%);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(201, 162, 39, 0.08);
    min-height: 6rem;
  }
  h2 {
    margin: 0 0 0.45rem;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--or-clair, #e8c96a);
    border-bottom: 1px solid transparent;
    border-image: linear-gradient(90deg, transparent, var(--or, #c9a227), transparent) 1;
    padding-bottom: 0.3rem;
  }
  ol { margin: 0; padding-left: 1.2rem; max-height: 14rem; overflow: auto; display: flex; flex-direction: column; gap: 0.18rem; }
  li { font-size: 0.82rem; color: var(--texte, #e9e4d3); }
  li.good { color: #a5d6a7; }
  li.bad { color: #ef9a9a; }
  .tour {
    color: var(--or, #c9a227); margin-right: 0.3rem; font-size: 0.72rem;
    font-family: var(--serif-or, Georgia, serif); letter-spacing: 0.04em;
  }
  .hint { color: var(--texte-doux, #b6ad93); font-size: 0.82rem; margin: 0; }
</style>
