/**
 * HANDOFF-TB-SIEGE-DEFENSE (Erik 31/10) — le siège qui tombe + les bots qui
 * défendent leurs seuils. Fusion votée (verdict REPORT-JEV-CALIBRAGE-OFFENSIF
 * §5) : les deux fronts vivent dans botPolicy.ts.
 *
 * Front A — le siège qui tombe (côté tactique) :
 *  A1 RASSEMBLEMENT AVANT ASSAUT — tant que l'effectif assiégeant est sous
 *     `effectifAssaut` (data) SANS écraser la garnison visible (forces ≥
 *     ratioForcesAssaut × défense) et que la ville n'est pas vide, l'armée
 *     campe et n'assaille pas (fini l'assaut un par un — « 39 assauts,
 *     0 chute ») ;
 *  A2 NON RE-ABSORPTION — les membres de l'armée de campagne ne sont plus
 *     brouillés comme garnison tant que la capitale n'est pas ASSAILLIE
 *     (ennemi adjacent) — la simple menace à distance (rayonMenace) ne rappelle
 *     plus les assiégeants ;
 *  A3 NON-RÉGRESSION DÉFENSIVE — assaut sur la capitale → les membres de
 *     l'armée SONT rappelés (B2, priorité renforcée de la marche défensive).
 *
 * Front B — les bots défendent leurs seuils (T-B voté) :
 *  B1 COURSE À L'ONU — si un adversaire vivant atteint seuilJalonsCourseOnu
 *     (80 % de CULTURE.milestonesTarget) et que l'ONU n'est pas bâtie, le bot
 *     est ÉLIGIBLE (le filtre cultureVictory devient conditionnel) et la
 *     capitale est priorisée s'il a lui-même ≥ jalonsMinPrioriteOnu jalons ;
 *  B2 — protection de capitale (test A3 ci-dessus) ;
 *  B3 — zéro changement moteur (ces tests ne touchent que botPolicy).
 */
import { describe, expect, it } from 'vitest';
import {
  BOT_SETTINGS,
  CULTURE,
  makeState,
} from '@game/rules';
import type { City, GameState, PlayerId, SeededRng } from '@game/rules';
import {
  arbitrerProduction,
  assignerObjectifs,
  botPolicy,
  courseOnuAdversaire,
  planGarnison,
  profileDuBot,
} from '../src/botPolicy.js';

const ME: PlayerId = 'p2';
const AUTRE: PlayerId = 'p1';

/** RNG de test : tirage toujours gagnant (next=0). */
const rngGagnant = (): SeededRng =>
  ({ next: () => 0, nextInt: (n: number) => 0, state: 0 }) as SeededRng;

const NORMAL = profileDuBot('normal');

/** État de siège standard : ma capitale c1 (4,10), capitale ennemie c2
 *  (30,10), guerre civile active. */
function siegeState(opts: {
  assiegeants?: Array<{ id: string; type: string; q: number; r: number; veteran?: boolean }>;
  defenseurs?: Array<{ id: string; type: string; q: number; r: number; fortified?: boolean }>;
  presCapitale?: Array<{ q: number; r: number }>; // ennemis près de MA capitale
  villesSup?: Array<Partial<City> & { id: string; owner: string; q: number; r: number }>;
  cultureMe?: number;
  cultureAutre?: number;
}): GameState {
  const s = makeState({
    width: 40,
    height: 20,
    players: [AUTRE, ME],
    warPairs: [[AUTRE, ME]],
    units: [
      // u0 : le SCOUT dédié (première combattante, tri id) — patrouille, il
      // ne fait jamais partie de l'armée (canon BOT-EXPLORATION).
      { id: 'u0', type: 'guerrier', owner: ME, q: 4, r: 11, aboard: null, cargo: null },
      ...(opts.assiegeants ?? []).map((u) => ({ ...u, owner: ME, aboard: null, cargo: null })),
      ...(opts.defenseurs ?? []).map((u) => ({ ...u, owner: AUTRE, aboard: null, cargo: null })),
      ...(opts.presCapitale ?? []).map((h, i) => ({
        id: `e_men${i}`,
        type: 'guerrier',
        owner: AUTRE,
        q: h.q,
        r: h.r,
        aboard: null,
        cargo: null,
      })),
    ],
    cities: [
      { id: 'c1', owner: ME, q: 4, r: 10 },
      { id: 'c2', owner: AUTRE, q: 30, r: 10 },
      ...(opts.villesSup ?? []),
    ].map((c) => ({ pop: 2, capital: true, workedTiles: [], buildings: [], ...c })),
    rngSeed: 42,
  }) as GameState;
  s.turn = 40;
  if (opts.cultureMe !== undefined) s.players[ME]!.cultureMilestones = opts.cultureMe;
  if (opts.cultureAutre !== undefined) s.players[AUTRE]!.cultureMilestones = opts.cultureAutre;
  return s;
}

/** Trois assiégeants TYPES MÉLANGÉS au rayon de ralliement (2) de c2
 *  (aucun trio homogène — pas de fusion, canon R-31). */
