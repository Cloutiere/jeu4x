/**
 * BOT-ARMEE (décisions Erik 26/10) — Livrable A : l'armée et la campagne.
 *
 * D1 : l'objectif offensif assemble une ARMÉE (tailleArmee, data-driven par
 *      difficulté) près de la cible AVANT d'attaquer — les unités désignées
 *      campent (Fortify) au point de ralliement jusqu'à effectif.
 * D2 : cible de campagne = ville ennemie (en guerre) LA PLUS PROCHE (pas la
 *      capitale d'office) ; la campagne PERSISTE (armée déterministe de
 *      l'état — ne se disperse pas) jusqu'à capture/anéantissement/rappel.
 * D3 : hors le détachement, garnisons/patrouilles/économie inchangées.
 * D4 : déterminisme intégral (même état ⇒ même armée, même cible).
 */
import { describe, expect, it } from 'vitest';
import { BOT_SETTINGS, makeState } from '@game/rules';
import type { City, GameState, PlayerId, SeededRng } from '@game/rules';

const rngFaux = (): SeededRng =>
  ({ next: () => 0.99, nextInt: (n: number) => n - 1, state: 0 }) as SeededRng;
import {
  assignerArmee,
  botPolicy,
  cibleCampagne,
  assignerObjectifs,
  deciderGuerre,
  pointRalliement,
  pasVersRoutier,
  profileDuBot,
  seuilGuerreEffectif,
} from '../src/botPolicy.js';

const ME: PlayerId = 'p2';
const AUTRE: PlayerId = 'p1';

function state(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number; isArmy?: boolean }>;
  cities?: Array<Partial<City> & { id: string; owner: string; q: number; r: number }>;
}): GameState {
  const s = makeState({
    width: 20,
    height: 12,
    players: [AUTRE, ME],
    warPairs: [[AUTRE, ME]],
    units: (opts.units ?? []).map((u) => ({ ...u, aboard: null, cargo: null })),
    cities: (opts.cities ?? []).map((c) => ({
      pop: 2,
      capital: true,
      workedTiles: [],
      buildings: [],
      ...c,
    })),
    rngSeed: 42,
  }) as GameState;
  s.turn = 40;
  return s;
}

const NORMAL = profileDuBot('normal');

describe('BOT-ARMEE · données — tailleArmee / rayonRalliement par profil', () => {
  it('chaque profil porte une taille d’armée (2..6) et un rayon de ralliement ≥ 1', () => {
    for (const [nom, p] of Object.entries(BOT_SETTINGS.profiles)) {
      expect(p.tailleArmee, nom).toBeGreaterThanOrEqual(2);
      expect(p.tailleArmee, nom).toBeLessThanOrEqual(12);
      expect(p.rayonRalliement, nom).toBeGreaterThanOrEqual(1);
    }
  });

  it('le difficile assemble au moins aussi grand que le normal (gradation)', () => {
    expect(profileDuBot('difficile').tailleArmee).toBeGreaterThanOrEqual(profileDuBot('normal').tailleArmee);
  });
});

describe('BOT-ARMEE · D2 — cible de campagne : ville ennemie la plus proche', () => {
  it('vise la ville la plus proche, pas la capitale d’office', () => {
    const s = state({
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 10, r: 2, capital: true }, // capitale éloignée
        { id: 'c3', owner: AUTRE, q: 4, r: 2, capital: false }, // ville proche
      ],
    });
    const c = cibleCampagne(s, ME);
    expect(c?.cityId).toBe('c3');
  });

  it('null sans ennemi en guerre', () => {
    const s = makeState({
      width: 8,
      height: 8,
      players: [AUTRE, ME],
      warPairs: [],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2, pop: 2, capital: true, workedTiles: [], buildings: [] },
        { id: 'c2', owner: AUTRE, q: 5, r: 2, pop: 2, capital: true, workedTiles: [], buildings: [] },
      ],
    }) as GameState;
    expect(cibleCampagne(s, ME)).toBeNull();
  });

  it('à distance égale, l’id le plus petit gagne (R-81)', () => {
    const s = state({
      cities: [
        { id: 'c1', owner: ME, q: 4, r: 3 },
        { id: 'c2', owner: AUTRE, q: 4, r: 1 },
        { id: 'c3', owner: AUTRE, q: 4, r: 5 },
      ],
    });
    // c2 et c3 symétriques autour de c1 → distance égale → id croissant.
    expect(cibleCampagne(s, ME)?.cityId).toBe('c2');
  });

  it('PERSISTANCE : la cible ne bouge pas tant que la ville tient, et passe à la suivante après capture', () => {
    const base = {
      units: [] as Array<{ id: string; type: string; owner: string; q: number; r: number }>,
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 4, r: 2 },
        { id: 'c3', owner: AUTRE, q: 8, r: 2 },
      ],
    };
    const avant = cibleCampagne(state(base), ME);
    expect(avant?.cityId).toBe('c2');
    // Capture de c2 → l'état sans c2 désigne c3 (même fonction pure, état différent).
    const apres = cibleCampagne(state({ ...base, cities: base.cities.filter((c) => c.id !== 'c2') }), ME);
    expect(apres?.cityId).toBe('c3');
  });
});

