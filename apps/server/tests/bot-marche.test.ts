/**
 * BOT-MARCHE (décisions Erik 28/10) — que l'armée se constitue et MARCHE.
 *
 * Diagnostic L1 (sonde tests-banc/sonde-marche.test.ts, seed 2896796234,
 * difficile) : l'armée se constitue (pool 0→16) et reçoit des ordres Move,
 * MAIS (1) la cible de ralliement est instable — assignée par RANG trié par
 * distance AU TOUR COURANT, le rang permute à chaque tour et les membres
 * oscillent (d18→21→20) ; (2) l'effectif au rayon n'atteint JAMAIS requis —
 * 0 FormArmy, 0 offensiver ; (3) en guerre, planGarnison (urgence toujours
 * vraie) absorbe les renforts.
 *
 * D1 — marche coordonnée : l'hex d'anneau de chaque membre est STABLE (rang
 *      par id, R-81) — plus d'oscillation ; l'offensive ne marche que si le
 *      pas réduit la distance (déjà en place, testé ici).
 * D2 — armée permanente en temps de paix : quand le rapport de forces
 *      annonce une guerre probable (seuil du profil), le pool se rassemble
 *      vers la cible PROJETÉE (même pondération que la déclaration).
 * D3 — en guerre civile active, seules la capitale menacée (urgence
 *      BOT-EXPLORATION) recrute — la campagne prime sur les garnisons.
 * D4 — verrou de re-déclaration : pas de nouvelle guerre contre la MÊME
 *      cible avant delaiRedeclaration (donnée) — consigné côté rules
 *      (diplomacy.dernieresCibles, champ optionnel — schemaVersion 28).
 */
import { describe, expect, it } from 'vitest';
import {
  BOT_SETTINGS,
  applyDeclareWar,
  applyProposePeace,
  createRng,
  derniereDeclarationCible,
  makeState,
} from '@game/rules';
import type { City, GameState, PlayerId, SeededRng } from '@game/rules';
import {
  anneauRalliement,
  assignerObjectifs,
  botPolicy,
  botTurnSeed,
  cibleProjetee,
  deciderGuerre,
  hexRalliementMembre,
  planGarnison,
  profileDuBot,
} from '../src/botPolicy.js';

const ME: PlayerId = 'p2';
const AUTRE: PlayerId = 'p1';

/** RNG de test : tirage TOUJOURS gagnant (next=0) sauf indication. */
const rngGagnant = (): SeededRng =>
  ({ next: () => 0, nextInt: (n: number) => 0, state: 0 }) as SeededRng;

