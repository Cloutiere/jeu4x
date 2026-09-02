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
import { colRowToHex, hexDistance, inRectangle, neighbors, compareHex } from '../hex.js';
import type { Hex } from '../hex.js';
import type { MapResource, MapVillage, MapHut } from '../map.js';
import type { ResourceId, TerrainId } from '../types.js';
import { RESOURCES, TERRAINS } from '../data.js';
import type { SeededRng } from '../rng.js';
import type { PhysicalMap } from './geo.js';
import { classifyWaters } from './geo.js';
import { fertilityScore, ringCells } from './fertility.js';
import type { TerrainLookup } from './fertility.js';
import { placeResources, placeEntities, spacingViolated } from './content.js';
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
  };
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
  // ressource — les injections de normalisation ne visent que l'anneau 2.
  const injectable = ringCells(site, 2).filter((c) => {
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
    const guaranteed: MapResource[] = [];
    guaranteeResourceCoverage({
      rng,
      terrain: geo.terrain,
      resources: guaranteed,
      exclude: new Set<string>(),
      s: settings,
      mirrorOf,
    });
    const resPlacement = placeResources(rng, geo.terrain, settings, { mirrorOf, alreadyPlaced: guaranteed });
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
        // Phase 6c (demande d'Erik) : anneau de départ ÉQUILIBRÉ — au moins
        // 🔶 startMinRingPrairie prairies et 🔶 startMinRingForest forêts parmi
        // les 6 voisines, et AUCUNE ressource dans l'anneau (le site de départ
        // « ne coûte aucun PM » et ne doit rien devoir à la chance des poses).
        let prairie = 0;
        let forest = 0;
        let ringResource = false;
        for (const n of neighbors(hex)) {
          const nt = lookup.terrainAt(n);
          if (nt === 'prairie') prairie += 1;
          else if (nt === 'foret') forest += 1;
          if (lookup.resourceAt(n) !== null) ringResource = true;
        }
        if (prairie < settings.startMinRingPrairie) continue;
        if (forest < settings.startMinRingForest) continue;
        if (ringResource) continue;
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

    // 3. Meilleur site + normalisation (PDF §NormalizeStartLocation) : les
    //    anneaux 1-2 du site restent dans la demi-carte (rows ≤ 17+2).
    const best = ranked[0]!;
    const norm = normalizeStartSite(lookup, best.hex, best.score, threshold, settings, resources, { mirrorOf });
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
    // L'anneau 1 des DEUX capitales reste sans ressource (Phase 6c) : la
    // garantie de couverture ne peut plus y poser quoi que ce soit.
    const capitalRings = new Set<string>(capitalKeys);
    for (const cap of [site.hex, mirror]) {
      for (const n of neighbors(cap)) capitalRings.add(`${n.q},${n.r}`);
    }
    guaranteeResourceCoverage({
      rng,
      terrain: geo.terrain,
      resources: finalResources,
      exclude: capitalRings,
      s: settings,
      mirrorOf,
    });

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

    const report: PlacementReport = {
      p1,
      p2,
      delta: rawDelta < 1e-9 ? 0 : rawDelta,
      topAverage,
      threshold,
      normalized: norm.normalized,
      candidates: candidates.length,
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
