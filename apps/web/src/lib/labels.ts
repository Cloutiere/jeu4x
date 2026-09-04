/**
 * Libellés français des événements (L4/L5) — réutilisés par le journal,
 * les toasts du playback et le mode debug. Phase 7d : libellés barbares
 * (R-95..R-98) avec le nom de la récompense de hutte. Phase 7f : culture
 * (GP, jalons, merveilles, ONU — R-113..R-116).
 */
import type { GameEvent, HutReward } from '@game/shared';

/** 7j · R-126 · Nom fr des 6 classes canoniques de GP. */
const GP_CLASS_LABELS: Record<string, string> = {
  artiste_penseur: 'Grand Artiste / Penseur',
  batisseur: 'Grand Bâtisseur',
  savant: 'Grand Savant',
  explorateur: 'Grand Explorateur / Industriel',
  humanitaire: 'Grand Humanitaire',
  leader: 'Grand Leader',
};

/** 7j · R-126 · Nom fr d'une classe de GP. */
export function greatPersonLabel(unitTypeId: string): string {
  return GP_CLASS_LABELS[unitTypeId] ?? unitTypeId;
}

/** 7j · R-126 · Effet CONSUME par classe (libellé UI) ; null si reporté v1. */
export function consumeEffectLabel(unitTypeId: string): string | null {
  switch (unitTypeId) {
    case 'batisseur':
      return 'Achève la production en cours';
    case 'savant':
      return 'Achève la recherche en cours';
    case 'humanitaire':
      return '+1 pop à toutes vos cités';
    case 'leader':
      return 'Toutes vos unités militaires deviennent vétérans';
    case 'explorateur':
      // 7l · Bloc 5 : injection d'or (50/100/200/400 selon l'ère — economy.json).
      return 'Injection d\'or dans la trésorerie (montant selon l\'ère)';
    default:
      return null; // Artiste/Penseur (flip culturel — territoire en suspens)
  }
}

/** 7j · R-126 · Effet SETTLE par classe (libellé UI). */
export function settleEffectLabel(unitTypeId: string): string {
  switch (unitTypeId) {
    case 'artiste_penseur':
      return '+50 % Culture dans la cité';
    case 'batisseur':
      return '−50 % marteaux des futurs bâtiments de la cité';
    case 'savant':
      return '+50 % Science dans la cité';
    case 'explorateur':
      return '+50 % Or dans la cité';
    case 'humanitaire':
      return '+50 % croissance de la cité';
    case 'leader':
      return 'Nouvelles unités de la cité vétérans';
    default:
      return unitTypeId;
  }
}

/** 7f · Raison d'une variation de jalons culturels (7g : + gpStolen, R-119). */
function milestoneReasonLabel(reason: 'install' | 'wonderBuilt' | 'wonderCaptured' | 'wonderLost' | 'gpStolen' | 'obtain'): string {
  switch (reason) {
    case 'obtain':
      return 'personnage obtenu (7j)'; // R-126 : jalon à l'obtention
    case 'install':
      return 'personnage installé';
    case 'wonderBuilt':
      return 'merveille construite';
    case 'wonderCaptured':
      return 'merveille capturée';
    case 'wonderLost':
      return 'merveille perdue';
    case 'gpStolen':
      return 'personnage volé par un espion';
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
      return `Ville ${event.cityId} prise par ${event.toOwner}${event.plunder ? ` — sac de ville : ${event.plunder.toLocaleString('fr-FR')} or pillés` : ''}`;
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
      return `${greatPersonLabel(event.unitType)} s'installe dans ${event.cityId} — ${settleEffectLabel(event.unitType)}`;
    case 'GreatPersonConsumed':
      return `${greatPersonLabel(event.unitType)} CONSOMMÉ : ${event.effect} (${event.player})`;
    case 'CultureMilestone':
      return `${event.delta > 0 ? '+' : ''}${event.delta} jalon culturel pour ${event.player} (${milestoneReasonLabel(event.reason)}) — total ${event.total}/20`;
    case 'WonderCompleted':
      return `Merveille achevée : ${event.wonder} dans ${event.cityId} (+1 jalon)`;
    // 7k · R-130/R-132 : récupération de marteaux, surclassement Léonard.
    case 'HammerSalvage':
      // 7l · C7 : la réserve est PERMANENTE (plus de dissipation — T-32 abrogé).
      return `Un rival a achevé ${event.wonder ?? 'une merveille'} ! ${event.amount} marteaux en réserve dans ${event.cityId} — choisissez un projet, ils financeront la production.`;
    case 'EconomyMilestone':
      // 7l · R-136 : palier économique franchi.
      return `Palier économique — ${event.threshold.toLocaleString('fr-FR')} or : ${event.label} !`;
    case 'RushBuy':
      // 7l · R-135 : achat instantané.
      return `${event.owner} achète ${event.item.id} dans ${event.cityId} pour ${event.cost.toLocaleString('fr-FR')} or (rush-buy)`;
    case 'UnitsUpgraded':
      return `Atelier de Léonard : ${event.upgrades.length} unité(s) mise(s) à niveau (${event.upgrades.map((u) => `${u.from} → ${u.to}`).join(', ')})`;
    // 7g · R-117/R-119 : naval & espionnage.
    case 'Embark':
      return `${event.unitId} embarque à bord de ${event.transportId}`;
    case 'Disembark':
      return `${event.unitId} débarque en (${event.at.q},${event.at.r})`;
    case 'SpyMission':
      return event.outcome === 'success'
        ? `L'espion ${event.unitId} a réussi sa mission dans ${event.cityId} !`
        : `Mission d'espionnage échouée (${event.unitId} → ${event.cityId})`;
    case 'GreatPersonStolen':
      return `GP VOLÉ ! ${event.victim} perd un Personnage installé au profit de ${event.thief} (${event.cityId}) — réinstallé dans l'empire voleur (7j)`;
    case 'FirstDiscovered':
      return event.greatPerson
        ? `${event.label} (${event.player}) : ${greatPersonLabel(event.greatPerson)} rejoint votre empire !`
        : `Premier découvrir : ${event.label} (${event.player})`;
    case 'Victory': {
      const motifs: Record<string, string> = {
        domination: 'domination (capitale capturée)',
        forfeit: 'forfait',
        razedCapital: 'capitale rasée',
        culture: 'culturelle (Nations Unies)',
        science: 'scientifique (Vaisseau spatial)',
        economique: 'économique (Banque mondiale — 20 000 or)',
      };
      return `VICTOIRE de ${event.winner} (${motifs[event.reason] ?? event.reason})`;
    }
    case 'TurnResolved':
      return `— Fin du tour ${event.turn - 1}, tour ${event.turn} —`;
    default:
      return (event as { type: string }).type;
  }
}
