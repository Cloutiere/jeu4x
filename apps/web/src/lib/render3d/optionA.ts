/**
 * optionA — ARCHITECTURE CANDIDATE A (spike L0) : REMPLACEMENT COMPLET de
 * PixiJS par Three.js. Une seule scène 3D : terrain (world3d) + entités en
 * volumes simples (ville = « Noyau Serveur » en boîtes, unité = jeton
 * hexagonal extrudé, couleur joueur) + surcouche (sélection, cases
 * travaillées, brouillon de chemin, pings artefacts). UI DOM inchangée.
 *
 * Le picking reste HEXA-CENTRÉ (pickHex3D analytique) : la décision de clic
 * est prise par la fonction PURE du jeu (`clickAction`, interaction.ts) —
 * aucun test d'interaction à réécrire sur le fond.
 */
import * as THREE from 'three';
import type { Hex } from '@game/rules';
import { playerColor } from '../render/textures.js';
import { TERRAINS3D, NEON } from './spec3d.js';
import { hexWorldPos } from './world3d.js';
import type { TileDraw } from './world3d.js';

export interface EntiteVille { id: string; q: number; r: number; capital: boolean; owner: string; pop: number }
export interface EntiteUnite { id: string; q: number; r: number; owner: string; type: string }

/** Données de scène consommées par les DEUX options (indépendance renderer). */
export interface Scene3DData {
  tiles: TileDraw[];
  villes: EntiteVille[];
  unites: EntiteUnite[];
  /** Case travaillée → engineId du propriétaire (cadres couleur joueur). */
  worked: Map<string, string>;
  selection: Hex | null;
  draftPath: Hex[];
  /** Lueur de survol d'une case à ping artefact (R-155 — l'identité reste cachée). */
  pingSurvol: Hex | null;
}

export function elevationDe(terrain: string | undefined): number {
  return (terrain ? TERRAINS3D[terrain]?.elev : undefined) ?? 0;
}

