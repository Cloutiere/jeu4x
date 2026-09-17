/**
 * LABO-COMBAT — tests du module pur du laboratoire (#/labo-combat, handoff
 * HANDOFF-LABO-COMBAT). Le labo est un OUTIL CLIENT PUR : ces tests couvrent
 *  - M1 : construction d'état à poses libres (unités des deux joueurs +
 *    barbares, villes, camps en pile BARBARES-PILES, fog désactivé) ;
 *  - M2 : reproductibilité seed (même config + même seed = mêmes événements),
 *    ordres des deux côtés, journal lisible événement par événement ;
 *  - M3 : scénarios d'ajustement — assaut de pile (2 gardes + 1 explorateur
 *    vs 2 guerriers J1) et dispute de destination (R-159) ;
 *  - isolation : le labo ne dépend d'aucun serveur (aucun fetch, état construit
 *    et résolu intégralement dans le process de test).
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  BARBARIAN_ID,
  hexDistance,
  resolveTurn,
  tileKey,
  unitAt,
} from '@game/rules';
import type { GameEvent, GameState, Order } from '@game/rules';
import {
  campVersJoueur,
  construireJournal,
  creerEtatLabo,
  formatEvent,
  nomCamp,
  ordreDe,
} from '../src/lib/laboCombat.js';

/** Garde-fou d'isolation : le labo n'appelle JAMAIS le réseau. */
const fetchEspion = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
  throw new Error('LABO-COMBAT : appel réseau interdit (outil client pur)');
});

afterAll(() => {
  fetchEspion.mockRestore();
});

function evenements(state: GameState, ordres: Record<string, Order[]>, seed: number): GameEvent[] {
  return resolveTurn(state, ordres, seed).events;
}

describe('labo-combat — M1 construction d état (poses libres)', () => {
  it('pose des unités des deux joueurs ET des barbares, PV ajustables, fog désactivé', () => {
    const state = creerEtatLabo({
      width: 6,
      height: 5,
      fill: 'prairie',
      units: [
        { type: 'guerrier', camp: 'p1', q: 0, r: 0 },
        { type: 'archer', camp: 'p2', q: 5, r: 4, hp: 2 },
        { type: 'guerrier', camp: 'barbare', q: 3, r: 2 },
      ],
      cities: [{ camp: 'p1', q: 1, r: 0 }],
      camps: [{ q: 3, r: 3, gardes: 2, explorateur: true }],
    });
    // 1 guerrier barbare posé + camp (1 gardien + 2 satellites + 1 explorateur)
    const proprietaires = Object.values(state.units).map((u) => u.owner).sort();
    expect(proprietaires).toEqual(['barbarien', 'barbarien', 'barbarien', 'barbarien', 'barbarien', 'p1', 'p2']);
    const archer = Object.values(state.units).find((u) => u.type === 'archer')!;
    expect(archer.hp).toBe(2);
    // Fog désactivé : les deux joueurs voient toute la carte (M2.1).
    for (const player of Object.values(state.players)) {
      expect(player.vision.visible.length).toBe(Object.keys(state.map).length);
    }
    // La ville posée transforme sa case en terrain « ville » (R-64, miroir).
    expect(state.map[tileKey(1, 0)]!.terrain).toBe('ville');
    expect(state.villages).toHaveLength(1);
  });

  it('ENGAGEMENT R-183 : un camp posé = gardien SUR la case + satellites/explorateur ADJACENTS, aucune dotation automatique', () => {
    const state = creerEtatLabo({
      width: 6,
      height: 6,
      fill: 'prairie',
      camps: [{ q: 2, r: 2, gardes: 2, explorateur: true }],
    });
    const village = state.villages[0]!;
    expect(village.q).toBe(2);
    expect(village.r).toBe(2);
    // 4 barbares posés (1 gardien au camp + 2 satellites + 1 explorateur),
    // pas un de plus — la dotation automatique T-50 de makeState est retirée.
    const barbares = Object.values(state.units).filter((u) => u.owner === BARBARIAN_ID);
    expect(barbares).toHaveLength(4);
    for (const b of barbares) {
      if (b.id === village.spawnedUnits[0]) {
        expect(b.q).toBe(2); // le gardien est SUR la case du camp
        expect(b.r).toBe(2);
      } else {
        expect(Math.max(Math.abs(b.q - 2), Math.abs(b.r - 2))).toBe(1); // rayon d'une case
      }
    }
    expect([...village.spawnedUnits].sort()).toEqual(barbares.map((b) => b.id).sort());
  });

  it('le pinceau de terrain s applique (montagne posée, fond prairie)', () => {
    const state = creerEtatLabo({
      width: 4,
      height: 4,
      fill: 'prairie',
      terrainOverrides: { [tileKey(1, 1)]: 'montagne' },
    });
    expect(state.map[tileKey(1, 1)]!.terrain).toBe('montagne');
    expect(state.map[tileKey(0, 0)]!.terrain).toBe('prairie');
  });

  it('est déterministe : mêmes poses = état identique', () => {
    const opts = {
      width: 5,
      height: 5,
      fill: 'prairie' as const,
      units: [{ type: 'guerrier', camp: 'p1' as const, q: 1, r: 1 }],
      camps: [{ q: 3, r: 3, gardes: 2, explorateur: false }],
    };
    expect(JSON.stringify(creerEtatLabo(opts))).toBe(JSON.stringify(creerEtatLabo(opts)));
  });
});

