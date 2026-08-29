/**
 * Armées — RULES.md §3.3 (R-31) : 3 unités du même type fusionnées en une entité
 * définitive. A/D = somme des membres, PV = somme des PV courants plafonnée à
 * 3 × PV max. Vétéran si au moins 2 membres vétérans 🔶.
 */
import { ARMY_SIZE } from './constants.js';
import type { Combatant } from './types.js';

export class ArmySizeError extends Error {}

export function formArmy(members: Combatant[], hpMaxPerMember: number): Combatant {
  if (members.length !== ARMY_SIZE) {
    throw new ArmySizeError(`Une armée requiert exactement ${ARMY_SIZE} membres (reçu : ${members.length})`);
  }
  const sum = (fn: (m: Combatant) => number) => members.reduce((acc, m) => acc + fn(m), 0);
  return {
    attack: sum((m) => m.attack),
    defense: sum((m) => m.defense),
    hp: Math.min(sum((m) => m.hp), ARMY_SIZE * hpMaxPerMember),
    veteran: members.filter((m) => m.veteran).length >= 2,
  };
}
