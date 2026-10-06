/**
 * Formule de combat — RULES.md §7.4 (R-51, R-55).
 * Structure calquée sur la convention Civilization : A/D + modificateurs + rounds
 * probabilistes. Le perdant de chaque round perd 1 PV.
 */
import type { Combatant } from './types.js';
import { VETERAN_BONUS } from './constants.js';
import type { SeededRng } from './rng.js';

export type RoundWinner = 'attacker' | 'defender';

// ---------------------------------------------------------------------------
// HANDOFF-COMBAT-EXPLIQUE (décisions Erik 06/10, D1-D5) — structs du détail
// émis avec chaque combat : le rapport explique POURQUOI le gagnant gagne.
// Le détail est calculé PAR le calcul de combat lui-même (combatStrengthsOf
// dans turn.ts) — zéro duplication de formule. Champ ADDITIF sur les
// événements (D5 : rétroactivité nulle, schemaVersion inchangée).
// ---------------------------------------------------------------------------

/** Un modificateur nommé de force (valeur en points ou en fraction selon la liste porteuse). */
export interface CombatMod {
  label: string;
  valeur: number;
}

/** Décomposition complète de la force d'un participant (RULES §7.4). */
export interface CombatForceDetail {
  unitId: string;
  role: 'attaquant' | 'defenseur';
  /** Stat de base (attaque, ou défense si le défenseur est stabilisé R-174). */
  base: number;
  /** Stats civilisationnelles R-149 ajoutées à la base (avant vétéran). */
  modsBase: CombatMod[];
  /** Vétéran T-01 : ×(1 + VETERAN_BONUS). */
  veteran: boolean;
  /** Défenseur : bonus % additifs (terrain T-02, fortification T-17, bâtiments de ville). */
  bonusDefPct: CombatMod[];
  /** Points ajoutés après multiplication (soutien naval R-118, Himeji R-125, régime R-121). */
  modsPost: CombatMod[];
  /** Force finale utilisée dans p (S_att / S_def). */
  force: number;
}

/** Un assaut (round R-51) : jet brut et cible des dégâts. */
export interface CombatRoundDetail {
  round: number;
  /** Tir RNG brut [0,1) — null en cas de tir sans riposte (R-59-b : p=1). */
  jet: number | null;
  /** p (l'attaquant touche) au moment du tir. */
  pTouche: number;
  /** Le camp qui PERD 1 PV sur cet assaut. */
  touche: 'attaquant' | 'defenseur';
  pvPerdus: number;
}

/** Détail complet d'un combat, joint aux événements CombatExchange. */
export interface CombatDetail {
  attaquant: CombatForceDetail;
  defenseur: CombatForceDetail;
  rounds: CombatRoundDetail[];
  issue: 'victoire-attaquant' | 'victoire-defenseur' | 'survie-mutuelle' | 'ecrasement';
  overrun: boolean;
  /** Sans riposte R-59-b : le round retire directement 1 PV au défenseur. */
  sansRiposte: boolean;
  /** Présent uniquement si overrun : les valeurs du test R-149 (base S_att, sans soutien naval). */
  ecrasement?: { sAttBase: number; sDef: number; ratio: number };
}

/** Détail d'une mêlée R-180 : poids de chaque participante et tirages. */
export interface MeleeDetail {
  participants: Array<{
    unitId: string;
    base: number;
    veteran: boolean;
    bonusDefPct: CombatMod[];
    /** Attaque effective (base × vétéran × (1 + bonus demeure)). */
    force: number;
    /** Étau d'alliance T-54/T-55. */
    tau: number;
    /** Poids de tirage = force² × étau. */
    poids: number;
  }>;
  /** Tirages RNG consommés (gagnante puis perdante). */
  rolls: number[];
}

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

/**
 * 7h · R-125 (Oracle) : probabilité que l'ATTAQUANT touche un round
 * S_att² / (S_att² + S_def²) — helper pur exposé pour l'UI de pré-confirmation
 * (l'issue exacte affichée = probabilités + vainqueur attendu ; le tir seedé
 * reste à la résolution — interprétation 🔶 documentée).
 */
export function combatOdds(sAtt: number, sDef: number): number {
  const a2 = sAtt * sAtt;
  const d2 = sDef * sDef;
  if (a2 + d2 === 0) return 0;
  return a2 / (a2 + d2);
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
