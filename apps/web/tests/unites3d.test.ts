/**
 * Tests du chantier V2-UNITES3D — brancher les unités 3D d'Erik sur le monde
 * de jeu. Trois volets : le mapping DATA-DRIVEN type → gabarit (catalogue
 * `visuel3d.json` §structures.unites3d — un type sans modèle garde son sprite
 * 2D, un nouveau modèle apparaît sans nouveau code), l'assemblage PARTAGÉ
 * labo/jeu (`unites3d.ts` — miroir du rendu 2D : embarquées R-117, fog) et
 * l'interpolation de playback du planificateur (positions + élévations).
 * Aucun DOM ni WebGL : le plan pur est la vérité testée.
 */
import { describe, expect, it } from 'vitest';
import { tileKeyOf } from '@game/rules';
import type { GameState } from '@game/rules';
import { MODELES_UNITES3D, TERRAINS3D, gabaritUnite3D, entreeUnite3D, parseEntreeUnite3D } from '../src/lib/render3d/spec3d.js';
import { planifierStructures } from '../src/lib/render3d/structures3d.js';
import type { EntiteStructure, EntreeStructures } from '../src/lib/render3d/structures3d.js';
import { aModele3D, unitesStructures, unitesGLBStructures } from '../src/lib/render3d/unites3d.js';
import { hexWorldPos } from '../src/lib/render3d/world3d.js';
import { parserModeleGLB, UnitesGLBWorld } from '../src/lib/render3d/unitesglb.js';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { UNIT_TYPES } from '@game/rules';

const MODELES_DIR = fileURLToPath(new URL('../public/modeles/', import.meta.url));

const couleurDe = (owner: string): number => (owner === 'p2' ? 0x3b6fd6 : 0xd64545);

function entree(parts: Partial<EntreeStructures> = {}): EntreeStructures {
  return { tuiles: [], villes: [], huttes: [], villages: [], couleurDe, ...parts };
}

function unite(q: number, r: number, type: string, owner = 'p1', opts: Partial<EntiteStructure> = {}): EntiteStructure {
  return { id: `u-${q},${r}-${type}`, q, r, fog: 'visible', terrain: 'prairie', owner, type, ...opts };
}

/** État filtré minimal (seuls units/map/vision sont lus par unitesStructures). */
function etat(units: Array<Record<string, unknown>>, terrains: Record<string, string> = {}): GameState {
  return {
    units: Object.fromEntries(units.map((u) => [u.id as string, u])),
    map: Object.fromEntries(Object.entries(terrains).map(([k, terrain]) => [k, { terrain }])),
  } as unknown as GameState;
}

describe('catalogue data-driven type → modèle 3D (visuel3d.json, fonderie T3)', () => {
  it('mappe les types couverts vers un .glb de la fonderie (gabarit guerrier REMPLACÉ)', () => {
    // echelle = curseur de calibrage d'Erik (a l'oeil) : on verifie sa presence, pas sa valeur figee
    const guerrier = entreeUnite3D('guerrier');
    expect(guerrier).toMatchObject({ kind: 'glb', glb: 'guerrier.glb' });
    expect(guerrier.kind === 'glb' && guerrier.echelle > 0).toBe(true);
    expect(gabaritUnite3D('guerrier')).toBeNull(); // le .glb remplace le gabarit paramétrique
    expect(entreeUnite3D('legion')).toMatchObject({ kind: 'glb', glb: 'glace.glb' });
    expect(entreeUnite3D('sous_marin')).toMatchObject({ kind: 'glb', glb: 'sousmarin.glb' });
  });

  it('chaque type catalogué est un id RÉEL du moteur et son .glb existe (fichier servi)', () => {
    for (const [type, e] of Object.entries(MODELES_UNITES3D)) {
      expect(UNIT_TYPES[type], `type moteur ${type}`).toBeDefined();
      if (e.kind === 'glb') {
        expect(existsSync(path.join(MODELES_DIR, e.glb)), `public/modeles/${e.glb}`).toBe(true);
      }
    }
  });

  it('les 22 .glb de la fonderie sont TOUS mappés (aucun fichier orphelin)', () => {
    const fichiers = readdirSync(MODELES_DIR).filter((f) => f.endsWith('.glb')).sort();
    const mappes = Object.values(MODELES_UNITES3D).flatMap((e) => (e.kind === 'glb' ? [e.glb] : [])).sort();
    expect(mappes).toEqual(fichiers);
    expect(fichiers.length).toBe(22);
  });

  it('les types SANS entrée (civs uniques, GP, caravane…) gardent leur sprite 2D', () => {
    for (const t of ['guerrier_jaguar', 'caravane', 'milice', 'savant', 'explorateur', 'leader', 'trebuchet']) {
      expect(entreeUnite3D(t), `type ${t}`).toBeNull();
      expect(aModele3D(t), `type ${t}`).toBe(false);
    }
  });

  it('REFUSE toute entrée invalide avec une erreur claire (pas de fallback silencieux)', () => {
    expect(() => parseEntreeUnite3D('x', 'inconnu')).toThrow(/gabarit inconnu/);
    expect(() => parseEntreeUnite3D('x', { glb: 'Guerrier.GLB' })).toThrow(/\.glb invalide/);
    expect(() => parseEntreeUnite3D('x', { glb: 'guerrier.glb', echelle: 0 })).toThrow(/echelle hors/);
    expect(() => parseEntreeUnite3D('x', {})).toThrow(/\.glb invalide/);
  });
});

