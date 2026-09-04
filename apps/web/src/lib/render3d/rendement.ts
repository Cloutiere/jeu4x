/**
 * rendement — pont entre le moteur (@game/rules) et la lueur des glyphes 3D
 * (chantier V1, L2). Miroir EXACT des helpers moteur partagés : aucune
 * logique de rendement dupliquée — les cases travaillées passent par
 * `tileYield` (bâtiments R-66, bonus de civilisation R-146, ressources R-93,
 * merveilles R-132), les autres gardent base + ressource identifiée (même
 * règle que l'overlay 2D de GameCanvas).
 */
import { allKnownTechs, tileKeyOf, tileYield } from '@game/rules';
import type { GameState, TileKey } from '@game/rules';
import type { Allumage3D } from './world3d.js';

/** Contexte de calcul du rendement pour UN joueur (le spectateur). */
export interface ContexteRendement {
  map: Parameters<typeof tileYield>[0];
  techs: readonly string[];
  /** Union des techs de tous les joueurs (obsolescence des merveilles, R-128). */
  tousTechs: readonly string[];
  civ?: { civId?: string; era: GameState['players'][string]['era'] };
  /** Ville qui travaille chaque case (centre inclus, R-60). */
  travaillePar: Map<TileKey, { buildings: string[]; wonders: string[] }>;
}

/** Construit le contexte de rendement du spectateur depuis l'état FILTRÉ. */
export function contexteRendement(state: GameState, myEngineId: string | null): ContexteRendement {
  const moi = myEngineId ? state.players[myEngineId] : undefined;
  const travaillePar = new Map<TileKey, { buildings: string[]; wonders: string[] }>();
  for (const city of Object.values(state.cities)) {
    travaillePar.set(tileKeyOf(city), { buildings: city.buildings, wonders: city.wonders ?? [] });
    for (const key of city.workedTiles) travaillePar.set(key, { buildings: city.buildings, wonders: city.wonders ?? [] });
  }
  return {
    map: state.map as Parameters<typeof tileYield>[0],
    techs: moi?.techsUnlocked ?? [],
    tousTechs: allKnownTechs(state),
    civ: moi && moi.civId !== 'neutre' ? { civId: moi.civId, era: moi.era } : undefined,
    travaillePar,
  };
}

/**
 * Allumage par famille d'une case (bus = nourriture, CPU = production,
 * RAM = commerce). Comptes bruts — world3d borne au potentiel affiché.
 * Case sans rendement (ville, cratère) : undefined (pas de glyphes de toute façon).
 */
export function allumeDe(ctx: ContexteRendement, key: TileKey): Allumage3D | undefined {
  const ville = ctx.travaillePar.get(key);
  const y = tileYield(
    ctx.map,
    ville ? ville.buildings : [],
    key,
    ctx.techs,
    ville?.wonders ?? [],
    ctx.tousTechs,
    ville && ctx.civ ? ctx.civ : undefined,
  );
  return y ? { bus: y.food, cpu: y.production, ram: y.commerce } : undefined;
}
