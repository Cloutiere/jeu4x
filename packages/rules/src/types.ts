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
  /** 7g · R-117 : capacité de TRANSPORT d'unités terrestres (Galère/Galion :
   *  1 — décision d'Erik ; Croiseur/Cuirassé/Sous-marin : absent = 0). */
  cargoCapacity?: number;
  /** 7g · R-119 : l'unité est un Espion (missions d'infiltration R-119). */
  spy?: boolean;
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
  /** Coût de production (T-28 pour les Nations Unies : 500 — rév. 7l · C11). */
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
  /** 7l · R-137 · Complétion = Victoire économique (Banque mondiale).
   *  Interdite au rush-buy (R-135). */
  economicVictory?: boolean;
  /** 7l · R-137 · Trésorerie EXIGÉE (condition, jamais débitée) : la merveille
   *  est verrouillée et sa progression gelée tant que `treasury` est dessous. */
  treasuryRequired?: number;
  /** 7h · R-125 : +1 Attaque à toutes les unités de l'empire (Himeji). */
  attackBonusEmpire?: number;
  /** 7h · R-125 : accès à tous les régimes sans tech (Grande Pyramide). */
  allGovernments?: boolean;
  /** 7k · R-133 (audit — révision du modèle 7h 🔶) : +X culture/tour PAR
   *  CITOYEN à la ville hôte si elle possède le Tribunal (Magna Carta : 1 —
   *  le doc d'Erik tranche : « +1 de Culture par citoyen »). */
  tribunalCulturePerCitizen?: number;
  /** 7h · R-125 : révèle l'issue du combat avant confirmation (Oracle — UI). */
  battleForeknowledge?: boolean;
  // --- 7k · R-132 : effets des merveilles restantes (data-driven, valeurs du doc).
  /** Grande Bibliothèque : accorde toute tech découverte par ≥ 2 rivaux. */
  twoRivalsTechGrant?: boolean;
  /** Théâtre de Shakespeare : ×X la Culture TOTALE de la cité hôte. */
  cityCultureMult?: number;
  /** Université d'Oxford : une tech aléatoire seedée R-80 à la complétion. */
  randomTechOnComplete?: boolean;
  /** Cie des Indes : +X Commerce par case `ocean` travaillée par la cité. */
  oceanCommerceBonus?: number;
  /** Atelier de Léonard : met à niveau les unités obsolètes (R-111) à la complétion. */
  upgradeObsoleteUnits?: boolean;
  /** Foire de Troyes : ×X la part OR de la conversion R-90 de la cité (🔶). */
  cityGoldMult?: number;
  /** Complexe militaro-industriel : coût de production des unités militaires ×X (0.8 = −20 %). */
  militaryCostMult?: number;
  /** Internet : ×X la part OR de la conversion R-90 de TOUTES les villes de l'empire (🔶). */
  empireGoldMult?: number;
  /** Programme Apollo : accorde instantanément toute la technologie de l'arbre. */
  allTechsOnComplete?: boolean;
  /** Grande Muraille (décision d'Erik du 04/09, validée) : l'adversaire ne peut
   *  pas attaquer les unités ni les villes du propriétaire tant que la merveille
   *  est debout (obsolescence globale R-128 — Ingénierie). */
  blocksEnemyAttacks?: boolean;
  /** Libellé d'effet (UI — actif en 7f/7h). */
  effect?: string;
  implemented: boolean;
}

