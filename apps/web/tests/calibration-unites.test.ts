/**
 * CALIBRATION-UNITES (retour d'Erik du 20/09) — poses des sprites :
 * 1. hauteur des unités SEULES data-driven (calibre = guerrier Recraft,
 *    echelleUnite — ratio de la hauteur de l'hexagone, ajustements par type) ;
 * 2. cohabitations GROUPÉES PAR NATION sur les cases instables
 *    (dispositionCohabitationParNation / dispositionsCohabitation —
 *    déterminisme pur, paquets compacts, nations triées R-81).
 * États de test : fixtures de @game/rules (source unique).
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import { dispositionsCohabitation, dispositionMelee } from '../src/lib/render/interaction.js';
import { contexteMeleeVide } from '../src/lib/melee.js';
import type { ContexteMelee } from '../src/lib/melee.js';
import { AJUST_HAUTEUR, echelleUnite, hauteurUnitePx } from '../src/lib/render/calibration-unites.js';

const HEX_SIZE = 64;
const HAUTEUR_HEX = 2 * HEX_SIZE; // pointy-top

describe('echelleUnite — hauteur des unités seules (calibre guerrier Recraft)', () => {
  it('le guerrier Recraft (320 px) occupe HAUTEUR_UNITE de la hauteur de l\'hexagone', () => {
    const s = echelleUnite('guerrier', 320, HEX_SIZE);
    expect(320 * s).toBeCloseTo(hauteurUnitePx(HEX_SIZE) * AJUST_HAUTEUR['guerrier']!);
    expect(hauteurUnitePx(HEX_SIZE)).toBeCloseTo(1.25 * HAUTEUR_HEX); // taille précédente (retour Erik 20/09)
  });

  it('l\'échelle s\'adapte au ratio du PNG (ancrage pieds : le bas pose, la hauteur cible ne bouge pas)', () => {
    const carre = echelleUnite('archer', 256, HEX_SIZE);
    const haut = echelleUnite('archer', 512, HEX_SIZE);
    expect(256 * carre).toBeCloseTo(512 * haut); // même hauteur écran
  });

  it('ajustement INDIVIDUEL par type (types sans entrée = calibre guerrier)', () => {
    AJUST_HAUTEUR['test_geant'] = 1.2;
    expect(echelleUnite('test_geant', 320, HEX_SIZE)).toBeCloseTo(echelleUnite('guerrier', 320, HEX_SIZE) * 1.2);
    expect(echelleUnite('type_inconnu', 320, HEX_SIZE)).toBeCloseTo(echelleUnite('guerrier', 320, HEX_SIZE));
    delete AJUST_HAUTEUR['test_geant'];
  });

  it('texture dégénérée : repli sur l\'échelle historique 0.5 (garde-fou 7j)', () => {
    expect(echelleUnite('guerrier', 0)).toBe(0.5);
  });
});

describe('dispositionMelee — cohabitations par côtés (rév. Erik 21/09)', () => {
  it('unité seule : centrée, échelle pleine', () => {
    const poses = dispositionMelee([{ id: 'u1', owner: 'p1' }], '0,0', null);
    expect(poses.get('u1')).toEqual({ dx: 0, dy: 0, echelle: 1, z: 0 });
  });

  it('repli sans info : paquets par nation TRIÉE, zones gauche/droite', () => {
    const poses = dispositionMelee(
      [
        { id: 'a1', owner: 'p2' },
        { id: 'b1', owner: 'p1' },
        { id: 'b2', owner: 'p1' },
      ],
      '0,0',
      null,
    );
    // Nations TRIÉES (R-81) : p1 (b1,b2) à gauche, p2 (a1) à droite.
    expect(poses.get('b1')!.dx).toBeLessThan(0);
    expect(poses.get('b2')!.dx).toBeLessThan(0);
    expect(poses.get('a1')!.dx).toBeGreaterThan(0);
    // Cohabitation : échelle réduite partout.
    for (const p of poses.values()) expect(p.echelle).toBeLessThan(1);
  });

  it('repli sans info, trois nations : zones gauche, droite puis haut-gauche, déterministe', () => {
    const unites = [
      { id: 'c1', owner: 'p3' },
      { id: 'a1', owner: 'p1' },
      { id: 'b1', owner: 'p2' },
    ];
    const poses = dispositionMelee(unites, '0,0', null);
    expect(poses.get('a1')!.dx).toBeLessThan(0); // p1 → zone gauche
    expect(poses.get('a1')!.dy).toBe(0);
    expect(poses.get('b1')!.dx).toBeGreaterThan(0); // p2 → zone droite
    expect(poses.get('c1')!.dy).toBeLessThan(0); // p3 → zone haut-gauche
    expect(poses.get('c1')!.dx).toBeLessThan(0);
    const encore = dispositionMelee([...unites].reverse(), '0,0', null);
    for (const [id, p] of poses) expect(encore.get(id)).toEqual(p);
  });

  it('repli sans info : escalier diagonal intra-zone, première unité au premier plan', () => {
    const poses = dispositionMelee(
      [
        { id: 'a1', owner: 'p1' },
        { id: 'b1', owner: 'p2' },
        { id: 'a2', owner: 'p1' },
        { id: 'a3', owner: 'p1' },
      ],
      '0,0',
      null,
    );
    expect(poses.get('a2')!.dx).toBeGreaterThan(poses.get('a1')!.dx);
    expect(poses.get('a2')!.dy).toBeLessThan(poses.get('a1')!.dy);
    expect(poses.get('a3')!.dx).toBeGreaterThan(poses.get('a2')!.dx);
    expect(poses.get('a1')!.z).toBeGreaterThan(poses.get('a2')!.z);
    expect(poses.get('a2')!.z).toBeGreaterThan(poses.get('a3')!.z);
    expect(poses.get('a1')!.z).toBe(0);
    expect(poses.get('b1')!.dx).toBeGreaterThan(0);
  });

  it('PILE AMIE avec côtés connus : posée sur ses côtés comme une mêlée (décision 21/09)', () => {
    const ctx: ContexteMelee = {
      coteParUnite: new Map([
        ['m1', { cote: 'O', ordre: 1 }],
        ['m2', { cote: 'E', ordre: 2 }],
      ]),
      stabiliseeParCase: new Map(),
    };
    const poses = dispositionMelee(
      [
        { id: 'm1', owner: 'p1' },
        { id: 'm2', owner: 'p1' },
      ],
      '0,0',
      ctx,
    );
    expect(poses.get('m1')!.dx).toBeLessThan(0);
    expect(poses.get('m2')!.dx).toBeGreaterThan(0);
    // Pas de centrale : personne ne prend le centre.
    expect(poses.get('m1')!.dx).not.toBe(0);
    expect(poses.get('m2')!.dx).not.toBe(0);
  });
});

/** État : 2 nations cohabitantes en (0,0) (mêlée réelle), une seule en (1,0). */
function makeCohabitationState(): GameState {
  return makeState({
    width: 8,
    height: 8,
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
      { id: 'u2', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'u3', type: 'colon', owner: 'p1', q: 0, r: 0 },
      { id: 'u4', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
    ],
    cities: [],
  });
}

