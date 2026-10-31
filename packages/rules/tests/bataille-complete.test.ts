import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import type { GameEvent } from '../src/events.js';
import type { CombatDetail } from '../src/events.js';

/**
 * HANDOFF-BATAILLE-COMPLETE (canon Erik 31/10) — « Dans CivRev, une attaque
 * égale la mort de l'une ou l'autre des unités. »
 *
 * B1 : une attaque MÊLÉE enchaîne des échanges (même formule R-51, un jet
 * seedé chacun) jusqu'à la mort d'une des deux unités — plus de plafond
 * (T-03/EXCHANGES_PER_ATTACK abandonné).
 * B2 : pas de retraite — le perdant meurt sur place.
 * B3 : plus de survivance mutuelle post-attaque (R-178 rév. A abrogée).
 * B4 : blessures PERSISTENT entre attaques ; les assiégeants suivants
 * n'attaquent plus une ville dont le défenseur est mort.
 * B5 : DISTANCE INTACTE (R-59) — un tir reste 1 PV garanti, sans riposte,
 * jamais d'avancée.
 */

function echangeDe(events: GameEvent[]): GameEvent & { type: 'CombatExchange'; detail: CombatDetail } {
  const e = events.find((ev) => ev.type === 'CombatExchange') as
    | (GameEvent & { type: 'CombatExchange'; detail?: CombatDetail })
    | undefined;
  if (!e) throw new Error('aucun CombatExchange émis');
  if (!e.detail) throw new Error('CombatExchange sans détail');
  return e as GameEvent & { type: 'CombatExchange'; detail: CombatDetail };
}

/** Attaque mêlée guerrier vs piquier en ville (défenseur plus fort). */
function assautPiquierVille(seed: number) {
  const state = makeState({
    units: [
      { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'd1', type: 'piquier', owner: 'p2', q: 1, r: 0, fortified: true },
    ],
    terrainOverrides: { '1,0': 'ville' },
    cities: [{ id: 'cv', q: 1, r: 0, owner: 'p2', capital: true }],
  });
  state.units.d1!.stabilized = true;
  return resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }], p2: [] }, seed);
}

describe('BATAILLE-COMPLETE · B1 — la bataille va à la mort', () => {
  it('une attaque mêlée se termine TOUJOURS par la mort d\'un des deux camps (aucun survivant intermédiaire)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = assautPiquierVille(seed);
      const a1 = r.newState.units.a1;
      const d1 = r.newState.units.d1;
      const morts = (a1 ? 0 : 1) + (d1 ? 0 : 1);
      expect(morts, `seed ${seed} : la bataille doit tuer exactement un camp`).toBe(1);
      const ex = echangeDe(r.events);
      expect(['victoire-attaquant', 'victoire-defenseur']).toContain(ex.detail.issue);
      expect(ex.detail.issue).not.toBe('survie-mutuelle');
    }
  });

  it('la bataille enchaîne PLUSIEURS assauts (le détail porte tous les jets de la bataille)', () => {
    // Un guerrier (3 PV) contre un piquier fortifié en ville : quelle que soit
    // l'issue, la bataille ne peut pas se jouer en un seul assaut — au moins
    // l'un des camps descend sous 2 PV avant de mourir.
    let maxRounds = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const ex = echangeDe(assautPiquierVille(seed).events);
      maxRounds = Math.max(maxRounds, ex.detail.rounds.length);
      // Chaque assaut retire exactement 1 PV à UN camp (plus jamais 0).
      for (const round of ex.detail.rounds) {
        expect(round.pvPerdus).toBe(1);
      }
    }
    expect(maxRounds).toBeGreaterThan(1);
  });

  it('déterminisme : même seed → même issue', () => {
    for (const seed of [3, 17, 42]) {
      const a = assautPiquierVille(seed);
      const b = assautPiquierVille(seed);
      expect(!!a.newState.units.a1).toBe(!!b.newState.units.a1);
      expect(!!a.newState.units.d1).toBe(!!b.newState.units.d1);
      const ea = echangeDe(a.events).detail.rounds;
      const eb = echangeDe(b.events).detail.rounds;
      expect(ea).toEqual(eb);
    }
  });
});

