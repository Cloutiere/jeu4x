/**
 * JEV-ESCORTE (canon Erik 12/11, prod D3UUQJ) — tests FIRST.
 *
 * Le canon : « un colon qui sort seul est un gâchis » — MAIS le colon seul
 * reste acceptable si le déploiement est PEU RISQUÉ (site exploré, ennemis
 * incapables d'atteindre). Le colon seul n'est pas un interdit : c'est un
 * pari, et un pari s'évalue — déterministe, data-driven (bot.json `escort`),
 * portée de MARCHE RÉELLE au BFS (pas à vol d'oiseau).
 *
 * Le cas déclencheur D3UUQJ : colon en production dès t3, guerrier suicidé
 * t5, production JAMAIS pivotée, colon sorti t19 SEUL sans escorte.
 *
 * Décisions (canon 12/11) :
 *   D1 colon en file/sorti autorisé si risque FAIBLE OU escorte en place ;
 *   D2 risque ÉLEVÉ ET 0 combattante → PIVOT guerrier ;
 *   D3 escorte en place = combattante dédiée disponible ou adjacente ;
 *   D4 colon déjà sorti, risque montant → RAPPEL (miroir du D3 exploration) ;
 *   D5 site en brume → risque majoré ;
 *   D6 Jev garde ses questions — le moteur décide AU-DESSUS de Jev.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { BARBARIAN_ID } from '../src/data.js';
import { CONVERSION_DEFAULT } from '../src/conversion.js';
import {
  deciderProductionColon,
  doitRappelerColon,
  escortColonDuBot,
  escorteEnPlace,
  risqueDeploiementColon,
  siteColonParDefaut,
} from '../src/escortColon.js';
import type { GameState } from '../src/state.js';

const SITE = { q: 5, r: 5 };
const ROUTE = [
  { q: 2, r: 2 },
  { q: 3, r: 3 },
  { q: 4, r: 4 },
  { q: 5, r: 5 },
];

/** Empire paisible : capitale + colon, AUCUN ennemi connu. */
function etatPaisible(seed = 42): GameState {
  return makeState({
    players: ['jev', 'p2'],
    rngSeed: seed,
    cities: [{ id: 'cap', q: 0, r: 0, owner: 'jev', capital: true, pop: 2 }],
    units: [
      { id: 'col', type: 'colon', owner: 'jev', q: 0, r: 0 },
      { id: 'p2a', type: 'guerrier', owner: 'p2', q: 7, r: 7 },
    ],
  });
}

describe('JEV-ESCORTE · table data-driven', () => {
  it('la table escort existe dans bot.json (rayons tunables, zéro durcissement)', () => {
    const d = escortColonDuBot();
    expect(d.toursEnnemi).toBe(3); // portée de marche : ≤ 3 tours
    expect(d.campDistMax).toBe(3); // les satellites sortent — D3UUQJ
    expect(d.influenceRouteDist).toBe(2);
    expect(d.pivotUnit).toBe('guerrier');
  });
});

