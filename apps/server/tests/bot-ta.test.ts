/**
 * BOT-TA (décisions Erik 21/10) — la politique du bot tactique : des
 * OBJECTIFS par unité (soigner / attaquer / garnisonner / chasser les
 * barbares / explorer) au lieu du hasard. Chaque test cite la décision
 * (D1-D5) et la règle applicable (R-95 barbares, R-187 paix par défaut,
 * R-81 déterminisme). Les barbares sont en guerre permanente (R-95) ;
 * l'attaque d'un JOUEUR exige l'état de guerre (le bot ne déclare jamais —
 * T-C).
 */
import { describe, expect, it } from 'vitest';
import { BARBARIAN_ID, BOT_SETTINGS, createRng, hexDistanceW, makeState } from "@game/rules";
import type { GameState } from '@game/rules';
import { assignerObjectifs, botPolicy, profileDuBot } from '../src/botPolicy.js';
import { orderShapeError } from '../src/game.js';

const BOT = 'p2';
const HUMAN = 'p1';

/** État de base : prairie 8×8, le bot et l'humain (guerre par défaut des
 *  fixtures — passer warPairs: [] pour la paix R-187). */
function state(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number; hp?: number; fortified?: boolean; isArmy?: boolean; aboard?: string | null; cargo?: string | null }>;
  cities?: Array<{ id: string; owner: string; q: number; r: number; pop?: number; capital?: boolean; buildings?: string[]; production?: GameState['cities'][string]['production'] }>;
  villages?: Array<{ q: number; r: number }>;
  peace?: boolean;
  treasury?: number;
  turn?: number;
}): GameState {
  const opts2 = {
    width: 8,
    height: 8,
    players: [HUMAN, BOT],
    ...(opts.peace ? { warPairs: [] as Array<[string, string]> } : {}),
    units: (opts.units ?? []).map((u) => ({ ...u, aboard: u.aboard ?? null, cargo: u.cargo ?? null })),
    cities: opts.cities ?? [],
    ...(opts.villages ? { villages: opts.villages } : {}),
    ...(opts.turn !== undefined ? { turn: opts.turn } : {}),
    rngSeed: 42,
  };
  return makeState(opts2) as GameState;
}

function planOf(state: GameState, seed = 7) {
  return botPolicy(state, BOT, createRng(seed));
}

function orderOf(plan: ReturnType<typeof planOf>, unitId: string) {
  return plan.orders.find((o) => 'unitId' in o && o.unitId === unitId);
}

describe('BOT-TA · D5 — bloc data-driven des seuils (bot.json)', () => {
  it('trois profils prévus, « normal » actif, seuils cohérents', () => {
    expect(BOT_SETTINGS.profil).toBe('normal');
    expect(Object.keys(BOT_SETTINGS.profiles).sort()).toEqual(['difficile', 'facile', 'normal']);
    const n = BOT_SETTINGS.profiles['normal']!;
    expect(n.seuilSoinPv).toBeGreaterThan(0);
    expect(n.ratioAttaqueMin).toBeGreaterThan(0);
    expect(n.garnisonsCapitale).toBeGreaterThanOrEqual(n.garnisonsParVille);
    const f = BOT_SETTINGS.profiles['facile']!;
    const d = BOT_SETTINGS.profiles['difficile']!;
    expect(f.ratioAttaqueMin).toBeLessThan(n.ratioAttaqueMin);
    expect(d.ratioAttaqueMin).toBeGreaterThan(f.ratioAttaqueMin);
    expect(profileDuBot()).toBe(n);
  });
});

describe('BOT-TA · D1-① soigner les blessés (ordre Heal, jamais sous menace)', () => {
  it('une unité blessée sous le seuil sans menace adjacente se SOIGNE', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2, hp: 1 }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
    });
    expect(orderOf(planOf(s), 'b1')).toMatchObject({ type: 'Heal', unitId: 'b1' });
  });

  it('une unité entamée AU-DESSUS du seuil ne se soigne pas (elle agit)', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2, hp: 3 }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
    });
    expect(orderOf(planOf(s), 'b1')?.type).not.toBe('Heal');
  });

  it('une unité blessée MENACÉE (ennemi adjacent) ne se soigne pas — elle combat (BOT-ESCARMOUCHE : campagne existe) ou replie', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2, hp: 1 },
        { id: 'e1', type: 'guerrier', owner: HUMAN, q: 3, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 },
        { id: 'c9', owner: HUMAN, q: 7, r: 7, pop: 1 }, // BOT-ESCARMOUCHE : campagne possible → combat (sinon repli)
      ],
    });
    const o = orderOf(planOf(s), 'b1');
    expect(o?.type).not.toBe('Heal');
    // Rapport égal (1 v 1, prairie) : favorable au seuil « normal » → attaque.
    expect(o).toMatchObject({ type: 'Attack', unitId: 'b1', target: { q: 3, r: 2 } });
  });
});

