/**
 * LABO-ENGAGEMENT — tests de l'extension 5 nations + barbares du laboratoire
 * (#/labo-combat, handoff HANDOFF-LABO-ENGAGEMENT M3). LABO SEULEMENT : la
 * création de parties réelles reste 1v1 (aucun diff serveur).
 *
 * Verdict d'investigation (consigné au rapport) : le moteur PUR gère N
 * propriétaires — PlayerId est un string libre, makeState accepte une liste
 * de joueurs arbitraire (guerre par paires par défaut), la mêlée pondérée
 * R-180 tire parmi TOUTES les participantes et les victoires itèrent les
 * villes/joueurs sans hypothèse binaire. Ces tests verrouillent ce verdict.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { BARBARIAN_ID, resolveTurn } from '@game/rules';
import type { GameEvent, GameState, Order } from '@game/rules';
import { creerEtatLabo, nomCamp, ordreDe } from '../src/lib/laboCombat.js';

const fetchEspion = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
  throw new Error('LABO-ENGAGEMENT : appel réseau interdit (outil client pur)');
});
afterAll(() => fetchEspion.mockRestore());

describe('labo-engagement — M3 : cinq nations au labo', () => {
  it('pose des unités des 5 nations : 5 joueurs dans l’état, propriétaires corrects', () => {
    const state = creerEtatLabo({
      width: 8,
      height: 8,
      fill: 'prairie',
      units: (['p1', 'p2', 'p3', 'p4', 'p5'] as const).map((camp, i) => ({
        type: 'guerrier',
        camp,
        q: i + 1,
        r: 1,
      })),
      seed: 11,
    });
    expect(Object.keys(state.players).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    for (const u of Object.values(state.units)) {
      expect(u.owner).not.toBe(BARBARIAN_ID);
    }
    expect(nomCamp('p3')).toBe('J3');
    expect(nomCamp('p5')).toBe('J5');
  });

  it('J1/J2 par défaut si seules des nations classiques sont posées (aucun joueur fantôme)', () => {
    const state = creerEtatLabo({
      width: 6,
      height: 5,
      fill: 'prairie',
      units: [{ type: 'guerrier', camp: 'p2', q: 0, r: 0 }],
      seed: 3,
    });
    expect(Object.keys(state.players).sort()).toEqual(['p1', 'p2']);
  });

  it('résolution seedée à 5 nations : mêlée à 3 propriétaires (tirage pondéré R-180 multi-camps)', () => {
    const state = creerEtatLabo({
      width: 8,
      height: 8,
      fill: 'prairie',
      units: [
        { type: 'guerrier', camp: 'p1', q: 3, r: 3 },
        { type: 'guerrier', camp: 'p2', q: 3, r: 3 },
        { type: 'guerrier', camp: 'p3', q: 3, r: 3 },
        { type: 'piquier', camp: 'p4', q: 6, r: 6 },
        { type: 'archer', camp: 'p5', q: 7, r: 7 },
      ],
      seed: 20260917,
    });
    const ordres: Record<string, Order[]> = {}; // personne ne bouge : mêlée immédiate (R-178 #2)
    const r1 = resolveTurn(state, ordres, state.rngSeed);
    const melee = r1.events.find((e) => e.type === 'MeleeResolved') as Extract<GameEvent, { type: 'MeleeResolved' }> | undefined;
    expect(melee).toBeTruthy();
    expect(melee!.at).toEqual({ q: 3, r: 3 });
    expect(melee!.results).toHaveLength(3);
    const roles = melee!.results.map((x) => x.role).sort();
    expect(roles).toEqual(['loser', 'middle', 'winner']);
    // Les nations hors mêlée survivent, aucune victoire parasite à 5 joueurs.
    expect(r1.events.some((e) => e.type === 'Victory')).toBe(false);
    expect(r1.newState.units['u4']).toBeTruthy();
    expect(r1.newState.units['u5']).toBeTruthy();
    // Reproductibilité (R-80).
    const r2 = resolveTurn(state, ordres, state.rngSeed);
    expect(r2.events).toEqual(r1.events);
  });

  it('dispersion de pile amie (R-159 rév. B) pour une nation extension (J4)', () => {
    const state = creerEtatLabo({
      width: 8,
      height: 8,
      fill: 'prairie',
      units: [
        { type: 'guerrier', camp: 'p4', q: 4, r: 4 },
        { type: 'guerrier', camp: 'p4', q: 4, r: 4 },
      ],
      seed: 5,
    });
    const { events, newState } = resolveTurn(state, {}, state.rngSeed);
    // R-159 rév. B (17/09) : l'événement est UnitDispersed (UnitExpelled abrogé).
    const dispersion = events.find((e) => e.type === 'UnitDispersed');
    expect(dispersion).toBeTruthy();
    // Une des deux demeure stabilisée sur la case (R-173).
    const surPlace = Object.values(newState.units).filter((u) => u.owner === 'p4' && u.q === 4 && u.r === 4);
    expect(surPlace).toHaveLength(1);
    expect(surPlace[0]!.stabilized).toBe(true);
  });

  it('programmation d’une nation extension : ordre moteur et attaque menée par J5', () => {
    const state = creerEtatLabo({
      width: 8,
      height: 8,
      fill: 'prairie',
      units: [
        { type: 'guerrier', camp: 'p5', q: 5, r: 5 },
        { type: 'guerrier', camp: 'p2', q: 5, r: 6 },
      ],
      seed: 9,
    });
    const u5 = Object.values(state.units).find((u) => u.owner === 'p5')!;
    const ordre = ordreDe(u5, [], false, { q: 5, r: 6 });
    expect(ordre).toEqual({ type: 'Attack', unitId: u5.id, target: { q: 5, r: 6 } });
    // J2 fortifiée-stabilisée attend : l'attaque de J5 se résout (R-176/R-177).
    const ordresAll: Record<string, Order[]> = {
      p1: [], p2: [], p3: [], p4: [],
      p5: [ordre!],
    };
    const { events } = resolveTurn(state, ordresAll, state.rngSeed);
    expect(events.some((e) => e.type === 'Attack' && e.attackerId === u5.id)).toBe(true);
  });
});
