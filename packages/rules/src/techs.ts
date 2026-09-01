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
import type { BuildingData, TechData, UnitTypeData, WonderData } from './types.js';

export const TECHS: Record<string, TechData> = techsJson as Record<string, TechData>;
export const WONDERS: Record<string, WonderData> = wondersJson as Record<string, WonderData>;

/** R-87 : item de production (unité ou bâtiment) tel que porté par les données. */
export interface ProductionData {
  tech: string | null;
  implemented?: boolean | undefined;
}

function unitAsItem(u: UnitTypeData): ProductionData {
  return { tech: u.tech ?? null, implemented: u.implemented };
}

function buildingAsItem(b: BuildingData): ProductionData {
  return { tech: b.tech };
}

/** Données de débloquage d'un item de production (R-87) — null si id inconnu. */
export function productionDataOf(item: { kind: 'unit' | 'building'; id: string }): ProductionData | null {
  if (item.kind === 'unit') {
    const u = UNIT_TYPES[item.id];
    return u ? unitAsItem(u) : null;
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
