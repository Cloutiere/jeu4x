/**
 * Premier découvreur — Phase 7e (RULES.md §8.1bis, R-109).
 *
 * CivRev « First to Discover » : le premier joueur à COMPLÉTER une tech
 * reçoit sa récompense (`techs.json → firstToDiscover`). L'état porte
 * `firstBy: Record<techId, playerId>` (migration v8 → v9) ; les bonus
 * PERSISTANTS (perCity par tour, remises de coût) ne sont PAS stockés à part :
 * ils sont dérivés à la volée de `firstBy` (fonctions `empirePerCityBonus` et
 * `buildingCostDiscount`), source unique = l'état.
 *
 * Récompenses appliquées ici (instantanées) : or, unité gratuite, bâtiment
 * gratuit (dans la première ville — capitale par cityId croissant), population
 * instantanée, révélation de carte. Décrites mais ignorées (documenté) :
 * Personnages illustres (7h), récompenses `implemented: false` (unités non
 * implémentées : Espion, Croiseur…). Le volet CULTURE de `perCity` est appliqué
 * depuis 7f (R-113 — `empirePerCityBonus`).
 *
 * Pur et déterministe (R-80/R-81/R-82) : mute l'état de TRAVAIL du moteur
 * (copie de résolution) — jamais un état diffusé.
 */
import { tileKeyOf } from './hex.js';
import type { Hex } from './hex.js';
import { unitType } from './data.js';
import { nextId } from './state.js';
import type { GameState, PlayerId } from './state.js';
import type { FirstDiscoveredPayload } from './events.js';
import type { PerCityBonus } from './types.js';
import { TECHS } from './techs.js';
import { figureClassForTech } from './culture.js';
import { freeSpawnTiles } from './barbares.js';

