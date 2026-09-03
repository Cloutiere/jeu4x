/**
 * Technologies — Phase 7a (RULES.md §8.1, R-85/R-86/R-87).
 *
 * La base technologique est une base relationnelle EMBARQUÉE (décision d'Erik
 * du 31/08) : fichiers JSON normalisés + couche de requête pure + tests
 * d'intégrité référentielle (tests/techs.test.ts). Le calibrage se fait en
 * éditant les données (coûts/prérequis 🔶) — le CI déploie.
 *
 * Fonctions PURES et déterministes : tout parcours est trié (R-81).
 */
import techsJson from './data/techs.json' with { type: 'json' };
import wondersJson from './data/wonders.json' with { type: 'json' };
import { UNIT_TYPES, BUILDINGS } from './data.js';
import type {
  BuildingData,
  CostDiscount,
  FirstToDiscoverData,
  TechData,
  TechEra,
  UnitTypeData,
  WonderData,
} from './types.js';

export const TECHS: Record<string, TechData> = techsJson as Record<string, TechData>;
export const WONDERS: Record<string, WonderData> = wondersJson as Record<string, WonderData>;

/** 7e · Ordre des ères pour l'UI de l'arbre (Ancienne → Moderne). */
export const ERA_ORDER: TechEra[] = ['ancienne', 'medievale', 'industrielle', 'moderne'];

export const ERA_NAMES: Record<TechEra, string> = {
  ancienne: 'Ère ancienne',
  medievale: 'Ère médiévale',
  industrielle: 'Ère industrielle',
  moderne: 'Ère moderne',
};

/** R-87 : item de production (unité, bâtiment ou merveille) tel que porté par
 *  les données. */
export interface ProductionData {
  tech: string | null;
  implemented?: boolean | undefined;
  /** 7f : Personnage illustre (artiste/penseur) — jamais productible (R-114). */
  greatPerson?: boolean | undefined;
  /** 7e : bâtiment préalable exigé dans la ville (Banque ← Marché…). */
  requiresBuilding?: string | undefined;
  /** 7e : bâtiment retiré de la ville à la construction (remplacement). */
  replaces?: string | undefined;
  /** 7e : jamais proposé dans la file de production (Palais). */
  fixed?: boolean | undefined;
}

function unitAsItem(u: UnitTypeData): ProductionData {
  return { tech: u.tech ?? null, implemented: u.implemented, greatPerson: u.greatPerson };
}

function buildingAsItem(b: BuildingData): ProductionData {
  return { tech: b.tech, implemented: b.implemented, requiresBuilding: b.requiresBuilding, replaces: b.replaces, fixed: b.fixed };
}

function wonderAsItem(w: WonderData): ProductionData {
  return { tech: w.tech ?? null, implemented: w.implemented };
}

/** Données de débloquage d'un item de production (R-87) — null si id inconnu. */
export function productionDataOf(item: { kind: 'unit' | 'building' | 'wonder'; id: string }): ProductionData | null {
  if (item.kind === 'unit') {
    const u = UNIT_TYPES[item.id];
    return u ? unitAsItem(u) : null;
  }
  if (item.kind === 'wonder') {
    const w = WONDERS[item.id];
    return w ? wonderAsItem(w) : null;
  }
  const b = BUILDINGS[item.id];
  return b ? buildingAsItem(b) : null;
}

/** La technologie est-elle débloquée par ce joueur (ou sans prérequis de tech) ? */
export function techUnlocked(tech: string | null, techsUnlocked: readonly string[]): boolean {
  return tech === null || techsUnlocked.includes(tech);
}

/** R-87 : un item de production est constructible ssi sa tech est débloquée
 *  (ou null) ET qu'il est implémenté (Espion/Galère : données seules en 7a). */
export function isUnlocked(item: ProductionData, techsUnlocked: readonly string[]): boolean {
  if (item.implemented === false) return false;
  return techUnlocked(item.tech, techsUnlocked);
}

// ---------------------------------------------------------------------------
// 7e · Obsolescence (CivRev : Guerrier après Travail du fer, Archer après
// Démocratie…) — données `obsoleteUnits[]` par tech ; unités existantes
// conservées, surclassement automatique différé (Atelier de Léonard, 7f+).
// ---------------------------------------------------------------------------

/** 7e : unités rendues obsolètes par les technologies DÉBLOQUÉES du joueur. */
export function obsoleteUnitsFor(techsUnlocked: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const techId of techsUnlocked) {
    const tech = TECHS[techId];
    if (!tech) continue;
    for (const id of tech.obsoleteUnits ?? []) out.add(id);
  }
  return out;
}

/** 7e : l'unité est-elle obsolète pour ce joueur (retirée du menu de production) ? */
export function isUnitObsolete(unitId: string, techsUnlocked: readonly string[]): boolean {
  return obsoleteUnitsFor(techsUnlocked).has(unitId);
}

