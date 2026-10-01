/**
 * UI-JEU-T3 · L1 — minimap façon Civ VI : parties PURES (testées).
 *
 * `rendreMinimap` fabrique l'image basse résolution depuis l'état FILTRÉ
 * (fog) — la minimap ne montre QUE ce que le joueur voit : une case absente
 * de `state.map` est du brouillard (aucune invention). `rectCameraMinimap`
 * projette le viewport caméra dans les pixels de la minimap,
 * `caseSousMinimap` fait l'inverse pour le clic/drag (zoom préservé — D3).
 * Aucun canvas ici : le composant Svelte peint le résultat (invalide seulement,
 * jamais par frame — D1).
 */
import { pixelToHex, RESOURCE_UNKNOWN, tileKeyOf } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import { mapBounds, HEX_SIZE } from './hexView.js';
import type { Rect } from './hexView.js';
import { couleurBaseJoueur } from './accents.js';

/** Palette PLATE par terrain (lisibilité en miniature — D2, 🔶 à l'œil). */
export const PALETTE_MINIMAP: Record<string, number> = {
  prairie: 0x7aa146,
  plaine: 0xb8a55a,
  foret: 0x3e6b34,
  colline: 0x8f7f4e,
  montagne: 0x8a8a92,
  desert: 0xd8c288,
  eau: 0x3f6f9e,
  ocean: 0x2c527f,
  ville: 0x9a8a5c,
  cratere: 0x6e6257,
};

/** Fond du brouillard (exploré nulle part) — D2 : fog = fond sombre. */
export const FOND_FOG = 0x14120e;
/** Atténuation des cases explorées-masquées (hors vision courante). */
const FACTEUR_MASQUE = 0.55;
/** Pastille « ressource révélée » mêlée au terrain (filtre ressources ON). */
const RESSOURCE_PASTILLE = 0xe8c96a;

function assombri(couleur: number, facteur: number): number {
  const r = Math.round(((couleur >> 16) & 0xff) * facteur);
  const g = Math.round(((couleur >> 8) & 0xff) * facteur);
  const b = Math.round((couleur & 0xff) * facteur);
  return (r << 16) | (g << 8) | b;
}

function melee(a: number, b: number, part: number): number {
  const r = Math.round(((a >> 16) & 0xff) * (1 - part) + ((b >> 16) & 0xff) * part);
  const g = Math.round(((a >> 8) & 0xff) * (1 - part) + ((b >> 8) & 0xff) * part);
  const bl = Math.round((a & 0xff) * (1 - part) + (b & 0xff) * part);
  return (r << 16) | (g << 8) | bl;
}

/** Image minimap : une couleur par case, 0x0 = brouillard. */
export interface ImageMinimap {
  w: number;
  h: number;
  /** w×h, index = row*w+col. */
  cellules: Uint32Array;
}

export interface OptionsMinimap {
  /** Filtre « Ressources » (D4) : false = cases au terrain nu. */
  montrerRessources: boolean;
}

/**
 * Grille de couleurs depuis l'état filtré. Priorité d'un pixel :
 * ville (couleur du propriétaire) > unité visible (couleur du propriétaire)
 * > terrain (+ pastille ressource révélée si le filtre l'affiche).
 * Exploré-hors-vision atténué, inexploré = 0 (fog).
 */
