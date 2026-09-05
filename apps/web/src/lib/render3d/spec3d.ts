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
// Structures 3D (chantier V2 — décisions d'Erik du 04/09) : slots de cartes,
// cartes-ressources, Mainframe (villes), cratère, hutte/village barbare.
// Même contrat que les terrains : le contenu vit dans le JSON, ce module ne
// fait que typer/valider/convertir (le peintre de pictogrammes reste du code,
// dans structures3d.ts).
// ---------------------------------------------------------------------------

/** Pictogrammes géométriques disponibles pour les faces de cartes. */
export const PICTOS: ReadonlySet<string> = new Set([
  'onde', 'epi', 'patte', 'corne', 'arbre', 'lingot', 'gemme', 'fut',
  'goutte', 'volute', 'anneau', 'feuille', 'colonne', 'cristal', '?',
]);
export type Picto = string;

/** Formes de cartes : plaque inclinée, pilier (cylindre), borne (prisme hex). */
export interface SpecFormePlaque { largeur: number; hauteur: number; epaisseur: number; inclinaison: number }
export interface SpecFormePilier { rayon: number; hauteur: number }
export type SpecForme = SpecFormePlaque | SpecFormePilier;
export type FormeNom = 'plaque' | 'pilier' | 'borne';

export interface SpecSlot {
  /** Décalage [x, z] de l'emplacement dans la tuile (identique PARTOUT). */
  offset: [number, number];
  rayon: number;
  hauteur: number;
  couleur: number;
  liseret: number;
}

/** Carte-ressource (état RÉVÉLÉ) — taille/visuel propres (Erik : « taille significative »). */
export interface SpecCarte {
  forme: FormeNom;
  couleur: number;
  picto: Picto;
  /** Multiplicateur de taille de la forme (défaut 1) — calibrage 🔶. */
  taille: number;
}

export interface SpecCarteNeutre {
  /** Facteur d'échelle sur la forme pleine (Erik : « taille de base réduite »). */
  facteur: number;
  couleur: number;
}

export interface SpecPalier {
  /** Population maximale de la tranche (miroir R-60bis — 3 paliers 🔶). */
  popMax: number;
  rayon: number;
  hauteur: number;
}

export interface SpecMainframe {
  socle: { rayon: number; hauteur: number; couleur: number };
  paliers: SpecPalier[];
  corps: { couleur: number; bande: { hauteur: number } };
  antenne: { rayon: number; hauteur: number; pointe: number };
  capitale: {
    couronne: { rayon: number; hauteur: number };
    antenne: { hauteur: number };
    /** Largeur de l'accent joueur (bande) × celle d'une ville ordinaire. */
    accentLargeur: number;
  };
  modules: {
    taille: number;
    rayonPorteur: number;
    categories: Record<string, number>;
  };
  /** BatimentId → catégorie de module (art dédiée V3+ : module générique 🔶). */
  categorieBatiment: Record<string, string>;
  merveille: { taille: number; couleur: number; emissif: number };
}

export interface SpecCratere {
  rayon: number;
  rebord: { epaisseur: number; surhausse: number; couleur: number };
  fond: { couleur: number };
}

export interface SpecHutte { rayon: number; hauteur: number; couleur: number; accent: number }
export interface SpecVillage {
  rayon: number;
  hauteur: number;
  couleur: number;
  mur: { rayon: number; epaisseur: number; hauteur: number };
  accent: number;
}

export interface SpecStructures {
  slot: SpecSlot;
  formes: Record<FormeNom, SpecForme>;
  carteNeutre: SpecCarteNeutre;
  cartes: Record<string, SpecCarte>;
  mainframe: SpecMainframe;
  cratere: SpecCratere;
  hutte: SpecHutte;
  village: SpecVillage;
}

const CATEGORIES: ReadonlySet<string> = new Set(['science', 'or', 'production', 'culture', 'defense']);

function vec2(v: unknown, ctx: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new Error(`visuel3d.json : vecteur [x, z] invalide pour ${ctx}`);
  }
  return [v[0] as number, v[1] as number];
}

function objet(v: unknown, ctx: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`visuel3d.json : objet invalide pour ${ctx}`);
  return v as Record<string, unknown>;
}

const structuresBrut = objet(visuel.structures, 'structures');

const slotBrut = objet(structuresBrut.slot, 'structures.slot');
const offsetSlot = vec2(slotBrut.offset, 'structures.slot.offset');
if (Math.hypot(offsetSlot[0], offsetSlot[1]) > 0.9) {
  throw new Error('visuel3d.json : structures.slot.offset sort de la tuile (rayon inscrit ≈ 0.866)');
}
const SLOT3D: SpecSlot = {
  offset: offsetSlot,
  rayon: nombre(slotBrut.rayon, 'structures.slot.rayon'),
  hauteur: nombre(slotBrut.hauteur, 'structures.slot.hauteur'),
  couleur: couleur(slotBrut.couleur, 'structures.slot.couleur'),
  liseret: couleur(slotBrut.liseret, 'structures.slot.liseret'),
};

