<script lang="ts">
  /**
   * HANDOFF-CHRONIQUES · L2 — journal joueur UNIFIÉ « Chroniques » (colonne
   * droite). Remplace Historique.svelte (toasts) + Journal.svelte (brut) :
   * 7 catégories à icônes filtrables (D2), ZÉRO coordonnée (D3 — le clic ne
   * recentre que si la cible est connue/visible), UNE entrée par combat qui
   * ouvre le rapport RAPPORT-ENGAGEMENT (D5), sections par tour repliables
   * (D7), habillage AAA or-sur-sombre (D8). La source est le store persistant
   * `chronique` (lib/chronique.ts) — survit au rechargement de page (D7).
   */
  import type { GameView } from '../lib/gameClient.js';
  import type { Hex } from '@game/rules';
  import { CATEGORIES, chronique } from '../lib/chronique.js';
  import type { Categorie, EntreeChronique } from '../lib/chronique.js';

  let {
    view,
    onCentrerHex,
    onOuvrirCombat,
  }: {
    view: GameView;
    onCentrerHex?: (hex: Hex) => void;
    /** D5 — ouvre le rapport RAPPORT-ENGAGEMENT de la case (recentrage inclus côté page). */
    onOuvrirCombat?: (hex: Hex) => void;
  } = $props();

  /** Filtres par catégorie (D2) — tout actif par défaut. */
  let actives = $state<Set<Categorie>>(new Set(CATEGORIES.map((c) => c.id)));

  function basculer(cat: Categorie): void {
    const next = new Set(actives);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    actives = next;
  }

  /** Sections repliables (D7) — ouvertes par défaut, le clic referme. */
  let fermes = $state<Set<number>>(new Set());
  function basculerTour(tour: number): void {
    const next = new Set(fermes);
    if (next.has(tour)) next.delete(tour);
    else next.add(tour);
    fermes = next;
  }

  const filtrees = $derived($chronique.filter((e) => actives.has(e.cat)));
  /** Groupées par tour, tour le plus récent en tête (plus récentes d'abord). */
  const tours = $derived.by(() => {
    const groupes = new Map<number, EntreeChronique[]>();
    for (const e of filtrees) {
      let g = groupes.get(e.tour);
      if (!g) {
        g = [];
        groupes.set(e.tour, g);
      }
      g.unshift(e);
    }
    return [...groupes.entries()].sort((a, b) => b[0] - a[0]).map(([tour, entrees]) => ({ tour, entrees }));
  });
  const nbCategorie = $derived.by(() => {
    const map = new Map<Categorie, number>();
    for (const e of $chronique) map.set(e.cat, (map.get(e.cat) ?? 0) + 1);
    return map;
  });

  /** D3 : recentrage UNIQUEMENT si la cible est connue/visible (hex non null). */
  function clic(entree: EntreeChronique): void {
    if (entree.combatHex && onOuvrirCombat) {
      onOuvrirCombat(entree.combatHex);
      return;
    }
    if (entree.hex && onCentrerHex) onCentrerHex(entree.hex);
  }
</script>

<section class="panel">
  <h2>Chroniques ({$chronique.length})</h2>
  <!-- D2 : chips de filtres par catégorie. -->
  <div class="filtres" role="group" aria-label="Filtres de la Chronique">
    {#each CATEGORIES as c (c.id)}
      <button
        type="button"
        class="chip-filtre"
        class:active={actives.has(c.id)}
        title={actives.has(c.id) ? `Masquer ${c.label}` : `Afficher ${c.label}`}
        onclick={() => basculer(c.id)}
      >
        {c.icone}{nbCategorie.get(c.id) ? ` ${nbCategorie.get(c.id)}` : ''}
      </button>
    {/each}
  </div>
  {#if tours.length === 0}
    <p class="hint">Aucun événement pour l'instant.</p>
  {:else}
    {#each tours as groupe (groupe.tour)}
      <details class="tour-section" open={!fermes.has(groupe.tour)}>
        <summary onclick={(e) => { e.preventDefault(); basculerTour(groupe.tour); }}>
          Tour {groupe.tour} <span class="compte">({groupe.entrees.length})</span>
        </summary>
        <ol>
          {#each groupe.entrees as e (e.id)}
            <li class={e.ton}>
              <span class="cat">{CATEGORIES.find((c) => c.id === e.cat)?.icone ?? '•'}</span><!--
           --><span
                class="entry"
                class:clickable={!!(e.combatHex || e.hex)}
                role={e.combatHex || e.hex ? 'button' : undefined}
                tabindex={e.combatHex || e.hex ? 0 : undefined}
                title={e.combatHex
                  ? 'Ouvre le rapport de ce combat'
                  : e.hex
                    ? 'Centrer la carte sur cette cible (zoom inchangé)'
                    : undefined}
                onclick={() => clic(e)}
                onkeydown={(ev) => {
                  if ((e.combatHex || e.hex) && (ev.key === 'Enter' || ev.key === ' ')) clic(e);
                }}
              >{e.texte}</span>
            </li>
          {/each}
        </ol>
      </details>
    {/each}
  {/if}
</section>

<style>
  /* UI-JEU-T2 · D3/D8 — habillage AAA (tokens or-sur-sombre, serif). */
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
  .filtres { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.5rem; }
  .chip-filtre {
    font-size: 0.74rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    border: 1px solid rgba(201, 162, 39, 0.3);
    background: transparent;
    color: var(--texte-doux, #b6ad93);
    cursor: pointer;
    line-height: 1.4;
  }
  .chip-filtre.active {
    color: var(--or-clair, #e8c96a);
    border-color: var(--or, #c9a227);
    background: rgba(201, 162, 39, 0.12);
  }
  .chip-filtre:hover { border-color: var(--or-clair, #e8c96a); }
  details.tour-section { margin: 0.25rem 0; }
  details.tour-section > summary {
    cursor: pointer;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--or, #c9a227);
    user-select: none;
  }
  details.tour-section > summary .compte { color: var(--texte-doux, #b6ad93); text-transform: none; letter-spacing: 0; }
  ol { margin: 0.2rem 0 0.3rem; padding-left: 1.1rem; max-height: 16rem; overflow: auto; display: flex; flex-direction: column; gap: 0.18rem; }
  li { font-size: 0.82rem; color: var(--texte, #e9e4d3); }
  li.good { color: #a5d6a7; }
  li.bad { color: #ef9a9a; }
  .cat { color: var(--or, #c9a227); margin-right: 0.25rem; }
  .entry.clickable { cursor: pointer; }
  .entry.clickable:hover { color: var(--or-clair, #e8c96a); text-decoration: underline; }
  .hint { color: var(--texte-doux, #b6ad93); font-size: 0.82rem; margin: 0; }
</style>
