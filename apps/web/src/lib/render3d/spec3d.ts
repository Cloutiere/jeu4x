/**
 * spec3d — portage de la spec visuelle du prototype `prototypes/tuile-secteur-memoire-flux/design.js`
 * (langage visuel « Réseau » validé par Erik le 04/09) sur les identifiants RÉELS du moteur
 * (`packages/rules/src/data/terrain.json` : prairie, plaine, foret, colline, montagne, desert,
 * eau, ocean + ville, cratere).
 *
 * Principes (Refonte Cybernétique § Langage visuel des tuiles) :
 *  - chaque tuile affiche son POTENTIEL de rendement ; seul l'ACTIF est allumé (néon), le reste pâle ;
 *  - trois pictogrammes d'une SEULE couleur néon : bus de données = Nourriture Ⓝ,
 *    microprocesseur = Cycles CPU Ⓟ, barrette RAM = Commerce Ⓒ ;
 *  - le terrain se lit par la teinte du substrat et l'ÉLÉVATION (eau plus basse, colline +1,
 *    montagne +2 ; plaine/prairie/forêt/désert au niveau de base).
 *
 * SPIKE L0 : cette spec est partagée par les DEUX architectures candidates (A = Three.js seul,
 * B = terrain Three.js + entités PixiJS) — preuve qu'elle est indépendante du renderer.
 * Le portage L1 en fera une source data-driven complète (assets-src / visuel.json 🔶).
 */

/** Couleur unique des glyphes (bus/CPU/RAM) — la forme distingue la ressource. */
export const NEON = 0x3dffce;
export const NEON_CSS = '#3DFFCE';

/** Dessous commun de tous les prismes (unités monde, hex de rayon 1). */
export const BAS = -0.85;
/** Longueur d'une voie de bus (unités monde). */
export const LONG_BUS = 1.6;

export type Famille = 'bus' | 'cpu' | 'ram';
export type Detail = 'grille' | 'stries' | 'hachure' | 'facettes' | 'bruit' | 'ondes' | 'nucleaire' | 'plein';

/** Glyphes d'un terrain : potentiel total / nombre actifs de base (langage « actif allumé »). */
export interface SpecGlyphe {
  famille: Famille;
  total: number;
  actifs: number;
}

/** Spec d'un terrain (ids du MOTEUR — `terrain.json`). */
export interface SpecTerrain {
  nom: string;
  /** Hauteur du plateau (niveau de base = 0 ; eau négative ; colline +1 marche ; montagne +2). */
  elev: number;
  /** Teinte du substrat (haut/bas du dégradé) et couleur des côtés. */
  haut: number;
  bas: number;
  cote: number;
  detail: Detail;
  /** Glyphes du potentiel (null = aucun — case de ville, cratère). */
  glyphe: SpecGlyphe | null;
  /** 2e famille mixte (eau : RAM toujours allumées + bus du Port). */
  glypheSecond?: SpecGlyphe | null;
  /** Décalage z des glyphes secondaires. */
  glypheSecondZ?: number;
}

/** Niveau de marche : élévation sémantique (prototype : eau −0.40, base 0, colline +0.30, montagne +0.62). */
const E_EAU = -0.4;
const E_BASE = 0;
const E_COLLINE = 0.3;
const E_MONTAGNE = 0.62;

