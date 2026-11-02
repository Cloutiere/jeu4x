/**
 * GUERRE-VIVANTE (décisions Erik 02/11, HANDOFF-GUERRE-VIVANTE) — L1
 * test-first du volet D-A (conduite de guerre du bot) et D-C (anti-boucle).
 *
 * D-A · jugement de guerre stérile : après SA déclaration, une guerre
 *       `guerreSterile.tours` (data, 30) sans AUCUNE bataille se tranche
 *       selon le rapport de forces —
 *         rapport < 1 → le bot PROPOSE LA PAIX LUI-MÊME (ProposePeace,
 *                       cadencé `guerreSterile.cooldown` tours — D-C) ;
 *         rapport ≥ 1 → il ASSAILLE : les membres de l'armée passent en
 *                       marche directe ('offensiver') au lieu de camper
 *                       sur l'anneau de ralliement (convertir la guerre
 *                       nominale en campagne — la porte d'assaut existante
 *                       juge au rayon, une fois rassemblée).
 * D-C · anti-boucle : propositions cadencées (pas chaque tour), la paix
 *       du perdant canon BOT-TC reste inchangée, re-déclaration verrouillée
 *       par delaiRedeclaration (canon BOT-MARCHE — garde).
 */
import { describe, expect, it } from 'vitest';
import {
  BOT_SETTINGS,
  applyDeclareWar,
  createRng,
  makeState,
} from '@game/rules';
import type { City, GameState, PlayerId, SeededRng } from '@game/rules';

const rngFaux = (): SeededRng =>
  ({ next: () => 0.99, nextInt: (n: number) => n - 1, state: 0 }) as SeededRng;
import {
  assignerObjectifs,
  botPolicy,
  cibleCampagne,
  guerreSterileDe,
  profileDuBot,
} from '../src/botPolicy.js';

const ME: PlayerId = 'p2';
const AUTRE: PlayerId = 'p1';

