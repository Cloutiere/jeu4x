/**
 * OSCILLATION-MARCHE (décisions Erik 02/11) — une marche avance ou tient,
 * JAMAIS ne recule.
 *
 * Diagnostic banc guerre-vivante partie 2 (30 614 ping-pongs comptés) :
 *  1. `pasVers` (glouton de repli) n'exige pas d'amélioration de distance —
 *     en cul-de-sac il renvoie la case d'où l'unité vient (ping-pong u4 :
 *     23,22 ⇄ 24,22 toute la partie, signature exacte de la trace prod d'Erik) ;
 *  2. le BFS `pasVersRoutier` ne wrappe pas Est↔Ouest alors que `dist` si
 *     (canon CARTE-RONDE T1) → null sur les isthmes de la couture → repli
 *     glouton constant ;
 *  3. tir à la corde : une unité en MARCHE Jev (memo.marche) est reprise par
 *     le plan bot (ralliement ouest) les tours où Jev ne la couvre pas —
 *     pas arrière u87 (0,20 ⇄ 1,20).
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '@game/rules';
import type { GameState, PlayerId, SeededRng } from '@game/rules';

const rngFaux = (): SeededRng =>
  ({ next: () => 0.99, nextInt: (n: number) => n - 1, state: 0 }) as SeededRng;
import { filtrerMarcheBot, pasVers, pasVersRoutier } from '../src/botPolicy.js';

const ME: PlayerId = 'p2';
const AUTRE: PlayerId = 'p1';

/** Distance hexagonale avec wrap Est↔Ouest (miroir hexDistanceW — canon T1). */
function distW(
  largeur: number,
  a: { q: number; r: number },
  b: { q: number; r: number },
): number {
  const col = (h: { q: number; r: number }) => h.q + Math.floor(h.r / 2);
  const dc = ((col(a) - col(b)) % largeur + largeur) % largeur;
  const dcW = Math.min(dc, largeur - dc);
  const dr = a.r - b.r;
  return Math.max(Math.abs(dcW + Math.floor(dr / 2)) , Math.abs(dr), Math.abs(dr + dcW));
}

function state(opts: {
  largeur?: number;
  terrainOverrides?: Record<string, import('@game/rules').TerrainId>;
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number }>;
  cities?: Array<{ id: string; owner: string; q: number; r: number }>;
}): GameState {
  const s = makeState({
    width: opts.largeur ?? 20,
    height: 12,
    players: [AUTRE, ME],
    warPairs: [[AUTRE, ME]],
    ...(opts.terrainOverrides !== undefined ? { terrainOverrides: opts.terrainOverrides } : {}),
    units: (opts.units ?? []).map((u) => ({ ...u, aboard: null, cargo: null })),
    cities: (opts.cities ?? []).map((c) => ({
      pop: 2,
      capital: true,
      workedTiles: [],
      buildings: [],
      ...c,
    })),
    rngSeed: 42,
  }) as GameState;
  s.turn = 40;
  return s;
}

describe('OSCILLATION-MARCHE · pasVers — jamais un pas arrière', () => {
  it('cul-de-sac (baie, cible de l’autre côté du wrap) → null, pas la case d’où l’unité vient', () => {
    // Cas u4 reconstitué (banc partie 2, seed 3947827986) : l'unité est dans
    // une baie — eau à l'est/sud-est/nord-est ; la cible est à l'ouest en
    // distance WRAPPÉE mais le seul voisin « vers la cible » au sens glouton
    // est la case d'où elle vient. Avant fix : ping-pong éternel.
    const terrainOverrides: Record<string, import('@game/rules').TerrainId> = {
      '11,2': 'ocean', // bloque l'est de (10,3)
      '11,3': 'ocean',
      '10,2': 'ocean', // bloque le nord-est
      '10,4': 'ocean', // bloque le sud-est
      '11,4': 'ocean',
    };
    const s = state({
      terrainOverrides,
      units: [{ id: 'u1', type: 'guerrier', owner: ME, q: 10, r: 3 }],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 3 },
        { id: 'c2', owner: AUTRE, q: 12, r: 8 },
      ],
    });
    const u = s.units['u1']!;
    const cible = { q: 12, r: 8 };
    const step = pasVers(u, s, cible);
    if (step !== null) {
      // S'il y a un pas, il RÉDUIT strictement la distance (jamais arrière).
      expect(distW(20, step, cible)).toBeLessThan(distW(20, { q: u.q, r: u.r }, cible));
    }
  });

  it('pas normal : le glouton rapproche toujours (règle d’amélioration stricte)', () => {
    const s = state({
      units: [{ id: 'u1', type: 'guerrier', owner: ME, q: 5, r: 2 }],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 8, r: 2 },
      ],
    });
    const u = s.units['u1']!;
    const step = pasVers(u, s, { q: 8, r: 2 });
    expect(step).toEqual({ q: 6, r: 2 }); // améliore : 3 → 2
  });
});

