/**
 * BOT-TB (décisions Erik 24/10) — le bot « gère son empire » : les arbitres
 * ÉCONOMIQUES remplacent le hasard. D1 : worked tiles au meilleur rendement
 * pondéré par le besoin (nourriture pour croître, marteaux en guerre /
 * production militaire, or si trésorerie basse — poids data-driven bot.json).
 * D2 : production pondérée (① militaire ② colon ③ bâtiments ④ merveille
 * ⑤ repli aléatoire). D3 : recherche ORIENTÉE (chaîne de prérequis complète
 * vers un objectif de profil). D4 : rush discipliné (item prioritaire +
 * réserve + trésorerie minimale). D5 : déterminisme (même seed ⇒ mêmes
 * ordres) et données (bloc `economie` + `objectifRecherche` ×3 profils).
 * D6 : les objectifs d'unité T-A sont intouchés (couverts par bot-ta /
 * bot-exploration / bot-fondation-mouvement).
 */
import { describe, expect, it } from 'vitest';
import {
  BARBARIAN_ID,
  BOT_SETTINGS,
  TECHS,
  createRng,
  growthThresholdFor,
  makeState,
} from '@game/rules';
import type { BotEconomieData, BotProfileData, City, GameState, TerrainId } from '@game/rules';
import {
  arbitrerProduction,
  botPolicy,
  ecoDuBot,
  planWorkedTiles,
  poidsVille,
  prochaineTech,
  profileDuBot,
  rushPrioritaire,
} from '../src/botPolicy.js';

const BOT = 'p2';
const HUMAN = 'p1';
const ECO = BOT_SETTINGS.economie;

function state(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number; hp?: number }>;
  cities?: Array<Partial<City> & { id: string; owner: string; q: number; r: number }>;
  terrainOverrides?: Record<string, TerrainId>;
  treasury?: number;
  techs?: string[];
  war?: boolean;
  villages?: Array<{ q: number; r: number }>;
}): GameState {
  const s = makeState({
    width: 8,
    height: 8,
    players: [HUMAN, BOT],
    warPairs: opts.war ? [[HUMAN, BOT]] : [],
    units: (opts.units ?? []).map((u) => ({ ...u, aboard: null, cargo: null })),
    cities: (opts.cities ?? []).map((c) => ({
      pop: 2,
      capital: true,
      workedTiles: [],
      buildings: [],
      ...c,
    })),
    ...(opts.terrainOverrides ? { terrainOverrides: opts.terrainOverrides } : {}),
    ...(opts.villages ? { villages: opts.villages } : {}),
    rngSeed: 42,
  }) as GameState;
  if (opts.treasury !== undefined) s.players[BOT]!.treasury = opts.treasury;
  if (opts.techs) s.players[BOT]!.techsUnlocked = [...opts.techs];
  return s;
}

function planOf(s: GameState, seed = 7) {
  return botPolicy(s, BOT, createRng(seed));
}

const tile = (q: number, r: number) => `${q},${r}`;

describe('BOT-TB · D5 — données (bot.json)', () => {
  it('le bloc economie porte les poids, seuils, ordre de bâtiments et techs clés', () => {
    expect(ECO.poidsNourriture).toBeGreaterThan(0);
    expect(ECO.poidsMarteaux).toBeGreaterThan(0);
    expect(ECO.poidsOr).toBeGreaterThan(0);
    expect(ECO.poidsMarteauxGuerre).toBeGreaterThan(ECO.poidsMarteaux);
    expect(ECO.reserveRush).toBeGreaterThan(1);
    expect(ECO.tresorerieMinimale).toBeGreaterThanOrEqual(0);
    expect(ECO.seuilPopColonne).toBeGreaterThanOrEqual(2);
    expect(ECO.ordreBatiments.length).toBeGreaterThan(3);
    expect(TECHS[ECO.techMilitaireCle]).toBeDefined();
    expect(TECHS[ECO.techEconomiqueCle]).toBeDefined();
    expect(ecoDuBot()).toEqual(ECO);
  });

  it('chaque profil porte un objectifRecherche valide', () => {
    for (const p of Object.values(BOT_SETTINGS.profiles) as BotProfileData[]) {
      expect(['militaire', 'economique', 'auto']).toContain(p.objectifRecherche);
    }
    expect(profileDuBot().objectifRecherche).toBe('auto');
  });
});

