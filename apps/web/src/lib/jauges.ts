/**
 * FUSION-MENU-VILLE (décisions d'Erik du 14/09) — jauges de la vue ville,
 * pures et testées. AUCUN calcul nouveau : chaque jauge lit les mêmes
 * sources de vérité moteur que l'ancien CityPanel (`growthThresholdFor`
 * R-63 — 10 × pop actuelle, `greatPersonThresholdFor` paliers T-27) et
 * borne le remplissage [0, 1] pour le style `width: x%`.
 */
import { growthThresholdFor, greatPersonThresholdFor, rayonCulturelDe, CULTURE } from '@game/rules';

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

/**
 * Frontière culturelle D'UNE VILLE (retour d'Erik du 15/09) — progression de
 * sa culture CUMULÉE vers le PROCHAIN ANNEAU (R-162 : seuils 10/100/1 000/
 * 10 000, plafond 5 anneaux — `rayonCulturelDe`). La barre du PALIER T-27
 * (civilisation) n'est PAS ici : elle vit dans le menu d'empire.
 * Plafond atteint (tous les anneaux) → ratio 1, `prochainSeuil` null.
 */
export function jaugeFrontiereCulturelle(cultureCumuleeVille: number): {
  anneaux: number;
  prochainSeuil: number | null;
  ratio: number;
  plafond: boolean;
} {
  const table = CULTURE.cultureExpansionThresholds;
  const maxRings = CULTURE.cultureExpansionMaxRings;
  const anneaux = rayonCulturelDe(cultureCumuleeVille, table, maxRings);
  const prochainSeuil = anneaux < maxRings && anneaux < table.length ? table[anneaux]! : null;
  if (prochainSeuil === null) return { anneaux, prochainSeuil: null, ratio: 1, plafond: true };
  const precedent = anneaux > 0 ? table[anneaux - 1]! : 0;
  const ratio = Math.max(0, Math.min(1, (cultureCumuleeVille - precedent) / (prochainSeuil - precedent)));
  return { anneaux, prochainSeuil, ratio, plafond: false };
}
