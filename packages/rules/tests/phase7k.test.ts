/**
 * Phase 7k — Merveilles du Monde : règles canoniques M1–M4, effets des
 * merveilles restantes, corrections 7j C1–C3, migration v14 (RULES.md §8.9,
 * R-128..R-133 ; doc d'Erik « Merveilles et Personnages » — elle fait foi).
 * Chaque test cite son identifiant de règle ou le doc/veto correspondant.
 */
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  TECHS,
  allKnownTechs,
  cityCultureMultOf,
  cityGoldMultOf,
  cultureGains,
  isWonderObsolete,
  migrateState,
  resolveTurn,
  wonderBlocksEnemyAttacks,
  wonderProductionIssue,
} from '../src/index.js';
import { makeState } from '../src/fixtures.js';
import type { GameState } from '../src/index.js';

/** Capitale p1 avec production de merveille prête à être complétée. */
function wonderState(opts: {
  owner?: 'p1' | 'p2';
  wonder: string;
  progress?: number;
  techs?: string[];
}): GameState {
  const owner = opts.owner ?? 'p1';
  return makeState({
    cities: [
      { owner, q: 2, r: 2, capital: true, pop: 1, production: { item: { kind: 'wonder', id: opts.wonder }, progress: opts.progress ?? 999 } },
    ],
  });
}

describe('7k · M1/R-128 — obsolescence GLOBALE (doc : « dès qu’UNE civilisation découvre sa technologie d’obsolescence »)', () => {
  it('une tech découverte par l’ADVERSAIRE éteint MA merveille (effet moteur retiré)', () => {
    // Stonehenge (×1,5 Temples) — l'adversaire p2 découvre Littératie.
    const state = makeState({
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 2, buildings: ['palais', 'temple'], wonders: ['stonehenge'] }],
    });
    state.players['p2']!.techsUnlocked = ['litteratie'];
    const before = resolveTurn(structuredClone(state), {}, 42).newState.cities['c1']!.cultureStored;
    // Sans l'obsolescence adverse, 2 pop × Temple 1 × 1,5 = 3 + Palais 1 = 4 ;
    // avec l'obsolescence GLOBALE : 2 × 1 + 1 = 3.
    expect(before).toBe(3);
    // Contre-épreuve : sans la tech adverse, l'effet vit.
    const alive = structuredClone(state);
    alive.players['p2']!.techsUnlocked = [];
    expect(resolveTurn(alive, {}, 42).newState.cities['c1']!.cultureStored).toBe(4);
  });

  it('l’union des technologies (allKnownTechs) fait foi pour isWonderObsolete', () => {
    const state = makeState({});
    state.players['p2']!.techsUnlocked = ['litteratie'];
    const union = allKnownTechs(state);
    expect(union).toContain('litteratie');
    expect(isWonderObsolete('stonehenge', union)).toBe(true);
    expect(isWonderObsolete('stonehenge', state.players['p1']!.techsUnlocked)).toBe(false); // ancien modèle (propriétaire seul)
  });

  it('la CULTURE générée et le JALON de la merveille sont conservés après obsolescence (doc explicite)', () => {
    const state = makeState({
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 1, buildings: ['palais'], wonders: ['stonehenge'] }],
    });
    state.players['p1']!.cultureMilestones = 1; // jalon de la merveille
    state.players['p2']!.techsUnlocked = ['litteratie']; // Stonehenge obsolète GLOBALEMENT
    const out = resolveTurn(state, {}, 42).newState;
    expect(out.players['p1']!.cultureMilestones).toBe(1); // jalon conservé (R-131)
    expect(out.cities['c1']!.cultureStored).toBeGreaterThan(0); // la culture de la cité continue (Palais)
  });

  it('Grande Muraille : le helper pur évalue l’obsolescence sur l’union (tech adverse = protection levée)', () => {
    const muraille = makeState({
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 1, wonders: ['grande_muraille'] }],
    });
    expect(wonderBlocksEnemyAttacks(Object.values(muraille.cities), 'p1', allKnownTechs(muraille))).toBe(true);
    // M1/R-128 : dès que l'ADVERSAIRE découvre l'Ingénierie, la protection tombe.
    muraille.players['p2']!.techsUnlocked = ['ingenierie'];
    expect(wonderBlocksEnemyAttacks(Object.values(muraille.cities), 'p1', allKnownTechs(muraille))).toBe(false);
  });
});

