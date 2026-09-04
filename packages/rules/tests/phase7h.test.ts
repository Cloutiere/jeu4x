/**
 * Phase 7h — Gouvernements, GP restants, victoire scientifique, merveilles
 * tractables (RULES.md §8.7, R-121..R-125). Chaque test cite son identifiant.
 */
import { describe, expect, it } from 'vitest';
import {
  ANARCHY_TURNS,
  DEFAULT_GOVERNMENT,
  GOVERNMENTS,
  applySetGovernment,
  combatOdds,
  conversionGains,
  cultureGains,
  effectsFor,
  greatPersonThresholdFor,
  isInAnarchy,
  landCombatBonus,
  leaderGpVictoriesNeeded,
  migrateState,
  resolveTurn,
  yieldGpThresholdFor,
  wonderAttackBonusEmpireOf,
} from '../src/index.js';
import { makeState } from '../src/fixtures.js';
import { TECHS } from '../src/techs.js';
import type { GameState } from '../src/index.js';
import { unitType } from '../src/data.js';

/** Capitale prête à produire (techs fournies) sur une carte prairie. */
function productionState(government = 'despotisme'): GameState {
  // 7i · R-66 (rév.) : case d'eau travaillée — le commerce du centre suit la
  // tranche (0 pop ≤ 6), il faut du commerce de terrain pour l'or.
  const state = makeState({
    terrainOverrides: { '2,1': 'eau' },
    cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 3, workedTiles: ['2,1'] }],
  });
  state.players['p1']!.government = government;
  return state;
}

describe('R-121 · Gouvernements (governments.json — valeurs exactes du doc d’Erik)', () => {
  it('six régimes, Despotisme par défaut, T-29 = 1 tour d’Anarchie', () => {
    expect(Object.keys(GOVERNMENTS).sort()).toEqual(
      ['communisme', 'democratie', 'despotisme', 'fondamentalisme', 'monarchie', 'republique'].sort(),
    );
    expect(GOVERNMENTS['despotisme']!.default).toBe(true);
    expect(DEFAULT_GOVERNMENT).toBe('despotisme');
    expect(ANARCHY_TURNS).toBe(1); // T-29
  });

  it('modificateurs EXACTS : république, monarchie, démocratie, fondamentalisme, communisme', () => {
    expect(GOVERNMENTS['republique']!.tech).toBe('code_des_lois');
    expect(GOVERNMENTS['republique']!.effects.settlerPopCost).toBe(1); // amende R-112
    expect(GOVERNMENTS['monarchie']!.tech).toBe('monarchie');
    expect(GOVERNMENTS['monarchie']!.effects.palaceCultureMult).toBe(2); // amende R-113
    expect(GOVERNMENTS['democratie']!.effects.goldMult).toBe(1.5);
    expect(GOVERNMENTS['democratie']!.effects.scienceMult).toBe(1.5);
    expect(GOVERNMENTS['democratie']!.effects.pacifism).toBe(true); // hooks posés, sans effet 1v1
    expect(GOVERNMENTS['fondamentalisme']!.effects.landAttackBonus).toBe(1);
    expect(GOVERNMENTS['fondamentalisme']!.effects.landDefenseBonus).toBe(1);
    expect(GOVERNMENTS['fondamentalisme']!.effects.zeroLibraryScience).toBe(true);
    expect(GOVERNMENTS['communisme']!.effects.productionMult).toBe(1.5);
    expect(GOVERNMENTS['communisme']!.effects.zeroTempleCulture).toBe(true);
  });

  it('intégrité référentielle : toute tech de régime existe dans techs.json', () => {
    for (const g of Object.values(GOVERNMENTS)) {
      if (g.tech) expect(TECHS[g.tech], `${g.id} → ${g.tech}`).toBeDefined();
    }
  });

  it('Fondamentalisme : +1/+1 terrestre uniquement (aquatique exclu)', () => {
    const effects = effectsFor({ government: 'fondamentalisme' } as never);
    expect(landCombatBonus(effects, unitType('legion'), 'attack')).toBe(1);
    expect(landCombatBonus(effects, unitType('legion'), 'defense')).toBe(1);
    expect(landCombatBonus(effects, unitType('galere'), 'attack')).toBe(0);
    expect(landCombatBonus(effects, unitType('galion'), 'defense')).toBe(0);
  });
});

