/**
 * L5 — Brouillard de guerre à 3 états (R-70) : inexploré / exploré-masqué /
 * visible. Vision par distance uniquement (aucun blocage par terrain).
 *
 * Pilier architectural n°2 (DESIGN.md §1) : le filtrage est la dernière
 * opération avant diffusion — aucune entité ennemie hors du champ visible ne
 * quitte le moteur, et le journal d'événements est filtré avec la même règle
 * (un joueur n'apprend rien d'une zone qu'il ne voit pas).
 */
import { hexesWithinRadius, tileKeyOf } from './hex.js';
import type { GameState, PlayerId, TileKey } from './state.js';
import { RESOURCES, unitType } from './data.js';
import { filteredResource } from './resources.js';
import { VISION_RADIUS_CITY } from './constants.js';
import { eventRefs } from './events.js';
import type { GameEvent } from './events.js';

/** Cases actuellement visibles par le joueur (unités + villes amies). */
export function computeVisibleTiles(state: GameState, playerId: PlayerId): Set<TileKey> {
  const visible = new Set<TileKey>();
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== playerId) continue;
    for (const h of hexesWithinRadius(unit, unitType(unit.type).visionRadius)) {
      visible.add(tileKeyOf(h));
    }
  }
  for (const city of Object.values(state.cities)) {
    if (city.owner !== playerId) continue;
    for (const h of hexesWithinRadius(city, VISION_RADIUS_CITY)) {
      visible.add(tileKeyOf(h));
    }
  }
  // Seules les cases existant sur la carte sont visibles.
  for (const key of visible) {
    if (!state.map[key]) visible.delete(key);
  }
  return visible;
}

/**
 * Recalcule et persiste la vision de tous les joueurs dans l'état (Phase D,
 * R-70) : visible = disque des entités amies ; explored = ancien explored ∪ visible.
 * Opère sur une copie de travail — ne jamais appeler sur l'état du joueur.
 */
export function recomputeVision(state: GameState): void {
  for (const playerId of Object.keys(state.players).sort()) {
    const visible = computeVisibleTiles(state, playerId);
    const player = state.players[playerId]!;
    const explored = new Set(player.vision.explored);
    for (const key of visible) explored.add(key);
    player.vision = {
      explored: [...explored].sort(),
      visible: [...visible].sort(),
    };
  }
}

/** Types d'événements publics (diffusés tels quels). */
// 7n · R-147 : EraChanged est PUBLIC — l'ère est une information publique
// (comme la civ adverse, canon).
const PUBLIC_EVENTS: ReadonlySet<GameEvent['type']> = new Set([
  'TurnResolved',
  'Victory',
  'DiplomaticIncident',
  'EraChanged',
]);

/** L'événement implique-t-il directement le joueur (une de ses unités/villes) ? */
function eventTouchesPlayer(event: GameEvent, playerId: PlayerId, state: GameState): boolean {
  const refs = eventRefs(event);
  if (refs.players.includes(playerId)) return true;
  if ('owner' in event && event.owner === playerId) return true;
  for (const unitId of refs.unitIds) {
    const unit = state.units[unitId];
    if (unit && unit.owner === playerId) return true;
  }
  for (const cityId of refs.cityIds) {
    const city = state.cities[cityId];
    if (city && city.owner === playerId) return true;
  }
  return false;
}

/**
 * Journal filtré (R-70/R-73) : un joueur ne doit rien apprendre d'une zone
 * qu'il ne voit pas. Politique (simple et conservative, 🔶) :
 *  - événements publics (fin de tour, victoire, incident diplomatique) : passent ;
 *  - événement impliquant une entité du joueur : passe ;
 *  - sinon : passe seulement si toutes les cases référencées sont explorées
 *    et que toute unité/ville ennemie référencée est actuellement sur une case
 *    visible (évaluée sur l'état post-résolution).
 */