describe('planificateur — unités 3D', () => {
  it('un guerrier produit l’humanoïde cyber (corps fusionné, cœur, visière, lame accent)', () => {
    const plan = planifierStructures(entree({ unites: [unite(2, 3, 'guerrier')] }));
    expect(plan.get('guCorps')).toHaveLength(1);
    expect(plan.get('ugCoeur')).toHaveLength(1);
    expect(plan.get('guVisiere')).toHaveLength(1);
    expect(plan.get('guLame')).toHaveLength(1); // lame accent joueur
    expect(plan.get('ugLasso')).toBeUndefined(); // pas de lasso sur un guerrier
    expect(plan.get('ugPatte')).toBeUndefined(); // plus le gabarit créature
  });

  it('un archer produit le lasso électrique (et pas de lame)', () => {
    const plan = planifierStructures(entree({ unites: [unite(0, 0, 'archer', 'p2')] }));
    expect(plan.get('ugLasso')?.length).toBeGreaterThan(0);
    expect(plan.get('ugBoucle')).toHaveLength(1);
    expect(plan.get('guLame')).toBeUndefined();
  });

  it('l’accent propriétaire est porté par la lame du guerrier (R-65)', () => {
    const plan = planifierStructures(entree({ unites: [unite(0, 0, 'guerrier', 'p2')] }));
    expect(plan.get('guLame')![0]!.couleur).toBe(couleurDe('p2'));
    const planP1 = planifierStructures(entree({ unites: [unite(0, 0, 'guerrier', 'p1')] }));
    expect(planP1.get('guLame')![0]!.couleur).toBe(couleurDe('p1'));
  });

  it('l’élévation du modèle suit le terrain de la case', () => {
    const plan = planifierStructures(entree({ unites: [unite(1, 1, 'guerrier', 'p1', { terrain: 'montagne' })] }));
    const corps = plan.get('guCorps')![0]!;
    const solMontagne = TERRAINS3D['montagne']!.elev;
    expect(corps.y).toBe(solMontagne); // pieds posés sur le plateau de la tuile
    const planPrairie = planifierStructures(entree({ unites: [unite(1, 1, 'guerrier', 'p1', { terrain: 'prairie' })] }));
    expect(planPrairie.get('guCorps')![0]!.y).toBeLessThan(corps.y);
  });

  it('l’interpolation de playback lerp position ET élévation entre deux cases', () => {
    const pa = hexWorldPos({ q: 0, r: 0 });
    const pb = hexWorldPos({ q: 1, r: 0 });
    const elevA = TERRAINS3D['montagne']!.elev;
    const elevB = TERRAINS3D['prairie']!.elev;
    // Décalage torse/sol constant : référence = unité statique sur l’arrivée.
    const statique = planifierStructures(entree({ unites: [unite(1, 0, 'guerrier')] })).get('guCorps')![0]!;
    const surhausse = statique.y - elevB;
    const u = unite(1, 0, 'guerrier', 'p1', {
      terrain: 'prairie',
      interpole: { deQ: 0, deR: 0, deTerrain: 'montagne', t: 0.5 },
    });
    const corps = planifierStructures(entree({ unites: [u] })).get('guCorps')![0]!;
    expect(corps.x).toBeCloseTo((pa.x + pb.x) / 2, 5);
    expect(corps.z).toBeCloseTo((pa.z + pb.z) / 2, 5);
    expect(corps.y).toBeCloseTo((elevA + elevB) / 2 + surhausse, 5);
  });

  it('sans interpolation, la position reste celle de la case (déterminisme)', () => {
    const p = hexWorldPos({ q: 3, r: -2 });
    const plan = planifierStructures(entree({ unites: [unite(3, -2, 'guerrier')] }));
    const corps = plan.get('guCorps')![0]!;
    expect(corps.x).toBeCloseTo(p.x, 5);
    expect(corps.z).toBeCloseTo(p.z, 5);
  });
});

