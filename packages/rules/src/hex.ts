/**
 * Coordonnées hexagonales axiales (q, r) — DESIGN.md §4.1.
 * Orientation pointy-top (verrouillée pour l'implémentation, décision #6).
 * Conventions : Red Blob Games (https://www.redblobgames.com/grids/hexagons/).
 *
 * R-81/R-82 : toutes les fonctions retournant plusieurs cases trient
 * explicitement par (q, r) croissant — aucun parcours dépendant d'une Map.
 */

export interface Hex {
  q: number;
  r: number;
}

/** Clé de case canonique "q,r" (DESIGN.md §4.1). */
export function tileKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function tileKeyOf(hex: Hex): string {
  return tileKey(hex.q, hex.r);
}

/** Décodage de la clé "q,r". Retourne null si la clé est malformée. */
export function parseTileKey(key: string): Hex | null {
  const m = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!m) return null;
  return { q: Number(m[1]), r: Number(m[2]) };
}

/** Les 6 directions voisines, dans l'ordre (q, r) croissant de la case voisine. */
export const DIRECTIONS: readonly Hex[] = [
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 0 },
  { q: 1, r: -1 },
];

export function neighbors(hex: Hex): Hex[] {
  return DIRECTIONS.map((d) => ({ q: hex.q + d.q, r: hex.r + d.r })).sort(compareHex);
}

/** Distance hexagonale = (|dq| + |dr| + |dq+dr|) / 2. */
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Tri déterministe (q, r) croissant — R-81. */
export function compareHex(a: Hex, b: Hex): number {
  return a.q - b.q || a.r - b.r;
}

/** Toutes les cases à distance ≤ radius du centre, triées par (q, r). */
export function hexesWithinRadius(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out.sort(compareHex);
}

/** Arrondi d'un couple flottant (q, r) vers la case la plus proche (cube rounding). */
export function hexRound(qf: number, rf: number): Hex {
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(-qf - rf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - (-qf - rf));
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/**
 * Ligne entre deux cases (extrémités incluses, de a vers b), par interpolation
 * linéaire + arrondi. Déterministe par construction (a et b fixes).
 */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ ...a }];
  const out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const h = hexRound(a.q + (b.q - a.q) * t, a.r + (b.r - a.r) * t);
    const prev = out[out.length - 1];
    if (!prev || prev.q !== h.q || prev.r !== h.r) out.push(h);
  }
  return out;
}

/** Conversion axial → pixel, pointy-top : x = size·√3·(q + r/2), y = size·3/2·r. */
export function hexToPixel(hex: Hex, size: number): { x: number; y: number } {
  return { x: size * Math.sqrt(3) * (hex.q + hex.r / 2), y: size * (3 / 2) * hex.r };
}

/** Conversion pixel → axial (pointy-top), avec arrondi vers la case la plus proche. */
export function pixelToHex(x: number, y: number, size: number): Hex {
  const qf = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const rf = ((2 / 3) * y) / size;
  return hexRound(qf, rf);
}

/**
 * Disposition rectangulaire axiale utilisée par les cartes (L3) :
 * la rangée r contient les colonnes q = col − ⌊r/2⌋ pour col ∈ [0, width).
 */
export function colRowToHex(col: number, row: number): Hex {
  return { q: col - Math.floor(row / 2), r: row };
}

/** Appartenance d'une case au rectangle width × height de la disposition ci-dessus. */
export function inRectangle(hex: Hex, width: number, height: number): boolean {
  const row = hex.r;
  const col = hex.q + Math.floor(hex.r / 2);
  return row >= 0 && row < height && col >= 0 && col < width;
}