describe('BOT-TB · D1 — poids de besoin et plan de worked tiles', () => {
  const FORET = tile(2, 2);
  const P1 = tile(1, 3);
  const P2 = tile(3, 3);
  const overrides: Record<string, TerrainId> = { [FORET]: 'foret' };

  it('paix + trésorerie saine : nourriture d’abord (prairie 2N bat forêt 2P)', () => {
    const s = state({
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
      terrainOverrides: overrides,
      treasury: 100,
    });
    const poids = poidsVille(s, s.cities['c1']!, s.players[BOT]!, ecoDuBot(), false);
    expect(poids).toEqual({ food: ECO.poidsNourriture, production: ECO.poidsMarteaux, commerce: 0 });
    const plan = planWorkedTiles(s, s.cities['c1']!, s.players[BOT]!, poids);
    expect(plan).toHaveLength(2);
    // toutes les prairies ex æquo (2N ⇒ score 6) : FORET (2P ⇒ 4) exclue,
    // tie-break clé croissant — les deux choisies sont des prairies.
    expect(plan).not.toContain(FORET);
    expect(plan.every((k) => k !== FORET)).toBe(true);
    expect(plan).toHaveLength(2);
  });

  it('production militaire en tête de file : marteaux pondérés (forêt gagne)', () => {
    const s = state({
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, production: { item: { kind: 'unit', id: 'guerrier' }, progress: 0 } }],
      terrainOverrides: overrides,
      treasury: 100,
    });
    const poids = poidsVille(s, s.cities['c1']!, s.players[BOT]!, ecoDuBot(), false);
    expect(poids.production).toBe(ECO.poidsMarteauxGuerre);
    const plan = planWorkedTiles(s, s.cities['c1']!, s.players[BOT]!, poids);
    expect(plan).toContain(FORET);
  });

  it('en guerre : poids marteaux de guerre (miroir data-driven)', () => {
    const s = state({
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3 }],
      treasury: 100,
      war: true,
    });
    const poids = poidsVille(s, s.cities['c1']!, s.players[BOT]!, ecoDuBot(), true);
    expect(poids.production).toBe(ECO.poidsMarteauxGuerre);
  });

  it('trésorerie basse : le commerce est pondéré (poidsOr)', () => {
    const s = state({
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3 }],
      treasury: ECO.seuilTresorerieBasse - 1,
    });
    const poids = poidsVille(s, s.cities['c1']!, s.players[BOT]!, ecoDuBot(), false);
    expect(poids.commerce).toBe(ECO.poidsOr);
  });

  it('ville déjà optimale : AUCUN ordre SetWorkedTile (pas de brassage)', () => {
    const s = state({
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
      terrainOverrides: overrides,
      treasury: 100,
    });
    const poids = poidsVille(s, s.cities['c1']!, s.players[BOT]!, ecoDuBot(), false);
    const plan = planWorkedTiles(s, s.cities['c1']!, s.players[BOT]!, poids, { reserveInterieurs: ecoDuBot().citoyensInterieurs, marteauxMin: ecoDuBot().marteauxMin });
    s.cities['c1']!.workedTiles = [...plan];
    const stw = planOf(s).orders.filter((o) => o.type === 'SetWorkedTile');
    expect(stw).toHaveLength(0);
  });

  it('marteauxMin : un plan tout-prairie force une tuile de production (file jamais gelée)', () => {
    const s = state({
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
      terrainOverrides: overrides,
      treasury: 100,
    });
    expect(ecoDuBot().marteauxMin).toBeGreaterThanOrEqual(1);
    const plan = planWorkedTiles(s, s.cities['c1']!, s.players[BOT]!, { food: 3, production: 2, commerce: 0 }, { marteauxMin: 1 });
    expect(plan).toContain(FORET); // 2 marteaux bruts garantis (miroir processEconomy)
    expect(plan).toHaveLength(2);
  });

  it('réserve de citoyens intérieurs (data, 0 par défaut) : pop 2 + réserve 1 ⇒ 1 tuile', () => {
    const s = state({ cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }], treasury: 100 });
    const plan = planWorkedTiles(s, s.cities['c1']!, s.players[BOT]!, { food: 3, production: 2, commerce: 0 }, { reserveInterieurs: 1 });
    expect(plan).toHaveLength(1);
  });

  it('ville pleine sous-optimale : DÉSÉLECTION d’abord, puis réassignation (même tour)', () => {
    // citoyens sur deux prairies alors que la production militaire pondère les marteaux
    const s = state({
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, workedTiles: [P1, P2], production: { item: { kind: 'unit', id: 'guerrier' }, progress: 0 } }],
      terrainOverrides: overrides,
      treasury: 100,
    });
    const stw = planOf(s).orders.filter(
      (o): o is Extract<(typeof o), { type: 'SetWorkedTile' }> => o.type === 'SetWorkedTile' && o.cityId === 'c1',
    );
    const desi = stw.findIndex((o) => o.tile === P2);
    const ajout = stw.findIndex((o) => o.tile === FORET);
    expect(desi).toBeGreaterThanOrEqual(0);
    expect(ajout).toBeGreaterThan(desi); // désélection AVANT assignation
  });

  it('pop au plafond (seuil null) : nourriture non pondérée', () => {
    const s = state({
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 31 }],
      treasury: 100,
    });
    expect(growthThresholdFor(31)).toBeNull();
    const poids = poidsVille(s, s.cities['c1']!, s.players[BOT]!, ecoDuBot(), false);
    expect(poids.food).toBe(0);
  });

  it('pur : planWorkedTiles ne mute PAS l’état', () => {
    const s = state({ cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }], treasury: 100 });
    const avant = JSON.stringify(s);
    planWorkedTiles(s, s.cities['c1']!, s.players[BOT]!, poidsVille(s, s.cities['c1']!, s.players[BOT]!, ecoDuBot(), false));
    expect(JSON.stringify(s)).toBe(avant);
  });

});

