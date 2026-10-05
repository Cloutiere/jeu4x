<script lang="ts">
  /**
   * TECHTREE (handoff HANDOFF-TECHTREE, décisions Erik 05/10) — arbre
   * technologique PLEIN ÉCRAN qui remplace ResearchPanel (D1/D7).
   *  - 4 bandes d'ère aux fonds d'Erik (recuits, D6), titres + sous-titres ;
   *  - 46 cartes : image d'Erik + nom FR + coût + tours restants estimés +
   *    débloqués EN NOMS SEULS (D4) ; états acquise / en cours / disponible
   *    (cliquable → SetResearch) / verrouillée (grisée + prérequis, D2) ;
   *  - flèches de dépendance dorées traversant les colonnes (D4) ;
   *  - timeline d'ère en bas, ère du JOUEUR en évidence (D1) ;
   *  - sortie Échap / croix (D7) — mêmes portes d'ouverture qu'avant.
   * Placement et ères d'affichage : lib/techtree.ts (D3/D5, zéro gameplay).
   */
  import { TECHS, availableTechs, ERA_ORDER, ERA_NAMES, eraOfPlayer, interiorCitizenFor, conversionGains } from '@game/rules';
  import type { GameClient, GameView } from '../lib/gameClient.js';
  import { myEngineId } from '../lib/render/interaction.js';
  import {
    BANDES_AFFICHAGE,
    premiereColonneDe,
    NB_COLONNES,
    PLACEMENT,
    imageTech,
    etatTech,
    etatsTechs,
    toursRestants,
    libellesDebloques,
    prerequisManquants,
    rangeeMax,
  } from '../lib/techtree.js';
  import type { EtatTech } from '../lib/techtree.js';

  interface Props {
    view: GameView;
    client: GameClient;
    onClose(): void;
  }

  let { view, client, onClose }: Props = $props();

  // Géométrie de la grille (px) — cartes 238×104 ; l'ESPACE entre colonnes
  // est ×3 le gap initial (retour d'Erik 05/10 : 24 → 72 px) : c'est la
  // gouttière où les flèches contournent les cartes.
  const COL_W = 310; // pas de colonne = carte 238 + gouttière 72
  const ROW_H = 120;
  const CARD_W = 238;
  const CARD_H = 104;
  const GOUTTIERE = COL_W - CARD_W; // 72 px — couloir de routage des flèches
  const PAD_X = 24;
  const BAND_TOP = 96; // place des titres d'ère dans la zone défilante

  const engineId = $derived(myEngineId(view));
  const player = $derived(view.state && engineId ? view.state.players[engineId] ?? null : null);
  const editable = $derived(view.status === 'active' && view.phase === 'orders');

  const etats = $derived(player ? etatsTechs(player) : {});
  const currentTech = $derived(player?.researching ? TECHS[player.researching] ?? null : null);
  const currentProgress = $derived(
    player && player.researching ? player.scienceProgress[player.researching] ?? 0 : 0,
  );

  /** 7l · Commerce de base des terrains (miroir de Game.svelte — estimation
   *  d'affichage uniquement). */
  const TERRAIN_COMMERCE: Record<string, number> = {
    prairie: 0,
    plaine: 0,
    foret: 0,
    colline: 0,
    montagne: 0,
    desert: 1,
    eau: 2,
    ocean: 2,
    ville: 0,
  };

  /** Estimation science/tour du joueur (miroir UI de Game.svelte : commerce
   *  des villes × conversion — mêmes bases que la colonne or). */
  const scienceParTour = $derived.by(() => {
    if (!view.state || !engineId) return 0;
    let total = 0;
    for (const c of Object.values(view.state.cities)) {
      if (c.owner !== engineId) continue;
      const tier = interiorCitizenFor(c.pop);
      const interior = Math.max(0, c.pop - c.workedTiles.length);
      let commerce = tier.commerce * (1 + interior);
      for (const key of c.workedTiles) {
        const y = view.state.map[key];
        if (!y) continue;
        commerce += TERRAIN_COMMERCE[y.terrain] ?? 0;
      }
      total += conversionGains(commerce, c.conversion, c.buildings).science;
    }
    return total;
  });

  const joueur = $derived(player ? { techsUnlocked: player.techsUnlocked, researching: player.researching } : null);
  const eraJoueur = $derived(player ? eraOfPlayer(player) : null);
  const indexEraJoueur = $derived(eraJoueur ? ERA_ORDER.indexOf(eraJoueur) : -1);

  const rows = rangeeMax() + 1;
  const gridW = $derived(PAD_X * 2 + COL_W * NB_COLONNES);
  const gridH = $derived(BAND_TOP + rows * ROW_H + 24);

  function x(col: number): number {
    return PAD_X + col * COL_W + (COL_W - CARD_W) / 2;
  }
  function y(row: number): number {
    return BAND_TOP + row * ROW_H;
  }

  interface Fleche {
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    gx: number; // couloir vertical de la gouttière après le prérequis
    gxFin: number; // couloir de la gouttière avant la colonne cible
    yCouloir: number; // couloir horizontal libre sous la rangée la plus profonde
    colonnes: number; // distance en colonnes (1 = adjacent)
    etat: EtatTech;
  }

  /** Flèches de dépendance — style Civ5 (retour d'Erik 05/10, 3 principes) :
   *  1. UN SEUL couloir vertical par gouttière (centré) — les lignes qui
   *     partagent la gouttière FUSIONNENT visuellement en un faisceau ;
   *  2. grandes COURBES EN S à tangentes horizontales (sortie/entrée
   *     douces), jamais d'angles droits ;
   *  3. départs et arrivées multiples convergent donc en une seule pointe
   *     de flèche par carte (les segments se superposent exactement).
   *  Les traversées de colonnes intermédiaires passent par le couloir
   *  horizontal libre sous la rangée la plus profonde. */
  const fleches = $derived.by<Fleche[]>(() => {
    const liste: Array<Omit<Fleche, 'gx' | 'gxFin'>> = [];
    for (const [id, t] of Object.entries(TECHS)) {
      const cible = PLACEMENT[id];
      if (!cible) continue;
      for (const p of t.prereqs) {
        const src = PLACEMENT[p];
        if (!src) continue;
        liste.push({
          key: `${p}->${id}`,
          x1: x(src.col) + CARD_W,
          y1: y(src.row) + CARD_H / 2,
          x2: x(cible.col),
          y2: y(cible.row) + CARD_H / 2,
          yCouloir:
            BAND_TOP + Math.max(src.row, cible.row) * ROW_H + CARD_H + (ROW_H - CARD_H) / 2,
          colonnes: cible.col - src.col,
          etat: etats[id] ?? 'verrouillee',
        });
      }
    }
    return liste
      .sort((a, b) => a.y1 - b.y1 || a.key.localeCompare(b.key))
      .map((f) => ({
        ...f,
        gx: f.x1 + GOUTTIERE / 2,
        gxFin: f.x2 - GOUTTIERE / 2,
      }));
  });

  /** Polyligne à coins ARRONDIS GÉNÉREUX : les segments restent DROITS (le
   *  vertical est donc partagé au pixel par toutes les flèches de la
   *  gouttière — elles fusionnent en un faisceau unique), seuls les coins
   *  sont adoucis. */
  function pathAvecCoudes(points: Array<{ x: number; y: number }>): string {
    const R = 18;
    const pts = points.filter(
      (p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y) > 0.5,
    );
    if (pts.length < 2) return '';
    if (pts.length === 2) {
      return `M ${pts[0]!.x} ${pts[0]!.y} L ${pts[1]!.x} ${pts[1]!.y}`;
    }
    let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const avant = pts[i - 1]!;
      const apres = pts[i + 1]!;
      const dAv = Math.hypot(p.x - avant.x, p.y - avant.y);
      const dAp = Math.hypot(apres.x - p.x, apres.y - p.y);
      const rr = Math.min(R, dAv / 2, dAp / 2);
      const ax = p.x - (Math.sign(p.x - avant.x) || 0) * rr;
      const ay = p.y - (Math.sign(p.y - avant.y) || 0) * rr;
      const bx = p.x + (Math.sign(apres.x - p.x) || 0) * rr;
      const by = p.y + (Math.sign(apres.y - p.y) || 0) * rr;
      d += ` L ${ax} ${ay} Q ${p.x} ${p.y}, ${bx} ${by}`;
    }
    const fin = pts[pts.length - 1]!;
    return `${d} L ${fin.x} ${fin.y}`;
  }

  function chemin(f: Fleche): string {
    if (f.colonnes === 1) {
      return pathAvecCoudes([
        { x: f.x1, y: f.y1 },
        { x: f.gx, y: f.y1 },
        { x: f.gx, y: f.y2 },
        { x: f.x2, y: f.y2 },
      ]);
    }
    // prérequis 2+ colonnes à gauche : traversée des colonnes intermédiaires
    // par le couloir horizontal libre SOUS la rangée la plus profonde.
    return pathAvecCoudes([
      { x: f.x1, y: f.y1 },
      { x: f.gx, y: f.y1 },
      { x: f.gx, y: f.yCouloir },
      { x: f.gxFin, y: f.yCouloir },
      { x: f.gxFin, y: f.y2 },
      { x: f.x2, y: f.y2 },
    ]);
  }

  function bandeStyle(bande: (typeof BANDES_AFFICHAGE)[number]): string {
    const x0 = PAD_X + premiereColonneDe(bande) * COL_W;
    const w = (bande.derniereCol - premiereColonneDe(bande) + 1) * COL_W;
    // Fond : image ancrée à gauche (hauteur pleine, SANS déformation) puis
    // FONDU sombre sur les bords quand la bande est plus large que l'image
    // (choix d'Erik 05/10 — fonds 16:9).
    return `left:${x0}px;top:0;width:${w}px;height:${gridH}px;background-color:#0d1218;background-image:url('${bande.fond}');background-repeat:no-repeat;background-size:auto 100%;background-position:left center`;
  }

  function select(id: string): void {
    if (!editable) return;
    client.setResearch(id);
  }

  $effect(() => {
    // synchro initiale (après montage + premier layout)
    syncScroll();
  });

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') onClose();
  }

  // Barre de défilement horizontale PERSONNALISÉE toujours visible (les
  // scrollbars natives du navigateur sont masquées par défaut — retour
  // d'Erik 05/10 : l'arbre est plus large que l'écran).
  let scrollBox: HTMLElement | undefined = $state();
  let scrollPos = $state(0); // 0..1 — position du bord gauche du viewport
  let viewportRatio = $state(1); // largeur visible / largeur totale

  // SURVOL (retour d'Erik 05/10) : la tech sous le curseur illumine SES
  // flèches — entrantes (prérequis) ET sortantes (ce qu'elle débloque).
  let survol = $state<string | null>(null);

  function syncScroll(): void {
    if (!scrollBox) return;
    const max = scrollBox.scrollWidth - scrollBox.clientWidth;
    viewportRatio = Math.min(1, scrollBox.clientWidth / scrollBox.scrollWidth);
    scrollPos = max > 0 ? scrollBox.scrollLeft / max : 0;
  }

  const thumbLeft = $derived(scrollPos * (1 - viewportRatio) * 100);

  function scrollPar(fraction: number): void {
    if (!scrollBox) return;
    const max = scrollBox.scrollWidth - scrollBox.clientWidth;
    scrollBox.scrollLeft = fraction * max;
  }

  let dragActif = $state(false);
  function thumbPointerDown(ev: PointerEvent): void {
    dragActif = true;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }
  function thumbPointerMove(ev: PointerEvent): void {
    if (!dragActif || !scrollBox) return;
    const rect = scrollBox.getBoundingClientRect();
    const piste = rect.width * (1 - viewportRatio);
    if (piste <= 0) return;
    const x = ev.clientX - rect.left - (viewportRatio * rect.width) / 2;
    scrollPar(Math.max(0, Math.min(1, x / piste)));
  }
  function thumbPointerUp(): void {
    dragActif = false;
  }