export function rendreMinimap(state: GameState, myId: string | null, options: OptionsMinimap): ImageMinimap {
  const { mapWidth: w, mapHeight: h, map, cities, units, players } = state;
  const cellules = new Uint32Array(w * h);
  const vision = myId ? players[myId]?.vision : undefined;
  const visibles = new Set(vision?.visible ?? []);

  // Entités d'abord (la ville/l'unité d'une case prime sur son terrain — D2),
  // une seule couleur par case : la DERNIÈRE gagne (villes après unités).
  const entites = new Map<number, number>();
  for (const unit of Object.values(units)) {
    if (unit.aboard) continue; // R-117 : embarquée — le navire porte le point
    const key = tileKeyOf(unit);
    if (!map[key]) continue; // hors état filtré : jamais inventée
    entites.set(unit.r * w + unit.q, couleurBaseJoueur(unit.owner));
  }
  for (const city of Object.values(cities)) {
    const key = tileKeyOf(city);
    if (!map[key]) continue;
    entites.set(city.r * w + city.q, couleurBaseJoueur(city.owner));
  }

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const idx = row * w + col;
      const entite = entites.get(idx);
      const tile = map[`${col},${row}`];
      if (!tile) continue; // 0 = brouillard (case absente de l'état filtré)
      if (entite !== undefined) {
        cellules[idx] = entite;
        continue;
      }
      let couleur = PALETTE_MINIMAP[tile.terrain] ?? 0x777777;
      // Filtre Ressources (D4) : pastille mêlée au terrain quand l'identité
      // est révélée ; « inconnue » (R-92) reste au terrain nu.
      if (options.montrerRessources && tile.resource && tile.resource !== RESOURCE_UNKNOWN) {
        couleur = melee(couleur, RESSOURCE_PASTILLE, 0.55);
      }
      if (!visibles.has(`${col},${row}`)) couleur = assombri(couleur, FACTEUR_MASQUE);
      cellules[idx] = couleur;
    }
  }
  return { w, h, cellules };
}

/**
 * Repère UNIQUE monde ↔ minimap (correctif retour Erik 01/10 : la peinture ET
 * le clic doivent suivre la MÊME transformation — avant, la grille peinte
 * compressait les colonnes (col·px) tandis que le clic suivait la géométrie
 * monde (x = √3·size·(col + row/2)) : le décalage grandissait avec la rangée).
 * La transformation est linéaire en unités monde via mapBounds (mêmes bornes
 * que la caméra) — le décalage pointy-top des rangées est donc préservé et
 * la miniature épouse la forme réelle de la carte.
 */
export interface PoseMinimap {
  mw: number;
  mh: number;
  kx: number;
  ky: number;
  bx: number;
  by: number;
}

export function poseMinimap(mapW: number, mapH: number, cellPx: number): PoseMinimap {
  const b = mapBounds(HEX_SIZE, mapW, mapH);
  const kx = cellPx / (Math.sqrt(3) * HEX_SIZE);
  const ky = cellPx / (1.5 * HEX_SIZE);
  return { mw: Math.ceil(b.w * kx), mh: Math.ceil(b.h * ky), kx, ky, bx: b.x, by: b.y };
}

/** Pixel minimap du CENTRE monde d'une case (peinture — même transform que le clic). */
export function pxCellule(pose: PoseMinimap, col: number, row: number): { x: number; y: number } {
  return {
    x: (Math.sqrt(3) * HEX_SIZE * (col + row / 2) - pose.bx) * pose.kx,
    y: (1.5 * HEX_SIZE * row - pose.by) * pose.ky,
  };
}

/** Point MONDE sous un pixel de la minimap (clic/drag — zoom préservé, D3). */
export function mondeSousMinimap(px: number, py: number, pose: PoseMinimap): { x: number; y: number } {
  return { x: pose.bx + px / pose.kx, y: pose.by + py / pose.ky };
}

/** Rect du viewport caméra projeté dans les pixels de la minimap (borné). */
export function rectCameraMinimap(
  camera: { x: number; y: number; scale: number },
  vw: number,
  vh: number,
  pose: PoseMinimap,
): Rect {
  const monde = {
    x: -camera.x / camera.scale,
    y: -camera.y / camera.scale,
    w: vw / camera.scale,
    h: vh / camera.scale,
  };
  const sx = (wx: number): number => (wx - pose.bx) * pose.kx;
  const sy = (wy: number): number => (wy - pose.by) * pose.ky;
  const x0 = Math.min(pose.mw, Math.max(0, sx(monde.x)));
  const y0 = Math.min(pose.mh, Math.max(0, sy(monde.y)));
  const x1 = Math.min(pose.mw, sx(monde.x + monde.w));
  const y1 = Math.min(pose.mh, sy(monde.y + monde.h));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Case sous un pixel de la minimap (le composant centre la caméra dessus). */
export function caseSousMinimap(px: number, py: number, pose: PoseMinimap, size: number): Hex {
  const monde = mondeSousMinimap(px, py, pose);
  return pixelToHex(monde.x, monde.y, size);
}