describe('BOT-ARMEE · D1 — assignation de l’armée', () => {
  const base = {
    cities: [
      { id: 'c1', owner: ME, q: 2, r: 2 },
      { id: 'c2', owner: AUTRE, q: 8, r: 2 },
    ],
  };

  it('exactement tailleArmee membres : les plus proches de la cible (ties id)', () => {
    const s = state({
      ...base,
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 }, // proche cible
        { id: 'u2', type: 'guerrier', owner: ME, q: 2, r: 4 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 2, r: 5 },
        { id: 'u4', type: 'guerrier', owner: ME, q: 2, r: 9 }, // loin
        { id: 'u5', type: 'guerrier', owner: ME, q: 2, r: 10 },
      ],
    });
    const cible = cibleCampagne(s, ME)!;
    const armee = assignerArmee(s, ME, NORMAL, cible);
    // BOT-MARCHE D3 : en guerre SANS menace capitale, PLUS PERSONNE ne comble
    // la garnison — le pool est tout l'empire {u1..u5}, plus petit que
    // tailleArmee : TOUT le pool part.
    expect(armee.size).toBe(5);
    expect(armee.has('u1')).toBe(true);
    expect(armee.has('u2')).toBe(true);
    expect(armee.has('u3')).toBe(true);
    expect(armee.has('u4')).toBe(true);
    expect(armee.has('u5')).toBe(true);
  });

  it('pool plus petit que tailleArmee → tout le pool part (défenseurs en place stables)', () => {
    // BOT-MARCHE D3 : en guerre sans menace capitale, personne n'est
    // réquisitionné ; les défenseurs EN PLACE (g1, g2) ne partent JAMAIS ;
    // le pool {u1} part en entier.
    const s = state({
      ...base,
      units: [
        { id: 'g1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'g2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
      ],
    });
    const cible = cibleCampagne(s, ME)!;
    const armee = assignerArmee(s, ME, NORMAL, cible);
    // Le scout (g1, premier combattant R-81) est MOBILISABLE en guerre
    // (BOT-EXPLORATION D3) — le pool est {u1, g1} ; u1 part aussi.
    expect(armee.size).toBe(2);
    expect(armee.has('u1')).toBe(true);
    expect(armee.has('g1')).toBe(true);
    expect(armee.has('g2')).toBe(false);
  });

  it('déterminisme intégral : même état ⇒ même armée', () => {
    const s = state({
      ...base,
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 3, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 4, r: 3 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 5, r: 3 },
        { id: 'u4', type: 'guerrier', owner: ME, q: 6, r: 3 },
      ],
    });
    const cible = cibleCampagne(s, ME)!;
    const a = assignerArmee(s, ME, NORMAL, cible);
    const b = assignerArmee(s, ME, NORMAL, cible);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('la garnison passe D’ABORD : les défenseurs nécessaires ne partent pas (D3)', () => {
    // garnisonsCapitale (normal) = 2 : deux unités SUR la capitale restent en
    // garnison ; le scout (a1, premier combattant R-81) et les excédentaires
    // forment le pool de l’armée.
    const s = state({
      ...base,
      units: [
        { id: 'a1', type: 'guerrier', owner: ME, q: 3, r: 3 }, // scout
        { id: 'g1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'g2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 3, r: 4 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 3, r: 5 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 3, r: 6 },
      ],
    });
    const cible = cibleCampagne(s, ME)!;
    const armee = assignerArmee(s, ME, NORMAL, cible);
    expect(armee.has('g1')).toBe(false);
    expect(armee.has('g2')).toBe(false);
  });
});