describe('R-121 · Modificateurs économiques (avant/après, même seed)', () => {
  it('Démocratie : +50 % or et science de toutes les villes (avant répartition)', () => {
    expect(conversionGains(1, 'gold', [], { goldMult: 1.5, scienceMult: 1.5 })).toEqual({ gold: 2, science: 0 });
    expect(conversionGains(4, 'science', [], { scienceMult: 1.5 })).toEqual({ gold: 0, science: 6 });
    // e2e même seed : le trésor démocratique dépasse celui du despotisme
    // 7i · R-66 (rév.) : le commerce du centre suit la tranche (0 pop ≤ 6) —
    // une case d'eau travaillée (0/0/2) porte le commerce.
    const base = {
      terrainOverrides: { '2,1': 'eau' } as const,
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, workedTiles: ['2,1'] }],
    };
    const despotisme = resolveTurn(makeState(base), {}, 42).newState;
    const democratie = resolveTurn(
      (() => {
        const s = makeState(base);
        s.players['p1']!.government = 'democratie';
        return s;
      })(),
      {},
      42,
    ).newState;
    expect(democratie.players['p1']!.gold).toBe(Math.round(despotisme.players['p1']!.gold * 1.5));
    expect(democratie.players['p1']!.gold).toBeGreaterThan(despotisme.players['p1']!.gold);
  });

  it('Fondamentalisme : la science des Bibliothèques et Universités = 0 (R-88 neutralisé)', () => {
    // Sans gouvernement : Bibliothèque ×1,5 science / résiduel 20 % en conversion or.
    expect(conversionGains(12, 'science', ['bibliotheque'])).toEqual({ gold: 0, science: 18 });
    expect(conversionGains(5, 'gold', ['bibliotheque']).science).toBe(1);
    // Fondamentalisme : multiplicateurs neutralisés, résiduel supprimé.
    expect(conversionGains(12, 'science', ['universite'], { zeroLibraryScience: true })).toEqual({
      gold: 0,
      science: 12,
    });
    expect(conversionGains(5, 'gold', ['bibliotheque'], { zeroLibraryScience: true })).toEqual({
      gold: 5,
      science: 0,
    });
  });

  it('Communisme : +50 % marteaux de toutes les villes (même seed, progression comparée)', () => {
    const run = (government: string) => {
      const s = productionState(government);
      s.players['p1']!.techsUnlocked = ['rites_funeraires'];
      s.cities['c1']!.production = { item: { kind: 'building', id: 'temple' }, progress: 0 };
      return resolveTurn(s, {}, 42).newState;
    };
    const despotisme = run('despotisme');
    const communisme = run('communisme');
    expect(communisme.cities['c1']!.production!.progress).toBe(
      Math.round(despotisme.cities['c1']!.production!.progress * 1.5),
    );
    expect(communisme.cities['c1']!.production!.progress).toBeGreaterThan(despotisme.cities['c1']!.production!.progress);
  });

  it('Communisme : culture des Temples/Cathédrales = 0 ; Monarchie : culture du Palais ×2 (R-113 amendée)', () => {
    const city = { pop: 5, buildings: ['palais', 'temple'], capital: true, wonders: [] };
    expect(cultureGains(city)).toBe(1 + 5); // Palais 1 + Temple 1×5
    expect(cultureGains(city, 0, [], { zeroTempleCulture: true })).toBe(1); // Temples annulés
    expect(cultureGains(city, 0, [], { palaceCultureMult: 2 })).toBe(2 + 5); // Palais ×2
    expect(cultureGains(city, 0, [], { zeroTempleCulture: true, palaceCultureMult: 2 })).toBe(2);
  });

  it('Magna Carta : Tribunal = +1 culture/tour (ville hôte, R-125)', () => {
    const withTribunal = { pop: 1, buildings: ['tribunal'], capital: false, wonders: ['magna_carta'] };
    expect(cultureGains(withTribunal)).toBe(1);
    const sansTribunal = { pop: 1, buildings: [], capital: false, wonders: ['magna_carta'] };
    expect(cultureGains(sansTribunal)).toBe(0);
    // Sans merveille, le Tribunal ne produit rien (données : magna_carta n'a
    // pas d'obsoleteBy — l'effet ne s'éteint pas).
    expect(cultureGains({ pop: 1, buildings: ['tribunal'], capital: false, wonders: [] })).toBe(0);
  });

  it('Himeji : +1 Attaque à toutes les unités de l’empire (R-125 — valeur du doc d’Erik)', () => {
    const cities = [
      { owner: 'p1', wonders: ['chateau_himeji'] },
      { owner: 'p2', wonders: [] },
    ];
    expect(wonderAttackBonusEmpireOf(cities, 'p1', [])).toBe(1);
    expect(wonderAttackBonusEmpireOf(cities, 'p2', [])).toBe(0);
    // Obsolète (Communisme) : plus d’effet.
    expect(wonderAttackBonusEmpireOf(cities, 'p1', ['communisme'])).toBe(0);
  });

  it('Oracle : combatOdds expose p = S_att²/(S_att²+S_def²) (R-125 — pré-confirmation UI)', () => {
    expect(combatOdds(2, 2)).toBe(0.5);
    expect(combatOdds(0, 1)).toBe(0);
  });
});

