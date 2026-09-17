/**
 * Tests GP-CULTURE-EVENEMENTS (décisions d'Erik du 13/09 — handoff dédié).
 *
 * Le nouveau modèle culture/GP/jalons :
 *  - D1 : le canal GP lit le CUMUL EMPIRE (Σ city.cultureCumulee) contre la
 *    table T-27 indexée par `player.culturePaliers` — la culture n'est JAMAIS
 *    soustraite ;
 *  - D2 : classe du GP = tirage UNIFORME SEEDÉ parmi les figures disponibles
 *    (repli rotation R-80 pool vide) — le ciblage technologique R-127 est
 *    ABROGÉ ;
 *  - D3 : le GP apparaît dans la ville la plus cultivée (tie-break cityId) ;
 *  - D4 : les GP d'autres voies (or, techs, Confucius, merveilles) ne
 *    décalent JAMAIS le prochain palier ;
 *  - D5 : `cultureStored` supprimé — migration schemaVersion 21 → 22 ;
 *  - D6 : UN palier T-27 franchi = +1 jalon (reason 'cultureLevel') ET 1 GP,
 *    jalon émis PUIS GP spawné ;
 *  - D7 : les GP (obtention, installation, consommation, vol) ne touchent
 *    JAMAIS `cultureMilestones` (R-126 abrogée) ;
 *  - ONU : déblocage à 20 jalons inchangé, suspension par perte de merveille
 *    seulement.
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../src/state.js';
import type { GameState } from '../src/state.js';
import { makeState } from '../src/fixtures.js';
import { compareCityIds } from '../src/state.js';
import { cultureEmpireOf, greatPersonThresholdFor, villeLaPlusCultivee, GP_CULTURE_SEED_SALT, greatPersonClassTire } from '../src/culture.js';
import { createRng } from '../src/rng.js';
import { unitType } from '../src/data.js';

/** Deux villes p1 (capitale c1 pop 4 — 8 culture/tour ; c2 pop 2 réglable). */
function twoCityState(): GameState {
  const state = makeState({
    cities: [
      { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 4, workedTiles: ['1,0', '0,1', '0,2', '1,2'], buildings: ['palais', 'temple'] },
      { id: 'c2', owner: 'p1', q: 5, r: 5, capital: false, pop: 2, workedTiles: [], buildings: [] },
    ],
  });
  return state;
}

const greatPersonUnits = (state: GameState) =>
  Object.values(state.units).filter((u) => unitType(u.type).greatPerson);

describe('GP-CULTURE-EVENEMENTS · D1 — cumul EMPIRE, paliers successifs, jamais soustraite', () => {
  it('le cumul est la SOMME des villes ; deux villes à 8+2 culture/tour franchissent le 1er palier ensemble', () => {
    const state = twoCityState();
    state.cities['c2']!.buildings = ['temple']; // 2 + 2 (Palais absent) = 2 culture/tour
    expect(cultureEmpireOf(state.cities, 'p1')).toBe(0);
    // 8 (c1) + 2 (c2) = 10/tour : cumul 141 + un tour = 151 ≥ 150 → palier 1.
    state.cities['c1']!.cultureCumulee = 141;
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.players['p1']!.culturePaliers).toBe(1);
    expect(newState.players['p1']!.cultureMilestones).toBe(1);
    expect(greatPersonUnits(newState)).toHaveLength(1);
    expect(cultureEmpireOf(newState.cities, 'p1')).toBe(151); // JAMAIS soustraite
  });

  it('paliers SUCCESSIFS : le 2e GP demande 267 de cumul total (pas 150 de plus)', () => {
    let state = twoCityState();
    state.cities['c2']!.buildings = ['temple']; // 10/tour
    state.players['p1']!.culturePaliers = 1; // 1er palier déjà franchi
    state.cities['c1']!.cultureCumulee = 259; // 259 + 8 = 267 ≥ 267 ce tour
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.players['p1']!.culturePaliers).toBe(2);
    expect(greatPersonUnits(newState)).toHaveLength(1);
  });
});

