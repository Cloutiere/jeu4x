/**
 * Tests EXPANSION-CULTURELLE — phase 1 (décisions d'Erik du 13/09,
 * HANDOFF-EXPANSION-CULTURELLE.md).
 *
 * M1 — R-113 rév. : le Palais produit `min(pop, cap)` culture par tour
 *     (cap data-driven, défaut 5 — capitale uniquement). Interactions
 *     verrouillées : Monarchie ×2 la part Palais (pas les Temples) ;
 *     Communisme annule Temples/Cathédrales mais PAS le Palais ; Stonehenge
 *     multiplie la part Temples/Cathédrales mais PAS le Palais ; Magna Carta
 *     (Tribunal +1/citoyen) et Théâtre (×2 total) inchangés ; Temple/
 *     Cathédrale restent NON plafonnés.
 * M2 — `city.cultureCumulee` : compteur cumulatif JAMAIS consommé
 *     (indépendant du canal GP `cultureStored`) + fonction pure
 *     `rayonCulturelDe` (seuils 10/100/1 000/10 000, plafond 5 — data-driven
 *     culture.json ; PHASE 1 VISUAL-ONLY, aucun consommateur gameplay) +
 *     migration schemaVersion 19 → 20 (champ additif, backfill 0, idempotent).
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { CURRENT_SCHEMA_VERSION, migrateState } from '../src/state.js';
import type { GameState } from '../src/state.js';
import { makeState } from '../src/fixtures.js';
import { BUILDINGS, CULTURE } from '../src/data.js';
import { cultureGains, rayonCulturelDe, frontierRadius } from '../src/culture.js';
import { workRadiusOf } from '../src/economy.js';

/** Capitale p1 pop 4 avec 4 citoyens assignés (prairies) — le Palais est posé
 *  comme le fait le moteur dans toute capitale (miroir culture.test.ts). */
function capitalCity(buildings: string[] = []): GameState {
  return makeState({
    cities: [{
      id: 'c1',
      owner: 'p1',
      q: 0,
      r: 0,
      capital: true,
      pop: 4,
      workedTiles: ['1,0', '0,1', '0,2', '1,2'],
      buildings: ['palais', ...buildings],
    }],
  });
}

describe('M1 · R-113 rév. — le Palais révisé : min(pop, cap) culture par tour', () => {
  it('données : le Palais porte culturePerCitizenCap {perCitizen: 1, cap: 5} — plus de culturePerTurn flat', () => {
    expect(BUILDINGS['palais']!.culturePerCitizenCap).toEqual({ perCitizen: 1, cap: 5 });
    expect('culturePerTurn' in BUILDINGS['palais']!).toBe(false);
  });

  it('part Palais = min(pop, cap) : 1→1, 2→2, 5→5, 6→5 (plafonné), 20→5 (cap data-driven, défaut 5)', () => {
    expect(cultureGains({ pop: 1, buildings: ['palais'], capital: true, wonders: [] })).toBe(1);
    expect(cultureGains({ pop: 2, buildings: ['palais'], capital: true, wonders: [] })).toBe(2);
    expect(cultureGains({ pop: 5, buildings: ['palais'], capital: true, wonders: [] })).toBe(5);
    expect(cultureGains({ pop: 6, buildings: ['palais'], capital: true, wonders: [] })).toBe(5);
    expect(cultureGains({ pop: 20, buildings: ['palais'], capital: true, wonders: [] })).toBe(5);
  });

  it('Monarchie ×2 s’applique à la part PALAIS (pas aux Temples) — R-121 inchangée dans son principe', () => {
    const city = { pop: 6, buildings: ['palais', 'temple'], capital: true, wonders: [] };
    // Sans Monarchie : Palais 5 (cap) + Temple 6 = 11.
    expect(cultureGains(city)).toBe(11);
    // ×2 sur la part Palais SEULE : 5×2 + 6 = 16 (le Temple n'est pas doublé).
    expect(cultureGains(city, 0, [], { palaceCultureMult: 2 })).toBe(16);
  });

  it('Communisme annule Temples/Cathédrales mais PAS le Palais (part plafonnée conservée)', () => {
    const city = { pop: 6, buildings: ['palais', 'temple'], capital: true, wonders: [] };
    expect(cultureGains(city, 0, [], { zeroTempleCulture: true })).toBe(5);
    expect(cultureGains(city, 0, [], { zeroTempleCulture: true, palaceCultureMult: 2 })).toBe(10);
  });

  it('Stonehenge multiplie la part Temples/Cathédrales mais PAS le Palais', () => {
    // Palais 4 (pop 4 < cap, non multiplié) + Temple 4 × 1,5 = 6 → 10.
    expect(cultureGains({ pop: 4, buildings: ['palais', 'temple'], capital: true, wonders: ['stonehenge'] })).toBe(10);
    // Cathédrale pop 6 : Palais 5 + 6×2×1,5 = 18 → 23.
    expect(cultureGains({ pop: 6, buildings: ['palais', 'cathedrale'], capital: true, wonders: ['stonehenge'] })).toBe(23);
  });

  it('Magna Carta (Tribunal +1/citoyen) et Théâtre (×2 total) inchangés face au Palais plafonné', () => {
    // Palais 5 (cap — le plafond du Palais ne borne pas la merveille) + Tribunal 1×6 = 11.
    expect(cultureGains({ pop: 6, buildings: ['palais', 'tribunal'], capital: true, wonders: ['magna_carta'] })).toBe(11);
    // (Palais 5 + Temple 6) × 2 = 22.
    expect(cultureGains({ pop: 6, buildings: ['palais', 'temple'], capital: true, wonders: ['theatre_de_shakespeare'] })).toBe(22);
  });

  it('Temple/Cathédrale restent NON plafonnés (20 pop × Cathédrale = 40 — exemple du doc d’Erik)', () => {
    expect(cultureGains({ pop: 20, buildings: ['cathedrale'], capital: false, wonders: [] })).toBe(40);
  });

  it('moteur : capitale pop 2 génère 2 culture/tour (contre 1 avant révision) — voir consigne pacing GP au rapport', () => {
    const state = capitalCity();
    state.cities['c1']!.pop = 2;
    state.cities['c1']!.workedTiles = ['1,0', '0,1'];
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.cities['c1']!.cultureCumulee).toBe(2);
  });
});

