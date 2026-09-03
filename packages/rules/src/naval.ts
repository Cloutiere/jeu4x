/**
 * Naval & transport — Phase 7g (RULES.md §8.6, R-117/R-118).
 *
 * Fonctions PURES et déterministes (R-81/R-82), source unique partagée par le
 * moteur (turn.ts) et l'UI (production côtière, indicateur naval).
 *
 * Rappel des conventions 7g (décisions d'Erik) :
 *  - l'eau est praticable pour les unités `aquatic` uniquement (T-11 inchangé
 *    pour les terrestres) — Galère : côte seule, Galion/Croiseur/Cuirassé/
 *    Sous-marin : côte ET océan (hook naval R-107) ;
 *  - Galère/Galion transportent 1 unité terrestre (`cargoCapacity`) ;
 *  - le soutien naval (R-118) s'ajoute à S_att (MAX d'un seul navire adjacent).
 */
import { neighbors, tileKeyOf } from './hex.js';
import type { Hex } from './hex.js';
import { TERRAINS, isWaterTerrain, unitType } from './data.js';
import type { TerrainId, UnitTypeData } from './types.js';

/** Carte minimale vue par les prédicats de terrain (état complet ou filtré). */
export type NavalMap = Readonly<Record<string, { terrain: TerrainId } | undefined>>;

/**
 * R-107/R-117 · L'unité peut-elle ENTRER sur cette case d'après le TERRAIN
 * seul (l'occupation est vérifiée ailleurs) ? Une unité navale entre sur
 * l'eau selon sa classe (`navalAccess`) et sur la case d'une ville PORTUAIRE
 * (adjacente à l'eau) — jamais sur un terrain terrestre. Une unité terrestre
 * reste limitée aux terrains `passable` (T-11 inchangé).
 */
export function canEnterTerrain(
  stats: UnitTypeData,
  terrain: TerrainId,
  isCoastalCityHex: boolean,
): boolean {
  if (stats.aquatic) {
    const access = TERRAINS[terrain]?.navalAccess;
    if (access) return access === 'coast' || stats.navalAccess === 'ocean';
    if (terrain === 'ville') return isCoastalCityHex;
    return false;
  }
  return !!TERRAINS[terrain]?.passable;
}

/** R-117 · La case hex porte-t-elle une ville côtière (adjacente à l'eau) ? */
export function isCoastalCityHex(map: NavalMap, hex: Hex): boolean {
  if (map[tileKeyOf(hex)]?.terrain !== 'ville') return false;
  return neighbors(hex).some((h) => {
    const t = map[tileKeyOf(h)]?.terrain;
    return !!t && isWaterTerrain(t);
  });
}

/** R-117 · La ville produite depuis cette case est-elle côtière (accès mer) ? */
export function citySiteIsCoastal(map: NavalMap, hex: Hex): boolean {
  return neighbors(hex).some((h) => {
    const t = map[tileKeyOf(h)]?.terrain;
    return !!t && isWaterTerrain(t);
  });
}

/**
 * R-117 · Capacité de transport de l'ENTITÉ : une armée navale (R-31) ne
 * transporte rien (interprétation documentée), un type sans `cargoCapacity`
 * non plus.
 */
export function cargoCapacityOf(unit: { type: string; isArmy: boolean }): number {
  if (unit.isArmy) return 0;
  return unitType(unit.type).cargoCapacity ?? 0;
}

/** Entité vue par navalSupportFor (position + propriétaire + état de bord). */
export interface SupportUnitRef {
  owner: string;
  type: string;
  q: number;
  r: number;
  aboard: string | null;
}

/**
 * R-118 · Soutien naval d'un combat TERRESTRE : le MEILLEUR `navalSupport`
 * des unités navales AMIES (propriétaire de l'attaquant, non embarquées) sur
 * une case d'EAU adjacente à la case de combat (« en mer » — un navire dans
 * un port ne soutient pas). Un seul navire compte (MAX — pas de cumul 🔶,
 * interprétation documentée). 0 si l'attaquant est naval (le navire est
 * lui-même l'attaquant) ou aucune amie adjacente en mer.
 * `unitAt(hex)` fournit l'entité de carte posée sur une case (null si vide) —
 * injection pour rester pur sans dépendre du GameState complet.
 */
export function navalSupportFor(
  map: NavalMap,
  attackerStats: UnitTypeData,
  attackerOwner: string,
  combatTile: Hex,
  unitAt: (hex: Hex) => SupportUnitRef | undefined,
): number {
  if (attackerStats.aquatic) return 0;
  let best = 0;
  for (const hex of neighbors(combatTile)) {
    const t = map[tileKeyOf(hex)]?.terrain;
    if (!t || !isWaterTerrain(t)) continue; // « en mer » : pas depuis un port
    const u = unitAt(hex);
    if (!u || u.owner !== attackerOwner || u.aboard) continue;
    const stats = unitType(u.type);
    if (!stats.aquatic || !stats.navalSupport) continue;
    best = Math.max(best, stats.navalSupport);
  }
  return best;
}