</script>

<svelte:window onkeydown={onKeydown} onresize={syncScroll} />

<div class="techtree" role="dialog" aria-label="Arbre technologique">
  <header>
    <h1>Arbre technologique</h1>
    <div class="courante">
      {#if !player}
        <span class="hint">État non chargé.</span>
      {:else if currentTech}
        <span class="nom">{currentTech.name}</span>
        <span class="bar"><span class="fill" style:width={`${Math.min(1, currentProgress / currentTech.cost) * 100}%`}></span></span>
        <span class="hint">{currentProgress} / {currentTech.cost}
          {#if scienceParTour > 0}— {toursRestants(currentTech.cost, currentProgress, scienceParTour)} tour(s) restant(s){/if}</span>
      {:else if (player.scienceStored ?? 0) > 0}
        <span class="reserve">⚠ {player.scienceStored} point(s) de recherche en attente — choisissez une technologie</span>
      {:else}
        <span class="hint">Aucune recherche en cours — la science s'accumule en réserve (R-85)</span>
      {/if}
    </div>
    <button type="button" class="close" title="Fermer (Échap)" onclick={onClose}>✕</button>
  </header>

  <div
    class="scroll"
    bind:this={scrollBox}
    onscroll={syncScroll}
  >
    <div class="grille" style:width={`${gridW}px`} style:height={`${gridH}px`}>
      {#each BANDES_AFFICHAGE as e (e.era)}
        <div class="bande" class:active={e.era === eraJoueur} style={bandeStyle(e)}>
          <div class="bande-titre">
            <h2>{e.titre}</h2>
            <p>{e.sousTitre}</p>
          </div>
        </div>
      {/each}

      <svg class="fleches" width={gridW} height={gridH}>
        <defs>
          <marker id="tt-fleche-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e8c96a" />
          </marker>
          <marker id="tt-fleche-off" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a7430" />
          </marker>
        </defs>
        {#each fleches as f (f.key)}
          <path
            class="fleche"
            class:off={f.etat === 'verrouillee'}
            class:on={f.etat !== 'verrouillee'}
            class:illumine={survol !== null && (f.key.startsWith(`${survol}->`) || f.key.endsWith(`->${survol}`))}
            d={chemin(f)}
            marker-end={f.etat === 'verrouillee' ? 'url(#tt-fleche-off)' : 'url(#tt-fleche-on)'}
          />
        {/each}
      </svg>

      {#each Object.entries(TECHS) as [id, t] (id)}
        {@const pos = PLACEMENT[id]!}
        {@const etat = etats[id] ?? 'verrouillee'}
        {@const tours = toursRestants(t.cost, player?.scienceProgress[id] ?? 0, scienceParTour)}
        {@const debloques = libellesDebloques(t)}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex — le rôle button
             n'est posé que sur les cartes disponibles (conditionnel) -->
        <div
          class="carte {etat}"
          class:courante={etat === 'en_cours'}
          onmouseenter={() => (survol = id)}
          onmouseleave={() => (survol = survol === id ? null : survol)}
          style="left:{x(pos.col)}px;top:{y(pos.row)}px;width:{CARD_W}px;height:{CARD_H}px"
          role={etat === 'disponible' ? 'button' : undefined}
          tabindex={etat === 'disponible' && editable ? 0 : undefined}
          aria-label="{t.name} ({etat})"
          title={etat === 'verrouillee' && player
            ? `Requiert : ${prerequisManquants(t, player.techsUnlocked).join(', ')}`
            : debloques.join(' · ')}
          onclick={etat === 'disponible' ? () => select(id) : undefined}
          onkeydown={(ev) => {
            if (etat === 'disponible' && editable && (ev.key === 'Enter' || ev.key === ' ')) select(id);
          }}
        >
          <img class="visuel" src={imageTech(id)} alt="" loading="lazy" />
          <div class="corps">
            <div class="ligne-titre">
              <span class="tech-nom">{t.name}</span>
              <span class="tech-cout">{t.cost}</span>
            </div>
            {#if etat === 'en_cours' && player}
              <span class="bar"><span class="fill" style:width={`${Math.min(1, (player.scienceProgress[id] ?? 0) / t.cost) * 100}%`}></span></span>
            {:else if tours !== null && (etat === 'en_cours' || etat === 'disponible')}
              <span class="tours">{tours} tour(s)</span>
            {/if}
            {#if etat !== 'verrouillee' && debloques.length > 0}
              <span class="debloques">{debloques.slice(0, 3).join(' · ')}{debloques.length > 3 ? ` · +${debloques.length - 3}` : ''}</span>
            {:else if etat === 'verrouillee' && player}
              <span class="manquants">{prerequisManquants(t, player.techsUnlocked).join(', ')}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if viewportRatio < 1}
    <!-- svelte-ignore a11y_no_static_element_interactions — piste de la
         barre de défilement (clic = saut) ; le pouce porte role=slider -->
    <div
      class="barre-defilement"
      onpointerdown={(ev) => {
        // clic sur la piste : sauter à la position
        const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
        scrollPar((ev.clientX - rect.left) / rect.width - viewportRatio / 2);
      }}
    >
      <div
        class="pouce"
        class:drag={dragActif}
        role="slider"
        aria-label="Défilement de l'arbre technologique"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(thumbLeft)}
        tabindex="0"
        onkeydown={(ev) => {
          if (ev.key === 'ArrowRight') scrollPar(Math.min(1, scrollPos + 0.1));
          if (ev.key === 'ArrowLeft') scrollPar(Math.max(0, scrollPos - 0.1));
        }}
        style:width={`${viewportRatio * 100}%`}
        style:left={`${thumbLeft}%`}
        onpointerdown={thumbPointerDown}
        onpointermove={thumbPointerMove}
        onpointerup={thumbPointerUp}
      ></div>
    </div>
  {/if}

  <footer>
    <div class="timeline">
      {#each BANDES_AFFICHAGE as e, i (e.era)}
        <div
          class="palier"
          class:courant={i === indexEraJoueur}
          class:passe={i < indexEraJoueur}
          title={`${ERA_NAMES[e.era]}${i === indexEraJoueur ? ' — ère courante' : ''}`}
        >
          {e.titre}
        </div>
      {/each}
    </div>
    <p class="citation">« Le savoir est le fondement sur lequel s'élèvent les civilisations. »</p>
  </footer>
</div>

<style>
  .techtree {
    position: fixed;
    inset: 0;
    z-index: 50; /* AU-DESSUS du HUD (badge/barre 30-40) — écran plein */
    display: flex;
    flex-direction: column;
    background: #10151a;
    color: #e8e2d0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 0.6rem 1.2rem;
    background: linear-gradient(#1d242b, #161c22);
    border-bottom: 1px solid #3a4148;
  }
  h1 {
    margin: 0;
    font-size: 1.15rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #d4af37;
  }
  .courante {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 1;
    min-width: 0;
  }
  .courante .nom {
    font-weight: 700;
    color: #d4af37;
  }
  .bar {
    flex: 0 0 9rem;
    height: 8px;
    background: #12161a;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #3a4148;
  }
  .fill {
    display: block;
    height: 100%;
    background: #d4af37;
  }
  .reserve {
    color: #ffe082;
    font-weight: 600;
  }
  .hint {
    font-size: 0.82rem;
    color: #8b98a5;
  }
  .close {
    background: none;
    border: 1px solid #46525c;
    border-radius: 6px;
    color: #c8d0d8;
    font-size: 1rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
  }
  .close:hover {
    border-color: #d4af37;
    color: #d4af37;
  }

  .scroll {
    flex: 1;
    overflow: auto;
    position: relative;
  }
  /* Barre horizontale VISIBLE (l'arbre est plus large que l'écran — retour
   * d'Erik 05/10) : piste sombre, poussière or, même langage AAA. */
  .scroll::-webkit-scrollbar {
    width: 12px;
    height: 14px;
  }
  .scroll::-webkit-scrollbar-track {
    background: #10151a;
    border-top: 1px solid #3a4148;
  }
  .scroll::-webkit-scrollbar-thumb {
    background: #8a7430;
    border-radius: 7px;
    border: 3px solid #10151a;
  }
  .scroll::-webkit-scrollbar-thumb:hover {
    background: #d4af37;
  }
  .scroll::-webkit-scrollbar-corner {
    background: #10151a;
  }
  .barre-defilement {
    position: relative;
    height: 14px;
    background: #10151a;
    border-top: 1px solid #3a4148;
    cursor: pointer;
  }
  .pouce {
    position: absolute;
    top: 3px;
    height: 8px;
    border-radius: 4px;
    background: #8a7430;
  }
  .pouce:hover,
  .pouce.drag {
    background: #d4af37;
  }
  .grille {
    position: relative;
  }
  .bande {
    position: absolute;
    background-size: cover;
    background-position: center top;
    border-left: 1px solid #00000060;
    border-right: 1px solid #00000060;
  }
  .bande::after {
    content: '';
    position: absolute;
    inset: 0;
    /* Fondu sombre latéral (choix d'Erik : extension des fonds 16:9) +
     // assombrissement vertical pour la lisibilité des cartes. */
    background:
      linear-gradient(90deg, #10151a80 0%, #10151a00 8%, #10151a00 55%, #10151acc 92%, #10151af0 100%),
      linear-gradient(#10151ae6 0%, #10151a66 30%, #10151a99 100%);
  }
  .bande-titre {
    position: absolute;
    top: 1rem;
    left: 0;
    right: 0;
    text-align: center;
    z-index: 1;
  }
  .bande-titre h2 {
    margin: 0;
    font-size: 1.3rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #e8e2d0;
    text-shadow: 0 2px 6px #000;
  }
  .bande-titre p {
    margin: 0.15rem 0 0;
    font-size: 0.85rem;
    font-style: italic;
    color: #b9c2cb;
    text-shadow: 0 1px 4px #000;
  }
  .fleches {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .fleche {
    fill: none;
    stroke-width: 2.5;
  }
  .fleche.on {
    stroke: #e8c96a;
  }
  .fleche.off {
    stroke: #8a743099;
  }
  /* SURVOL : les flèches de la tech pointée s'illuminent (prérequis entrants
   * + déblocages sortants) — demande d'Erik 05/10. */
  .fleche.illumine {
    stroke: #ffe082;
    stroke-width: 3.5;
    filter: drop-shadow(0 0 3px #ffd54acc);
  }
  .carte {
    position: absolute;
    display: flex;
    align-items: stretch;
    background: #232b33;
    border: 1px solid #46525c;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px #0009;
  }
  /* DISPONIBLE : or PÂLI (retour d'Erik — la carte « prête à découvrir » ne
   * doit pas concurrencer visuellement la carte DÉCOUVERTE). */
  .carte.disponible {
    border: 1px solid #b9a15a;
    cursor: pointer;
    box-shadow: 0 0 8px #b9a15a30;
  }
  .carte.disponible:hover {
    background: #2c3640;
    box-shadow: 0 0 12px #b9a15a70;
  }
  .carte.courante {
    border-color: #6fa3b8;
    box-shadow: 0 0 12px #6fa3b860;
  }
  /* ACQUISE : bordure or ÉPAISSE (2 px) et tuile DÉLAVÉE — la distinction
   * découverte / découvrable doit sauter aux yeux (retour d'Erik 05/10). */
  .carte.acquise {
    border: 2px solid #d4af37;
    background: #31383f;
  }
  .carte.acquise .visuel {
    filter: brightness(1.3) saturate(0.45);
  }
  .carte.acquise .tech-nom,
  .carte.acquise .tech-cout,
  .carte.acquise .debloques {
    color: #9aa4ad;
  }
  .carte.verrouillee {
    opacity: 0.55;
    filter: grayscale(0.7);
    background: #1a2026;
  }
  .visuel {
    width: 76px;
    object-fit: cover;
    flex: 0 0 76px;
  }
  .carte.verrouillee .visuel {
    filter: grayscale(1);
  }
  .corps {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.35rem 0.5rem;
  }
  .ligne-titre {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.4rem;
  }
  .tech-nom {
    font-weight: 700;
    font-size: 0.88rem;
    line-height: 1.15;
  }
  .tech-cout {
    font-size: 0.75rem;
    color: #d4af37;
  }
  .tours {
    font-size: 0.72rem;
    color: #9fd0e0;
  }
  .debloques {
    font-size: 0.72rem;
    color: #a8b4be;
    line-height: 1.2;
  }
  .manquants {
    font-size: 0.72rem;
    color: #b08d5a;
    line-height: 1.2;
  }
  .carte .bar {
    flex: 0 0 auto;
    height: 6px;
  }

  footer {
    background: linear-gradient(#161c22, #10151a);
    border-top: 1px solid #3a4148;
    padding: 0.5rem 1.2rem 0.4rem;
  }
  .timeline {
    display: flex;
    gap: 4px;
  }
  .palier {
    flex: 1;
    text-align: center;
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7d8892;
    padding: 0.3rem 0;
    border-top: 2px solid #333b42;
  }
  .palier.passe {
    color: #b9a15a;
    border-top-color: #8a7430;
  }
  .palier.courant {
    color: #d4af37;
    border-top-color: #d4af37;
    font-weight: 700;
  }
  .citation {
    margin: 0.25rem 0 0;
    text-align: center;
    font-size: 0.78rem;
    font-style: italic;
    color: #6e7681;
  }
</style>
