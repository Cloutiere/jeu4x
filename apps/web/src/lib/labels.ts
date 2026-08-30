/**
 * Libellés français des événements (L4/L5) — réutilisés par le journal,
 * les toasts du playback et le mode debug.
 */
import type { GameEvent } from '@game/shared';

export function eventLabel(event: GameEvent): string {
  switch (event.type) {
    case 'Move':
      return `${event.unitId} se déplace vers (${event.to.q},${event.to.r})`;
    case 'Attack':
      return `${event.attackerId} attaque ${event.defenderId} en (${event.at.q},${event.at.r})`;
    case 'CombatExchange':
      return `Échange : ${event.attackerId} ${event.attackerHpAfter} PV vs ${event.defenderId} ${event.defenderHpAfter} PV`;
    case 'UnitDestroyed':
      return `${event.unitId} est détruite (${event.cause})`;
    case 'Retreat':
      return `${event.unitId} se replie vers (${event.to.q},${event.to.r})`;
    case 'Captured':
      return `${event.unitId} capturée par ${event.byPlayer} (${event.outcome})`;
    case 'BootyGold':
      return `${event.player} touche ${event.amount} or de butin`;
    case 'ArmyFormed':
      return `Armée ${event.unitId} formée (${event.memberIds.join(', ')})`;
    case 'CityFounded':
      return `Ville ${event.cityId} fondée en (${event.at.q},${event.at.r}) par ${event.owner}${event.capital ? ' — capitale !' : ''}`;
    case 'CityCaptured':
      return `Ville ${event.cityId} prise par ${event.toOwner}`;
    case 'UnitProduced':
      return `${event.unitType} produit par ${event.cityId}`;
    case 'PopulationGrew':
      return `${event.cityId} grandit — population ${event.pop}`;
    case 'BuildingCompleted':
      return `${event.building} achevé dans ${event.cityId}`;
    case 'DiplomaticIncident':
      return `Incident diplomatique entre ${event.between[0]} et ${event.between[1]}`;
    case 'Victory':
      return `VICTOIRE de ${event.winner} (${event.reason})`;
    case 'TurnResolved':
      return `— Fin du tour ${event.turn - 1}, tour ${event.turn} —`;
    default:
      return (event as { type: string }).type;
  }
}
