<script lang="ts">
  /**
   * Journal des événements filtrés (L5) — réutilise les libellés L4.
   * Chantier BOT-SOLO : les ids moteur sont résolus en noms (« Bot »).
   * REPLAY-RESOLUTION (L1/D5) : une entrée portant une case (hexDeLEvenement,
   * depuis les données structurées — jamais le libellé) est CLIQUABLE : le
   * clic centre la carte sur la case SANS changer le zoom (centerOnHex).
   *
   * UI-JEU-T2 (§1.6, bonus 🔶 RAPPORT-ENGAGEMENT) : ligne récapitulative en
   * tête « ⚔ n combats ce tour » — cliquable, ouvre le rapport de la
   * DERNIÈRE case de combat (mécanique existante : popover RAPPORT-ENGAGEMENT,
   * même pipeline que le clic case). Absente quand aucun combat ce tour.
   * Comportement journal inchangé (D1/D4).
   */
  import type { GameView } from '../lib/gameClient.js';
  import type { Hex } from '@game/rules';
  import { eventLabel } from '../lib/labels.js';
  import { hexDeLEvenement } from '../lib/replay.js';

  let {
    view,
    max = 200,
    onCentrerHex,
    combats = 0,
    onOuvrirCombats,
  }: {
    view: GameView;
    max?: number;
    onCentrerHex?: (hex: Hex) => void;
    /** UI-JEU-T2 · §1.6 : nombre de cases de combat ce tour (0 = pas de ligne). */
    combats?: number;
    onOuvrirCombats?: () => void;
  } = $props();

  const recent = $derived(view.events.slice(-max).reverse());
  const nameOf = $derived.by(() => {
    const byEngineId = new Map(view.players.map((p) => [p.engineId, p.name]));
    return (id: string) => byEngineId.get(id) ?? id;
  });
</script>

<section class="panel">
  <h2>Journal ({view.events.length})</h2>
  {#if combats > 0 && onOuvrirCombats}
    <!-- UI-JEU-T2 · §1.6 : récapitulatif des combats du tour (🔶 à l'œil). -->
    <button type="button" class="combats" title="Ouvre le rapport de la dernière case de combat du tour" onclick={() => onOuvrirCombats()}>
      ⚔ {combats} combat{combats > 1 ? 's' : ''} ce tour
    </button>
  {/if}
  {#if recent.length === 0}
    <p class="hint">Aucun événement pour l'instant.</p>
  {:else}
    <ol>
      {#each recent as event (event.seq)}
        {@const hex = hexDeLEvenement(event)}
        <li class:clickable={hex !== null} title={hex ? 'Centrer la carte sur cette case (zoom inchangé)' : undefined}>
          <code>#{event.seq}</code><!--
       --><span
            class="entry"
            role={hex ? 'button' : undefined}
            tabindex={hex ? 0 : undefined}
            onclick={hex && onCentrerHex ? () => onCentrerHex(hex) : undefined}
            onkeydown={(e) => {
              if (hex && onCentrerHex && (e.key === 'Enter' || e.key === ' ')) onCentrerHex(hex);
            }}
          >{eventLabel(event, nameOf)}</span>
        </li>
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
  /* §1.6 — ligne ⚔ (style chip or, comme les boutons du panneau unité). */
  .combats {
    width: 100%;
    margin: 0 0 0.45rem;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.82rem; letter-spacing: 0.05em;
    color: #f0a8a0;
    background: rgba(138, 58, 48, 0.22);
    border: 1px solid #8a3a30;
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    text-align: left;
  }
  .combats:hover { border-color: #c96a5a; box-shadow: 0 0 8px rgba(138, 58, 48, 0.5); }
  ol { margin: 0; padding-left: 1.2rem; max-height: 14rem; overflow: auto; display: flex; flex-direction: column; gap: 0.18rem; }
  li { font-size: 0.82rem; color: var(--texte, #e9e4d3); }
  li.clickable .entry { cursor: pointer; }
  li.clickable .entry:hover { color: var(--or-clair, #e8c96a); text-decoration: underline; }
  code { color: var(--or, #c9a227); margin-right: 0.3rem; font-size: 0.74rem; }
  .hint { color: var(--texte-doux, #b6ad93); font-size: 0.82rem; margin: 0; }
</style>
