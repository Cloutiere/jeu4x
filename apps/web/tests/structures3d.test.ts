/**
 * Tests des STRUCTURES 3D (chantier V2) : planificateur pur (`planifierStructures`)
 * — Mainframe des villes (L1), cartes-ressources en slots (L2), cratère et
 * huttes/villages barbares (L3). Aucun DOM ni WebGL : la moitié Three.js
 * (`StructuresWorld`) n'est pas instanciée ici, le plan est la vérité testée.
 * Références : handoff CHANTIER-V2, R-92 (ressource inconnue), R-93 (bonus
 * verrouillé), R-60bis (tranches démographiques), R-65 (capture), 7m C15 (cratère).
 */
import { describe, expect, it } from 'vitest';
import { RESOURCES, RESOURCE_UNKNOWN, BUILDINGS, tileKeyOf } from '@game/rules';
import type { Hex } from '@game/rules';
import { STRUCTURES3D, categorieDeBatiment } from '../src/lib/render3d/spec3d.js';
import {
  planifierStructures, palierDe, estCarteNeutre, peindrePicto, StructuresWorld,
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
    expect(s.rayon).toBeGreaterThan(0);
    expect(s.hauteur).toBeGreaterThan(0);
  });

  it('rend la carte neutre plus petite que la pleine (R-92 — « taille de base réduite »)', () => {
    expect(STRUCTURES3D.carteNeutre.facteur).toBeLessThan(1);
    expect(STRUCTURES3D.carteNeutre.facteur).toBeGreaterThan(0.3);
  });
});

describe('L1 — Mainframe (Nœud Serveur) : suit l’état de la ville', () => {
  it('pose un Mainframe sur chaque ville (socle + corps + bande + antenne + pointe)', () => {
    const plan = planifierStructures(entree({ villes: [ville('v1', 2, 3)] }));
    for (const pool of ['mfSocle', 'mfCorps', 'mfBande', 'mfAntenne', 'mfPointe']) {
      expect(plan.get(pool)).toHaveLength(1);
    }
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

  it('distingue la capitale : couronne + antenne longue + accent élargi 🔶', () => {
    const plan = planifierStructures(entree({
      villes: [ville('cap', 0, 0, { capital: true }), ville('ord', 5, 0)],
    }));
    expect(plan.get('mfCouronne')).toHaveLength(1);
    const bandeCap = plan.get('mfBande')![0]!;
    const bandeOrd = plan.get('mfBande')![1]!;
    expect(bandeCap.sx).toBeGreaterThan(bandeOrd.sx); // accent joueur plus large
    const antenneCap = plan.get('mfAntenne')![0]!;
    const antenneOrd = plan.get('mfAntenne')![1]!;
    expect(antenneCap.sy).toBeGreaterThan(antenneOrd.sy);
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
  it('pose un slot géométriquement IDENTIQUE sur toute tuile productive, vide sans ressource 🔶', () => {
    const plan = planifierStructures(entree({
      tuiles: [
        tuile(0, 0, 'prairie'), tuile(1, 0, 'montagne'), tuile(2, 0, 'eau'),
        tuile(3, 0, 'plaine', 'ble'),
      ],
    }));
    const slots = plan.get('slot')!;
    expect(slots).toHaveLength(4);
    const [sx, sy, sz] = [slots[0]!.sx, slots[0]!.sy, slots[0]!.sz];
    for (const s of slots) {
      expect(s.sx).toBe(sx); // même taille partout (slot standard)
      expect(s.sy).toBe(sy);
      expect(s.sz).toBe(sz);
      expect(s.y).toBeGreaterThan(-1); // posé sur le plateau (eau incluse)
    }
    // 3 tuiles sans ressource : aucun pool de carte
    expect(plan.get('carteInconnue')).toBeUndefined();
    expect([...plan.keys()].filter((k) => k.startsWith('carte:'))).toEqual(['carte:ble']);
  });

  it('ne pose PAS de slot sur une case de ville ni sur un cratère (non productives)', () => {
    const plan = planifierStructures(entree({
      tuiles: [tuile(0, 0, 'ville'), tuile(1, 0, 'cratere'), tuile(2, 0, 'prairie')],
    }));
    const slots = plan.get('slot')!;
    expect(slots).toHaveLength(1); // la prairie seule
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
    // pilier : échelle absolue = rayon de la forme (facteur neutre absent)
    expect(plan.get('carte:fer')![0]!.sx).toBe(STRUCTURES3D.formes.pilier.rayon);
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
    const visible = planifierStructures(entree({ tuiles: [tuile(0, 0, 'prairie')] }));
    expect(visible.get('slot')![0]!.couleur).toBe(STRUCTURES3D.slot.couleur);
    expect(visible.get('slotLiseret')![0]!.couleur).toBe(STRUCTURES3D.slot.liseret);
    const masquee = planifierStructures(entree({
      tuiles: [tuile(0, 0, 'prairie', null, 'explored')],
    }));
    expect(masquee.get('slot')![0]!.couleur).not.toBe(STRUCTURES3D.slot.couleur);
    expect(masquee.get('slotLiseret')![0]!.couleur).not.toBe(STRUCTURES3D.slot.liseret);
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

  it('rend les huttes bonus en structure 3D discrète (dôme + accent doré)', () => {
    const plan = planifierStructures(entree({
      huttes: [{ id: 'h1', q: 0, r: 0, fog: 'visible', terrain: 'prairie' }],
    }));
    expect(plan.get('hutte')).toHaveLength(1);
    expect(plan.get('hutteAccent')![0]!.couleur).toBe(STRUCTURES3D.hutte.accent);
  });

  it('rend les villages barbares en camp 3D (dôme + mur d’enceinte, accent barbare)', () => {
    const plan = planifierStructures(entree({
      villages: [{ id: 'v1', q: 0, r: 0, fog: 'visible', terrain: 'plaine' }],
    }));
    expect(plan.get('village')).toHaveLength(1);
    expect(plan.get('villageMur')).toHaveLength(1);
    expect(plan.get('village')![0]!.couleur).toBe(STRUCTURES3D.village.couleur);
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
    expect(plan.get('slot')!.length).toBeGreaterThan(1300);
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

void tileKeyOf;