describe('7k · M2/R-129 — exclusivité mondiale (doc : « qu’une seule fois par partie, toutes civilisations confondues »)', () => {
  it('une merveille complétée par le rival devient inconstructible (SetProduction refusé)', () => {
    const state = makeState({
      cities: [
        { owner: 'p1', q: 2, r: 2, capital: true, pop: 1 },
        { owner: 'p2', q: 5, r: 5, capital: true, pop: 1, wonders: ['stonehenge'] },
      ],
    });
    state.players['p1']!.techsUnlocked = []; // Stonehenge : sans tech
    const result = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'stonehenge' } }] }, 42);
    expect(result.newState.cities['c1']!.production).toBeNull(); // refusé
    // Libellé du refus (UI) :
    const issue = wonderProductionIssue('stonehenge', {
      techsUnlocked: [],
      worldWondersBuilt: ['stonehenge'],
      empireWondersBuilt: [],
      empireWondersInProduction: [],
      cultureMilestones: 0,
    });
    expect(issue).toContain('exclusivité mondiale');
  });

  it('complétion simultanée au même tour : la première ville (R-81, cityId croissant) valide, l’autre est un no-op', () => {
    const state = makeState({
      cities: [
        { owner: 'p2', q: 2, r: 2, capital: true, pop: 1, production: { item: { kind: 'wonder', id: 'stonehenge' }, progress: 50 } },
        { owner: 'p1', q: 5, r: 5, capital: true, pop: 1, production: { item: { kind: 'wonder', id: 'stonehenge' }, progress: 50 } },
      ],
    });
    const result = resolveTurn(state, {}, 42);
    const completions = result.events.filter((e) => e.type === 'WonderCompleted');
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({ cityId: 'c1', owner: 'p2' }); // c1 < c2 (R-81)
    expect(result.newState.players['p2']!.cultureMilestones).toBe(1);
    expect(result.newState.players['p1']!.cultureMilestones).toBe(0);
    expect(result.newState.cities['c2']!.wonders).toEqual([]);
    // Le perdant (p1) récupère ses marteaux (R-130).
    expect(result.newState.cities['c2']!.pendingSalvage).toBe(50);
  });
});

describe('7k · M3/R-130 — récupération des marteaux (doc : « réaffectés à un autre projet durant le même tour, sinon dissipés »)', () => {
  /** c1 (p2) complète Stonehenge ; c2 (p1) était en chantier à 30 marteaux. */
  function salvageState(): GameState {
    const state = makeState({
      cities: [
        { owner: 'p2', q: 2, r: 2, capital: true, pop: 1, production: { item: { kind: 'wonder', id: 'stonehenge' }, progress: 50 } },
        { owner: 'p1', q: 5, r: 5, capital: true, pop: 1, production: { item: { kind: 'wonder', id: 'stonehenge' }, progress: 30 } },
      ],
    });
    state.players['p1']!.techsUnlocked = ['rites_funeraires']; // Temple reprogrammable
    return state;
  }

  it('à la complétion du rival, mes marteaux basculent en récupération (HammerSalvage, pendingSalvage)', () => {
    const result = resolveTurn(salvageState(), {}, 42);
    const salvage = result.events.find((e) => e.type === 'HammerSalvage');
    expect(salvage).toMatchObject({ type: 'HammerSalvage', cityId: 'c2', owner: 'p1', wonder: 'stonehenge', amount: 30, outcome: 'available' });
    expect(result.newState.cities['c2']!.pendingSalvage).toBe(30);
    expect(result.newState.cities['c2']!.production).toBeNull();
  });

  it('réaffectation pendant la fenêtre : le nouveau projet démarre aux marteaux conservés', () => {
    const first = resolveTurn(salvageState(), {}, 42).newState;
    // p1 réaffecte vers un Temple (coût 40 🔶) pendant son tour suivant.
    const second = resolveTurn(first, { p1: [{ type: 'SetProduction', cityId: 'c2', item: { kind: 'building', id: 'temple' } }] }, 43);
    const prod = second.newState.cities['c2']!.production!;
    expect(prod.item).toEqual({ kind: 'building', id: 'temple' });
    expect(prod.progress).toBeGreaterThanOrEqual(30); // marteaux récupérés reportés (pop 1 : +1 marteau/tour au plus)
    expect(second.newState.cities['c2']!.pendingSalvage).toBe(0); // consommés
    expect(second.events.some((e) => e.type === 'HammerSalvage' && e.outcome === 'dissipated')).toBe(false);
  });

  it('sans réaffectation, les marteaux sont DISSIPÉS à la résolution suivante (fenêtre T-32 🔶 1 tour)', () => {
    const first = resolveTurn(salvageState(), {}, 42).newState;
    expect(first.cities['c2']!.pendingSalvage).toBe(30);
    const second = resolveTurn(first, {}, 43); // p1 ne fait rien
    const dissipated = second.events.find((e) => e.type === 'HammerSalvage');
    expect(dissipated).toMatchObject({ type: 'HammerSalvage', cityId: 'c2', owner: 'p1', amount: 30, outcome: 'dissipated' });
    expect(second.newState.cities['c2']!.pendingSalvage).toBe(0);
  });
});

