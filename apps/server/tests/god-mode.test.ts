/**
 * GOD-MODE (décisions d'Erik du 22/10) — côté serveur :
 *  - D3/L1 : la forme de ToggleGodMode est validée EN PREMIER (orderShapeError,
 *    leçon 7f — même contrat que DeclareWar) ;
 *  - D1 : le message est REFUSÉ si un autre humain participe (solo/bots
 *    uniquement — jamais dans un 1v1 humain) ;
 *  - D2 : quand actif, le filtrage fog de CE joueur ne filtre plus (état ET
 *    événements) ; quand inactif, filtrage exact ;
 *  - D4 : le flag survit à la reconnexion (persisté côté GameDO) ;
 *  - D5 : rien dans l'état moteur (aucune migration, schemaVersion intacte).
 */
import { describe, expect, it } from 'vitest';
import type { GameCreationSettings, Snapshot, Welcome } from '@game/shared';
import { adminDump, createGame, joinGame, makeToken, openGameSocket } from './helpers.js';
import { orderShapeError } from '../src/game.js';

const SOLO: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true };
const DUEL: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: true };

async function socketDe(code: string, playerId: string, name: string) {
  const token = await makeToken(playerId, name);
  const ws = await openGameSocket(code, token);
  const welcome = await ws.waitFor('Welcome');
  const snap = await ws.waitFor('Snapshot');
  return { ws, welcome: welcome as Welcome, snap: snap as Snapshot };
}

describe('orderShapeError · ToggleGodMode (leçon 7f — EN PREMIER)', () => {
  it('exige un booléen on, refuse tout le reste', () => {
    expect(orderShapeError({ type: 'ToggleGodMode', on: true })).toBeNull();
    expect(orderShapeError({ type: 'ToggleGodMode', on: false })).toBeNull();
    expect(orderShapeError({ type: 'ToggleGodMode', on: 'oui' })).not.toBeNull();
    expect(orderShapeError({ type: 'ToggleGodMode' })).not.toBeNull();
  });
});

describe('GOD-MODE · bascule solo/bots (D2)', () => {
  it('ON : le snapshot ne filtre plus (toutes les cases + unités ennemies) ; OFF : filtrage exact', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SOLO);
    const { ws, snap } = await socketDe(code, 'dev:alice', 'Alice');
    // Départ filtré : les unités du bot sont hors vision.
    const unitesFiltrees = Object.keys(snap.state.units ?? {}).filter((id) => snap.state.units[id]?.owner === 'p2');
    const dumpAvant = await adminDump(code);
    const unitesBotReelles = Object.values(dumpAvant.state!.units).filter((u) => u.owner === 'p2').length;
    if (unitesBotReelles > 0) expect(unitesFiltrees.length).toBeLessThan(unitesBotReelles);

    ws.send({ type: 'ToggleGodMode', on: true });
    const ack = await ws.waitFor('OrderAck');
    if (ack.type !== 'OrderAck') return;
    expect(ack.accepted).toBe(true);
    const revelé = (await ws.waitFor('Snapshot')) as Snapshot;
    expect(revelé.godMode).toBe(true);
    // Toutes les unités du bot sont visibles.
    const unitesRevelées = Object.values(revelé.state.units ?? {}).filter((u) => u.owner === 'p2').length;
    expect(unitesRevelées).toBe(unitesBotReelles);
    // La carte entière est présente (le filtrage ne garde que l'exploré).
    expect(Object.keys(revelé.state.map).length).toBe(Object.keys((dumpAvant.state as unknown as { map: Record<string, unknown> }).map).length);

    ws.send({ type: 'ToggleGodMode', on: false });
    const ackOff = await ws.waitFor('OrderAck');
    if (ackOff.type !== 'OrderAck') return;
    expect(ackOff.accepted).toBe(true);
    const retiré = (await ws.waitFor('Snapshot')) as Snapshot;
    expect(retiré.godMode).toBeFalsy();
    expect(Object.keys(retiré.state.map).length).toBeLessThan(Object.keys(revelé.state.map).length);
    ws.close();
  });

  it('D5 : l’état moteur est intact (aucune trace du flag dans le dump)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SOLO);
    const { ws } = await socketDe(code, 'dev:alice', 'Alice');
    ws.send({ type: 'ToggleGodMode', on: true });
    await ws.waitFor('OrderAck');
    const dump = await adminDump(code);
    expect(JSON.stringify(dump)).not.toContain('godMode');
    ws.close();
  });
});

describe('GOD-MODE · D1 — refus avec un autre humain', () => {
  it('le message est refusé dans un 1v1 humain', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, DUEL);
    await joinGame({ id: 'dev:bob', name: 'Bob' }, code);
    const { ws } = await socketDe(code, 'dev:alice', 'Alice');
    ws.send({ type: 'ToggleGodMode', on: true });
    const ack = await ws.waitFor('OrderAck');
    if (ack.type !== 'OrderAck') return;
    expect(ack.accepted).toBe(false);
    expect(ack.reason).toContain('humain');
    ws.close();
  });
});

describe('GOD-MODE · D4 — persistance de reconnexion', () => {
  it('après reconnexion, le flag est conservé (snapshot encore révélé)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SOLO);
    const premier = await socketDe(code, 'dev:alice', 'Alice');
    premier.ws.send({ type: 'ToggleGodMode', on: true });
    await premier.ws.waitFor('OrderAck');
    premier.ws.close();

    const token = await makeToken('dev:alice', 'Alice');
    const ws2 = await openGameSocket(code, token);
    await ws2.waitFor('Welcome');
    const snap2 = (await ws2.waitFor('Snapshot')) as Snapshot;
    expect(snap2.godMode).toBe(true);
    ws2.close();
  });
});
