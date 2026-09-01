/**
 * Conversion du commerce des villes — Phase 7b (RULES.md §8.2, décisions
 * d'Erik du 01/09/2026).
 *
 * R-90 révisée : chaque ville convertit la TOTALITÉ de son commerce en or ou
 * en science (choix binaire, par ville, défaut « or ») — amende R-61 : plus
 * de curseur global (player.scienceRatio déprécié, conservé pour compat).
 * R-88 : la Bibliothèque modifie la conversion de sa ville —
 *   - conversion science : science = round(C × 1,5), or = 0 ;
 *   - conversion or : or = C, science = max(1 ; round(C × 0,2)) — même à
 *     0 commerce, la ville à bibliothèque génère 1 science/tour.
 * Arrondi au plus proche (round half up), déterministe (Math.round).
 * R-89 : la Caserne rend les unités produites vétérans (hors Colon) —
 * appliquée dans le moteur (turn.ts, complétion de production).
 */
import type { CityId, GameState, PlayerId } from './state.js';

/** Choix de conversion du commerce d'une ville (R-90). */
export type Conversion = 'gold' | 'science';

/** Défaut pour une ville neuve et après capture (décision d'Erik : Or). */
export const CONVERSION_DEFAULT: Conversion = 'gold';

/** La ville possède-t-elle une Bibliothèque (R-88) ? */
export function hasLibrary(buildings: string[]): boolean {
  return buildings.includes('bibliotheque');
}

/**
 * R-90/R-88 : gains or/science d'une ville pour un commerce total `C`.
 * Source unique partagée par le moteur (Phase C) et l'UI (panneau + carte).
 */
export function conversionGains(
  commerce: number,
  conversion: Conversion,
  buildings: string[],
): { gold: number; science: number } {
  if (conversion === 'science') {
    const science = hasLibrary(buildings) ? Math.round(commerce * 1.5) : commerce;
    return { gold: 0, science };
  }
  const science = hasLibrary(buildings) ? Math.max(1, Math.round(commerce * 0.2)) : 0;
  return { gold: commerce, science };
}

export type SetConversionResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string };

/**
 * R-90 · SetConversion (action IMMÉDIATE, pure) : change la conversion
 * or/science d'une ville possédée. Comme SetResearch, c'est une action
 * immédiate hors ordres de tour (validée par le serveur à la réception,
 * visible en temps réel via Snapshot) — aucun événement de journal : la
 * valeur passe dans l'état. Répété = no-op accepté (idempotent).
 */
export function applySetConversion(
  input: GameState,
  playerId: PlayerId,
  cityId: CityId,
  target: Conversion,
): SetConversionResult {
  const st = structuredClone(input);
  const city = st.cities[cityId];
  if (!city) return { ok: false, reason: `ville inconnue : ${cityId}` };
  if (city.owner !== playerId) return { ok: false, reason: `ville ${cityId} non possédée` };
  if (target !== 'gold' && target !== 'science') {
    return { ok: false, reason: `conversion invalide : ${String(target)}` };
  }
  city.conversion = target;
  return { ok: true, state: st };
}
