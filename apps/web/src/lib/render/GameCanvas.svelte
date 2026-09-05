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
  import { hexToPixel, inRectangle, tileKeyOf, unitType, ARTEFACTS, BUILDINGS, RESOURCES, RESOURCE_UNKNOWN, TERRAINS, resourceBonus, BARBARIAN_ID, BARBARIANS } from '@game/rules';
  import type { GameState, Hex } from '@game/rules';
  import type { Order } from '@game/shared';
  import { onDestroy } from 'svelte';
  import type { GameClient, GameView } from '../gameClient.js';
  import type { UiState, UiStore } from './ui.js';
  import type { Playback } from './playback.js';
  import { Camera } from './camera.js';
  import { loadTextures, playerColor } from './textures.js';
  import type { GameTextures } from './textures.js';
  import { HEX_SIZE, hexesInRect, mapBounds, screenToHex } from './hexView.js';
  import { arrowHeadPoints, dashSegments, segmentsOf } from './arrows.js';
  import type { Point } from './arrows.js';
  import { clickAction, myEngineId } from './interaction.js';
  import type { ClickAction } from './interaction.js';
  // Chantier V1 (L3) — couche hybride : terrain Three.js + sprites PixiJS
  // projetés (option B du spike), derrière un flag de repli (défaut : 2D).
  import { Stage3D } from '../render3d/stage3d.js';
  import { TerrainWorld, mapBoundsWorld, pickHex3D, hexWorldPos, hexAtWorld } from '../render3d/world3d.js';
  import type { TileDraw } from '../render3d/world3d.js';
  import { elevationDe } from '../render3d/optionA.js';
  import { contexteRendement, allumeDe } from '../render3d/rendement.js';
  import type { ContexteRendement } from '../render3d/rendement.js';

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
    /** Chantier V1 (L3) : terrain en vraie 3D (option B hybride) — flag de
     *  repli, DÉFAUT FAUX (rendu 2D conservé jusqu'à l'acceptation d'Erik). */
    mode3d?: boolean;
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
    mode3d = false,
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
    entitiesLayer.visible = !hideEntities;
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

  // --- Chantier V1 (L3) : couche 3D hybride (terrain Three.js en fond, les
  // entités/surcouche PixiJS restent projetées par la caméra 3D partagée). ---
  let stage3d: Stage3D | null = null;
  let terrain3d: TerrainWorld | null = null;
  let canvas3d: HTMLCanvasElement | null = null;
  let rendement: ContexteRendement | null = null;
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
    const rect = camera.worldRect(vw, vh);
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

  function hpBarColor(ratio: number): number {
    if (ratio > 0.66) return 0x4caf50;
    if (ratio > 0.33) return 0xffc107;
    return 0xe53935;
  }

  function rebuildEntities(): void {
    if (!app || !textures || !scene.state) return;
    const state = scene.state;
    const seenUnits = new Set<string>();
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
      const p = hexToPixel(unit, HEX_SIZE);
      const anim = playback.moveOf(unit.id);
      if (anim) {
        // poser3d et non position.set : le tampon monde (__wx/__wy) doit
        // toujours exister, sinon la reprojection 3D ignore l'enfant
        // (continue) et le sprite reste à ses px bruts = hors champ.
        const a = hexToPixel(anim.from, HEX_SIZE);
        const b = hexToPixel(anim.to, HEX_SIZE);
        poser3d(c, a.x + (b.x - a.x) * anim.t, a.y + (b.y - a.y) * anim.t);
      } else {
        poser3d(c, p.x, p.y);
      }
      // PV (override de combat pendant le playback).
      const hp = playback.hpOf(unit.id, unit.hp);
      const ratio = Math.max(0, Math.min(1, hp / unitType(unit.type).hpMax));
      const fill = c.getChildByLabel('hpFill') as Sprite | null;
      // 7j : garde-fou — un type sans sprite (données éditées) ne doit pas
      // tuer la boucle de rendu (le crash du ticker gelait les clics carte).
      if (fill) {
        fill.width = 76 * ratio;
        fill.tint = hpBarColor(ratio);
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

    const seenCities = new Set<string>();
    for (const city of Object.values(state.cities)) {
      if (!scene.visible.has(tileKeyOf(city))) continue;
      seenCities.add(city.id);
      let c = citySprites.get(city.id);
      if (!c) {
        c = buildCityContainer(city.id, city.capital, city.owner);
        entitiesLayer.addChild(c);
        citySprites.set(city.id, c);
      }
      const p = hexToPixel(city, HEX_SIZE);
      poser3d(c, p.x, p.y);
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
        entitiesLayer.addChild(c);
        villageSprites.set(village.id, c);
      }
      const p = hexToPixel(village, HEX_SIZE);
      poser3d(c, p.x, p.y);
      const tint = scene.visible.has(key) ? 0xffffff : 0x70707e;
      const accent = c.getChildByLabel('accent') as Sprite;
      if (accent) accent.tint = tint;
      const base = c.getChildByLabel('base') as Sprite;
      if (base) base.tint = tint;
      // PV du village (T-21) : barre rouge → destruction imminente lisible.
      const fill = c.getChildByLabel('hpFill') as Sprite;
      const ratio = Math.max(0, Math.min(1, village.hp / BARBARIANS.villageHP));
      fill.width = 76 * ratio;
      fill.tint = hpBarColor(ratio);
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
        entitiesLayer.addChild(c);
        hutSprites.set(hut.id, c);
      }
      const p = hexToPixel(hut, HEX_SIZE);
      poser3d(c, p.x, p.y);
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
    // (`barbare_<type>`, accent gris-brun via playerColor('barbarien')).
    const tex =
      owner === BARBARIAN_ID
        ? (textures!.units[`barbare_${type}`] ?? textures!.units[type])
        : textures!.units[type];
    if (!tex) return c; // type d'unité sans placeholder (ne devrait pas arriver en v1)
    const color = playerColor(owner);
    const base = new Sprite(tex.base);
    base.anchor.set(0.5, 1);
    base.scale.set(0.5);
    base.y = 10;
    const accent = new Sprite(tex.accent);
    accent.anchor.set(0.5, 1);
    accent.scale.set(0.5);
    accent.y = 10;
    accent.tint = color;
    const bg = new Sprite(textures!.px);
    bg.width = 80;
    bg.height = 10;
    bg.tint = 0x1b1b22;
    bg.position.set(-40, -158);
    const fill = new Sprite(textures!.px);
    fill.label = 'hpFill';
    fill.height = 10;
    fill.position.set(-38, -156);
    c.addChild(base, accent, bg, fill);
    // Écu de fortification (R-33) : petit bouclier bleu au-dessus du PV, caché par défaut.
    const shield = new Graphics();
    shield.label = 'fortify';
    shield.moveTo(0, -178).lineTo(12, -172).lineTo(12, -162).quadraticCurveTo(12, -152, 0, -148).quadraticCurveTo(-12, -152, -12, -162).lineTo(-12, -172).closePath().fill({ color: 0x90caf9 }).stroke({ width: 2, color: 0x1b3a5c });
    shield.visible = false;
    c.addChild(shield);
    // 7g · R-117 : indicateur de CHARGE (petit point ambré) — visible quand le
    // transport porte une unité embarquée.
    const cargoDot = new Graphics();
    cargoDot.label = 'cargo';
    cargoDot.circle(30, -150, 7).fill({ color: 0xffcc80 }).stroke({ width: 2, color: 0x1b1b22 });
    cargoDot.visible = false;
    c.addChild(cargoDot);
    // 7m · R-142/R-144 : badge ESPION EN VILLE (œil ambré à gauche) — garnison
    // (contre-espionnage) ou infiltration, selon le propriétaire de la ville.
    const spyBadge = new Graphics();
    spyBadge.label = 'spybadge';
    spyBadge.ellipse(-30, -150, 10, 6).fill({ color: 0xffb74d }).stroke({ width: 2, color: 0x1b1b22 });
    spyBadge.circle(-30, -150, 3).fill({ color: 0x1b1b22 });
    spyBadge.visible = false;
    c.addChild(spyBadge);
    c.label = unitId;
    return c;
  }

  function buildCityContainer(cityId: string, capital: boolean, owner: string): Container {
    const c = new Container();
    const tex = capital ? textures!.cities.capital : textures!.cities.settlement;
    const base = new Sprite(tex.base);
    base.anchor.set(0.5, 1);
    base.scale.set(0.5);
    base.y = 58;
    const accent = new Sprite(tex.accent);
    accent.anchor.set(0.5, 1);
    accent.scale.set(0.5);
    accent.y = 58;
    accent.tint = playerColor(owner);
    const prodFill = new Sprite(textures!.px);
    prodFill.label = 'prodFill';
    prodFill.height = 8;
    prodFill.tint = 0xf0c419;
    prodFill.position.set(-38, 26);
    const popBg = new Graphics();
    popBg.circle(52, -66, 15).fill({ color: 0x1b1b22, alpha: 0.85 });
    const popText = new Text({
      text: '1',
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 20, fill: 0xffffff, fontWeight: '700' },
    });
    popText.label = 'pop';
    popText.anchor.set(0.5, 0.5);
    popText.position.set(52, -66);
    c.addChild(base, accent, prodFill, popBg, popText);
    c.label = cityId;
    return c;
  }

  /** R-96 (Phase 7d) : village barbare (tente/camp, accent gris-brun) + PV. */
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
    const bg = new Sprite(textures!.px);
    bg.width = 80;
    bg.height = 10;
    bg.tint = 0x1b1b22;
    bg.position.set(-40, 30);
    const fill = new Sprite(textures!.px);
    fill.label = 'hpFill';
    fill.height = 10;
    fill.position.set(-38, 32);
    fill.tint = hpBarColor(1);
    c.addChild(base, accent, bg, fill);
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

    // Possession des cases de ville (frontière couleur joueur).
    for (const city of Object.values(scene.state.cities)) {
      if (!scene.explored.has(tileKeyOf(city))) continue;
      const gr = new Graphics();
      gr.poly(hexLocalPoints(HEX_SIZE - 6)).stroke({ width: 4, color: playerColor(city.owner), alpha: 0.9 });
      gr.position.copyFrom(hexToPixel(city, HEX_SIZE));
      overlayLayer.addChild(gr);
    }

    // Cases travaillées (R-60, Phase 6) : cadre de la couleur du propriétaire
    // sur chaque case travaillée par une ville visible (la ville sélectionnée
    // reçoit en plus un cadre intérieur plus marqué).
    for (const city of Object.values(scene.state.cities)) {
      if (!scene.explored.has(tileKeyOf(city))) continue;
      if (!city.workedTiles || city.workedTiles.length === 0) continue;
      const color = playerColor(city.owner);
      for (const key of city.workedTiles) {
        const [q, r] = key.split(',').map(Number);
        if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
        const gr = new Graphics();
        gr.poly(hexLocalPoints(HEX_SIZE - 14)).stroke({ width: 3, color, alpha: 0.9 });
        gr.poly(hexLocalPoints(HEX_SIZE - 22)).stroke({ width: 1.5, color, alpha: 0.5 });
        gr.position.copyFrom(hexToPixel({ q, r }, HEX_SIZE));
        overlayLayer.addChild(gr);
      }
    }

    // Overlay des rendements (Phase 6 L3, masquable) : sur chaque case
    // explorée à rendements, une ligne par ressource non nulle — icône
    // (nourriture / production / commerce) + valeur générée. Phase 7b (R-90) :
    // les cases TRAVAILLÉES par une ville (et la case de ville elle-même)
    // affichent or/science selon la conversion de cette ville au lieu du
    // commerce ; les cases non travaillées gardent le commerce (potentiel).
    if (showYields) {
      const workedBy = workedTileOwner();
      // R-93 : le bonus de la ressource identifiée et accessible au joueur
      // s'ajoute aux rendements du terrain dans l'affichage, comme dans
      // tileYield. Le marqueur « inconnue » (R-92) n'est pas dans RESOURCES :
      // jamais de bonus affiché pour une identité masquée.
      const viewerTechs = scene.myId ? (scene.state.players[scene.myId]?.techsUnlocked ?? []) : [];
      for (const [key, tile] of Object.entries(scene.state.map)) {
        if (!scene.explored.has(key)) continue;
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
        const converter = workedBy.get(key);
        const rows: Array<{ icon: Texture | null; count: number; tint: number }> = [];
        if (y.food !== 0) rows.push({ icon: textures!.yieldIcons.food, count: y.food, tint: 0xffffff });
        if (y.production !== 0) rows.push({ icon: textures!.yieldIcons.production, count: y.production, tint: 0xffffff });
        if (y.commerce !== 0) {
          // Case travaillée : le commerce est converti (R-90) — or ou science.
          const icon =
            converter
              ? converter.conversion === 'science'
                ? textures!.yieldIcons.science
                : textures!.yieldIcons.gold
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

    // Réassignations en attente (R-60) : retour immédiat — anneau pointillé
    // sur la case demandée (+) et sur le citoyen qui sera retiré (−, dernier
    // de la liste, même règle que le moteur).
    for (const order of scene.orders) {
      if (order.type !== 'SetWorkedTile') continue;
      const city = scene.state.cities[order.cityId];
      if (!city || !scene.explored.has(tileKeyOf(city))) continue;
      const color = playerColor(city.owner);
      if (order.tile !== null) {
        const [q, r] = order.tile.split(',').map(Number);
        if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
        drawPendingMarker({ q, r }, color, true);
      } else {
        const last = city.workedTiles[city.workedTiles.length - 1];
        if (last) {
          const [q, r] = last.split(',').map(Number);
          if (q !== undefined && r !== undefined && !Number.isNaN(q) && !Number.isNaN(r)) {
            drawPendingMarker({ q, r }, color, false);
          }
        }
      }
    }

    // Ordres de déplacement PERSISTANTS (Phase 5.5 L1) : flèche de l'origine
    // à la destination, tête sur la case d'arrivée. Ordre actif (miroir
    // OrderAck) = trait plein jaune ; chemin gelé (unit.order restant après
    // une halte, R-40) = pointillé atténué. Effacés à la résolution
    // (TurnResult : orders=[] et unit.order consommé) ou à l'annulation
    // (CancelOrder → OrderAck rejeté/remplacement → reconstruit ici).
    const solidUnits = new Set<string>();
    for (const order of scene.orders) {
      if (order.type === 'Move' && order.path.length > 0) {
        const origin = scene.state.units[order.unitId];
        if (!origin) continue;
        solidUnits.add(order.unitId);
        drawArrow(hexToPixel(origin, HEX_SIZE), order.path, 0xf0c419, 0.9, false);
      } else if (order.type === 'Attack') {
        const gr = new Graphics();
        drawCross(gr, 18, 0xd64545);
        gr.position.copyFrom(hexToPixel(order.target, HEX_SIZE));
        overlayLayer.addChild(gr);
      }
    }
    // Chemins gelés : reste de chemin qui s'exécutera à la prochaine
    // résolution — variante atténuée/pointillée (état déjà modélisé par
    // unit.order côté panneau). Masqué si un ordre actif remplace l'unité.
    for (const unit of Object.values(scene.state.units)) {
      if (unit.owner !== scene.myId) continue;
      if (solidUnits.has(unit.id)) continue;
      if (unit.order?.type === 'Move' && unit.order.path.length > 0) {
        drawArrow(hexToPixel(unit, HEX_SIZE), unit.order.path, 0xf0c419, 0.4, true);
      }
    }

    // Brouillon de chemin en construction (L3).
    if (scene.ui.draft && scene.ui.draft.path.length > 0) {
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

    // Sélection (anneau hexagonal).
    const selectedTile: { q: number; r: number } | null = selectedTileOf();
    if (selectedTile) {
      const gr = new Graphics();
      gr.poly(hexLocalPoints(HEX_SIZE - 8)).stroke({ width: 5, color: 0xffe082 });
      gr.poly(hexLocalPoints(HEX_SIZE - 16)).stroke({ width: 2, color: 0x2b2620, alpha: 0.6 });
      gr.position.copyFrom(hexToPixel(selectedTile, HEX_SIZE));
      overlayLayer.addChild(gr);
    }
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
      if (unit) return { q: unit.q, r: unit.r };
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

  /** Réassignation en attente (R-60) : anneau pointillé + signe + / −. */
  function drawPendingMarker(hex: Hex, color: number, assign: boolean): void {
    const gr = new Graphics();
    gr.poly(hexLocalPoints(HEX_SIZE - 18)).stroke({ width: 3, color, alpha: 0.95 });
    // Pointillés : tirets sur les 6 côtés — approximation avec 6 arcs pleins
    // espacés (petits segments aux sommets internes).
    gr.circle(0, 0, 9).fill({ color: 0x1b1b22, alpha: 0.85 }).stroke({ width: 2, color, alpha: 1 });
    const s = 5;
    if (assign) {
      gr.moveTo(-s, 0).lineTo(s, 0).moveTo(0, -s).lineTo(0, s).stroke({ width: 2.5, color: 0xffffff });
    } else {
      gr.moveTo(-s, 0).lineTo(s, 0).stroke({ width: 2.5, color: 0xffffff });
    }
    gr.position.copyFrom(hexToPixel(hex, HEX_SIZE));
    overlayLayer.addChild(gr);
  }

  /** Flèche persistante d'un ordre Move (Phase 5.5 L1) : tracé + tête pleine. */
  function drawArrow(
    origin: { x: number; y: number },
    path: Hex[],
    color: number,
    alpha: number,
    dashed: boolean,
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
    gr.poly(arrowHeadPoints(lastFrom, lastTo).flatMap((p) => [p.x, p.y])).fill({ color, alpha: Math.min(1, alpha + 0.1) });
    (gr as Suivable).__suivi3d = { points, width: 6, color, alpha, dashed, tete: true, pastille: true };
    overlayLayer.addChild(gr);
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
    }
    if (cameraChanged) {
      if (!mode3dActif()) {
        world.position.set(camera.x, camera.y);
        world.scale.set(camera.scale);
      }
      cameraChanged = false;
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
      rebuildEffects();
    }
    if (mode3dActif()) {
      projeterCalques3d();
      terrain3d!.tick(dt / 1000, true);
      terrain3d!.breathe(now / 1000, true);
    }
    if (playback.active !== lastPlaybackActive) {
      lastPlaybackActive = playback.active;
      if (!playback.active) rebuildEffects(); // purge : aucune annonce/effet résiduel après la relecture
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
    terrain3d.update(tiles);
  }

  /** Hex sous un point écran — 3D : picking analytique partagé ; 2D : mapping linéaire. */
  function hexSousEcran(x: number, y: number): Hex | null {
    if (mode3dActif()) {
      return pickHex3D(x, y, vw, vh, stage3d!.cam, (hex) => scene.state?.map[tileKeyOf(hex)]?.terrain ?? null);
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
  }

  function onPointerMove(e: PointerEvent): void {
    updateTip(e);
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
    const hex = hexSousEcran(p.x, p.y);
    if (!hex) return;
    onAction(clickAction(scene.view, scene.ui, hex));
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
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
    if (playback.active) return;
    if (!scene.view) return onCancelDraft();
    const hex = hexSousEcran(canvasPos(e).x, canvasPos(e).y);
    if (!hex) return;
    onRightClick(hex);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
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
    window.addEventListener('keydown', onKey);

    // 7n · Hook de TEST (dev uniquement) : pilotage déterministe de la
    // sélection et accès caméra pour les vérifications GUI automatisées.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__game = {
        clickHex: (q: number, r: number) => onAction(clickAction(scene.view!, scene.ui, { q, r })),
        // Picking réel (2D ou 3D selon le flag) — vérifications GUI automatisées.
        pickAt: (x: number, y: number) => { const h = hexSousEcran(x, y); return h ? `${h.q},${h.r}` : null; },
        centerOn: (q: number, r: number) => centerOnHex({ q, r }),
        camera: () => ({ x: camera.x, y: camera.y, scale: camera.scale }),
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
          return { x: w.x * camera.scale + camera.x, y: w.y * camera.scale + camera.y };
        },
      };
    }

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !app) return;
      vw = Math.max(1, entry.contentRect.width);
      vh = Math.max(1, entry.contentRect.height);
      app.renderer.resize(vw, vh);
      if (stage3d) {
        stage3d.resize(vw, vh);
        stage3d.cam.clamp(vw, vh);
      }
      camera.clamp(bounds, vw, vh);
      cameraChanged = true;
      tilesDirty = true;
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
      /** Coordonnées PAGE du centre d'une case (caméra courante) — debug/tests. */
      hexToPage(hex: Hex): { x: number; y: number } | null {
        const p = hexToPixel(hex, HEX_SIZE);
        const rect = host.getBoundingClientRect();
        return { x: rect.x + p.x * camera.scale + camera.x, y: rect.y + p.y * camera.scale + camera.y };
      },
      exportPng(): string | null {
        if (!app) return null;
        // Extraction via PixiJS (le drawing buffer WebGL est vidé après compositing).
        const c = app.renderer.extract.canvas(app.stage) as HTMLCanvasElement;
        return c.toDataURL("image/png");
      },
      sprites(): Array<{ layer: string; label: string; x: number; y: number; scale: number; children: number }> {
    const dump: Array<{ layer: string; label: string; x: number; y: number; scale: number; children: number }> = [];
    const walk = (layer: Container, name: string): void => {
      for (const child of layer.children) {
        dump.push({ layer: name, label: String(child.label ?? ""), x: Math.round(child.x), y: Math.round(child.y), scale: child.scale.x, children: child.children.length });
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
