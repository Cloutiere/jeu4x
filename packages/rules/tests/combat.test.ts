import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng.js';
import { combatRound, effectiveStrength, fightToDeath, resolveExchange } from '../src/combat.js';
import { formArmy } from '../src/army.js';
import type { Combatant } from '../src/types.js';

const warrior = (hp = 3, veteran = false): Combatant => ({
  attack: 1,
  defense: 1,
  hp,
  veteran,
});

describe('R-80 · RNG seedé', () => {
  it('produit la même séquence pour la même graine', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a.next(), a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('des graines différentes produisent des séquences différentes', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).not.toEqual(seqB);
  });

  it('reste dans [0, 1) sur un grand échantillon', () => {
    const rng = createRng(123);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('R-51/R-52 · Force effective et round', () => {
  it('applique le bonus vétéran (+50 %, T-01)', () => {
    expect(effectiveStrength(2, false)).toBe(2);
    expect(effectiveStrength(2, true)).toBe(3);
  });

  it('applique le bonus de terrain au défenseur', () => {
    // Forêt +25 % sur D=2 : 2 × 1.25 = 2.5
    expect(effectiveStrength(2, false, 0.25)).toBeCloseTo(2.5);
  });

  it('forces égales → p = 0.5 (le roll 0.5 ne touche jamais le défenseur)', () => {
    expect(combatRound(1, 1, 0.49)).toBe('defender');
    expect(combatRound(1, 1, 0.51)).toBe('attacker');
  });

  it('un camp à force 0 est touché à chaque round (R-51)', () => {
    expect(combatRound(0, 1, 0.0)).toBe('attacker');
    expect(combatRound(1, 0, 0.99)).toBe('defender');
  });

  it('un attaquant deux fois plus fort touche bien plus souvent', () => {
    // S_att=2, S_def=1 → p = 4/5 = 0.8
    expect(combatRound(2, 1, 0.79)).toBe('defender');
    expect(combatRound(2, 1, 0.81)).toBe('attacker');
  });
});

describe('R-51 · Échange', () => {
  it('un échange à 1 round retire au plus 1 PV', () => {
    const rng = createRng(7);
    const r = resolveExchange(warrior(), warrior(), 0, rng, 1);
    const lost = 3 - r.attackerHp + (3 - r.defenderHp);
    expect(lost).toBe(1);
    expect(r.attackerHp).toBe(3);
    expect(r.defenderHp).toBe(2);
  });

  it('R-80 : le même seed rejoue le même échange (crash-recovery)', () => {
    const r1 = resolveExchange(warrior(), warrior(2, true), 0.5, createRng(99), 1);
    const r2 = resolveExchange(warrior(), warrior(2, true), 0.5, createRng(99), 1);
    expect(r1).toEqual(r2);
  });
});

describe('R-55 · Attaques répétées jusqu’à élimination', () => {
  it('se termine toujours avec un vainqueur et un mort', () => {
    const rng = createRng(2024);
    for (let seed = 0; seed < 200; seed++) {
      const out = fightToDeath(warrior(), warrior(), 0, createRng(seed), 1);
      expect(out.winner === 'attacker' ? out.defenderHp : out.attackerHp).toBe(0);
      expect(out.exchanges).toBeGreaterThanOrEqual(1);
    }
  });

  it('un attaquant deux fois plus fort gagne la majorité des combats', () => {
    let attackerWins = 0;
    const n = 500;
    for (let seed = 0; seed < n; seed++) {
      const out = fightToDeath({ attack: 2, defense: 1, hp: 3, veteran: false }, warrior(), 0, createRng(seed), 1);
      if (out.winner === 'attacker') attackerWins++;
    }
    // p par round = 0.8 → victoire attendue >> 50 %
    expect(attackerWins / n).toBeGreaterThan(0.6);
  });

  it('le bonus de terrain favorise significativement le défenseur', () => {
    let defenderWins = 0;
    const n = 500;
    for (let seed = 0; seed < n; seed++) {
      const out = fightToDeath(warrior(), warrior(), 0.5, createRng(seed), 1);
      if (out.winner === 'defender') defenderWins++;
    }
    expect(defenderWins / n).toBeGreaterThan(0.6);
  });
});

describe('R-31 · Armées', () => {
  it('somme A/D et plafonne les PV à 3 × PV max', () => {
    const army = formArmy([warrior(3), warrior(3), warrior(1)], 3);
    expect(army.attack).toBe(3);
    expect(army.defense).toBe(3);
    expect(army.hp).toBe(7);
  });

  it('vétéran si au moins 2 membres vétérans', () => {
    expect(formArmy([warrior(3, true), warrior(3, true), warrior(3)], 3).veteran).toBe(true);
    expect(formArmy([warrior(3, true), warrior(3), warrior(3)], 3).veteran).toBe(false);
  });

  it('refuse toute autre taille que 3', () => {
    expect(() => formArmy([warrior(), warrior()], 3)).toThrow();
    expect(() => formArmy([warrior(), warrior(), warrior(), warrior()], 3)).toThrow();
  });
});