function state(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number }>;
  cities?: Array<Partial<City> & { id: string; owner: string; q: number; r: number }>;
  wars?: Array<[PlayerId, PlayerId]>;
  joueurs?: PlayerId[];
  turn?: number;
  depuis?: number;
  batailles?: number;
}): GameState {
  const s = makeState({
    width: 30,
    height: 12,
    players: opts.joueurs ?? [AUTRE, ME],
    warPairs: opts.wars ?? [[AUTRE, ME]], // wars par défaut : la paire est en guerre
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
  s.turn = opts.turn ?? 60;
  if ((opts.wars ?? [[AUTRE, ME]]).length > 0) {
    s.diplomacy.warsDepuis = { [`${AUTRE},${ME}`]: opts.depuis ?? 10 };
    s.diplomacy.batailles = (opts.batailles ?? 0) > 0 ? { [`${AUTRE},${ME}`]: opts.batailles! } : {};
    s.diplomacy.distancesCible = { [`${AUTRE},${ME}`]: 4 };
  }
  return s;
}

const NORMAL = profileDuBot('normal');
const STERILE = (BOT_SETTINGS as unknown as { guerreSterile: { tours: number; cooldown: number } }).guerreSterile;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

describe('GUERRE-VIVANTE · data bot.json', () => {
  it('guerreSterile { tours: 30, cooldown: 10 }', () => {
    expect(STERILE).toEqual({ tours: 30, cooldown: 10 });
  });
});

// ---------------------------------------------------------------------------
// D-A · jugement de guerre stérile — le prédicat
// ---------------------------------------------------------------------------

describe('GUERRE-VIVANTE · D-A — guerreSterileDe', () => {
  it('vraie à ≥ 30 tours, 0 bataille ; fausse avant, fausse avec batailles, fausse hors guerre', () => {
    const st = state({
      units: [{ id: 'a1', type: 'guerrier', owner: AUTRE, q: 6, r: 2 }],
      cities: [{ id: 'c1', owner: AUTRE, q: 6, r: 2 }, { id: 'c2', owner: ME, q: 2, r: 2 }],
    });
    expect(guerreSterileDe(st, ME, AUTRE, NORMAL)).toBe(true);
    expect(guerreSterileDe({ ...st, turn: STERILE.tours + 31 } as GameState, ME, AUTRE, NORMAL)).toBe(true);
    const jeune = state({
      units: [{ id: 'a1', type: 'guerrier', owner: AUTRE, q: 6, r: 2 }],
      cities: [{ id: 'c1', owner: AUTRE, q: 6, r: 2 }, { id: 'c2', owner: ME, q: 2, r: 2 }],
      turn: STERILE.tours + 5, depuis: STERILE.tours,
    });
    expect(guerreSterileDe(jeune, ME, AUTRE, NORMAL)).toBe(false);
    const bataillee = state({
      units: [{ id: 'a1', type: 'guerrier', owner: AUTRE, q: 6, r: 2 }],
      cities: [{ id: 'c1', owner: AUTRE, q: 6, r: 2 }, { id: 'c2', owner: ME, q: 2, r: 2 }],
      batailles: 1,
    });
    expect(guerreSterileDe(bataillee, ME, AUTRE, NORMAL)).toBe(false);
    const paix = state({
      units: [{ id: 'a1', type: 'guerrier', owner: AUTRE, q: 6, r: 2 }],
      cities: [{ id: 'c1', owner: AUTRE, q: 6, r: 2 }, { id: 'c2', owner: ME, q: 2, r: 2 }],
      wars: [],
    });
    expect(guerreSterileDe(paix, ME, AUTRE, NORMAL)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D-A · stérile + perdant → il PROPOSE LA PAIX LUI-MÊME (cadencée)
// ---------------------------------------------------------------------------

describe('GUERRE-VIVANTE · D-A — stérile perdant : paix proposée par le bot', () => {
  function guerrePerdante(): GameState {
    return state({
      units: [
        { id: 'e1', type: 'legion', owner: AUTRE, q: 6, r: 2 },
        { id: 'e2', type: 'legion', owner: AUTRE, q: 6, r: 3 },
        { id: 'm1', type: 'guerrier', owner: ME, q: 2, r: 3 },
      ],
      cities: [{ id: 'c1', owner: AUTRE, q: 6, r: 2 }, { id: 'c2', owner: ME, q: 2, r: 2 }],
    });
  }
  it('ProposePeace vers le déclaré (réception R-189 — la grille du receveur décide)', () => {
    const plan = botPolicy(guerrePerdante(), ME, rngFaux());
    expect(plan.actions).toContainEqual({ type: 'ProposePeace', player: AUTRE });
  });
  it('rien avant le seuil stérile', () => {
    const jeune = guerrePerdante();
    jeune.turn = STERILE.tours + 5;
    jeune.diplomacy.warsDepuis = { [`${AUTRE},${ME}`]: STERILE.tours };
    const plan = botPolicy(jeune, ME, rngFaux());
    expect(plan.actions).not.toContainEqual({ type: 'ProposePeace', player: AUTRE });
  });
  it('D-C : cadencée — pas de proposition CHAQUE tour (cooldown respecté hors frontière)', () => {
    const tourMid = guerrePerdante();
    tourMid.turn = 60 + 1; // depuis 10 → duree 51 ; 51 % 10 ≠ 0
    tourMid.diplomacy.warsDepuis = { [`${AUTRE},${ME}`]: 10 };
    const plan = botPolicy(tourMid, ME, rngFaux());
    expect(plan.actions).not.toContainEqual({ type: 'ProposePeace', player: AUTRE });
  });
});

// ---------------------------------------------------------------------------
// D-A · stérile + gagnant → il ASSAILLE (marche directe, plus de campement)
// ---------------------------------------------------------------------------

describe('GUERRE-VIVANTE · D-A — stérile gagnant : conversion en campagne', () => {
  function guerreGagnante(): GameState {
    return state({
      units: [
        { id: 'm1', type: 'legion', owner: ME, q: 3, r: 3 },
        { id: 'm2', type: 'legion', owner: ME, q: 3, r: 4 },
        { id: 'm3', type: 'legion', owner: ME, q: 3, r: 5 },
        { id: 'm4', type: 'legion', owner: ME, q: 3, r: 6 },
        { id: 'm5', type: 'legion', owner: ME, q: 3, r: 7 },
        { id: 'm6', type: 'legion', owner: ME, q: 3, r: 8 },
        { id: 'e1', type: 'guerrier', owner: AUTRE, q: 6, r: 2 },
      ],
      cities: [{ id: 'c1', owner: AUTRE, q: 6, r: 2 }, { id: 'c2', owner: ME, q: 2, r: 2 }],
    });
  }
  it('les membres de l’armée reçoivent « offensiver » (marche directe sur la ville) au lieu de « rallier »', () => {
    const s = guerreGagnante();
    const campagne = cibleCampagne(s, ME)!;
    const objectifs = assignerObjectifs(s, ME, NORMAL);
    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']) {
      const obj = objectifs.get(id);
      // Campagne incomplète au rayon + stérile gagnant → marche directe.
      expect(obj?.kind, id).toBe('offensiver');
      expect(obj && 'cible' in obj && obj.cible).toEqual({ q: campagne.q, r: campagne.r });
    }
  });
  it('avant le seuil stérile : campement canon (rallier sur l’anneau)', () => {
    const s = guerreGagnante();
    s.turn = STERILE.tours + 5;
    s.diplomacy.warsDepuis = { [`${AUTRE},${ME}`]: STERILE.tours };
    const objectifs = assignerObjectifs(s, ME, NORMAL);
    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']) {
      expect(objectifs.get(id)?.kind, id).toBe('rallier');
    }
  });
  it('D-C garde : la déclaration du gagnant reste verrouillée par delaiRedeclaration après paix', () => {
    // Miroir canon BOT-MARCHE — la boucle paix → re-déclaration immédiate
    // reste impossible (test de garde sur le comportement existant).
    const s = guerreGagnante();
    s.diplomacy.war = [];
    s.diplomacy.dernieresCibles = { [`${ME},${AUTRE}`]: s.turn - 5 };
    const plan = botPolicy(s, ME, rngFaux());
    expect(plan.actions.filter((a) => a.type === 'DeclareWar')).toHaveLength(0);
  });
});
