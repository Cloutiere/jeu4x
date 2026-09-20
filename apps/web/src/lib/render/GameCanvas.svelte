<script lang="ts">
  /**
   * GameCanvas (L1/L2/L3) — application PixiJS v8 encapsulée : carte
   * hexagonale, brouillard 3 états, entités, caméra (pan/zoom/culling) et
   * clics. Le composant est détruit proprement au démontage ; toutes les
   * conversions hexagonales viennent de @game/rules (pointy-top verrouillé).
   *
   * Le client n'invente rien : inexploré = rien d'affiché (case absente du
   * JSON), entités = celles de l'état filtré uniquement.
   */
  import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
  import type { Texture } from 'pixi.js';
  import * as THREE from 'three';
  import { hexToPixel, inRectangle, tileKeyOf, unitType, previewPrograms, fondeAFinDuChemin, fondateursDe, ARTEFACTS, BUILDINGS, RESOURCES, RESOURCE_UNKNOWN, TERRAINS, resourceBonus, BARBARIAN_ID, BARBARIANS, workRadiusOf, rayonCulturelDe, frontierRadius } from '@game/rules';
  import type { GameState, Hex, ProgramPreview } from '@game/rules';
  import type { Order } from '@game/shared';
  import { onDestroy } from 'svelte';
  import type { GameClient, GameView } from '../gameClient.js';
  import type { UiState, UiStore } from './ui.js';
  import type { Playback } from './playback.js';
  import { Camera } from './camera.js';
  import { loadTextures, playerColor } from './textures.js';
  import type { GameTextures } from './textures.js';
  import { HEX_SIZE, hexesInRect, mapBounds, screenToHex, poseVueVillePour, hexSousEcranVueVille } from './hexView.js';
  import type { PoseVueVille } from './hexView.js';
  import { arrowHeadPoints, dashSegments, segmentsOf } from './arrows.js';
  import type { Point } from './arrows.js';
  import { BADGE_FONDATION, etatFondationColon } from './fondation.js';
  import { BADGE_POPULATION } from './badge-population.js';
  import { iconeCommerceRendement } from './rendements.js';
  import { arretProchaineResolution, arriveeSurEnnemi, arriveesPartagees, clickAction, clickActionVueVille, creeCacheChemins, dispositionsCohabitation, effectiveWorkedTiles, jalonsDeTours, myEngineId, ordersEditable, pilesAffichees, positionAfficheeDe as positionAfficheeDeEtat } from './interaction.js';
  // CALIBRATION-UNITES : hauteur des unités seules (calibre guerrier Recraft),
  // constantes 🔶 éditables à l'œil dans calibration-unites.ts.
  import { PIEDS_Y, echelleUnite, hauteurUnitePx, AJUST_HAUTEUR } from './calibration-unites.js';
  import type { PositionsAffichees } from './interaction.js';
  import type { ClickAction } from './interaction.js';
  // Chantier V1 (L3) — couche hybride : terrain Three.js + sprites PixiJS
  // projetés (option B du spike), derrière un flag de repli (défaut : 2D).
  import { Stage3D } from '../render3d/stage3d.js';
  import { TerrainWorld, mapBoundsWorld, pickHex3D, hexWorldPos, hexAtWorld } from '../render3d/world3d.js';
  import type { TileDraw } from '../render3d/world3d.js';
  import { elevationDe } from '../render3d/optionA.js';
  import { contexteRendement, allumeDe } from '../render3d/rendement.js';
  import type { ContexteRendement } from '../render3d/rendement.js';
  // Chantier V2 — structures 3D : Mainframe des villes, cartes-ressources en
  // slots, cratère, huttes/villages barbares (les unités restent des sprites).
  import { StructuresWorld, planifierStructures, detailsPools } from '../render3d/structures3d.js';
  import type { PlanStructures } from '../render3d/structures3d.js';
  // Chantier V2-unités3D — assemblage PARTAGÉ du calque unités (miroir Lab3d,
  // catalogue data-driven : unités à modèle 3D, autres types en sprite).
  import { aModele3D, unitesStructures, unitesGLBStructures } from '../render3d/unites3d.js';
  // Fonderie T3 — calque des unités à modèle .glb (chargement en cache,
  // teinte joueur par propriétaire, instancing ; cf. unitesglb.ts).
  import { ChargeurModelesGLB, UnitesGLBWorld } from '../render3d/unitesglb.js';
  import { MODELES_UNITES3D, VILLE3D, VILLAGE_BARBARE3D, HUTTE_TRIPO3D, TUILE_PRAIRIE3D, TUILE_PLAINE3D, TUILE_PLAINE_GRENIER3D, TUILE_MONTAGNE3D, TUILE_COLLINE3D } from '../render3d/spec3d.js';
  // VILLE-TRIPO T2 — entrée .glb d'une ville (même format que le catalogue unités).
  import type { UniteGLBEntree } from '../render3d/unites3d.js';
  // TRAVAIL-VILLE-3D — contours en vraie 3D : cadres des cases travaillées +
  // rayon de cultivation, posés sur le relief (géométrie pure dans contours.ts).
  import { contourHexTile, contourRegion, contourUnion } from '../render3d/contours.js';
  import type { PointContour } from '../render3d/contours.js';
  import { Marqueurs3D } from '../render3d/marqueurs3d.js';
  import type { ContourDef } from '../render3d/marqueurs3d.js';

  interface Props {
    client: GameClient;
    ui: UiStore;
    playback: Playback;
    /** Décision de clic pur résolue par la page (ordres, sélection). */
    onAction(action: ClickAction): void;
    /** Clic droit (Phase 5 L1) : hex visée — la page décide (chemin ou annulation). */
    onRightClick(hex: Hex): void;
    /** Soumission clavier (Entrée) d'un brouillon — optionnel depuis la soumission auto (Phase 5 L1). */
    onConfirmDraft?(): void;
    onCancelDraft(): void;
    onReady?(api: { centerOnHex(hex: Hex): void; centerOnUnit(unitId: string): void }): void;
    /** Signal d'activité du playback (bannière « Relecture » côté page). */
    onPlaybackActive?(active: boolean): void;
    /** Phase 6 L3 : overlay des rendements N/P/C (bouton de bascule). */
    showYields?: boolean;
    /** Phase 7b : masquer villes et armées pour lire les rendements (cycle 3 états). */
    hideEntities?: boolean;
    /** Phase 6b (labo #/progen) : heatmap de fertilité — score par clé "q,r",
     *  dessiné en teinte verte (riche) → rouge (pauvre). Optionnel : absent du
     *  jeu réel, fourni uniquement par le labo de calibrage. */
    fertilityHeatmap?: Record<string, number> | null;
    /** SPAWN-START (labo #/progen) : zone de garantie des départs — anneaux 1
     *  et 2 des spawns, clés "q,r" ; absent du jeu réel. */
    spawnGuarantee?: { ring1: string[]; ring2: string[] } | null;
    /** Chantier V1 (L3) : terrain en vraie 3D (option B hybride) — flag de
     *  repli, DÉFAUT FAUX (rendu 2D conservé jusqu'à l'acceptation d'Erik). */
    mode3d?: boolean;
    /** MENU-VILLE : id de la ville affichée en vue inclinée (null = carte). */
    vueVilleId?: string | null;
    /** MENU-VILLE : double-clic sur une ville du joueur → entrée en vue ville. */
    onEnterVueVille?(cityId: string): void;
    /** MENU-VILLE : sortie demandée par le canvas (Échap / double-clic hors ville). */
    onExitVueVille?(): void;
  }

  let {
    client,
    ui,
    playback,
    onAction,
    onRightClick,
    onConfirmDraft,
    onCancelDraft,
    onReady,
    onPlaybackActive,
    showYields = false,
    hideEntities = false,
    fertilityHeatmap = null,
    spawnGuarantee = null,
    mode3d = false,
    vueVilleId = null,
    onEnterVueVille,
    onExitVueVille,
  }: Props = $props();

  // La bascule de l'overlay de rendements reconstruit la surcouche ; le
  // masquage des entités (Phase 7b) ne fait que cacher la couche (réversible,
  // sans reconstruction). Idem pour la heatmap du labo (Phase 6b).
  $effect(() => {
    void showYields;
    overlayDirty = true;
  });
  $effect(() => {
    void fertilityHeatmap;
    overlayDirty = true;
  });
  $effect(() => {
    void spawnGuarantee;
    overlayDirty = true;
  });
  $effect(() => {
    entitiesLayer.visible = !hideEntities;
    // V2 : en mode « lecture des rendements », les structures 3D suivent les
    // entités (le Mainframe est une ville — masqué avec elles).
    if (structures3d) structures3d.group.visible = !hideEntities;
  });

  let host: HTMLDivElement;

  // ---------------------------------------------------------------------
  // Scène (dernier état connu, poussé par les stores Svelte)
  // ---------------------------------------------------------------------

  interface Scene {
    view: GameView | null;
    state: GameState | null;
    myId: string | null;
    explored: Set<string>;
    visible: Set<string>;
    orders: Order[];
    ui: UiState;
  }

  const scene: Scene = { view: null, state: null, myId: null, explored: new Set(), visible: new Set(), orders: [], ui: { selectedUnitId: null, selectedCityId: null, draft: null } };

  // ---------------------------------------------------------------------
  // PixiJS
  // ---------------------------------------------------------------------

  let app: Application | null = null;
  let textures: GameTextures | null = null;
  let world = new Container();
  let tilesLayer = new Container();
  let resourceLayer = new Container(); // R-91 : icônes de ressources sur les cases
  let overlayLayer = new Container();
  let entitiesLayer = new Container();
  // CALIBRATION-UNITES : tri par zIndex — profondeur des unités empilées
  // dans une zone de cohabitation (première unité au premier plan).
  entitiesLayer.sortableChildren = true;
  let effectsLayer = new Container();
  const camera = new Camera();
  let vw = 1;
  let vh = 1;

  const tileSprites = new Map<string, Sprite>();
  const resourceSprites = new Map<string, Sprite>();
  const unitSprites = new Map<string, Container>();
  const citySprites = new Map<string, Container>();
  // R-96/R-98 (Phase 7d) : villages barbares et huttes bonus.
  const villageSprites = new Map<string, Container>();
  const hutSprites = new Map<string, Container>();
  // 7o · R-153 : artefacts (reliques) explorés — même traitement de fog.
  const artefactSprites = new Map<string, Container>();
  /** 7o · R-155 : lueur de survol (ping de présence sous le brouillard 🔶). */
  let artefactPingGlow: Graphics | null = null;

  let tilesDirty = true;
  let entitiesDirty = true;
  let overlayDirty = true;
  let cameraChanged = true;
  let centered = false;
  let disposed = false;
  let bounds = { x: 0, y: 0, w: 1, h: 1 };

  const unsubscribes: Array<() => void> = [];
  let resizeObserver: ResizeObserver | null = null;
  let rafId = 0;
  let fallbackInterval: ReturnType<typeof setInterval> | null = null;

  // ---------------------------------------------------------------------
  // MENU-VILLE — vue ville (retour d'Erik du 13/09 v2 : ZOOM À PLAT)
  // Le conteneur monde est zoomé sur la ville, à l'échelle qui fait tenir
  // TOUTES les tuiles cultivables (6/18) dans l'espace libre à gauche du
  // panneau de ville. Entrée/sortie ANIMÉES ; pendant la vue, la pose est
  // statique (aucun recalcul par frame) et le picking passe par la
  // transform inverse (jamais les maths écran brutes).
  // ---------------------------------------------------------------------
  let vuePose: PoseVueVille | null = null;
  let vueAnim: { from: PoseVueVille; to: PoseVueVille; t: number; entree: boolean } | null = null;
  /** Durée des animations d'entrée/sortie (ms). 🔶 calibrage à l'œil. */
  const VUE_VILLE_DUREE = 450;

  const vueVilleActif = (): boolean => vuePose !== null || vueAnim !== null;

  const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function interpolePose(a: PoseVueVille, b: PoseVueVille, t: number): PoseVueVille {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      scale: a.scale + (b.scale - a.scale) * t,
    };
  }

  /** Pose courante du conteneur monde (vue ville animée ou statique, sinon caméra). */
  function poseVueCourante(): PoseVueVille {
    if (vueAnim) return interpolePose(vueAnim.from, vueAnim.to, easeInOut(vueAnim.t));
    if (vuePose) return vuePose;
    return { x: camera.x, y: camera.y, scale: camera.scale };
  }

  function appliquerPoseVue(p: PoseVueVille): void {
    world.scale.set(p.scale);
    world.position.set(p.x, p.y);
  }

  // La bascule du store `vueVilleId` (page) pilote l'animation d'entrée/sortie.
  /** Pose CIBLE de la vue ville pour la ville courante et les dimensions
   *  ACTUELLES du canvas (recalculée au redimensionnement — la ville doit
   *  rester centrée dans l'espace libre, retour d'Erik du 13/09). */
  function poseVueVilleCible(): PoseVueVille | null {
    if (!vueVilleId || !scene.state) return null;
    const city = scene.state.cities[vueVilleId];
    if (!city) return null;
    const p = hexToPixel(city, HEX_SIZE);
    // CORRECTIFS-VUE-VILLE : dimensions LUES SUR LE DOM, jamais les dernières
    // valeurs du ResizeObserver — l'échelle doit être calculée sur l'espace
    // réellement disponible (le masquage de la colonne de droite et le
    // redimensionnement de la fenêtre doivent se voir immédiatement, même si
    // l'observateur n'a pas encore délivré — piége viewport PILOT-HANDOFF §5).
    const w = Math.max(1, host?.clientWidth || vw);
    const h = Math.max(1, host?.clientHeight || vh);
    if (w !== vw || h !== vh) {
      vw = w;
      vh = h;
      app?.renderer.resize(w, h);
      stage3d?.resize(w, h);
    }
    // Retours d'Erik (19/09) : le double-clic doit montrer ENTIÈREMENT les
    // tuiles jusqu'à la DISTANCE 2 au minimum — le prochain anneau cultivable
    // (frontière culturelle en expansion) doit rester visible pour prévoir —
    // et davantage si la frontière dessinée dépasse (frontierRadius).
    const rayonAffiche = Math.max(
      2,
      frontierRadius(workRadiusOf(city.buildings), rayonCulturelDe(city.cultureCumulee)),
    );
    return poseVueVillePour(p.x, p.y, w, h, HEX_SIZE, rayonAffiche);
  }

  $effect(() => {
    void vueVilleId;
    if (!app) return;
    if (vueVilleId) {
      const to = poseVueVilleCible();
      if (!to) return;
      const from = poseVueCourante();
      vueAnim = { from, to, t: 0, entree: true };
      if (hoverHex) effacerSurvol();
      tilesDirty = true; // le rect de culling suit la pose de vue ville
      entitiesDirty = true; // MENU-VILLE : les unités se masquent
    } else if (vuePose !== null || (vueAnim?.entree ?? false)) {
      const from = poseVueCourante();
      vuePose = null;
      vueAnim = { from, to: { x: camera.x, y: camera.y, scale: camera.scale }, t: 0, entree: false };
      tilesDirty = true;
      entitiesDirty = true; // MENU-VILLE : les unités réapparaissent
    }
  });

  // --- Chantier V1 (L3) : couche 3D hybride (terrain Three.js en fond, les
  // entités/surcouche PixiJS restent projetées par la caméra 3D partagée). ---
  let stage3d: Stage3D | null = null;
  let terrain3d: TerrainWorld | null = null;
  let structures3d: StructuresWorld | null = null;
  // Fonderie T3 : calque des unités à modèle .glb (pools instanciés séparés —
  // les géométries/matériaux sont chargés une fois par fichier).
  let unitesGlb: UnitesGLBWorld | null = null;
  // VILLE-TRIPO T2 : calque .glb des VILLES (même pipeline que les unités —
  // cache, fusion, teinte accent_joueur par propriétaire). Null tant que
  // visuel3d.json §structures.ville3d ne pointe pas un .glb (fallback Mainframe).
  let villesGlb: UnitesGLBWorld | null = null;
  // VILLAGE barbare (asset Tripo, 08/09) : même mécanique — SANS teinte (le
  // .glb n'a pas de matériau accent_joueur, ses couleurs d'origine tiennent).
  let villagesGlb: UnitesGLBWorld | null = null;
  // HUTTE (asset Tripo, 08/09) : idem — couleurs d'origine, sans teinte.
  let huttesGlb: UnitesGLBWorld | null = null;
  // TUILE prairie (asset Tripo, 08/09) : recouvrement du prisme procédural —
  // capacité large (1 instance par tuile prairie, jusqu'à ~1600 sur 40×40).
  // Sert aussi la variante PLAINE grenier (bus central allumé, côtés cuivre).
  let prairiesGlb: UnitesGLBWorld | null = null;
  // TRAVAIL-VILLE-3D : contours 3D (worked tiles + rayon de cultivation).
  let marqueurs3d: Marqueurs3D | null = null;
  let canvas3d: HTMLCanvasElement | null = null;
  let rendement: ContexteRendement | null = null;
  /** Dernier plan de structures (détail par pool — hook de vérification dev). */
  let dernierPlanStructures: PlanStructures | null = null;
  /** CORRECTIFS-SELECTION : dernières entrées .glb (positions optimistes — debug). */
  let dernierPlanGlb: Array<{ id: string; q: number; r: number }> = [];
  /** 3D actif = flag du parent ET moteur 3D monté (setup réussi). */
  const mode3dActif = (): boolean => mode3d && !!stage3d && !!terrain3d;
  /**
   * Positionne un enfant de couche en coordonnées MONDE (px moteur) et
   * l'« estampe » pour la reprojection 3D par frame (`__wx/__wy/__ws`). En 2D
   * le conteneur `world` porte la caméra — l'estampille est simplement ignorée.
   */
  function poser3d(c: Container, x: number, y: number): void {
    c.position.set(x, y);
    const t = c as Container & { __wx?: number; __wy?: number; __ws?: number };
    t.__wx = x;
    t.__wy = y;
    // Échelle INTRINSÈQUE, estampillée UNE FOIS : la relire depuis c.scale
    // après une projection la multiplierait par le facteur de zoom 3D à chaque
    // restampillage (rebuild sur vue poussée, frames de playback) — les
    // sprites grossissaient/diminuaient de façon composée (k, k², k³…).
    if (t.__ws === undefined) t.__ws = c.scale.x;
  }
  /** Géométrie « absolue » (flèches, chemins) tracée en coordonnées monde —
   *  redessinée in-place à chaque frame en 3D depuis ces points. */
  interface Suivi3D {
    points: Point[];
    width: number;
    color: number;
    alpha: number;
    dashed?: boolean;
    tete?: boolean;
    pastille?: boolean;
  }
  type Suivable = Graphics & { __suivi3d?: Suivi3D };

  function onNewView(v: GameView): void {
    scene.view = v;
    scene.state = v.state;
    scene.myId = myEngineId(v);
    scene.orders = v.orders;
    // FLECHE-MOUVEMENT : le pathfinding de survol est caché PAR VUE — un
    // nouvel état (unités déplacées, fog évolué) purge le cache.
    hoverCache.purge();
    // CORRECTIFS-SELECTION : l'aperçu est calculé à chaque vue poussée — il
    // alimente la ligne de cheminement ET la position optimiste des unités.
    scenePreviews = scene.myId ? previewPrograms(v.state!, { [scene.myId]: v.orders }) : [];
    const vision = v.state && scene.myId ? v.state.players[scene.myId]?.vision : undefined;
    scene.explored = new Set(vision?.explored ?? []);
    scene.visible = new Set(vision?.visible ?? []);
    // Bornes du monde : connues seulement à l'arrivée du premier état.
    if (v.state) {
      bounds = mapBounds(HEX_SIZE, v.state.mapWidth, v.state.mapHeight);
      camera.clamp(bounds, vw, vh);
      if (stage3d) stage3d.cam.bounds = mapBoundsWorld(v.state.mapWidth, v.state.mapHeight);
    }
    if (v.state && mode3d) rendement = contexteRendement(v.state, scene.myId);
    tilesDirty = true;
    entitiesDirty = true;
    overlayDirty = true;
    cameraChanged = true;
    maybeCenter();
  }

  function onNewUi(u: UiState): void {
    scene.ui = u;
    overlayDirty = true;
    // FLECHE-MOUVEMENT : changement de sélection → la flèche de survol
    // reflète immédiatement la nouvelle unité (ou disparaît), sans attendre
    // un mouvement du curseur.
    if (hoverHex) {
      const hex = hoverHex;
      hoverHex = null;
      recalculerSurvol(hex);
    }
  }

  function maybeCenter(): void {
    if (centered || !app || !scene.state || !scene.myId) return;
    const myCities = Object.values(scene.state.cities).filter((c) => c.owner === scene.myId);
    const myUnits = Object.values(scene.state.units).filter((u) => u.owner === scene.myId);
    const focus = myCities[0] ?? myUnits[0];
    if (!focus) return;
    centered = true;
    if (mode3dActif()) {
      const { x, z } = hexWorldPos(focus);
      stage3d!.cam.centerOn(x, z);
      stage3d!.cam.clamp(vw, vh);
    } else {
      camera.centerOn(hexToPixel(focus, HEX_SIZE).x, hexToPixel(focus, HEX_SIZE).y, vw, vh);
      camera.clamp(bounds, vw, vh);
    }
    cameraChanged = true;
  }

  // ---------------------------------------------------------------------
  // Reconstruction des couches
  // ---------------------------------------------------------------------

  function rebuildTiles(): void {
    if (!app || !textures || !scene.state) return;
    const { mapWidth, mapHeight, map } = scene.state;
    // Rect de culling : caméra 2D normale, ou transform inverse de la pose de
    // vue ville (MENU-VILLE — zoom à plat).
    const pose = poseVueCourante();
    const rect =
      vueVilleActif()
        ? {
            x: -pose.x / pose.scale,
            y: -pose.y / pose.scale,
            w: vw / pose.scale,
            h: vh / pose.scale,
          }
        : camera.worldRect(vw, vh);
    rect.x -= HEX_SIZE * 1.5;
    rect.y -= HEX_SIZE * 1.5;
    rect.w += HEX_SIZE * 3;
    rect.h += HEX_SIZE * 3;

    const wanted = new Set<string>();
    const wantedResources = new Set<string>();
    for (const hex of hexesInRect(rect, HEX_SIZE, mapWidth, mapHeight)) {
      const key = tileKeyOf(hex);
      const tile = map[key];
      if (!tile) continue; // inexploré : AUCUN rendu (§4.4)
      wanted.add(key);
      let sprite = tileSprites.get(key);
      if (!sprite) {
        sprite = new Sprite(textures.tiles[tile.terrain]);
        sprite.anchor.set(0.5, 0.5);
        sprite.scale.set(0.5);
        const p = hexToPixel(hex, HEX_SIZE);
        sprite.position.set(p.x, p.y);
        tilesLayer.addChild(sprite);
        tileSprites.set(key, sprite);
      } else if (sprite.texture !== textures.tiles[tile.terrain]) {
        sprite.texture = textures.tiles[tile.terrain];
      }
      // Brouillard : visible = couleurs ; exploré-masqué = teinte atténuée.
      const target = scene.visible.has(key) ? 0xffffff : 0x70707e;
      if (sprite.tint !== target) sprite.tint = target;

      // R-91/Phase 7c : la ressource d'une case explorée est dessinée sur la
      // case, comme du décor persistant (CivRev). R-92 (D1 révisée) : l'état
      // filtré diffuse l'id réel si l'identité est connue, ou le marqueur
      // « inconnue » (icône « ? ») tant que la tech manque — la présence est
      // toujours visible, jamais l'identité masquée.
      if (tile.resource && textures.resources[tile.resource]) {
        wantedResources.add(key);
        let res = resourceSprites.get(key);
        if (!res) {
          res = new Sprite(textures.resources[tile.resource]!);
          res.anchor.set(0.5, 0.5);
          res.scale.set(0.62);
          res.position.copyFrom(sprite.position);
          res.y -= 6;
          resourceLayer.addChild(res);
          resourceSprites.set(key, res);
        }
        if (res.tint !== target) res.tint = target;
      }
    }
    // Culling : destruction des cases sorties du viewport (exigence Phase 3).
    for (const [key, sprite] of tileSprites) {
      if (!wanted.has(key)) {
        sprite.destroy();
        tileSprites.delete(key);
      }
    }
    for (const [key, sprite] of resourceSprites) {
      if (!wantedResources.has(key)) {
        sprite.destroy();
        resourceSprites.delete(key);
      }
    }
  }

  function rebuildEntities(): void {
    if (!app || !textures || !scene.state) return;
    const state = scene.state;
    // V2 : en 3D, le Mainframe remplace le marqueur 2D des villes et les
    // structures 3D remplacent huttes/villages (sprites base/accent cachés ;
    // les infos UI — pop, barre de production, PV — restent projetées).
    const structures3dActives = mode3dActif();
    // ARRIVEE-ENNEMIE : une unité dont l'arrêt de la prochaine résolution
    // porte un ennemi visible n'est PAS affichée optimistement sur sa
    // destination (elle masquerait l'ennemi) — le sprite réel reste à sa
    // position moteur, le fantôme translucide (rebuildOverlay) montre
    // l'arrivée décalée au bord de l'hexagone.
    // PILE-AFFICHÉE (retour Erik 17/09) : positions DESSINÉES (positionsDessinees
    // exclut déjà les arrivées sur ennemi) + indices de cohabitation — les
    // unités partageant une case affichée sont réduites et décalées.
    const positions = positionsDessinees();
    // CALIBRATION-UNITES : poses de cohabitation GROUPÉES PAR NATION (une
    // ligne par unité ; remplace l'éventail par indice de PILE-AFFICHÉE).
    const poses = dispositionsCohabitation(state, positions);
    // COLON-FONDATION (M1) : dérivation de l'aperçu DÉJÀ calculé
    // (scenePreviews — ordre posé et chemin gelé compris), jamais recalculée
    // par frame. Annulation comme consommation font tomber l'aperçu, donc
    // l'état visuel, sans aucune purge dédiée (miroir du moteur).
    const fondateurs = scene.myId ? fondateursDe(scenePreviews, scene.myId) : new Set<string>();
    const seenUnits = new Set<string>();
    // MENU-VILLE (retour d'Erik) : en vue ville, les UNITÉS disparaissent —
    // concentration sur la gestion de la ville ; elles reviennent en vue carte.
    // (Villes, huttes et villages restent des entités de carte.)
    for (const [, c] of unitSprites) c.visible = !vueVilleActif();
    for (const unit of Object.values(state.units)) {
      // 7g · R-117 : une unité EMBARQUÉE n'est pas rendue (elle est dans le
      // navire — visible via le panneau du transport, indicateur de charge).
      if (unit.aboard) continue;
      const key = tileKeyOf(unit);
      if (!scene.visible.has(key)) continue; // ennemi hors vision : absent de l'état de toute façon
      seenUnits.add(unit.id);
      let c = unitSprites.get(unit.id);
      if (!c) {
        c = buildUnitContainer(unit.id, unit.type, unit.owner);
        entitiesLayer.addChild(c);
        unitSprites.set(unit.id, c);
      }
      // V2-unités3D : une unité AVEC modèle 3D masque son sprite d'art (le
      // modèle 3D est le rendu) mais le conteneur projeté reste — barre de PV,
      // fortification, cargo, badge espion suivent. Sans modèle : sprite 2D.
      const en3d = structures3dActives && aModele3D(unit.type, unit.owner);
      // COLON-FONDATION (M2) : état « en train de fonder » — décision pure
      // (fondation.ts) alimentée par l'aperçu DÉJÀ calculé (scenePreviews —
      // ordre posé et chemin gelé compris), jamais recalculée par frame.
      // Annulation comme consommation font tomber l'aperçu, donc l'état
      // visuel, sans aucune purge dédiée (miroir du moteur).
      const fondation = etatFondationColon({
        type: unit.type,
        unitId: unit.id,
        fondateurs,
        artPresent: !!textures.colonFondation,
        modele3d: en3d,
      });
      const baseU = c.getChildByLabel('base');
      const accentU = c.getChildByLabel('accent');
      if (baseU) baseU.visible = !en3d && !fondation.art;
      if (accentU) accentU.visible = !en3d && !fondation.art;
      const fondBase = c.getChildByLabel('fondBase') as Sprite | null;
      const fondAccent = c.getChildByLabel('fondAccent') as Sprite | null;
      if (fondBase) fondBase.visible = fondation.art;
      if (fondAccent) fondAccent.visible = fondation.art;
      const fondBadge = c.getChildByLabel('fondBadge');
      if (fondBadge) fondBadge.visible = fondation.badge;
      // CORRECTIFS-SELECTION : l'unité programmée est affichée À SA DESTINATION
      // (position optimiste — comme si le déplacement avait eu lieu) ; sans
      // ordre, elle reste sur sa case moteur. Pendant le playback, l'inter-
      // polation prime (bloc « playback.active » du tick).
      // PILE-AFFICHÉE : cohabitation visuelle — CALIBRATION-UNITES (retour
      // Erik 20/09) : paquets COMPACTS PAR NATION, répartition déterministe
      // dans l'hexagone (dispositionsCohabitation, interaction.ts — pur, testé).
      const posee = positions.get(unit.id) ?? unit;
      const disp = poses.get(unit.id) ?? { dx: 0, dy: 0, echelle: 1, z: 0 };
      c.scale.set(disp.echelle);
      // CALIBRATION-UNITES : profondeur dans le paquet — la première unité
      // d'une zone reste au premier plan, les suivantes passent derrière
      // (z négatif, tri du layer, cf. dispositionCohabitationParNation).
      c.zIndex = disp.z;
      const p = hexToPixel(posee, HEX_SIZE);
      const anim = playback.moveOf(unit.id);
      if (anim) {
        // poser3d et non position.set : le tampon monde (__wx/__wy) doit
        // toujours exister, sinon la reprojection 3D ignore l'enfant
        // (continue) et le sprite reste à ses px bruts = hors champ.
        const a = hexToPixel(anim.from, HEX_SIZE);
        const b = hexToPixel(anim.to, HEX_SIZE);
        poser3d(c, a.x + (b.x - a.x) * anim.t + disp.dx * HEX_SIZE, a.y + (b.y - a.y) * anim.t + disp.dy * HEX_SIZE);
      } else {
        poser3d(c, p.x + disp.dx * HEX_SIZE, p.y + disp.dy * HEX_SIZE);
      }
      // PV (override de combat pendant le playback).
      const hp = playback.hpOf(unit.id, unit.hp);
      const ratio = Math.max(0, Math.min(1, hp / unitType(unit.type).hpMax));
      // PROTO-3-VIES : un compartiment par vie — chaque cellule est pleine
      // si sa vie est acquise, partiellement remplie pour la vie en cours.
      const largeurCellule = 70 / 3; // même géométrie que la création (76 − 2 encoches de 3)
      for (let i = 0; i < 3; i++) {
        const fill = c.getChildByLabel(`hpFill${i}`) as Sprite | null;
        if (!fill) continue;
        const cellule = Math.max(0, Math.min(1, ratio * 3 - i));
        fill.width = largeurCellule * cellule;
        // CALIBRATION-UNITES (retour Erik 20/09) : couleur d'accent du joueur.
        fill.tint = playerColor(unit.owner);
        fill.visible = cellule > 0;
      }
      // Marqueur écu de fortification (R-33).
      const shield = c.getChildByLabel('fortify');
      if (shield) shield.visible = unit.fortified === true;
      // 7g · R-117 : indicateur de charge du transport.
      const cargoDot = c.getChildByLabel('cargo');
      if (cargoDot) cargoDot.visible = unit.cargo != null;
      // 7m · R-142/R-144 : badge espion en ville (garnison ou infiltration).
      const spyBadge = c.getChildByLabel('spybadge');
      if (spyBadge) {
        spyBadge.visible =
          unitType(unit.type).spy === true &&
          Object.values(state.cities).some((c) => c.q === unit.q && c.r === unit.r);
      }
    }
    for (const [id, c] of unitSprites) {
      if (!seenUnits.has(id)) {
        c.destroy({ children: true });
        unitSprites.delete(id);
      }
    }

    // ENGAGEMENT (R-173) : le drapeau d'empilement est RETIRÉ du rendu —
    // l'empilement n'est plus un régime : les cohabitations (instables) sont
    // résolues par la mêlée de Phase E et l'expulsion de cohabitation.

    const seenCities = new Set<string>();
    for (const city of Object.values(state.cities)) {
      if (!scene.visible.has(tileKeyOf(city))) continue;
      seenCities.add(city.id);
      let c = citySprites.get(city.id);
      if (!c) {
        c = buildCityContainer(city.id, city.capital, city.owner);
        c.zIndex = 50; // structures au-dessus des unités empilées (tri CALIBRATION-UNITES)
        entitiesLayer.addChild(c);
        citySprites.set(city.id, c);
      }
      const p = hexToPixel(city, HEX_SIZE);
      poser3d(c, p.x, p.y);
      const base2d = c.getChildByLabel('base');
      const accent2d = c.getChildByLabel('accent');
      if (base2d) base2d.visible = !structures3dActives;
      if (accent2d) accent2d.visible = !structures3dActives;
      // Progression de production (R-62) : barre or + pop.
      const prodFill = c.getChildByLabel('prodFill') as Sprite;
      const popText = c.getChildByLabel('pop') as Text;
      if (city.production) {
        // Coût selon le type d'item (unité ou bâtiment — R-66, Phase 6).
        const item = city.production.item;
        const cost = item.kind === 'unit' ? unitType(item.id).cost : (BUILDINGS[item.id]?.cost ?? Infinity);
        prodFill.visible = true;
        prodFill.width = 76 * Math.max(0.04, Math.min(1, city.production.progress / cost));
      } else {
        prodFill.visible = false;
      }
      popText.text = String(city.pop);
    }
    for (const [id, c] of citySprites) {
      if (!seenCities.has(id)) {
        c.destroy({ children: true });
        citySprites.delete(id);
      }
    }

    // R-96 (Phase 7d) : villages barbares — entités ennemies statiques,
    // diffusées dès que la case est explorée (fog). Teinte atténuée hors du
    // champ visible courant, comme les cases.
    const seenVillages = new Set<string>();
    for (const village of state.villages) {
      const key = tileKeyOf(village);
      seenVillages.add(village.id);
      let c = villageSprites.get(village.id);
      if (!c) {
        c = buildVillageContainer(village.id);
        c.zIndex = 50;
        entitiesLayer.addChild(c);
        villageSprites.set(village.id, c);
      }
      const p = hexToPixel(village, HEX_SIZE);
      poser3d(c, p.x, p.y);
      const baseV = c.getChildByLabel('base');
      const accentV = c.getChildByLabel('accent');
      if (baseV) baseV.visible = !structures3dActives;
      if (accentV) accentV.visible = !structures3dActives;
      const tint = scene.visible.has(key) ? 0xffffff : 0x70707e;
      const accent = c.getChildByLabel('accent') as Sprite;
      if (accent) accent.tint = tint;
      const base = c.getChildByLabel('base') as Sprite;
      if (base) base.tint = tint;
      // ENGAGEMENT : le camp n'a plus de PV — sa force se lit sur ses unités
      // (gardien au camp + satellites adjacents).
    }
    for (const [id, c] of villageSprites) {
      if (!seenVillages.has(id)) {
        c.destroy({ children: true });
        villageSprites.delete(id);
      }
    }

    // R-98 (Phase 7d) : huttes bonus — même traitement de fog que les villages.
    const seenHuts = new Set<string>();
    for (const hut of state.huts) {
      const key = tileKeyOf(hut);
      seenHuts.add(hut.id);
      let c = hutSprites.get(hut.id);
      if (!c) {
        c = buildHutContainer(hut.id);
        c.zIndex = 50;
        entitiesLayer.addChild(c);
        hutSprites.set(hut.id, c);
      }
      const p = hexToPixel(hut, HEX_SIZE);
      poser3d(c, p.x, p.y);
      const baseH = c.getChildByLabel('base');
      const accentH = c.getChildByLabel('accent');
      if (baseH) baseH.visible = !structures3dActives;
      if (accentH) accentH.visible = !structures3dActives;
      const tint = scene.visible.has(key) ? 0xffffff : 0x70707e;
      const accent = c.getChildByLabel('accent') as Sprite;
      if (accent) accent.tint = tint;
      const base = c.getChildByLabel('base') as Sprite;
      if (base) base.tint = tint;
    }
    for (const [id, c] of hutSprites) {
      if (!seenHuts.has(id)) {
        c.destroy({ children: true });
        hutSprites.delete(id);
      }
    }
    // 7o · R-153 : artefacts — visibles dès que la case est explorée (comme
    // les huttes) ; un artefact inexploré n'existe pas dans l'état filtré.
    const seenArtefacts = new Set<string>();
    for (const artefact of state.artefacts) {
      const key = tileKeyOf(artefact);
      seenArtefacts.add(artefact.id);
      let c = artefactSprites.get(artefact.id);
      if (!c) {
        c = buildArtefactContainer(artefact.artefactId);
        entitiesLayer.addChild(c);
        artefactSprites.set(artefact.id, c);
      }
      const p = hexToPixel(artefact, HEX_SIZE);
      poser3d(c, p.x, p.y);
      const tint = scene.visible.has(key) ? 0xffffff : 0x8a8a98;
      const accent = c.getChildByLabel('accent') as Sprite;
      if (accent) accent.tint = scene.visible.has(key) ? 0xffd479 : tint;
      const base = c.getChildByLabel('base') as Sprite;
      if (base) base.tint = tint;
    }
    for (const [id, c] of artefactSprites) {
      if (!seenArtefacts.has(id)) {
        c.destroy({ children: true });
        artefactSprites.delete(id);
      }
    }
  }

  function buildUnitContainer(unitId: string, type: string, owner: string): Container {
    const c = new Container();
    // R-95 (Phase 7d) : les unités barbares ont leurs propres sprites
    // (`barbare_<type>`, accent de repli = rouge sang de la palette accents.json).
    const tex =
      owner === BARBARIAN_ID
        ? (textures!.units[`barbare_${type}`] ?? textures!.units[type])
        : textures!.units[type];
    if (!tex) return c; // type d'unité sans placeholder (ne devrait pas arriver en v1)
    const color = playerColor(owner);
    // Variante CUITE par propriétaire (décision Erik 20/09 : ex. guerrier@p1,
    // rouge cuit dans le PNG par import_svg) — sprite unique SANS teinte.
    const cuite = textures!.cuites?.[`${type}@${owner}`];
    // CALIBRATION-UNITES : échelle par type — la hauteur écran vise
    // `hauteurUnitePx(HEX_SIZE)` × ajustement du type (calibre = guerrier
    // Recraft), quel que soit le ratio du PNG. Ancrage PIEDS (0.5,1)+PIEDS_Y.
    const echelle = echelleUnite(type, tex.base.height, HEX_SIZE);
    // Sommet du sprite dans le repère du conteneur (barres/écus accrochés
    // relativement — l'ancien -158/-178 supposait le sprite painter 320 px).
    const sommet = PIEDS_Y - tex.base.height * echelle;
    let base: Sprite;
    let accent: Sprite | null = null;
    if (cuite) {
      base = new Sprite(cuite.base);
      base.label = 'base';
      base.anchor.set(0.5, 1);
      base.scale.set(echelle);
      base.y = PIEDS_Y;
    } else {
      base = new Sprite(tex.base);
      base.label = 'base';
      base.anchor.set(0.5, 1);
      base.scale.set(echelle);
      base.y = PIEDS_Y;
      accent = new Sprite(tex.accent);
      accent.label = 'accent';
      accent.anchor.set(0.5, 1);
      accent.scale.set(echelle);
      accent.y = PIEDS_Y;
      accent.tint = color;
    }
    const bg = new Sprite(textures!.px);
    bg.width = 80;
    bg.height = 10;
    bg.tint = 0x1b1b22;
    // CALIBRATION-UNITES (retour Erik 20/09) : barre de PV RAPPROCHÉE —
    // collée au sommet du sprite (l'ancien écart était de 8 px au-dessus).
    bg.position.set(-40, sommet - 1);
    // PROTO-3-VIES (demande Erik 20/09) : la barre est divisée en 3
    // compartiments (1 compartiment = 1 vie, hpMax = 3 partout), séparés
    // par de fines encoches du fond. Le remplissage par compartiment est
    // piloté dans la boucle de rendu (labels hpFill0/1/2).
    const CELLULES_PV = 3;
    const INNER_W = 76;
    const ENCOche = 3;
    const largeurCellule = (INNER_W - (CELLULES_PV - 1) * ENCOche) / CELLULES_PV;
    const fills: Sprite[] = [];
    for (let i = 0; i < CELLULES_PV; i++) {
      const fill = new Sprite(textures!.px);
      fill.label = `hpFill${i}`;
      fill.width = largeurCellule;
      fill.height = 10;
      fill.position.set(-38 + i * (largeurCellule + ENCOche), sommet + 1);
      fills.push(fill);
    }
    c.addChild(base);
    if (accent) c.addChild(accent);
    c.addChild(bg, ...fills);
    // Écu de fortification (R-33) : petit bouclier bleu au-dessus du PV, caché par défaut.
    const shield = new Graphics();
    shield.label = 'fortify';
    shield.moveTo(0, sommet - 28).lineTo(12, sommet - 22).lineTo(12, sommet - 12).quadraticCurveTo(12, sommet - 2, 0, sommet + 2).quadraticCurveTo(-12, sommet - 2, -12, sommet - 12).lineTo(-12, sommet - 22).closePath().fill({ color: 0x90caf9 }).stroke({ width: 2, color: 0x1b3a5c });
    shield.visible = false;
    c.addChild(shield);
    // 7g · R-117 : indicateur de CHARGE (petit point ambré) — visible quand le
    // transport porte une unité embarquée.
    const cargoDot = new Graphics();
    cargoDot.label = 'cargo';
    cargoDot.circle(30, sommet, 7).fill({ color: 0xffcc80 }).stroke({ width: 2, color: 0x1b1b22 });
    cargoDot.visible = false;
    c.addChild(cargoDot);
    // 7m · R-142/R-144 : badge ESPION EN VILLE (œil ambré à gauche) — garnison
    // (contre-espionnage) ou infiltration, selon le propriétaire de la ville.
    const spyBadge = new Graphics();
    spyBadge.label = 'spybadge';
    spyBadge.ellipse(-30, sommet, 10, 6).fill({ color: 0xffb74d }).stroke({ width: 2, color: 0x1b1b22 });
    spyBadge.circle(-30, sommet, 3).fill({ color: 0x1b1b22 });
    spyBadge.visible = false;
    c.addChild(spyBadge);
    // COLON-FONDATION (M2) : état « en train de fonder » — slot data-driven
    // `colonFondation` du catalogue unités (art d'Erik : unite_colonFondation
    // [+_accent].png dans public/art/ ; s'affiche sans changement de code dès
    // que le PNG arrive), accent teinté joueur comme le sprite de base.
    // Tant que l'art est absent : badge provisoire (constantes 🔶) au-dessus
    // du Colon — marqueur de fondation lisible, sans effet sur le picking.
    if (type === 'colon' && textures!.colonFondation) {
      const fondEchelle = echelleUnite('colon', textures!.colonFondation.base.height, HEX_SIZE);
      const fondBase = new Sprite(textures!.colonFondation.base);
      fondBase.label = 'fondBase';
      fondBase.anchor.set(0.5, 1);
      fondBase.scale.set(fondEchelle);
      fondBase.y = PIEDS_Y;
      fondBase.visible = false;
      const fondAccent = new Sprite(textures!.colonFondation.accent);
      fondAccent.label = 'fondAccent';
      fondAccent.anchor.set(0.5, 1);
      fondAccent.scale.set(fondEchelle);
      fondAccent.y = PIEDS_Y;
      fondAccent.tint = color;
      fondAccent.visible = false;
      c.addChild(fondBase, fondAccent);
    }
    const fondBadge = new Graphics();
    fondBadge.label = 'fondBadge';
    // Losange ambre (langage des marqueurs d'ordre) sur tige : « fondation » —
    // constantes 🔶 dans fondation.ts (module pur testé).
    const BF = BADGE_FONDATION;
    fondBadge.poly(BF.losange.flat()).fill({ color: BF.remplissage }).stroke({ width: 2.5, color: BF.contour });
    fondBadge.moveTo(BF.tige.de[0], BF.tige.de[1]).lineTo(BF.tige.vers[0], BF.tige.vers[1]).stroke({ width: 3, color: BF.contour });
    fondBadge.circle(BF.tige.point[0], BF.tige.point[1], BF.tige.rayon).fill({ color: BF.point }).stroke({ width: 1.5, color: BF.contour });
    fondBadge.visible = false;
    c.addChild(fondBadge);
    c.label = unitId;
    return c;
  }

  function buildCityContainer(cityId: string, capital: boolean, owner: string): Container {
    const c = new Container();
    const tex = capital ? textures!.cities.capital : textures!.cities.settlement;
    const base = new Sprite(tex.base);
    base.label = 'base';
    base.anchor.set(0.5, 1);
    base.scale.set(0.5);
    base.y = 58;
    const accent = new Sprite(tex.accent);
    accent.label = 'accent';
    accent.anchor.set(0.5, 1);
    accent.scale.set(0.5);
    accent.y = 58;
    accent.tint = playerColor(owner);
    const prodFill = new Sprite(textures!.px);
    prodFill.label = 'prodFill';
    prodFill.height = 8;
    prodFill.tint = 0xf0c419;
    prodFill.position.set(-38, 26);
    // MENU-VILLE-RETOUCHES : badge de population SUR la case de la ville
    // (libère la tuile voisine et son icône de rendement) — constantes 🔶
    // calibrables à l'œil dans render/badge-population.ts.
    const popBg = new Graphics();
    popBg
      .circle(BADGE_POPULATION.x, BADGE_POPULATION.y, BADGE_POPULATION.rayon)
      .fill({ color: BADGE_POPULATION.remplissage, alpha: BADGE_POPULATION.alpha })
      .stroke({
        color: BADGE_POPULATION.contour.couleur,
        width: BADGE_POPULATION.contour.largeur,
        alpha: BADGE_POPULATION.contour.alpha,
      });
    const popText = new Text({
      text: '1',
      style: { fontFamily: 'system-ui, sans-serif', fontSize: BADGE_POPULATION.police, fill: 0xffffff, fontWeight: '700' },
    });
    popText.label = 'pop';
    popText.anchor.set(0.5, 0.5);
    popText.position.set(BADGE_POPULATION.x, BADGE_POPULATION.y);
    c.addChild(base, accent, prodFill, popBg, popText);
    c.label = cityId;
    return c;
  }


  /** R-96 (rév. BARBARES-PILES) : village barbare (tente/camp, accent rouge sang) — sans PV. */
  function buildVillageContainer(villageId: string): Container {
    const c = new Container();
    const tex = textures!.villageBarbare;
    const base = new Sprite(tex.base);
    base.label = 'base';
    base.anchor.set(0.5, 1);
    base.scale.set(0.5);
    base.y = 58;
    const accent = new Sprite(tex.accent);
    accent.label = 'accent';
    accent.anchor.set(0.5, 1);
    accent.scale.set(0.5);
    accent.y = 58;
    accent.tint = playerColor(BARBARIAN_ID);
    c.addChild(base, accent);
    c.label = villageId;
    return c;
  }

  /** R-98 (Phase 7d) : hutte bonus (toit doré). */
  function buildHutContainer(hutId: string): Container {
    const c = new Container();
    const tex = textures!.hutte;
    const base = new Sprite(tex.base);
    base.label = 'base';
    base.anchor.set(0.5, 1);
    base.scale.set(0.5);
    base.y = 40;
    const accent = new Sprite(tex.accent);
    accent.label = 'accent';
    accent.anchor.set(0.5, 1);
    accent.scale.set(0.5);
    accent.y = 40;
    accent.tint = 0xd9a93f; // or : appelle la récompense
    c.addChild(base, accent);
    c.label = hutId;
    return c;
  }

  /** 7o · R-153 : artefact (relique) — accent doré au rendu. */
  function buildArtefactContainer(artefactId: string): Container {
    const c = new Container();
    const tex = textures!.artefacts[artefactId] ?? textures!.hutte;
    const base = new Sprite(tex.base);
    base.label = 'base';
    base.anchor.set(0.5, 1);
    base.scale.set(0.5);
    base.y = 46;
    const accent = new Sprite(tex.accent);
    accent.label = 'accent';
    accent.anchor.set(0.5, 1);
    accent.scale.set(0.5);
    accent.y = 46;
    accent.tint = 0xffd479; // or : relique précieuse
    c.addChild(base, accent);
    c.label = artefactId;
    return c;
  }

  /** 7o · R-155 : lueur discrète au SURVOL d'une case masquée portant un
   *  artefact (ping de présence — canon du « bourdonnement », audio différé).
   *  L'identité reste cachée : la lueur seule, aucune donnée révélée. */
  function updateArtefactPing(hex: Hex, state: GameState): void {
    const hovered = state.artifactPings?.some((a) => a.q === hex.q && a.r === hex.r) ?? false;
    if (!hovered) {
      if (artefactPingGlow) artefactPingGlow.visible = false;
      return;
    }
    if (!artefactPingGlow) {
      artefactPingGlow = new Graphics();
      for (const [r, alpha] of [[52, 0.10], [38, 0.16], [26, 0.24]] as const) {
        artefactPingGlow.circle(0, 0, r).fill({ color: 0xd9a93f, alpha });
      }
      effectsLayer.addChild(artefactPingGlow);
    }
    artefactPingGlow.visible = true;
    const p = hexToPixel(hex, HEX_SIZE);
    poser3d(artefactPingGlow, p.x, p.y);
  }

  /** Surcouche : sélection, brouillon de chemin, ordres soumis, possessions. */
  function rebuildOverlay(): void {
    overlayLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    hoverG = null; // détruit avec la couche — redessiné en fin de rebuild
    if (!scene.state) return;

    // Phase 6b (labo #/progen) : heatmap de fertilité, dessinée en FOND de
    // surcouche (sous les frontières/rendements) — vert = riche, rouge = pauvre.
    if (fertilityHeatmap) {
      const values = Object.values(fertilityHeatmap);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      for (const [key, score] of Object.entries(fertilityHeatmap)) {
        if (!scene.explored.has(key)) continue;
        const [q, r] = key.split(',').map(Number);
        if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
        const t = (score - min) / span;
        const color = (Math.round(220 * (1 - t)) << 16) | (Math.round(220 * t) << 8);
        const gr = new Graphics();
        gr.poly(hexLocalPoints(HEX_SIZE - 4)).fill({ color, alpha: 0.4 });
        gr.position.copyFrom(hexToPixel({ q, r }, HEX_SIZE));
        overlayLayer.addChild(gr);
      }
    }

    // SPAWN-START (labo #/progen) : zone de garantie du départ — anneau 1
    // (voisinage forcé 2F/2P/1E + case libre) en trait plein, anneau 2 (rayon
    // sans ressource) en trait fin. Clés "q,r" calculées par la page.
    if (spawnGuarantee) {
      const drawRing = (keys: string[], color: number, width: number, inset: number, alpha: number): void => {
        for (const key of keys) {
          if (!scene.explored.has(key)) continue;
          const [q, r] = key.split(',').map(Number);
          if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
          const gr = new Graphics();
          gr.poly(hexLocalPoints(HEX_SIZE - inset)).stroke({ width, color, alpha });
          gr.position.copyFrom(hexToPixel({ q, r }, HEX_SIZE));
          overlayLayer.addChild(gr);
        }
      };
      drawRing(spawnGuarantee.ring1, 0x00b4d8, 4, 6, 0.95);
      drawRing(spawnGuarantee.ring2, 0x00b4d8, 2, 10, 0.5);
    }

    // Possession des cases de ville (frontière couleur joueur). TRAVAIL-VILLE-3D :
    // en 3D ce contour vit dans le calque Three (marqueurs3d, posé sur le relief) —
    // l'hexagone Pixi projeté resterait à plat au-dessus du plateau.
    if (!mode3dActif()) {
      for (const city of Object.values(scene.state.cities)) {
        if (!scene.explored.has(tileKeyOf(city))) continue;
        const gr = new Graphics();
        gr.poly(hexLocalPoints(HEX_SIZE - 6)).stroke({ width: 4, color: playerColor(city.owner), alpha: 0.9 });
        gr.position.copyFrom(hexToPixel(city, HEX_SIZE));
        overlayLayer.addChild(gr);
      }
    }

    // EXPANSION-CULTURELLE phase 1 (décisions Erik, VISUAL-ONLY) — RÉVISION
    // CULTURE-FRONTIERES (14/09) : la frontière progresse PALIER APRÈS PALIER.
    // Palier 0 (cumul < 10) : rien (hexagones des tuiles cultivées seuls).
    // Palier 1 (10 ≤ cumul < 100) : le LISERÉ accent joueur entoure la ZONE
    // CULTIVÉE seule — PAS de bande au-delà (frontière à rayon 1, jamais 2).
    // Palier 2 et plus : la bande d'extension s'ajoute — disque de rayon
    // frontierRadius(workRadius, paliers) = workRadius + (paliers − 1) MOINS
    // la zone cultivée — liseré + dégradé sur la frontière extérieure seule.
    // Le décalage d'un palier vit dans `frontierRadius` (packages/rules,
    // testée), pas dans le dessin. État EFFECTIF (miroir
    // `effectiveWorkedTiles`) : le contour suit le clic worked tile en temps
    // réel. Zéro gameplay (workRadius intouché) ; chevauchement de deux zones
    // hors périmètre : chaque ville dessine ses anneaux indépendamment.
    // Recalcul au rebuild seulement.
    // 🔶 Calibrage à l'œil (valeurs du calibrage ZONE-CULTIVEE du 13/09) :
    const ANNEAUX_CULTURELS = {
      epaisseurLisere: 4, // liseré extérieur (trait net)
      alphaLisere: 0.95,
      // Dégradé vers l'intérieur de la bande (palier 2+) : couches
      // concentriques du plus large (fond pâle) au plus étroit (proche du
      // bord), masquées hors de la bande (le trou de la zone cultivée ne
      // reçoit rien).
      couchesDegrade: [
        { largeur: 60, alpha: 0.1 },
        { largeur: 40, alpha: 0.17 },
        { largeur: 22, alpha: 0.28 },
      ],
    };
    if (!mode3dActif()) {
      for (const city of Object.values(scene.state.cities)) {
        if (!scene.explored.has(tileKeyOf(city))) continue;
        const color = playerColor(city.owner);
        const paliers = rayonCulturelDe(city.cultureCumulee);
        if (paliers === 0) continue; // palier 0 : hexagones des tuiles cultivées seuls
        const eff = scene.view ? effectiveWorkedTiles(scene.view, city) : { tiles: city.workedTiles };
        // Zone cultivée (centre toujours cultivé, R-60, + worked tiles
        // effectifs explorés — l'hexagone marker vit à part, même source).
        const cultivees = new Set<string>([tileKeyOf(city)]);
        for (const key of eff.tiles) {
          if (!scene.explored.has(key)) continue;
          const [q, r] = key.split(',').map(Number);
          if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
          cultivees.add(`${q},${r}`);
        }
        // Palier 1 : la bande SE CONFOND avec la zone cultivée (frontière =
        // contour de la zone, liseré seul — aucun remplissage, la zone
        // cultivée ne reçoit que ses hexagones). Palier 2+ : bande =
        // disque(frontierRadius) MOINS zone cultivée. Le décalage
        // (paliers − 1) est centralisé dans frontierRadius (règles).
        const bande: Hex[] = [];
        if (paliers === 1) {
          for (const key of cultivees) {
            const [q, r] = key.split(',').map(Number);
            if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
            bande.push({ q, r });
          }
        } else {
          const rayonCulturel = frontierRadius(workRadiusOf(city.buildings), paliers);
          for (let dq = -rayonCulturel; dq <= rayonCulturel; dq++) {
            for (let dr = Math.max(-rayonCulturel, -dq - rayonCulturel); dr <= Math.min(rayonCulturel, -dq + rayonCulturel); dr++) {
              const hex = { q: city.q + dq, r: city.r + dr };
              const key = tileKeyOf(hex);
              if (!scene.explored.has(key) || cultivees.has(key)) continue; // fog : rien n'est inventé
              bande.push(hex);
            }
          }
        }
        const boucles = contourUnion(bande, HEX_SIZE, (hex) => elevationDe(scene.state!.map[tileKeyOf(hex)]?.terrain));
        if (boucles.length === 0) continue;
        // Aire signée (shoelace) : le chaînage wall-follower longe toujours la
        // région du même côté — les boucles EXTERIEURES de la bande et ses
        // boucles de TROU (la zone cultivée) tournent en sens opposés, et la
        // plus grande aire est nécessairement extérieure (un trou est contenu
        // dans sa boucle).
        const aireSignee = (boucle: Array<{ x: number; y: number }>): number => {
          let a = 0;
          for (let i = 0; i < boucle.length - 1; i++) {
            a += boucle[i]!.x * boucle[i + 1]!.y - boucle[i + 1]!.x * boucle[i]!.y;
          }
          return a;
        };
        const aires = boucles.map(aireSignee);
        let iExt = 0;
        for (let i = 1; i < aires.length; i++) {
          if (Math.abs(aires[i]!) > Math.abs(aires[iExt]!)) iExt = i;
        }
        const sensExt = Math.sign(aires[iExt]!);
        const exterieures = boucles.filter((_, i) => Math.sign(aires[i]!) === sensExt);
        const trait = new Graphics();
        if (paliers === 1) {
          // Palier 1 : LISERÉ SEUL sur la frontière extérieure de la zone
          // cultivée (le contour qui longe un trou éventuel ne reçoit rien —
          // cohérent avec la règle « la zone cultivée ne reçoit rien »).
          tracerBoucles(trait, exterieures, { width: ANNEAUX_CULTURELS.epaisseurLisere, color, alpha: ANNEAUX_CULTURELS.alphaLisere, join: 'round' });
          overlayLayer.addChild(trait);
        } else {
          // Palier 2+ : liseré + dégradé — boucles EXTERIEURES uniquement
          // (décision Erik) ; le dégradé s'étend d'≤ 30 px vers l'intérieur
          // (case ≥ 55 px) : éteint avant la rangée adjacente aux tuiles
          // cultivées.
          for (const couche of ANNEAUX_CULTURELS.couchesDegrade) {
            tracerBoucles(trait, exterieures, { width: couche.largeur, color, alpha: couche.alpha, join: 'round' });
          }
          tracerBoucles(trait, exterieures, { width: ANNEAUX_CULTURELS.epaisseurLisere, color, alpha: ANNEAUX_CULTURELS.alphaLisere, join: 'round' });
          // Masque = la bande entière : toutes les boucles en UN SEUL
          // remplissage (règle non-zéro — les trous sont déjà inversés par le
          // chaînage) : le dégradé ne peint NI l'extérieur NI la zone cultivée.
          const masque = new Graphics();
          for (const boucle of boucles) masque.poly(boucle.map((p) => ({ x: p.x, y: p.y })));
          masque.fill(0xffffff);
          const zone = new Container();
          zone.addChild(trait);
          zone.mask = masque;
          overlayLayer.addChild(masque, zone);
        }
      }
    }

    // Cases travaillées (R-60) : marqueurs — depuis la révision en session
    // (décision Erik : aucun remplissage sur la zone cultivée), ils sont la
    // SEULE marque des tuiles cultivées sur la carte. État EFFECTIF (miroir
    // `effectiveWorkedTiles`) : apparaissent/disparaissent immédiatement au
    // clic. En 3D, les contours vivent dans le calque Three.
    if (!mode3dActif()) {
      for (const city of Object.values(scene.state.cities)) {
        if (!scene.explored.has(tileKeyOf(city))) continue;
        const eff = scene.view ? effectiveWorkedTiles(scene.view, city) : { tiles: city.workedTiles };
        const color = playerColor(city.owner);
        for (const key of eff.tiles) {
          const [q, r] = key.split(',').map(Number);
          if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
          const gr = new Graphics();
          gr.poly(hexLocalPoints(HEX_SIZE - 14)).stroke({ width: 3, color, alpha: 0.9 });
          gr.poly(hexLocalPoints(HEX_SIZE - 22)).stroke({ width: 1.5, color, alpha: 0.5 });
          gr.position.copyFrom(hexToPixel({ q, r }, HEX_SIZE));
          overlayLayer.addChild(gr);
        }
      }
      // Rayon de cultivation (TRAVAIL-VILLE-3D · M3 → ZONE-CULTIVEE) : la
      // coloration du rayon a DISPARU de la vue normale — reste un liseré
      // POINTILLÉ très discret (sans remplissage), ville sélectionnée
      // seulement : pédagogique (« ce que je peux encore cultiver ») et
      // réutilisable par le futur menu de ville. Géométrie inchangée
      // (contours.ts) ; le 3D garde son trait plein (§5 du handoff).
      const cult = bouclesCultivation();
      if (cult) {
        const gr = new Graphics();
        for (const boucle of cult.boucles) {
          const pts: Point[] = boucle.map((p) => ({ x: p.x, y: p.y }));
          for (let i = 0; i < pts.length - 1; i++) {
            for (const [a, b] of dashSegments(pts[i]!, pts[i + 1]!)) {
              gr.moveTo(a.x, a.y).lineTo(b.x, b.y);
            }
          }
        }
        gr.stroke({ width: 2.5, color: cult.color, alpha: 0.55 });
        overlayLayer.addChild(gr);
      }
    }

    // MENU-VILLE (retour d'Erik) : contour de la ZONE CULTIVABLE — le rayon
    // entier (6/18 cases + centre) ceinturé d'un trait ACCENT JOUEUR comme en
    // vue monde, légèrement plus épais, avec les pointillés sombres par-dessus
    // (style ZONE-CULTIVEE). Géométrie pure (contourUnion — contours.ts).
    if (vueVilleId && scene.state) {
      const cityVue = scene.state.cities[vueVilleId];
      if (cityVue && scene.explored.has(tileKeyOf(cityVue))) {
        const rayon = workRadiusOf(cityVue.buildings);
        const couleurVue = playerColor(cityVue.owner);
        const tuilesRayon: Hex[] = [];
        for (let dq = -rayon; dq <= rayon; dq++) {
          for (let dr = Math.max(-rayon, -dq - rayon); dr <= Math.min(rayon, -dq + rayon); dr++) {
            const hex = { q: cityVue.q + dq, r: cityVue.r + dr };
            if (!scene.explored.has(tileKeyOf(hex))) continue; // fog : rien n'est inventé
            tuilesRayon.push(hex);
            const key = tileKeyOf(hex);
            if (hex.q === cityVue.q && hex.r === cityVue.r) continue; // case de ville : pas de remplissage
            const effVue = scene.view ? effectiveWorkedTiles(scene.view, cityVue) : { tiles: cityVue.workedTiles };
            const cultiveesVue = new Set(effVue.tiles);
            const gr = new Graphics();
            gr.poly(hexLocalPoints(HEX_SIZE - 4)).fill({ color: couleurVue, alpha: cultiveesVue.has(key) ? 0.08 : 0.16 });
            gr.position.copyFrom(hexToPixel(hex, HEX_SIZE));
            overlayLayer.addChild(gr);
          }
        }
        const boucles = contourUnion(tuilesRayon, HEX_SIZE, (hex) => elevationDe(scene.state!.map[tileKeyOf(hex)]?.terrain));
        const contour = new Graphics();
        for (const boucle of boucles) {
          contour.moveTo(boucle[0]!.x, boucle[0]!.y);
          for (const p of boucle.slice(1)) contour.lineTo(p.x, p.y);
        }
        // Liseré accent joueur (plus épais qu'en vue monde : 5 px)…
        contour.stroke({ width: 5, color: couleurVue, alpha: 0.95, join: 'round' });
        // …et pointillés sombres par-dessus (style vue monde, épaissi : 3 px).
        for (const boucle of boucles) {
          const pts: Point[] = boucle.map((p) => ({ x: p.x, y: p.y }));
          for (let i = 0; i < pts.length - 1; i++) {
            for (const [a, b] of dashSegments(pts[i]!, pts[i + 1]!)) {
              contour.moveTo(a.x, a.y).lineTo(b.x, b.y);
            }
          }
        }
        contour.stroke({ width: 3, color: 0x1d242b, alpha: 0.8 });
        overlayLayer.addChild(contour);
      }
    }

    // Overlay des rendements (Phase 6 L3, masquable) : sur chaque case
    // explorée à rendements, une ligne par ressource non nulle — icône
    // (nourriture / production / commerce) + valeur générée.
    // MENU-VILLE (retour d'Erik) : en vue ville SANS le bouton Rendements, les
    // icônes de rendement ne s'affichent QUE sur les tuiles cultivables par la
    // ville affichée (son rayon de travail) — rien sur les tuiles extérieures.
    // MENU-VILLE-RETOUCHES : en vue ville, TOUT le rayon cultivable de la
    // ville affichée reflète sa conversion R-90 (icônes or/science, en temps
    // réel avec le bouton ⇄) ; en vue carte du monde, toujours l'icône
    // commerce (potentiel), quelle que soit la conversion.
    let conversionVilleVue: 'gold' | 'science' | null = null;
    let rayonVilleVue: Set<string> | null = null;
    if (vueVilleId && scene.state) {
      const cityVue = scene.state.cities[vueVilleId];
      if (cityVue && scene.explored.has(tileKeyOf(cityVue))) {
        conversionVilleVue = cityVue.conversion;
        rayonVilleVue = new Set();
        const rayon = workRadiusOf(cityVue.buildings);
        for (let dq = -rayon; dq <= rayon; dq++) {
          for (let dr = Math.max(-rayon, -dq - rayon); dr <= Math.min(rayon, -dq + rayon); dr++) {
            rayonVilleVue.add(tileKeyOf({ q: cityVue.q + dq, r: cityVue.r + dr }));
          }
        }
      }
    }
    const limiteRendements = showYields ? null : rayonVilleVue;
    // MENU-VILLE : les rendements sont affichés AUTOMATIQUEMENT en vue ville
    // (icônes de rendement sur tout le rayon cultivable, même hors assignation).
    if (showYields || vueVilleId) {
      // R-93 : le bonus de la ressource identifiée et accessible au joueur
      // s'ajoute aux rendements du terrain dans l'affichage, comme dans
      // tileYield. Le marqueur « inconnue » (R-92) n'est pas dans RESOURCES :
      // jamais de bonus affiché pour une identité masquée.
      const viewerTechs = scene.myId ? (scene.state.players[scene.myId]?.techsUnlocked ?? []) : [];
      for (const [key, tile] of Object.entries(scene.state.map)) {
        if (!scene.explored.has(key)) continue;
        if (limiteRendements && !limiteRendements.has(key)) continue; // vue ville : rayon seul
        const base = TERRAINS[tile.terrain]?.yields;
        if (!base) continue;
        let y = base;
        if (tile.resource) {
          const bonus = resourceBonus(RESOURCES[tile.resource] ?? null, viewerTechs);
          if (bonus) {
            y = {
              food: base.food + bonus.food,
              production: base.production + bonus.production,
              commerce: base.commerce + bonus.commerce,
            };
          }
        }
        const rows: Array<{ icon: Texture | null; count: number; tint: number }> = [];
        if (y.food !== 0) rows.push({ icon: textures!.yieldIcons.food, count: y.food, tint: 0xffffff });
        if (y.production !== 0) rows.push({ icon: textures!.yieldIcons.production, count: y.production, tint: 0xffffff });
        if (y.commerce !== 0) {
          // MENU-VILLE-RETOUCHES : en vue ville (rayon de la ville affichée),
          // l'icône reflète la conversion R-90 ; en vue carte, commerce.
          const dansRayonVilleVue = conversionVilleVue !== null && rayonVilleVue?.has(key);
          const icone = iconeCommerceRendement(dansRayonVilleVue ? conversionVilleVue : null);
          const icon =
            icone === 'science'
              ? textures!.yieldIcons.science
              : icone === 'or'
                ? textures!.yieldIcons.gold
                : textures!.yieldIcons.commerce;
          rows.push({ icon, count: y.commerce, tint: 0xffffff });
        }
        if (rows.length === 0) continue;
        const [q, r] = key.split(',').map(Number);
        if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
        const p = hexToPixel({ q, r }, HEX_SIZE);
        const rowH = 19;
        let rowY = p.y - ((rows.length - 1) * rowH) / 2 + HEX_SIZE * 0.38;
        for (const row of rows) {
          const text = new Text({
            text: String(row.count),
            style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fill: 0xffffff, fontWeight: '700', stroke: { color: 0x1b1b22, width: 3 } },
          });
          text.anchor.set(0, 0.5);
          text.alpha = 0.92;
          text.position.set(p.x + 4, rowY);
          overlayLayer.addChild(text);
          if (row.icon) {
            const icon = new Sprite(row.icon);
            icon.anchor.set(1, 0.5);
            icon.scale.set(0.36);
            icon.alpha = 0.95;
            icon.position.set(p.x - 1, rowY);
            overlayLayer.addChild(icon);
          }
          rowY += rowH;
        }
      }
    }

    // TRAVAIL-VILLE-3D (M2) : les marqueurs « +/− » d'attente sont SUPPRIMÉS —
    // l'état effectif (tracé ci-dessus en 2D, calque 3D dédié sinon) reflète
    // déjà la file d'ordres au clic. Les indicateurs de la file dans le
    // panneau ville restent inchangés.

    // Ordres de déplacement PERSISTANTS — CORRECTIFS-SELECTION (retour d'Erik) :
    // la ligne de cheminement (AVEC sa pointe) demeure SOUS l'unité, laquelle
    // est affichée À SA DESTINATION (position optimiste, rebuildEntities).
    // En 3D, la ligne vit dans le calque Three (marqueurs3d, posée sur le
    // relief SOUS les modèles) ; en 2D, `entitiesLayer` est au-dessus de
    // `overlayLayer` — l'ordre de dessin fait le reste.
    const solidUnits = new Set<string>();
    chemins3d = [];
    // MENU-VILLE : en vue ville, aucune surcouche de guerre (flèches, croix
    // d'attaque, cases disputées, fantômes, chemins gelés, badges) — les
    // unités sont masquées, on se concentre sur la ville.
    const vueActif = vueVilleActif();
    if (!vueActif) for (const p of scenePreviews) {
      const origin = scene.state.units[p.unitId];
      if (!origin || p.path.length === 0) continue;
      solidUnits.add(p.unitId);
      if (mode3dActif()) {
        chemins3d.push(...chemin3dDe(origin, p.path, p.final ? 0x8ce99a : 0xf0c419, 0.9));
      } else {
        drawArrow(hexToPixel(origin, HEX_SIZE), p.path, p.final ? 0x8ce99a : 0xf0c419, 0.9, false, true);
      }
      if (fondeAFinDuChemin(p) && p.destination) {
        // R-158 (D5) : marqueur de l'action finale — fondation à l'arrivée.
        const found = new Text({
          text: '⌂',
          style: { fontFamily: 'sans-serif', fontSize: 26, fill: 0x8ce99a, stroke: { color: 0x1d242b, width: 3 } },
        });
        found.anchor.set(0.5);
        found.position.copyFrom(hexToPixel(p.destination, HEX_SIZE));
        overlayLayer.addChild(found);
      }
    }
    if (!vueActif) for (const order of scene.orders) {
      if (order.type === 'Attack') {
        const gr = new Graphics();
        drawCross(gr, 18, 0xd64545);
        gr.position.copyFrom(hexToPixel(order.target, HEX_SIZE));
        overlayLayer.addChild(gr);
      }
    }
    // Cases DISPUTÉES (R-160/D1) : surlignage rouge + point de la gagnante.
    if (!vueActif) {
      const groups = new Map<string, { q: number; r: number; disputed: boolean; winner: boolean }>();
      for (const p of scenePreviews) {
        if (!p.destination || !p.disputed) continue;
        const key = `${p.destination.q},${p.destination.r}`;
        const g = groups.get(key) ?? { q: p.destination.q, r: p.destination.r, disputed: false, winner: false };
        g.disputed = true;
        g.winner = g.winner || p.disputedWinner;
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        const pos = hexToPixel(g, HEX_SIZE);
        const dis = new Graphics();
        dis.poly(hexLocalPoints(HEX_SIZE - 4)).stroke({ width: 4, color: 0xff6b6b, alpha: 0.9 });
        dis.position.copyFrom(pos);
        overlayLayer.addChild(dis);
        if (g.winner) {
          const win = new Graphics();
          win.circle(0, 0, 7).fill({ color: 0xffe082 });
          win.position.set(pos.x, pos.y - HEX_SIZE * 0.42);
          overlayLayer.addChild(win);
        }
      }
    }
    // ARRIVEE-ENNEMIE (M2/M3) : par tuile d'arrivée à ennemi visible —
    // FANTÔME unique (première unité détectée : jamais d'empilement de
    // fantômes, langage « pile ×N » de DEPLACEMENT-PLANIFIÉ), badge ×N si
    // ≥ 2 unités programmées y arrivent, anneau ROUGE sur la tuile (survol
    // et ordre posé, chemin gelé compris — scenePreviews couvre les deux).
    if (!vueActif) {
      const det = arriveesEnnemies();
      const parTuile = new Map<string, { hex: Hex; dirX: number; dirY: number; pile: number; unitId: string }>();
      for (const d of det.values()) {
        const key = tileKeyOf(d.hex);
        const deja = parTuile.get(key);
        if (deja) {
          deja.pile = Math.max(deja.pile, d.pile);
        } else {
          parTuile.set(key, { ...d });
        }
      }
      for (const d of parTuile.values()) {
        const pos = hexToPixel(d.hex, HEX_SIZE);
        // Anneau rouge : la destination est occupée par un ennemi visible.
        const anneau = new Graphics();
        anneau.poly(hexLocalPoints(HEX_SIZE - 4)).stroke({ width: 4, color: COULEUR_ARRIVEE_ENNEMIE, alpha: 0.9 });
        anneau.poly(hexLocalPoints(HEX_SIZE - 12)).stroke({ width: 1.5, color: 0x2b2620, alpha: 0.5 });
        poser3d(anneau, pos.x, pos.y);
        overlayLayer.addChild(anneau);
        // Fantôme translucide réduit, décalé vers le bord d'arrivée — posé
        // SOUS le sprite ennemi (entitiesLayer est au-dessus de l'overlay).
        dessinerFantomeArrivee(overlayLayer, d.unitId, d.hex, d.dirX, d.dirY);
        if (d.pile >= 2) {
          const badge = new Text({
            text: `×${d.pile}`,
            style: { fontFamily: 'sans-serif', fontSize: 15, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x1d242b, width: 3 } },
          });
          badge.anchor.set(0.5);
          poser3d(badge, pos.x + HEX_SIZE * 0.3, pos.y - HEX_SIZE * 0.42);
          overlayLayer.addChild(badge);
        }
      }
    }
    // Chemins gelés : reste de chemin qui s'exécutera à la prochaine
    // résolution — variante atténuée/pointillée (état déjà modélisé par
    // unit.order côté panneau). Masqué si un ordre actif remplace l'unité.
    for (const unit of Object.values(scene.state.units)) {
      if (vueActif) break; // MENU-VILLE : pas de chemins gelés en vue ville
      if (unit.owner !== scene.myId) continue;
      if (solidUnits.has(unit.id)) continue;
      if (unit.order && (unit.order.type === 'Move' || unit.order.type === 'MultiStep') && unit.order.path.length > 0) {
        const frozenPath = fogTruncate(unit.order.path, scene.myId);
        if (frozenPath.length > 0) {
          if (mode3dActif()) {
            chemins3d.push(...chemin3dDe(unit, frozenPath, 0xf0c419, 0.4));
          } else {
            drawArrow(hexToPixel(unit, HEX_SIZE), frozenPath, 0xf0c419, 0.4, true, true);
          }
        }
      }
    }

    // RAFFINEMENT-MOUVEMENT (décision d'Erik du 12/09) : badges ronds (1), (2)…
    // des tours suivants SUR LA FLÈCHE POSÉE et sur son chemin gelé —
    // projection PM par tour (1 case = 1 PM, miroir du moteur).
    if (scene.myId && !vueActif) {
      const jalonsC = new Container();
      for (const p of scenePreviews) {
        const unit = scene.state.units[p.unitId];
        if (!unit || p.path.length === 0) continue;
        for (const j of jalonsDeTours(p.path, unitType(unit.type).movement)) badgeTour(jalonsC, j.hex, j.tour, 0xf0c419);
      }
      for (const unit of Object.values(scene.state.units)) {
        if (unit.owner !== scene.myId || solidUnits.has(unit.id)) continue;
        if (unit.order && (unit.order.type === 'Move' || unit.order.type === 'MultiStep') && unit.order.path.length > 0) {
          const reste = fogTruncate(unit.order.path, scene.myId);
          for (const j of jalonsDeTours(reste, unitType(unit.type).movement)) badgeTour(jalonsC, j.hex, j.tour, 0xf0c419);
        }
      }
      overlayLayer.addChild(jalonsC);
    }

    // Brouillon de chemin en construction (L3).
    if (scene.ui.draft && scene.ui.draft.path.length > 0 && !vueActif) {
      const draft = scene.ui.draft;
      const gr = new Graphics();
      const origin = originOfDraft(draft.unitId);
      if (origin) gr.moveTo(origin.x, origin.y);
      for (const step of draft.path) {
        const p = hexToPixel(step, HEX_SIZE);
        gr.lineTo(p.x, p.y);
      }
      gr.stroke({ width: 6, color: 0xffe082, alpha: 0.75 });
      if (origin) {
        (gr as Suivable).__suivi3d = {
          points: [origin, ...draft.path.map((step) => hexToPixel(step, HEX_SIZE))],
          width: 6, color: 0xffe082, alpha: 0.75,
        };
      }
      overlayLayer.addChild(gr);
      for (const step of draft.path) {
        const dot = new Graphics();
        dot.circle(0, 0, 9).fill({ color: 0xffe082 }).stroke({ width: 3, color: 0x2b2620 });
        dot.position.copyFrom(hexToPixel(step, HEX_SIZE));
        overlayLayer.addChild(dot);
      }
    }

    // Sélection. PILE-AFFICHÉE (retour d'Erik du 17/09) : avec plusieurs
    // unités par case, entourer la CASE n'est plus intuitif — l'anneau entoure
    // l'UNITÉ (ellipse posée sous le sprite, suit son décalage/échelle de
    // pile, dessiné sous les entités). L'anneau hexagonal de CASE reste pour
    // le brouillon de chemin (marqueur de destination) et la ville sélectionnée.
    if (scene.ui.selectedUnitId && !scene.ui.draft && !mode3dActif() && !vueActif) {
      const unit = scene.state?.units[scene.ui.selectedUnitId];
      if (unit) {
        const positions = positionsDessinees();
        const posee = positions.get(unit.id) ?? unit;
        const disp = dispositionsCohabitation(scene.state!, positions).get(unit.id) ?? { dx: 0, dy: 0, echelle: 1, z: 0 };
        const c = hexToPixel(posee, HEX_SIZE);
        const gr = new Graphics();
        const rx = 52 * disp.echelle;
        const ry = 22 * disp.echelle;
        gr.ellipse(0, 6, rx, ry).stroke({ width: 5, color: 0xffe082 });
        gr.ellipse(0, 6, rx + 4, ry + 3).stroke({ width: 2, color: 0x2b2620, alpha: 0.6 });
        gr.position.set(c.x + disp.dx * HEX_SIZE, c.y + disp.dy * HEX_SIZE);
        overlayLayer.addChild(gr);
      }
    } else {
      const selectedTile: Hex | null = selectedTileOf();
      if (selectedTile && !mode3dActif() && !vueActif) {
        const gr = new Graphics();
        gr.poly(hexLocalPoints(HEX_SIZE - 8)).stroke({ width: 5, color: 0xffe082 });
        gr.poly(hexLocalPoints(HEX_SIZE - 16)).stroke({ width: 2, color: 0x2b2620, alpha: 0.6 });
        gr.position.copyFrom(hexToPixel(selectedTile, HEX_SIZE));
        overlayLayer.addChild(gr);
      }
    }

    // FLECHE-MOUVEMENT : la flèche de survol redessinée AU-DESSUS de tout
    // l'overlay (après destruction des enfants par ce rebuild).
    dessinerSurvol();
  }

  function selectedTileOf(): Hex | null {
    const state = scene.state;
    if (!state) return null;
    if (scene.ui.draft) {
      const unit = state.units[scene.ui.draft.unitId];
      const last = scene.ui.draft.path[scene.ui.draft.path.length - 1];
      return last ?? (unit ? { q: unit.q, r: unit.r } : null);
    }
    if (scene.ui.selectedUnitId) {
      const unit = state.units[scene.ui.selectedUnitId];
      // CORRECTIFS-SELECTION : l'anneau suit l'unité à sa destination optimiste.
      if (unit) return positionAfficheeDe(unit) ?? { q: unit.q, r: unit.r };
    }
    if (scene.ui.selectedCityId) {
      const city = state.cities[scene.ui.selectedCityId];
      if (city) return { q: city.q, r: city.r };
    }
    return null;
  }

  /**
   * Case → ville qui la travaille (R-90, Phase 7b) : les cases travaillées ET
   * la case de ville elle-même sont exploitées par cette ville (le centre est
   * gratuit, R-60). Sert à l'overlay de rendements pour choisir l'icône
   * or/science selon la conversion de la ville.
   */
  /** Clés des tuiles dont le substrat est REMPLACÉ par un .glb : prairies et
   *  plaines (toujours) — partagé par le calque .glb (pose de l'asset) et le
   *  terrain (masquage du substrat remplacé). */
  function clesTuilesGlb(): Set<string> {
    const out = new Set<string>();
    if (!scene.state) return out;
    for (const [key, tile] of Object.entries(scene.state.map)) {
      if (tile.terrain === 'prairie' && TUILE_PRAIRIE3D) out.add(key);
      else if (tile.terrain === 'plaine' && TUILE_PLAINE3D) out.add(key);
      else if (tile.terrain === 'montagne' && TUILE_MONTAGNE3D) out.add(key);
      else if (tile.terrain === 'colline' && TUILE_COLLINE3D) out.add(key);
    }
    return out;
  }

  function workedTileOwner(): Map<string, GameState['cities'][string]> {
    const by = new Map<string, GameState['cities'][string]>();
    if (!scene.state) return by;
    for (const city of Object.values(scene.state.cities)) {
      if (!scene.explored.has(tileKeyOf(city))) continue;
      by.set(tileKeyOf(city), city);
      for (const key of city.workedTiles) by.set(key, city);
    }
    return by;
  }

  function originOfDraft(unitId: string): { x: number; y: number } | null {
    const unit = scene.state?.units[unitId];
    return unit ? hexToPixel(unit, HEX_SIZE) : null;
  }

  /** Trace des boucles fermées du contour (PointContour) en polyline. */
  function tracerBoucles(
    gr: Graphics,
    boucles: PointContour[][],
    style: { width: number; color: number; alpha: number; join: 'round' | 'miter' | 'bevel' },
  ): void {
    for (const boucle of boucles) {
      gr.moveTo(boucle[0]!.x, boucle[0]!.y);
      for (const p of boucle.slice(1)) gr.lineTo(p.x, p.y);
    }
    gr.stroke(style);
  }

  /** Rayon de cultivation de la ville sélectionnée (TRAVAIL-VILLE-3D · M3) :
   *  boucles du contour EXTÉRIEUR (générique pour tout rayon — l'aqueduc
   *  l'étendra plus tard), couleur du propriétaire, ou null si pas de ville
   *  sélectionnée explorée. Le fog filtre la région : une case inexplorée
   *  n'entre jamais dans le contour (rien n'est inventé). */
  function bouclesCultivation(): { boucles: PointContour[][]; color: number } | null {
    const state = scene.state;
    if (!state || !scene.ui.selectedCityId) return null;
    const city = state.cities[scene.ui.selectedCityId];
    if (!city || !scene.explored.has(tileKeyOf(city))) return null;
    const rayon = workRadiusOf(city.buildings);
    const boucles = contourRegion(
      city,
      rayon,
      HEX_SIZE,
      (hex) => elevationDe(state.map[tileKeyOf(hex)]?.terrain),
    );
    return { boucles, color: playerColor(city.owner) };
  }

  /** Pousse les contours 3D (worked tiles + cultivation) dans le calque
   *  Three — appelé quand l'overlay est sale, en mode 3D uniquement. */
  function mettreAJourMarqueurs3d(): void {
    if (!marqueurs3d || !scene.state || !scene.view) return;
    marqueurs3d.resize(vw, vh);
    const contours: ContourDef[] = [];
    for (const city of Object.values(scene.state.cities)) {
      if (!scene.explored.has(tileKeyOf(city))) continue;
      // Possession de la case de ville elle-même (miroir du trait 2D, en 3D
      // posé sur le relief au lieu d'être projeté à plat).
      const elevVille = elevationDe(scene.state.map[tileKeyOf(city)]?.terrain);
      contours.push({ points: contourHexTile(city, HEX_SIZE, 6, elevVille), color: playerColor(city.owner), largeur: 4, alpha: 0.9 });
      const eff = effectiveWorkedTiles(scene.view, city);
      const color = playerColor(city.owner);
      for (const key of eff.tiles) {
        if (!scene.explored.has(key)) continue;
        const [q, r] = key.split(',').map(Number);
        if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
        const hex = { q, r };
        const elev = elevationDe(scene.state.map[tileKeyOf(hex)]?.terrain);
        contours.push({ points: contourHexTile(hex, HEX_SIZE, 14, elev), color, largeur: 3, alpha: 0.9 });
        contours.push({ points: contourHexTile(hex, HEX_SIZE, 22, elev), color, largeur: 1.5, alpha: 0.5 });
      }
    }
    const cult = bouclesCultivation();
    if (cult) {
      for (const boucle of cult.boucles) contours.push({ points: boucle, color: cult.color, largeur: 4, alpha: 0.9 });
    }
    // Anneau de SÉLECTION (unité/ville) en 3D : miroir du trait 2D (ambre +
    // liseré sombre), posé sur le relief de la case sélectionnée.
    const selection = selectedTileOf();
    if (selection && scene.explored.has(tileKeyOf(selection))) {
      const elevSel = elevationDe(scene.state.map[tileKeyOf(selection)]?.terrain);
      contours.push({ points: contourHexTile(selection, HEX_SIZE, 8, elevSel), color: 0xffe082, largeur: 5, alpha: 1 });
      contours.push({ points: contourHexTile(selection, HEX_SIZE, 16, elevSel), color: 0x2b2620, largeur: 2, alpha: 0.6 });
    }
    marqueurs3d.definir([...contours, ...chemins3d, ...chemins3dHover]);
  }

  function hexLocalPoints(r: number): number[] {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = ((60 * i + 30) * Math.PI) / 180;
      pts.push(r * Math.cos(angle), r * Math.sin(angle));
    }
    return pts;
  }

  function drawCross(gr: Graphics, r: number, color: number): void {
    gr.moveTo(-r, -r).lineTo(r, r).moveTo(r, -r).lineTo(-r, r);
    gr.stroke({ width: 5, color });
  }

  /** Flèche persistante d'un ordre Move (Phase 5.5 L1) : tracé + tête pleine.
   *  CORRECTIFS-SELECTION : en 3D, les lignes de cheminement sont tracées dans
   *  le calque Three (`chemins3d` → marqueurs3d, SOUS les modèles d'unités —
   *  la ligne ne recouvre plus l'unité arrivée à destination) ; cette fonction
   *  Pixi ne sert qu'au 2D, où `entitiesLayer` est AU-DESSUS de `overlayLayer`. */
  function drawArrow(
    origin: { x: number; y: number },
    path: Hex[],
    color: number,
    alpha: number,
    dashed: boolean,
    pointesIntermediaires = false,
  ): void {
    const points: Point[] = [origin, ...path.map((h) => hexToPixel(h, HEX_SIZE))];
    const segs = segmentsOf(points);
    if (segs.length === 0) return;
    const [lastFrom, lastTo] = segs[segs.length - 1]!;
    const gr = new Graphics();
    for (const [a, b] of dashed ? segs.flatMap(([a, b]) => dashSegments(a, b)) : segs) gr.moveTo(a.x, a.y).lineTo(b.x, b.y);
    gr.stroke({ width: 6, color, alpha });
    // Pastille discrète à l'origine (départ lisible même sur un chemin court).
    gr.circle(points[0]!.x, points[0]!.y, 8).fill({ color, alpha });
    // RAFFINEMENT-MOUVEMENT : petite pointe sur CHAQUE case traversée (sens
    // de lecture du parcours tuile par tuile) + grande pointe d'arrivée.
    if (pointesIntermediaires) {
      for (let i = 1; i < points.length - 1; i++) {
        gr.poly(arrowHeadPoints(points[i - 1]!, points[i]!, 16).flatMap((p) => [p.x, p.y])).fill({ color, alpha: Math.min(1, alpha + 0.1) });
      }
    }
    gr.poly(arrowHeadPoints(lastFrom, lastTo).flatMap((p) => [p.x, p.y])).fill({ color, alpha: Math.min(1, alpha + 0.1) });
    (gr as Suivable).__suivi3d = { points, width: 6, color, alpha, dashed, tete: true, pastille: true };
    overlayLayer.addChild(gr);
  }

  /** RAFFINEMENT-MOUVEMENT — badge rond de tour (style Civ 7) : petit cercle
   *  numéroté posé au centre d'une case étape. Estampillé `poser3d` pour
   *  suivre la reprojection 3D comme les autres surcouches. */
  function badgeTour(parent: Container, hex: Hex, tour: number, color: number): void {
    const pos = hexToPixel(hex, HEX_SIZE);
    const g = new Graphics();
    g.circle(0, 0, 11).fill({ color: 0x1d242b, alpha: 0.85 }).stroke({ width: 2.5, color });
    const t = new Text({ text: String(tour), style: { fontFamily: 'sans-serif', fontSize: 13, fill: 0xffe08a, fontWeight: 'bold', stroke: { color: 0x1d242b, width: 2 } } });
    t.anchor.set(0.5);
    g.addChild(t);
    poser3d(g, pos.x, pos.y);
    parent.addChild(g);
  }

  /** CORRECTIFS-SELECTION : chemin en POLYLINE 3D ouverte posée sur le relief
   *  (calque Three, SOUS les modèles d'unités). Points moteur + élévation de
   *  chaque case traversée. Retourne [ligne, pointe en V] — la pointe indique
   *  le sens du cheminement, posée sur la case de destination. */
  function chemin3dDe(origin: Hex, path: Hex[], color: number, alpha: number): ContourDef[] {
    const state = scene.state!;
    const eleve = (h: Hex): PointContour => {
      const px = hexToPixel(h, HEX_SIZE);
      return { x: px.x, y: px.y, elev: elevationDe(state.map[tileKeyOf(h)]?.terrain) };
    };
    const ligne: ContourDef = { points: [eleve(origin), ...path.map(eleve)], color, largeur: 6, alpha, ouvert: true };
    // Pointe en V sur la destination (miroir d'arrowHeadPoints, posée au sol).
    const dest = path[path.length - 1]!;
    const avant = path.length > 1 ? path[path.length - 2]! : origin;
    const pd = hexToPixel(dest, HEX_SIZE);
    const pa = hexToPixel(avant, HEX_SIZE);
    const dx = pd.x - pa.x;
    const dy = pd.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const taille = 30;
    const eD = elevationDe(state.map[tileKeyOf(dest)]?.terrain);
    const pointe: ContourDef = {
      points: [
        { x: pd.x - (ux * taille - -uy * taille * 0.5), y: pd.y - (uy * taille - ux * taille * 0.5), elev: eD },
        { x: pd.x, y: pd.y, elev: eD },
        { x: pd.x - (ux * taille + -uy * taille * 0.5), y: pd.y - (uy * taille + ux * taille * 0.5), elev: eD },
      ],
      color,
      largeur: 6,
      alpha: Math.min(1, alpha + 0.1),
      ouvert: true,
    };
    return [ligne, pointe];
  }

  /** Effets de playback (flashs, destructions) — reconstruits par frame. */
  function rebuildEffects(): void {
    effectsLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    // Phase annonce (Phase 5.5 L2) : lignes prévues de TOUS les movers du
    // tour (y compris ennemis visibles dans le journal — le fog a filtré),
    // colorées à l'accent du propriétaire, avant tout mouvement animé.
    for (const line of playback.announce) {
      const color = playerColor(line.owner);
      const a = hexToPixel(line.from, HEX_SIZE);
      const b = hexToPixel(line.to, HEX_SIZE);
      const gr = new Graphics();
      gr.moveTo(a.x, a.y).lineTo(b.x, b.y);
      gr.stroke({ width: 7, color, alpha: 0.85 });
      gr.circle(a.x, a.y, 9).fill({ color, alpha: 0.85 });
      gr.poly(arrowHeadPoints(a, b, 36).flatMap((p) => [p.x, p.y])).fill({ color, alpha: 0.95 });
      (gr as Suivable).__suivi3d = { points: [a, b], width: 7, color, alpha: 0.85, tete: true, pastille: true };
      effectsLayer.addChild(gr);
    }
    for (const fx of playback.fxList) {
      const p = hexToPixel(fx.at, HEX_SIZE);
      const progress = 1 - (fx.t + fx.dur - playback.clock) / fx.dur; // 0→1
      const gr = new Graphics();
      if (fx.kind === 'combat') {
        gr.circle(0, 0, 18 + 30 * progress).stroke({ width: 5, color: 0xff7043, alpha: 1 - progress });
        gr.circle(0, 0, 10).fill({ color: 0xffffff, alpha: 0.9 * (1 - progress) });
      } else if (fx.kind === 'destroy') {
        gr.circle(0, 0, 14 + 46 * progress).stroke({ width: 6, color: 0x61555b, alpha: 1 - progress });
        gr.poly(hexLocalPoints(HEX_SIZE - 12)).fill({ color: 0x000000, alpha: 0.35 * (1 - progress) });
      } else if (fx.kind === 'nuke') {
        // 7m · R-139 🔶 : détonation nucléaire — double onde de choc + flash.
        gr.circle(0, 0, 20 + 90 * progress).stroke({ width: 7, color: 0xff8f00, alpha: 1 - progress });
        gr.circle(0, 0, 12 + 60 * progress).stroke({ width: 5, color: 0xff5252, alpha: (1 - progress) * 0.9 });
        gr.circle(0, 0, 8 + 30 * progress).fill({ color: 0xfff59d, alpha: 0.85 * (1 - progress) });
      } else if (fx.kind === 'good') {
        gr.circle(0, 0, 12 + 26 * progress).stroke({ width: 5, color: 0x9be27a, alpha: 1 - progress });
      } else {
        gr.circle(0, 0, 12 + 26 * progress).stroke({ width: 5, color: 0xef5350, alpha: 1 - progress });
      }
      gr.position.copyFrom(p);
      effectsLayer.addChild(gr);
    }
  }

  // Horloge du playback partagée (voir Playback.clock — horodatage des fx).

  // ---------------------------------------------------------------------
  // Boucle
  // ---------------------------------------------------------------------

  let lastPlaybackActive = false;
  let lastFrame = performance.now();
  let frames = 0;

  function tick(tickerDeltaMs: number): void {
    frames += 1;
    try {
      tickInner(tickerDeltaMs);
    } catch (err) {
      // Surface l'erreur une fois pour le débogage (dev) sans tuer la boucle.
      (window as unknown as Record<string, unknown>).__tickError = err instanceof Error ? (err.stack ?? String(err)) : String(err);
      if (rafId) cancelAnimationFrame(rafId);
      if (fallbackInterval !== null) clearInterval(fallbackInterval);
      rafId = 0;
      fallbackInterval = null;
      throw err;
    }
  }

  function tickInner(tickerDeltaMs: number): void {
    const now = performance.now();
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;
    playback.update(dt);
    if (mode3dActif()) {
      // Terrain 3D : rebuild seulement quand les DONNÉES changent (tuiles
      // instanciées dessinées en entier quel que soit le zoom — bench L0).
      if (tilesDirty) {
        mettreAJourTerrain3d();
        tilesDirty = false;
      }
      // V2 : structures 3D (cartes-ressources, Mainframe, huttes/villages,
      // cratère) — rebuild quand les tuiles OU les entités changent.
      if (tilesDirty || entitiesDirty) mettreAJourStructures3d();
    } else if (tilesDirty || cameraChanged) {
      rebuildTiles();
      tilesDirty = false;
    }
    if (entitiesDirty) {
      rebuildEntities();
      entitiesDirty = false;
    }
    if (overlayDirty) {
      rebuildOverlay();
      overlayDirty = false;
      // TRAVAIL-VILLE-3D : en 3D, les contours worked tiles/cultivation
      // suivent le même cycle de invalidation que l'overlay (état + UI).
      if (mode3dActif()) mettreAJourMarqueurs3d();
    }
    // MENU-VILLE : progression de l'animation d'entrée/sortie de la vue ville.
    // Hors animation, la pose est statique (posée une seule fois à la fin de
    // l'entrée — aucun recalcul par frame).
    if (vueAnim) {
      vueAnim.t = Math.min(1, vueAnim.t + dt / VUE_VILLE_DUREE);
      appliquerPoseVue(poseVueCourante());
      if (vueAnim.t >= 1) {
        if (vueAnim.entree) {
          // CORRECTIFS-VUE-VILLE : la pose cible a pu être calculée sur des
          // dimensions transitoires (colonne pas encore masquée, redim pendant
          // l'anim) — on recale la pose FINALE sur les dimensions actuelles.
          vuePose = poseVueVilleCible() ?? vueAnim.to;
          appliquerPoseVue(vuePose);
        } else {
          vuePose = null;
          cameraChanged = true; // rend la main à la caméra 2D normale
          // CORRECTIFS-VUE-VILLE (retour d'Erik) : le rebuild des entités et
          // de la surcouche a tourné PENDANT l'animation de sortie —
          // vueVilleActif() y était encore vrai, donc les unités (et toute la
          // surcouche de guerre) sont restées MASQUÉES après le retour carte.
          // On ré-invalide : le rebuild rejoué à la pose finale repeuple.
          entitiesDirty = true;
          overlayDirty = true;
        }
        vueAnim = null;
      }
    } else if (cameraChanged && !vuePose) {
      if (!mode3dActif()) {
        world.position.set(camera.x, camera.y);
        world.scale.set(camera.scale);
      }
      cameraChanged = false;
    } else if (cameraChanged && vuePose) {
      cameraChanged = false; // la pose de vue ville prime pendant la vue
    }
    if (playback.active) {
      // Repositionner les unités animées chaque frame (après les rebuilds :
      // l'interpolation prime sur la position finale de l'état).
      for (const [unitId, anim] of playback.moves) {
        const c = unitSprites.get(unitId);
        if (!c) continue;
        const a = hexToPixel(anim.from, HEX_SIZE);
        const b = hexToPixel(anim.to, HEX_SIZE);
        poser3d(c, a.x + (b.x - a.x) * anim.t, a.y + (b.y - a.y) * anim.t);
      }
      // V2-unités3D : le calque 3D suit l'interpolation du playback (positions
      // + élévations lerpées par le planificateur — unites3d/interpole).
      if (mode3dActif()) mettreAJourStructures3d();
      rebuildEffects();
    }
    // CORRECTIFS-SELECTION : l'aperçu animé a été remplacé par la position
    // optimiste des unités (rebuildEntities) — plus de couche dédiée.
    if (mode3dActif()) {
      projeterCalques3d();
      terrain3d!.tick(dt / 1000, true);
      terrain3d!.breathe(now / 1000, true);
    }
    if (playback.active !== lastPlaybackActive) {
      lastPlaybackActive = playback.active;
      if (!playback.active) {
        rebuildEffects(); // purge : aucune annonce/effet résiduel après la relecture
        // CORRECTIFS-PILE : le playback repose les sprites à la position MOTEUR
        // (interpolation origine→arrivée) — sans rebuild, la pose optimiste
        // (arrêt de la prochaine résolution, PILE-AFFICHÉE) ne revenait jamais
        // après la relecture : unité visuellement « en retard » d'une case.
        entitiesDirty = true;
        overlayDirty = true;
      }
      onPlaybackActive?.(playback.active);
    }
    void tickerDeltaMs;
  }

  // --- Chantier V1 (L3) : terrain 3D, picking et projection -----------------

  /** Construit les tuiles à dessiner depuis l'état FILTRÉ (inexploré absent,
   *  §4.4) avec le rendement RÉEL (miroir tileYield — render3d/rendement). */
  function mettreAJourTerrain3d(): void {
    if (!terrain3d || !scene.state || !rendement) return;
    const tiles: TileDraw[] = [];
    for (const [key, tile] of Object.entries(scene.state.map)) {
      const [q, r] = key.split(',').map(Number);
      if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
      tiles.push({
        q, r,
        terrain: tile.terrain,
        fog: scene.visible.has(key) ? 'visible' : 'explored',
        allume: allumeDe(rendement, key),
      });
    }
    // VILLE-TRIPO T2 : prairies ET plaines sous grenier ont leur substrat
    // REMPLACÉ par l'asset .glb (le calque recouvrement pose la tuile ; le haut
    // procédural et ses glyphes sont masqués, les parois restent).
    const recouvertes = clesTuilesGlb();
    // Addenda 21 : l'asset .glb de la colline redressée et de la montagne est
    // plus bas que l'élévation procédurale du terrain — les parois conservées
    // montaient AU-DESSUS et leurs arêtes dépassaient (retour Erik 11/09).
    // On raccourcit leur sommet juste sous l'asset posé dessus.
    const parois = new Map<string, number>();
    for (const cle of recouvertes) {
      const terrain = scene.state?.map[cle]?.terrain;
      if (terrain === 'colline') parois.set(cle, 0.0);
      else if (terrain === 'montagne') parois.set(cle, 0.05);
    }
    terrain3d.update(tiles, recouvertes, parois);
  }

  /** Construit les données de la couche STRUCTURES 3D (V2) depuis l'état
   *  FILTRÉ : tuiles productives + ressource (R-92 : marqueur « inconnue »
   *  tant que la tech manque), villes (Mainframe), huttes/villages barbares,
   *  cratères. Aucune invention — miroir exact de ce que voit le joueur. */
  function mettreAJourStructures3d(): void {
    if (!structures3d || !scene.state) return;
    const state = scene.state;
    const tuiles: Parameters<typeof planifierStructures>[0]['tuiles'] = [];
    for (const [key, tile] of Object.entries(state.map)) {
      const [q, r] = key.split(',').map(Number);
      if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
      tuiles.push({
        q, r,
        terrain: tile.terrain,
        fog: scene.visible.has(key) ? 'visible' : 'explored',
        ressource: tile.resource ?? null,
      });
    }
    // VILLE-TRIPO T2 : quand §structures.ville3d pointe un .glb, les villes ne
    // vont PLUS au planificateur (Mainframe + modules/merveille/cœur retirés
    // du rendu — données moteur conservées) ; elles sont rendues par le calque
    // .glb, teinte accent_joueur par propriétaire. Absent = fallback Mainframe.
    const villeGlb = VILLE3D && VILLE3D.kind === 'glb' ? VILLE3D : null;
    const villes: Parameters<typeof planifierStructures>[0]['villes'] = [];
    const villesGlbEntrees: UniteGLBEntree[] = [];
    for (const city of Object.values(state.cities)) {
      // Miroir du rendu 2D : villes visibles seulement (le fog filtre l'état).
      if (!scene.visible.has(tileKeyOf(city))) continue;
      const fog = scene.visible.has(tileKeyOf(city)) ? 'visible' as const : 'explored' as const;
      if (villeGlb) {
        villesGlbEntrees.push({
          id: city.id, q: city.q, r: city.r, fog,
          terrain: state.map[tileKeyOf(city)]?.terrain,
          owner: city.owner,
          glb: villeGlb.glb, echelle: villeGlb.echelle, rotation: villeGlb.rotation, survol: villeGlb.survol,
        });
      } else {
        villes.push({
          id: city.id, q: city.q, r: city.r,
          pop: city.pop, capital: city.capital, owner: city.owner,
          buildings: city.buildings, wonders: city.wonders ?? [],
          fog,
        });
      }
    }
    // HUTTE .glb (08/09) : même bascule que les villages — hors planificateur
    // (dôme procédural retiré du rendu, fallback si spec absente).
    const hutteGlb = HUTTE_TRIPO3D && HUTTE_TRIPO3D.kind === 'glb' ? HUTTE_TRIPO3D : null;
    const huttes: Parameters<typeof planifierStructures>[0]['huttes'] = [];
    const huttesGlbEntrees: UniteGLBEntree[] = [];
    for (const h of state.huts) {
      if (!scene.visible.has(tileKeyOf(h))) continue;
      const fog = scene.visible.has(tileKeyOf(h)) ? 'visible' as const : 'explored' as const;
      if (hutteGlb) {
        huttesGlbEntrees.push({
          id: h.id, q: h.q, r: h.r, fog,
          terrain: state.map[tileKeyOf(h)]?.terrain,
          owner: 'barbarien', // aucun matériau accent_joueur dans le .glb : la teinte est sans effet
          glb: hutteGlb.glb, echelle: hutteGlb.echelle, rotation: hutteGlb.rotation, survol: hutteGlb.survol,
        });
      } else {
        huttes.push({ id: h.id, q: h.q, r: h.r, fog, terrain: state.map[tileKeyOf(h)]?.terrain });
      }
    }
    // VILLAGE barbare .glb (08/09) : même bascule que les villes — hors
    // planificateur (dôme procédural retiré du rendu, fallback si spec absente).
    const villageGlb = VILLAGE_BARBARE3D && VILLAGE_BARBARE3D.kind === 'glb' ? VILLAGE_BARBARE3D : null;
    const villages: Parameters<typeof planifierStructures>[0]['villages'] = [];
    const villagesGlbEntrees: UniteGLBEntree[] = [];
    for (const v of state.villages) {
      if (!scene.visible.has(tileKeyOf(v))) continue;
      const fog = scene.visible.has(tileKeyOf(v)) ? 'visible' as const : 'explored' as const;
      if (villageGlb) {
        villagesGlbEntrees.push({
          id: v.id, q: v.q, r: v.r, fog,
          terrain: state.map[tileKeyOf(v)]?.terrain,
          owner: 'barbarien', // aucun matériau accent_joueur dans le .glb : la teinte est sans effet
          glb: villageGlb.glb, echelle: villageGlb.echelle, rotation: villageGlb.rotation, survol: villageGlb.survol,
        });
      } else {
        villages.push({ id: v.id, q: v.q, r: v.r, fog, terrain: state.map[tileKeyOf(v)]?.terrain });
      }
    }
    // Unités 3D (chantier V2-unités3D) : assemblage PARTAGÉ avec le labo
    // (unites3d.ts) — playback interpolé suivi par le calque, mapping data-driven.
    // CORRECTIFS-SELECTION : position optimiste (destination du chemin).
    const srcUnites = {
      state,
      visible: scene.visible,
      moveOf: (id: string) => playback.moveOf(id),
      positionDe: (id: string) => {
        const u = state.units[id];
        return u ? positionAfficheeDe(u) : null;
      },
    };
    const unites = unitesStructures(srcUnites);
    const plan: PlanStructures = planifierStructures({ tuiles, villes, huttes, villages, unites, couleurDe: playerColor });
    dernierPlanStructures = plan;
    structures3d.update(plan);
    // Fonderie T3 : calque .glb (mêmes filtres état filtré/R-117/fog).
    const glbEntrees = unitesGLBStructures(srcUnites);
    dernierPlanGlb = glbEntrees;
    unitesGlb?.update(glbEntrees, playerColor);
    // VILLE-TRIPO T2 : les villes passent par le MÊME pipeline (teinte
    // multiplicative accent_joueur, fog, instancing) — monde dédié.
    villesGlb?.update(villesGlbEntrees, playerColor);
    // VILLAGE barbare : même pipeline, SANS teinte (couleurs d'origine).
    villagesGlb?.update(villagesGlbEntrees, playerColor);
    // HUTTE : même pipeline, SANS teinte.
    huttesGlb?.update(huttesGlbEntrees, playerColor);
    // TUILE prairie : recouvrement du prisme (visible ET explorée — le
    // inexploré reste absent, miroir du terrain procédural), SANS teinte.
    // PLAINE grenier : tuile plaine TRAVAILLÉE par une ville possédant un
    // grenier (R-66 : +2 nourriture sur plaine) → bus central allumé, côtés cuivre.
    if (prairiesGlb) {
      const tuilePrairie = TUILE_PRAIRIE3D && TUILE_PRAIRIE3D.kind === 'glb' ? TUILE_PRAIRIE3D : null;
      const tuilePlaine = TUILE_PLAINE3D && TUILE_PLAINE3D.kind === 'glb' ? TUILE_PLAINE3D : null;
      const tuilePlaineGrenier = TUILE_PLAINE_GRENIER3D && TUILE_PLAINE_GRENIER3D.kind === 'glb' ? TUILE_PLAINE_GRENIER3D : null;
      const tuileMontagne = TUILE_MONTAGNE3D && TUILE_MONTAGNE3D.kind === 'glb' ? TUILE_MONTAGNE3D : null;
      const tuileColline = TUILE_COLLINE3D && TUILE_COLLINE3D.kind === 'glb' ? TUILE_COLLINE3D : null;
      const prairiesGlbEntrees: UniteGLBEntree[] = [];
      if (tuilePrairie || tuilePlaine || tuilePlaineGrenier || tuileMontagne || tuileColline) {
        // plaine sous grenier : la ville qui travaille cette case possède le bâtiment
        const travaillePar = TUILE_PLAINE_GRENIER3D ? workedTileOwner() : null;
        for (const [key, tile] of Object.entries(state.map)) {
          // l'état filtré ne contient QUE les cases explorées (inexploré absent)
          const [q, r] = key.split(',').map(Number);
          if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
          const fog = scene.visible.has(key) ? 'visible' as const : 'explored' as const;
          const spec = tile.terrain === 'prairie' ? tuilePrairie
            : tile.terrain === 'plaine'
              ? (travaillePar?.get(key)?.buildings?.includes('grenier') ? tuilePlaineGrenier : tuilePlaine)
            : tile.terrain === 'montagne' ? tuileMontagne
            : tile.terrain === 'colline' ? tuileColline
            : null;
          if (!spec) continue;
          prairiesGlbEntrees.push({
            id: `tuile:${key}`, q, r, fog,
            terrain: tile.terrain,
            owner: 'barbarien', // aucun matériau accent_joueur : la teinte est sans effet
            glb: spec.glb, echelle: spec.echelle, rotation: spec.rotation, survol: spec.survol,
          });
        }
      }
      prairiesGlb.update(prairiesGlbEntrees, playerColor);
    }
  }

  /** Hex sous un point écran — 3D : picking analytique partagé ; 2D : mapping
   *  linéaire ; VUE VILLE : transform inverse de la pose (zoom à plat). */
  function hexSousEcran(x: number, y: number): Hex | null {
    if (mode3dActif()) {
      return pickHex3D(x, y, vw, vh, stage3d!.cam, (hex) => scene.state?.map[tileKeyOf(hex)]?.terrain ?? null);
    }
    if (vueVilleActif()) {
      return hexSousEcranVueVille(x, y, poseVueCourante(), HEX_SIZE);
    }
    return screenToHex(x, y, camera, HEX_SIZE);
  }

  /** Reprojecte chaque frame les couches PixiJS (entités, ressources,
   *  surcouche, effets) dans l'espace écran de la caméra 3D. Les enfants
   *  « estampés » (position monde) sont projetés ; les géométries absolues
   *  (flèches, chemins — `__suivi3d`) sont redessinées in-place, point par
   *  point (chaque point suit l'élévation de SA case). En 2D cette fonction
   *  n'est pas appelée : le conteneur `world` porte la caméra. */
  function projeterCalques3d(): void {
    const cam = stage3d!.cam;
    /** Point monde (px moteur) → point écran + échelle locale. */
    const projeterPoint = (wx: number, wy: number): { x: number; y: number; k: number } | null => {
      const hex = hexAtWorld(wx / HEX_SIZE, wy / HEX_SIZE);
      const elev = elevationDe(scene.state?.map[tileKeyOf(hex)]?.terrain);
      const p = cam.project(new THREE.Vector3(wx / HEX_SIZE, elev + 0.05, wy / HEX_SIZE), vw, vh);
      return p ? { x: p.x, y: p.y, k: p.pxPerUnit / HEX_SIZE } : null;
    };
    const redessinerSuivi = (gr: Suivable, k: number, pf: (p: Point) => Point): void => {
      const s = gr.__suivi3d!;
      gr.clear();
      const pts = s.points.map(pf);
      if (pts.length < 2) return;
      const segs = segmentsOf(pts);
      for (const [a, b] of s.dashed ? segs.flatMap(([a, b]) => dashSegments(a, b)) : segs) gr.moveTo(a.x, a.y).lineTo(b.x, b.y);
      gr.stroke({ width: s.width * k, color: s.color, alpha: s.alpha });
      if (s.pastille) gr.circle(pts[0]!.x, pts[0]!.y, 8 * k).fill({ color: s.color, alpha: s.alpha });
      if (s.tete) {
        const [lastFrom, lastTo] = segs[segs.length - 1]!;
        gr.poly(arrowHeadPoints(lastFrom, lastTo, 34 * k).flatMap((p) => [p.x, p.y])).fill({ color: s.color, alpha: Math.min(1, s.alpha + 0.1) });
      }
    };
    for (const [layer, reconstruiteEnBloc] of [[entitiesLayer, false], [overlayLayer, true], [effectsLayer, true]] as const) {
      for (const child of layer.children) {
        const c = child as Container & Suivable & { __wx?: number; __wy?: number; __ws?: number };
        if (c.__suivi3d) {
          const s = c.__suivi3d;
          const premiere = projeterPoint(s.points[0]!.x, s.points[0]!.y);
          if (!premiere) { c.visible = false; continue; }
          c.visible = true;
          c.position.set(0, 0);
          redessinerSuivi(c, premiere.k, (p) => {
            const pr = projeterPoint(p.x, p.y);
            return pr ? { x: pr.x, y: pr.y } : { x: premiere.x, y: premiere.y };
          });
        } else {
          // Couche reconstruite en bloc (overlay/effets) : la position courante
          // VIENT d'être posée en coordonnées monde — on l'estampe. Les couches
          // incrémentales (entités) passent par poser3d explicitement.
          if (c.__wx === undefined || c.__wy === undefined) {
            if (!reconstruiteEnBloc) continue;
            c.__wx = c.x; c.__wy = c.y;
            if (c.__ws === undefined) c.__ws = c.scale.x;
          }
          const wx = c.__wx, wy = c.__wy;
          if (wx === undefined || wy === undefined) continue;
          const pr = projeterPoint(wx, wy);
          if (!pr) { c.visible = false; continue; }
          c.visible = true;
          c.position.set(pr.x, pr.y);
          c.scale.set((c.__ws ?? 1) * pr.k);
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Entrées souris / clavier (pan vs clic : seuil 5 px — L1)
  // ---------------------------------------------------------------------

  const PAN_THRESHOLD = 5;
  let pointer: { x: number; y: number } | null = null;
  let dragging = false;

  function canvasPos(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const rect = app!.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: PointerEvent): void {
    // MENU-VILLE : en vue ville, aucune action de carte (pas de préview
    // clic droit, pas de pan) — le clic gauche seul assigne les tuiles.
    if (vueVilleActif()) return;
    // RAFFINEMENT-MOUVEMENT : clic droit ENFONCÉ = début de la préview
    // multi-tours (style Civ 7). La décision (confirmer/annuler) se prend au
    // relâchement (onPointerUp) — le `contextmenu` qui suit est neutralisé.
    if (e.button === 2) {
      if (app && !playback.active && scene.view && ordersEditable(scene.view)) {
        droitMaintenu = true;
        droitTraite = false;
        survolALa(canvasPos(e));
      }
      return;
    }
    if (e.button !== 0) return;
    pointer = canvasPos(e);
    dragging = false;
  }

  // Phase 6c — tooltip de survol (demande d'Erik, utile au labo #/progen) :
  // nom du terrain sous le curseur + entités posées dessus. Source = l'état
  // (filtré par le fog / la visibilité des ressources R-92) : le tooltip ne
  // révèle rien que la vue ne montre déjà.
  let tip = $state<{ x: number; y: number; lines: string[] } | null>(null);
  let tipHex: string | null = null;

  // DEPLACEMENT-PLANIFIE (R-160) : aperçu de la dernière frame — source du
  // tooltip « case disputée » (transparence pédagogique, L4.6) et, depuis les
  // CORRECTIFS-SELECTION, de la position optimiste des unités programmées.
  let scenePreviews: ProgramPreview[] = [];

  /**
   * CORRECTIFS-SELECTION : position AFFICHÉE d'une unité programmée —
   * RAFFINEMENT-MOUVEMENT (décisions d'Erik du 12/09 v2) : l'aperçu montre
   * UNIQUEMENT ce qui se passera à la PROCHAINE résolution — l'unité s'affiche
   * sur sa case d'ARRÊT du prochain tour (ses PM le long du chemin), PAS à la
   * destination finale des tours subséquents. La flèche, elle, demeure
   * dessinée jusqu'à l'arrivée finale avec ses badges de tours. Un ordre
   * tenable en un tour reste affiché à sa destination (inchangé).
   */
  function positionAfficheeDe(unit: { id: string; owner: string; type?: string }): Hex | null {
    return scene.state ? positionAfficheeDeEtat(scene.state, scenePreviews, unit, scene.myId) : null;
  }

  /**
   * PILE-AFFICHÉE (retour d'Erik du 17/09) — positions DESSINÉES de toutes les
   * unités : aperçu d'arrêt pour les programmées, SAUF arrivée sur ennemi
   * visible (fantôme : dessinées à leur case moteur). Miroir exact du rendu —
   * partagé par le rendu des piles, le clic (sélection à la case affichée) et
   * l'anneau de sélection. Recalcul O(unités + aperçus) par usage, jamais par
   * frame.
   */
  function positionsDessinees(): PositionsAffichees {
    const out: PositionsAffichees = new Map();
    const state = scene.state;
    if (!state) return out;
    const arrivees = arriveesEnnemies();
    for (const unit of Object.values(state.units)) {
      if (unit.aboard) continue;
      if (arrivees.has(unit.id)) continue;
      const aff = positionAfficheeDeEtat(state, scenePreviews, unit, scene.myId);
      if (aff) out.set(unit.id, aff);
    }
    return out;
  }

  /** CORRECTIFS-SELECTION : lignes de cheminement 3D (calque Three, posées
   *  sur le relief SOUS les unités) — remplies par rebuildOverlay, consommées
   *  par mettreAJourMarqueurs3d. */
  let chemins3d: ContourDef[] = [];

  // -------------------------------------------------------------------------
  // FLECHE-MOUVEMENT / RAFFINEMENT-MOUVEMENT (décisions d'Erik des 11-12/09)
  // Survol (unité amie sélectionnée) : AUCUNE flèche — seule la TUILE VISÉE
  // s'entoure (« un clic droit ici = destination »).
  // CLIC DROIT rapide sur la tuile = ordre posé (flèche jusqu'à l'arrivée
  // finale, badges de tours) ; CLIC DROIT MAINTENU = préview live multi-tours
  // (flèche pointillée + pointes par case + badges (1),(2)… — PM par tour,
  // 1 case = 1 PM, style Civ 7), le RELÂCHEMENT SUR UNE CASE confirme
  // l'ordre, ailleurs il annule (sémantique `rightClickAction` inchangée).
  // L'aperçu de position (positionAfficheeDe) ne montre que la PROCHAINE
  // résolution (case d'arrêt selon les PM), jamais les tours subséquents.
  // Zéro programmation au survol.
  // -------------------------------------------------------------------------
  const COULEUR_SURVOL = 0xffe082; // ambre clair (la flèche d'ordre = 0xf0c419 plein)
  const ALPHA_SURVOL = 0.55;
  // -------------------------------------------------------------------------
  // ARRIVEE-ENNEMIE (décisions d'Erik du 12/09) — arrivée programmée sur une
  // tuile à unité ennemie VISIBLE : l'ennemi reste en grandeur normale à sa
  // place ; l'unité programmée s'affiche en FANTÔME translucide, plus petite,
  // décalée vers le bord de l'hexagone d'où elle arrive (cohérent avec la
  // flèche) ; l'anneau de la tuile d'arrivée passe au ROUGE (survol ET ordre
  // posé, chemin gelé compris). Aperçu d'arrivée uniquement — JAMAIS une
  // promesse de résultat de combat (résolution simultanée, modèle Diplomacy).
  // 🔶 calibrage à l'œil par Erik : les 4 constantes ci-dessous.
  // -------------------------------------------------------------------------
  const FANTOME_ALPHA = 0.7; // transparence du fantôme (retour Erik 12/09 : moins transparent que 0.5)
  const FANTOME_RATIO = 0.7; // taille du fantôme (fraction du sprite normal 0.5)
  const FANTOME_DECAL = 0.42; // décalage vers le bord d'arrivée (fraction de HEX_SIZE)
  const COULEUR_ARRIVEE_ENNEMIE = 0xe53935; // anneau rouge = destination occupée

  /** Détections dérivées de l'aperçu DÉJÀ calculé (scenePreviews — aucun
   *  nouveau BFS, exigence bench M4.3) : pour chaque unité amie programmée
   *  dont l'ARRÊT de la prochaine résolution porte un ennemi visible, la case
   *  d'arrivée, la direction d'arrivée, le compteur de pile ×N et l'unité
   *  (pour le sprite du fantôme). Recalculée par rebuild (état change), O(1)
   *  par aperçu — jamais par frame. */
  function arriveesEnnemies(): Map<string, { hex: Hex; dirX: number; dirY: number; pile: number; unitId: string }> {
    const out = new Map<string, { hex: Hex; dirX: number; dirY: number; pile: number; unitId: string }>();
    const state = scene.state;
    if (!state || !scene.myId) return out;
    const mpDe = (id: string): number => {
      const u = state.units[id];
      return u ? unitType(u.type).movement : 1;
    };
    const piles = arriveesPartagees(scenePreviews, mpDe);
    for (const p of scenePreviews) {
      if (p.path.length === 0) continue;
      const unit = state.units[p.unitId];
      if (!unit || unit.owner !== scene.myId) continue;
      const arret = arretProchaineResolution(p.path, mpDe(p.unitId));
      if (!arret) continue;
      const origine = p.path.length > 1 ? p.path[p.path.length - 2]! : { q: unit.q, r: unit.r };
      const det = arriveeSurEnnemi(state, scene.visible, arret, origine, scene.myId);
      if (det) {
        out.set(p.unitId, {
          hex: arret,
          dirX: det.dirX,
          dirY: det.dirY,
          pile: piles.get(tileKeyOf(arret)) ?? 1,
          unitId: p.unitId,
        });
      }
    }
    return out;
  }

  /** Fantôme translucide d'une unité programmée arrivant sur un ennemi :
   *  copie base+accent du sprite, alpha et taille réduits (constantes 🔶),
   *  décalée vers le bord d'arrivée, posée SOUS le sprite ennemi (l'overlay
   *  est sous `entitiesLayer`) et estampillée `poser3d` (reprojection 3D). */
  function dessinerFantomeArrivee(parent: Container, unitId: string, hex: Hex, dirX: number, dirY: number): void {
    const unit = scene.state?.units[unitId];
    if (!textures || !unit) return;
    const tex =
      unit.owner === BARBARIAN_ID
        ? (textures.units[`barbare_${unit.type}`] ?? textures.units[unit.type])
        : textures.units[unit.type];
    if (!tex) return;
    const fantome = new Container();
    const base = new Sprite(tex.base);
    base.anchor.set(0.5, 1);
    base.scale.set(0.5 * FANTOME_RATIO);
    const accent = new Sprite(tex.accent);
    accent.anchor.set(0.5, 1);
    accent.scale.set(0.5 * FANTOME_RATIO);
    accent.tint = playerColor(unit.owner);
    fantome.addChild(base, accent);
    fantome.alpha = FANTOME_ALPHA;
    const c = hexToPixel(hex, HEX_SIZE);
    // Décalage vers le bord D'OÙ l'unité arrive (côté origine — cohérent avec
    // la flèche qui y mène) : direction origine→arrivée INVERSÉE.
    poser3d(fantome, c.x - dirX * FANTOME_DECAL * HEX_SIZE, c.y - dirY * FANTOME_DECAL * HEX_SIZE + 6);
    parent.addChild(fantome);
  }

  let hoverHex: Hex | null = null; // dernière case survolée (re-calcul au changement d'état/UI)
  let hoverPath: Hex[] | null = null;
  let hoverUnitId: string | null = null;
  let hoverG: Container | null = null; // 2D uniquement (en 3D : chemins3dHover)
  let chemins3dHover: ContourDef[] = [];
  // Clic droit MAINTENU (préview multi-tours) ; `droitTraite` = le
  // relâchement a déjà tranché (confirmé/annulé) — le `contextmenu` qui suit
  // (souris réelle) ne doit pas retraiter le même clic.
  let droitMaintenu = false;
  let droitTraite = false;
  // Perf (M1.3) : le BFS n'est pas relancé à chaque pixel — cache pur
  // (`creeCacheChemins`, une entrée par unité×case cible), purgé à chaque
  // nouvelle vue serveur.
  const hoverCache = creeCacheChemins();

  /** Efface la flèche de survol (2D + 3D). */
  function effacerSurvol(): void {
    hoverHex = null;
    hoverPath = null;
    hoverUnitId = null;
    chemins3dHover = [];
    if (hoverG) {
      hoverG.destroy();
      hoverG = null;
    }
    if (mode3dActif()) mettreAJourMarqueurs3d();
  }

  /** Recalcule le chemin de survol pour la case `hex` (déjà changée). */
  function recalculerSurvol(hex: Hex): void {
    hoverPath = null;
    hoverUnitId = null;
    chemins3dHover = [];
    const state = scene.state;
    const editable = !!state && !!scene.view && ordersEditable(scene.view) && !playback.active;
    const selectedId = scene.ui.selectedUnitId;
    const unit = editable && selectedId ? state!.units[selectedId] : undefined;
    if (unit && unit.owner === scene.myId) {
      const path = hoverCache.chemin(state!, unit, hex); // unit = position moteur (Hex structurel)
      // Destination déjà programmée pour cette unité : la flèche d'ordre
      // solide la montre — pas de doublon pointillé par-dessus.
      const posee = scenePreviews.find((pv) => pv.unitId === unit.id);
      const dejaAffichee =
        !!posee && !!path && posee.path.length === path.length && posee.path.every((h, i) => h.q === path[i]!.q && h.r === path[i]!.r);
      if (path && path.length > 0 && !dejaAffichee) {
        hoverPath = path;
        hoverUnitId = unit.id;
        if (mode3dActif()) chemins3dHover = chemin3dDe(unit, path, COULEUR_SURVOL, ALPHA_SURVOL);
      }
    }
    if (mode3dActif()) mettreAJourMarqueurs3d();
    else dessinerSurvol();
  }

  /** Survol : dessin 2D — RAFFINEMENT-MOUVEMENT v2 (Erik 12/09) : au simple
   *  survol, AUCUNE flèche — seule la tuile visée reste ENTOURÉE. La flèche
   *  (pointillée, pointes par case, badges de tours) n'apparaît que pendant
   *  le CLIC DROIT MAINTENU ; le relâchement confirme l'ordre. */
  function dessinerSurvol(): void {
    if (hoverG) {
      hoverG.destroy();
      hoverG = null;
    }
    if (!hoverPath || !hoverUnitId || mode3dActif()) return;
    const unit = scene.state?.units[hoverUnitId];
    if (!unit) return;
    const cont = new Container();
    // Encadré de la TUILE VISÉE : « un clic droit ici = destination » (seul
    // indicateur du survol simple — la flèche est réservée au maintien).
    // ARRIVEE-ENNEMIE : la tuile visée porte un ennemi visible → anneau ROUGE
    // (survol comme ordre posé, décision d'Erik du 12/09).
    const stateSurvol = scene.state;
    const cible = hoverPath[hoverPath.length - 1]!;
    const ennemiVise =
      stateSurvol && scene.myId
        ? arriveeSurEnnemi(
            stateSurvol,
            scene.visible,
            cible,
            hoverPath.length > 1 ? hoverPath[hoverPath.length - 2]! : unit,
            scene.myId,
          )
        : null;
    const couleurCible = ennemiVise ? COULEUR_ARRIVEE_ENNEMIE : COULEUR_SURVOL;
    const anneau = new Graphics();
    anneau.poly(hexLocalPoints(HEX_SIZE - 4)).stroke({ width: 3, color: couleurCible, alpha: 0.9 });
    anneau.poly(hexLocalPoints(HEX_SIZE - 12)).stroke({ width: 1.5, color: 0x2b2620, alpha: 0.5 });
    anneau.position.copyFrom(hexToPixel(cible, HEX_SIZE));
    cont.addChild(anneau);
    if (droitMaintenu) {
      const points: Point[] = [hexToPixel(unit, HEX_SIZE), ...hoverPath.map((h) => hexToPixel(h, HEX_SIZE))];
      const segs = segmentsOf(points);
      if (segs.length > 0) {
        const gr = new Graphics();
        for (const [a, b] of segs.flatMap(([a, b]) => dashSegments(a, b))) gr.moveTo(a.x, a.y).lineTo(b.x, b.y);
        gr.stroke({ width: 4, color: COULEUR_SURVOL, alpha: ALPHA_SURVOL });
        // Petite pointe sur chaque case traversée + grande pointe d'arrivée.
        for (let i = 1; i < points.length - 1; i++) {
          gr.poly(arrowHeadPoints(points[i - 1]!, points[i]!, 16).flatMap((p) => [p.x, p.y])).fill({ color: COULEUR_SURVOL, alpha: Math.min(1, ALPHA_SURVOL + 0.1) });
        }
        const [lastFrom, lastTo] = segs[segs.length - 1]!;
        gr.poly(arrowHeadPoints(lastFrom, lastTo).flatMap((p) => [p.x, p.y])).fill({ color: COULEUR_SURVOL, alpha: Math.min(1, ALPHA_SURVOL + 0.1) });
        cont.addChild(gr);
      }
      // Préview multi-tours : badges (1), (2)…
      for (const j of jalonsDeTours(hoverPath, unitType(unit.type).movement)) badgeTour(cont, j.hex, j.tour, COULEUR_SURVOL);
    }
    hoverG = cont;
    overlayLayer.addChild(cont);
  }

  /** Survol : recalcul à une position canvas donnée (pointermove ou
   *  début/maintien du clic droit). */
  function survolALa(p: { x: number; y: number }): void {
    const hex = hexSousEcran(p.x, p.y);
    if (!hex) {
      if (hoverHex) effacerSurvol();
      return;
    }
    if (hoverHex && hoverHex.q === hex.q && hoverHex.r === hex.r) {
      // Même case : le seul changement possible est l'état maintenu.
      if (hoverG || (hoverPath && droitMaintenu)) dessinerSurvol();
      return;
    }
    hoverHex = hex;
    recalculerSurvol(hex);
  }

  /** Survol : suivi du curseur (pointermove, hors drag/playback). */
  function mettreAJourSurvol(e: PointerEvent): void {
    if (!app) return;
    if (dragging || playback.active) {
      if (hoverHex) effacerSurvol();
      return;
    }
    survolALa(canvasPos(e));
  }

  /** R-161 (D6) : troncature fog d'un chemin gelé (affichage pointillé) —
   *  miroir de la troncature de previewPrograms ; explored vide (fixtures /
   *  états anciens) = pas de fog modélisé, chemin intégral. */
  function fogTruncate(path: Hex[], owner: string): Hex[] {
    const state = scene.state;
    if (!state) return path;
    const explored = state.players[owner]?.vision.explored ?? [];
    if (explored.length === 0) return path;
    const known = new Set(explored);
    const out: Hex[] = [];
    for (const step of path) {
      if (!known.has(tileKeyOf(step))) {
        out.push(step);
        break; // un pas dans l'inconnu, le reste est tu
      }
      out.push(step);
    }
    return out;
  }

  function buildTipLines(hex: Hex): string[] {
    const state = scene.state;
    if (!state) return [];
    const tile = state.map[tileKeyOf(hex)];
    if (!tile) return ['Inexploré']; // fog : case absente de l'état filtré
    const lines: string[] = [TERRAINS[tile.terrain]?.name ?? tile.terrain];
    if (tile.resource) {
      lines.push(tile.resource === RESOURCE_UNKNOWN ? 'Ressource inconnue' : (RESOURCES[tile.resource]?.name ?? tile.resource));
    }
    for (const c of Object.values(state.cities)) {
      if (c.q === hex.q && c.r === hex.r) lines.push(c.capital ? `Capitale (pop ${c.pop})` : `Ville (pop ${c.pop})`);
    }
    for (const u of Object.values(state.units)) {
      if (u.q === hex.q && u.r === hex.r) lines.push(unitType(u.type).name);
    }
    for (const v of state.villages) {
      if (v.q === hex.q && v.r === hex.r) lines.push('Village barbare');
    }
    for (const h of state.huts) {
      if (h.q === hex.q && h.r === hex.r) lines.push('Hutte');
    }
    for (const a of state.artefacts) {
      if (a.q === hex.q && a.r === hex.r) {
        lines.push(`Artefact : ${ARTEFACTS.pool[a.artefactId]?.name ?? a.artefactId}`);
      }
    }
    // R-160 (D1, transparence pédagogique) : case disputée — expliquer la
    // règle de priorité au survol.
    if (scenePreviews.some((p) => p.disputed && p.destination && p.destination.q === hex.q && p.destination.r === hex.r)) {
      lines.push('⚔ Case disputée : la première unité programmée obtiendra la case — les autres s\'arrêteront sur la dernière case libre avant (R-159).');
    }
    // ARRIVEE-ENNEMIE : nommer l'incertitude — aperçu d'arrivée, JAMAIS une
    // promesse de résultat de combat (résolution simultanée, modèle Diplomacy).
    for (const d of arriveesEnnemies().values()) {
      if (d.hex.q === hex.q && d.hex.r === hex.r) {
        lines.push('Arrivée sur ennemi : aperçu seulement — l\'ennemi peut avoir bougé (résolution simultanée).');
        break;
      }
    }
    return lines;
  }

  function updateTip(e: PointerEvent): void {
    if (!app) return;
    const p = canvasPos(e);
    const hex = hexSousEcran(p.x, p.y);
    const state = scene.state;
    if (!hex || !state || !inRectangle(hex, state.mapWidth, state.mapHeight)) {
      tip = null;
      tipHex = null;
      return;
    }
    const key = tileKeyOf(hex);
    if (tipHex !== key) {
      tipHex = key;
      tip = { x: p.x, y: p.y, lines: buildTipLines(hex) };
      // 7o · R-155 : la lueur suit le survol des cases masquées à artefact.
      if (state.artifactPings?.length) updateArtefactPing(hex, state);
    } else if (tip) {
      tip = { ...tip, x: p.x, y: p.y };
    }
  }

  function onPointerLeave(): void {
    tip = null;
    tipHex = null;
    // FLECHE-MOUVEMENT : le curseur quitte la carte → plus de flèche de survol.
    if (hoverHex) effacerSurvol();
    // Le bouton droit relâché hors canvas ne confirmera jamais — préview coupée.
    droitMaintenu = false;
  }

  function onPointerMove(e: PointerEvent): void {
    updateTip(e);
    // MENU-VILLE : en vue ville, ni flèche de survol ni pan — le curseur ne
    // fait que lire le tooltip.
    if (vueVilleActif()) {
      pointer = null;
      return;
    }
    // FLECHE-MOUVEMENT : la flèche de survol suit le curseur même bouton
    // levé (pointer n'est posé qu'au pressé — logique dédiée, avant le
    // retour anticipé du pan).
    mettreAJourSurvol(e);
    if (!pointer) return;
    const p = canvasPos(e);
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    if (!dragging && Math.hypot(dx, dy) > PAN_THRESHOLD) dragging = true;
    if (dragging) {
      if (mode3dActif()) {
        stage3d!.cam.panBy(dx, dy, vh);
        stage3d!.cam.clamp(vw, vh);
      } else {
        camera.panBy(dx, dy);
        camera.clamp(bounds, vw, vh);
      }
      cameraChanged = true;
    }
    pointer = p;
  }

  function onPointerUp(e: PointerEvent): void {
    // RAFFINEMENT-MOUVEMENT : relâchement du CLIC DROIT MAINTENU — la
    // préview se tranche ici : case valide = ordre confirmé (`onRightClick`
    // → moveDraft), ailleurs = annulation (sémantique `rightClickAction`).
    // Le `contextmenu` qui suit sur souris réelle est neutralisé (droitTraite).
    if (e.button === 2) {
      if (!droitMaintenu) return;
      droitMaintenu = false;
      droitTraite = true;
      if (playback.active || !scene.view) return;
      const hex = hexSousEcran(canvasPos(e).x, canvasPos(e).y);
      if (hex) onRightClick(hex);
      return;
    }
    // CORRECTIFS-SELECTION (bogue souris réelle) : un pointerup du BOUTON DROIT
    // ne doit PAS déclencher la décision de clic gauche (sélection/désélection)
    // — sinon il court avant le `contextmenu` et l'unité est désélectionnée
    // avant que le clic droit (destination) ne soit traité.
    if (e.button !== 0) return;
    const p = canvasPos(e);
    const wasDragging = dragging;
    pointer = null;
    dragging = false;
    if (wasDragging) return;

    // Clic pendant le playback = accélérer (L4). Sinon : décision de clic pure.
    if (playback.active) {
      playback.skip();
      return;
    }
    if (!scene.view) return;
    // MENU-VILLE : en vue ville, le clic gauche n'assigne/désassigne que les
    // tuiles du rayon de travail (clickActionVueVille — pur). Toute autre
    // case : aucun effet (actions de carte inaccessibles).
    if (vueVilleActif()) {
      if (!vueVilleId) return;
      const hexVue = hexSousEcran(p.x, p.y);
      if (hexVue) onAction(clickActionVueVille(scene.view, vueVilleId, hexVue));
      return;
    }
    const hex = hexSousEcran(p.x, p.y);
    if (!hex) return;
    onAction(clickAction(scene.view, scene.ui, hex, positionsDessinees()));
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    // MENU-VILLE : le zoom molette est suspendu pendant la vue ville (la pose
    // est statique — l'échelle est celle de la vue).
    if (vueVilleActif()) return;
    const p = canvasPos(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const changed = mode3dActif()
      ? stage3d!.cam.zoomAt(p.x, p.y, vw, vh, factor)
      : camera.zoomAt(p.x, p.y, factor);
    if (changed) {
      if (mode3dActif()) stage3d!.cam.clamp(vw, vh);
      else camera.clamp(bounds, vw, vh);
      cameraChanged = true;
    }
  }

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    // MENU-VILLE : pas d'annulation d'ordre au clic droit pendant la vue ville.
    if (vueVilleActif()) return;
    // RAFFINEMENT-MOUVEMENT : si le relâchement du clic droit maintenu a déjà
    // tranché (confirmé/annulé), ne pas retraiter le même clic. Un clic droit
    // « synthétique » (tests GUI, hook dev) sans pointerdown passe ici comme
    // avant — comportement historique préservé.
    if (droitTraite) {
      droitTraite = false;
      return;
    }
    if (playback.active) return;
    if (!scene.view) return onCancelDraft();
    const hex = hexSousEcran(canvasPos(e).x, canvasPos(e).y);
    if (!hex) return;
    onRightClick(hex);
  }

  /**
   * MENU-VILLE — DOUBLE-CLIC (décisions d'Erik du 13/09) : sur une ville du
   * joueur → entrée en vue ville (zoom incliné + tuiles + menu dédié) ; en
   * vue ville, hors de la ville affichée → sortie. Le SIMPLE clic garde sa
   * sémantique inchangée (sélection / worked tiles) — le double-clic se
   * superpose sans conflit : les deux simples clics d'un double-clic sur une
   * ville sélectionnent puis désélectionnent, l'entrée en vue l'emporte à la
   * fin du geste.
   */
  function dblClickAtCanvas(p: { x: number; y: number }): void {
    if (playback.active || !scene.state) return;
    const hex = hexSousEcran(p.x, p.y);
    if (!hex) return;
    if (vueVilleActif()) {
      const ville = vueVilleId ? scene.state.cities[vueVilleId] : null;
      if (ville && (hex.q !== ville.q || hex.r !== ville.r)) onExitVueVille?.();
      return;
    }
    for (const city of Object.values(scene.state.cities)) {
      if (city.q === hex.q && city.r === hex.r && city.owner === scene.myId) {
        onEnterVueVille?.(city.id);
        return;
      }
    }
  }

  function onDblClick(e: MouseEvent): void {
    dblClickAtCanvas(canvasPos(e));
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // MENU-VILLE : Échap sort d'abord de la vue ville (voie de sortie 2).
      if (vueVilleActif()) {
        onExitVueVille?.();
        return;
      }
      // RAFFINEMENT-MOUVEMENT : Échap coupe la préview du clic maintenu.
      droitMaintenu = false;
      onCancelDraft();
      onAction({ kind: 'deselect' });
    } else if (e.key === 'Enter' && scene.ui.draft && scene.ui.draft.path.length > 0) {
      onConfirmDraft?.();
    } else if (e.key === 'f' || e.key === 'F') {
      const tile = selectedTileOf();
      if (tile) centerOnHex(tile);
    }
  }

  function centerOnHex(hex: Hex): void {
    if (!app) return;
    if (mode3dActif()) {
      const { x, z } = hexWorldPos(hex);
      stage3d!.cam.centerOn(x, z);
      stage3d!.cam.clamp(vw, vh);
      cameraChanged = true;
      return;
    }
    const p = hexToPixel(hex, HEX_SIZE);
    camera.centerOn(p.x, p.y, vw, vh);
    camera.clamp(bounds, vw, vh);
    cameraChanged = true;
  }

  function centerOnUnit(unitId: string): void {
    const unit = scene.state?.units[unitId];
    if (unit) centerOnHex(unit);
  }

  // ---------------------------------------------------------------------
  // Cycle de vie
  // ---------------------------------------------------------------------

  $effect(() => {
    void mode3d; // bascule 2D ↔ 3D : remontage complet du rendu (flag de repli)
    void setup();
    return () => {
      teardown();
    };
  });
  onDestroy(() => teardown());

  async function setup(): Promise<void> {
    disposed = false;
    // Chaque montage recentre la vue (le drapeau survit au teardown — bascule 2D ↔ 3D).
    centered = false;
    if (!host) return;
    // Chantier V1 (L3) : en 3D, le canvas Three.js est posé SOUS le canvas
    // PixiJS (posé ensuite) — il reçoit les entrées via Pixi au-dessus.
    if (mode3d && !canvas3d) {
      canvas3d = document.createElement('canvas');
      canvas3d.style.position = 'absolute';
      canvas3d.style.inset = '0';
      host.appendChild(canvas3d);
    }
    const application = new Application();
    await application.init({
      ...(mode3d ? { backgroundAlpha: 0 } : { background: '#141a20' }),
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      width: host.clientWidth || 800,
      height: host.clientHeight || 600,
    });
    if (disposed) {
      application.destroy(true, { children: true, texture: true, textureSource: true });
      return;
    }
    app = application;
    host.appendChild(application.canvas);
    if (mode3d && canvas3d) {
      // Superposition stricte : le canvas Pixi (entités + surcouche) doit
      // recouvrir exactement le canvas 3D, sinon les entrées partent sur le
      // canvas Three et les entités défilent hors du cadre.
      application.canvas.style.position = 'absolute';
      application.canvas.style.inset = '0';
    }

    // Assets réels (/art/, SPEC-ART) avec fallback placeholder fichier par fichier.
    textures = await loadTextures(application.renderer);
    // CORRECTIFS-PILE (course de chargement) : si une vue est arrivée PENDANT
    // l'await, le rebuild consommé par le tick est reparti sans textures
    // (early-return) et les sprites gardaient une pose moteur périmée
    // (position optimiste absente) jusqu'à la prochaine vue — on ré-invalide.
    entitiesDirty = true;
    overlayDirty = true;
    world = new Container();
    tilesLayer = new Container();
    resourceLayer = new Container();
    overlayLayer = new Container();
    entitiesLayer = new Container();
    effectsLayer = new Container();
    world.addChild(tilesLayer, resourceLayer, overlayLayer, entitiesLayer, effectsLayer);
    application.stage.addChild(world);
    if (mode3d && canvas3d) {
      // Terrain en 3D ; les icônes de ressources 2D sont masquées (les
      // glyphes de ressource dédiés restent 🔶 V2 — pas de double lecture).
      tilesLayer.visible = false;
      resourceLayer.visible = false;
      stage3d = new Stage3D(canvas3d);
      stage3d.setBloom(false); // 🔶 calibrage bloom (rapport L0 §9) : éteint dans le jeu
      stage3d.resize(vw, vh);
      terrain3d = new TerrainWorld(stage3d.scene, { capacity: 1700, bloom: false });
      // V2 : Mainframe, cartes-ressources, cratère, huttes/villages (instanciés).
      structures3d = new StructuresWorld({ capacityTuiles: 1700, capacityVilles: 64 });
      stage3d.scene.add(structures3d.group);
      // Fonderie T3 : les modèles .glb du catalogue sont préchargés une fois
      // par fichier ; à chaque chargement, on relance la mise à jour (les
      // unités apparaissent dès que leur modèle est prêt).
      unitesGlb = new UnitesGLBWorld(new ChargeurModelesGLB(), () => { entitiesDirty = true; });
      unitesGlb.precharger(
        Object.values(MODELES_UNITES3D).flatMap((e) => (e.kind === 'glb' ? [e.glb] : [])),
      );
      stage3d.scene.add(unitesGlb.group);
      // VILLE-TRIPO T2 : la ville est un .glb (spec §structures.ville3d) —
      // même pipeline, monde dédié (stats distinctes des unités).
      if (VILLE3D && VILLE3D.kind === 'glb') {
        villesGlb = new UnitesGLBWorld(new ChargeurModelesGLB(), () => { entitiesDirty = true; });
        villesGlb.precharger([VILLE3D.glb]);
        stage3d.scene.add(villesGlb.group);
      }
      // VILLAGE barbare .glb (idem ville, sans teinte).
      if (VILLAGE_BARBARE3D && VILLAGE_BARBARE3D.kind === 'glb') {
        villagesGlb = new UnitesGLBWorld(new ChargeurModelesGLB(), () => { entitiesDirty = true; });
        villagesGlb.precharger([VILLAGE_BARBARE3D.glb]);
        stage3d.scene.add(villagesGlb.group);
      }
      // HUTTE .glb (idem, sans teinte).
      if (HUTTE_TRIPO3D && HUTTE_TRIPO3D.kind === 'glb') {
        huttesGlb = new UnitesGLBWorld(new ChargeurModelesGLB(), () => { entitiesDirty = true; });
        huttesGlb.precharger([HUTTE_TRIPO3D.glb]);
        stage3d.scene.add(huttesGlb.group);
      }
      // TUILE prairie .glb (recouvrement, sans teinte) — capacité 2048.
      // (+ variante plaine grenier, cf. TUILE_PLAINE_GRENIER3D.)
      const tuilesGlbSpecs = [TUILE_PRAIRIE3D, TUILE_PLAINE3D, TUILE_PLAINE_GRENIER3D, TUILE_MONTAGNE3D, TUILE_COLLINE3D]
        .filter((e): e is Extract<typeof e, { kind: 'glb' }> => e !== null && e.kind === 'glb');
      const tuilesGlbFichiers = tuilesGlbSpecs.map((e) => e.glb);
      if (tuilesGlbFichiers.length > 0) {
        prairiesGlb = new UnitesGLBWorld(new ChargeurModelesGLB(), () => { entitiesDirty = true; }, 2048);
        prairiesGlb.precharger(tuilesGlbFichiers);
        stage3d.scene.add(prairiesGlb.group);
      }
      // TRAVAIL-VILLE-3D : contours 3D des worked tiles + rayon de cultivation.
      marqueurs3d = new Marqueurs3D();
      stage3d.scene.add(marqueurs3d.group);
      if (scene.state) {
        stage3d.cam.bounds = mapBoundsWorld(scene.state.mapWidth, scene.state.mapHeight);
        rendement = contexteRendement(scene.state, scene.myId);
      }
      // La caméra 2D n'est plus la source de vérité : recentre la 3D sur la
      // même cible (maybeCenter repart de `centered` si déjà fait).
      centered = false;
    }

    vw = host.clientWidth || 800;
    vh = host.clientHeight || 600;
    bounds = scene.state ? mapBounds(HEX_SIZE, scene.state.mapWidth, scene.state.mapHeight) : { x: 0, y: 0, w: 1, h: 1 };

    const canvas = application.canvas;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', () => {
      pointer = null;
      dragging = false;
    });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);

    // 7n · Hook de TEST (dev uniquement) : pilotage déterministe de la
    // sélection et accès caméra pour les vérifications GUI automatisées.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__game = {
        clickHex: (q: number, r: number) => onAction(clickAction(scene.view!, scene.ui, { q, r }, positionsDessinees())),
        // PILE-AFFICHÉE (sonde debug) : positions dessinées + aperçus + piles.
        sondePile: () => {
          const positions = positionsDessinees();
          const sprites: Record<string, unknown> = {};
          for (const [id, c] of unitSprites) {
            const t = c as Container & { __wx?: number; __wy?: number };
            sprites[id] = { x: Math.round(c.x), y: Math.round(c.y), wx: t.__wx, wy: t.__wy };
          }
          return {
            positions: Object.fromEntries(positions),
            previews: scenePreviews.map((p) => ({ unitId: p.unitId, path: p.path, destination: p.destination })),
            piles: Object.fromEntries(pilesAffichees(scene.state!, positions)),
            myId: scene.myId,
            sprites,
            playback: { actif: playback.active, moves: [...playback.moves.keys()] },
            tickError: (window as unknown as Record<string, unknown>).__tickError ?? null,
          };
        },
        // CORRECTIFS-SELECTION : miroir clic droit (destination) — vérifications GUI.
        rightClickHex: (q: number, r: number) => onRightClick({ q, r }),
        // Picking réel (2D ou 3D selon le flag) — vérifications GUI automatisées.
        pickAt: (x: number, y: number) => { const h = hexSousEcran(x, y); return h ? `${h.q},${h.r}` : null; },
        centerOn: (q: number, r: number) => centerOnHex({ q, r }),
        camera: () => ({ x: camera.x, y: camera.y, scale: camera.scale }),
        // Fonderie : accès lecture à la scène 3D (mesure des poses .glb réelles).
        scene3d: () => stage3d?.scene ?? null,
        // VUE VILLE : état + pose courante (vérifications GUI automatisées).
        vueVille: () => ({ id: vueVilleId, actif: vueVilleActif(), pose: poseVueCourante() }),
        // CORRECTIFS-VUE-VILLE : visibilité des sprites d'unités — le cycle
        // entrée → sortie de vue ville doit TOUJOURS les restaurer
        // (vérifications GUI des 3 chemins de sortie).
        unites: () => ({ total: unitSprites.size, visibles: [...unitSprites.values()].filter((c) => c.visible).length }),
        // MENU-VILLE : miroir du double-clic (entrée/sortie de vue ville).
        doubleClickAt: (x: number, y: number) => dblClickAtCanvas({ x, y }),
        screenOf: (q: number, r: number) => {
          if (mode3dActif()) {
            const { x, z } = hexWorldPos({ q, r });
            const p = stage3d!.cam.project(
              new THREE.Vector3(x, elevationDe(scene.state?.map[tileKeyOf({ q, r })]?.terrain) + 0.05, z),
              vw, vh,
            );
            return p ? { x: p.x, y: p.y } : null;
          }
          const w = hexToPixel({ q, r }, HEX_SIZE);
          // MENU-VILLE : la pose courante (vue ville comprise — zoom à plat).
          const pose = poseVueCourante();
          return { x: w.x * pose.scale + pose.x, y: w.y * pose.scale + pose.y };
        },
        // V2 : statistiques de la couche structures 3D (vérifications GUI/e2e) —
        // détail par pool (unités 3D visibles ? cf. unites3d). Fonderie T3 :
        // stats du calque .glb (unites/pools/lignes/manquants).
        structures: () => (structures3d ? { ...structures3d.stats, details: dernierPlanStructures ? detailsPools(dernierPlanStructures) : null, glb: unitesGlb ? { ...unitesGlb.stats, entrees: dernierPlanGlb } : null } : null),
      };
    }

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !app) return;
      vw = Math.max(1, entry.contentRect.width);
      vh = Math.max(1, entry.contentRect.height);
      app.renderer.resize(vw, vh);
      marqueurs3d?.resize(vw, vh);
      if (stage3d) {
        stage3d.resize(vw, vh);
        stage3d.cam.clamp(vw, vh);
      }
      camera.clamp(bounds, vw, vh);
      cameraChanged = true;
      tilesDirty = true;
      // MENU-VILLE : la pose de vue ville suit les nouvelles dimensions —
      // la ville reste centrée dans l'espace libre, tout le rayon tient.
      if (vueVilleActif()) {
        const cible = poseVueVilleCible();
        if (cible) {
          if (vueAnim) vueAnim.to = cible;
          else {
            vuePose = cible;
            appliquerPoseVue(cible);
          }
        }
        cameraChanged = false; // la pose de vue ville prime pendant la vue
      }
    });
    resizeObserver.observe(host);

    const application2 = app;
    // Boucle hybride : requestAnimationFrame en priorité (fluide), avec timer
    // de secours si rAF est suspendu (onglet arrière-plan, rAF bridé) — le
    // rendu et le playback ne dépendent alors que d'un setInterval.
    lastFrame = performance.now();
    let lastRaf = lastFrame;
    const step = (): void => {
      const now = performance.now();
      tick(Math.min(100, now - lastFrame));
      lastFrame = now;
      stage3d?.render();
      application2.renderer.render(application2.stage);
    };
    const rafLoop = (): void => {
      lastRaf = performance.now();
      step();
      rafId = requestAnimationFrame(rafLoop);
    };
    rafId = requestAnimationFrame(rafLoop);
    fallbackInterval = setInterval(() => {
      // rAF vivant (< 400 ms) : rien à faire. Sinon, rendre quand même.
      if (performance.now() - lastRaf < 400) return;
      step();
    }, 33);

    unsubscribes.push(client.view.subscribe(onNewView));
    unsubscribes.push(ui.subscribe(onNewUi));
    maybeCenter();
    onReady?.({ centerOnHex, centerOnUnit });
    // Debug console (dev uniquement) : état interne inspectable via la console.
    (window as unknown as Record<string, unknown>).__gameCanvas = {
      /** Centre la caméra sur une case (debug/tests). */
      centerOn(hex: Hex): void {
        centerOnHex(hex);
      },
      /** Coordonnées PAGE du centre d'une case (caméra ou vue ville) — debug/tests. */
      hexToPage(hex: Hex): { x: number; y: number } | null {
        const p = hexToPixel(hex, HEX_SIZE);
        const pose = poseVueCourante();
        const rect = host.getBoundingClientRect();
        return { x: rect.x + p.x * pose.scale + pose.x, y: rect.y + p.y * pose.scale + pose.y };
      },
      exportPng(): string | null {
        if (!app) return null;
        // Extraction via PixiJS (le drawing buffer WebGL est vidé après compositing).
        const c = app.renderer.extract.canvas(app.stage) as HTMLCanvasElement;
        return c.toDataURL("image/png");
      },
      sprites(): Array<{ layer: string; label: string; x: number; y: number; scale: number; children: number; detail: string[] }> {
    const dump: Array<{ layer: string; label: string; x: number; y: number; scale: number; children: number; detail: string[] }> = [];
    const walk = (layer: Container, name: string): void => {
      for (const child of layer.children) {
        dump.push({
          layer: name, label: String(child.label ?? ""), x: Math.round(child.x), y: Math.round(child.y),
          scale: child.scale.x, children: child.children.length,
          // V2-unités3D : détail des sous-enfants (base/accent masqués si le
          // modèle 3D est le rendu — preuve e2e du sprite caché).
          detail: child.children.map((g) => `${String(g.label ?? '?')}:${g.visible ? 'v' : 'CACHE'}`),
        });
      }
    };
    walk(tilesLayer, "tiles");
    walk(resourceLayer, "resources");
    walk(entitiesLayer, "entities");
    walk(overlayLayer, "overlay");
    walk(effectsLayer, "effects");
    return dump;
      },
      get stats() {
        return {
          frames,
          ui: scene.ui,
          hasTextures: !!textures,
          state: !!scene.state,
          myId: scene.myId,
          explored: scene.explored.size,
          visible: scene.visible.size,
          mapKeys: scene.state ? Object.keys(scene.state.map).length : 0,
          firstMapKeys: scene.state ? Object.keys(scene.state.map).slice(0, 3) : [],
          tileSprites: tileSprites.size,
          unitSprites: unitSprites.size,
          citySprites: citySprites.size,
          camera: { x: camera.x, y: camera.y, scale: camera.scale },
          orders: scene.orders.length,
          previews: scenePreviews.length,
          bounds,
          vw,
          vh,
        };
      },
    };
  }

  function teardown(): void {
    if (disposed) return;
    disposed = true;
    for (const u of unsubscribes) u();
    resizeObserver?.disconnect();
    if (rafId) cancelAnimationFrame(rafId);
    if (fallbackInterval !== null) clearInterval(fallbackInterval);
    if (structures3d) {
      structures3d.dispose();
      structures3d = null;
    }
    if (unitesGlb) {
      unitesGlb.dispose();
      unitesGlb = null;
    }
    if (villesGlb) {
      villesGlb.dispose();
      villesGlb = null;
    }
    if (villagesGlb) {
      villagesGlb.dispose();
      villagesGlb = null;
    }
    if (huttesGlb) {
      huttesGlb.dispose();
      huttesGlb = null;
    }
    if (prairiesGlb) {
      prairiesGlb.dispose();
      prairiesGlb = null;
    }
    if (marqueurs3d) {
      marqueurs3d.dispose();
      marqueurs3d = null;
    }
    if (terrain3d) {
      terrain3d.dispose();
      terrain3d = null;
    }
    if (stage3d) {
      stage3d.dispose();
      stage3d = null;
    }
    if (canvas3d) {
      canvas3d.remove();
      canvas3d = null;
    }
    if (app) {
      const canvas = app.canvas;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('keydown', onKey);
      app.destroy(true, { children: true, texture: true, textureSource: true });
      app = null;
    }
    // app.destroy détruit tous les conteneurs : les caches de sprites doivent
    // être purgés, sinon le remontage (bascule 2D ↔ 3D) réutilise des objets
    // détruits — position null, crash du ticker (poser3d / rebuild*).
    tileSprites.clear();
    resourceSprites.clear();
    unitSprites.clear();
    citySprites.clear();
    villageSprites.clear();
    hutSprites.clear();
    artefactSprites.clear();
    artefactPingGlow = null;
    textures = null;
    world = new Container();
    tilesLayer = new Container();
    resourceLayer = new Container();
    overlayLayer = new Container();
    entitiesLayer = new Container();
    effectsLayer = new Container();
  }
</script>

<div class="canvas-host" bind:this={host} aria-label="Carte de partie">
  {#if tip}
    <div class="tile-tip" aria-hidden="true" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px">
      {#each tip.lines as line, i (i)}
        <div class:primary={i === 0}>{line}</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .canvas-host {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #141a20;
  }
  .canvas-host :global(canvas) {
    display: block;
    touch-action: none;
    cursor: grab;
  }
  /* Tooltip de survol (Phase 6c) : nom du terrain + entités — jamais cliquable. */
  .tile-tip {
    position: absolute;
    z-index: 20;
    pointer-events: none;
    background: rgba(16, 20, 26, 0.92);
    color: #e8eaee;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
    padding: 3px 8px;
    font: 12px/1.45 system-ui, sans-serif;
    white-space: nowrap;
    max-width: 16rem;
  }
  .tile-tip .primary {
    font-weight: 600;
    color: #ffffff;
  }
</style>
