/**
 * Tests du correctif L0 (Phase 3) : `Snapshot.missedEvents` à la (re)connexion.
 *
 * Scénario observé en vérification manuelle : après une résolution, un socket
 * NEUF (nouvel onglet, page rechargée) doit recevoir les événements de la
 * dernière résolution dans `missedEvents` — le snapshot est l'autorité et le
 * journal client doit pouvoir les afficher (le filtre de dédoublonnage client
 * est couvert par apps/web : reduceView/appendJournalEvents).
 */
import { describe, expect, it } from 'vitest';
import type { GameCreationSettings, Snapshot, TurnResult, Welcome } from '@game/shared';
import { createGame, joinGame, makeToken, openGameSocket } from './helpers.js';

const NO_TIMER: GameCreationSettings = { mapId: 'pedagogique-40', turnTimerMinutes: null, isPublic: true };

const ALICE = { id: 'dev:alice', name: 'Alice' };
const BOB = { id: 'dev:bob', name: 'Bob' };

describe('GameDO · missedEvents de la dernière résolution (L0)', () => {
  it('un socket neuf après une résolution reçoit les événements du tour résolu', async () => {
    const code = await createGame(ALICE, NO_TIMER);
    await joinGame(BOB, code);
    const alice = await openGameSocket(code, await makeToken(ALICE.id, ALICE.name));
    const bob = await openGameSocket(code, await makeToken(BOB.id, BOB.name));
    await alice.waitFor('Welcome');
    await alice.waitFor('Snapshot');
    await bob.waitFor('Welcome');
    await bob.waitFor('Snapshot');

    // Tour 0 résolu normalement (les deux sockets étaient connectés).
    alice.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: 'u1', path: [{ q: -4, r: 19 }] } });
    await alice.waitFor('OrderAck');
    alice.send({ type: 'EndTurn' });
    await alice.waitFor('OrderAck');
    bob.send({ type: 'EndTurn' });
    const result = (await alice.waitFor('TurnResult')) as TurnResult;
    expect(result.events.some((e) => e.type === 'Move' && e.unitId === 'u1')).toBe(true);

    // Les deux sockets se ferment (changement d'onglet, F5…), puis un socket
    // NEUF se connecte : la dernière résolution n'est PAS perdue pour lui.
    alice.close();
    bob.close();
    const fresh = await openGameSocket(code, await makeToken(ALICE.id, ALICE.name));
    const welcome = (await fresh.waitFor('Welcome')) as Welcome;
    const snap = (await fresh.waitFor('Snapshot')) as Snapshot;
    expect(snap.seq).toBe(welcome.seq);
    expect(snap.state.turn).toBe(1);
    expect(snap.missedEvents.length).toBeGreaterThan(0);
    expect(snap.missedEvents.some((e) => e.type === 'Move' && e.unitId === 'u1')).toBe(true);
    expect(snap.missedEvents.some((e) => e.type === 'TurnResolved' && e.turn === 1)).toBe(true);
    // Tous les missedEvents sont ≤ seq du snapshot (continuité du journal).
    for (const e of snap.missedEvents) expect(e.seq).toBeLessThanOrEqual(snap.seq);
    fresh.close();
  });
});
