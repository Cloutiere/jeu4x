/**
 * Ressources — Phase 7c (RULES.md §8.3, R-91/R-92/R-93).
 *
 * Couche de requête pure sur `resources.json` (base relationnelle embarquée,
 * même philosophie que techs.ts/R-86). Fonctions PURES et déterministes :
 * tout parcours est trié (R-81).
 *
 * R-92 (D1) : l'ACCÈS (tech débloquée ou null) conditionne le bonus (R-93,
 * évalué dans economy.tileYield) ; la VISIBILITÉ ajoute le volet
 * `hiddenUntilRevealed` (une ressource non débloquée à masquage actif est
 * retirée de l'état filtré, fog.ts). Une ressource à masquage désactivé
 * serait affichée mais inactive — aucune ressource v1 n'utilise ce cas.
 */
import { RESOURCES } from './data.js';
import type { ResourceData, Yields } from './types.js';

/** L'ACCÈS (R-93) : la ressource est-elle exploitable par ce joueur ?
 *  tech null (D4) ou révélée par une tech débloquée. */
export function resourceAccessible(
  res: ResourceData | null,
  techsUnlocked: readonly string[],
): boolean {
  if (!res) return false;
  return res.revealedByTech === null || techsUnlocked.includes(res.revealedByTech);
}

/** La VISIBILITÉ (R-92/D1) : l'icône apparaît-elle dans l'état filtré ?
 *  true (débloquée / sans tech) ou ressource à masquage désactivé
 *  (« affichée mais inactive », CivRev-fidèle — aucun cas en v1). */
export function resourceVisible(
  res: ResourceData | null,
  techsUnlocked: readonly string[],
): boolean {
  if (!res) return false;
  if (res.revealedByTech === null) return true;
  return techsUnlocked.includes(res.revealedByTech) || !res.hiddenUntilRevealed;
}

/** Bonus effectif d'une ressource pour ce joueur (R-93) : les `yields` si
 *  accessible, zéro sinon. Nul pour une case sans ressource. */
export function resourceBonus(
  res: ResourceData | null,
  techsUnlocked: readonly string[],
): Yields | null {
  if (!res || !resourceAccessible(res, techsUnlocked)) return null;
  return res.yields;
}

/**
 * R-91 · Index inverse tech → ressources (miroir de `tech.unlocks`, réciproque
 * testée comme techs.test.ts). Tri par id (R-81).
 */
export function resourcesRevealedBy(techId: string): ResourceData[] {
  return Object.values(RESOURCES)
    .filter((r) => r.revealedByTech === techId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
