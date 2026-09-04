<script lang="ts">
  /**
   * Lab3d — BANC D'ESSAI du spike L0 (chantier V1 « rendu en vraie 3D »).
   *
   * Preuve de rendu minimal sur le VRAI jeu : carte procédurale réelle 40×40
   * (générateur moteur), état initial réel (createInitialState), UN tour réel
   * résolu par le moteur (resolveTurn — fondation de la capitale p1, R-64),
   * état FILTRÉ réel (getFilteredState — fog 3 états, R-70). Aucune donnée
   * inventée côté rendu : tuiles, brouillard, ville et unités viennent de
   * l'état filtré, comme GameCanvas. (Le mode « Carte 40×40 » du bench rend
   * le terrain complet de la VRAIE carte en exploration synthétique — pire
   * cas d'instanciation, documenté dans le rapport.)
   *
   * Deux architectures candidates rendues depuis les MÊMES données
   * (Scene3DData) :
   *  - Option A : Three.js seul (terrain + entités 3D, optionA.ts) ;
   *  - Option B : terrain Three.js + entités PixiJS projetées (optionB.ts).
   *
   * La décision de clic réutilise la fonction PURE du jeu (clickAction /
   * rightClickAction — interaction.ts) : preuve que l'interaction existante
   * survit sans réécriture sémantique.
   *
   * SPIKE client-side pur (comme #/progen) : aucune partie, aucun serveur,
   * rien n'est soumis ; le labo affiche et mesure, il ne joue pas.
   */
  import { onMount, untrack } from 'svelte';
  import * as THREE from 'three';
  import {
    createInitialState,
    generateProceduralMap,
    getFilteredState,
    resolveTurn,
    tileKeyOf,
    tileYield,
    unitType,
  } from '@game/rules';
  import type { GameState, Hex, Order } from '@game/rules';
  import type { GameView } from '../lib/gameClient.js';
  import { clickAction, rightClickAction } from '../lib/render/interaction.js';
  import type { ClickAction } from '../lib/render/interaction.js';
  import { createUiState } from '../lib/render/ui.js';
  import type { UiState } from '../lib/render/ui.js';
  import { contexteRendement, allumeDe as allumeDans } from '../lib/render3d/rendement.js';
  import { FOV } from '../lib/render3d/camera3d.js';
  import { Stage3D } from '../lib/render3d/stage3d.js';
  import { TerrainWorld, mapBoundsWorld, pickHex3D, hexWorldPos } from '../lib/render3d/world3d.js';
  import type { TileDraw } from '../lib/render3d/world3d.js';
  import { RenderOptionA, elevationDe } from '../lib/render3d/optionA.js';
  import type { Scene3DData } from '../lib/render3d/optionA.js';
  import { RenderOptionB } from '../lib/render3d/optionB.js';

  // --- Réglages du banc -----------------------------------------------------
  let seed = $state(20260904);
  let revision = $state(0); // « Régénérer » : rejoue la construction à seed identique
  let option = $state<'A' | 'B'>('A');
  let bloom = $state(true);
  let animation = $state(true);
  let carteEntiere = $state(false); // slice ~10×10 (fog réel) ↔ carte 40×40 (bench perf)
  const DEMI_FENETRE = 5; // fenêtre col×row de 10×10 autour de la capitale

  // --- Mesures affichées ----------------------------------------------------
  let fps = $state(0);
  let drawCalls = $state(0);
  let triangles = $state(0);
  let mesures = $state({
    tuiles: 0, instances: 0, pools: 0, rebuildMs: 0,
    buildTotalMs: 0, projectionsB: 0, syncBMs: 0,
  });
  let bench = $state<null | {
    fpsMoyen: number; cpuFrameMs: number; drawCalls: number; triangles: number;
    rebuildMs: number; pickingMs: number; frames: number;
  }>(null);
  let benchEnCours = $state(false);
  let clicInfo = $state('—');
  let resumer = $state('');

  // --- Objets non réactifs (moteurs de rendu) -------------------------------
  let host: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;
  let stage: Stage3D | null = null;
  let world: TerrainWorld | null = null;
  let renderA: RenderOptionA | null = null;
  let renderB: RenderOptionB | null = null;
  let destroyed = false;

  // --- Données réelles (moteur pur) -----------------------------------------
  let filtered: GameState | null = null;
  /** Terrain complet de la VRAIE carte (pour le bench 40×40 — pire cas). */
  let terrainComplet: Record<string, string> = {};
  /** Mêmes tuiles au format des fonctions d'économie (tileYield — bench). */
  let terrainCompletMap: Record<string, { terrain: string }> = {};
  let capital: Hex | null = null;
  // Version des données de scène (incrémentée par tout changement état/UI/survol).
  // Déclarées AVANT ui.subscribe : le callback de subscribe s'exécute immédiatement.
  let dataVersion = 0;
  let lastSyncedVersion = -1;
  let cameraChanged = true;
  let hoverKey: string | null = null;
  const ui = createUiState();
  let uiSnap: UiState = { selectedUnitId: null, selectedCityId: null, draft: null };
  const unsubUi = ui.subscribe((u) => {
    uiSnap = u;
    dataVersion++;
  });
  const view: GameView = {
    code: 'lab3d',
    playerId: 'lab-host',
    players: [
      { id: 'lab-host', name: 'Joueur 1', engineId: 'p1' },
      { id: 'lab-other', name: 'Joueur 2', engineId: 'p2' },
    ],
    status: 'active',
    turn: 1,
    phase: 'orders',
    state: null,
    orders: [],
    locked: false,
    events: [],
    lastSeq: 0,
    seenEventSeq: 0,
  };

  /** Construit l'état réel : carte procédurale + état initial + UN tour moteur. */
  function construireEtatReel(): void {
    const result = generateProceduralMap(seed);
    terrainComplet = { ...result.map.terrain };
    terrainCompletMap = Object.fromEntries(Object.entries(terrainComplet).map(([k, t]) => [k, { terrain: t }]));
    const initial = createInitialState(result.map, seed);
    // Un tour RÉEL : le Colon p1 fonde sa capitale (R-64), p2 reste passif.
    const colon = Object.values(initial.units).find((u) => u.owner === 'p1' && unitType(u.type).canFoundCity);
    const orders: Record<string, Order[]> = { p2: [] };
    if (colon) orders['p1'] = [{ type: 'FoundCity', unitId: colon.id }];
    const tour = resolveTurn(initial, orders, seed);
    filtered = getFilteredState(tour.newState, 'p1');
    view.state = filtered;
    const maVille = Object.values(filtered.cities).find((c) => c.owner === 'p1');
    capital = maVille ? { q: maVille.q, r: maVille.r } : null;
    resumer = `seed ${seed} · carte ${filtered.mapWidth}×${filtered.mapHeight} · tour ${filtered.turn} · capitale p1 (${capital ? `${capital.q},${capital.r}` : '?'} · pop ${maVille?.pop ?? 0}) · ${Object.keys(filtered.units).length} unités visibles · ${filtered.players['p1']?.vision.explored.length ?? 0} cases explorées`;
  }

  /** Fenêtre 10×10 (col×row) autour de la capitale — la tranche du spike. */
  function dansFenetre(q: number, r: number): boolean {
    if (!capital) return true;
    const col = q + Math.floor(r / 2);
    const colCap = capital.q + Math.floor(capital.r / 2);
    return Math.abs(col - colCap) < DEMI_FENETRE && Math.abs(r - capital.r) < DEMI_FENETRE;
  }

  /** Assemble les données de scène depuis l'état FILTRÉ (aucune invention). */
  function assemblerDonnees(): Scene3DData {
    if (!filtered) return { tiles: [], villes: [], unites: [], worked: new Map(), selection: null, draftPath: [], pingSurvol: null };
    const explored = new Set(filtered.players['p1']?.vision.explored ?? []);
    const visible = new Set(filtered.players['p1']?.vision.visible ?? []);
    const worked = new Map<string, string>();
    for (const city of Object.values(filtered.cities)) {
      for (const key of city.workedTiles) worked.set(key, city.owner);
    }

    // --- L2 : lueur = rendement RÉEL (miroir exact des helpers moteur) -------
    // Calcul partagé avec le jeu (render3d/rendement.ts) — pas de logique
    // dupliquée. Le bench remplace seulement la carte (terrain complet
    // synthétique, exploration pire-cas).
    const ctxRendement = contexteRendement(filtered, 'p1');
    const ctxBench: typeof ctxRendement = {
      ...ctxRendement,
      map: terrainCompletMap as Parameters<typeof tileYield>[0],
    };
    const allumeDe = (key: string): ReturnType<typeof allumeDans> =>
      allumeDans(carteEntiere ? ctxBench : ctxRendement, key);

    const tiles: TileDraw[] = [];
    if (carteEntiere) {
      // Bench : terrain complet de la vraie carte, exploration synthétique
      // (pire cas d'instanciation — 1600 tuiles visibles, rendements réels).
      for (const [key, terrain] of Object.entries(terrainComplet)) {
        const [q, r] = key.split(',').map(Number);
        if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
        tiles.push({ q, r, terrain, fog: 'visible', allume: allumeDe(key) });
      }
    } else {
      for (const [key, tile] of Object.entries(filtered.map)) {
        if (!dansFenetre(+key.split(',')[0]!, +key.split(',')[1]!)) continue;
        if (!explored.has(key)) continue; // fog : inexploré = RIEN (§4.4, miroir GameCanvas)
        const [q, r] = key.split(',').map(Number);
        if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
        tiles.push({
          q, r,
          terrain: tile.terrain,
          fog: visible.has(key) ? 'visible' : 'explored',
          allume: allumeDe(key),
        });
      }
    }
    const dansVue = (q: number, r: number): boolean => carteEntiere || dansFenetre(q, r);
    const villes = Object.values(filtered.cities)
      .filter((c) => dansVue(c.q, c.r))
      .map((c) => ({ id: c.id, q: c.q, r: c.r, capital: c.capital, owner: c.owner, pop: c.pop }));
    const unites = Object.values(filtered.units)
      .filter((u) => !u.aboard && dansVue(u.q, u.r))
      .map((u) => ({ id: u.id, q: u.q, r: u.r, owner: u.owner, type: u.type }));
    let selection: Hex | null = null;
    if (uiSnap.draft) {
      const last = uiSnap.draft.path[uiSnap.draft.path.length - 1];
      if (last) selection = last;
    } else if (uiSnap.selectedUnitId && filtered.units[uiSnap.selectedUnitId]) {
      const u = filtered.units[uiSnap.selectedUnitId]!;
      selection = { q: u.q, r: u.r };
    } else if (uiSnap.selectedCityId && filtered.cities[uiSnap.selectedCityId]) {
      const c = filtered.cities[uiSnap.selectedCityId]!;
      selection = { q: c.q, r: c.r };
    }
    const ping =
      hoverKey && (filtered.artifactPings ?? []).some((a) => tileKeyOf(a) === hoverKey)
        ? hoverKey.split(',').map(Number)
        : null;
    return {
      tiles,
      villes,
      unites,
      worked,
      selection,
      draftPath: uiSnap.draft?.path ?? [],
      pingSurvol: ping ? { q: ping[0]!, r: ping[1]! } : null,
    };
  }

  // --- Montage / démontage des moteurs --------------------------------------
  function demonterRendu(): void {
    world?.dispose(); world = null;
    renderA?.dispose(); renderA = null;
    const b = renderB;
    renderB = null;
    void b?.dispose();
    lastSyncedVersion = -1;
  }

  async function monterRendu(): Promise<void> {
    if (!stage || !filtered || destroyed || !host) return;
    demonterRendu();
    const t0 = performance.now();
    stage.setBloom(bloom);
    world = new TerrainWorld(stage.scene, { capacity: 1700, bloom });
    stage.cam.bounds = mapBoundsWorld(filtered.mapWidth, filtered.mapHeight);
    if (option === 'A') {
      renderA = new RenderOptionA(stage.scene);
    } else {
      renderB = await RenderOptionB.create(host);
      renderB.resize(stage.viewW, stage.viewH);
    }
    dataVersion++;
    recentrer();
    mesures = { ...mesures, buildTotalMs: Math.round(performance.now() - t0) };
  }

  function recentrer(): void {
    if (!stage || !capital) return;
    const { x, z } = hexWorldPos(capital);
    stage.cam.centerOn(x, z);
    stage.cam.clamp(stage.viewW, stage.viewH);
    cameraChanged = true;
  }

  // --- Boucle de rendu + mesures --------------------------------------------
  let rafId = 0;
  let frames = 0;
  let dernierComptage = performance.now();
  let dernierTemps = performance.now();

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
      drawCalls = stage.renderer.info.render.calls;
      triangles = stage.renderer.info.render.triangles;
    }
    if (world && dataVersion !== lastSyncedVersion) {
      const data = assemblerDonnees();
      world.update(data.tiles);
      renderA?.sync(data);
      if (renderB) renderB.sync(stage, data, stage.viewW, stage.viewH);
      lastSyncedVersion = dataVersion;
      mesures = {
        ...mesures,
        tuiles: world.stats.tuiles,
        instances: world.stats.drawCallsNaifsEquivalents,
        pools: world.stats.pools,
        rebuildMs: Math.round(world.stats.derniersRebuildMs * 10) / 10,
        projectionsB: renderB?.projectionsDerniereFrame ?? 0,
      };
    }
    if (cameraChanged && renderB) {
      renderB.sync(stage, assemblerDonnees(), stage.viewW, stage.viewH);
      mesures = { ...mesures, projectionsB: renderB.projectionsDerniereFrame };
      cameraChanged = false;
    }
    world?.tick(dt, animation);
    world?.breathe(now / 1000, animation);
    stage.render();
  }

  // --- Entrées souris (contrat identique à GameCanvas : seuil 5 px) ---------
  const PAN_THRESHOLD = 5;
  let pointer: { x: number; y: number } | null = null;
  let dragging = false;

  function canvasPos(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const rect = canvasEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function terrainAt(hex: Hex): string | null {
    return terrainComplet[tileKeyOf(hex)] ?? null;
  }
  function pickAt(p: { x: number; y: number }): Hex | null {
    if (!stage) return null;
    return pickHex3D(p.x, p.y, stage.viewW, stage.viewH, stage.cam, terrainAt);
  }
  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    pointer = canvasPos(e);
    dragging = false;
  }
  function onPointerMove(e: PointerEvent): void {
    if (!stage) return;
    const p = canvasPos(e);
    // Ping artefact au survol (R-155) : re-sync SEULEMENT si la case survolée change.
    const h = pickAt(p);
    const key = h ? tileKeyOf(h) : null;
    if (key !== hoverKey) {
      hoverKey = key;
      dataVersion++;
    }
    if (!pointer) return;
    const dx = p.x - pointer.x, dy = p.y - pointer.y;
    if (!dragging && Math.hypot(dx, dy) > PAN_THRESHOLD) dragging = true;
    if (dragging) {
      stage.cam.panBy(dx, dy, stage.viewH);
      stage.cam.clamp(stage.viewW, stage.viewH);
      cameraChanged = true;
    }
    pointer = p;
  }
  function onPointerUp(e: PointerEvent): void {
    const p = canvasPos(e);
    const wasDragging = dragging;
    pointer = null;
    dragging = false;
    if (wasDragging || !stage || !view.state) return;
    const hex = pickAt(p);
    if (!hex) return;
    appliquerAction(clickAction(view, uiSnap, hex), hex);
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!stage) return;
    const p = canvasPos(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    if (stage.cam.zoomAt(p.x, p.y, stage.viewW, stage.viewH, factor)) {
      stage.cam.clamp(stage.viewW, stage.viewH);
      cameraChanged = true;
    }
  }
  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (!stage || !view.state) return;
    const hex = pickAt(canvasPos(e));
    if (!hex) return;
    const action = rightClickAction(view, uiSnap, hex);
    if (action.kind === 'moveDraft') {
      ui.set({ ...uiSnap, selectedUnitId: action.unitId, selectedCityId: null, draft: { unitId: action.unitId, path: action.path } });
      clicInfo = `clic droit → chemin ${action.path.length} étape(s) vers ${hex.q},${hex.r} (affiché, non soumis — labo)`;
    } else {
      ui.set({ ...uiSnap, draft: null });
      clicInfo = `clic droit → annulation brouillon (visé ${hex.q},${hex.r})`;
    }
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') ui.set({ selectedUnitId: null, selectedCityId: null, draft: null });
  }

  /** Applique la décision PURE du jeu (miroir de Game.svelte, sans envoi serveur). */
  function appliquerAction(action: ClickAction, hex: Hex): void {
    switch (action.kind) {
      case 'selectUnit':
        ui.set({ ...uiSnap, selectedUnitId: action.unitId, selectedCityId: null, draft: null });
        clicInfo = `(${hex.q},${hex.r}) → selectUnit ${action.unitId} (${action.mine ? 'ami' : 'ennemi visible'})`;
        break;
      case 'selectCity':
        ui.set({ ...uiSnap, selectedCityId: action.cityId, selectedUnitId: null, draft: null });
        clicInfo = `(${hex.q},${hex.r}) → selectCity ${action.cityId}`;
        break;
      case 'deselect':
        ui.set({ selectedUnitId: null, selectedCityId: null, draft: null });
        clicInfo = `(${hex.q},${hex.r}) → désélection`;
        break;
      case 'extend':
        ui.set({ ...uiSnap, draft: { unitId: action.unitId ?? uiSnap.selectedUnitId ?? '', path: action.path } });
        clicInfo = `(${hex.q},${hex.r}) → chemin ${action.path.length} étape(s)`;
        break;
      case 'truncate':
        ui.set({ ...uiSnap, draft: { unitId: uiSnap.draft?.unitId ?? '', path: action.path } });
        clicInfo = `(${hex.q},${hex.r}) → troncature à ${action.path.length} étape(s)`;
        break;
      case 'none':
        clicInfo = `(${hex.q},${hex.r}) → aucun effet (réassignation / hors rayon)`;
        break;
      default:
        clicInfo = `(${hex.q},${hex.r}) → ${action.kind} (non jouable dans le labo)`;
    }
  }

  // --- Zooms calés sur les niveaux 2D (captures lisibilité) ------------------
  function zoomVers(zoom2d: number): void {
    if (!stage) return;
    stage.cam.dist = stage.viewH / (2 * 64 * zoom2d * Math.tan(FOV / 2));
    stage.cam.clamp(stage.viewW, stage.viewH);
    cameraChanged = true;
  }

  // --- Bench 40×40 ------------------------------------------------------------
  function frame(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  async function mesurer(): Promise<void> {
    if (!stage || !world || benchEnCours) return;
    benchEnCours = true;
    bench = null;
    if (!carteEntiere) {
      carteEntiere = true; // force le rendu complet (sync via dataVersion)
      await new Promise((r) => setTimeout(r, 150));
    }
    const info = stage.renderer.info;
    for (let i = 0; i < 30; i++) { stage.render(); await frame(); } // warmup
    const N = 180;
    let minDt = Infinity, sumCalls = 0, sumTris = 0;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const f0 = performance.now();
      stage.render();
      const dt = performance.now() - f0;
      minDt = Math.min(minDt, dt);
      sumCalls += info.render.calls;
      sumTris += info.render.triangles;
      await frame();
    }
    const wallMs = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 1000; i++) pickAt({ x: stage.viewW / 2, y: stage.viewH / 2 });
    const pickingMs = (performance.now() - t1) / 1000;
    let syncBMs = 0;
    if (renderB) {
      const t2 = performance.now();
      for (let i = 0; i < 30; i++) {
        stage.cam.panBy(4, 2, stage.viewH);
        renderB.sync(stage, assemblerDonnees(), stage.viewW, stage.viewH);
      }
      syncBMs = (performance.now() - t2) / 30;
      cameraChanged = true;
    }
    bench = {
      fpsMoyen: Math.round((N * 1000) / wallMs),
      cpuFrameMs: Math.round(minDt * 100) / 100,
      drawCalls: Math.round(sumCalls / N),
      triangles: Math.round(sumTris / N),
      rebuildMs: Math.round(world.stats.derniersRebuildMs * 10) / 10,
      pickingMs: Math.round(pickingMs * 1000) / 1000,
      frames: N,
    };
    mesures = { ...mesures, syncBMs: Math.round(syncBMs * 100) / 100 };
    benchEnCours = false;
  }

  // --- Effets -----------------------------------------------------------------
  // Montage réactif : reconstruit l'état réel + le rendu à chaque seed/option.
  // monterRendu lit bloom/option et écrit mesures (état) → exécutée hors suivi
  // (untrack) pour ne pas créer de dépendance circulaire (effect_update_depth).
  $effect(() => {
    void seed;
    void revision;
    void option;
    if (!canvasEl || !host) return;
    untrack(() => {
      construireEtatReel();
      if (!stage) installerStage();
      void monterRendu();
    });
  });
  $effect(() => {
    void bloom;
    stage?.setBloom(bloom);
  });
  // Bascule slice ↔ carte 40×40 : force la reconstruction des instances.
  $effect(() => {
    void carteEntiere;
    dataVersion++;
  });

  function installerStage(): void {
    stage = new Stage3D(canvasEl);
    stage.resize(host.clientWidth || 800, host.clientHeight || 600);
    // Hook de vérification (spike L0, dev uniquement) : statistiques rendu +
    // picking en console — même convention que __game de GameCanvas.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__lab3d = {
      option: () => option,
      stats: () => world?.stats ?? null,
      info: () => stage ? { calls: stage.renderer.info.render.calls, triangles: stage.renderer.info.render.triangles, geometries: stage.renderer.info.memory.geometries, textures: stage.renderer.info.memory.textures, programs: stage.renderer.info.programs?.length ?? 0 } : null,
      fps: () => fps,
      bench: () => bench,
      pickCentre: () => { const h = pickAt({ x: (host.clientWidth || 800) / 2, y: (host.clientHeight || 600) / 2 }); return h ? `${h.q},${h.r}` : null; },
      unites: () => Object.values(filtered?.units ?? {}).map((u) => ({ id: u.id, type: u.type, q: u.q, r: u.r, owner: u.owner })),
      debug: () => ({
        ui: uiSnap,
        voisins: [[29, 6], [28, 7], [28, 8], [29, 8], [30, 8], [30, 7]].map(([q, r]) => ({
          hex: `${q},${r}`,
          terrain: filtered?.map[`${q},${r}`]?.terrain ?? 'ABSENT(inexploré)',
        })),
      }),
      objets: () => {
        const ra = renderA as unknown as { villeObjs?: Map<string, THREE.Group>; uniteObjs?: Map<string, THREE.Group> } | null;
        return {
          option,
          villes: ra?.villeObjs ? [...ra.villeObjs.entries()].map(([id, g]) => ({ id, pos: g.position.toArray().map((v) => +v.toFixed(2)), enfants: g.children.length, visible: g.visible })) : [],
          unites: ra?.uniteObjs ? [...ra.uniteObjs.entries()].map(([id, g]) => ({ id, pos: g.position.toArray().map((v) => +v.toFixed(2)), enfants: g.children.length })) : [],
        };
      },
      graphe: () => {
        if (!stage) return [];
        const out: string[] = [];
        stage.scene.traverse((o) => {
          const mesh = o as unknown as { isSprite?: boolean; isPoints?: boolean; isMesh?: boolean };
          const type = mesh.isSprite ? 'Sprite' : mesh.isPoints ? 'Points' : mesh.isMesh ? 'Mesh' : o.type;
          if (type === 'Object3D' || type === 'Group' || type === 'Scene') return;
          out.push(`${type} ${o.visible ? 'v' : 'CACHÉ'} y=${o.position.y.toFixed(2)} world=(${o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(1)).join(',')})`);
        });
        return out.slice(0, 60);
      },
      pickEcran: (fx: number, fy: number) => { const h = pickAt({ x: (host.clientWidth || 800) * fx, y: (host.clientHeight || 600) * fy }); return h ? `${h.q},${h.r}` : null; },
      ground: (fx: number, fy: number) => {
        if (!stage) return null;
        const g = stage.cam.groundPoint((host.clientWidth || 800) * fx, (host.clientHeight || 600) * fy, stage.viewW, stage.viewH, 0);
        return g ? { x: +g.x.toFixed(2), z: +g.z.toFixed(2) } : null;
      },
      cam: () => stage ? { dist: +stage.cam.dist.toFixed(2), target: { x: +stage.cam.target.x.toFixed(2), z: +stage.cam.target.z.toFixed(2) }, viewW: stage.viewW, viewH: stage.viewH, pos: stage.cam.camera.position.toArray().map((v) => +v.toFixed(2)) } : null,
      screenOf: (q: number, r: number) => {
        if (!stage) return null;
        const { x, z } = hexWorldPos({ q, r });
        const p = stage.cam.project(new THREE.Vector3(x, elevationDe(terrainComplet[`${q},${r}`]), z), stage.viewW, stage.viewH);
        return p ? { x: +p.x.toFixed(1), y: +p.y.toFixed(1), px: +(p.pxPerUnit).toFixed(1) } : null;
      },
      };
    }
    const ro = new ResizeObserver(() => {
      if (!stage || !host || destroyed) return;
      stage.resize(host.clientWidth || 800, host.clientHeight || 600);
      renderB?.resize(stage.viewW, stage.viewH);
      stage.cam.clamp(stage.viewW, stage.viewH);
      cameraChanged = true;
    });
    ro.observe(host);
    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('pointercancel', () => { pointer = null; dragging = false; });
    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    canvasEl.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKey);
    dernierTemps = performance.now();
    dernierComptage = dernierTemps;
    boucle();
  }

  onMount(() => {
    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      rafId = 0;
      demonterRendu();
      unsubUi();
      stage?.dispose();
      stage = null;
      canvasEl?.removeEventListener('pointerdown', onPointerDown);
      canvasEl?.removeEventListener('pointermove', onPointerMove);
      canvasEl?.removeEventListener('pointerup', onPointerUp);
      canvasEl?.removeEventListener('wheel', onWheel);
      canvasEl?.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="lab">
  <div class="host" bind:this={host}>
    <canvas bind:this={canvasEl}></canvas>
  </div>

  <div class="panneau">
    <h1>LABO · Spike L0 — vraie 3D</h1>
    <p class="note">
      Client-side pur (aucune partie, aucun serveur). État RÉEL : carte procédurale 40×40,
      un tour résolu par le moteur (fondation de capitale), état filtré par le brouillard (R-70).
    </p>

    <div class="groupe">
      <label>Architecture candidate</label>
      <div class="rangee">
        <button class:actif={option === 'A'} onclick={() => (option = 'A')}>A — Three.js seul</button>
        <button class:actif={option === 'B'} onclick={() => (option = 'B')}>B — hybride 3D + PixiJS</button>
      </div>
    </div>

    <div class="groupe">
      <label>Affichage</label>
      <div class="rangee">
        <button class:actif={bloom} onclick={() => (bloom = !bloom)}>Bloom</button>
        <button class:actif={animation} onclick={() => (animation = !animation)}>Pulses</button>
        <button class:actif={carteEntiere} onclick={() => (carteEntiere = !carteEntiere)}>Carte 40×40</button>
        <button onclick={recentrer}>Recentrer</button>
      </div>
      <div class="rangee">
        <button onclick={() => zoomVers(0.5)}>zoom 0.5×</button>
        <button onclick={() => zoomVers(1)}>zoom 1×</button>
        <button onclick={() => zoomVers(2.25)}>zoom 2.25×</button>
      </div>
      <div class="rangee">
        <label class="inline">seed <input type="number" bind:value={seed} /></label>
        <button onclick={() => revision++}>Régénérer</button>
      </div>
    </div>

    <div class="groupe">
      <label>Mesures continues</label>
      <dl>
        <dt>FPS</dt><dd>{fps}</dd>
        <dt>Draw calls (frame)</dt><dd>{drawCalls}</dd>
        <dt>Triangles (frame)</dt><dd>{triangles.toLocaleString('fr-FR')}</dd>
        <dt>Tuiles dessinées</dt><dd>{mesures.tuiles}</dd>
        <dt>Instances (équiv. naïf)</dt><dd>{mesures.instances.toLocaleString('fr-FR')}</dd>
        <dt>Pools instanciés</dt><dd>{mesures.pools}</dd>
        <dt>Rebuild tuiles</dt><dd>{mesures.rebuildMs} ms</dd>
        <dt>Montage rendu</dt><dd>{mesures.buildTotalMs} ms</dd>
        {#if option === 'B'}
          <dt>Projections PixiJS</dt><dd>{mesures.projectionsB}</dd>
          <dt>Coût sync B / pan</dt><dd>{mesures.syncBMs} ms</dd>
        {/if}
      </dl>
    </div>

    <div class="groupe">
      <label>Bench 40×40</label>
      <button class="plein" disabled={benchEnCours} onclick={() => void mesurer()}>
        {benchEnCours ? 'Mesure en cours…' : 'Mesurer la carte entière'}
      </button>
      {#if bench}
        <dl>
          <dt>FPS moyen ({bench.frames} frames, vsync)</dt><dd>{bench.fpsMoyen}</dd>
          <dt>CPU par frame (min)</dt><dd>{bench.cpuFrameMs} ms</dd>
          <dt>Draw calls</dt><dd>{bench.drawCalls}</dd>
          <dt>Triangles</dt><dd>{bench.triangles.toLocaleString('fr-FR')}</dd>
          <dt>Rebuild 40×40</dt><dd>{bench.rebuildMs} ms</dd>
          <dt>Picking (moy. 1000)</dt><dd>{bench.pickingMs} ms</dd>
        </dl>
      {/if}
    </div>

    <div class="groupe">
      <label>Interaction (fonctions pures du jeu)</label>
      <p class="clic">{clicInfo}</p>
      <p class="note">Clic = sélection (alternance unité/ville R-2 conservée) · clic droit = chemin ·
        glisser = pan · molette = zoom ancré · Échap = désélection. Aucun ordre n'est soumis.</p>
    </div>

    <div class="groupe">
      <label>État réel chargé</label>
      <p class="note mono">{resumer}</p>
    </div>
  </div>
</div>

<style>
  .lab {
    position: fixed;
    inset: 0;
    display: flex;
    background: #070b18;
    color: #dfe6ee;
    font: 13px/1.5 system-ui, sans-serif;
  }
  .host {
    position: relative;
    flex: 1;
    overflow: hidden;
  }
  .host canvas {
    position: absolute;
    inset: 0;
    display: block;
    touch-action: none;
    cursor: grab;
  }
  .panneau {
    width: 21rem;
    overflow-y: auto;
    padding: 0.9rem;
    background: rgba(10, 14, 24, 0.96);
    border-left: 1px solid #1c2740;
  }
  h1 { font-size: 15px; margin: 0 0 0.3rem; color: #3dffce; }
  .groupe { margin-top: 0.9rem; border-top: 1px solid #1c2740; padding-top: 0.6rem; }
  .groupe > label { display: block; font-weight: 600; color: #9fb3c8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3rem; }
  .rangee { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.35rem; }
  button {
    background: #14203a;
    color: #dfe6ee;
    border: 1px solid #274066;
    border-radius: 4px;
    padding: 0.25rem 0.55rem;
    cursor: pointer;
    font: inherit;
  }
  button.actif { background: #123d33; border-color: #3dffce; color: #3dffce; }
  button.plein { width: 100%; }
  button:disabled { opacity: 0.5; cursor: wait; }
  button:hover { border-color: #3dffce; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.1rem 0.6rem; margin: 0; font-size: 12px; }
  dt { color: #9fb3c8; }
  dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .note { color: #8296ab; font-size: 11.5px; margin: 0.2rem 0 0; }
  .mono { font-family: ui-monospace, monospace; }
  .clic { font-family: ui-monospace, monospace; font-size: 12px; color: #ffe082; margin: 0.15rem 0; min-height: 1.2em; }
  .inline { display: flex; align-items: center; gap: 0.4rem; }
  input { width: 7rem; background: #0d1526; color: #dfe6ee; border: 1px solid #274066; border-radius: 4px; padding: 0.2rem 0.4rem; font: inherit; }
</style>
