/**
 * PAIX-RYTHME (décisions Erik 27/10, HANDOFF-PAIX-RYTHME) — L1 test-first.
 *
 * D1 : armées de SIÈGE (canon R-31) — la campagne rassemblée FUSE ses
 *      trios homogènes (même type) au point de rendez-vous, l'armée formée
 *      assiège et frappe ; les groupes sont hors armées (isArmy exclus).
 * D2 : cible de guerre PONDÉRÉE (le plus faible parmi les proches — poids
 *      data) et cible de campagne = cible de guerre.
 * D3 : paix du GAGNANT (accepte au-delà de toursPaixGagnant × toursPaixMin),
 *      paix administrative des guerres JAMAIS bataillées à toursPaixMin,
 *      chanceAccepteFaible ABROGÉE (réponse déterministe, zéro tirage) ;
 *      les batailles de guerre sont comptées par paire (diplomacy.batailles).
 */
import { describe, expect, it } from 'vitest';
import {
  BOT_SETTINGS,
  applyDeclareWar,
  createRng,
  makeState,
  resolveTurn,
} from '@game/rules';
import type { City, GameEvent, GameState, Order, PlayerId, SeededRng } from '@game/rules';

const rngFaux = (): SeededRng =>
  ({ next: () => 0.99, nextInt: (n: number) => n - 1, state: 0 }) as SeededRng;
import {
  assignerObjectifs,
  botPolicy,
  cibleCampagne,
  cibleGuerre,
  deciderPaix,
  groupesFusion,
  profileDuBot,
} from '../src/botPolicy.js';

const ME: PlayerId = 'p2';
const AUTRE: PlayerId = 'p1';
const TROISIEME: PlayerId = 'p3';

