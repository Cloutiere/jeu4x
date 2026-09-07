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
import { appendJournalEvents, initialView, reduceView, sameSubject } from '../src/lib/gameClient.js';
import { previewPrograms } from '@game/rules';

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

describe('INTERACTION-3D · coalescing des ordres de ville (retour d\'Erik : le re-clic worked tile doit fonctionner)', () => {
  const swt = (tile: string | null) => ({ type: 'SetWorkedTile', cityId: 'c1', tile }) as const;
  it('deux SetWorkedTile de la même ville coexistent (file : désélection puis assignation)', () => {
    expect(sameSubject(swt(null), swt('2,1'))).toBe(false);
    expect(sameSubject(swt('2,1'), swt(null))).toBe(false);
    expect(sameSubject(swt('2,1'), swt('1,2'))).toBe(false);
  });
  it('deux SetProduction de la même ville se remplacent toujours (comportement inchangé)', () => {
    const sp = (item: object) => ({ type: 'SetProduction', cityId: 'c1', item } as const);
    expect(sameSubject(sp({ kind: 'unit', id: 'guerrier' }), sp({ kind: 'unit', id: 'colon' }))).toBe(true);
    // SetWorkedTile et SetProduction sont des sujets indépendants.
    expect(sameSubject(swt('2,1'), sp({ kind: 'unit', id: 'guerrier' }))).toBe(false);
  });
});

/**
 * POLISSAGE-1 C2 (R-160) — annuler un ordre doit vider IMMÉDIATEMENT
 * l'aperçu : l'OrderAck porte l'unité (ou la ville) annulée, le réducteur
 * purge le brouillon et `previewPrograms` ne montre plus flèche, fantôme ni
 * marqueur d'action finale. Test pur — aucun rendu.
 */
describe('POLISSAGE-1 C2 · l\'aperçu ne voit plus l\'ordre annulé (R-160)', () => {
  const mine = { p1: { vision: { explored: [] as string[] } } };
  const state = {
    turn: 3,
    phase: 'orders',
    units: {
      u1: { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, order: null },
      u2: { id: 'u2', type: 'guerrier', owner: 'p1', q: 2, r: 0, order: { type: 'Move', path: [{ q: 3, r: 0 }] } },
    },
    cities: {},
    map: {},
    players: mine,
  } as never; // GameState minimal — seules units/players.vision sont lues ici

  const draftMove = { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] } as const;
  const vWith = (orders: unknown[]) =>
    ({ ...initialView('ABC123'), playerId: 'dev:alice', state, orders }) as ReturnType<typeof initialView>;

  const ackFor = (unitId: string | null, cityId: string | null) =>
    ({ proto: 1, type: 'OrderAck', seq: 1, accepted: true, order: null, reason: null, cancelledUnitId: unitId, cancelledCityId: cityId }) as const;

  it('annulation acceptée → le brouillon disparaît de la vue', () => {
    const v = vWith([draftMove]);
    const v2 = reduceView(v, ackFor('u1', null));
    expect(v2.orders).toEqual([]);
  });

  it('l\'aperçu après annulation ne montre plus l\'unité annulée (flèche/fantôme/action finale)', () => {
    const v = vWith([{ type: 'MultiStep', unitId: 'u1', path: [{ q: 1, r: 0 }], final: 'foundCity' }]);
    const v2 = reduceView(v, ackFor('u1', null));
    const apercu = previewPrograms(state, { p1: v2.orders });
    expect(apercu.some((p) => p.unitId === 'u1')).toBe(false);
    expect(apercu.some((p) => p.final === 'foundCity')).toBe(false);
  });

  it('le chemin gelé d\'une AUTRE unité reste affiché (l\'annulation est ciblée)', () => {
    const v = vWith([draftMove]);
    const v2 = reduceView(v, ackFor('u1', null));
    const apercu = previewPrograms(state, { p1: v2.orders });
    // u2 porte un chemin gelé (unit.order) — il n'est PAS concerné par l'annulation de u1.
    expect(apercu.map((p) => p.unitId)).toEqual(['u2']);
  });

  it('re-programmer après annulation (D3) → nouvelle flèche, fin de file', () => {
    const v = vWith([{ type: 'Move', unitId: 'u2', path: [{ q: 3, r: 1 }] }, draftMove]);
    let v2 = reduceView(v, ackFor('u1', null));
    expect(v2.orders.map((o) => ('unitId' in o ? o.unitId : null))).toEqual(['u2']);
    v2 = reduceView(v2, { proto: 1, type: 'OrderAck', seq: 2, accepted: true, order: { type: 'Move', unitId: 'u1', path: [{ q: 0, r: 1 }] }, reason: null });
    expect(v2.orders.map((o) => ('unitId' in o ? o.unitId : null))).toEqual(['u2', 'u1']);
    const apercu = previewPrograms(state, { p1: v2.orders });
    expect(apercu.find((p) => p.unitId === 'u1')!.path).toEqual([{ q: 0, r: 1 }]);
  });

  it('annulation d\'une ville → SetProduction/SetWorkedTile de cette ville purgés, les autres unités restent', () => {
    const v = vWith([
      draftMove,
      { type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } },
      { type: 'SetWorkedTile', cityId: 'c9', tile: '1,1' },
    ]);
    const v2 = reduceView(v, ackFor(null, 'c1'));
    expect(v2.orders.map((o) => o.type)).toEqual(['Move', 'SetWorkedTile']);
  });

  it('annulation refusée (aucun ordre) → la vue est inchangée', () => {
    const v = vWith([draftMove]);
    const v2 = reduceView(v, { proto: 1, type: 'OrderAck', seq: 1, accepted: false, order: null, reason: 'aucun ordre à annuler' });
    expect(v2.orders).toHaveLength(1);
  });
});