describe('M2 · city.cultureCumulee — compteur cumulatif JAMAIS consommé (GP-CULTURE-EVENEMENTS · D1/D5)', () => {
  it('chaque tour additionne les mêmes gains au cumul (plus aucun réservoir — D5)', () => {
    let state = capitalCity();
    state = resolveTurn(state, {}, 1).newState;
    expect(state.cities['c1']!.cultureCumulee).toBe(4); // Palais pop 4 : 4/tour
    state = resolveTurn(state, {}, 2).newState;
    expect(state.cities['c1']!.cultureCumulee).toBe(8);
  });

  it('le canal GP lit le cumul EMPIRE contre les paliers T-27, JAMAIS soustrait (D1)', () => {
    const state = capitalCity();
    state.cities['c1']!.cultureCumulee = 149; // franchit 150 ce tour (gain 4)
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.players['p1']!.culturePaliers).toBe(1); // palier franchi (D6)
    expect(newState.cities['c1']!.cultureCumulee).toBe(153); // 149 + 4 — cumul intégral conservé
  });

  it('Anarchie (R-122) : l’accumulation S’ARRÊTE', () => {
    const anarchie = capitalCity();
    anarchie.players['p1']!.anarchyUntil = anarchie.turn + 1;
    const out = resolveTurn(anarchie, {}, 42).newState;
    expect(out.cities['c1']!.cultureCumulee).toBe(0); // gelé (gains nuls)
    const temoin = resolveTurn(capitalCity(), {}, 42).newState;
    expect(temoin.cities['c1']!.cultureCumulee).toBeGreaterThan(0);
  });
});

describe('M2 · rayonCulturelDe — seuils 10/100/1 000/10 000, plafond 5 (data-driven, visual-only)', () => {
  it('table par défaut (culture.json) : un anneau par seuil franchi, 0 au départ', () => {
    expect(CULTURE.cultureExpansionThresholds).toEqual([10, 100, 1000, 10000]);
    expect(CULTURE.cultureExpansionMaxRings).toBe(5);
    expect(rayonCulturelDe(0)).toBe(0);
    expect(rayonCulturelDe(9)).toBe(0); // juste sous le 1er seuil
    expect(rayonCulturelDe(10)).toBe(1);
    expect(rayonCulturelDe(99)).toBe(1);
    expect(rayonCulturelDe(100)).toBe(2);
    expect(rayonCulturelDe(999)).toBe(2);
    expect(rayonCulturelDe(1000)).toBe(3);
    expect(rayonCulturelDe(9999)).toBe(3);
    expect(rayonCulturelDe(10000)).toBe(4);
    expect(rayonCulturelDe(1_000_000_000)).toBe(4); // table épuisée : 4 anneaux, le plafond n'est pas lié
  });

  it('plafond data-driven : lié seulement si la table dépasse maxRings', () => {
    expect(rayonCulturelDe(100000, [10, 100, 1000, 10000, 100000], 5)).toBe(5);
    expect(rayonCulturelDe(999_999_999, [10, 100, 1000, 10000, 100000], 5)).toBe(5); // cap 5
    expect(rayonCulturelDe(10000, [10, 100, 1000, 10000], 2)).toBe(2); // cap sous la table
    expect(rayonCulturelDe(1000, [10, 100, 1000, 10000], 0)).toBe(0);
  });

  it('fonction pure, défensive : aucun état lu, entrée négative → 0', () => {
    expect(rayonCulturelDe(10, [10, 100, 1000, 10000], 5)).toBe(1);
    expect(rayonCulturelDe(-5)).toBe(0);
    expect(rayonCulturelDe(1000, [], 5)).toBe(0);
  });

  it('ZÉRO consommateur gameplay en phase 1 : le rayon culturel n’étend PAS le rayon de travail', () => {
    // Garde-fou structurel : workRadiusOf lit les bâtiments (Tribunal), jamais
    // la culture cumulée — les tuiles travaillables restent bornées au rayon
    // actuel (M2.3 du handoff : tileWorkable/worked tiles intouchés).
    expect(workRadiusOf(['palais', 'tribunal'])).toBe(2);
    expect(rayonCulturelDe(1_000_000)).toBe(4); // n'y change rien
  });
});

