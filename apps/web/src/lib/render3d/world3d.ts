/**
 * world3d — constructeur de TERRAIN Three.js partagé par les deux architectures
 * candidates du spike L0 (A = Three.js seul, B = terrain Three.js + entités PixiJS).
 *
 * Portage du prototype `tuile-secteur-memoire-flux/tuiles3d.js` sur une carte
 * RÉELLE : prismes hexagonaux pointy-top à élévation sémantique (spec3d),
 * glyphes bus/CPU/RAM, état « allumé / pâle » (langage visuel d'Erik), fog 3 états.
 *
 * Perf (spike) : TOUT est instancié — 1 InstancedMesh par (type de partie × état
 * allumé/pâle) au lieu d'un Mesh par objet (approche naïve du prototype ≈ 1 draw
 * call par objet). Les compteurs `stats` fournissent l'équivalent naïf pour le
 * comparatif (chaque instance = 1 draw call si non instancié).
 *
 * Toute la conversion hex ↔ monde passe par @game/rules (pixelToHex, hexToPixel
 * avec HEX_SIZE = 64) : le monde 3D utilise des hexagones de rayon 1, soit
 * exactement les coordonnées moteur divisées par 64.
 */
import * as THREE from 'three';
import { hexToPixel, pixelToHex } from '@game/rules';
import type { Hex } from '@game/rules';
import {
  BAS, LONG_BUS, NEON, TERRAINS3D,
  empreintesCpu, slotsRam, substratCanvas, voiesBus,
} from './spec3d.js';
import type { Camera3D } from './camera3d.js';

/** Rayon hexagone moteur (px) — les unités monde 3D valent 1/64 de px moteur. */
const HEX_SIZE = 64;

/** Teinte fog « exploré-masqué » appliquée par instance (miroir du tint 2D 0x70707e). */
const FOG_DIM = new THREE.Color(0x4e4e5c);

export type FogState = 'visible' | 'explored';

/** Une tuile à dessiner (déjà filtrée : l'inexploré n'arrive JAMAIS ici — §4.4). */
export interface TileDraw {
  q: number;
  r: number;
  terrain: string;
  fog: FogState;
  /** Case « allumée » (travaillée par une ville ou case de ville — rendement actif). */
  lit: boolean;
}

export interface World3DStats {
  tuiles: number;
  instancesTop: number;
  instancesCotes: number;
  instancesGlyphes: number;
  /** Équivalent naïf : chaque instance = 1 Mesh/draw call dans l'approche prototype. */
  drawCallsNaifsEquivalents: number;
  /** Draw calls réels estimés (pools instanciés utilisés). */
  pools: number;
  derniersRebuildMs: number;
}

/** Position monde d'une case (hex de rayon 1 : coordonnées moteur / 64). */
export function hexWorldPos(hex: Hex): { x: number; z: number } {
  const p = hexToPixel(hex, HEX_SIZE);
  return { x: p.x / HEX_SIZE, z: p.y / HEX_SIZE };
}

/** Case sous un point MONDE (x, z), via le moteur. */
export function hexAtWorld(x: number, z: number): Hex {
  return pixelToHex(x * HEX_SIZE, z * HEX_SIZE, HEX_SIZE);
}

// ---------------------------------------------------------------------------
// Géométries partagées
// ---------------------------------------------------------------------------

