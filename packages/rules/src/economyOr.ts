/**
 * 7l · Or & trésorerie — RULES.md §8.10 (R-134..R-137), données economy.json.
 *
 * Fonctions PURES et déterministes (R-80/R-81/R-82), source unique partagée
 * par le moteur (Phase C, turn.ts) et l'UI (barre supérieure, bouton
 * « Acheter maintenant ») — même philosophie que conversionGains (R-90/R-88).
 *
 *  - R-134 : trésorerie d'empire (`player.treasury`), zéro entretien, sources
 *    exogènes (surplus de recherche, camps barbares, sac de ville, Gemmes/Or,
 *    intérêts 2 % en hook 7n) ;
 *  - R-135 : rush-buy — coût = marteaux restants × facteur d'ère × réductions ;
 *  - R-136 : paliers économiques (ladder canon, un seul déclenchement chacun) ;
 *  - R-137 : Banque mondiale (condition dynamique 20 000 or, jamais débitée).
 */
import economyJson from './data/economy.json' with { type: 'json' };
import { BUILDINGS, UNIT_TYPES } from './data.js';
import { WONDERS, buildingCostDiscount } from './techs.js';
import { militaryCostMultOf } from './culture.js';
import { allKnownTechs } from './state.js';
import type { City, CityId, GameState, Player, PlayerId, ProductionItem } from './state.js';
import { techEraOf } from './growth.js';
import type { TechEra } from './types.js';

/** Données économiques (economy.json — R-134..R-137, calibrage 🔶). */
export interface EconomyData {
  eraRushFactors: Record<TechEra, number>;
  rushForbiddenWonders: string[];
  milestones: Array<{ threshold: number; reward: string; label: string }>;
  milestoneTechIds: string[];
  cityCapturePlunderPct: number;
  interestRatePct: number;
  interestTraitKey: string;
  explorerGoldInjection: Record<TechEra, number>;
}

export const ECONOMY: EconomyData = economyJson as unknown as EconomyData;

// ---------------------------------------------------------------------------
// R-134 · Intérêts de trésorerie (hook 7n)
// ---------------------------------------------------------------------------

/**
 * Hook 7n (civilisations & traits) : le joueur possède-t-il le trait donné ?
 * AUCUN système de civilisations avant 7n — toujours false (l'intérêt 2 % et
 * la réduction de rush ×0,5 restent désactivés). Le branchement 7n remplacera
 * ce stub par la lecture de `civilizations.json` (clé `traits` du joueur).
 */
export function playerHasTrait(_player: Player | undefined, _key: string): boolean {
  return false;
}

/**
 * R-134 · Intérêts passifs de trésorerie (2 % 🔶 — economy.json) : crédités
 * en fin de Phase C UNIQUEMENT pour un joueur doté du trait (hook 7n) —
 * désactivé sans trait (test).
 */
export function treasuryInterestOf(player: Player): number {
  if (!playerHasTrait(player, ECONOMY.interestTraitKey)) return 0;
  return Math.round(player.treasury * ECONOMY.interestRatePct);
}

// ---------------------------------------------------------------------------
// R-135 · Rush-buy
// ---------------------------------------------------------------------------

/** R-135 · Facteur d'ère du rush-buy (ère de l'EMPIRE — même définition que
 *  la pop de fondation D3/R-64 ; données economy.json 🔶 : 2/3/5/8). */
export function eraRushFactorFor(techsUnlocked: readonly string[]): number {
  return ECONOMY.eraRushFactors[techEraOf(techsUnlocked)] ?? 2;
}

/** R-135 · Le rush-buy est-il INTERDIT pour cet item ? (Banque mondiale et
 *  Nations Unies : strictement interdits — merveilles de victoire.) */
export function isRushForbidden(item: ProductionItem): boolean {
  return item.kind === 'wonder' && ECONOMY.rushForbiddenWonders.includes(item.id);
}

/** R-135 · Hook 7n : trait civilisationnel « rush des unités à moitié prix »
 *  (Amérique Médiévale — ×0,5 sur le coût en OR, cumulable avec le Complexe
 *  qui, lui, réduit les MARTEAUX via productionItemCostOf). Inactif sans
 *  civils (playerHasTrait toujours false). */
const RUSH_HALF_PRICE_TRAIT_KEY = 'rushHalfPrice';

