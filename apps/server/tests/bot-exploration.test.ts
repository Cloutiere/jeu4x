/**
 * BOT-EXPLORATION (décisions Erik 23/10) — la première unité du bot
 * PATROUILLE en boucle autour de la capitale au lieu de siéger en garnison
 * (méta 4X « scouting loop »). Quota de garnison de la capitale DYNAMIQUE
 * (D1/D2), exceptions de rappel immédiat (D3 : menace à rayonMenace ou
 * guerre), waypoints cycliques déterministes (D5/R-81).
 */
import { describe, expect, it } from 'vitest';
import { BARBARIAN_ID, BOT_SETTINGS, createRng, hexDistanceW, makeState } from "@game/rules";
import type { BotProfileData, GameState } from '@game/rules';
import { assignerObjectifs, botPolicy, prochainWaypointPatrouille, profileDuBot } from '../src/botPolicy.js';

const BOT = 'p2';
const HUMAN = 'p1';

/** État de base : prairie 8×8 (PAIX R-187 sauf mention contraire). */
function state(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number; hp?: number; fortified?: boolean }>;
  cities?: Array<{ id: string; owner: string; q: number; r: number; pop?: number; capital?: boolean }>;
  villages?: Array<{ q: number; r: number }>;
  war?: boolean;
}): GameState {
  return makeState({
    width: 8,
    height: 8,
    players: [HUMAN, BOT],
    warPairs: opts.war ? [[HUMAN, BOT]] : [],
    units: (opts.units ?? []).map((u) => ({ ...u, aboard: null, cargo: null })),
    cities: opts.cities ?? [],
    ...(opts.villages ? { villages: opts.villages } : {}),
    rngSeed: 42,
  }) as GameState;
}

function planOf(s: GameState, seed = 7) {
  return botPolicy(s, BOT, createRng(seed));
}

function orderOf(plan: ReturnType<typeof planOf>, unitId: string) {
  return plan.orders.find((o) => 'unitId' in o && o.unitId === unitId);
}

describe('BOT-EXPLORATION · D5 — données (bot.json)', () => {
  it('chaque profil porte unitesAvantRenfort, rayonPatrouille et rayonMenace', () => {
    for (const p of Object.values(BOT_SETTINGS.profiles) as BotProfileData[]) {
      expect(p.unitesAvantRenfort).toBeGreaterThanOrEqual(2);
      expect(p.rayonPatrouille).toBeGreaterThanOrEqual(2);
      expect(p.rayonMenace).toBeGreaterThanOrEqual(1);
    }
    expect(BOT_SETTINGS.profiles['normal']!.unitesAvantRenfort).toBe(3);
  });
});

describe('BOT-EXPLORATION · D1 — la première unité PATROUILLE (boucle, pas de garnison)', () => {
  it('une seule unité en paix : objectif patrouiller — un pas vers le anneau de rayon 3', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3 }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    expect(obj.get('b1')).toMatchObject({ kind: 'patrouiller' });
    const o = orderOf(planOf(s), 'b1');
    expect(o?.type).toBe('Move');
    // le pas reste dans le voisinage de la capitale (rayon de patrouille)
    const step = (o as { type: 'Move'; path: Array<{ q: number; r: number }> }).path[0]!;
    expect(hexDistanceW(step, { q: 2, r: 3 }, s.mapWidth)).toBeLessThanOrEqual(profileDuBot().rayonPatrouille);
  });

  it('jamais de Fortify en patrouille : l\'unité NE siège PAS en capitale', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3 }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    expect(orderOf(planOf(s), 'b1')?.type).not.toBe('Fortify');
    expect(orderOf(planOf(s), 'b1')?.type).not.toBe('Sleep');
  });

  it('D5 : les waypoints du scout forment une BOUCLE cyclique (répétable, jamais un aller simple)', () => {
    const capitale = { q: 2, r: 3 };
    const rayon = profileDuBot().rayonPatrouille;
    let pos = { ...capitale };
    const vus: string[] = [];
    for (let i = 0; i < 14; i++) {
      const wp = prochainWaypointPatrouille(capitale, pos, rayon, 8);
      vus.push(`${wp.q},${wp.r}`);
      pos = wp; // le scout atteint le waypoint puis vise le suivant
    }
    // cyclique : la fenêtre des 6 premiers waypoints se répète
    expect(vus.slice(0, 6)).toEqual(vus.slice(6, 12));
    expect(vus.slice(12, 14)).toEqual(vus.slice(0, 2));
    // tous à rayon du centre
    for (const v of new Set(vus)) {
      const [q, r] = v.split(',').map(Number);
      expect(hexDistanceW({ q: q!, r: r! }, capitale, 8)).toBe(rayon);
    }
  });
});

