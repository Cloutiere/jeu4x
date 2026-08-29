/**
 * Tables de données chargées (content-driven — DESIGN.md §4.2) : les stats
 * d'unités et les terrains vivent en JSON ; ajouter du contenu ne touche pas
 * au code moteur. Les constantes T-xx restent dans constants.ts.
 */
import unitsJson from './data/units.json' with { type: 'json' };
import terrainJson from './data/terrain.json' with { type: 'json' };
import type { TerrainData, TerrainId, UnitTypeData } from './types.js';

export const UNIT_TYPES: Record<string, UnitTypeData> = unitsJson as Record<string, UnitTypeData>;
export const TERRAINS: Record<string, TerrainData> = terrainJson as Record<string, TerrainData>;

export function unitType(id: string): UnitTypeData {
  const t = UNIT_TYPES[id];
  if (!t) throw new Error(`Type d'unité inconnu : ${id}`);
  return t;
}

export function terrain(id: TerrainId): TerrainData {
  const t = TERRAINS[id];
  if (!t) throw new Error(`Terrain inconnu : ${id}`);
  return t;
}

/**
 * Extension de la table d'unités réservée aux tests (R-59 : aucune unité à
 * distance en v1, mais leurs règles sont normatives). Ne jamais appeler en
 * production : la table v1 est validée par tests/data.test.ts.
 */
export function registerTestUnitType(data: UnitTypeData): void {
  UNIT_TYPES[data.id] = data;
}