describe('JEV-ESCORTE · risqueDeploiementColon (déterministe, BFS)', () => {
  it('site exploré, aucun ennemi à portée → risque FAIBLE (le canon Erik : pas un interdit)', () => {
    const state = etatPaisible();
    const risque = risqueDeploiementColon(state, 'jev', SITE, ROUTE);
    expect(risque.niveau).toBe('faible');
    expect(risque.facteurs).toEqual([]);
  });

  it('camp barbare connu à dist ≤ 3 du site → risque ÉLEVÉ (les satellites sortent — D3UUQJ)', () => {
    const state = etatPaisible();
    state.villages.push({ id: 'v1', q: 5, r: 2, spawnCountdown: 2, spawnedUnits: [] } as never);
    const risque = risqueDeploiementColon(state, 'jev', SITE, ROUTE);
    expect(risque.niveau).toBe('eleve');
    expect(risque.facteurs).toContain('campBarbareProche');
  });

  it('camp barbare à dist > campDistMax → pas ce facteur', () => {
    const state = etatPaisible();
    state.villages.push({ id: 'v1', q: 5, r: 0, spawnCountdown: 2, spawnedUnits: [] } as never); // dist 5
    const risque = risqueDeploiementColon(state, 'jev', SITE, ROUTE);
    expect(risque.facteurs).not.toContain('campBarbareProche');
  });

  it('unité ennemie capable d’atteindre le SITE en ≤ 3 tours de marche (BFS) → risque ÉLEVÉ', () => {
    const state = etatPaisible();
    // Satellite barbare à dist 3 du site, movement 1 : portée 3 tours = 3 cases.
    state.units['sat'] = {
      id: 'sat', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 2,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: false, aboard: null, cargo: null, stabilized: true,
    };
    const risque = risqueDeploiementColon(state, 'jev', SITE, ROUTE);
    expect(risque.niveau).toBe('eleve');
    expect(risque.facteurs).toContain('uniteAtteintSite');
  });

  it('unité ennemie trop loin (dist 4, portée 3) mais SUR la route (influence ≤ 2) → route compromise', () => {
    const state = etatPaisible();
    state.units['sat'] = {
      id: 'sat', type: 'guerrier', owner: BARBARIAN_ID, q: 1, r: 1,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: false, aboard: null, cargo: null, stabilized: true,
    };
    const risque = risqueDeploiementColon(state, 'jev', SITE, ROUTE);
    expect(risque.niveau).toBe('eleve');
    expect(risque.facteurs).toContain('uniteAtteintRoute'); // (3,3) à portée 3 via BFS
    expect(risque.facteurs).toContain('routeInfluence'); // dist 2 du tile (3,3)
    expect(risque.facteurs).not.toContain('uniteAtteintSite'); // site à dist 8 : hors portée
  });

  it('site jamais exploré (tile absent de la carte connue) → risque MAJORÉ (D5)', () => {
    const state = etatPaisible();
    delete state.map['5,5']; // brume : le site n'existe pas dans l'état connu
    const risque = risqueDeploiementColon(state, 'jev', SITE, ROUTE);
    expect(risque.niveau).toBe('eleve');
    expect(risque.facteurs).toContain('siteBrume');
  });

  it('déterminisme : 30 seeds → même verdict, même liste de facteurs', () => {
    const reference = (() => {
      const s = etatPaisible(0);
      s.villages.push({ id: 'v1', q: 5, r: 2, spawnCountdown: 2, spawnedUnits: [] } as never);
      return risqueDeploiementColon(s, 'jev', SITE, ROUTE);
    })();
    for (let seed = 1; seed < 30; seed++) {
      const s = etatPaisible(seed);
      s.villages.push({ id: 'v1', q: 5, r: 2, spawnCountdown: 2, spawnedUnits: [] } as never);
      const r = risqueDeploiementColon(s, 'jev', SITE, ROUTE);
      expect(r).toEqual(reference);
    }
  });
});

describe('JEV-ESCORTE · escorte en place (D3)', () => {
  it('combattante ADJACENTE au colon = escorte effective', () => {
    const state = etatPaisible();
    state.units['g1'] = {
      id: 'g1', type: 'guerrier', owner: 'jev', q: 1, r: 0,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: false, aboard: null, cargo: null, stabilized: true,
    };
    const colon = state.units['col']!;
    expect(escorteEnPlace(state, 'jev', colon)).toBe(true);
  });

  it('combattante dédiée DISPONIBLE (hors garnison) = escorte en place', () => {
    const state = etatPaisible();
    state.units['g1'] = {
      id: 'g1', type: 'guerrier', owner: 'jev', q: 7, r: 0,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: false, aboard: null, cargo: null, stabilized: true,
    };
    const colon = state.units['col']!;
    expect(escorteEnPlace(state, 'jev', colon)).toBe(true);
  });

  it('la GARNISON fortifiée de la capitale n’est pas une escorte disponible', () => {
    const state = etatPaisible();
    state.units['g1'] = {
      id: 'g1', type: 'guerrier', owner: 'jev', q: 0, r: 0,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: true, aboard: null, cargo: null, stabilized: true,
    };
    const colon = state.units['col']!;
    expect(escorteEnPlace(state, 'jev', colon)).toBe(false);
  });
});

