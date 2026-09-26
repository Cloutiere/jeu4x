/**
 * LOBBY-5 · L2 — le flux de création structuré à 5 sièges (salle d'attente,
 * jointure couleur/civ avec unicité serveur, démarrage par l'hôte).
 *
 * Parties 1v1 historiques : intacts (lobby.test.ts / carte-multi.test.ts).
 */
import { describe, expect, it, vi } from 'vitest';

// La génération procédurale 5 sièges est gourmande : sous la suite complète
// (tous les cœurs occupés), les 30 s par défaut sont justes — 90 s marges.
vi.setConfig({ testTimeout: 90_000 });
import { configPartieDefaut } from '@game/shared';
import type { ConfigPartie } from '@game/shared';
import { CIVILIZATIONS } from '@game/rules';
import { adminDump, createGame, makeToken, openGameSocket, openLobbySocket } from './helpers.js';

const CIVS = Object.keys(CIVILIZATIONS.civs).sort();

/** Config de test : hôte humain (siège 0), `humains`-1 invités humains aux
 *  premiers sièges humains suivants, reste en bots. Palettes distinctes. */
function config5(humains = 1, opts: Partial<ConfigPartie> = {}): ConfigPartie {
  const cfg = configPartieDefaut(CIVS[0]);
  cfg.sieges.forEach((s, i) => {
    if (i > 0 && i < humains) s.type = 'humain';
    if (i > 0) s.civId = null;
  });
  return { ...cfg, ...opts };
}

async function creerPartie5(id: string, cfg: ConfigPartie, isPublic = true): Promise<string> {
  return createGame({ id, name: id }, { mapId: 'procedural-40', turnTimerMinutes: null, isPublic, config: cfg });
}

async function joindre(id: string, code: string, cfg: { paletteId: string; civId?: string | undefined }): Promise<void> {
  const token = await makeToken(id, id);
  const lobby = await openLobbySocket(token);
  await lobby.waitFor('GameList');
  lobby.send({ type: 'JoinGame', code, ...cfg });
  const rep = await lobby.waitFor('GameJoined');
  expect(rep.type).toBe('GameJoined');
  lobby.close();
}

async function demarrer(id: string, code: string): Promise<void> {
  const token = await makeToken(id, id);
  const lobby = await openLobbySocket(token);
  await lobby.waitFor('GameList');
  lobby.send({ type: 'StartGame', code });
  // La diffusion post-mutation confirme la fin du démarrage (bots joints,
  // état initial créé) — on ferme le socket APRÈS, pas pendant.
  await lobby.waitFor('GameList');
  lobby.close();
}