const formesBrut = objet(structuresBrut.formes, 'structures.formes');
function formeDe<N extends FormeNom>(nom: N, cles: readonly string[]): SpecForme {
  const f = objet(formesBrut[nom], `structures.formes.${nom}`);
  const out: Record<string, number> = {};
  for (const k of cles) out[k] = nombre(f[k], `structures.formes.${nom}.${k}`);
  return out as unknown as SpecForme;
}
const FORMES3D: Record<FormeNom, SpecForme> = {
  plaque: formeDe('plaque', ['largeur', 'hauteur', 'epaisseur', 'inclinaison']),
  pilier: formeDe('pilier', ['rayon', 'hauteur']),
  borne: formeDe('borne', ['rayon', 'hauteur']),
};

const neutreBrut = objet(structuresBrut.carteNeutre, 'structures.carteNeutre');
const CARTE_NEUTRE: SpecCarteNeutre = {
  facteur: nombre(neutreBrut.facteur, 'structures.carteNeutre.facteur'),
  couleur: couleur(neutreBrut.couleur, 'structures.carteNeutre.couleur'),
};

const CARTES3D: Record<string, SpecCarte> = Object.fromEntries(
  Object.entries(objet(structuresBrut.cartes, 'structures.cartes')).map(([id, v]) => {
    const c = objet(v, `structures.cartes.${id}`);
    const forme = c.forme;
    if (typeof forme !== 'string' || !(forme in FORMES3D)) {
      throw new Error(`visuel3d.json : forme inconnue pour la carte « ${id} » (${JSON.stringify(forme)})`);
    }
    const picto = c.picto;
    if (typeof picto !== 'string' || !PICTOS.has(picto)) {
      throw new Error(`visuel3d.json : pictogramme inconnu pour la carte « ${id} » (${JSON.stringify(picto)})`);
    }
    return [id, {
      forme: forme as FormeNom,
      couleur: couleur(c.couleur, `structures.cartes.${id}.couleur`),
      picto,
      taille: c.taille === undefined ? 1 : nombre(c.taille, `structures.cartes.${id}.taille`),
    }];
  }),
);

const mainframeBrut = objet(structuresBrut.mainframe, 'structures.mainframe');
const socleBrut = objet(mainframeBrut.socle, 'structures.mainframe.socle');
const corpsBrut = objet(mainframeBrut.corps, 'structures.mainframe.corps');
const bandeBrut = objet(corpsBrut.bande, 'structures.mainframe.corps.bande');
const antenneBrut = objet(mainframeBrut.antenne, 'structures.mainframe.antenne');
const capitaleBrut = objet(mainframeBrut.capitale, 'structures.mainframe.capitale');
const couronneBrut = objet(capitaleBrut.couronne, 'structures.mainframe.capitale.couronne');
const antenneCapBrut = objet(capitaleBrut.antenne, 'structures.mainframe.capitale.antenne');
const modulesBrut = objet(mainframeBrut.modules, 'structures.mainframe.modules');
const categoriesBrut = objet(modulesBrut.categories, 'structures.mainframe.modules.categories');
const categorieBatimentBrut = objet(mainframeBrut.categorieBatiment, 'structures.mainframe.categorieBatiment');
for (const [bat, cat] of Object.entries(categorieBatimentBrut)) {
  if (typeof cat !== 'string' || !CATEGORIES.has(cat)) {
    throw new Error(`visuel3d.json : catégorie de module invalide pour « ${bat} » (${JSON.stringify(cat)})`);
  }
}
const merveilleBrut = objet(mainframeBrut.merveille, 'structures.mainframe.merveille');
const MAINFRAME3D: SpecMainframe = {
  socle: {
    rayon: nombre(socleBrut.rayon, 'structures.mainframe.socle.rayon'),
    hauteur: nombre(socleBrut.hauteur, 'structures.mainframe.socle.hauteur'),
    couleur: couleur(socleBrut.couleur, 'structures.mainframe.socle.couleur'),
  },
  paliers: (mainframeBrut.paliers as unknown[]).map((p, i) => {
    const pal = objet(p, `structures.mainframe.paliers[${i}]`);
    return {
      popMax: nombre(pal.popMax, `structures.mainframe.paliers[${i}].popMax`),
      rayon: nombre(pal.rayon, `structures.mainframe.paliers[${i}].rayon`),
      hauteur: nombre(pal.hauteur, `structures.mainframe.paliers[${i}].hauteur`),
    };
  }),
  corps: {
    couleur: couleur(corpsBrut.couleur, 'structures.mainframe.corps.couleur'),
    bande: { hauteur: nombre(bandeBrut.hauteur, 'structures.mainframe.corps.bande.hauteur') },
  },
  antenne: {
    rayon: nombre(antenneBrut.rayon, 'structures.mainframe.antenne.rayon'),
    hauteur: nombre(antenneBrut.hauteur, 'structures.mainframe.antenne.hauteur'),
    pointe: couleur(antenneBrut.pointe, 'structures.mainframe.antenne.pointe'),
  },
  capitale: {
    couronne: {
      rayon: nombre(couronneBrut.rayon, 'structures.mainframe.capitale.couronne.rayon'),
      hauteur: nombre(couronneBrut.hauteur, 'structures.mainframe.capitale.couronne.hauteur'),
    },
    antenne: { hauteur: nombre(antenneCapBrut.hauteur, 'structures.mainframe.capitale.antenne.hauteur') },
    accentLargeur: nombre(capitaleBrut.accentLargeur, 'structures.mainframe.capitale.accentLargeur'),
  },
  modules: {
    taille: nombre(modulesBrut.taille, 'structures.mainframe.modules.taille'),
    rayonPorteur: nombre(modulesBrut.rayonPorteur, 'structures.mainframe.modules.rayonPorteur'),
    categories: Object.fromEntries(
      Object.entries(categoriesBrut).map(([cat, v]) => {
        if (!CATEGORIES.has(cat)) throw new Error(`visuel3d.json : catégorie de module inconnue « ${cat} »`);
        return [cat, couleur(v, `structures.mainframe.modules.categories.${cat}`)];
      }),
    ),
  },
  categorieBatiment: Object.fromEntries(
    Object.entries(categorieBatimentBrut).map(([b, c]) => [b, c as string]),
  ),
  merveille: {
    taille: nombre(merveilleBrut.taille, 'structures.mainframe.merveille.taille'),
    couleur: couleur(merveilleBrut.couleur, 'structures.mainframe.merveille.couleur'),
    emissif: nombre(merveilleBrut.emissif, 'structures.mainframe.merveille.emissif'),
  },
};

