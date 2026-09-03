/** Constantes réglables du jeu — source unique, référencées T-xx dans RULES.md §11. */

import { BARBARIANS, HUT_REWARDS } from './data.js';

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
/** T-08b · Rayon de travail d'une ville (R-60). Le Tribunal (R-66) ajoute
 *  WORK_RADIUS_TRIBUNAL (= 1) : rayon total 2 (18 cases au lieu de 6). */
export const CITY_WORK_RADIUS = 1;
/** R-66 · Bonus de rayon de travail apporté par le Tribunal (data-driven :
 *  building.workRadiusBonus — constante de référence pour la table). */
export const TRIBUNAL_WORK_RADIUS_BONUS = 1;
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
/** T-17 · Bonus défensif d'une unité fortifiée (R-33, ajouté le 30/08). 🔶 */
export const FORTIFY_DEFENSE_BONUS = 0.25;

// --- Constantes 🔶 introduites par l'implémentation (absentes de la table
// RULES.md §11, défauts simples à calibrer) — signalées au rapport de session.

/** R-61 · Part du commerce allouée à la science (curseur global, défaut 50/50). 🔶 */
export const SCIENCE_RATIO_DEFAULT = 0.5;
/** R-63 · OBSOLÈTE depuis 7i (D1/D2) : le seuil 10 × pop est remplacé par la
 *  table growth.json (growthThresholds, indexée par population cible) — la
 *  constante n'est plus lue par le moteur (source : packages/rules/src/growth.ts). */
export const GROWTH_BASE = 10;
/** R-63 · Modulation de la production par point de population au-delà du premier. 🔶 */
export const POP_PRODUCTION_BONUS = 0.25;

// --- Phase 7d — barbares & huttes (RULES.md §7.9) : valeurs portées par
// barbares.json / huttes.json (R-99 : calibrage sans code) et ré-exportées ici
// pour que constants.ts reste la source unique des T-xx côté code.

/** T-18 · Engendrement barbare : un village toutes les N résolutions (R-96). 🔶 */
export const BARBARIAN_SPAWN_INTERVAL = BARBARIANS.spawnInterval;
/** T-19 · Rayon d'aggro de l'IA barbare (R-97). 🔶 */
export const BARBARIAN_AGGRO_RADIUS = BARBARIANS.aggroRadius;
/** T-20 · Or de destruction d'un village barbare (R-96). 🔶 */
export const VILLAGE_DESTRUCTION_GOLD = BARBARIANS.villageDestructionGold;
/** T-21 · PV d'un village barbare (R-96). 🔶 */
export const VILLAGE_HP = BARBARIANS.villageHP;
/** T-22 · Cap d'unités vivantes engendrées par village (R-96). 🔶 */
export const CAP_PER_VILLAGE = BARBARIANS.capPerVillage;
/** T-23 · Escalade : le type « escalated » engendre après ce tour (R-95). 🔶 */
export const ESCALATION_TURN = BARBARIANS.escalationTurn;
/** T-24 · Boost de science d'une hutte (R-98). 🔶 */
export const HUT_SCIENCE_BOOST = HUT_REWARDS.scienceBoost;
/** T-25 · Or de hutte : borne basse du tir uniforme (R-98). 🔶 */
export const HUT_GOLD_MIN = HUT_REWARDS.rewards.find((r) => r.kind === 'gold')?.amountMin ?? 0;
/** T-26 · Or de hutte : borne haute du tir uniforme (R-98). 🔶 */
export const HUT_GOLD_MAX = HUT_REWARDS.rewards.find((r) => r.kind === 'gold')?.amountMax ?? 0;
