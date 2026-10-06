import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import { combatRound, effectiveStrength } from '../src/combat.js';
import { EXCHANGES_PER_ATTACK, FORTIFY_DEFENSE_BONUS, VETERAN_BONUS } from '../src/constants.js';
import { TERRAINS } from '../src/data.js';
import type { GameEvent } from '../src/events.js';
import type { CombatDetail, MeleeDetail } from '../src/events.js';

/**
 * HANDOFF-COMBAT-EXPLIQUE (décisions Erik 06/10, D1-D5) — le moteur émet avec
 * chaque combat un détail structuré DÉTERMINISTE (forces de chacun,
 * modificateurs nommés, jets RNG par assaut, issue) : le rapport de combat
 * explique POURQUOI le gagnant gagne. Le détail est calculé PAR le calcul de
 * combat lui-même (combatStrengthsOf) — zéro duplication de formule.
 *
 * D3 : le détail voyage sur l'événement (fog standard des événements).
 * D5 : champ ADDITIF — schemaVersion 27 inchangée, anciens journaux sommaires.
 */

function echangeDe(events: GameEvent[]): GameEvent & { type: 'CombatExchange'; detail: CombatDetail } {
  const e = events.find((ev) => ev.type === 'CombatExchange') as
    | (GameEvent & { type: 'CombatExchange'; detail?: CombatDetail })
    | undefined;
  if (!e) throw new Error('aucun CombatExchange émis');
  if (!e.detail) throw new Error('CombatExchange sans détail');
  return e as GameEvent & { type: 'CombatExchange'; detail: CombatDetail };
}

/** Combat à modificateurs multiples : attaquant vétéran + soutien naval
 *  (galion R-118, +15) contre défenseur fortifié sur colline (terrain +0,50,
 *  fortification T-17 +0,25). */
function combatMultiModificateurs(seed: number) {
  const state = makeState({
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, veteran: true },
      { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0, veteran: false, fortified: true },
      { id: 'n1', type: 'galion', owner: 'p1', q: 2, r: 0 },
    ],
    terrainOverrides: { '1,0': 'colline', '2,0': 'eau' },
  });
  state.units.u2!.stabilized = true;
  return resolveTurn(
    state,
    { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }], p2: [] },
    seed,
  );
}

