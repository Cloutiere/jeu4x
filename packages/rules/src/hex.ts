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

// ---------------------------------------------------------------------------
// Monde cylindrique — enroulement Est↔Ouest (CARTE-RONDE T1, RULES.md §2bis).
// Le repli se fait en espace COLONNE (col = q + ⌊r/2⌋) : la disposition
// rectangulaire L3 décale q d'une demi-case par rangée, un wrap sur q brut
// casserait la couture en biais. Nord/Sud restent des bords (r jamais replié).
// ---------------------------------------------------------------------------

/**
 * Largeur « plate » : passée aux variantes W quand le contexte n'a PAS de
 * carte (fixtures, helpers purs optionnels) — les replis deviennent des
 * no-ops et les fonctions W coïncident avec leurs versions plates.
 */
export const SANS_WRAP = 1 << 30;

/** Colonne rectangulaire d'une case : col = q + ⌊r/2⌋. */
export function colOf(hex: Hex): number {
  return hex.q + Math.floor(hex.r / 2);
}

/** Colonne repliée dans [0, width). */
export function wrapCol(col: number, width: number): number {
  if (width >= SANS_WRAP) return col; // sentinelle « plate » : identité stricte
  return ((col % width) + width) % width;
}

/** Plus court delta en colonnes sur le cylindre, dans ]−width/2, width/2]. */
export function wrapColDelta(dc: number, width: number): number {
  if (width >= SANS_WRAP) return dc;
  const m = wrapCol(dc, width);
  return m > width / 2 ? m - width : m;
}

/**
 * D1 — Normalisation canonique : colonne repliée dans [0, width), rangée
 * intacte. Toute case stockée (unités, villes, ordres, entités) est normalisée.
 * SANS_WRAP : identité stricte (les q négatifs sont conservés).
 */
export function normalizeHexW(hex: Hex, width: number): Hex {
  if (width >= SANS_WRAP) return hex;
  return colRowToHex(wrapCol(colOf(hex), width), hex.r);
}

/** Distance cylindre : dq ajusté du repli Est↔Ouest, couture comprise. */
export function hexDistanceW(a: Hex, b: Hex, width: number): number {
  const dc = wrapColDelta(colOf(a) - colOf(b), width);
  const dr = a.r - b.r;
  const dq = dc - (Math.floor(a.r / 2) - Math.floor(b.r / 2));
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * Voisinage cylindre : les voisins Est↔Ouest d'une case de bord ressortent de
 * l'autre côté ; les rangées hors [0, height) sont exclues (height fourni —
 * bord Nord/Sud). Dédupliqué (rayons ≥ largeur/2 peuvent replier deux fois
 * la même case) et trié (q, r) — R-81.
 */
export function neighborsW(hex: Hex, width: number, height?: number): Hex[] {
  const out = new Map<string, Hex>();
  for (const d of DIRECTIONS) {
    const n = normalizeHexW({ q: hex.q + d.q, r: hex.r + d.r }, width);
    if (height !== undefined && (n.r < 0 || n.r >= height)) continue;
    out.set(tileKeyOf(n), n);
  }
  return [...out.values()].sort(compareHex);
}

/** Cases à distance ≤ radius du centre sur le cylindre, dédupliquées, triées. */
export function hexesWithinRadiusW(center: Hex, radius: number, width: number, height?: number): Hex[] {
  const out = new Map<string, Hex>();
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      const h = normalizeHexW({ q: center.q + dq, r: center.r + dr }, width);
      if (height !== undefined && (h.r < 0 || h.r >= height)) continue;
      out.set(tileKeyOf(h), h);
    }
  }
  return [...out.values()].sort(compareHex);
}