describe('JEV-ESCORTE · deciderProductionColon (D1/D2 — le cas D3UUQJ)', () => {
  it('D3UUQJ reconstitué : 0 combattante, camp connu à portée → PIVOT guerrier (rouge avant fix)', () => {
    const state = etatPaisible();
    state.villages.push({ id: 'v1', q: 5, r: 2, spawnCountdown: 2, spawnedUnits: [] } as never);
    const verdict = deciderProductionColon(state, 'jev', SITE, ROUTE);
    expect(verdict.decision).toBe('pivot');
    if (verdict.decision === 'pivot') expect(verdict.pivot).toBe('guerrier');
  });

  it('risque faible → colon seul AUTORISÉ (le canon Erik, pas un interdit aveugle)', () => {
    const state = etatPaisible();
    const verdict = deciderProductionColon(state, 'jev', SITE, ROUTE);
    expect(verdict.decision).toBe('autorise');
  });

  it('risque élevé MAIS escorte en place → colon AUTORISÉ (D3)', () => {
    const state = etatPaisible();
    state.villages.push({ id: 'v1', q: 5, r: 2, spawnCountdown: 2, spawnedUnits: [] } as never);
    state.units['g1'] = {
      id: 'g1', type: 'guerrier', owner: 'jev', q: 1, r: 0,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: false, aboard: null, cargo: null, stabilized: true,
    };
    const verdict = deciderProductionColon(state, 'jev', SITE, ROUTE);
    expect(verdict.decision).toBe('autorise');
  });

  it('risque élevé, combattantes toutes en GARNISON → ATTENDRE (le colon ne sort pas, pas de pivot aveugle)', () => {
    const state = etatPaisible();
    state.villages.push({ id: 'v1', q: 5, r: 2, spawnCountdown: 2, spawnedUnits: [] } as never);
    state.units['g1'] = {
      id: 'g1', type: 'guerrier', owner: 'jev', q: 0, r: 0,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: true, aboard: null, cargo: null, stabilized: true,
    };
    const verdict = deciderProductionColon(state, 'jev', SITE, ROUTE);
    expect(verdict.decision).toBe('attendre');
  });
});

describe('JEV-ESCORTE · rappel du colon déjà sorti (D4)', () => {
  it('colon sur la route, nouvel ennemi connu qui la compromise, pas d’escorte adjacente → RAPPEL', () => {
    const state = etatPaisible();
    const colon = state.units['col']!;
    colon.q = 2;
    colon.r = 2; // sorti, en route vers (5,5)
    state.units['sat'] = {
      id: 'sat', type: 'guerrier', owner: BARBARIAN_ID, q: 1, r: 1,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: false, aboard: null, cargo: null, stabilized: true,
    };
    expect(doitRappelerColon(state, 'jev', colon, ROUTE)).toBe(true);
  });

  it('escorte ADJACENTE au colon en route → pas de rappel', () => {
    const state = etatPaisible();
    const colon = state.units['col']!;
    colon.q = 2;
    colon.r = 2;
    state.units['sat'] = {
      id: 'sat', type: 'guerrier', owner: BARBARIAN_ID, q: 1, r: 1,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: false, aboard: null, cargo: null, stabilized: true,
    };
    state.units['g1'] = {
      id: 'g1', type: 'guerrier', owner: 'jev', q: 3, r: 2,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: false, aboard: null, cargo: null, stabilized: true,
    };
    expect(doitRappelerColon(state, 'jev', colon, ROUTE)).toBe(false);
  });

  it('colon DANS une ville (il attend déjà) → pas de rappel', () => {
    const state = etatPaisible();
    const colon = state.units['col']!; // (0,0) = capitale
    state.units['sat'] = {
      id: 'sat', type: 'guerrier', owner: BARBARIAN_ID, q: 1, r: 1,
      hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null,
      fortified: false, aboard: null, cargo: null, stabilized: true,
    };
    expect(doitRappelerColon(state, 'jev', colon, ROUTE)).toBe(false);
  });
});

describe('JEV-ESCORTE · siteColonParDefaut (approximation géométrique du bot)', () => {
  it('choisit la case praticable libre la plus proche de la ville (sans ville ni village)', () => {
    const state = etatPaisible();
    const site = siteColonParDefaut(state, state.cities['cap']!);
    expect(site).not.toBeNull();
    expect(site!.q === 0 && site!.r === 0).toBe(false); // jamais la ville elle-même
  });

  it('aucune case libre dans le rayon → null', () => {
    const state = makeState({ players: ['jev'], width: 3, height: 3, fill: 'eau' });
    state.cities['cap'] = {
      id: 'cap', q: 1, r: 1, owner: 'jev', pop: 1, capital: true, foodStored: 0,
      production: null, queue: [], workedTiles: [], buildings: [], conversion: CONVERSION_DEFAULT,
      cultureCumulee: 0, wonders: [], pendingSalvage: 0, settledGreatPersons: [], wasCaptured: false,
    };
    state.map['1,1'] = { terrain: 'ville', resource: null };
    expect(siteColonParDefaut(state, state.cities['cap']!)).toBeNull();
  });
});