function state(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number; isArmy?: boolean }>;
  cities?: Array<Partial<City> & { id: string; owner: string; q: number; r: number }>;
  wars?: Array<[PlayerId, PlayerId]>;
  joueurs?: PlayerId[];
  width?: number;
}): GameState {
  const s = makeState({
    width: opts.width ?? 30,
    height: 12,
    players: opts.joueurs ?? [AUTRE, ME],
    warPairs: opts.wars ?? [[AUTRE, ME]],
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

// ---------------------------------------------------------------------------
// D1 — groupes de fusion (armées de siège R-31)
// ---------------------------------------------------------------------------

describe('PAIX-RYTHME · D1 — groupes de fusion homogènes', () => {
  const CIBLE = { q: 6, r: 2 };

  it('trois guerriers de l’armée dans le rayon → UN groupe de 3, rdv = hex le plus proche de la cible', () => {
    const s = state({
      units: [
        { id: 'z1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'z2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 5, r: 2 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 5, r: 3 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 4, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: CIBLE.q, r: CIBLE.r },
      ],
    });
    const campagne = cibleCampagne(s, ME)!;
    const groupes = groupesFusion(s, ME, NORMAL, campagne);
    expect(groupes).toHaveLength(1);
    expect([...groupes[0]!.membres].sort()).toEqual(['u1', 'u2', 'u3']);
    // rdv = l'hex du membre le plus proche de la campagne : u1 (dist 1).
    expect(groupes[0]!.rdv).toEqual({ q: 5, r: 2 });
  });

  it('types mixtes : seul le type en trio forme un groupe (le sous-effectif ne fusionne pas)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 5, r: 2 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 5, r: 3 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 4, r: 2 },
        { id: 'u4', type: 'archer', owner: ME, q: 5, r: 1 },
        { id: 'u5', type: 'archer', owner: ME, q: 4, r: 3 },
        { id: 'z1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'z2', type: 'guerrier', owner: ME, q: 2, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: CIBLE.q, r: CIBLE.r },
      ],
    });
    const groupes = groupesFusion(s, ME, NORMAL, cibleCampagne(s, ME)!);
    expect(groupes).toHaveLength(1);
    expect([...groupes[0]!.membres].sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('les ARMÉES (isArmy) ne sont jamais membres d’une fusion', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 5, r: 2, isArmy: true },
        { id: 'u2', type: 'guerrier', owner: ME, q: 5, r: 3, isArmy: true },
        { id: 'u3', type: 'guerrier', owner: ME, q: 4, r: 2, isArmy: true },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: CIBLE.q, r: CIBLE.r },
      ],
    });
    expect(groupesFusion(s, ME, NORMAL, cibleCampagne(s, ME)!)).toHaveLength(0);
  });

  it('hors du rayon de la campagne : pas de groupe (la fusion n’arrive qu’au siège)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 2, r: 4 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 2, r: 5 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 2, r: 6 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: CIBLE.q, r: CIBLE.r },
      ],
    });
    expect(groupesFusion(s, ME, NORMAL, cibleCampagne(s, ME)!)).toHaveLength(0);
  });

  it('objectifs : le trio dispersé CONVERGE vers le rdv ; co-localisé il FUSIONNE ; l’émission porte FormArmy', () => {
    const s = state({
      units: [
        { id: 'z1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'z2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 5, r: 2 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 5, r: 3 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 4, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: CIBLE.q, r: CIBLE.r },
      ],
    });
    const objectifs = assignerObjectifs(s, ME, NORMAL);
    expect(objectifs.get('u1')?.kind).toBe('fusionner'); // déjà au rdv
    expect(objectifs.get('u2')?.kind).toBe('converger');
    expect(objectifs.get('u3')?.kind).toBe('converger');
    expect(objectifs.get('u2')?.cible).toEqual({ q: 5, r: 2 });
    // Émission : UN FormArmy (membres + rdv), émis par le premier membre.
    const plan = botPolicy(s, ME, rngFaux(), 'normal');
    const forms = plan.orders.filter((o): o is Extract<Order, { type: 'FormArmy' }> => o.type === 'FormArmy');
    expect(forms).toHaveLength(1);
    expect([...forms[0]!.members].sort()).toEqual(['u1', 'u2', 'u3']);
    expect(forms[0]!.rally).toEqual({ q: 5, r: 2 });
    // u2 avance vers le rdv (un pas).
    const move = plan.orders.find((o) => o.type === 'Move' && (o as { unitId: string }).unitId === 'u2');
    expect(move).toBeDefined();
  });

  it('FIN DE CHAÎNE moteur : le FormArmy du bot forme bien l’armée (ArmyFormed)', () => {
    const s = state({
      units: [
        { id: 'z1', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'z2', type: 'guerrier', owner: ME, q: 2, r: 2 },
        { id: 'u1', type: 'guerrier', owner: ME, q: 5, r: 2 },
        { id: 'u2', type: 'guerrier', owner: ME, q: 5, r: 2 },
        { id: 'u3', type: 'guerrier', owner: ME, q: 5, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: CIBLE.q, r: CIBLE.r },
      ],
    });
    const plan = botPolicy(s, ME, rngFaux(), 'normal');
    const res = resolveTurn(s, { [ME]: plan.orders } as Record<string, Order[]>, s.rngSeed);
    const formed = res.events.find((e: GameEvent) => e.type === 'ArmyFormed');
    expect(formed).toBeDefined();
    const unites = Object.values(res.newState.units);
    expect(unites.some((u) => u.isArmy && u.owner === ME)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D2 — cible de guerre pondérée (le plus faible parmi les proches)
// ---------------------------------------------------------------------------

describe('PAIX-RYTHME · D2 — cible de guerre pondérée', () => {
  it('un voisin PROCHE un peu plus fort bat un faible LOINTAIN (distance pondérée)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: AUTRE, q: 2, r: 2 }, // faible, loin (18)
        { id: 'u2', type: 'guerrier', owner: TROISIEME, q: 4, r: 2 },
        { id: 'u3', type: 'guerrier', owner: TROISIEME, q: 4, r: 3 }, // 2× plus fort, proche (2)
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 27, r: 2 }, // loin (wrap)
        { id: 'c3', owner: TROISIEME, q: 4, r: 2 }, // proche
      ],
      wars: [],
      joueurs: [AUTRE, ME, TROISIEME],
      width: 50,
    });
    // Ancienne règle (faible absolu) : AUTRE. Pondérée : TROISIEME.
    expect(cibleGuerre(s, ME)).toBe(TROISIEME);
  });

  it('à pondération égale, le plus FAIBLE gagne toujours (le poids affine, il ne renverse pas)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: AUTRE, q: 2, r: 2 },
        { id: 'u2', type: 'guerrier', owner: TROISIEME, q: 4, r: 2 },
        { id: 'u3', type: 'guerrier', owner: TROISIEME, q: 4, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 4, r: 2 },
        { id: 'c3', owner: TROISIEME, q: 4, r: 6 },
      ],
      wars: [],
      joueurs: [AUTRE, ME, TROISIEME],
    });
    // AUTRE 2 pts dist 2 ; TROISIEME 4 pts dist 4 → score 2,4 vs 5,6 → faible.
    expect(cibleGuerre(s, ME)).toBe(AUTRE);
  });

  it('la cible de CAMPAGNE est une ville de la cible de GUERRE (fin de la marche divergente)', () => {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: AUTRE, q: 2, r: 2 },
        { id: 'u2', type: 'guerrier', owner: TROISIEME, q: 4, r: 2 },
        { id: 'u3', type: 'guerrier', owner: TROISIEME, q: 4, r: 3 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 27, r: 2, capital: true },
        { id: 'c2b', owner: AUTRE, q: 27, r: 3, capital: false },
        { id: 'c3', owner: TROISIEME, q: 4, r: 2, capital: true },
        { id: 'c3b', owner: TROISIEME, q: 5, r: 2, capital: false },
      ],
      wars: [[AUTRE, ME], [TROISIEME, ME]],
      joueurs: [AUTRE, ME, TROISIEME],
      width: 50,
    });
    const c = cibleCampagne(s, ME)!;
    expect(c.cityId.startsWith('c3')).toBe(true);
    expect(c).toEqual({ q: 4, r: 2, cityId: 'c3' }); // ville la plus proche du même ennemi
  });
});