/**
 * R-135 · Coût EFFECTIF d'un item de production en marteaux (réductions
 * appliquées : Complexe militaro-industriel −20 % des unités militaires via
 * `militaryCostMultOf`, remises Premier découvrir des bâtiments — plafond
 * 90 %, coût minimal 1). Partagé par le moteur (files, rush, réserve C7) et
 * l'UI. null si l'item est inconnu des données.
 */
export function productionItemCostOf(state: GameState, playerId: PlayerId, item: ProductionItem): number | null {
  let cost: number | null;
  if (item.kind === 'unit') {
    const stats = UNIT_TYPES[item.id];
    if (!stats) return null;
    cost = stats.cost;
    if (stats.canAttack) {
      const mult = militaryCostMultOf(Object.values(state.cities), playerId, allKnownTechs(state));
      if (mult !== 1) cost = Math.max(1, Math.round(cost * mult));
    }
  } else if (item.kind === 'wonder') {
    cost = WONDERS[item.id]?.cost ?? null;
  } else {
    cost = BUILDINGS[item.id]?.cost ?? null;
  }
  if (cost === null) return null;
  if (item.kind === 'building') {
    const discount = buildingCostDiscount(item.id, state.firstBy, playerId);
    if (discount > 0) cost = Math.max(1, Math.round(cost * (1 - discount)));
  }
  return cost;
}

/**
 * R-135 · Coût du rush-buy de la production COURANTE d'une ville :
 * `round(max(0, coût_effectif − progression) × facteur(ère) × hook_trait)`
 * (round half up ; 0 marteau investi = coût total × facteur — canon). La
 * réserve de marteaux (C7) n'entre PAS dans le calcul : elle n'est engagée
 * dans le projet qu'en Phase C (marteaux restants = investis dans la file).
 * Retourne null si : aucune production, item interdit (ONU/Banque mondiale),
 * item inconnu. L'éligibilité de POSE (case de ville, coût pop du Colon) et
 * la trésorerie suffisante sont re-validées par le moteur (turn.ts).
 */
export function rushBuyCostOf(state: GameState, city: City): number | null {
  if (!city.production) return null;
  const item = city.production.item;
  if (isRushForbidden(item)) return null;
  const cost = productionItemCostOf(state, city.owner, item);
  if (cost === null) return null;
  const remaining = Math.max(0, cost - city.production.progress);
  const factor = eraRushFactorFor(state.players[city.owner]?.techsUnlocked ?? []);
  const traitMult = playerHasTrait(state.players[city.owner], RUSH_HALF_PRICE_TRAIT_KEY) ? 0.5 : 1;
  return Math.max(1, Math.round(remaining * factor * traitMult));
}

// ---------------------------------------------------------------------------
// R-136 · Paliers économiques
// ---------------------------------------------------------------------------

export interface EconomyMilestone {
  threshold: number;
  reward: string;
  label: string;
}

/** R-136 · Prochain palier économique du joueur (index `economyMilestonesClaimed`),
 *  null si tous sont déjà accordés. */
export function nextEconomyMilestone(claimed: number): EconomyMilestone | null {
  return ECONOMY.milestones[claimed] ?? null;
}

/** R-136 · La première tech économique du ladder (Monnaie, sinon Bancaire)
 *  non encore débloquée — null si toutes le sont déjà. */
export function milestoneTechFor(techsUnlocked: readonly string[]): string | null {
  for (const id of ECONOMY.milestoneTechIds) {
    if (!techsUnlocked.includes(id)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// R-137 · Banque mondiale (condition dynamique) + Bloc 5 · injection Explorateur
// ---------------------------------------------------------------------------

/** R-137 · La Banque mondiale est-elle DISPONIBLE pour ce joueur ? Condition
 *  DYNAMIQUE (`treasuryRequired` des données) : apparaît/disparaît du menu ;
 *  pendant le chantier, la progression est gelée tant que la trésorerie est
 *  dessous (miroir ONU R-116). L'or n'est JAMAIS débité. */
export function wonderTreasuryLocked(wonderId: string, treasury: number): boolean {
  const required = WONDERS[wonderId]?.treasuryRequired;
  return typeof required === 'number' && treasury < required;
}

/** Bloc 5 · R-126 · Injection d'or du Grand Explorateur / Industriel (consume),
 *  fixe par ère (données economy.json : 50/100/200/400 — doc d'Erik). */
export function explorerGoldInjectionFor(techsUnlocked: readonly string[]): number {
  return ECONOMY.explorerGoldInjection[techEraOf(techsUnlocked)] ?? 50;
}
