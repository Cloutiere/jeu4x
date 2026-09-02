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
  /** R-87 : technologie requise pour la produire (null/absent = disponible d'office). */
  tech?: string | null;
  /** R-87/Phase 7a : données seules (Espion, Galère) — non constructibles en v1. */
  implemented?: boolean;
  /** Unité navale (Galère — Phase 7) : se déplace sur l'eau. */
  aquatic?: boolean;
}

export type TerrainId =
  | 'prairie'
  | 'plaine'
  | 'foret'
  | 'colline'
  | 'montagne'
  | 'desert'
  | 'eau'
  | 'ocean'
  | 'ville';

/** Hook naval (Phase 6c, mécanique active en Phase 7) : classe d'eau du
 *  terrain. L'unité navale portera le même champ (Galère = "coast", Galion =
 *  "ocean") et entrera dans une case d'eau si terrain.navalAccess === "coast"
 *  OU unité.navalAccess === "ocean" — décision d'Erik du 02/09. */
export type NavalAccess = 'coast' | 'ocean';

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
  /** Hook naval : présent UNIQUEMENT sur les terrains d'eau (Mer = coast,
   *  Océan = ocean) — sert aussi de prédicat « est de l'eau » (data-driven). */
  navalAccess?: NavalAccess;
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
  /** R-87 : technologie requise pour le construire (null = disponible d'office). */
  tech: string | null;
  /** Phase 7b : libellé d'effet pour l'UI (Bibliothèque R-88, Caserne R-89) —
   *  absent pour les bâtiments à bonus de terrain (libellé dérivé). */
  effect?: string;
}

/** R-86 · Technologie (techs.json) — base relationnelle embarquée. */
export interface TechData {
  id: string;
  name: string;
  /** Coût de recherche 🔶 (R-86 : 20/20/20/20/30/30/40/40/50). */
  cost: number;
  /** Technologies requises (ids existants — vérifié par tests d'intégrité). */
  prereqs: string[];
  unlocks: { units: string[]; buildings: string[]; wonders: string[] };
}

/** R-86 · Merveille en données (non constructible en 7a — implemented: false). */
export interface WonderData {
  id: string;
  name: string;
  implemented: boolean;
}

// ---------------------------------------------------------------------------
// Barbares & huttes — Phase 7d (RULES.md §7.9, R-95..R-99)
// ---------------------------------------------------------------------------

/** R-95/R-99 · Configuration barbares (barbares.json) — calibrage par édition. */
export interface BarbariansData {
  /** Id du pseudo-joueur barbare (R-95) — exporté aussi en `BARBARIAN_ID`. */
  barbarianId: string;
  /** T-18 · Un village engendre une unité toutes les N résolutions (R-96). */
  spawnInterval: number;
  /** T-19 · Rayon d'aggro de l'IA barbare (R-97). */
  aggroRadius: number;
  /** T-20 · Or de destruction d'un village (R-96). */
  villageDestructionGold: number;
  /** T-21 · PV d'un village (R-96). */
  villageHP: number;
  /** 🔶 Force défensive d'un village dans les rounds R-51 (interprétation
   *  documentée : le village subit les rounds sans riposter — attaque 0). */
  villageDefense: number;
  /** T-22 · Cap d'unités vivantes engendrées par village (R-96). */
  capPerVillage: number;
  /** T-23 · Escalade : type « escalated » après ce tour (R-95). */
  escalationTurn: number;
  /** R-95 · Unités d'engendrement (escalation). */
  units: { initial: string; escalated: string };
}

/** R-98 · Nature d'une récompense de hutte. */
export type HutRewardKind = 'gold' | 'unit' | 'science' | 'reveal' | 'ambush' | 'nothing';

/** R-98/R-99 · Entrée pondérée de la table de récompenses (huttes.json). */
export interface HutRewardDef {
  kind: HutRewardKind;
  weight: number;
  /** kind 'gold' : bornes du tir uniforme (T-25/T-26). */
  amountMin?: number;
  amountMax?: number;
}

/** R-98/R-99 · Configuration huttes (huttes.json) — calibrage par édition. */
export interface HuttesData {
  /** T-24 · Boost de science sur la recherche courante (R-85). */
  scienceBoost: number;
  /** Rayon de révélation de carte (R-98). */
  revealRadius: number;
  /** Barbares engendrés par une embuscade (R-98). */
  ambushCount: number;
  /** Unité gratuite (R-98). */
  freeUnit: string;
  /** Table pondérée — tir au RNG seedé (R-80), somme des poids > 0. */
  rewards: HutRewardDef[];
}

/**
 * R-92 (D1 révisée le 01/09/2026) : marqueur diffusé à la place de l'id réel
 * quand l'identité d'une ressource est masquée (tech non débloquée,
 * `hiddenUntilRevealed: true`). JAMAIS persisté : posé uniquement par
 * `getFilteredState` sur la copie diffusée, consommé par l'UI (icône « ? »).
 */
export const RESOURCE_UNKNOWN = 'inconnue';

/** Ressource portée par une case : id de resources.json ou marqueur « inconnue ». */
export type TileResource = ResourceId | typeof RESOURCE_UNKNOWN;

/** R-91 · Ressource (resources.json) — base relationnelle embarquée (RULES.md §8.3).
 *  Tout est éditable en données : déplacer Gemmes de montagne à colline = éditer
 *  `terrains`, rien d'autre. */
export type ResourceId =
  | 'aluminium'
  | 'betail'
  | 'ble'
  | 'baleine'
  | 'boeufs'
  | 'caoutchouc'
  | 'charbon'
  | 'chene'
  | 'encens'
  | 'epices'
  | 'fer'
  | 'gemmes'
  | 'gibier'
  | 'or'
  | 'marbre'
  | 'petrole'
  | 'poisson'
  | 'soie'
  | 'soufre'
  | 'teinture'
  | 'uranium'
  | 'vin';

export interface ResourceData {
  id: ResourceId;
  name: string;
  /** Terrains d'apparition autorisés (validation à la pose et au chargement de carte, R-94). */
  terrains: TerrainId[];
  /** Bonus de rendement ajouté au rendement du terrain quand la case est
   *  travaillée par une ville dont le propriétaire a accès (R-93). D3 :
   *  Gemmes/Or mappés commerce. */
  yields: Yields;
  /** R-92/D1 : technologie exigée (accès au bonus + visibilité si
   *  `hiddenUntilRevealed`). null = visible et active d'office (D4). */
  revealedByTech: string | null;
  /** Documentaire (jamais lu par le moteur) : tech CivRev officielle quand
   *  notre base ne l'a pas encore (D4) — l'activation future = édition JSON. */
  officialTech: string | null;
  /** D2 : réservé — non lu par le moteur tant que la culture n'est pas actée
   *  (valeurs officielles : Encens 2, Soie 3). */
  culture: number | null;
  /** R-92/D1 : si true et `revealedByTech` non null, l'icône est masquée au
   *  joueur tant que la tech manque ; si false, affichage CivRev-fidèle
   *  (visible, bonus verrouillé). */
  hiddenUntilRevealed: boolean;
  /** Réservé 6b (génération procédurale) : poids de pose par case de terrain
   *  compatible ; null = posée uniquement par placement explicite (R-94). */
  spawnWeight: number | null;
}

/** Entité combattante au sens de la formule de combat (unité ou armée vue comme un tout). */
export interface Combatant {
  attack: number;
  defense: number;
  hp: number;
  veteran: boolean;
}
