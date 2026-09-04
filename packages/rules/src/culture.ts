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
import { BUILDINGS, CULTURE, FIGURES, unitType } from './data.js';
import { TECHS, WONDERS } from './techs.js';
import type { FigureEntry } from './types.js';
import type { CityId, PlayerId } from './state.js';

/**
 * 7j · R-114 (rév. D1/D2) · Les SIX classes canoniques de GP (doc d'Erik,
 * tableau Consume/Settle) : Grand Artiste / Penseur (fusion de l'ancienne
 * alternance `artiste`/`penseur` 🔶 — décision du doc), Grand Bâtisseur
 * (ex-`ingenieur`), Grand Savant (ex-`scientifique`), Grand Explorateur /
 * Industriel (ex-`mogul`), Grand Humanitaire (NOUVEAU — R-123 complétée) et
 * Grand Leader. Ordre canonique utilisé par la rotation de repli (R-127 🔶).
 */
export const GP_CLASSES = [
  'artiste_penseur',
  'batisseur',
  'savant',
  'explorateur',
  'humanitaire',
  'leader',
] as const;
export type GreatPersonClass = (typeof GP_CLASSES)[number];

/** Compat d'écriture : le nom historique désigne désormais la classe fusionnée. */
export const GREAT_PERSON_TYPES = GP_CLASSES;
export type GreatPersonType = GreatPersonClass;

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
 * 7j · R-127 🔶 (D5.2) · Ciblage technologique de l'identité : la classe du GP
 * engendré par le canal CULTURE est celle de la figure rattachée à la tech EN
 * COURS DE RECHERCHE du joueur (figures.json) ; sans figure associée, rotation
 * déterministe sur l'ordre canonique des 6 classes (index = compteur
 * d'obtention). Aucun RNG (R-80) — pondération déterministe par défaut du
 * handoff 7j (l'alternative tirage seedé R-80 reste possible, non retenue).
 */
export function greatPersonClassFor(researching: string | null, greatPersonsObtained: number): GreatPersonClass {
  const targeted = figureClassForTech(researching);
  if (targeted) return targeted;
  const index = ((greatPersonsObtained % GP_CLASSES.length) + GP_CLASSES.length) % GP_CLASSES.length;
  return GP_CLASSES[index]!;
}

/** 7j · R-126 · Classe de la figure rattachée à une tech (null si aucune). */
export function figureClassForTech(techId: string | null | undefined): GreatPersonClass | null {
  if (!techId) return null;
  for (const cls of GP_CLASSES) {
    const figures = FIGURES.classes[cls]?.figures ?? [];
    if (figures.some((f: FigureEntry) => f.tech === techId)) return cls;
  }
  return null;
}

/** 7j · R-126 · Première figure d'une classe rattachée à une tech (libellés UI). */
export function figureNameForTech(techId: string): string | null {
  for (const cls of GP_CLASSES) {
    for (const f of FIGURES.classes[cls]?.figures ?? []) {
      if ((f as FigureEntry).tech === techId) return f.name;
    }
  }
  return null;
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

/** 7j · R-126 · Compte les GP installés dérivables : jalons − merveilles contrôlées
 *  (le détail UI « GP installés / merveilles » est dérivé de l'état, source
 *  unique). 7j : les jalons sont comptés À L'OBTENTION (doc : « chaque GP
 *  obtenu compte comme un Jalon Culturel ») — pour le VOL (R-119), la liste
 *  réelle des installés fait foi : voir `settledGreatPersonsOfCities`. */
export function installedGreatPersonsOf(cultureMilestones: number, wonderCount: number): number {
  return Math.max(0, cultureMilestones - wonderCount);
}

/** 7j · R-126 · Nombre de GP INSTALLÉS d'un joueur : Σ des listes
 *  `city.settledGreatPersons` (source unique — les GP « en attente de choix »
 *  ne sont pas installés et ne peuvent pas être volés, doc d'Erik). */
export function settledGreatPersonsOfCities(
  cities: Record<CityId, { owner: PlayerId; settledGreatPersons?: string[] }>,
  playerId: PlayerId,
): number {
  let total = 0;
  for (const id of Object.keys(cities).sort()) {
    const c = cities[id]!;
    if (c.owner !== playerId) continue;
    total += c.settledGreatPersons?.length ?? 0;
  }
  return total;
}

/**
 * 7j · R-126 · Facteur de COÛT des bâtiments d'une ville dû aux GP
 * Bâtisseur installés : ×0,5 par Bâtisseur (doc : « réduit de 50 % le coût
 * en marteaux de tous les futurs bâtiments ») — cumulatif multiplicatif 🔶.
 * Pur.
 */
export function settledGpCostFactor(city: { settledGreatPersons?: string[] }, cls: string): number {
  const n = city.settledGreatPersons?.filter((t) => t === cls).length ?? 0;
  return Math.pow(0.5, n);
}

/**
 * 7j · R-126 · Multiplicateur de rendement d'une ville dû aux GP INSTALLÉS
 * (Settle) : +50 % par GP installé de la classe donnée (doc d'Erik : « +50 %
 * de production de X dans la cité hôte ») — cumulatif additif 🔶 (deux Savants
 * installés = +100 %), interprétation documentée. Pur.
 */
export function settledGpMultiplier(city: { settledGreatPersons?: string[] }, cls: string): number {
  const n = city.settledGreatPersons?.filter((t) => t === cls).length ?? 0;
  return 1 + 0.5 * n;
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

/** 7j · GP à rendement (accumulateurs par ville — R-123 complétée) : Grand
 *  Savant (science), Grand Explorateur / Industriel (or), Grand Bâtisseur
 *  (production). Le Grand Humanitaire (croissance — surplus alimentaire) suit
 *  le MÊME modèle (accumulateur `city.gpAccumFood`, même seuil T-30 🔶) ;
 *  Leader conserve son canal victoires (T-31). */
export const YIELD_GP_TYPES = ['savant', 'explorateur', 'batisseur'] as const;
export type YieldGreatPersonType = (typeof YIELD_GP_TYPES)[number];

/**
 * R-123 · T-30 · Seuil d'un accumulateur de GP à rendement : base 🔶 20
 * (culture.json), ×2 par GP de CE TYPE déjà obtenu par l'empire
 * (`player.greatPersonsByType[type]`). Le Leader (T-31) a un seuil FIXE
 * (victoires de combat — interprétation documentée : pas de croissance).
 */
export function yieldGpThresholdFor(
  type: YieldGreatPersonType | 'humanitaire',
  greatPersonsByType: Record<string, number>,
): number {
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
