/**
 * L7 — tests GameDO : temps réel à deux sockets, brouillons d'ordres
 * persistés, reconnexion (snapshot + événements manqués), ResyncRequest,
 * alarme (auto-lock + résolution + missedTurns), forfait T-06.
 */
import { runDurableObjectAlarm } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { GameCreationSettings, Snapshot, TurnResult, Welcome } from '@game/shared';
import { adminDump, createGame, gameNamespace, joinGame, makeToken, openGameSocket } from './helpers.js';

const NO_TIMER: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: true };
const WITH_TIMER: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: 5, isPublic: true };

const ALICE = { id: 'dev:alice', name: 'Alice' };
const BOB = { id: 'dev:bob', name: 'Bob' };

/** Partie prête : créée, rejointe, sockets A et B ouverts (Welcome + Snapshot reçus). */
async function readySockets(settings: GameCreationSettings) {
  const code = await createGame(ALICE, settings);
  await joinGame(BOB, code);
  const alice = await openGameSocket(code, await makeToken(ALICE.id, ALICE.name));
  const bob = await openGameSocket(code, await makeToken(BOB.id, BOB.name));
  const welcomeA = (await alice.waitFor('Welcome')) as Welcome;
  const snapA = (await alice.waitFor('Snapshot')) as Snapshot;
  const welcomeB = (await bob.waitFor('Welcome')) as Welcome;
  const snapB = (await bob.waitFor('Snapshot')) as Snapshot;
  return { code, alice, bob, welcomeA, welcomeB, snapA, snapB };
}

describe('GameDO · temps réel à deux onglets', () => {
  it('les deux sockets reçoivent le même état initial et la même résolution', async () => {
    const { code, alice, bob, welcomeA, welcomeB, snapA, snapB } = await readySockets(NO_TIMER);

    expect(welcomeA.status).toBe('active');
    expect(welcomeB.status).toBe('active');
    expect(snapA.state.turn).toBe(0);
    expect(snapB.state.turn).toBe(0);
    // Brouillard : chaque socket voit sa propre unité (1 Guerrier adjacent à
    // la capitale — décision d'Erik du 01/09)…
    expect(Object.keys(snapA.state.units).length).toBe(1);
    expect(Object.keys(snapB.state.units).length).toBe(1);
    // …et A ne voit PAS les unités de B (spawns à distance ≥ 12, décision #7).
    for (const unitId of Object.keys(snapB.state.units)) {
      expect(snapA.state.units[unitId]).toBeUndefined();
    }
    // Ordres v1 : A = p1, B = p2 (ordre de join).
    expect(welcomeA.players).toHaveLength(2);
    expect(snapA.seq).toBe(0);
    expect(snapB.seq).toBe(0);

    // A déplace son guerrier (u1, en (-3,20)), tout le monde verrouille → résolution.
    alice.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: 'u1', path: [{ q: -3, r: 19 }] } });
    const ack = await alice.waitFor('OrderAck');
    expect(ack.type).toBe('OrderAck');
    if (ack.type !== 'OrderAck') return;
    expect(ack.accepted).toBe(true);

    alice.send({ type: 'EndTurn' });
    const lockA = await alice.waitFor('OrderAck');
    expect(lockA.type).toBe('OrderAck');
    bob.send({ type: 'EndTurn' });

    const resultA = (await alice.waitFor('TurnResult')) as TurnResult;
    const resultB = (await bob.waitFor('TurnResult')) as TurnResult;
    expect(resultA.turn).toBe(1);
    expect(resultB.turn).toBe(1);
    expect(resultA.state.turn).toBe(1);
    expect(resultA.seq).toBe(resultB.seq); // même journal, filtrages différents
    // Événement Move public pour A (sa propre unité) et TurnResolved public.
    expect(resultA.events.some((e) => e.type === 'Move' && e.unitId === 'u1')).toBe(true);
    expect(resultA.events.some((e) => e.type === 'TurnResolved')).toBe(true);
    expect(resultB.events.some((e) => e.type === 'TurnResolved')).toBe(true);

    const dump = await adminDump(code);
    expect(dump.locked).toEqual({ p1: false, p2: false }); // déverrouillés pour le tour 1
    expect(dump.orders.p1).toEqual([]); // brouillons consommés
    alice.close();
    bob.close();
  });

  it('un ordre illégal est rejeté individuellement sans bloquer la partie', async () => {
    const { alice } = await readySockets(NO_TIMER);
    alice.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: 'u2', path: [{ q: 0, r: 0 }] } }); // u2 = p2
    const ack = await alice.waitFor('OrderAck');
    if (ack.type !== 'OrderAck') return;
    expect(ack.accepted).toBe(false);
    alice.close();
  });
});

