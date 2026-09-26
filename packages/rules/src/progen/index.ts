/**
 * Phase 6b — Générateur procédural de cartes (orchestration).
 *
 * Contrainte architecturale (handoff) : le générateur vit dans
 * packages/rules/src/progen/ — PUR, DÉTERMINISTE (R-80), SANS IO. Il produit
 * un `MapData` au FORMAT EXACT des cartes préfabriquées et passe la MÊME
 * validation (`parseMap`) : le loader, l'admin et les migrations d'entités
 * se réutilisent tels quels.
 *
 * Séparation des couches :
 *  - `geo.ts` (L0, géophysique) : génère une grille complète, ne connaît RIEN
 *    du miroir ;
 *  - `mirror.ts` (stratégie injectable `StartPlacementStrategy`) : découpe,
 *    place départs et contenu, reflète. Ajouter le 2-5 joueurs = implémenter
 *    `regionalMulti` derrière la même interface (voir README du module).
 *
 * Déterminisme : le seed de partie est la graine maîtresse ; chaque tentative
 * dérive une sous-graine (deriveSeed). Une partie « procedural-40 » est donc
 * rejouable à l'identique depuis `meta.seed`.
 */
import { inRectangle, neighbors, tileKeyOf } from '../hex.js';
import type { Hex } from '../hex.js';
import { parseMap } from '../map.js';
import type { LoadedMap, MapData, MapPlayerSpawn } from '../map.js';
import { TERRAINS, isWaterTerrain } from '../data.js';
import type { TerrainId } from '../types.js';
import { createRng } from '../rng.js';
import { artefactsForMap } from '../artefacts.js';
import { resolveProgenSettings } from './settings.js';
import type { ProgenSettings } from './settings.js';
import { generateTerrain } from './geo.js';
import type { PhysicalMap } from './geo.js';
import { getStartPlacementStrategy, attemptSeed, ProgenPlacementError, registerStrategy } from './mirror.js';
import type { StartPlacementStrategy, PlacementOutput, PlacementReport } from './mirror.js';
import { LIBRE_MULTI } from './libre.js';

// CARTE-MULTI : enregistrement de la stratégie libre (3-5 joueurs) — fait ICI
// (et non dans mirror.ts) pour éviter tout cycle d'imports.
registerStrategy('libreMulti', LIBRE_MULTI);
import { fertilityScore } from './fertility.js';
import type { TerrainLookup } from './fertility.js';

/** Identifiant de la carte procédurale (MapId côté protocole). */
export const PROCEDURAL_MAP_ID = 'procedural-40';

export class ProgenGenerationError extends Error {
  attempts: number;
  constructor(attempts: number, cause: string) {
    super(`génération procédurale impossible après ${attempts} tentative(s) : ${cause}`);
    this.attempts = attempts;
  }
}

/** Rapport de génération — consigné dans le dump admin (handoff L1-5/L3-3). */
export interface ProgenReport {
  seed: number;
  strategy: string;
  settings: ProgenSettings;
  attempts: number;
  /** Ratio terre réalisé (cases de terre / cases totales). */
  landTiles: number;
  landRatio: number;
  /** Phase 6c : répartition des eaux classifiées (côte vs océan profond). */
  coastTiles: number;
  oceanTiles: number;
  /** 7o · R-151 : artefacts tirés et posés (reliques). */
  counts: { resources: number; villages: number; huts: number; artefacts: number };
  /** Checksum d'équité : fertilité des 2 spawns sur la carte complète. */
  fertility: {
    p1: number;
    p2: number;
    delta: number;
    topAverage: number;
    threshold: number;
    normalized: boolean;
    candidates: number;
  };
  /** SPAWN-START (demande d'Erik 05/09) : garantie de voisinage du départ —
   *  rayon sans ressource, ressources purgées, composition des voisinages
   *  (checksum d'équité étendu : compositionP1 = compositionP2). */
  spawn: {
    purgeRadius: number;
    purged: number;
    compositionP1: Record<string, number>;
    compositionP2: Record<string, number>;
  };
  /** CARTE-MULTI (libreMulti uniquement) : équité du placement libre —
   *  fertilité/composition PAR spawn, distances pairwise, métrique D1. */
  multi?: PlacementReport['multi'];
  connected: boolean;
}

export interface ProceduralMapResult {
  map: LoadedMap;
  report: ProgenReport;
}

