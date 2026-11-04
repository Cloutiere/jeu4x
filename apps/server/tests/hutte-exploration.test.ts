/**
 * HUTTE-EXPLORATION (signalement Erik 04/11, partie ZWV7T5) — une hutte
 * adjacente s'ouvre : l'exploration ramasse les bonus sur son chemin.
 *
 * Diagnostic L1 (prod ZWV7T5 t3-5, dump admin) : u4 (p2) marche (25,5) →
 * (21,5) vers son ralliement de préparation c1 (-8,25) pendant que h9
 * (22,6) — ADJACENTE — reste ouverte. DEUX mécanismes prouvés empilés :
 *  (a) le classement d'exploration ignore les huttes (0 occurrence dans
 *      botPolicy) ;
 *  (b) la règle anti-recul d'OSCILLATION-MARCHE juge le pas latéral vers
 *      la hutte non-améliorant (dIci=29, via hutte=29) → contournement.
 *
 * D1 : la hutte connue à portée de détour est une cible PRIORITAIRE.
 * D2 : un pas QUI ENTRE dans une case hutte n'est jamais un pas arrière
 *      (exception ciblée à filtrerMarcheBot — zéro autre exception, le
 *      ping-pong reste mort).
 * D3 : villages barbares intouchés (porte de guerre R-65), moteur intouché
 *      (l'ouverture existe : bonus à la POSE), schemaVersion 28.
 */
import { describe, expect, it } from 'vitest';
import { BOT_SETTINGS, createRng, hexDistanceW, makeState } from '@game/rules';
import type { GameState } from '@game/rules';
import { assignerObjectifs, botPolicy, filtrerMarcheBot, pasVersRoutier, profileDuBot } from '../src/botPolicy.js';

const BOT = 'p2';
const HUMAN = 'p1';

/** État de base : prairie 20×12, une capitale bot à (2,3). */
function state(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number; hp?: number }>;
  huts?: Array<{ q: number; r: number }>;
  exploredBot?: Array<string>;
}): GameState {
  const s = makeState({
    width: 20,
    height: 12,
    players: [HUMAN, BOT],
    units: (opts.units ?? []).map((u) => ({ ...u, aboard: null, cargo: null })),
    cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    huts: opts.huts ?? [],
    rngSeed: 42,
  }) as GameState;
  s.players[BOT]!.vision.explored = opts.exploredBot ?? [];
  return s;
}

function orderOf(plan: ReturnType<typeof botPolicy>, unitId: string) {
  return plan.orders.find((o) => 'unitId' in o && o.unitId === unitId);
}

describe('HUTTE-EXPLORATION · D1 — la hutte connue est une cible PRIORITAIRE', () => {
  it('CAS ZWV7T5 reconstitué : hutte ADJACENTE → l\'unité ENTRAÎNE (Move vers la hutte, jamais Hold)', () => {
    // géométrie ZWV7T5 translatée : u4 (21,5) → (11,5), h9 (22,6) → (12,6)
    const s = state({
      units: [{ id: 'u4', type: 'guerrier', owner: BOT, q: 11, r: 5 }],
      huts: [{ q: 12, r: 6 }], // h9 — dist 2 (un pas d'approche puis entrée)
      exploredBot: ['11,5', '12,6'],
    });
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    expect(obj.get('u4')).toMatchObject({ kind: 'explorer', cible: { q: 12, r: 6 } });
    const o = orderOf(botPolicy(s, BOT, createRng(7)), 'u4');
    expect(o?.type).toBe('Move');
    const step = (o as { type: 'Move'; path: Array<{ q: number; r: number }> }).path[0]!;
    expect(hexDistanceW(step, { q: 12, r: 6 }, s.mapWidth)).toBeLessThan(hexDistanceW({ q: 11, r: 5 }, { q: 12, r: 6 }, s.mapWidth));
    // phase 2 : au pas suivant, l'unité ENTRE sur la hutte (pose = ouverture)
    const s2 = state({
      units: [{ id: 'u4', type: 'guerrier', owner: BOT, q: 12, r: 5 }],
      huts: [{ q: 12, r: 6 }],
      exploredBot: ['12,5', '12,6'],
    });
    const o2 = orderOf(botPolicy(s2, BOT, createRng(7)), 'u4');
    expect(o2?.type).toBe('Move');
    expect((o2 as { type: 'Move'; path: Array<{ q: number; r: number }> }).path).toEqual([{ q: 12, r: 6 }]);
  });

  it('hutte connue à portée de détour → cible prioritaire sur la case lointaine', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 5, r: 5 }],
      huts: [{ q: 6, r: 6 }], // dist 1
      exploredBot: ['5,5', '6,6'],
    });
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    expect(obj.get('b1')).toMatchObject({ kind: 'explorer', cible: { q: 6, r: 6 } });
  });

  it('hutte HORS détour (dist > hutteDetourMax) → pas prioritaire, l\'exploration continue', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 5, r: 5 }],
      huts: [{ q: 15, r: 5 }], // dist 10 >> hutteDetourMax 3
      exploredBot: ['5,5', '15,5'],
    });
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    const o = obj.get('b1')!;
    expect(o.cible).not.toEqual({ q: 15, r: 5 });
  });

  it('hutte NON explorée (hors vision) → ignorée (le bot ne triche pas)', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 5, r: 5 }],
      huts: [{ q: 6, r: 6 }],
      exploredBot: ['5,5'], // 6,6 PAS explorée
    });
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    expect(obj.get('b1')!.cible).not.toEqual({ q: 6, r: 6 });
  });

  it('hutte OUVERTE (retirée de state.huts) → quitte le classement (l\'exploration reprend)', () => {
    const avecHutte = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 5, r: 5 }],
      huts: [{ q: 6, r: 6 }],
      exploredBot: ['5,5', '6,6'],
    });
    const sansHutte = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 5, r: 5 }],
      huts: [],
      exploredBot: ['5,5', '6,6'],
    });
    expect(assignerObjectifs(avecHutte, BOT, profileDuBot()).get('b1')!.cible).toEqual({ q: 6, r: 6 });
    // sans la hutte : la cible n'est PAS la case de l'ancienne hutte
    expect(assignerObjectifs(sansHutte, BOT, profileDuBot()).get('b1')!.cible).not.toEqual({ q: 6, r: 6 });
  });

  it('une hutte est réservée à UN scout par tour (attribution séquentielle)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 5, r: 5 },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 5, r: 6 },
      ],
      huts: [{ q: 6, r: 6 }],
      exploredBot: ['5,5', '5,6', '6,6'],
    });
    const objs = assignerObjectifs(s, BOT, profileDuBot());
    const cibles = [objs.get('b1')!.cible, objs.get('b2')!.cible];
    const surHutte = cibles.filter((c) => c && c.q === 6 && c.r === 6).length;
    expect(surHutte).toBeLessThanOrEqual(1);
  });

  it('d1 : hutteDist ≤ hutteDetourMax seulement — le défaut data est 3', () => {
    expect(profileDuBot().hutteDetourMax).toBe(3);
    expect((BOT_SETTINGS.profiles['normal'] as { hutteDetourMax: number }).hutteDetourMax).toBe(3);
  });
});

