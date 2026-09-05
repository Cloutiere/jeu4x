/**
 * structures3d — STRUCTURES 3D du chantier V2 (décisions d'Erik du 04/09) :
 * slots de cartes-ressources, cartes des 22 ressources (état neutre R-92 /
 * état révélé), Mainframe des villes (paliers de population, capitale
 * distincte, modules de bâtiments, module doré des merveilles), cratère (7m),
 * huttes et villages barbares. Les UNITÉS restent des sprites PixiJS (calque
 * volumétrique ultérieur — hors périmètre).
 *
 * Deux moitiés, comme world3d :
 *  - `planifierStructures` : PURE et déterministe — transforme l'état filtré
 *    en instances par pool (position/taille/rotation/couleur). Testable sans
 *    DOM ni WebGL (les tests d'état du handoff L1/L2/L3 passent par ici) ;
 *  - `StructuresWorld` : pools Three.js instanciés (1 draw call par pool),
 *    consomme le plan ; les textures de pictogrammes y sont peintes (canvas,
 *    lazy — jamais touché côté tests).
 *
 * Tout le calibrage (tailles, couleurs, paliers, offsets, catégories) vit dans
 * `visuel3d.json` §structures via `spec3d.ts` — calibrable sans code.
 */
import * as THREE from 'three';
import { hexWorldPos, FOG_DIM, Pool } from './world3d.js';
import { STRUCTURES3D, TERRAINS3D, categorieDeBatiment } from './spec3d.js';
import type { FogState } from './world3d.js';

// ---------------------------------------------------------------------------
// Entrées (état filtré — aucune donnée inventée)
// ---------------------------------------------------------------------------

/** Tuile productive (terrain avec glyphes) — slot standard + éventuelle carte. */
export interface TuileStructures {
  q: number;
  r: number;
  terrain: string;
  fog: FogState;
  /** Id réel (R-92 : identité connue) ou marqueur « inconnue » (tech manquante).
   *  null = aucune ressource. Toute ressource dont la carte n'existe PAS dans
   *  la spec est rendue comme carte neutre (miroir du « ? » 2D). */
  ressource: string | null;
}

/** Ville — le Mainframe remplace le marqueur 2D. */
export interface VilleStructures {
  id: string;
  q: number;
  r: number;
  pop: number;
  capital: boolean;
  owner: string;
  buildings: readonly string[];
  wonders: readonly string[];
  fog: FogState;
}

/** Hutte / village barbare — structure 3D discrète. */
export interface EntiteStructure {
  id: string;
  q: number;
  r: number;
  fog: FogState;
  /** Terrain de la case (élévation du plateau) — fourni par l'appelant. */
  terrain?: string;
}

export interface EntreeStructures {
  tuiles: TuileStructures[];
  villes: VilleStructures[];
  huttes: EntiteStructure[];
  villages: EntiteStructure[];
  /** Couleur d'accent d'un joueur (injection — évite de tirer pixi.js ici). */
  couleurDe: (owner: string) => number;
}

// ---------------------------------------------------------------------------
// Plan (sortie pure du planificateur)
// ---------------------------------------------------------------------------

export interface Instance3D {
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  /** Rotations (radians) — rx pour l'inclinaison des plaques, ry pour l'axe Y. */
  rx?: number;
  ry: number;
  /** Couleur par instance (fog + accent joueur + catégorie) — défaut blanc. */
  couleur: number;
}

/** Clés de pools : 'slot', 'slotLiseret', 'carte:<id>', 'carteInconnue',
 *  'mfSocle', 'mfCorps', 'mfBande', 'mfAntenne', 'mfPointe', 'mfCouronne',
 *  'mfModule', 'mfMerveille', 'cratereRebord', 'cratereFond', 'hutte',
 *  'hutteAccent', 'village', 'villageMur'. */
export type PlanStructures = Map<string, Instance3D[]>;

const S = STRUCTURES3D;

/** Palier de gabarit du Mainframe pour une population (tranches 🔶). */
export function palierDe(pop: number): { rayon: number; hauteur: number } {
  for (const p of S.mainframe.paliers) {
    if (pop <= p.popMax) return { rayon: p.rayon, hauteur: p.hauteur };
  }
  return S.mainframe.paliers[S.mainframe.paliers.length - 1]!;
}

/** Ordre fixe des modules (déterminisme — tri explicite, R-80/82). */
const ORDRE_CATEGORIES = ['science', 'or', 'production', 'culture', 'defense'] as const;