/** Première ville du joueur : capitale d'abord, sinon cityId croissant (R-81). */
function primaryCity(st: GameState, playerId: PlayerId): (typeof st.cities)[string] | null {
  const cities = Object.values(st.cities)
    .filter((c) => c.owner === playerId)
    .sort((a, b) => Number(b.capital) - Number(a.capital) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return cities[0] ?? null;
}

/** Somme des bonus de ville par tour des techs dont le joueur est Premier découvreur.
 *  7f : le volet CULTURE est activé (R-109/R-113 — Religion, Imprimerie +1). */
export function empirePerCityBonus(
  st: GameState,
  playerId: PlayerId,
): Required<Pick<PerCityBonus, 'gold' | 'science' | 'production' | 'commerce' | 'culture'>> {
  const out = { gold: 0, science: 0, production: 0, commerce: 0, culture: 0 };
  for (const techId of Object.keys(TECHS).sort()) {
    if (st.firstBy[techId] !== playerId) continue;
    const perCity = TECHS[techId]!.firstToDiscover?.perCity;
    if (!perCity) continue;
    out.gold += perCity.gold ?? 0;
    out.science += perCity.science ?? 0;
    out.production += perCity.production ?? 0;
    out.commerce += perCity.commerce ?? 0;
    out.culture += perCity.culture ?? 0;
  }
  return out;
}

/**
 * Applique la récompense de Premier découvrir si le joueur est bien le
 * premier à compléter `techId` (met à jour `firstBy`). Retourne les cityIds
 * dont la population a augmenté (citoyens à auto-assigner par l'appelant) et
 * null si la récompense est absente ou déjà attribuée.
 */
export function applyFirstToDiscover(
  st: GameState,
  playerId: PlayerId,
  techId: string,
  emit: (payload: FirstDiscoveredPayload, citiesToFill: string[]) => void,
): string[] | null {
  const tech = TECHS[techId];
  const reward = tech?.firstToDiscover;
  if (!tech || !reward) return null;
  if (st.firstBy[techId]) return null;
  st.firstBy[techId] = playerId;

  const payload: FirstDiscoveredPayload = {
    type: 'FirstDiscovered',
    player: playerId,
    tech: techId,
    label: reward.label,
  };

  // Or immédiat.
  if (reward.gold && reward.gold > 0) {
    st.players[playerId]!.gold += reward.gold;
    payload.gold = reward.gold;
  }

  // Population instantanée dans toutes les villes (citoyens à assigner par l'appelant).
  const citiesToFill: string[] = [];
  if (reward.population && reward.population > 0) {
    for (const cityId of Object.keys(st.cities).sort()) {
      const city = st.cities[cityId]!;
      if (city.owner !== playerId) continue;
      city.pop += reward.population;
      citiesToFill.push(cityId);
    }
    if (citiesToFill.length > 0) payload.population = reward.population;
  }

  // Bâtiment gratuit : première ville du joueur (capitale prioritaire) —
  // perdu si la ville est déjà dotée (idempotent), remplacement appliqué.
  if (reward.building) {
    const city = primaryCity(st, playerId);
    if (city && !city.buildings.includes(reward.building)) {
      city.buildings.push(reward.building);
      payload.building = reward.building;
      payload.cityId = city.id;
    }
  }

  // Unité gratuite : case de la première ville si libre, sinon case adjacente
  // libre (tri (q, r) via freeSpawnTiles — R-81). Ignorée si non implémentée.
  if (reward.unit) {
    const stats = unitType(reward.unit);
    if (stats.implemented !== false) {
      const city = primaryCity(st, playerId);
      let spot: Hex | null = null;
      if (city) {
        const hex = { q: city.q, r: city.r };
        const occupied = Object.values(st.units).some((u) => u.q === hex.q && u.r === hex.r);
        spot = occupied ? (freeSpawnTiles(st, hex, 1)[0] ?? null) : hex;
      }
      if (spot) {
        const unitId = nextId(st.units, 'u');
        st.units[unitId] = {
          id: unitId,
          type: reward.unit,
          owner: playerId,
          q: spot.q,
          r: spot.r,
          hp: stats.hpMax,
          mp: stats.movement,
          veteran: false,
          isArmy: false,
          order: null,
          detainedBy: null,
          fortified: false,
          aboard: null, // 7g · R-117
          cargo: null,
        };
        payload.unitType = reward.unit;
        payload.unitIds = [unitId];
      }
    }
  }

  // 7j · D5.1 · R-109 étendu : récompense GP du Premier découvrir — le doc
  // accorde un GP gratuit au Premier découvreur de l'Invention (Léonard de
  // Vinci — Bâtisseur) et de la Monarchie (Roi David — Leader). La classe est
  // celle de la figure rattachée à la tech (figures.json · R-126) ; posé sur
  // la case de la première ville (sinon adjacente libre — comme l'unité
  // gratuite). Jalon à l'obtention (R-126) : crédité ici.
  if (reward.greatPerson) {
    const gpClass = figureClassForTech(techId) ?? 'artiste_penseur'; // repli déterministe 🔶
    const gpStats = unitType(gpClass);
    const player = st.players[playerId]!;
    player.greatPersonsByType[gpClass] = (player.greatPersonsByType[gpClass] ?? 0) + 1;
    player.greatPersonsObtained += 1;
    player.cultureMilestones += 1; // jalon À L'OBTENTION (R-126)
    const city = primaryCity(st, playerId);
    let spot: Hex | null = null;
    if (city) {
      const hex = { q: city.q, r: city.r };
      const occupied = Object.values(st.units).some((u) => u.q === hex.q && u.r === hex.r);
      spot = occupied ? (freeSpawnTiles(st, hex, 1)[0] ?? null) : hex;
    }
    if (spot) {
      const unitId = nextId(st.units, 'u');
      st.units[unitId] = {
        id: unitId,
        type: gpClass,
        owner: playerId,
        q: spot.q,
        r: spot.r,
        hp: gpStats.hpMax,
        mp: gpStats.movement,
        veteran: false,
        isArmy: false,
        order: null,
        detainedBy: null,
        fortified: false,
        aboard: null,
        cargo: null,
      };
      payload.greatPerson = gpClass;
      payload.unitIds = [...(payload.unitIds ?? []), unitId];
    }
  }

  // Révélation de carte entière (Vol spatial) : tout l'exploré — le `visible`
  // reste recalculé par le brouillard (Phase D / snapshot).
  if (reward.mapReveal) {
    const player = st.players[playerId]!;
    const explored = new Set([...player.vision.explored, ...Object.keys(st.map)]);
    player.vision = { explored: [...explored].sort(), visible: player.vision.visible };
    payload.mapReveal = true;
  }

  emit(payload, citiesToFill);
  return citiesToFill.length > 0 ? citiesToFill : null;
}
