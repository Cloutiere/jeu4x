<script lang="ts">
  /**
   * Atelier — labo permanent d'assets (chantier ATELIER, page `#/atelier`).
   *
   * Client-side PUR (comme #/lab3d, première branche du routeur : aucun appel
   * /api, aucune garde de session). Erik y isole, examine et nomme n'importe
   * quel asset par catégorie pour dicter des retouches (rituel : ATELIER-ASSETS.md).
   *
   *  - Catalogue : `lib/atelier/catalogue.ts` (généré des sources de vérité) ;
   *  - Isolement 3D : Stage3D + TerrainWorld/StructuresWorld sur UNE tuile,
   *    caméra orbitale maison (drag = tourner, molette = zoom), interrupteurs
   *    bloom / animation / fond sombre-clair / grille hex (tuiles voisines) ;
   *  - Sprites 2D : PNG sur damier + variantes d'accent joueur (teinte canvas) ;
   *  - Fiche : id exact copiable, catégorie, source de vérité, note de session
   *    persistée (localStorage `atelier:note:<id>`) ;
   *  - Avant/après : snapshot du rendu gardé en référence de session
   *    (localStorage `atelier:ref:<id>` — posé au premier isolement, mis à
   *    jour à la demande) + comparaison A/B côte à côte.
   *
   * Aucune retouche n'est éditable ici : la source de vérité reste visuel3d.json
   * / generate.py — l'atelier reflète, il ne définit pas.
   */
  import { onMount, untrack } from 'svelte';
  import * as THREE from 'three';
  import { CATALOGUE, CATEGORIES, NOM_CATEGORIE, filtrerCatalogue, stemsDe } from '../lib/atelier/catalogue.js';
  import type { AssetAtelier, CategorieAtelier } from '../lib/atelier/catalogue.js';
  import { Stage3D } from '../lib/render3d/stage3d.js';
  import { TerrainWorld } from '../lib/render3d/world3d.js';
  import type { TileDraw } from '../lib/render3d/world3d.js';
  import { StructuresWorld, planifierStructures } from '../lib/render3d/structures3d.js';
  import type { EntreeStructures, TuileStructures } from '../lib/render3d/structures3d.js';
  import { PLAYER_COLORS } from '../lib/render/textures.js';
  import { TERRAINS3D, STRUCTURES3D } from '../lib/render3d/spec3d.js';

  // --- Grille (catalogue + recherche) ----------------------------------------
  let categorieActive = $state<'toutes' | CategorieAtelier>('toutes');
  let recherche = $state('');
  let selection = $state<AssetAtelier | null>(null);
  const visibles = $derived(filtrerCatalogue(CATALOGUE, categorieActive, recherche));
  const compteParCategorie = $derived(
    Object.fromEntries(CATEGORIES.map((c) => [c, CATALOGUE.filter((a) => a.categorie === c).length])) as Record<CategorieAtelier, number>,
  );

  function choisir(asset: AssetAtelier): void {
    selection = asset;
  }

  // --- Copie de l'id exact ----------------------------------------------------
  let copie = $state(false);
  async function copierId(): Promise<void> {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.id);
    } catch {
      // Fallback (http local / permissions) : sélection manuelle.
      const ta = document.createElement('textarea');
      ta.value = selection.id;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    copie = true;
    setTimeout(() => (copie = false), 1500);
  }

  // --- Note de session (localStorage) ----------------------------------------
  let note = $state('');
  const cleNote = (id: string): string => `atelier:note:${id}`;
  function chargerNote(asset: AssetAtelier | null): void {
    note = asset && typeof localStorage !== 'undefined' ? (localStorage.getItem(cleNote(asset.id)) ?? '') : '';
  }
  function sauverNote(): void {
    if (!selection || typeof localStorage === 'undefined') return;
    localStorage.setItem(cleNote(selection.id), note);
  }

  // --- Avant/après (référence de session, localStorage) ----------------------
  let reference = $state<string | null>(null); // dataURL de la référence de l'asset sélectionné
  let comparer = $state(false);
  const cleRef = (id: string): string => `atelier:ref:${id}`;
  function chargerReference(asset: AssetAtelier | null): void {
    comparer = false;
    reference = asset && typeof localStorage !== 'undefined' ? localStorage.getItem(cleRef(asset.id)) : null;
  }
  function definirReference(dataUrl: string): void {
    if (!selection || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(cleRef(selection.id), dataUrl);
      reference = dataUrl;
    } catch {
      // Quota dépassé : la référence est un confort, jamais bloquant.
    }
  }

  // --- Réglages d'isolement ---------------------------------------------------
  let bloom = $state(true);
  let animation = $state(true);
  let fondSombre = $state(true);
  let grilleHex = $state(false);
  let pop = $state(8); // Mainframe : palier courant
  let capitale = $state(false); // Mainframe : variante capitale
  let fps = $state(0);

  // --- Moteurs de rendu 3D (non réactifs) -------------------------------------
  let host: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;
  let stage: Stage3D | null = null;
  let world: TerrainWorld | null = null;
  let structures: StructuresWorld | null = null;
  let destroyed = false;

  /** Orbite maison : azimut/hauteur/distance autour de la tuile (0,0). */
  const orbite = { theta: Math.PI * 0.25, phi: 1.0, dist: 2.2, cibleY: 0.2 };
  const DIRS: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  /** Tuile dessinée pour l'asset (centrée à l'origine) + ses voisines si grille. */
  function tilesPour(asset: AssetAtelier): TileDraw[] {
    const terrain = asset.sorte === 'terrain3d' ? asset.id : 'prairie';
    if (asset.id === 'structures:mainframe' || asset.id === 'structures:mainframePalier' || asset.id === 'structures:mainframeCapitale' || asset.id === 'structures:mainframeMerveille') {
      return [{ q: 0, r: 0, terrain: 'ville', fog: 'visible' }];
    }
    const tuiles: TileDraw[] = [{ q: 0, r: 0, terrain, fog: 'visible' }];
    if (grilleHex) {
      for (const [dq, dr] of DIRS) tuiles.push({ q: dq, r: dr, terrain, fog: 'visible' });
    }
    return tuiles;
  }

  /** Ressource portée par la tuile centrale (cartes / carte neutre). */
  function ressourcePour(asset: AssetAtelier): string | null {
    if (asset.sorte === 'carte3d') return asset.id.slice('carte:'.length);
    if (asset.id === 'structures:carteNeutre') return '__inconnue'; // hors registre → carte neutre (R-92)
    return null;
  }

  /** Entrées du planificateur de structures pour l'asset isolé. */
  function entreePour(asset: AssetAtelier): EntreeStructures {
    const tuileCentrale: TuileStructures = {
      q: 0, r: 0,
      terrain: asset.sorte === 'terrain3d' ? asset.id : 'prairie',
      fog: 'visible',
      ressource: ressourcePour(asset),
    };
    if (asset.sorte === 'terrain3d' && asset.id !== 'structures:cratere') {
      tuileCentrale.ressource = null; // terrain NU (les glyphes du potentiel suffisent)
    }
    const entree: EntreeStructures = {
      tuiles: [tuileCentrale],
      villes: [],
      huttes: [],
      villages: [],
      couleurDe: (owner) => PLAYER_COLORS[owner] ?? 0x8a5ad6,
    };
    if (asset.id.startsWith('structures:mainframe')) {
      entree.tuiles = [{ q: 0, r: 0, terrain: 'ville', fog: 'visible', ressource: null }];
      const avecModules = asset.id === 'structures:mainframe' || asset.id === 'structures:mainframeCapitale';
      const avecMerveille = asset.id === 'structures:mainframeMerveille';
      entree.villes.push({
        id: 'atelier',
        q: 0, r: 0,
        pop,
        capital: asset.id === 'structures:mainframeCapitale' || capitale,
        owner: 'p1',
        buildings: avecModules ? ['bibliotheque', 'marche', 'caserne', 'temple'] : [],
        wonders: avecMerveille ? ['stonehenge'] : [],
        fog: 'visible',
      });
    } else if (asset.id === 'structures:hutte') {
      entree.huttes.push({ id: 'atelier-h', q: 0, r: 0, fog: 'visible', terrain: 'prairie' });
    } else if (asset.id === 'structures:village') {
      entree.villages.push({ id: 'atelier-v', q: 0, r: 0, fog: 'visible', terrain: 'prairie' });
    }
    return entree;
  }

  // --- Montage / reconstruction de la scène isolée ----------------------------
  function demonterScene(): void {
    world?.dispose(); world = null;
    structures?.dispose(); structures = null;
  }

  function reconstruireScene(asset: AssetAtelier): void {
    if (!stage) return;
    demonterScene();
    world = new TerrainWorld(stage.scene, { capacity: 16, bloom });
    structures = new StructuresWorld({ capacityTuiles: 16, capacityVilles: 2 });
    stage.scene.add(structures.group);
    world.update(tilesPour(asset));
    structures.update(planifierStructures(entreePour(asset)));
    // Recentre l'orbite sur un asset neuf.
    orbite.theta = Math.PI * 0.25;
    orbite.phi = 1.0;
    orbite.dist = 2.2;
  }

  $effect(() => {
    void bloom;
    stage?.setBloom(bloom);
  });
  $effect(() => {
    if (!stage) return;
    void fondSombre;
    stage.scene.background = new THREE.Color(fondSombre ? 0x070b18 : 0xcfd6de);
  });
  // Reconstruction à chaque changement d'asset OU de variante (pop/capitale/grille).
  $effect(() => {
    const asset = selection;
    if (!asset) return;
    void pop; void capitale; void grilleHex;
    if (!asset.sorte.startsWith('terrain') && asset.sorte !== 'carte3d' && asset.sorte !== 'structure3d') return;
    untrack(() => {
      installerStage();
      reconstruireScene(asset);
      // Première visite de l'asset : le rendu courant devient la référence « avant ».
      captureEnAttente = 'siAbsente';
    });
  });
  // Changement de sélection : note + référence chargées.
  $effect(() => {
    const asset = selection;
    untrack(() => {
      chargerNote(asset);
      chargerReference(asset);
    });
  });

  // --- Boucle de rendu + orbite + capture -------------------------------------
  let rafId = 0;
  let dernierTemps = performance.now();
  let dernierComptage = performance.now();
  let frames = 0;
  let framesRendus = 0;
  /** Capture différée : 'siAbsente' (référence initiale) | 'forcer'. */
  let captureEnAttente: 'siAbsente' | 'forcer' | null = null;

  function appliquerOrbite(): void {
    if (!stage) return;
    const { theta, phi, dist, cibleY } = orbite;
    const cam = stage.cam.camera;
    cam.position.set(
      dist * Math.sin(phi) * Math.sin(theta),
      cibleY + dist * Math.cos(phi),
      dist * Math.sin(phi) * Math.cos(theta),
    );
    cam.lookAt(0, cibleY, 0);
    cam.updateMatrixWorld();
  }

  function capturer(): void {
    if (!selection || !canvasEl) return;
    if (captureEnAttente === 'siAbsente' && reference) return; // une référence existe déjà
    definirReference(canvasEl.toDataURL('image/jpeg', 0.85));
  }

  function boucle(): void {
    if (destroyed || !stage) return;
    rafId = requestAnimationFrame(boucle);
    const now = performance.now();
    const dt = Math.min(0.05, (now - dernierTemps) / 1000);
    dernierTemps = now;
    frames++;
    if (now - dernierComptage >= 1000) {
      fps = Math.round((frames * 1000) / (now - dernierComptage));
      frames = 0;
      dernierComptage = now;
    }
    appliquerOrbite();
    world?.tick(dt, animation);
    world?.breathe(now / 1000, animation);
    stage.render();
    framesRendus++;
    // Snapshot « avant » : une fois la scène stable (2 frames rendues).
    if (captureEnAttente && framesRendus > 2) {
      const mode = captureEnAttente;
      captureEnAttente = null;
      untrack(() => { if (mode === 'forcer' || (mode === 'siAbsente' && !reference)) capturer(); });
    }
  }

  // --- Entrées souris de l'orbite ----------------------------------------------
  let pointer: { x: number; y: number } | null = null;

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    pointer = { x: e.clientX, y: e.clientY };
    canvasEl.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent): void {
    if (!pointer) return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    pointer = { x: e.clientX, y: e.clientY };
    orbite.theta -= dx * 0.008;
    orbite.phi = Math.min(1.45, Math.max(0.12, orbite.phi - dy * 0.005));
  }
  function onPointerUp(): void {
    pointer = null;
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    orbite.dist = Math.min(14, Math.max(1.4, orbite.dist * (e.deltaY < 0 ? 0.88 : 1 / 0.88)));
  }

  // --- Sprites 2D : variantes d'accent joueur (teinte canvas) -----------------
  const ACCENTS: Array<{ nom: string; couleur: string; cle: string }> = [
    { nom: 'Joueur 1', couleur: '#d64545', cle: 'p1' },
    { nom: 'Joueur 2', couleur: '#3b6fd6', cle: 'p2' },
    { nom: 'Barbare', couleur: '#8a7a66', cle: 'barbarien' },
  ];
  let accentsTintees = $state<Array<{ nom: string; url: string }>>([]);
  let baseCharge = $state('');

  // PNG absents (art du moteur jamais générée — ex. unités uniques, vaisseau) :
  // détectés dynamiquement (onerror) — quand generate.py produira le PNG,
  // l'atelier l'affichera sans changement de code.
  let pngAbsents = $state(new Set<string>());
  function marquerAbsent(stem: string): void {
    if (!stem || pngAbsents.has(stem)) return;
    const suivant = new Set(pngAbsents);
    suivant.add(stem);
    pngAbsents = suivant;
  }
  function urlSprite(stem: string): string {
    return `/art/${stem}.png`;
  }

  function teindre(img: HTMLImageElement, couleur: string): string {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = couleur;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  }

  $effect(() => {
    const asset = selection;
    if (!asset || asset.sorte !== 'sprite' || !asset.sprite) {
      accentsTintees = [];
      baseCharge = '';
      return;
    }
    const { base, accent } = stemsDe(asset);
    baseCharge = `/art/${base}.png`;
    if (!accent) { accentsTintees = []; return; }
    untrack(() => {
      const img = new Image();
      img.onload = () => {
        accentsTintees = ACCENTS.map((a) => ({ nom: a.nom, url: teindre(img, a.couleur) }));
      };
      img.src = `/art/${accent}.png`;
    });
  });

  // --- Miniature de grille ------------------------------------------------------
  function apercu(asset: AssetAtelier): { type: 'img' | 'pastille'; url?: string; couleur?: string; absent?: boolean } {
    if (asset.sorte === 'sprite' && asset.sprite) {
      const stem = stemsDe(asset).base;
      return { type: 'img', url: urlSprite(stem), absent: pngAbsents.has(stem) };
    }
    if (asset.sorte === 'carte3d') {
      const spec = asset.id.slice('carte:'.length);
      const couleur = (STRUCTURES_CARTES as Record<string, { couleur: string }>)[spec]?.couleur ?? '#4A5058';
      return { type: 'pastille', couleur };
    }
    if (asset.categorie === 'terrains3d') {
      const couleur = (TERRAINS_APERCU as Record<string, string>)[asset.id] ?? '#22303f';
      return { type: 'pastille', couleur };
    }
    return { type: 'pastille', couleur: '#1b2836' };
  }
  // Aperçus pastille depuis la spec (déjà validée par spec3d — conversion hex).
  const cssHex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
  const TERRAINS_APERCU: Record<string, string> = Object.fromEntries(
    Object.entries(TERRAINS3D).map(([id, t]) => [id, cssHex(t.haut)]),
  );
  const STRUCTURES_CARTES = Object.fromEntries(
    Object.entries(STRUCTURES3D.cartes).map(([id, c]) => [id, { couleur: cssHex(c.couleur) }]),
  );

  // --- Montage ------------------------------------------------------------------
  // Le canvas 3D n'existe qu'APRÈS la première sélection (vue conditionnelle) :
  // le Stage3D est donc installé paresseusement par l'effet de reconstruction,
  // pas au onMount (le canvas d'alors serait indéfini — vue noire).
  let ro: ResizeObserver | null = null;
  let stageCanvas: HTMLCanvasElement | null = null;

  function installerStage(): boolean {
    if (!canvasEl || !host) return false;
    if (stage && stageCanvas === canvasEl) return true;
    // La vue conditionnelle recrée le canvas à chaque retour en 3D : le stage
    // attaché à l'ancien élément est invalidé.
    if (stage) { stage.dispose(); stage = null; }
    stageCanvas = canvasEl;
    stage = new Stage3D(canvasEl);
    // Orbite : render() appelle cam.apply() (tilt fixe sud) — on remplace apply
    // SUR L'INSTANCE par la pose sphérique de l'atelier, sinon l'orbite est
    // écrasée à chaque frame.
    stage.cam.apply = () => appliquerOrbite();
    stage.resize(host.clientWidth || 800, host.clientHeight || 600);
    stage.cam.setViewport(host.clientWidth || 800, host.clientHeight || 600);
    ro?.disconnect();
    ro = new ResizeObserver(() => {
      if (!stage || !host || destroyed) return;
      stage.resize(host.clientWidth || 800, host.clientHeight || 600);
    });
    ro.observe(host);
    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('pointercancel', onPointerUp);
    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    dernierTemps = performance.now();
    dernierComptage = dernierTemps;
    cancelAnimationFrame(rafId); // jamais deux boucles (réinstallation)
    boucle();
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__atelier = {
        tailleCatalogue: () => CATALOGUE.length,
        selection: () => selection?.id ?? null,
        fps: () => fps,
      };
    }
    return true;
  }

  onMount(() => {
    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      demonterScene();
      ro?.disconnect();
      stage?.dispose();
      stage = null;
      canvasEl?.removeEventListener('pointerdown', onPointerDown);
      canvasEl?.removeEventListener('pointermove', onPointerMove);
      canvasEl?.removeEventListener('pointerup', onPointerUp);
      canvasEl?.removeEventListener('pointercancel', onPointerUp);
      canvasEl?.removeEventListener('wheel', onWheel);
    };
  });
