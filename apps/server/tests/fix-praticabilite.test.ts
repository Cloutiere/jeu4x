/**
 * FIX-PRACTICABILITÉ (canon Erik 13/11 — levier L1 du diagnostic
 * DIAG-OSCILLATION-RESIDUELLE, prod NP8JEE) : le waypoint de patrouille ne
 * se pose plus sur l'EAU. Le sélecteur géométrique (coins de l'anneau) ne
 * testait jamais la praticabilité — un anneau côtier peut tomber en mer et
 * geler le scout éternellement (u4 (24,5), mp intactes, t11-14). Canon :
 * waypoint = coin PRATICABLE (chemin terrestre BFS depuis l'unité, wrap
 * cylindrique) ; re-tir déterministe (prochain coin praticable du cycle) ;
 * AUCUN candidat praticable → repli canon « jamais inactif » (le scout
 * quitte la patrouille → classement explorer ⑤ — JAMAIS un waypoint
 * inatteignable ni un Hold par inertie).
 */
import { describe, expect, it } from 'vitest';
import { createRng, hexDistanceW, makeState } from '@game/rules';
import type { GameState } from '@game/rules';
import { assignerObjectifs, botPolicy, porteeMarcheTerrestre, prochainWaypointPatrouille, profileDuBot } from '../src/botPolicy.js';

const BOT = 'p2';
const HUMAN = 'p1';

/** Géométrie NP8JEE reconstituée : capitale côtière (27,10), anneau de
 *  rayon 3 dont 3 coins sur 6 dans la mer ((24,10) eau, (24,13) océan,
 *  (27,13) eau) — miroir du dump prod. */
function stateNp8jee(opts: { unitAt?: { q: number; r: number } } = {}): GameState {
  return makeState({
    width: 36,
    height: 20,
    players: [HUMAN, BOT],
    units: [
      { id: 'u4', type: 'guerrier', owner: BOT, q: opts.unitAt?.q ?? 24, r: opts.unitAt?.r ?? 5, aboard: null, cargo: null },
    ],
    cities: [{ id: 'c2', owner: BOT, q: 27, r: 10, pop: 2, capital: true }],
    terrainOverrides: {
      '24,10': 'eau',
      '24,13': 'ocean',
      '27,13': 'eau',
    },
    rngSeed: 42,
  }) as GameState;
}

describe('FIX-PRACTICABILITÉ · porteeMarcheTerrestre', () => {
  it('l\'anneau praticable NE contient PAS les cases d\'eau (BFS terrestre)', () => {
    const s = stateNp8jee();
    const u4 = s.units['u4']!;
    const portee = porteeMarcheTerrestre(s, u4);
    expect(portee.has('24,10')).toBe(false);
    expect(portee.has('24,13')).toBe(false);
    expect(portee.has('27,13')).toBe(false);
    expect(portee.has('27,7')).toBe(true); // coin colline praticable
    expect(portee.has('27,10')).toBe(true); // la capitale est joignable
  });
});

