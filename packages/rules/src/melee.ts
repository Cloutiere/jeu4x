/**
 * ENGAGEMENT · R-180 — Mêlée pondérée + bonus d'étau.
 *
 * Une case instable sans défenseur (ou en cohabitation, D4) résout son
 * instabilité en fin de tour par UNE mêlée : chaque participante a un POIDS =
 * attaque effective² × étau (alliances numériques). La GAGNANTE est tirée à
 * w_i / Σw, puis la PERDANTE parmi les restantes au même mécanisme ; les
 * autres sont INTERMÉDIAIRES. Issue : gagnante 0 PV, perdante −2 PV
 * (MELEE_LOSER_DAMAGE), intermédiaires −1 PV (MELEE_MIDDLE_DAMAGE).
 *
 * Pur et déterministe (R-81/R-82) : le tirage consomme le RNG seedé de
 * résolution — même seed = mêmes rôles, bit à bit.
 */
import type { SeededRng } from './rng.js';
import { MELEE_TAU_BONUS, MELEE_TAU_CAP } from './constants.js';

export type MeleeRole = 'winner' | 'loser' | 'middle';

export interface MeleeEntrant {
  id: string;
  weight: number;
}

export interface MeleeResult {
  id: string;
  role: MeleeRole;
}

/**
 * Bonus d'étau (T-54/T-55) : +0,25 par unité alliée au-delà de la première
 * sur la case, plafonné à +0,50. `alliesCount` = nombre TOTAL d'unités du
 * même propriétaire parmi les participantes (≥ 1).
 */
export function meleeTauMultiplier(alliesCount: number): number {
  const extra = Math.max(0, alliesCount - 1);
  return 1 + Math.min(MELEE_TAU_BONUS * extra, MELEE_TAU_CAP);
}

/** Tir pondéré : index de l'entrant choisi pour `roll ∈ [0,1)`. */
function tirerPondere(entries: MeleeEntrant[], roll: number): MeleeEntrant {
  const total = entries.reduce((acc, e) => acc + e.weight, 0);
  let threshold = roll * total;
  for (const e of entries) {
    threshold -= e.weight;
    if (threshold < 0) return e;
  }
  return entries[entries.length - 1]!;
}

/**
 * Tire les rôles de mêlée : gagnante puis perdante (toutes deux pondérées),
 * intermédiaires pour le reste. Deux entrantes de même poids = tirage
 * uniforme (règle #8 d'Erik : les égalités se résolvent au hasard).
 * Consomme exactement 2 rolls (le second seulement si ≥ 2 restantes).
 */
export function drawWeightedMelee(entries: MeleeEntrant[], rng: SeededRng): MeleeResult[] {
  if (entries.length === 0) return [];
  const pool = [...entries];
  const results: MeleeResult[] = [];
  const winner = tirerPondere(pool, rng.next());
  results.push({ id: winner.id, role: 'winner' });
  pool.splice(pool.findIndex((e) => e.id === winner.id), 1);
  if (pool.length > 0) {
    const loser = tirerPondere(pool, rng.next());
    results.push({ id: loser.id, role: 'loser' });
    pool.splice(pool.findIndex((e) => e.id === loser.id), 1);
  }
  for (const e of pool) results.push({ id: e.id, role: 'middle' });
  return results;
}