/**
 * 7e · R-87 (étendue) : un item est PRODUCTIBLE ssi débloqué (tech + implé-
 * mentation), non obsolète (unités) et, pour un bâtiment, sans prérequis de
 * bâtiment manquant ni caractère fixe (Palais). 7f : les GP (artiste/penseur)
 * ne sont JAMAIS productibles (R-114 — engendrés par la culture seulement).
 * Les contraintes d'EMPIRE des merveilles (unicité, jalons ONU) sont vérifiées
 * par `wonderProductionIssue` (culture.ts) — elles exigent l'état complet.
 * La ville n'est pas toujours connue (recherche d'UI) : passer `cityBuildings`
 * pour la validation complète.
 */
export function isProducible(
  item: ProductionData,
  techsUnlocked: readonly string[],
  cityBuildings?: readonly string[],
): boolean {
  if (!isUnlocked(item, techsUnlocked)) return false;
  if (item.fixed) return false;
  if (item.greatPerson) return false;
  if (item.requiresBuilding && cityBuildings && !cityBuildings.includes(item.requiresBuilding)) return false;
  return true;
}

/** 7e : l'item est-il une UNITÉ obsolète pour ce joueur ? (validation serveur) */
function unitObsoleteIn(item: ProductionData, id: string, techsUnlocked: readonly string[]): boolean {
  void item;
  return isUnitObsolete(id, techsUnlocked);
}

/** 7e : validations serveur complètes (moteur — applySetProduction). */
export function canSetProduction(
  item: { kind: 'unit' | 'building' | 'wonder'; id: string },
  techsUnlocked: readonly string[],
  cityBuildings: readonly string[],
): boolean {
  const data = productionDataOf(item);
  if (!data) return false;
  if (item.kind === 'unit' && unitObsoleteIn(data, item.id, techsUnlocked)) return false;
  if (item.kind === 'building' && cityBuildings.includes(item.id)) return false; // R-66 : non duplicable
  return isProducible(data, techsUnlocked, cityBuildings);
}

// ---------------------------------------------------------------------------
// 7e · Premier découvreur (CivRev « First to Discover ») — état `firstBy`
// (GameState) : premier joueur à COMPLÉTER chaque tech. Récompenses décrites
// en données (firstToDiscover) ; application : moteur (voir firstDiscovery.ts).
// ---------------------------------------------------------------------------

/** 7e : récompense du Premier découvreur d'une tech (null si aucune). */
export function firstToDiscoverOf(techId: string): FirstToDiscoverData | null {
  return TECHS[techId]?.firstToDiscover ?? null;
}

/** 7e : réduction de coût empire cumulée pour un bâtiment donné (somme des
 *  `discounts` des techs dont le joueur a été Premier découvreur, plafonnée
 *  à 90 % pour rester déterministe et non gratuit). */
export function buildingCostDiscount(
  buildingId: string,
  firstBy: Record<string, string> | undefined,
  playerId: string,
): number {
  if (!firstBy) return 0;
  let total = 0;
  for (const techId of Object.keys(TECHS).sort()) {
    if (firstBy[techId] !== playerId) continue;
    const reward = TECHS[techId]!.firstToDiscover;
    if (!reward?.discounts) continue;
    for (const d of reward.discounts as CostDiscount[]) {
      if (d.building === buildingId) total += d.pct;
    }
  }
  return Math.min(0.9, total);
}

/** R-86 : prérequis d'une tech tous satisfaits ? */
export function prereqsMet(tech: TechData, techsUnlocked: readonly string[]): boolean {
  return tech.prereqs.every((p) => techsUnlocked.includes(p));
}

/** État de recherche minimal attendu d'un joueur (champs ajoutés en v5). */
export interface ResearchPlayer {
  techsUnlocked: string[];
  researching: string | null;
}

/** R-85 : technologies que le joueur peut mettre en recherche — non
 *  débloquées, prérequis satisfaits. Tri par id (déterminisme, R-81). */
export function availableTechs(player: ResearchPlayer): TechData[] {
  return Object.values(TECHS)
    .filter((t) => !player.techsUnlocked.includes(t.id) && prereqsMet(t, player.techsUnlocked))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** R-85 : synonyme métier — techs actuellement cherchables (R-86 table). */
export function researchable(player: ResearchPlayer): TechData[] {
  return availableTechs(player);
}

/** Techs verrouillées (pour l'UI : grises avec prérequis manquants). Tri par id. */
export function lockedTechs(player: ResearchPlayer): TechData[] {
  return Object.values(TECHS)
    .filter((t) => !player.techsUnlocked.includes(t.id) && !prereqsMet(t, player.techsUnlocked))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** R-86 : techs débloquées par un id — pour l'index inverse tech→items. */
export function itemsUnlockedBy(techId: string): { units: string[]; buildings: string[]; wonders: string[] } {
  const tech = TECHS[techId];
  if (!tech) throw new Error(`Tech inconnue : ${techId}`);
  return tech.unlocks;
}