describe('R-122 · Transitions et Anarchie', () => {
  it('SetGovernment : refus sans tech, refus régime déjà actif', () => {
    const state = makeState();
    expect(applySetGovernment(state, 'p1', 'monarchie').ok).toBe(false);
    expect(applySetGovernment(state, 'p1', 'despotisme')).toMatchObject({
      ok: false,
      reason: 'régime déjà actif',
    });
  });

  it('transition manuelle = régime actif immédiat + Anarchie 1 tour (anarchyUntil = tour + T-29)', () => {
    const state = makeState();
    state.players['p1']!.techsUnlocked = ['code_des_lois'];
    const result = applySetGovernment(state, 'p1', 'republique');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anarchy).toBe(true);
    expect(result.state.players['p1']!.government).toBe('republique');
    expect(result.state.players['p1']!.anarchyUntil).toBe(state.turn + ANARCHY_TURNS);
  });

  it('adoption SANS Anarchie à la complétion de la tech (fenêtre techsUnlockedThisTurn, conseiller)', () => {
    const state = makeState();
    state.players['p1']!.techsUnlocked = ['code_des_lois'];
    state.players['p1']!.techsUnlockedThisTurn = ['code_des_lois'];
    const result = applySetGovernment(state, 'p1', 'republique');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anarchy).toBe(false);
    expect(result.state.players['p1']!.anarchyUntil).toBeNull();
  });

  it('Grande Pyramide : accès à tous les régimes sans tech (R-125)', () => {
    const state = makeState({ cities: [{ owner: 'p1', q: 2, r: 2, capital: true, wonders: ['grande_pyramide'] }] });
    const result = applySetGovernment(state, 'p1', 'monarchie');
    expect(result.ok).toBe(true);
  });

  it('SetGovernment REFUSÉ pendant l’Anarchie (interprétation tranchée, R-122)', () => {
    const state = makeState();
    state.players['p1']!.techsUnlocked = ['code_des_lois', 'monarchie'];
    const first = applySetGovernment(state, 'p1', 'republique');
    expect(first.ok).toBe(true);
    const second = applySetGovernment(first.ok ? first.state : state, 'p1', 'monarchie');
    expect(second).toMatchObject({ ok: false, reason: 'changement impossible pendant l’Anarchie' });
  });

  it('isInAnarchy : la résolution du tour courant est paralysée, la suivante non', () => {
    const player = { anarchyUntil: 3 } as never;
    expect(isInAnarchy(player, 2)).toBe(true);
    expect(isInAnarchy(player, 3)).toBe(false);
  });

  it('e2e même seed : pendant l’Anarchie, or/science/marteaux/culture À ZÉRO, production gelée, GP gelés', () => {
    const setup = (anarchy: boolean) => {
      const s = productionState('republique');
      s.players['p1']!.techsUnlocked = ['code_des_lois', 'rites_funeraires'];
      s.players['p1']!.greatPersonsByType = { batisseur: 0 };
      s.cities['c1']!.production = { item: { kind: 'building', id: 'temple' }, progress: 0 };
      s.cities['c1']!.gpAccumProd = 19; // juste sous le seuil T-30
      s.cities['c1']!.gpAccumScience = 19;
      s.cities['c1']!.gpAccumGold = 19;
      s.cities['c1']!.cultureStored = 19; // juste sous le seuil T-27
      s.players['p1']!.anarchyUntil = anarchy ? s.turn + 1 : null; // anarchie PENDANT la résolution ?
      return s;
    };
    const anarchie = resolveTurn(setup(true), {}, 42).newState;
    const temoin = resolveTurn(setup(false), {}, 42).newState;
    expect(anarchie.players['p1']!.gold).toBe(0);
    expect(anarchie.cities['c1']!.production!.progress).toBe(0);
    expect(anarchie.cities['c1']!.cultureStored).toBe(19); // figé (gains nuls), pas remis à zéro
    expect(anarchie.cities['c1']!.gpAccumProd).toBe(19); // gelés (gains nuls)
    expect(anarchie.cities['c1']!.gpAccumGold).toBe(19);
    // Témoin (despotisme, pas d’anarchie) : tout progresse, aucun GP spawn.
    expect(temoin.players['p1']!.gold).toBeGreaterThan(0);
    expect(temoin.cities['c1']!.production!.progress).toBeGreaterThan(0);
    expect(temoin.cities['c1']!.cultureStored).toBeGreaterThan(0);
  });

  it('e2e : après l’Anarchie (tour suivant), les rendements reprennent', () => {
    const s = productionState('republique');
    s.players['p1']!.anarchyUntil = s.turn; // anarchie TERMINÉE
    const out = resolveTurn(s, {}, 42).newState;
    expect(out.players['p1']!.gold).toBeGreaterThan(0);
  });
});