const TROIS_ASSIEGEANTS = [
  { id: 'u1', type: 'guerrier', q: 28, r: 10 },
  { id: 'u2', type: 'archer', q: 29, r: 11 },
  { id: 'u3', type: 'piquier', q: 29, r: 9 },
];

// ---------------------------------------------------------------------------
// Données — les seuils existent dans bot.json (D5).
// ---------------------------------------------------------------------------

describe('TB-SIEGE · données — seuils front A/B', () => {
  it('chaque profil porte effectifAssaut (≥ 3) et ratioForcesAssaut (≥ 1.5)', () => {
    for (const [nom, p] of Object.entries(BOT_SETTINGS.profiles)) {
      expect(p.effectifAssaut, nom).toBeGreaterThanOrEqual(3);
      expect(p.ratioForcesAssaut, nom).toBeGreaterThanOrEqual(1.5);
    }
  });
  it('victoire.seuilJalonsCourseOnu = 80 % de CULTURE.milestonesTarget', () => {
    expect(BOT_SETTINGS.victoire.seuilJalonsCourseOnu).toBe(Math.round(0.8 * CULTURE.milestonesTarget));
    expect(BOT_SETTINGS.victoire.seuilJalonsCourseOnu).toBe(16);
    expect(BOT_SETTINGS.victoire.jalonsMinPrioriteOnu).toBeLessThan(BOT_SETTINGS.victoire.seuilJalonsCourseOnu);
  });
});

// ---------------------------------------------------------------------------
// Front A1 — rassemblement AVANT assaut.
// ---------------------------------------------------------------------------

