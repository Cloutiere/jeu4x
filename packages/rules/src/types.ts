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
  /** R-87/Phase 7a : données seules (Espion, Galère…) — non constructibles en v1. */
  implemented?: boolean;
  /** Unité navale (Galère — Phase 7) : se déplace sur l'eau. */
  aquatic?: boolean;
  /** Hook naval (Phase 6c) : classe d'eau de l'unité (Galère = "coast", Galion = "ocean"). */
  navalAccess?: NavalAccess;
  /** 7e · Soutien naval (mécanique en 7g) : valeur ajoutée à l'attaque d'un
   *  combat terrestre côtier adjacent (Galion 15, Croiseur 35, Cuirassé 65). */
  navalSupport?: number;
  /** 7e · Unité aérienne (Chasseur, Bombardier — mécaniques 7g+). */
  aerial?: boolean;
  /** 7e · Population consommée par la ville à la production (Colon : 2 —
   *  comportement officiel CivRev adopté par Erik le 02/09). */
  populationCost?: number;
  /** 7e · Ligne d'amélioration (documentaire — surclassement auto différé). */
  upgradeTo?: string;
  /** 7f · Personnage illustre (R-114) : unité pacifique engendrée par la
   *  culture (Artiste/Penseur) — JAMAIS produite par les files (moteur, UI
   *  et bot l'excluent) ; installable dans une ville (R-115). */
  greatPerson?: boolean;
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

/** R-66 · Bâtiment d'amélioration des terrains (data-driven : buildings.json).
 *  7e : effets de ville structurés (multiplicateurs or/science/production,
 *  défense de ville, seuil de croissance) + `requiresBuilding`/`replaces`
 *  (Banque ← Marché, Université ← Bibliothèque, Cathédrale ← Temple). */
export interface BuildingData {
  id: string;
  name: string;
  /** Coût de production 🔶 (7e : coûts exacts CivFanatics — Temple 40, …). */
  cost: number;
  /** R-60/R-66 : extension du rayon de travail (Tribunal : 1 → total 2). */
  workRadiusBonus: number;
  /** Bonus appliqué à CHAQUE case travaillée du terrain ciblé par cette ville.
   *  null = pas de bonus par case (Tribunal). */
  tileBonus: { terrain: TerrainId } & Yields | null;
  /** R-87 : technologie requise pour le construire (null = disponible d'office). */
  tech: string | null;
  /** 7e : bâtiment préalable exigé DANS LA VILLE (Banque exige un Marché…). */
  requiresBuilding?: string;
  /** 7e : bâtiment RETIRÉ de la ville quand celui-ci est construit (remplacement). */
  replaces?: string;
  /** 7e : non constructible via la file de production (Palais — posé par le moteur). */
  fixed?: boolean;
  /** 7e : données seules, non constructible (composants du Vaisseau spatial). */
  implemented?: boolean;
  /** 7e · Défense de ville : s'ajoute au bonus de la case de ville (T-02) dans
   *  S_def du défenseur en garnison (Palais +50 %, Remparts +100 %). */
  cityDefenseBonus?: number;
  /** 7e · Multiplicateur d'or (Marché ×2, Banque ×4 — conversion or). */
  goldMult?: number;
  /** 7e · Multiplicateur de science (Bibliothèque ×1,5, Université ×4). */
  scienceMult?: number;
  /** 7e · Multiplicateur de production de la ville (Usine ×2). */
  productionMult?: number;
  /** 7e · Réduction du seuil de croissance (Aqueduc : 0.33 — R-63 🔶). */
  growthThresholdReduction?: number;
  /** 7e · Culture par citoyen et par tour (Temple 1, Cathédrale 2) — INACTIF
   *  tant que le moteur culturel n'existe pas (7f), libellé visible. */
  culturePerCitizen?: number;
  /** 7f · Culture FLAT par tour (Palais : 1 — capitale uniquement). */
  culturePerTurn?: number;
  /** Phase 7b : libellé d'effet pour l'UI — absent pour les bâtiments à bonus
   *  de terrain (libellé dérivé). */
  effect?: string;
}

/** Ères de l'arbre technologique (7e — utile à l'UI). */
export type TechEra = 'ancienne' | 'medievale' | 'industrielle' | 'moderne';

/** 7e · Bonus de ville par tour du Premier découvreur (R-105bis 🔶). La
 *  culture est portée en données mais ignorée par le moteur (7f). */
export interface PerCityBonus {
  gold?: number;
  science?: number;
  production?: number;
  commerce?: number;
  /** 7f · Volet culture du Premier découvrir ACTIVÉ (R-109/R-113 : Religion,
   *  Imprimerie +1). */
  culture?: number;
  population?: number;
}

/** 7e · Réduction de coût empire du Premier découvreur (Communisme : Usines
 *  −33 % ; Réseautage : Universités −50 %). */
