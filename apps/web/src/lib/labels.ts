/**
 * Libellés français des événements (L4/L5) — réutilisés par le journal,
 * les toasts du playback et le mode debug. Phase 7d : libellés barbares
 * (R-95..R-98) avec le nom de la récompense de hutte.
 */
import type { GameEvent, HutReward } from '@game/shared';

/** R-98 : libellé d'une récompense de hutte. */
export function hutRewardLabel(reward: HutReward): string {
  switch (reward.kind) {
    case 'gold':
      return `+${reward.amount} or`;
    case 'unit':
      return `unité gratuite (${reward.unitType})`;
    case 'science':
      return `+${reward.amount} science`;
    case 'reveal':
      return `carte révélée (rayon ${reward.radius})`;
    case 'ambush':
      return `EMBUSCADE — ${reward.unitIds.length} barbare(s) !`;
    case 'nothing':
      return 'rien';
  }
}

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
    case 'TechResearched':
      return `Technologie complétée : ${event.tech} — déblocages disponibles !`;
    case 'FirstDiscovered':
      return `Premier découvrir (${event.tech}) : ${event.label}`;
    case 'PopulationGrew':
      return `${event.cityId} grandit — population ${event.pop}`;
    case 'PopulationConsumed':
      return `${event.cityId} : la production de ${event.byUnitType} consomme des citoyens — population ${event.pop}`;
    case 'BuildingCompleted':
      return `${event.building} achevé dans ${event.cityId}`;
    case 'DiplomaticIncident':
      return `Incident diplomatique entre ${event.between[0]} et ${event.between[1]}`;
    case 'Victory':
      return `VICTOIRE de ${event.winner} (${event.reason})`;
    case 'BarbarianSpawned':
      return `Un barbare (${event.unitId}) sort du village ${event.villageId} en (${event.at.q},${event.at.r})`;
    case 'VillageDestroyed':
      return `Village barbare ${event.villageId} détruit par ${event.byPlayer} !`;
    case 'CityRazed':
      return `Ville ${event.cityId} RASÉE par les barbares (${event.owner} la perd)`;
    case 'HutOpened':
      return `Hutte ${event.hutId} ouverte par ${event.byPlayer} : ${hutRewardLabel(event.reward)}`;
    case 'TurnResolved':
      return `— Fin du tour ${event.turn - 1}, tour ${event.turn} —`;
    default:
      return (event as { type: string }).type;
  }
}