describe('unites3d — assemblage partagé labo/jeu (état filtré → calque)', () => {
  const visible = new Set(['0,0', '1,0']);

  it('assemble les champs du calque PROCÉDURAL quand un type pointe un gabarit (fiche atelier)', () => {
    // Le catalogue T3 ne mappe plus AUCUN type moteur vers un gabarit (les
    // .glb les remplacent) — le calque procédural reste disponible : il est
    // exercé via planifierStructures (tests ci-dessus) et revient par une
    // simple édition de visuel3d.json. Ici : les types à gabarit n'existent
    // plus, donc le calque procédural est vide sur cet état.
    const state = etat(
      [{ id: 'g1', type: 'guerrier', owner: 'p1', q: 0, r: 0, aboard: null }],
      { '0,0': 'prairie' },
    );
    expect(unitesStructures({ state, visible })).toHaveLength(0); // guerrier = .glb désormais
    const glb = unitesGLBStructures({ state, visible });
    expect(glb).toHaveLength(1);
    expect(glb[0]).toMatchObject({ id: 'g1', q: 0, r: 0, owner: 'p1', glb: 'guerrier.glb', fog: 'visible', terrain: 'prairie' });
  });

  it('route les types par calque : .glb d’un côté, sprite billboard de l’autre', () => {
    const state = etat([
      { id: 'c1', type: 'colon', owner: 'p1', q: 0, r: 0 },
      { id: 'j1', type: 'guerrier_jaguar', owner: 'p1', q: 1, r: 0 },
      { id: 'g1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
    ], { '0,0': 'prairie', '1,0': 'prairie' });
    expect(unitesStructures({ state, visible }).map((u) => u.id)).toEqual([]);
    expect(unitesGLBStructures({ state, visible }).map((u) => u.id)).toEqual(['c1', 'g1']);
  });

  it('unité embarquée (R-117) et hors vision : absentes du calque', () => {
    const state = etat([
      { id: 'g1', type: 'guerrier', owner: 'p1', q: 5, r: 5, aboard: 'nav-1' },
      { id: 'g2', type: 'archer', owner: 'p2', q: 9, r: 9 },
    ], { '9,9': 'prairie' });
    expect(unitesStructures({ state, visible })).toEqual([]);
  });

  it('porte l’interpolation du playback vers le planificateur', () => {
    const state = etat([{ id: 'g1', type: 'guerrier', owner: 'p1', q: 1, r: 0 }], { '0,0': 'prairie', '1,0': 'plaine' });
    const unites = unitesStructures({
      state,
      visible,
      moveOf: (id) => (id === 'g1' ? { from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, t: 0.25 } : null),
    });
    expect(unitesGLBStructures({ state, visible, moveOf: (id) => (id === 'g1' ? { from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, t: 0.25 } : null) })[0]!.interpole)
      .toEqual({ deQ: 0, deR: 0, deTerrain: 'prairie', t: 0.25 });
  });

  it('sans playback : aucune interpolation (position statique)', () => {
    const state = etat([{ id: 'g1', type: 'guerrier', owner: 'p1', q: 1, r: 0 }], { '1,0': 'prairie' });
    expect(unitesGLBStructures({ state, visible })[0]!.interpole).toBeUndefined();
  });

  it('clé de tuile cohérente avec le moteur (tileKeyOf)', () => {
    expect(tileKeyOf({ q: 0, r: 0 })).toBe('0,0');
  });
});

describe('calque .glb — fonderie T3 (assemblage + garde-fous)', () => {
  const visible = new Set(['0,0', '1,0']);

  it('unitesGLBStructures assemble les entrées .glb (owner, echelle du catalogue, playback)', () => {
    const state = etat(
      [{ id: 'l1', type: 'legion', owner: 'p1', q: 0, r: 0, aboard: null }],
      { '0,0': 'prairie' },
    );
    const entrees = unitesGLBStructures({ state, visible });
    expect(entrees).toHaveLength(1);
    expect(entrees[0]).toMatchObject({ id: 'l1', q: 0, r: 0, owner: 'p1', glb: 'glace.glb', echelle: 1, fog: 'visible', terrain: 'prairie' });
  });

  it('filtre comme le calque procédural : embarquées R-117 et hors vision absentes', () => {
    const state = etat([
      { id: 'a', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'b', type: 'guerrier', owner: 'p1', q: 1, r: 0, aboard: 'nav' },
      { id: 'c', type: 'guerrier', owner: 'p1', q: 9, r: 9 },
    ], { '0,0': 'prairie', '1,0': 'prairie', '9,9': 'prairie' });
    expect(unitesGLBStructures({ state, visible })).toHaveLength(1);
  });

  it('update() avec un modèle PAS ENCORE chargé le signale dans stats.manquants (pas de rendu muet)', () => {
    const monde = new UnitesGLBWorld();
    monde.update([{ id: 'u1', q: 0, r: 0, fog: 'visible', owner: 'p1', glb: 'guerrier.glb', echelle: 1 }], () => 0xffffff);
    expect(monde.stats.manquants).toEqual(['guerrier.glb']);
    expect(monde.stats.unites).toBe(0);
    monde.dispose();
  });

  it('parserModeleGLB refuse une scène sans géométrie avec une erreur claire', () => {
    const scene = { traverse: () => {} };
    expect(() => parserModeleGLB(scene as never)).toThrow(/aucune géométrie/);
  });
});
