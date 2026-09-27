<script lang="ts">
  /**
   * LOBBY-5 · D2 — Nuancier des 6 palettes 4 tons (accents.json, source
   * unique via @game/shared). Les palettes PRISES sont grisées avec le nom
   * du preneur ; la sélection pilote l'accent en jeu (unités cuites, barres
   * de PV, anneaux, frontières).
   * LOBBY-PREMIUM v3 (retour Erik 27/09) : pastilles = ses SVG allumé/éteint
   * (pastilles.json) — allumé si sélectionnée, éteint sinon ; l'anneau or de
   * sélection reste porté par le SVG allumé.
   */
  import { nomPalette4, ORDRE_PALETTES4 } from '@game/shared';
  import { pastilleDe } from '../lib/pastilles.js';

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
    {@const pastille = pastilleDe(id)}
    {@const selectionnee = value === id}
    <button
      type="button"
      class="pastille"
      class:selected={selectionnee}
      class:prise={!!preneur && !selectionnee}
      style:--img={pastille ? (selectionnee ? pastille.allumee : pastille.eteinte) : 'none'}
      style:--c="#888"
      disabled={!!preneur && !selectionnee}
      onclick={() => onchange(id)}
      title={preneur ? `${nomPalette4(id)} — déjà prise par ${preneur}` : nomPalette4(id)}
    >
      {#if pastille}
        <img src={selectionnee ? pastille.allumee : pastille.eteinte} alt="" />
      {/if}
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
    background: var(--c); border: none; cursor: pointer; padding: 0;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
  }
  .pastille img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .pastille:hover:not(:disabled) { transform: scale(1.08); }
  .pastille.selected { transform: scale(1.12); }
  .pastille.prise { opacity: 0.35; cursor: not-allowed; }
  .pastille.prise .nom {
    position: absolute; inset: auto -0.5rem -1.15rem -0.5rem; font-size: 0.58rem;
    color: #dfe8df; white-space: nowrap; text-align: center; overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