describe('BATAILLE-COMPLETE · B2 — pas de retraite', () => {
  it('l\'attaquant perdant meurt, la ville n\'est PAS capturée, le défenseur garde sa case', () => {
    // Le piquier fortifié en ville écrase le guerrier pour une grande majorité
    // des seeds — on balaye jusqu'à trouver une victoire défensive.
    for (let seed = 1; seed <= 60; seed++) {
      const r = assautPiquierVille(seed);
      if (r.newState.units.d1 && !r.newState.units.a1) {
        expect(r.newState.units.d1!.q).toBe(1);
        expect(r.newState.units.d1!.r).toBe(0);
        const razed = r.events.some((e) => e.type === 'CityRazed');
        const captured = r.events.some((e) => e.type === 'CityCaptured');
        expect(captured).toBe(false);
        expect(razed).toBe(false);
        return;
      }
    }
    throw new Error('aucun seed à issue défensive trouvé — calibrage fixture à revoir');
  });

  it('l\'attaquant vainqueur avance et entre (la mort du défenseur ouvre la case)', () => {
    // Guerrier vs guerrier à égalité : on balaye jusqu'à une victoire
    // offensive, l'attaquant doit OCCUPER la case cible.
    for (let seed = 1; seed <= 60; seed++) {
      const state = makeState({
        units: [
          { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
          { id: 'd1', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
        ],
      });
      state.units.d1!.stabilized = true;
      const r = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }], p2: [] }, seed);
      if (r.newState.units.a1 && !r.newState.units.d1) {
        expect(r.newState.units.a1!.q).toBe(1);
        expect(r.newState.units.a1!.r).toBe(0);
        return;
      }
    }
    throw new Error('aucun seed à issue offensive trouvé');
  });

  it('ville avec un défenseur restant : l\'attaquant vainqueur n\'entre pas (R-159-b)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = makeState({
        units: [
          { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
          { id: 'd1', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
          { id: 'd2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
        ],
        terrainOverrides: { '1,0': 'ville' },
      });
      state.units.d1!.stabilized = true;
      const r = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }], p2: [] }, seed);
      if (!r.newState.units.d1 && r.newState.units.a1 && r.newState.units.d2) {
        // d1 mort, d2 vivant : l'attaquant ne peut pas cohabiter en ville.
        expect(r.newState.units.a1!.q).toBe(0);
        expect(r.newState.units.a1!.r).toBe(0);
        return;
      }
    }
    throw new Error('aucun seed où d1 meurt et d2 survit');
  });
});

