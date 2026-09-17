/**
 * L2 — cycle complet Fortify à travers le GameDO (Phase 5) : l'ordre est
 * accepté par la validation serveur, l'état fortifié persiste d'un tour à
 * l'autre (R-33, ordre non consommé), et un autre ordre l'annule à la
 * résolution. Le bonus T-17 lui-même est couvert par les tests du moteur
 * (packages/rules/tests/fortify.test.ts).
 */
import { describe, expect, it } from 'vitest';
import type { GameCreationSettings, Snapshot, TurnResult } from '@game/shared';
import { createGame, joinGame, makeToken, openGameSocket } from './helpers.js';
import type { TestSocket } from './helpers.js';

const NO_TIMER: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false };
const ALICE = { id: 'dev:alice', name: 'Alice' };
const BOB = { id: 'dev:bob', name: 'Bob' };

async function ready() {
  const code = await createGame(ALICE, NO_TIMER);
  await joinGame(BOB, code);
  const alice = await openGameSocket(code, await makeToken(ALICE.id, ALICE.name));
  await alice.waitFor('Welcome');
  const snapA = (await alice.waitFor('Snapshot')) as Snapshot;
  const bob = await openGameSocket(code, await makeToken(BOB.id, BOB.name));
  await bob.waitFor('Welcome');
  await bob.waitFor('Snapshot');
  const myUnitId = Object.keys(snapA.state.units)[0]!;
  return { code, alice, bob, myUnitId };
}

async function playTurn(alice: TestSocket, bob: TestSocket): Promise<TurnResult> {
  alice.send({ type: 'EndTurn' });
  await alice.waitFor('OrderAck');
  bob.send({ type: 'EndTurn' });
  const result = (await alice.waitFor('TurnResult')) as TurnResult; // état filtré d'ALICE
  await bob.waitFor('TurnResult');
  return result;
}

describe('GameDO · cycle Fortify (R-33)', () => {
  it('fortifier → persiste au tour suivant → un Move l’annule', async () => {
    const { alice, bob, myUnitId } = await ready();

    // Tour 1 : fortification.
    alice.send({ type: 'SubmitOrder', order: { type: 'Fortify', unitId: myUnitId } });
    const ack = await alice.waitFor('OrderAck');
    if (ack.type !== 'OrderAck') throw new Error('OrderAck attendu');
    expect(ack.accepted).toBe(true);
    const r1 = await playTurn(alice, bob);
    expect(r1.state.units[myUnitId]?.fortified).toBe(true);

    // Tour 2 : aucun ordre — la fortification persiste (non consommée).
    const r2 = await playTurn(alice, bob);
    expect(r2.state.units[myUnitId]?.fortified).toBe(true);

    // Tour 3 : un Move conserve la fortification SI l'unité ne bouge pas —
    // on cible donc une case adjacente praticable (ENGAGEMENT R-175 : la
    // fortification est perdue par le DÉPLACEMENT, plus par l'ordre).
    const unit = r2.state.units[myUnitId]!;
    const dirs: Array<[number, number]> = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
    const cible = dirs
      .map(([dq, dr]) => ({ q: unit.q + dq, r: unit.r + dr }))
      .find((h) => (r2.state.map as Record<string, { terrain: string } | undefined>)[`${h.q},${h.r}`]);
    expect(cible).toBeDefined();
    alice.send({
      type: 'SubmitOrder',
      order: { type: 'Move', unitId: myUnitId, path: [cible!] },
    });
    await alice.waitFor('OrderAck');
    const r3 = await playTurn(alice, bob);
    const apres = r3.state.units[myUnitId]!;
    if (apres.q === unit.q && apres.r === unit.r) {
      // Déplacement refusé (case devenue infranchissable/occupée en fog) :
      // l'unité est demeurée — ENGAGEMENT R-175 : la fortification persiste.
      expect(apres.fortified).toBe(true);
    } else {
      expect(apres.fortified).toBe(false); // déplacement exécuté : perdue
    }
  });

  it('un ordre Fortify sur une unité ennemie est refusé', async () => {
    const { alice, bob } = await ready();
    // u1 est l'unité d'ALICE ; u2 est celle de BOB — invisible d'Alice mais existante.
    alice.send({ type: 'SubmitOrder', order: { type: 'Fortify', unitId: 'u2' } });
    const ack = await alice.waitFor('OrderAck');
    if (ack.type !== 'OrderAck') throw new Error('OrderAck attendu');
    expect(ack.accepted).toBe(false);
    void bob;
  });
});