function textureTexte(txt: string, color = '#ffffff'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1b1b22';
  ctx.strokeText(txt, 32, 34);
  ctx.fillStyle = color;
  ctx.fillText(txt, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Anneau hexagonal plat (Shape avec trou) — sélection et cases travaillées. */
function hexRingGeometry(rOuter: number, rInner: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i + 30) * Math.PI) / 180;
    const x = rOuter * Math.cos(a), y = rOuter * Math.sin(a);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i + 30) * Math.PI) / 180;
    const x = rInner * Math.cos(a), y = rInner * Math.sin(a);
    if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
  }
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export class RenderOptionA {
  readonly entities = new THREE.Group();
  readonly overlay = new THREE.Group();
  private villeObjs = new Map<string, THREE.Group>();
  private uniteObjs = new Map<string, THREE.Group>();
  private workedObjs: THREE.Mesh[] = [];
  private selectionMesh: THREE.Mesh;
  private pingMesh: THREE.Mesh;
  private pathGroup = new THREE.Group();
  private popSprites = new Map<string, THREE.Sprite>();

  private geoVilleBase = new THREE.BoxGeometry(0.62, 0.16, 0.62);
  private geoVilleTour = new THREE.BoxGeometry(0.3, 0.34, 0.3);
  private geoAccent = new THREE.BoxGeometry(0.36, 0.08, 0.36);
  private geoJeton = new THREE.CylinderGeometry(0.28, 0.34, 0.14, 6);
  private geoJetonTop = new THREE.CylinderGeometry(0.16, 0.24, 0.12, 6);
  private geoSelection = hexRingGeometry(0.9, 0.78);
  private geoWorked = hexRingGeometry(0.82, 0.72);
  private geoPing = new THREE.CircleGeometry(0.85, 32);
  private geoDot = new THREE.SphereGeometry(0.07, 10, 10);
  private geoLien = new THREE.BoxGeometry(1, 0.035, 0.035);

  constructor(private scene: THREE.Scene) {
    scene.add(this.entities, this.overlay, this.pathGroup);
    const selMat = new THREE.MeshBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.95, depthWrite: false });
    this.selectionMesh = new THREE.Mesh(this.geoSelection, selMat);
    this.selectionMesh.visible = false;
    this.selectionMesh.renderOrder = 5;
    this.overlay.add(this.selectionMesh);
    const pingMat = new THREE.MeshBasicMaterial({ color: 0xd9a93f, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pingMesh = new THREE.Mesh(this.geoPing, pingMat);
    this.pingMesh.rotation.x = -Math.PI / 2;
    this.pingMesh.visible = false;
    this.pingMesh.renderOrder = 4;
    this.overlay.add(this.pingMesh);
  }

  /** Reconstructe entités + surcouche depuis les données (par changement d'état/UI). */
  sync(data: Scene3DData): void {
    const t0 = performance.now();

    // --- Villes : structure « Noyau Serveur » ---
    const seen = new Set<string>();
    for (const v of data.villes) {
      seen.add(v.id);
      let g = this.villeObjs.get(v.id);
      if (!g) {
        g = new THREE.Group();
        const color = playerColor(v.owner);
        const base = new THREE.Mesh(this.geoVilleBase, new THREE.MeshStandardMaterial({ color: 0x0b2231, roughness: 0.85, metalness: 0.25 }));
        base.position.y = 0.08;
        const tour = new THREE.Mesh(this.geoVilleTour, new THREE.MeshStandardMaterial({ color: 0x14333d, roughness: 0.7, metalness: 0.3 }));
        tour.position.y = 0.33;
        // Accent très émissif : lisible même sous le bloom des glyphes voisins.
        const accent = new THREE.Mesh(this.geoAccent, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.4 }));
        accent.position.y = 0.54;
        g.add(base, tour, accent);
        this.entities.add(g);
        this.villeObjs.set(v.id, g);
      }
      const { x, z } = hexWorldPos(v);
      g.position.set(x, elevationDe('ville'), z);
      // pop : sprite texte au-dessus
      let pop = this.popSprites.get(v.id);
      if (!pop) {
        pop = new THREE.Sprite(new THREE.SpriteMaterial({ map: textureTexte(String(v.pop)), transparent: true, depthTest: false }));
        pop.scale.set(0.4, 0.4, 1);
        pop.renderOrder = 10;
        this.entities.add(pop);
        this.popSprites.set(v.id, pop);
      } else {
        const mat = pop.material as THREE.SpriteMaterial;
        if (mat.map) { mat.map.dispose(); mat.map = textureTexte(String(v.pop)); }
      }
      pop.position.set(x, elevationDe('ville') + 1.05, z);
    }
    for (const [id, g] of this.villeObjs) {
      if (!seen.has(id)) { this.entities.remove(g); this.villeObjs.delete(id); }
    }

    // --- Unités : jetons hexagonaux couleur joueur ---
    const seenU = new Set<string>();
    for (const u of data.unites) {
      seenU.add(u.id);
      let g = this.uniteObjs.get(u.id);
      if (!g) {
        g = new THREE.Group();
        const color = playerColor(u.owner);
        const corps = new THREE.Mesh(this.geoJeton, new THREE.MeshStandardMaterial({ color: 0x0e2430, roughness: 0.6, metalness: 0.3 }));
        const accent = new THREE.Mesh(this.geoJetonTop, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.45 }));
        accent.position.y = 0.13;
        g.add(corps, accent);
        this.entities.add(g);
        this.uniteObjs.set(u.id, g);
      }
      const terrain = data.tiles.find((t) => t.q === u.q && t.r === u.r)?.terrain;
      const { x, z } = hexWorldPos(u);
      g.position.set(x, elevationDe(terrain) + 0.07, z);
    }
    for (const [id, g] of this.uniteObjs) {
      if (!seenU.has(id)) { this.entities.remove(g); this.uniteObjs.delete(id); }
    }

    // --- Cases travaillées (cadres couleur joueur) ---
    for (const m of this.workedObjs) { this.overlay.remove(m); m.geometry.dispose(); }
    this.workedObjs = [];
    for (const [key, owner] of data.worked) {
      const [q, r] = key.split(',').map(Number);
      if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) continue;
      const color = playerColor(owner);
      const mesh = new THREE.Mesh(this.geoWorked.clone(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
      const { x, z } = hexWorldPos({ q, r });
      mesh.position.set(x, elevationDe(data.tiles.find((t) => t.q === q && t.r === r)?.terrain) + 0.02, z);
      mesh.renderOrder = 3;
      this.overlay.add(mesh);
      this.workedObjs.push(mesh);
    }

    // --- Sélection ---
    if (data.selection) {
      const { x, z } = hexWorldPos(data.selection);
      const terrain = data.tiles.find((t) => t.q === data.selection!.q && t.r === data.selection!.r)?.terrain;
      this.selectionMesh.position.set(x, elevationDe(terrain) + 0.03, z);
      this.selectionMesh.visible = true;
    } else this.selectionMesh.visible = false;

    // --- Brouillon de chemin : points + liens néon pâle (géométries partagées — pas de dispose ici) ---
    this.pathGroup.clear();
    if (data.draftPath.length > 0) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.85 });
      const pts: THREE.Vector3[] = [];
      for (const step of data.draftPath) {
        const terrain = data.tiles.find((t) => t.q === step.q && t.r === step.r)?.terrain;
        const { x, z } = hexWorldPos(step);
        pts.push(new THREE.Vector3(x, elevationDe(terrain) + 0.12, z));
      }
      pts.forEach((p) => {
        const dot = new THREE.Mesh(this.geoDot, mat);
        dot.position.copy(p);
        this.pathGroup.add(dot);
      });
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!;
        const len = a.distanceTo(b);
        const lien = new THREE.Mesh(this.geoLien, mat);
        lien.scale.x = len;
        lien.position.copy(a).add(b).multiplyScalar(0.5);
        lien.lookAt(b);
        this.pathGroup.add(lien);
      }
    }

    // --- Ping artefact au survol (R-155) ---
    if (data.pingSurvol) {
      const { x, z } = hexWorldPos(data.pingSurvol);
      const terrain = data.tiles.find((t) => t.q === data.pingSurvol!.q && t.r === data.pingSurvol!.r)?.terrain;
      this.pingMesh.position.set(x, elevationDe(terrain) + 0.015, z);
      this.pingMesh.visible = true;
    } else this.pingMesh.visible = false;

    return void (performance.now() - t0);
  }

  /** Animations par frame (pulses du terrain + respiration néon). */
  tick(world: { tick(dt: number, animation: boolean): void; breathe(time: number, animation: boolean): void }, dt: number, time: number, animation: boolean): void {
    world.tick(dt, animation);
    world.breathe(time, animation);
  }

  dispose(): void {
    this.scene.remove(this.entities, this.overlay, this.pathGroup);
    [this.geoVilleBase, this.geoVilleTour, this.geoAccent, this.geoJeton, this.geoJetonTop, this.geoSelection, this.geoWorked, this.geoPing, this.geoDot, this.geoLien].forEach((g) => g.dispose());
  }
}

export { NEON };