describe('7k · M4/R-131 — merveille = jalon culturel (vérification)', () => {
  it('la complétion accorde +1 jalon (reason wonderBuilt) — compteur lu pour l’ONU (20 jalons)', () => {
    const state = wonderState({ wonder: 'stonehenge', progress: 50 });
    const result = resolveTurn(state, {}, 42);
    expect(result.events.some((e) => e.type === 'CultureMilestone' && e.reason === 'wonderBuilt' && e.delta === 1)).toBe(true);
    expect(result.newState.players['p1']!.cultureMilestones).toBe(1);
  });
});

describe('7k · R-132 — effets des merveilles restantes (valeurs du doc, tableau fait foi)', () => {
  it('Théâtre de Shakespeare : ×2 la Culture TOTALE de la cité (modèle Stonehenge généralisé)', () => {
    const city = { pop: 2, buildings: ['palais', 'temple'], capital: true, wonders: ['theatre_de_shakespeare'] };
    // Sans Théâtre : Palais 1 + Temple 1×2 = 3 ; avec : round(3 × 2) = 6.
    expect(cultureGains({ ...city, wonders: [] })).toBe(3);
    expect(cultureGains(city)).toBe(6);
    expect(cityCultureMultOf(city.wonders, [])).toBe(2);
  });

  it('Université d’Oxford : une tech aléatoire seedée R-80 — REJOUABLE au même seed (critère d’acceptation)', () => {
    const run = (seed: number) => {
      const state = wonderState({ wonder: 'universite_d_oxford', progress: 150 });
      state.players['p1']!.techsUnlocked = ['poterie'];
      const out = resolveTurn(state, {}, seed).newState;
      return out.players['p1']!.techsUnlocked;
    };
    const a = run(42);
    const b = run(42);
    expect(a.length).toBe(2); // poterie + une tech accordée
    expect(a).toEqual(b); // même seed → même tirage
    expect(a).toContain('poterie');
  });

  it('Cie des Indes : +1 Commerce sur chaque case océanique exploitée (bonus par terrain travaillé — modèle R-66)', () => {
    // Une ville côtière travaillant une case d'océan (rendement 0/0/2 → 0/0/3).
    const state = makeState({
      terrainOverrides: { '3,2': 'ocean' },
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 1, workedTiles: ['3,2'], wonders: ['compagnie_des_indes'] }],
    });
    const out = resolveTurn(state, {}, 42).newState;
    // Centre pop 1 = 0 commerce (tranche Ouvrier) ; océan 2 C (+1 Cie des Indes) = 3 or/tour ;
    // sans la merveille : 0 + 2 = 2 or.
    expect(out.players['p1']!.gold).toBe(3);
    const sans = structuredClone(state);
    sans.cities['c1']!.wonders = [];
    expect(resolveTurn(sans, {}, 42).newState.players['p1']!.gold).toBe(2);
  });

  it('Atelier de Léonard : met à niveau gratuitement les unités obsolètes (R-111 — guerrier → legion), EMPIRE du propriétaire', () => {
    const state = makeState({
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 1, production: { item: { kind: 'wonder', id: 'atelier_de_leonard' }, progress: 150 } }],
      units: [
        { id: 'uP1', type: 'guerrier', owner: 'p1', q: 3, r: 2, veteran: true },
        { id: 'uP2', type: 'guerrier', owner: 'p2', q: 5, r: 5 }, // hors empire : intact
      ],
    });
    state.players['p1']!.techsUnlocked = ['travail_du_fer']; // Guerrier obsolète (R-110)
    const result = resolveTurn(state, {}, 42);
    expect(result.events.some((e) => e.type === 'UnitsUpgraded')).toBe(true);
    expect(result.newState.units['uP1']!.type).toBe('legion');
    expect(result.newState.units['uP1']!.veteran).toBe(true); // vétéran conservé
    expect(result.newState.units['uP2']!.type).toBe('guerrier'); // p2 inchangé
  });

  it('Foire de Troyes : ×2 la part OR de la conversion R-90 de la cité ; cumul Internet : MAX (R-88 🔶)', () => {
    // Cité à 1 commerce (case de désert travaillée — le centre pop 1 ne donne
    // aucun commerce, tranche Ouvrier) en conversion or : 1 or → 2 or.
    const state = makeState({
      terrainOverrides: { '2,1': 'desert' },
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 1, workedTiles: ['2,1'], wonders: ['foire_de_troyes'] }],
    });
    expect(resolveTurn(state, {}, 42).newState.players['p1']!.gold).toBe(2);
    // Cumul Troyes + Internet : MAX ×2 (pas ×4).
    const both = structuredClone(state);
    both.cities['c1']!.wonders = ['foire_de_troyes', 'internet'];
    expect(resolveTurn(both, {}, 42).newState.players['p1']!.gold).toBe(2);
    expect(cityGoldMultOf(['foire_de_troyes'], [])).toBe(2);
  });

  it('Internet : ×2 la production d’Or de TOUTES les villes de l’empire', () => {
    const state = makeState({
      terrainOverrides: { '2,1': 'desert', '4,3': 'desert' },
      cities: [
        { owner: 'p1', q: 2, r: 2, capital: true, pop: 1, workedTiles: ['2,1'] },
        { owner: 'p1', q: 4, r: 4, pop: 1, workedTiles: ['4,3'] },
      ],
    });
    state.cities['c1']!.wonders = ['internet'];
    const out = resolveTurn(state, {}, 42).newState;
    expect(out.players['p1']!.gold).toBe(4); // 2 villes × 1 or ×2 (empire)
  });

  it('Complexe militaro-industriel : −20 % le coût de production des unités MILITAIRES (Colon exclu — production seule, 7l)', () => {
    const state = makeState({
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 3, wonders: ['complexe_militaro_industriel'] }],
    });
    state.cities['c1']!.workedTiles = ['2,1', '1,2', '3,2'];
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 7 };
    const result = resolveTurn(state, {}, 42);
    // Coût guerrier 10 → 8 (round(10 × 0,8)) : 7 + ≥1 marteau = 8 → produit.
    expect(result.events.some((e) => e.type === 'UnitProduced' && e.unitType === 'guerrier')).toBe(true);
    // Le Colon (pacifique) n'est PAS réduit : coût 20 plein.
    const colon = structuredClone(state);
    colon.cities['c1']!.production = { item: { kind: 'unit', id: 'colon' }, progress: 18 }; // 18+1 = 19 < 20 : pas acheve (aucune remise Colon)
    expect(resolveTurn(colon, {}, 42).events.some((e) => e.type === 'UnitProduced')).toBe(false);
  });

  it('Programme Apollo : accorde instantanément l’ENSEMBLE des technologies de l’arbre (doc fait foi 🔶)', () => {
    const state = wonderState({ wonder: 'programme_apollo', progress: 750 });
    const result = resolveTurn(state, {}, 42);
    expect(result.newState.players['p1']!.techsUnlocked.length).toBe(Object.keys(TECHS).length);
    // Conséquence canonique M1/R-128 : l'obsolescence globale frappe les merveilles.
    expect(isWonderObsolete('stonehenge', allKnownTechs(result.newState))).toBe(true); // Littératie accordée
  });

  it('Grande Bibliothèque : en 1v1 JAMAIS déclenchée (un seul rival — condition canonique ≥ 2 documentée)', () => {
    const state = makeState({
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 1, wonders: ['grande_bibliotheque'] }],
    });
    state.players['p2']!.techsUnlocked = ['alphabet', 'poterie']; // 1 seul rival
    const result = resolveTurn(state, {}, 42);
    expect(result.newState.players['p1']!.techsUnlocked).toEqual([]); // rien accordé
  });

  it('Grande Bibliothèque : accorde les techs découvertes par ≥ 2 rivaux (état synthétique 3 joueurs)', () => {
    const state = makeState({
      players: ['p1', 'p2', 'p3'],
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 1, wonders: ['grande_bibliotheque'] }],
    });
    state.players['p2']!.techsUnlocked = ['alphabet'];
    state.players['p3']!.techsUnlocked = ['alphabet', 'poterie'];
    const result = resolveTurn(state, {}, 42);
    expect(result.newState.players['p1']!.techsUnlocked).toEqual(['alphabet']); // poterie : 1 seul rival
    expect(result.events.some((e) => e.type === 'TechResearched' && e.player === 'p1' && e.tech === 'alphabet')).toBe(true);
  });
});