describe('BOT-TA · D1-②/D2 — attaquer à portée selon le rapport de force', () => {
  it('R-95 : un barbare adjacent est une proie légitime SANS déclaration contre lui (BOT-ESCARMOUCHE : en campagne ; en paix générale plus aucune attaque ② — la chasse ④ reste la porte)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2, isArmy: true },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 1, r: 1 },
        { id: 'x1', type: 'guerrier', owner: BARBARIAN_ID, q: 3, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 },
        { id: 'c9', owner: HUMAN, q: 7, r: 7, pop: 1 }, // campagne p1 → ② autorisée (BOT-ESCARMOUCHE)
      ],
    });
    expect(orderOf(planOf(s), 'b1')).toMatchObject({ type: 'Attack', target: { q: 3, r: 2 } });
    // Paix générale : aucune attaque ② (canon §2.1 — jamais en patrouille).
    const paix = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2, isArmy: true },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 1, r: 1 },
        { id: 'x1', type: 'guerrier', owner: BARBARIAN_ID, q: 3, r: 2 },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
      peace: true,
    });
    expect(orderOf(planOf(paix), 'b1')?.type).not.toBe('Attack');
  });

  it('gardien de CAMP barbare (village porté par l\'état) : attaque la pile (BOT-GATE-ATTAQUE : armée ×3 ; BOT-ESCARMOUCHE : campagne requise)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2, isArmy: true },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 1, r: 1 },
        { id: 'x1', type: 'guerrier', owner: BARBARIAN_ID, q: 3, r: 2 },
      ],
      villages: [{ q: 3, r: 2 }],
      cities: [
        { id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 },
        { id: 'c9', owner: HUMAN, q: 7, r: 7, pop: 1 }, // campagne p1 (BOT-ESCARMOUCHE)
      ],
    });
    expect(orderOf(planOf(s), 'b1')).toMatchObject({ type: 'Attack', target: { q: 3, r: 2 } });
  });

  it('rapport DÉFAVORABLE : jamais d\'attaque-suicide — repli vers la ville propre (D2)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2 },
        { id: 'x1', type: 'piquier', owner: BARBARIAN_ID, q: 3, r: 2, fortified: true },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
    });
    s.map['3,2'] = { terrain: 'colline', resource: null };
    const o = orderOf(planOf(s), 'b1');
    expect(o?.type).not.toBe('Attack');
    expect(o?.type).toBe('Move'); // repli d'un pas vers c1 (2,3)
  });

  it('R-187 : ville ennemie adjacente SANS défense est capturée en guerre…', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2 }],
      cities: [
        { id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 },
        { id: 'c9', owner: HUMAN, q: 3, r: 2, pop: 1 },
      ],
    });
    expect(orderOf(planOf(s), 'b1')).toMatchObject({ type: 'Attack', target: { q: 3, r: 2 } });
  });

  it('…mais JAMAIS en paix (R-187 — le bot ne déclare pas, T-C) : il tient ou replie', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2 }],
      cities: [
        { id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 },
        { id: 'c9', owner: HUMAN, q: 3, r: 2, pop: 1 },
      ],
      peace: true,
    });
    expect(orderOf(planOf(s), 'b1')?.type).not.toBe('Attack');
  });

  it('guerre seule : unité ennemie attaquée si `wars`, sinon jamais (BOT-GATE-ATTAQUE : espérance passante ; BOT-ESCARMOUCHE : campagne requise)', () => {
    const units = [
      { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2, isArmy: true },
      { id: 'b2', type: 'guerrier', owner: BOT, q: 1, r: 1 },
      { id: 'e1', type: 'guerrier', owner: HUMAN, q: 3, r: 2 },
    ];
    const cities = [
      { id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 },
      { id: 'c9', owner: HUMAN, q: 7, r: 7, pop: 1 }, // campagne p1 (BOT-ESCARMOUCHE)
    ];
    const enGuerre = state({ units, cities });
    expect(orderOf(planOf(enGuerre), 'b1')).toMatchObject({ type: 'Attack' });
    const enPaix = state({ units, cities, peace: true });
    expect(orderOf(planOf(enPaix), 'b1')?.type).not.toBe('Attack');
  });
});

