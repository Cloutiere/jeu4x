/**
 * LobbyDO — singleton `idFromName("lobby")` (L4, DESIGN.md §3.2).
 *
 * Création de parties (code = nom du GameDO = lien d'invitation), join par
 * code, listing des parties publiques en attente, index `playerId → parties`,
 * abandon. Suffisant à l'échelle visée (~10 parties) — pas de D1 ni KV.
 *
 * WebSocket hibernation : chaque socket est authentifié au connect (JWT en
 * query param ou cookie) et porte `{ playerId, name }` en attachment.
 */
import { CIVILIZATIONS, createRng } from '@game/rules';
import type { PlayerId } from '@game/rules';
import { PROTO_VERSION } from '@game/shared';
import type {
  ClientToServerMessage,
  ConfigPartie,
  ErrorCode,
  GameCreationSettings,
  GameStatus,
  GameSummary,
  ServerToClientMessage,
} from '@game/shared';
import { CLES_PALETTES4, configPartieErreur, resoutConflitsPalettes, SIEGES_PAR_PARTIE } from '@game/shared';
import type { Env } from './env.js';
import { jsonResponse, sessionOfRequest } from './env.js';
import { generateCode, generateSeed, isValidCode } from './codes.js';
import { BOT_NAME, BOT_PLAYER_ID } from './botPolicy.js';

interface LobbyGame {
  code: string;
  hostId: PlayerId;
  /** 7n · R-145 : chaque joueur choisit sa civilisation (create/join).
   *  Calibrage canon (Erik 06/09) : la Merveille Antique de l'Égypte est
   *  tirée par le moteur — plus aucun champ wonderId côté lobby. */
  players: Array<{ id: PlayerId; name: string; civId?: string; bot?: boolean; paletteId?: string; siege?: number }>;
  status: GameStatus;
  isPublic: boolean;
  settings: GameCreationSettings;
  turn: number;
  createdAt: number;
  /** LOBBY-5 : graine de partie conservée côté lobby — le tirage seedé des
   *  civs aléatoires au démarrage (D3) est déterministe et rejouable. */
  seed?: number;
}

interface WsAttachment {
  playerId: PlayerId;
  name: string;
}

