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
import {
  dispositionCohabitationParNation,
  dispositionsCohabitation,
} from '../src/lib/render/interaction.js';
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

describe('dispositionCohabitationParNation — paquets compacts par nation', () => {
  it('unité seule : centrée, échelle pleine', () => {
    const poses = dispositionCohabitationParNation([{ id: 'u1', owner: 'p1' }]);
    expect(poses.get('u1')).toEqual({ dx: 0, dy: 0, echelle: 1, z: 0 });
  });

  it('deux nations : paquets gauche/droite, chacun compact (écart interne < écart entre paquets)', () => {
    const poses = dispositionCohabitationParNation([
      { id: 'a1', owner: 'p2' },
      { id: 'b1', owner: 'p1' },
      { id: 'b2', owner: 'p1' },
    ]);
    // Nations TRIÉES (R-81) : p1 (b1,b2) à gauche, p2 (a1) à droite.
    expect(poses.get('b1')!.dx).toBeLessThan(0);
    expect(poses.get('b2')!.dx).toBeLessThan(0);
    expect(poses.get('a1')!.dx).toBeGreaterThan(0);
    // Écart interne du paquet p1 nettement inférieur à l'écart entre paquets.
    const interne = Math.abs(poses.get('b2')!.dx - poses.get('b1')!.dx);
    const entrePaquets = Math.abs(poses.get('a1')!.dx - poses.get('b1')!.dx);
    expect(interne).toBeLessThan(entrePaquets);
    // Cohabitation : échelle réduite partout.
    for (const p of poses.values()) expect(p.echelle).toBeLessThan(1);
  });

  it('trois nations : zones gauche, droite puis haut-gauche (ordre de remplissage), déterministe', () => {
    const unites = [
      { id: 'c1', owner: 'p3' },
      { id: 'a1', owner: 'p1' },
      { id: 'b1', owner: 'p2' },
    ];
    const poses = dispositionCohabitationParNation(unites);
    expect(poses.get('a1')!.dx).toBeLessThan(0); // p1 → zone gauche
    expect(poses.get('a1')!.dy).toBe(0);
    expect(poses.get('b1')!.dx).toBeGreaterThan(0); // p2 → zone droite
    expect(poses.get('c1')!.dy).toBeLessThan(0); // p3 → zone haut-gauche
    expect(poses.get('c1')!.dx).toBeLessThan(0);
    // Déterminisme : mêmes entrées → mêmes sorties.
    const encore = dispositionCohabitationParNation([...unites].reverse());
    for (const [id, p] of poses) expect(encore.get(id)).toEqual(p);
  });

  it('plusieurs unités d\'une même nation dans une zone : escalier diagonal (droite + haut)', () => {
    const poses = dispositionCohabitationParNation([
      { id: 'a1', owner: 'p1' },
      { id: 'b1', owner: 'p2' },
      { id: 'a2', owner: 'p1' },
      { id: 'a3', owner: 'p1' },
    ]);
    // Paquet p1 en zone gauche : escalier diagonal (chaque unité monte à droite).
    expect(poses.get('a2')!.dx).toBeGreaterThan(poses.get('a1')!.dx);
    expect(poses.get('a2')!.dy).toBeLessThan(poses.get('a1')!.dy);
    expect(poses.get('a3')!.dx).toBeGreaterThan(poses.get('a2')!.dx);
    expect(poses.get('a3')!.dy).toBeLessThan(poses.get('a2')!.dy);
    // p2 reste dans sa propre zone (droite).
    expect(poses.get('b1')!.dx).toBeGreaterThan(0);
    // PROFONDEUR (retour Erik) : la première unité du paquet est au premier
    // plan, chaque suivante derrière la précédente.
    expect(poses.get('a1')!.z).toBeGreaterThan(poses.get('a2')!.z);
    expect(poses.get('a2')!.z).toBeGreaterThan(poses.get('a3')!.z);
    expect(poses.get('a1')!.z).toBe(0); // premier plan = ordre naturel du layer
  });

  it('UNE SEULE nation à plusieurs unités : côte à côte, centrées sur la tuile', () => {
    const poses = dispositionCohabitationParNation([
      { id: 'u1', owner: 'p1' },
      { id: 'u2', owner: 'p1' },
      { id: 'u3', owner: 'p1' },
    ]);
    expect(poses.get('u1')!.dx).toBeLessThan(0);
    expect(poses.get('u2')!.dx).toBe(0); // milieu centré
    expect(poses.get('u3')!.dx).toBeGreaterThan(0);
    for (const p of poses.values()) expect(p.dy).toBe(0);
    // Symétrie du paquet autour du centre.
    expect(poses.get('u1')!.dx + poses.get('u3')!.dx).toBeCloseTo(0);
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
