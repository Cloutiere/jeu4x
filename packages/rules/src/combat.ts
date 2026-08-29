/**
 * Formule de combat — RULES.md §7.4 (R-51, R-55).
 * Structure calquée sur la convention Civilization : A/D + modificateurs + rounds
 * probabilistes. Le perdant de chaque round perd 1 PV.
 */
import type { Combatant } from './types.js';
import { VETERAN_BONUS } from './constants.js';
import type { SeededRng } from './rng.js';

export type RoundWinner = 'attacker' | 'defender';

/** Force effective d'un camp : base × vétéran × bonus (terrain, côté défenseur seulement). */
export function effectiveStrength(base: number, veteran: boolean, bonusPct = 0): number {
  const vet = veteran ? 1 + VETERAN_BONUS : 1;
  return base * vet * (1 + bonusPct);
}

/**
 * Un round de combat. p(attacker touches) = S_att² / (S_att² + S_def²).
 * Un camp à force 0 est touché à chaque round (R-51 : p = 1 ou 0).
 */
export function combatRound(sAtt: number, sDef: number, roll: number): RoundWinner {
  const a2 = sAtt * sAtt;
  const d2 = sDef * sDef;
  const p = a2 / (a2 + d2);
  return roll < p ? 'defender' : 'attacker';
}

export interface ExchangeResult {
  attackerHp: number;
  defenderHp: number;
  rounds: RoundWinner[];
}

/** Un échange (attaque) : `exchangesPerAttack` round(s). Retourne les PV résultants, sans mutation. */
export function resolveExchange(
  attacker: Combatant,
  defender: Combatant,
  defenderTerrainBonus: number,
  rng: SeededRng,
  roundsCount: number,
): ExchangeResult {
  const sAtt = effectiveStrength(attacker.attack, attacker.veteran);
  const sDef = effectiveStrength(defender.defense, defender.veteran, defenderTerrainBonus);
  let attackerHp = attacker.hp;
  let defenderHp = defender.hp;
  const rounds: RoundWinner[] = [];
  for (let i = 0; i < roundsCount && attackerHp > 0 && defenderHp > 0; i++) {
    const winner = combatRound(sAtt, sDef, rng.next());
    rounds.push(winner);
    if (winner === 'defender') defenderHp -= 1;
    else attackerHp -= 1;
  }
  return { attackerHp, defenderHp, rounds };
}

export interface FightOutcome {
  winner: 'attacker' | 'defender';
  attackerHp: number;
  defenderHp: number;
  exchanges: number;
}

/** Combat à mort : attaques répétées jusqu'à élimination (R-55). Terminaison garantie : chaque échange retire ≥ 1 PV. */
export function fightToDeath(
  attacker: Combatant,
  defender: Combatant,
  defenderTerrainBonus: number,
  rng: SeededRng,
  roundsPerAttack: number,
): FightOutcome {
  let a = { ...attacker };
  let d = { ...defender };
  let exchanges = 0;
  while (a.hp > 0 && d.hp > 0) {
    const r = resolveExchange(a, d, defenderTerrainBonus, rng, roundsPerAttack);
    a = { ...a, hp: r.attackerHp };
    d = { ...d, hp: r.defenderHp };
    exchanges += 1;
  }
  return {
    winner: d.hp <= 0 ? 'attacker' : 'defender',
    attackerHp: Math.max(0, a.hp),
    defenderHp: Math.max(0, d.hp),
    exchanges,
  };
}
