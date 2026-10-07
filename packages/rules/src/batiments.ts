/**
 * Bâtiments — noyau partagé d'octroi GRATUIT (R-66/R-111).
 *
 * Extrait de turn.ts pour être réutilisable sans cycle : la production
 * (grantBuildingToCity du moteur) et les bonus « Premier découvrir »
 * (firstDiscovery.ts — BONUS-DECOUVERTE, décisions d'Erik du 07/10) partagent
 * EXACTEMENT les mêmes règles d'application :
 *  - R-66 : non duplicable — déjà dotée ⇒ rien (retour false) ;
 *  - R-111 : le bâtiment REMPLACÉ sort de la ville (jamais d'empilement) ;
 *  - `city.buildings` reste trié (R-81).
 *
 * Pur et déterministe : mute l'état de travail du moteur, jamais un état diffusé.
 */
import { BUILDINGS } from './data.js';
import type { City } from './state.js';

/** La ville possède-t-elle déjà ce bâtiment ? (R-66 : non duplicable) */
export function hasBuilding(city: City, id: string): boolean {
  return city.buildings.includes(id);
}

/**
 * Octroie un bâtiment GRATUIT à une ville (mêmes règles que la production :
 * R-66 déjà dotée ⇒ no-op, R-111 remplacement appliqué). Retourne false si
 * la ville était déjà dotée (le bâtiment est perdu — l'appelant décide de
 * l'annonce). L'émission de `BuildingCompleted` et la réassignation Tribunal
 * (rayon élargi) restent à l'appelant : elles dépendent de son contexte.
 */
export function accorderBatiment(city: City, buildingId: string): boolean {
  if (hasBuilding(city, buildingId)) return false; // R-66 : déjà dotée
  const replaced = BUILDINGS[buildingId]?.replaces;
  if (replaced && hasBuilding(city, replaced)) {
    city.buildings = city.buildings.filter((b) => b !== replaced);
  }
  city.buildings.push(buildingId);
  city.buildings.sort();
  return true;
}
