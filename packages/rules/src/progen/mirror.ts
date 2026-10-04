/**
 * Phase 6b L1 — Stratégie de placement MIROIR 1v1 (le cœur de l'équité).
 *
 * Plutôt que le partitionnement régional multi-joueurs du PDF (Civ 2-12
 * joueurs), la garantie d'équité la plus forte en 1v1 : générer une DEMI-carte
 * (40×20) par la couche géophysique, la refléter par ROTATION 180°.
 *
 * « Miroir géométrique » = rotation 180° (comme la symétrie de la carte
 * variée-40 : rows[r][c] === rows[39-r][39-c]) — c'est la SEULE isométrie
 * hex exacte qui préserve les distances : le miroir colonne-à-colonne serait
 * faussé par l'offset axial des rangées impaires. Interprétation documentée,
 * à signaler dans le rapport.
 *
 * Ordre (handoff L1/L2) : ressources sur la demi-carte AVANT le choix du
 * site (la fertilité les inclut) → meilleur site de capitale (contraintes
 * praticable / bords / axe) → normalisation (PDF §NormalizeStartLocation) →
 * miroir → villages/huttes sur la demi-carte → reflétés.
 *
 * Scores de fertilité : les anneaux qui débordent de la demi-carte sont
 * évalués SUR LE MIROIR de la demi (une case hors demi = l'image de sa case
 * miroir) — le score calculé avant miroir est donc EXACTEMENT le score de la
 * carte complète, et le checksum d'équité (P1 vs P2) tombe à 0 par
 * construction.
 *
 * Pérennité (ajout d'Erik, 02/09) : `StartPlacementStrategy` est injectable.
 * Ajouter le 2-5 joueurs = implémenter `regionalMulti` derrière la même
 * interface (partitionnement régional + fertilité multi-anneaux +
 * normalisation, PDF §AssignStartingPlots) SANS toucher à la géophysique.
 */
import { colRowToHex, hexDistance, hexDistanceW, hexesWithinRadius, inRectangle, neighbors, neighborsW, compareHex, tileKeyOf, wrapCol, SANS_WRAP } from '../hex.js';
import type { Hex } from '../hex.js';
import type { MapResource, MapVillage, MapHut } from '../map.js';
import type { ResourceId, TerrainId } from '../types.js';
import { RESOURCES, TERRAINS, isWaterTerrain } from '../data.js';
import type { SeededRng } from '../rng.js';
import type { PhysicalMap } from './geo.js';
import { classifyWaters } from './geo.js';
import { fertilityScore, ringCells } from './fertility.js';
import type { TerrainLookup } from './fertility.js';
import { placeResources, placeEntities, placeMarineResources, spacingViolated, waterOnlyResourceIds, poseRessourcesSousCamps } from './content.js';
import type { ProgenSettings } from './settings.js';
import { deriveSeed } from './noise.js';

export interface PlacementInput {
  rng: SeededRng;
  geo: PhysicalMap;
  settings: ProgenSettings;
}

/** Sous-rapport de la stratégie (consigné dans le dump admin). */
export interface PlacementReport {
  /** Fertilité des deux sites, évaluée sur la CARTE COMPLÈTE (miroir). */
  p1: number;
  p2: number;
  /** |p1 − p2| — checksum d'équité : 0 par construction du miroir. */
  delta: number;
  topAverage: number;
  threshold: number;
  /** Injection de ressources de normalisation effectuée. */
  normalized: boolean;
  candidates: number;
  /** SPAWN-START : garantie de voisinage du départ (consignée au dump admin). */
  spawn: {
    purgeRadius: number;
    purged: number;
    compositionP1: Record<string, number>;
    compositionP2: Record<string, number>;
  };
  /** CARTE-MULTI (libreMulti uniquement) : équité du placement libre —
   *  fertilité/composition PAR spawn, distances pairwise, métrique D1
   *  (score minimal, tolérance 🔶 librePairSpreadMax). */
  multi?: {
    joueurCount: number;
    spawns: Array<{
      id: string;
      capital: Hex;
      fertility: number;
      distanceCentre: number;
      composition: Record<string, number>;
    }>;
    pairwise: Array<{ a: string; b: string; distance: number }>;
    equiteScore: number;
    pairSpread: number;
    sommeEcarts: number;
    normalises: number;
    /** Déficit de la garantie de couverture 6c par type (tolérance 🔶 —
     *  ressources rares sur carte libre). */
    couvertureManquants: Record<string, number>;
  };
}