function state(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number; hp?: number; isArmy?: boolean }>;
  cities?: Array<Partial<City> & { id: string; owner: string; q: number; r: number }>;
  war?: boolean;
  turn?: number;
}): GameState {
  const s = makeState({
    width: 40,
    height: 20,
    players: [AUTRE, ME],
    warPairs: opts.war === false ? [] : [[AUTRE, ME]],
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
  s.turn = opts.turn ?? 40;
  return s;
}

const NORMAL = profileDuBot('normal');
const DIFF = profileDuBot('difficile');

describe('BOT-MARCHE · données — delaiRedeclaration', () => {
  it('chaque profil porte un verrou de re-déclaration (≥ 20 tours)', () => {
    for (const [nom, p] of Object.entries(BOT_SETTINGS.profiles)) {
      expect(p.delaiRedeclaration, nom).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('BOT-MARCHE · D1 — la cible de ralliement est STABLE', () => {
  const villes = () => [
    { id: 'c1', owner: ME, q: 4, r: 10 },
    { id: 'c2', owner: AUTRE, q: 30, r: 10 },
  ];
  const membre = (q: number, r: number) => ({
    units: [
      { id: 'u1', type: 'guerrier', owner: ME, q, r },
      { id: 'u2', type: 'guerrier', owner: ME, q: 5, r: 10 },
    ],
    cities: villes(),
  });

  it('hexRalliementMembre ne dépend pas de la POSITION du membre (rang par id, R-81)', () => {
    const proche = state(membre(28, 10)); // u1 proche de la cible
    const loin = state(membre(6, 10)); // u1 loin
    const camp = { q: 30, r: 10 };
    const membresProche = Object.values(proche.units).filter((u) => u.owner === ME);
    const membresLoin = Object.values(loin.units).filter((u) => u.owner === ME);
    const hProche = hexRalliementMembre(proche, camp, ME, NORMAL, membresProche, 'u1');
    const hLoin = hexRalliementMembre(loin, camp, ME, NORMAL, membresLoin, 'u1');
    expect(hLoin).toEqual(hProche);
  });

  it('deux membres d’armée reçoivent deux hex DISTINCTS de l’anneau', () => {
    const s = state(membre(10, 10));
    const membres = Object.values(s.units).filter((u) => u.owner === ME);
    const camp = { q: 30, r: 10 };
    const h1 = hexRalliementMembre(s, camp, ME, NORMAL, membres, 'u1');
    const h2 = hexRalliementMembre(s, camp, ME, NORMAL, membres, 'u2');
    expect(h1).not.toEqual(h2);
  });

  it('l’objectif rallier garde la MÊME cible quand le membre avance d’un tour', () => {
    const t0 = state({ ...membre(10, 10) });
    const t1 = state({ ...membre(12, 10) });
    const o0 = assignerObjectifs(t0, ME, NORMAL).get('u1');
    const o1 = assignerObjectifs(t1, ME, NORMAL).get('u1');
    expect(o0?.kind).toBe('rallier');
    expect(o1?.kind).toBe('rallier');
    expect(o1?.cible).toEqual(o0?.cible);
  });

  it('offensiver : le pas émis réduit la distance à la cible de campagne', () => {
    // Effectif complet (6) AU rayon de la cible, types MÉLANGÉS (pas de trio
    // de fusion — la fusion précéderait l'offensive, canon R-31).
    const s2 = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 28, r: 10 },
        { id: 'u2', type: 'archer', owner: ME, q: 28, r: 11 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 29, r: 12 },
        { id: 'u4', type: 'archer', owner: ME, q: 29, r: 11 },
        { id: 'u5', type: 'piquier', owner: ME, q: 29, r: 9 },
        { id: 'u6', type: 'cavalier', owner: ME, q: 28, r: 12 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 4, r: 10 },
        { id: 'c2', owner: AUTRE, q: 30, r: 10 },
      ],
    });
    const objs = assignerObjectifs(s2, ME, NORMAL);
    const o = objs.get('u1');
    expect(o?.kind).toBe('offensiver');
    const plan = botPolicy(s2, ME, rngGagnant(), 'normal');
    const ordre = plan.orders.find((x) => x.type === 'Move' && x.unitId === 'u1');
    expect(ordre).toBeDefined();
    const pas = (ordre as { path: Array<{ q: number; r: number }> }).path[0]!;
    const dAvant = Math.abs(28 - 30);
    const dApres = Math.abs(pas.q - 30);
    expect(dApres).toBeLessThan(dAvant);
  });
});

describe('BOT-MARCHE · D2 — armée permanente en temps de paix', () => {
  const villesPaix = () => [
    { id: 'c1', owner: ME, q: 4, r: 10 },
    { id: 'c2', owner: AUTRE, q: 30, r: 10 },
  ];

  it('cibleProjetee : en paix, la cible pondérée parmi les candidats (non-null)', () => {
    const s = state({ cities: villesPaix(), war: false });
    const projet = cibleProjetee(s, ME, NORMAL);
    expect(projet?.q).toBe(30);
    expect(projet?.r).toBe(10);
    expect(projet?.owner).toBe(AUTRE);
  });

  it('au seuil de forces, le pool se rassemble vers la cible projetée (rallier) en paix', () => {
    // p2 très fort → ratio ≥ seuil → préparation. La garnison de la capitale
    // se remplit d'abord (u2, u3) ; l'excédent (u4..u8) part se rassembler.
    const s = state({
      units: [
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `u${i + 1}`,
          type: 'guerrier',
          owner: ME,
          q: 6 + i,
          r: 10,
        })),
        { id: 'z1', type: 'guerrier', owner: AUTRE, q: 30, r: 11 },
      ],
      cities: villesPaix(),
      war: false,
      turn: 40,
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    const o = objs.get('u8');
    expect(o?.kind).toBe('rallier');
    expect(o?.cible).toBeDefined();
    // la cible est un hex de l'anneau de la cible projetée (dist 2 de (30,10))
    const anneau = anneauRalliement(s, { q: 30, r: 10 }, ME, NORMAL);
    expect(anneau.some((h) => h.q === o!.cible!.q && h.r === o!.cible!.r)).toBe(true);
  });

  it('sous le seuil de forces, pas de préparation (objectifs T-A inchangés)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 6, r: 10 },
        { id: 'z1', type: 'legion', owner: AUTRE, q: 30, r: 11 },
        { id: 'z2', type: 'legion', owner: AUTRE, q: 30, r: 12 },
        { id: 'z3', type: 'legion', owner: AUTRE, q: 30, r: 13 },
        { id: 'z4', type: 'legion', owner: AUTRE, q: 30, r: 14 },
        { id: 'z5', type: 'legion', owner: AUTRE, q: 30, r: 15 },
      ],
      cities: villesPaix(),
      war: false,
    });
    const objs = assignerObjectifs(s, ME, NORMAL);
    expect(objs.get('u1')?.kind).not.toBe('rallier');
  });
});

