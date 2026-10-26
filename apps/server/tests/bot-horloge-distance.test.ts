/**
 * HORLOGE-DISTANCE (décisions Erik 28/10, HANDOFF-HORLOGE-DISTANCE) — L1
 * test-first.
 *
 * D1 : la DURÉE MINIMALE de guerre est modulée par la DISTANCE de la cible —
 *      duréeMin = toursPaixMin + distanceCible × facteurMarcheCible (données)
 *      — la distance étant mesurée À LA DÉCLARATION (wrap Est↔Ouest, entre
 *      capitales effectives) et consignée dans diplomacy.distancesCible
 *      (champ optionnel — schemaVersion 28 inchangée).
 *      La paix ADMINISTRATIVE (guerre jamais bataillée) reste à duréeMin ;
 *      la paix du GAGNANT s'applique au-dessus (toursPaixGagnant × duréeMin).
 * D2 : conduite inchangée (armées R-31, cible pondérée, spawns intouchés).
 */
import { describe, expect, it } from 'vitest';
import {
  BOT_SETTINGS,
  applyDeclareWar,
  applyProposePeace,
  distanceCibleGuerre,
  makeState,
} from '@game/rules';
import type { City, GameState, PlayerId, SeededRng } from '@game/rules';

const rngFaux = (): SeededRng =>
  ({ next: () => 0.99, nextInt: (n: number) => n - 1, state: 0 }) as SeededRng;
import { botPolicy, deciderPaix, dureeMinGuerre, profileDuBot } from '../src/botPolicy.js';

const ME: PlayerId = 'p2';
const AUTRE: PlayerId = 'p1';

