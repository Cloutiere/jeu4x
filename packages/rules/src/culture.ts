/**
 * Culture & victoire culturelle — Phase 7f (RULES.md §8.5, R-113..R-116).
 *
 * Base documentaire : la spécification d'Erik « Culture dans Civilization
 * Revolution ». Fonctions PURES et déterministes (R-80/R-81/R-82) : tout
 * parcours est trié, aucun Math.random / Date.now. Source unique partagée
 * par le moteur (Phase C, turn.ts) et l'UI (jauge de ville, compteur de
 * jalons, menu de production des merveilles) — même philosophie que
 * conversionGains (R-90/R-88).
 *
 * Décisions de tranche documentées (RULES.md §8.5) :
 *  - la conversion culturelle passive (territoire) est REPORTÉE (7g/7h) ;
 *  - Artiste/Penseur en ALTERNANCE déterministe 🔶 (Artiste d'abord) ;
 *  - Stonehenge multiplie la part « Temple/Cathédrale » du rendement ;
 *  - les merveilles SURVIVENT à la capture (champ city.wonders).
 */
import { BUILDINGS, CULTURE, unitType } from './data.js';
import { TECHS, WONDERS } from './techs.js';
import type { CityId, PlayerId } from './state.js';

/** Types de GP de culture — alternance déterministe (R-114 🔶). */
export const GREAT_PERSON_TYPES = ['artiste', 'penseur'] as const;
export type GreatPersonType = (typeof GREAT_PERSON_TYPES)[number];

/**
 * R-114 · Seuil de culture (T-27) pour engendrer un GP : base 🔶 20,
 * MULTIPLIÉ par 🔶 2 à chaque GP obtenu par l'empire (doc d'Erik : « le seuil
 * augmente à chaque nouveau personnage »). Le compteur est EMPIRE (pas par
 * ville) : dès qu'une ville engendre, toutes voient leur seuil doubler.
 */
export function greatPersonThresholdFor(greatPersonsObtained: number): number {
  const base = CULTURE.greatPersonThresholdBase;
  const growth = CULTURE.greatPersonThresholdGrowth;
  return base * Math.pow(growth, Math.max(0, greatPersonsObtained));
}

/**
 * R-114 🔶 · Type de GP engendré : ALTERNANCE déterministe sur le compteur
 * d'obtention (Artiste au premier GP, Penseur au second, …). Interprétation
 * documentée : le handoff offrait « alternance déterministe ou tirage seedé »
 * — l'alternance est retenue (simple, sans tir, lisibilité parfaite).
 */
export function greatPersonTypeFor(greatPersonsObtained: number): GreatPersonType {
  const index = ((greatPersonsObtained % GREAT_PERSON_TYPES.length) + GREAT_PERSON_TYPES.length) % GREAT_PERSON_TYPES.length;
  return GREAT_PERSON_TYPES[index]!;
}

/** 7f · Vue minimale d'une ville pour les calculs culturels (moteur ET UI). */
export interface CultureCity {
  pop: number;
  buildings: string[];
  /** Le Palais (culturePerTurn) ne vit que dans la capitale — champ
   *  redondant avec buildings.includes('palais') mais explicite pour l'UI. */
  capital: boolean;
  /** Merveilles hébergées (R-115) — Stonehenge y multiplie les Temples. */
  wonders: string[];
}

/**
 * R-113 · Rendement culturel d'une ville : Σ `culturePerTurn` des bâtiments
 * (Palais 🔶 1, capitale uniquement) + Σ `culturePerCitizen` × pop (Temple 1,
 * Cathédrale 2 — remplace le Temple), la part `culturePerCitizen` étant
 * multipliée par la merveille Stonehenge (×1,5 🔶 tant qu'il n'est pas
 * obsolète — R-110) + le bonus empire du Premier découvrir (perCity.culture,
 * R-109 : Religion/Imprimerie). Scalaire sur la démographie : 20 pop ×
 * Cathédrale = 40 🔶. Arrondi au plus proche de la part multipliée (R-88).
 */
