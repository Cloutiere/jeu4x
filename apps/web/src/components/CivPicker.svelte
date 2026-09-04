<script lang="ts">
  /**
   * 7n · R-145 · Sélecteur de civilisation (16 cartes — doc « Guide
   * Civilisations ») : nom, dirigeant, avantage de départ, résumé des bonus
   * d'ère cumulatifs, unités uniques. Le choix de l'Égypte ouvre une liste de
   * Merveilles Antique 🔶 (params `egypteWonderChoices` — données).
   * Le client ne calcule aucune règle : tout est lu des données partagées.
   */
  import { CIVILIZATIONS, WONDERS, uniqueUnitsOf, UNIT_TYPES } from '@game/rules';
  import { civName, civLeader, civStartLabels, civEraSummary, civUniqueSummary, EGYPT_WONDER_LABEL } from '../lib/labels.js';

  interface Props {
    /** Civ choisie (null = neutre — aucune civ, parties migrées). */
    value: string | null;
    /** Merveille Antique (Égypte uniquement). */
    wonder?: string | null;
    onchange: (civId: string | null, wonderId?: string | null) => void;
    compact?: boolean;
  }
  const { value, wonder = null, onchange, compact = false }: Props = $props();

  const civIds = Object.keys(CIVILIZATIONS.civs).sort((a, b) =>
    CIVILIZATIONS.civs[a]!.name.localeCompare(CIVILIZATIONS.civs[b]!.name, 'fr'),
  );

  const wonderChoices = $derived(
    CIVILIZATIONS.params.egypteWonderChoices.map((id) => ({ id, name: WONDERS[id]?.name ?? id })),
  );

  function pick(id: string): void {
    if (id === value) return;
    // Égypte : proposer la première merveille de la liste (choix modifiable 🔶).
    onchange(id, id === 'egypte' ? CIVILIZATIONS.params.egypteWonderChoices[0]! : null);
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

{#if value === 'egypte'}
  <label class="wonder-choice">
    {EGYPT_WONDER_LABEL}
    <select
      value={wonder ?? CIVILIZATIONS.params.egypteWonderChoices[0]}
      onchange={(e) => onchange('egypte', (e.currentTarget as HTMLSelectElement).value)}
    >
      {#each wonderChoices as w (w.id)}
        <option value={w.id}>{w.name}</option>
      {/each}
    </select>
  </label>
{/if}

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
  .wonder-choice { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem; font-size: 0.85rem; }
</style>
