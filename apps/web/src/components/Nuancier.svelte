<script lang="ts">
  /**
   * LOBBY-5 · D2 — Nuancier des 6 palettes 4 tons (accents.json, source
   * unique via @game/shared). Les palettes PRISES sont grisées avec le nom
   * du preneur ; la sélection pilote l'accent en jeu (unités cuites, barres
   * de PV, anneaux, frontières).
   */
  import { PALETTES4, nomPalette4, ORDRE_PALETTES4 } from '@game/shared';

  interface Props {
    /** Palette sélectionnée. */
    value: string | null;
    onchange: (paletteId: string) => void;
    /** paletteId → nom de l'occupant (prise en temps réel). */
    prises?: Record<string, string | undefined>;
    /** Palette à exclure de la propagation (siège en cours d'édition). */
    ignore?: string | null;
  }
  const { value, onchange, prises = {}, ignore = null }: Props = $props();

  const cles = $derived(ORDRE_PALETTES4);
  function prisePar(id: string): string | undefined {
    return Object.entries(prises).find(([pid, qui]) => pid === id && qui && pid !== ignore)?.[1];
  }
</script>

<div class="nuancier" role="radiogroup" aria-label="Couleur de faction">
  {#each cles as id (id)}
    {@const preneur = prisePar(id)}
    <button
      type="button"
      class="pastille"
      class:selected={value === id}
      class:prise={!!preneur && value !== id}
      style:--c={(PALETTES4 as Record<string, { base: string }>)[id]?.base ?? '#888'}
      disabled={!!preneur && value !== id}
      onclick={() => onchange(id)}
      title={preneur ? `${nomPalette4(id)} — déjà prise par ${preneur}` : nomPalette4(id)}
    >
      {#if preneur}
        <span class="nom">{preneur}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .nuancier { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .pastille {
    position: relative; width: 2.4rem; height: 2.4rem; border-radius: 50%;
    background: var(--c); border: 2px solid #2b2620; cursor: pointer; padding: 0;
  }
  .pastille:hover { border-color: #ffd54f; }
  .pastille.selected { border-color: #ffd54f; box-shadow: 0 0 0 2px #ffd54f; }
  .pastille.prise { opacity: 0.28; cursor: not-allowed; }
  .pastille.prise .nom {
    position: absolute; inset: auto -0.5rem -1.15rem -0.5rem; font-size: 0.58rem;
    color: #dfe8df; white-space: nowrap; text-align: center; overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