/** Catégorie de module d'un bâtiment (défaut : production — calibrage 🔶). */
export function categorieDeBatiment(batimentId: string): string {
  return MAINFRAME3D.categorieBatiment[batimentId] ?? 'production';
}

const cratereBrut = objet(structuresBrut.cratere, 'structures.cratere');
const rebordBrut = objet(cratereBrut.rebord, 'structures.cratere.rebord');
const fondBrut = objet(cratereBrut.fond, 'structures.cratere.fond');
const CRATERE3D: SpecCratere = {
  rayon: nombre(cratereBrut.rayon, 'structures.cratere.rayon'),
  rebord: {
    epaisseur: nombre(rebordBrut.epaisseur, 'structures.cratere.rebord.epaisseur'),
    surhausse: nombre(rebordBrut.surhausse, 'structures.cratere.rebord.surhausse'),
    couleur: couleur(rebordBrut.couleur, 'structures.cratere.rebord.couleur'),
  },
  fond: { couleur: couleur(fondBrut.couleur, 'structures.cratere.fond.couleur') },
};

const hutteBrut = objet(structuresBrut.hutte, 'structures.hutte');
const HUTTE3D: SpecHutte = {
  rayon: nombre(hutteBrut.rayon, 'structures.hutte.rayon'),
  hauteur: nombre(hutteBrut.hauteur, 'structures.hutte.hauteur'),
  couleur: couleur(hutteBrut.couleur, 'structures.hutte.couleur'),
  accent: couleur(hutteBrut.accent, 'structures.hutte.accent'),
};

const villageBrut = objet(structuresBrut.village, 'structures.village');
const murBrut = objet(villageBrut.mur, 'structures.village.mur');
const VILLAGE3D: SpecVillage = {
  rayon: nombre(villageBrut.rayon, 'structures.village.rayon'),
  hauteur: nombre(villageBrut.hauteur, 'structures.village.hauteur'),
  couleur: couleur(villageBrut.couleur, 'structures.village.couleur'),
  mur: {
    rayon: nombre(murBrut.rayon, 'structures.village.mur.rayon'),
    epaisseur: nombre(murBrut.epaisseur, 'structures.village.mur.epaisseur'),
    hauteur: nombre(murBrut.hauteur, 'structures.village.mur.hauteur'),
  },
  accent: couleur(villageBrut.accent, 'structures.village.accent'),
};

export const STRUCTURES3D: SpecStructures = {
  slot: SLOT3D,
  formes: FORMES3D,
  carteNeutre: CARTE_NEUTRE,
  cartes: CARTES3D,
  mainframe: MAINFRAME3D,
  cratere: CRATERE3D,
  hutte: HUTTE3D,
  village: VILLAGE3D,
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
