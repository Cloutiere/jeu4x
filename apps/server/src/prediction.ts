/**
 * ORACLE-VERDICT (canon Erik 09/11, Chemin B) — L2 · PredictBattle.
 *
 * Le serveur exécute le DÉRIVÉ par bataille (derive.ts — les jets mêlée sont
 * indépendants du flux) en simulant la résolution complète du tour planifié,
 * et rend le verdict CERTAIN « victoire » / « defaite ». Révélation gated :
 * Oracle actif (oracleActif — battleForeknowledge, obsolescence globale
 * R-128), attaquant à moi et MÊLÉE (les tirs R-59 n'ont pas de dérivé), cible
 * VISIBLE (fog canon : invisible = refus propre, jamais d'info).
 *
 * Périmètre honnête (D3) : la simulation porte les ordres brouillons connus
 * AU MOMENT de la demande — les ordres pas encore soumis des autres joueurs
 * restent dans le brouillard (canon fog, consigné). L'Oracle est un outil du
 * joueur : Jev/bots ne le consultent jamais (aucune IA branchée).
 */
import { computeVisibleTiles, oracleActif, resolveTurn, tileKeyOf, unitType } from '@game/rules';
import type { GameEvent, GameState, Hex, Order, PlayerId, UnitId } from '@game/rules';

export interface RequetePrediction {
  attaquant: UnitId;
  cible: Hex;
}

export type VerdictBataille = 'victoire' | 'defaite' | 'refus';

/** Retire de `orders` tout ordre portant sur `unitId` (l'hypothèse remplace). */
function sansOrdreSur(orders: Order[], unitId: UnitId): Order[] {
  return orders.filter(
    (o) =>
      !('unitId' in o && o.unitId === unitId) &&
      !(o.type === 'FormArmy' && o.members.includes(unitId)),
  );
}

export function predireBataille(
  st: GameState,
  ordersByPlayer: Record<PlayerId, Order[]>,
  playerId: PlayerId,
  req: RequetePrediction,
): VerdictBataille {
  // D2 — gate 1 : l'Oracle actif (merveille battleForeknowledge non obsolète).
  if (!oracleActif(st, playerId)) return 'refus';
  // Gate 2 : l'attaquant existe, est à moi, et est MÊLÉE (D1 : pas de dérivé
  // pour les tirs R-59 — 1 PV garanti, jamais la mort directe).
  const attaquant = st.units[req.attaquant];
  if (!attaquant || attaquant.owner !== playerId) return 'refus';
  if (unitType(attaquant.type).isRanged) return 'refus';
  // Gate 3 — fog : la cible doit être VISIBLE maintenant.
  const cleCible = tileKeyOf(req.cible);
  if (!computeVisibleTiles(st, playerId).has(cleCible)) return 'refus';
  // Gate 4 : une unité tient la cible (sinon il n'y a pas de bataille).
  const defenseur = Object.values(st.units).find((u) => u.q === req.cible.q && u.r === req.cible.r);
  if (!defenseur) return 'refus';

  // L'hypothèse : les ordres brouillons courants, l'attaque demandée
  // remplaçant tout ordre existant de l'attaquant.
  const ordres: Record<PlayerId, Order[]> = Object.fromEntries(
    Object.entries(ordersByPlayer).map(([pid, orders]) => [
      pid,
      pid === playerId
        ? [...sansOrdreSur(orders, req.attaquant), { type: 'Attack', unitId: req.attaquant, target: { q: req.cible.q, r: req.cible.r } } as Order]
        : [...orders],
    ]),
  );
  const simulation = resolveTurn(structuredClone(st), ordres, st.rngSeed);
  const echange = [...(simulation.events as GameEvent[])]
    .reverse()
    .find((e): e is Extract<GameEvent, { type: 'CombatExchange' }> => e.type === 'CombatExchange' && e.attackerId === req.attaquant);
  if (!echange) return 'refus'; // la cible a bougé/capturé — pas de bataille simulable
  // D2 — verdict canon : VICTOIRE (le défenseur meurt) / DÉFAITE (l'attaquant
  // meurt). La bataille complète ne connaît pas d'autre issue mêlée.
  return echange.defenderHpAfter <= 0 ? 'victoire' : 'defaite';
}
