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
import { colRowToHex, hexDistance, hexesWithinRadius, inRectangle, neighbors, compareHex } from '../hex.js';
import type { Hex } from '../hex.js';
import type { MapResource, MapVillage, MapHut } from '../map.js';
import type { ResourceId, TerrainId } from '../types.js';
import { RESOURCES, TERRAINS, isWaterTerrain } from '../data.js';
import type { SeededRng } from '../rng.js';
import type { PhysicalMap } from './geo.js';
import { classifyWaters } from './geo.js';
import { fertilityScore, ringCells } from './fertility.js';
import type { TerrainLookup } from './fertility.js';
import { placeResources, placeEntities, placeMarineResources, spacingViolated, waterOnlyResourceIds } from './content.js';
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

/** Image d'une case axiale par la rotation 180° de la carte W×H. */
export function mirroredHex(hex: Hex, fullWidth: number): Hex {
  return { q: fullWidth / 2 - hex.q, r: fullWidth - 1 - hex.r };
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
      col = fullWidth - 1 - col;
      row = 2 * halfH - 1 - row;
    }
    resourceMap.set(`${col},${row}`, r.id);
  }
  const resolve = (hex: Hex): { col: number; row: number } => {
    const row = hex.r;
    const col = hex.q + Math.floor(hex.r / 2);
    if (row < halfH) return { col, row };
    // Miroir : la carte complète W×(2·halfH) reflète (col, row) →
    // (W−1−col, 2·halfH−1−row).
    return { col: fullWidth - 1 - col, row: 2 * halfH - 1 - row };
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
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of neighbors(capital)) {
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
  options?: { mirrorOf?: (hex: Hex) => Hex },
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
    return !spacingViolated(c, into, options?.mirrorOf, s.minResourceDistance);
  });
  for (const cell of injectable) {
    if (score >= threshold) break;
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
          if (spacingViolated(hex, input.resources, input.mirrorOf, input.s.minResourceDistance)) continue;
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
          for (const p of input.resources) d = Math.min(d, hexDistance(h, p));
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
export const MIRROR_1V1: StartPlacementStrategy = {
  id: 'mirror1v1',

  geoSize(settings: ProgenSettings): { width: number; height: number; openBottom?: boolean } {
    if (settings.playerCount !== 2) {
      // La stratégie miroir est 1v1 par construction — le multi-joueurs
      // 2-5 attendra la stratégie regionalMulti (même interface).
      throw new ProgenPlacementError(
        `mirror1v1 exige playerCount = 2 (reçu ${settings.playerCount}) — le multi-joueurs passera par la stratégie regionalMulti`,
      );
    }
    return { width: 40, height: 20, openBottom: true };
  },

  fullSize(): { width: number; height: number } {
    return { width: 40, height: 40 };
  },

  build({ rng, geo, settings }: PlacementInput): PlacementOutput {
    const halfW = geo.width; // 40
    const halfH = geo.height; // 20
    const full = this.fullSize(settings);
    if (halfW !== full.width || halfH * 2 !== full.height) {
      throw new ProgenPlacementError(`demi-carte ${halfW}×${halfH} incompatible avec la carte finale ${full.width}×${full.height}`);
    }
    // Image d'une case par la rotation 180° — partagée par l'espacement des
    // ressources (contrainte sur la carte COMPLÈTE, Phase 6c).
    const mirrorOf: (hex: Hex) => Hex = (hex) => mirroredHex(hex, full.width);

    // 1. Ressources posées sur la demi-carte AVANT le choix du site (la
    //    fertilité des candidats en tient compte) — handoff L2-1. Espacement
    //    🔶 minResourceDistance sur la carte complète (miroir compris).
    //    Phase 6c : la garantie de couverture passe AVANT le tirage aléatoire —
    //    chaque type a déjà sa case réservée, le tirage ne peut pas saturer un
    //    terrain avant elle.
    const waterOnly = new Set(waterOnlyResourceIds());
    const landOnly = new Set(Object.keys(RESOURCES).filter((id) => !waterOnly.has(id)));
    // Pré-garantie : TERRE uniquement (les marines attendent la classification
    // des eaux — l'océan leur est interdit et la demi-carte ne connaît pas
    // encore côte/océan).
    const guaranteed: MapResource[] = [];
    guaranteeResourceCoverage({
      rng,
      terrain: geo.terrain,
      resources: guaranteed,
      exclude: new Set<string>(),
      s: settings,
      mirrorOf,
      onlyIds: landOnly,
    });
    const resPlacement = placeResources(rng, geo.terrain, settings, { mirrorOf, alreadyPlaced: guaranteed, skipIds: waterOnly });
    // La liste `resources` reste DEMI-carte uniquement (l'étape 4 reflète tout)
    // : les poses garanties — générées en paires déjà reflétées — sont
    // repliées sur leur moitié (r < halfH), leur image sera recalculée à
    // l'identique par la rotation 180°.
    const resources: MapResource[] = [
      ...guaranteed.filter((r) => r.r < halfH),
      ...resPlacement.resources,
    ];

    // 2. Candidats de capitale sur la demi-carte (scores = carte complète,
    //    via le lookup étendu au miroir).
    const lookup = halfMapLookup(geo.terrain, resources, full.width);
    const candidates: SiteCandidate[] = [];
    for (let row = 0; row < halfH; row++) {
      for (let col = 0; col < halfW; col++) {
        const t = geo.terrain[row]![col]!;
        if (!TERRAINS[t]!.passable) continue;
        // Bord de carte ≥ 6 (handoff L1-2) ; axe de miroir ≥ T-09.
        if (row < settings.startMinEdgeDistance) continue;
        if (row >= halfH - settings.startMinMirrorDistance) continue;
        if (col < settings.startMinEdgeDistance || col >= halfW - settings.startMinEdgeDistance) continue;
        const hex = colRowToHex(col, row);
        // Distance aux DEUX capitales ≥ minSpawnDistance : le site ET son
        // image (la validation parseMap exige ≥ 12 entre les capitales).
        const mirror = mirroredHex(hex, full.width);
        if (hexDistance(hex, mirror) < settings.minSpawnDistance) continue;
        // Le guerrier doit se poser sur un voisin praticable.
        const freeNeighbor = neighbors(hex).some((n) => {
          const nt = lookup.terrainAt(n);
          return nt !== undefined && TERRAINS[nt]!.passable && lookup.resourceAt(n) === null;
        });
        if (!freeNeighbor) continue;
        // SPAWN-START (demande d'Erik 05/09) : la composition de l'anneau de
        // départ n'est plus un critère de FILTRAGE (2F/2P/1E n'existe pas
        // naturellement partout) — le site choisi voit son voisinage FORCÉ
        // (re-paint) puis son rayon purgé des ressources, ci-dessous.
        candidates.push({ hex, score: fertilityScore(lookup, hex, settings) });
      }
    }
    if (candidates.length === 0) {
      throw new ProgenPlacementError('aucun site de capitale éligible sur la demi-carte');
    }

    // Tri déterministe : score décroissant, tie-break (q, r) croissant (R-81).
    const ranked = [...candidates].sort((a, b) => b.score - a.score || compareHex(a.hex, b.hex));
    const topCount = Math.min(settings.normalizationTopSites, ranked.length);
    const top = ranked.slice(0, topCount);
    const topAverage = top.reduce((acc, c) => acc + c.score, 0) / topCount;
    const threshold = topAverage * settings.normalizationFactor;

    // 3. Meilleur site → SPAWN-START : le placement d'ABORD, la carte ENSUITE.
    //    a) le voisinage du site est FORCÉ (re-paint 2F/2P/1E + 1 libre 🔶) —
    //    le miroir (étape 4) reproduira le re-paint à l'identique pour p2 ;
    //    b) les ressources du rayon 🔶 spawnPurgeRadius sont purgées (anneaux
    //    1 et 2 — la demi-liste suffit : toute image miroir d'une case du
    //    rayon du site est dans le rayon du site miroir) ;
    //    c) normalisation (PDF §NormalizeStartLocation) — injections en
    //    anneau 3 désormais (les anneaux 1-2 sont réservés par la garantie).
    const best = ranked[0]!;
    forceSpawnNeighborhood(geo.terrain, best.hex, settings);
    const sitePurge = purgeResourcesNear(resources, [best.hex], settings.spawnPurgeRadius);
    resources.length = 0;
    resources.push(...sitePurge.kept);
    for (const r of sitePurge.purged) lookup.deleteResource({ q: r.q, r: r.r });
    const siteScore = fertilityScore(lookup, best.hex, settings);
    const norm = normalizeStartSite(lookup, best.hex, siteScore, threshold, settings, resources, { mirrorOf });
    const site: SiteCandidate = { hex: best.hex, score: norm.score };

    // 4. Miroir : rotation 180° des terrains et des ressources.
    const fullTerrain: TerrainId[][] = [];
    for (let row = 0; row < full.height; row++) {
      const srcRow = row < halfH ? row : full.height - 1 - row;
      const line: TerrainId[] = [];
      for (let col = 0; col < full.width; col++) {
        const srcCol = row < halfH ? col : full.width - 1 - col;
        line.push(geo.terrain[srcRow]![srcCol]!);
      }
      fullTerrain.push(line);
    }
    // 4bis. Phase 6c : classification des eaux sur la CARTE COMPLÈTE —
    // côte (eau adjacente à de la terre, à ≤ coastWidth cases) vs océan
    // profond. Le calcul sur la demi-carte serait faux le long de son bord
    // ouvert (axe de miroir) : on reflète d'abord, on classifie ensuite.
    const classified = classifyWaters(fullTerrain, settings.coastWidth);
    const mirror = mirroredHex(site.hex, full.width);
    const allResources: MapResource[] = [...resources];
    for (const r of resources) {
      const m = mirroredHex({ q: r.q, r: r.r }, full.width);
      allResources.push({ id: r.id, q: m.q, r: m.r });
    }
    // Aucune ressource sur une case de capitale (validation parseMap) — la
    // ressource du site n'entre pas dans son score (anneaux 1..3, case
    // centrale exclue) : le retrait ne fausse pas le checksum.
    const capitalKeys = new Set([`${site.hex.q},${site.hex.r}`, `${mirror.q},${mirror.r}`]);
    const finalResources = allResources.filter((r) => !capitalKeys.has(`${r.q},${r.r}`));
    // 4ter. Phase 6c (demande d'Erik) : garantie de couverture — au moins
    //    `minPerResourceType` 🔶 pose de CHAQUE type de ressource par joueur
    //    (demi-carte miroir : pérenne pour le multi-joueurs), espacement
    //    compris, capitales exclues.
    // L'anneau 1 des DEUX capitales reste sans ressource (Phase 6c) ET, depuis
    // SPAWN-START, tout le rayon 🔶 spawnPurgeRadius (anneaux 1 + 2) : la
    // garantie de couverture ne peut plus y poser quoi que ce soit.
    const spawnExclusion = new Set<string>(capitalKeys);
    for (const cap of [site.hex, mirror]) {
      for (const h of hexesWithinRadius(cap, settings.spawnPurgeRadius)) spawnExclusion.add(`${h.q},${h.r}`);
    }
    guaranteeResourceCoverage({
      rng,
      terrain: geo.terrain,
      resources: finalResources,
      exclude: spawnExclusion,
      s: settings,
      mirrorOf,
      onlyIds: landOnly,
    });
    // Ressources MARINES : posées sur la grille CLASSIFIÉE (côte seule —
    // l'océan reste stérile), garantie puis tirage, par paires miroir.
    placeMarineResources({
      rng,
      terrain: classified,
      resources: finalResources,
      exclude: spawnExclusion,
      s: settings,
      mirrorOf,
      halfHeight: halfH,
    });
    // SPAWN-START · ceinture et bretelles : AUCUNE ressource dans le rayon 🔶
    // des deux spawns sur la liste finale (l'exclusion ci-dessus devrait déjà
    // suffire — le filtre reste la garantie dure, fail-safe déterministe).
    const finalPurge = purgeResourcesNear(finalResources, [site.hex, mirror], settings.spawnPurgeRadius);
    finalResources.length = 0;
    finalResources.push(...finalPurge.kept);

    // 5. Villages (≥ 6 des deux spawns — leçon 7d) et huttes (≥ 3 🔶), posés
    //    sur la demi-carte puis reflétés : chaque entité existe deux fois,
    //    à l'identique pour chaque joueur (équité parfaite — handoff L2-2).
    //    Une ressource SOUS un village/hutte reste permise (parseMap, CivRev
    //    « villages always on top of a resource ») ; seules les collisions
    //    village/hutte/capitale sont exclues.
    const occupiedEntities = new Set<string>(capitalKeys);
    const spawnList = [site.hex, mirror];
    // Phase 6c : trois distances indépendantes 🔶 — villages entre eux
    // (villageSpacing), huttes entre elles (hutSpacing), huttes ↔ villages
    // (hutVillageSpacing : pas À CÔTÉ d'un village, mais plus près autorisé).
    const villagePositions: Hex[] = [];
    const villagesHalf = placeEntities({
      rng,
      terrain: geo.terrain,
      spawns: spawnList,
      minSpawnDistance: settings.minVillageDistance,
      same: villagePositions,
      minSame: settings.villageSpacing,
      other: [],
      minOther: 0,
      mirrorOf,
      reserved: occupiedEntities,
      count: settings.villagesPerHalf,
    });
    const hutPositions: Hex[] = [];
    const hutsHalf = placeEntities({
      rng,
      terrain: geo.terrain,
      spawns: spawnList,
      minSpawnDistance: settings.minHutDistance,
      same: hutPositions,
      minSame: settings.hutSpacing,
      other: villagePositions,
      minOther: settings.hutVillageSpacing,
      mirrorOf,
      reserved: occupiedEntities,
      count: settings.hutsPerHalf,
    });
    // Chaque entité de la demi-carte est reflétée : villages 2×3, huttes 2×2,
    // répartis à l'identique pour les deux joueurs (équité par miroir).
    const villages: MapVillage[] = [...villagesHalf];
    villages.push(...villagesHalf.map((v) => mirroredHex(v, full.width)));
    const huts: MapHut[] = [...hutsHalf];
    huts.push(...hutsHalf.map((h) => mirroredHex(h, full.width)));

    // 6. Checksum d'équité : les DEUX fertilités sont mesurées sur la carte
    //    complète (miroir + eaux classifiées) — l'image doit scorer exactement
    //    pareil (les sommes flottantes ne diffèrent que par l'ordre
    //    d'addition : on annule les différences < 1e-9, invisibles au gameplay).
    const fullLookup = halfMapLookup(classified, finalResources, full.width);
    const p1 = fertilityScore(fullLookup, site.hex, settings);
    const p2 = fertilityScore(fullLookup, mirror, settings);
    const rawDelta = Math.abs(p1 - p2);

    // 6bis. SPAWN-START · checksum étendu : la composition des deux voisinages
    //    (re-peints + eaux classifiées) doit être IDENTIQUE — par construction
    //    du miroir c'est le cas ; l'assertion fail-loud protège tout futur
    //    changement qui casserait la symétrie.
    const terrainAtFull = (h: Hex): TerrainId | undefined => classified[h.r]?.[h.q + Math.floor(h.r / 2)];
    const compositionP1 = spawnNeighborhoodComposition(terrainAtFull, site.hex);
    const compositionP2 = spawnNeighborhoodComposition(terrainAtFull, mirror);
    const canon = (c: Record<string, number>): string =>
      Object.entries(c).sort(([a], [b]) => (a < b ? -1 : 1)).map(([t, n]) => `${t}:${n}`).join(',');
    if (canon(compositionP1) !== canon(compositionP2)) {
      throw new ProgenPlacementError(
        `composition de voisinage déséquilibrée entre les deux spawns : {${canon(compositionP1)}} vs {${canon(compositionP2)}}`,
      );
    }

    const report: PlacementReport = {
      p1,
      p2,
      delta: rawDelta < 1e-9 ? 0 : rawDelta,
      topAverage,
      threshold,
      normalized: norm.normalized,
      candidates: candidates.length,
      spawn: {
        purgeRadius: settings.spawnPurgeRadius,
        purged: finalPurge.purged.length,
        compositionP1,
        compositionP2,
      },
    };

    return {
      terrain: classified,
      resources: finalResources,
      villages,
      huts,
      capitals: [site.hex, mirror],
      report,
    };
  },
};

/** Registre des stratégies injectables (aujourd'hui : mirror1v1 uniquement ;
 *  regionalMulti s'ajoutera ICI sans toucher à la géophysique). */
export const START_PLACEMENT_STRATEGIES: Record<string, StartPlacementStrategy> = {
  mirror1v1: MIRROR_1V1,
};

export function getStartPlacementStrategy(id: string): StartPlacementStrategy {
  const s = START_PLACEMENT_STRATEGIES[id];
  if (!s) throw new ProgenPlacementError(`stratégie de placement inconnue : "${id}"`);
  return s;
}

/** Utilitaire interne : appartenance d'une case à la carte finale (réexport test). */
export function hexInFullMap(hex: Hex, s: ProgenSettings): boolean {
  const size = MIRROR_1V1.fullSize(s);
  return inRectangle(hex, size.width, size.height);
}

/** Sous-graine de tentative : dérivation déterministe du seed de partie. */
export function attemptSeed(seed: number, attempt: number): number {
  return deriveSeed(seed, attempt);
}