/** Légende du générateur : 1 caractère par terrain de terrain.json. */
export const PROGEN_LEGEND: Record<string, TerrainId> = {
  '.': 'prairie',
  ',': 'plaine',
  f: 'foret',
  h: 'colline',
  m: 'montagne',
  d: 'desert',
  '~': 'eau',
  O: 'ocean',
};

const CHAR_BY_TERRAIN: Record<TerrainId, string> = {
  prairie: '.',
  plaine: ',',
  foret: 'f',
  colline: 'h',
  montagne: 'm',
  desert: 'd',
  eau: '~',
  ocean: 'O',
  ville: '.', // jamais généré (posé par createInitialState sur la capitale)
  cratere: '.', // jamais généré (7n · C15 : formé à l'exécution par une frappe nucléaire)
};

/** Assemble le MapData au format des cartes préfabriquées. */
function assembleMapData(seed: number, settings: ProgenSettings, out: PlacementOutput, strategy: StartPlacementStrategy): MapData {
  const size = strategy.fullSize(settings);
  const rows: string[] = out.terrain.map((line) => line.map((t) => CHAR_BY_TERRAIN[t]).join(''));
  const players: MapPlayerSpawn[] = out.capitals.map((capital, i) => {
    const guerrier = warriorSpawn(out, capital);
    if (!guerrier) {
      throw new ProgenPlacementError(
        `aucune case libre praticable pour le Guerrier de p${i + 1} à côté du site de départ`,
      );
    }
    // Phase 6c (Erik) : démarrage Colon + Guerrier SANS capitale — le Colon
    // occupe le site réservé (coût de fondation nul) et fondera quand il veut.
    return {
      id: `p${i + 1}`,
      capital: { ...capital },
      units: [
        { type: 'colon', q: capital.q, r: capital.r },
        guerrier,
      ],
    };
  });
  return {
    id: PROCEDURAL_MAP_ID,
    name: `Carte aléatoire (seed ${seed})`,
    width: size.width,
    height: size.height,
    legend: { ...PROGEN_LEGEND },
    rows,
    players,
    resources: out.resources,
    villages: out.villages,
    huts: out.huts,
    start: 'colon',
  };
}

/** Guerrier de départ : première case adjacente praticable, libre de
 *  ressource/village/hutte, triée (q, r) — déterminisme R-81. */
function warriorSpawn(out: PlacementOutput, capital: Hex): { type: string; q: number; r: number } | null {
  const taken = new Set<string>();
  for (const r of out.resources) taken.add(`${r.q},${r.r}`);
  for (const v of out.villages) taken.add(`${v.q},${v.r}`);
  for (const h of out.huts) taken.add(`${h.q},${h.r}`);
  for (const n of neighbors(capital)) {
    if (!inRectangle(n, out.terrain.length > 0 ? out.terrain[0]!.length : 0, out.terrain.length)) continue;
    const row = n.r;
    const col = n.q + Math.floor(n.r / 2);
    const t = out.terrain[row]?.[col];
    if (!t || !TERRAINS[t]!.passable) continue;
    if (taken.has(`${n.q},${n.r}`)) continue;
    return { type: 'guerrier', q: n.q, r: n.r };
  }
  return null;
}