/** Cartes : état révélé (spec existe) vs neutre (marqueur « inconnue » ou id
 *  sans carte — R-92 : présence toujours visible, identité selon la tech). */
export function estCarteNeutre(ressource: string | null): boolean {
  return ressource === null || !(ressource in S.cartes);
}

/**
 * Planifie toutes les structures depuis l'état filtré. Pur, déterministe :
 * même entrée → même plan bit à bit (aucun Math.random, aucun Date.now).
 */
export function planifierStructures(e: EntreeStructures): PlanStructures {
  const plan: PlanStructures = new Map();
  const push = (pool: string, i: Instance3D): void => {
    let list = plan.get(pool);
    if (!list) { list = []; plan.set(pool, list); }
    list.push(i);
  };
  const dim = (couleur: number, fog: FogState): number =>
    fog === 'visible' ? couleur : new THREE.Color(couleur).multiply(FOG_DIM).getHex();

  // --- Slots + cartes-ressources -------------------------------------------
  // Le slot est un élément standard de chaque tuile productive (terrain avec
  // glyphes — ville et cratère en sont exclus), géométriquement identique
  // partout, visible même sans ressource (défaut 🔶).
  for (const t of e.tuiles) {
    const specTerrain = TERRAINS3D[t.terrain];
    if (!specTerrain?.glyphe) continue; // ville / cratère : non productives, pas de slot
    const spec = S.slot;
    const { x, z } = hexWorldPos({ q: t.q, r: t.r });
    const elev = specTerrain.elev;
    const fog = t.fog;

    // socle discret + liseré néon (encoche)
    push('slot', { x: x + spec.offset[0], y: elev + spec.hauteur / 2, z: z + spec.offset[1], sx: spec.rayon, sy: spec.hauteur, sz: spec.rayon, ry: 0, couleur: dim(spec.couleur, fog) });
    push('slotLiseret', { x: x + spec.offset[0], y: elev + spec.hauteur + 0.002, z: z + spec.offset[1], sx: 1, sy: 1, sz: 1, ry: 0, couleur: dim(spec.liseret, fog) });

    if (!t.ressource) continue;
    const neutre = estCarteNeutre(t.ressource);
    const specCarte = neutre ? null : S.cartes[t.ressource]!;
    const k = (specCarte?.taille ?? 1) * (neutre ? S.carteNeutre.facteur : 1);
    const pool = neutre ? 'carteInconnue' : `carte:${t.ressource}`;
    const base = elev + spec.hauteur;
    const formeNom = (specCarte?.forme ?? 'plaque') as 'plaque' | 'pilier' | 'borne';

    // Échelles ABSOLUES (géométries unitaires) : sx/sy/sz comparables entre
    // pools — la carte neutre est la pleine × facteur (R-92).
    if (formeNom === 'plaque') {
      const f = S.formes.plaque as { largeur: number; hauteur: number; epaisseur: number; inclinaison: number };
      const incl = f.inclinaison;
      push(pool, {
        x: x + spec.offset[0],
        y: base + ((f.hauteur * k) / 2) * Math.cos(incl),
        z: z + spec.offset[1] + ((f.hauteur * k) / 2) * Math.sin(incl),
        sx: f.largeur * k, sy: f.hauteur * k, sz: f.epaisseur * k,
        rx: incl, ry: 0, couleur: 0xffffff,
      });
    } else {
      // pilier (cylindre) / borne (prisme hex) : verticaux, posés sur le slot
      const f = S.formes[formeNom] as { rayon: number; hauteur: number };
      push(pool, {
        x: x + spec.offset[0], y: base + (f.hauteur * k) / 2, z: z + spec.offset[1],
        sx: f.rayon * k, sy: f.hauteur * k, sz: f.rayon * k,
        ry: 0, couleur: 0xffffff,
      });
    }
  }

  // --- Mainframe (villes) ----------------------------------------------------
  for (const v of e.villes) {
    const { x, z } = hexWorldPos({ q: v.q, r: v.r });
    const elev = TERRAINS3D['ville']?.elev ?? 0;
    const accent = dim(e.couleurDe(v.owner), v.fog);
    const palier = palierDe(v.pop);
    const mf = S.mainframe;

    push('mfSocle', { x, y: elev + mf.socle.hauteur / 2, z, sx: mf.socle.rayon, sy: mf.socle.hauteur, sz: mf.socle.rayon, ry: 0, couleur: dim(mf.socle.couleur, v.fog) });
    const baseCorps = elev + mf.socle.hauteur;
    push('mfCorps', { x, y: baseCorps + palier.hauteur / 2, z, sx: palier.rayon, sy: palier.hauteur, sz: palier.rayon, ry: 0, couleur: dim(mf.corps.couleur, v.fog) });
    // bande d'accent joueur (capitale : plus large — « accent joueur plus large »)
    const largeurBande = palier.rayon * (v.capital ? mf.capitale.accentLargeur : 1);
    push('mfBande', { x, y: baseCorps + palier.hauteur - mf.corps.bande.hauteur / 2, z, sx: largeurBande, sy: mf.corps.bande.hauteur, sz: largeurBande, ry: 0, couleur: accent });
    // antenne (+ longue en capitale) et pointe néon
    const hAntenne = v.capital ? mf.capitale.antenne.hauteur : mf.antenne.hauteur;
    const sommet = baseCorps + palier.hauteur;
    push('mfAntenne', { x, y: sommet + hAntenne / 2, z, sx: mf.antenne.rayon, sy: hAntenne, sz: mf.antenne.rayon, ry: 0, couleur: dim(0x8a9199, v.fog) });
    push('mfPointe', { x, y: sommet + hAntenne + 0.03, z, sx: 1, sy: 1, sz: 1, ry: 0, couleur: dim(mf.antenne.pointe, v.fog) });
    // couronne de la capitale (anneau sous le sommet, accent joueur)
    if (v.capital) {
      push('mfCouronne', { x, y: sommet - mf.capitale.couronne.hauteur, z, sx: 1, sy: 1, sz: 1, ry: 0, couleur: accent });
    }

    // modules génériques : un par CATÉGORIE de bâtiment présente (art dédiée V3+)
    const cats = new Set<string>();
    for (const b of v.buildings) cats.add(categorieDeBatiment(b));
    const presentes = ORDRE_CATEGORIES.filter((c) => cats.has(c));
    presentes.forEach((cat, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 3; // 6 directions hexagonales
      const mx = x + Math.cos(angle) * mf.modules.rayonPorteur;
      const mz = z + Math.sin(angle) * mf.modules.rayonPorteur;
      push('mfModule', {
        x: mx, y: elev + mf.socle.hauteur + mf.modules.taille / 2, z: mz,
        sx: mf.modules.taille, sy: mf.modules.taille, sz: mf.modules.taille,
        ry: angle, couleur: dim(mf.modules.categories[cat]!, v.fog),
      });
    });
    // module doré des merveilles hébergées (distinct, émissif)
    if (v.wonders.length > 0) {
      const angle = -Math.PI / 2 + (presentes.length * Math.PI) / 3;
      const wx = x + Math.cos(angle) * mf.modules.rayonPorteur;
      const wz = z + Math.sin(angle) * mf.modules.rayonPorteur;
      push('mfMerveille', {
        x: wx, y: elev + mf.socle.hauteur + mf.merveille.taille / 2, z: wz,
        sx: mf.merveille.taille, sy: mf.merveille.taille * 1.3, sz: mf.merveille.taille,
        ry: angle, couleur: dim(mf.merveille.couleur, v.fog),
      });
    }
  }

  // --- Cratère (7m C15 — déclinaison stérile) ---------------------------------
  for (const t of e.tuiles) {
    if (t.terrain !== 'cratere') continue;
    const { x, z } = hexWorldPos({ q: t.q, r: t.r });
    const elev = TERRAINS3D['cratere']?.elev ?? 0;
    const c = S.cratere;
    push('cratereRebord', { x, y: elev + c.rebord.surhausse, z, sx: 1, sy: 1, sz: 1, ry: 0, couleur: dim(c.rebord.couleur, t.fog) });
    push('cratereFond', { x, y: elev + 0.006, z, sx: c.rayon, sy: 1, sz: c.rayon, ry: 0, couleur: dim(c.fond.couleur, t.fog) });
  }

  // --- Huttes & villages barbares (structures statiques discrètes) ------------
  for (const h of e.huttes) {
    const { x, z } = hexWorldPos({ q: h.q, r: h.r });
    const elev = TERRAINS3D[h.terrain ?? '']?.elev ?? 0;
    push('hutte', { x, y: elev, z, sx: S.hutte.rayon, sy: S.hutte.hauteur, sz: S.hutte.rayon, ry: 0, couleur: dim(S.hutte.couleur, h.fog) });
    push('hutteAccent', { x, y: elev + S.hutte.hauteur + 0.04, z, sx: 1, sy: 1, sz: 1, ry: 0, couleur: dim(S.hutte.accent, h.fog) });
  }
  for (const v of e.villages) {
    const { x, z } = hexWorldPos({ q: v.q, r: v.r });
    const elev = TERRAINS3D[v.terrain ?? '']?.elev ?? 0;
    push('village', { x, y: elev, z, sx: S.village.rayon, sy: S.village.hauteur, sz: S.village.rayon, ry: 0, couleur: dim(S.village.couleur, v.fog) });
    push('villageMur', { x, y: elev + S.village.mur.hauteur / 2, z, sx: 1, sy: 1, sz: 1, ry: 0, couleur: dim(S.village.accent, v.fog) });
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Peintre de pictogrammes (faces de cartes) — code, pas JSON
// ---------------------------------------------------------------------------

/** Foncé/clair : variations de la couleur de la carte. */
function foncer(c: number, k: number): string {
  const col = new THREE.Color(c).multiplyScalar(k);
  return `#${col.getHexString()}`;
}
function eclaircir(c: number, k: number): string {
  const col = new THREE.Color(c).lerp(new THREE.Color(0xffffff), k);
  return `#${col.getHexString()}`;
}

/** Dessine le pictogramme géométrique au centre (ctx déjà transformé : le
 *  repère va de -1 à 1). Formes simples du langage cyber — traits néon pâles. */
export function peindrePicto(ctx: CanvasRenderingContext2D, nom: string, encre: string): void {
  ctx.save();
  ctx.strokeStyle = encre;
  ctx.fillStyle = encre;
  ctx.lineWidth = 0.09;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = (f: () => void): void => { ctx.beginPath(); f(); };
  switch (nom) {
    case 'onde':
      trace(() => {
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(-0.7, i * 0.3);
          ctx.bezierCurveTo(-0.3, i * 0.3 - 0.22, 0.3, i * 0.3 + 0.22, 0.7, i * 0.3);
        }
      });
      ctx.stroke();
      break;
    case 'epi':
      trace(() => {
        ctx.moveTo(0, 0.7);
        ctx.lineTo(0, -0.5);
        for (const [y, dx] of [[-0.45, 0.28], [-0.2, 0.32], [0.05, 0.3]] as const) {
          ctx.moveTo(0, y); ctx.lineTo(dx, y - 0.15);
          ctx.moveTo(0, y); ctx.lineTo(-dx, y - 0.15);
        }
      });
      ctx.stroke();
      break;
    case 'patte':
      trace(() => ctx.ellipse(0, 0.22, 0.3, 0.24, 0, 0, Math.PI * 2));
      ctx.fill();
      for (const [x, y] of [[-0.34, -0.22], [-0.12, -0.38], [0.12, -0.38], [0.34, -0.22]] as const) {
        trace(() => ctx.ellipse(x, y, 0.1, 0.14, 0, 0, Math.PI * 2));
        ctx.fill();
      }
      break;
    case 'corne':
      trace(() => {
        ctx.moveTo(-0.5, 0.5);
        ctx.bezierCurveTo(-0.6, -0.3, -0.2, -0.6, 0.05, -0.35);
        ctx.moveTo(0.5, 0.5);
        ctx.bezierCurveTo(0.6, -0.3, 0.2, -0.6, -0.05, -0.35);
      });
      ctx.stroke();
      break;
    case 'arbre':
      trace(() => {
        ctx.moveTo(0, 0.7); ctx.lineTo(0, -0.1);
        ctx.moveTo(0, -0.7); ctx.lineTo(-0.45, 0.05); ctx.lineTo(0.45, 0.05); ctx.closePath();
      });
      ctx.stroke();
      break;
    case 'lingot':
      trace(() => {
        ctx.moveTo(-0.55, 0.35); ctx.lineTo(-0.35, -0.15); ctx.lineTo(0.35, -0.15); ctx.lineTo(0.55, 0.35); ctx.closePath();
        ctx.moveTo(-0.35, -0.15); ctx.lineTo(-0.15, -0.5); ctx.lineTo(0.55, -0.5); ctx.lineTo(0.35, -0.15);
      });
      ctx.stroke();
      break;
    case 'gemme':
      trace(() => {
        ctx.moveTo(0, -0.6); ctx.lineTo(0.55, -0.1); ctx.lineTo(0, 0.6); ctx.lineTo(-0.55, -0.1); ctx.closePath();
        ctx.moveTo(-0.55, -0.1); ctx.lineTo(0.55, -0.1);
      });
      ctx.stroke();
      break;
    case 'fut':
      trace(() => ctx.rect(-0.3, -0.6, 0.6, 1.2));
      ctx.stroke();
      trace(() => ctx.moveTo(-0.3, -0.2)); ctx.lineTo(0.3, -0.2); ctx.stroke();
      trace(() => ctx.moveTo(-0.3, 0.25)); ctx.lineTo(0.3, 0.25); ctx.stroke();
      break;
    case 'goutte':
      trace(() => {
        ctx.moveTo(0, -0.65);
        ctx.bezierCurveTo(0.45, -0.05, 0.42, 0.35, 0, 0.55);
        ctx.bezierCurveTo(-0.42, 0.35, -0.45, -0.05, 0, -0.65);
      });
      ctx.fill();
      break;
    case 'volute':
      trace(() => {
        ctx.moveTo(-0.1, 0.6);
        ctx.bezierCurveTo(-0.55, 0.2, 0.35, 0.05, -0.05, -0.3);
        ctx.bezierCurveTo(-0.35, -0.55, 0.1, -0.7, 0.3, -0.5);
      });
      ctx.stroke();
      break;
    case 'anneau':
      trace(() => ctx.arc(0, 0, 0.48, 0, Math.PI * 2));
      ctx.stroke();
      trace(() => ctx.arc(0, 0, 0.22, 0, Math.PI * 2));
      ctx.stroke();
      break;
    case 'feuille':
      trace(() => {
        ctx.moveTo(0, 0.6);
        ctx.bezierCurveTo(-0.6, 0.2, -0.5, -0.45, 0, -0.6);
        ctx.bezierCurveTo(0.5, -0.45, 0.6, 0.2, 0, 0.6);
        ctx.moveTo(0, 0.6); ctx.lineTo(0, -0.6);
      });
      ctx.stroke();
      break;
    case 'colonne':
      trace(() => ctx.rect(-0.42, -0.6, 0.84, 0.14));
      ctx.fill();
      trace(() => ctx.rect(-0.42, 0.46, 0.84, 0.14));
      ctx.fill();
      trace(() => ctx.rect(-0.26, -0.4, 0.52, 0.8));
      ctx.fill();
      break;
    case 'cristal':
      trace(() => {
        ctx.moveTo(-0.15, -0.6); ctx.lineTo(0.15, -0.6); ctx.lineTo(0.4, 0.2); ctx.lineTo(0, 0.65); ctx.lineTo(-0.4, 0.2); ctx.closePath();
        ctx.moveTo(-0.15, -0.6); ctx.lineTo(0, 0.65); ctx.lineTo(0.15, -0.6);
      });
      ctx.stroke();
      break;
    case '?':
    default:
      ctx.font = '1.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 0.05);
      break;
  }
  ctx.restore();
}

/** Canvas d'une face de carte : fond dérivé de la couleur, pictogramme encre claire. */
export function faceCarteCanvas(couleur: number, picto: string, px = 128): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = foncer(couleur, 0.68);
  ctx.fillRect(0, 0, px, px);
  // cadre liseré
  ctx.strokeStyle = eclaircir(couleur, 0.55);
  ctx.lineWidth = px * 0.035;
  ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, px - 2 * ctx.lineWidth, px - 2 * ctx.lineWidth);
  ctx.save();
  ctx.translate(px / 2, px / 2);
  ctx.scale(px * 0.3, px * 0.3);
  peindrePicto(ctx, picto, eclaircir(couleur, 0.78));
  ctx.restore();
  return c;
}

