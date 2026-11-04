<script lang="ts">
  /**
   * GESTE-ARMEE rév. 2 (retour d'Erik du 04/11) — carte de PROPOSITION
   * automatique : quand ≥ 3 unités amies du même type sont programmées pour
   * finir la prochaine résolution sur la même case (ou y sont déjà), le jeu
   * demande si le joueur veut les convertir en armée — refusable (objectif
   * tactique sans fusion). Au-delà de 3, sélection par CLIC sur chacune
   * (chips, exactement 3). Les Move programmés persistent : la fusion se
   * produit à la résolution si le mouvement réussit (R-44, échec propre sinon).
   */
  import type { PropositionArmee } from '../lib/geste-armee.js';
  import { unitType } from '@game/rules';

  interface Props {
    propositions: PropositionArmee[];
    onFormer(membres: string[], rally: { q: number; r: number }): void;
    /** Ignore cette proposition (le tour d'expiration est géré côté page). */
    onIgnorer(prop: PropositionArmee): void;
  }

  let { propositions, onFormer, onIgnorer }: Props = $props();

  const courante = $derived(propositions[0] ?? null);
  const triple = $derived(!!courante && courante.membres.length === 3);

  let choix = $state<Set<string>>(new Set());

  function basculer(id: string): void {
    const suivant = new Set(choix);
    if (suivant.has(id)) suivant.delete(id);
    else if (suivant.size < 3) suivant.add(id);
    choix = suivant;
  }

  function confirmer(): void {
    if (!courante) return;
    const membres = triple
      ? courante.membres
      : courante.membres.filter((id) => choix.has(id));
    if (membres.length !== 3) return;
    onFormer(membres, courante.rally);
    choix = new Set();
  }
  function ignorer(): void {
    if (!courante) return;
    onIgnorer(courante);
    choix = new Set();
  }
</script>

{#if courante}
  <section class="prop-armee" aria-label="Proposition de formation d'armée">
    <h3>⚔ Formation d'armée possible</h3>
    {#if triple}
      <p>
        {courante!.membres.length} {unitType(courante!.type).name}s sont réunis en ({courante!.rally.q},{courante!.rally.r})
        — les convertir en <strong>armée</strong> ?
      </p>
      <p class="note">Les ordres déjà programmés sont conservés : la fusion se produit quand les trois y sont.</p>
    {:else}
      <p>
        {courante!.membres.length} {unitType(courante!.type).name}s convergent vers ({courante!.rally.q},{courante!.rally.r})
        — cliquez les <strong>3</strong> unités à fusionner :
      </p>
      <div class="chips">
        {#each courante!.membres as id (id)}
          <button type="button" class:choisi={choix.has(id)} onclick={() => basculer(id)}>
            {id}{choix.has(id) ? ' ✓' : ''}
          </button>
        {/each}
      </div>
    {/if}
    <div class="btns">
      <button type="button" class="primary" disabled={!triple && choix.size !== 3} onclick={confirmer}>
        {triple ? '⚔ Former l\'armée' : `⚔ Former l'armée (${choix.size}/3)`}
      </button>
      <button type="button" onclick={ignorer}>Non, pas maintenant</button>
    </div>
  </section>
{/if}

<style>
  .prop-armee {
    position: absolute;
    top: 0.6rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    max-width: 26rem;
    border: 1px solid var(--panneau-bord, rgba(201, 162, 39, 0.55));
    border-radius: 10px;
    padding: 0.6rem 0.8rem;
    background: linear-gradient(180deg, #241f16 0%, #1b1712 100%);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(201, 162, 39, 0.12);
  }
  h3 {
    margin: 0 0 0.3rem;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--or-clair, #e8c96a);
  }
  p { margin: 0.2rem 0; font-size: 0.84rem; color: var(--texte, #e9e4d3); }
  .note { font-size: 0.76rem; color: var(--texte-doux, #b6ad93); opacity: 0.85; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0.35rem 0; }
  .chips button {
    padding: 0.25rem 0.55rem; cursor: pointer; border-radius: 6px;
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    background: rgba(201, 162, 39, 0.08);
    color: var(--texte, #e9e4d3);
    font-size: 0.78rem;
  }
  .chips button.choisi { background: rgba(201, 162, 39, 0.28); border-color: var(--or, #c9a227); color: var(--or-clair, #e8c96a); }
  .btns { display: flex; gap: 0.4rem; margin-top: 0.4rem; }
  .btns button {
    padding: 0.3rem 0.65rem; cursor: pointer; border-radius: 6px;
    border: 1px solid var(--panneau-bord, rgba(201, 162, 39, 0.55));
    background: rgba(201, 162, 39, 0.08);
    color: var(--texte, #e9e4d3);
    font-size: 0.82rem;
  }
  .btns button.primary { background: rgba(201, 162, 39, 0.22); border-color: var(--or, #c9a227); color: var(--or-clair, #e8c96a); }
  .btns button:disabled { opacity: 0.45; cursor: default; }
</style>