describe('7k · R-132 — Grande Muraille (décision d’Erik du 04/09, validée) : « l’adversaire ne peut pas attaquer tes unités ni tes villes »', () => {
  function murailleState(): GameState {
    const state = makeState({
      cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 1, wonders: ['grande_muraille'] }],
      units: [
        { id: 'uDef', type: 'guerrier', owner: 'p1', q: 4, r: 2 },
        { id: 'uAtt', type: 'guerrier', owner: 'p2', q: 5, r: 2 },
      ],
    });
    state.players['p2']!.techsUnlocked = ['maconnerie'];
    return state;
  }

  it('l’ordre Attack du rival contre une unité protégée est un fizzle SANS consommation de PM', () => {
    const state = murailleState();
    const result = resolveTurn(state, { p2: [{ type: 'Attack', unitId: 'uAtt', target: { q: 4, r: 2 } }] }, 42);
    expect(result.events.some((e) => e.type === 'Attack' || e.type === 'CombatExchange')).toBe(false);
    expect(result.newState.units['uDef']).toBeDefined();
    expect(result.newState.units['uAtt']!.mp).toBe(1); // PM intacts (movement Guerrier = 1)
    expect(result.newState.units['uAtt']!.q).toBe(5); // pas bougé
  });

  it('le rival ne peut pas ENTRER dans une ville protégée (capture bloquée, chemin gelé)', () => {
    const state = murailleState();
    state.units['uAtt']!.q = 3; // adjacent à la ville (2,2) — visible d'office
    state.units['uAtt']!.r = 2;
    const result = resolveTurn(state, { p2: [{ type: 'Move', unitId: 'uAtt', path: [{ q: 2, r: 2 }] }] }, 42);
    expect(result.newState.units['uAtt']!.q).toBe(3); // arrêt devant la ville
    expect(result.newState.cities['c1']!.owner).toBe('p1'); // pas de capture
    expect(result.events.some((e) => e.type === 'CityCaptured')).toBe(false);
  });

  it('le pas de mouvement vers une unité protégée s’arrête devant le défenseur (R-42, chemin conservé)', () => {
    const state = murailleState();
    state.units['uAtt']!.q = 3;
    state.units['uAtt']!.r = 2;
    const result = resolveTurn(state, { p2: [{ type: 'Move', unitId: 'uAtt', path: [{ q: 4, r: 2 }] }] }, 42);
    expect(result.newState.units['uAtt']!.q).toBe(3); // pas entré
    expect(result.newState.units['uDef']).toBeDefined();
  });

  it('l’obsolescence GLOBALE (Ingénierie découverte par QUI QUE CE SOIT) lève la protection', () => {
    const state = murailleState();
    state.players['p2']!.techsUnlocked = ['ingenierie']; // obsoleteBy de la Muraille — union des techs
    const result = resolveTurn(state, { p2: [{ type: 'Attack', unitId: 'uAtt', target: { q: 4, r: 2 } }] }, 42);
    expect(result.events.some((e) => e.type === 'Attack')).toBe(true); // l'attaque passe
  });

  it('le propriétaire de la Muraille attaque NORMALEMENT (pas de blocage symétrique)', () => {
    const state = murailleState();
    const result = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'uDef', target: { q: 5, r: 2 } }] }, 42);
    expect(result.events.some((e) => e.type === 'Attack')).toBe(true);
  });
});

