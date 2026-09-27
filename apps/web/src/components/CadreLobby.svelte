<script lang="ts">
  /**
   * LOBBY-PREMIUM — cadre commun du lobby et de la salle d'attente : fonds
   * d'Erik (panorama de merveilles haut, carte ancienne bas), en-tête
   * « Eternal Empires » (D1) et carte « Connecté / Déconnexion ». Les deux
   * pages ne déclarent QUE leur contenu (bandeaux + panneaux) — un seul
   * code pour le langage visuel or-sur-sombre (demande Erik 27/09).
   */
  import { logout, session } from '../lib/session.js';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }
  const { children }: Props = $props();
</script>

<main class="lobby">
  <div class="fond" aria-hidden="true">
    <div class="fond-haut"></div>
    <div class="fond-bas"></div>
  </div>

  <div class="page">
    <header>
      <div class="titre">
        <h1>Eternal Empires</h1>
        <p class="sous-titre">A Fast-Paced Async 4X</p>
        <p class="tagline">Explore <span>·</span> Expand <span>·</span> Endure</p>
      </div>
      <div class="compte panneau">
        <span class="compte-nom">Connecté : {$session ? $session.name : '—'}</span>
        <button type="button" class="or-texte" onclick={logout}>Déconnexion</button>
      </div>
    </header>

    {@render children()}
  </div>
</main>

<style>
  .lobby { position: relative; min-height: 100vh; color: var(--texte); font-family: system-ui, sans-serif; }
  .fond { position: fixed; inset: 0; z-index: -1; }
  .fond-haut, .fond-bas { position: absolute; left: 0; right: 0; background-size: cover; background-position: center; }
  .fond-haut { top: 0; height: 62%; background-image: url('/interface/up.jpg'); }
  .fond-bas { bottom: 0; height: 45%; background-image: url('/interface/down.jpg'); opacity: 0.85; }
  /* Fondu des deux fonds + voile sombre pour la lisibilité. */
  .fond::after {
    content: ''; position: absolute; inset: 0;
    background:
      linear-gradient(180deg, rgba(13, 20, 32, 0.35) 0%, rgba(13, 20, 32, 0.72) 45%, rgba(13, 20, 32, 0.85) 100%);
  }

  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .titre h1 {
    margin: 0; font-family: var(--serif-or); font-size: 2.6rem; letter-spacing: 0.06em;
    text-transform: uppercase;
    background: linear-gradient(180deg, #f3df9a 15%, var(--or) 55%, var(--or-sombre) 90%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
  }
  .sous-titre { margin: 0.1rem 0 0; font-family: var(--serif-or); font-size: 1.05rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--or-clair); }
  .tagline { margin: 0.3rem 0 0; font-size: 0.72rem; letter-spacing: 0.34em; text-transform: uppercase; color: var(--texte-doux); }
  .compte { display: flex; gap: 1rem; align-items: center; padding: 0.6rem 1rem; }
  .compte-nom { font-size: 0.9rem; }
  .or-texte {
    font: inherit; cursor: pointer; background: transparent; border: 1px solid var(--panneau-bord);
    color: var(--or-clair); border-radius: 6px; padding: 0.3rem 0.9rem;
    text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.8rem;
  }
  .or-texte:hover { border-color: var(--or-clair); box-shadow: 0 0 10px rgba(201, 162, 39, 0.35); }
</style>