export interface PlacementOutput {
  /** Grille finale (40×40 pour mirror1v1), disposition rectangulaire. */
  terrain: TerrainId[][];
  resources: MapResource[];
  villages: MapVillage[];
  huts: MapHut[];
  /** Capitales, dans l'ordre des joueurs (p1, p2). */
  capitals: Hex[];
  report: PlacementReport;
}

export interface StartPlacementStrategy {
  readonly id: string;
  /** Dimensions de la grille GÉOPHYSIQUE à générer (demi-carte pour le miroir)
   *  + options de composition : le miroir découpe le long du bord bas, qui ne
   *  doit PAS recevoir l'océan de bordure (terre continue à travers l'axe). */
  geoSize(settings: ProgenSettings): { width: number; height: number; openBottom?: boolean };
  /** Dimensions de la carte FINALE produite. */
  fullSize(settings: ProgenSettings): { width: number; height: number };
  build(input: PlacementInput): PlacementOutput;
}

/** Échec déterministe d'une tentative → le générateur re-essaie avec la
 *  sous-graine suivante (connexion impossible, site manquant, seuil non
 *  atteint après normalisation…). */
export class ProgenPlacementError extends Error {}

/**
 * Image d'une case par la DEMI-TOUR DU CYLINDRE (CARTE-RONDE T1, D3) :
 * translation de demi-largeur en colonne, rangée inchangée — isométrie exacte
 * du cylindre ET du rectangle fini. Sert au jumelage des îlots offshore en
 * 1v1 (équité de terrain à l'opposé). Le nom historique `mirroredHex` est
 * conservé (API, rapports, bancs) ; l'ancienne réflexion 180° est ABROGÉE.
 */
export function mirroredHex(hex: Hex, fullWidth: number, _fullHeight?: number): Hex {
  const col = wrapCol(hex.q + Math.floor(hex.r / 2) + Math.floor(fullWidth / 2), fullWidth);
  return colRowToHex(col, hex.r);
}

/** Cherche le meilleur site de capitale de la demi-carte. */
interface SiteCandidate {
  hex: Hex;
  score: number;
}

interface WritableTerrainLookup extends TerrainLookup {
  setResource(hex: Hex, id: ResourceId): void;
  deleteResource(hex: Hex): void;
}

/**
 * Lookup « demi-carte étendue » : les cases hors demi-carte (rows ≥ halfH)
 * sont résolues SUR LEUR MIROIR dans la demi. Le terrain complet étant par
 * définition demi + miroir, ce lookup renvoie EXACTEMENT le terrain de la
 * carte finale — les scores mesurés avant miroir sont donc exacts.
 */