describe('7k · R-133 (audit) — Magna Carta révisée : Tribunal +1 culture PAR CITOYEN (le doc tranche)', () => {
  it('+1 × population (révision du modèle 7h « à plat »)', () => {
    const city = { pop: 3, buildings: ['palais', 'tribunal'], capital: true, wonders: ['magna_carta'] };
    // Palais 1 + Tribunal 1×3 = 4.
    expect(cultureGains(city)).toBe(4);
    const sans = { ...city, wonders: [] };
    expect(cultureGains(sans)).toBe(1);
  });
});

describe('7k · Bloc 0 — C3 (veto d’Erik du 04/09) : un seul GP d’un même type installé par ville', () => {
  function c3State(): GameState {
    const state = makeState({ cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 3 }] });
    state.units['uGP1'] = {
      id: 'uGP1', type: 'savant', owner: 'p1', q: 3, r: 2, hp: 3, mp: 2,
      veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null,
    };
    return state;
  }

  it('le Settle d’une classe déjà installée est REFUSÉ (ordre ignoré, le GP reste en attente)', () => {
    const state = c3State();
    state.cities['c1']!.settledGreatPersons = ['savant'];
    const result = resolveTurn(state, { p1: [{ type: 'GreatPersonAction', unitId: 'uGP1', action: 'settle', cityId: 'c1' }] }, 42);
    expect(result.newState.units['uGP1']).toBeDefined(); // GP préservé
    expect(result.newState.cities['c1']!.settledGreatPersons).toEqual(['savant']); // pas de doublon
    expect(result.events.some((e) => e.type === 'InstallPerson')).toBe(false);
  });

  it('une AUTRE classe reste installable dans la même ville', () => {
    const state = c3State();
    state.units['uGP1']!.type = 'batisseur'; // classe différente
    state.cities['c1']!.settledGreatPersons = ['savant'];
    const result = resolveTurn(state, { p1: [{ type: 'GreatPersonAction', unitId: 'uGP1', action: 'settle', cityId: 'c1' }] }, 42);
    expect(result.newState.units['uGP1']).toBeUndefined(); // installé
    expect(result.newState.cities['c1']!.settledGreatPersons).toEqual(['savant', 'batisseur']);
  });
});

describe('7k · Migration v13 → v14 (R-130 — champ additif pendingSalvage, gpAccumFood dormant)', () => {
  it('ajoute pendingSalvage: 0, préserve gpAccumFood (compat saves), idempotent', () => {
    const v13 = {
      schemaVersion: 13,
      players: { p1: { id: 'p1' } },
      units: {},
      cities: { c1: { id: 'c1', q: 0, r: 0, owner: 'p1', gpAccumFood: 7 } },
    };
    const out = migrateState(v13 as unknown as Record<string, unknown>) as unknown as GameState;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.cities['c1']!.pendingSalvage).toBe(0); // additif
    expect(out.cities['c1']!.gpAccumFood).toBe(7); // conservé DORMANT (C1)
    const twice = migrateState(structuredClone(out) as unknown as Record<string, unknown>);
    expect(twice).toEqual(out);
  });
});
