/**
 * CARTE-MULTI (2-5 sièges) — LobbyDO & GameDO :
 *  - création multi-sièges : réservée à la carte libre (D3 — préfabriquées
 *    = 2 sièges, refus propre avec message) ;
 *  - solo N sièges : 1 humain + N−1 bots (ids 'bot', 'bot:3'.., civs
 *    tirées DISTINCTES, seeds par bot — bot solo 1v1 inchangé) ;
 *  - salle d'attente multi : la partie démarre au DERNIER siège rempli,
 *    les joins suivants sont refusés (gameFull) ;
 *  - fin de tour à N : résolution quand TOUS les sièges sont verrouillés,
 *    les bots jouent (recherche posée) ;
 *  - abandon à 3+ : le quitteur est ÉLIMINÉ, la partie CONTINUE (D6 — pas
 *    de diplomatie, le dernier en lice gagne) ; à 2 : fin identique.
 */
import { describe, expect, it } from 'vitest';
import type { GameCreationSettings, ServerToClientMessage } from '@game/shared';
import { botTurnSeed } from '../src/botPolicy.js';
import { adminDump, createGame, joinGame, makeToken, openLobbySocket, openGameSocket } from './helpers.js';

const LIBRE_SOLO5: GameCreationSettings = { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 5 };
const LIBRE_SOLO3: GameCreationSettings = { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 3 };
const LIBRE4: GameCreationSettings = { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: true, playerCount: 4 };

describe('CARTE-MULTI · Création de partie (LobbyDO)', () => {
  it('D3 · les cartes préfabriquées refusent 3+ sièges (message propre)', async () => {
    const token = await makeToken('dev:alice', 'Alice');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, playerCount: 4 } });
    const err = (await lobby.waitFor('Error')) as Extract<ServerToClientMessage, { type: 'Error' }>;
    expect(err.code).toBe('badMessage');
    expect(err.message).toContain('2 sièges');
    lobby.close();
  });

  it('un nombre de sièges invalide est refusé (1 ou 6)', async () => {
    const token = await makeToken('dev:alice', 'Alice');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    for (const playerCount of [1, 6, 2.5]) {
      lobby.send({ type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, playerCount } });
      const err = (await lobby.waitFor('Error')) as Extract<ServerToClientMessage, { type: 'Error' }>;
      expect(err.code).toBe('badMessage');
    }
    lobby.close();
  });
});

describe('CARTE-MULTI · Solo N sièges (1 humain + N−1 bots)', () => {
  it('solo 5 sièges : 4 bots aux ids/civs distincts, état moteur p1..p5', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, LIBRE_SOLO5);
    const dump = await adminDump(code);
    expect(dump.meta?.status).toBe('active'); // démarrage au DERNIER siège rempli
    const players = dump.meta?.players ?? [];
    expect(players).toHaveLength(5);
    expect(players.map((p) => p.engineId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(players[0]).toMatchObject({ id: 'dev:alice' });
    expect(players[1]).toMatchObject({ id: 'bot', bot: true });
    expect(players[2]?.id).toBe('bot:3');
    expect(players[3]?.id).toBe('bot:4');
    expect(players[4]?.id).toBe('bot:5');
    // Civs tirées DISTINCTES (16 civs ≥ 5 sièges — sans remise)
    const civs = players.filter((p) => p.bot).map((p) => p.civId);
    expect(new Set(civs).size).toBe(civs.length);
    // État moteur : 5 joueurs, carte libre générée (stratégie libreMulti)
    expect(Object.keys(dump.state?.players ?? {})).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(dump.meta?.progen?.strategy).toBe('libreMulti');
    expect(dump.meta?.progen?.multi).toBeDefined();
  });

  it('fin de tour : résolution à 5 joueurs, les 4 bots posent leur recherche', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, LIBRE_SOLO5);
    const token = await makeToken('dev:alice', 'Alice');
    const ws = await openGameSocket(code, token);
    await ws.waitFor('Welcome');
    await ws.waitFor('Snapshot');
    // Tour 0 : le bot FONDE sa capitale (départ Colon — R-64) ; tour 1 :
    // recherche et production (critères déterministes de la politique).
    ws.send({ type: 'EndTurn' });
    await ws.waitFor('TurnResult');
    ws.send({ type: 'EndTurn' });
    await ws.waitFor('TurnResult');
    const dump = await adminDump(code);
    expect(dump.state?.turn).toBe(2);
    // la capitale du bot existe (fondée au tour 0)
    expect(Object.values(dump.state?.cities ?? {}).some((c) => (c as { owner?: string }).owner === 'p2' && (c as { capital?: boolean }).capital)).toBe(true);
    expect(dump.state?.winner).toBeNull();
    // Chaque bot (recherche en tête de sa politique) a choisi une tech.
    for (const id of ['p2', 'p3', 'p4', 'p5']) {
      expect(dump.state?.players[id]?.researching, `bot ${id}`).not.toBeNull();
    }
    ws.close();
  });
});