describe('FIX-PRACTICABILITÉ · prochainWaypointPatrouille', () => {
  const capitale = { q: 27, r: 10 };
  const rayon = profileDuBot().rayonPatrouille;

  it('NP8JEE : le waypoint n\'est JAMAIS l\'eau — re-tir vers le prochain coin praticable du cycle', () => {
    const s = stateNp8jee();
    const u4 = s.units['u4']!;
    const portee = porteeMarcheTerrestre(s, u4);
    const wp = prochainWaypointPatrouille(capitale, u4, rayon, s.mapWidth, (h) => portee.has(`${h.q},${h.r}`));
    expect(wp).not.toBeNull();
    // l'ancien sélecteur retournait (24,10) — l'EAU (cause fine du gel)
    expect(wp).not.toMatchObject({ q: 24, r: 10 });
    const coinEau = new Set(['24,10', '24,13', '27,13']);
    expect(coinEau.has(`${wp!.q},${wp!.r}`)).toBe(false);
  });

  it('le cycle reste déterministe et ne visite que des coins praticables', () => {
    const s = stateNp8jee();
    const u4 = s.units['u4']!;
    const portee = porteeMarcheTerrestre(s, u4);
    const prat = (h: { q: number; r: number }) => portee.has(`${h.q},${h.r}`);
    const coinEau = new Set(['24,10', '24,13', '27,13']);
    const vus: string[] = [];
    let pos = { q: u4.q, r: u4.r };
    for (let i = 0; i < 12; i++) {
      const wp = prochainWaypointPatrouille(capitale, pos, rayon, s.mapWidth, prat)!;
      expect(coinEau.has(`${wp.q},${wp.r}`)).toBe(false);
      vus.push(`${wp.q},${wp.r}`);
      pos = wp;
    }
    // cyclique (fenêtre des coins praticables — 3 sur 6 ici)
    expect(vus.slice(0, 3)).toEqual(vus.slice(3, 6));
    expect(vus.slice(6, 9)).toEqual(vus.slice(0, 3));
  });

  it('TOUS les coins dans l\'eau (capitale insulaire) → null (repli jamais-inactif côté appelant)', () => {
    const s = makeState({
      width: 20,
      height: 16,
      players: [HUMAN, BOT],
      units: [{ id: 'u1', type: 'guerrier', owner: BOT, q: 5, r: 5, aboard: null, cargo: null }],
      cities: [{ id: 'c1', owner: BOT, q: 5, r: 5, pop: 2, capital: true }],
      fill: 'prairie',
      terrainOverrides: {
        '8,5': 'eau', '8,2': 'eau', '5,2': 'eau', '2,5': 'eau', '2,8': 'eau', '5,8': 'eau',
        '8,3': 'eau', '7,2': 'eau', '6,2': 'eau', '4,2': 'eau', '3,2': 'eau', '2,3': 'eau',
        '2,4': 'eau', '2,6': 'eau', '2,7': 'eau', '3,8': 'eau', '4,8': 'eau', '6,8': 'eau', '7,8': 'eau', '8,7': 'eau',
        '9,4': 'eau', '9,5': 'eau', '9,6': 'eau',
        '1,5': 'eau', '4,1': 'eau', '5,1': 'eau', '6,1': 'eau',
        '4,9': 'eau', '5,9': 'eau', '6,9': 'eau',
      },
      rngSeed: 42,
    }) as GameState;
    const u = s.units['u1']!;
    const portee = porteeMarcheTerrestre(s, u);
    const wp = prochainWaypointPatrouille({ q: 5, r: 5 }, u, rayon, s.mapWidth, (h) => portee.has(`${h.q},${h.r}`));
    expect(wp).toBeNull();
  });

  it('sans prédicat (appel legacy) : comportement géométrique inchangé', () => {
    const wp = prochainWaypointPatrouille(capitale, { q: 24, r: 5 }, rayon, 36);
    // miroir diag : le coin suivant le plus proche depuis (24,5) = (24,10)
    expect(wp).toMatchObject({ q: 24, r: 10 });
  });

  it('déterminisme : 30 seeds ⇒ le même waypoint', () => {
    const s = stateNp8jee();
    const u4 = s.units['u4']!;
    const portee = porteeMarcheTerrestre(s, u4);
    const ref = prochainWaypointPatrouille(capitale, u4, rayon, s.mapWidth, (h) => portee.has(`${h.q},${h.r}`));
    for (let seed = 0; seed < 30; seed++) {
      const rng = createRng(seed);
      void rng; // le sélecteur est pur : aucun tir — la boucle prouve l'absence d'aléa
      expect(prochainWaypointPatrouille(capitale, u4, rayon, s.mapWidth, (h) => portee.has(`${h.q},${h.r}`))).toEqual(ref);
    }
  });
});

