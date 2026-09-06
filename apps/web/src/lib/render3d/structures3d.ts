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
  /** Propriétaire (accent joueur) — unités 3D de l'atelier pour l'instant. */
  owner?: string;
  /** Gabarit de créature : 'guerrier' (défaut) ou 'archer' (lasso électrique). */
  type?: 'guerrier' | 'archer';
  /** Interpolation de playback (chantier unités 3D) : l'unité se déplace de
   *  (deQ, deR) — terrain de départ `deTerrain` pour l'élévation — vers sa
   *  case (q, r) à la fraction `t` [0..1]. Absent = position statique. */
  interpole?: { deQ: number; deR: number; deTerrain?: string; t: number };
}

export interface EntreeStructures {
  tuiles: TuileStructures[];
  villes: VilleStructures[];
  huttes: EntiteStructure[];
  villages: EntiteStructure[];
  /** Unités 3D (version cyber — atelier ; calque d'unités du monde à venir). */
  unites?: EntiteStructure[];
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
 *  'cg:<famille>' (mini-glyphes de bonus : bus/cpu/ram/or/culture),
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
  // Le slot n'existe QUE sur une tuile productive PORTANT une ressource
  // (décision Erik 05/09 — remplace le défaut V2 « slot visible même vide ») :
  // aucune encoche/socle sur une tuile sans ressource. Ville et cratère
  // (non productives) en sont exclus.
  for (const t of e.tuiles) {
    const specTerrain = TERRAINS3D[t.terrain];
    if (!specTerrain?.glyphe) continue; // ville / cratère : non productives, pas de slot
    if (!t.ressource) continue; // pas de slot sur une tuile sans ressource
    const spec = S.slot;
    const { x, z } = hexWorldPos({ q: t.q, r: t.r });
    const elev = specTerrain.elev;
    const fog = t.fog;
    // Rotation 180° de la tuile (correctif V2-bis — décision Erik 05/09) :
    // TOUT le décor posé sur la tuile tourne autour du centre de l'hexagone
    // ((dx, dz) → (−dx, −dz), miroir du calque glyphes de world3d) — le slot
    // se retrouve dans le coin le plus ÉLOIGNÉ de la caméra (nord), la carte
    // dégagée des voies de bus.
    const ox = -spec.offset[0];
    const oz = -spec.offset[1];

    // socle rectangulaire vertical (format « carte ») + liseré néon (cadre) —
    // grand axe PARALLÈLE aux voies de bus (axe X), posé hors des voies
    push('slot', { x: x + ox, y: elev + spec.hauteur / 2, z: z + oz, sx: spec.longueur, sy: spec.hauteur, sz: spec.largeur, ry: 0, couleur: dim(spec.couleur, fog) });
    push('slotLiseret', { x: x + ox, y: elev + spec.hauteur + 0.002, z: z + oz, sx: 1, sy: 1, sz: 1, ry: 0, couleur: dim(spec.liseret, fog) });

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
        x: x + ox,
        y: base + ((f.hauteur * k) / 2) * Math.cos(incl),
        z: z + oz + ((f.hauteur * k) / 2) * Math.sin(incl),
        sx: f.largeur * k, sy: f.hauteur * k, sz: f.epaisseur * k,
        rx: incl, ry: 0, couleur: 0xffffff,
      });
    } else {
      // pilier (cylindre) / borne (prisme hex) : verticaux, posés sur le slot
      const f = S.formes[formeNom] as { rayon: number; hauteur: number };
      push(pool, {
        x: x + ox, y: base + (f.hauteur * k) / 2, z: z + oz,
        sx: f.rayon * k, sy: f.hauteur * k, sz: f.rayon * k,
        ry: 0, couleur: 0xffffff,
      });
    }

    // Mini-glyphes de bonus (atelier Erik 05/09) : bus = Nourriture,
    // cpu = Production, ram = Commerce, ram dorée = Or direct, losange
    // néon cyberpunk = Culture. Rangée à plat sur la face INTÉRIEURE de la
    // carte (sens d'ORIGINE — le retournement de carte du premier correctif
    // est annulé : c'est la TUILE qui pivote, pas la carte), 1 instance par
    // point de bonus.
    if (specCarte) {
      const cb = S.carteBonus;
      const { famille, valeur: n } = specCarte.bonus;
      const profFace = formeNom === 'plaque'
        ? (S.formes.plaque as { epaisseur: number }).epaisseur * k / 2
        : (S.formes[formeNom] as { rayon: number }).rayon * k;
      const hCarte = formeNom === 'plaque'
        ? (S.formes.plaque as { hauteur: number }).hauteur * k
        : (S.formes[formeNom] as { hauteur: number }).hauteur * k;
      const yCarte = base + hCarte / 2;
      const yRangee = yCarte + hCarte * (0.5 - cb.basDeCarte);
      // Face INTÉRIEURE : les glyphes regardent vers le centre de la tuile —
      // la carte étant désormais au bord NORD (coin éloigné de la caméra),
      // cette face regarde naturellement la caméra. RAM et Or : puces CARRÉS
      // plus épaisses, portées par un petit socle noir (décision Erik 05/09)
      // — les distingue des bus et des CPU au premier coup d'œil.
      const ramOuOr = famille === 'ram' || famille === 'or';
      for (let i = 0; i < n; i++) {
        const gx = x + ox + (i - (n - 1) / 2) * cb.espacement;
        if (ramOuOr) {
          push('cgSocle', {
            x: gx, y: yRangee,
            z: z + oz + profFace + 0.007,
            sx: 1, sy: 1, sz: 1, ry: 0,
            couleur: dim(0x0a0d10, fog),
          });
          push(`cg:${famille}`, {
            x: gx, y: yRangee,
            z: z + oz + profFace + 0.014 + 0.015,
            sx: 1, sy: 1, sz: 1, ry: 0,
            couleur: dim(cb.couleurs[famille], fog),
          });
        } else {
          push(`cg:${famille}`, {
            x: gx, y: yRangee,
            z: z + oz + profFace + 0.008,
            sx: 1, sy: 1, sz: 1, ry: 0,
            couleur: dim(cb.couleurs[famille], fog),
          });
        }
      }
    }
  }

  // --- Mainframe (villes) — « processeur géant » style Transistor -------------
  // PCB hexagonal sombre, die plat dont l'emprise croît avec la population,
  // nervures néon gravées rayonnant du cœur central, liseret accent joueur.
  for (const v of e.villes) {
    const { x, z } = hexWorldPos({ q: v.q, r: v.r });
    const elev = TERRAINS3D['ville']?.elev ?? 0;
    const accent = dim(e.couleurDe(v.owner), v.fog);
    const palier = palierDe(v.pop);
    const mf = S.mainframe;

    // PCB (socle plat) puis die : dalle plate basse, plus large à chaque palier
    push('mfSocle', { x, y: elev + mf.socle.hauteur / 2, z, sx: mf.socle.rayon, sy: mf.socle.hauteur, sz: mf.socle.rayon, ry: 0, couleur: dim(mf.socle.couleur, v.fog) });
    const baseDie = elev + mf.socle.hauteur;
    push('mfCorps', { x, y: baseDie + palier.hauteur / 2, z, sx: palier.rayon, sy: palier.hauteur, sz: palier.rayon, ry: 0, couleur: dim(mf.corps.couleur, v.fog) });
    // liseré néon accent joueur AUTOUR du die (cadre, pas une plaque) ;
    // capitale : cadre plus large (débordant sur le PCB)
    const largeurBande = palier.rayon * (v.capital ? mf.capitale.accentLargeur : 1) * 1.03;
    push('mfBande', { x, y: baseDie + palier.hauteur - mf.corps.bande.hauteur / 2, z, sx: largeurBande, sy: mf.corps.bande.hauteur, sz: largeurBande, ry: 0, couleur: accent });
    // nervures néon : croix + diagonales rayonnant du cœur vers les bords
    const sommet = baseDie + palier.hauteur;
    const nv = mf.nervures;
    const portee = palier.rayon * nv.portee;
    const nervures: Array<{ ry: number; longueur: number }> = [
      { ry: 0, longueur: portee },
      { ry: Math.PI / 2, longueur: portee },
      { ry: Math.PI / 4, longueur: portee * 0.6 },
      { ry: -Math.PI / 4, longueur: portee * 0.6 },
    ];
    for (const n of nervures) {
      push('mfNervure', { x, y: sommet + nv.hauteur / 2, z, sx: n.longueur, sy: nv.hauteur, sz: nv.largeur, ry: n.ry, couleur: dim(nv.couleur, v.fog) });
    }
    // cœur émissif central (capitale : cœur plus haut + couronne en orbite)
    const hCoeur = mf.coeur.hauteur * (v.capital ? mf.capitale.coeurHauteur : 1);
    push('mfCoeur', { x, y: sommet + hCoeur / 2, z, sx: mf.coeur.rayon, sy: hCoeur, sz: mf.coeur.rayon, ry: 0, couleur: dim(mf.coeur.couleur, v.fog) });
    if (v.capital) {
      push('mfCouronne', { x, y: sommet + hCoeur * mf.capitale.couronne.hauteur, z, sx: 1, sy: 1, sz: 1, ry: 0, couleur: accent });
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

  // --- Huttes & villages barbares — visages électroniques (Erik 05/09) --------
  // Hutte : dôme pâle au visage bienveillant (yeux doux + petite bouche).
  // Village : dôme rouge élancé au visage malveillant (yeux en barres
  // inclinées + bouche néon). Face avant = +z, plaquée sur le dôme.
  for (const h of e.huttes) {
    const { x, z } = hexWorldPos({ q: h.q, r: h.r });
    const elev = TERRAINS3D[h.terrain ?? '']?.elev ?? 0;
    const f = S.hutte.visage;
    push('hutte', { x, y: elev, z, sx: S.hutte.rayon, sy: S.hutte.hauteur, sz: S.hutte.rayon, ry: 0, couleur: dim(S.hutte.couleur, h.fog) });
    push('hutteAccent', { x, y: elev + S.hutte.hauteur + 0.04, z, sx: 1, sy: 1, sz: 1, ry: 0, couleur: dim(S.hutte.accent, h.fog) });
    const yYeux = elev + S.hutte.hauteur * f.yeux.hauteurRelative;
    // z sur la surface de l'ellipsoïde : r(y) puis raccord au décalage x
    const rTroncYeux = S.hutte.rayon * Math.sqrt(Math.max(0.01, 1 - f.yeux.hauteurRelative ** 2));
    for (const cote of [-1, 1]) {
      const dx = f.yeux.espacement;
      const zSurf = Math.sqrt(Math.max(0.01, rTroncYeux * rTroncYeux - dx * dx));
      push('hutteYeux', { x: x + cote * dx, y: yYeux, z: z + zSurf * 0.92, sx: 1, sy: 1, sz: 1, ry: 0, couleur: dim(f.couleur, h.fog) });
    }
    const yBouche = elev + S.hutte.hauteur * f.bouche.hauteurRelative;
    const rTroncBouche = S.hutte.rayon * Math.sqrt(Math.max(0.01, 1 - f.bouche.hauteurRelative ** 2));
    const zBouche = Math.sqrt(Math.max(0.01, rTroncBouche * rTroncBouche - (f.bouche.largeur / 2) ** 2));
    push('hutteBouche', { x, y: yBouche, z: z + zBouche * 0.95, sx: f.bouche.largeur, sy: f.bouche.hauteur, sz: 0.012, ry: 0, couleur: dim(f.couleur, h.fog) });
  }
  for (const v of e.villages) {
    const { x, z } = hexWorldPos({ q: v.q, r: v.r });
    const elev = TERRAINS3D[v.terrain ?? '']?.elev ?? 0;
    const f = S.village.visage;
    push('village', { x, y: elev, z, sx: S.village.rayon, sy: S.village.hauteur, sz: S.village.rayon, ry: 0, couleur: dim(S.village.couleur, v.fog) });
    push('villageMur', { x, y: elev + S.village.mur.hauteur / 2, z, sx: 1, sy: 1, sz: 1, ry: 0, couleur: dim(S.village.accent, v.fog) });
    // yeux en barres inclinées (air menaçant) — rotation ry en miroir,
    // plaqués sur la surface de l'ellipsoïde (z raccordé au décalage x)
    const yYeux = elev + S.village.hauteur * f.yeux.hauteurRelative;
    const rTroncYeux = S.village.rayon * Math.sqrt(Math.max(0.01, 1 - f.yeux.hauteurRelative ** 2));
    for (const cote of [-1, 1]) {
      const dx = f.yeux.espacement + f.yeux.longueur! / 2;
      const zSurf = Math.sqrt(Math.max(0.01, rTroncYeux * rTroncYeux - dx * dx));
      push('villageYeux', {
        x: x + cote * f.yeux.espacement, y: yYeux, z: z + zSurf + 0.012,
        sx: f.yeux.longueur!, sy: f.yeux.hauteur!, sz: 0.02,
        ry: cote * f.yeux.inclinaison!, couleur: dim(f.couleur, v.fog),
      });
    }
    // bouche néon plate (grille « électronique »)
    const yBouche = elev + S.village.hauteur * f.bouche.hauteurRelative;
    const rTroncBouche = S.village.rayon * Math.sqrt(Math.max(0.01, 1 - f.bouche.hauteurRelative ** 2));
    const zBouche = Math.sqrt(Math.max(0.01, rTroncBouche * rTroncBouche - (f.bouche.largeur / 2) ** 2));
    push('villageBouche', { x, y: yBouche, z: z + zBouche + 0.01, sx: f.bouche.largeur, sy: f.bouche.hauteur, sz: 0.016, ry: 0, couleur: dim(f.couleur, v.fog) });
  }

  // --- Unités 3D — créatures cyber (atelier 05/09) ----------------------------
  // « Script de Base » (guerrier) : pattes + bras armé d'une lame accent joueur.
  // « Sentinelle Réseau » (archer) : bras levé lançant un lasso électrique —
  // segments en arc terminés par une boucle néon (impression d'attaque à distance).
  // `echelle` est le facteur global (unités plus fortes → plus grandes).
  for (const u of e.unites ?? []) {
    // Interpolation de playback : position ET élévation lerpées entre la case
    // de départ et la case d'arrivée (mouvements animés du vrai jeu).
    let { x, z } = hexWorldPos({ q: u.q, r: u.r });
    let elev = TERRAINS3D[u.terrain ?? '']?.elev ?? 0;
    if (u.interpole) {
      const it = u.interpole;
      const a = hexWorldPos({ q: it.deQ, r: it.deR });
      const b = hexWorldPos({ q: u.q, r: u.r });
      const elevA = TERRAINS3D[it.deTerrain ?? '']?.elev ?? elev;
      x = a.x + (b.x - a.x) * it.t;
      z = a.z + (b.z - a.z) * it.t;
      elev = elevA + (elev - elevA) * it.t;
    }
    const accent = dim(e.couleurDe(u.owner ?? 'barbarien'), u.fog);
    const archer = u.type === 'archer';
    const ug = archer ? S.uniteArcher : S.uniteGuerrier;
    const k = ug.echelle;

    // torse (prisme hexagonal allongé vers l'avant) porté par les pattes
    const yTorse = elev + (ug.corps.survol + ug.corps.hauteur / 2) * k;
    push('ugCorps', {
      x, y: yTorse, z,
      sx: ug.corps.largeur * k, sy: ug.corps.hauteur * k, sz: ug.corps.profondeur * k,
      ry: 0, couleur: dim(ug.corps.couleur, u.fog),
    });
    // cœur-process : néon cyan au sommet du torse
    push('ugCoeur', {
      x, y: yTorse + (ug.corps.hauteur / 2 + ug.coeur.rayon * 0.9) * k, z,
      sx: ug.coeur.rayon * k, sy: ug.coeur.rayon * 1.5 * k, sz: ug.coeur.rayon * k,
      ry: Math.PI / 6, couleur: dim(ug.coeur.couleur, u.fog),
    });
    // pattes : hanches sous le torse, pieds écartés au sol — boîtes longues
    // en Z, tangées en azimut puis tangées vers le bas (ordre YXZ)
    const rHanche = Math.min(ug.corps.largeur, ug.corps.profondeur) * 0.3 * k;
    const DeltaR = (ug.pattes.ecartement - Math.min(ug.corps.largeur, ug.corps.profondeur) * 0.3) * k;
    const chute = ug.corps.survol * k;
    const longPatte = Math.hypot(chute, DeltaR);
    const tangage = Math.atan2(chute, DeltaR);
    const pas = (Math.PI * 2) / ug.pattes.nombre;
    for (let i = 0; i < ug.pattes.nombre; i++) {
      const theta = Math.PI / 4 + i * pas; // évite l'avant (+z) où tient le bras
      const rMilieu = (rHanche + ug.pattes.ecartement * k) / 2;
      push('ugPatte', {
        x: x + Math.sin(theta) * rMilieu,
        y: elev + chute / 2,
        z: z + Math.cos(theta) * rMilieu,
        sx: ug.pattes.epaisseur * k, sy: ug.pattes.epaisseur * k, sz: longPatte,
        rx: tangage, ry: theta, couleur: dim(ug.pattes.couleur, u.fog),
      });
    }
    // épaule à l'avant du torse — bras vers l'avant (guerrier) ou levé (archer)
    const yEpaule = elev + (ug.corps.survol + ug.corps.hauteur * 0.65) * k;
    const zEpaule = (ug.corps.profondeur / 2) * k;
    const dirY = -Math.sin(ug.bras.inclinaison);
    const dirZ = Math.cos(ug.bras.inclinaison);
    push('ugBras', {
      x,
      y: yEpaule + dirY * (ug.bras.longueur / 2) * k,
      z: z + zEpaule + dirZ * (ug.bras.longueur / 2) * k,
      sx: ug.bras.epaisseur * k, sy: ug.bras.epaisseur * k, sz: ug.bras.longueur * k,
      rx: ug.bras.inclinaison, ry: 0, couleur: dim(ug.bras.couleur, u.fog),
    });
    // poing au bout du bras
    const yPoing = yEpaule + dirY * ug.bras.longueur * k;
    const zPoing = z + zEpaule + dirZ * ug.bras.longueur * k;

    if (archer) {
      // lasso électrique : arc de Bézier quadratique du poing vers l'avant,
      // segments affineés (effilés vers le bout), boucle néon à l'extrémité
      const la = S.uniteArcher.lasso;
      const H: [number, number, number] = [x, yPoing, zPoing];
      const E: [number, number, number] = [x, yPoing - 0.05 * k, zPoing + la.longueur * k];
      const C: [number, number, number] = [x, yPoing + la.hauteur * k, zPoing + la.longueur * 0.45 * k];
      const bez = (t: number, a: number, c: number, b: number): number =>
        (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
      const n = Math.max(2, Math.round(la.segments));
      let px = H[0], py = H[1], pz = H[2];
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const nx = bez(t, H[0], C[0], E[0]);
        const ny = bez(t, H[1], C[1], E[1]);
        const nz = bez(t, H[2], C[2], E[2]);
        const dx = nx - px, dy = ny - py, dz = nz - pz;
        const long = Math.hypot(dx, dy, dz);
        // orientation : +z local aligné sur le segment (tangage puis lacet, YXZ)
        const alpha = Math.asin(Math.max(-1, Math.min(1, dy / long)));
        const theta = Math.atan2(dx, dz);
        const effile = 1 - (i / n) * 0.5;
        push('ugLasso', {
          x: (px + nx) / 2, y: (py + ny) / 2, z: (pz + nz) / 2,
          sx: la.epaisseur * effile * k, sy: la.epaisseur * effile * k, sz: long,
          rx: alpha, ry: theta, couleur: dim(la.boucle.couleur, u.fog),
        });
        px = nx; py = ny; pz = nz;
      }
      // boucle électrique au bout (face +z, émissive — claque au bloom)
      push('ugBoucle', {
        x: E[0], y: E[1], z: E[2] + la.boucle.rayon * 0.5 * k,
        sx: la.boucle.rayon * k, sy: la.boucle.rayon * k, sz: la.boucle.rayon * k,
        ry: 0, couleur: dim(la.boucle.couleur, u.fog),
      });
    } else {
      // lame : verticale au poing, couleur = accent joueur (R-65)
      const arme = S.uniteGuerrier.arme;
      push('ugArme', {
        x,
        y: yPoing + (arme.longueur / 2) * k * 0.7,
        z: zPoing,
        sx: arme.largeur * k, sy: arme.longueur * k, sz: arme.largeur * 0.4 * k,
        ry: 0, couleur: accent,
      });
    }
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

/** Détail par pool (instances utilisées) — vérifications GUI/e2e (dev). */
export function detailsPools(plan: PlanStructures): Record<string, number> {
  return Object.fromEntries([...plan.entries()].map(([k, v]) => [k, v.length]));
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

/** Cadre hexagonal horizontal (liseré néon du die du Mainframe) — rayon
 *  EXTÉRIEUR unitaire, épaisseur proportionnelle (fraction intérieure),
 *  centré verticalement comme le prisme : l'instance porte le rayon du die. */
function cadreHexagonal(fractionInterieure: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const trou = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    if (i === 0) {
      shape.moveTo(Math.cos(a), Math.sin(a));
      trou.moveTo(Math.cos(a) * fractionInterieure, Math.sin(a) * fractionInterieure);
    } else {
      shape.lineTo(Math.cos(a), Math.sin(a));
      trou.lineTo(Math.cos(a) * fractionInterieure, Math.sin(a) * fractionInterieure);
    }
  }
  shape.closePath();
  trou.closePath();
  shape.holes.push(trou);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -0.5, 0);
  return geo;
}

/** Cadre rectangulaire horizontal (liseré du slot « carte ») — dimensions
 *  ABSOLUES en XZ (l'instance ne scale pas : le cadre garde son épaisseur). */
function cadreRectangle(largeur: number, longueur: number, epaisseur: number): THREE.BufferGeometry {
  const hw = largeur / 2 + epaisseur;
  const hl = longueur / 2 + epaisseur;
  const shape = new THREE.Shape()
    .moveTo(-hw, -hl).lineTo(hw, -hl).lineTo(hw, hl).lineTo(-hw, hl).closePath();
  const iw = largeur / 2;
  const il = longueur / 2;
  const trou = new THREE.Path()
    .moveTo(-iw, -il).lineTo(-iw, il).lineTo(iw, il).lineTo(iw, -il).closePath();
  shape.holes.push(trou);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
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
      ['slot', { capacity: ct, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.85 }) }) }],
      ['slotLiseret', { capacity: ct, creer: () => ({ geo: cadreRectangle(S.slot.longueur, S.slot.largeur, 0.014), mat: matStructure({ roughness: 0.35, emissive: S.slot.liseret, emissiveIntensity: 0.5 }) }) }],
      // mini-glyphes de bonus sur les cartes (minces en Z — plaqués à plat
      // contre la face verticale de la carte) ; couleur d'émissif par famille,
      // l'instance ne porte que l'atténuation de fog.
      ['cg:bus', { capacity: ct * 4, creer: () => ({ geo: new THREE.BoxGeometry(0.14, 0.032, 0.012), mat: matStructure({ roughness: 0.4, emissive: S.carteBonus.couleurs.bus, emissiveIntensity: 0.6 }) }) }],
      ['cg:cpu', { capacity: ct * 4, creer: () => ({ geo: new THREE.BoxGeometry(0.06, 0.06, 0.012), mat: matStructure({ roughness: 0.4, emissive: S.carteBonus.couleurs.cpu, emissiveIntensity: 0.6 }) }) }],
      ['cg:ram', { capacity: ct * 4, creer: () => ({ geo: new THREE.BoxGeometry(0.05, 0.05, 0.03), mat: matStructure({ roughness: 0.4, emissive: S.carteBonus.couleurs.ram, emissiveIntensity: 0.6 }) }) }],
      ['cg:or', { capacity: ct * 4, creer: () => ({ geo: new THREE.BoxGeometry(0.05, 0.05, 0.03), mat: matStructure({ roughness: 0.3, metalness: 0.6, emissive: S.carteBonus.couleurs.or, emissiveIntensity: 0.7 }) }) }],
      ['cgSocle', { capacity: ct * 4, creer: () => ({ geo: new THREE.BoxGeometry(0.08, 0.08, 0.014), mat: matStructure({ roughness: 0.85 }) }) }],
      ['cg:culture', { capacity: ct * 4, creer: () => ({ geo: new THREE.OctahedronGeometry(0.032).scale(1, 1.4, 0.4), mat: matStructure({ roughness: 0.35, emissive: S.carteBonus.couleurs.culture, emissiveIntensity: 0.9 }) }) }],
      ['carteInconnue', { capacity: 512, creer: () => this.creerCarte(null) }],
      // cartes RÉVÉLÉES : un pool par ressource (texture de face dédiée) —
      // sans fabrique, le garde-fou de update() sauterait silencieusement
      // toute carte dont l'identité est connue (bug d'Erik du 05/09).
      ...Object.keys(S.cartes).map((id): [string, FabriquePool] => [`carte:${id}`, { capacity: 512, creer: () => this.creerCarte(id) }]),
      ['mfSocle', { capacity: cv * 2, creer: () => ({ geo: hexPrismeUnitaire(), mat: matStructure({ roughness: 0.9 }) }) }],
      ['mfCorps', { capacity: cv * 2, creer: () => ({ geo: hexPrismeUnitaire(), mat: matStructure({ roughness: 0.45, metalness: 0.4 }) }) }],
      ['mfBande', { capacity: cv * 2, creer: () => ({ geo: cadreHexagonal(0.9), mat: matStructure({ roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.12 }) }) }],
      // nervures néon gravées sur le die + cœur émissif central (style Transistor)
      ['mfNervure', { capacity: cv * 8, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.3, emissive: S.mainframe.nervures.couleur, emissiveIntensity: S.mainframe.nervures.emissif }) }) }],
      ['mfCoeur', { capacity: cv * 2, creer: () => ({ geo: hexPrismeUnitaire(), mat: matStructure({ roughness: 0.3, emissive: S.mainframe.coeur.couleur, emissiveIntensity: S.mainframe.coeur.emissif }) }) }],
      ['mfCouronne', { capacity: cv, creer: () => ({ geo: new THREE.TorusGeometry(S.mainframe.capitale.couronne.rayon, 0.016, 6, 24).rotateX(Math.PI / 2), mat: matStructure({ roughness: 0.35 }) }) }],
      ['mfModule', { capacity: cv * 6, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.45 }) }) }],
      ['mfMerveille', { capacity: cv, creer: () => ({ geo: new THREE.ConeGeometry(1, 1, 4), mat: matStructure({ emissive: S.mainframe.merveille.couleur, emissiveIntensity: S.mainframe.merveille.emissif, roughness: 0.3, metalness: 0.4 }) }) }],
      ['cratereRebord', { capacity: 64, creer: () => ({ geo: new THREE.TorusGeometry(S.cratere.rayon, S.cratere.rebord.epaisseur, 8, 24).rotateX(Math.PI / 2), mat: matStructure({ roughness: 0.9 }) }) }],
      ['cratereFond', { capacity: 64, creer: () => ({ geo: new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), mat: matStructure({ roughness: 0.95 }) }) }],
      ['hutte', { capacity: 256, creer: () => ({ geo: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat: matStructure({ roughness: 0.8, emissive: S.hutte.couleur, emissiveIntensity: S.hutte.lueur }) }) }],
      ['hutteAccent', { capacity: 256, creer: () => ({ geo: new THREE.SphereGeometry(0.035, 8, 6), mat: matStructure({ emissive: S.hutte.accent, emissiveIntensity: 0.8, roughness: 0.3 }) }) }],
      // visage bienveillant de la hutte (yeux ronds doux + bouche pâle)
      ['hutteYeux', { capacity: 512, creer: () => ({ geo: new THREE.SphereGeometry(S.hutte.visage.yeux.rayon!, 8, 6), mat: matStructure({ roughness: 0.35, emissive: S.hutte.visage.couleur, emissiveIntensity: S.hutte.visage.emissif }) }) }],
      ['hutteBouche', { capacity: 256, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.35, emissive: S.hutte.visage.couleur, emissiveIntensity: S.hutte.visage.emissif }) }) }],
      ['village', { capacity: 256, creer: () => ({ geo: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat: matStructure({ roughness: 0.8, emissive: S.village.couleur, emissiveIntensity: S.village.lueur }) }) }],
      ['villageMur', { capacity: 256, creer: () => ({ geo: new THREE.TorusGeometry(S.village.mur.rayon, S.village.mur.epaisseur, 6, 24).rotateX(Math.PI / 2), mat: matStructure({ roughness: 0.8 }) }) }],
      // visage malveillant du village (yeux en barres rouges + bouche néon)
      ['villageYeux', { capacity: 512, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.3, emissive: S.village.visage.couleur, emissiveIntensity: S.village.visage.emissif }) }) }],
      ['villageBouche', { capacity: 256, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.3, emissive: S.village.visage.couleur, emissiveIntensity: S.village.visage.emissif }) }) }],
      // « Script de Base » (Guerrier cyber 3D) — créature à pattes et bras armé
      ['ugCorps', { capacity: 512, creer: () => ({ geo: hexPrismeUnitaire(), mat: matStructure({ roughness: 0.5, metalness: 0.35 }) }) }],
      ['ugCoeur', { capacity: 512, creer: () => ({ geo: new THREE.OctahedronGeometry(1), mat: matStructure({ roughness: 0.25, emissive: S.uniteGuerrier.coeur.couleur, emissiveIntensity: S.uniteGuerrier.coeur.emissif }) }) }],
      ['ugPatte', { capacity: 512 * 4, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.6, metalness: 0.3 }) }) }],
      ['ugBras', { capacity: 512, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.6, metalness: 0.3 }) }) }],
      ['ugArme', { capacity: 512, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.3, emissive: 0xffffff, emissiveIntensity: S.uniteGuerrier.arme.emissif }) }) }],
      // lasso électrique de la Sentinelle (segments accent joueur + boucle néon)
      ['ugLasso', { capacity: 512 * 8, creer: () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: matStructure({ roughness: 0.3, emissive: 0xffffff, emissiveIntensity: S.uniteArcher.lasso.emissif }) }) }],
      ['ugBoucle', { capacity: 512, creer: () => ({ geo: new THREE.TorusGeometry(1, 0.22, 6, 16), mat: matStructure({ roughness: 0.25, emissive: S.uniteArcher.lasso.boucle.couleur, emissiveIntensity: S.uniteArcher.lasso.boucle.emissif }) }) }],
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
        // ordre YXZ : lacet (ry) d'abord, puis tangage LOCAL (rx) — indispensable
        // pour les pattes/bras orientés en azimut (aucun pool existant ne combine
        // rx et ry avec l'ancien ordre : sans effet ailleurs).
        e.set(i.rx ?? 0, i.ry, 0, 'YXZ');
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
