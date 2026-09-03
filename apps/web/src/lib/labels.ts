/**
 * Libellés français des événements (L4/L5) — réutilisés par le journal,
 * les toasts du playback et le mode debug. Phase 7d : libellés barbares
 * (R-95..R-98) avec le nom de la récompense de hutte. Phase 7f : culture
 * (GP, jalons, merveilles, ONU — R-113..R-116).
 */
import type { GameEvent, HutReward } from '@game/shared';

/** 7f · Nom fr d'un type de GP (artiste/penseur). */
export function greatPersonLabel(unitTypeId: string): string {
  return unitTypeId === 'artiste' ? 'Artiste illustre' : unitTypeId === 'penseur' ? 'Penseur illustre' : unitTypeId;
}

/** 7f · Raison d'une variation de jalons culturels. */
function milestoneReasonLabel(reason: 'install' | 'wonderBuilt' | 'wonderCaptured' | 'wonderLost'): string {
  switch (reason) {
    case 'install':
      return 'personnage installé';
    case 'wonderBuilt':
      return 'merveille construite';
    case 'wonderCaptured':
      return 'merveille capturée';
    case 'wonderLost':
      return 'merveille perdue';
  }
}

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
    case 'GreatPersonSpawned':
      return `${greatPersonLabel(event.unitType)} apparaît dans ${event.cityId} (${event.owner}) — jauge remise à zéro`;
    case 'InstallPerson':
      return `${greatPersonLabel(event.unitType)} s'installe définitivement dans ${event.cityId} (+1 jalon)`;
    case 'CultureMilestone':
      return `${event.delta > 0 ? '+' : ''}${event.delta} jalon culturel pour ${event.player} (${milestoneReasonLabel(event.reason)}) — total ${event.total}/20`;
    case 'WonderCompleted':
      return `Merveille achevée : ${event.wonder} dans ${event.cityId} (+1 jalon)`;
    case 'Victory': {
      const motifs: Record<string, string> = {
        domination: 'domination (capitale capturée)',
        forfeit: 'forfait',
        razedCapital: 'capitale rasée',
        culture: 'culturelle (Nations Unies)',
      };
      return `VICTOIRE de ${event.winner} (${motifs[event.reason] ?? event.reason})`;
    }
    case 'TurnResolved':
      return `— Fin du tour ${event.turn - 1}, tour ${event.turn} —`;
    default:
      return (event as { type: string }).type;
  }
}