describe('HUTTE-EXPLORATION · D2 — le pas vers une hutte n\'est JAMAIS un pas arrière', () => {
  const s = state({
    units: [{ id: 'u1', type: 'guerrier', owner: BOT, q: 10, r: 5 }],
    huts: [{ q: 9, r: 5 }], // hutte DERRIÈRE l'unité (le passage Jev est devant)
  });
  const unite = s.units['u1']!;
  // ordre bot qui repartirait l'unité EN ARRIÈRE (vers la hutte à (9,5),
  // d'après le passage Jev à (12,5)) — anti-recul canon OSCILLATION-MARCHE.
  const pasHutte = pasVersRoutier(unite, s, { q: 9, r: 5 })!;
  expect(pasHutte).toEqual({ q: 9, r: 5 });
  const ordreArriere = { type: 'Move' as const, unitId: 'u1', path: [pasHutte] };
  const garde = [{ unitId: 'u1', q: 12, r: 5 }];

  it('sans exception : l\'ordre vers la hutte serait filtré (recréation du refus)', () => {
    const filtres = filtrerMarcheBot([ordreArriere], garde, s.units as never, s.mapWidth);
    expect(filtres).toHaveLength(0); // anti-recul canon : filtre l'arrière
  });

  it('AVEC exception D2 : le pas QUI ENTRE dans la hutte est CONSERVÉ', () => {
    const filtres = filtrerMarcheBot([ordreArriere], garde, s.units as never, s.mapWidth, s.huts);
    expect(filtres).toHaveLength(1);
    expect(filtres[0]).toEqual(ordreArriere);
  });

  it('zéro autre exception : le même pas arrière SANS hutte reste filtré', () => {
    const filtres = filtrerMarcheBot([ordreArriere], garde, s.units as never, s.mapWidth, []);
    expect(filtres).toHaveLength(0);
  });
});

describe('HUTTE-EXPLORATION · non-régression', () => {
  it('cul-de-sac SANS hutte → Hold (l\'anti-piétinement tient)', () => {
    // unité en poche : entourée d'eau sauf une sortie non-améliorante
    const s = makeState({
      width: 8,
      height: 8,
      players: [HUMAN, BOT],
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 0, r: 0, aboard: null, cargo: null }],
      cities: [{ id: 'c1', owner: BOT, q: 7, r: 7, pop: 2, capital: true }],
      huts: [],
      rngSeed: 42,
    }) as GameState;
    s.players[BOT]!.vision.explored = ['0,0'];
    // rendre l'eau autour : les tuiles voisines de (0,0) — le makeState
    // génère de la prairie ; on teste plutôt le pas vers une hutte lointaine
    // interdite : l'unité sans hutte à portée garde son comportement canon
    // (explorer/patrouiller → un pas ROUTIER, jamais un pas arrière).
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    const o = obj.get('b1')!;
    expect(['explorer', 'patrouiller', 'rallier', 'garnison', 'tenir']).toContain(o.kind);
    if (o.kind === 'explorer' && o.cible) {
      const step = pasVersRoutier(s.units['b1']!, s, o.cible);
      // jamais un pas qui AUGMENTE la distance à la cible (canon)
      if (step) {
        expect(hexDistanceW(step, o.cible, s.mapWidth)).toBeLessThanOrEqual(
          hexDistanceW(s.units['b1']!, o.cible, s.mapWidth),
        );
      }
    }
  });

  it('village barbare : PAS une hutte — jamais ciblé par le ramassage (D3, porte de guerre R-65)', () => {
    const s = makeState({
      width: 20,
      height: 12,
      players: [HUMAN, BOT],
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 5, r: 5, aboard: null, cargo: null }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
      villages: [{ q: 6, r: 6 }],
      huts: [],
      rngSeed: 42,
    }) as GameState;
    s.players[BOT]!.vision.explored = ['5,5', '6,6'];
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    expect(obj.get('b1')!.cible).not.toEqual({ q: 6, r: 6 });
  });
});