export const TERRAINS3D: Record<string, SpecTerrain> = {
  prairie: {
    nom: 'Secteur Mémoire Flux',
    elev: E_BASE,
    haut: 0x1e6b58, bas: 0x0d382e, cote: 0x0d2f27,
    detail: 'grille',
    glyphe: { famille: 'bus', total: 2, actifs: 2 },
  },
  plaine: {
    nom: 'Cluster de Données',
    elev: E_BASE,
    haut: 0x5e6b2f, bas: 0x2a3319, cote: 0x232b15,
    detail: 'grille',
    // Décision d'Erik du 04/09 : plaine = 3 bus (Grenier +2) — RULES.md à réaligner.
    glyphe: { famille: 'bus', total: 3, actifs: 1 },
  },
  foret: {
    nom: "Matrice d'Algorithmes Bruts",
    elev: E_BASE,
    haut: 0x134b33, bas: 0x08251a, cote: 0x061d14,
    detail: 'stries',
    glyphe: { famille: 'cpu', total: 2, actifs: 2 },
  },
  colline: {
    nom: 'Nœud de Processeurs',
    elev: E_COLLINE,
    haut: 0x2b5570, bas: 0x12293b, cote: 0x0e2231,
    detail: 'hachure',
    glyphe: { famille: 'cpu', total: 3, actifs: 1 },
  },
  montagne: {
    nom: 'Noyau Quantique Solide',
    elev: E_MONTAGNE,
    haut: 0x4a3e6e, bas: 0x221b38, cote: 0x1b1530,
    detail: 'facettes',
    glyphe: { famille: 'cpu', total: 5, actifs: 1 },
  },
  desert: {
    nom: 'Bus à Bruit Statique',
    elev: E_BASE,
    haut: 0x75582b, bas: 0x382912, cote: 0x2c2010,
    detail: 'bruit',
    glyphe: { famille: 'ram', total: 3, actifs: 1 },
  },
  // Id moteur « eau » = Mer (Réseau Sub-Éthéré Fibre).
  eau: {
    nom: 'Réseau Sub-Éthéré (Fibre)',
    elev: E_EAU,
    haut: 0x14526b, bas: 0x082938, cote: 0x061f2b,
    detail: 'ondes',
    glyphe: { famille: 'ram', total: 2, actifs: 2 },
    glypheSecond: { famille: 'bus', total: 1, actifs: 0 },
    glypheSecondZ: -0.3,
  },
  ocean: {
    nom: 'Réseau Sub-Éthéré profond',
    elev: E_EAU,
    haut: 0x0e3450, bas: 0x061a2a, cote: 0x051220,
    detail: 'ondes',
    glyphe: { famille: 'ram', total: 2, actifs: 2 },
    glypheSecond: { famille: 'bus', total: 1, actifs: 0 },
    glypheSecondZ: -0.3,
  },
  ville: {
    nom: 'Case de ville',
    elev: E_BASE,
    haut: 0x14333d, bas: 0x0a1c24, cote: 0x08161d,
    detail: 'plein',
    glyphe: null, // la ville (structure) occupe la case
  },
  cratere: {
    nom: 'Cratère',
    elev: E_BASE,
    haut: 0x33333a, bas: 0x191920, cote: 0x121218,
    detail: 'facettes',
    glyphe: null, // déclinaison stérile 7m — calque L2
  },
};

// ---------------------------------------------------------------------------
// Placements de glyphes (coordonnées locales, hex de rayon 1) — portés du
// prototype (design.js : voiesBus / empreintesCpu / slotsRam).
// ---------------------------------------------------------------------------

/** Voies de bus : n offsets z parallèles à l'axe X. */
export function voiesBus(n: number): number[] {
  if (n === 1) return [0];
  if (n === 2) return [-0.25, 0.25];
  if (n === 3) return [-0.4, 0, 0.4];
  return Array.from({ length: n }, (_, i) => -0.4 + (0.8 * i) / (n - 1));
}

/** Empreintes des microprocesseurs : [x, z] selon le total. */
export function empreintesCpu(n: number): Array<[number, number]> {
  if (n === 1) return [[0, 0]];
  if (n === 2) return [[-0.25, 0], [0.25, 0]];
  if (n === 3) return [[0, 0.24], [-0.27, -0.17], [0.27, -0.17]];
  // quincunx (montagne, n=5)
  return [[0, 0], [-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]];
}

/** Emplacements des barrettes RAM : [x, z]. */
export function slotsRam(n: number, zOffset = 0): Array<[number, number]> {
  if (n === 2) return [[-0.24, zOffset], [0.24, zOffset]];
  return [[-0.36, zOffset], [0, zOffset], [0.36, zOffset]];
}

