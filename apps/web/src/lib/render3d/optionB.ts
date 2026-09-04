/**
 * optionB — ARCHITECTURE CANDIDATE B (spike L0) : COUCHE HYBRIDE. Le terrain
 * (tuiles, élévations, glyphes, eau) est rendu en 3D Three.js en fond ; les
 * ENTITÉS (unités, villes) et la surcouche 2D (sélection, cases travaillées,
 * brouillon, pings) restent en sprites PixiJS — réutilisation directe des
 * textures /art/ et du style du jeu actuel — projetées chaque frame par la
 * caméra 3D partagée (camera3d.project).
 *
 * Points de vigilance mesurés : 2e contexte WebGL (mémoire/coût), coût de
 * projection par frame, artefacts d'occlusion (sprite toujours au-dessus du
 * terrain 3D — une montagne ne cache pas l'entité derrière elle).
 */
import * as THREE from 'three';
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Hex } from '@game/rules';
import { loadTextures, playerColor } from '../render/textures.js';
import type { GameTextures } from '../render/textures.js';
import { hexWorldPos } from './world3d.js';
import type { Scene3DData, EntiteUnite, EntiteVille } from './optionA.js';
import { elevationDe } from './optionA.js';
import type { Stage3D } from './stage3d.js';

/** Rayon hexagone moteur (px) — pour convertir monde(×1/64) → px de sprite. */
const HEX_SIZE = 64;

