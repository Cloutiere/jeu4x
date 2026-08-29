/** Constantes réglables du jeu — source unique, référencées T-xx dans RULES.md §11. */

/** T-01 · Bonus de force d'une unité vétéran. */
export const VETERAN_BONUS = 0.5;
/** T-02 · Bonus défensif d'une case de ville. */
export const CITY_DEFENSE_BONUS = 0.5;
/** T-03 · Rounds contenus dans une attaque (un échange). */
export const EXCHANGES_PER_ATTACK = 1;
/** T-06 · Timers manqués consécutifs avant défaite par forfait. */
export const FORFEIT_MISSED_TURNS = 3;
/** T-07 · Rayon de vision des unités. */
export const VISION_RADIUS_UNIT = 2;
/** T-08 · Rayon de vision des villes. */
export const VISION_RADIUS_CITY = 3;
/** T-08b · Rayon dans lequel une ville peut travailler une case. */
export const CITY_WORK_RADIUS = 2;
/** T-09 · Distance minimale entre deux villes. */
export const MIN_CITY_DISTANCE = 2;
/** T-10 · Taille d'une armée. */
export const ARMY_SIZE = 3;
/** T-11 · L'eau est-elle franchissable en v1 ? (prototype pangée : non) */
export const WATER_PASSABLE = false;
/** T-12 · Butin en or de la destruction d'une unité pacifique (R-43). 🔶 */
export const SETTLER_BOOTY_GOLD = 10;
/** T-13 · Portée des unités à distance (R-59). 🔶 */
export const RANGED_RANGE = 1;

// --- Constantes 🔶 introduites par l'implémentation (absentes de la table
// RULES.md §11, défauts simples à calibrer) — signalées au rapport de session.

/** R-61 · Part du commerce allouée à la science (curseur global, défaut 50/50). 🔶 */
export const SCIENCE_RATIO_DEFAULT = 0.5;
/** R-63 · Seuil de croissance : base × population courante. 🔶 */
export const GROWTH_BASE = 10;
/** R-63 · Modulation de la production par point de population au-delà du premier. 🔶 */
export const POP_PRODUCTION_BONUS = 0.25;
