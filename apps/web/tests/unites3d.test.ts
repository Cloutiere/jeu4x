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
import { MODELES_UNITES3D, TERRAINS3D, gabaritUnite3D } from '../src/lib/render3d/spec3d.js';
import { planifierStructures } from '../src/lib/render3d/structures3d.js';
import type { EntiteStructure, EntreeStructures } from '../src/lib/render3d/structures3d.js';
import { aModele3D, unitesStructures } from '../src/lib/render3d/unites3d.js';
import { hexWorldPos } from '../src/lib/render3d/world3d.js';

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

describe('catalogue data-driven type → modèle 3D (visuel3d.json)', () => {
  it('mappe guerrier → gabarit guerrier et archer → gabarit archer', () => {
    expect(gabaritUnite3D('guerrier')).toBe('guerrier');
    expect(gabaritUnite3D('archer')).toBe('archer');
  });

  it('les types SANS modèle (les ~53 autres) n’ont PAS de gabarit — sprite 2D', () => {
    for (const t of ['colon', 'cavalier', 'legion', 'galere', 'espion', 'char_d_assaut', 'guerrier_jaguar']) {
      expect(gabaritUnite3D(t), `type ${t}`).toBeNull();
      expect(aModele3D(t), `type ${t}`).toBe(false);
    }
  });

  it('toute entrée du catalogue pointe vers un gabarit RENDU par le planificateur', () => {
    for (const gab of Object.values(MODELES_UNITES3D)) {
      expect(['guerrier', 'archer']).toContain(gab);
    }
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

  it('assemble les champs du calque depuis l’état filtré (id, gabarit, owner, fog, terrain)', () => {
    const state = etat(
      [{ id: 'g1', type: 'guerrier', owner: 'p1', q: 0, r: 0, aboard: null }],
      { '0,0': 'prairie' },
    );
    const unites = unitesStructures({ state, visible });
    expect(unites).toHaveLength(1);
    expect(unites[0]).toMatchObject({ id: 'g1', q: 0, r: 0, owner: 'p1', type: 'guerrier', fog: 'visible', terrain: 'prairie' });
  });

  it('filtre les types sans modèle 3D (ils restent en sprite billboard)', () => {
    const state = etat([
      { id: 'c1', type: 'colon', owner: 'p1', q: 0, r: 0 },
      { id: 'g1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
    ], { '0,0': 'prairie', '1,0': 'plaine' });
    const unites = unitesStructures({ state, visible });
    expect(unites.map((u) => u.id)).toEqual(['g1']);
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
    expect(unites[0]!.interpole).toEqual({ deQ: 0, deR: 0, deTerrain: 'prairie', t: 0.25 });
  });

  it('sans playback : aucune interpolation (position statique)', () => {
    const state = etat([{ id: 'g1', type: 'guerrier', owner: 'p1', q: 1, r: 0 }], { '1,0': 'prairie' });
    expect(unitesStructures({ state, visible })[0]!.interpole).toBeUndefined();
  });

  it('clé de tuile cohérente avec le moteur (tileKeyOf)', () => {
    expect(tileKeyOf({ q: 0, r: 0 })).toBe('0,0');
  });
});
