/**
 * Tests des STRUCTURES 3D (chantier V2) : planificateur pur (`planifierStructures`)
 * — Mainframe des villes (L1), cartes-ressources en slots (L2), cratère et
 * huttes/villages barbares (L3). Aucun DOM ni WebGL : la moitié Three.js
 * (`StructuresWorld`) n'est pas instanciée ici, le plan est la vérité testée.
 * Références : handoff CHANTIER-V2, R-92 (ressource inconnue), R-93 (bonus
 * verrouillé), R-60bis (tranches démographiques), R-65 (capture), 7m C15 (cratère).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RESOURCES, RESOURCE_UNKNOWN, BUILDINGS, tileKeyOf, makeState, getFilteredState } from '@game/rules';
import type { Hex } from '@game/rules';
import { STRUCTURES3D, TERRAINS3D, categorieDeBatiment, VILLE3D, VILLAGE_BARBARE3D, HUTTE_TRIPO3D, TUILE_PRAIRIE3D, TUILE_PLAINE3D, TUILE_PLAINE_GRENIER3D, TUILE_MONTAGNE3D, TUILE_COLLINE3D } from '../src/lib/render3d/spec3d.js';
import {
  planifierStructures, palierDe, estCarteNeutre, peindrePicto, StructuresWorld, creerGuerrierHumain,
} from '../src/lib/render3d/structures3d.js';
import type { EntreeStructures, TuileStructures, VilleStructures } from '../src/lib/render3d/structures3d.js';

const COULEURS: Record<string, number> = { p1: 0xd64545, p2: 0x3b6fd6, barbarien: 0x8a7a66 };
const couleurDe = (owner: string): number => COULEURS[owner] ?? 0x8a5ad6;

function tuile(q: number, r: number, terrain: string, ressource: string | null = null, fog: 'visible' | 'explored' = 'visible'): TuileStructures {
  return { q, r, terrain, ressource, fog };
}

function ville(id: string, q: number, r: number, opts: Partial<Omit<VilleStructures, 'id' | 'q' | 'r'>> = {}): VilleStructures {
  return {
    id, q, r, pop: 1, capital: false, owner: 'p1',
    buildings: [], wonders: [], fog: 'visible', ...opts,
  };
}

function entree(parts: Partial<EntreeStructures> = {}): EntreeStructures {
  return { tuiles: [], villes: [], huttes: [], villages: [], couleurDe, ...parts };
}

function hexAutour(q: number, r: number): Hex { return { q, r }; }

describe('L0 — spec structures data-driven (visuel3d.json)', () => {
  it('couvre exactement les 22 ressources du moteur', () => {
    expect(Object.keys(STRUCTURES3D.cartes).sort()).toEqual(Object.keys(RESOURCES).sort());
  });

  it('couvre tous les bâtiments du moteur avec des catégories valides', () => {
    for (const bat of Object.keys(BUILDINGS)) {
      expect(STRUCTURES3D.mainframe.categorieBatiment[bat], `bâtiment ${bat}`).toMatch(
        /^(science|or|production|culture|defense)$/,
      );
    }
    expect(categorieDeBatiment('inexistant')).toBe('production'); // défaut 🔶
  });

  it('pose 3 paliers de population croissants couvrant le plafond (31 — R-60bis)', () => {
    const paliers = STRUCTURES3D.mainframe.paliers;
    expect(paliers).toHaveLength(3);
    for (let i = 1; i < paliers.length; i++) {
      expect(paliers[i]!.popMax).toBeGreaterThan(paliers[i - 1]!.popMax);
      expect(paliers[i]!.hauteur).toBeGreaterThan(paliers[i - 1]!.hauteur);
    }
    expect(paliers[paliers.length - 1]!.popMax).toBeGreaterThanOrEqual(31);
  });

  it('garde le slot standard DANS la tuile (rayon inscrit ≈ 0.866) et identique partout', () => {
    const s = STRUCTURES3D.slot;
    expect(Math.hypot(s.offset[0], s.offset[1])).toBeLessThan(0.7);
    expect(s.largeur).toBeGreaterThan(0);
    expect(s.longueur).toBeGreaterThan(0);
    expect(s.hauteur).toBeGreaterThan(0);
    // format « carte » : le slot est plus long (z) que large (x)
    expect(s.longueur).toBeGreaterThan(s.largeur);
  });

  it('rend la carte neutre plus petite que la pleine (R-92 — « taille de base réduite »)', () => {
    expect(STRUCTURES3D.carteNeutre.facteur).toBeLessThan(1);
    expect(STRUCTURES3D.carteNeutre.facteur).toBeGreaterThan(0.3);
  });
});

describe('VILLE-TRIPO T2 — visuel .glb de la ville (décision Erik 08/09)', () => {
  it('la spec §structures.ville3d pointe l’asset validé (toutes les villes, quel que soit le pop)', () => {
    expect(VILLE3D).not.toBeNull();
    expect(VILLE3D).toMatchObject({ kind: 'glb', glb: 'ville_v1.glb', echelle: 1.0 });
  });
  it('le fallback Mainframe reste planifiable (atelier — aucune suppression sauvage)', () => {
    const plan = planifierStructures(entree({ villes: [ville('v1', 2, 3)] }));
    expect(plan.get('mfSocle')).toHaveLength(1);
  });
});

describe('VILLAGE barbare .glb (asset Tripo, décision Erik 08/09)', () => {
  it('la spec §structures.villageBarbare3d pointe l’asset (couleurs d’origine, échelle calée sur le dôme procédural)', () => {
    expect(VILLAGE_BARBARE3D).not.toBeNull();
    expect(VILLAGE_BARBARE3D).toMatchObject({ kind: 'glb', glb: 'village_barbare_v1.glb', echelle: 0.65 });
  });
  it('le fallback dôme procédural reste planifiable (atelier)', () => {
    const plan = planifierStructures(entree({ villages: [{ id: 'v', q: 1, r: 1, fog: 'visible', terrain: 'prairie' }] }));
    expect(plan.get('village')).toHaveLength(1);
  });
});

describe('HUTTE .glb (asset Tripo, décision Erik 08/09)', () => {
  it('la spec §structures.hutte3d pointe l’asset (couleurs d’origine, échelle calée sur le dôme procédural)', () => {
    expect(HUTTE_TRIPO3D).not.toBeNull();
    expect(HUTTE_TRIPO3D).toMatchObject({ kind: 'glb', glb: 'hutte_v1.glb', echelle: 0.3 });
  });
  it('le fallback dôme procédural reste planifiable (atelier)', () => {
    const plan = planifierStructures(entree({ huttes: [{ id: 'h', q: 1, r: 1, fog: 'visible', terrain: 'prairie' }] }));
    expect(plan.get('hutte')).toHaveLength(1);
  });
});

describe('TUILE prairie .glb (asset Tripo, décision Erik 08/09)', () => {
  it('la spec §structures.tuilePrairie3d pointe l’asset (épouse l’hexagone : échelle 1.0)', () => {
    expect(TUILE_PRAIRIE3D).not.toBeNull();
    expect(TUILE_PRAIRIE3D).toMatchObject({ kind: 'glb', glb: 'prairie_v2.glb', echelle: 2.0 });
  });
});

describe('TUILE plaine .glb (asset Tripo, décision Erik 08/09)', () => {
  it('la spec §structures.tuilePlaine3d pointe la variante de BASE (bus central allumé, échelle 2.0)', () => {
    expect(TUILE_PLAINE3D).not.toBeNull();
    expect(TUILE_PLAINE3D).toMatchObject({ kind: 'glb', glb: 'plaine_v2.glb', echelle: 2.0 });
  });
  it('la variante §structures.tuilePlaineGrenier3d (TOUS les bus allumés) pointe l’asset « plaine on »', () => {
    expect(TUILE_PLAINE_GRENIER3D).not.toBeNull();
    expect(TUILE_PLAINE_GRENIER3D).toMatchObject({ kind: 'glb', glb: 'plaine_grenier_v2.glb', echelle: 2.0 });
  });
});

describe('TUILE montagne .glb (asset Tripo, décision Erik 11/09)', () => {
  it('la spec §structures.tuileMontagne3d pointe l’asset (base au niveau 0 via dy cuit, échelle 2.0)', () => {
    expect(TUILE_MONTAGNE3D).not.toBeNull();
    expect(TUILE_MONTAGNE3D).toMatchObject({ kind: 'glb', glb: 'montagne_v1.glb', echelle: 2.0 });
  });
});

describe('TUILE colline .glb (asset Tripo, décision Erik 11/09)', () => {
  it('la spec §structures.tuileColline3d pointe l’asset (base au niveau 0 via dy cuit, échelle 2.0)', () => {
    expect(TUILE_COLLINE3D).not.toBeNull();
    expect(TUILE_COLLINE3D).toMatchObject({ kind: 'glb', glb: 'colline_v1.glb', echelle: 2.0 });
  });
});

describe('L1 — Mainframe (Nœud Serveur) : suit l’état de la ville', () => {
  it('pose un Mainframe sur chaque ville (socle + die + liseret + nervures + cœur)', () => {
    const plan = planifierStructures(entree({ villes: [ville('v1', 2, 3)] }));
    for (const pool of ['mfSocle', 'mfCorps', 'mfBande', 'mfCoeur']) {
      expect(plan.get(pool)).toHaveLength(1);
    }
    expect(plan.get('mfNervure')).toHaveLength(4); // croix + 2 diagonales
    // style « processeur géant » : le die est une dalle PLATE (plus large que haute)
    const die = plan.get('mfCorps')![0]!;
    expect(die.sx).toBeGreaterThan(die.sy);
  });

  it('croît avec la population : 3 paliers de gabarit (miroir R-60bis 🔶)', () => {
    const hauteur = (pop: number): number => {
      const plan = planifierStructures(entree({ villes: [ville('v', 0, 0, { pop })] }));
      return plan.get('mfCorps')![0]!.sy;
    };
    expect(hauteur(1)).toBe(palierDe(1).hauteur);
    expect(hauteur(6)).toBe(palierDe(6).hauteur);
    expect(hauteur(7)).toBeGreaterThan(hauteur(6)); // tranche 2
    expect(hauteur(18)).toBe(palierDe(18).hauteur);
    expect(hauteur(19)).toBeGreaterThan(hauteur(18)); // tranche 3
    expect(hauteur(31)).toBe(palierDe(31).hauteur);
    expect(hauteur(1)).toBeLessThan(hauteur(31));
  });

  it('distingue la capitale : couronne + cœur surélevé + accent élargi 🔶', () => {
    const plan = planifierStructures(entree({
      villes: [ville('cap', 0, 0, { capital: true }), ville('ord', 5, 0)],
    }));
    expect(plan.get('mfCouronne')).toHaveLength(1);
    const bandeCap = plan.get('mfBande')![0]!;
    const bandeOrd = plan.get('mfBande')![1]!;
    expect(bandeCap.sx).toBeGreaterThan(bandeOrd.sx); // accent joueur plus large
    const coeurCap = plan.get('mfCoeur')![0]!;
    const coeurOrd = plan.get('mfCoeur')![1]!;
    expect(coeurCap.sy).toBeGreaterThan(coeurOrd.sy);
  });

  it('affiche un module générique par catégorie de bâtiment (art dédiée V3+ 🔶)', () => {
    const plan = planifierStructures(entree({
      villes: [ville('v', 0, 0, { buildings: ['bibliotheque', 'universite', 'marche', 'temple'] })],
    }));
    const modules = plan.get('mfModule')!;
    // bibliotheque + universite → UNE catégorie science (module générique par catégorie)
    expect(modules).toHaveLength(3);
    const couleurs = modules.map((m) => m.couleur);
    expect(couleurs).toContain(STRUCTURES3D.mainframe.modules.categories['science']);
    expect(couleurs).toContain(STRUCTURES3D.mainframe.modules.categories['or']);
    expect(couleurs).toContain(STRUCTURES3D.mainframe.modules.categories['culture']);
  });

  it('affiche le module doré distinct des merveilles hébergées', () => {
    const sans = planifierStructures(entree({ villes: [ville('v', 0, 0)] }));
    expect(sans.get('mfMerveille')).toBeUndefined();
    const avec = planifierStructures(entree({
      villes: [ville('v', 0, 0, { wonders: ['stonehenge'] })],
    }));
    expect(avec.get('mfMerveille')).toHaveLength(1);
    expect(avec.get('mfMerveille')![0]!.couleur).toBe(STRUCTURES3D.mainframe.merveille.couleur);
  });

  it('la capture change l’accent propriétaire (R-65) — bande à la couleur du nouveau joueur', () => {
    const avant = planifierStructures(entree({ villes: [ville('v', 0, 0, { owner: 'p1' })] }));
    const apres = planifierStructures(entree({ villes: [ville('v', 0, 0, { owner: 'p2' })] }));
    expect(avant.get('mfBande')![0]!.couleur).toBe(0xd64545);
    expect(apres.get('mfBande')![0]!.couleur).toBe(0x3b6fd6);
  });

  it('atténue le Mainframe d’une ville explorée-masquée (fog)', () => {
    const plan = planifierStructures(entree({ villes: [ville('v', 0, 0, { fog: 'explored', owner: 'p1' })] }));
    expect(plan.get('mfBande')![0]!.couleur).not.toBe(0xd64545);
  });
});

describe('L2 — Cartes-ressources : slot standard + états R-92', () => {
  it('ne pose un slot QUE sur une tuile productive portant une ressource (décision Erik 05/09)', () => {
    const plan = planifierStructures(entree({
      tuiles: [
        tuile(0, 0, 'prairie'), tuile(1, 0, 'montagne'), tuile(2, 0, 'eau'),
        tuile(3, 0, 'plaine', 'ble'),
      ],
    }));
    // 3 tuiles sans ressource : NI slot NI liseré (correctif V2-bis — remplace
    // le défaut V2 « slot visible même vide »)
    const slots = plan.get('slot')!;
    expect(slots).toHaveLength(1); // la plaine au blé seule
    expect(plan.get('slotLiseret')!).toHaveLength(1);
    expect(plan.get('carteInconnue')).toBeUndefined();
    expect([...plan.keys()].filter((k) => k.startsWith('carte:'))).toEqual(['carte:ble']);
  });

  it('ne pose PAS de slot sur une case de ville ni sur un cratère (non productives)', () => {
    const plan = planifierStructures(entree({
      tuiles: [tuile(0, 0, 'ville', 'fer'), tuile(1, 0, 'cratere', 'fer'), tuile(2, 0, 'prairie')],
    }));
    // même AVEC ressource, ville et cratère restent non productives : zéro slot
    expect(plan.get('slot')).toBeUndefined();
  });

  it('état NEUTRE avant la tech : carte réduite et sans identité (marqueur R-92)', () => {
    const plan = planifierStructures(entree({
      tuiles: [tuile(0, 0, 'desert', RESOURCE_UNKNOWN)],
    }));
    const neutre = plan.get('carteInconnue')!;
    expect(neutre).toHaveLength(1);
    const pleine = planifierStructures(entree({
      tuiles: [tuile(0, 0, 'desert', 'or')], // plaque : même forme que la carte neutre
    }));
    const carte = pleine.get('carte:or')!;
    expect(carte).toHaveLength(1);
    // taille de base réduite : échelle de la pleine × facteur (R-92)
    expect(neutre[0]!.sy).toBeCloseTo(carte[0]!.sy * STRUCTURES3D.carteNeutre.facteur, 5);
    expect(neutre[0]!.sy).toBeLessThan(carte[0]!.sy);
  });

  it('état PLEIN à la découverte : carte propre par ressource (pool dédié, échelle pleine)', () => {
    const plan = planifierStructures(entree({
      tuiles: [tuile(0, 0, 'colline', 'fer'), tuile(1, 0, 'eau', 'poisson')],
    }));
    expect(plan.get('carte:fer')).toHaveLength(1);
    expect(plan.get('carte:poisson')).toHaveLength(1);
    // TOUTES les cartes sont des plaques verticales (décision Erik 05/09 —
    // plus de piliers/bornes) : échelle absolue = largeur de la plaque.
    expect(plan.get('carte:fer')![0]!.sx).toBe(STRUCTURES3D.formes.plaque.largeur);
    expect(plan.get('carte:poisson')![0]!.sx).toBe(STRUCTURES3D.formes.plaque.largeur);
  });

  it('rend le Guerrier HUMANOÏDE cyber « Script de Base » (atelier GUERRIER-3D)', () => {
    const plan = planifierStructures(entree({
      unites: [{ id: 'u1', q: 0, r: 0, fog: 'visible', terrain: 'prairie', owner: 'p1' }],
    }));
    // corps sombre fusionné posé au sol + cœur-process + visière + lame
    expect(plan.get('guCorps')).toHaveLength(1);
    expect(plan.get('ugCoeur')).toHaveLength(1);
    expect(plan.get('guVisiere')).toHaveLength(1);
    expect(plan.get('guLame')).toHaveLength(1);
    // le gabarit créature à 4 pattes a disparu du guerrier
    expect(plan.get('guPatte')).toBeUndefined();
    expect(plan.get('ugPatte')).toBeUndefined();
    // pieds au sol : le corps fusionné est posé sur l'élévation de la case
    expect(plan.get('guCorps')![0]!.y).toBe(TERRAINS3D['prairie']!.elev);
    // le cœur-process flotte devant le plastron, AU-DESSUS du sol
    expect(plan.get('ugCoeur')![0]!.y).toBeGreaterThan(plan.get('guCorps')![0]!.y);
    // la visière est en haut du casque (au-dessus du cœur)
    expect(plan.get('guVisiere')![0]!.y).toBeGreaterThan(plan.get('ugCoeur')![0]!.y);
    // la lame porte l'accent joueur (R-65 — capture change la couleur)
    const p1 = planifierStructures(entree({
      unites: [{ id: 'u1', q: 0, r: 0, fog: 'visible', terrain: 'prairie', owner: 'p1' }],
    }));
    const p2 = planifierStructures(entree({
      unites: [{ id: 'u1', q: 0, r: 0, fog: 'visible', terrain: 'prairie', owner: 'p2' }],
    }));
    expect(p1.get('guLame')![0]!.couleur).toBe(0xd64545);
    expect(p2.get('guLame')![0]!.couleur).toBe(0x3b6fd6);
    // l'intérieur « hologramme » du corps est AUSSI teinté par l'accent joueur
    expect(p1.get('guCorps')![0]!.couleur).toBe(0xd64545);
    expect(p2.get('guCorps')![0]!.couleur).toBe(0x3b6fd6);
  });

  it('budget du gabarit humanoïde : < 5 000 tris, pieds au sol, proportions cohérentes (tuile rayon 1)', () => {
    const gab = creerGuerrierHumain(STRUCTURES3D.uniteGuerrier);
    const tris = (geo: THREE.BufferGeometry): number =>
      (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    const total = tris(gab.corps) + tris(gab.lame);
    expect(total).toBeLessThan(5000);
    // pieds posés (min y ≈ 0) et taille contenue : ~0,6 unité monde à echelle 1
    gab.corps.computeBoundingBox();
    const bb = gab.corps.boundingBox!;
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(bb.max.y).toBeGreaterThan(0.3);
    expect(bb.max.y).toBeLessThan(1);
    // la lame dépasse vers l'avant (+z) et descend sous la taille du torse
    gab.lame.computeBoundingBox();
    expect(gab.lame.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.001);
    // vertex colors présentes sur le corps fusionné (nuances par pièce)
    expect(gab.corps.attributes.color).toBeDefined();
  });

  it('rend l’Archer cyber 3D « Sentinelle Réseau » (bras levé + lasso électrique)', () => {
    const plan = planifierStructures(entree({
      unites: [{ id: 'u1', q: 0, r: 0, fog: 'visible', terrain: 'prairie', owner: 'p1', type: 'archer' }],
    }));
    // gabarit créature propre à l'archer (le guerrier est passé humanoïde)
    expect(plan.get('ugCorps')).toHaveLength(1);
    expect(plan.get('ugPatte')).toHaveLength(4);
    expect(plan.get('ugBras')).toHaveLength(1);
    // bras LEVÉ (inclinaison négative) contrairement au guerrier (tendu vers le bas)
    expect(plan.get('ugBras')![0]!.rx).toBeLessThan(0);
    // lasso électrique : N segments en arc + 1 boucle néon au bout
    const lasso = plan.get('ugLasso')!;
    expect(lasso).toHaveLength(STRUCTURES3D.uniteArcher.lasso.segments);
    expect(lasso[0]!.couleur).toBe(STRUCTURES3D.uniteArcher.lasso.boucle.couleur); // néon électrique
    // l'arc s'étend vers l'avant : dernier segment plus loin que le premier
    expect(lasso[lasso.length - 1]!.z).toBeGreaterThan(lasso[0]!.z);
    expect(plan.get('ugBoucle')).toHaveLength(1);
    // pas de lame sur l'archer
    expect(plan.get('ugArme')).toBeUndefined();
  });

  it('estCarteNeutre : null et marqueur « inconnue » → neutre ; id de la spec → pleine', () => {
    expect(estCarteNeutre(null)).toBe(true);
    expect(estCarteNeutre(RESOURCE_UNKNOWN)).toBe(true);
    expect(estCarteNeutre('fer')).toBe(false);
  });

  it('la carte suit l’élévation de SA case (eau plus basse, montagne plus haute)', () => {
    const plan = planifierStructures(entree({
      tuiles: [tuile(0, 0, 'eau', 'baleine'), tuile(1, 0, 'montagne', 'uranium')],
    }));
    const eau = plan.get('carte:baleine')![0]!.y;
    const mont = plan.get('carte:uranium')![0]!.y;
    expect(mont).toBeGreaterThan(eau);
  });

  it('atténue le slot et le liseré en zone explorée-masquée (fog)', () => {
    const visible = planifierStructures(entree({ tuiles: [tuile(0, 0, 'prairie', 'ble')] }));
    expect(visible.get('slot')![0]!.couleur).toBe(STRUCTURES3D.slot.couleur);
    expect(visible.get('slotLiseret')![0]!.couleur).toBe(STRUCTURES3D.slot.liseret);
    const masquee = planifierStructures(entree({
      tuiles: [tuile(0, 0, 'prairie', 'ble', 'explored')],
    }));
    expect(masquee.get('slot')![0]!.couleur).not.toBe(STRUCTURES3D.slot.couleur);
    expect(masquee.get('slotLiseret')![0]!.couleur).not.toBe(STRUCTURES3D.slot.liseret);
  });

  it('TUILE pivotée 180° (correctif V2-bis) : slot au coin nord, glyphes côté centre', () => {
    // Caméra par défaut au sud (+z, tilt 58°) : toute la tuile (slot + carte +
    // glyphes, en miroir du calque glyphes de world3d) tourne autour du centre
    // de l'hexagone — le slot va dans le coin le plus ÉLOIGNÉ de la caméra et
    // la carte, restée dans son sens d'origine (glyphes côté centre), présente
    // naturellement cette face à la caméra.
    const plan = planifierStructures(entree({
      tuiles: [
        tuile(0, 0, 'plaine', 'fer'), // plaque, bonus cpu
        tuile(1, 0, 'plaine', 'or'), // plaque, bonus or (puces + socles)
      ],
    }));
    const slot = plan.get('slot')![0]!;
    // offset miroir de la spec [0, +0.58] : le slot est au NORD de la tuile
    expect(slot.z).toBeLessThan(0); // coin éloigné de la caméra
    expect(slot.z).toBeCloseTo(-STRUCTURES3D.slot.offset[1], 5);
    for (const [res, famille] of [['fer', 'cpu'], ['or', 'or']] as const) {
      const carte = plan.get(`carte:${res}`)![0]!;
      expect(carte.z).toBe(slot.z); // posée sur le slot (même offset pivoté)
      expect(STRUCTURES3D.cartes[res].bonus.famille).toBe(famille);
      for (const pool of [`cg:${famille}`, ...(famille === 'or' ? ['cgSocle'] : [])]) {
        for (const g of plan.get(pool)!) {
          expect(g.z).toBeGreaterThan(carte.z); // face intérieure : côté centre
        }
      }
    }
  });
});

describe('L3 — Cratère, huttes et villages barbares', () => {
  it('rend le cratère stérile : rebord + fond assombri (7m C15)', () => {
    const plan = planifierStructures(entree({
      tuiles: [tuile(0, 0, 'cratere'), tuile(1, 0, 'prairie')],
    }));
    expect(plan.get('cratereRebord')).toHaveLength(1);
    expect(plan.get('cratereFond')).toHaveLength(1);
    expect(plan.get('cratereFond')![0]!.couleur).toBe(STRUCTURES3D.cratere.fond.couleur);
  });

  it('rend la hutte en dôme pâle au visage bienveillant (yeux doux + bouche)', () => {
    const plan = planifierStructures(entree({
      huttes: [{ id: 'h1', q: 0, r: 0, fog: 'visible', terrain: 'prairie' }],
    }));
    expect(plan.get('hutte')).toHaveLength(1);
    expect(plan.get('hutteAccent')![0]!.couleur).toBe(STRUCTURES3D.hutte.accent);
    // visage bienveillant : 2 yeux ronds + 1 bouche, couleur pâle de la spec
    expect(plan.get('hutteYeux')).toHaveLength(2);
    expect(plan.get('hutteBouche')).toHaveLength(1);
    expect(plan.get('hutteYeux')![0]!.couleur).toBe(STRUCTURES3D.hutte.visage.couleur);
  });

  it('rend le village en dôme rouge élancé au visage malveillant (yeux inclinés + bouche néon)', () => {
    const plan = planifierStructures(entree({
      villages: [{ id: 'v1', q: 0, r: 0, fog: 'visible', terrain: 'plaine' }],
    }));
    expect(plan.get('village')).toHaveLength(1);
    expect(plan.get('villageMur')).toHaveLength(1);
    expect(plan.get('village')![0]!.couleur).toBe(STRUCTURES3D.village.couleur);
    // plus haut que large (silhouette élancée demandée par Erik)
    const dome = plan.get('village')![0]!;
    expect(dome.sy).toBeGreaterThan(dome.sx);
    // visage malveillant : 2 yeux en barres inclinées en miroir + 1 bouche
    const yeux = plan.get('villageYeux')!;
    expect(yeux).toHaveLength(2);
    expect(Math.abs(yeux[0]!.ry)).toBeCloseTo(STRUCTURES3D.village.visage.yeux.inclinaison!, 5);
    expect(Math.sign(yeux[0]!.ry!)).toBe(-Math.sign(yeux[1]!.ry!));
    expect(plan.get('villageBouche')).toHaveLength(1);
    expect(yeux[0]!.couleur).toBe(STRUCTURES3D.village.visage.couleur);
  });
});

describe('Propriétés transverses (déterminisme, perf)', () => {
  it('est déterministe : même entrée → même plan bit à bit (R-80/82)', () => {
    const e = entree({
      tuiles: [tuile(0, 0, 'prairie', 'ble'), tuile(1, 0, 'cratere')],
      villes: [ville('v', 2, 0, { pop: 9, capital: true, buildings: ['caserne'], wonders: ['oracle_de_delphes'] })],
      huttes: [{ id: 'h1', q: 3, r: 0, fog: 'visible', terrain: 'prairie' }],
      villages: [{ id: 'vb1', q: 4, r: 0, fog: 'explored', terrain: 'plaine' }],
    });
    expect(planifierStructures(e)).toEqual(planifierStructures(e));
  });

  it('planifie 1600 tuiles + 40 villes en moins de 100 ms (absorbe le 40×40)', () => {
    const tuiles: TuileStructures[] = [];
    for (let i = 0; i < 1600; i++) {
      const q = i % 40, r = Math.floor(i / 40);
      tuiles.push(tuile(q, r, i % 7 === 0 ? 'ville' : 'prairie', i % 5 === 0 ? 'fer' : null));
    }
    const villes: VilleStructures[] = Array.from({ length: 40 }, (_, i) =>
      ville(`v${i}`, i % 40, Math.floor(i / 40) % 40, { pop: (i % 31) + 1, capital: i === 0, buildings: ['marche', 'caserne'], wonders: i % 4 === 0 ? ['stonehenge'] : [] }));
    const t0 = performance.now();
    const plan = planifierStructures(entree({ tuiles, villes }));
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(100);
    // Correctif V2-bis : le slot n'existe plus que sur les tuiles À RESSOURCE.
    // Sur ce plateau : 320 tuiles au fer (i%5), moins les 46 villes (i%35,
    // non productives) = exactement 274 slots — le compte a baissé avec le
    // correctif (il dépassait 1300 quand le slot était visible même vide).
    expect(plan.get('slot')!.length).toBe(274);
  });

  it('positionne les cartes sur les coordonnées monde du moteur (hex rayon 1)', () => {
    const plan = planifierStructures(entree({ tuiles: [tuile(2, 3, 'plaine', 'fer')] }));
    const carte = plan.get('carte:fer')![0]!;
    const slot = plan.get('slot')![0]!;
    // la carte est posée SUR le slot (même offset standard)
    expect(carte.x).toBe(slot.x);
    expect(carte.z).toBe(slot.z);
    void hexAutour; // (invariant documenté : passer par hexWorldPos — world3d)
  });

  it('RÉGRESSION (bug d’Erik 05/09) : tout pool d’un plan réel est pris en charge par le monde', () => {
    // Plan le plus riche possible : cartes neutres + révélées, Mainframe
    // capitale avec modules + merveille, cratère, hutte, village.
    const plan = planifierStructures(entree({
      tuiles: [
        tuile(0, 0, 'prairie', 'inconnue'), tuile(1, 0, 'colline', 'fer'),
        tuile(2, 0, 'montagne', 'uranium'), tuile(3, 0, 'eau', 'baleine'),
        tuile(4, 0, 'cratere'), tuile(5, 0, 'ville'),
      ],
      villes: [ville('v', 5, 1, { pop: 9, capital: true, buildings: ['marche', 'caserne', 'temple'], wonders: ['stonehenge'] })],
      huttes: [{ id: 'h1', q: 0, r: 1, fog: 'visible', terrain: 'prairie' }],
      villages: [{ id: 'vb1', q: 1, r: 1, fog: 'visible', terrain: 'plaine' }],
    }));
    const monde = new StructuresWorld({ capacityTuiles: 64, capacityVilles: 8 });
    for (const pool of plan.keys()) {
      expect(monde.connaitPool(pool), `pool ${pool}`).toBe(true);
    }
    expect(monde.connaitPool('carte:fer')).toBe(true);
    expect(monde.connaitPool('carteInconnue')).toBe(true);
    expect(monde.connaitPool('inexistant')).toBe(false);
  });
});

describe('Peintre de pictogrammes (contrat, sans DOM)', () => {
  it('couvre les 22 pictos déclarés + le « ? » neutre sans lever', () => {
    const ctx = {
      save: () => {}, restore: () => {}, beginPath: () => {}, stroke: () => {}, fill: () => {},
      moveTo: () => {}, lineTo: () => {}, arc: () => {}, rect: () => {},
      ellipse: () => {}, bezierCurveTo: () => {}, closePath: () => {},
      set lineWidth(_v: number) {}, set strokeStyle(_v: string) {}, set fillStyle(_v: string) {},
      set lineCap(_v: string) {}, set lineJoin(_v: string) {},
      set font(_v: string) {}, set textAlign(_v: string) {}, set textBaseline(_v: string) {},
      fillText: () => {},
    } as unknown as CanvasRenderingContext2D;
    for (const carte of Object.values(STRUCTURES3D.cartes)) {
      expect(() => peindrePicto(ctx, carte.picto, '#fff')).not.toThrow();
    }
    expect(() => peindrePicto(ctx, '?', '#fff')).not.toThrow();
  });
});



// CORRECTIFS-SOLO 2 (R-92) : le calque cartes-ressources alimenté par un VRAI
// état filtré du moteur (le même pipeline que GameCanvas en jeu) — avant la
// tech : carte neutre « ? » ; après : carte pleine identifiée. Le signalement
// d'Erik (identités visibles sans tech) venait des données (13 ressources à
// hiddenUntilRevealed: false), pas du calque — ce test verrouille le pipeline.
describe('CORRECTIFS-SOLO 2 — pipeline état filtré → calque cartes 3D (R-92)', () => {
  function planDepuisEtatFiltre(techs: string[]) {
    const state = makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    });
    const key = '2,0';
    state.map[key] = { terrain: 'colline', resource: 'or' }; // Or : révélé par Monnaie
    state.players['p1']!.vision.explored = [key];
    state.players['p1']!.techsUnlocked = techs;
    const filtered = getFilteredState(state, 'p1');
    const t = filtered.map[key]!;
    return planifierStructures(entree({
      tuiles: [{ q: 0, r: 0, terrain: t.terrain ?? 'colline', ressource: t.resource ?? null, fog: 'explored' }],
    }));
  }

  it('avant Monnaie : la carte d’Or est NEUTRE (marqueur inconnue, jamais l’identité)', () => {
    const plan = planDepuisEtatFiltre([]);
    expect(plan.get('carteInconnue')).toHaveLength(1);
    expect(plan.get('carte:or')).toBeUndefined();
  });

  it('après Monnaie : la carte d’Or est pleine et identifiée', () => {
    const plan = planDepuisEtatFiltre(['monnaie']);
    expect(plan.get('carte:or')).toHaveLength(1);
    expect(plan.get('carteInconnue')).toBeUndefined();
  });
});
