/**
 * CARTE-RONDE T2 — transformation wrap du rendu (monde cylindrique Est↔Ouest).
 *
 * PURE et testée (suite wrap.test.ts), sur le modèle de hexView/arrows :
 * aucune dépendance PixiJS. Toute la géométrie hexagonale vient de
 * @game/rules (T1 : wrapCol/normalizeHexW/SANS_WRAP) — rien n'est dupliqué.
 *
 * Principe (décisions Erik, HANDOFF-CARTE-RONDE-T2 D1-D6) : le pan horizontal
 * boucle modulo la période P = √3·size·largeur ; la scène est dessinée au
 * besoin EN PLUSIEURS COPIES décalées de ±P — transformation d'AFFICHAGE
 * (D6), jamais une recréation de données. Le centre caméra vit dans la bande
 * canonique [0, P) ; un point rendu à x et à x+P est LA MÊME case.
 */
import { normalizeHexW, pixelToHex, SANS_WRAP } from '@game/rules';
import type { Hex } from '@game/rules';

export interface Point {
  x: number;
  y: number;
}

/**
 * Période horizontale du monde en unités monde (largeur d'un tour complet).
 * La sentinelle SANS_WRAP (monde plat, règle T1) désactive tout wrap.
 */
export function periodeHorizontale(size: number, mapWidth: number): number {
  if (mapWidth <= 0 || mapWidth >= SANS_WRAP) return Infinity;
  return size * Math.sqrt(3) * mapWidth;
}

/** Replie x dans la bande canonique [0, P) — x et x+kP sont la même case. */
export function envelopperX(x: number, P: number): number {
  if (!Number.isFinite(P)) return x;
  return x - Math.floor(x / P) * P;
}

/** Point MONDE sous le centre de l'écran (transform caméra directe). */
export function centreMondeDe(camX: number, scale: number, vw: number): number {
  return (vw / 2 - camX) / scale;
}

/** camera.x plaçant le point monde `centre` au centre de l'écran. */
export function cameraXPourCentre(centre: number, scale: number, vw: number): number {
  return vw / 2 - centre * scale;
}

/**
 * Copies k nécessaires pour une case rendue à x0 : tout k tel que
 * x0 + k·P appartient à la fenêtre monde [vx0, vx1] (déjà élargie par
 * l'appelant de la marge d'extent des sprites). P infini → copie unique.
 */
export function copiesDe(x0: number, vx0: number, vx1: number, P: number): number[] {
  if (!Number.isFinite(P)) return [0];
  const kMin = Math.ceil((vx0 - x0) / P);
  const kMax = Math.floor((vx1 - x0) / P);
  const out: number[] = [];
  for (let k = kMin; k <= kMax; k++) out.push(k === 0 ? 0 : k); // jamais −0
  return out.length > 0 ? out : [Math.round((vx0 + vx1) / 2 / P - x0 / P)];
}

/**
 * DÉPLIE une polyligne de points canoniques : chaque saut horizontal > P/2
 * (traversée de la couture) est ramené au pas voisin, de sorte que le tracé
 * soit continu — un chemin programmé qui sort par la droite REPART à gauche
 * (D3). Les points dépliés peuvent sortir de [0, P) : ce sont des positions
 * de COPIES, l'identité de case est préservée modulo P.
 */
export function deplierPoints(points: Point[], P: number): Point[] {
  if (!Number.isFinite(P) || points.length === 0) return points;
  const out: Point[] = [{ x: points[0]!.x, y: points[0]!.y }];
  for (let i = 1; i < points.length; i++) {
    const prev = out[i - 1]!.x;
    const k = Math.round((points[i]!.x - prev) / P);
    out.push({ x: points[i]!.x - k * P, y: points[i]!.y });
  }
  return out;
}

/**
 * Copies k nécessaires pour une polylignE DÉPLIÉE d'étendue [minX, maxX] :
 * tout k dont le segment décalé de k·P intersecte [vx0, vx1] — un segment
 * traversant la couture est ainsi dessiné des deux côtés (D3).
 */
export function copiesPolyline(points: Point[], vx0: number, vx1: number, P: number): number[] {
  if (!Number.isFinite(P) || points.length === 0) return [0];
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  const kMin = Math.ceil((vx0 - maxX) / P);
  const kMax = Math.floor((vx1 - minX) / P);
  const out: number[] = [];
  for (let k = kMin; k <= kMax; k++) out.push(k === 0 ? 0 : k); // jamais −0
  return out.length > 0 ? out : [0];
}

/**
 * Picking à la couture (D3) : le point monde (d'une copie quelconque) est
 * replié dans la bande canonique avant pixelToHex, puis la colonne est
 * normalisée (T1 : espace COLONNE — col = q + ⌊r/2⌋ mod largeur, jamais q
 * brut). Retourne toujours une case canonique de la carte.
 */
export function hexCanoniqueSousPoint(worldX: number, worldY: number, size: number, mapWidth: number, P: number): Hex {
  const x = envelopperX(worldX, P);
  return normalizeHexW(pixelToHex(x, worldY, size), mapWidth);
}

/**
 * Colonne VIRTUELLE (copies comprises) → case canonique + décalage de copie.
 * Sert au culling et aux ensembles de cases étendus aux copies : le hex
 * retourné appartient à la carte (tileKeyOf direct), k porte le décalage
 * pixel (k·P) à appliquer à l'affichage.
 */
export function colonneVirtuelle(colVirt: number, mapWidth: number): { col: number; k: number } {
  const k = Math.floor(colVirt / mapWidth);
  return { col: colVirt - k * mapWidth, k };
}

/**
 * Copie la plus proche du centre courant : k minimisant |x0 + k·P − centre|.
 * Centrages (badge sans-ordres, Chroniques, vue ville) visent cette copie —
 * jamais de téléportation de caméra par grand saut (D5).
 */
export function copieLaPlusProche(x0: number, centre: number, P: number): number {
  if (!Number.isFinite(P)) return 0;
  return Math.round((centre - x0) / P);
}

/**
 * Ramène b dans le voisinage de a (±P/2) : interpolation de PLAYBACK à
 * travers la couture — l'unité animée passe par la couture au lieu de
 * traverser le monde entier en sens inverse.
 */
export function pointProcheDe(a: Point, b: Point, P: number): Point {
  if (!Number.isFinite(P)) return b;
  const k = Math.round((b.x - a.x) / P);
  return k === 0 ? b : { x: b.x - k * P, y: b.y };
}