describe('BOT-TA · D1-③ garnison (capitale prioritaire, N par ville)', () => {
  it('les unités libres garnisonnent la capitale d\'abord, puis les autres villes', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 1 },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 2, r: 2 },
        { id: 'b3', type: 'guerrier', owner: BOT, q: 6, r: 2 },
        // BOT-MARCHE D3 : la conscription exige désormais l'URGENCE capitale
        // (menace à ≤ rayonMenace) — en guerre calme, la campagne prime.
        { id: 'x1', type: 'guerrier', owner: HUMAN, q: 2, r: 6 },
      ],
      cities: [
        { id: 'c2', owner: BOT, q: 6, r: 3, pop: 2 },
        { id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true },
      ],
    });
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    expect(obj.get('b1')).toMatchObject({ kind: 'garnison', cityId: 'c1' }); // capitale d'abord
    expect(obj.get('b2')).toMatchObject({ kind: 'garnison', cityId: 'c1' });
    expect(obj.get('b3')).toMatchObject({ kind: 'garnison', cityId: 'c2' });
  });

  it('garnison comblée : l\'unité en place se FORTIFIE puis passe en VIGILANCE (jamais Passer)', () => {
    // BOT-MARCHE D3 : la garnison d'urgence exige la menace capitale.
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3 },
        { id: 'x1', type: 'guerrier', owner: HUMAN, q: 2, r: 6 },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    expect(orderOf(planOf(s), 'b1')).toMatchObject({ type: 'Fortify', unitId: 'b1' });
    const fortified = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3, fortified: true },
        { id: 'x1', type: 'guerrier', owner: HUMAN, q: 2, r: 6 },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    expect(orderOf(planOf(fortified), 'b1')).toMatchObject({ type: 'Sleep', unitId: 'b1' });
    const plans = [planOf(s, 1), planOf(s, 2), planOf(fortified, 3)];
    for (const p of plans) expect(p.orders.some((o) => o.type === 'Pass')).toBe(false);
  });
});

describe('BOT-TA · D1-④ chasser les barbares / ⑤ explorer avec intention', () => {
  it('un barbare lointain est CHASSÉ : le pas réduit la distance (pas d\'errance)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2 },
        { id: 'g1', type: 'guerrier', owner: BOT, q: 2, r: 3 },
        { id: 'g2', type: 'guerrier', owner: BOT, q: 2, r: 3 },
        { id: 'x1', type: 'guerrier', owner: BARBARIAN_ID, q: 6, r: 2 },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    const o = orderOf(planOf(s), 'b1');
    expect(o?.type).toBe('Move');
    if (o?.type !== 'Move') return;
    const avant = hexDistanceW({ q: 2, r: 2 }, { q: 6, r: 2 }, s.mapWidth);
    const apres = hexDistanceW(o.path[0]!, { q: 6, r: 2 }, s.mapWidth);
    expect(apres).toBeLessThan(avant);
  });

  it('D3 : exploration NON aléatoire — mêmes objectifs et mêmes ordres d\'unités quel que soit le seed', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2 }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    const ordres = (seed: number) =>
      JSON.stringify(planOf(s, seed).orders.filter((o) => 'unitId' in o && o.unitId === 'b1'));
    const reference = ordres(0);
    for (let seed = 1; seed <= 10; seed++) expect(ordres(seed)).toBe(reference);
    // La tactique est pure : mêmes objectifs à chaque appel (aucun RNG).
    expect([...assignerObjectifs(s, BOT, profileDuBot())]).toEqual([...assignerObjectifs(s, BOT, profileDuBot())]);
  });
});

describe('BOT-TA · D3/D6 — déterminisme et validité des formes', () => {
  it('même état + même seed ⇒ plan identique (ordres et actions), tour de reprise compris', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2, hp: 2 },
        { id: 'b2', type: 'galere', owner: BOT, q: 1, r: 0 },
        { id: 'e1', type: 'guerrier', owner: BARBARIAN_ID, q: 3, r: 2 },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
      villages: [{ q: 6, r: 6 }],
      turn: 12,
    });
    expect(planOf(s, 99)).toEqual(planOf(s, 99));
  });

  it('D6 : chaque ordre émis passe le validateur orderShapeError (le bot ne bloque jamais)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2, hp: 1 },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 6, r: 2 },
        { id: 'b3', type: 'artiste_penseur', owner: BOT, q: 5, r: 5 },
        { id: 'e1', type: 'guerrier', owner: BARBARIAN_ID, q: 3, r: 2 },
        { id: 'x2', type: 'guerrier', owner: BARBARIAN_ID, q: 7, r: 7 },
      ],
      cities: [
        { id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true },
        { id: 'c9', owner: HUMAN, q: 7, r: 6, pop: 2 },
      ],
      villages: [{ q: 6, r: 6 }],
    });
    const { orders } = planOf(s);
    expect(orders.length).toBeGreaterThan(0);
    for (const o of orders) expect(orderShapeError(o)).toBeNull();
  });
});

