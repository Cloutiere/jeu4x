import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, unit } from '../src/fixtures.js';
import type { GameState, Order } from '../src/state.js';
import type { GameEvent } from '../src/events.js';
import type { CombatDetail } from '../src/combat.js';

/**
 * HANDOFF-ARMEE-STRENGTH (canon Erik 09/11) — R-31 branchée au combat :
 * une armée ATTAQUE et DÉFEND à la somme des membres (base du type ×3),
 * le ×3 s'applique à la base (traits de type inclus), la vétéran ×1,5
 * APRÈS le ×3, les bonus % défensifs APRÈS le ×3. Mod nommé au détail :
 * « Armée ×3 (R-31) ».
 */

function echangeDe(result: { events: GameEvent[] }): Extract<GameEvent, { type: 'CombatExchange' }> {
  const e = result.events.find((x) => x.type === 'CombatExchange');
  if (!e) throw new Error('aucun CombatExchange');
  return e as Extract<GameEvent, { type: 'CombatExchange' }>;
}

/** Graine dont le premier assaut est joué (peu importe le camp touché — les
 *  assertions portent sur les FORCES et p, jamais sur l'issue du dé). */
function uneGraine(): number {
  return 1;
}

describe('ARMEE-STRENGTH · R-31 au combat (canon A et D ×3)', () => {
  it('une armée de 3 guerriers ATTAQUE à force 3, mod « Armée ×3 (R-31) » au détail', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, isArmy: true, hp: 9 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, uneGraine());
    const { detail } = echangeDe({ events });
    const d = detail as CombatDetail;
    expect(d.attaquant.force).toBe(3);
    expect(d.attaquant.base).toBe(1); // base du type affichée brute
    const armee = d.attaquant.modsBase.find((m) => m.label === 'Armée ×3 (R-31)');
    expect(armee).toBeDefined();
    expect(armee!.valeur).toBe(2); // 1 + 2 = 3
    // le défenseur simple est INCHANGÉ : force 1, aucun mod armée
    expect(d.defenseur.force).toBe(1);
    expect(d.defenseur.modsBase.some((m) => m.label.includes('Armée'))).toBe(false);
  });

  it('une armée DÉFEND à force 3 (+ bonus % APRÈS le ×3 : fortifiée = 3,3)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 0, r: 0, isArmy: true, hp: 9, fortified: true },
      ],
    });
    const { events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 0, r: 0 }] }] }, uneGraine());
    const d = echangeDe({ events }).detail as CombatDetail;
    // défenseur stabilisé (seul occupant) → défense 1 ×3 = 3, fortification +10 % APRÈS
    expect(d.defenseur.base).toBe(1);
    expect(d.defenseur.modsBase.find((m) => m.label === 'Armée ×3 (R-31)')).toBeDefined();
    expect(d.defenseur.bonusDefPct.reduce((s, m) => s + m.valeur, 0)).toBeCloseTo(0.1);
    expect(d.defenseur.force).toBeCloseTo(3.3);
  });

  it('armée sur colline fortifiée (cas BJ5VC5) : défense 3 × 1,6 = 4,8', () => {
    const state = makeState({
      terrainOverrides: { '0,0': 'colline' },
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 0, r: 0, isArmy: true, hp: 9, fortified: true },
      ],
    });
    const { events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 0, r: 0 }] }] }, uneGraine());
    const d = echangeDe({ events }).detail as CombatDetail;
    expect(d.defenseur.force).toBeCloseTo(4.8); // 3 × (1 + 0,5 + 0,1)
  });

  it('vétéran ×1,5 APRÈS le ×3 : armée vétéran attaque à 4,5', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, isArmy: true, hp: 9, veteran: true },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, uneGraine());
    const d = echangeDe({ events }).detail as CombatDetail;
    expect(d.attaquant.force).toBeCloseTo(4.5); // 3 × 1,5
    expect(d.attaquant.veteran).toBe(true);
  });

  it('trait national ×3 : armée de 3 Chevaliers Samouraïs (Japon) attaque à 15', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'chevalier_samourai', owner: 'p1', q: 0, r: 0, isArmy: true, hp: 9 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    state.players['p1']!.civId = 'japon';
    state.players['p1']!.era = 'medievale'; // R-149 : +1 attaque Chevalier Samouraï
    const { events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, uneGraine());
    const d = echangeDe({ events }).detail as CombatDetail;
    expect(d.attaquant.force).toBe(15); // (4 + 1) × 3
    const trait = d.attaquant.modsBase.find((m) => m.label.includes('R-149'));
    expect(trait!.valeur).toBe(3); // le bonus samouraï ×3 aussi
  });

  it('CAS BJ5VC5 reconstitué : armée 7 PV force 3 vs gardien fortifié 1,6 → p(att) ≈ 78 %', () => {
    const state = makeState({
      terrainOverrides: { '1,0': 'colline' },
      units: [
        { id: 'u31', type: 'guerrier', owner: 'p1', q: 0, r: 0, isArmy: true, hp: 7 },
        { id: 'gardien', type: 'guerrier', owner: 'p2', q: 1, r: 0, fortified: true, hp: 3 },
      ],
    });
    const { events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u31', path: [{ q: 1, r: 0 }] }] }, uneGraine());
    const d = echangeDe({ events }).detail as CombatDetail;
    expect(d.attaquant.force).toBe(3); // avant le fix : 1 — l'armée frappait comme une seule unité
    expect(d.defenseur.force).toBeCloseTo(1.6); // colline +50 % T-02, fortification +10 % T-17
    const pPremierAssaut = d.rounds[0]!.pTouche;
    expect(pPremierAssaut).toBeCloseTo(9 / (9 + 2.56), 2); // 0,782 — victoire quasi certaine
  });

  it('unité SIMPLE inchangée : force 1, zéro mod armée', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, uneGraine());
    const d = echangeDe({ events }).detail as CombatDetail;
    expect(d.attaquant.force).toBe(1);
    expect(d.attaquant.modsBase.some((m) => m.label.includes('Armée'))).toBe(false);
    expect(d.defenseur.force).toBe(1);
  });

  it('la formation FormArmy produit toujours une armée aux PV canon (intacte)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 3, r: 0 },
        { id: 'u3', type: 'guerrier', owner: 'p1', q: 2, r: 1 },
      ],
    });
    const form: Order = { type: 'FormArmy', members: ['u1', 'u2', 'u3'], rally: { q: 2, r: 0 } };
    const orders: Record<string, Order[]> = {
      p1: [
        form,
        { type: 'Move', unitId: 'u1', path: [{ q: 2, r: 0 }] },
        { type: 'Move', unitId: 'u2', path: [{ q: 2, r: 0 }] },
        { type: 'Move', unitId: 'u3', path: [{ q: 2, r: 0 }] },
      ],
    };
    const { newState, events } = resolveTurn(state, orders, 1);
    const formed = events.find((e) => e.type === 'ArmyFormed') as Extract<GameEvent, { type: 'ArmyFormed' }> | undefined;
    expect(formed).toBeDefined();
    expect(unit(newState, formed!.unitId)).toMatchObject({ isArmy: true, hp: 9 });
  });
});
