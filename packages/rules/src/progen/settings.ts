/**
 * Phase 6b — Réglages du générateur procédural de cartes.
 *
 * Toutes les valeurs par défaut marquées 🔶 sont des CIBLES DE CALIBRAGE :
 * le labo #/progen permet de les régler visuellement avant toute validation
 * d'Erik (convention HANDOFF.md §4 — ne pas modifier sans validation).
 *
 * Les réglages sont PURS (aucune IO) et sérialisables : ils traversent le
 * protocole et le dump admin tels quels.
 */

/** Stratégie de placement des départs (ajout d'Erik, 02/09) : aujourd'hui le
 *  miroir 1v1 est la seule implémentation ; `regionalMulti` (2-5 joueurs,
 *  partitionnement régional du PDF §AssignStartingPlots) s'ajoutera derrière
 *  la même interface sans toucher à la couche géophysique. */
export type StartPlacementId = 'mirror1v1';

export interface ProgenSettings {
  /** Nombre de joueurs visés — 2 pour mirror1v1 ; 2-5 pour regionalMulti futur. */
  playerCount: number;
  /** Stratégie injectable de placement des départs ET du contenu. */
  startPlacement: StartPlacementId;
  /** 1 = pangée (rifts courts) ; 2 = deux masses séparées par un rift traversant
   *  avec isthme central (la connexité terrestre des spawns reste garantie) ;
   *  3 = **archipel** (défaut depuis la Phase 6c — demande d'Erik) : eau
   *  centrale, petits continents et îlots de 1-5 cases, connexité terrestre
   *  NON requise (le contact attendra le naval, Phase 7). */
  continents: 1 | 2 | 3;
  /** Cible de ratio terre/eau 🔶 (0.55 = ~55 % de terre). */
  landRatio: number;
  /** Nombre d'axes de rift (continents=1 : rifts courts ; continents=2 : 1 traversant). */
  rifts: number;
  /** Échelle du ratio terre en archipel 🔶 (Phase 6c) : « plus axé sur l'eau » —
   *  le ratio terre effectif = landRatio × cette valeur (0.7 → ~38 % de terre). */
  archipelagoLandScale: number;
  /** Profondeur des rifts intérieurs 🔶 (Phase 6c, demande d'Erik : pénétration
   *  de l'eau dans les continents pour des séparations naturelles) — abaisse
   *  l'altitude autour de l'axe. Le rift traversant (continents=2) garde sa
   *  profondeur propre (70) : son rôle est la séparation complète. */
  riftDepth: number;
  /** Largeur des eaux côtières 🔶 (Phase 6c, décision d'Erik) : une case d'eau
   *  à ≤ coastWidth cases (hex) d'une terre est de la CÔTE (`eau`), le reste
   *  est de l'OCÉAN profond (`ocean`). 1 = bande côtière minimale (adjacence). */
  coastWidth: number;
  /** Densités des reliefs et du climat, toutes dans [0, 1] 🔶 (Phase 6c :
   *  un calibreur PAR TYPE de tuile — le curseur d'humidité global quitte le
   *  labo, `humidity` reste le réglage interne par défaut 0.5). */
  mountainDensity: number;
  hillDensity: number;
  forestDensity: number;
  desertDensity: number;
  /** Prairies ↔ plaines : 0 = plaines dominantes, 1 = prairies dominantes
   *  (0.5 = équilibre historique) 🔶. */
  prairieDensity: number;
  /** Échelle des ZONES de terrain 🔶 (Phase 6c, demande d'Erik) : taille des
   *  massifs/bosquets relative au comportement 6b — 0.5 = regroupement divisé
   *  par 2 (plus de diversité locale), 1 = héritage 6b. */
  terrainPatchScale: number;
  humidity: number;
  /** Multiplicateur de densité des ressources (cible ~1 / 12 cases de terre 🔶). */
  resourceDensity: number;
  /** Distance minimale (hex) entre DEUX ressources 🔶 (Phase 6c, demande
   *  d'Erik : « une distance d'une case » = 2) — miroir compris : la contrainte
   *  porte sur la carte COMPLÈTE (demi + images). 1 = adjacence tolérée. */
  minResourceDistance: number;
  /** Minimum de poses de CHAQUE type de ressource PAR JOUEUR 🔶 (Phase 6c :
   *  « au moins une ressource de chaque type par joueur ») — par demi-carte
   *  miroir, donc ≥ 2×N sur la carte 1v1 ; pérenne pour regionalMulti.
   *  0 = garantie désactivée. */
  minPerResourceType: number;
  /** Villages barbares et huttes posés sur la DEMI-carte puis reflétés 🔶
   *  (6 + 6 par moitié depuis la Phase 6c — demande d'Erik — équité parfaite
   *  par miroir). */
  villagesPerHalf: number;
  hutsPerHalf: number;
  /** Distances calibrables entre entités 🔶 (Phase 6c) : villages entre eux,
   *  huttes entre elles, et huttes ↔ villages (une hutte ne doit pas être
   *  À CÔTÉ d'un village mais peut en être plus proche qu'une autre hutte :
   *  hutVillageSpacing < hutSpacing est un réglage légitime). */
  villageSpacing: number;
  hutSpacing: number;
  hutVillageSpacing: number;
  /** Distance minimale entre les deux capitales (= validation parseMap). */
  minSpawnDistance: number;
  /** Distance minimale d'un site de capitale aux bords de carte. */
  startMinEdgeDistance: number;
  /** Distance minimale d'un site de capitale à l'axe de miroir (T-09). */
  startMinMirrorDistance: number;
  /** Équilibre de l'anneau de départ 🔶 (Phase 6c, demande d'Erik) : les 6
   *  cases entourant le site doivent compter AU MOINS ce nombre de prairies
   *  et de forêts, et AUCUNE ressource (site « ne coûtant aucun PM », équitable). */
  startMinRingPrairie: number;
  startMinRingForest: number;
  /** Villages : distance minimale aux DEUX spawns (leçon de calibrage 7d 🔶). */
  minVillageDistance: number;
  /** Huttes : distance minimale aux deux spawns 🔶 (embuscade = 2 barbares). */
  minHutDistance: number;
  /** Normalisation (PDF §NormalizeStartLocation) : seuil = moyenne des N
   *  meilleurs sites × facteur 🔶. */
  normalizationTopSites: number;
  normalizationFactor: number;
  /** Poids des anneaux 1/2/3 de fertilité 🔶 (pseudocode du PDF, adapté). */
  fertilityRingWeights: [number, number, number];
  /** Pondération des rendements 🔶 : nourriture ×2 + production ×1.5 (PDF) ;
   *  commerce ×1 — interprétation : le commerce est converti or/science
   *  chez nous (R-90), il compte donc dans la fertilité. */
  fertilityFoodWeight: number;
  fertilityProductionWeight: number;
  fertilityCommerceWeight: number;
  /** Pénalité par case de montagne dans un anneau 🔶 (PDF : malus sévère). */
  fertilityMountainPenalty: number;
  /** Tentatives maximales (connexité/seuil/validité) avant échec explicite. */
  maxAttempts: number;
}