export interface CultureGovOptions {
  /** 7h · R-121 · Monarchie : culture du Palais ×2. */
  palaceCultureMult?: number;
  /** 7h · R-121 · Communisme : culture des Temples/Cathédrales = 0. */
  zeroTempleCulture?: boolean;
}

export function cultureGains(
  city: CultureCity,
  empireCulture = 0,
  techsUnlocked: readonly string[] = [],
  gov: CultureGovOptions = {},
): number {
  let flat = 0;
  let perCitizen = 0;
  for (const id of city.buildings) {
    const b = BUILDINGS[id];
    if (!b) continue;
    if (b.culturePerTurn) flat += b.culturePerTurn;
    if (b.culturePerCitizen) perCitizen += b.culturePerCitizen;
  }
  // 7h · R-121 : Monarchie double la culture du PALAIS (part culturePerTurn).
  if (gov.palaceCultureMult) flat *= gov.palaceCultureMult;
  // 7h · R-125 · Magna Carta : Tribunal = +1 culture/tour (ville hôte,
  // tant que la merveille n'est pas obsolète).
  let tribunalCulture = 0;
  if (city.buildings.includes('tribunal')) {
    for (const wonderId of city.wonders) {
      const w = WONDERS[wonderId];
      if (!w?.tribunalCulturePerTurn) continue;
      if (isWonderObsolete(wonderId, techsUnlocked)) continue;
      tribunalCulture = Math.max(tribunalCulture, w.tribunalCulturePerTurn);
    }
  }
  flat += tribunalCulture;
  // 7h · R-121 : Communisme annule la part Temples/Cathédrales (le Palais
  // et les merveilles restent).
  if (gov.zeroTempleCulture) perCitizen = 0;
  let templeMult = 1;
  for (const wonderId of city.wonders) {
    const w = WONDERS[wonderId];
    if (!w?.templeCultureMult) continue;
    if (isWonderObsolete(wonderId, techsUnlocked)) continue;
    templeMult = Math.max(templeMult, w.templeCultureMult);
  }
  return flat + Math.round(perCitizen * city.pop * templeMult) + empireCulture;
}

/** 7f · R-110 : la merveille est-elle obsolète pour ce joueur ? (effet retiré
 *  ET retrait du menu de production ; les exemplaires bâtis gardent leur
 *  jalon — R-116). */
export function isWonderObsolete(wonderId: string, techsUnlocked: readonly string[]): boolean {
  const w = WONDERS[wonderId];
  return !!w?.obsoleteBy && techsUnlocked.includes(w.obsoleteBy);
}

/** Contexte d'empire nécessaire à la validation d'une production de merveille. */
export interface WonderProductionContext {
  techsUnlocked: readonly string[];
  /** Merveilles DÉJÀ BÂTIES dans l'empire (toutes villes). */
  empireWondersBuilt: readonly string[];
  /** Merveilles EN CHANTIER dans l'empire (files de production des villes). */
  empireWondersInProduction: readonly string[];
  /** Jalons culturels du joueur (R-116 : 20 requis pour l'ONU). */
  cultureMilestones: number;
}

/**
 * R-116 · Validation d'une production de merveille (moteur ET UI) — retourne
 * null si la production est autorisée, sinon la raison (libellé UI). Unique à
 * l'empire (bâtie OU en chantier ailleurs) ; les Nations Unies exigent en outre
 * les `milestonesTarget` jalons et restent verrouillées sous ce seuil.
 */
