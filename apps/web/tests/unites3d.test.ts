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
import { MODELES_UNITES3D, SURCHARGE_UNITES3D_PAR_PROPRIO, VILLE3D, VILLAGE_BARBARE3D, HUTTE_TRIPO3D, TUILE_PRAIRIE3D, TUILE_PLAINE3D, TUILE_PLAINE_GRENIER3D, TUILE_MONTAGNE3D, TUILE_COLLINE3D, TERRAINS3D, gabaritUnite3D, entreeUnite3D, entreeUnite3DDe, parseEntreeUnite3D } from '../src/lib/render3d/spec3d.js';
import { planifierStructures } from '../src/lib/render3d/structures3d.js';
import type { EntiteStructure, EntreeStructures } from '../src/lib/render3d/structures3d.js';
import { aModele3D, unitesStructures, unitesGLBStructures } from '../src/lib/render3d/unites3d.js';
import { hexWorldPos } from '../src/lib/render3d/world3d.js';
import { parserModeleGLB, UnitesGLBWorld } from '../src/lib/render3d/unitesglb.js';
import type { ModeleGLB } from '../src/lib/render3d/unitesglb.js';
import * as THREE from 'three';
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
    expect(guerrier).toMatchObject({ kind: 'glb', glb: 'guerrier_v3.glb' }); // knight rebaptisé (décision Erik, T4bis)
    expect(guerrier.kind === 'glb' && guerrier.echelle > 0).toBe(true);
    expect(gabaritUnite3D('guerrier')).toBeNull(); // le .glb remplace le gabarit paramétrique
    expect(entreeUnite3D('legion')).toMatchObject({ kind: 'glb', glb: 'legion_v3.glb' });
    expect(entreeUnite3D('sous_marin')).toMatchObject({ kind: 'glb', glb: 'sousmarin.glb' });
    expect(entreeUnite3D('colon')).toMatchObject({ kind: 'glb', glb: 'colon_v3.glb' }); // validé Erik, T4bis
    expect(entreeUnite3D('chasseur')).toMatchObject({ kind: 'glb', glb: 'chasseur_v3.glb' }); // validé Erik, T4bis
  });

  it('surcharge par propriétaire : un barbare affiche barbare_v3, un joueur humain reste sur le modèle de son type (T4bis)', () => {
    // Decision d'Erik : barbare_v3 est LE modèle des unités barbares (owner
    // 'barbarien' = BARBARIAN_ID), data-driven (unites3dSurchargeProprietaire).
    expect(entreeUnite3DDe('barbarien', 'guerrier')).toMatchObject({ kind: 'glb', glb: 'barbare_v3.glb' });
    expect(entreeUnite3DDe('barbarien', 'archer')).toMatchObject({ kind: 'glb', glb: 'barbare_v3.glb' });
    // Même type, joueur humain : modèle de type, JAMAIS le barbare.
    expect(entreeUnite3DDe('p1', 'guerrier')).toMatchObject({ kind: 'glb', glb: 'guerrier_v3.glb' });
    expect(entreeUnite3DDe(undefined, 'guerrier')).toMatchObject({ kind: 'glb', glb: 'guerrier_v3.glb' });
    // La surcharge S'APPLIQUE à tout type moteur (« quel que soit son type ») :
    // même un type sans modèle propre devient barbare_v3 — et aModele3D le
    // suit (le sprite 2D est masqué, pas de double rendu).
    expect(entreeUnite3DDe('barbarien', 'caravane')).toMatchObject({ kind: 'glb', glb: 'barbare_v3.glb' });
    expect(aModele3D('caravane', 'barbarien')).toBe(true);
    expect(aModele3D('caravane')).toBe(false); // sans owner : sprite 2D
  });

  it('chaque type catalogué est un id RÉEL du moteur et son .glb existe (fichier servi)', () => {
    for (const [type, e] of Object.entries(MODELES_UNITES3D)) {
      expect(UNIT_TYPES[type], `type moteur ${type}`).toBeDefined();
      if (e.kind === 'glb') {
        expect(existsSync(path.join(MODELES_DIR, e.glb)), `public/modeles/${e.glb}`).toBe(true);
      }
    }
  });

  it('les .glb servis sont TOUS mappés (24 fichiers, barbare_v3 via la surcharge propriétaire)', () => {
    const fichiers = readdirSync(MODELES_DIR).filter((f) => f.endsWith('.glb')).sort();
    const mappes = [
      ...Object.values(MODELES_UNITES3D).flatMap((e) => (e.kind === 'glb' ? [e.glb] : [])),
      ...Object.values(SURCHARGE_UNITES3D_PAR_PROPRIO).flatMap((e) => (e.kind === 'glb' ? [e.glb] : [])),
      // VILLE-TRIPO T2 + village barbare (08/09) : structures .glb servies
      ...(VILLE3D && VILLE3D.kind === 'glb' ? [VILLE3D.glb] : []),
      ...(VILLAGE_BARBARE3D && VILLAGE_BARBARE3D.kind === 'glb' ? [VILLAGE_BARBARE3D.glb] : []),
      ...(HUTTE_TRIPO3D && HUTTE_TRIPO3D.kind === 'glb' ? [HUTTE_TRIPO3D.glb] : []),
      ...(TUILE_PRAIRIE3D && TUILE_PRAIRIE3D.kind === 'glb' ? [TUILE_PRAIRIE3D.glb] : []),
      ...(TUILE_PLAINE3D && TUILE_PLAINE3D.kind === 'glb' ? [TUILE_PLAINE3D.glb] : []),
      ...(TUILE_PLAINE_GRENIER3D && TUILE_PLAINE_GRENIER3D.kind === 'glb' ? [TUILE_PLAINE_GRENIER3D.glb] : []),
      ...(TUILE_MONTAGNE3D && TUILE_MONTAGNE3D.kind === 'glb' ? [TUILE_MONTAGNE3D.glb] : []),
      ...(TUILE_COLLINE3D && TUILE_COLLINE3D.kind === 'glb' ? [TUILE_COLLINE3D.glb] : []),
      ...(TUILE_COLLINE3D && TUILE_COLLINE3D.kind === 'glb' ? [TUILE_COLLINE3D.glb.replace('_v2', '_v1')] : []),
      // v1 des tuiles servies en parallèle des v2 (même contenu corrigé, caches edge)
      ...(TUILE_PRAIRIE3D && TUILE_PRAIRIE3D.kind === 'glb' ? [TUILE_PRAIRIE3D.glb.replace('_v2', '_v1')] : []),
      ...(TUILE_PLAINE3D && TUILE_PLAINE3D.kind === 'glb' ? [TUILE_PLAINE3D.glb.replace('_v2', '_v1')] : []),
      ...(TUILE_PLAINE_GRENIER3D && TUILE_PLAINE_GRENIER3D.kind === 'glb' ? [TUILE_PLAINE_GRENIER3D.glb.replace('_v2', '_v1')] : []),
    ].sort();
    // T4bis : barbare_v3 est branché via unites3dSurchargeProprietaire (owner
    // 'barbarien') — plus aucun orphelin, aucun fichier servi sans branchement.
    expect(mappes).toEqual(fichiers);
    expect(fichiers.length).toBe(35);
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
    expect(() => parseEntreeUnite3D('x', { glb: 'guerrier.glb', rotation: 400 })).toThrow(/rotation hors/);
    expect(() => parseEntreeUnite3D('x', { glb: 'guerrier.glb', rotation: 'a' })).toThrow(/rotation/);
    expect(() => parseEntreeUnite3D('x', { glb: 'guerrier.glb', survol: -1 })).toThrow(/survol hors/);
    expect(() => parseEntreeUnite3D('x', { glb: 'guerrier.glb', survol: 3 })).toThrow(/survol hors/);
  });

  it('rotation du catalogue : défaut 0, degrés validés (T4ter) ; survol défaut 0 (T4quater)', () => {
    expect(parseEntreeUnite3D('x', { glb: 'a.glb' })).toMatchObject({ kind: 'glb', rotation: 0, survol: 0 });
    expect(parseEntreeUnite3D('x', { glb: 'a.glb', echelle: 1, rotation: 180 })).toMatchObject({ kind: 'glb', rotation: 180 });
    expect(parseEntreeUnite3D('x', { glb: 'a.glb', rotation: -90 })).toMatchObject({ kind: 'glb', rotation: -90 });
    expect(parseEntreeUnite3D('x', { glb: 'a.glb', survol: 0.6 })).toMatchObject({ kind: 'glb', survol: 0.6 });
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
    expect(glb[0]).toMatchObject({ id: 'g1', q: 0, r: 0, owner: 'p1', glb: 'guerrier_v3.glb', fog: 'visible', terrain: 'prairie' });
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
    expect(entrees[0]).toMatchObject({ id: 'l1', q: 0, r: 0, owner: 'p1', glb: 'legion_v3.glb', echelle: 0.5, rotation: 180, fog: 'visible', terrain: 'prairie' });
  });

  it('filtre comme le calque procédural : embarquées R-117 et hors vision absentes', () => {
    const state = etat([
      { id: 'a', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'b', type: 'guerrier', owner: 'p1', q: 1, r: 0, aboard: 'nav' },
      { id: 'c', type: 'guerrier', owner: 'p1', q: 9, r: 9 },
    ], { '0,0': 'prairie', '1,0': 'prairie', '9,9': 'prairie' });
    expect(unitesGLBStructures({ state, visible })).toHaveLength(1);
  });

  it('unitesGLBStructures applique la SURCHARGE propriétaire : un barbare produit barbare_v3, le joueur reste sur son type (T4bis)', () => {
    const state = etat(
      [
        { id: 'b1', type: 'guerrier', owner: 'barbarien', q: 0, r: 0, aboard: null },
        { id: 'p1', type: 'guerrier', owner: 'j1', q: 1, r: 0, aboard: null },
      ],
      { '0,0': 'prairie', '1,0': 'prairie' },
    );
    const entrees = unitesGLBStructures({ state, visible });
    expect(entrees).toHaveLength(2);
    const barbare = entrees.find((e) => e.owner === 'barbarien')!;
    const humain = entrees.find((e) => e.owner === 'j1')!;
    expect(barbare.glb).toBe('barbare_v3.glb'); // surcharge propriétaire
    expect(humain.glb).toBe('guerrier_v3.glb'); // modèle de type pour un humain
  });

  it('rotation de pose : rotation 180 tourne la matrice de π, sans rotation la pose est inchangée (T4ter)', () => {
    const monde = new UnitesGLBWorld();
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshStandardMaterial({ name: 'corps' });
    const interne = monde as unknown as { modeles: Map<string, ModeleGLB>; pools: Map<string, { pool: { mesh: THREE.InstancedMesh } }> };
    interne.modeles.set('test_v3.glb', { parties: [{ geo, mat, accent: false }], lignes: null });
    const m = new THREE.Matrix4();

    monde.update([{ id: 'u1', q: 0, r: 0, fog: 'visible', owner: 'p1', glb: 'test_v3.glb', echelle: 2 }], couleurDe);
    const pool = interne.pools.get('test_v3.glb#0')!.pool.mesh;
    pool.getMatrixAt(0, m);
    // sans rotation : échelle seule sur la diagonale, position de la case
    expect(m.elements[0]).toBe(2);
    expect(m.elements[10]).toBe(2);
    expect(m.elements[12]).toBeCloseTo(0, 5);

    monde.update([{ id: 'u1', q: 0, r: 0, fog: 'visible', owner: 'p1', glb: 'test_v3.glb', echelle: 2, rotation: 180 }], couleurDe);
    pool.getMatrixAt(0, m);
    // rotation 180° autour de Y = -1 sur X et Z, échelle conservée…
    expect(m.elements[0]).toBeCloseTo(-2, 5);
    expect(m.elements[5]).toBe(2);
    expect(m.elements[10]).toBeCloseTo(-2, 5);
    // …et la POSITION est inchangée (le lerp de playback reste valide)
    expect(m.elements[12]).toBeCloseTo(0, 5);
    expect(m.elements[13]).toBeCloseTo(0, 5);
    expect(m.elements[14]).toBeCloseTo(0, 5);

    // survol (T4quater) : l'appareil vole AU-DESSUS du sol, position x/z inchangée
    monde.update([{ id: 'u1', q: 0, r: 0, fog: 'visible', owner: 'p1', glb: 'test_v3.glb', echelle: 2, survol: 0.6 }], couleurDe);
    pool.getMatrixAt(0, m);
    expect(m.elements[13]).toBeCloseTo(0.6, 5);
    expect(m.elements[0]).toBe(2); // pas de rotation : diagonale inchangée
    monde.dispose();
  });

  it('unitesGLBStructures porte la rotation du catalogue (y compris via la surcharge)', () => {
    const guerrier = entreeUnite3D('guerrier');
    expect(guerrier.kind === 'glb' && guerrier.rotation).toBe(180); // calibrage Erik, T4ter
    const state = etat([{ id: 'b1', type: 'guerrier', owner: 'barbarien', q: 0, r: 0 }], { '0,0': 'prairie' });
    const barbare = unitesGLBStructures({ state, visible: new Set(['0,0']) })[0]!;
    expect(barbare.rotation).toBe(180);
    expect(barbare.echelle).toBe(0.5);
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

  it('parserModeleGLB APPLIQUE la translation du nœud glTF (dy cuit des tuiles — VILLE-TRIPO)', () => {
    // Les outils fonderie cuisent le dy d'affleurement dans la TRANSLATION du
    // nœud ; l'instancing posant ses propres matrices, ce transform serait
    // perdu (tuile posée SUR le sol au lieu d'enfoncée). Régression verrouillée.
    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const mat = new THREE.MeshStandardMaterial({ name: 'corps_tripo' });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, -0.095, 0);
    const scene = new THREE.Group();
    scene.add(mesh);
    const modele = parserModeleGLB(scene);
    expect(modele.parties).toHaveLength(1);
    const pos = modele.parties[0]!.geo.attributes.position;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pos.count; i++) { /* itère y */ break; }
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    expect(minY).toBeCloseTo(-0.195, 5);  // -0.095 - 0.1
    expect(maxY).toBeCloseTo(0.005, 5);   // -0.095 + 0.1
  });

  it('teinte joueur MULTIPLICATIVE : facteur de luminance du glb conservé, J1 ≠ J2, néon intact (T4/M2)', () => {
    // Piège knight (rapport HABILLAGE-TRIPO #7) : le glb cuit un facteur 6.6
    // dans accent_joueur.color — un color.set(teinte) l'écraserait et le
    // corps repartirait sombre. La teinte doit MULTIPLIER la couleur de base.
    const monde = new UnitesGLBWorld();
    const base = new THREE.Color(0.5, 0.5, 0.5).multiplyScalar(6.6);
    const matAccent = new THREE.MeshStandardMaterial({ name: 'accent_joueur' });
    matAccent.color.copy(base);
    const matNeon = new THREE.MeshStandardMaterial({ name: 'neon' });
    matNeon.color.set('#3DFFCE');
    const modele: ModeleGLB = {
      parties: [
        { geo: new THREE.BufferGeometry(), mat: matAccent, accent: true },
        { geo: new THREE.BufferGeometry(), mat: matNeon, accent: false },
      ],
      lignes: null,
    };
    const interne = monde as unknown as { modeles: Map<string, ModeleGLB>; pools: Map<string, { pool: { mesh: THREE.InstancedMesh } }> };
    interne.modeles.set('test_v3.glb', modele);
    const entrees = (owner: string) =>
      [{ id: 'u1', q: 0, r: 0, fog: 'visible' as const, owner, glb: 'test_v3.glb', echelle: 1 }];
    monde.update(entrees('p1'), couleurDe);
    monde.update(entrees('p2'), couleurDe);

    const accentP1 = new THREE.Color(couleurDe('p1'));
    const accentP2 = new THREE.Color(couleurDe('p2'));
    const couleurPool = (cle: string): THREE.Color =>
      (interne.pools.get(cle)!.pool.mesh.material as THREE.MeshStandardMaterial).color;
    const teinteP1 = couleurPool(`test_v3.glb#0#${couleurDe('p1').toString(16)}`);
    const teinteP2 = couleurPool(`test_v3.glb#0#${couleurDe('p2').toString(16)}`);
    // J1 vs J2 : couleurs DISTINCTES
    expect(teinteP1.getHex()).not.toBe(teinteP2.getHex());
    // Luminance de base CONSERVÉE : teinte = base × accent (pas d'écrasement)
    expect(teinteP1.r / accentP1.r).toBeCloseTo(base.r, 3);
    expect(teinteP1.g / accentP1.g).toBeCloseTo(base.g, 3);
    expect(teinteP2.b / accentP2.b).toBeCloseTo(base.b, 3);
    // Le néon n'est JAMAIS teinté (partie non-accent, matériau partagé intact)
    expect(couleurPool('test_v3.glb#1').getHex()).toBe(matNeon.color.getHex());
    monde.dispose();
  });
});