/** BFS sur cases praticables : les deux spawns sont-ils reliés à pied ? */
export function landConnected(map: LoadedMap, from: Hex, to: Hex): boolean {
  const [a, b] = map.spawns;
  const start = from ?? a?.capital;
  const target = to ?? b?.capital;
  if (!start || !target) return false;
  const queue: Hex[] = [start];
  const seen = new Set<string>([tileKeyOf(start)]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.q === target.q && current.r === target.r) return true;
    for (const n of neighbors(current)) {
      const key = tileKeyOf(n);
      if (seen.has(key)) continue;
      const t = map.terrain[key];
      if (!t || !TERRAINS[t]!.passable) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return false;
}

/** CARTE-MULTI : BFS depuis le premier spawn — TOUS les spawns sont-ils
 *  reliés à pied ? (connexité exigée hors archipel.) */
export function spawnsTousRelies(map: LoadedMap): boolean {
  const spawns = map.spawns;
  if (spawns.length < 2) return false;
  const start = spawns[0]!.capital;
  const seen = new Set<string>([tileKeyOf(start)]);
  const queue: Hex[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const n of neighbors(current)) {
      const key = tileKeyOf(n);
      if (seen.has(key)) continue;
      const t = map.terrain[key];
      if (!t || !TERRAINS[t]!.passable) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return spawns.every((s) => seen.has(tileKeyOf(s.capital)));
}

/**
 * Génère une carte procédurale complète : géophysique → stratégie de
 * placement → MapData → validation parseMap → connexité → checksum.
 * Les tentatives (sous-graines dérivées) absorbent les rares grilles sans
 * site/connexion éligibles — le résultat reste 100 % déterministe.
 */
export function generateProceduralMap(
  seed: number,
  overrides?: Partial<ProgenSettings>,
  strategy?: StartPlacementStrategy,
): ProceduralMapResult {
  const settings = resolveProgenSettings(overrides);
  const strat = strategy ?? getStartPlacementStrategy(settings.startPlacement);
  const master = seed >>> 0;
  let lastCause = 'cause inconnue';
  // LOBBY-5 (fix CI 26/09) : tolérance d'ÉQUIDISTANCE ÉVOLUTIVE (libreMulti).
  // Certaines graines à 5 spawns n'atteignent JAMAIS l'écart pairwise 🔶 8 en
  // 10 tentatives → ProgenGenerationError non rattrapée → le worker crashait.
  // Désormais les 2 premières tentatives visent le calibrage d'Erik, puis la
  // tolérance s'assouplit de +1 toutes les 2 tentatives (≤ +4 au total) :
  // préférence pour les cartes équitables, échec quasi impossible, et
  // DÉTERMINISME CONSERVÉ (même seed → même escalade → même carte).
  const toleranceDe = (attempt: number): number =>
    settings.librePairSpreadMax + Math.floor((attempt - 1) / 2);

    for (let attempt = 1; attempt <= settings.maxAttempts; attempt++) {
      const rng = createRng(attemptSeed(master, attempt));
      const settingsTentative =
        settings.startPlacement === 'libreMulti' && attempt > 1
          ? { ...settings, librePairSpreadMax: toleranceDe(attempt) }
          : settings;
      try {
        const geoSize = strat.geoSize(settingsTentative);
        const geo: PhysicalMap = generateTerrain(
          rng,
          settingsTentative,
          geoSize.width,
          geoSize.height,
          { openBottom: geoSize.openBottom ?? false },
        );
      const out = strat.build({ rng, geo, settings: settingsTentative });
      const data = assembleMapData(master, settings, out, strat);
      // Validation intégrale : le générateur passe par la MÊME porte que les
      // cartes préfabriquées (aucun changement du loader — critère #3).
      const map = parseMap(data);

      // 7o · R-151/R-152 : tirage et placement des artefacts (déterministe —
      // graine dédiée dérivée du seed de partie ; Atlantide en haute mer,
      // priorité aux îles). Portés par le MapData (labo #/progen, dump admin)
      // et repris tels quels par createInitialState.
      const artefacts = artefactsForMap(map, master);
      data.artefacts = artefacts.map((a) => ({ artefactId: a.artefactId, q: a.q, r: a.r }));
      const loaded: LoadedMap = { ...map, artefacts };

      const [s1, s2] = loaded.spawns;
      if (!s1 || !s2) throw new ProgenPlacementError('spawns manquants');
      // CARTE-MULTI : à 3+ spawns, la connexité terrestre (pangée/deux
      // continents) exige que TOUS les spawns soient reliés entre eux.
      const connected =
        loaded.spawns.length === 2
          ? landConnected(loaded, s1.capital, s2.capital)
          : spawnsTousRelies(loaded);
      // Archipel : les spawns peuvent être sur des îles séparées — la
      // connexité terrestre n'est PAS requise (contact au naval, Phase 7).
      if (!connected && settings.continents !== 3) {
        throw new ProgenPlacementError('pas de connexion terrestre entre les spawns');
      }

      let landTiles = 0;
      let coastTiles = 0;
      let oceanTiles = 0;
      for (const t of Object.values(loaded.terrain)) {
        if (isWaterTerrain(t as TerrainId)) {
          if (t === 'ocean') oceanTiles += 1;
          else coastTiles += 1;
        } else {
          landTiles += 1;
        }
      }
      const totalTiles = data.width * data.height;

      const lookup: TerrainLookup = {
        terrainAt: (h) => loaded.terrain[tileKeyOf(h)] as TerrainId | undefined,
        resourceAt: (h) => {
          const key = tileKeyOf(h);
          const found = loaded.resources.find((r) => tileKeyOf({ q: r.q, r: r.r }) === key);
          return found ? found.id : null;
        },
      };
      const p1 = fertilityScore(lookup, s1.capital, settings);
      const p2 = fertilityScore(lookup, s2.capital, settings);
      // Sommes flottantes : l'ordre d'addition diffère entre P1 et P2 →
      // toute différence < 1e-9 est une nullité flottante, pas un déséquilibre.
      const rawDelta = Math.abs(p1 - p2);

      const report: ProgenReport = {
        seed: master,
        strategy: strat.id,
        settings,
        attempts: attempt,
        landTiles,
        landRatio: landTiles / totalTiles,
        coastTiles,
        oceanTiles,
        counts: { resources: loaded.resources.length, villages: loaded.villages.length, huts: loaded.huts.length, artefacts: loaded.artefacts.length },
        fertility: {
          p1,
          p2,
          // Mode libre : le delta n'est PAS p1−p2 (plus que 2 spawns) —
          // écart max−min de fertilité sur les N spawns (checksum d'équité D1).
          delta: out.report.multi ? out.report.delta : rawDelta < 1e-9 ? 0 : rawDelta,
          topAverage: out.report.topAverage,
          threshold: out.report.threshold,
          normalized: out.report.normalized,
          candidates: out.report.candidates,
        },
        spawn: out.report.spawn,
        multi: out.report.multi,
        connected,
      };
      return { map: loaded, report };
    } catch (err) {
      if (err instanceof ProgenPlacementError) {
        lastCause = err.message;
        continue;
      }
      throw err; // MapValidationError = bug d'assemblage : fail loud
    }
  }
  throw new ProgenGenerationError(settings.maxAttempts, lastCause);
}

/** Raccourci d'intégration (GameDO) : la carte seule. */
export function generateMap(seed: number, overrides?: Partial<ProgenSettings>): LoadedMap {
  return generateProceduralMap(seed, overrides).map;
}

/** Représentation « rendements de rendu » : fertilité par case (heatmap labo). */
export function fertilityHeatmap(map: LoadedMap, settings?: Partial<ProgenSettings>): Record<string, number> {
  const s = resolveProgenSettings(settings);
  const lookup: TerrainLookup = {
    terrainAt: (h) => map.terrain[tileKeyOf(h)] as TerrainId | undefined,
    resourceAt: (h) => {
      const key = tileKeyOf(h);
      const found = map.resources.find((r) => tileKeyOf({ q: r.q, r: r.r }) === key);
      return found ? found.id : null;
    },
  };
  const scores: Record<string, number> = {};
  for (const [key] of Object.entries(map.terrain)) {
    const hex = { q: Number(key.split(',')[0]), r: Number(key.split(',')[1]) };
    scores[key] = Math.round(fertilityScore(lookup, hex, s) * 10) / 10;
  }
  return scores;
}

// Réexports utiles au serveur et au labo.
export { resolveProgenSettings, DEFAULT_PROGEN_SETTINGS } from './settings.js';
export type { ProgenSettings, StartPlacementId } from './settings.js';
export { TOPOGRAPHIES, topographieParId } from './settings.js';
export type { Topographie } from './settings.js';
export { guaranteeResourceCoverage } from './mirror.js';
export { forceSpawnNeighborhood, purgeResourcesNear, spawnNeighborhoodComposition, productiveFreeTile } from './mirror.js';
export type { StartPlacementStrategy, PlacementOutput, PlacementReport } from './mirror.js';
export { MIRROR_1V1, START_PLACEMENT_STRATEGIES, attemptSeed } from './mirror.js';
export { LIBRE_MULTI } from './libre.js';
export { centreDeCarte, scoreEnsemble, choisirSpawns } from './libre.js';
export { fertilityScore, tileFertility, ringCells } from './fertility.js';
export type { TerrainLookup } from './fertility.js';
export { generateTerrain, classifyWaters } from './geo.js';
export type { PhysicalMap } from './geo.js';
export { placeResources, placeEntities } from './content.js';
export { isWaterTerrain } from '../data.js';
export { countResourcesByTerrain, countTerrainTypes } from './counting.js';
export type { ResourceTerrainCounts, TerrainCountRow } from './counting.js';
export { deriveSeed } from './noise.js';
