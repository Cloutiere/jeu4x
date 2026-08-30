/**
 * L7 — tests LobbyDO : création (code), join par code validé, listing
 * (public + « mes parties »), refus, abandon.
 */
import { expect, it, describe } from 'vitest';
import type { GameCreationSettings } from '@game/shared';
import { adminDump, createGame, joinGame, makeToken, openLobbySocket } from './helpers.js';

const SETTINGS: GameCreationSettings = { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: true };

describe('LobbyDO · création & listing', () => {
  it('CreateGame répond GameCreated (code 6 caractères) et la partie apparaît en attente', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SETTINGS);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    const bobToken = await makeToken('dev:bob', 'Bob');
    const lobby = await openLobbySocket(bobToken);
    const list = await lobby.waitFor('GameList');
    expect(list.type).toBe('GameList');
    if (list.type !== 'GameList') return;
    expect(list.waiting.map((g) => g.code)).toContain(code);
    lobby.close();
  });

  it('une partie privée n\'apparaît pas dans la liste publique', async () => {
    const code = await createGame(
      { id: 'dev:alice', name: 'Alice' },
      { ...SETTINGS, isPublic: false },
    );
    const token = await makeToken('dev:bob', 'Bob');
    const lobby = await openLobbySocket(token);
    const list = await lobby.waitFor('GameList');
    if (list.type !== 'GameList') return;
    expect(list.waiting.map((g) => g.code)).not.toContain(code);
    lobby.close();
  });
});

describe('LobbyDO · join par code', () => {
  it('join valide : GameJoined, partie active, index « mes parties » des deux joueurs', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SETTINGS);
    await joinGame({ id: 'dev:bob', name: 'Bob' }, code);

    for (const [playerId, name] of [['dev:alice', 'Alice'], ['dev:bob', 'Bob']] as const) {
      const token = await makeToken(playerId, name);
      const lobby = await openLobbySocket(token);
      const list = await lobby.waitFor('GameList');
      if (list.type !== 'GameList') return;
      expect(list.mine.map((g) => g.code)).toContain(code);
      lobby.close();
    }

    const dump = await adminDump(code);
    expect(dump.meta?.status).toBe('active');
    expect(dump.state?.turn).toBe(0);
    expect(Object.keys(dump.state?.units ?? {}).length).toBe(4); // 2 unités par joueur
  });

  it('join un code inconnu → Error notFound', async () => {
    const token = await makeToken('dev:bob', 'Bob');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'JoinGame', code: 'ZZZZZZ' });
    const err = await lobby.waitFor('Error');
    expect(err.type).toBe('Error');
    if (err.type !== 'Error') return;
    expect(err.code).toBe('notFound');
    lobby.close();
  });

  it('partie pleine : un troisième joueur est refusé (gameFull)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SETTINGS);
    await joinGame({ id: 'dev:bob', name: 'Bob' }, code);

    const carolToken = await makeToken('dev:carol', 'Carol');
    const lobby = await openLobbySocket(carolToken);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'JoinGame', code });
    const err = await lobby.waitFor('Error');
    if (err.type !== 'Error') return;
    expect(err.code).toBe('gameFull');
    lobby.close();
  });
});

describe('LobbyDO · abandon', () => {
  it('abandon d\'une partie active : adversaire vainqueur, partie terminée', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SETTINGS);
    await joinGame({ id: 'dev:bob', name: 'Bob' }, code);

    const aliceToken = await makeToken('dev:alice', 'Alice');
    const lobby = await openLobbySocket(aliceToken);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'AbandonGame', code });
    await lobby.waitFor('GameList'); // réponse directe + broadcast
    lobby.close();

    const dump = await adminDump(code);
    expect(dump.meta?.status).toBe('finished');
    expect(dump.meta?.finishedReason).toBe('abandoned');
    expect(dump.state?.winner).toBe('p2'); // Bob (join 2ᵉ → moteur p2) gagne
  });

  it('abandon par un non-participant refusé', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, SETTINGS);
    await joinGame({ id: 'dev:bob', name: 'Bob' }, code);

    const carolToken = await makeToken('dev:carol', 'Carol');
    const lobby = await openLobbySocket(carolToken);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'AbandonGame', code });
    const err = await lobby.waitFor('Error');
    if (err.type !== 'Error') return;
    expect(err.code).toBe('unauthorized');
    lobby.close();
  });
});
