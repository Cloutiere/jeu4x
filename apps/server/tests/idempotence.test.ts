/**
 * L7 — crash-recovery de la résolution (DESIGN.md §3.5) :
 * une exception injectée pendant la résolution est récupérée par l'alarme,
 * avec un résultat BIT À BIT identique (moteur pur et déterministe, R-80).
 */
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '@game/rules';
import type { GameState, Order } from '@game/rules';
import type { GameCreationSettings, Snapshot } from '@game/shared';
import { adminDump, createGame, gameNamespace, joinGame, makeToken, openGameSocket } from './helpers.js';

const WITH_TIMER: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: 5, isPublic: true };
const ALICE = { id: 'dev:alice', name: 'Alice' };
const BOB = { id: 'dev:bob', name: 'Bob' };

describe('GameDO · crash pendant resolveTurn → reprise idempotente', () => {
  it('l\'alarme rejoue la résolution interrompue avec le même résultat bit à bit', async () => {
    const code = await createGame(ALICE, WITH_TIMER);
    await joinGame(BOB, code);
    const alice = await openGameSocket(code, await makeToken(ALICE.id, ALICE.name));
    const snap = (await alice.waitFor('Snapshot')) as Snapshot;
    expect(snap.state.turn).toBe(0);

    // Ordre + verrouillage de A ; B sera auto-verrouillé par le flux d'alarme.
    const move: Order = { type: 'Move', unitId: 'u1', path: [{ q: -3, r: 19 }] };
    alice.send({ type: 'SubmitOrder', order: move });
    await alice.waitFor('OrderAck');
    alice.send({ type: 'EndTurn' });
    await alice.waitFor('OrderAck');

    const stub = gameNamespace.get(gameNamespace.idFromName(code));

    // 1. Résultat de référence : même (état, ordres, graine) → même sortie.
    const before = await adminDump(code);
    const stateBefore = structuredClone(before.state) as unknown as GameState;
    const orders = { p1: [move], p2: [] };
    const expected = resolveTurn(stateBefore, orders, stateBefore.rngSeed);

    // 2. Crash injecté : le motif (phase resolving) est persisté puis la
    //    résolution lève — exactement l'état d'un DO tué en pleine résolution.
    await runInDurableObject(stub, async (instance: unknown) => {
      const inst = instance as {
        locked: Record<string, boolean>;
        startResolution(): Promise<void>;
        finishResolution(): Promise<void>;
      };
      inst.locked = { p1: true, p2: true };
      inst.finishResolution = async () => {
        throw new Error('crash injecté pendant la résolution');
      };
      await expect(inst.startResolution()).rejects.toThrow('crash injecté');
      // Retirer l'override : la méthode du prototype reprend la main pour la reprise.
      delete (inst as unknown as Record<string, unknown>).finishResolution;
    });

    // Le motif idempotent est bien en stockage.
    const during = await adminDump(code);
    expect(during.state?.phase).toBe('resolving');
    expect(during.resolving).toMatchObject({ turn: 0, rngSeed: before.state!.rngSeed });

    // 3. Reprise : le DO se réveille à froid (mémoire vidée) et l'alarme
    //    rejoue la résolution depuis le motif persisté.
    await runInDurableObject(stub, async (instance: unknown) => {
      const inst = instance as { loaded: boolean; alarm(): Promise<void> };
      inst.loaded = false; // éviction : ne JAMAIS faire confiance à la mémoire (§3.3)
      await inst.alarm();
    });

    // 4. Le résultat est bit à bit celui de la résolution de référence.
    const after = await adminDump(code);
    expect(after.state?.phase).toBe('orders');
    expect(after.resolving).toBeNull();
    expect(JSON.stringify(after.state)).toBe(JSON.stringify(expected.newState));
    expect(JSON.stringify(after.lastEvents)).toBe(JSON.stringify(expected.events));
    expect(after.state?.turn).toBe(1);
    expect(after.locked).toEqual({ p1: false, p2: false });

    alice.close();
  });
});
