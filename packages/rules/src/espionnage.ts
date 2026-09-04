/**
 * 7m · Espionnage jeu de base — RULES.md §8.11 (R-138..R-144), données
 * espionnage.json (chargée en `data.ts` : `ESPIONNAGE_DATA`).
 *
 * Fonctions PURES et déterministes (R-80/R-81/R-82), source unique partagée
 * par le moteur (Phase C : duels R-144, vol d'or R-143, pénalité culturelle
 * R-140) et l'UI (menu d'actions de l'espion, badge garnison) — même
 * philosophie que conversionGains (R-90/R-88) et economyOr (R-134).
 */
import { ESPIONNAGE_DATA } from './data.js';
import type { SpyDuelMatrix } from './types.js';

/** R-143 · T-35 · Or volé par `stealGold` : part `stealGoldPct` 🔶 de la
 *  trésorerie de la victime, arrondie au plus proche, plafonnée au montant
 *  disponible (jamais négative). */
export function stolenGoldAmount(victimTreasury: number): number {
  const pct = ESPIONNAGE_DATA.stealGoldPct;
  return Math.max(0, Math.min(victimTreasury, Math.round(victimTreasury * pct)));
}

/** R-144 · T-34 · Probabilité de victoire de l'ATTAQUANT dans un duel
 *  d'espions, selon les formations (un réseau = armée d'espions, R-142).
 *  Sans garnison adverse, la question ne se pose pas (succès automatique). */
export function spyDuelWinChance(attackerIsRing: boolean, defenderIsRing: boolean): number {
  const m: SpyDuelMatrix = ESPIONNAGE_DATA.duelWinChance;
  if (attackerIsRing) return defenderIsRing ? m.ringVsRing : m.ringVsIsolated;
  return defenderIsRing ? m.isolatedVsRing : m.isolatedVsIsolated;
}

/** R-140 · T-33 · Jalons culturels perdus par une DÉTONATION (annulée sous
 *  Despotisme — l'appelant évalue `nuclearWithoutPenalty`). */
export function nukeCulturePenalty(): number {
  return ESPIONNAGE_DATA.nukeCulturePenalty;
}

// ---------------------------------------------------------------------------
// 7n · Bloc 0 · C18 — destruction de bâtiment par espion : coût et risque
// croissants avec la VALEUR DE PRODUCTION du bâtiment (« plus facile de
// détruire une Bibliothèque qu'une Université »). Le tireur choisit le
// bâtiment AVANT l'action (`buildingId` de l'ordre — déjà porté en 7m).
// ---------------------------------------------------------------------------

/** C18 🔶 · Coût en or de la tentative : `round(marteaux × goldFactor)`
 *  (economy.json... espionnage.json — calibrage). Débité au lancement,
 *  NON remboursé (échec compris). */
export function destroyBuildingGoldOf(buildingCost: number): number {
  return Math.max(0, Math.round(buildingCost * ESPIONNAGE_DATA.destroyBuildingGoldFactor));
}

/** C18 🔶 · Probabilité de réussite : clamp(base − marteaux/divisor ; min ; max)
 *  (RNG seedé R-80 consulté par l'appelant — Phase C). */
export function destroyBuildingSuccessChance(buildingCost: number): number {
  const d = ESPIONNAGE_DATA;
  const raw = d.destroyBuildingSuccessBase - buildingCost / d.destroyBuildingSuccessDivisor;
  return Math.max(d.destroyBuildingSuccessMin, Math.min(d.destroyBuildingSuccessMax, raw));
}