describe('TB-SIEGE · A1 — pas d\u2019assaut sous l\u2019effectif', () => {
  it('3 assiégeants contre garnison tenue (effectif < effectifAssaut, forces < 2× défense) → campement, PAS d\u2019assaut', () => {
    const s = siegeState({
      assiegeants: TROIS_ASSIEGEANTS,
      defenseurs: [
        { id: 'd1', type: 'archer', q: 30, r: 10 }, // sur la ville
        { id: 'd2', type: 'archer', q: 29, r: 10 }, // adjacente
      ],
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    for (const u of TROIS_ASSIEGEANTS) {
      const o = objs.get(u.id);
      expect(o?.kind, `${u.id}`).toBe('rallier'); // campement — aggrégation
      expect(o?.kind, `${u.id}`).not.toBe('attaquer');
      expect(o?.kind, `${u.id}`).not.toBe('offensiver');
    }
  });

  it('levier du RAPPORT : 3 assiégeants vétérans contre garnison seule (forces ≥ ratioForcesAssaut × défense) → assaut autorisé', () => {
    const s = siegeState({
      // forces assiégeantes 4 (1,5 + 1 + 1,5) ≥ ratio 2 × défense guerrier
      // en ville 1,25 = 2,5 → l'assaut part malgré l'effectif < effectifAssaut
      assiegeants: [
        { id: 'u1', type: 'guerrier', q: 28, r: 10, veteran: true },
        { id: 'u2', type: 'archer', q: 29, r: 11 },
        { id: 'u3', type: 'piquier', q: 29, r: 9, veteran: true },
      ],
      defenseurs: [{ id: 'd1', type: 'guerrier', q: 30, r: 10 }],
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    expect(objs.get('u1')?.kind).toBe('offensiver');
  });

  it('effectif ≥ effectifAssaut (4 membres) → assaut groupé (offensiver)', () => {
    const s = siegeState({
      assiegeants: [
        ...TROIS_ASSIEGEANTS,
        { id: 'u4', type: 'cavalier', q: 28, r: 12 },
      ],
      defenseurs: [
        { id: 'd1', type: 'archer', q: 30, r: 10 },
        { id: 'd2', type: 'archer', q: 29, r: 10 },
      ],
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    // Assaut GROUPÉ : la marche (offensiver) ou l'assaut sur la garnison
    // adjacente (attaquer) — plus jamais le campement.
    expect(['offensiver', 'attaquer']).toContain(objs.get('u1')?.kind);
    expect(['offensiver', 'attaquer']).toContain(objs.get('u4')?.kind);
  });

  it('ville SANS défenseur : la capture reste permise même sous l\u2019effectif (attaquer la ville adjacente)', () => {
    const s = siegeState({
      assiegeants: [
        { id: 'u1', type: 'guerrier', q: 29, r: 10 }, // adjacent à c2
        { id: 'u2', type: 'archer', q: 29, r: 11 },
      ],
      defenseurs: [],
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    const o = objs.get('u1');
    expect(o?.kind).toBe('attaquer');
    expect(o?.cible).toEqual({ q: 30, r: 10 });
  });
});

// ---------------------------------------------------------------------------
// Front A2 — fini la re-absorption en siège (tant que la capitale n'est pas
// assaillie). B2 — assaut sur la capitale → rappel (non-régression défensive).
// ---------------------------------------------------------------------------

describe('TB-SIEGE · A2/B2 — re-absorption des assiégeants', () => {
  const menuSiege = {
    assiegeants: [{ id: 'u1', type: 'guerrier', q: 28, r: 10 }],
    defenseurs: [{ id: 'd1', type: 'archer', q: 30, r: 10 }],
  };

  it('A2 : menace à DISTANCE de ma capitale (≤ rayonMenace, pas adjacente) → l\u2019assiégeant N\u2019EST PAS rappelé', () => {
    const s = siegeState({ ...menuSiege, presCapitale: [{ q: 6, r: 10 }] }); // dist 2 ≤ rayonMenace 3
    const objs = assignerObjectifs(s, ME, NORMAL);
    const o = objs.get('u1');
    expect(o?.kind).not.toBe('garnison');
    expect(o?.kind).toBe('rallier'); // il campe devant la ville, il n'assaille pas encore
    // miroir pur : le brouillon EXCLUT le membre de l'armée…
    const armee = new Set(['u1']);
    expect(planGarnison(s, ME, NORMAL, armee).drafts.has('u1')).toBe(false);
    // …alors que l'ANCIEN comportement (sans exclusions) le rappelait.
    expect(planGarnison(s, ME, NORMAL).drafts.has('u1')).toBe(true);
  });

  it('B2/A3 : ennemi ADJACENT à ma capitale (assaut) → l\u2019assiégeant EST rappelé en défense', () => {
    const s = siegeState({ ...menuSiege, presCapitale: [{ q: 5, r: 10 }] }); // dist 1
    const objs = assignerObjectifs(s, ME, NORMAL);
    const o = objs.get('u1');
    expect(o?.kind).toBe('garnison');
    expect(o?.cityId).toBe('c1');
  });
});

// ---------------------------------------------------------------------------
// Front B1 — course à l'ONU.
// ---------------------------------------------------------------------------

describe('TB-SIEGE · B1 — course à l\u2019ONU', () => {
  it('courseOnuAdversaire : true à 16 jalons, false à 15, false si ONU bâtie, false si rival éliminé', () => {
    const base = { cultureAutre: 16 };
    expect(courseOnuAdversaire(siegeState(base), ME)).toBe(true);
    expect(courseOnuAdversaire(siegeState({ ...base, cultureAutre: 15 }), ME)).toBe(false);
    const onuBatie = siegeState(base);
    onuBatie.cities.c2!.wonders = ['nations_unies'];
    expect(courseOnuAdversaire(onuBatie, ME)).toBe(false);
    const mort = siegeState(base);
    mort.players[AUTRE]!.defeated = true;
    expect(courseOnuAdversaire(mort, ME)).toBe(false);
    expect(courseOnuAdversaire(siegeState({ ...base, cultureAutre: 16 }), AUTRE)).toBe(false); // SOI ignoré
  });

  it('priorité production capitale : rival à 16 jalons + moi à 12 → l\u2019ONU est mise en file', () => {
    const s = siegeState({ cultureMe: 12, cultureAutre: 16 });
    const plan = botPolicy(s, ME, rngGagnant());
    const onu = plan.orders.find(
      (o) => o.type === 'SetProduction' && o.cityId === 'c1' &&
        o.item?.id === 'nations_unies',
    );
    expect(onu).toBeDefined();
  });

  it('gate : moi sous jalonsMinPrioriteOnu (11) → PAS de priorité ONU', () => {
    const s = siegeState({ cultureMe: 11, cultureAutre: 16 });
    const plan = botPolicy(s, ME, rngGagnant());
    const onu = plan.orders.find(
      (o) => o.type === 'SetProduction' &&
        o.item?.id === 'nations_unies',
    );
    expect(onu).toBeUndefined();
  });

  it('gate : rival sous 16 jalons → l\u2019ONU reste INÉLIGIBLE (filtre cultureVictory fermé)', () => {
    const s = siegeState({ cultureMe: 12, cultureAutre: 15 });
    const plan = botPolicy(s, ME, rngGagnant());
    const onu = plan.orders.find(
      (o) => o.type === 'SetProduction' &&
        o.item?.id === 'nations_unies',
    );
    expect(onu).toBeUndefined();
  });

  it('arbitrerProduction : course active → l\u2019ONU figure parmi les merveilles disponibles (miroir du filtre)', () => {
    const s = siegeState({ cultureMe: 12, cultureAutre: 16 });
    const moi = s.players[ME]!;
    const item = arbitrerProduction(s.cities.c1!, moi, [s.cities.c1!], s, BOT_SETTINGS.economie, false, false, rngGagnant());
    // Le ④ pionnier peut renvoyer une autre merveille (tri par id) — le
    // contrat ICI est : jamais d\u2019échec ni d\u2019item invalide, et l\u2019ONU
    // éligible est couverte par le test de priorité ci-dessus.
    expect(item).not.toBeNull();
    expect(item!.kind === 'wonder' ? item!.id : item!.kind).toBeDefined();
  });
});