describe('BOT-MARCHE · D3 — en guerre, la garnison ne mange plus la campagne', () => {
  it('planGarnison : en guerre civile SANS menace capitale, les villes non-capitales ne brouillent plus', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 12, r: 10 }, // en marche
        { id: 'u2', type: 'guerrier', owner: AUTRE, q: 30, r: 11 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 4, r: 10, capital: true },
        { id: 'c3', owner: ME, q: 8, r: 10, capital: false }, // vide → déficit
        { id: 'c2', owner: AUTRE, q: 30, r: 10 },
      ],
    });
    const { drafts, pool } = planGarnison(s, ME, NORMAL);
    // c3 (non capitale) ne recrute pas : u1 reste du pool de campagne.
    expect(drafts.has('u1')).toBe(false);
    expect(pool.some((u) => u.id === 'u1')).toBe(true);
  });

  it('planGarnison : en guerre AVEC menace autour de la capitale, l’urgence rappelle (BOT-EXPLORATION D3 intacte)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 12, r: 10 },
        { id: 'b1', type: 'guerrier', owner: 'barbarien', q: 5, r: 11 }, // menace capitale
      ],
      cities: [
        { id: 'c1', owner: ME, q: 4, r: 10, capital: true },
        { id: 'c2', owner: AUTRE, q: 30, r: 10 },
      ],
    });
    const { drafts } = planGarnison(s, ME, NORMAL);
    expect(drafts.has('u1')).toBe(true);
  });
});

describe('BOT-MARCHE · D4 — verrou de re-déclaration contre la même cible', () => {
  function partieAvecGuerrePuisPaix(turn: number): GameState {
    let s = state({
      units: [
        { id: 'a1', type: 'legion', owner: AUTRE, q: 30, r: 11 },
        { id: 'a2', type: 'legion', owner: AUTRE, q: 30, r: 12 },
        { id: 'a3', type: 'legion', owner: AUTRE, q: 30, r: 13 },
        { id: 'd1', type: 'guerrier', owner: ME, q: 4, r: 11 },
      ],
      cities: [{ id: 'c1', owner: ME, q: 4, r: 10 }, { id: 'c2', owner: AUTRE, q: 30, r: 10 }],
      war: false,
      turn,
    });
    const r = applyDeclareWar(s, AUTRE, ME);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    const r2 = applyProposePeace(s, AUTRE, ME, true);
    if (!r2.ok) throw new Error(r2.reason);
    return r2.state;
  }

  it('rules : applyDeclareWar consigne la déclaration par cible (dernieresCibles)', () => {
    let s = state({ cities: [{ id: 'c1', owner: ME, q: 4, r: 10 }], war: false });
    const r = applyDeclareWar(s, AUTRE, ME);
    if (!r.ok) throw new Error(r.reason);
    expect(derniereDeclarationCible(r.state, AUTRE, ME)).toBe(r.state.turn);
    expect(derniereDeclarationCible(r.state, ME, AUTRE)).toBe(r.state.turn);
  });

  it('deciderGuerre refuse la MÊME cible dans le délai — même avec tirage gagnant et forces suffisantes', () => {
    const s = partieAvecGuerrePuisPaix(40);
    s.turn = 40 + Math.max(0, NORMAL.delaiRedeclaration - 5);
    // p1 très fort, tirage gagnant : sans verrou, la cible serait p2.
    const cible = deciderGuerre(s, AUTRE, NORMAL, rngGagnant(), 1);
    expect(cible).toBeNull();
  });

  it('deciderGuerre accepte de nouveau après le délai', () => {
    const s = partieAvecGuerrePuisPaix(40);
    s.turn = 40 + NORMAL.delaiRedeclaration;
    const cible = deciderGuerre(s, AUTRE, NORMAL, rngGagnant(), 1);
    expect(cible).toBe(ME);
  });
});

describe('BOT-MARCHE · déterminisme', () => {
  it('même état ⇒ même plan (bit à bit)', () => {
    const mk = () =>
      state({
        units: [
          { id: 'u1', type: 'guerrier', owner: ME, q: 12, r: 10 },
          { id: 'u2', type: 'guerrier', owner: ME, q: 5, r: 10 },
          { id: 'u3', type: 'guerrier', owner: ME, q: 6, r: 10 },
          { id: 'u4', type: 'guerrier', owner: ME, q: 7, r: 10 },
          { id: 'z1', type: 'guerrier', owner: AUTRE, q: 30, r: 11 },
        ],
        cities: [
          { id: 'c1', owner: ME, q: 4, r: 10 },
          { id: 'c2', owner: AUTRE, q: 30, r: 10 },
        ],
      });
    const seed = botTurnSeed(42, 40, 'p2');
    const a = JSON.stringify(botPolicy(mk(), ME, createRng(seed), 'normal'));
    const b = JSON.stringify(botPolicy(mk(), ME, createRng(seed), 'normal'));
    expect(a).toBe(b);
  });
});