describe('BATAILLE-COMPLETE · B4 — blessures persistantes et séquence d\'assiègeants', () => {
  it('les blessures PERSISTENT d\'une bataille à l\'autre (vainqueur blessé garde ses PV)', () => {
    // Un assaut gagné avec PV < max, puis une seconde attaque au tour suivant :
    // les blessures du vainqueur ne sont pas réinitialisées.
    for (let seed = 1; seed <= 60; seed++) {
      const state = makeState({
        units: [
          { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
          { id: 'd1', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
        ],
      });
      state.units.d1!.stabilized = true;
      const r1 = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }], p2: [] }, seed);
      if (r1.newState.units.a1 && !r1.newState.units.d1 && r1.newState.units.a1!.hp < 3) {
        const pvApresBataille = r1.newState.units.a1!.hp;
        // Tour 2 : Hold simple, la blessure doit persister (hors soin —
        // l'unité n'est PAS fortifiée et ne soigne qu'à 1 PV/tour selon
        // CANON-SIEGE ; ici on re-résout immédiatement sans soin).
        const r2 = resolveTurn(r1.newState, { p1: [{ type: 'Hold', unitId: 'a1' }], p2: [] }, seed + 1000);
        expect(r2.newState.units.a1!.hp).toBeLessThanOrEqual(pvApresBataille + 1); // soin 1 PV/tour CANON-SIEGE au plus
        expect(r2.newState.units.a1!.hp).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error('aucune victoire blessée trouvée');
  });

  it('dès que le défenseur meurt, les assiégeants suivants n\'attaquent plus (B4)', () => {
    // d1 (guerrier) en ville, affaibli à 1 PV : le premier attaquant le tue ;
    // le second attaquant du même camp NE combat PAS (ville déjà prise).
    let trouve = false;
    for (let seed = 1; seed <= 60 && !trouve; seed++) {
    const state = makeState({
      units: [
        { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'a2', type: 'guerrier', owner: 'p1', q: 0, r: 1 },
        { id: 'd1', type: 'guerrier', owner: 'p2', q: 1, r: 0, hp: 1 },
      ],
      terrainOverrides: { '1,0': 'ville' },
      cities: [{ id: 'cv', q: 1, r: 0, owner: 'p2', capital: true }],
    });
    state.units.d1!.stabilized = true;
    const r = resolveTurn(state, {
      p1: [
        { type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } },
        { type: 'Attack', unitId: 'a2', target: { q: 1, r: 0 } },
      ],
      p2: [],
    }, seed);
    if (r.newState.units.d1 || !r.newState.units.a1) continue; // il faut a1 vainqueur
    trouve = true;
    expect(r.newState.units.d1).toBeUndefined();
    const echanges = r.events.filter((e) => e.type === 'CombatExchange');
    expect(echanges.length, `seed ${seed}`).toBe(1); // un seul combat : le second n'attaque plus
    }
    expect(trouve).toBe(true);
  });

  it('ville sans AUTRE défenseur : le vainqueur entre et CAPTURE la ville (canon : la ville est prise)', () => {
    let trouve = false;
    for (let seed = 1; seed <= 60 && !trouve; seed++) {
      const state = makeState({
        units: [
          { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
          { id: 'd1', type: 'guerrier', owner: 'p2', q: 1, r: 0, hp: 1 },
        ],
        terrainOverrides: { '1,0': 'ville' },
        cities: [{ id: 'cv', q: 1, r: 0, owner: 'p2', capital: true }],
      });
      state.units.d1!.stabilized = true;
      const r = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }], p2: [] }, seed);
      if (r.newState.units.d1 || !r.newState.units.a1) continue;
      trouve = true;
      expect(r.newState.units.a1!.q).toBe(1); // entré dans la ville
      expect(r.events.some((e) => e.type === 'CityCaptured')).toBe(true);
    }
    expect(trouve).toBe(true);
  });
});

describe('BATAILLE-COMPLETE · B5 — distance INTACTE (R-59)', () => {
  it('un tir reste 1 PV garanti : le défenseur plein-vie SURVIT, l\'archer n\'entre jamais', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = makeState({
        units: [
          { id: 'a1', type: 'catapulte', owner: 'p1', q: 0, r: 0 },
          { id: 'd1', type: 'piquier', owner: 'p2', q: 1, r: 0, fortified: true },
        ],
        terrainOverrides: { '1,0': 'ville' },
      });
      state.units.d1!.stabilized = true;
      const r = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }], p2: [] }, seed);
      expect(r.newState.units.d1, `seed ${seed} : un tir seul ne tue pas un défenseur plein-vie`).toBeDefined();
      expect(r.newState.units.d1!.hp).toBe(2); // 3 − 1 PV garanti
      expect(r.newState.units.a1).toBeDefined(); // jamais de riposte sur le tireur
      expect(r.newState.units.a1!.q).toBe(0); // jamais d'entrée
      expect(r.newState.units.a1!.r).toBe(0);
      const ex = echangeDe(r.events);
      expect(ex.detail.rounds.length).toBe(1); // UN assaut, pas une bataille
    }
  });
});