/** Textures canvas de secours (jeton unité + ville) si loadTextures échoue. */
function texturesDeSecours(): GameTextures {
  const tex = (dessin: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 96, h = 128): Texture => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    dessin(c.getContext('2d')!, w, h);
    return Texture.from(c);
  };
  const corpsUnit = tex((ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2b2620';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 30, 26, 34, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 78, 18, 18, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  });
  const accentUnit = tex((ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 78, 13, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  const corpsVille = tex((ctx, w, h) => {
    ctx.fillStyle = '#b8bec8';
    ctx.strokeStyle = '#2b2620';
    ctx.lineWidth = 5;
    ctx.fillRect(w / 2 - 34, h - 44, 68, 34);
    ctx.strokeRect(w / 2 - 34, h - 44, 68, 34);
    ctx.fillRect(w / 2 - 16, h - 96, 32, 54);
    ctx.strokeRect(w / 2 - 16, h - 96, 32, 54);
  });
  const accentVille = tex((ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 24, h - 96);
    ctx.lineTo(w / 2, h - 124);
    ctx.lineTo(w / 2 + 24, h - 96);
    ctx.closePath();
    ctx.fill();
  });
  const entite = { base: corpsUnit, accent: accentUnit };
  return {
    tiles: {} as GameTextures['tiles'],
    units: { guerrier: entite },
    cities: { settlement: { base: corpsVille, accent: accentVille }, capital: { base: corpsVille, accent: accentVille } },
    villageBarbare: entite,
    hutte: entite,
    artefacts: {},
    yieldIcons: { food: null, production: null, commerce: null, gold: null, science: null },
    resources: {},
    px: Texture.WHITE,
  };
}

export class RenderOptionB {
  private pixi = new Application();
  private textures: GameTextures | null = null;
  /** Vrai si les textures réelles n'ont pas pu charger (secours canvas). */
  fallback = false;
  private entitiesLayer = new Container();
  private overlayLayer = new Container();
  private unitSprites = new Map<string, Container>();
  private citySprites = new Map<string, Container>();
  private overlayArt: (Graphics | Text)[] = [];
  private ready = false;
  /** Mesure de charge du spike : projections par frame. */
  projectionsDerniereFrame = 0;

  private async init(host: HTMLDivElement): Promise<void> {
    await this.pixi.init({
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      width: host.clientWidth || 800,
      height: host.clientHeight || 600,
    });
    this.pixi.canvas.style.position = 'absolute';
    this.pixi.canvas.style.inset = '0';
    // Le canvas 3D dessous reçoit TOUTES les entrées ; Pixi est purement visuel.
    this.pixi.canvas.style.pointerEvents = 'none';
    host.appendChild(this.pixi.canvas);
    this.pixi.stage.addChild(this.entitiesLayer, this.overlayLayer);
    try {
      this.textures = await loadTextures(this.pixi.renderer);
    } catch (e) {
      // Environnements où le bake placeholder de Pixi échoue (generateTexture —
      // observé sur le Chromium de test, préexistant, #/progen inclus) : le
      // spike retombe sur des textures canvas minimales — l'architecture
      // (projection caméra partagée) reste la chose mesurée.
      this.fallback = true;
      this.textures = texturesDeSecours();
    }
    this.ready = true;
  }

  static async create(host: HTMLDivElement): Promise<RenderOptionB> {
    const o = new RenderOptionB();
    await o.init(host);
    return o;
  }

  /** Projette et dessine les entités/overlays 2D au-dessus du terrain 3D. */
  sync(stage: Stage3D, data: Scene3DData, viewW: number, viewH: number): void {
    if (!this.ready || !this.textures) return;
    this.projectionsDerniereFrame = 0;
    const cam = stage.cam;

    const projecter = (q: number, r: number, terrain: string | undefined): { x: number; y: number; s: number } | null => {
      const { x, z } = hexWorldPos({ q, r });
      const p = cam.project(new THREE.Vector3(x, elevationDe(terrain) + 0.05, z), viewW, viewH);
      this.projectionsDerniereFrame++;
      if (!p) return null;
      // Échelle sprite : 0.5 à zoom 2D 1× (HEX_SIZE 64) → pxPerUnit3D/64 × 0.5.
      return { x: p.x, y: p.y, s: (p.pxPerUnit / HEX_SIZE) * 0.5 };
    };
    const terrainDe = (q: number, r: number): string | undefined =>
      data.tiles.find((t) => t.q === q && t.r === r)?.terrain;

    // --- Unités (sprites du jeu actuel, teinte joueur) ---
    const seenU = new Set<string>();
    for (const u of data.unites) {
      seenU.add(u.id);
      let c = this.unitSprites.get(u.id);
      if (!c) {
        c = this.buildUnit(u);
        this.entitiesLayer.addChild(c);
        this.unitSprites.set(u.id, c);
      }
      const pr = projecter(u.q, u.r, terrainDe(u.q, u.r));
      c.visible = !!pr;
      if (pr) {
        c.position.set(pr.x, pr.y);
        c.scale.set(pr.s);
      }
    }
    for (const [id, c] of this.unitSprites) {
      if (!seenU.has(id)) { c.destroy({ children: true }); this.unitSprites.delete(id); }
    }

    // --- Villes ---
    const seenV = new Set<string>();
    for (const v of data.villes) {
      seenV.add(v.id);
      let c = this.citySprites.get(v.id);
      if (!c) {
        c = this.buildCity(v);
        this.entitiesLayer.addChild(c);
        this.citySprites.set(v.id, c);
      }
      const pr = projecter(v.q, v.r, terrainDe(v.q, v.r));
      c.visible = !!pr;
      if (pr) {
        c.position.set(pr.x, pr.y);
        c.scale.set(pr.s);
      }
    }
    for (const [id, c] of this.citySprites) {
      if (!seenV.has(id)) { c.destroy({ children: true }); this.citySprites.delete(id); }
    }

    // --- Surcouche (sélection, travaillées, brouillon, ping) en Graphics 2D ---
    this.overlayLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.overlayArt = [];
    const pxOf = (hex: Hex): { x: number; y: number } | null => {
      const pr = projecter(hex.q, hex.r, terrainDe(hex.q, hex.r));
      return pr ? { x: pr.x, y: pr.y } : null;
    };
    const hexPoly = (rayonPx: number): number[] => {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = ((60 * i + 30) * Math.PI) / 180;
        pts.push(rayonPx * Math.cos(a), rayonPx * Math.sin(a));
      }
      return pts;
    };

    for (const [key, owner] of data.worked) {
      const [q, r] = key.split(',').map(Number);
      if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
      const p = pxOf({ q, r });
      if (!p) continue;
      const gr = new Graphics();
      const s = (cam.pxPerUnit() / HEX_SIZE);
      gr.poly(hexPoly((HEX_SIZE - 14) * s)).stroke({ width: 3, color: playerColor(owner), alpha: 0.9 });
      gr.position.set(p.x, p.y);
      this.overlayLayer.addChild(gr);
      this.overlayArt.push(gr);
    }
    if (data.selection) {
      const p = pxOf(data.selection);
      if (p) {
        const gr = new Graphics();
        const s = cam.pxPerUnit() / HEX_SIZE;
        gr.poly(hexPoly((HEX_SIZE - 8) * s)).stroke({ width: 5, color: 0xffe082 });
        gr.position.set(p.x, p.y);
        this.overlayLayer.addChild(gr);
        this.overlayArt.push(gr);
      }
    }
    if (data.draftPath.length > 0) {
      const s = cam.pxPerUnit() / HEX_SIZE;
      const gr = new Graphics();
      const pts = data.draftPath.map(pxOf).filter((p): p is { x: number; y: number } => !!p);
      if (pts.length > 0) {
        gr.moveTo(pts[0]!.x, pts[0]!.y);
        for (const p of pts.slice(1)) gr.lineTo(p.x, p.y);
        gr.stroke({ width: 6 * s, color: 0xffe082, alpha: 0.75 });
        for (const p of pts) gr.circle(p.x, p.y, 9 * s).fill({ color: 0xffe082 }).stroke({ width: 3 * s, color: 0x2b2620 });
        this.overlayLayer.addChild(gr);
        this.overlayArt.push(gr);
      }
    }
    if (data.pingSurvol) {
      const p = pxOf(data.pingSurvol);
      if (p) {
        const gr = new Graphics();
        const s = cam.pxPerUnit() / HEX_SIZE;
        for (const [r, alpha] of [[52, 0.1], [38, 0.16], [26, 0.24]] as const) {
          gr.circle(0, 0, r * s).fill({ color: 0xd9a93f, alpha });
        }
        gr.position.set(p.x, p.y);
        this.overlayLayer.addChild(gr);
        this.overlayArt.push(gr);
      }
    }
    this.pixi.render();
  }

  private buildUnit(u: EntiteUnite): Container {
    const c = new Container();
    const tex = this.textures!.units[u.type] ?? this.textures!.units['guerrier'];
    if (tex) {
      const base = new Sprite(tex.base);
      base.anchor.set(0.5, 1);
      base.y = 10;
      const accent = new Sprite(tex.accent);
      accent.anchor.set(0.5, 1);
      accent.y = 10;
      accent.tint = playerColor(u.owner);
      c.addChild(base, accent);
    }
    c.label = u.id;
    return c;
  }

  private buildCity(v: EntiteVille): Container {
    const c = new Container();
    const tex = v.capital ? this.textures!.cities.capital : this.textures!.cities.settlement;
    const base = new Sprite(tex.base);
    base.anchor.set(0.5, 1);
    base.y = 58;
    const accent = new Sprite(tex.accent);
    accent.anchor.set(0.5, 1);
    accent.y = 58;
    accent.tint = playerColor(v.owner);
    const popText = new Text({
      text: String(v.pop),
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 20, fill: 0xffffff, fontWeight: '700', stroke: { color: 0x1b1b22, width: 3 } },
    });
    popText.anchor.set(0.5, 0.5);
    popText.position.set(52, -66);
    c.addChild(base, accent, popText);
    c.label = v.id;
    return c;
  }

  resize(w: number, h: number): void {
    if (!this.ready) return;
    this.pixi.renderer.resize(Math.max(1, w), Math.max(1, h));
  }

  async dispose(): Promise<void> {
    if (!this.ready) return;
    this.ready = false;
    await this.pixi.destroy(true, { children: true, texture: true, textureSource: true });
  }
}