/** Sommets d'un hexagone pointy-top (angles 30°+60°i — prototype). */
function hexVertices(r = 1): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i + 30) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/** Face supérieure plate (hexagone, UV remappées 0..1) — y = 0, vers +Y. */
function hexTopGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  hexVertices().forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  if (pos && uv) {
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 1) / 2, (pos.getY(i) + 1) / 2);
  }
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Parois d'un prisme hexagonal ouvert (y ∈ [-1, 0]) — couleur unie. */
function hexWallGeometry(): THREE.BufferGeometry {
  const v = hexVertices();
  const positions: number[] = [];
  for (let i = 0; i < 6; i++) {
    const [x1, y1] = v[i]!;
    const [x2, y2] = v[(i + 1) % 6]!;
    // tri CCW vu de l'extérieur (z = -y après rotation du top)
    positions.push(x1, 0, -y1, x2, 0, -y2, x2, -1, -y2);
    positions.push(x1, 0, -y1, x2, -1, -y2, x1, -1, -y1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

const GEO = {
  top: hexTopGeometry(),
  wall: hexWallGeometry(),
  busLane: new THREE.BoxGeometry(LONG_BUS, 0.035, 0.1),
  cpuSocle: new THREE.BoxGeometry(0.2, 0.035, 0.2),
  cpuDie: new THREE.BoxGeometry(0.11, 0.03, 0.11),
  cpuPin: new THREE.BoxGeometry(0.024, 0.012, 0.2),
  ramSocle: new THREE.BoxGeometry(0.11, 0.045, 0.11),
  ramStick: new THREE.BoxGeometry(0.08, 1, 0.08),
};

// ---------------------------------------------------------------------------
// Pools instanciés
// ---------------------------------------------------------------------------

class Pool {
  mesh: THREE.InstancedMesh;
  used = 0;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number, scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  push(m: THREE.Matrix4, color?: THREE.Color): void {
    if (this.used >= this.mesh.instanceMatrix.count) return; // capacité dépassée (garde-fou)
    this.mesh.setMatrixAt(this.used, m);
    if (color) this.mesh.setColorAt(this.used, color);
    this.used++;
  }
  flush(): void {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Matériau de glyphes : couple (allumé, pâle) — portage tuiles3d.js. */
function matGlyphe(emissive: number, lit: boolean, intensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: lit ? 0x0a2e33 : 0x0e2430,
    emissive,
    emissiveIntensity: lit ? intensity : 0.05,
    roughness: lit ? 0.4 : 0.85,
    metalness: lit ? 0.15 : 0.05,
  });
}

export interface TerrainWorldOpts {
  /** Capacity initiale des pools (nb de tuiles max — reconstruit si dépassé). */
  capacity: number;
  /** Post-processing bloom (optionnel, coût mesuré). */
  bloom: boolean;
}

/**
 * Terrain 3D : prisme + glyphes par tuile, fog par instance. Réutilisable par
 * les deux options ; `update()` reconstruit les instances (état/fog changé).
 */
export class TerrainWorld {
  readonly group = new THREE.Group();
  readonly stats: World3DStats = {
    tuiles: 0, instancesTop: 0, instancesCotes: 0, instancesGlyphes: 0,
    drawCallsNaifsEquivalents: 0, pools: 0, derniersRebuildMs: 0,
  };
  /** Points de pulse des voies allumées (1 par voie lit). */
  private pulses!: THREE.Points;
  private pulsePositions!: Float32Array;
  private pulseCount = 0;
  private pulseMeta: Array<{ x: number; z: number; y: number; t: number; speed: number }> = [];

  private tops = new Map<string, Pool>();
  private walls!: Pool;
  private busLit!: Pool; private busDim!: Pool;
  private cpuSocle!: Pool; private dieLit!: Pool; private dieDim!: Pool; private pins!: Pool;
  private ramSocle!: Pool; private stickLit!: Pool; private stickDim!: Pool;

  private capacities = 0;
  private disposed = false;

  constructor(private scene: THREE.Scene, private opts: TerrainWorldOpts) {
    this.allocate(opts.capacity);
  }

  private allocate(capacity: number): void {
    this.capacities = capacity;
    const s = this.scene;
    const clear = (p?: Pool) => { if (p) { s.remove(p.mesh); p.mesh.dispose(); } };
    [...this.tops.values()].forEach(clear);
    this.tops.clear();
    clear(this.walls); clear(this.busLit); clear(this.busDim); clear(this.cpuSocle);
    clear(this.dieLit); clear(this.dieDim); clear(this.pins); clear(this.ramSocle);
    clear(this.stickLit); clear(this.stickDim);
    if (this.pulses) { s.remove(this.pulses); this.pulses.geometry.dispose(); }

    // Face supérieure par terrain (texture peinte, cache).
    for (const id of Object.keys(TERRAINS3D)) {
      const tex = new THREE.CanvasTexture(substratCanvas(id, 256));
      tex.anisotropy = 4;
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.12 });
      this.tops.set(id, new Pool(GEO.top, mat, capacity, s));
    }
    this.walls = new Pool(GEO.wall, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.15 }), capacity, s);
    this.busLit = new Pool(GEO.busLane, matGlyphe(NEON, true, 1.05), capacity * 4, s);
    this.busDim = new Pool(GEO.busLane, matGlyphe(NEON, false, 0.05), capacity * 4, s);
    this.cpuSocle = new Pool(GEO.cpuSocle, new THREE.MeshStandardMaterial({ color: 0x0b2231, roughness: 0.9, metalness: 0.2 }), capacity * 6, s);
    this.dieLit = new Pool(GEO.cpuDie, matGlyphe(0x9fffe8, true, 0.95), capacity * 6, s);
    this.dieDim = new Pool(GEO.cpuDie, matGlyphe(0x9fffe8, false, 0.05), capacity * 6, s);
    this.pins = new Pool(GEO.cpuPin, new THREE.MeshStandardMaterial({ color: 0x7e8c96, roughness: 0.3, metalness: 0.85 }), capacity * 24, s);
    this.ramSocle = new Pool(GEO.ramSocle, this.cpuSocle.mesh.material as THREE.Material, capacity * 4, s);
    this.stickLit = new Pool(GEO.ramStick, matGlyphe(0x2ce8be, true, 0.8), capacity * 4, s);
    this.stickDim = new Pool(GEO.ramStick, matGlyphe(0x2ce8be, false, 0.05), capacity * 4, s);

    const pulseGeo = new THREE.BufferGeometry();
    this.pulsePositions = new Float32Array(capacity * 12 * 3);
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(this.pulsePositions, 3));
    this.pulses = new THREE.Points(pulseGeo, new THREE.PointsMaterial({
      color: 0xaefff0, size: 0.09, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.pulses.frustumCulled = false;
    s.add(this.pulses);
  }

  /**
   * Reconstruit toutes les instances depuis la liste de tuiles à dessiner.
   * L'inexploré n'arrive jamais ici (absent = invisible, §4.4). Coût mesuré.
   */
  update(tiles: TileDraw[]): void {
    const t0 = performance.now();
    if (tiles.length > this.capacities) this.allocate(Math.ceil(tiles.length * 1.25));
    for (const p of [this.walls, this.busLit, this.busDim, this.cpuSocle, this.dieLit, this.dieDim, this.pins, this.ramSocle, this.stickLit, this.stickDim, ...this.tops.values()]) p.used = 0;
    this.pulseMeta = [];
    this.pulseCount = 0;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const white = new THREE.Color(0xffffff);
    const dim = FOG_DIM;

    for (const t of tiles) {
      const spec = TERRAINS3D[t.terrain];
      if (!spec) continue;
      const { x, z } = hexWorldPos({ q: t.q, r: t.r });
      const tint = t.fog === 'visible' ? white : dim;

      // prisme : top à elev, parois de elev à BAS
      pos.set(x, spec.elev, z); scale.set(1, 1, 1); q.identity();
      m.compose(pos, q, scale);
      this.tops.get(t.terrain)?.push(m, tint);
      pos.set(x, spec.elev, z);
      scale.set(1, spec.elev - BAS, 1);
      m.compose(pos, q, scale);
      this.walls.push(m, tint);

      if (!spec.glyphe) continue; // case de ville / cratère : structure, pas de glyphes

      // Cases explorées-masquées : glyphes tous PÂLES (le néon = rendement actif,
      // lisible uniquement sur les cases visibles).
      const masquee = t.fog !== 'visible';

      const poserBus = (lanes: number[], litCount: number, zOff: number) => {
        lanes.forEach((lz, i) => {
          const lit = !masquee && i < litCount;
          pos.set(x, spec.elev + 0.022, z + lz + zOff); scale.set(1, 1, 1); q.identity();
          m.compose(pos, q, scale);
          (lit ? this.busLit : this.busDim).push(m);
          if (lit) this.pulseMeta.push({ x, z: z + lz + zOff, y: spec.elev + 0.05, t: ((t.q * 3 + t.r * 5 + i * 7) % 10) / 10, speed: 0.35 + (((t.q * 11 + t.r * 17 + i) % 10) / 10) * 0.4 });
        });
      };
      const poserCpu = (pts: Array<[number, number]>, litCount: number) => {
        pts.forEach(([cx, cz], i) => {
          const lit = i < litCount;
          for (const [px, pz, rot] of [[-0.112, 0, 0], [0.112, 0, 0], [0, -0.112, Math.PI / 2], [0, 0.112, Math.PI / 2]] as const) {
            pos.set(x + cx + px, spec.elev + 0.006, z + cz + pz); scale.set(1, 1, 1);
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
            m.compose(pos, q, scale);
            this.pins.push(m);
          }
          q.identity();
          pos.set(x + cx, spec.elev + 0.0175, z + cz); scale.set(1, 1, 1);
          m.compose(pos, q, scale);
          this.cpuSocle.push(m);
          pos.y = spec.elev + 0.0175 + 0.032;
          m.compose(pos, q, scale);
          (lit ? this.dieLit : this.dieDim).push(m);
        });
      };
      const poserRam = (slots: Array<[number, number]>, litCount: number) => {
        slots.forEach(([sx, sz], i) => {
          const lit = i < litCount;
          const h = 0.12 + ((t.q * 7 + t.r * 13 + i * 5) % 5) * 0.02;
          q.identity();
          pos.set(x + sx, spec.elev + 0.0225, z + sz); scale.set(1, 1, 1);
          m.compose(pos, q, scale);
          this.ramSocle.push(m);
          pos.y = spec.elev + 0.045 + h / 2; scale.set(1, h, 1);
          m.compose(pos, q, scale);
          (lit ? this.stickLit : this.stickDim).push(m);
        });
      };

      const g = spec.glyphe;
      const actifs = t.lit ? g.total : g.actifs;
      if (g.famille === 'bus') poserBus(voiesBus(g.total), actifs, 0);
      else if (g.famille === 'cpu') poserCpu(empreintesCpu(g.total), masquee ? 0 : actifs);
      else if (g.famille === 'ram') poserRam(slotsRam(g.total), masquee ? 0 : actifs);
      if (spec.glypheSecond) {
        const g2 = spec.glypheSecond;
        // eau : RAM (commerce) toujours allumée ; bus soumis au Port (lit).
        if (g2.famille === 'ram') poserRam(slotsRam(g2.total, spec.glypheSecondZ ?? 0), masquee ? 0 : g2.actifs);
        else poserBus(voiesBus(g2.total), t.lit ? 1 : 0, spec.glypheSecondZ ?? 0);
      }
    }

    for (const p of [...this.tops.values(), this.walls, this.busLit, this.busDim, this.cpuSocle, this.dieLit, this.dieDim, this.pins, this.ramSocle, this.stickLit, this.stickDim]) p.flush();

    // pulses : 1 point par voie allumée
    this.pulseCount = this.pulseMeta.length;
    this.stats.tuiles = tiles.length;
    this.stats.instancesTop = [...this.tops.values()].reduce((a, p) => a + p.used, 0);
    this.stats.instancesCotes = this.walls.used;
    this.stats.instancesGlyphes =
      this.busLit.used + this.busDim.used + this.cpuSocle.used + this.dieLit.used +
      this.dieDim.used + this.pins.used + this.ramSocle.used + this.stickLit.used + this.stickDim.used;
    this.stats.drawCallsNaifsEquivalents = this.stats.instancesTop + this.stats.instancesCotes + this.stats.instancesGlyphes;
    this.stats.pools =
      [...this.tops.values()].filter((p) => p.used > 0).length +
      [this.walls, this.busLit, this.busDim, this.cpuSocle, this.dieLit, this.dieDim, this.pins, this.ramSocle, this.stickLit, this.stickDim].filter((p) => p.used > 0).length + 1;
    this.stats.derniersRebuildMs = performance.now() - t0;
  }

  /** Animations des pulses (voies de bus allumées). */
  tick(dt: number, animation: boolean): void {
    for (let i = 0; i < this.pulseCount; i++) {
      const p = this.pulseMeta[i]!;
      if (animation) p.t = (p.t + dt * p.speed) % 1;
      const x = p.x - 0.8 + p.t * LONG_BUS;
      this.pulsePositions[i * 3] = x;
      this.pulsePositions[i * 3 + 1] = p.y;
      this.pulsePositions[i * 3 + 2] = p.z;
    }
    this.pulses.geometry.setDrawRange(0, this.pulseCount);
    (this.pulses.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.pulses.visible = this.pulseCount > 0 && animation;
  }

  /** Respiration des matériaux allumés (optionnelle). */
  breathe(time: number, animation: boolean): void {
    const breatheOf = (pool: Pool, base: number, phase: number) => {
      const mat = pool.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = animation ? base + 0.2 * Math.sin(time * 2.4 + phase) : base;
    };
    breatheOf(this.busLit, 1.0, 0);
    breatheOf(this.dieLit, 0.9, 1.0);
    breatheOf(this.stickLit, 0.75, 2.0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of [...this.tops.values(), this.walls, this.busLit, this.busDim, this.cpuSocle, this.dieLit, this.dieDim, this.pins, this.ramSocle, this.stickLit, this.stickDim]) {
      this.scene.remove(p.mesh);
      p.mesh.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.scene.remove(this.pulses);
    this.pulses.geometry.dispose();
  }
}

// ---------------------------------------------------------------------------
// Picking analytique (partagé A/B) : rayon écran → sol → hex, itéré sur
// l'élévation (2 passes suffisent : élévations ≤ 0.62 << taille de case).
// ---------------------------------------------------------------------------

export function pickHex3D(
  screenX: number,
  screenY: number,
  viewW: number,
  viewH: number,
  cam: Camera3D,
  terrainAt: (hex: Hex) => string | null,
): Hex | null {
  let elev = 0;
  let hex: Hex | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const ground = cam.groundPoint(screenX, screenY, viewW, viewH, elev);
    if (!ground) return null;
    hex = hexAtWorld(ground.x, ground.z);
    const terrain = terrainAt(hex);
    if (!terrain) return hex; // hors carte / inexploré : la page décide
    elev = TERRAINS3D[terrain]?.elev ?? 0;
  }
  return hex;
}

/** Boîte englobante monde (unités rayon-1) d'une carte col×row. */
export function mapBoundsWorld(width: number, height: number): { x: number; z: number; w: number; h: number } {
  const corners = [
    { q: 0, r: 0 }, { q: width - 1, r: 0 }, { q: 0, r: height - 1 }, { q: width - 1, r: height - 1 },
  ].map((h) => hexToPixel(h, HEX_SIZE));
  const xs = corners.map((p) => p.x / HEX_SIZE);
  const ys = corners.map((p) => p.y / HEX_SIZE);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...ys), maxZ = Math.max(...ys);
  const pad = 1;
  return { x: minX - pad, z: minZ - pad, w: maxX - minX + 2 * pad, h: maxZ - minZ + 2 * pad };
}