// ---------------------------------------------------------------------------
// D3 — paix du gagnant + paix administrative (guerres vides)
// ---------------------------------------------------------------------------

describe('PAIX-RYTHME · D3 — compteur de batailles et paix déterministe', () => {
  function enGuerre(): GameState {
    const s = state({
      units: [
        { id: 'u1', type: 'guerrier', owner: ME, q: 3, r: 2 },
        { id: 'u2', type: 'guerrier', owner: AUTRE, q: 4, r: 2 },
      ],
      cities: [
        { id: 'c1', owner: ME, q: 2, r: 2 },
        { id: 'c2', owner: AUTRE, q: 6, r: 2 },
      ],
      wars: [],
    });
    const w = applyDeclareWar(s, ME, AUTRE);
    if (!w.ok) throw new Error('guerre attendue');
    return w.state;
  }

  it('les batailles de guerre sont comptées par paire (diplomacy.batailles)', () => {
    const s = enGuerre();
    expect(s.diplomacy.batailles).toBeUndefined();
    // u1 attaque u2 : un combat planifié → compteur.
    const res = resolveTurn(s, { [ME]: [{ type: 'Attack', unitId: 'u1', target: { q: 4, r: 2 } }] }, s.rngSeed);
    const cle = ME < AUTRE ? `${ME},${AUTRE}` : `${AUTRE},${ME}`;
    expect(res.newState.diplomacy.batailles?.[cle]).toBe(1);
  });

  it('guerre VIDE (0 bataille) : acceptée à toursPaixMin, refusée avant', () => {
    const profile = NORMAL;
    let s = enGuerre();
    s.turn += profile.toursPaixMin + 3; // duréeMin = min + dist 4 (HORLOGE-DISTANCE)
    expect(deciderPaix(s, AUTRE, ME, profile)).toBe(false);
    s.turn += 1;
    expect(deciderPaix(s, AUTRE, ME, profile)).toBe(true);
  });

  it('guerre BATAILLÉE : le gagnant tient entre min et 2×min, accepte au-delà (paix du gagnant)', () => {
    const profile = NORMAL;
    const s = enGuerre();
    const cle = ME < AUTRE ? `${ME},${AUTRE}` : `${AUTRE},${ME}`;
    s.diplomacy.batailles = { [cle]: 5 };
    s.turn += profile.toursPaixMin + 1;
    expect(deciderPaix(s, AUTRE, ME, profile)).toBe(false); // guerre vivante : on continue
    s.turn += profile.toursPaixMin + 7; // ≥ 2×duréeMin (min + dist 4)
    expect(deciderPaix(s, AUTRE, ME, profile)).toBe(true);
  });

  it('réponse DÉTERMINISTE : plus aucun tirage (même état ⇒ même réponse, rng absent)', () => {
    const s = enGuerre();
    expect(deciderPaix(s, AUTRE, ME, NORMAL)).toBe(false);
    expect(deciderPaix(s, ME, AUTRE, NORMAL)).toBe(false);
  });

  it('les bots PROPOSENT la paix administrative des guerres vides (même en position de force)', () => {
    let s = enGuerre();
    s.turn += NORMAL.toursPaixMin + 4; // duréeMin = min + dist 4 (HORLOGE-DISTANCE)
    const plan = botPolicy(s, ME, rngFaux(), 'normal');
    expect(plan.actions).toContainEqual({ type: 'ProposePeace', player: AUTRE });
  });

  it('chanceAccepteFaible est ABROGÉE des profils ; toursPaixGagnant/poidsDistanceCibleGuerre présents', () => {
    for (const [nom, p] of Object.entries(BOT_SETTINGS.profiles)) {
      expect((p as unknown as Record<string, unknown>)['chanceAccepteFaible'], nom).toBeUndefined();
      expect(p.toursPaixGagnant, nom).toBeGreaterThanOrEqual(1);
      expect(p.poidsDistanceCibleGuerre, nom).toBeGreaterThan(0);
    }
  });
});