// ---------------------------------------------------------------------------
// StructuresWorld — pools instanciés consommant le plan
// ---------------------------------------------------------------------------

export interface StructuresWorldStats {
  instances: number;
  pools: number;
  derniersRebuildMs: number;
}

export interface StructuresWorldOpts {
  /** Capacité des pools liés aux tuiles (slots, cartes, cratère). */
  capacityTuiles: number;
  /** Capacité des pools liés aux villes (Mainframe, modules). */
  capacityVilles: number;
}

interface FabriquePool {
  capacity: number;
  creer: () => { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] };
}

/** Matériau standard « structure » (couleur par instance, léger métal). */
function matStructure(opts: { roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.2,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

/** Prisme hexagonal unitaire (rayon 1, hauteur 1, orienté comme les tuiles). */
function hexPrismeUnitaire(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  geo.rotateY(Math.PI / 6);
  return geo;
}

export class StructuresWorld {
  readonly group = new THREE.Group();
  readonly stats: StructuresWorldStats = { instances: 0, pools: 0, derniersRebuildMs: 0 };

  private pools = new Map<string, Pool>();
  private fabriques: Map<string, FabriquePool>;
  private geometries: THREE.BufferGeometry[] = [];
  private materiaux: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private cartesMateriaux: THREE.Material[][] = [];
  private disposed = false;
  private tmpColor = new THREE.Color();

  constructor(opts: StructuresWorldOpts) {
    const ct = opts.capacityTuiles;
    const cv = opts.capacityVilles;
    this.fabriques = new Map([
      ['slot', { capacity: ct, creer: () => ({ geo: hexPrismeUnitaire(), mat: matStructure({ roughness: 0.85 }) }) }],
      ['slotLiseret', { capacity: ct, creer: () => ({ geo: new THREE.TorusGeometry(S.slot.rayon * 0.85, 0.012, 6, 18).rotateX(Math.PI / 2), mat: matStructure({ roughness: 0.35, emissive: S.slot.liseret, emissiveIntensity: 0.5 }) }) }],
      ['carteInconnue', { capacity: 512, creer: () => this.creerCarte(null) }],
      // cartes RÉVÉLÉES : un pool par ressource (texture de face dédiée) —
      // sans fabrique, le garde-fou de update() sauterait silencieusement
      // toute carte dont l'identité est connue (bug d'Erik du 05/09).
      ...Object.keys(S.cartes).map((id): [string, FabriquePool] => [`carte:${id}`, { capacity: 512, creer: () => this.creerCarte(id) }]),
      ['mfSocle', { capacity: cv * 2, creer: () => ({ geo: hexPrismeUnitaire(), mat: matStructure({ roughness: 0.8 }) }) }],
      ['mfCorps', { capacity: cv * 2, creer: () => ({ geo: hexPrismeUnitaire(), mat: matStructure({ roughness: 0.5, metalness: 0.35 }) }) }],
      ['mfBande', { capacity: cv * 2, creer: () => ({ geo: hexPrismeUnitaire(), mat: matStructure({ roughness: 0.35, metalness: 0.2 }) }) }],
      ['mfAntenne', { capacity: cv * 2, creer: () => ({ geo: new THREE.CylinderGeometry(1, 1, 1, 8), mat: matStructure({ roughness: 0.3, metalness: 0.75 }) }) }],
      ['mfPointe', { capacity: cv * 2, creer: () => ({ geo: new THREE.SphereGeometry(0.035, 8, 6), mat: matStructure({ emissive: S.mainframe.antenne.pointe, emissiveIntensity: 0.9, roughness: 0.3 }) }) }],
      ['mfCouronne', { capacity: cv, creer: () => ({ geo: new THREE.TorusGeometry(S.mainframe.capitale.couronne.rayon, 0.016, 6, 24).rotateX(Math.PI / 2), mat: matStructure({ roughness: 0.35 }) }) }],
      ['mfModule', { capacity: cv * 6, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.45 }) }) }],
      ['mfMerveille', { capacity: cv, creer: () => ({ geo: new THREE.ConeGeometry(1, 1, 4), mat: matStructure({ emissive: S.mainframe.merveille.couleur, emissiveIntensity: S.mainframe.merveille.emissif, roughness: 0.3, metalness: 0.4 }) }) }],
      ['cratereRebord', { capacity: 64, creer: () => ({ geo: new THREE.TorusGeometry(S.cratere.rayon, S.cratere.rebord.epaisseur, 8, 24).rotateX(Math.PI / 2), mat: matStructure({ roughness: 0.9 }) }) }],
      ['cratereFond', { capacity: 64, creer: () => ({ geo: new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), mat: matStructure({ roughness: 0.95 }) }) }],
      ['hutte', { capacity: 256, creer: () => ({ geo: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat: matStructure({ roughness: 0.85 }) }) }],
      ['hutteAccent', { capacity: 256, creer: () => ({ geo: new THREE.SphereGeometry(0.035, 8, 6), mat: matStructure({ emissive: S.hutte.accent, emissiveIntensity: 0.8, roughness: 0.3 }) }) }],
      ['village', { capacity: 256, creer: () => ({ geo: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat: matStructure({ roughness: 0.85 }) }) }],
      ['villageMur', { capacity: 256, creer: () => ({ geo: new THREE.TorusGeometry(S.village.mur.rayon, S.village.mur.epaisseur, 6, 24).rotateX(Math.PI / 2), mat: matStructure({ roughness: 0.8 }) }) }],
    ]);
  }

  /** Pool d'une carte (état révélé : texture par ressource ; neutre : « ? »). */
  private creerCarte(ressource: string | null): { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] } {
    const neutre = ressource === null;
    const spec = neutre ? null : S.cartes[ressource]!;
    const formeNom = (spec?.forme ?? 'plaque') as 'plaque' | 'pilier' | 'borne';
    const couleur = spec?.couleur ?? S.carteNeutre.couleur;
    const picto = spec?.picto ?? '?';
    const tex = new THREE.CanvasTexture(faceCarteCanvas(couleur, picto));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.push(tex);
    const cote = matStructure({ roughness: 0.5, metalness: 0.15 });
    cote.color = new THREE.Color(couleur);
    const face = matStructure({ roughness: 0.45, metalness: 0.1, emissive: couleur, emissiveIntensity: neutre ? 0.08 : 0.34 });
    face.map = tex;
    face.emissiveMap = tex;
    this.materiaux.push(cote, face);
    let geo: THREE.BufferGeometry;
    let mat: THREE.Material | THREE.Material[];
    if (formeNom === 'plaque') {
      // géométrie UNITAIRE : l'échelle de l'instance porte les dimensions
      // (largeur·k, hauteur·k, épaisseur·k) — comparables entre pools.
      geo = new THREE.BoxGeometry(1, 1, 1);
      // BoxGeometry : groupes +x,-x,+y,-y,+z,-z — les faces ±z portent le picto.
      mat = [cote, cote, cote, cote, face, face];
    } else if (formeNom === 'pilier') {
      geo = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
      mat = [face, cote, cote];
    } else {
      geo = hexPrismeUnitaire();
      mat = [face, cote, cote];
    }
    this.geometries.push(geo);
    const mats = Array.isArray(mat) ? mat : [mat];
    this.cartesMateriaux.push(mats);
    return { geo, mat };
  }

  /** Le pool est-il pris en charge par ce monde ? (garde-fou testable — le
   *  constructeur n'alloue rien : les fabriques sont paresseuses, sans DOM.) */
  connaitPool(pool: string): boolean {
    return this.fabriques.has(pool);
  }

  /** Reconstruit les instances depuis le plan (coût mesuré dans les stats). */
  update(plan: PlanStructures): void {
    if (this.disposed) return;
    const t0 = performance.now();
    for (const p of this.pools.values()) p.used = 0;
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    for (const [pool, instances] of plan) {
      if (instances.length === 0) continue;
      let p = this.pools.get(pool);
      if (!p) {
        const fab = this.fabriques.get(pool);
        if (!fab) continue; // pool inconnu du monde (garde-fou)
        const { geo, mat } = fab.creer();
        p = new Pool(geo, mat, fab.capacity, this.group);
        this.pools.set(pool, p);
      }
      for (const i of instances) {
        if (p.used >= p.mesh.instanceMatrix.count) break; // capacité dépassée (garde-fou)
        pos.set(i.x, i.y, i.z);
        scale.set(i.sx, i.sy, i.sz);
        e.set(i.rx ?? 0, i.ry, 0);
        m.compose(pos, new THREE.Quaternion().setFromEuler(e), scale);
        p.push(m, this.tmpColor.set(i.couleur));
      }
    }
    for (const p of this.pools.values()) p.flush();

    let total = 0;
    let utilises = 0;
    for (const p of this.pools.values()) {
      if (p.used > 0) utilises++;
      total += p.used;
    }
    this.stats.instances = total;
    this.stats.pools = utilises;
    this.stats.derniersRebuildMs = performance.now() - t0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of this.pools.values()) {
      this.group.remove(p.mesh);
      p.mesh.dispose();
    }
    this.pools.clear();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materiaux) m.dispose();
    for (const mats of this.cartesMateriaux) for (const m of mats) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries = [];
    this.materiaux = [];
    this.textures = [];
    this.cartesMateriaux = [];
  }
}