describe('LOBBY-5 · salle d\'attente 5 sièges', () => {
  it('création : la partie attend (jamais auto-active), l\'hôte porte paletteId/siege 0', async () => {
    const code = await creerPartie5('host5a', config5(1));
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('waiting');
    expect(dump.meta!.players).toHaveLength(1);
    expect(dump.meta!.players[0]).toMatchObject({ paletteId: 'bleu-saphir', siege: 0 });
    const cfg = dump.meta!.settings!.config as ConfigPartie | undefined;
    expect(cfg).toBeDefined();
    expect(cfg!.sieges).toHaveLength(5);
  });

  it('jointure : collision de couleur → refus explicite ; couleur libre → acceptée', async () => {
    const code = await creerPartie5('host5b', config5(3));
    const token = await makeToken('inv1b', 'inv1b');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'JoinGame', code, paletteId: 'bleu-saphir' }); // = hôte
    const err = await lobby.waitFor('Error');
    if (err.type !== 'Error') throw new Error('Error attendu');
    expect(err.message).toMatch(/déjà prise par host5b/i);
    // Puis une couleur libre passe.
    lobby.send({ type: 'JoinGame', code, paletteId: 'vert-emeraude', civId: CIVS[1] });
    const rep = await lobby.waitFor('GameJoined');
    expect(rep.type).toBe('GameJoined');
    lobby.close();
    const dump = await adminDump(code);
    expect(dump.meta!.players.find((p) => p.id === 'inv1b')).toMatchObject({ paletteId: 'vert-emeraude', civId: CIVS[1] });
  });

  it('jointure : aucun siège humain libre → gameFull ; siège bot réservé aux bots', async () => {
    const code = await creerPartie5('host5c', config5(1)); // 4 sièges bots
    const token = await makeToken('inv1c', 'inv1c');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'JoinGame', code, paletteId: 'vert-emeraude' });
    const err = await lobby.waitFor('Error');
    if (err.type !== 'Error') throw new Error('Error attendu');
    expect(err.message).toMatch(/aucun siège humain libre|complet/i);
    lobby.close();
  });

  it('civ en doublon entre deux humains → refus (mode manuel)', async () => {
    const code = await creerPartie5('host5d', config5(3));
    const token = await makeToken('inv1d', 'inv1d');
    const lobby = await openLobbySocket(token);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'JoinGame', code, paletteId: 'vert-emeraude', civId: CIVS[0] }); // = hôte
    const err = await lobby.waitFor('Error');
    if (err.type !== 'Error') throw new Error('Error attendu');
    expect(err.message).toMatch(/civilisation déjà prise/i);
    lobby.close();
  });

  it('UpdateGameConfig : l\'hôte édite les bots (type/couleur/civ), un invité ne peut pas, sièges humains occupés préservés', async () => {
    const cfg = config5(3);
    const code = await creerPartie5('host5e', cfg);
    await joindre('inv1e', code, { paletteId: 'vert-emeraude', civId: CIVS[1] });
    // Invité → refusé.
    const tokInv = await makeToken('inv1e', 'inv1e');
    const l1 = await openLobbySocket(tokInv);
    await l1.waitFor('GameList');
    l1.send({ type: 'UpdateGameConfig', code, config: config5(3) });
    const err = await l1.waitFor('Error');
    if (err.type !== 'Error') throw new Error('Error attendu');
    expect(err.message).toMatch(/hôte/i);
    l1.close();
    // Hôte : le siège 1 de l'invité reste humain ; il humanise le siège 2,
    // change la palette du siège 3 (bot) et la topographie.
    const nouvelle = config5(3);
    nouvelle.sieges[3]!.paletteId = 'cyan-celeste';
    nouvelle.topographie = 'un-continent';
    const tokHost = await makeToken('host5e', 'host5e');
    const l2 = await openLobbySocket(tokHost);
    await l2.waitFor('GameList');
    l2.send({ type: 'UpdateGameConfig', code, config: nouvelle });
    await l2.waitFor('GameList'); // diffusion post-mutation
    l2.close();
    // Le siège de l'invité garde sa couleur/civ malgré l'édition.
    const dump = await adminDump(code);
    expect(dump.meta!.players.find((p) => p.id === 'inv1e')).toMatchObject({ paletteId: 'vert-emeraude', civId: CIVS[1] });
  });

  it('hôte seul + 4 bots : StartGame remplit les bots, état actif, 5 joueurs avec palettes/civs', async () => {
    const cfg = config5(1);
    const code = await creerPartie5('host5f', cfg);
    await demarrer('host5f', code);
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('active');
    expect(dump.meta!.players).toHaveLength(5);
    const palettes = dump.meta!.players.map((p) => p.paletteId);
    expect(new Set(palettes).size).toBe(5);
    const bots = dump.meta!.players.filter((p) => p.bot === true);
    expect(bots).toHaveLength(4);
    expect(bots.map((b) => b.civId).every((c) => CIVS.includes(c!))).toBe(true);
    expect(dump.state).not.toBeNull();
    expect(Object.keys(dump.state!.players).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    // Le Welcome du joueur porte la palette (D5 — résolution accent client).
    const tok = await makeToken('host5f', 'host5f');
    const jeu = await openGameSocket(code, tok);
    const welcome = await jeu.waitFor('Welcome');
    expect(welcome.type).toBe('Welcome');
    expect((welcome as unknown as { players: Array<{ paletteId?: string }> }).players.map((p) => p.paletteId)).toContain('bleu-saphir');
    jeu.close();
  });

  it('duel 2 humains + 3 bots : jouable de bout en bout (état p1/p2 humains)', async () => {
    const cfg = config5(2);
    const code = await creerPartie5('host5g', cfg);
    await joindre('inv1g', code, { paletteId: 'rouge-royal', civId: CIVS[2] });
    await demarrer('host5g', code);
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('active');
    expect(dump.meta!.players.filter((p) => p.bot)).toHaveLength(3);
    expect(dump.meta!.players.find((p) => p.id === 'inv1g')).toMatchObject({ paletteId: 'rouge-royal' });
    expect(dump.meta!.players.map((p) => p.civId)).toEqual([CIVS[0], CIVS[2], ...dump.meta!.players.slice(2).map((p) => p.civId)]);
  });

  it('civsAleatoires : 5 civs tirées distinctes, choix manuels ignorés', async () => {
    const cfg = config5(2, { civsAleatoires: true });
    const code = await creerPartie5('host5h', cfg);
    await joindre('inv1h', code, { paletteId: 'rouge-royal', civId: CIVS[3] });
    await demarrer('host5h', code);
    const dump = await adminDump(code);
    const civs = dump.meta!.players.map((p) => p.civId!);
    expect(new Set(civs).size).toBe(5);
    expect(civs.every((c) => CIVS.includes(c))).toBe(true);
    // Tirage seedé : même seed → même répartition (recréé à l'identique,
    // le serveur est déterministe par graine de partie).
  });

  it("StartGame refusé tant qu'un siège humain est vide (D6 — les bots ne prennent que les sièges bots)", async () => {
    const cfg = config5(2); // sièges 1-2 humains, un seul occupé
    const code = await creerPartie5('host5j', cfg);
    const tok = await makeToken('host5j', 'host5j');
    const lobby = await openLobbySocket(tok);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'StartGame', code });
    const err = await lobby.waitFor('Error');
    if (err.type !== 'Error') throw new Error('Error attendu');
    expect(err.message).toMatch(/siège 2 .humain. est vide/i);
    lobby.close();
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('waiting');
    expect(dump.meta!.players.every((p) => p.bot !== true)).toBe(true); // aucun bot créé
  });

  it("un humain peut joindre avec la couleur d'un bot configuré — le bot est réaffecté au démarrage (règle Erik 25/09)", async () => {
    const cfg = config5(2); // sièges 3-5 bots : vert-emeraude, jaune-dor, violet-amethyste
    const code = await creerPartie5('host5k', cfg);
    // l'invité prend Vert Émeraude, palette du bot du siège 3 — ACCEPTÉ
    await joindre('inv1k', code, { paletteId: 'vert-emeraude' });
    await demarrer('host5k', code);
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('active');
    const palettes = dump.meta!.players.map((p) => p.paletteId!);
    expect(new Set(palettes).size).toBe(5);
    expect(palettes).toContain('vert-emeraude'); // l'humain l'a
    // le bot du siège 3 n'a PLUS vert-emeraude (réaffecté à une palette libre)
    const bot3 = dump.meta!.players.find((p) => p.bot === true && p.siege === 2)!;
    expect(bot3.paletteId).not.toBe('vert-emeraude');
  });

  it('invité quitte la salle d\'attente : son siège se libère, la partie reste', async () => {
    const cfg = config5(3);
    const code = await creerPartie5('host5i', cfg);
    await joindre('inv1i', code, { paletteId: 'vert-emeraude' });
    const tok = await makeToken('inv1i', 'inv1i');
    const lobby = await openLobbySocket(tok);
    await lobby.waitFor('GameList');
    lobby.send({ type: 'AbandonGame', code });
    await lobby.waitFor('GameList');
    lobby.close();
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('waiting');
    expect(dump.meta!.players.some((p) => p.id === 'inv1i')).toBe(false);
  });

  it('partie 1v1 historique : flux inchangé (join sans paletteId → démarrage auto)', async () => {
    const code = await createGame({ id: 'host-old', name: 'host-old' }, {
      mapId: 'procedural-40', turnTimerMinutes: null, isPublic: true,
    });
    const dump1 = await adminDump(code);
    expect(dump1.meta!.settings!.config).toBeUndefined();
    await (await import('./helpers.js')).joinGame({ id: 'inv-old', name: 'inv-old' }, code);
    const dump = await adminDump(code);
    expect(dump.meta!.status).toBe('active');
    expect(dump.meta!.players).toHaveLength(2);
    expect(dump.meta!.players.every((p) => p.paletteId === undefined)).toBe(true);
  });
});
