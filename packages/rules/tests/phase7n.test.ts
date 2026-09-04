/**
 * Tests Phase 7n — Civilisations & traits (RULES.md §8.12, R-145..R-150)
 * et Bloc 0 (corrections 7m C15–C18, voir phase7m.test.ts).
 *
 * Chaque test cite la règle R-xx, la décision de Bloc 0 ou la ligne du doc
 * [`Guide Civilisations Civilization Revolution.md`](../../Guide%20Civilisations%20Civilization%20Revolution.md)
 * (elle fait foi : 16 civs, avantage de départ, 4 bonus d'ère CUMULATIFS,
 * unités uniques).
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import type { GameState, Order } from '../src/state.js';
import { MIGRATIONS, CURRENT_SCHEMA_VERSION, migrateState } from '../src/state.js';
import {
  CIVILIZATIONS,
  ERAS,
  NEUTRAL_CIV,
  activeTraitsOf,
  civBuildingCostMultOf,
  civOverrunRatioOf,
  civStartBuildings,
  civStartGovernment,
  civStartTechs,
  civUnitCostMultOf,
  civUnitStatBonusOf,
  eraOfTechCount,
  playerHasTrait,
  uniqueReplacing,
  uniqueUnitsOf,
  isEgyptWonderChoiceValid,
} from '../src/civilizations.js';
import { applySetGovernment } from '../src/governments.js';
import { rushBuyCostOf } from '../src/economyOr.js';
import { UNIT_TYPES, registerTestUnitType } from '../src/data.js';
import { canSetProduction, isProducible, isUnitObsolete, unitReplacementFor } from '../src/techs.js';
import { tileYield } from '../src/economy.js';
import { createInitialState, loadBuiltinMapSync } from '../src/map.js';
import { getFilteredState } from '../src/fog.js';

// ---------------------------------------------------------------------------
// Données — intégrité R-145 (civilizations.json / eras.json)
// ---------------------------------------------------------------------------

describe('7n · R-145 · Données civilisations (16 civs — doc fait foi)', () => {
  it('16 civilisations, ids stables, dirigeants du doc', () => {
    const ids = Object.keys(CIVILIZATIONS.civs).sort();
    expect(ids).toHaveLength(16);
    expect(ids).toEqual([
      'allemagne', 'amerique', 'angleterre', 'arabie', 'azteques', 'chine', 'egypte', 'espagne',
      'france', 'grece', 'inde', 'japon', 'mongolie', 'rome', 'russie', 'zoulous',
    ]);
    expect(CIVILIZATIONS.civs['amerique']!.leader).toBe('Abraham Lincoln');
    expect(CIVILIZATIONS.civs['zoulous']!.leader).toBe('Shaka Zulu');
    expect(CIVILIZATIONS.civs['grece']!.leader).toBe('Alexandre le Grand');
  });

  it('structure : avantage de départ + 4 ères (cumul — « jamais éteints »)', () => {
    for (const civ of Object.values(CIVILIZATIONS.civs)) {
      expect(civ.start.length, `${civ.id} : avantage de départ`).toBeGreaterThan(0);
      for (const era of ['ancienne', 'medievale', 'industrielle', 'moderne'] as const) {
        expect(Array.isArray(civ.eras[era]), `${civ.id}/${era}`).toBe(true);
      }
      expect(civ.uniqueUnits.length, `${civ.id} : uniques déclarés`).toBeGreaterThanOrEqual(0);
    }
    // 10 civs du doc ont des unités uniques ; Inde/Égypte/Chine/Arabie/Aztèques... selon le doc :
    expect(CIVILIZATIONS.civs['inde']!.uniqueUnits).toEqual([]);
    expect(CIVILIZATIONS.civs['chine']!.uniqueUnits).toEqual([]);
    expect(CIVILIZATIONS.civs['allemagne']!.uniqueUnits).toHaveLength(4); // Panzer, 88mm, Heinkel, ME109
    expect(CIVILIZATIONS.civs['japon']!.uniqueUnits).toHaveLength(4); // Samouraï, Ashigaru, Zero, Val
  });

  it('intégrité référentielle : uniqueUnits ↔ units.json (uniqueTo réciproque), techs/gouvernements/bâtiments existent', () => {
    for (const civ of Object.values(CIVILIZATIONS.civs)) {
      for (const uid of civ.uniqueUnits) {
        const u = UNIT_TYPES[uid];
        expect(u, `${civ.id} → ${uid}`).toBeDefined();
        expect(u!.uniqueTo, `${uid} uniqueTo réciproque`).toBe(civ.id);
      }
      const declared = uniqueUnitsOf(civ.id);
      expect(declared, `${civ.id} : uniques dérivés = déclarés`).toEqual([...civ.uniqueUnits].sort());
    }
    for (const civ of Object.values(CIVILIZATIONS.civs)) {
      for (const t of [...civ.start, ...Object.values(civ.eras).flat()]) {
        if (t.tech) expect(t.tech, `${civ.id}/${t.key} : tech inconnue`).toBeDefined();
        if (t.government) expect(t.government, `${civ.id}/${t.key} : régime inconnu`).toBeDefined();
        if (t.building) expect(t.building, `${civ.id}/${t.key} : bâtiment inconnu`).toBeDefined();
        for (const uid of t.units ?? []) expect(UNIT_TYPES[uid], `${civ.id}/${t.key} : type inconnu`).toBeDefined();
      }
    }
  });

  it('T-36 🔶 · eras.json : seuils canon 5/14/24 (compage, indifférent à la branche)', () => {
    expect(ERAS.thresholds).toEqual({ medievale: 5, industrielle: 14, moderne: 24 });
    expect(eraOfTechCount(0)).toBe('ancienne');
    expect(eraOfTechCount(4)).toBe('ancienne');
    expect(eraOfTechCount(5)).toBe('medievale');
    expect(eraOfTechCount(13)).toBe('medievale');
    expect(eraOfTechCount(14)).toBe('industrielle');
    expect(eraOfTechCount(23)).toBe('industrielle');
    expect(eraOfTechCount(24)).toBe('moderne');
  });

  it('R-146 · cumulativité : une civ en ère MODERNE a ses 5 groupes actifs simultanément (doc §Cumulativité)', () => {
    const amerique = { civId: 'amerique', era: 'moderne' as const };
    const traits = activeTraitsOf(amerique).filter((t) => !t.inactif);
    // start + ancienne + medievale + industrielle + moderne — un trait de CHAQUE groupe.
    expect(traits.some((t) => t.key === 'gpGratuit')).toBe(true); // départ
    expect(traits.some((t) => t.key === 'interets')).toBe(true); // ancienne
    expect(traits.some((t) => t.key === 'rushHalfPrice')).toBe(true); // médiévale
    expect(traits.some((t) => t.key === 'terrainBonus')).toBe(true); // industrielle (plaine)
    expect(traits.some((t) => t.key === 'buildingProductionMult')).toBe(true); // moderne (Usine ×3)
    // En ère ANCIENNE : seuls départ + ancienne.
    const early = activeTraitsOf({ civId: 'amerique', era: 'ancienne' });
    expect(early.some((t) => t.key === 'rushHalfPrice')).toBe(false);
  });

  it('R-146 · hooks 7l ACTIVÉS : intérêts 2 % et rushHalfPrice (playerHasTrait)', () => {
    expect(playerHasTrait({ civId: 'amerique', era: 'ancienne' }, 'interets')).toBe(true);
    expect(playerHasTrait({ civId: 'russie', era: 'moderne' }, 'interets')).toBe(false);
    expect(playerHasTrait(undefined, 'interets')).toBe(false); // neutre / fixtures
    expect(playerHasTrait({ civId: NEUTRAL_CIV, era: 'moderne' }, 'interets')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R-147 · Ère par comptage — transition AU TOUR SUIVANT (EraChanged)
// ---------------------------------------------------------------------------

describe('7n · R-147 · Transition d\'ère au compage (5/14/24)', () => {
  /** p1 : 4 techs connues, complète la 5e (alphabet, coût 20) ce tour. */
  function crossingState(): GameState {
    const state = makeState({
      terrainOverrides: { '0,0': 'ville', '1,0': 'desert' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, conversion: 'science', workedTiles: ['1,0'] }],
    });
    state.players['p1']!.techsUnlocked = ['travail_du_bronze', 'equitation', 'poterie', 'code_des_lois'];
    state.players['p1']!.researching = 'alphabet';
    state.players['p1']!.scienceProgress = { alphabet: 20 }; // complétion ce tour
    state.players['p1']!.civId = 'arabie'; // médiévale → Mathématiques gratuites
    return state;
  }

  it('franchissement à 5 techs : EraChanged + tech gratuite du palier (Arabie → Mathématiques)', () => {
    const { newState, events } = resolveTurn(crossingState(), {}, 1);
    expect(newState.players['p1']!.techsUnlocked).toContain('alphabet'); // la 5e
    expect(newState.players['p1']!.techsUnlocked).toContain('mathematiques'); // gratuite (R-147)
    expect(newState.players['p1']!.era).toBe('medievale');
    const era = events.find((e) => e.type === 'EraChanged');
    expect(era).toMatchObject({ type: 'EraChanged', player: 'p1', era: 'medievale' });
    // Aucun jalon/firstBy pour la tech gratuite (octroi direct — miroir Apollo).
    expect(newState.firstBy['mathematiques']).toBeUndefined();
  });

  it('transition AU TOUR SUIVANT : la pop de fondation de CE tour lit encore l\'ancienne ère', () => {
    // p1 vient de franchir 5 techs (ère appliquée en fin de résolution) ;
    // un colon fonde PENDANT la même résolution → pop 2 (ancienne), pas 3.
    const state = crossingState();
    state.units['settler'] = {
      id: 'settler', type: 'colon', owner: 'p1', q: 3, r: 0, hp: 3, mp: 2,
      veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null,
    };
    const orders: Record<string, Order[]> = { p1: [{ type: 'FoundCity', unitId: 'settler' }] };
    const out = resolveTurn(state, orders, 1).newState;
    expect(out.players['p1']!.era).toBe('medievale'); // appliqué en fin de résolution
    const founded = Object.values(out.cities).find((c) => c.q === 3 && c.r === 0)!;
    expect(founded.pop).toBe(2); // ancienne ère PENDANT la résolution (doc : « au tour suivant »)
  });

  it('l\'ère persistée (tour suivant) s\'applique : fondation médiévale à pop 3', () => {
    const state = makeState({});
    state.players['p1']!.civId = 'arabie';
    state.players['p1']!.era = 'medievale'; // déjà franchie au tour précédent
    state.units['settler'] = {
      id: 'settler', type: 'colon', owner: 'p1', q: 3, r: 0, hp: 3, mp: 2,
      veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null,
    };
    const out = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 'settler' }] }, 1).newState;
    const founded = Object.values(out.cities).find((c) => c.q === 3 && c.r === 0)!;
    expect(founded.pop).toBe(3); // founderPopByEra médiévale (R-64/D3)
  });

  it('civ NEUTRE : aucune transition free-tech, aucun trait (parties migrées)', () => {
    const state = crossingState();
    state.players['p1']!.civId = NEUTRAL_CIV;
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.players['p1']!.era).toBe('medievale'); // le comptage s'applique à tous
    expect(out.players['p1']!.techsUnlocked).not.toContain('mathematiques'); // pas de civ → pas de gratuite
  });
});

