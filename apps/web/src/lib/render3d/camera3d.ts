/**
 * camera3d — caméra 3D partagée par les deux architectures candidates du
 * spike L0 (A = Three.js seul, B = terrain Three.js + entités PixiJS).
 *
 * Contrat d'interaction identique au jeu 2D (GameCanvas) :
 *  - drag = pan (seuil 5 px géré par la page), molette = zoom ANCRÉ SUR LE
 *    CURSEUR (le point au sol sous le curseur reste sous le curseur) ;
 *  - bornes de zoom calées sur ZOOM_MIN/ZOOM_MAX du jeu 2D (0.5× → 2.25×) :
 *    la taille ÉCRAN d'une case correspond à celle du rendu PixiJS ;
 *  - clamp aux bornes de la carte (marge 30 %, comme Camera.clamp 2D).
 *
 * Tilt FIXE (pas d'orbite) : le pan/zoom 2D doit survivre sans régression —
 * l'orbite libre est une option évaluée dans le rapport, pas dans le spike.
 */
import * as THREE from 'three';

/** Tilt de la caméra au-dessus de l'horizon (rad). 90° = top-down pur. */
export const TILT = (58 * Math.PI) / 180;
/** Champ de vision vertical (deg — unité de THREE.PerspectiveCamera) et son radian. */
export const FOV_DEG = 45;
export const FOV = (FOV_DEG * Math.PI) / 180;

/** Zooms équivalents 2D (hexView.ts : ZOOM_MIN/ZOOM_MAX sur HEX_SIZE=64). */
const ZOOM_MIN_2D = 0.5;
const ZOOM_MAX_2D = 2.25;
const HEX_SIZE_2D = 64;

export interface Rect3 {
  x: number;
  z: number;
  w: number;
  h: number;
}

export class Camera3D {
  /** Cible au sol (point regardé). */
  target = new THREE.Vector3(0, 0, 0);
  /** Distance caméra ↔ cible (unités monde). Pilote le zoom. */
  dist = 20;
  /** Bornes de distance calculées depuis le viewport (setViewport). */
  private distMin = 10;
  private distMax = 40;
  private viewportH = 800;
  /** Bornes monde (clamp). */
  bounds: Rect3 = { x: -20, z: -20, w: 40, h: 40 };

  readonly camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, 0.1, 400);

  /** Pixels écran par unité monde au plan de la cible (approximation plate locale). */
  pxPerUnit(dist = this.dist): number {
    return this.viewportH / (2 * dist * Math.tan(FOV / 2));
  }

  /** Recalcule les bornes de distance pour matcher les zooms 2D. */
  setViewport(width: number, height: number): void {
    this.viewportH = Math.max(1, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    const tan = Math.tan(FOV / 2);
    // dist tel que pxPerUnit = HEX_SIZE_2D × zoom  →  dist = H / (2·px·tan)
    this.distMin = this.viewportH / (2 * HEX_SIZE_2D * ZOOM_MAX_2D * tan);
    this.distMax = this.viewportH / (2 * HEX_SIZE_2D * ZOOM_MIN_2D * tan);
  }

  /** Position caméra dérivée (tilt fixe, azimut 0 : caméra au sud du target). */
  apply(): void {
    const d = this.dist;
    const s = Math.sin(TILT), c = Math.cos(TILT);
    this.camera.position.set(this.target.x, this.target.y + d * c, this.target.z + d * s);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** Point au sol (y = groundY) sous un point écran, ou null si rayon parallèle. */
  groundPoint(screenX: number, screenY: number, viewW: number, viewH: number, groundY = 0): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((screenX / viewW) * 2 - 1, -(screenY / viewH) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }

  /** Pan par pixels écran (amorti laissé à la page — le spike applique direct). */
  panBy(dx: number, dy: number, viewH: number): void {
    const px = this.pxPerUnit();
    // Le foreshortening compresse l'axe Z à l'écran d'un facteur sin(tilt).
    this.target.x -= dx / px;
    this.target.z -= dy / (px * Math.sin(TILT));
    void viewH;
  }

  /** Zoom ancré sur le curseur ; retourne true si le zoom a changé. */
  zoomAt(screenX: number, screenY: number, viewW: number, viewH: number, factor: number): boolean {
    const next = Math.min(this.distMax, Math.max(this.distMin, this.dist * factor));
    if (next === this.dist) return false;
    const ground = this.groundPoint(screenX, screenY, viewW, viewH, this.target.y);
    if (ground) {
      // Ramène la cible vers le point sous le curseur au prorata du zoom :
      // zoom avant (dist ↓) → la cible converge vers ce point.
      const k = next / this.dist;
      this.target.lerp(ground.clone().setY(this.target.y), 1 - k);
    }
    this.dist = next;
    return true;
  }

  /** Centre la vue sur un point monde. */
  centerOn(x: number, z: number): void {
    this.target.set(x, this.target.y, z);
  }

  /** Clamp aux bornes (marge 30 % — miroir Camera.clamp 2D). */
  clamp(viewW: number, viewH: number): void {
    const marginX = this.bounds.w * 0.3;
    const marginZ = this.bounds.h * 0.3;
    // Demi-champ au sol approximé (tilt + perspective) : marge prudente.
    const halfW = (viewW / 2 / this.pxPerUnit()) + marginX;
    const halfH = (viewH / 2 / (this.pxPerUnit() * Math.sin(TILT))) + marginZ;
    this.target.x = Math.min(Math.max(this.target.x, this.bounds.x + marginX - halfW), this.bounds.x + this.bounds.w - marginX + halfW);
    this.target.z = Math.min(Math.max(this.target.z, this.bounds.z + marginZ - halfH), this.bounds.z + this.bounds.h - marginZ + halfH);
  }

  /** Projection monde → pixels écran (pour l'option B). Retourne aussi une
   *  échelle suggérée (px par unité monde au point projeté, via la distance). */
  project(p: THREE.Vector3, viewW: number, viewH: number): { x: number; y: number; pxPerUnit: number } | null {
    const v = p.clone().project(this.camera);
    if (v.z < -1 || v.z > 1) return null;
    const d = this.camera.position.distanceTo(p);
    return {
      x: ((v.x + 1) / 2) * viewW,
      y: ((1 - v.y) / 2) * viewH,
      pxPerUnit: this.viewportH / (2 * Math.max(0.001, d) * Math.tan(FOV / 2)),
    };
  }
}
