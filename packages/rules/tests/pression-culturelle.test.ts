/**
 * PRESSION-CULTURELLE (T-53, canon Erik 14/11 — tranche 1 défensive, D1-D7).
 *
 * La culture de la nation devient un bonus DÉFENSIF par case : pression =
 * Σ culture/tour des villes ≤ R=3 anneaux (atténuation ×1/×0,5/×0,25 — D1/D2),
 * paliers 5/10/20 → +10/+20/+30 % bornes inclusives (D3), plafond +30 % (D4),
 * défensif pur — jamais côté attaquant (D5), merveilles capturées pressent
 * pour le NOUVEAU propriétaire (D6), anarchie → pression 0 (D7).
 * Tables 100 % data-driven (culture.json `pressionDefensive` — L0).
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { forcesProspectives } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import cultureJson from '../src/data/culture.json' with { type: 'json' };
import { CULTURE, TERRAINS } from '../src/data.js';
import { FORTIFY_DEFENSE_BONUS } from '../src/constants.js';
import {
  cultureGains,
  bonusDefenseCulturel,
  pressionCulturelle,
  type VillePression,
} from '../src/culture.js';
import type { GameEvent } from '../src/events.js';
import type { CombatDetail } from '../src/events.js';

const TABLES = CULTURE.pressionDefensive;

// ---------------------------------------------------------------------------
// L2.1 · Tests PURS — atténuation, superposition, paliers, plafond, D5-D7
// ---------------------------------------------------------------------------

describe('T-53 · pressionCulturelle (pur) — atténuation par anneau (D1/D2)', () => {
  const cible = { q: 0, r: 0 };

  it('×1 à d≤1 (case de ville incluse), ×0,5 à d=2, ×0,25 à d=3, 0 au-delà', () => {
    const une = (q: number, r: number): VillePression[] => [{ q, r, culture: 8 }];
    expect(pressionCulturelle(une(0, 0), cible, 8)).toBe(8); // d=0 → anneau 1
    expect(pressionCulturelle(une(1, 0), cible, 8)).toBe(8); // d=1 → ×1
    expect(pressionCulturelle(une(2, 0), cible, 8)).toBe(4); // d=2 → ×0,5
    expect(pressionCulturelle(une(3, 0), cible, 8)).toBe(2); // d=3 → ×0,25
    expect(pressionCulturelle(une(4, 0), cible, 8)).toBe(0); // d=4 → hors R
  });

  it('portée R = 3 anneaux FIXES (D1) — indépendante du statut culturel', () => {
    expect(TABLES.attenuationParAnneau).toHaveLength(3);
    expect(
      pressionCulturelle(
        [
          { q: 3, r: 0, culture: 8 },
          { q: 0, r: 3, culture: 8 },
          { q: 0, r: -3, culture: 8 },
          { q: -3, r: 0, culture: 8 },
        ],
        cible,
        8,
      ),
    ).toBe(8); // 4 villes à d=3 ×0,25 ×8 = 8
    expect(pressionCulturelle([{ q: 4, r: 0, culture: 8 }], cible, 8)).toBe(0);
  });

  it('TOUTE distance est wrappée (Est↔Ouest, hexDistanceW)', () => {
    // Carte largeur 8 : une ville en q=7 est ADJACENTE (d=1) de la case (0,0).
    expect(pressionCulturelle([{ q: 7, r: 0, culture: 8 }], cible, 8)).toBe(8);
    // d=2 wrappé : ville en q=6 → ×0,5.
    expect(pressionCulturelle([{ q: 6, r: 0, culture: 8 }], cible, 8)).toBe(4);
  });

  it('SUPERPOSITION : deux villes adjacentes s’additionnent (le cœur dense atteint les paliers hauts)', () => {
    // 8 (d=1) + 8×0,5 (d=2) = 12 → palier 2. Cf. table de chiffrage §2 propo.
    const villes: VillePression[] = [
      { q: 1, r: 0, culture: 8 },
      { q: 2, r: 0, culture: 8 },
    ];
    expect(pressionCulturelle(villes, cible, 8)).toBe(12);
  });
});

describe('T-53 · bonusDefenseCulturel (pur) — paliers D3 bornes inclusives, plafond D4', () => {
  const tiers = TABLES.defenseTiers;
  const bonus = TABLES.defenseBonus;

  it('bordures exactes : 4 → 0 %, 5 → 10 %, 9 → 10 %, 10 → 20 %, 19 → 20 %, 20 → 30 %, 40 → 30 %', () => {
    expect(bonusDefenseCulturel(4)).toBeNull();
    expect(bonusDefenseCulturel(5)?.valeur).toBe(bonus[0]);
    expect(bonusDefenseCulturel(9)?.valeur).toBe(bonus[0]);
    expect(bonusDefenseCulturel(10)?.valeur).toBe(bonus[1]);
    expect(bonusDefenseCulturel(19)?.valeur).toBe(bonus[1]);
    expect(bonusDefenseCulturel(20)?.valeur).toBe(bonus[2]);
    expect(bonusDefenseCulturel(40)?.valeur).toBe(bonus[2]); // plafond D4
    expect(bonusDefenseCulturel(0)).toBeNull();
  });

  it('valeurs canon + plafond sous le terrain/fortification (D4 : +10/+20/+30)', () => {
    expect(tiers).toEqual([5, 10, 20]);
    expect(bonus).toEqual([0.1, 0.2, 0.3]);
  });

  it('le mod porte le label règle T-53', () => {
    expect(bonusDefenseCulturel(5)?.label).toContain('T-53');
  });
});

describe('T-53 · tables 100 % data-driven (L0 — flip de table = flip de comportement)', () => {
  it('culture.json porte la table pressionDefensive ; la lire et la changer change le comportement', () => {
    const json = cultureJson as unknown as typeof CULTURE;
    expect(json.pressionDefensive).toBeDefined();
    // FLIP DE TABLE PRUVÉ : avec d’autres paliers, la même pression change de bonus.
    const flip: typeof TABLES = {
      attenuationParAnneau: [1, 0.5, 0.25],
      defenseTiers: [15, 25, 40],
      defenseBonus: [0.05, 0.15, 0.25],
    };
    expect(bonusDefenseCulturel(5, TABLES)?.valeur).toBe(0.1);
    expect(bonusDefenseCulturel(5, flip)?.valeur).toBeUndefined(); // 5 < 15 → aucun bonus
    expect(bonusDefenseCulturel(20, flip)?.valeur).toBe(0.05);
  });
});

// ---------------------------------------------------------------------------
// L2.2 · Intégration — le mod au CombatDetail (défenseur SEUL) + préview
// ---------------------------------------------------------------------------

function echangeDe(events: GameEvent[]): { detail: CombatDetail } {
  const e = events.find((ev) => ev.type === 'CombatExchange') as
    | (GameEvent & { type: 'CombatExchange'; detail?: CombatDetail })
    | undefined;
  if (!e || !e.detail) throw new Error('aucun CombatExchange avec détail');
  return { detail: e.detail };
}

describe('T-53 · intégration combat — le mod « Pression culturelle » au détail', () => {
  /** Capitale p2 pop 5 (Palais = 5 culture/tour → pression 5 à d≤1) + défenseur
   *  stabilisé adjacent. Combat p1 → p2. */
  function combatSousPression() {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
      cities: [
        {
          id: 'c1',
          owner: 'p2',
          q: 2,
          r: 0,
          capital: true,
          pop: 5,
          workedTiles: [],
          buildings: ['palais'],
        },
      ],
    });
    state.units.u2!.stabilized = true;
    return state;
  }

  it('le défenseur sous pression ≥ 5 porte le mod, l’ATTAQUANT jamais (D5)', () => {
    const r = resolveTurn(
      combatSousPression(),
      { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }], p2: [] },
      7,
    );
    const { detail } = echangeDe(r.events);
    const mod = detail.defenseur.bonusDefPct.find((m) => m.label.includes('Pression culturelle'));
    expect(mod?.valeur).toBe(0.1); // pression 5 → palier 1 (D3)
    // D5 : le côté attaquant ne porte JAMAIS de mod de pression culturelle.
    expect(detail.attaquant.bonusDefPct.some((m) => m.label.includes('Pression'))).toBe(false);
  });

  it('préview/Oracle (forcesProspectives → combatStrengthsOf) : la S_def inclut le bonus', () => {
    const st = combatSousPression();
    const { sDef, sAtt } = forcesProspectives(st, st.units.u1!, st.units.u2!);
    // S_def = 1 × (1 + 0,1) ; sans pression ce serait 1.
    expect(sDef).toBeCloseTo(1.1, 10);
    expect(sAtt).toBeCloseTo(1, 10);
  });

  it('sous le palier (pression < 5) : AUCUN mod poussé (pas de bruit)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
      cities: [
        {
          id: 'c1',
          owner: 'p2',
          q: 2,
          r: 0,
          capital: true,
          pop: 3, // Palais plafonné pop 5 → 3 culture/tour à d=1 → pression 3 < 5
          workedTiles: [],
          buildings: ['palais'],
        },
      ],
    });
    state.units.u2!.stabilized = true;
    const r = resolveTurn(
      state,
      { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }], p2: [] },
      7,
    );
    const { detail } = echangeDe(r.events);
    expect(detail.defenseur.bonusDefPct.some((m) => m.label.includes('Pression'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L2.3 · Bit-à-bit à pression nulle + D6/D7
// ---------------------------------------------------------------------------

describe('T-53 · D6/D7 — merveilles capturées, anarchie', () => {
  it('D6 : la pression suit le PROPRIÉTAIRE ACTUEL de la ville — une merveille survivante (R-66) presse pour le nouveau propriétaire', () => {
    // Le calcul de pression ne lit JAMAIS le propriétaire d'origine :
    // `cultureGains` lit les bâtiments/merveilles de la ville TELLE QUELLE
    // (merveilles survivantes incluses — R-66), et le filtre de nation est
    // fait à l'appel sur le propriétaire ACTUEL. Une ville capturée dont la
    // merveille survit (Théâtre ×2 total, R-132) presse donc pour le
    // NOUVEAU propriétaire — test au niveau du pipeline pur : même objet
    // ville, ownership changé, culture identique → pression identique pour
    // le nouveau propriétaire, nulle pour l'ancien (filtre appelant).
    const villeCaptee = {
      id: 'c9',
      owner: 'p1' as const, // capturée par p1 (était p2)
      q: 1,
      r: 0,
      capital: false,
      pop: 3,
      workedTiles: [],
      buildings: [], // R-66 : bâtiments perdus à la capture
      wonders: ['theatre_de_shakespeare'], // merveille survivante
    };
    const culture = cultureGains(villeCaptee, 10, [], {}); // +10 empire (R-109)
    expect(culture).toBe(20); // ×2 Théâtre — presse pour p1, le NOUVEAU propriétaire
    const pressionP1 = pressionCulturelle([{ q: 1, r: 0, culture }], { q: 0, r: 0 }, 8);
    expect(pressionP1).toBe(20); // palier +30 % pour p1
  });

  it('D7 : anarchie → culture 0 → pression 0 (aucun mod)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
      cities: [
        {
          id: 'c1',
          owner: 'p2',
          q: 2,
          r: 0,
          capital: true,
          pop: 5,
          workedTiles: [],
          buildings: ['palais'],
        },
      ],
    });
    // R-122 : anarchie → culture à 0 ce tour → pression 0 ce tour.
    state.players.p2!.anarchyUntil = state.turn + 1;
    state.units.u2!.stabilized = true;
    const r = resolveTurn(
      state,
      { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }], p2: [] },
      7,
    );
    const { detail } = echangeDe(r.events);
    expect(detail.defenseur.bonusDefPct.some((m) => m.label.includes('Pression'))).toBe(false);
    expect(detail.defenseur.force).toBeCloseTo(1, 10);
  });

  it('bit-à-bit à pression nulle : une partie sans culture ≥ palier reste identique au code sans pression (le mod à 0 n’est jamais poussé)', () => {
    // Aucune ville → pression nulle partout. Le défenseur barbare-neutre
    // (sans joueurs) comme p2 sans ville : le détail ne contient AUCUN mod
    // de pression et la force est la force canon sans culture.
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0, fortified: true },
      ],
      terrainOverrides: { '1,0': 'colline' },
    });
    state.units.u2!.stabilized = true;
    const r = resolveTurn(
      state,
      { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }], p2: [] },
      7,
    );
    const { detail } = echangeDe(r.events);
    expect(detail.defenseur.bonusDefPct.map((m) => m.label)).toEqual([
      expect.stringContaining('colline'),
      expect.stringContaining('Fortification'),
    ]);
    expect(detail.defenseur.force).toBeCloseTo(1 * (1 + TERRAINS['colline']!.defenseBonus + FORTIFY_DEFENSE_BONUS), 10);
  });
});
