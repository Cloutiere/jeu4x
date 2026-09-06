/**
 * DEPLACEMENT-PLANIFIE · R-160 · Aperçu de programmation (D1 — optimiste).
 *
 * Fonction PURE qui traduit les ordres de déplacement programmés (Move et
 * composites MultiStep R-158, chemins gelés compris) en aperçu affichable :
 * chemin prévu, destination finale prévue, action finale, cases DISPUTÉES
 * (destination revendiquée par ≥ 2 unités amies — D1) et gagnant de la
 * dispute (R-159 : priorité de chronologie de programmation, miroir exact
 * de la troncature moteur `collectMoveOrders`).
 *
 * APERÇU OPTIMISTE (D1) : chaque ordre est affiché comme s'il réussissait —
 * pas de prédiction des ordres ennemis (tours simultanés). Le fog (R-161/D6)
 * est respecté par construction : le chemin s'arrête après la PREMIÈRE case
 * non explorée (`vision.explored`) — un pas dans l'inconnu, le reste est tu.
 * Calculé sur l'état FILTRÉ côté client, l'aperçu ne peut rien révéler
 * au-delà du visible (aucune fuite d'identité — cf. bug 7o).
 */
import type { GameState, Order, PlayerId, UnitId } from './state.js';
import type { Hex } from './hex.js';
import { tileKeyOf } from './hex.js';
import { DEPLACEMENT } from './data.js';

export interface ProgramPreview {
  unitId: UnitId;
  owner: PlayerId;
  /** Chemin prévu SANS l'origine, tronqué par le fog (R-161) — optimiste. */
  path: Hex[];
  /** Destination finale prévue (dernière case du chemin tronqué), null si
   *  l'unité ne bouge pas. */
  destination: Hex | null;
  /** R-158 : action finale programmée (exécutée seulement si le terme du
   *  chemin est atteint avec les PM requis). */
  final: 'foundCity' | null;
  /** R-160 (D1) : la destination est revendiquée par ≥ 2 unités amies. */
  disputed: boolean;
  /** R-159 (D2/D3) : cette unité remporte la dispute (première programmée). */
  disputedWinner: boolean;
}

/** Ordres de déplacement couverts par l'aperçu (Move et composite R-158). */
type MoveOrder = Extract<Order, { type: 'Move' | 'MultiStep' }>;

function isMoveOrder(o: Order): o is MoveOrder {
  return o.type === 'Move' || o.type === 'MultiStep';
}

/** R-161 (D6) : troncature fog — le chemin s'arrête après la première case
 *  non explorée (au plus `fogUnknownEntriesPerTurn` case(s) inconnue(s)). */
function truncateToFog(path: Hex[], explored: Set<string>): Hex[] {
  if (explored.size === 0) return path; // fixtures : fog non modélisé — aucune limite
  const limit = DEPLACEMENT.fogUnknownEntriesPerTurn;
  let unknown = 0;
  const out: Hex[] = [];
  for (const step of path) {
    if (!explored.has(tileKeyOf(step))) {
      if (unknown >= limit) break;
      unknown += 1;
    }
    out.push(step);
    if (unknown >= limit) break; // l'unité s'arrête SUR la case inconnue
  }
  return out;
}

/**
 * Aperçu optimiste de tous les ordres de déplacement programmés. `ordersByPlayer`
 * = ordres brouillons du tour (l'UI passe ceux du joueur — l'état filtré ne
 * diffuse que les siens). Les chemins gelés (`unit.order` Move/MultiStep) sont
 * inclus avec la priorité la plus ancienne (miroir moteur — R-159).
 */
export function previewPrograms(
  state: GameState,
  ordersByPlayer: Record<PlayerId, Order[]>,
): ProgramPreview[] {
  interface Claim {
    unitId: UnitId;
    owner: PlayerId;
    path: Hex[];
    final: 'foundCity' | null;
    priority: number;
    origin: Hex;
  }
  const claims: Claim[] = [];
  const seen = new Set<UnitId>();
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    let index = 0;
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (!isMoveOrder(order)) continue;
      index += 1;
      if (seen.has(order.unitId)) continue;
      const unit = state.units[order.unitId];
      if (!unit || unit.owner !== playerId) continue;
      seen.add(order.unitId);
      claims.push({
        unitId: order.unitId,
        owner: playerId,
        path: order.path,
        final: order.type === 'MultiStep' ? order.final ?? null : null,
        priority: index,
        origin: { q: unit.q, r: unit.r },
      });
    }
  }
  // Chemins gelés (reprise multi-tours) — priorité la plus ancienne (R-159).
  for (const id of Object.keys(state.units).sort()) {
    const unit = state.units[id]!;
    if (seen.has(id)) continue;
    if (unit.order && isMoveOrder(unit.order)) {
      claims.push({
        unitId: id,
        owner: unit.owner,
        path: unit.order.path,
        final: unit.order.type === 'MultiStep' ? unit.order.final ?? null : null,
        priority: 0,
        origin: { q: unit.q, r: unit.r },
      });
    }
  }
  // Troncature fog par propriétaire (l'explored du propriétaire — sur l'état
  // filtré, seules les cases connues existent de toute façon).
  const exploredBy = new Map<PlayerId, Set<string>>();
  for (const c of claims) {
    if (!exploredBy.has(c.owner)) {
      exploredBy.set(c.owner, new Set(state.players[c.owner]?.vision.explored ?? []));
    }
  }
  // R-160 (D1) : disputes amies par destination (après troncature fog).
  const disputedWinners = new Set<UnitId>();
  const disputedTiles = new Set<string>();
  const groups = new Map<string, Claim[]>();
  for (const c of claims) {
    const fogged = truncateToFog(c.path, exploredBy.get(c.owner)!);
    c.path = fogged;
    if (fogged.length === 0) continue;
    const dest = fogged[fogged.length - 1]!;
    const key = `${c.owner}|${dest.q},${dest.r}`;
    const group = groups.get(key) ?? [];
    group.push(c);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const winner = [...group].sort(
      (a, b) => a.priority - b.priority || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0),
    )[0]!;
    disputedWinners.add(winner.unitId);
    disputedTiles.add(key);
  }
  return claims
    .sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0))
    .map((c) => {
      const dest = c.path.length > 0 ? c.path[c.path.length - 1]! : null;
      const key = dest ? `${c.owner}|${dest.q},${dest.r}` : '';
      const disputed = disputedTiles.has(key);
      return {
        unitId: c.unitId,
        owner: c.owner,
        path: c.path,
        destination: dest,
        final: c.final,
        disputed,
        disputedWinner: disputedWinners.has(c.unitId),
      };
    });
}

/**
 * R-160 (D1) : clés "q,r" des cases disputées (destination revendiquée par
 * ≥ 2 unités AMIES) — surlignage UI.
 */
export function disputedTilesOf(previews: ProgramPreview[]): string[] {
  const out = new Set<string>();
  for (const p of previews) {
    if (p.disputed && p.destination) out.add(tileKeyOf(p.destination));
  }
  return [...out].sort();
}
