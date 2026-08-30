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
  import { hexToPixel, tileKeyOf, unitType } from '@game/rules';
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
  import { clickAction, myEngineId } from './interaction.js';
  import type { ClickAction } from './interaction.js';

  interface Props {
    client: GameClient;
    ui: UiStore;
    playback: Playback;
    /** Décision de clic pure résolue par la page (ordres, sélection). */
    onAction(action: ClickAction): void;
    onConfirmDraft(): void;
    onCancelDraft(): void;
    onReady?(api: { centerOnHex(hex: Hex): void; centerOnUnit(unitId: string): void }): void;
    /** Signal d'activité du playback (bannière « Relecture » côté page). */
    onPlaybackActive?(active: boolean): void;
  }

  let { client, ui, playback, onAction, onConfirmDraft, onCancelDraft, onReady, onPlaybackActive }: Props = $props();

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
  let overlayLayer = new Container();
  let entitiesLayer = new Container();
  let effectsLayer = new Container();
  const camera = new Camera();
  let vw = 1;
  let vh = 1;

  const tileSprites = new Map<string, Sprite>();
  const unitSprites = new Map<string, Container>();
  const citySprites = new Map<string, Container>();

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
    }
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
    camera.centerOn(hexToPixel(focus, HEX_SIZE).x, hexToPixel(focus, HEX_SIZE).y, vw, vh);
    camera.clamp(bounds, vw, vh);
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
    }
    // Culling : destruction des cases sorties du viewport (exigence Phase 3).
    for (const [key, sprite] of tileSprites) {
      if (!wanted.has(key)) {
        sprite.destroy();
        tileSprites.delete(key);
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
        const a = hexToPixel(anim.from, HEX_SIZE);
        const b = hexToPixel(anim.to, HEX_SIZE);
        c.position.set(a.x + (b.x - a.x) * anim.t, a.y + (b.y - a.y) * anim.t);
      } else {
        c.position.set(p.x, p.y);
      }
      // PV (override de combat pendant le playback).
      const hp = playback.hpOf(unit.id, unit.hp);
      const ratio = Math.max(0, Math.min(1, hp / unitType(unit.type).hpMax));
      const fill = c.getChildByLabel('hpFill') as Sprite;
      fill.width = 76 * ratio;
      fill.tint = hpBarColor(ratio);
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
      c.position.set(p.x, p.y);
      // Progression de production (R-62) : barre or + pop.
      const prodFill = c.getChildByLabel('prodFill') as Sprite;
      const popText = c.getChildByLabel('pop') as Text;
      if (city.production) {
        const cost = unitType(city.production.item).cost;
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
  }

  function buildUnitContainer(unitId: string, type: string, owner: string): Container {
    const c = new Container();
    const tex = textures!.units[type];
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

  /** Surcouche : sélection, brouillon de chemin, ordres soumis, possessions. */
  function rebuildOverlay(): void {
    overlayLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!scene.state) return;

    // Possession des cases de ville (frontière couleur joueur).
    for (const city of Object.values(scene.state.cities)) {
      if (!scene.explored.has(tileKeyOf(city))) continue;
      const gr = new Graphics();
      gr.poly(hexLocalPoints(HEX_SIZE - 6)).stroke({ width: 4, color: playerColor(city.owner), alpha: 0.9 });
      gr.position.copyFrom(hexToPixel(city, HEX_SIZE));
      overlayLayer.addChild(gr);
    }

    // Cases travaillées (R-60) des villes amies — présentes dans l'état.
    for (const city of Object.values(scene.state.cities)) {
      if (city.owner !== scene.myId || !city.workedTile) continue;
      const [q, r] = city.workedTile.split(',').map(Number);
      if (q === undefined || r === undefined) continue;
      const gr = new Graphics();
      gr.poly(hexLocalPoints(HEX_SIZE - 14)).stroke({ width: 3, color: 0x9be27a, alpha: 0.9 });
      gr.position.copyFrom(hexToPixel({ q, r }, HEX_SIZE));
      overlayLayer.addChild(gr);
    }

    // Ordres soumis (miroir OrderAck) : destination des Move, cible des Attack.
    for (const order of scene.orders) {
      if (order.type === 'Move' && order.path.length > 0) {
        const dest = order.path[order.path.length - 1]!;
        const gr = new Graphics();
        gr.poly(hexLocalPoints(HEX_SIZE - 20)).stroke({ width: 3.5, color: 0xf0c419, alpha: 0.85 });
        gr.position.copyFrom(hexToPixel(dest, HEX_SIZE));
        overlayLayer.addChild(gr);
        for (const step of order.path) {
          const dot = new Graphics();
          dot.circle(0, 0, 7).fill({ color: 0xf0c419, alpha: 0.7 });
          dot.position.copyFrom(hexToPixel(step, HEX_SIZE));
          overlayLayer.addChild(dot);
        }
      } else if (order.type === 'Attack') {
        const gr = new Graphics();
        drawCross(gr, 18, 0xd64545);
        gr.position.copyFrom(hexToPixel(order.target, HEX_SIZE));
        overlayLayer.addChild(gr);
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

  /** Effets de playback (flashs, destructions) — reconstruits par frame. */
  function rebuildEffects(): void {
    effectsLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
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
      (window as unknown as Record<string, unknown>).__tickError = String(err);
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
    if (tilesDirty || cameraChanged) {
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
      world.position.set(camera.x, camera.y);
      world.scale.set(camera.scale);
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
        c.position.set(a.x + (b.x - a.x) * anim.t, a.y + (b.y - a.y) * anim.t);
      }
      rebuildEffects();
    }
    if (playback.active !== lastPlaybackActive) {
      lastPlaybackActive = playback.active;
      onPlaybackActive?.(playback.active);
    }
    void tickerDeltaMs;
  }

  // ---------------------------------------------------------------------
  // Entrées souris / clavier (pan vs clic : seuil 5 px — L1)
  // ---------------------------------------------------------------------

  const PAN_THRESHOLD = 5;
  let pointer: { x: number; y: number } | null = null;
  let dragging = false;

  function canvasPos(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = app!.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    pointer = canvasPos(e);
    dragging = false;
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pointer) return;
    const p = canvasPos(e);
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    if (!dragging && Math.hypot(dx, dy) > PAN_THRESHOLD) dragging = true;
    if (dragging) {
      camera.panBy(dx, dy);
      camera.clamp(bounds, vw, vh);
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
    const hex = screenToHex(p.x, p.y, camera, HEX_SIZE);
    onAction(clickAction(scene.view, scene.ui, hex));
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const p = canvasPos(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    if (camera.zoomAt(p.x, p.y, factor)) {
      camera.clamp(bounds, vw, vh);
      cameraChanged = true;
    }
  }

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    onCancelDraft();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onCancelDraft();
      onAction({ kind: 'deselect' });
    } else if (e.key === 'Enter' && scene.ui.draft && scene.ui.draft.path.length > 0) {
      onConfirmDraft();
    } else if (e.key === 'f' || e.key === 'F') {
      const tile = selectedTileOf();
      if (tile) centerOnHex(tile);
    }
  }

  function centerOnHex(hex: Hex): void {
    if (!app) return;
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
    void setup();
    return () => {
      teardown();
    };
  });
  onDestroy(() => teardown());

  async function setup(): Promise<void> {
    if (!host || disposed) return;
    const application = new Application();
    await application.init({
      background: '#141a20',
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

    // Assets réels (/art/, SPEC-ART) avec fallback placeholder fichier par fichier.
    textures = await loadTextures(application.renderer);
    world = new Container();
    tilesLayer = new Container();
    overlayLayer = new Container();
    entitiesLayer = new Container();
    effectsLayer = new Container();
    world.addChild(tilesLayer, overlayLayer, entitiesLayer, effectsLayer);
    application.stage.addChild(world);

    vw = host.clientWidth || 800;
    vh = host.clientHeight || 600;
    bounds = scene.state ? mapBounds(HEX_SIZE, scene.state.mapWidth, scene.state.mapHeight) : { x: 0, y: 0, w: 1, h: 1 };

    const canvas = application.canvas;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', () => {
      pointer = null;
      dragging = false;
    });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKey);

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !app) return;
      vw = Math.max(1, entry.contentRect.width);
      vh = Math.max(1, entry.contentRect.height);
      app.renderer.resize(vw, vh);
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
      sprites(): Array<{ layer: string; label: string; x: number; y: number; children: number }> {
        const dump: Array<{ layer: string; label: string; x: number; y: number; children: number }> = [];
        const walk = (layer: Container, name: string): void => {
          for (const child of layer.children) {
            dump.push({ layer: name, label: String(child.label ?? ""), x: Math.round(child.x), y: Math.round(child.y), children: child.children.length });
          }
        };
        walk(tilesLayer, "tiles");
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
    if (app) {
      const canvas = app.canvas;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
      app.destroy(true, { children: true, texture: true, textureSource: true });
      app = null;
    }
  }
</script>

<div class="canvas-host" bind:this={host} aria-label="Carte de partie"></div>

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
</style>
