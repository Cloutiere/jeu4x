/**
 * Helpers de vue hexagonale (L1) — purs et testés.
 *
 * TOUTE la géométrie hexagonale provient de @game/rules (hexToPixel,
 * pixelToHex, colRowToHex, inRectangle…) — aucune maths dupliquée ici.
 * Orientation pointy-top verrouillée, taille de case = rayon centre→sommet
 * en unités monde (SPEC-ART §3.1 : base logique R = 64 px, zoom 0.5× →
 * case ≈ 56 px à l'écran).
 */
import { colRowToHex, hexToPixel, inRectangle, pixelToHex } from '@game/rules';
import type { Hex } from '@game/rules';

/** Rayon d'un hexagone (centre → sommet) en unités monde. SPEC-ART §3.1. */
export const HEX_SIZE = 64;

/** Bornes zoom caméra (× sur la taille de base) : 0.5× → case ≈ 56 px, 2.25× max. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.25;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Boîte englobante du monde (disposition rectangulaire W×H), marge d'une demi-case. */
export function mapBounds(size: number, width: number, height: number): Rect {
  const corners = [colRowToHex(0, 0), colRowToHex(width - 1, 0), colRowToHex(0, height - 1), colRowToHex(width - 1, height - 1)];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const h of corners) {
    const p = hexToPixel(h, size);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const pad = size; // demi-hexagone de marge
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}

/**
 * Culling (DESIGN.md Phase 3) : cases de la carte dont la zone intersecte le
 * rectangle monde donné. Sur-approximation prudente (marge d'une case) :
 * garantit que toute case dont le CENTRE est dans le rect est retournée, et
 * n'expose jamais de case hors de la disposition rectangulaire.
 */
export function hexesInRect(rect: Rect, size: number, width: number, height: number): Hex[] {
  const out: Hex[] = [];
  const rowH = 1.5 * size;
  const rowMin = Math.max(0, Math.floor(rect.y / rowH) - 1);
  const rowMax = Math.min(height - 1, Math.ceil((rect.y + rect.h) / rowH) + 1);
  const xScale = Math.sqrt(3) * size;
  for (let row = rowMin; row <= rowMax; row++) {
    // x = √3·size·(q + r/2)  →  q = x/(√3·size) − r/2
    const qMin = Math.floor(rect.x / xScale - row / 2) - 1;
    const qMax = Math.ceil((rect.x + rect.w) / xScale - row / 2) + 1;
    // col = q + ⌊r/2⌋ ∈ [0, width)
    const colMin = Math.max(0, qMin + Math.floor(row / 2));
    const colMax = Math.min(width - 1, qMax + Math.floor(row / 2));
    for (let col = colMin; col <= colMax; col++) {
      const hex = colRowToHex(col, row);
      if (inRectangle(hex, width, height)) out.push(hex);
    }
  }
  return out;
}

/** Case sous un point écran, compte tenu de la transformation caméra. */
export function screenToHex(
  screenX: number,
  screenY: number,
  camera: { x: number; y: number; scale: number },
  size: number,
): Hex {
  const worldX = (screenX - camera.x) / camera.scale;
  const worldY = (screenY - camera.y) / camera.scale;
  return pixelToHex(worldX, worldY, size);
}

// ---------------------------------------------------------------------------
// MENU-VILLE (retour d'Erik du 13/09 v2) — pose de la VUE VILLE : un ZOOM
// À PLAT (aucune inclinaison) centré sur la ville, calculé pour que TOUTES
// les tuiles cultivables (rayon de travail — 6 cases, 18 avec Tribunal)
// tiennent à l'écran dans l'espace libre à gauche du panneau de ville. Le
// picking passe par la transform INVERSE (pur, testé : une tuile cliquée en
// vue ville est la même tuile qu'à plat).
// ---------------------------------------------------------------------------

/** Largeur réservée à droite pour le panneau de ville flottant (px). 🔶 */
export const VUE_VILLE_PANNEAU_L = 470;

/** Pose écran du conteneur monde en vue ville (miroir de la Camera 2D). */
export interface PoseVueVille {
  x: number;
  y: number;
  scale: number;
}

