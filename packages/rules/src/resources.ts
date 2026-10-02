/**
 * Ressources — Phase 7c (RULES.md §8.3, R-91/R-92/R-93).
 *
 * Couche de requête pure sur `resources.json` (base relationnelle embarquée,
 * même philosophie que techs.ts/R-86). Fonctions PURES et déterministes :
 * tout parcours est trié (R-81).
 *
 * R-92 (D1 révisée le 01/09/2026) : la PRÉSENCE d'une ressource est toujours
 * visible sur une case explorée ; son IDENTITÉ peut être masquée — l'état
 * filtré diffuse alors le marqueur `RESOURCE_UNKNOWN` (« inconnue ») à la
 * place de l'id réel. L'ACCÈS (tech débloquée ou null) conditionne le bonus
 * (R-93, évalué dans economy.tileYield) : une ressource inconnue n'apporte
 * rien. Variante CivRev-fidèle (`hiddenUntilRevealed: false`) : l'icône
 * réelle est diffusée avant la tech, bonus verrouillé — aucun cas en v1.
 */
import { RESOURCES } from './data.js';
import type { ResourceData, Yields } from './types.js';
import { RESOURCE_UNKNOWN } from './types.js';
import type { TileResource } from './types.js';

/** L'ACCÈS (R-93) : la ressource est-elle exploitable par ce joueur ?
 *  tech null (D4) ou révélée par une tech débloquée.
 *  7n · R-149 (trait Indien `toutesRessources`) : `bypassTech` court-circuite
 *  la technologie — l'Inde accède immédiatement à toutes les ressources. */
export function resourceAccessible(
  res: ResourceData | null,
  techsUnlocked: readonly string[],
  bypassTech = false,
): boolean {
  if (!res) return false;
  if (bypassTech) return true;
  return res.revealedByTech === null || techsUnlocked.includes(res.revealedByTech);
}

/** L'IDENTITÉ est-elle connue du joueur (R-92) ? true = l'icône réelle est
 *  diffusée ; false = le marqueur « inconnue » est diffusé à sa place
 *  (masquage actif : tech manquante ET `hiddenUntilRevealed`). */
export function resourceIdentified(
  res: ResourceData | null,
  techsUnlocked: readonly string[],
): boolean {
  if (!res) return false;
  if (res.revealedByTech === null) return true;
  return techsUnlocked.includes(res.revealedByTech) || !res.hiddenUntilRevealed;
}

/**
 * R-92 : ce que l'état filtré diffuse pour la ressource d'une case explorée —
 * l'id réel si l'identité est connue, le marqueur « inconnue » sinon
 * (masquage actif), null si la case est sans ressource.
 */
export function filteredResource(
  res: ResourceData | null,
  techsUnlocked: readonly string[],
): TileResource | null {
  if (!res) return null;
  return resourceIdentified(res, techsUnlocked) ? res.id : RESOURCE_UNKNOWN;
}

/** Bonus effectif d'une ressource pour ce joueur (R-93) : les `yields` si
 *  accessible, zéro sinon. Nul pour une case sans ressource — et pour le
 *  marqueur « inconnue » (absent de la table, jamais de bonus).
 *  7n · R-149 : `bypassTech` (Inde — accès immédiat à toutes les ressources). */
export function resourceBonus(
  res: ResourceData | null,
  techsUnlocked: readonly string[],
  bypassTech = false,
): Yields | null {
  if (!res || !resourceAccessible(res, techsUnlocked, bypassTech)) return null;
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

/**
 * CULTURE-RESSOURCES (décision d'Erik du 02/10) · Culture DIRECTE des
 * ressources culturelles TRAVAILLÉES d'une ville (Encens +2, Soie +3 —
 * canal générique `culture > 0`, miroir EXACT de `cityEconomyInputs` :
 * workedTiles seuls, centre-ville exclu comme l'or direct R-134 ;
 * accessibilité R-93, `bypassTech` = trait Indien R-149). Pur — source
 * unique partagée moteur (turn.ts) et UI (miroirs CityView/PanneauVille).
 */
export function cultureRessourcesTravaillees(
  map: Readonly<Record<string, { resource?: string | null } | undefined>>,
  workedTiles: readonly string[],
  techsUnlocked: readonly string[],
  bypassTech = false,
): number {
  let culture = 0;
  for (const key of workedTiles) {
    const res = map[key]?.resource;
    const resData = res ? RESOURCES[res as keyof typeof RESOURCES] : undefined;
    if (!resData) continue;
    if (resData.culture && resourceAccessible(resData, techsUnlocked, bypassTech)) culture += resData.culture;
  }
  return culture;
}