// ---------------------------------------------------------------------------
// R-148 · Unités uniques — remplacement (pattern R-111)
// ---------------------------------------------------------------------------

describe('7n · R-148 · Unités uniques (remplacement au menu dès la tech)', () => {
  it('Zoulous : le Guerrier est remplacé par le Guerrier Impi (stats 1/1/2 — +1 PM doc)', () => {
    // Stats de l'unique = celles de l'unité remplacée (canon Fandom) ; le
    // « +1 mouvement » du doc est porté par le TRAIT d'ère zoulou (R-149).
    expect(UNIT_TYPES['guerrier_impi']).toMatchObject({ attack: 1, defense: 1, movement: 1, uniqueTo: 'zoulous', replaces: 'guerrier' });
    expect(uniqueReplacing('zoulous', 'guerrier', [])).toBe('guerrier_impi');
    // L'unité standard est refusée pour le Zoulou, l'unique accepté.
    expect(canSetProduction({ kind: 'unit', id: 'guerrier' }, [], [], 'zoulous')).toBe(false);
    expect(canSetProduction({ kind: 'unit', id: 'guerrier_impi' }, [], [], 'zoulous')).toBe(true);
    // Une autre civ (ou neutre) produit le Guerrier standard.
    expect(canSetProduction({ kind: 'unit', id: 'guerrier' }, [], [], 'inde')).toBe(true);
    expect(canSetProduction({ kind: 'unit', id: 'guerrier' }, [], [])).toBe(true);
    // L'Impi est obsolète avec le Guerrier (Travail du fer — R-148/R-110).
    expect(isUnitObsolete('guerrier_impi', ['travail_du_fer'])).toBe(true);
    expect(isUnitObsolete('guerrier_impi', [])).toBe(false);
  });

  it('Angleterre : Archer à long arc dès Travail du bronze (+1 déf via trait d\'ère — canon CivFanatics)', () => {
    expect(unitReplacementFor({ kind: 'unit', id: 'archer' }, 'angleterre', [])).toBeNull(); // tech manquante
    expect(unitReplacementFor({ kind: 'unit', id: 'archer' }, 'angleterre', ['travail_du_bronze'])).toBe('archer_long');
    expect(canSetProduction({ kind: 'unit', id: 'archer' }, ['travail_du_bronze'], [], 'angleterre')).toBe(false);
    expect(canSetProduction({ kind: 'unit', id: 'archer_long' }, ['travail_du_bronze'], [], 'angleterre')).toBe(true);
    expect(isUnitObsolete('archer_long', ['democratie'])).toBe(true); // Archer obsolète → unique aussi
  });

  it('3 civs au menu (critère d\'acceptation) : Zoulous, Mongols (Keshik), Japon (Samouraï)', () => {
    expect(unitReplacementFor({ kind: 'unit', id: 'cavalier' }, 'mongolie', ['equitation'])).toBe('keshik');
    expect(canSetProduction({ kind: 'unit', id: 'cavalier' }, ['equitation'], [], 'mongolie')).toBe(false);
    expect(canSetProduction({ kind: 'unit', id: 'keshik' }, ['equitation'], [], 'mongolie')).toBe(true);
    expect(unitReplacementFor({ kind: 'unit', id: 'chevalier' }, 'japon', ['feudalite'])).toBe('chevalier_samourai');
    expect(canSetProduction({ kind: 'unit', id: 'chevalier' }, ['feudalite'], [], 'japon')).toBe(false);
    // Les unités uniques ne sont JAMAIS productibles par une autre civ.
    expect(isProducible({ tech: null, implemented: true, uniqueTo: 'mongolie' }, ['equitation'], [], 'japon')).toBe(false);
    expect(isProducible({ tech: null, implemented: true, uniqueTo: 'mongolie' }, ['equitation'], [], 'mongolie')).toBe(true);
    // Un SetProduction de l'unité standard remplacée est ignoré (moteur).
    const state = makeState({ cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2 }] });
    state.players['p1']!.civId = 'zoulous';
    const out = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }] }, 1).newState;
    expect(out.cities['c1']!.production).toBeNull();
    // ... et l'unique est produisible.
    const out2 = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier_impi' } }] }, 1).newState;
    expect(out2.cities['c1']!.production?.item).toEqual({ kind: 'unit', id: 'guerrier_impi' });
  });

  it('unités uniques aériennes : en données (implemented: false) — non productibles', () => {
    expect(UNIT_TYPES['spitfire']!.implemented).toBe(false);
    expect(canSetProduction({ kind: 'unit', id: 'spitfire' }, ['aviation'], [], 'angleterre')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R-150 · Avantages de départ (setup déterministe)
// ---------------------------------------------------------------------------

describe('7n · R-150 · Avantages de départ (createInitialState — setup déterministe)', () => {
  const state = () => createInitialState(loadBuiltinMapSync('pedagogique-40'), 1234, {
    p1: { civId: 'chine' },
    p2: { civId: 'rome' },
  });

  it('Chine : Écriture gratuite ; Rome : Code des lois + République (sans Anarchie)', () => {
    const s = state();
    expect(s.players['p1']!.civId).toBe('chine');
    expect(s.players['p1']!.techsUnlocked).toContain('ecriture');
    expect(s.players['p2']!.techsUnlocked).toContain('code_des_lois');
    expect(s.players['p2']!.government).toBe('republique');
    expect(s.players['p2']!.anarchyUntil).toBeNull();
    // Les techs de départ comptent dans le compage (sans franchir 5).
    expect(s.players['p1']!.era).toBe('ancienne');
  });

  it('France : Cathédrale dans la capitale ; Grèce : Tribunal', () => {
    const s = createInitialState(loadBuiltinMapSync('pedagogique-40'), 1234, {
      p1: { civId: 'france' },
      p2: { civId: 'grece' },
    });
    expect(s.cities['c1']!.buildings).toContain('cathedrale');
    expect(s.cities['c2']!.buildings).toContain('tribunal');
    expect(civStartBuildings('france')).toEqual(['cathedrale']);
    expect(civStartGovernment('rome')).toBe('republique');
    expect(civStartTechs('chine')).toEqual(['ecriture']);
  });

  it('Égypte : Merveille Antique au choix 🔶 (validation de la liste params)', () => {
    const s = createInitialState(loadBuiltinMapSync('pedagogique-40'), 1234, {
      p1: { civId: 'egypte', wonderId: 'grande_pyramide' },
      p2: { civId: 'inde' },
    });
    expect(s.cities['c1']!.wonders).toEqual(['grande_pyramide']);
    // Choix hors liste (params 🔶) : ignoré.
    const s2 = createInitialState(loadBuiltinMapSync('pedagogique-40'), 1234, {
      p1: { civId: 'egypte', wonderId: 'nations_unies' },
      p2: { civId: 'inde' },
    });
    expect(s2.cities['c1']!.wonders).toEqual([]);
    expect(isEgyptWonderChoiceValid('egypte', 'stonehenge')).toBe(true);
    expect(isEgyptWonderChoiceValid('egypte', 'banque_mondiale')).toBe(false);
    expect(isEgyptWonderChoiceValid('inde', 'stonehenge')).toBe(false);
  });

  it('Aztèques : or de départ 🔶 (+25) ; Amérique : GP gratuit (classe déterministe R-127)', () => {
    const s = createInitialState(loadBuiltinMapSync('pedagogique-40'), 1234, {
      p1: { civId: 'azteques' },
      p2: { civId: 'amerique' },
    });
    expect(s.players['p1']!.treasury).toBe(25);
    expect(s.players['p2']!.treasury).toBe(0);
    const gps = Object.values(s.units).filter((u) => u.owner === 'p2' && UNIT_TYPES[u.type]!.greatPerson);
    expect(gps).toHaveLength(1); // posé sur la capitale ou adjacent
    // Déterminisme : même seed → même classe de GP (rotation R-127, index 0).
    const s2 = createInitialState(loadBuiltinMapSync('pedagogique-40'), 1234, {
      p1: { civId: 'azteques' },
      p2: { civId: 'amerique' },
    });
    expect(Object.values(s2.units).find((u) => u.owner === 'p2' && UNIT_TYPES[u.type]!.greatPerson)!.type)
      .toBe(Object.values(s.units).find((u) => u.owner === 'p2' && UNIT_TYPES[u.type]!.greatPerson)!.type);
  });

  it('Russie : carte environnante révélée au départ (rayon params 🔶)', () => {
    const s = createInitialState(loadBuiltinMapSync('pedagogique-40'), 1234, {
      p1: { civId: 'inde' },
      p2: { civId: 'russie' },
    });
    const others = createInitialState(loadBuiltinMapSync('pedagogique-40'), 1234, {
      p1: { civId: 'inde' },
      p2: { civId: 'inde' },
    });
    expect(s.players['p2']!.vision.explored.length).toBeGreaterThan(others.players['p2']!.vision.explored.length);
  });

  it('Allemagne : Guerrier de départ VÉTÉRAN ; Zoulous : Guerrier de départ → Impi', () => {
    const s = createInitialState(loadBuiltinMapSync('pedagogique-40'), 1234, {
      p1: { civId: 'allemagne' },
      p2: { civId: 'zoulous' },
    });
    const p1warrior = Object.values(s.units).find((u) => u.owner === 'p1');
    expect(p1warrior!.veteran).toBe(true);
    const p2warrior = Object.values(s.units).find((u) => u.owner === 'p2');
    expect(p2warrior!.type).toBe('guerrier_impi'); // R-148 : remplacement au départ
    expect(p2warrior!.mp).toBe(2); // +1 mouvement (trait d'ère ancienne Zoulou — R-149)
  });
});

// ---------------------------------------------------------------------------
// R-149 · Traits actifs — effets moteur
// ---------------------------------------------------------------------------

describe('7n · R-149 · Traits — économie, croissance, combat, huttes', () => {
  it('intérêts 2 % (hook R-134) : Amérique/Arabie/Allemagne crédités, neutre non', () => {
    const base = () => {
      const s = makeState({});
      s.players['p1']!.treasury = 1000;
      return s;
    };
    const amerique = base();
    amerique.players['p1']!.civId = 'amerique';
    expect(resolveTurn(amerique, {}, 1).newState.players['p1']!.treasury).toBe(1020); // round(1000 × 0,02)
    const neutre = base();
    expect(resolveTurn(neutre, {}, 1).newState.players['p1']!.treasury).toBe(1000); // désactivé sans trait
  });

  it('popFondation : Chine fonde à pop 3 (2 + 1 — hook R-64/D3)', () => {
    const state = makeState({ units: [{ id: 's1', type: 'colon', owner: 'p1', q: 4, r: 0 }] });
    state.players['p1']!.civId = 'chine';
    const out = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 's1' }] }, 1).newState;
    expect(Object.values(out.cities).find((c) => c.q === 4 && c.r === 0)!.pop).toBe(3);
  });

  it('terrainBonus : Amérique +1 N plaine, Égypte +1 N +1 C désert (rendement, R-66)', () => {
    const map = { '2,2': { terrain: 'plaine' as const, resource: null }, '3,3': { terrain: 'desert' as const, resource: null } };
    expect(tileYield(map, [], '2,2', [], [], undefined, { civId: 'amerique', era: 'industrielle' })).toEqual({ food: 2, production: 0, commerce: 0 }); // Amérique Industrielle
    expect(tileYield(map, [], '2,2', [], [], undefined, { civId: 'inde', era: 'moderne' })).toEqual({ food: 1, production: 0, commerce: 0 });
    expect(tileYield(map, [], '3,3', [], [], undefined, { civId: 'egypte', era: 'ancienne' })).toEqual({ food: 1, production: 0, commerce: 2 });
  });

  it('toutesRessources (Inde) : bonus de ressource SANS technologie (R-92/R-93)', () => {
    const map = { '1,1': { terrain: 'colline' as const, resource: 'fer' as const } }; // revealedByTech: travail_du_fer
    expect(tileYield(map, [], '1,1', [], [])).toEqual({ food: 0, production: 1, commerce: 0 }); // tech manquante
    expect(tileYield(map, [], '1,1', [], [], undefined, { civId: 'inde', era: 'ancienne' })).toEqual({ food: 0, production: 3, commerce: 0 }); // +2 P (fer)
  });

  it('immunité Anarchie : Chine (Moderne) adopte un régime SANS Anarchie', () => {
    const state = makeState({});
    state.players['p1']!.civId = 'chine';
    state.players['p1']!.era = 'moderne';
    state.players['p1']!.techsUnlocked = ['monarchie'];
    const r = applySetGovernment(state, 'p1', 'monarchie');
    expect(r.ok).toBe(true);
    expect(r.ok && r.anarchy).toBe(false); // pas d'Anarchie (R-149)
    expect(r.ok && r.state.players['p1']!.anarchyUntil).toBeNull();
  });

  it('écrasement (Overrun) : ratio base 6, Zoulous 4 — le défenseur est détruit sans échange utile', async () => {
    registerTestUnitType({
      id: 'lance-test', name: 'Lancier (test)', attack: 4, defense: 2, movement: 1,
      hpMax: 3, cost: 20, visionRadius: 2, canAttack: true, canFoundCity: false, isRanged: false,
    });
    expect(civOverrunRatioOf(undefined)).toBe(6); // canon : 6:1 pour tous
    expect(civOverrunRatioOf({ civId: 'zoulous', era: 'ancienne' })).toBe(4); // doc Zulu

    // Zoulou : chevalier (A4) vs guerrier (D1) → 4 ≥ 4×1 : ÉCRASEMENT (1 échange).
    const zulu = () => {
      const s = makeState({ units: [
        { id: 'at', type: 'chevalier', owner: 'p1', q: 0, r: 1 },
        { id: 'df', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
      ] });
      s.players['p1']!.civId = 'zoulous';
      return s;
    };
    const rz = resolveTurn(zulu(), { p1: [{ type: 'Attack', unitId: 'at', target: { q: 0, r: 0 } }] }, 3);
    expect(rz.newState.units['df']).toBeUndefined();
    expect(rz.newState.units['at']!.hp).toBe(3); // intact (aucun round perdu)
    expect(rz.events.filter((e) => e.type === 'CombatExchange' && e.defenderId === 'df')).toHaveLength(1);

    // Non-Zoulou (ratio 6) : 4 < 6 — PAS d'écrasement : survie mutuelle (le
    // défenseur perd 1 PV, p = 16/17, et l'attaquant se replie — R-52).
    const plain = zulu();
    plain.players['p1']!.civId = NEUTRAL_CIV;
    const rp = resolveTurn(plain, { p1: [{ type: 'Attack', unitId: 'at', target: { q: 0, r: 0 } }] }, 7);
    expect(rp.newState.units['df']).toBeDefined(); // survivant
    const exchange = rp.events.find((e) => e.type === 'CombatExchange' && e.defenderId === 'df');
    expect(exchange && exchange.type === 'CombatExchange' ? exchange.defenderHpAfter : null).toBe(2);
  });

  it('soinVictoire (Aztèques) : l\'unité revient à ses PV max après une victoire', () => {
    const state = makeState({ units: [
      { id: 'at', type: 'chevalier', owner: 'p1', q: 0, r: 1, hp: 1 },
      { id: 'df', type: 'guerrier', owner: 'p2', q: 0, r: 0, hp: 1 },
    ] });
    state.players['p1']!.civId = 'azteques';
    // p = 16/17 : un échange tue presque toujours ; on balaie les graines.
    let healed = false;
    for (let seed = 0; seed < 60 && !healed; seed++) {
      const r = resolveTurn(structuredClone(state), { p1: [{ type: 'Attack', unitId: 'at', target: { q: 0, r: 0 } }] }, seed);
      if (r.newState.units['df'] === undefined && r.newState.units['at']?.hp === 3) healed = true;
    }
    expect(healed).toBe(true); // PV max rendus après la victoire (doc Aztèques Ancienne)
  });

  it('templesScience (Aztèques Médiévale) : Temple +3 science/tour', () => {
    const state = makeState({
      terrainOverrides: { '0,0': 'ville', '1,0': 'desert' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, conversion: 'science', buildings: ['temple'], workedTiles: ['1,0'] }],
    });
    state.players['p1']!.civId = 'azteques';
    state.players['p1']!.era = 'medievale';
    state.players['p1']!.researching = 'alphabet';
    const before = state.players['p1']!.scienceProgress;
    void before;
    const out = resolveTurn(state, {}, 1).newState;
    // Le désert (0/0/1) converti science → 1 + 3 (Temple) = 4 fioles ce tour.
    expect(out.players['p1']!.scienceProgress['alphabet']).toBe(4);
  });

  it('or de départ et empireGoldMult (Aztèques/Zoulous/Espagne Industrielle) : +50 % or', () => {
    const state = makeState({
      terrainOverrides: { '0,0': 'ville', '1,0': 'desert' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, conversion: 'gold', workedTiles: ['1,0'] }],
    });
    state.players['p1']!.civId = 'zoulous';
    state.players['p1']!.era = 'industrielle';
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.players['p1']!.treasury).toBe(2); // 1 commerce → 1 or ×1,5 → round = 2
  });

  it('coutUniteMoitie / coutBuildingMoitie / coutMerveilleMoitie (Inde, Allemagne, Chine, Rome)', () => {
    expect(civUnitCostMultOf({ civId: 'inde', era: 'industrielle' }, 'colon')).toBe(0.5);
    expect(civUnitCostMultOf({ civId: 'inde', era: 'ancienne' }, 'colon')).toBe(1);
    expect(civUnitCostMultOf({ civId: 'russie', era: 'moderne' }, 'espion')).toBe(0.5);
    expect(civBuildingCostMultOf({ civId: 'chine', era: 'industrielle' }, 'bibliotheque')).toBe(0.5);
    expect(civBuildingCostMultOf({ civId: 'chine', era: 'industrielle' }, 'caserne')).toBe(1);
    expect(civBuildingCostMultOf({ civId: 'allemagne', era: 'industrielle' }, 'caserne')).toBe(0.5);
    // Rome Médiévale : merveilles à moitié prix — visible dans le coût rush.
    const s = makeState({ cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1 }] });
    s.players['p1']!.civId = 'rome';
    s.players['p1']!.era = 'medievale';
    s.players['p1']!.techsUnlocked = ['rites_funeraires'];
    s.cities['c1']!.production = { item: { kind: 'wonder', id: 'grande_pyramide' }, progress: 0 };
    // grande_pyramide = 150 marteaux → rush normal 450 (×3) ; Rome : 225.
    expect(rushBuyCostOf(s, s.cities['c1']!)).toBe(225);
  });

  it('villagesVilles (Mongols) : ouvrir une hutte FONDE une ville pop 1 🔶 (au lieu de la récompense)', () => {
    const state = makeState({
      width: 10, height: 8,
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 }],
      huts: [{ q: 2, r: 0 }],
    });
    state.players['p1']!.civId = 'mongolie';
    state.players['p1']!.era = 'ancienne';
    const out = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 2, r: 0 }] }] }, 1).newState;
    expect(out.huts).toHaveLength(0); // hutte consommée
    const city = Object.values(out.cities).find((c) => c.q === 2 && c.r === 0);
    expect(city).toBeDefined();
    expect(city!.pop).toBe(1);
    expect(city!.owner).toBe('p1');
    expect(out.map['2,0']!.terrain).toBe('ville');
    // Un NON-Mongol ouvre la hutte normalement (récompense RNG).
    const plain = makeState({
      width: 10, height: 8,
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 }],
      huts: [{ q: 2, r: 0 }],
    });
    const out2 = resolveTurn(plain, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 2, r: 0 }] }] }, 1).newState;
    expect(Object.values(out2.cities).some((c) => c.q === 2 && c.r === 0)).toBe(false);
    expect(out2.huts).toHaveLength(0);
    const opened = out2.huts.length === 0;
    expect(opened).toBe(true);
  });

  it('tresorsDouble (Espagne) : l\'or de hutte est doublé 🔶 (trésors — artefacts : phase suivante)', () => {
    // Recherche d'une graine où la récompense est de l'OR, puis ×2.
    let doubled = false;
    for (let seed = 0; seed < 120 && !doubled; seed++) {
      const state = makeState({
        width: 10, height: 8,
        units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 }],
        huts: [{ q: 2, r: 0 }],
      });
      state.players['p1']!.civId = 'espagne';
      const r = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 2, r: 0 }] }] }, seed);
      const opened = r.events.find((e) => e.type === 'HutOpened');
      if (opened && opened.type === 'HutOpened' && opened.reward.kind === 'gold') {
        doubled = r.newState.players['p1']!.treasury === opened.reward.amount * 2;
      }
    }
    expect(doubled).toBe(true);
  });

  it('traits INACTIFS documentés (routes, caravanes, élite, Loyauté) : portés, ignorés', () => {
    const rome = activeTraitsOf({ civId: 'rome', era: 'ancienne' });
    const routes = rome.find((t) => t.key === 'routesMoitie');
    expect(routes?.inactif).toBe(true); // affiché, non exécuté (pas d'ouvriers/routes)
    expect(playerHasTrait({ civId: 'arabie', era: 'ancienne' }, 'caravanesPlus50')).toBe(false); // inactif → false
    expect(playerHasTrait({ civId: 'japon', era: 'moderne' }, 'loyaute')).toBe(false);
    expect(playerHasTrait({ civId: 'allemagne', era: 'ancienne' }, 'eliteAuto')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R-149 · Combat — bonus de stats civilisationnels
// ---------------------------------------------------------------------------

describe('7n · R-149 · Bonus de combat par type (unitAttack/unitDefense/unitMovement)', () => {
  it('Arabie Industrielle : +1 attaque Cavaliers/Chevaliers ; France : +2 Canons', () => {
    expect(civUnitStatBonusOf({ civId: 'arabie', era: 'industrielle' }, 'unitAttack', 'chevalier')).toBe(1);
    expect(civUnitStatBonusOf({ civId: 'arabie', era: 'medievale' }, 'unitAttack', 'chevalier')).toBe(0);
    expect(civUnitStatBonusOf({ civId: 'france', era: 'industrielle' }, 'unitAttack', 'canon')).toBe(2);
    expect(civUnitStatBonusOf({ civId: 'france', era: 'industrielle' }, 'unitAttack', 'obusier')).toBe(2); // doc §unités
    expect(civUnitStatBonusOf({ civId: 'japon', era: 'medievale' }, 'unitAttack', 'chevalier_samourai')).toBe(1);
    expect(civUnitStatBonusOf({ civId: 'angleterre', era: 'ancienne' }, 'unitDefense', 'archer_long')).toBe(1);
    expect(civUnitStatBonusOf({ civId: 'zoulous', era: 'ancienne' }, 'unitMovement', 'guerrier_impi')).toBe(1);
    expect(civUnitStatBonusOf({ civId: 'mongolie', era: 'medievale' }, 'unitMovement', 'keshik')).toBe(1);
  });

  it('régénération PM (R-72) : les fusiliers Égypte/France se déplacent à 2, l\'Impi zoulou à 2', () => {
    const state = makeState({ units: [
      { id: 'f1', type: 'fusilier', owner: 'p1', q: 0, r: 0, mp: 0 },
      { id: 'i1', type: 'guerrier_impi', owner: 'p1', q: 1, r: 0, mp: 0 },
    ] });
    state.players['p1']!.civId = 'egypte';
    state.players['p1']!.era = 'industrielle';
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.units['f1']!.mp).toBe(2); // 1 + 1 (Égypte Industrielle)
    // L'Impi d'un Zoulou : mouvement 2 (unique) + 1 (ère ancienne) = 3 en Phase D.
    const s2 = makeState({ units: [{ id: 'i2', type: 'guerrier_impi', owner: 'p2', q: 0, r: 0, mp: 0 }] });
    s2.players['p2']!.civId = 'zoulous';
    s2.players['p2']!.era = 'ancienne';
    const out2 = resolveTurn(s2, {}, 1).newState;
    expect(out2.units['i2']!.mp).toBe(2); // Impi 1 + trait d'ère +1 (doc : « vitesse accrue »)
  });
});

// ---------------------------------------------------------------------------
// Migration 16 → 17 + fog (civ publique)
// ---------------------------------------------------------------------------

describe('7n · Migration v16 → v17 (R-145/R-147/R-149 — additive, idempotente)', () => {
  it('civId neutre, era au compage des techs, wasCaptured false ; idempotent', () => {
    const v16 = {
      schemaVersion: 16,
      turn: 6,
      players: {
        p1: { id: 'p1', treasury: 5, missedTurns: 0, techsUnlocked: ['a', 'b', 'c', 'd', 'e'] },
        p2: { id: 'p2', treasury: 0, missedTurns: 0, techsUnlocked: [] },
      },
      cities: { c1: { id: 'c1', q: 0, r: 0, owner: 'p1' } },
    };
    const once = migrateState(v16) as unknown as {
      players: Record<string, { civId: string; era: string }>;
      cities: Record<string, { wasCaptured: boolean }>;
      schemaVersion: number;
    };
    expect(once.schemaVersion).toBe(18);
    expect(once.players['p1']!.civId).toBe('neutre');
    expect(once.players['p1']!.era).toBe('medievale'); // 5 techs au compage (T-36)
    expect(once.players['p2']!.era).toBe('ancienne');
    expect(once.cities['c1']!.wasCaptured).toBe(false);
    expect(MIGRATIONS[17]).toBeDefined();
    const twice = migrateState(structuredClone(once) as unknown as Record<string, unknown>) as typeof once;
    expect(twice.players['p1']!.era).toBe('medievale'); // champ existant conservé
  });

  it('la civ adverse est PUBLIQUE dans l\'état filtré (canon) ; CURRENT_SCHEMA_VERSION = 17', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(18);
    const s = makeState({});
    s.players['p1']!.civId = 'chine';
    s.players['p2']!.civId = 'zoulous';
    const filtered = getFilteredState(s, 'p1');
    expect(filtered.players['p2']!.civId).toBe('zoulous'); // canon : la civ adverse est visible
    expect(filtered.players['p2']!.era).toBe('ancienne');
  });
});
