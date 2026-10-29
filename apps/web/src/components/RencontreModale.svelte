<script lang="ts">
  /**
   * CHAT-SOCLE (Erik 29/10, D2) — popup de PREMIÈRE RENCONTRE : « Vous avez
   * rencontré {dirigeant} — {nation} ». Déclenchée par le message serveur
   * PlayerMet (une fois par paire par partie — fait de fog R-73) ; jamais au
   * chargement/reconnexion (les rencontres persistées reviennent par le
   * Welcome). Miroir RegimesModale (overlay, Échap, clic dehors).
   */
  import { fermerPopupRencontre } from '../lib/chat.js';

  let {
    nom,
    nation,
    couleur,
  }: {
    /** Nom du joueur rencontré (session). */
    nom: string;
    /** Nom de sa nation (civ) — « Sans civilisation » si neutre. */
    nation: string;
    /** Couleur d'accent de sa palette (pastille). */
    couleur: string;
  } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && fermerPopupRencontre()} />

<div
  class="rencontre-overlay"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) fermerPopupRencontre();
  }}
>
  <section class="rencontre-boite" role="dialog" aria-modal="true" aria-label="Rencontre">
    <button type="button" class="croix" aria-label="Fermer" onclick={fermerPopupRencontre}>×</button>
    <p class="surtitre">Première rencontre</p>
    <h2><span class="pastille" style="background: {couleur}"></span>{nom}</h2>
    <p class="nation">{nation}</p>
    <p class="texte">
      Vos éclaireurs ont aperçu ses étendards. La conversation est ouverte —
      retrouvez-la dans l'onglet <strong>💬 Messagerie</strong> de la colonne de droite.
    </p>
    <button type="button" class="bouton-or" onclick={fermerPopupRencontre}>Saluer</button>
  </section>
</div>

<style>
  .rencontre-overlay {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 14, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 90;
  }
  .rencontre-boite {
    position: relative;
    width: min(26rem, 90vw);
    border: 1px solid var(--panneau-bord, rgba(201, 162, 39, 0.55));
    border-radius: 12px;
    background: linear-gradient(180deg, #241f16 0%, #1b1712 100%);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(201, 162, 39, 0.12);
    padding: 1.2rem 1.4rem;
    text-align: center;
  }
  .croix {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    background: none;
    border: none;
    color: var(--texte-doux, #b6ad93);
    font-size: 1.2rem;
    cursor: pointer;
    line-height: 1;
  }
  .croix:hover { color: var(--or-clair, #e8c96a); }
  .surtitre {
    margin: 0 0 0.3rem;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--or, #c9a227);
  }
  h2 {
    margin: 0 0 0.15rem;
    font-family: var(--serif-or, Georgia, serif);
    font-size: 1.5rem;
    color: var(--texte, #e9e4d3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  .pastille {
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 50%;
    display: inline-block;
    border: 1px solid rgba(0, 0, 0, 0.45);
  }
  .nation {
    margin: 0 0 0.7rem;
    font-family: var(--serif-or, Georgia, serif);
    color: var(--or-clair, #e8c96a);
    letter-spacing: 0.08em;
  }
  .texte {
    margin: 0 0 1rem;
    font-size: 0.86rem;
    color: var(--texte-doux, #b6ad93);
    line-height: 1.45;
  }
  .texte strong { color: var(--or-clair, #e8c96a); }
</style>