describe('R-123 · GP restants (Scientifique, Mogul, Ingénieur, Leader)', () => {
  it('T-30 : seuil de base 20, ×2 par GP de CE type obtenu (escalade par type indépendante)', () => {
    expect(yieldGpThresholdFor('savant', {})).toBe(20);
    expect(yieldGpThresholdFor('savant', { savant: 1 })).toBe(40);
    expect(yieldGpThresholdFor('explorateur', { explorateur: 2 })).toBe(80);
    // L’escalade culturelle (T-27) est indépendante des GP à rendement.
    expect(greatPersonThresholdFor(0)).toBe(20);
    expect(leaderGpVictoriesNeeded()).toBe(20); // T-31
  });

  it('spawn du Scientifique au seuil de son accumulateur, par ville (même seed)', () => {
    const s = productionState();
    s.cities['c1']!.gpAccumScience = 20;
    const result = resolveTurn(s, {}, 42);
    const spawned = result.events.find((e) => e.type === 'GreatPersonSpawned');
    expect(spawned).toBeDefined();
    if (spawned?.type !== 'GreatPersonSpawned') return;
    expect(spawned.unitType).toBe('savant');
    // 7k · C2 (veto d'Erik du 04/09, révision R-126) : un GP d'ACCUMULATEUR
    // (canal science) ne compte PAS de jalon culturel.
    expect(result.newState.players['p1']!.cultureMilestones).toBe(0);
    expect(result.newState.players['p1']!.greatPersonsByType['savant']).toBe(1);
    expect(Object.values(result.newState.units).some((u) => u.type === 'savant')).toBe(true);
  });

  it('spawn du Mogul (or) et de l’Ingénieur (production) — ordre déterministe culture → science → or → production', () => {
    const s = productionState();
    s.cities['c1']!.gpAccumGold = 20;
    s.cities['c1']!.gpAccumProd = 20;
    const result = resolveTurn(s, {}, 42);
    const spawned = result.events.filter((e) => e.type === 'GreatPersonSpawned');
    expect(spawned).toHaveLength(1); // au plus un GP par ville et par tour
    if (spawned[0]?.type !== 'GreatPersonSpawned') return;
    expect(spawned[0]!.unitType).toBe('explorateur'); // l’or passe avant la production
  });

  it('un GP au seuil exact re-substrait le seuil (le surplus est conservé, miroir R-63)', () => {
    const s = productionState();
    s.cities['c1']!.gpAccumScience = 25;
    const out = resolveTurn(s, {}, 42).newState;
    expect(out.cities['c1']!.gpAccumScience).toBe(5);
  });

  it('7k · C2 (rév. R-126) : un GP d’accumulateur n’accorde AUCUN jalon — ni à l’obtention ni au settle', () => {
    const s = productionState();
    s.cities['c1']!.gpAccumScience = 20;
    const first = resolveTurn(s, {}, 42).newState;
    const mileAtObtain = first.players['p1']!.cultureMilestones;
    expect(mileAtObtain).toBe(0); // 7k · C2 : pas de jalon hors canal culture
    const gp = Object.values(first.units).find((u) => u.type === 'savant')!;
    const second = resolveTurn(first, { p1: [{ type: 'InstallPerson', unitId: gp.id, cityId: 'c1' }] }, 42);
    expect(second.events.some((e) => e.type === 'InstallPerson')).toBe(true);
    expect(second.newState.players['p1']!.cultureMilestones).toBe(mileAtObtain); // pas de re-compte
    expect(Object.values(second.newState.cities).some((c) => c.settledGreatPersons.includes('savant'))).toBe(true);
  });

  it('Leader : spawn sur la capitale à T-31 victoires de combat de l’empire', () => {
    const s = productionState();
    s.players['p1']!.combatVictories = 20;
    const result = resolveTurn(s, {}, 42);
    const spawned = result.events.find((e) => e.type === 'GreatPersonSpawned');
    if (spawned?.type !== 'GreatPersonSpawned') throw new Error('Leader attendu');
    expect(spawned.unitType).toBe('leader');
    expect(spawned.at).toEqual({ q: 2, r: 2 }); // case de la capitale
    expect(result.newState.players['p1']!.greatPersonsByType['leader']).toBe(1);
  });

  it('Pas de second Leader : le seuil T-31 est FIXE (interprétation documentée)', () => {
    // T-31 n'a pas d'escalade ×2 (contrairement aux accumulateurs T-30) : le
    // moteur garde le spawn unique via `(greatPersonsByType.leader ?? 0) > 0`.
    expect(leaderGpVictoriesNeeded()).toBe(20);
  });

  it('les compteurs de combat s’incrémentent au coup fatal (T-31, même seed)', () => {
    // Un guerrier p1 attaque un guerrier barbare… non : scénario déterministe
    // — la mécanique recordCombatVictory est exercée par le scénario e2e
    // (victoires via villages/combats) ; ici on vérifie l’état initial.
    const s = productionState();
    expect(s.players['p1']!.combatVictories).toBe(0);
  });
});

