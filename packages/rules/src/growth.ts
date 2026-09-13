/**
 * 7i · Croissance démographique & citoyens intérieurs — RULES.md R-63 (rév.)
 * / R-60bis / R-64 (rév.), données growth.json (calibrage sans code).
 *
 * ALIGNEMENT-CROISSANCE (partie réelle d'Erik du 13/09 — valeurs faites foi) :
 *  - AUCUN citoyen ne consomme de nourriture : le surplus alimentaire = la
 *    nourriture produite, point (la consommation 7i D1 est abrogée) ;
 *  - seuils de croissance LINÉAIRES 10 × population ACTUELLE (table
 *    `growthThresholds` indexée par la population actuelle : « 2 »: 20,
 *    « 3 »: 30, …, « 31 »: 310 ; ancres Erik : 2→3 = 20, 3→4 = 30) ;
 *    plafond absolu `populationCap` = 31 ;
 *  - la CASE DE VILLE ne rapporte RIEN (0/0/0 — terrain.json, le socle
 *    CENTREVILLE R-66 rév. 06/09 est abrogé).
 *
 * Historique 7i (partiellement abrogé) :
 *  - D2 : seuils NON LINÉAIRES (courbe exponentielle 🔶 5 × 1,25^(n−2)) ;
 *  - D3 : population initiale d'une ville fondée selon l'ÈRE de l'empire
 *    (ère = la plus avancée des technologies débloquées) ;
 *  - D4 : les citoyens non affectés au terrain deviennent ouvriers
 *    intérieurs au centre-ville, rendement par tranche démographique
 *    (table `interiorCitizens`).
 *
 * Fonctions PURES et déterministes.
 */
import growthJson from './data/growth.json' with { type: 'json' };
import type { TechEra } from './types.js';

/** Données de croissance (growth.json — R-63 rév./R-60bis, calibrage 🔶). */
export interface GrowthData {
  populationCap: number;
  founderPopByEra: Record<TechEra, number>;
  /** Seuil de nourriture cumulée pour passer de la population clé à la
   *  suivante : seuil(pop) = 10 × pop (ALIGNEMENT-CROISSANCE, Erik 13/09). */
  growthThresholds: Record<string, number>;
  /** Tranches démographiques des citoyens intérieurs (D4 — R-60bis). */
  interiorCitizens: Array<{ minPop: number; maxPop: number; label: string; production: number; commerce: number }>;
}

export const GROWTH: GrowthData = growthJson as unknown as GrowthData;

/** Ordre croissant des ères (champ `era` de techs.json). */
const ERA_ORDER: TechEra[] = ['ancienne', 'medievale', 'industrielle', 'moderne'];

/** D3 · Ère de l'empire = la PLUS AVANCÉE des technologies débloquées. */
export function techEraOf(techsUnlocked: readonly string[]): TechEra {
  let best: TechEra = 'ancienne';
  for (const era of ERA_ORDER) {
    if (techsUnlocked.some((t) => techEraOfCache(t) === era)) best = era;
  }
  return best;
}

// Table technique -> era construite une fois (import paresseux évité : les
// techs sont chargées par data.ts ; ici on lit le JSON directement pour
// garder ce module sans dépendance cyclique).
import techsJson from './data/techs.json' with { type: 'json' };
const TECH_ERAS: Record<string, TechEra> = Object.fromEntries(
  Object.values(techsJson as Record<string, { id: string; era: TechEra }>).map((t) => [t.id, t.era]),
);
function techEraOfCache(techId: string): TechEra | undefined {
  return TECH_ERAS[techId];
}

/** D3 · Population initiale d'une ville fondée (ère de l'empire).
 *  7n · R-147 : l'ère est le COMPTAGE de techs (champ joueur `era` persisté —
 *  transition au tour suivant) ; `foundingPopForEra` est la voie moteur.
 *  `foundingPopFor` (techs) reste exporté pour compat UI/tests. */
export function foundingPopForEra(era: TechEra): number {
  return GROWTH.founderPopByEra[era] ?? 2;
}

/** D3 · Population initiale (dérivée des techs — compat, hors moteur). */
export function foundingPopFor(techsUnlocked: readonly string[]): number {
  return GROWTH.founderPopByEra[techEraOf(techsUnlocked)] ?? 2;
}

/** D2 · Plafond absolu de population (31). */
export function populationCap(): number {
  return GROWTH.populationCap;
}

/**
 * D2 · Seuil de croissance pour passer de `pop` à `pop + 1` — table
 * `growthThresholds` indexée par la population ACTUELLE (seuil = 10 × pop,
 * ALIGNEMENT-CROISSANCE), modulée par la réduction de seuil (Aqueduc, R-63).
 * `null` au plafond (31) : plus de croissance, jamais.
 */
export function growthThresholdFor(pop: number, reduction = 0): number | null {
  const target = pop + 1;
  if (target > GROWTH.populationCap) return null;
  const base = GROWTH.growthThresholds[String(pop)];
  if (base === undefined) return null;
  return Math.max(1, Math.round(base * (1 - reduction)));
}

/**
 * ALIGNEMENT-CROISSANCE (M3) · Helper PUR pour l'UI (CityPanel, futur
 * MENU-VILLE) : nombre de tours avant croissance au rythme `surplusPerTurn`
 * (surplus = nourriture produite — aucune consommation). `null` au plafond
 * ou sans surplus ; 0 si le seuil est déjà atteint.
 */
export function toursAvantCroissance(
  pop: number,
  foodStored: number,
  surplusPerTurn: number,
  reduction = 0,
): number | null {
  const threshold = growthThresholdFor(pop, reduction);
  if (threshold === null || surplusPerTurn <= 0) return null;
  if (foodStored >= threshold) return 0;
  return Math.ceil((threshold - foodStored) / surplusPerTurn);
}

/**
 * D4 · R-60bis · Citoyen intérieur : tranche démographique de la ville —
 * rendement PAR citoyen non affecté au terrain (centre-ville).
 */
export function interiorCitizenFor(pop: number): { label: string; production: number; commerce: number } {
  for (const tier of GROWTH.interiorCitizens) {
    if (pop >= tier.minPop && pop <= tier.maxPop) return tier;
  }
  const last = GROWTH.interiorCitizens[GROWTH.interiorCitizens.length - 1]!;
  return last;
}

/** Nombre de citoyens intérieurs de la ville (pop non affectée au terrain). */
export function interiorCountOf(pop: number, workedCount: number): number {
  return Math.max(0, pop - workedCount);
}