describe('BOT-TB · D2 — production pondérée (5 situations)', () => {
  const ville = (extra: Partial<City> = {}) => ({
    id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true, workedTiles: [], buildings: [], ...extra,
  });

  it('① en guerre : une unité de combat (meilleure attaque disponible)', () => {
    const s = state({ war: true, treasury: 100, cities: [{ id: 'c1', owner: BOT, q: 2, r: 3 }] });
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), true, false);
    expect(item?.kind).toBe('unit');
    expect(item && item.kind === 'unit' && item.id).toBeTruthy();
  });

  it('① barbares actifs proches (menace, paix) : une unité', () => {
    const s = state({
      units: [{ id: 'x1', type: 'guerrier', owner: BARBARIAN_ID, q: 2, r: 5 }],
      cities: [ville()],
      villages: [],
      treasury: 100,
    });
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, true);
    expect(item?.kind).toBe('unit');
  });

  it('② pop ≥ seuilPopColonne : un colon (et un seul dans l’empire)', () => {
    const s = state({ cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: ECO.seuilPopColonne }], treasury: 100 });
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, false);
    expect(item).toEqual({ kind: 'unit', id: 'colon' });
    // un colon existe déjà → pas de second
    const s2 = state({
      units: [{ id: 'b9', type: 'colon', owner: BOT, q: 5, r: 5 }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: ECO.seuilPopColonne }],
      treasury: 100,
    });
    const item2 = arbitrerProduction(s2.cities['c1']!, s2.players[BOT]!, [s2.cities['c1']!], s2, ecoDuBot(), false, false);
    expect(item2).not.toEqual({ kind: 'unit', id: 'colon' });
  });

  it('③ bâtiment économique manquant : premier de l’ordre data-driven valide', () => {
    const s = state({ cities: [ville()], techs: ['poterie'], treasury: 100 });
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, false);
    expect(item).toEqual({ kind: 'building', id: 'grenier' });
  });

  it('④ merveille si pionnier (aucun bâtiment de l’ordre disponible, empire sans merveille)', () => {
    const s = state({ cities: [{ ...ville(), buildings: ['grenier'] }], techs: ['poterie'], treasury: 100 });
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, false);
    expect(item).toEqual({ kind: 'wonder', id: 'jardins_suspendus' });
  });

  it('⑤ repli : un item valide quelconque (le validateur moteur passe)', () => {
    // empire possédant déjà la merveille + colon présent + pop basse → fallback
    const s = state({
      cities: [{ ...ville(), wonders: ['jardins_suspendus'] }],
      techs: ['poterie'],
      units: [{ id: 'b9', type: 'colon', owner: BOT, q: 5, r: 5 }],
      treasury: 100,
    });
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, false);
    expect(item).not.toBeNull();
  });
});

