<script lang="ts">
  /**
   * UI-JEU-T3 — minimap + panneau filtres/décorations (façon Civ VI, D5 :
   * bloc bas-gauche, panneau au-dessus, chevron de repli mémorisé).
   *
   * Perf (D1) : la grille est repeinte sur INVALIDATION seulement (nouvel
   * état filtré, filtres) ; le rectangle de caméra vit dans un canvas
   * superposé, redessiné uniquement quand la pose caméra change (léger —
   * un rect). Le clic/drag recentre la caméra au point monde, zoom préservé
   * (D3). Aucune information au-delà de l'état filtré (fog = fond sombre).
   */
  import { onDestroy } from 'svelte';
  import type { GameState } from '@game/rules';
  import { hexToPixel } from '@game/rules';
  import { HEX_SIZE } from './hexView.js';
  import { rendreMinimap, rectsCameraMinimap, caseSousMinimap, poseMinimap, pxCellule } from './minimap.js';
  import {
    filtresCarte,
    cycleRendements,
    basculerRessources,
    basculerRepli,
  } from '../filtresCarte.js';

  interface ApiMinimap {
    centrerSurMonde(x: number, y: number): void;
    poseCamera(): { x: number; y: number; scale: number };
    dimsVue(): { w: number; h: number };
    bornesMonde(): { x: number; y: number; w: number; h: number };
  }

  interface Props {
    etat: GameState;
    myId: string | null;
    api: ApiMinimap | null;
  }
  let { etat, myId, api }: Props = $props();

  // D5 : tailles data-driven (🔶 à l'œil) — largeur CSS d'affichage et px/case.
  const LARGEUR_CSS = 224;
  const PX_CELLULE = 4;

  let grille: HTMLCanvasElement = $state(null!);
  let rect: HTMLCanvasElement = $state(null!);
  let rafId = 0;
  let dernierRect = '';

  const img = $derived(rendreMinimap(etat, myId, { montrerRessources: $filtresCarte.ressources }));
  // Repère UNIQUE monde↔minimap (peinture, clic et rect de caméra) — le
  // décalage pointy-top est porté par la géométrie monde, pas par un décalage
  // de peinture (correctif retour Erik 01/10 : avant, la grille peinte
  // compressait les colonnes tandis que le clic suivait la géométrie monde —
  // décalage croissant avec la rangée).
  const pose = $derived(poseMinimap(etat.mapWidth, etat.mapHeight, PX_CELLULE));

  function peindreGrille(): void {
    if (!grille || !rect) return; // replié : canvases démontés
    const ctx = grille.getContext('2d');
    if (!ctx) return;
    grille.width = pose.mw;
    grille.height = pose.mh;
    rect.width = grille.width;
    rect.height = grille.height;
    dernierRect = ''; // le rect peut changer de repère (réduction fenêtre)
    ctx.fillStyle = '#14120e'; // FOND_FOG (brouillard — D2)
    ctx.fillRect(0, 0, grille.width, grille.height);
    for (let row = 0; row < img.h; row++) {
      for (let col = 0; col < img.w; col++) {
        const c = img.cellules[row * img.w + col];
        if (!c) continue;
        const p = pxCellule(pose, col, row);
        ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
        ctx.fillRect(p.x - PX_CELLULE / 2, p.y - PX_CELLULE / 2, PX_CELLULE, PX_CELLULE);
      }
    }
  }

  function peindreRect(): void {
    const ctx = rect.getContext('2d');
    if (!ctx || !api) return;
    const { w: vw, h: vh } = api.dimsVue();
    // CARTE-RONDE T2 (D4) : viewport à cheval sur la couture = DEUX rects
    // (fin du monde + raccord) ; sinon un seul, inchangé.
    const rects = rectsCameraMinimap(api.poseCamera(), vw, vh, pose, etat.mapWidth);
    const cle = rects.map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`).join('|');
    if (cle === dernierRect) return; // D1 : rien à faire si la caméra n'a pas bougé
    dernierRect = cle;
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#e8c96a';
    ctx.lineWidth = 2;
    for (const r of rects) {
      ctx.strokeRect(r.x + 1, r.y + 1, Math.max(3, r.w - 2), Math.max(3, r.h - 2));
    }
  }

  function boucleRect(): void {
    peindreRect();
    rafId = requestAnimationFrame(boucleRect);
  }

  $effect(() => {
    void img;
    void $filtresCarte.replie; // repli → démontage/remontage des canvases
    peindreGrille();
  });

  $effect(() => {
    if (!api) return;
    rafId = requestAnimationFrame(boucleRect);
    return () => cancelAnimationFrame(rafId);
  });
  onDestroy(() => cancelAnimationFrame(rafId));

  /** Clic/drag (D3) : recentre la caméra au point monde — zoom inchangé.
   *  CARTE-RONDE T2 (D4) : la colonne est normalisée (couture cliquable) et
   *  le centre vise la case canonique. */
  function aller(px: number, py: number): void {
    if (!api) return;
    const hex = caseSousMinimap(px, py, pose, HEX_SIZE, etat.mapWidth);
    const pMonde = hexToPixel(hex, HEX_SIZE);
    api.centrerSurMonde(pMonde.x, pMonde.y);
  }
  function pointerVersLocal(e: PointerEvent): { x: number; y: number } {
    const b = rect.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * rect.width, y: ((e.clientY - b.top) / b.height) * rect.height };
  }
  let dragging = false;
  function onDown(e: PointerEvent): void {
    dragging = true;
    rect.setPointerCapture(e.pointerId);
    const p = pointerVersLocal(e);
    aller(p.x, p.y);
  }
  function onMove(e: PointerEvent): void {
    if (!dragging) return;
    const p = pointerVersLocal(e);
    aller(p.x, p.y);
  }
  function onUp(): void {
    dragging = false;
  }

  // D4 : structure data-driven — de futurs filtres s'ajoutent ici.
  const etatRendements = $derived(['Masqués', 'Affichés', 'Sans villes/armées'][$filtresCarte.rendements] ?? '');
</script>

<div class="minimap-site" role="complementary" aria-label="Minimap et filtres de la carte">
  {#if !$filtresCarte.replie}
    <!-- D4 : panneau filtres/décorations au-dessus de la minimap -->
    <div class="minimap-panneau">
      <button
        type="button"
        class="chevron"
        title="Replier la minimap"
        aria-label="Replier la minimap"
        onclick={basculerRepli}
      >▾</button>
      <button
        type="button"
        class="filtre"
        class:actif={$filtresCarte.rendements > 0}
        title="Rendements N/P/C sur les cases — 3e état : masquer villes et armées pour les lire"
        onclick={cycleRendements}
      >Rendements <span class="etat">{etatRendements}</span></button>
      <button
        type="button"
        class="filtre"
        class:actif={$filtresCarte.ressources}
        title="Art des ressources révélées sur les tuiles (affichage seul)"
        onclick={basculerRessources}
      >Ressources <span class="etat">{$filtresCarte.ressources ? 'Affichées' : 'Masquées'}</span></button>
    </div>
  {/if}
  {#if !$filtresCarte.replie}
    <div class="minimap-cadre">
      <canvas bind:this={grille} class="minimap-grille" style:width="{LARGEUR_CSS}px"></canvas>
      <canvas
        bind:this={rect}
        class="minimap-rect"
        title="Vue courante — clic/glisser : déplacer la caméra (zoom préservé)"
        onpointerdown={onDown}
        onpointermove={onMove}
        onpointerup={onUp}
        onpointercancel={onUp}
      ></canvas>
    </div>
  {:else}
    <button
      type="button"
      class="minimap-repliee"
      title="Déplier la minimap"
      aria-label="Déplier la minimap"
      onclick={basculerRepli}
    >▸ Carte</button>
  {/if}
</div>

<style>
  .minimap-site {
    position: absolute;
    bottom: 1.1rem;
    left: 1.2rem;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: flex-start;
  }
  .minimap-panneau,
  .minimap-cadre {
    background: linear-gradient(180deg, #241f16 0%, #1b1712 100%);
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    border-radius: 10px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  }
  .minimap-panneau {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.45rem;
  }
  .chevron {
    background: none;
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    border-radius: 6px;
    color: var(--or-clair, #e8c96a);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.15rem 0.4rem;
  }
  .chevron:hover,
  .filtre:hover {
    box-shadow: 0 0 8px rgba(232, 201, 106, 0.25);
  }
  .filtre {
    background: none;
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    border-radius: 999px;
    color: var(--texte, #e9e4d3);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.78rem;
    opacity: 0.85;
    padding: 0.18rem 0.6rem;
  }
  .filtre.actif {
    border-color: var(--or-clair, #e8c96a);
    color: var(--or-clair, #e8c96a);
    opacity: 1;
  }
  .filtre .etat {
    color: var(--or-sombre, #8a6d1a);
    font-size: 0.7rem;
    margin-left: 0.25rem;
  }
  .filtre.actif .etat {
    color: var(--or-clair, #e8c96a);
  }
  .minimap-cadre {
    line-height: 0;
    overflow: hidden;
    position: relative;
  }
  .minimap-grille {
    display: block;
    image-rendering: pixelated;
  }
  .minimap-rect {
    cursor: crosshair;
    height: 100%;
    left: 0;
    position: absolute;
    top: 0;
    width: 100%;
  }
  .minimap-repliee {
    background: linear-gradient(180deg, #241f16 0%, #1b1712 100%);
    border: 1px solid var(--panneau-bord-doux, rgba(201, 162, 39, 0.25));
    border-radius: 8px;
    color: var(--or-clair, #e8c96a);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.25rem 0.6rem;
  }
  /* D5 : fenêtre étroite — la minimap se réduit. */
  @media (max-width: 1500px) {
    .minimap-site {
      bottom: 0.7rem;
      left: 0.7rem;
    }
    .minimap-grille {
      width: 168px;
    }
  }
</style>