describe('R-124 · Victoire scientifique (Vaisseau spatial)', () => {
  it('les 4 composants contrôlés → Launch + Victory(reason: science)', () => {
    const s = productionState();
    s.cities['c1']!.buildings = [
      'palais',
      'vaisseau_habitation',
      'vaisseau_support_vie',
      'vaisseau_carburant',
    ];
    // Le 4e composant est construit dans une seconde ville (villes quelconques).
    s.cities['c2'] = {
      id: 'c2',
      q: 4,
      r: 2,
      owner: 'p1',
      pop: 1,
      capital: false,
      foodStored: 0,
      production: null,
      workedTiles: [],
      buildings: ['vaisseau_propulsion'],
      conversion: 'gold',
      cultureStored: 0,
      wonders: [],
      gpAccumGold: 0,
      gpAccumScience: 0,
      gpAccumProd: 0, gpAccumFood: 0, pendingSalvage: 0, settledGreatPersons: [],
    };
    const result = resolveTurn(s, {}, 42);
    expect(result.events.some((e) => e.type === 'Launch' && e.player === 'p1')).toBe(true);
    expect(result.events.some((e) => e.type === 'Victory' && e.reason === 'science')).toBe(true);
    expect(result.newState.winner).toBe('p1');
  });

  it('3 composants sur 4 : pas de lancement', () => {
    const s = productionState();
    s.cities['c1']!.buildings = ['palais', 'vaisseau_habitation', 'vaisseau_support_vie', 'vaisseau_carburant'];
    const result = resolveTurn(s, {}, 42);
    expect(result.events.some((e) => e.type === 'Launch')).toBe(false);
    expect(result.newState.winner).toBeNull();
  });

  it('les composants du vaisseau sont DÉRIVÉS des villes (capture = perte, R-66)', () => {
    const s = productionState();
    s.cities['c1']!.buildings = [
      'palais',
      'vaisseau_habitation',
      'vaisseau_support_vie',
      'vaisseau_carburant',
      'vaisseau_propulsion',
    ];
    expect(Object.values(s.cities).flatMap((c) => c.buildings).filter((b) => b.startsWith('vaisseau_'))).toHaveLength(4);
  });
});

