/**
 * spec3d — chargeur de la SPEC VISUELLE data-driven `visuel3d.json` (L1b) sur
 * les identifiants RÉELS du moteur (`packages/rules/src/data/terrain.json` :
 * prairie, plaine, foret, colline, montagne, desert, eau, ocean + ville, cratere).
 *
 * Le contenu (couleurs, élévations, glyphes, matériaux par terrain) vit dans le
 * JSON — calibrable SANS code, miroir du `design.js` du prototype
 * `prototypes/tuile-secteur-memoire-flux/` (calibrage 68f6f5a). Ce module ne
 * fait que typer, valider et convertir (le peintre de substrat et les
 * placements de glyphes paramétriques restent du code, en fin de fichier).
 *
 * Principes (Refonte Cybernétique § Langage visuel des tuiles) :
 *  - chaque tuile affiche son POTENTIEL de rendement ; seul l'ACTIF est allumé (néon), le reste pâle ;
 *  - trois pictogrammes d'une SEULE couleur néon : bus de données = Nourriture Ⓝ,
 *    microprocesseur = Cycles CPU Ⓟ, barrette RAM = Commerce Ⓒ ;
 *  - le terrain se lit par la teinte du substrat et l'ÉLÉVATION (eau plus basse, colline +1,
 *    montagne +2 ; plaine/prairie/forêt/désert au niveau de base).
 */
import visuel from './visuel3d.json';

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
  /**
   * Matière du substrat (calibrage 68f6f5a) : le désert (ton pâle) est MAT et
   * quasi non émissif, sinon il paraît illuminé. Les autres terrains gardent
   * leur légère lueur (défaut MATERIAU_DEFAUT).
   */
  materiau?: { emissive: number; roughness: number; metalness: number };
}

/** Matière par défaut du substrat (prototype tuiles3d.js — « légère lueur »). */
export const MATERIAU_DEFAUT: Readonly<{ emissive: number; roughness: number; metalness: number }> = visuel.materiauDefaut;

/** Couleur unique des glyphes (bus/CPU/RAM) — la forme distingue la ressource. */
export const NEON = parseInt(visuel.neon.slice(1), 16);
export const NEON_CSS = visuel.neon;

/** Dessous commun de tous les prismes (unités monde, hex de rayon 1). */
export const BAS = visuel.bas;
/** Longueur d'une voie de bus (unités monde). */
export const LONG_BUS = visuel.longBus;

// ---------------------------------------------------------------------------
// Validation / conversion du JSON (erreurs explicites si la spec est corrompue)
// ---------------------------------------------------------------------------

const COULEUR_RE = /^#[0-9a-fA-F]{6}$/;
const DETAILS: ReadonlySet<string> = new Set(['grille', 'stries', 'hachure', 'facettes', 'bruit', 'ondes', 'nucleaire', 'plein']);
const FAMILLES: ReadonlySet<string> = new Set(['bus', 'cpu', 'ram']);

function couleur(v: unknown, ctx: string): number {
  if (typeof v !== 'string' || !COULEUR_RE.test(v)) throw new Error(`visuel3d.json : couleur invalide pour ${ctx} (${JSON.stringify(v)})`);
  return parseInt(v.slice(1), 16);
}

function nombre(v: unknown, ctx: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`visuel3d.json : nombre invalide pour ${ctx}`);
  return v;
}

function glyphe(v: unknown, ctx: string): SpecGlyphe | null {
  if (v === null) return null;
  if (typeof v !== 'object' || v === null) throw new Error(`visuel3d.json : glyphe invalide pour ${ctx}`);
  const g = v as Record<string, unknown>;
  if (typeof g.famille !== 'string' || !FAMILLES.has(g.famille)) throw new Error(`visuel3d.json : famille de glyphe invalide pour ${ctx}`);
  const total = nombre(g.total, `${ctx}.total`);
  const actifs = nombre(g.actifs, `${ctx}.actifs`);
  if (actifs < 0 || actifs > total) throw new Error(`visuel3d.json : actifs hors [0, total] pour ${ctx}`);
  return { famille: g.famille as Famille, total, actifs };
}

const elevations = visuel.elevations as Record<string, unknown>;

function elevation(cle: unknown, ctx: string): number {
  if (typeof cle !== 'string' || !(cle in elevations)) throw new Error(`visuel3d.json : clé d'élévation inconnue pour ${ctx} (${JSON.stringify(cle)})`);
  return nombre(elevations[cle], `elevations.${cle}`);
}

export const TERRAINS3D: Record<string, SpecTerrain> = Object.fromEntries(
  Object.entries(visuel.terrains as Record<string, unknown>).map(([id, v]) => {
    if (typeof v !== 'object' || v === null) throw new Error(`visuel3d.json : terrain invalide « ${id} »`);
    const t = v as Record<string, unknown>;
    if (typeof t.detail !== 'string' || !DETAILS.has(t.detail)) throw new Error(`visuel3d.json : detail invalide pour « ${id} »`);
    const spec: SpecTerrain = {
      nom: typeof t.nom === 'string' ? t.nom : id,
      elev: elevation(t.elev, id),
      haut: couleur(t.haut, `${id}.haut`),
      bas: couleur(t.bas, `${id}.bas`),
      cote: couleur(t.cote, `${id}.cote`),
      detail: t.detail as Detail,
      glyphe: glyphe(t.glyphe, id),
    };
    if ('glypheSecond' in t) {
      spec.glypheSecond = glyphe(t.glypheSecond, `${id}.glypheSecond`);
      if ('glypheSecondZ' in t) spec.glypheSecondZ = nombre(t.glypheSecondZ, `${id}.glypheSecondZ`);
    }
    if (t.materiau !== undefined && t.materiau !== null) {
      const m = t.materiau as Record<string, unknown>;
      spec.materiau = {
        emissive: nombre(m.emissive, `${id}.materiau.emissive`),
        roughness: nombre(m.roughness, `${id}.materiau.roughness`),
        metalness: nombre(m.metalness, `${id}.materiau.metalness`),
      };
    }
    return [id, spec];
  }),
);

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
  // quincunx (montagne, n=5) — écartement ±0.30 (calibrage 68f6f5a)
  return [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
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

/** Seed du prototype (design.js) — jitter CPU déterministe de world3d. */
export const SEED = 20260904;

/** RNG seedé du prototype (design.js) — aussi utilisé par world3d (jitter CPU). */
export function mulberry32(seed: number): () => number {
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
