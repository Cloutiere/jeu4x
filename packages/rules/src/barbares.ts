/**
 * Barbares & huttes — Phase 7d (RULES.md §7.9, R-95..R-99).
 *
 * Principe directeur : les barbares sont un pseudo-joueur piloté par le
 * moteur. `barbarianOrders(state)` est une fonction PURE et DÉTERMINISTE
 * appelée en tête de `resolveTurn` : ses ordres suivent les phases normales
 * (mouvements → combats) et ne sont JAMAIS persistés ni diffusés (anti-triche
 * R-95 — seuls les événements résultants, filtrés par fog, quittent le moteur).
 *
 * R-81/R-82 : aucun Math.random(), aucun Date.now(), tris explicites partout.
 */
import { hexDistance, inRectangle, neighbors, tileKeyOf } from './hex.js';
import type { Hex } from './hex.js';
import { BARBARIAN_ID, BARBARIANS, HUT_REWARDS, TERRAINS, unitType } from './data.js';
import type { GameState, Order, Unit } from './state.js';
import { compareUnitIds, nextId } from './state.js';
import type { HutReward } from './events.js';
import type { SeededRng } from './rng.js';

// ---------------------------------------------------------------------------
// Faction barbare (R-95)
// ---------------------------------------------------------------------------

/** Le type d'unité engendré au tour donné (escalade R-95 : archer après T-23). */
export function barbarianUnitType(turn: number): string {
  return turn > BARBARIANS.escalationTurn ? BARBARIANS.units.escalated : BARBARIANS.units.initial;
}

/**
 * Crée une unité barbare sur la case donnée et l'ajoute à l'état de travail
 * (copie mutable de résolution — à ne JAMAIS appeler sur un état diffusé).
 * Les barbares partagent l'espace d'ids 'u' des autres unités (R-81 : nextId).
 */
export function createBarbarianUnit(state: GameState, hex: Hex, type: string): Unit {
  const stats = unitType(type);
  const id = nextId(state.units, 'u');
  const unit: Unit = {
    id,
    type,
    owner: BARBARIAN_ID,
    q: hex.q,
    r: hex.r,
    hp: stats.hpMax,
    mp: stats.movement,
    veteran: false,
    isArmy: false,
    order: null,
    detainedBy: null,
    // R-95 : un barbare ne se fortifie jamais (aucun ordre Fortify généré).
    fortified: false,
  };
  state.units[id] = unit;
  return unit;
}

// ---------------------------------------------------------------------------
// IA barbare (R-97)
// ---------------------------------------------------------------------------

function unitAt(state: GameState, hex: Hex): Unit | null {
  for (const id of Object.keys(state.units).sort(compareUnitIds)) {
    const u = state.units[id]!;
    if (u.q === hex.q && u.r === hex.r) return u;
  }
  return null;
}

function cityAt(state: GameState, hex: Hex): { q: number; r: number } | null {
  for (const id of Object.keys(state.cities).sort()) {
    const c = state.cities[id]!;
    if (c.q === hex.q && c.r === hex.r) return c;
  }
  return null;
}

function passable(state: GameState, hex: Hex): boolean {
  if (!inRectangle(hex, state.mapWidth, state.mapHeight)) return false;
  const tile = state.map[tileKeyOf(hex)];
  return !!tile && TERRAINS[tile.terrain]!.passable;
}

/**
 * R-97 · Ordres barbares du tour. Priorité par unité (unitId croissant) :
 *  1. attaquer une unité ou ville ennemie ADJACENTE (case à défenseur = attaque
 *     du défenseur R-57 ; case de ville sans défenseur = entrer, la ville sera
 *     rasée en Phase C) ;
 *  2. sinon avancer d'un pas vers l'entité ennemie la plus proche dans le
 *     rayon d'aggro T-19 (pas de la ligne hexagonale ; si bloqué, premier pas
 *     réducteur de distance) ;
 *  3. sinon tenir (Hold).
 * Tie-breaks R-81 partout : distance croissante puis (q, r) croissant.
 */
