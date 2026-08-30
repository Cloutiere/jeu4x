/**
 * Test du correctif L0 (Phase 3) — côté client : le journal affiche les
 * `missedEvents` du Snapshot. Scénario du bug : le Welcome pose `lastSeq` au
 * bout du journal serveur AVANT l'arrivée du Snapshot ; le filtre de
 * dédoublonnage (`e.seq > lastSeq`) supprimait alors TOUS les missedEvents
 * (journal vide à la reconnexion). La marque de lecture `seenEventSeq` est
 * désormais distincte de `lastSeq` et Welcome n'y touche pas.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@game/shared';
import { appendJournalEvents, initialView, reduceView } from '../src/lib/gameClient.js';

const EVENTS: GameEvent[] = [
  { seq: 10, type: 'Move', unitId: 'u1', owner: 'p1', from: { q: -4, r: 20 }, to: { q: -4, r: 19 } },
  { seq: 11, type: 'TurnResolved', turn: 1 },
];

describe('reduceView · journal et missedEvents (L0)', () => {
  it('un client neuf (page rechargée) affiche les événements de la dernière résolution', () => {
    let v = initialView('ABC123');
    // Welcome : seq courant du serveur (bout du journal = 11).
    v = reduceView(v, { proto: 1, type: 'Welcome', playerId: 'dev:alice', gameCode: 'ABC123', turn: 1, phase: 'orders', seq: 11, players: [], status: 'active', locked: false });
    expect(v.lastSeq).toBe(11);
    // Snapshot avec les missedEvents du tour résolu (seqs ≤ lastSeq).
    v = reduceView(v, { proto: 1, type: 'Snapshot', seq: 11, state: stateOf(1), orders: [], missedEvents: EVENTS, locked: false });
    expect(v.events.map((e) => e.seq)).toEqual([10, 11]);
    expect(v.seenEventSeq).toBe(11);
  });

  it('un client déjà à jour ne duplique pas les événements au resync', () => {
    let v = initialView('ABC123');
    v = reduceView(v, { proto: 1, type: 'Welcome', playerId: 'dev:alice', gameCode: 'ABC123', turn: 1, phase: 'orders', seq: 11, players: [], status: 'active', locked: false });
    v = reduceView(v, { proto: 1, type: 'Snapshot', seq: 11, state: stateOf(1), orders: [], missedEvents: EVENTS, locked: false });
    // Resync à jour : le serveur renvoie encore lastEvents en missedEvents.
    v = reduceView(v, { proto: 1, type: 'Snapshot', seq: 11, state: stateOf(1), orders: [], missedEvents: EVENTS, locked: false });
    expect(v.events.map((e) => e.seq)).toEqual([10, 11]);
  });

  it('la reconnexion après un tour manqué complète le journal sans trou ni doublon', () => {
    let v = initialView('ABC123');
    v = reduceView(v, { proto: 1, type: 'Welcome', playerId: 'dev:alice', gameCode: 'ABC123', turn: 0, phase: 'orders', seq: 0, players: [], status: 'active', locked: false });
    v = reduceView(v, { proto: 1, type: 'Snapshot', seq: 0, state: stateOf(0), orders: [], missedEvents: [], locked: false });
    // Tour manqué pendant la coupure : seqs 10-11 puis 12-13.
    v = reduceView(v, {
      proto: 1, type: 'TurnResult', seq: 13, turn: 1,
      events: [...EVENTS, { seq: 12, type: 'BootyGold', player: 'p1', amount: 10, sourceUnitId: 'u9' } satisfies GameEvent, { seq: 13, type: 'TurnResolved', turn: 2 } satisfies GameEvent],
      state: stateOf(2),
    });
    expect(v.events).toHaveLength(4);
    // Reconnexion : Welcome(seq 13) + Snapshot rejouant la même résolution.
    v = reduceView(v, { proto: 1, type: 'Welcome', playerId: 'dev:alice', gameCode: 'ABC123', turn: 2, phase: 'orders', seq: 13, players: [], status: 'active', locked: false });
    v = reduceView(v, { proto: 1, type: 'Snapshot', seq: 13, state: stateOf(2), orders: [], missedEvents: [...EVENTS, { seq: 13, type: 'TurnResolved', turn: 2 }], locked: false });
    expect(v.events.map((e) => e.seq)).toEqual([10, 11, 12, 13]);
  });

  it('appendJournalEvents reste no-op sur une liste vide ou obsolète', () => {
    let v = initialView('ABC123');
    v = appendJournalEvents(v, []);
    v = appendJournalEvents(v, [{ seq: 1, type: 'TurnResolved', turn: 1 }]);
    v = appendJournalEvents(v, [{ seq: 1, type: 'TurnResolved', turn: 1 }]);
    expect(v.events).toHaveLength(1);
  });
});

/** État minimal crédible (seuls turn/phase/lastEventSeq sont lus par le réducteur). */
function stateOf(turn: number): ReturnType<typeof JSON.parse> {
  return { turn, phase: 'orders', units: {}, cities: {}, map: {}, players: {} };
}