describe('labo-combat — M2 programmation et résolution seedée', () => {
  /**
   * Scénario d'Erik : assaut de pile — 2 guerriers J1 attaquent le camp
   * (2 gardes + 1 explorateur). Unités : u1/u2 = J1, u3/u4 = gardes,
   * u5 = explorateur (ordre d'engendrement du camp).
   */
  function assautDePile(): GameState {
    return creerEtatLabo({
      width: 9,
      height: 6,
      fill: 'prairie',
      units: [
        { type: 'guerrier', camp: 'p1', q: 4, r: 3 },
        { type: 'guerrier', camp: 'p1', q: 6, r: 3 },
      ],
      camps: [{ q: 5, r: 3, gardes: 2, explorateur: true }],
    });
  }

  function ordresAssaut(state: GameState): Record<string, Order[]> {
    return {
      p1: [
        ordreDe(state.units['u1']!, [], false, { q: 5, r: 3 })!,
        ordreDe(state.units['u2']!, [], false, { q: 5, r: 3 })!,
      ],
      p2: [],
    };
  }

  it('reproductibilité : même config + mêmes ordres + même seed = mêmes événements ET même état', () => {
    const stateA = assautDePile();
    const stateB = assautDePile();
    expect(JSON.stringify(evenements(stateA, ordresAssaut(stateA), 42))).toBe(
      JSON.stringify(evenements(stateB, ordresAssaut(stateB), 42)),
    );
    expect(JSON.stringify(resolveTurn(stateA, ordresAssaut(stateA), 42).newState)).toBe(
      JSON.stringify(resolveTurn(stateB, ordresAssaut(stateB), 42).newState),
    );
  });

  it('le journal se lit combat par combat (attaques, échanges, gardes immobiles T-49)', () => {
    const state = assautDePile();
    const { events, newState } = resolveTurn(state, ordresAssaut(state), 42);
    const lignes = events.map((ev) => formatEvent(state, ev as unknown as { type: string } & Record<string, unknown>));
    for (const l of lignes) expect(l.length).toBeGreaterThan(0);
    expect(lignes.some((l) => l.startsWith('ATTAQUE'))).toBe(true);
    expect(lignes.some((l) => l.startsWith('échange'))).toBe(true);
    // Les gardes/satellites ne sortent pas D'EUX-MÊMES (T-49/R-183) : tout
    // Move barbare est une entrée AGRESSIVE — R-159 rév. B (17/09) : les deux
    // attaquants J1 sont retenus devant le camp (co-attaque, P1) et les
    // satellites voisin les aggro'd sur leur case d'attente ; chaque Move
    // barbare est donc immédiatement suivi d'une Attack du même unitId.
    const movesBarbares = events.filter((e) => e.type === 'Move' && (e as { owner: string }).owner === BARBARIAN_ID);
    for (const m of movesBarbares) {
      const unitId = (m as { unitId: string }).unitId;
      expect(events.some((e) => e.type === 'Attack' && (e as { attackerId: string }).attackerId === unitId)).toBe(true);
    }
    // Les attaques J1 ont bien visé la pile du camp.
    expect(events.some((e) => e.type === 'Attack' && (e as { at: { q: number; r: number } }).at.q === 5 && (e as { at: { q: number; r: number } }).at.r === 3)).toBe(true);
  });

  it("programmer les DEUX côtés indépendamment : les ordres p1 ET p2 s'exécutent dans la même résolution", () => {
    const state = creerEtatLabo({
      width: 8,
      height: 6,
      fill: 'prairie',
      units: [
        { type: 'guerrier', camp: 'p1', q: 1, r: 1 },
        { type: 'guerrier', camp: 'p2', q: 6, r: 4 },
      ],
    });
    const { events } = resolveTurn(
      state,
      {
        p1: [ordreDe(state.units['u1']!, [{ q: 2, r: 1 }, { q: 3, r: 1 }], false, null)!],
        p2: [ordreDe(state.units['u2']!, [{ q: 5, r: 4 }], false, null)!],
      },
      7,
    );
    const moves = events.filter((e) => e.type === 'Move');
    const owners = new Set(moves.map((m) => (m as { owner: string }).owner));
    expect(owners.has('p1')).toBe(true);
    expect(owners.has('p2')).toBe(true);
  });

  it('dispute de destination (R-159) : deux unités programmées vers la même case — la résolution tranche, une seule arrive', () => {
    const state = creerEtatLabo({
      width: 9,
      height: 7,
      fill: 'prairie',
      units: [
        { type: 'guerrier', camp: 'p1', q: 3, r: 3 },
        { type: 'guerrier', camp: 'p1', q: 5, r: 3 },
      ],
    });
    const destination = { q: 4, r: 3 };
    const { events, newState } = resolveTurn(
      state,
      {
        p1: [
          ordreDe(state.units['u1']!, [destination], false, null)!,
          ordreDe(state.units['u2']!, [destination], false, null)!,
        ],
        p2: [],
      },
      11,
    );
    // Exactement une unité occupe la destination disputée ; les deux survivent
    // (l'ordre du perdant est tronqué, pas l'unité).
    const surDestination = Object.values(newState.units).filter((u) => u.q === destination.q && u.r === destination.r);
    expect(surDestination).toHaveLength(1);
    expect(newState.units['u1']).toBeDefined();
    expect(newState.units['u2']).toBeDefined();
    const arrives = events.filter(
      (e) => e.type === 'Move' && (e as { to: { q: number; r: number } }).to.q === destination.q && (e as { to: { q: number; r: number } }).to.r === destination.r,
    );
    expect(arrives).toHaveLength(1);
  });

  it('MultiStep + action finale fondation (R-158) : le colon fonde au terme de son chemin', () => {
    const state = creerEtatLabo({
      width: 8,
      height: 6,
      fill: 'prairie',
      units: [{ type: 'colon', camp: 'p1', q: 1, r: 1 }],
    });
    // Un seul pas (coût 1) : il reste les PM requis par l'action finale
    // (R-158 — sinon la fondation est annulée, le mouvement conservé).
    const { events, newState } = resolveTurn(
      state,
      { p1: [ordreDe(state.units['u1']!, [{ q: 2, r: 1 }], true, null)!], p2: [] },
      3,
    );
    expect(events.some((e) => e.type === 'CityFounded')).toBe(true);
    expect(Object.values(newState.cities)).toHaveLength(1);
    expect(newState.cities['c1']!.q).toBe(2);
  });

  it("barbares : l'aggro automatique se déclenche à la résolution (l'explorateur avance vers l'ennemi, T-19)", () => {
    // Pile complète (2 gardes + 1 explorateur — une pile de ≤2 est toute
    // garde, T-49) : l'explorateur est dans le rayon d'aggro (2) du guerrier
    // J1 et SORT du camp vers lui.
    const state = creerEtatLabo({
      width: 10,
      height: 6,
      fill: 'prairie',
      units: [{ type: 'guerrier', camp: 'p1', q: 3, r: 3 }],
      camps: [{ q: 5, r: 3, gardes: 2, explorateur: true }],
    });
    const { events, newState } = resolveTurn(state, { p1: [], p2: [] }, 5);
    // ENGAGEMENT R-183 : l'explorateur est posé ADJACENT au camp (rayon d'une
    // case) — il s'approche de l'ennemi (aggro T-19) jusqu'au contact.
    const explorateur = Object.values(newState.units).find((u) => u.type === 'explorateur')!;
    expect(explorateur.type).toBe('explorateur');
    expect(hexDistance({ q: explorateur.q, r: explorateur.r }, { q: 3, r: 3 })).toBeLessThanOrEqual(1);
    expect(events.some((e) => e.type === 'Move' && (e as { owner: string }).owner === BARBARIAN_ID)).toBe(true);
  });
});