describe('OSCILLATION-MARCHE · pasVersRoutier — BFS avec wrap Est↔Ouest (canon T1)', () => {
  it('traverse la couture : seule la route par le bord Est mène à la cible', () => {
    // Carte 20 de large ; un mur d'eau vertical en q=9 (r 0..11) sépare la
    // carte en deux : la SEULE route terrestre vers la cible (2,5) passe par
    // la couture Est (q=19 → q=0). Avant fix : BFS null (pas de wrap) →
    // repli glouton → ping-pong. Après fix : premier pas VERS LE BORD EST.
    const terrainOverrides: Record<string, import('@game/rules').TerrainId> = {};
    for (let r = 0; r < 12; r++) terrainOverrides[`9,${r}`] = 'ocean';
    const s = state({
      largeur: 20,
      terrainOverrides,
      units: [{ id: 'u1', type: 'guerrier', owner: ME, q: 15, r: 5 }],
      cities: [
        { id: 'c1', owner: ME, q: 12, r: 5 },
        { id: 'c2', owner: AUTRE, q: 2, r: 5 },
      ],
    });
    const step = pasVersRoutier(s.units['u1']!, s, { q: 2, r: 5 });
    expect(step).not.toBeNull();
    // Le pas va vers la couture (q croissant), pas vers le mur d'eau.
    expect(step!.q).toBeGreaterThan(15);
  });

  it('cul-de-sac total (île) → null (inchangé)', () => {
    const terrainOverrides: Record<string, import('@game/rules').TerrainId> = {};
    for (const [dq, dr] of [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]] as const) {
      terrainOverrides[`${8 + dq},${2 + dr}`] = 'ocean';
    }
    const s = state({
      terrainOverrides,
      units: [{ id: 'u1', type: 'guerrier', owner: ME, q: 3, r: 2 }],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 8, r: 2 },
      ],
    });
    // u1 n'est PAS sur l'île : la cible l'est → inatteignable → null.
    expect(pasVersRoutier(s.units['u1']!, s, { q: 8, r: 2 })).toBeNull();
  });
});

describe('OSCILLATION-MARCHE · filtrerMarcheBot — la marche Jev ne recule jamais', () => {
  it('le pas bot qui augmente la distance au passage est retiré ; l’assaut est conservé', () => {
    const s = state({
      units: [
        { id: 'uM', type: 'guerrier', owner: ME, q: 10, r: 3 }, // en marche Jev
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 3 },
        { id: 'c2', owner: AUTRE, q: 2, r: 8 },
      ],
    });
    const garde = [{ unitId: 'uM', q: 2, r: 8 }]; // passage = capitale adverse (ouest)
    // Le plan bot veut l'emmener à l'EST (10,3 → 11,3) : loin du passage.
    const ordresBot = [
      { type: 'Move', unitId: 'uM', path: [{ q: 11, r: 3 }] },
      // Assaut : la case cible est celle d'une ennemie (d=0 au passage ?) —
      // ici un Move sur la case du passage lui-même (distance 0) : conservé.
      { type: 'Move', unitId: 'uM', path: [{ q: 2, r: 8 }] },
    ] as never;
    const filtres = filtrerMarcheBot(ordresBot, garde, s.units as never, 20);
    // Seul l'assaut (pas qui n'augmente pas la distance au passage) survit.
    expect(filtres).toHaveLength(1);
    expect((filtres[0] as { path: Array<{ q: number; r: number }> }).path[0]).toEqual({ q: 2, r: 8 });
  });

  it('une unité hors garde est intouchée ; MultiStep jugé à sa destination finale', () => {
    const s = state({
      units: [
        { id: 'uM', type: 'guerrier', owner: ME, q: 10, r: 3 },
        { id: 'uX', type: 'guerrier', owner: ME, q: 5, r: 5 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 3 },
        { id: 'c2', owner: AUTRE, q: 2, r: 8 },
      ],
    });
    const garde = [{ unitId: 'uM', q: 2, r: 8 }];
    const ordresBot = [
      { type: 'Move', unitId: 'uX', path: [{ q: 6, r: 5 }] },
      { type: 'MultiStep', unitId: 'uM', path: [{ q: 9, r: 3 }, { q: 8, r: 3 }] },
    ] as never;
    const filtres = filtrerMarcheBot(ordresBot, garde, s.units as never, 20);
    expect(filtres).toHaveLength(2); // uX intouché ; uM RAPPROCHE (8,3)
  });
});