describe('BOT-TA · D4 — production pondérée (unités si en guerre)', () => {
  it('en guerre, une ville sans file produit une UNITÉ quand une option unité existe', () => {
    const s = state({ cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }] });
    for (let seed = 0; seed < 10; seed++) {
      const prod = planOf(s, seed).orders.find((o) => o.type === 'SetProduction');
      expect(prod).toMatchObject({ cityId: 'c1' });
      if (prod?.type !== 'SetProduction') return;
      expect(prod.item.kind).toBe('unit');
    }
  });

  // BOT-TB (Erik 24/10) : en paix, l'arbitrage D2 est DÉTERMINISTE — le même
  // état produit le même item quel que soit le seed (plus de tirage varié).
  it('en paix, la production est arbitrée et déterministe (BOT-TB D2)', () => {
    const s = state({ cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }], peace: true });
    const items = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const prod = planOf(s, seed).orders.find((o) => o.type === 'SetProduction');
      expect(prod?.type).toBe('SetProduction');
      if (prod?.type === 'SetProduction') items.add(JSON.stringify(prod.item));
    }
    expect(items.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// BOT-ESCARMOUCHE-GATE (canon Erik 11/11) — le gate REMPLACE le ban
// structurel : une unité de l'armée en campagne peut escarmoucher un ennemi
// adjacent SI l'espérance passe (courbe de pression conservée). L'escarmouche
// est une opportunité, jamais un objectif : hors campagne, personne
// n'attaque ; hors guerre déclarée, le gate reste à k=2 (D3UUQJ vert).
// ---------------------------------------------------------------------------
describe('BOT-ESCARMOUCHE-GATE · le gate remplace le ban de campagne', () => {
  /** Armée p2 (b1, guerrier isArmy) en campagne contre p1 (ville à (6,6),
   *  capitale p2 à (0,0)) ; un ennemi p1 adjacent à b1 en (3,3) ; durée de
   *  guerre réglée par warsDepuis (turn 20). */
  function campagneEscarmouche(opts: { duree: number; ennemiHp?: number; ennemiType?: string }) {
    const s = state({
      turn: 20,
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 3, r: 3, isArmy: true },
        { id: 'e1', type: opts.ennemiType ?? 'guerrier', owner: HUMAN, q: 3, r: 4, hp: opts.ennemiHp ?? 3 },
        { id: 'e2', type: 'guerrier', owner: HUMAN, q: 6, r: 7 },
      ],
      cities: [
        { id: 'cap', owner: BOT, q: 0, r: 0, capital: true, pop: 2 },
        { id: 'ville1', owner: HUMAN, q: 6, r: 6, pop: 1 },
      ],
    });
    s.diplomacy.warsDepuis = { 'p1,p2': 20 - opts.duree };
    return s;
  }

  it('ROUGE AVANT FIX — armée en campagne en guerre LONGUE (t=9) attaque l’ennemi adjacent qui passe le gate', () => {
    const s = campagneEscarmouche({ duree: 9, ennemiHp: 1 });
    const o = orderOf(planOf(s), 'b1');
    expect(o).toMatchObject({ type: 'Attack', unitId: 'b1' });
  });

  it('guerre fraîche + ennemi FORT adjacent (p bas, gate refuse partout) → rassemblement inchangé (Move, jamais Attack)', () => {
    const s = campagneEscarmouche({ duree: 2, ennemiType: 'piquier', ennemiHp: 3 });
    // piquier fortifié en défense à ~2 vs guerrier 1 : p très bas — refus à toute durée.
    const o = orderOf(planOf(s), 'b1');
    expect(o?.type).not.toBe('Attack');
    expect(['Move', 'Fortify', 'Hold']).toContain(o?.type); // marche/rassemblement
  });

  it('hors campagne (paix générale) : personne n’attaque — ni patrouille ni exploration (canon §2.1)', () => {
    const paix = state({
      peace: true,
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 2 },
        { id: 'x1', type: 'guerrier', owner: BARBARIAN_ID, q: 3, r: 2 },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
    });
    expect(orderOf(planOf(paix), 'b1')?.type).not.toBe('Attack');
  });

  it('D3UUQJ vert : scout en paix vs gardien barbare fortifié — jamais d’attaque (hors campagne ET k=2)', () => {
    const { state: s } = { state: state({
      peace: true,
      villages: [{ q: 5, r: 5 }],
      units: [
        { id: 'u1', type: 'guerrier', owner: BOT, q: 5, r: 6 },
        { id: 'g1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 5, fortified: true },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 0, r: 0, capital: true, pop: 2 }],
    }) };
    expect(orderOf(planOf(s), 'u1')?.type).not.toBe('Attack');
  });

  it('déterminisme 30 seeds : le verdict d’escarmouche en guerre longue est identique', () => {
    const temoin = orderOf(planOf(campagneEscarmouche({ duree: 9, ennemiHp: 1 })), 'b1');
    for (let seed = 8; seed < 38; seed++) {
      expect(orderOf(planOf(campagneEscarmouche({ duree: 9, ennemiHp: 1 }), seed), 'b1')).toEqual(temoin);
    }
  });
});
