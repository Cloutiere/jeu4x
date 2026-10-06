<script lang="ts">
  /**
   * REGIMES-MODALE (handoff 05/10, D1-D5) — « Nouveaux régimes » à la
   * complétion d'une tech de gouvernement (R-122). Liste les 6 régimes :
   * actif marqué, débloqués CETTE TOUR surlignés or + badge « Sans anarchie »,
   * disponibles payants avec coût affiché, verrouillés inertes. Clic = ordre
   * SetGovernment existant (D2) : gratuit → direct, payant → confirmation
   * explicite, anarchie en cours → refus affiché (R-122, moteur tranche).
   * Rejetable (Échap / croix / clic extérieur) — ne bloque jamais le tour.
   */
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId } from '../lib/render/interaction.js';
  import { fenetreRegimeActive, lignesRegimes, refusAnarchie, type LigneRegime } from '../lib/regimesModale.js';

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
    return Object.values(view.state.cities).some(
      (c) => c.owner === id && c.wonders.includes('grande_pyramide'),
    );
  });
  const lignes = $derived(lignesRegimes(me, { hasPyramid, turn: view.turn }));
  const refus = $derived(refusAnarchie(me, view.turn));
  const fenetre = $derived(fenetreRegimeActive(me));

  // D2 · confirmation explicite pour une transition PAYANTE (1 tour d'anarchie).
  let confirmation = $state<string | null>(null);
  function choisir(r: LigneRegime): void {
    if (refus || r.etat === 'actif' || r.etat === 'verrouille') return;
    if (r.etat === 'payant' && confirmation !== r.id) {
      confirmation = r.id;
      return;
    }
    client.setGovernment(r.id);
    onClose();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div
  class="regimes-overlay"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
  <section class="regimes-boite" aria-label="Nouveaux régimes">
    <header>
      <h2>🏛️ Nouveaux régimes</h2>
      <button type="button" class="fermer" aria-label="Fermer" onclick={onClose}>×</button>
    </header>
    <p class="intro">
      Une tech de gouvernement vient d'être complétée — vous pouvez adopter le régime
      correspondant <strong>sans anarchie, ce tour seulement</strong>. Une transition manuelle
      coûterait 1 tour d'anarchie (rendements à zéro).
    </p>
    {#if refus}
      <p class="refus">⚔️ {refus}</p>
    {/if}
    <div class="liste">
      {#each lignes as r (r.id)}
        <div
          class="regime"
          class:actif={r.etat === 'actif'}
          class:gratuit={r.etat === 'gratuit'}
          class:payant={r.etat === 'payant'}
          class:verrouille={r.etat === 'verrouille'}
        >
          <img class="icone" src={r.icone} alt="" />
          <div class="corps">
            <div class="tete">
              <strong>{r.nom}</strong>
              {#if r.etat === 'actif'}
                <span class="tag actif-tag">actif</span>
              {:else if r.etat === 'gratuit'}
                <span class="tag gratuit-tag">✨ Sans anarchie — ce tour seulement</span>
              {:else if r.etat === 'payant'}
                <span class="tag cout-tag">{r.coutAnarchie}</span>
              {:else}
                <span class="tag verrou-tag">🔒 tech requise</span>
              {/if}
            </div>
            <p class="effet">+ {r.effet}</p>
            {#if r.penalite}<p class="penalite">− {r.penalite}</p>{/if}
            {#if r.immunite}<p class="immunite">Immunité Anarchie — transition toujours sans coût (R-149).</p>{/if}
          </div>
          {#if r.etat === 'gratuit' || r.etat === 'payant'}
            <button type="button" class="adopter" disabled={!!refus} onclick={() => choisir(r)}>
              {confirmation === r.id ? 'Confirmer (1 tour d’anarchie)' : 'Adopter'}
            </button>
          {/if}
        </div>
      {/each}
    </div>
    <div class="btns">
      <button type="button" class="plus-tard" onclick={onClose}>Décider plus tard</button>
    </div>
  </section>
</div>

<style>
  .regimes-overlay {
    position: fixed; inset: 0; z-index: 30;
    display: flex; align-items: center; justify-content: center;
    background: #000000a8;
  }
  .regimes-boite {
    width: min(46rem, 94vw); max-height: 86vh; overflow-y: auto;
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.45));
    border-radius: 10px; padding: 0.9rem 1.1rem;
    background: linear-gradient(180deg, #1a1610 0%, #120f0a 100%);
    box-shadow: 0 6px 30px rgba(0, 0, 0, 0.7);
    color: #e3e8ec;
  }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.05rem; letter-spacing: 0.04em; color: #d4af37; }
  .fermer { background: none; border: none; color: #8b98a5; font-size: 1.1rem; cursor: pointer; }
  .intro { margin: 0.45rem 0 0.6rem; font-size: 0.86rem; color: #b8c0c8; }
  .refus { margin: 0.2rem 0 0.5rem; color: #ffab91; font-weight: 600; font-size: 0.88rem; background: #3a2420; border: 1px solid #6d4c41; border-radius: 6px; padding: 0.3rem 0.5rem; }
  .liste { display: flex; flex-direction: column; gap: 0.45rem; }
  .regime {
    display: flex; align-items: center; gap: 0.7rem;
    border: 1px solid #3a4148; border-radius: 8px; padding: 0.45rem 0.6rem;
    background: #171d23;
  }
  .regime.actif { border-color: #3c7a52; background: #20302a; }
  /* D1 · surlignage OR des régimes débloqués cette tour. */
  .regime.gratuit { border-color: #d4af37; background: #241e10; box-shadow: 0 0 10px rgba(212, 175, 55, 0.25); }
  .regime.payant { border-color: #46525c; }
  .regime.verrouille { opacity: 0.5; }
  .icone { width: 3rem; height: 3rem; object-fit: cover; border-radius: 6px; border: 1px solid #3a4148; }
  .corps { flex: 1 1 auto; min-width: 0; }
  .tete { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .tag { font-size: 0.76rem; }
  .actif-tag { color: #81c784; }
  .gratuit-tag { color: #ffe082; font-weight: 700; }
  .cout-tag { color: #ffab91; }
  .verrou-tag { color: #8b98a5; }
  .effet { margin: 0.12rem 0; font-size: 0.82rem; color: #a5d6a7; }
  .penalite { margin: 0.12rem 0; font-size: 0.8rem; color: #ef9a9a; }
  .immunite { margin: 0.12rem 0 0; font-size: 0.78rem; color: #ffe082; }
  button.adopter {
    padding: 0.35rem 0.8rem; cursor: pointer; border-radius: 6px; white-space: nowrap;
    border: 1px solid #46525c; background: #27313a; color: inherit;
  }
  .regime.gratuit button.adopter { background: #2e5e3f; border-color: #d4af37; font-weight: 700; }
  button.adopter:disabled { opacity: 0.5; cursor: not-allowed; }
  .btns { display: flex; justify-content: flex-end; margin-top: 0.6rem; }
  button.plus-tard { padding: 0.3rem 0.7rem; cursor: pointer; border-radius: 6px; border: 1px solid #46525c; background: none; color: #8b98a5; }
</style>
