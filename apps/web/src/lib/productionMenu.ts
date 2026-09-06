/**
 * Menu de production des villes (UI web) — CORRECTIFS-SOLO signalement 1.
 * Source unique partagée avec le moteur et le bot : la producibilité de chaque
 * item passe par `canSetProduction` (packages/rules, R-87/R-110/R-114/R-117/
 * R-138/R-148) — aucune liste ni règle dupliquée ici. Les armes stratégiques
 * (ICBM, R-138) ne sont JAMAIS listées ; les items verrouillés apparaissent
 * grisés avec leur tech requise (R-87).
 */
import {
  BUILDINGS,
  TECHS,
  UNIT_TYPES,
  canSetProduction,
  isUnitObsolete,
  uniqueReplacing,
} from '@game/rules';
import type { ProductionItem } from '@game/rules';

export interface OptionProd {
  item: ProductionItem;
  name: string;
  cost: number;
  effect: string;
  unlocked: boolean;
  requires: string | null;
  eta: number | null;
}

export interface CtxVilleProduction {
  techsUnlocked: readonly string[];
  buildings: readonly string[];
  civId: string;
  /** R-117 : la ville a-t-elle un accès à la mer (unités navales) ? */
  coastal: boolean;
  prodPerTurn: number;
}

function optionProd(item: ProductionItem, name: string, cost: number, effect: string, ctx: CtxVilleProduction, requires: string | null = null): OptionProd {
  const unlocked = canSetProduction(item, ctx.techsUnlocked, ctx.buildings, ctx.civId);
  let requiresLabel: string | null = null;
  const data = item.kind === 'unit' ? UNIT_TYPES[item.id] : item.kind === 'building' ? BUILDINGS[item.id] : null;
  const tech = data?.tech ?? null;
  if (tech && !ctx.techsUnlocked.includes(tech)) requiresLabel = TECHS[tech]?.name ?? tech;
  if (requires && !ctx.buildings.includes(requires)) {
    requiresLabel = requiresLabel ? `${requiresLabel} + ${BUILDINGS[requires]?.name ?? requires}` : (BUILDINGS[requires]?.name ?? requires);
  }
  return {
    item,
    name,
    cost,
    effect,
    unlocked,
    requires: requiresLabel,
    eta: unlocked && ctx.prodPerTurn > 0 ? Math.ceil(cost / ctx.prodPerTurn) : null,
  };
}

export function sortUnlockedFirst(options: OptionProd[]): OptionProd[] {
  return [...options].sort((a, b) => (a.unlocked === b.unlocked ? 0 : a.unlocked ? -1 : 1));
}

export function optionsUnites(ctx: CtxVilleProduction): OptionProd[] {
  const options: OptionProd[] = [];
  for (const u of Object.values(UNIT_TYPES)) {
    if (u.implemented === false) continue; // Caravane, aériens : données seules (7h+)
    // R-138 : une arme stratégique (ICBM) n'est jamais listée — elle est
    // instanciée par le Projet Manhattan, jamais produite ni achetable.
    if (u.strategic) continue;
    if (u.greatPerson) continue; // 7f · R-114 : les GP ne sortent JAMAIS des files
    // 7n · R-148 : les unités uniques ne sont proposées qu'à LEUR civ ; une
    // unité standard remplacée par un unique disponible est retirée du menu.
    if (u.uniqueTo && u.uniqueTo !== ctx.civId) continue;
    if (!u.uniqueTo && uniqueReplacing(ctx.civId, u.id, ctx.techsUnlocked)) continue;
    // 7e · R-110 : les unités obsolètes sont retirées du menu (CivRev).
    if (isUnitObsolete(u.id, ctx.techsUnlocked)) continue;
    const effect = u.id === 'colon'
      ? `Fonde une ville (consomme ${u.populationCost ?? 0} population)`
      : u.aquatic
        ? `${u.attack}/${u.defense}/${u.movement} — naval (${u.navalAccess === 'ocean' ? 'côte + océan' : 'côte seule'})${u.cargoCapacity ? ' · transporte 1 unité terrestre' : ''}`
        : u.isRanged
          ? `${u.attack}/${u.defense}/${u.movement} — à distance`
          : `${u.attack}/${u.defense}/${u.movement}`;
    const opt = optionProd({ kind: 'unit', id: u.id }, u.name, u.cost, effect, ctx);
    if (u.aquatic && !ctx.coastal) {
      // 7g · R-117 : une unité navale exige une ville côtière (accès mer).
      opt.unlocked = false;
      opt.requires = 'Requiert : accès à la mer';
      opt.eta = null;
    }
    options.push(opt);
  }
  return sortUnlockedFirst(options);
}

export function optionsBatiments(ctx: CtxVilleProduction): OptionProd[] {
  const options: OptionProd[] = [];
  for (const b of Object.values(BUILDINGS)) {
    if (b.fixed || b.implemented === false) continue; // Palais, composants du Vaisseau
    if (ctx.buildings.includes(b.id)) continue; // déjà construit (R-66)
    if (b.replaces && ctx.buildings.includes(b.replaces)) continue; // remplacé (R-111)
    const effect = [
      b.workRadiusBonus > 0 ? 'Rayon de travail 1 → 2' : (b.effect ?? tileEffectLabel(b)),
      b.replaces ? `remplace ${BUILDINGS[b.replaces]?.name ?? b.replaces}` : null,
      b.requiresBuilding ? `requiert ${BUILDINGS[b.requiresBuilding]?.name ?? b.requiresBuilding}` : null,
    ].filter((s): s is string => s !== null).join(' — ');
    options.push(optionProd({ kind: 'building', id: b.id }, b.name, b.cost, effect, ctx, b.requiresBuilding ?? null));
  }
  return sortUnlockedFirst(options);
}

/** Libellé d'effet d'un bâtiment à bonus de terrain (tileBonus peut être null). */
export function tileEffectLabel(b: (typeof BUILDINGS)[string]): string {
  if (!b.tileBonus) return b.effect ?? 'Effet à venir';
  const parts: string[] = [];
  if (b.tileBonus.food) parts.push(`+${b.tileBonus.food} N`);
  if (b.tileBonus.production) parts.push(`+${b.tileBonus.production} P`);
  if (b.tileBonus.commerce) parts.push(`+${b.tileBonus.commerce} C`);
  const TERRAIN_NAMES: Record<string, string> = {
    plaine: 'plaine',
    colline: 'colline',
    montagne: 'montagne',
    desert: 'désert',
    eau: 'mer',
    ocean: 'océan',
  };
  return `${parts.join(' ')} par ${TERRAIN_NAMES[b.tileBonus.terrain] ?? b.tileBonus.terrain}`;
}