export function halfMapLookup(
  grid: TerrainId[][],
  resources: MapResource[],
  fullWidth: number,
): WritableTerrainLookup {
  const halfH = grid.length;
  // resourceMap indexé en clés (col, row) de la DEMI-carte (espace de
  // `resolve`) : une ressource de la carte complète hors demi est ramenée à
  // son image. NB : col ≠ q (col = q + ⌊r/2⌋) — ne PAS mélanger les espaces.
  const resourceMap = new Map<string, ResourceId>();
  for (const r of resources) {
    let col = r.q + Math.floor(r.r / 2);
    let row = r.r;
    if (row >= halfH) {
      // Pré-image rotationnelle : (col − W/2 mod W, row − H/2).
      col = wrapCol(col - Math.floor(fullWidth / 2), fullWidth);
      row -= halfH;
    }
    resourceMap.set(`${col},${row}`, r.id);
  }
  const resolve = (hex: Hex): { col: number; row: number } => {
    const row = hex.r;
    const col = hex.q + Math.floor(hex.r / 2);
    if (row < halfH) return { col, row };
    // Symétrie rotationnelle : la carte complète W×(2·halfH) ramène
    // (col, row ≥ halfH) à sa pré-image (col − W/2 mod W, row − H/2).
    return { col: wrapCol(col - Math.floor(fullWidth / 2), fullWidth), row: row - halfH };
  };
  return {
    terrainAt(hex: Hex): TerrainId | undefined {
      const { col, row } = resolve(hex);
      return grid[row]?.[col];
    },
    resourceAt(hex: Hex): ResourceId | null {
      const { col, row } = resolve(hex);
      return resourceMap.get(`${col},${row}`) ?? null;
    },
    setResource(hex: Hex, id: ResourceId): void {
      const { col, row } = resolve(hex);
      resourceMap.set(`${col},${row}`, id);
    },
    deleteResource(hex: Hex): void {
      const { col, row } = resolve(hex);
      resourceMap.delete(`${col},${row}`);
    },
  };
}

// ---------------------------------------------------------------------------
// SPAWN-START (demande d'Erik, 05/09) — garantie de voisinage du Colon.
//  1. Les 6 cases adjacentes au spawn sont FORCÉES (re-paint) : exactement
//     🔶 spawnRingForet forêts, 🔶 spawnRingPrairie prairies, 🔶 spawnRingEau
//     eaux ; la 6e case reste libre (tout terrain productif non-montagne).
//  2. AUCUNE ressource dans le rayon 🔶 spawnPurgeRadius du spawn (anneaux
//     1 ET 2 purgés) — les artefacts (7o) ne sont PAS concernés.
// Le placement d'abord, la carte ensuite : une carte procédurale ne garantit
// pas qu'un tel voisinage existe naturellement — on le peint.
// ---------------------------------------------------------------------------

/** Case libre éligible 🔶 : terrain productif (un rendement > 0), terrestre et
 *  non-montagne (l'eau et l'océan ne sont pas des cases « libres » de départ). */
export function productiveFreeTile(t: TerrainId): boolean {
  if (isWaterTerrain(t) || t === 'montagne') return false;
  const y = TERRAINS[t]!.yields ?? { food: 0, production: 0, commerce: 0 };
  return y.food + y.production + y.commerce > 0;
}

/**
 * Force le voisinage du site sur la grille (DEMI-carte — le miroir reproduit
 * le re-paint à l'identique). Déterministe (R-81) : les voisines sont triées
 * (q, r) ; les terrains déjà conformes sont PRÉSERVÉS en priorité, les cibles
 * manquantes sont posées dans l'ordre sur les voisines restantes, la/les
 * dernières voisines restent libres si productives non-montagne (sinon
 * re-peintes en prairie). Ne touche QU'AUX 6 voisines du site.
 */
export function forceSpawnNeighborhood(grid: TerrainId[][], site: Hex, s: ProgenSettings): void {
  const halfH = grid.length;
  const halfW = grid[0]?.length ?? 0;
  const at = (h: Hex): TerrainId | undefined => grid[h.r]?.[h.q + Math.floor(h.r / 2)];
  const set = (h: Hex, t: TerrainId): void => {
    grid[h.r]![h.q + Math.floor(h.r / 2)] = t;
  };
  const ring = neighbors(site).filter((n) => inRectangle(n, halfW, halfH)).sort(compareHex);
  // Cibles dans l'ordre canonique : forêts, prairies, eaux.
  const targets: TerrainId[] = [];
  for (let i = 0; i < s.spawnRingForet; i++) targets.push('foret');
  for (let i = 0; i < s.spawnRingPrairie; i++) targets.push('prairie');
  for (let i = 0; i < s.spawnRingEau; i++) targets.push('eau');
  // 1. Les voisines qui portent déjà un terrain cible le conservent.
  const assigned = new Map<Hex, TerrainId>();
  for (const target of targets) {
    const match = ring.find((n) => !assigned.has(n) && at(n) === target);
    if (match) assigned.set(match, target);
  }
  // 2. Cibles manquantes → voisines restantes (ordre trié, R-81).
  const missing = [...targets];
  for (const t of assigned.values()) {
    const idx = missing.indexOf(t);
    if (idx >= 0) missing.splice(idx, 1);
  }
  const rest = ring.filter((n) => !assigned.has(n));
  for (const [i, hex] of rest.entries()) {
    if (i < missing.length) {
      set(hex, missing[i]!);
    } else if (!productiveFreeTile(at(hex)!)) {
      set(hex, 'prairie'); // case libre impropre (eau/montagne/cratère) → prairie
    }
  }
}

