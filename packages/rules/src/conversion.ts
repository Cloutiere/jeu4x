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
import { BUILDINGS } from './data.js';
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
 * 7e · Multiplicateurs de conversion portés par les bâtiments (data-driven :
 * `scienceMult` / `goldMult` de buildings.json). Le meilleur multiplicateur
 * présent gagne (le remplacement Banque/Marché rend le cumul improbable mais
 * la règle reste totale). Défaut ×1 ; Bibliothèque ×1,5 ; Université ×4 ;
 * Marché ×2 ; Banque ×4.
 */
export function scienceMultOf(buildings: string[]): number {
  let m = 1;
  for (const id of buildings) m = Math.max(m, BUILDINGS[id]?.scienceMult ?? 1);
  return m;
}

export function goldMultOf(buildings: string[]): number {
  let m = 1;
  for (const id of buildings) m = Math.max(m, BUILDINGS[id]?.goldMult ?? 1);
  return m;
}

/**
 * R-90/R-88 : gains or/science d'une ville pour un commerce total `C`.
 * 7e : les multiplicateurs sont désormais lus des données (Marché ×2 or,
 * Banque ×4 or, Université ×4 science). Le comportement Bibliothèque validé
 * par Erik reste EXACT : science ×1,5 en conversion science ; en conversion
 * or, +max(1 ; round(C × 0,2)) science tant que la Bibliothèque est présente
 * (elle disparaît avec l'Université qui la remplace).
 * Source unique partagée par le moteur (Phase C) et l'UI (panneau + carte).
 */
export interface ConversionGovOptions {
  /** 7h · R-121 · Fondamentalisme : science des Bibliothèques/Universités = 0. */
  zeroLibraryScience?: boolean;
  /** 7h · R-121 · Démocratie : +50 % or/science de toutes les villes (avant répartition). */
  goldMult?: number;
  scienceMult?: number;
}

export function conversionGains(
  commerce: number,
  conversion: Conversion,
  buildings: string[],
  gov: ConversionGovOptions = {},
): { gold: number; science: number } {
  const sciMult = gov.zeroLibraryScience ? 1 : scienceMultOf(buildings);
  if (conversion === 'science') {
    return { gold: 0, science: Math.round(commerce * sciMult * (gov.scienceMult ?? 1)) };
  }
  const science = !gov.zeroLibraryScience && hasLibrary(buildings) ? Math.max(1, Math.round(commerce * 0.2)) : 0;
  return {
    gold: Math.round(commerce * goldMultOf(buildings) * (gov.goldMult ?? 1)),
    science: Math.round(science * (gov.scienceMult ?? 1)),
  };
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
