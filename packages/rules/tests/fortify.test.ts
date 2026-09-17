import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { createRng } from '../src/rng.js';
import { makeState } from '../src/fixtures.js';
import { FORTIFY_DEFENSE_BONUS } from '../src/constants.js';
import type { GameState, Order } from '../src/state.js';
import type { GameEvent } from '../src/events.js';

/**
 * R-33 · Fortification (ajout 30/08) + T-17 `fortifyDefenseBonus` = 0.25.
 * L'ordre Fortify place l'unité en position fortifiée permanente :
 *  - bonus défensif T-17 sur S_def (RULES.md §7.4) ;
 *  - l'état persiste d'un tour à l'autre (ordre non consommé) ;
 *  - tout autre ordre annule la fortification ;
 *  - une unité fortifiée ne bouge pas ; soins R-71 normaux.
 */

/** Graine dont le premier tir tombe dans [p_fort, 0.5) : le défenseur ÉGAL est
 *  touché (roll < 0.5) mais le défenseur FORTIFIÉ (p = 1/(1+1.25²) ≈ 0.390)
 *  ne l'est pas. */
function seedDiscriminatingFortify(): number {
  const pFort = 1 / (1 + Math.pow(1 + FORTIFY_DEFENSE_BONUS, 2));
  for (let s = 0; s < 10000; s++) {
    const roll = createRng(s).next();
    if (roll >= pFort && roll < 0.5) return s;
  }
  throw new Error('pas de graine trouvée');
}

function guerriersAffrontes(): GameState {
  // p1 (attaquant) et p2 (défenseur) adjacents, mêmes caractéristiques 1/1/1.
  return makeState({
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
    ],
  });
}

function exchangeOf(events: GameEvent[]): GameEvent & { type: 'CombatExchange' } {
  const e = events.find((e) => e.type === 'CombatExchange');
  if (!e) throw new Error('aucun CombatExchange émis');
  return e as GameEvent & { type: 'CombatExchange' };
}

describe('R-33 · Fortification', () => {
  it('T-17 : un défenseur fortifié encaisse moins (même graine, issue divergente)', () => {
    const seed = seedDiscriminatingFortify();
    const plain = guerriersAffrontes();
    const fortified = guerriersAffrontes();
    fortified.units.u2!.fortified = true;

    const rPlain = resolveTurn(plain, { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }], p2: [] }, seed);
    const rFort = resolveTurn(fortified, { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }], p2: [] }, seed);

    const exPlain = exchangeOf(rPlain.events);
    const exFort = exchangeOf(rFort.events);
    expect(exPlain.defenderHpAfter).toBe(2); // touché : roll < 0.5
    expect(exPlain.attackerHpAfter).toBe(3);
    expect(exFort.defenderHpAfter).toBe(3); // T-17 : p passe sous le tir → intact
    expect(exFort.attackerHpAfter).toBe(2);
  });

  it('R-33 : l’état fortifié persiste d’un tour à l’autre (ordre non consommé)', () => {
    const state = guerriersAffrontes();
    state.units.u2!.q = 5;
    state.units.u2!.r = 5;
    const orders: Order[] = [{ type: 'Fortify', unitId: 'u2' }];
    const r1 = resolveTurn(state, { p1: [], p2: orders }, 42);
    expect(r1.newState.units.u2!.fortified).toBe(true);
    // Tour suivant, aucun ordre : toujours fortifiée.
    const r2 = resolveTurn(r1.newState, { p1: [], p2: [] }, 42);
    expect(r2.newState.units.u2!.fortified).toBe(true);
  });

  it('ENGAGEMENT R-175 (rév. R-33) : la fortification est conservée sans déplacement (Hold), perdue au déplacement (Move)', () => {
    // Ancien contrat (annulation par tout autre ordre, y compris Hold) abrogé
    // par ENGAGEMENT — la perte suit le DÉPLACEMENT, plus le type d'ordre.
    const state = guerriersAffrontes();
    state.units.u1!.fortified = true;
    const r = resolveTurn(state, { p1: [{ type: 'Hold', unitId: 'u1' }], p2: [] }, 42);
    expect(r.newState.units.u1!.fortified).toBe(true); // demeure sur sa case : conservée

    const state2 = guerriersAffrontes();
    state2.units.u2!.fortified = true;
    const r2 = resolveTurn(
      state2,
      { p1: [], p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 2, r: 0 }] }] },
      42,
    );
    expect(r2.newState.units.u2!.fortified).toBe(false); // déplacement : perdue
    expect(r2.newState.units.u2!.q).toBe(2); // et l'ordre s'exécute normalement
  });

  it('R-33 : une unité fortifiée ne bouge pas — Fortify efface tout chemin gelé', () => {
    const state = guerriersAffrontes();
    // Chemin gelé (ordre Move restant sur l'unité) + Fortify soumis ce tour.
    state.units.u2!.order = { type: 'Move', unitId: 'u2', path: [{ q: 2, r: 0 }] };
    const r = resolveTurn(state, { p1: [], p2: [{ type: 'Fortify', unitId: 'u2' }] }, 42);
    expect(r.newState.units.u2!.q).toBe(1); // n'a pas bougé
    expect(r.newState.units.u2!.order).toBe(null);
    expect(r.newState.units.u2!.fortified).toBe(true);
  });

  it('ENGAGEMENT R-175/R-181 (ancien R-52/R-54 abrogé) : survie mutuelle = cohabitation, mêlée de fin de tour', () => {
    const seed = seedDiscriminatingFortify(); // survie mutuelle garantie
    const state = guerriersAffrontes();
    state.units.u2!.fortified = true;
    const r = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }], p2: [] }, seed);
    // Plus aucun repli : l'attaquant prend place sur la case (fin des replis).
    expect(r.events.some((e) => e.type === 'Retreat')).toBe(false);
    // R-178 rév. A : le défenseur fortifié a été attaqué → mêlée REPORTÉE au
    // tour suivant (cohabitation au tour 1) ; elle résout bien au tour 2.
    expect(r.events.some((e) => e.type === 'MeleeResolved')).toBe(false);
    const r2 = resolveTurn(r.newState, {}, seed + 1);
    expect(r2.events.some((e) => e.type === 'MeleeResolved')).toBe(true);
  });

  it('R-33 : soins R-71 normaux — le fortifié soigne +1/tour (hors combat)', () => {
    const state = guerriersAffrontes();
    state.units.u2!.q = 6;
    state.units.u2!.r = 6;
    state.units.u2!.hp = 2;
    const r = resolveTurn(state, { p1: [], p2: [{ type: 'Fortify', unitId: 'u2' }] }, 42);
    expect(r.newState.units.u2!.hp).toBe(3);
    expect(r.newState.units.u2!.fortified).toBe(true);
  });

  it('R-33 : un ordre Fortify est refusé pour une unité inconnue ou ennemie (ignoré, déterministe)', () => {
    const state = guerriersAffrontes();
    const r = resolveTurn(state, { p1: [{ type: 'Fortify', unitId: 'u2' }], p2: [] }, 42);
    expect(r.newState.units.u2!.fortified).toBe(false);
    const r2 = resolveTurn(state, { p1: [{ type: 'Fortify', unitId: 'zz' }], p2: [] }, 42);
    expect(r2.newState.units['zz']).toBeUndefined();
  });
});