export const DEFAULT_PROGEN_SETTINGS: ProgenSettings = {
  playerCount: 2,
  startPlacement: 'mirror1v1',
  continents: 3,
  landRatio: 0.55,
  archipelagoLandScale: 0.7,
  rifts: 2,
  riftDepth: 48,
  coastWidth: 1,
  mountainDensity: 0.5,
  hillDensity: 0.5,
  forestDensity: 0.36,
  desertDensity: 0.35,
  prairieDensity: 0.2,
  terrainPatchScale: 0.3,
  humidity: 0.5,
  resourceDensity: 1.5,
  minResourceDistance: 2,
  minPerResourceType: 1,
  villagesPerHalf: 6,
  hutsPerHalf: 6,
  minSpawnDistance: 12,
  startMinEdgeDistance: 6,
  startMinMirrorDistance: 2, // T-09
  startMinRingPrairie: 2,
  startMinRingForest: 2,
  minVillageDistance: 6,
  minHutDistance: 3,
  villageSpacing: 6,
  hutSpacing: 3,
  hutVillageSpacing: 2,
  normalizationTopSites: 5,
  normalizationFactor: 0.8,
  fertilityRingWeights: [1.0, 0.6, 0.3],
  fertilityFoodWeight: 2,
  fertilityProductionWeight: 1.5,
  fertilityCommerceWeight: 1,
  fertilityMountainPenalty: 2,
  maxAttempts: 10,
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Fusionne les overrides sur les défauts, avec bornage : le labo #/progen
 * envoie des curseurs bruts, les valeurs restent dans des plages saines.
 */
export function resolveProgenSettings(overrides?: Partial<ProgenSettings>): ProgenSettings {
  const s = { ...DEFAULT_PROGEN_SETTINGS, ...(overrides ?? {}) };
  return {
    ...s,
    playerCount: Math.max(2, Math.min(5, Math.round(s.playerCount))),
    startPlacement: s.startPlacement === 'mirror1v1' ? 'mirror1v1' : 'mirror1v1',
    continents: s.continents === 2 ? 2 : s.continents === 3 ? 3 : 1,
    archipelagoLandScale: Math.min(1, Math.max(0.4, s.archipelagoLandScale)),
    landRatio: Math.min(0.75, Math.max(0.25, s.landRatio)),
    rifts: Math.min(3, Math.max(0, Math.round(s.rifts))),
    riftDepth: Math.min(80, Math.max(10, Math.round(s.riftDepth))),
    coastWidth: Math.min(3, Math.max(1, Math.round(s.coastWidth))),
    mountainDensity: clamp01(s.mountainDensity),
    hillDensity: clamp01(s.hillDensity),
    forestDensity: clamp01(s.forestDensity),
    desertDensity: clamp01(s.desertDensity),
    prairieDensity: clamp01(s.prairieDensity),
    terrainPatchScale: Math.min(1.5, Math.max(0.25, s.terrainPatchScale)),
    humidity: clamp01(s.humidity),
    resourceDensity: Math.min(4, Math.max(0, s.resourceDensity)),
    minResourceDistance: Math.min(4, Math.max(1, Math.round(s.minResourceDistance))),
    minPerResourceType: Math.min(3, Math.max(0, Math.round(s.minPerResourceType))),
    villagesPerHalf: Math.min(12, Math.max(0, Math.round(s.villagesPerHalf))),
    hutsPerHalf: Math.min(12, Math.max(0, Math.round(s.hutsPerHalf))),
    minSpawnDistance: Math.max(2, Math.round(s.minSpawnDistance)),
    startMinEdgeDistance: Math.max(2, Math.round(s.startMinEdgeDistance)),
    startMinMirrorDistance: Math.max(1, Math.round(s.startMinMirrorDistance)),
    startMinRingPrairie: Math.min(6, Math.max(0, Math.round(s.startMinRingPrairie))),
    startMinRingForest: Math.min(6, Math.max(0, Math.round(s.startMinRingForest))),
    minVillageDistance: Math.max(0, Math.round(s.minVillageDistance)),
    minHutDistance: Math.max(0, Math.round(s.minHutDistance)),
    villageSpacing: Math.min(12, Math.max(0, Math.round(s.villageSpacing))),
    hutSpacing: Math.min(12, Math.max(0, Math.round(s.hutSpacing))),
    hutVillageSpacing: Math.min(12, Math.max(0, Math.round(s.hutVillageSpacing))),
    normalizationTopSites: Math.max(1, Math.round(s.normalizationTopSites)),
    normalizationFactor: Math.min(1, Math.max(0.3, s.normalizationFactor)),
    fertilityRingWeights: [
      Math.max(0, s.fertilityRingWeights[0]),
      Math.max(0, s.fertilityRingWeights[1]),
      Math.max(0, s.fertilityRingWeights[2]),
    ],
    maxAttempts: Math.min(25, Math.max(1, Math.round(s.maxAttempts))),
  };
}