/**
 * Pose cible centrée sur une ville : son centre monde `(cityX, cityY)` arrive
 * au centre de la zone LIBRE (vw − panneau de ville), avec l'échelle la plus
 * grande qui fait tenir TOUT le rayon `rayon` (marge `marge`) — bornée aux
 * zooms de la carte (ZOOM_MIN/ZOOM_MAX).
 */
export function poseVueVillePour(
  cityX: number,
  cityY: number,
  vw: number,
  vh: number,
  size: number,
  rayon = 1,
  panelW = VUE_VILLE_PANNEAU_L,
): PoseVueVille {
  const libreW = Math.max(320, vw - panelW);
  // 🔶 CORRECTIFS-VUE-VILLE (retour d'Erik, 14/09) : les tuiles du rayon
  // ENTIÈRES (sommets compris — RIEN de coupé, quelle que soit la fenêtre).
  // Étendue demi-monde du disque de rayon `rayon` (pointy-top) : centres sur
  // ±√3·size·rayon en largeur et ±1,5·size·rayon en hauteur, PLUS l'hexagone
  // complet (demi-largeur √3/2·size, demi-hauteur size). L'ancienne marge
  // horizontale (rayon + 0,35) sous-estimait la vraie demi-largeur : les
  // tuiles extrêmes gauche/droite étaient coupées dès que la largeur bornait
  // le zoom (reproduit à 1536×864 — coupe ~8 px par côté).
  const marge = 12;
  const demiLarg = Math.sqrt(3) * size * (rayon + 0.5);
  const demiHaut = size * (1.5 * rayon + 1);
  const scale = Math.min(
    ZOOM_MAX,
    Math.max(ZOOM_MIN, Math.min((libreW / 2 - marge) / demiLarg, (vh / 2 - marge) / demiHaut)),
  );
  return {
    x: libreW / 2 - cityX * scale,
    y: vh / 2 - cityY * scale,
    scale,
  };
}

/** Point monde sous un point écran, transform inverse de la vue ville. */
export function mondeSousEcranVueVille(sx: number, sy: number, pose: PoseVueVille): { x: number; y: number } {
  return { x: (sx - pose.x) / pose.scale, y: (sy - pose.y) / pose.scale };
}

/** Case sous un point écran en vue ville (transform inverse, puis hex). */
export function hexSousEcranVueVille(sx: number, sy: number, pose: PoseVueVille, size: number): Hex {
  const w = mondeSousEcranVueVille(sx, sy, pose);
  return pixelToHex(w.x, w.y, size);
}

/** Centre monde d'une case. */
export function hexCenter(hex: Hex, size: number): { x: number; y: number } {
  return hexToPixel(hex, size);
}

/**
 * Étend un chemin pas à pas (L3) : `hex` doit être voisine de la dernière
 * case (ou de l'origine si le chemin est vide), praticable et CONNUE
 * (présente dans l'état filtré — jamais inventée localement). Retourne le
 * nouveau chemin, ou null si l'extension est invalide. La case d'origine
 * n'appartient PAS au chemin (contrat SubmitOrder).
 */
export function extendPath(
  path: Hex[],
  origin: Hex,
  hex: Hex,
  passableKnown: (h: Hex) => boolean,
  areNeighbors: (a: Hex, b: Hex) => boolean,
): Hex[] | null {
  const last = path[path.length - 1] ?? origin;
  if (last.q === hex.q && last.r === hex.r) return null;
  if (!areNeighbors(last, hex)) return null;
  if (!passableKnown(hex)) return null;
  return [...path, { q: hex.q, r: hex.r }];
}

/**
 * Clic sur une case déjà dans le chemin → troncature (retour arrière pas à
 * pas). hex === dernière case → chemin inchangé (pas de doublon).
 */
export function truncatePath(path: Hex[], hex: Hex): { path: Hex[] } | null {
  for (let i = 0; i < path.length; i++) {
    if (path[i]!.q === hex.q && path[i]!.r === hex.r) {
      return { path: path.slice(0, i + 1) };
    }
  }
  return null;
}
