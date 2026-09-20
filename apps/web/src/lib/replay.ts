/**
 * REPLAY-RESOLUTION (D1..D7) — matière de la relecture du dernier tour.
 *
 * Côté client uniquement : à l'arrivée d'un `TurnResult`, l'état affiché
 * courant (état PRÉ-résolution, filtré par le fog du joueur — D2) est
 * mémorisé avec les événements du tour. La relecture reconstruit un « état
 * de relecture » (clone léger de l'état pré-résolution) sur lequel les
 * événements rejoués appliquent leur effet visuel (D3) — l'état autoritaire
 * du store n'est JAMAIS muté.
 *
 * Ce module porte les fonctions PURES (testées) ; le store et le câblage WS
 * vivent dans gameClient.ts / Game.svelte.
 */
import { writable } from 'svelte/store';
import type { GameEvent, GameState, ServerToClientMessage } from '@game/shared';
import { unitType } from '@game/rules';
import type { Hex } from '@game/rules';

/** Paire mémorisée à chaque `TurnResult` (remplacée, jamais accumulée — D1). */
export interface PaireReplay {
  /** État d'AVANT résolution, filtré par le fog du joueur (D2/D6). */
  statePre: GameState;
  /** Événements du tour (déjà filtrés par le fog — même prisme que le journal). */
  events: GameEvent[];
  /** Tour résolu (nouveauté affichée : « tour N » = post-résolution). */
  tour: number;
}

/** Store dédié (L2) : null = relecture indisponible (démarrage, après Snapshot). */
export const replayPair = writable<PaireReplay | null>(null);

/**
 * Réducteur PUR de la paire (L2) : un `TurnResult` remplace la paire (l'état
 * pré-résolution est celui lu AVANT mise à jour de la vue, passé en
 * `preState`) ; un `Snapshot` (chargement, reconnexion) purge — sans
 * pré-état local, la relecture serait décalée (défaut sûr : indisponible,
 * missedEvents compris).
 */
export function reducePaireReplay(current: PaireReplay | null, message: ServerToClientMessage, preState: GameState | null): PaireReplay | null {
  if (message.type === 'Snapshot') return null;
  if (message.type === 'TurnResult') return preState ? { statePre: preState, events: message.events, tour: message.turn } : null;
  return current;
}

/** Clone léger de l'état de départ de la relecture (JSON pur — structuredClone). */
export function cloneEtatReplay(state: GameState): GameState {
  return structuredClone(state);
}

/**
 * Applique l'effet visuel d'un événement À L'ÉTAT DE RELECTURE (D3) —
 * mutation du clone, appelée AU DÉBUT de chaque événement rejoué (le sprite
 * disparaît sur UnitDestroyed À L'ÉVÉNEMENT, pas dès le début). Les
 * événements sans effet structurel visible (fx/toasts uniquement) sont sans
 * effet ici. Une unité absente du pré-état (fog) est simplement ignorée.
 */