function state(opts: {
  cities?: Array<Partial<City> & { id: string; owner: string; q: number; r: number }>;
  width?: number;
}): GameState {
  const s = makeState({
    width: opts.width ?? 30,
    height: 12,
    players: [AUTRE, ME],
    warPairs: [],
    units: [],
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
const cle = `${AUTRE},${ME}`; // AUTRE < ME

/** Déclare la guerre ME→AUTRE sur l'état donné et retourne le nouvel état. */
function enGuerre(s: GameState): GameState {
  const w = applyDeclareWar(s, ME, AUTRE);
  if (!w.ok) throw new Error('guerre attendue');
  return w.state;
}

// ---------------------------------------------------------------------------
// D1 — consigne de la distance à la déclaration
// ---------------------------------------------------------------------------

describe('HORLOGE-DISTANCE · D1 — la distance de cible est consignée à la déclaration', () => {
  it('distance wrap entre capitales effectives, posée dans diplomacy.distancesCible', () => {
    const s = enGuerre(state({
      cities: [
        { id: 'c1', owner: AUTRE, q: 6, r: 2 },
        { id: 'c2', owner: ME, q: 2, r: 2 },
      ],
    }));
    expect(s.diplomacy.distancesCible?.[cle]).toBe(4);
    expect(distanceCibleGuerre(s, ME, AUTRE)).toBe(4);
    expect(distanceCibleGuerre(s, AUTRE, ME)).toBe(4);
  });

  it('le WRAP Est↔Ouest est pris en compte (15 cases par le bout, pas 25)', () => {
    const s = enGuerre(state({
      width: 30,
      cities: [
        { id: 'c1', owner: AUTRE, q: 2, r: 2 },
        { id: 'c2', owner: ME, q: 27, r: 2 },
      ],
    }));
    expect(s.diplomacy.distancesCible?.[cle]).toBe(5);
  });

  it('une capitale PRÉ-HORLOGE absente (re-déclaration) ré-écrase la distance', () => {
    let s = state({
      cities: [
        { id: 'c1', owner: AUTRE, q: 6, r: 2 },
        { id: 'c2', owner: ME, q: 2, r: 2 },
      ],
    });
    s = enGuerre(s);
    expect(s.diplomacy.distancesCible?.[cle]).toBe(4);
    // paix puis re-déclaration après rapprochement des capitales.
    const paix = applyProposePeace(s, ME, AUTRE, true);
    if (!paix.ok) throw new Error('paix attendue');
    let s2 = paix.state as GameState;
    const villes = { ...s2.cities };
    villes['c2'] = { ...villes['c2']!, q: 5, r: 2 };
    s2.cities = villes;
    s2 = enGuerre(s2);
    expect(s2.diplomacy.distancesCible?.[cle]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D1 — durée minimale modulée : proche = brève, loin = longue
// ---------------------------------------------------------------------------

describe('HORLOGE-DISTANCE · D1 — duréeMin = toursPaixMin + distance × facteurMarche', () => {
  const fixture = (qAutre: number) =>
    enGuerre(state({
      cities: [
        { id: 'c1', owner: AUTRE, q: qAutre, r: 2 },
        { id: 'c2', owner: ME, q: 2, r: 2 },
      ],
    }));

  it('dureeMinGuerre : voisine (dist 4) → min + 4 ; lointaine (dist 15, wrap) → min + 15', () => {
    expect(NORMAL.toursPaixMin).toBe(12);
    expect(NORMAL.facteurMarcheCible).toBe(1);
    expect(dureeMinGuerre(fixture(6), ME, AUTRE, NORMAL)).toBe(16);
    expect(dureeMinGuerre(fixture(17), ME, AUTRE, NORMAL)).toBe(27);
  });

  it('paix administrative d’une guerre PROCHE : acceptée à duréeMin (16), refusée avant', () => {
    const s = fixture(6);
    s.turn += 15;
    expect(deciderPaix(s, AUTRE, ME, NORMAL)).toBe(false);
    s.turn += 1;
    expect(deciderPaix(s, AUTRE, ME, NORMAL)).toBe(true);
  });

  it('paix administrative d’une guerre LOINTAINE : encore refusée à 16, acceptée à 27', () => {
    const s = fixture(17); // wrap : dist 15
    s.turn += 16;
    expect(deciderPaix(s, AUTRE, ME, NORMAL)).toBe(false); // l'horloge connaît la marche
    s.turn += 11;
    expect(deciderPaix(s, AUTRE, ME, NORMAL)).toBe(true);
  });

  it('une guerre BATAILLÉE lointaine tient jusqu’à 2 × duréeMin (paix du gagnant au-dessus)', () => {
    const s = fixture(17);
    s.diplomacy.batailles = { [cle]: 5 };
    s.turn += 26; // < 2 × 27
    expect(deciderPaix(s, AUTRE, ME, NORMAL)).toBe(false);
    s.turn += 1; // 27 = duréeMin : encore refusée (bataillée)
    expect(deciderPaix(s, AUTRE, ME, NORMAL)).toBe(false);
    s.turn += 27; // 54 = 2 × duréeMin
    expect(deciderPaix(s, AUTRE, ME, NORMAL)).toBe(true);
  });

  it('distance INCONNUE (guerre pré-existante, champ absent) → repli toursPaixMin (comportement historique)', () => {
    const s = fixture(6);
    s.diplomacy.distancesCible = {};
    expect(dureeMinGuerre(s, ME, AUTRE, NORMAL)).toBe(NORMAL.toursPaixMin);
    s.turn += NORMAL.toursPaixMin;
    expect(deciderPaix(s, AUTRE, ME, NORMAL)).toBe(true);
  });

  it('le bot PROPOSE la paix administrative d’une guerre vide à duréeMin (pas avant)', () => {
    const s = fixture(6);
    s.turn += 15;
    expect(botPolicy(s, ME, rngFaux(), 'normal').actions).not.toContainEqual({ type: 'ProposePeace', player: AUTRE });
    s.turn += 1;
    expect(botPolicy(s, ME, rngFaux(), 'normal').actions).toContainEqual({ type: 'ProposePeace', player: AUTRE });
  });
});

// ---------------------------------------------------------------------------
// Données — les trois profils portent facteurMarcheCible
// ---------------------------------------------------------------------------

describe('HORLOGE-DISTANCE · données', () => {
  it('facteurMarcheCible présent et ≥ 1 sur chaque profil ; purges à la paix', () => {
    for (const [nom, p] of Object.entries(BOT_SETTINGS.profiles)) {
      expect(p.facteurMarcheCible, nom).toBeGreaterThanOrEqual(1);
    }
    // la paix purge la distance consignée (miroir batailles).
    let s = enGuerre(state({
      cities: [
        { id: 'c1', owner: AUTRE, q: 6, r: 2 },
        { id: 'c2', owner: ME, q: 2, r: 2 },
      ],
    }));
    expect(s.diplomacy.distancesCible?.[cle]).toBe(4);
    const paix = applyProposePeace(s, ME, AUTRE, true);
    if (!paix.ok) throw new Error('paix attendue');
    expect((paix.state as GameState).diplomacy.distancesCible?.[cle]).toBeUndefined();
  });
});