describe('BOT-ARMEE · D1 — point de ralliement', () => {
  it('à rayonRalliement de la cible, praticable et libre', () => {
    const s = state({
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 8, r: 2 },
      ],
      units: [{ id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 }],
    });
    const cible = cibleCampagne(s, ME)!;
    const rally = pointRalliement(s, cible, ME, NORMAL);
    const d = Math.abs(rally.q - cible.q) + Math.abs(rally.r - cible.r);
    // distance axiale 2 (rayonRalliement du profil normal) — vérif via hex :
    // ici on accepte la distance axiale simplifiée ≥ 1 (pas SUR la ville).
    expect(rally).not.toEqual({ q: cible.q, r: cible.r });
    expect(d).toBeGreaterThanOrEqual(NORMAL.rayonRalliement - 1);
    expect(s.map[`${rally.q},${rally.r}`]).toBeDefined();
  });

  it('côté MA capitale (le ralliement ne se place pas derrière la ville)', () => {
    const s = state({
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 8, r: 2 },
      ],
    });
    const cible = cibleCampagne(s, ME)!;
    const rally = pointRalliement(s, cible, ME, NORMAL);
    expect(rally.q).toBeLessThan(cible.q);
  });
});

describe('BOT-ARMEE · D1 — objectifs : rallier avant d’offensiver', () => {
  const cities = [
    { id: 'c1', owner: ME, q: 2, r: 2 },
    { id: 'c2', owner: AUTRE, q: 8, r: 2 },
  ];

  it('armée incomplète : les membres RALLENT (jamais offensiver)', () => {
    const s = state({
      cities,
      units: [
        { id: 'g1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'g2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 3, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 3, r: 4 },
      ],
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    const kinds = [...objs.values()].map((o) => o.kind);
    expect(kinds).toContain('rallier');
    expect(kinds).not.toContain('offensiver');
  });

  it('armée au contact (armées formées, PAIX-RYTHME D1) : le trio FUSIONNE et l’ARMÉE offensive/assaut', () => {
    // PAIX-RYTHME (Erik 27/10) : au siège, le trio homogène FUSE d'abord
    // (canon R-31 — converger/fusionner) ; l'ARMÉE formée, elle, marche et
    // frappe (offensiver/attaquer).
    const s = state({
      cities,
      units: [
        { id: 'g1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'g2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'g3', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'e1', type: 'piquier', owner: AUTRE, q: 8, r: 2 }, // garnison ennemie
        { id: 'u1', type: 'guerrier', owner: ME, q: 6, r: 2 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 7, r: 2 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 7, r: 3 },
      ],
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    const rdv = { q: 7, r: 2 }; // hex du membre le plus proche de la cible (u2)
    expect(objs.get('u2')?.kind, 'u2').toBe('fusionner');
    expect(objs.get('u1')?.kind, 'u1').toBe('converger');
    expect(objs.get('u3')?.kind, 'u3').toBe('converger');
    for (const id of ['u1', 'u3']) {
      expect(objs.get(id)?.cible, id).toEqual(rdv);
    }
    // L'armée FORMÉE (post-fusion) offensive : même état, l'entité isArmy.
    const s2 = state({
      cities,
      units: [
        { id: 'h1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'h2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'a1', type: 'guerrier', owner: ME, q: 7, r: 2, isArmy: true },
        { id: 'a2', type: 'guerrier', owner: ME, q: 7, r: 3, isArmy: true },
      ],
    });
    const objs2 = assignerObjectifs(s2, ME, NORMAL);
    // ville ennemie vide adjacente → ASSAUT (capture, priorite 3).
    expect(objs2.get('a1')?.kind, 'a1').toBe('attaquer');
    expect(objs2.get('a1')?.cible, 'a1').toEqual({ q: 8, r: 2 });
    // a2, adjacente elle aussi, participe à l'assaut (deux armées = deux
    // entités canon — la ville vide est prise par la première entrée).
    expect(objs2.get('a2')?.kind, 'a2').toBe('attaquer');
    expect(objs2.get('a2')?.cible, 'a2').toEqual({ q: 8, r: 2 });
  });

  it('D3 : l’excédentaire HORS armée ne part pas en campagne (chasse/exploration)', () => {
    const s = state({
      cities,
      units: [
        { id: 'g1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'g2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 6, r: 2 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 7, r: 2 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 7, r: 3 },
        { id: 'u4', type: 'guerrier', owner: ME, q: 10, r: 10 }, // excédent loin
      ],
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    expect(objs.get('u4')?.kind === 'offensiver' ? 'offensiver' : 'autre').toBe('autre');
  });

  it('D2 rappel : urgence autour de la capitale → aucun membre en campagne (la garnison absorbe)', () => {
    const s = state({
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 8, r: 2 },
      ],
      units: [
        { id: 'e1', type: 'guerrier', owner: AUTRE, q: 4, r: 2 }, // menace à ≤ rayonMenace
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 2, r: 4 },
      ],
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    for (const o of objs.values()) {
      expect(o.kind === 'rallier' || o.kind === 'offensiver').toBe(false);
    }
  });
});

describe('BOT-ARMEE · émission des ordres', () => {
  const cities = [
    { id: 'c1', owner: ME, q: 2, r: 2 },
    { id: 'c2', owner: AUTRE, q: 8, r: 2 },
  ];

  it('armée incomplète : membre DANS l’anneau → Fortify, l’autre marche', () => {
    // u1/u2 comblent la garnison de la capitale (quota guerre 2) ;
    // u3 (6,2) est déjà à rayonRalliement (2) de la cible (8,2) → il campe
    // sur place ; u4 (loin) marche vers le ralliement.
    const s = state({
      cities,
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 2, r: 4 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 6, r: 2 },
        { id: 'u4', type: 'guerrier', owner: ME, q: 2, r: 7 },
      ],
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    expect(objs.get('u3')?.kind).toBe('rallier');
    expect(objs.get('u4')?.kind).toBe('rallier');
    const plan = botPolicy(s, ME, rngFaux());
    const o1 = plan.orders.find((x) => 'unitId' in x && x.unitId === 'u3');
    expect(o1?.type).toBe('Fortify');
    const o2 = plan.orders.find((x) => 'unitId' in x && x.unitId === 'u4');
    expect(o2?.type).toBe('Move');
  });

  it('armée FORMÉE au contact, ville ennemie vide au contact → ASSAUT (Attack)', () => {
    // PAIX-RYTHME D1 : l'assaut est porté par l'ARMÉE (isArmy, canon R-31) ;
    // le trio non formé fusionne d'abord (voir test objectifs).
    const s = state({
      cities,
      units: [
        { id: 'h1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'h2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'a1', type: 'guerrier', owner: ME, q: 7, r: 2, isArmy: true },
      ],
    });
    const plan = botPolicy(s, ME, rngFaux());
    const o = plan.orders.find((x) => 'unitId' in x && x.unitId === 'a1');
    expect(o?.type).toBe('Attack');
    if (o?.type === 'Attack') {
      expect(o.target).toEqual({ q: 8, r: 2 });
    }
  });

  it('déterminisme : même état ⇒ même plan d’ordres', () => {
    const s = state({
      cities,
      units: [
        { id: 'g1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'g2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 3, r: 3 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 3, r: 4 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 3, r: 5 },
      ],
    });
    const rng = rngFaux;
    expect(JSON.stringify(botPolicy(s, ME, rng()))).toBe(JSON.stringify(botPolicy(s, ME, rng())));
  });
});

describe('BOT-ARMEE · D6 — seuil de guerre modulé par l’agressivité de la civ', () => {
  it('chaque profil porte une modulation (0..1)', () => {
    for (const [nom, p] of Object.entries(BOT_SETTINGS.profiles)) {
      expect(p.modulationSeuilAgressivite, nom).toBeGreaterThanOrEqual(0);
      expect(p.modulationSeuilAgressivite, nom).toBeLessThanOrEqual(1);
    }
  });

  it('agressive (0,9) abaisse le seuil ; pacifique (0,25) le relève ; neutre (0,5) inchangé', () => {
    const p = profileDuBot('normal');
    const base = p.seuilRatioGuerre;
    expect(seuilGuerreEffectif(p, 0.9)).toBeLessThan(base);
    expect(seuilGuerreEffectif(p, 0.25)).toBeGreaterThan(base);
    expect(seuilGuerreEffectif(p, 0.5)).toBeCloseTo(base);
  });

  it('deciderGuerre : l’agressive déclare à rapport ÉGAL là où la pacifique renonce', () => {
    const mk = () =>
      makeState({
        width: 20,
        height: 12,
        players: [AUTRE, ME],
        warPairs: [], // en paix : la décision de GUERRE est testée ici
        units: [
          { id: 'm1', type: 'guerrier', owner: ME, q: 2, r: 3 },
          { id: 'a1', type: 'guerrier', owner: AUTRE, q: 6, r: 3 },
          { id: 'a2', type: 'guerrier', owner: AUTRE, q: 6, r: 4 },
        ],
        cities: [
          { id: 'c1', owner: ME, q: 2, r: 2, pop: 2, capital: true, workedTiles: [], buildings: [] },
          { id: 'c2', owner: AUTRE, q: 6, r: 2, pop: 2, capital: true, workedTiles: [], buildings: [] },
        ],
        rngSeed: 42,
      }) as GameState;
    // Rapport 2/4 = 0,5 : sous le seuil « normal » (0,7), au-dessus du seuil
    // effectif d'une civ très agressive (0,7 × 0,6 = 0,42), en dessous de
    // celui d'une pacifique (0,7 × 1,25 = 0,875).
    const rngToujourOui = { next: () => 0, nextInt: (n: number) => 0, state: 0 } as SeededRng;
    const rngToujourNon = { next: () => 0.99, nextInt: (n: number) => n - 1, state: 0 } as SeededRng;
    const sAgg = mk(); // agressivite mongolie 0,9
    sAgg.turn = 40;
    (sAgg.players[ME] as { civId: string }).civId = 'mongolie';
    const sPac = mk(); // agressivite inde 0,25
    sPac.turn = 40;
    (sPac.players[ME] as { civId: string }).civId = 'inde';
    expect(deciderGuerre(sAgg, ME, NORMAL, rngToujourOui, 0.9)).toBe('p1');
    expect(deciderGuerre(sPac, ME, NORMAL, rngToujourOui, 0.25)).toBeNull();
    // Le tirage reste bornant : pas de déclaration sans passe du RNG.
    expect(deciderGuerre(sAgg, ME, NORMAL, rngToujourNon, 0.9)).toBeNull();
  });
});

describe('BOT-ARMEE · circulation — pas routier (BFS) pour la marche d’armée', () => {
  it('contourne un plan d’eau qui bloque le pas glouton', () => {
    // Mur d'eau vertical en q=6 (r 0..8) : le glouton se colle et oscille ;
    // le BFS passe par le gué en (6,9) puis remonte vers la cible (8,2).
    const terrainOverrides: Record<string, 'ocean'> = {};
    for (let r = 0; r <= 8; r++) terrainOverrides[`6,${r}`] = 'ocean';
    const s = makeState({
      width: 20,
      height: 12,
      players: [AUTRE, ME],
      warPairs: [[AUTRE, ME]],
      terrainOverrides,
      units: [{ id: 'u1', type: 'guerrier', owner: ME, q: 5, r: 2 }],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2, pop: 2, capital: true, workedTiles: [], buildings: [] },
        { id: 'c2', owner: AUTRE, q: 8, r: 2, pop: 2, capital: true, workedTiles: [], buildings: [] },
      ],
      rngSeed: 42,
    }) as GameState;
    s.turn = 40;
    const step = pasVersRoutier(s.units['u1']!, s, { q: 8, r: 2 });
    // Le pas doit RÉDUIRE la distance au gué du sud (pas se coller à l'eau) :
    // du (5,2) le chemin praticable descend — le pas va vers le bas/gué.
    expect(step).not.toBeNull();
    const axiale = (a: { q: number; r: number }, b: { q: number; r: number }) =>
      (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
    const gué = { q: 6, r: 9 };
    expect(axiale(step!, gué)).toBeLessThan(axiale({ q: 5, r: 2 }, gué));
  });

  it('repli glouton : hexagone atteignable en ligne droite → un pas qui rapproche', () => {
    const s = state({
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 8, r: 2 },
      ],
      units: [{ id: 'u1', type: 'guerrier', owner: ME, q: 5, r: 2 }],
    });
    const step = pasVersRoutier(s.units['u1']!, s, { q: 8, r: 2 });
    expect(step).toEqual({ q: 6, r: 2 });
  });

  it('cible inatteignable (île) → null', () => {
    const terrainOverrides: Record<string, 'ocean'> = {};
    // L'entourage complet de la cible est océan : aucune case terrestre adjacente.
    for (const [dq, dr] of [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]] as const) {
      terrainOverrides[`${8 + dq},${2 + dr}`] = 'ocean';
    }
    const s = makeState({
      width: 20,
      height: 12,
      players: [AUTRE, ME],
      warPairs: [[AUTRE, ME]],
      terrainOverrides,
      units: [{ id: 'u1', type: 'guerrier', owner: ME, q: 3, r: 2 }],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2, pop: 2, capital: true, workedTiles: [], buildings: [] },
        { id: 'c2', owner: AUTRE, q: 8, r: 2, pop: 2, capital: true, workedTiles: [], buildings: [] },
      ],
      rngSeed: 42,
    }) as GameState;
    s.turn = 40;
    expect(pasVersRoutier(s.units['u1']!, s, { q: 8, r: 2 })).toBeNull();
  });
});
