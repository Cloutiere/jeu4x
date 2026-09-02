/**
 * Phase 6b L1 — Score de fertilité (PDF §MeasureStartPlacementFertilityOfPlot,
 * adapté aux rendements du moteur R-60).
 *
 * Formule (pseudocode du PDF, page 9) :
 *   score = Σ anneaux 1..3  poids_anneau × (food×2 + production×1.5)
 *   − pénalité par case de montagne ; bonus des ressources inclus.
 *
 * Adaptations signalées (voir settings.ts) :
 *  - le COMMERCE compte (×1) : chez nous il devient or/science (R-90) ;
 *  - pas de bonus d'eau douce : pas de rivières dans le moteur (hors périmètre) ;
 *  - la montagne EST travaillable chez nous (R-60, 1 production) : sa
 *    contribution nette est `rendement − pénalité 🔶` (le PDF : −10 sec).
 */
import { RESOURCES, TERRAINS } from '../data.js';
import { hexDistance, hexesWithinRadius, compareHex } from '../hex.js';
import type { Hex } from '../hex.js';
import type { ResourceId, TerrainId } from '../types.js';
import type { ProgenSettings } from './settings.js';

/** Accès terrain/ressource par case axiale (clé "q,r"). */
export interface TerrainLookup {
  terrainAt(hex: Hex): TerrainId | undefined;
  resourceAt(hex: Hex): ResourceId | null;
}

/** Contribution d'UNE case au score (rendement + ressource, pénalité montagne). */
export function tileFertility(terrain: TerrainId, resource: ResourceId | null, s: ProgenSettings): number {
  const t = TERRAINS[terrain]!;
  const y = t.yields ?? { food: 0, production: 0, commerce: 0 };
  let score =
    y.food * s.fertilityFoodWeight +
    y.production * s.fertilityProductionWeight +
    y.commerce * s.fertilityCommerceWeight;
  if (resource) {
    const r = RESOURCES[resource]!.yields;
    score +=
      r.food * s.fertilityFoodWeight +
      r.production * s.fertilityProductionWeight +
      r.commerce * s.fertilityCommerceWeight;
  }
  if (terrain === 'montagne') score -= s.fertilityMountainPenalty;
  return score;
}

/** Cases de l'anneau `ring` (distance exacte), triées (q, r) — R-81. */
export function ringCells(center: Hex, ring: number): Hex[] {
  if (ring <= 0) return [{ ...center }];
  return hexesWithinRadius(center, ring).filter((h) => hexDistance(center, h) === ring).sort(compareHex);
}

/** Score de fertilité d'une case candidate sur 3 anneaux concentriques. */
export function fertilityScore(lookup: TerrainLookup, center: Hex, s: ProgenSettings): number {
  const weights = s.fertilityRingWeights;
  let total = 0;
  for (let ring = 1; ring <= 3; ring++) {
    const weight = weights[ring - 1]!;
    for (const cell of ringCells(center, ring)) {
      const t = lookup.terrainAt(cell);
      if (t === undefined) continue; // hors carte (bord) : ignorée
      total += weight * tileFertility(t, lookup.resourceAt(cell), s);
    }
  }
  return total;
}