describe('CARTE-MULTI · Salle d\'attente multi (humains)', () => {
  it('4 sièges : démarre au 4e join ; le 5e est refusé (gameFull)', async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, LIBRE4);
    await joinGame({ id: 'dev:bill', name: 'Bill' }, code);
    await joinGame({ id: 'dev:carl', name: 'Carl' }, code);
    let dump = await adminDump(code);
    expect(dump.meta?.status).toBe('waiting'); // 3/4 : pas de démarrage
    expect(dump.state).toBeNull(); // l'état n'est créé qu'au dernier siège
    await joinGame({ id: 'dev:dan', name: 'Dan' }, code);
    dump = await adminDump(code);
    expect(dump.meta?.status).toBe('active');
    expect(dump.meta?.players).toHaveLength(4);
    expect(Object.keys(dump.state?.players ?? {})).toHaveLength(4);
    // complet : un 5e join est refusé
    const token = await makeToken('dev:erin', 'Erin');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'JoinGame', code });
    const err = (await lobby.waitFor('Error')) as Extract<ServerToClientMessage, { type: 'Error' }>;
    expect(err.code).toBe('gameFull');
    lobby.close();
  });
});

describe('CARTE-MULTI · Abandon à N joueurs', () => {
  it('à 3 sièges : l\'abandon ÉLIMINE sans clôturer (partie continue entre bots)', { timeout: 180000 }, async () => {
    const code = await createGame({ id: 'dev:alice', name: 'Alice' }, LIBRE_SOLO3);
    const dump0 = await adminDump(code);
    expect(dump0.meta?.status).toBe('active');
    // Alice abandonne : p1 éliminée, les 2 bots continuent.
    const token = await makeToken('dev:alice', 'Alice');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'AbandonGame', code });
    await lobby.waitFor('GameList');
    lobby.close();
    const dump = await adminDump(code);
    expect(dump.meta?.status).toBe('active'); // NON clôturée (2 joueurs en lice)
    expect(dump.meta?.finishedReason).toBeUndefined();
    expect(dump.state?.winner).toBeNull();
    expect((dump.state?.players.p1 as unknown as { defeated?: boolean })?.defeated).toBe(true);
    expect(dump.lastEvents.some((e) => e.type === 'PlayerDefeated')).toBe(true);
  });
});

describe('CARTE-MULTI · Seeds par bot (botPolicy)', () => {
  it('les bots multiples ont des seeds INDÉPENDANTS ; le bot solo historique est INCHANGÉ', () => {
    const legacy = (Math.imul(7 + 0x9e37, 0x85ebca6b) ^ Math.imul(123 >>> 0, 0xc2b2ae35)) >>> 0;
    expect(botTurnSeed(123, 7)).toBe(legacy); // appel à 2 arguments : forme d'origine
    expect(botTurnSeed(123, 7, 'bot')).toBe(legacy); // id réservé : inchangé
    const seeds = ['bot', 'bot:3', 'bot:4', 'bot:5'].map((id) => botTurnSeed(123, 7, id));
    expect(new Set(seeds).size).toBe(seeds.length); // tous distincts
    // déterminisme (R-80)
    expect(botTurnSeed(123, 7, 'bot:4')).toBe(seeds[2]!);
  });
});