/** 7f · Constantes culturelles (culture.json) — calibrage par édition (R-99). */
export interface CultureData {
  /** T-27 rév. 7l · C5 · Table canon des seuils de culture du canal culture
   *  (indexée par le nombre de GP DÉJÀ obtenus : 150, 267, 417, 600… — R-114).
   *  Au-delà de la table, la formule (greatPersonCultureGap) extrapole. */
  greatPersonCultureThresholds: number[];
  /** 7l · C5 · Paramètres de la formule de génération/extrapolation
   *  (écart initial 117, croissance +33,33 par pas — ancres d'Erik). */
  greatPersonCultureGap: { base: number; growth: number };
  /** Jalons culturels requis pour les Nations Unies (et la victoire). */
  milestonesTarget: number;
  /** 7h · T-30 · Seuil de base des accumulateurs or/science/production des
   *  nouveaux GP (R-123) — ×2 par GP de CE TYPE obtenu. */
  greatPersonYieldThresholdBase: number;
  /** 7h · T-30 · Croissance du seuil par GP obtenu du même type (R-123). */
  greatPersonYieldThresholdGrowth: number;
  /** 7h · T-31 · Victoires de combat de l'empire pour engendrer un Leader (R-123). */
  leaderGpVictories: number;
  // 7l · C7 : `hammerSalvageWindow` (T-32) est ABROGÉ — la réserve de marteaux
  // est permanente (R-130 rév.), plus aucune dissipation.
}

// ---------------------------------------------------------------------------
// 7j · R-126 — Figures historiques des GP (figures.json)
// ---------------------------------------------------------------------------

/** 7j · R-126 : une figure historique, rattachée à sa tech (ciblage R-127). */
export interface FigureEntry {
  name: string;
  tech: string;
}

/** 7j · R-126 : figures par classe de GP (clé = id de classe GP). */
export interface FiguresData {
  classes: Record<string, { figures: FigureEntry[] }>;
}

// ---------------------------------------------------------------------------
// Gouvernements — Phase 7h (RULES.md §8.7, R-121/R-122)
// ---------------------------------------------------------------------------

/** R-121 · Modificateurs d'un régime (governments.json — valeurs exactes du
 *  document d'Erik). Tous les champs sont optionnels : Despotisme n'en porte
 *  aucun. */
export interface GovernmentEffects {
  /** République : coût en population du Colon (1 au lieu de 2 — amende R-112). */
  settlerPopCost?: number;
  /** Monarchie : multiplicateur de la culture du Palais (×2 — amende R-113). */
  palaceCultureMult?: number;
  /** Démocratie : multiplicateurs d'or et de science des villes (+50 %). */
  goldMult?: number;
  scienceMult?: number;
  /** Démocratie : pacifisme (hooks posés, sans effet en 1v1 — R-121). */
  pacifism?: boolean;
  /** Fondamentalisme : +1 fixe Attaque/Défense des unités terrestres (§7.4). */
  landAttackBonus?: number;
  landDefenseBonus?: number;
  /** Fondamentalisme : science des Bibliothèques/Universités neutralisée (R-88). */
  zeroLibraryScience?: boolean;
  /** Communisme : multiplicateur de production des villes (+50 %). */
  productionMult?: number;
  /** Communisme : culture des Temples/Cathédrales annulée (R-113). */
  zeroTempleCulture?: boolean;
  /** Despotisme : hook 7i (nukes sans pénalité culturelle — inerte). */
  nuclearWithoutPenalty?: boolean;
}

/** R-121 · Régime politique (governments.json) — data-driven. */
export interface GovernmentData {
  id: string;
  name: string;
  /** Technologie requise (null = disponible d'office / Grande Pyramide). */
  tech: string | null;
  /** Régime de départ (Despotisme). */
  default?: boolean;
  effects: GovernmentEffects;
  /** Libellés UI (bonus / pénalité). */
  effectLabel: string;
  penaltyLabel: string | null;
}

/** R-99/R-121 · Configuration gouvernements (governments.json). */
export interface GovernmentsData {
  /** T-29 · Durée de l'Anarchie après un changement manuel (R-122). */
  anarchyTurns: number;
  governments: Record<string, GovernmentData>;
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
  /** 7l · R-134 · Or versé DIRECTEMENT à la trésorerie par tour quand la
   *  case est travaillée (canon : Gemmes +2, Or +3 — correction du canal
   *  commerce D3 de 7c). null/absent = pas d'or direct. */
  directGold?: number;
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