describe('labo-combat — helpers de journal et de camp', () => {
  it('nomCamp et campVersJoueur : les trois camps du labo', () => {
    expect(nomCamp('p1')).toBe('J1');
    expect(nomCamp('p2')).toBe('J2');
    expect(nomCamp(BARBARIAN_ID)).toBe('Barbare');
    expect(campVersJoueur('barbare')).toBe(BARBARIAN_ID);
    expect(campVersJoueur('p2')).toBe('p2');
  });

  it('formatEvent : ligne MORT, ligne REPLI, fallback lisible pour les types rares', () => {
    const state = creerEtatLabo({
      width: 4,
      height: 4,
      fill: 'prairie',
      units: [{ type: 'guerrier', camp: 'p1', q: 0, r: 0 }],
    });
    expect(
      formatEvent(state, { type: 'UnitDestroyed', unitId: 'u1', owner: 'p1', at: { q: 0, r: 0 }, byUnitId: 'u9', cause: 'combat' }),
    ).toContain('MORT');
    expect(formatEvent(state, { type: 'Retreat', unitId: 'u1', owner: 'p1', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } })).toContain('REPLI');
    expect(formatEvent(state, { type: 'InconnuAuBataillon', x: 1 })).toContain('InconnuAuBataillon');
    expect(unitAt(state, 0, 0)!.type).toBe('guerrier');
  });

  it("construireJournal : PV avant→après par échange, terrain du défenseur, repli qualifié (origine vs adjacente)", () => {
    const state = creerEtatLabo({
      width: 9,
      height: 6,
      fill: 'prairie',
      terrainOverrides: { [tileKey(5, 3)]: 'foret' },
      units: [{ type: 'guerrier', camp: 'p1', q: 4, r: 3 }],
      camps: [{ q: 5, r: 3, gardes: 1, explorateur: false }],
    });
    const u1 = state.units['u1']!;
    const { events } = resolveTurn(state, { p1: [ordreDe(u1, [], false, { q: 5, r: 3 })!], p2: [] }, 42);
    const lignes = construireJournal(state, events as unknown as Array<{ type: string } & Record<string, unknown>>);
    const echange = lignes.find((l) => l.startsWith('échange'));
    expect(echange).toBeDefined();
    expect(echange).toMatch(/PV \d+→\d+ \/ .+ PV \d+→\d+/);
    // L'échange portant sur la case de forêt (le garde en pile) est annoté du
    // bonus défensif du terrain — le garde contre-attaque d'abord (R-97 :
    // attaque d'un ennemi adjacent), ce premier échange est sur prairie.
    expect(lignes.filter((l) => l.startsWith('échange')).some((l) => l.includes('foret (+50 %)'))).toBe(true);
    const replis = lignes.filter((l) => l.startsWith('REPLI'));
    for (const r of replis) {
      // Chaque repli est qualifié : case d'origine (R-54-1) ou adjacente (R-54-2).
      expect(r.includes('case d’origine') || r.includes('case adjacente')).toBe(true);
    }
  });

  it('ordreDe : attaque prioritaire, fondation en finale de chemin, Hold par défaut', () => {    const colon = { id: 'u1', q: 0, r: 0, type: 'colon' };
    expect(ordreDe(colon, [], false, { q: 1, r: 0 })).toEqual({ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } });
    expect(ordreDe(colon, [{ q: 1, r: 0 }], true, null)).toEqual({ type: 'MultiStep', unitId: 'u1', path: [{ q: 1, r: 0 }], final: 'foundCity' });
    expect(ordreDe(colon, [], true, null)).toEqual({ type: 'FoundCity', unitId: 'u1' });
    expect(ordreDe(colon, [{ q: 1, r: 0 }], false, null)).toEqual({ type: 'MultiStep', unitId: 'u1', path: [{ q: 1, r: 0 }] });
    expect(ordreDe(colon, [], false, null)).toEqual({ type: 'Hold', unitId: 'u1' });
    // Un non-fondeur n'obtient jamais d'action finale fondation.
    const guerrier = { id: 'u2', q: 0, r: 0, type: 'guerrier' };
    expect(ordreDe(guerrier, [], true, null)).toEqual({ type: 'Hold', unitId: 'u2' });
  });
});