// ---------------------------------------------------------------------------
// Peintre de substrat (face supérieure) — portage de paintSubstrat (prototype),
// sans canvas DOM : les deux options peignent la même texture (Three CanvasTexture).
// Le rendu déterministe (RNG seedé du prototype, variantes fixes) est conservé.
// ---------------------------------------------------------------------------

const SEED = 20260904;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i + 30) * Math.PI) / 180;
    const x = cx + r * Math.cos(a);
    const y = cy - r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const CSS = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Peint la face supérieure d'une tuile (canvas carré, hexagone inscrit). */
export function paintSubstrat(ctx: CanvasRenderingContext2D, size: number, terrain: string): void {
  const t = TERRAINS3D[terrain];
  if (!t) return;
  const R = size / 2, cx = R, cy = R;
  const rnd = mulberry32(SEED + terrain.length * 131);

  ctx.save();
  hexPath(ctx, cx, cy, R - 1);
  ctx.clip();

  const g = ctx.createLinearGradient(cx - R * 0.8, cy - R, cx + R * 0.6, cy + R);
  g.addColorStop(0, CSS(t.haut));
  g.addColorStop(1, CSS(t.bas));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(190,255,240,0.07)';
  ctx.fillStyle = 'rgba(190,255,240,0.08)';
  ctx.lineWidth = Math.max(1, size * 0.004);
  if (t.detail === 'grille') {
    ctx.beginPath();
    for (let i = 1; i < 6; i++) {
      const p = -R + (i * size) / 6;
      ctx.moveTo(cx + p, 0); ctx.lineTo(cx + p, size);
      ctx.moveTo(0, cy + p); ctx.lineTo(size, cy + p);
    }
    ctx.stroke();
  } else if (t.detail === 'stries') {
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const p = -R + (i * size) / 14 + rnd() * 4;
      ctx.moveTo(cx + p, 0); ctx.lineTo(cx + p, size);
    }
    ctx.stroke();
  } else if (t.detail === 'hachure') {
    ctx.beginPath();
    for (let i = -8; i < 9; i++) {
      const p = (i * size) / 9;
      ctx.moveTo(cx + p - R, cy + R); ctx.lineTo(cx + p + R, cy - R);
    }
    ctx.stroke();
  } else if (t.detail === 'facettes') {
    for (let i = 0; i < 5; i++) {
      let x = cx + (rnd() - 0.5) * size * 0.8, y = cy + (rnd() - 0.5) * size * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 3; s++) {
        x += (rnd() - 0.5) * size * 0.5;
        y += (rnd() - 0.5) * size * 0.5;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (t.detail === 'bruit') {
    for (let i = 0; i < 42; i++) {
      const x = cx + (rnd() - 0.5) * size * 0.92, y = cy + (rnd() - 0.5) * size * 0.92;
      ctx.fillRect(x, y, size * 0.012, size * 0.012);
    }
  } else if (t.detail === 'ondes') {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const y = cy - R * 0.7 + (i * size) / 7 + rnd() * 6;
      ctx.moveTo(cx - R * 0.75, y);
      ctx.lineTo(cx + R * 0.75, y + (rnd() - 0.5) * 5);
    }
    ctx.stroke();
  }

  // contour « plateau de jeu » + liseré haut-gauche
  hexPath(ctx, cx, cy, R - 1);
  ctx.strokeStyle = '#04121E';
  ctx.lineWidth = Math.max(2, size * 0.016);
  ctx.stroke();
  ctx.beginPath();
  [30, 90, 150].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const x = cx + (R - 3.5) * Math.cos(a), y = cy - (R - 3.5) * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(150,255,230,0.13)';
  ctx.lineWidth = Math.max(1.2, size * 0.008);
  ctx.stroke();

  ctx.restore();
}

/** Canvas de substrat (mis en cache par le renderer qui l'utilise). */
export function substratCanvas(terrain: string, px = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  paintSubstrat(c.getContext('2d')!, px, terrain);
  return c;
}
