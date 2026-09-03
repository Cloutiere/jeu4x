/**
 * Barbares & huttes côté serveur (Phase 7d, RULES.md §7.9) :
 *  - les barbares jouent dans les résolutions ASYNCHRONES (un seul joueur
 *    verrouillé + échéance du timer) ;
 *  - l'admin dump expose villages/huttes/compteurs (L2) ;
 *  - l'enrichissement des états migrés v7 (villages/huttes depuis la carte,
 *    via meta.settings.mapId) ;
 *  - anti-triche : aucune unité barbare hors vision ne quitte le serveur.
 */
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { GameCreationSettings, Snapshot, TurnResult } from '@game/shared';
import type { GameState } from '@game/rules';
import { adminDump, createGame, gameNamespace, joinGame, makeToken, openGameSocket } from './helpers.js';

const WITH_TIMER: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: 5, isPublic: true };
const ALICE = { id: 'dev:alice', name: 'Alice' };
const BOB = { id: 'dev:bob', name: 'Bob' };

describe('GameDO · Phase 7d (barbares & huttes)', () => {
  it('la carte de départ porte villages et huttes (compteurs à zéro) — dump admin', async () => {
    const code = await createGame(ALICE, WITH_TIMER);
    await joinGame(BOB, code);
    const dump = await adminDump(code);
    expect(dump.barbares).toBeDefined();
    expect(dump.barbares!.villages).toHaveLength(3); // R-96 : 3 villages sur les cartes 40×40
    expect(dump.barbares!.huts).toHaveLength(2); // R-98 : 2 huttes
    for (const v of dump.barbares!.villages) {
      expect(v.hp).toBe(3); // T-21
      expect(v.spawnCountdown).toBe(3); // T-18
      expect(v.unitésVivantes).toBe(0);
    }
    expect(dump.state!.mapId).toBe('pangee-40');
  });

  it('asynchrone : résolution à UN SEUL joueur verrouillé + timer — les barbares sont engendrés et jouent', async () => {
    const code = await createGame(ALICE, WITH_TIMER);
    await joinGame(BOB, code);
    const alice = await openGameSocket(code, await makeToken(ALICE.id, ALICE.name));
    const bob = await openGameSocket(code, await makeToken(BOB.id, BOB.name));
    await alice.waitFor('Snapshot');
    await bob.waitFor('Snapshot');
    const stub = gameNamespace.get(gameNamespace.idFromName(code));

    // Tour 1 : A seul verrouillé, B auto-verrouillé par l'échéance (timer).
    alice.send({ type: 'EndTurn' });
    await alice.waitFor('OrderAck');
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const t1 = (await alice.waitFor('TurnResult')) as TurnResult;
    expect(t1.turn).toBe(1);

    // Tours 2 et 3 : les deux verrouillent (pas de forfait T-06) — au tour 3,
    // les villages engendrent leurs premiers barbares (T-18, Phase C).
    for (const socket of [alice, bob]) {
      socket.send({ type: 'EndTurn' });
      await socket.waitFor('OrderAck');
    }
    await alice.waitFor('TurnResult');
    await bob.waitFor('TurnResult');
    for (const socket of [alice, bob]) {
      socket.send({ type: 'EndTurn' });
      await socket.waitFor('OrderAck');
    }
    const t3Alice = (await alice.waitFor('TurnResult')) as TurnResult;
    const t3Bob = (await bob.waitFor('TurnResult')) as TurnResult;
    expect(t3Alice.turn).toBe(3);

    // Les barbares existent côté serveur (3 villages, 1 unité chacun).
    const dump = await adminDump(code);
    const barbares = Object.values(dump.state!.units).filter((u: { owner: string }) => u.owner === 'barbarien');
    expect(barbares).toHaveLength(3);
    expect(dump.barbares!.villages.every((v) => v.unitésVivantes === 1)).toBe(true);
    // Anti-triche : AUCUN client ne voit les barbares (cases inexplorées, fog).
    expect(t3Alice.state.units['u4']).toBeUndefined();
    expect(Object.values(t3Alice.state.units).filter((u) => u.owner === 'barbarien')).toHaveLength(0);
    expect(Object.values(t3Bob.state.units).filter((u) => u.owner === 'barbarien')).toHaveLength(0);

    // Tour 4 : résolution ASYNCHRONE (A seul verrouillé + timer) — les ordres
    // barbares sont générés par le moteur dans cette résolution (Hold : aucun
    // ennemi dans le rayon d'aggro) et la partie reste cohérente.
    alice.send({ type: 'EndTurn' });
    await alice.waitFor('OrderAck');
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const t4 = (await alice.waitFor('TurnResult')) as TurnResult;
    expect(t4.turn).toBe(4);
    const dump4 = await adminDump(code);
    expect(Object.values(dump4.state!.units).filter((u: { owner: string }) => u.owner === 'barbarien').length).toBeGreaterThanOrEqual(3);
    // Aucune unité barbare dans l'état filtré d'alice (brouillard).
    expect(Object.values(t4.state.units).filter((u) => u.owner === 'barbarien')).toHaveLength(0);
    // Les tours ont continué sans forfait (missedTurns remis à zéro par B tour 2/3).
    expect(dump4.meta!.status).toBe('active');
    alice.close();
    bob.close();
  });

  it("enrichissement : un état migré v7 (sans villages) reçoit villages/huttes/mapId depuis la carte", async () => {
    const code = await createGame(ALICE, WITH_TIMER);
    await joinGame(BOB, code);
    const stub = gameNamespace.get(gameNamespace.idFromName(code));

    // Simule un état legacy v7 : champs 7d absents, schemaVersion 7.
    await runInDurableObject(stub, async (instance: unknown) => {
      const inst = instance as {
        state: DurableObjectState;
        loaded: boolean;
        game: GameState | null;
      };
      const legacy = structuredClone(inst.game) as unknown as Record<string, unknown>;
      delete legacy.villages;
      delete legacy.huts;
      delete legacy.mapId;
      legacy.schemaVersion = 7;
      await inst.state.storage.put('game', legacy as unknown as GameState);
      inst.game = null;
      inst.loaded = false; // force un rechargement (mémoire vidée)
    });

    const dump = await adminDump(code);
    expect(dump.state!.schemaVersion).toBe(11); // migré (v11, Phase 7g) puis enrichi
    expect(dump.state!.mapId).toBe('pangee-40');
    expect(dump.state!.villages).toHaveLength(3);
    expect(dump.state!.huts).toHaveLength(2);
    for (const v of dump.state!.villages!) {
      expect(v.spawnCountdown).toBe(3); // compteurs à zéro (T-18)
      expect(v.spawnedUnits).toEqual([]);
    }
  });
});