describe('Migration v11 → v12 (Phase 7h)', () => {
  it('champs additifs par joueur et par ville, idempotent', () => {
    const v11 = {
      schemaVersion: 11,
      turn: 5,
      players: {
        p1: { id: 'p1', gold: 0, techsUnlocked: ['code_des_lois'] },
        p2: { id: 'p2', gold: 3 },
      },
      cities: { c1: { id: 'c1', q: 0, r: 0, wonders: ['stonehenge'] } },
    };
    const out = migrateState(v11 as unknown as Record<string, unknown>) as unknown as GameState;
    expect(out.schemaVersion).toBe(14);
    expect(out.players['p1']!.government).toBe('despotisme');
    expect(out.players['p1']!.anarchyUntil).toBeNull();
    expect(out.players['p1']!.greatPersonsByType).toEqual({});
    expect(out.players['p1']!.combatVictories).toBe(0);
    expect(out.players['p1']!.techsUnlockedThisTurn).toEqual([]);
    expect(out.players['p1']!.techsUnlocked).toEqual(['code_des_lois']); // contenu conservé
    expect(out.players['p2']!.gold).toBe(3);
    expect(out.cities['c1']!.gpAccumGold).toBe(0);
    expect(out.cities['c1']!.gpAccumScience).toBe(0);
    expect(out.cities['c1']!.gpAccumProd).toBe(0);
    expect(out.cities['c1']!.wonders).toEqual(['stonehenge']);
    // Idempotent.
    expect(migrateState(out as unknown as Record<string, unknown>)).toEqual(out);
  });
});

describe('Scénario e2e L4-1 (handoff) — chaîne complète des gouvernements', () => {
  it('République (colon 1 pop) → Monarchie (palais ×2) → Anarchie → Fondamentalisme → Communisme → 4 composants → Launch → victoire', () => {
    // 1. République : le Colon coûte 1 pop (au lieu de 2).
    const republicState = (() => {
      const s = productionState('despotisme');
      s.players['p1']!.techsUnlocked = ['code_des_lois'];
      s.players['p1']!.government = 'republique';
      s.cities['c1']!.pop = 3;
      s.cities['c1']!.production = { item: { kind: 'unit', id: 'colon' }, progress: 20 };
      return s;
    })();
    const afterRepublic = resolveTurn(republicState, {}, 42).newState;
    expect(afterRepublic.cities['c1']!.pop).toBe(2); // 3 − 1 (république)
    expect(afterRepublic.players['p1']!.government).toBe('republique');

    // 2. Despotisme témoin : le même tour coûte 2 pop.
    const despotState = (() => {
      const s = productionState('despotisme');
      s.players['p1']!.techsUnlocked = ['code_des_lois'];
      s.cities['c1']!.pop = 3;
      s.cities['c1']!.production = { item: { kind: 'unit', id: 'colon' }, progress: 20 };
      return s;
    })();
    const afterDespot = resolveTurn(despotState, {}, 42).newState;
    expect(afterDespot.cities['c1']!.pop).toBe(1); // 3 − 2 (R-112)

    // 3. Monarchie : la culture du Palais est doublée.
    const monarchy = productionState('monarchie');
    const afterMonarchy = resolveTurn(monarchy, {}, 42).newState;
    const republicWitness = resolveTurn(productionState('republique'), {}, 42).newState;
    expect(afterMonarchy.cities['c1']!.cultureStored).toBe(republicWitness.cities['c1']!.cultureStored * 2);

    // 4. Fondamentalisme : bibliothèque nulle (couvert ci-dessus) — le régime
    // est adopté puis le bonus terrestre mesuré via landCombatBonus.
    const fundState = productionState('fondamentalisme');
    expect(landCombatBonus(effectsFor(fundState.players['p1']!), unitType('guerrier'), 'attack')).toBe(1);

    // 5. Communisme : marteaux +50 % (couvert ci-dessus).

    // 6. Les 4 composants → Launch → victoire scientifique.
    const ship = productionState('communisme');
    ship.cities['c1']!.buildings = [
      'palais',
      'vaisseau_habitation',
      'vaisseau_support_vie',
      'vaisseau_carburant',
      'vaisseau_propulsion',
    ];
    const final = resolveTurn(ship, {}, 42);
    expect(final.events.some((e) => e.type === 'Launch')).toBe(true);
    expect(final.newState.winner).toBe('p1');
    expect(final.events.some((e) => e.type === 'Victory' && e.reason === 'science')).toBe(true);
  });
});
