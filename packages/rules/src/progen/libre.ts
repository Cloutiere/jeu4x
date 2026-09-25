/**
 * CARTE-MULTI — Stratégie de placement LIBRE 3-5 joueurs (décision D1, veto
 * d'Erik du 24/09 : « la géométrie rotationnelle n'est plus recherchée du
 * tout »). AUCUNE symétrie : miroir comme rotation sont hors périmètre. La
 * carte entière est générée organiquement par la couche géophysique, puis les
 * N spawns sont CHOISIS par recherche seedée sur un critère d'équité
 * data-driven (métrique consignée dans le rapport) — l'équité vient du
 * PLACEMENT, pas de la géométrie :
 *
 *  1. ressources TERRESTRES posées sur la carte entière (garantie de
 *     couverture par joueur + tirage pondéré, zéro miroir) ;
 *  2. bassin des meilleurs sites par fertilité (libreCandidatePool 🔶) ;
 *  3. recherche : farthest-point sampling seedé (libreAttempts 🔶 restarts,
 *     premier départ tiré au RNG) + passes d'amélioration locale ;
 *     score(S) = Σ_{i<j} (d_ij − d̄)²  + libreCenterWeight·Σ_i (c_i − c̄)²
 *              + libreFertilityWeight·(fertilité max − min)
 *     (d_ij = distances pairwise, c_i = distance au centre de carte) —
 *     minimisé, tie-breaks R-81 ;
 *  4. porte d'acceptation 🔶 librePairSpreadMax : écart max−min des distances
 *     pairwise — sinon la tentative est rejetée (sous-graine suivante) ;
 *  5. R-157 PAR SPAWN (machinerie SPAWN-START existante) : voisinage forcé
 *     (re-paint 2F/2P/1E), purge des ressources au rayon 🔶 spawnPurgeRadius,
 *     normalisation (R-103) vers le seuil global — tolérante (un site
 *     infranormalisable est consigné, pas fatal) ;
 *  6. eaux classifiées, marines, villages/huttes (distances aux N spawns),
 *     artefacts — le tirage 7o (drawArtefacts) est DÉJÀ générique : rang par
 *     distance minimale à TOUTES les capitales (« équidistant des 5 spawns »).
 *
 * Villages/huttes : les totaux 1v1 (villagesPerHalf × 2 / hutsPerHalf × 2)
 * sont conservés comme DENSITÉ de référence quelle que soit N 🔶 (consigné au
 * rapport — densité barbares à l'œil d'Erik, D5).
 *
 * Pur, déterministe (R-80/R-81/R-82) : le RNG ne sert qu'aux restarts de la
 * recherche et aux tirages de poses ; même seed → même carte bit à bit.
 */
import { colRowToHex, compareHex, hexDistance, inRectangle, neighbors } from '../hex.js';
import type { Hex } from '../hex.js';
import type { MapHut, MapResource, MapVillage } from '../map.js';
import { RESOURCES, TERRAINS } from '../data.js';
import type { ResourceId, TerrainId } from '../types.js';
import type { SeededRng } from '../rng.js';
import { classifyWaters } from './geo.js';
import type { PhysicalMap } from './geo.js';
import { fertilityScore, ringCells } from './fertility.js';
import type { TerrainLookup } from './fertility.js';
import { placeEntities, placeResources, spacingViolated, waterOnlyResourceIds } from './content.js';
import { ProgenPlacementError, forceSpawnNeighborhood, purgeResourcesNear, normalizeStartSite, spawnNeighborhoodComposition } from './mirror.js';
import type { PlacementInput, PlacementOutput, PlacementReport, StartPlacementStrategy } from './mirror.js';
import type { ProgenSettings } from './settings.js';

// ---------------------------------------------------------------------------
// Lookup CARTE ENTIÈRE (aucun miroir) — lecture/écriture des ressources.
// ---------------------------------------------------------------------------

interface WritableLookup extends TerrainLookup {
  setResource(hex: Hex, id: ResourceId): void;
  deleteResource(hex: Hex): void;
}