describe('FIX-PRACTICABILITÉ · assignerObjectifs (repli jamais-inactif)', () => {
  it('NP8JEE : u4 reçoit un objectif EXÉCUTABLE — jamais un patrouiller sur l\'eau', () => {
    const s = stateNp8jee();
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    const o = obj.get('u4')!;
    if (o.kind === 'patrouiller') {
      const coinEau = new Set(['24,10', '24,13', '27,13']);
      expect(o.cible).toBeDefined();
      expect(coinEau.has(`${o.cible!.q},${o.cible!.r}`)).toBe(false);
    } else {
      // repli canon : explorer (⑤) ou chasser — jamais de gel
      expect(['explorer', 'chasser']).toContain(o.kind);
    }
  });

  it('NP8JEE : le PLAN émet un ordre actif (Move) — plus jamais un Hold par waypoint impossible', () => {
    const s = stateNp8jee();
    const plan = botPolicy(s, BOT, createRng(7));
    const ordre = plan.orders.find((x) => 'unitId' in x && x.unitId === 'u4');
    expect(ordre?.type).toBe('Move');
  });

  it('capitale insulaire (aucun coin praticable) : repli jamais-inactif — l\'unité reçoit un ordre, pas d\'inertie', () => {
    const s = makeState({
      width: 20,
      height: 16,
      players: [HUMAN, BOT],
      units: [{ id: 'u1', type: 'guerrier', owner: BOT, q: 5, r: 5, aboard: null, cargo: null }],
      cities: [{ id: 'c1', owner: BOT, q: 5, r: 5, pop: 2, capital: true }],
      terrainOverrides: {
        '8,5': 'eau', '8,2': 'eau', '5,2': 'eau', '2,5': 'eau', '2,8': 'eau', '5,8': 'eau',
        '8,3': 'eau', '7,2': 'eau', '6,2': 'eau', '4,2': 'eau', '3,2': 'eau', '2,3': 'eau',
        '2,4': 'eau', '2,6': 'eau', '2,7': 'eau', '3,8': 'eau', '4,8': 'eau', '6,8': 'eau', '7,8': 'eau', '8,7': 'eau',
        '9,4': 'eau', '9,5': 'eau', '9,6': 'eau',
        '1,5': 'eau', '4,1': 'eau', '5,1': 'eau', '6,1': 'eau',
        '4,9': 'eau', '5,9': 'eau', '6,9': 'eau',
      },
      rngSeed: 42,
    }) as GameState;
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    expect(obj.get('u1')!.kind).not.toBe('patrouiller');
    const plan = botPolicy(s, BOT, createRng(7));
    const ordre = plan.orders.find((x) => 'unitId' in x && x.unitId === 'u1');
    expect(ordre).toBeDefined(); // jamais-inactif : un ordre existe (Move/Hold d'exploration ou tenir EXPLICITE)
  });
});

describe('FIX-PRACTICABILITÉ · non-régression', () => {
  it('anneau 100 % terre : le comportement cyclique d\'origine est bit-à-bit conservé', () => {
    const s = makeState({
      width: 12,
      height: 12,
      players: [HUMAN, BOT],
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3, aboard: null, cargo: null }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
      rngSeed: 42,
    }) as GameState;
    const capitale = { q: 2, r: 3 };
    const rayon = profileDuBot().rayonPatrouille;
    let pos = { ...capitale };
    const avec: string[] = [];
    const sans: string[] = [];
    for (let i = 0; i < 14; i++) {
      const wp = prochainWaypointPatrouille(capitale, pos, rayon, 12);
      sans.push(`${wp!.q},${wp!.r}`);
      const portee = porteeMarcheTerrestre(s, s.units['b1']!);
      const wp2 = prochainWaypointPatrouille(capitale, pos, rayon, 12, (h) => portee.has(`${h.q},${h.r}`))!;
      avec.push(`${wp2.q},${wp2.r}`);
      pos = wp!;
    }
    expect(avec).toEqual(sans);
    expect(sans.slice(0, 6)).toEqual(sans.slice(6, 12)); // cycle des 6 coins (miroir D5 bot-exploration)
    expect(sans.slice(12, 14)).toEqual(sans.slice(0, 2));
  });
});