describe('dispositionsCohabitation — poses pour toutes les cases dessinées', () => {
  it('case instable groupée par nation, unité seule inchangée', () => {
    const poses = dispositionsCohabitation(makeCohabitationState(), new Map());
    // (0,0) : p1 (u2,u3) d'un côté, p2 (u1) de l'autre.
    expect(poses.get('u2')!.dx).toBeLessThan(0);
    expect(poses.get('u3')!.dx).toBeLessThan(0);
    expect(poses.get('u1')!.dx).toBeGreaterThan(0);
    // (1,0) : seule → centrée, échelle pleine.
    expect(poses.get('u4')).toEqual({ dx: 0, dy: 0, echelle: 1, z: 0 });
  });

  it('positions DESSINÉES prises en compte (unité programmée sortie de la pile)', () => {
    const state = makeCohabitationState();
    const poses = dispositionsCohabitation(state, new Map([['u3' as const, { q: 2, r: 0 } as Hex]]));
    expect(poses.get('u3')).toEqual({ dx: 0, dy: 0, echelle: 1, z: 0 }); // seule en (2,0)
    // (0,0) reste à 2 nations : toujours groupée gauche (p1) / droite (p2).
    expect(poses.get('u2')!.dx).toBeLessThan(0);
    expect(poses.get('u1')!.dx).toBeGreaterThan(0);
  });
});
