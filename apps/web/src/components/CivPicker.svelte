<script lang="ts">
  /**
   * 7n · R-145 · Sélecteur de civilisation (16 cartes — doc « Guide
   * Civilisations ») : nom, dirigeant, avantage de départ, résumé des bonus
   * d'ère cumulatifs, unités uniques.
   * Calibrage canon (Erik 06/09) : la Merveille Antique de l'Égypte est TIRÉE
   * au RNG seedé par le moteur — l'UI ne propose plus de sélection.
   * Le client ne calcule aucune règle : tout est lu des données partagées.
   */
  import { CIVILIZATIONS } from '@game/rules';
  import { civName, civLeader, civStartLabels, civEraSummary, civUniqueSummary } from '../lib/labels.js';

  interface Props {
    /** Civ choisie (null = neutre — aucune civ, parties migrées). */
    value: string | null;
    onchange: (civId: string | null) => void;
    compact?: boolean;
  }
  const { value, onchange, compact = false }: Props = $props();

  const civIds = Object.keys(CIVILIZATIONS.civs).sort((a, b) =>
    CIVILIZATIONS.civs[a]!.name.localeCompare(CIVILIZATIONS.civs[b]!.name, 'fr'),
  );

  function pick(id: string): void {
    if (id === value) return;
    onchange(id);
  }
</script>

<div class="civpicker" class:compact>
  {#each civIds as id (id)}
    {@const civ = CIVILIZATIONS.civs[id]!}
    <button
      type="button"
      class="card"
      class:selected={value === id}
      onclick={() => pick(id)}
      title={`${civName(id)} — ${civLeader(id)}`}
    >
      <span class="name">{civ.name}</span>
      <span class="leader">{civ.leader}</span>
      <span class="start">{civStartLabels(id).join(' · ')}</span>
      <span class="eras">{civEraSummary(id)}</span>
      <span class="uniques">{civUniqueSummary(id)}</span>
    </button>
  {/each}
</div>

<style>
  .civpicker { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.45rem; }
  .civpicker.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .card {
    display: flex; flex-direction: column; gap: 0.12rem; text-align: left;
    border: 1px solid #3c7a52; border-radius: 6px; background: #1d2b21; color: var(--fg, #e8e8e8);
    padding: 0.45rem 0.55rem; cursor: pointer; font: inherit;
  }
  .card:hover { border-color: #7fc79a; }
  .card.selected { border-color: #ffd54f; background: #2b3a24; box-shadow: 0 0 0 1px #ffd54f; }
  .name { font-weight: 700; font-size: 0.92rem; }
  .leader { color: #ffd54f; font-size: 0.75rem; }
  .start { font-size: 0.72rem; color: #bfe8cc; }
  .eras { font-size: 0.68rem; color: #9db8a6; }
  .uniques { font-size: 0.68rem; color: #8fb4ff; }
</style>