export function filterEventsForPlayer(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): GameEvent[] {
  const vision = state.players[playerId]?.vision ?? recomputeAndStore(state, playerId);
  const explored = new Set(vision.explored);
  const visible = new Set(vision.visible);

  return events.filter((event) => {
    if (PUBLIC_EVENTS.has(event.type)) return true;
    if (eventTouchesPlayer(event, playerId, state)) return true;
    const refs = eventRefs(event);
    for (const tile of refs.tiles) {
      if (!explored.has(tile)) return false;
    }
    for (const unitId of refs.unitIds) {
      const unit = state.units[unitId];
      if (!unit) {
        // Unité détruite : visible seulement si l'événement implique le joueur
        // (déjà traité ci-dessus) — sinon, aucune position à fuiter : passe si
        // la case de l'événement est explorée.
        continue;
      }
      if (unit.owner !== playerId && !visible.has(tileKeyOf(unit))) return false;
    }
    for (const cityId of refs.cityIds) {
      const city = state.cities[cityId];
      if (city && city.owner !== playerId && !visible.has(tileKeyOf(city))) return false;
    }
    return true;
  });
}

function recomputeAndStore(state: GameState, playerId: PlayerId) {
  const visible = computeVisibleTiles(state, playerId);
  const vision = { explored: [...visible].sort(), visible: [...visible].sort() };
  const player = state.players[playerId];
  if (player) player.vision = vision;
  return vision;
}

/**
 * État diffusé au joueur (R-70) :
 *  - cases inexplorées ABSENTES de `map` (pas seulement nulles) ;
 *  - aucune entité ennemie hors `visible` (unités et villes) ;
 *  - R-92 (D1 révisée) : l'identité des ressources est masquée quand il faut —
 *    une ressource dont la tech manque (`hiddenUntilRevealed: true`) est
 *    diffusée sous le marqueur `inconnue` (le joueur voit QU'IL Y A une
 *    ressource, pas laquelle) ; révélation passive de l'identité réelle au
 *    snapshot suivant le déblocage (comme R-85), aucun événement ;
 *  - la vision des autres joueurs est privée (vidée) ;
 *  - `rngSeed` remis à zéro : connaître la graine permettrait de prédire les
 *    combats futurs (le serveur, lui, conserve la vraie graine pour le
 *    crash-recovery — DESIGN.md §3.5).
 */
export function getFilteredState(state: GameState, playerId: PlayerId): GameState {
  const clone: GameState = structuredClone(state);
  const visible = computeVisibleTiles(state, playerId);
  const player = clone.players[playerId];
  const explored = new Set<string>(player?.vision.explored ?? []);
  for (const key of visible) explored.add(key);

  const techs = player?.techsUnlocked ?? [];
  const filteredMap: Record<string, GameState['map'][string]> = {};
  for (const [key, tile] of Object.entries(clone.map)) {
    if (!explored.has(key)) continue;
    // R-92 : masquer l'IDENTITÉ de la ressource tant que sa tech n'est pas
    // débloquée (marqueur « inconnue ») — la présence reste visible.
    if (tile.resource) {
      const filtered = filteredResource(RESOURCES[tile.resource] ?? null, techs);
      tile.resource = filtered;
    }
    filteredMap[key] = tile;
  }
  clone.map = filteredMap;

  for (const [unitId, unit] of Object.entries(clone.units)) {
    if (unit.owner !== playerId && !visible.has(tileKeyOf(unit))) {
      delete clone.units[unitId];
    }
  }
  for (const [cityId, city] of Object.entries(clone.cities)) {
    if (city.owner !== playerId && !visible.has(tileKeyOf(city))) {
      delete clone.cities[cityId];
    }
  }

  // R-96/R-98 (Phase 7d) : villages barbares et huttes sont des entités de
  // carte STATIQUES — visibles dès que la case est explorée (comme le décor,
  // CivRev-fidèle) ; inexploré = absent de l'état diffusé.
  clone.villages = clone.villages.filter((v) => explored.has(`${v.q},${v.r}`));
  clone.huts = clone.huts.filter((h) => explored.has(`${h.q},${h.r}`));

  for (const otherId of Object.keys(clone.players)) {
    if (otherId === playerId) {
      clone.players[otherId]!.vision = {
        explored: [...explored].sort(),
        visible: [...visible].sort(),
      };
    } else {
      clone.players[otherId]!.vision = { explored: [], visible: [] };
      // 7l · R-134 : la trésorerie de l'ADVERSAIRE n'est PAS publique (canon —
      // hook 7m : l'espionnage révélera une exception filtrée) ; les paliers
      // économiques franchis sont masqués dans la même movement.
      clone.players[otherId]!.treasury = 0;
      clone.players[otherId]!.economyMilestonesClaimed = 0;
    }
  }

  clone.rngSeed = 0;
  return clone;
}