export function appliquerEvenement(etat: GameState, ev: GameEvent): void {
  switch (ev.type) {
    case 'Move':
    case 'Retreat':
    case 'UnitExpelled':
    case 'UnitDispersed': {
      const u = etat.units[ev.unitId];
      if (u) {
        u.q = ev.to.q;
        u.r = ev.to.r;
        u.fortified = false; // R-175 : perdu à tout déplacement
      }
      break;
    }
    case 'CombatExchange': {
      const a = etat.units[ev.attackerId];
      if (a) a.hp = ev.attackerHpAfter;
      const d = etat.units[ev.defenderId];
      if (d) d.hp = ev.defenderHpAfter;
      break;
    }
    // Mêlée R-180 : PV après mêlée de CHAQUE participante.
    case 'MeleeResolved': {
      for (const res of ev.results) {
        const u = etat.units[res.unitId];
        if (u) u.hp = res.hpAfter;
      }
      break;
    }
    case 'UnitDestroyed':
      delete etat.units[ev.unitId];
      break;
    case 'Captured': {
      const u = etat.units[ev.unitId];
      if (!u) break;
      if (ev.outcome === 'destroyed') delete etat.units[ev.unitId];
      else {
        u.owner = ev.byPlayer;
        u.q = ev.at.q;
        u.r = ev.at.r;
      }
      break;
    }
    case 'CityCaptured': {
      const c = etat.cities[ev.cityId];
      if (c) c.owner = ev.toOwner; // drapeau change À L'ÉVÉNEMENT
      break;
    }
    case 'CityRazed':
      delete etat.cities[ev.cityId];
      break;
    case 'CityFounded': {
      // Ville minimale suffisante au rendu carte (barres de prod/pop) — les
      // panneaux détaillés ne lisent jamais l'état de relecture (mode actif
      // = interactions de carte coupées).
      etat.cities[ev.cityId] = {
        id: ev.cityId,
        q: ev.at.q,
        r: ev.at.r,
        owner: ev.owner,
        pop: 1,
        capital: ev.capital,
        foodStored: 0,
        production: null,
        workedTiles: [],
        buildings: [],
        conversion: 'gold',
        cultureCumulee: 0,
        wonders: [],
        pendingSalvage: 0,
        settledGreatPersons: [],
        wasCaptured: false,
      };
      break;
    }
    case 'UnitProduced': {
      // Unité minimale suffisante au rendu carte (les champs de logique de
      // tour — mp/order/… — ne sont pas lus par le renderer).
      etat.units[ev.unitId] = {
        id: ev.unitId,
        type: ev.unitType,
        owner: ev.owner,
        q: ev.at.q,
        r: ev.at.r,
        hp: unitType(ev.unitType).hpMax,
        mp: 0,
        veteran: false,
        isArmy: false,
        order: null,
        detainedBy: null,
        fortified: false,
        aboard: null,
        cargo: null,
        stabilized: false,
      };
      break;
    }
    case 'Embark': {
      const u = etat.units[ev.unitId];
      if (u) u.aboard = ev.transportId; // plus rendue (dans le navire)
      break;
    }
    case 'Disembark': {
      const u = etat.units[ev.unitId];
      if (u) {
        u.aboard = null;
        u.q = ev.at.q;
        u.r = ev.at.r;
      }
      break;
    }
    case 'PopulationGrew':
    case 'PopulationConsumed': {
      const c = etat.cities[ev.cityId];
      if (c) c.pop = ev.pop;
      break;
    }
    case 'CityNuked': {
      const c = etat.cities[ev.cityId];
      if (c) {
        c.pop = ev.popAfter;
        c.buildings = c.buildings.filter((b) => !ev.buildingsDestroyed.includes(b));
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Comparaison de FIN DE FILE (L4) : après replay complet, les entités VISIBLES
 * de l'état de relecture doivent coïncider avec l'état réel post-résolution —
 * position, PV, propriétaire (unités embarquées comprises via aboard).
 * Les champs non visibles (mp, order, stabilized, cultureCumulee…) sont hors
 * comparaison : la relecture est un rendu, pas une re-simulation (écarts
 * possibles documentés dans REPORT-REPLAY-RESOLUTION.md).
 */
export function etatsCoincident(replay: GameState, reel: GameState): boolean {
  const idsUnits = new Set([...Object.keys(replay.units), ...Object.keys(reel.units)]);
  for (const id of idsUnits) {
    const a = replay.units[id];
    const b = reel.units[id];
    if (!a || !b) return false;
    if (a.q !== b.q || a.r !== b.r || a.hp !== b.hp || a.owner !== b.owner || (a.aboard ?? null) !== (b.aboard ?? null)) return false;
  }
  const idsCities = new Set([...Object.keys(replay.cities), ...Object.keys(reel.cities)]);
  for (const id of idsCities) {
    const a = replay.cities[id];
    const b = reel.cities[id];
    if (!a || !b) return false;
    if (a.q !== b.q || a.r !== b.r || a.owner !== b.owner || a.pop !== b.pop) return false;
  }
  return true;
}

/**
 * L1 — Journal cliquable : case pertinente d'un événement, depuis les
 * DONNÉES STRUCTURÉES (jamais le libellé — D5). `null` = entrée non
 * cliquable. Move/Retreat/expulsion/dispersion → destination ; combats,
 * destructions, villes, production… → case `at` ; ICBM → la cible si
 * détonée, la case du tireur/ville interceptrice sinon.
 */
export function hexDeLEvenement(ev: GameEvent): Hex | null {
  if (ev.type === 'NukeLaunched') return ev.outcome === 'detonated' ? ev.target : ev.at;
  if ('to' in ev) return ev.to;
  if ('at' in ev) return ev.at;
  return null;
}
