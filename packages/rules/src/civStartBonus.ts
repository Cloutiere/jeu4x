/**
 * CIV-CAPITALE-FONDEE · R-64 × R-150 — bonus capital-dépendants des
 * civilisations, source UNIQUE partagée par le setup des cartes préfabriquées
 * (map.ts §setup) et la FONDATION d'une capitale au Colon (turn.ts
 * processFoundCity). Constat d'Erik du 14/09 : la Grèce qui fonde n'avait pas
 * son Tribunal (ni la France sa Cathédrale, ni l'Égypte sa merveille, ni
 * l'Amérique son GP) — ces bonus n'étaient posés que sur les capitales
 * préfabriquées.
 *
 * Déterminisme R-80/R-81 : la Merveille Égypte est tirée au RNG DÉDIÉ dérivé
 * du seed de GÉNÉRATION (`rngSeed ^ EGYPT_WONDER_SEED_SALT` — même salt que le
 * setup). À la fondation, un RNG frais est créé avec ce salt : le tirage rend
 * le PREMIER élément du flux salé — même seed ⇒ même merveille, et le RNG de
 * résolution n'est PAS consommé (miroir artefacts R-151). Si la carte porte
 * déjà une Égypte préfabriquée, les deux tirent le même élément (documenté).
 */
import type { City, GameState, PlayerId } from './state.js';
import type { GameEvent } from './events.js';
import type { SeededRng } from './rng.js';
import { createRng } from './rng.js';
import { CIVILIZATIONS, civStartBuildings, civStartsAncientWonder, civStartsFreeGp, civIdOf } from './civilizations.js';
import { greatPersonRotationClass } from './culture.js';
import { TERRAINS, unitType } from './data.js';
import { hexesWithinRadius, tileKeyOf } from './hex.js';
import { nextId } from './state.js';

/** Événement sans `seq` (le journal du Board l'assigne à l'émission — turn.ts). */
type WithoutSeq<T> = T extends { seq: number } ? Omit<T, 'seq'> : never;
type GameEventInput = WithoutSeq<GameEvent>;

/** Salt du RNG dédié au tirage de la Merveille Antique Égypte (setup ET
 *  fondation — valeur historique de map.ts, inchangée). */
export const EGYPT_WONDER_SEED_SALT = 0x2a7f3b91;

export interface CapitalBonusOptions {
  /** RNG Égypte PARTAGÉ (setup : un seul flux pour toutes les Égyptes, dans
   *  l'ordre des spawns). Absent (fondation) : un RNG frais est dérivé du
   *  salt — premier élément du flux, déterministe. */
  egyptRng?: SeededRng;
  /** Journal (fondation uniquement — le setup n'émet pas d'événements). */
  emit?: (event: GameEventInput) => void;
}

/**
 * Applique à `city` (capitale du joueur) les bonus capital-dépendants de sa
 * civilisation : bâtiments gratuits (prérequis R-111 non exigés — même
 * convention que le setup), Merveille Antique Égypte (tirage seedé dédié), GP
 * gratuit Amérique posé sur la capitale (sinon adjacente libre), classe
 * déterministe rotation index 0. Idempotent (garde `includes` — une capitale
 * préfabriquée re-traitée ne reçoit rien de plus). Ne fait rien si `city` n'est
 * pas capitale.
 */
export function applyCapitalStartBonuses(st: GameState, playerId: PlayerId, city: City, opts: CapitalBonusOptions = {}): void {
  if (!city.capital) return;
  const civId = civIdOf(st.players[playerId]);
  const emit = opts.emit ?? ((_e: GameEventInput) => {});
  const at = { q: city.q, r: city.r };

  // 1. Bâtiments gratuits (France Cathédrale, Grèce Tribunal).
  for (const b of civStartBuildings(civId)) {
    if (!city.buildings.includes(b)) {
      city.buildings.push(b);
      emit({ type: 'BuildingCompleted', cityId: city.id, owner: playerId, building: b, at });
    }
  }
  city.buildings.sort();

  // 2. Merveille Antique Égypte — tirage seedé, sans choix du joueur. Événement
  //    WonderCompleted SANS jalon culturel (R-131) : la capitale préfabriquée
  //    n'en reçoit pas non plus — la fondation ne doit pas être plus forte.
  if (civStartsAncientWonder(civId) && city.wonders.length === 0) {
    const rng = opts.egyptRng ?? createRng((st.rngSeed ^ EGYPT_WONDER_SEED_SALT) >>> 0);
    const choices = CIVILIZATIONS.params.egypteWonderChoices;
    const pick = choices.length > 0 ? choices[rng.nextInt(choices.length)] : undefined;
    if (pick && !city.wonders.includes(pick)) {
      city.wonders.push(pick);
      emit({ type: 'WonderCompleted', cityId: city.id, owner: playerId, wonder: pick, at });
    }
  }

  // 3. Personnage illustre gratuit (Amérique) — posé sur la capitale, sinon
  //    adjacente libre et praticable ; classe rotation index 0.
  if (civStartsFreeGp(civId) && !Object.values(st.units).some((u) => u.owner === playerId && unitType(u.type).greatPerson)) {
    const gpType = greatPersonRotationClass(0);
    const stats = unitType(gpType);
    const occupied = Object.values(st.units).some((u) => u.q === at.q && u.r === at.r);
    const spot = !occupied
      ? at
      : hexesWithinRadius(at, 1).find((h) => {
          const t = st.map[tileKeyOf(h)];
          if (!t || !TERRAINS[t.terrain]!.passable) return false;
          return !Object.values(st.units).some((u) => u.q === h.q && u.r === h.r);
        });
    if (spot) {
      const gpId = nextId(st.units, 'u');
      st.units[gpId] = {
        id: gpId,
        type: gpType,
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
        aboard: null,
        cargo: null,
      };
      emit({ type: 'GreatPersonSpawned', unitId: gpId, unitType: gpType, cityId: city.id, owner: playerId, at });
    }
  }
}