export class LobbyDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // -----------------------------------------------------------------------
  // Storage helpers (lazy — pas d'état de mémoire réutilisé au réveil)
  // -----------------------------------------------------------------------

  private gameKey(code: string): string {
    return `game:${code}`;
  }

  private async getGame(code: string): Promise<LobbyGame | null> {
    return (await this.state.storage.get<LobbyGame>(this.gameKey(code))) ?? null;
  }

  private async putGame(game: LobbyGame): Promise<void> {
    await this.state.storage.put(this.gameKey(game.code), game);
    // Index playerId → parties (pour « mes parties ») — le joueur BOT n'est
    // jamais indexé (aucune session : personne ne liste « ses » parties).
    const index = (await this.state.storage.get<Record<string, string[]>>('index')) ?? {};
    let changed = false;
    for (const p of game.players) {
      if (p.bot === true) continue;
      const list = index[p.id] ?? [];
      if (!list.includes(game.code)) {
        index[p.id] = [...list, game.code].sort();
        changed = true;
      }
    }
    if (changed) await this.state.storage.put('index', index);
  }

  private async getIndex(): Promise<Record<string, string[]>> {
    return (await this.state.storage.get<Record<string, string[]>>('index')) ?? {};
  }

  private summaryOf(game: LobbyGame): GameSummary {
    return {
      code: game.code,
      status: game.status,
      isPublic: game.isPublic,
      players: game.players.map((p) => ({
        id: p.id,
        name: p.name,
        ...(p.civId ? { civId: p.civId } : {}),
        ...(p.bot === true ? { bot: true } : {}),
        ...(p.paletteId ? { paletteId: p.paletteId } : {}),
        ...(typeof p.siege === 'number' ? { siege: p.siege } : {}),
      })),
      settings: game.settings,
      turn: game.turn,
      createdAt: game.createdAt,
    };
  }

  private async gameListFor(playerId: PlayerId): Promise<ServerToClientMessage> {
    const games = await this.state.storage.list<LobbyGame>({ prefix: 'game:' });
    const all = [...games.values()];
    const waiting = all
      .filter((g) => g.isPublic && g.status === 'waiting')
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((g) => this.summaryOf(g));
    const index = await this.getIndex();
    const mine = (index[playerId] ?? [])
      .map((code) => games.get(this.gameKey(code)))
      .filter((g): g is LobbyGame => !!g && g.status !== 'finished')
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((g) => this.summaryOf(g));
    return { proto: PROTO_VERSION, type: 'GameList', waiting, mine };
  }

  private async broadcastList(): Promise<void> {
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (!att) continue;
      this.sendTo(ws, await this.gameListFor(att.playerId));
    }
  }

  private sendTo(ws: WebSocket, message: ServerToClientMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // socket fermée entre-temps
    }
  }

  private sendError(ws: WebSocket, code: ErrorCode, message: string): void {
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'Error', code, message });
  }

  // -----------------------------------------------------------------------
  // WebSocket + routes internes
  // -----------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Notifié par un GameDO à la fin d'une partie (statut → finished).
    if (url.pathname === '/internal/gameFinished' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as { code?: string; turn?: number } | null;
      if (body?.code) {
        const game = await this.getGame(body.code);
        if (game && game.status !== 'finished') {
          game.status = 'finished';
          game.turn = body.turn ?? game.turn;
          await this.state.storage.put(this.gameKey(game.code), game);
          await this.broadcastList();
        }
      }
      return jsonResponse({ ok: true });
    }

    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return jsonResponse({ error: 'notFound' }, 404);
    }

    const claims = await sessionOfRequest(request, this.env);
    if (!claims) return jsonResponse({ error: 'unauthorized' }, 401);

    const pair = new WebSocketPair();
    const server = pair[1]!;
    server.serializeAttachment({ playerId: claims.sub, name: claims.name } satisfies WsAttachment);
    this.state.acceptWebSocket(server);
    this.sendTo(server, await this.gameListFor(claims.sub));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      return this.sendError(ws, 'badMessage', 'messages binaires non supportés');
    }
    let msg: ClientToServerMessage;
    try {
      msg = JSON.parse(message) as ClientToServerMessage;
    } catch {
      return this.sendError(ws, 'badMessage', 'JSON invalide');
    }
    if (!msg || typeof msg !== 'object' || msg.proto !== PROTO_VERSION || typeof msg.type !== 'string') {
      this.sendError(ws, 'badProto', `proto attendu : ${PROTO_VERSION}`);
      ws.close(1002, 'badProto');
      return;
    }
    const att = ws.deserializeAttachment() as WsAttachment | null;
    if (!att) return;
    try {
      switch (msg.type) {
        case 'CreateGame':
          await this.handleCreate(ws, att, msg.settings);
          break;
        case 'JoinGame':
          await this.handleJoin(ws, att, msg.code, (msg as { civId?: string }).civId, (msg as { paletteId?: string }).paletteId);
          break;
        case 'ListGames':
          this.sendTo(ws, await this.gameListFor(att.playerId));
          break;
        case 'AbandonGame':
          await this.handleAbandon(ws, att, msg.code);
          break;
        case 'UpdateGameConfig':
          await this.handleUpdateConfig(ws, att, msg.code, (msg as { config?: unknown }).config);
          break;
        case 'StartGame':
          await this.handleStart(ws, att, msg.code);
          break;
        case 'SubmitOrder':
        case 'ReplaceOrder':
        case 'CancelOrder':
        case 'EndTurn':
        case 'ResyncRequest':
          this.sendError(ws, 'badMessage', 'message de partie : connecter /ws/game/<code>');
          break;
        default:
          this.sendError(ws, 'badMessage', 'type de message inconnu');
      }
    } catch (err) {
      this.sendError(ws, 'internal', err instanceof Error ? err.message : 'erreur interne');
    }
  }

  // -----------------------------------------------------------------------
  // Création / join / abandon
  // -----------------------------------------------------------------------

  private gameStub(code: string): DurableObjectStub {
    return this.env.GAME.get(this.env.GAME.idFromName(code));
  }

  private async handleCreate(ws: WebSocket, att: WsAttachment, settings: GameCreationSettings): Promise<void> {
    // LOBBY-5 · D1 : la config structurée (5 sièges) est LA voie de création
    // nouvelle forme — flux dédié (salle d'attente, démarrage par l'hôte).
    if (settings && typeof settings === 'object' && (settings as { config?: unknown }).config !== undefined) {
      return this.handleCreateConfig(ws, att, settings);
    }
    if (!settings || typeof settings !== 'object' || !['pedagogique-40', 'pangee-40', 'variee-40', 'procedural-40'].includes(settings.mapId)) {
      return this.sendError(ws, 'badMessage', 'settings invalides');
    }
    if (settings.turnTimerMinutes !== null && !(typeof settings.turnTimerMinutes === 'number' && settings.turnTimerMinutes > 0)) {
      return this.sendError(ws, 'badMessage', 'timer invalide');
    }
    // CARTE-MULTI : sièges 2-5 (défaut 2 — créations existantes inchangées).
    // D3 : les cartes préfabriquées portent exactement 2 spawns — la carte
    // libre (procédurale) est requise pour 3-5 sièges.
    const rawSieges = (settings as { playerCount?: number }).playerCount;
    if (rawSieges !== undefined && !(Number.isInteger(rawSieges) && rawSieges >= 2 && rawSieges <= 5)) {
      return this.sendError(ws, 'badMessage', 'nombre de sièges invalide (2 à 5)');
    }
    const sieges = Math.round(rawSieges ?? 2);
    if (sieges > 2 && settings.mapId !== 'procedural-40') {
      return this.sendError(ws, 'badMessage', 'les cartes préfabriquées sont réservées aux parties à 2 sièges — choisir la carte libre pour 3-5 joueurs');
    }
    // 7n · R-145 : la civ de l'hôte est validée (connue des données). La
    // Merveille Antique (Égypte) est TIRÉE par le moteur — plus de choix.
    const hostCiv = (settings as { civId?: string }).civId;
    if (hostCiv !== undefined && !CIVILIZATIONS.civs[hostCiv]) {
      return this.sendError(ws, 'badMessage', 'civilisation inconnue');
    }
    // Chantier BOT-SOLO (L2) : la case à cocher « Partie solo » crée la
    // partie avec p2 = joueur bot et la DÉMARRE immédiatement (pas de code
    // d'invitation ni d'attente). La civ du bot : choix du lobby ou tirage
    // SEEDÉ par la partie (défaut « aléatoire », R-80 — même seed → même
    // bot, rejouable ; le tirage ne consomme pas le seed de résolution).
    const solo = (settings as { solo?: boolean }).solo === true;
    const rawBotCiv = (settings as { botCivId?: string }).botCivId;
    if (rawBotCiv !== undefined && rawBotCiv !== 'random' && !CIVILIZATIONS.civs[rawBotCiv]) {
      return this.sendError(ws, 'badMessage', 'civilisation du bot inconnue');
    }
    // Génération du code avec vérification de collision (L4).
    let code = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateCode();
      if (!(await this.state.storage.get(this.gameKey(candidate)))) {
        code = candidate;
        break;
      }
    }
    if (!code) return this.sendError(ws, 'internal', 'génération de code impossible');

    const seed = generateSeed();
    // CARTE-MULTI : en solo, TOUS les sièges restants reçoivent un bot
    // (1v1 : un seul bot — flux inchangé ; 5 sièges : 4 bots à civs tirées
    // de façon déterministe et DISTINCTES dans l'ordre des sièges, R-80).
    const botCivIds: Array<string | undefined> = [];
    if (solo) {
      const ids = Object.keys(CIVILIZATIONS.civs).sort(); // R-81
      const rng = createRng((seed ^ 0x000b07) >>> 0);
      const tirees = new Set<string>();
      for (let si = 2; si <= sieges; si++) {
        if (rawBotCiv && rawBotCiv !== 'random' && si === 2) {
          botCivIds.push(rawBotCiv); // 1v1 : la civ demandée s'applique au bot unique
          tirees.add(rawBotCiv);
          continue;
        }
        // Tirage seedé sans remise (civs distinctes quand le pool le permet) ;
        // l'appel au RNG consomme un tir par bot (déterminisme par siège).
        let picked = ids[rng.nextInt(ids.length)]!;
        if (tirees.size < ids.length) {
          while (tirees.has(picked)) picked = ids[rng.nextInt(ids.length)]!;
        }
        tirees.add(picked);
        botCivIds.push(picked);
      }
    }
    const init = await this.gameStub(code).fetch('https://game.internal/internal/init', {
      method: 'POST',
      body: JSON.stringify({
        code,
        host: { id: att.playerId, name: att.name, civId: (settings as { civId?: string }).civId },
        settings,
        isPublic: settings.isPublic === true,
        seed,
      }),
    });
    if (!init.ok) {
      return this.sendError(ws, 'internal', `création de la partie impossible (${init.status})`);
    }

    const game: LobbyGame = {
      code,
      hostId: att.playerId,
      players: [{
        id: att.playerId,
        name: att.name,
        ...((settings as { civId?: string }).civId ? { civId: (settings as { civId?: string }).civId } : {}),
      }],
      status: 'waiting',
      isPublic: settings.isPublic === true,
      settings: {
        mapId: settings.mapId,
        turnTimerMinutes: settings.turnTimerMinutes,
        isPublic: settings.isPublic === true,
        ...(sieges !== 2 ? { playerCount: sieges } : {}),
        ...(solo ? { solo: true } : {}),
        ...(solo && botCivIds[0] ? { botCivId: botCivIds[0] } : {}),
      },
      turn: 0,
      createdAt: Date.now(),
    };
    if (solo) {
      // Les bots rejoignent via le chemin normal (GameDO : état initial créé
      // au DERNIER join — même code que l'invitation d'un humain). Pas de
      // socket : le GameDO génère leurs ordres à chaque résolution. Le
      // PREMIER bot garde l'id réservé 'bot' (parties 1v1 existantes) ; les
      // suivants 'bot:2'..'bot:5' (réservés — l'auth ne délivre jamais ces
      // ids).
      for (let si = 2; si <= sieges; si++) {
        const botId = si === 2 ? BOT_PLAYER_ID : `bot:${si}`;
        const civId = botCivIds[si - 2];
        const join = await this.gameStub(code).fetch('https://game.internal/internal/join', {
          method: 'POST',
          body: JSON.stringify({ player: { id: botId, name: si === 2 ? BOT_NAME : `${BOT_NAME} ${si - 1}`, bot: true, civId } }),
        });
        if (!join.ok) {
          return this.sendError(ws, 'internal', `démarrage du bot impossible (${join.status})`);
        }
        game.players.push({ id: botId, name: si === 2 ? BOT_NAME : `${BOT_NAME} ${si - 1}`, bot: true, ...(civId ? { civId } : {}) });
      }
      game.status = 'active';
    } else if (sieges !== 2) {
      game.settings = { ...game.settings, ...(sieges !== 2 ? { playerCount: sieges } : {}) };
    }
    await this.putGame(game);
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'GameCreated', code });
    await this.broadcastList();
  }

  // -----------------------------------------------------------------------
  // LOBBY-5 — création structurée à 5 sièges (D1-D6)
  // -----------------------------------------------------------------------

  /** Création nouvelle forme : config validée (VALIDATEUR AVANT handlers),
   *  hôte au premier siège humain, partie en `waiting` jusqu'au StartGame
   *  de l'hôte — l'état moteur sera créé au démarrage (dernier join bot). */
  private async handleCreateConfig(ws: WebSocket, att: WsAttachment, settings: GameCreationSettings): Promise<void> {
    const config = (settings as { config?: unknown }).config;
    const erreur = configPartieErreur(config);
    if (erreur) return this.sendError(ws, 'badMessage', erreur);
    const cfg = config as ConfigPartie;
    if (settings.turnTimerMinutes !== null && !(typeof settings.turnTimerMinutes === 'number' && settings.turnTimerMinutes > 0)) {
      return this.sendError(ws, 'badMessage', 'timer invalide');
    }
    // D1 : les cartes préfabriquées quittent l'UI de création — la config
    // structurée porte TOUJOURS la carte libre (mirroir 1v1 resté au labo).
    const settingsFinaux: GameCreationSettings = {
      mapId: 'procedural-40',
      turnTimerMinutes: settings.turnTimerMinutes,
      isPublic: settings.isPublic === true,
      playerCount: SIEGES_PAR_PARTIE,
      config: cfg,
    };

    let code = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateCode();
      if (!(await this.state.storage.get(this.gameKey(candidate)))) {
        code = candidate;
        break;
      }
    }
    if (!code) return this.sendError(ws, 'internal', 'génération de code impossible');
    const seed = generateSeed();

    // L'hôte occupe le PREMIER siège humain de la config (l'UI le met au
    // siège 1) ; sa civ n'est portée qu'en mode manuel (D3).
    const siegeHebergeur = cfg.sieges.findIndex((s) => s.type === 'humain');
    const civHebergeur = cfg.civsAleatoires ? undefined : cfg.sieges[siegeHebergeur]!.civId ?? undefined;
    const init = await this.gameStub(code).fetch('https://game.internal/internal/init', {
      method: 'POST',
      body: JSON.stringify({
        code,
        host: {
          id: att.playerId,
          name: att.name,
          ...(civHebergeur ? { civId: civHebergeur } : {}),
          paletteId: cfg.sieges[siegeHebergeur]!.paletteId,
          siege: siegeHebergeur,
        },
        settings: settingsFinaux,
        isPublic: settingsFinaux.isPublic,
        seed,
      }),
    });
    if (!init.ok) {
      return this.sendError(ws, 'internal', `création de la partie impossible (${init.status})`);
    }

    const game: LobbyGame = {
      code,
      hostId: att.playerId,
      players: [{
        id: att.playerId,
        name: att.name,
        ...(civHebergeur ? { civId: civHebergeur } : {}),
        paletteId: cfg.sieges[siegeHebergeur]!.paletteId,
        siege: siegeHebergeur,
      }],
      status: 'waiting',
      isPublic: settingsFinaux.isPublic,
      settings: settingsFinaux,
      turn: 0,
      createdAt: Date.now(),
      seed,
    };
    await this.putGame(game);
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'GameCreated', code });
    await this.broadcastList();
  }

  /** Jointure nouvelle forme : premier siège humain libre + couleur libre
   *  (unicité SERVEUR — collision → refus explicite, D2) + civ libre (D3). */
  private async handleJoinConfig(ws: WebSocket, att: WsAttachment, game: LobbyGame, rawCode: string, civId?: string, paletteId?: string): Promise<void> {
    const cfg = game.settings.config!;
    if (game.status !== 'waiting') return this.sendError(ws, 'gameFull', 'partie complète');
    if (typeof paletteId !== 'string' || !CLES_PALETTES4.includes(paletteId)) {
      return this.sendError(ws, 'badMessage', 'couleur manquante ou inconnue');
    }
    if (game.players.length >= cfg.sieges.length) return this.sendError(ws, 'gameFull', 'partie complète');
    const prises = new Set(game.players.map((p) => p.siege));
    const siegeLibre = cfg.sieges.findIndex((s, i) => s.type === 'humain' && !prises.has(i));
    if (siegeLibre < 0) return this.sendError(ws, 'gameFull', 'aucun siège humain libre');
    const preneur = game.players.find((p) => p.paletteId === paletteId);
    if (preneur) return this.sendError(ws, 'badMessage', `couleur déjà prise par ${preneur.name}`);
    const civ = cfg.civsAleatoires ? undefined : civId && CIVILIZATIONS.civs[civId] ? civId : undefined;
    if (civ) {
      const occupant = game.players.find((p) => p.civId === civ);
      if (occupant) return this.sendError(ws, 'badMessage', `civilisation déjà prise par ${occupant.name}`);
    }
    const join = await this.gameStub(rawCode).fetch('https://game.internal/internal/join', {
      method: 'POST',
      body: JSON.stringify({
        player: { id: att.playerId, name: att.name, ...(civ ? { civId: civ } : {}), paletteId, siege: siegeLibre },
        // D6 : le démarrage est l'acte de l'hôte — remplir tous les sièges
        // n'active PAS la partie (démarrage manuel, salle d'attente).
        demarrageManuel: true,
      }),
    });
    if (!join.ok) {
      return this.sendError(ws, join.status === 409 ? 'gameFull' : 'internal', 'impossible de rejoindre la partie');
    }
    game.players.push({
      id: att.playerId,
      name: att.name,
      ...(civ ? { civId: civ } : {}),
      paletteId,
      siege: siegeLibre,
    });
    await this.putGame(game);
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'GameJoined', code: rawCode });
    await this.broadcastList();
  }

  /** D6 — l'hôte modifie sa config tant que la partie attend. Même
   *  validateur ; les sièges humains OCCUPÉS restent humains et gardent
   *  leur couleur/civ (l'invité n'est pas délogé par une édition). */
  private async handleUpdateConfig(ws: WebSocket, att: WsAttachment, rawCode: string, config: unknown): Promise<void> {
    const code = String(rawCode ?? '').toUpperCase();
    const game = await this.getGame(code);
    if (!game) return this.sendError(ws, 'notFound', 'partie inconnue');
    if (game.hostId !== att.playerId) return this.sendError(ws, 'unauthorized', 'seul l’hôte modifie la configuration');
    if (game.status !== 'waiting') return this.sendError(ws, 'badPhase', 'la partie a démarré — configuration verrouillée');
    if (!game.settings.config) return this.sendError(ws, 'badMessage', 'partie ancienne forme : configuration non modifiable');
    const erreur = configPartieErreur(config);
    if (erreur) return this.sendError(ws, 'badMessage', erreur);
    const cfg = config as ConfigPartie;
    for (const p of game.players) {
      if (typeof p.siege !== 'number') continue;
      const siege = cfg.sieges[p.siege]!;
      if (siege.type !== 'humain') {
        return this.sendError(ws, 'badMessage', `siège ${p.siege + 1} occupé par ${p.name} — son type ne peut pas devenir bot`);
      }
      siege.paletteId = p.paletteId!;
      siege.civId = cfg.civsAleatoires ? null : p.civId ?? null;
    }
    game.settings = { ...game.settings, config: cfg };
    await this.putGame(game);
    // La copie settings du GameDO est alignée IMMÉDIATEMENT (sinon divergente
    // jusqu'au StartGame — et le dump admin mentirait).
    await this.gameStub(code).fetch('https://game.internal/internal/configurerJoueurs', {
      method: 'POST',
      body: JSON.stringify({ joueurs: [], config: cfg }),
    });
    await this.broadcastList();
  }

  /** D6 — démarrage par l'hôte : verrouillage, tirage seedé des civs
   *  aléatoires (uniques, révélées à tous), remplissage des sièges bots —
   *  le dernier join bot crée l'état initial (paletteId par joueur inclus). */
  private async handleStart(ws: WebSocket, att: WsAttachment, rawCode: string): Promise<void> {
    const code = String(rawCode ?? '').toUpperCase();
    const game = await this.getGame(code);
    if (!game) return this.sendError(ws, 'notFound', 'partie inconnue');
    if (game.hostId !== att.playerId) return this.sendError(ws, 'unauthorized', 'seul l’hôte démarre la partie');
    if (game.status !== 'waiting') return this.sendError(ws, 'badPhase', 'partie déjà démarrée');
    const cfg = game.settings.config;
    if (!cfg) return this.sendError(ws, 'badMessage', 'partie ancienne forme : démarrage automatique au join');
    if (game.status === 'waiting' && game.players.length === 0) {
      return this.sendError(ws, 'badMessage', 'partie sans joueur');
    }
    // D6 : « 1 humain minimum » = tout siège HUMAIN doit être occupé au
    // démarrage (un siège humain vide ne sera JAMAIS rempli — les bots ne
    // prennent que les sièges bots). L'hôte passe le siège en bot ou attend.
    const prises = new Set(game.players.map((p) => p.siege));
    const humainVide = cfg.sieges.findIndex((s, i) => s.type === 'humain' && !prises.has(i));
    if (humainVide >= 0) {
      return this.sendError(ws, 'badMessage', `siège ${humainVide + 1} (humain) est vide — passer le siège en bot ou attendre un joueur avant de lancer`);
    }

    const seed = game.seed ?? 0;
    const civIds = Object.keys(CIVILIZATIONS.civs).sort(); // R-81
    // Règle Erik 25/09 : un humain peut joindre avec la palette configurée
    // d'un bot — les bots dépossédés (et tout doublon) sont réaffectés à la
    // première palette libre AVANT leurs joins (les humains gardent leur
    // choix). La config résolue est persistée avec la partie.
    for (const p of game.players) {
      if (p.bot === true || typeof p.siege !== 'number') continue;
      const siege = cfg.sieges[p.siege]!;
      if (siege.type === 'humain') siege.paletteId = p.paletteId ?? siege.paletteId;
    }
    cfg.sieges = resoutConflitsPalettes(cfg).sieges;
    // Défaut de confort (D3) : un siège bot laissé SANS civ par l'hôte reçoit
    // une civ tirée seedée (distincte des civs déjà attribuées quand le pool
    // le permet) — même seed → même tirage.
    const civsPrises = new Set(
      cfg.sieges.map((s) => (!cfg.civsAleatoires ? s.civId : null)).filter((c): c is string => !!c),
    );
    if (!cfg.civsAleatoires) {
      const rng = createRng((seed ^ 0x0b07b07) >>> 0);
      for (const siege of cfg.sieges) {
        if (siege.type !== 'bot' || siege.civId) continue;
        let picked = civIds[rng.nextInt(civIds.length)]!;
        if (civsPrises.size < civIds.length) {
          while (civsPrises.has(picked)) picked = civIds[rng.nextInt(civIds.length)]!;
        }
        civsPrises.add(picked);
        siege.civId = picked;
      }
    }
    if (cfg.civsAleatoires) {
      // Tirage seedé SANS remise (civs toutes distinctes — D3) ; même seed →
      // même tirage (rejouable). Le tirage ne consomme pas le seed moteur.
      const rng = createRng((seed ^ 0x0c1f5) >>> 0);
      const tirees = new Set<string>();
      for (const siege of cfg.sieges) {
        let picked = civIds[rng.nextInt(civIds.length)]!;
        if (tirees.size < civIds.length) {
          while (tirees.has(picked)) picked = civIds[rng.nextInt(civIds.length)]!;
        }
        tirees.add(picked);
        siege.civId = picked;
      }
    }

    // Civs finales + palettes des joueurs DÉJÀ joints (humains) → meta du
    // GameDO, AVANT les joins bots (le dernier crée civSetup/état initial).
    const configurer = await this.gameStub(code).fetch('https://game.internal/internal/configurerJoueurs', {
      method: 'POST',
      body: JSON.stringify({
        joueurs: game.players.map((p) => ({
          id: p.id,
          civId: cfg.civsAleatoires ? cfg.sieges[p.siege!]!.civId : p.civId,
          paletteId: p.paletteId,
        })),
        // D6 : la config (potentiellement éditée au lobby) aligne la copie
        // du GameDO — la topographie du créateur pilote la génération (D4).
        config: cfg,
      }),
    });
    if (!configurer.ok) return this.sendError(ws, 'internal', `préparation du démarrage impossible (${configurer.status})`);

    // Remplissage des sièges bots (ids réservés — l'auth ne les délivre
    // jamais) via le chemin NORMAL : même code que l'invitation d'un humain.
    let rangBot = 0;
    for (let i = 0; i < cfg.sieges.length; i++) {
      const siege = cfg.sieges[i]!;
      if (siege.type !== 'bot' || game.players.some((p) => p.siege === i)) continue;
      rangBot++;
      const botId = rangBot === 1 ? BOT_PLAYER_ID : `bot:${i + 1}`;
      const botName = rangBot === 1 ? BOT_NAME : `${BOT_NAME} ${rangBot}`;
      const civId = siege.civId ?? undefined;
      const join = await this.gameStub(code).fetch('https://game.internal/internal/join', {
        method: 'POST',
        body: JSON.stringify({
          player: { id: botId, name: botName, bot: true, ...(civId ? { civId } : {}), paletteId: siege.paletteId, siege: i },
        }),
      });
      if (!join.ok) return this.sendError(ws, 'internal', `démarrage du bot impossible (${join.status})`);
      game.players.push({ id: botId, name: botName, bot: true, ...(civId ? { civId } : {}), paletteId: siege.paletteId, siege: i });
    }

    game.status = 'active';
    await this.putGame(game);
    await this.broadcastList();
  }

  private async handleJoin(ws: WebSocket, att: WsAttachment, rawCode: string, civId?: string, paletteId?: string): Promise<void> {
    const code = String(rawCode ?? '').toUpperCase();
    if (!isValidCode(code)) return this.sendError(ws, 'notFound', 'code invalide');
    const game = await this.getGame(code);
    if (!game) return this.sendError(ws, 'notFound', 'partie inconnue');
    if (game.status === 'finished') return this.sendError(ws, 'gameFinished', 'partie terminée');
    if (game.players.some((p) => p.id === att.playerId)) {
      // Déjà inscrit : ré-joindre est sans effet (multi-onglet).
      this.sendTo(ws, { proto: PROTO_VERSION, type: 'GameJoined', code });
      return;
    }
    // LOBBY-5 : partie nouvelle forme → flux structuré dédié.
    if (game.settings.config) return this.handleJoinConfig(ws, att, game, code, civId, paletteId);
    const sieges = Math.max(2, Math.min(5, Math.round(game.settings.playerCount ?? 2)));
    if (game.status !== 'waiting' || game.players.length >= sieges) {
      return this.sendError(ws, 'gameFull', 'partie complète');
    }

    if (civId !== undefined && !CIVILIZATIONS.civs[civId]) {
      return this.sendError(ws, 'badMessage', 'civilisation inconnue');
    }
    const join = await this.gameStub(code).fetch('https://game.internal/internal/join', {
      method: 'POST',
      body: JSON.stringify({ player: { id: att.playerId, name: att.name, civId } }),
    });
    if (!join.ok) {
      return this.sendError(ws, join.status === 409 ? 'gameFull' : 'internal', 'impossible de rejoindre la partie');
    }
    game.players.push({
      id: att.playerId,
      name: att.name,
      ...(civId ? { civId } : {}),
    });
    // CARTE-MULTI : la partie démarre au DERNIER siège rempli.
    if (game.players.length >= sieges) game.status = 'active';
    await this.putGame(game);
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'GameJoined', code });
    await this.broadcastList();
  }

  private async handleAbandon(ws: WebSocket, att: WsAttachment, rawCode: string): Promise<void> {
    const code = String(rawCode ?? '').toUpperCase();
    const game = await this.getGame(code);
    if (!game) return this.sendError(ws, 'notFound', 'partie inconnue');
    if (!game.players.some((p) => p.id === att.playerId)) return this.sendError(ws, 'unauthorized', 'vous ne participez pas à cette partie');
    if (game.status === 'finished') return this.sendError(ws, 'gameFinished', 'partie déjà terminée');

    // LOBBY-5 · D6 : dans une salle d'attente structurée, un INVITÉ qui
    // abandonne libère seulement SON siège (la partie reste). L'hôte, lui,
    // supprime la partie (comportement ci-dessous).
    if (game.settings.config && game.status === 'waiting' && att.playerId !== game.hostId) {
      game.players = game.players.filter((p) => p.id !== att.playerId);
      await this.gameStub(code).fetch('https://game.internal/internal/leave', {
        method: 'POST',
        body: JSON.stringify({ byPlayerId: att.playerId }),
      });
      await this.putGame(game);
      // Nettoyage de l'index (putGame n'ajoute que) : la partie quitte « mes parties ».
      const index = (await this.state.storage.get<Record<string, string[]>>('index')) ?? {};
      const autres = game.players.filter((p) => p.bot !== true).map((p) => p.id);
      for (const pid of Object.keys(index)) {
        if (!autres.includes(pid)) {
          index[pid] = (index[pid] ?? []).filter((c) => c !== code);
          if (index[pid]!.length === 0) delete index[pid];
        }
      }
      await this.state.storage.put('index', index);
      this.sendTo(ws, await this.gameListFor(att.playerId));
      await this.broadcastList();
      return;
    }

    if (game.status === 'active') {
      const res = await this.gameStub(code).fetch('https://game.internal/internal/abandon', {
        method: 'POST',
        body: JSON.stringify({ byPlayerId: att.playerId }),
      });
      // Robustesse LOBBY-5 : une divergence lobby/GameDO (démarrage d'une
      // session antérieure) ne doit pas bloquer l'abandon — le lobby fait foi.
      if (!res.ok && res.status !== 409) return this.sendError(ws, 'internal', 'abandon impossible');
      // CARTE-MULTI : l'abandon d'un joueur à 3+ ne clôt PAS la partie — le
      // GameDO indique si l'élimination était décisive (1v1 : toujours).
      const body = res.ok ? ((await res.json().catch(() => null)) as { finished?: boolean } | null) : { finished: true };
      if (body?.finished !== false) game.status = 'finished'; // le GameDO notifie aussi gameFinished (idempotent)
    } else {
      // Partie en attente : suppression simple.
      await this.state.storage.delete(this.gameKey(code));
    }
    this.sendTo(ws, await this.gameListFor(att.playerId));
    await this.broadcastList();
  }
}