export function barbarianOrders(state: GameState): Order[] {
  const orders: Order[] = [];
  const ids = Object.keys(state.units)
    .filter((id) => state.units[id]!.owner === BARBARIAN_ID)
    .sort(compareUnitIds);
  if (ids.length === 0) return [];

  // Cibles potentielles (entités ennemies) : unités et villes des civilisations.
  const targets: Array<Hex & { kind: 'unit' | 'city' }> = [];
  for (const id of Object.keys(state.units).sort(compareUnitIds)) {
    const u = state.units[id]!;
    if (u.owner === BARBARIAN_ID || u.detainedBy) continue;
    targets.push({ q: u.q, r: u.r, kind: 'unit' });
  }
  for (const id of Object.keys(state.cities).sort()) {
    const c = state.cities[id]!;
    targets.push({ q: c.q, r: c.r, kind: 'city' });
  }
  targets.sort((a, b) => a.q - b.q || a.r - b.r);

  for (const id of ids) {
    const unit = state.units[id]!;
    const here = { q: unit.q, r: unit.r };

    // (1) attaque adjacente — voisins déjà triés (q, r) croissant.
    let acted = false;
    for (const next of neighbors(here)) {
      const defender = unitAt(state, next);
      const city = cityAt(state, next);
      const enemyOnTile = defender && defender.owner !== BARBARIAN_ID;
      if (!enemyOnTile && !city) continue;
      if (enemyOnTile) {
        orders.push({ type: 'Attack', unitId: id, target: next });
      } else {
        // Ville sans défenseur : entrer (rasette en Phase C, R-97).
        orders.push({ type: 'Move', unitId: id, path: [next] });
      }
      acted = true;
      break;
    }
    if (acted) continue;

    // (2) avancer d'un pas vers l'entité ennemie la plus proche dans T-19.
    const inAggro = targets
      .map((t) => ({ t, d: hexDistance(here, t) }))
      .filter(({ d }) => d >= 1 && d <= BARBARIANS.aggroRadius)
      .sort((a, b) => a.d - b.d || a.t.q - b.t.q || a.t.r - b.t.r);
    const target = inAggro[0]?.t;
    if (!target) {
      orders.push({ type: 'Hold', unitId: id });
      continue;
    }
    const step = advanceStep(state, here, target);
    if (step) orders.push({ type: 'Move', unitId: id, path: [step] });
    else orders.push({ type: 'Hold', unitId: id });
  }
  return orders;
}

/**
 * Pas d'avance vers la cible : première case de la ligne hexagonale ; si elle
 * est injoignable (montagne) ou occupée par un ami, premier pas réducteur de
 * distance (déterministe (q, r) croissant) ; sinon null (tenir).
 */
function advanceStep(state: GameState, here: Hex, target: Hex): Hex | null {
  const friendlyBlocks = (h: Hex): boolean => {
    const u = unitAt(state, h);
    return !!u && u.owner === BARBARIAN_ID;
  };
  const d = hexDistance(here, target);
  if (d <= 0) return null;
  // Premier pas de la ligne hexagonale (arrondi cube, même convention que hex.ts).
  const t = 1 / d;
  const first = roundHex(here.q + (target.q - here.q) * t, here.r + (target.r - here.r) * t);
  if (first.q !== here.q || first.r !== here.r) {
    if (passable(state, first) && !friendlyBlocks(first)) return first;
  }
  const better = neighbors(here).filter((h) => hexDistance(h, target) < d);
  return better.find((h) => passable(state, h) && !friendlyBlocks(h)) ?? null;
}

/** Arrondi cube d'un couple flottant (même convention que hex.ts hexRound). */
function roundHex(qf: number, rf: number): Hex {
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(-qf - rf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - -qf - rf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

// ---------------------------------------------------------------------------
// Huttes bonus (R-98)
// ---------------------------------------------------------------------------

/**
 * R-98 · Tir de la récompense de hutte au RNG seedé (table pondérée de
 * huttes.json, R-99). L'or est tiré uniformément dans [amountMin, amountMax].
 */
export function drawHutReward(rng: SeededRng): HutReward {
  const table = HUT_REWARDS.rewards;
  const total = table.reduce((acc, r) => acc + r.weight, 0);
  let threshold = rng.next() * total;
  for (const def of table) {
    threshold -= def.weight;
    if (threshold >= 0) continue;
    switch (def.kind) {
      case 'gold': {
        const min = def.amountMin ?? 0;
        const max = def.amountMax ?? min;
        return { kind: 'gold', amount: min + rng.nextInt(max - min + 1) };
      }
      case 'unit':
        return { kind: 'unit', unitType: HUT_REWARDS.freeUnit, unitIds: [] };
      case 'science':
        return { kind: 'science', amount: HUT_REWARDS.scienceBoost };
      case 'reveal':
        return { kind: 'reveal', radius: HUT_REWARDS.revealRadius };
      case 'ambush':
        return { kind: 'ambush', unitIds: [] };
      case 'nothing':
        return { kind: 'nothing' };
    }
  }
  // Inatteignable (somme > 0 validée par tests d'intégrité R-99).
  return { kind: 'nothing' };
}

/**
 * Cases d'engendrement adjacentes à une case (village ou hutte) : praticables,
 * sans unité, sans ville, sans village — triées (q, r) croissant (R-81).
 * `exclude` retire la case d'origine (l'ouvreur d'une hutte y est).
 */
export function freeSpawnTiles(state: GameState, center: Hex, count: number): Hex[] {
  const villageKeys = new Set(state.villages.map((v) => tileKeyOf(v)));
  const cityKeys = new Set(Object.values(state.cities).map((c) => tileKeyOf(c)));
  const out: Hex[] = [];
  for (const h of neighbors(center)) {
    if (out.length >= count) break;
    const key = tileKeyOf(h);
    if (!passable(state, h)) continue;
    if (unitAt(state, h)) continue;
    if (cityKeys.has(key) || villageKeys.has(key)) continue;
    out.push(h);
  }
  return out;
}
