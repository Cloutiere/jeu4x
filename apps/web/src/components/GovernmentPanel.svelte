<script lang="ts">
  /**
   * Menu de gouvernement — Phase 7h (RULES.md §8.7, R-121/R-122).
   * Régimes disponibles (tech débloquée OU Grande Pyramide contrôlée — R-125),
   * modificateurs ET pénalités affichés (valeurs exactes du document d'Erik),
   * régime actif, bouton « Adopter » avec avertissement Anarchie 1 tour
   * (T-29) — sauf bascule sans Anarchie à la complétion de la tech (R-122,
   * invitation du conseiller). SetGovernment = action immédiate (comme
   * SetResearch/SetConversion) : modifiable en phase ordres, même verrouillé.
   */
  import { GOVERNMENTS, ANARCHY_TURNS, isInAnarchy } from '@game/rules';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId } from '../lib/render/interaction.js';

  interface Props {
    view: GameView;
    client: GameClient;
    onClose(): void;
  }
  let { view, client, onClose }: Props = $props();

  const me = $derived.by(() => {
    const id = myEngineId(view);
    return id && view.state ? view.state.players[id] ?? null : null;
  });
  const hasPyramid = $derived.by(() => {
    const id = myEngineId(view);
    if (!id || !view.state) return false;
    return Object.values(view.state.cities).some((c) => c.owner === id && c.wonders.includes('grande_pyramide'));
  });
  const inAnarchy = $derived(me ? isInAnarchy(me, view.turn) : false);

  const rows = $derived.by(() => {
    if (!me) return [];
    const unlocked = me.techsUnlocked ?? [];
    const fresh = me.techsUnlockedThisTurn ?? [];
    const current = me.government ?? 'despotisme';
    return Object.values(GOVERNMENTS).map((g) => {
      const techOk = !g.tech || unlocked.includes(g.tech);
      return {
        id: g.id,
        name: g.name,
        available: (techOk || hasPyramid) && current !== g.id,
        active: current === g.id,
        free: !!g.tech && fresh.includes(g.tech),
        effect: g.effectLabel,
        penalty: g.penaltyLabel,
      };
    });
  });
</script>

<section class="panel" aria-label="Gouvernement">
  <header>
    <h2>Gouvernement</h2>
    <button type="button" class="close" onclick={onClose}>✕</button>
  </header>

  {#if !me}
    <p class="hint">Chargement…</p>
  {:else}
    <p class="active-line">
      Régime actif : <strong>{GOVERNMENTS[me.government ?? 'despotisme']?.name ?? me.government}</strong>
    </p>
    {#if inAnarchy}
      <p class="anarchy">⚔️ ANARCHIE — marteaux, fioles, or et culture à zéro pendant ce tour (R-122).</p>
    {/if}
    <div class="list">
      {#each rows as r (r.id)}
        <div class="gov-item" class:active={r.active} class:unavailable={!r.available && !r.active}>
          <div class="head">
            <strong>{r.name}</strong>
            {#if r.active}
              <span class="tag">actif</span>
            {:else if r.available}
              <button
                type="button"
                class="primary"
                title={r.free
                  ? 'Adoption SANS Anarchie : la tech du régime vient d’être complétée (invitation du conseiller, R-122)'
                  : 'Transition manuelle : 1 tour d’Anarchie — rendements à zéro pendant la résolution suivante (R-122)'}
                onclick={() => client.setGovernment(r.id)}
              >
                Adopter
              </button>
            {:else}
              <span class="tag locked">🔒 tech requise</span>
            {/if}
          </div>
          <p class="effect">+ {r.effect}</p>
          {#if r.penalty}<p class="penalty">− {r.penalty}</p>{/if}
          {#if r.free && !r.active}
            <p class="free">✨ Bascule SANS Anarchie disponible (tech complétée ce tour) !</p>
          {/if}
          {#if hasPyramid && !r.active}
            <p class="hint">Accès via la Grande Pyramide (R-125).</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .panel { position: absolute; top: 3.2rem; left: 0.6rem; width: 30rem; max-height: 80vh; overflow-y: auto; z-index: 8; border: 1px solid #3a4148; border-radius: 8px; padding: 0.7rem 0.85rem; background: #1d242b; box-shadow: 0 4px 16px #000000a0; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0 0 0.3rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa7b2; }
  .close { background: none; border: none; color: #8b98a5; cursor: pointer; padding: 0.2rem; }
  .active-line { margin: 0.2rem 0 0.5rem; }
  .anarchy { margin: 0.2rem 0 0.5rem; color: #ffab91; font-weight: 600; font-size: 0.88rem; background: #3a2420; border: 1px solid #6d4c41; border-radius: 6px; padding: 0.3rem 0.5rem; }
  .list { display: flex; flex-direction: column; gap: 0.45rem; }
  .gov-item { border: 1px solid #3a4148; border-radius: 6px; padding: 0.45rem 0.6rem; }
  .gov-item.active { border-color: #3c7a52; background: #20302a; }
  .gov-item.unavailable { opacity: 0.55; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .tag { font-size: 0.78rem; color: #81c784; }
  .tag.locked { color: #8b98a5; }
  .effect { margin: 0.15rem 0; font-size: 0.84rem; color: #a5d6a7; }
  .penalty { margin: 0.15rem 0; font-size: 0.82rem; color: #ef9a9a; }
  .free { margin: 0.15rem 0 0; font-size: 0.84rem; color: #ffe082; font-weight: 600; }
  .hint { margin: 0.15rem 0 0; color: #8b98a5; font-size: 0.78rem; }
  button { padding: 0.3rem 0.7rem; cursor: pointer; border-radius: 6px; border: 1px solid #46525c; background: #27313a; color: inherit; }
  button.primary { background: #2e5e3f; border-color: #3c7a52; }
</style>