describe('GameDO · SetConversion (R-90, Phase 7b — action immédiate)', () => {
  it('la conversion or→science d’une ville possédée est appliquée et diffusée aux deux clients', async () => {
    const { code, alice, bob } = await readySockets(NO_TIMER);
    alice.send({ type: 'SetConversion', cityId: 'c1', target: 'science' });
    const ack = await alice.waitFor('OrderAck');
    if (ack.type !== 'OrderAck') return;
    expect(ack.accepted).toBe(true);

    // Diffusion immédiate : le snapshot d’A porte la conversion ; B reçoit
    // aussi un snapshot (c1 hors de sa vision → filtré, mais diffusion prouvée).
    const resnap = (await alice.waitFor('Snapshot')) as Snapshot;
    expect(resnap.state.cities['c1']!.conversion).toBe('science');
    const resnapB = (await bob.waitFor('Snapshot')) as Snapshot;
    expect(resnapB.type).toBe('Snapshot');

    // Persisté (vérification directe en stockage via admin — état non filtré).
    const dump = await adminDump(code);
    const cities = (dump.state as unknown as { cities: Record<string, { conversion: string }> } | null)?.cities;
    expect(cities?.['c1']?.conversion).toBe('science');
    alice.close();
    bob.close();
  });

  it('la conversion d’une ville ennemie est rejetée', async () => {
    const { alice } = await readySockets(NO_TIMER);
    alice.send({ type: 'SetConversion', cityId: 'c2', target: 'science' }); // c2 = p2
    const ack = await alice.waitFor('OrderAck');
    if (ack.type !== 'OrderAck') return;
    expect(ack.accepted).toBe(false);
    alice.close();
  });
});

describe('GameDO · brouillons d\'ordres persistés (§3.5)', () => {
  it('les brouillons survivent à la déconnexion (multi-appareil gratuit)', async () => {
    const { code, alice, bob } = await readySockets(NO_TIMER);
    bob.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: 'u2', path: [{ q: 22, r: 19 }] } });
    await bob.waitFor('OrderAck');
    bob.close();

    // Reconnexion de B : le snapshot restaure le brouillon.
    const bob2 = await openGameSocket(code, await makeToken(BOB.id, BOB.name));
    await bob2.waitFor('Welcome');
    const snap = (await bob2.waitFor('Snapshot')) as Snapshot;
    expect(snap.orders).toHaveLength(1);
    expect(snap.orders[0]).toMatchObject({ type: 'Move', unitId: 'u2' });

    // Vérification directe en stockage (admin).
    const dump = await adminDump(code);
    expect(dump.orders.p2).toHaveLength(1);
    alice.close();
    bob2.close();
  });
});

