/**
 * Détection PURE des ordres non exécutés à la résolution (Phase 5 L1, polish
 * reporté de l'acceptation Phase 3) : le moteur écarte silencieusement un
 * ordre invalide (fondation trop proche, déplacement impossible, attaque sans
 * cible…) — le client affiche un toast « ordre non exécuté » au lieu de
 * laisser l'ordre disparaître sans explication.
 *
 * Principe : à réception du TurnResult, on compare les ordres soumis par le
 * joueur pour le tour qui vient d'être résolu avec les événements reçus et
 * l'état post-résolution. Un ordre Move/Attack/FoundCity dont l'effet attendu
 * (Move/Attack/CityFounded, ou chemin gelé conservé) est absent est signalé.
 */
import type { GameEvent, GameState, Order, UnitId } from '@game/shared';

export function unexecutedOrders(
  orders: Order[],
  events: GameEvent[],
  newState: GameState,
): Array<{ unitId: UnitId; label: string }> {
  const out: Array<{ unitId: UnitId; label: string }> = [];
  const has = (type: string, field: string, id: string): boolean =>
    events.some((e) => e.type === type && (e as Record<string, unknown>)[field] === id);
  for (const order of orders) {
    switch (order.type) {
      case 'FoundCity': {
        const unit = newState.units[order.unitId];
        // Consommé par la fondation (événement) ou mort entre-temps : pas un échec.
        if (!unit || has('CityFounded', 'byUnitId', order.unitId)) break;
        out.push({ unitId: order.unitId, label: 'Fondation de ville impossible (distance T-09 ou case occupée)' });
        break;
      }
      case 'Attack': {
        const unit = newState.units[order.unitId];
        if (!unit || has('Attack', 'attackerId', order.unitId)) break;
        out.push({ unitId: order.unitId, label: 'Attaque non exécutée (cible absente, trop loin ou PM insuffisants)' });
        break;
      }
      case 'Move': {
        const unit = newState.units[order.unitId];
        if (!unit) break; // morte (combat/capture) : le sort est connu
        const moved = has('Move', 'unitId', order.unitId);
        const frozen = unit.order?.type === 'Move'; // halte/blocage : chemin gelé
        if (!moved && !frozen) {
          out.push({ unitId: order.unitId, label: 'Déplacement impossible (chemin bloqué ou invalide)' });
        }
        break;
      }
      case 'Launch': {
        // 7m · R-139 : un refus émet NukeLaunched (outcome 'refused') — un
        // lancement sans AUCUN événement est un ordre écarté (ICBM absente…).
        const unit2 = newState.units[order.unitId];
        if (!unit2 || has('NukeLaunched', 'unitId', order.unitId)) break;
        out.push({ unitId: order.unitId, label: 'Lancement impossible (ICBM absente ou déjà consommée)' });
        break;
      }
      case 'SpyAction': {
        // 7m · R-143 : un échec métier émet SpyAction (outcome 'failed') —
        // sans AUCUN événement, l'ordre a été écarté (espion absent…).
        const unit3 = newState.units[order.unitId];
        if (!unit3 || has('SpyAction', 'unitId', order.unitId)) break;
        out.push({ unitId: order.unitId, label: "Action d'espionnage impossible (espion absent ou hors de la ville)" });
        break;
      }
      default:
        break; // Hold / Fortify / FormArmy / SetProduction : pas de toast
    }
  }
  return out;
}