describe('BOT-TB · D3 — recherche orientée (plus de hasard)', () => {
  const joueurDe = (s: GameState) => s.players[BOT]!;

  it('objectif militaire : première brique disponible du chemin vers la tech clé', () => {
    const s = state({});
    const tech = prochaineTech(joueurDe(s), { ...profileDuBot(), objectifRecherche: 'militaire' }, ecoDuBot());
    expect(tech).toBe('travail_du_bronze'); // prérequis de travail_du_fer
  });

  it('la chaîne de prérequis est COMPLÈTE : en simulant les choix, la tech clé est atteinte', () => {
    const s = state({});
    const joueur = joueurDe(s);
    const profil = { ...profileDuBot(), objectifRecherche: 'militaire' as const };
    let garde = 0;
    while (!joueur.techsUnlocked.includes(ECO.techMilitaireCle)) {
      const tech = prochaineTech(joueur, profil, ecoDuBot());
      expect(tech).not.toBeNull();
      const t = TECHS[tech!]!;
      for (const p of t.prereqs) expect(joueur.techsUnlocked).toContain(p); // toujours légal
      joueur.techsUnlocked = [...joueur.techsUnlocked, tech!];
      if (++garde > 50) throw new Error('chaîne non terminée');
    }
  });

  it('objectif économique : chemin vers la tech clé économique (légal et complet)', () => {
    const s = state({});
    const joueur = joueurDe(s);
    const profil = { ...profileDuBot(), objectifRecherche: 'economique' as const };
    let garde = 0;
    while (!joueur.techsUnlocked.includes(ECO.techEconomiqueCle)) {
      const tech = prochaineTech(joueur, profil, ecoDuBot());
      expect(tech).not.toBeNull();
      const t = TECHS[tech!]!;
      for (const p of t.prereqs) expect(joueur.techsUnlocked).toContain(p);
      joueur.techsUnlocked = [...joueur.techsUnlocked, tech!];
      if (++garde > 50) throw new Error('chaîne non terminée');
    }
  });

  it('auto : chemin le moins cher vers l’ère suivante (jamais de tech hors chemin au 1er choix)', () => {
    const s = state({});
    const tech = prochaineTech(joueurDe(s), { ...profileDuBot(), objectifRecherche: 'auto' }, ecoDuBot());
    expect(tech).not.toBeNull();
    const t = TECHS[tech!]!;
    expect(t.prereqs.every((p) => s.players[BOT]!.techsUnlocked.includes(p))).toBe(true);
    // ère ancienne : le choix reste dans l'ancienne (prérequis de l'ère suivante)
    expect(t.era).toBe('ancienne');
  });

  it('tout est débloqué : null (pas de SetResearch)', () => {
    const s = state({});
    const joueur = joueurDe(s);
    joueur.techsUnlocked = Object.keys(TECHS);
    expect(prochaineTech(joueur, profileDuBot(), ecoDuBot())).toBeNull();
  });
});

describe('BOT-TB · D4 — trésorerie disciplinée', () => {
  it('rushPrioritaire : unité de combat en guerre/menace ou colon — pas un bâtiment', () => {
    expect(rushPrioritaire({ kind: 'unit', id: 'guerrier' }, true, false)).toBe(true);
    expect(rushPrioritaire({ kind: 'unit', id: 'guerrier' }, false, true)).toBe(true);
    expect(rushPrioritaire({ kind: 'unit', id: 'colon' }, false, false)).toBe(true);
    expect(rushPrioritaire({ kind: 'unit', id: 'guerrier' }, false, false)).toBe(false);
    expect(rushPrioritaire({ kind: 'building', id: 'grenier' }, true, false)).toBe(false);
  });

  it('e2e : guerre + trésorerie généreuse → RushBuy de l’unité en tête', () => {
    const s = state({
      war: true,
      treasury: 1000,
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, production: { item: { kind: 'unit', id: 'guerrier' }, progress: 5 } }],
    });
    expect(planOf(s).orders.some((o) => o.type === 'RushBuy')).toBe(true);
  });

  it('e2e : réserve insuffisante (trésorerie − coût < tresorerieMinimale) → PAS de rush', () => {
    const s = state({
      war: true,
      treasury: ECO.tresorerieMinimale + 5, // couvre le coût × réserve mais tombe sous le plancher
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, production: { item: { kind: 'unit', id: 'guerrier' }, progress: 0 } }],
    });
    expect(planOf(s).orders.some((o) => o.type === 'RushBuy')).toBe(false);
  });

  it('e2e : en paix sans menace, un bâtiment n’est JAMAIS rushé (même riche)', () => {
    const s = state({
      treasury: 1000,
      techs: ['poterie'],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, production: { item: { kind: 'building', id: 'grenier' }, progress: 5 } }],
    });
    expect(planOf(s).orders.some((o) => o.type === 'RushBuy')).toBe(false);
  });
});

describe('BOT-TB · D5 — déterminisme et reprise', () => {
  const s = () =>
    state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3 },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 3, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: BOT, q: 2, r: 3, pop: 3 },
        { id: 'c2', owner: BOT, q: 5, r: 5, pop: 2, capital: false },
      ],
      treasury: 120,
    });

  it('même état ⇒ plans identiques quel que soit le seed ; re-stable au même seed', () => {
    const reference = JSON.stringify(planOf(s(), 0));
    for (let seed = 1; seed <= 10; seed++) expect(JSON.stringify(planOf(s(), seed))).toBe(reference);
    expect(JSON.stringify(planOf(s(), 99))).toBe(JSON.stringify(planOf(s(), 99)));
  });

  it('reprise de partie : botPolicy ne mute pas l’état (deux appels ⇒ même plan)', () => {
    const etat = s();
    const avant = JSON.stringify(etat);
    const p1 = JSON.stringify(planOf(etat, 5));
    expect(JSON.stringify(etat)).toBe(avant);
    expect(JSON.stringify(planOf(etat, 5))).toBe(p1);
  });
});