</script>

<div class="atelier">
  <!-- Colonne gauche : catégories + recherche + grille -->
  <aside class="catalogue">
    <h1>Atelier d'assets</h1>
    <input
      class="recherche"
      type="search"
      placeholder="Rechercher (id exact ou nom FR)…"
      bind:value={recherche}
      data-atelier="recherche"
    />
    <nav class="cats" data-atelier="categories">
      <button class:actif={categorieActive === 'toutes'} onclick={() => (categorieActive = 'toutes')}>
        Toutes <span class="compte">{CATALOGUE.length}</span>
      </button>
      {#each CATEGORIES as cat (cat)}
        <button class:actif={categorieActive === cat} onclick={() => (categorieActive = cat)}>
          {NOM_CATEGORIE[cat]} <span class="compte">{compteParCategorie[cat]}</span>
        </button>
      {/each}
    </nav>
    <div class="grille" data-atelier="grille">
      {#each visibles as asset (asset.id)}
        <button class="carte" class:select={selection?.id === asset.id} onclick={() => choisir(asset)} title={asset.id}>
          <span class="apercu">
            {#if apercu(asset).type === 'img' && !apercu(asset).absent}
              <img src={apercu(asset).url} alt={asset.nom} loading="lazy" onerror={() => marquerAbsent(stemsDe(asset).base)} />
            {:else if apercu(asset).absent}
              <span class="absent" title="PNG absent — art à générer dans generate.py">PNG absent</span>
            {:else}
              <span class="pastille" style="background: {apercu(asset).couleur}"></span>
            {/if}
          </span>
          <span class="nom">{asset.nom}</span>
          <span class="id">{asset.id}</span>
        </button>
      {:else}
        <p class="vide">Aucun asset ne correspond.</p>
      {/each}
    </div>
  </aside>

  <!-- Zone principale : isolement + fiche -->
  <main class="isolement">
    {#if !selection}
      <div class="accueil">
        <h2>Sélectionne un asset dans le catalogue</h2>
        <p>Client-side pur — aucune session ni API. Le rituel complet est décrit dans ATELIER-ASSETS.md.</p>
      </div>
    {:else}
      <header class="entete">
        <div>
          <h2>{selection.nom}</h2>
          <p class="catsrc">{NOM_CATEGORIE[selection.categorie]}</p>
        </div>
        <div class="actions">
          <button onclick={() => void copierId()} data-atelier="copier">{copie ? 'Copié !' : `Copier l'id : ${selection.id}`}</button>
          {#if reference}
            <button class:actif={comparer} onclick={() => (comparer = !comparer)}>Comparer A/B</button>
          {/if}
        </div>
      </header>

      <div class="scenegroupe">
        {#if selection.sorte === 'terrain3d' || selection.sorte === 'structure3d' || selection.sorte === 'carte3d'}
          <div class="host3d" bind:this={host}>
            <canvas bind:this={canvasEl}></canvas>
            {#if comparer && reference}
              <img class="avant" src={reference} alt="Avant (référence de session)" />
              <span class="etiquette gauche">AVANT (référence de session)</span>
              <span class="etiquette droite">APRÈS (rendu courant)</span>
            {/if}
            <span class="fpschip">{fps} FPS</span>
          </div>
          <div class="controles">
            <div class="rangee">
              <button class:actif={bloom} onclick={() => (bloom = !bloom)}>Bloom</button>
              <button class:actif={animation} onclick={() => (animation = !animation)}>Animation</button>
              <button class:actif={!fondSombre} onclick={() => (fondSombre = !fondSombre)}>Fond clair</button>
              <button class:actif={grilleHex} onclick={() => (grilleHex = !grilleHex)}>Grille hex</button>
            </div>
            <div class="rangee">
              <label class="inline">pop <input type="number" min="1" max="30" bind:value={pop} /></label>
              <button class:actif={capitale} onclick={() => (capitale = !capitale)}>Capitale</button>
            </div>
            <p class="astuce">Glisser = orbiter · molette = zoomer.</p>
            <button class="plein" onclick={() => { captureEnAttente = 'forcer'; }}>Refaire la référence (aprè​s)</button>
            {#if reference}
              <p class="astuce">« Comparer A/B » affiche la référence de session à côté du rendu courant.</p>
            {/if}
          </div>
        {:else if selection.sorte === 'sprite'}
          <div class="sprites" data-atelier="sprites">
            {#if pngAbsents.has(stemsDe(selection).base)}
              <div class="accueil">
                <h2>PNG absent</h2>
                <p>{stemsDe(selection).base}.png n'existe pas encore — art à générer dans
                  <span class="mono">assets-src/tools/generate.py</span> (puis <span class="mono">sync-art</span>).</p>
              </div>
            {:else}
            <figure>
              <div class="damier grand">
                <img src={baseCharge} alt={selection.nom} onerror={() => marquerAbsent(stemsDe(selection!).base)} />
              </div>
              <figcaption>Base — {selection.id}.png</figcaption>
            </figure>
            {#if accentsTintees.length > 0}
              {#each accentsTintees as variante (variante.nom)}
                <figure>
                  <div class="damier grand">
                    <img src={variante.url} alt="{selection.nom} — accent {variante.nom}" />
                  </div>
                  <figcaption>accent {variante.nom}</figcaption>
                </figure>
              {/each}
            {/if}
            <button class="plein" onclick={() => { if (selection) definirReference(baseCharge); comparer = true; }}>Utiliser la base comme référence A/B</button>
            {/if}
          </div>
        {:else}
          <div class="accueil">
            <h2>Effet programmatique</h2>
            <p>Cet overlay est dessiné par le code de rendu (aucun fichier d'asset).
              Sa source de vérité est indiquée dans la fiche ci-contre.</p>
          </div>
        {/if}
      </div>

      <aside class="fiche" data-atelier="fiche">
        <dl>
          <dt>Id exact</dt>
          <dd class="mono">{selection.id}</dd>
          <dt>Catégorie</dt>
          <dd>{NOM_CATEGORIE[selection.categorie]}</dd>
          <dt>Source de vérité</dt>
          <dd class="mono petit">{selection.source}</dd>
        </dl>
        <label class="etiquettenote" for="note">Note de session (persistée en local)</label>
        <textarea
          id="note"
          rows="6"
          placeholder="Ex. : carte Épices — plus grande, doré plus chaud…"
          bind:value={note}
          oninput={sauverNote}
        ></textarea>
      </aside>
    {/if}
  </main>
</div>

<style>
  .atelier {
    position: fixed;
    inset: 0;
    display: flex;
    background: #070b18;
    color: #dfe6ee;
    font: 13px/1.5 system-ui, sans-serif;
  }

  /* --- Catalogue (gauche) --- */
  .catalogue {
    width: 21rem;
    min-width: 21rem;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #1c2740;
    background: rgba(10, 14, 24, 0.96);
    padding: 0.7rem;
    gap: 0.5rem;
  }
  h1 { font-size: 15px; margin: 0; color: #3dffce; }
  .recherche {
    background: #0d1526; color: #dfe6ee; border: 1px solid #274066;
    border-radius: 4px; padding: 0.3rem 0.5rem; font: inherit;
  }
  .cats { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .cats button {
    background: #14203a; color: #dfe6ee; border: 1px solid #274066;
    border-radius: 4px; padding: 0.2rem 0.5rem; cursor: pointer; font: inherit; font-size: 12px;
  }
  .cats button.actif { background: #123d33; border-color: #3dffce; color: #3dffce; }
  .compte { opacity: 0.6; font-variant-numeric: tabular-nums; }
  .grille {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.45rem;
    align-content: start;
  }
  .carte {
    display: flex; flex-direction: column; gap: 0.15rem;
    background: #101a2e; border: 1px solid #274066; border-radius: 6px;
    padding: 0.4rem; cursor: pointer; text-align: left; color: inherit; font: inherit;
  }
  .carte.select { border-color: #3dffce; background: #0f2c25; }
  .carte:hover { border-color: #3dffce; }
  .apercu { height: 3.2rem; display: flex; align-items: center; justify-content: center; }
  .apercu img { max-height: 100%; max-width: 100%; image-rendering: auto; }
  .pastille { width: 2.4rem; height: 2.4rem; border-radius: 6px; border: 1px solid #0a1420; display: inline-block; }
  .absent { font-size: 9.5px; color: #c98a8a; border: 1px dashed #6b3d3d; border-radius: 4px; padding: 0.15rem 0.3rem; text-align: center; }
  .nom { font-size: 11.5px; line-height: 1.25; }
  .id { font-size: 10px; color: #8296ab; font-family: ui-monospace, monospace; word-break: break-all; }
  .vide { color: #8296ab; grid-column: 1 / -1; }

  /* --- Isolement (centre) --- */
  .isolement { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .entete {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.6rem 0.9rem; border-bottom: 1px solid #1c2740; gap: 0.6rem;
  }
  .entete h2 { margin: 0; font-size: 15px; }
  .catsrc { margin: 0; color: #8296ab; font-size: 11.5px; }
  .actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
  .actions button, .controles button, .sprites button {
    background: #14203a; color: #dfe6ee; border: 1px solid #274066;
    border-radius: 4px; padding: 0.25rem 0.55rem; cursor: pointer; font: inherit; font-size: 12px;
  }
  .actions button:hover, .controles button:hover, .sprites button:hover { border-color: #3dffce; }
  .actions button.actif, .controles button.actif { background: #123d33; border-color: #3dffce; color: #3dffce; }
  .plein { width: 100%; }
  button:disabled { opacity: 0.55; cursor: default; }

  .scenegroupe { flex: 1; display: flex; min-height: 0; padding: 0.7rem; gap: 0.7rem; }
  .host3d {
    position: relative; flex: 1; min-width: 0; overflow: hidden;
    border: 1px solid #1c2740; border-radius: 6px; background: #070b18;
  }
  .host3d canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
  .avant {
    position: absolute; inset: 0; width: 50%; height: 100%;
    object-fit: cover; border-right: 1px dashed #3dffce; z-index: 2;
  }
  .etiquette {
    position: absolute; top: 0.4rem; z-index: 3;
    background: rgba(7, 11, 24, 0.8); color: #3dffce;
    font-size: 10.5px; padding: 0.1rem 0.4rem; border-radius: 3px;
  }
  .etiquette.gauche { left: 0.4rem; }
  .etiquette.droite { right: 0.4rem; }
  .fpschip {
    position: absolute; bottom: 0.4rem; right: 0.5rem; z-index: 3;
    background: rgba(7, 11, 24, 0.8); color: #9fb3c8;
    font-size: 10.5px; padding: 0.1rem 0.4rem; border-radius: 3px;
    font-variant-numeric: tabular-nums;
  }
  .controles { width: 12.5rem; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .rangee { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .inline { display: flex; align-items: center; gap: 0.35rem; font-size: 12px; }
  input[type='number'] { width: 4.2rem; background: #0d1526; color: #dfe6ee; border: 1px solid #274066; border-radius: 4px; padding: 0.2rem 0.35rem; font: inherit; }
  .astuce { color: #8296ab; font-size: 11px; margin: 0.1rem 0; }

  /* --- Sprites --- */
  .sprites { flex: 1; display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; overflow-y: auto; }
  .sprites figure { margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .sprites figcaption { color: #8296ab; font-size: 11px; font-family: ui-monospace, monospace; }
  .damier {
    background:
      repeating-conic-gradient(#1a2334 0% 25%, #101a2e 0% 50%) 0 0 / 1.4rem 1.4rem;
    border: 1px solid #274066; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
  }
  .damier.grand { width: 15rem; height: 15rem; }
  .damier img { max-width: 92%; max-height: 92%; }

  /* --- Fiche (droite) --- */
  .fiche {
    width: 17rem; flex-shrink: 0; border-left: 1px solid #1c2740;
    padding: 0.7rem; overflow-y: auto; background: rgba(10, 14, 24, 0.96);
  }
  .fiche dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.5rem; margin: 0 0 0.8rem; font-size: 12px; }
  .fiche dt { color: #9fb3c8; }
  .fiche dd { margin: 0; }
  .mono { font-family: ui-monospace, monospace; word-break: break-all; }
  .petit { font-size: 11px; color: #8296ab; }
  .etiquettenote { display: block; font-weight: 600; color: #9fb3c8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3rem; }
  .fiche textarea {
    width: 100%; resize: vertical; background: #0d1526; color: #ffe082;
    border: 1px solid #274066; border-radius: 4px; padding: 0.4rem; font: inherit; font-size: 12.5px;
  }

  .accueil { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8296ab; gap: 0.3rem; }
  .accueil h2 { color: #dfe6ee; margin: 0; font-size: 16px; }
</style>