describe('GameDO · alarme : timer, reconnexion, resync, forfait', () => {
  it('échéance du timer : auto-verrouillage des ordres courants + résolution + missedTurns', async () => {
    const { code, alice } = await readySockets(WITH_TIMER);
    // A soumet un ordre puis verrouille ; B ne verrouille pas (déconnecté).
    alice.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: 'u1', path: [{ q: -3, r: 19 }] } });
    await alice.waitFor('OrderAck');
    alice.send({ type: 'EndTurn' });
    await alice.waitFor('OrderAck');

    // Simulation de l'échéance : l'alarme planifiée à la création est
    // exécutée immédiatement (auto-verrouillage + résolution).
    const stub = gameNamespace.get(gameNamespace.idFromName(code));
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const result = (await alice.waitFor('TurnResult')) as TurnResult;
    expect(result.turn).toBe(1);
    const dump = await adminDump(code);
    expect(dump.state?.turn).toBe(1);
    expect(dump.state?.players['p1']?.missedTurns).toBe(0); // A avait verrouillé
    expect(dump.state?.players['p2']?.missedTurns).toBe(1); // B : timer manqué
    alice.close();
  });

  it('reconnexion : snapshot restauré + événements de résolution manqués (missedEvents)', async () => {
    const { code, alice, bob, snapB } = await readySockets(WITH_TIMER);
    const seqBefore = snapB.seq;

    // B se déconnecte, puis l'alarme résout le tour.
    bob.close();
    const stub = gameNamespace.get(gameNamespace.idFromName(code));
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    // B se reconnecte : Welcome (nouveau seq) + Snapshot avec missedEvents.
    const bob2 = await openGameSocket(code, await makeToken(BOB.id, BOB.name));
    const welcome = (await bob2.waitFor('Welcome')) as Welcome;
    const snap = (await bob2.waitFor('Snapshot')) as Snapshot;
    expect(welcome.seq).toBeGreaterThan(seqBefore);
    expect(snap.seq).toBe(welcome.seq);
    expect(snap.state.turn).toBe(1);
    expect(snap.missedEvents.length).toBeGreaterThan(0);
    expect(snap.missedEvents.some((e) => e.type === 'TurnResolved')).toBe(true);
    // Les événements manqués de B ne contiennent pas le Move de A (brouillard).
    expect(snap.missedEvents.some((e) => e.type === 'Move' && e.unitId === 'u1')).toBe(false);
    alice.close();
    bob2.close();
  });

  it('ResyncRequest avec un trou de seq : nouveau snapshot + événements manqués', async () => {
    const { code, alice, snapA } = await readySockets(WITH_TIMER);
    const staleSeq = snapA.seq; // 0 : A n'a rien reçu de la résolution à venir

    const stub = gameNamespace.get(gameNamespace.idFromName(code));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await alice.waitFor('TurnResult');

    // A « suspecte » un trou (dernier seq connu = staleSeq) → resync.
    alice.send({ type: 'ResyncRequest', lastSeq: staleSeq });
    await alice.waitFor('Welcome');
    const snap = (await alice.waitFor('Snapshot')) as Snapshot;
    expect(snap.seq).toBeGreaterThan(staleSeq);
    expect(snap.missedEvents.length).toBeGreaterThan(0);

    // Resync à jour : aucun événement manqué.
    alice.send({ type: 'ResyncRequest', lastSeq: snap.seq });
    await alice.waitFor('Welcome');
    const snap2 = (await alice.waitFor('Snapshot')) as Snapshot;
    expect(snap2.missedEvents).toHaveLength(0);
    alice.close();
  });

  it('forfait T-06 : 3 timers manqués consécutifs → victoire de l\'adversaire', async () => {
    const { code, alice, bob } = await readySockets(WITH_TIMER);
    const stub = gameNamespace.get(gameNamespace.idFromName(code));

    // Trois échéances sans aucun verrouillage : p1 (id moteur le plus petit)
    // atteint T-06 en premier et perd par forfait.
    for (let i = 0; i < 3; i++) {
      expect(await runDurableObjectAlarm(stub)).toBe(true);
    }

    const dump = await adminDump(code);
    expect(dump.meta?.status).toBe('finished');
    expect(dump.meta?.finishedReason).toBe('forfeit');
    expect(dump.state?.winner).toBe('p2');
    expect(dump.state?.players['p1']?.missedTurns).toBe(3);
    expect(dump.lastEvents.some((e) => e.type === 'Victory')).toBe(true);
    alice.close();
    bob.close();
  });
});