describe('CULTURE-FRONTIERES · frontierRadius — progression palier après palier (révision Erik 14/09)', () => {
  it('palier 0/1/2/3 : le 1er palier ne pousse PAS la frontière, chaque palier suivant +1', () => {
    expect(frontierRadius(1, 0)).toBe(1); // palier 0 : pas de frontière dessinée (rendu), rayon = zone de travail
    expect(frontierRadius(1, 1)).toBe(1); // palier 1 : frontière = zone cultivée seule, jamais rayon 2
    expect(frontierRadius(1, 2)).toBe(2); // palier 2 : bande à 1 case au-delà
    expect(frontierRadius(1, 3)).toBe(3);
    expect(frontierRadius(1, 5)).toBe(5); // plafond 5 anneaux
  });

  it('Tribunal (rayon 2) au palier 1 : frontière à rayon 2 = sa zone, pas plus', () => {
    expect(workRadiusOf(['palais', 'tribunal'])).toBe(2);
    expect(frontierRadius(2, 1)).toBe(2);
    expect(frontierRadius(2, 2)).toBe(3);
  });

  it('palier 0 négatif / entrées défensives', () => {
    expect(frontierRadius(2, -1)).toBe(2);
    expect(frontierRadius(0, 1)).toBe(0);
  });
});

describe('M2 · Migration schemaVersion 19 → 20 (champ additif cultureCumulee)', () => {
  it('CURRENT_SCHEMA_VERSION = 25 ; backfill 0 idempotent, valeurs existantes conservées', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(26); // RETRAIT-GP-ACCUMULATEURS : gpAccum* supprimés (migration 23)
    const v19 = {
      schemaVersion: 19,
      turn: 7,
      map: {},
      players: {
        p1: { id: 'p1', treasury: 5, techsUnlocked: [], scienceProgress: {}, vision: { explored: [], visible: [] }, missedTurns: 0 },
      },
      units: {},
      cities: {
        c1: {
          id: 'c1', q: 0, r: 0, owner: 'p1', pop: 2, capital: true, foodStored: 0, production: null,
          workedTiles: [], buildings: ['palais'], conversion: 'gold', cultureStored: 12, wonders: [],
          pendingSalvage: 0,
          settledGreatPersons: [], wasCaptured: false,
        },
      },
      firstBy: {},
      diplomacy: { war: [] },
      settings: { turnTimerMinutes: null },
    };
    const out = migrateState(v19 as unknown as Record<string, unknown>) as unknown as GameState;
    expect(out.schemaVersion).toBe(26);
    expect(out.cities['c1']!.cultureCumulee).toBe(0); // backfill neutre (pas d'enrichissement rétroactif)
    expect((out.cities['c1'] as unknown as Record<string, unknown>)['cultureStored']).toBeUndefined(); // D5 : réservoir supprimé par la migration 22
    // Idempotent : un état déjà migré repasse sans variation.
    expect(migrateState(structuredClone(out) as unknown as Record<string, unknown>)).toEqual(out);
  });

  it('une partie 19 reprise et résolue : le cumul démarre et n’affecte rien d’autre (parties rejouées inchangées par ailleurs)', () => {
    // État v20 fabriqué par la fixture, DÉGRADÉ en v19 sans le champ (miroir
    // d'une vraie partie pré-chantier), puis re-migré et résolu.
    const base = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: [], buildings: ['palais'] }],
    });
    const v19 = structuredClone(base) as unknown as Record<string, unknown>;
    v19.schemaVersion = 19;
    delete (v19.cities as Record<string, Record<string, unknown>>)['c1']!.cultureCumulee;
    const migrated = migrateState(v19) as unknown as GameState;
    expect(migrated.schemaVersion).toBe(26);
    expect(migrated.cities['c1']!.cultureCumulee).toBe(0); // backfill neutre
    const out = resolveTurn(migrated, {}, 8).newState;
    expect(out.cities['c1']!.cultureCumulee).toBe(2); // Palais pop 2 révisé : 2/tour
  });
});