describe('COMBAT-EXPLIQUE · D1 — le moteur émet le détail', () => {
  it('forces et modificateurs NOMMÉS exacts (vétéran, soutien naval, terrain, fortification)', () => {
    const r = combatMultiModificateurs(7);
    const { detail } = echangeDe(r.events);

    // Attaquant : base 1, vétéran ×(1+T-01), soutien naval galion +15.
    expect(detail.attaquant.unitId).toBe('u1');
    expect(detail.attaquant.base).toBe(1);
    expect(detail.attaquant.veteran).toBe(true);
    const soutien = detail.attaquant.modsPost.find((m) => m.label.includes('naval'));
    expect(soutien?.valeur).toBe(15);
    expect(detail.attaquant.force).toBeCloseTo(1 * (1 + VETERAN_BONUS) + 15, 10);

    // Défenseur stabilisé : base DÉFENSE 1, terrain colline +0,50 et
    // fortification +0,25 (T-17), aucun bonus de régime (NEUTRAL_CIV).
    expect(detail.defenseur.unitId).toBe('u2');
    expect(detail.defenseur.base).toBe(1);
    const terrain = detail.defenseur.bonusDefPct.find((m) => m.label.toLowerCase().includes('colline'));
    expect(terrain?.valeur).toBe(TERRAINS['colline']!.defenseBonus);
    const fortif = detail.defenseur.bonusDefPct.find((m) => m.label.toLowerCase().includes('fortif'));
    expect(fortif?.valeur).toBe(FORTIFY_DEFENSE_BONUS);
    expect(detail.defenseur.force).toBeCloseTo(1 * (1 + TERRAINS['colline']!.defenseBonus + FORTIFY_DEFENSE_BONUS), 10);
  });

  it('chaque assaut porte son jet RNG et la cible des dégâts (D2, granularité par round)', () => {
    const r = combatMultiModificateurs(7);
    const { detail } = echangeDe(r.events);
    expect(detail.rounds.length).toBe(EXCHANGES_PER_ATTACK);
    for (const round of detail.rounds) {
      expect(round.jet).toBeGreaterThanOrEqual(0);
      expect(round.jet).toBeLessThan(1);
      // Le jet re-joué dans la formule §7.4 redonne exactement la cible.
      const attendu = combatRound(detail.attaquant.force, detail.defenseur.force, round.jet as number);
      expect(round.touche).toBe(attendu === 'defender' ? 'defenseur' : 'attaquant');
      expect(round.pvPerdus).toBe(1);
    }
  });

  it('l\'issue est nommée et cohérente avec les PV après échange', () => {
    const r = combatMultiModificateurs(7);
    const ex = echangeDe(r.events);
    const { detail } = ex;
    // Un seul assaut (T-03 = 1) contre 3 PV : survie mutuelle quelle que soit la cible.
    expect(detail.issue).toBe('survie-mutuelle');
    if (detail.rounds.some((round) => round.touche === 'defenseur')) {
      expect(ex.defenderHpAfter).toBe(2);
      expect(ex.attackerHpAfter).toBe(3);
    } else {
      expect(ex.attackerHpAfter).toBe(2);
      expect(ex.defenderHpAfter).toBe(3);
    }
    // Les PV d'événement reflètent l'état réel post-résolution.
    const u1 = r.newState.units.u1!;
    const u2 = r.newState.units.u2!;
    if (u2) expect(ex.defenderHpAfter).toBe(u2.hp);
    if (u1) expect(ex.attackerHpAfter).toBe(u1.hp);
  });

  it('R-59 : sans riposte (archer vs terrestre), les rounds le consignent (jet null)', () => {
    const state = makeState({
      units: [
        { id: 'a1', type: 'catapulte', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    state.units.u2!.stabilized = true;
    const r = resolveTurn(
      state,
      { p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }], p2: [] },
      7,
    );
    const ex = echangeDe(r.events);
    const { detail } = ex;
    expect(detail.sansRiposte).toBe(true);
    expect(detail.rounds.length).toBeGreaterThan(0);
    for (const round of detail.rounds) {
      expect(round.jet).toBeNull();
      expect(round.touche).toBe('defenseur');
    }
    // Un seul assaut contre 3 PV : le défenseur survit (survie mutuelle R-176).
    expect(detail.issue).toBe('survie-mutuelle');
    expect(ex.defenderHpAfter).toBe(2);
  });
});

describe('COMBAT-EXPLIQUE · critère 2 — forces × jets = dégâts appliqués (propriété)', () => {
  it('sur un corpus de seeds : p re-dérivée du détail, rounds re-joués, PV cohérents', () => {
    for (let seed = 0; seed < 24; seed++) {
      const r = combatMultiModificateurs(seed);
      const ex = echangeDe(r.events);
      const { detail } = ex;
      const fA = detail.attaquant.force;
      const fD = detail.defenseur.force;
      // La force du détail = effectiveStrength recomposée base × vétéran × bonus + post.
      expect(fA).toBeCloseTo(
        effectiveStrength(
          detail.attaquant.base + detail.attaquant.modsBase.reduce((s, m) => s + m.valeur, 0),
          detail.attaquant.veteran,
        ) + detail.attaquant.modsPost.reduce((s, m) => s + m.valeur, 0),
        10,
      );
      expect(fD).toBeCloseTo(
        effectiveStrength(
          detail.defenseur.base + detail.defenseur.modsBase.reduce((s, m) => s + m.valeur, 0),
          detail.defenseur.veteran,
          detail.defenseur.bonusDefPct.reduce((s, m) => s + m.valeur, 0),
        ) + detail.defenseur.modsPost.reduce((s, m) => s + m.valeur, 0),
        10,
      );
      // Chaque jet re-joué dans la formule §7.4 redonne la cible consignée.
      for (const round of detail.rounds) {
        const attendu = combatRound(fA, fD, round.jet as number);
        expect(round.touche).toBe(attendu === 'defender' ? 'defenseur' : 'attaquant');
      }
      // Les PV consignés = PV de départ − dégâts des rounds.
      const touchesD = detail.rounds.filter((round) => round.touche === 'defenseur').length;
      const touchesA = detail.rounds.filter((round) => round.touche === 'attaquant').length;
      expect(ex.defenderHpAfter).toBe(3 - touchesD);
      expect(ex.attackerHpAfter).toBe(3 - touchesA);
    }
  });
});

describe('COMBAT-EXPLIQUE · R-149 Écrasement (Overrun) marqué', () => {
  it('canon vs guerrier : détail d\'écrasement, aucun round, Overrun true', () => {
    const state = makeState({
      units: [
        { id: 'c1', type: 'char_d_assaut', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    state.units.u2!.stabilized = true;
    const r = resolveTurn(
      state,
      { p1: [{ type: 'Attack', unitId: 'c1', target: { q: 1, r: 0 } }], p2: [] },
      7,
    );
    const ex = echangeDe(r.events);
    const { detail } = ex;
    expect(detail.overrun).toBe(true);
    expect(detail.issue).toBe('ecrasement');
    expect(detail.rounds.length).toBe(0);
    expect(detail.ecrasement).toBeDefined();
    expect(detail.ecrasement!.sAttBase).toBeCloseTo(10, 10);
    expect(detail.ecrasement!.sDef).toBeCloseTo(1, 10);
    expect(detail.ecrasement!.ratio).toBe(6);
    expect(ex.defenderHpAfter).toBe(0);
    expect(r.newState.units.u2).toBeUndefined();
  });

  it('combat ordinaire : Overrun false', () => {
    const r = combatMultiModificateurs(7);
    const { detail } = echangeDe(r.events);
    expect(detail.overrun).toBe(false);
    expect(detail.issue).not.toBe('ecrasement');
  });
});

describe('COMBAT-EXPLIQUE · mêlée R-180 couverte', () => {
  it('MeleeResolved porte le détail des poids (eff² × étau) et des tirages', () => {
    const state = makeState({
      units: [
        { id: 'm1', type: 'guerrier', owner: 'p1', q: 3, r: 3, veteran: true },
        { id: 'm2', type: 'guerrier', owner: 'p2', q: 3, r: 3 },
      ],
    });
    const r = resolveTurn(state, { p1: [], p2: [] }, 7);
    const melee = r.events.find((ev) => ev.type === 'MeleeResolved') as
      | (GameEvent & { type: 'MeleeResolved'; detail?: MeleeDetail })
      | undefined;
    if (!melee || !melee.detail) throw new Error('MeleeResolved sans détail');
    const detail = melee.detail;
    expect(detail.participants.length).toBe(2);
    for (const p of detail.participants) {
      // Chaque participant : force (attaque effective) et poids = force² × étau.
      expect(p.poids).toBeCloseTo(p.force * p.force * p.tau, 10);
    }
    const p1 = detail.participants.find((p) => p.unitId === 'm1')!;
    expect(p1.veteran).toBe(true);
    expect(p1.force).toBeCloseTo(effectiveStrength(1, true), 10);
    // Deux tirages consommés (gagnante puis perdante) et consignés.
    expect(detail.rolls.length).toBe(2);
    for (const jet of detail.rolls) {
      expect(jet).toBeGreaterThanOrEqual(0);
      expect(jet).toBeLessThan(1);
    }
    // Les rôles de l'événement sont couverts par le détail (mêmes participants).
    const idsDetail = new Set(detail.participants.map((p) => p.unitId));
    for (const res of melee.results) expect(idsDetail.has(res.unitId)).toBe(true);
  });
});

describe('COMBAT-EXPLIQUE · D5 — rétroactivité nulle (champ additif)', () => {
  it('le type reste optionnel : un CombatExchange sans détail reste typable (anciens journaux)', () => {
    const ancien: GameEvent = {
      seq: 1,
      type: 'CombatExchange',
      attackerId: 'u1',
      defenderId: 'u2',
      at: { q: 0, r: 0 },
      attackerHpAfter: 3,
      defenderHpAfter: 2,
    };
    expect((ancien as { detail?: CombatDetail }).detail).toBeUndefined();
  });
});