describe('BOT-EXPLORATION · D2 — montée en défense (quota dynamique de capitale)', () => {
  const base = (ids: string[]) => ({
    units: ids.map((id, i) => ({ id, type: 'guerrier', owner: BOT, q: 2 + i, r: 3 })),
    cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
  });

  it('à 2 unités : la 2e garnisonne la capitale, la première continue la boucle', () => {
    const s = state(base(['b1', 'b2']));
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    expect(obj.get('b1')).toMatchObject({ kind: 'patrouiller' });
    expect(obj.get('b2')).toMatchObject({ kind: 'garnison', cityId: 'c1' });
    expect(orderOf(planOf(s), 'b2')?.type).toBe('Move'); // b2 MARCHE vers la capitale pour la tenir
  });

  it('à ≥ unitesAvantRenfort : les quotas du profil s\'appliquent (2 en capitale pour « normal »)', () => {
    const s = state(base(['b1', 'b2', 'b3']));
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    expect(obj.get('b1')).toMatchObject({ kind: 'patrouiller' });
    expect(obj.get('b2')).toMatchObject({ kind: 'garnison', cityId: 'c1' });
    expect(obj.get('b3')).toMatchObject({ kind: 'garnison', cityId: 'c1' });
  });

  it('profils facile/difficile non régressés (quota capitale 1 / 3 au-delà du renfort)', () => {
    const f = BOT_SETTINGS.profiles['facile']!;
    const d = BOT_SETTINGS.profiles['difficile']!;
    const s = state(base(['b1', 'b2', 'b3', 'b4']));
    const of_ = assignerObjectifs(s, BOT, f);
    expect([...of_.values()].filter((o) => o.kind === 'garnison').length).toBe(f.garnisonsCapitale);
    const od = assignerObjectifs(s, BOT, d);
    expect([...od.values()].filter((o) => o.kind === 'garnison').length).toBe(d.garnisonsCapitale);
  });
});

describe('BOT-EXPLORATION · D3 — rappel immédiat (menace ou guerre)', () => {
  it('(a) unité barbare à ≤ rayonMenace de la capitale : le scout RENTRE (garnison)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3 },
        { id: 'x1', type: 'guerrier', owner: BARBARIAN_ID, q: 2, r: 5 }, // distance 2
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    expect(assignerObjectifs(s, BOT, profileDuBot()).get('b1')).toMatchObject({ kind: 'garnison', cityId: 'c1' });
    expect(orderOf(planOf(s), 'b1')).toMatchObject({ type: 'Fortify', unitId: 'b1' });
  });

  it('(a) camp barbare à ≤ rayonMenace : rappel aussi', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3 }],
      villages: [{ q: 4, r: 3 }], // distance 2
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    expect(assignerObjectifs(s, BOT, profileDuBot()).get('b1')).toMatchObject({ kind: 'garnison', cityId: 'c1' });
  });

  it('(a) barbare AU-DELÀ du rayonMenace : pas de rappel, la patrouille continue', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3 },
        { id: 'x1', type: 'guerrier', owner: BARBARIAN_ID, q: 2, r: 7 }, // distance 4
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    expect(assignerObjectifs(s, BOT, profileDuBot()).get('b1')).toMatchObject({ kind: 'patrouiller' });
  });

  it('(b) guerre déclarée : rappel immédiat (garnison du scout, jamais de patrouille)', () => {
    const s = state({
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3 }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
      war: true,
    });
    expect(assignerObjectifs(s, BOT, profileDuBot()).get('b1')).toMatchObject({ kind: 'garnison', cityId: 'c1' });
  });
});

describe('BOT-EXPLORATION · D5 — déterminisme', () => {
  it('même état ⇒ mêmes ordres de patrouille quel que soit le seed ; plan stable au même seed', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'guerrier', owner: BOT, q: 2, r: 3 },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 3, r: 3 },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2, capital: true }],
    });
    const ordres = (seed: number) => JSON.stringify(planOf(s, seed).orders.filter((o) => 'unitId' in o && o.unitId === 'b1'));
    const reference = ordres(0);
    for (let seed = 1; seed <= 10; seed++) expect(ordres(seed)).toBe(reference);
    expect(planOf(s, 99)).toEqual(planOf(s, 99));
  });
});