export function wonderProductionIssue(wonderId: string, ctx: WonderProductionContext): string | null {
  const w = WONDERS[wonderId];
  if (!w) return 'merveille inconnue';
  if (w.implemented === false) return 'merveille non implémentée';
  if (isWonderObsolete(wonderId, ctx.techsUnlocked)) return 'merveille obsolète';
  if (w.tech && !ctx.techsUnlocked.includes(w.tech)) return `Requiert : ${TECHS[w.tech]?.name ?? w.tech}`;
  if (ctx.empireWondersBuilt.includes(wonderId)) return 'déjà construite dans l’empire';
  if (ctx.empireWondersInProduction.includes(wonderId)) return 'déjà en chantier dans l’empire';
  if (w.cultureVictory && ctx.cultureMilestones < CULTURE.milestonesTarget) {
    return `Requiert : ${CULTURE.milestonesTarget} jalons culturels (${ctx.cultureMilestones}/${CULTURE.milestonesTarget})`;
  }
  return null;
}

/** R-115 · Compte les GP installés dérivables : jalons − merveilles contrôlées
 *  (le détail UI « GP installés / merveilles » est dérivé de l'état, source
 *  unique). */
export function installedGreatPersonsOf(cultureMilestones: number, wonderCount: number): number {
  return Math.max(0, cultureMilestones - wonderCount);
}

/** Type d'une unité GP (artiste/penseur) — garde-fou typé. */
export function isGreatPersonType(unitTypeId: string): boolean {
  const t = unitType(unitTypeId);
  return t.greatPerson === true;
}

/** Merveilles contrôlées par un joueur (toutes villes) — tri déterministe. */
export function wondersOwnedBy(
  cities: Record<CityId, { owner: PlayerId; wonders: string[] }>,
  playerId: PlayerId,
): string[] {
  const out: string[] = [];
  for (const id of Object.keys(cities).sort()) {
    const c = cities[id]!;
    if (c.owner !== playerId) continue;
    out.push(...[...c.wonders].sort());
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7h · R-123 — GP restants (Scientifique/Mogul/Ingénieur/Leader)
// ---------------------------------------------------------------------------

/** 7h · GP à rendement (accumulateurs par ville — R-123). */
export const YIELD_GP_TYPES = ['scientifique', 'mogul', 'ingenieur'] as const;
export type YieldGreatPersonType = (typeof YIELD_GP_TYPES)[number];

/**
 * R-123 · T-30 · Seuil d'un accumulateur de GP à rendement : base 🔶 20
 * (culture.json), ×2 par GP de CE TYPE déjà obtenu par l'empire
 * (`player.greatPersonsByType[type]`). Le Leader (T-31) a un seuil FIXE
 * (victoires de combat — interprétation documentée : pas de croissance).
 */
export function yieldGpThresholdFor(type: YieldGreatPersonType, greatPersonsByType: Record<string, number>): number {
  void type;
  const base = CULTURE.greatPersonYieldThresholdBase ?? CULTURE.greatPersonThresholdBase;
  const growth = CULTURE.greatPersonYieldThresholdGrowth ?? CULTURE.greatPersonThresholdGrowth;
  return base * Math.pow(growth, Math.max(0, greatPersonsByType[type] ?? 0));
}

/** R-123 · T-31 · Seuil de victoires de combat pour le GP Leader. */
export function leaderGpVictoriesNeeded(): number {
  return CULTURE.leaderGpVictories ?? CULTURE.greatPersonThresholdBase;
}

/**
 * 7h · R-125 · Himeji : somme des `attackBonusEmpire` des merveilles contrôlées
 * par l'empire (toutes villes), non obsolètes pour le joueur (R-110). Pur :
 * l'appelant (moteur) évalue l'Anarchie (aucun bonus pendant R-122).
 */
export function wonderAttackBonusEmpireOf(
  cities: Array<{ owner: PlayerId; wonders: string[] }>,
  playerId: PlayerId,
  techsUnlocked: readonly string[],
): number {
  let bonus = 0;
  for (const city of cities) {
    if (city.owner !== playerId) continue;
    for (const wonderId of [...city.wonders].sort()) {
      const w = WONDERS[wonderId];
      if (w?.attackBonusEmpire && !isWonderObsolete(wonderId, techsUnlocked)) bonus += w.attackBonusEmpire;
    }
  }
  return bonus;
}