export interface CostDiscount {
  building: string;
  /** Fraction du coût retirée (0.33 = −33 %). */
  pct: number;
}

/** 7e · Récompense du Premier découvreur (CivRev « First to Discover ») —
 *  décrite en données ; le moteur applique les champs qu'il sait traiter
 *  (unité/bâtiment gratuit, or, population instantanée, perCity, remises,
 *  révélation de carte) et ignore `implemented: false` (Personnages illustres
 *  7h, unités non implémentées). */
export interface FirstToDiscoverData {
  /** Libellé UI. */
  label: string;
  unit?: string;
  building?: string;
  /** Or immédiat au trésor (Banque 100, Mondialisation 500). */
  gold?: number;
  /** +X population DANS TOUTES les villes, instantané (Irrigation, Médias). */
  population?: number;
  /** Bonus par ville et par tour, cumulatif entre techs (Littératie +1 science…). */
  perCity?: PerCityBonus;
  /** Réductions de coût empire (Communisme, Réseautage). */
  discounts?: CostDiscount[];
  /** Toute la carte est révélée (Vol spatial). */
  mapReveal?: boolean;
  /** Personnage illustre (7h) — récompense décrite, non appliquée. */
  greatPerson?: boolean;
  /** Récompense non applicable en l'état (unité non implémentée, grands hommes). */
  implemented?: boolean;
}

/** R-86 · Technologie (techs.json) — base relationnelle embarquée (7e : arbre
 *  complet à 46 technologies, source « Technologies et Déblocages » d'Erik). */
export interface TechData {
  id: string;
  name: string;
  /** Coût de recherche 🔶 (7e : coûts exacts 20 → 6740). */
  cost: number;
  /** Ère (UI de l'arbre). */
  era: TechEra;
  /** Technologies requises (ids existants — vérifié par tests d'intégrité). */
  prereqs: string[];
  unlocks: { units: string[]; buildings: string[]; wonders: string[] };
  /** 7e · Récompense du Premier découvrir (données). */
  firstToDiscover?: FirstToDiscoverData;
  /** 7e · Unités rendues OBSOLÈTES par cette tech (retirées du menu de
   *  production ; unités existantes conservées — surclassement différé). */
  obsoleteUnits?: string[];
  /** 7e · Merveilles rendues obsolètes (données — effets en 7f/7h). */
  obsoleteWonders?: string[];
}

/** R-86 · Merveille en données. 7f : les merveilles à effets simples sont
 *  ACTIVÉES (`implemented: true`) et portent leurs effets en champs
 *  data-driven ; les autres restent en données (7h : gouvernements, combat,
 *  découvertes). */
export interface WonderData {
  id: string;
  name: string;
  /** Coût de production (T-28 pour les Nations Unies : 300 🔶). */
  cost?: number;
  /** Technologie requise (null = condition spéciale ou disponible d'office). */
  tech?: string | null;
  /** Tech qui rend la merveille obsolète (données — R-110). */
  obsoleteBy?: string;
  /** 7f · Multiplicateur de la culture « Temple/Cathédrale » de la ville
   *  (Stonehenge ×1,5 🔶 — R-113). */
  templeCultureMult?: number;
  /** 7f · Multiplicateur du commerce brut de la ville hôte (Colosse ×2 —
   *  avant la conversion or/science R-90). */
  commerceMult?: number;
  /** 7f · Gain de population immédiat à la complétion (Jardins : 0,5 =
   *  +50 %, arrondi au plus proche). */
  populationGainPct?: number;
  /** 7f · Complétion = Victoire culturelle (R-116 — Nations Unies). */
  cultureVictory?: boolean;
  /** Libellé d'effet (UI — actif en 7f/7h). */
  effect?: string;
  implemented: boolean;
}

/** 7f · Constantes culturelles (culture.json) — calibrage par édition (R-99). */
export interface CultureData {
  /** T-27 · Seuil de culture par ville pour engendrer un GP (base). */
  greatPersonThresholdBase: number;
  /** T-27 · Le seuil est MULTIPLIÉ par ce facteur à chaque GP obtenu par l'empire. */
  greatPersonThresholdGrowth: number;
  /** Jalons culturels requis pour les Nations Unies (et la victoire). */
  milestonesTarget: number;
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
  /** Phase 6c (demande d'Erik) : tirage supplémentaire FORCÉ pour cette
   *  ressource sur le terrain donné — en MULTIPLE de la probabilité de base
   *  de la classe de terrain (terre 1/12, eau 1/48 🔶 × densité). Ex. :
   *  poisson { eau: 1.5 } ≈ présence ×4 sur les côtes. Absent = aucun. */
  extraSpawnScale?: Partial<Record<TerrainId, number>>;
}

/** Entité combattante au sens de la formule de combat (unité ou armée vue comme un tout). */
export interface Combatant {
  attack: number;
  defense: number;
  hp: number;
  veteran: boolean;
}
