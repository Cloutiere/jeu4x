/**
 * Gouvernements — Phase 7h (RULES.md §8.7, R-121/R-122).
 *
 * Base documentaire : la spécification d'Erik « Gouvernements Civilization
 * Revolution » (valeurs exactes). Toutes les données vivent dans
 * governments.json — calibrage sans code. Fonctions PURES et déterministes
 * (R-80/R-81/R-82) : tout parcours est trié. Source unique partagée par le
 * moteur (processEconomy, performExchange), le serveur (SetGovernment —
 * action immédiate, même contrat que SetResearch/SetConversion) et l'UI
 * (menu de gouvernement, bandeau Anarchie).
 */
import governmentsJson from './data/governments.json' with { type: 'json' };
import { TECHS, WONDERS } from './techs.js';
import { civAnarchyImmunity } from './civilizations.js';
import type { GameState, Player, PlayerId } from './state.js';
import type { GovernmentData, GovernmentEffects, GovernmentsData } from './types.js';

export const GOVERNMENTS_DATA = governmentsJson as unknown as GovernmentsData;
/** R-121 : table des régimes (source unique moteur/UI/serveur). */
export const GOVERNMENTS: Record<string, GovernmentData> = GOVERNMENTS_DATA.governments;
/** T-29 · Durée de l'Anarchie après un changement manuel (R-122). */
export const ANARCHY_TURNS = GOVERNMENTS_DATA.anarchyTurns;

/** R-121 : régime par défaut (Despotisme). */
export const DEFAULT_GOVERNMENT = Object.values(GOVERNMENTS).find((g) => g.default)?.id ?? 'despotisme';

/** R-121 : données d'un régime (lève si id inconnu — usage moteur gardé-fou). */
export function governmentOf(playerId: string, government: string): GovernmentData {
  const g = GOVERNMENTS[government];
  if (!g) throw new Error(`Régime inconnu : ${government} (joueur ${playerId})`);
  return g;
}

/** Effets du régime actif du joueur (Despotisme si régime inconnu — tolérance migration). */
export function effectsFor(player: Player): GovernmentEffects {
  return GOVERNMENTS[player.government ?? DEFAULT_GOVERNMENT]?.effects ?? {};
}

/**
 * R-122 : le joueur est-il en ANARCHIE pendant la résolution du tour `turn` ?
 * `anarchyUntil` est fixé à (tour de l'action + T-29) par SetGovernment : la
 * résolution qui suit (state.turn === tour de l'action) est paralysée tant
 * que `turn < anarchyUntil`. Aucun bonus ancien/nouveau ne s'applique.
 */
export function isInAnarchy(player: Player, turn: number): boolean {
  return typeof player.anarchyUntil === 'number' && turn < player.anarchyUntil;
}

/**
 * R-122/R-125 : le joueur peut-il adopter ce régime ? Tech débloquée OU
 * Grande Pyramide contrôlée (toutes les villes comptent — R-124 même logique
 * de contrôle d'empire), non déjà actif.
 */
export function governmentIssue(
  player: Player,
  governmentId: string,
  playerId: PlayerId,
  cities: Array<{ owner: PlayerId; wonders: string[] }>,
): string | null {
  const gov = GOVERNMENTS[governmentId];
  if (!gov) return 'régime inconnu';
  if ((player.government ?? DEFAULT_GOVERNMENT) === governmentId) return 'régime déjà actif';
  const hasPyramid = cities.some((c) => c.owner === playerId && c.wonders.includes('grande_pyramide'));
  if (gov.tech && !player.techsUnlocked.includes(gov.tech) && !hasPyramid) {
    return `Requiert : ${TECHS[gov.tech]?.name ?? gov.tech}`;
  }
  return null;
}

/**
 * R-122 : l'adoption est-elle SANS Anarchie ? Oui ssi la tech du régime a été
 * COMPLÉTÉE pendant la résolution courante (`techsUnlockedThisTurn`, liste
 * réinitialisée à chaque résolution — le conseiller invite à la bascule).
 */
export function anarchyFreeAdoption(player: Player, governmentId: string): boolean {
  const gov = GOVERNMENTS[governmentId];
  if (!gov?.tech) return false;
  return (player.techsUnlockedThisTurn ?? []).includes(gov.tech);
}

/**
 * R-112 amendée R-121 : coût en POPULATION d'une unité à la production —
 * la République réduit le coût du Colon de 2 à 1 (les autres coûts inchangés).
 */
export function populationCostOf(basePopCost: number, player: Player): number {
  const effects = effectsFor(player);
  if (basePopCost > 0 && typeof effects.settlerPopCost === 'number') {
    return Math.min(basePopCost, effects.settlerPopCost);
  }
  return basePopCost;
}

export type SetGovernmentResult =
  | { ok: true; state: GameState; anarchy: boolean }
  | { ok: false; reason: string };

/**
 * R-122 · SetGovernment (action IMMÉDIATE, pure) : adopte un régime. Transition
 * manuelle = Anarchie T-29 tour(s) (anarchyUntil = tour + T-29) ; bascule SANS
 * Anarchie si la tech du régime vient d'être complétée (R-122 — conseiller).
 * Refusé pendant l'anarchie (interprétation tranchée, R-122 : pas de
 * re-programmation). Comme SetResearch/SetConversion : aucun ordre de tour,
 * appliqué à la réception par le serveur.
 */
export function applySetGovernment(
  input: GameState,
  playerId: PlayerId,
  governmentId: string,
): SetGovernmentResult {
  const st = structuredClone(input);
  const player = st.players[playerId];
  if (!player) return { ok: false, reason: `joueur inconnu : ${playerId}` };
  if (isInAnarchy(player, st.turn)) {
    return { ok: false, reason: 'changement impossible pendant l’Anarchie' };
  }
  const issue = governmentIssue(
    player,
    governmentId,
    playerId,
    Object.values(st.cities).map((c) => ({ owner: c.owner, wonders: c.wonders })),
  );
  if (issue) return { ok: false, reason: issue };
  const free = anarchyFreeAdoption(player, governmentId);
  // 7n · R-149 : IMMUNITÉ ANARCHIE (Chine Moderne, Inde Antique, Japon
  // Industrielle) — toute transition se fait sans Anarchie.
  const immune = civAnarchyImmunity(player);
  player.government = governmentId;
  player.anarchyUntil = free || immune ? null : st.turn + ANARCHY_TURNS;
  return { ok: true, state: st, anarchy: !(free || immune) };
}

/**
 * R-121 · Fondamentalisme : +1 Attaque / +1 Défense FIXES aux unités
 * TERRESTRES (aquatique exclu — « toutes les unités terrestres »). Pur et
 * testable hors Board : le contexte (joueur, anarchie) est évalué par
 * l'appelant (moteur).
 */
export function landCombatBonus(
  effects: GovernmentEffects,
  stats: { aquatic?: boolean },
  kind: 'attack' | 'defense',
): number {
  if (stats.aquatic) return 0;
  const bonus = kind === 'attack' ? effects.landAttackBonus : effects.landDefenseBonus;
  return bonus ?? 0;
}