export function fullMapLookup(grid: TerrainId[][], resources: MapResource[]): WritableLookup {
  const resourceMap = new Map<string, ResourceId>();
  for (const r of resources) resourceMap.set(`${r.q},${r.r}`, r.id);
  return {
    terrainAt(hex: Hex): TerrainId | undefined {
      return grid[hex.r]?.[hex.q + Math.floor(hex.r / 2)];
    },
    resourceAt(hex: Hex): ResourceId | null {
      return resourceMap.get(`${hex.q},${hex.r}`) ?? null;
    },
    setResource(hex: Hex, id: ResourceId): void {
      resourceMap.set(`${hex.q},${hex.r}`, id);
    },
    deleteResource(hex: Hex): void {
      resourceMap.delete(`${hex.q},${hex.r}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Garantie de couverture et ressources marines — variantes SANS miroir.
// ---------------------------------------------------------------------------

/** Garantie de couverture 6c généralisée : `playerCount × minPerResourceType`
 *  poses PAR TYPE de ressource (une pose = UNE case, pas de paire miroir),
 *  choix farthest-point déterministe (R-81), espacement 🔶 respecté, cases
 *   *  exclues (capitales + disques de spawn) interdites.
 *
 * TOLÉRANCE 🔶 CARTE-MULTI (consignée — vetoable) : sur une carte libre
 *  sans symétrie, une ressource RARE (ex. soufre — désert seul) peut ne pas
 *  offrir assez de cases éligibles pour N poses. La garantie est alors
 *  BEST-EFFORT : autant de poses que la carte le permet (aucune exception —
 *  100 % des seeds génèrent), le déficit PAR TYPE est renvoyé et consigné
 *  au rapport. */
export function guaranteeResourceCoverageLibre(input: {
  rng: SeededRng;
  terrain: TerrainId[][];
  resources: MapResource[];
  exclude: Set<string>;
  s: ProgenSettings;
  onlyIds?: Set<string>;
}): Record<string, number> {
  const manquants: Record<string, number> = {};
  const min = input.s.minPerResourceType;
  if (min <= 0) return manquants;
  const needTotal = input.s.playerCount * min;
  const height = input.terrain.length;
  const width = input.terrain[0]?.length ?? 0;
  const orderedIds = Object.keys(RESOURCES)
    .filter((id) => !input.onlyIds || input.onlyIds.has(id))
    .sort();
  for (const id of orderedIds) {
    const data = RESOURCES[id]!;
    let need = needTotal - input.resources.filter((r) => r.id === id).length;
    while (need > 0) {
      const occupied = new Set(input.resources.map((r) => `${r.q},${r.r}`));
      const candidates: Hex[] = [];
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          if (!data.terrains.includes(input.terrain[row]![col]!)) continue;
          const hex = colRowToHex(col, row);
          const key = `${hex.q},${hex.r}`;
          if (input.exclude.has(key) || occupied.has(key)) continue;
          if (spacingViolated(hex, input.resources, undefined, input.s.minResourceDistance)) continue;
          candidates.push(hex);
        }
      }
      if (candidates.length === 0) {
        // Aucune case éligible : le type reste en déficit (consigné au
        // rapport) — jamais d'exception (100 % des seeds génèrent).
        manquants[id] = (manquants[id] ?? 0) + need;
        break;
      }
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
      need -= 1;
    }
  }
  void input.rng; // farthest-point est déterministe — aucun tirage nécessaire
  return manquants;
}

/** Ressources marines SANS miroir : garantie par joueur puis tirage sur les
 *  cases de CÔTE (l'océan reste stérile — Erik, 02/09). Déterministe. */
export function placeMarineResourcesLibre(input: {
  rng: SeededRng;
  terrain: TerrainId[][];
  resources: MapResource[];
  exclude: Set<string>;
  s: ProgenSettings;
}): void {
  const marines = waterOnlyResourceIds().filter((id) => (RESOURCES[id]!.spawnWeight ?? 0) > 0);
  if (marines.length === 0) return;
  const grid = input.terrain;
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const isCoast = (h: Hex): boolean => grid[h.r]?.[h.q + Math.floor(h.r / 2)] === 'eau';
  const open = (h: Hex): boolean => {
    const key = `${h.q},${h.r}`;
    if (input.exclude.has(key)) return false;
    if (input.resources.some((r) => r.q === h.q && r.r === h.r)) return false;
    return true;
  };
  const placeable = (hex: Hex): boolean =>
    isCoast(hex) && open(hex) && !spacingViolated(hex, input.resources, undefined, input.s.minResourceDistance);

  // 1. Garantie : playerCount × minPerResourceType par id — farthest-point.
  const needTotal = input.s.playerCount * input.s.minPerResourceType;
  for (const id of marines.sort()) {
    let need = needTotal - input.resources.filter((r) => r.id === id).length;
    while (need > 0) {
      const candidates: Hex[] = [];
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          if (grid[row]![col] !== 'eau') continue;
          const hex = colRowToHex(col, row);
          if (placeable(hex)) candidates.push(hex);
        }
      }
      if (candidates.length === 0) break; // déficit marine (tolérance 🔶)
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
      need -= 1;
    }
  }

  // 2. Tirage pondéré sur TOUTES les cases de côte (probabilité 1v1 : 1/48 ×
  //    densité 🔶 — même densité quelle que soit N).
  const probability = (1 / 48) * input.s.resourceDensity;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (grid[row]?.[col] !== 'eau') continue;
      const hex = colRowToHex(col, row);
      if (input.rng.next() >= probability) continue;
      const pool = marines.map((id) => ({ id, weight: RESOURCES[id]!.spawnWeight ?? 0 }));
      const total = pool.reduce((acc, c) => acc + c.weight, 0);
      let roll = input.rng.next() * total;
      let picked = pool[pool.length - 1]!;
      for (const c of pool) {
        if (roll < c.weight) {
          picked = c;
          break;
        }
        roll -= c.weight;
      }
      if (placeable(hex)) input.resources.push({ id: picked.id as ResourceId, q: hex.q, r: hex.r });
    }
  }
}

// ---------------------------------------------------------------------------
// Recherche des N spawns — critère d'équité data-driven (métrique consignée).
// ---------------------------------------------------------------------------

interface SiteCandidate {
  hex: Hex;
  fertility: number;
}

/** Centre de carte canonique (déterministe, indépendant du seed) — hex le
 *  plus proche du milieu de la grille. */
export function centreDeCarte(width: number, height: number): Hex {
  return colRowToHex(Math.floor((width - 1) / 2), Math.floor((height - 1) / 2));
}

export interface EquiteScore {
  score: number;
  /** Écart max−min des distances pairwise (tolérance 🔶 librePairSpreadMax). */
  pairSpread: number;
  /** Somme des écarts absolus pairwise à la moyenne (métrique D1). */
  sommeEcarts: number;
}

/** Critère d'équité (métrique consignée — D1) :
 *  score = Σ_{i<j} (d_ij − d̄)² + wCentre·Σ_i (c_i − c̄)²
 *        + wFert·(fertilité max − min) — minimisé. */
export function scoreEnsemble(S: SiteCandidate[], centre: Hex, s: ProgenSettings): EquiteScore {
  const n = S.length;
  const dists: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) dists.push(hexDistance(S[i]!.hex, S[j]!.hex));
  }
  const dMean = dists.reduce((a, b) => a + b, 0) / dists.length;
  let pairVar = 0;
  for (const d of dists) pairVar += (d - dMean) * (d - dMean);
  const centres = S.map((c) => hexDistance(c.hex, centre));
  const cMean = centres.reduce((a, b) => a + b, 0) / n;
  let centreVar = 0;
  for (const c of centres) centreVar += (c - cMean) * (c - cMean);
  const fert = S.map((c) => c.fertility);
  const fertSpread = Math.max(...fert) - Math.min(...fert);
  const spread = Math.max(...dists) - Math.min(...dists);
  return {
    // Équidistance 🔶 : wSpread × spread² domine les grands écarts — la
    // recherche préfère un anneau régulier à un centrage parfait inégal.
    score:
      pairVar +
      s.libreCenterWeight * centreVar +
      s.libreFertilityWeight * fertSpread +
      s.libreSpreadWeight * spread * spread,
    pairSpread: Math.max(...dists) - Math.min(...dists),
    sommeEcarts: dists.reduce((acc, d) => acc + Math.abs(d - dMean), 0),
  };
}

const memeHex = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;
const trieEnsemble = (S: SiteCandidate[]): SiteCandidate[] => [...S].sort((a, b) => compareHex(a.hex, b.hex));

/** Une passe d'amélioration locale : chaque spawn (ordre (q,r)) est remplaçable
 *  par le meilleur candidat du bassin (best-improvement, pairwise ≥
 *  minSpawnDistance, tie R-81). Boucle jusqu'à stabilité (max 3 passes). */
function ameliorerEnsemble(S: SiteCandidate[], pool: SiteCandidate[], centre: Hex, s: ProgenSettings): SiteCandidate[] {
  let current = trieEnsemble(S);
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < current.length; i++) {
      const base = current.filter((_, j) => j !== i);
      let bestC = current[i]!;
      let bestScore = scoreEnsemble(current, centre, s).score;
      for (const c of pool) {
        if (base.some((b) => memeHex(b.hex, c.hex))) continue;
        if (base.some((b) => hexDistance(b.hex, c.hex) < s.minSpawnDistance)) continue;
        const trial = trieEnsemble([...base, c]);
        const sc = scoreEnsemble(trial, centre, s).score;
        if (sc < bestScore - 1e-9) {
          bestScore = sc;
          bestC = c;
        }
      }
      if (!memeHex(bestC.hex, current[i]!.hex)) {
        current = trieEnsemble([...base, bestC]);
        improved = true;
      }
    }
    if (!improved) break;
  }
  return current;
}

/** Recherche seedée : libreAttempts 🔶 restarts (farthest-point sampling — le
 *  premier départ est tiré au RNG, les suivants maximisent la distance au
 *  choix courant), amélioration locale, meilleur score globalement (tie :
 *  liste (q,r) lexicographique — R-81). Échec si AUCUN ensemble complet. */
export function choisirSpawns(pool: SiteCandidate[], rng: SeededRng, centre: Hex, s: ProgenSettings): SiteCandidate[] {
  const n = s.playerCount;
  let best: SiteCandidate[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let t = 0; t < s.libreAttempts; t++) {
    let S: SiteCandidate[] = [pool[rng.nextInt(pool.length)]!];
    while (S.length < n) {
      let pick: SiteCandidate | null = null;
      let pickDmin = -1;
      for (const c of pool) {
        if (S.some((x) => memeHex(x.hex, c.hex))) continue;
        if (S.some((x) => hexDistance(x.hex, c.hex) < s.minSpawnDistance)) continue;
        const dmin = Math.min(...S.map((x) => hexDistance(x.hex, c.hex)));
        // Maximise dmin, puis fertilité, puis (q,r) croissant — R-81.
        if (dmin > pickDmin || (dmin === pickDmin && pick && (c.fertility > pick.fertility || (c.fertility === pick.fertility && compareHex(c.hex, pick.hex) < 0)))) {
          pick = c;
          pickDmin = dmin;
        }
      }
      if (!pick) break;
      S.push(pick);
    }
    if (S.length < n) continue;
    S = ameliorerEnsemble(S, pool, centre, s);
    const sc = scoreEnsemble(S, centre, s);
    const lex = (A: SiteCandidate[], B: SiteCandidate[]): number => {
      for (let i = 0; i < A.length; i++) {
        const c = compareHex(A[i]!.hex, B[i]!.hex);
        if (c !== 0) return c;
      }
      return 0;
    };
    if (sc.score < bestScore - 1e-9 || (Math.abs(sc.score - bestScore) <= 1e-9 && best && lex(S, best) < 0)) {
      best = S;
      bestScore = sc.score;
    }
  }
  if (!best) throw new ProgenPlacementError(`aucun ensemble de ${n} spawns espacés d'au moins ${s.minSpawnDistance} n'est réalisable sur cette grille`);
  return trieEnsemble(best);
}

// ---------------------------------------------------------------------------
// Stratégie libreMulti.
// ---------------------------------------------------------------------------

/** Guerrier de départ : première voisine praticable, libre de
 *  ressource/village/hutte, triée (q, r) — déterminisme R-81 (source unique
 *  avec mirror : même algorithme, formes locales). */
function guerrierPour(
  terrain: TerrainId[][],
  resources: MapResource[],
  villages: MapVillage[],
  huts: MapHut[],
  capital: Hex,
): { type: string; q: number; r: number } {
  const taken = new Set<string>();
  for (const r of resources) taken.add(`${r.q},${r.r}`);
  for (const v of villages) taken.add(`${v.q},${v.r}`);
  for (const h of huts) taken.add(`${h.q},${h.r}`);
  const height = terrain.length;
  const width = terrain[0]?.length ?? 0;
  for (const n of neighbors(capital).sort(compareHex)) {
    if (!inRectangle(n, width, height)) continue;
    const t = terrain[n.r]?.[n.q + Math.floor(n.r / 2)];
    if (!t || !TERRAINS[t]!.passable) continue;
    if (taken.has(`${n.q},${n.r}`)) continue;
    return { type: 'guerrier', q: n.q, r: n.r };
  }
  throw new ProgenPlacementError(`aucune case libre praticable pour le Guerrier à côté de (${capital.q},${capital.r})`);
}

export const LIBRE_MULTI: StartPlacementStrategy = {
  id: 'libreMulti',

  geoSize(settings: ProgenSettings): { width: number; height: number } {
    if (settings.playerCount < 3 || settings.playerCount > 5) {
      throw new ProgenPlacementError(
        `libreMulti exige playerCount = 3..5 (reçu ${settings.playerCount}) — les parties à 2 restent sur mirror1v1 (D3)`,
      );
    }
    return { width: 40, height: 40 };
  },

  fullSize(): { width: number; height: number } {
    return { width: 40, height: 40 };
  },

  build({ rng, geo, settings }: PlacementInput): PlacementOutput {
    const n = settings.playerCount;
    if (geo.width !== 40 || geo.height !== 40) {
      throw new ProgenPlacementError(`grille géophysique ${geo.width}×${geo.height} incompatible avec la carte libre 40×40`);
    }
    const terrain = geo.terrain;
    const centre = centreDeCarte(geo.width, geo.height);

    // 1. Ressources TERRESTRES sur la carte entière (aucun miroir) : garantie
    //    de couverture par joueur, puis tirage pondéré (l'eau attend la
    //    classification — miroir du flux 6b).
    const waterOnly = new Set(waterOnlyResourceIds());
    const landOnly = new Set(Object.keys(RESOURCES).filter((id) => !waterOnly.has(id)));
    const resources: MapResource[] = [];
    const manquantsPre = guaranteeResourceCoverageLibre({ rng, terrain, resources, exclude: new Set<string>(), s: settings, onlyIds: landOnly });
    resources.push(...placeResources(rng, terrain, settings, { alreadyPlaced: resources, skipIds: waterOnly }).resources);

    // 2. Bassin des candidats : praticables, à 🔶 startMinEdgeDistance des
    //    bords, ≥ 1 voisine praticable libre pour le Guerrier — classés par
    //    fertilité (décroissante), pool 🔶 libreCandidatePool, tie R-81.
    const lookup = fullMapLookup(terrain, resources);
    const candidates: SiteCandidate[] = [];
    const e = settings.startMinEdgeDistance;
    for (let row = e; row < geo.height - e; row++) {
      for (let col = e; col < geo.width - e; col++) {
        const t = terrain[row]![col]!;
        if (!TERRAINS[t]!.passable) continue;
        const hex = colRowToHex(col, row);
        const freeNeighbor = neighbors(hex).some((nb) => {
          const nt = lookup.terrainAt(nb);
          return nt !== undefined && TERRAINS[nt]!.passable && lookup.resourceAt(nb) === null;
        });
        if (!freeNeighbor) continue;
        candidates.push({ hex, fertility: fertilityScore(lookup, hex, settings) });
      }
    }
    if (candidates.length === 0) throw new ProgenPlacementError('aucun site de capitale éligible sur la carte libre');
    const ranked = [...candidates].sort((a, b) => b.fertility - a.fertility || compareHex(a.hex, b.hex));
    const pool = ranked.slice(0, settings.libreCandidatePool);

    // 3. Seuil de normalisation global (R-103) : moyenne des 🔶 top sites ×
    //    facteur — mesuré sur le classement COMPLET (miroir du flux 1v1).
    const topCount = Math.min(settings.normalizationTopSites, ranked.length);
    const topAverage = ranked.slice(0, topCount).reduce((acc, c) => acc + c.fertility, 0) / topCount;
    const threshold = topAverage * settings.normalizationFactor;

    // 4. Recherche des N spawns (équité D1) + porte d'acceptation 🔶.
    const choisis = choisirSpawns(pool, rng, centre, settings);
    const equite = scoreEnsemble(choisis, centre, settings);
    if (equite.pairSpread > settings.librePairSpreadMax) {
      throw new ProgenPlacementError(
        `écart pairwise ${equite.pairSpread} > tolérance 🔶 ${settings.librePairSpreadMax} — tentative rejetée`,
      );
    }
    const sites = trieEnsemble(choisis);

    // 5. R-157 PAR SPAWN (machinerie SPAWN-START) — ordre (q,r) déterministe :
    //    a) voisinage forcé (re-paint 2F/2P/1E) — les sites sont distants de
    //       ≥ minSpawnDistance (12) : aucun anneau ne se chevauche ;
    //    b) purge des ressources au rayon 🔶 spawnPurgeRadius des N spawns ;
    //    c) normalisation R-103 vers le seuil global — TOLÉRANTE : un site
    //       infranormalisable (aucune case injectable en anneau 3) est
    //       consigné `normalized: false`, pas fatal (la fertilité fait déjà
    //       partie du critère d'équité).
    for (const site of sites) forceSpawnNeighborhood(terrain, site.hex, settings);
    const purge = purgeResourcesNear(resources, sites.map((s) => s.hex), settings.spawnPurgeRadius);
    resources.length = 0;
    resources.push(...purge.kept);
    const lookupPost = fullMapLookup(terrain, resources);
    let normalizedCount = 0;
    for (const site of sites) {
      const siteScore = fertilityScore(lookupPost, site.hex, settings);
      try {
        normalizeStartSite(lookupPost, site.hex, siteScore, threshold, settings, resources);
        normalizedCount += 1;
      } catch (err) {
        if (!(err instanceof ProgenPlacementError)) throw err;
        // Site infranormalisable : consigné (métrique d'équité déjà favorable).
      }
    }
    // Ressources éventuellement injectées : le lookup Post est jeté, la liste
    // `resources` fait foi (référence partagée avec normalizeStartSite).

    // 6. Classification des eaux sur la carte ENTIÈRE (côte vs océan), puis
    //    retrait défensif des ressources sous capitales + exclusion des
    //    disques de spawn pour la couverture, marines SANS miroir, purge finale.
    const classified = classifyWaters(terrain, settings.coastWidth);
    const capitalKeys = new Set(sites.map((s) => `${s.hex.q},${s.hex.r}`));
    const finalResources = resources.filter((r) => !capitalKeys.has(`${r.q},${r.r}`));
    const spawnExclusion = new Set<string>(capitalKeys);
    for (const site of sites) {
      for (const h of ringCells(site.hex, settings.spawnPurgeRadius)) spawnExclusion.add(`${h.q},${h.r}`);
    }
    const manquantsPost = guaranteeResourceCoverageLibre({ rng, terrain, resources: finalResources, exclude: spawnExclusion, s: settings, onlyIds: landOnly });
    // Déficits (pré + post — union par type) consignés au rapport 🔶.
    const couvertureManquants: Record<string, number> = { ...manquantsPre };
    for (const [id, m] of Object.entries(manquantsPost)) couvertureManquants[id] = (couvertureManquants[id] ?? 0) + m;
    placeMarineResourcesLibre({ rng, terrain: classified, resources: finalResources, exclude: spawnExclusion, s: settings });
    const finalPurge = purgeResourcesNear(finalResources, sites.map((s) => s.hex), settings.spawnPurgeRadius);
    finalResources.length = 0;
    finalResources.push(...finalPurge.kept);

    // 7. Villages & huttes : distances aux N spawns (brique placeEntities
    //    déjà générique — spawns: Hex[]), TOTAUX 1v1 (villagesPerHalf × 2 /
    //    hutsPerHalf × 2 🔶 — densité de référence conservée, D5).
    const occupiedEntities = new Set<string>(capitalKeys);
    const spawnList = sites.map((s) => s.hex);
    const villagePositions: Hex[] = [];
    const villages: MapVillage[] = placeEntities({
      rng,
      terrain,
      spawns: spawnList,
      minSpawnDistance: settings.minVillageDistance,
      same: villagePositions,
      minSame: settings.villageSpacing,
      other: [],
      minOther: 0,
      reserved: occupiedEntities,
      count: settings.villagesPerHalf * 2,
    });
    const hutPositions: Hex[] = [];
    const huts: MapHut[] = placeEntities({
      rng,
      terrain,
      spawns: spawnList,
      minSpawnDistance: settings.minHutDistance,
      same: hutPositions,
      minSame: settings.hutSpacing,
      other: villagePositions,
      minOther: settings.hutVillageSpacing,
      reserved: occupiedEntities,
      count: settings.hutsPerHalf * 2,
    });

    // 8. Rapport : fertilité PAR SPAWN (carte finale classifiée), R-157 par
    //    spawn, métrique d'équité complète (distances au centre, pairwise).
    const finalLookup = fullMapLookup(classified, finalResources);
    const terrainAtFull = (h: Hex): TerrainId | undefined => classified[h.r]?.[h.q + Math.floor(h.r / 2)];
    const spawnsReport = sites.map((site, i) => {
      const fert = fertilityScore(finalLookup, site.hex, settings);
      return {
        id: `p${i + 1}`,
        capital: site.hex,
        fertility: fert,
        distanceCentre: hexDistance(site.hex, centre),
        composition: spawnNeighborhoodComposition(terrainAtFull, site.hex),
      };
    });
    const pairwise: Array<{ a: string; b: string; distance: number }> = [];
    for (let i = 0; i < spawnsReport.length; i++) {
      for (let j = i + 1; j < spawnsReport.length; j++) {
        pairwise.push({
          a: spawnsReport[i]!.id,
          b: spawnsReport[j]!.id,
          distance: hexDistance(spawnsReport[i]!.capital, spawnsReport[j]!.capital),
        });
      }
    }

    const report: PlacementReport = {
      p1: spawnsReport[0]!.fertility,
      p2: spawnsReport[spawnsReport.length - 1]!.fertility,
      delta: Math.max(...spawnsReport.map((s) => s.fertility)) - Math.min(...spawnsReport.map((s) => s.fertility)),
      topAverage,
      threshold,
      normalized: normalizedCount === sites.length,
      candidates: candidates.length,
      spawn: {
        purgeRadius: settings.spawnPurgeRadius,
        purged: finalPurge.purged.length,
        compositionP1: spawnsReport[0]!.composition,
        compositionP2: spawnsReport[spawnsReport.length - 1]!.composition,
      },
      multi: {
        joueurCount: n,
        spawns: spawnsReport,
        pairwise,
        equiteScore: equite.score,
        pairSpread: equite.pairSpread,
        sommeEcarts: equite.sommeEcarts,
        normalises: normalizedCount,
        couvertureManquants,
      },
    };

    return {
      terrain: classified,
      resources: finalResources,
      villages,
      huts,
      capitals: spawnList,
      report,
    };
  },
};