/**
 * Purge pure des ressources situées à ≤ `radius` (hex) de l'un des centres.
 * Retourne les listes kept/purged (l'entrée n'est pas mutée) — déterministe.
 */
export function purgeResourcesNear(
  resources: MapResource[],
  centers: Hex[],
  radius: number,
): { kept: MapResource[]; purged: MapResource[] } {
  if (radius <= 0) return { kept: [...resources], purged: [] };
  const kept: MapResource[] = [];
  const purged: MapResource[] = [];
  for (const r of resources) {
    const h = { q: r.q, r: r.r };
    if (centers.some((c) => hexDistance(h, c) <= radius)) purged.push(r);
    else kept.push(r);
  }
  return { kept, purged };
}

/** Composition de l'anneau 1 d'un spawn : nombre de cases par terrain
 *  (checksum d'équité étendu — les deux spawns doivent être identiques). */
export function spawnNeighborhoodComposition(
  terrainAt: (h: Hex) => TerrainId | undefined,
  capital: Hex,
  width: number = SANS_WRAP,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of neighborsW(capital, width)) {
    const t = terrainAt(n);
    if (t === undefined) continue;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

/**
 * Normalisation (PDF §NormalizeStartLocation) : si la fertilité du site est
 * sous le seuil, injecter des ressources bonus alimentaires (bétail sur
 * prairie, blé sur prairie/plaine — donneés R-91) dans les anneaux 1-2
 * jusqu'au seuil. Déterministe : cases triées par (distance, q, r).
 * Retourne les ressources injectées (à ajouter par l'appelant) + le score final.
 */
export function normalizeStartSite(
  lookup: WritableTerrainLookup,
  site: Hex,
  initialScore: number,
  threshold: number,
  s: ProgenSettings,
  into: MapResource[],
  options?: { mirrorOf?: (hex: Hex) => Hex; recheckSpacing?: boolean; width?: number },
): { score: number; normalized: boolean } {
  let score = initialScore;
  let normalized = false;
  if (score >= threshold) return { score, normalized };
  // Phase 6c (demande d'Erik) : l'anneau 1 du site reste TOUJOURS sans
  // ressource. SPAWN-START (05/09) : l'anneau 2 est LUI AUSSI réservé (rayon
  // 🔶 spawnPurgeRadius sans ressource) — les injections de normalisation ne
  // visent plus que l'anneau 3.
  const injectable = ringCells(site, 3).filter((c) => {
    const t = lookup.terrainAt(c);
    if (t !== 'prairie' && t !== 'plaine') return false; // contrainte R-91 (blé/bétail)
    if (lookup.resourceAt(c) !== null) return false;
    // Phase 6c : les injections respectent l'espacement des ressources aussi.
    return !spacingViolated(c, into, options?.mirrorOf, s.minResourceDistance, options?.width);
  });
  for (const cell of injectable) {
    if (score >= threshold) break;
    // CARTE-50 : le filtre ci-dessus est calculé AVANT la boucle — deux cases
    // injectables adjacentes le long du bord de l'anneau 3 produisaient des
    // ressources à distance 1 (manquement R-108, prouvé par le banc de
    // conformité). Re-vérification à chaque pose — mode libre uniquement
    // (recheckSpacing 🔶) : le miroir 1v1 reste BIT-IDENTIQUE.
    if (options?.recheckSpacing && spacingViolated(cell, into, options?.mirrorOf, s.minResourceDistance, options?.width)) continue;
    const t = lookup.terrainAt(cell)!;
    // Bétail sur prairie (le plus nourrissant : +3 food), blé sinon (+2).
    const id: ResourceId = t === 'prairie' ? 'betail' : 'ble';
    into.push({ id, q: cell.q, r: cell.r });
    lookup.setResource(cell, id);
    score = fertilityScore(lookup, site, s);
    normalized = true;
  }
  if (score < threshold) {
    throw new ProgenPlacementError(
      `normalisation impossible : fertilité ${score.toFixed(1)} < seuil ${threshold.toFixed(1)} (aucune case injectable restante)`,
    );
  }
  return { score, normalized };
}

/**
 * Phase 6c — garantie de couverture (demande d'Erik : « au moins une
 * ressource de chaque type par joueur »). Appelée sur la liste COMPLÈTE
 * (demi + miroir — fermée par symétrie : les retraits de capitales retirent
 * des paires) APRÈS ce retrait. Chaque manque est comblé par paires (une pose
 * en demi-carte + son image), dans le respect de l'espacement
 * `minResourceDistance` 🔶 et des cases exclues (capitales). Aucune case
 * éligible → ProgenPlacementError (la tentative suivante re-génère).
 * Déterminisme : ids triés, cases triées (R-81), tirage RNG seedé.
 */
export function guaranteeResourceCoverage(input: {
  rng: SeededRng;
  /** Grille de la DEMI-carte (pré-classification : toute l'eau y est 'eau'). */
  terrain: TerrainId[][];
  /** Ressources COMPLÈTES — mutées : poses ajoutées par paires. */
  resources: MapResource[];
  /** Cases interdites (clés "q,r" — les capitales). */
  exclude: Set<string>;
  s: ProgenSettings;
  mirrorOf: (hex: Hex) => Hex;
  /** Sous-ensemble à garantir (Phase 6c : ressources terrestres ici — les
   *  marines sont posées après classification des eaux). Absent = toutes. */
  onlyIds?: Set<string>;
  /** MONDE CYLINDRIQUE : largeur de la carte complète (distances wrap). */
  width?: number;
}): void {
  const min = input.s.minPerResourceType;
  if (min <= 0) return;
  const halfH = input.terrain.length;
  const halfW = input.terrain[0]?.length ?? 0;
  // Ordre par RARETÉ (Phase 6c) : les ressources dont le terrain éligible est
  // peu présent sont réservées EN PREMIER — sinon les types abondants
  // (alphabétiquement premiers) saturent les bandes rares avec leurs disques
  // d'espacement et la garantie devient infaisable. Tri déterministe
  // (nombre de cases éligibles croissant, puis id) — R-81.
  const terrainCounts = new Map<TerrainId, number>();
  for (const row of input.terrain) {
    for (const t of row) terrainCounts.set(t, (terrainCounts.get(t) ?? 0) + 1);
  }
  const eligibleTiles = (id: string): number => {
    const terrains = RESOURCES[id]!.terrains;
    let n = 0;
    for (const t of terrains) n += terrainCounts.get(t) ?? 0;
    return n;
  };
  const orderedIds = Object.keys(RESOURCES)
    .filter((id) => !input.onlyIds || input.onlyIds.has(id))
    .sort((a, b) => eligibleTiles(a) - eligibleTiles(b) || (a < b ? -1 : 1));
  for (const id of orderedIds) {
    const data = RESOURCES[id]!;
    // Par joueur (demi-carte) → total PAIR sur la carte 1v1 ; les retraits de
    // capitales retirent des paires : le déficit reste pair.
    let need = 2 * min - input.resources.filter((r) => r.id === id).length;
    while (need > 0) {
      const occupied = new Set(input.resources.map((r) => `${r.q},${r.r}`));
      const candidates: Hex[] = [];
      for (let row = 0; row < halfH; row++) {
        for (let col = 0; col < halfW; col++) {
          if (!data.terrains.includes(input.terrain[row]![col]!)) continue;
          const hex = colRowToHex(col, row);
          const key = `${hex.q},${hex.r}`;
          if (input.exclude.has(key) || occupied.has(key)) continue;
          if (spacingViolated(hex, input.resources, input.mirrorOf, input.s.minResourceDistance, input.width)) continue;
          candidates.push(hex);
        }
      }
      if (candidates.length === 0) {
        throw new ProgenPlacementError(
          `garantie de couverture impossible : aucune case éligible pour "${id}" (espacement ${input.s.minResourceDistance}, exclues : ${input.exclude.size})`,
        );
      }
      // Choix « point le plus éloigné » (farthest-point, déterministe — R-81
      // pour les ties) : chaque pose s'écarte au maximum des poses existantes,
      // ce qui évite qu'une poignée de disques d'espacement ne recouvre des
      // zones rares encore à réserver (le tirage aléatoire pouvait y arriver
      // sur des terrains fragmentés — patchScale 0.5).
      const hex = candidates.reduce((best, c) => {
        const slack = (h: Hex): number => {
          let d = Number.POSITIVE_INFINITY;
          for (const p of input.resources) d = Math.min(d, hexDistanceW(h, p, input.width ?? SANS_WRAP));
          return d;
        };
        const sBest = slack(best);
        const sC = slack(c);
        return sC > sBest || (sC === sBest && compareHex(c, best) < 0) ? c : best;
      });
      input.resources.push({ id: id as ResourceId, q: hex.q, r: hex.r });
      const m = input.mirrorOf(hex);
      input.resources.push({ id: id as ResourceId, q: m.q, r: m.r });
      need -= 2;
    }
  }
}

/**
 * MIROIR 1v1 : demi-carte géophysique → contenu → meilleur site →
 * normalisation → rotation 180° → carte complète symétrique.
 */
/**
 * MONDE CYLINDRIQUE (CARTE-RONDE T1, D3) : l'ancienne stratégie MIROIR 1v1
 * (demi-carte + réflexion 180°) est ABROGÉE. Le 1v1 est porté par
 * `ROTATIONNEL_1V1` (libre.ts) : terrain généré entier, adversaire à
 * l'OPPOSÉ du cylindre (|Δcolonne wrap − W/2| ≤ 🔶 oppositionTolerance),
 * garanties de départ PAR JOUEUR. L'id historique `mirror1v1` reste
 * enregistré ci-dessous comme alias (compat des configurations). Les aides
 * ci-dessus (forceSpawnNeighborhood, purgeResourcesNear, normalisation,
 * garantie de couverture) restent les briques communes des stratégies.
 */

/** Registre des stratégies injectables (aujourd'hui : mirror1v1 uniquement ;
 *  regionalMulti s'ajoutera ICI sans toucher à la géophysique). */
export const START_PLACEMENT_STRATEGIES: Record<string, StartPlacementStrategy> = {};

export function getStartPlacementStrategy(id: string): StartPlacementStrategy {
  const s = START_PLACEMENT_STRATEGIES[id];
  if (!s) throw new ProgenPlacementError(`stratégie de placement inconnue : "${id}"`);
  return s;
}

/** Enregistrement d'une stratégie supplémentaire (libreMulti — CARTE-MULTI)
 *  SANS cycle d'imports : index.ts (qui importe mirror ET libre) appelle ceci
 *  au chargement du module. */
export function registerStrategy(id: string, strategy: StartPlacementStrategy): void {
  START_PLACEMENT_STRATEGIES[id] = strategy;
}

/** Utilitaire interne : appartenance d'une case à la carte 40×40 (réexport test). */
export function hexInFullMap(hex: Hex, _s: ProgenSettings): boolean {
  return inRectangle(hex, 40, 40);
}

/** Sous-graine de tentative : dérivation déterministe du seed de partie. */
export function attemptSeed(seed: number, attempt: number): number {
  return deriveSeed(seed, attempt);
}
