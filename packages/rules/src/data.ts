/**
 * Tables de données chargées (content-driven — DESIGN.md §4.2) : les stats
 * d'unités, les terrains et les bâtiments vivent en JSON ; ajouter du contenu
 * ne touche pas au code moteur. Les constantes T-xx restent dans constants.ts.
 */
import unitsJson from './data/units.json' with { type: 'json' };
import terrainJson from './data/terrain.json' with { type: 'json' };
import buildingsJson from './data/buildings.json' with { type: 'json' };
import resourcesJson from './data/resources.json' with { type: 'json' };
import barbaresJson from './data/barbares.json' with { type: 'json' };
import huttesJson from './data/huttes.json' with { type: 'json' };
import cultureJson from './data/culture.json' with { type: 'json' };
import espionnageJson from './data/espionnage.json' with { type: 'json' };
import figuresJson from './data/figures.json' with { type: 'json' };
import type {
  BarbariansData,
  BuildingData,
  CultureData,
  HuttesData,
  EspionnageData,
  FiguresData,
  ResourceData,
  TerrainData,
  TerrainId,
  UnitTypeData,
} from './types.js';

export const UNIT_TYPES: Record<string, UnitTypeData> = unitsJson as Record<string, UnitTypeData>;
export const TERRAINS: Record<string, TerrainData> = terrainJson as Record<string, TerrainData>;
export const BUILDINGS: Record<string, BuildingData> = buildingsJson as Record<string, BuildingData>;
export const RESOURCES: Record<string, ResourceData> = resourcesJson as Record<string, ResourceData>;
/** R-95/R-99 · Phase 7d : configuration barbares (barbares.json). */
export const BARBARIANS: BarbariansData = barbaresJson as unknown as BarbariansData;
/** R-98/R-99 · Phase 7d : table des récompenses de huttes (huttes.json). */
export const HUT_REWARDS: HuttesData = huttesJson as unknown as HuttesData;
/** 7f · Phase 7f : constantes culturelles (culture.json — T-27, jalons). */
export const CULTURE: CultureData = cultureJson as unknown as CultureData;
/** 7j · R-126 · Figures historiques par classe de GP + tech associée (ciblage R-127). */
export const FIGURES = figuresJson as unknown as FiguresData;
/** 7m · R-138..R-144 · Configuration espionnage (espionnage.json — T-33..T-35). */
export const ESPIONNAGE_DATA: EspionnageData = espionnageJson as unknown as EspionnageData;
/** R-95 · Id du pseudo-joueur barbare. */
export const BARBARIAN_ID: string = BARBARIANS.barbarianId;

export function unitType(id: string): UnitTypeData {
  const t = UNIT_TYPES[id];
  if (!t) throw new Error(`Type d'unité inconnu : ${id}`);
  return t;
}

/** 7m · R-142/R-143 : l'entité est-elle un ESPION (isolé ou réseau — une
 *  armée d'espions porte le même type, R-142) ? Structurel : accepte toute
 *  forme { type } (unité d'état, fixture). */
export function isSpyUnit(u: { type: string }): boolean {
  return unitType(u.type).spy === true;
}

export function terrain(id: TerrainId): TerrainData {
  const t = TERRAINS[id];
  if (!t) throw new Error(`Terrain inconnu : ${id}`);
  return t;
}

/** Phase 6c : les terrains d'eau sont EXACTEMENT ceux qui portent le hook
 *  naval (`navalAccess` — Mer = côte, Océan = large). Prédicat data-driven :
 *  ajouter une eau demain = une entrée terrain.json, pas de code. */
export function isWaterTerrain(id: TerrainId): boolean {
  return TERRAINS[id]?.navalAccess !== undefined;
}

/** R-66 : bâtiment par id (Grenier, Atelier, Mine de fer, Comptoir, Port, Tribunal). */
export function building(id: string): BuildingData {
  const b = BUILDINGS[id];
  if (!b) throw new Error(`Bâtiment inconnu : ${id}`);
  return b;
}

/** R-91 : ressource par id (resources.json). */
export function resource(id: string): ResourceData {
  const r = RESOURCES[id];
  if (!r) throw new Error(`Ressource inconnue : ${id}`);
  return r;
}

/**
 * Extension de la table d'unités réservée aux tests (R-59 : aucune unité à
 * distance en v1, mais leurs règles sont normatives). Ne jamais appeler en
 * production : la table v1 est validée par tests/data.test.ts.
 */
export function registerTestUnitType(data: UnitTypeData): void {
  UNIT_TYPES[data.id] = data;
}
