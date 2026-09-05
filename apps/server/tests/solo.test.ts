/**
 * Chantier BOT-SOLO (L1/L2) — tests GameDO/LobbyDO :
 *  - création solo depuis le lobby (case à cocher → partie ACTIVE avec p2 =
 *    joueur bot, démarrage immédiat, badge solo dans « Mes parties ») ;
 *  - civ du bot : imposée au lobby ou tirage seedé (défaut « aléatoire ») ;
 *  - le bot JOUE à chaque résolution (recherche R-85, production R-87) sans
 *    processus externe, dès la fin de tour du joueur humain ;
 *  - les parties pré-solo (2 joueurs) sont inchangées.
 * Les critères du bot utilisés ici sont DÉTERMINISTES (jamais tirés) :
 * SetResearch sans tech en cours et SetProduction pour ville sans file.
 */
import { describe, expect, it } from 'vitest';
import type { GameCreationSettings } from '@game/shared';
import { CIVILIZATIONS } from '@game/rules';
import { adminDump, createGame, joinGame, makeToken, openGameSocket, openLobbySocket } from './helpers.js';

const SOLO: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true };
const DUEL: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: true };

async function hostSocket(code: string) {
  const token = await makeToken('dev:alice', 'Alice');
  const ws = await openGameSocket(code, token);
  await ws.waitFor('Welcome');
  await ws.waitFor('Snapshot');
  return ws;
}

describe('BOT-SOLO · création solo au lobby (L2)', () => {
  it('la case solo crée une partie ACTIVE avec le bot en p2, visible et marquée « solo » dans Mes parties', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SOLO);
    const dump = await adminDump(code);
    expect(dump.meta?.status).toBe('active'); // pas d'attente : démarrage immédiat
    expect(dump.state?.turn).toBe(0);
    const players = dump.meta?.players ?? [];
    expect(players).toHaveLength(2);
    expect(players[1]).toMatchObject({ id: 'bot', name: 'Bot', engineId: 'p2', bot: true });
    // Civ « aléatoire » : un tirage seedé PARMI les civilisations connues (jamais neutre).
    expect(players[1]?.civId).toBeDefined();
    expect(CIVILIZATIONS.civs[players[1]!.civId!]).toBeDefined();
    expect(dump.state?.players.p2).toBeDefined();

    const token = await makeToken('dev:alice', 'Alice');
    const lobby = await openLobbySocket(token);
    const list = await lobby.waitFor('GameList');
    if (list.type !== 'GameList') return;
    const mine = list.mine.find((g) => g.code === code);
    expect(mine).toBeDefined();
    expect(mine?.settings.solo).toBe(true); // badge « solo » du client
    expect(mine?.players[1]?.bot).toBe(true);
    expect(mine?.players[1]?.name).toBe('Bot');
    lobby.close();
  });

  it('la civ du bot peut être imposée au lobby (menu déroulant — réutilise le choix 7n)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, { ...SOLO, botCivId: 'zoulous' });
    const dump = await adminDump(code);
    expect(dump.meta?.players[1]?.civId).toBe('zoulous');
  });

  it('une civ de bot inconnue est refusée (badMessage)', async () => {
    const token = await makeToken('dev:alice', 'Alice');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'CreateGame', settings: { ...SOLO, botCivId: 'atlantes' } });
    const err = await lobby.waitFor('Error');
    if (err.type !== 'Error') return;
    expect(err.code).toBe('badMessage');
    lobby.close();
  });

  it('un humain ne peut pas rejoindre une partie solo (gameFull)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SOLO);
    const token = await makeToken('dev:bob', 'Bob');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'JoinGame', code });
    const err = await lobby.waitFor('Error');
    if (err.type !== 'Error') return;
    expect(err.code).toBe('gameFull');
    lobby.close();
  });
});

describe('BOT-SOLO · le bot joue ses tours (L1)', () => {
  it('EndTurn du joueur → résolution immédiate : recherche et production du bot posées', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SOLO);
    const ws = await hostSocket(code);
    ws.send({ type: 'EndTurn' });
    const ack = await ws.waitFor('OrderAck');
    expect(ack.type).toBe('OrderAck');
    const result = await ws.waitFor('TurnResult');
    if (result.type !== 'TurnResult') return;
    expect(result.turn).toBe(1);

    const dump = await adminDump(code);
    expect(dump.state?.turn).toBe(1);
    // R-85 (critère déterministe) : le bot n'avait pas de tech en cours au
    // tour 0 → il en a choisi une à la résolution.
    expect(dump.state?.players.p2?.researching ?? null).not.toBeNull();
    // R-87 (critère déterministe) : sa capitale avait une file vide → remplie.
    const cities = dump.state?.cities as Record<
      string,
      { owner: string; production: { item: { kind: string; id: string } } | null }
    >;
    const botCity = Object.values(cities).find((c) => c.owner === 'p2');
    expect(botCity?.production ?? null).not.toBeNull();
    // Le bot ne cumule jamais de tours manqués (forfait T-06 hors de portée).
    expect(dump.state?.players.p2?.missedTurns).toBe(0);
    expect(dump.locked).toMatchObject({ p1: false, p2: false }); // tour suivant déverrouillé
    ws.close();
  });

  it('le bot joue CHAQUE tour (3 tours consécutifs — aucun processus externe)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SOLO);
    const ws = await hostSocket(code);
    for (const expectedTurn of [1, 2, 3]) {
      ws.send({ type: 'EndTurn' });
      const result = await ws.waitFor('TurnResult');
      if (result.type !== 'TurnResult') return;
      expect(result.turn).toBe(expectedTurn);
    }
    const dump = await adminDump(code);
    expect(dump.state?.turn).toBe(3);
    expect(dump.resolving).toBeNull();
    ws.close();
  });

  it('abandon d\'une partie solo : le bot gagne par forfait', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SOLO);
    const token = await makeToken('dev:alice', 'Alice');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'AbandonGame', code });
    await lobby.waitFor('GameList');
    lobby.close();
    const dump = await adminDump(code);
    expect(dump.meta?.status).toBe('finished');
    expect(dump.meta?.finishedReason).toBe('abandoned');
    expect(dump.state?.winner).toBe('p2'); // le bot est l'adversaire
  });
});

describe('BOT-SOLO · parties pré-solo inchangées', () => {
  it('partie à 2 joueurs : aucun bot, EndTurn du seul hôte ne résout pas', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, DUEL);
    await joinGame({ id: 'dev:bob', name: 'Bob' }, code);
    const dump = await adminDump(code);
    expect(dump.meta?.players.some((p) => p.bot === true)).toBe(false);
    expect(dump.meta?.settings?.solo).toBeUndefined();

    const ws = await hostSocket(code);
    ws.send({ type: 'EndTurn' });
    const ack = await ws.waitFor('OrderAck');
    expect(ack.type).toBe('OrderAck'); // verrouillé, en attente de Bob
    const after = await adminDump(code);
    expect(after.state?.turn).toBe(0); // PAS de résolution
    expect(after.resolving).toBeNull();
    expect(after.locked).toMatchObject({ p1: true, p2: false });
    ws.close();
  });
});
