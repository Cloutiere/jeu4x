/**
 * FUSION-MENU-VILLE (décisions d'Erik du 14/09) — jauges de la vue ville,
 * pures et testées. AUCUN calcul nouveau : chaque jauge lit les mêmes
 * sources de vérité moteur que l'ancien CityPanel (`growthThresholdFor`
 * R-63 — 10 × pop actuelle, `greatPersonThresholdFor` paliers T-27) et
 * borne le remplissage [0, 1] pour le style `width: x%`.
 */
import { growthThresholdFor, greatPersonThresholdFor } from '@game/rules';

/** Nourriture : réserve vs seuil de croissance (R-63 — 10 × pop ACTUELLE,
 *  réduction Aqueduc/Zoulous appliquée). Au plafond (31), seuil 0 → jauge pleine. */
export function jaugeCroissance(
  pop: number,
  foodStored: number,
  reduction: number,
): { seuil: number; ratio: number; plafond: boolean } {
  const seuil = growthThresholdFor(pop, reduction) ?? 0;
  const plafond = seuil === 0;
  const ratio = plafond ? 1 : Math.max(0, Math.min(1, foodStored / seuil));
  return { seuil, ratio, plafond };
}

/** Culture : cumul EMPIRE (Σ cultureCumulee, jamais soustrait — GP-CULTURE-EVENEMENTS)
 *  vers le PROCHAIN palier T-27 (index = culturePaliers). */
export function jaugeCulture(
  cultureCumuleeEmpire: number,
  culturePaliers: number,
): { seuil: number; ratio: number } {
  const seuil = greatPersonThresholdFor(culturePaliers);
  return { seuil, ratio: Math.max(0, Math.min(1, cultureCumuleeEmpire / seuil)) };
}

/** Construction : marteaux investis / coût de l'item en file. Coût infini
 *  (item inconnu) → jauge vide honnête. */
export function jaugeProduction(progress: number, cost: number): number {
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return Math.max(0, Math.min(1, progress / cost));
}