describe('GP-CULTURE-EVENEMENTS · D3 — ville la plus cultivée (tie-break cityId)', () => {
  it('le GP apparaît dans la ville au plus fort cumul ; égalité ⇒ cityId croissant (R-81)', () => {
    // c2 la plus cultivée : le GP y apparaît (case libre).
    expect(villeLaPlusCultivee({ c1: { owner: 'p1', cultureCumulee: 100 }, c2: { owner: 'p1', cultureCumulee: 200 } }, 'p1')).toBe('c2');
    // Égalité : c1 (cityId croissant).
    expect(villeLaPlusCultivee({ c1: { owner: 'p1', cultureCumulee: 100 }, c2: { owner: 'p1', cultureCumulee: 100 } }, 'p1')).toBe('c1');
    // Les villes ENNEMIES sont ignorées ; aucune ville ⇒ null.
    expect(villeLaPlusCultivee({ c1: { owner: 'p2', cultureCumulee: 100 } }, 'p1')).toBeNull();
    // Moteur : cumuls 149 (c1) et 200 (c2) → le GP du palier spawn en c2.
    const state = twoCityState();
    state.cities['c1']!.cultureCumulee = 149;
    state.cities['c2']!.cultureCumulee = 200;
    const { newState } = resolveTurn(state, {}, 1);
    const gp = greatPersonUnits(newState)[0]!;
    expect(gp.q).toBe(5);
    expect(gp.r).toBe(5);
  });
});

describe('GP-CULTURE-EVENEMENTS · D4 — les autres voies de GP ne décalent JAMAIS le palier', () => {
  it('un GP du canal OR (palier économie) n\'avance pas l\'index de palier culturel', () => {
    const state = makeState({
      cities: [{ owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: [], buildings: ['palais'] }],
    });
    // Simule un GP obtenu par le canal or (escalade compteurs uniquement).
    state.players['p1']!.greatPersonsObtained = 3;
    state.players['p1']!.greatPersonsByType = { explorateur: 3 };
    state.players['p1']!.culturePaliers = 0;
    state.cities['c1']!.cultureCumulee = 149; // franchit 150 ce tour (1 culture/tour → 150)
    const { newState } = resolveTurn(state, {}, 1);
    // Le palier est indexé sur culturePaliers (0 → 1), PAS sur greatPersonsObtained (3 → 4).
    expect(newState.players['p1']!.culturePaliers).toBe(1);
    expect(greatPersonThresholdFor(1)).toBe(267); // le PROCHAIN palier est bien le 2e de la table
  });

  it('des compteurs de GP élevés (techs/Confucius/merveilles) ne déclenchent AUCUN palier sans culture', () => {
    const state = makeState({
      cities: [{ owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: [], buildings: ['palais'], wonders: ['stonehenge'] }],
    });
    state.players['p1']!.greatPersonsObtained = 10;
    state.players['p1']!.greatPersonsByType = { savant: 10 };
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.players['p1']!.culturePaliers).toBe(0); // 1 culture/tour < 150
    expect(newState.players['p1']!.cultureMilestones).toBe(0);
  });
});

describe('GP-CULTURE-EVENEMENTS · D2 — tirage seedé (déterminisme inter-résolutions)', () => {
  it('deux résolutions identiques (même état, même graine) spawnent la MÊME classe', () => {
    const build = () => {
      const state = twoCityState();
      state.cities['c1']!.cultureCumulee = 149;
      return state;
    };
    const a = resolveTurn(build(), {}, 99).newState;
    const b = resolveTurn(build(), {}, 99).newState;
    expect(greatPersonUnits(a).map((u) => u.type)).toEqual(greatPersonUnits(b).map((u) => u.type));
    // Le tirage pur est reproductible avec la même graine dérivée.
    expect(greatPersonClassTire(createRng((99 ^ GP_CULTURE_SEED_SALT) >>> 0), {}, 0))
      .toBe(greatPersonClassTire(createRng((99 ^ GP_CULTURE_SEED_SALT) >>> 0), {}, 0));
  });
});

describe('GP-CULTURE-EVENEMENTS · D5 — migration 21 → 22 et reprise de partie', () => {
  it('un état v21 (avec cultureStored) migre : champ retiré, culturePaliers 0, idempotent, reprise sans erreur', () => {
    const base = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: [], buildings: ['palais'] }],
    });
    const v21 = structuredClone(base) as unknown as Record<string, unknown>;
    v21.schemaVersion = 21;
    (v21.cities as Record<string, Record<string, unknown>>)['c1']!.cultureStored = 87; // réservoir pré-chantier
    const migrated = migrateState(v21) as unknown as GameState;
    expect(migrated.schemaVersion).toBe(25);
    expect(CURRENT_SCHEMA_VERSION).toBe(25);
    expect((migrated.cities['c1'] as unknown as Record<string, unknown>)['cultureStored']).toBeUndefined(); // D5 : réservoir supprimé
    expect(migrated.players['p1']!.culturePaliers).toBe(0); // backfill 0
    expect(migrateState(structuredClone(migrated) as unknown as Record<string, unknown>)).toEqual(migrated);
    // Reprise : la partie migrée se résout sans erreur (le cumul repart de son état).
    const out = resolveTurn(migrated, {}, 5).newState;
    expect(out.cities['c1']!.cultureCumulee).toBe(2); // Palais pop 2 : 2/tour
  });
});
