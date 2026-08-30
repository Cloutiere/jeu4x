/** Types de base du moteur de règles. S'étendront au GameState complet (Phase 2). */

export interface UnitTypeData {
  id: string;
  name: string;
  attack: number;
  defense: number;
  movement: number;
  hpMax: number;
  cost: number;
  visionRadius: number;
  canAttack: boolean;
  canFoundCity: boolean;
  /** R-59 : attaque depuis sa case, sans avancée, sans riposte de mêlée. */
  isRanged: boolean;
}

export type TerrainId =
  | 'prairie'
  | 'plaine'
  | 'foret'
  | 'colline'
  | 'montagne'
  | 'desert'
  | 'eau'
  | 'ville';

/** Rendements d'une case (RULES.md §2 révision 30/08). C = commerce : matière
 *  première répartie entre or et science par le curseur global (R-61). */
export interface Yields {
  food: number;
  production: number;
  commerce: number;
}

export interface TerrainData {
  id: TerrainId;
  name: string;
  /** Bonus défensif décimal (0.25 = +25 %), appliqué au défenseur. */
  defenseBonus: number;
  passable: boolean;
  /** Rendements de base (RULES.md §2). Absent = aucune récolte. */
  yields?: Yields;
}

/** R-66 · Bâtiment d'amélioration des terrains (data-driven : buildings.json). */
export interface BuildingData {
  id: string;
  name: string;
  /** Coût de production 🔶 (R-66 : 20/30/40/30/30/40). */
  cost: number;
  /** R-60/R-66 : extension du rayon de travail (Tribunal : 1 → total 2). */
  workRadiusBonus: number;
  /** Bonus appliqué à CHAQUE case travaillée du terrain ciblé par cette ville.
   *  null = pas de bonus par case (Tribunal). */
  tileBonus: { terrain: TerrainId } & Yields | null;
}

/** Entité combattante au sens de la formule de combat (unité ou armée vue comme un tout). */
export interface Combatant {
  attack: number;
  defense: number;
  hp: number;
  veteran: boolean;
}
