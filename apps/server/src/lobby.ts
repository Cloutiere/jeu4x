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
import { CIVILIZATIONS, createRng, isEgyptWonderChoiceValid } from '@game/rules';
import type { PlayerId } from '@game/rules';
import { PROTO_VERSION } from '@game/shared';
import type {
  ClientToServerMessage,
  ErrorCode,
  GameCreationSettings,
  GameStatus,
  GameSummary,
  ServerToClientMessage,
} from '@game/shared';
import type { Env } from './env.js';
import { jsonResponse, sessionOfRequest } from './env.js';
import { generateCode, generateSeed, isValidCode } from './codes.js';
import { BOT_NAME, BOT_PLAYER_ID } from './botPolicy.js';

interface LobbyGame {
  code: string;
  hostId: PlayerId;
  /** 7n · R-145 : chaque joueur choisit sa civilisation (create/join). */
  players: Array<{ id: PlayerId; name: string; civId?: string; wonderId?: string; bot?: boolean }>;
  status: GameStatus;
  isPublic: boolean;
  settings: GameCreationSettings;
  turn: number;
  createdAt: number;
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
        ...(p.wonderId ? { wonderId: p.wonderId } : {}),
        ...(p.bot === true ? { bot: true } : {}),
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
          await this.handleJoin(ws, att, msg.code, (msg as { civId?: string }).civId, (msg as { wonderId?: string }).wonderId);
          break;
        case 'ListGames':
          this.sendTo(ws, await this.gameListFor(att.playerId));
          break;
        case 'AbandonGame':
          await this.handleAbandon(ws, att, msg.code);
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
    if (!settings || typeof settings !== 'object' || !['pedagogique-40', 'pangee-40', 'variee-40', 'procedural-40'].includes(settings.mapId)) {
      return this.sendError(ws, 'badMessage', 'settings invalides');
    }
    if (settings.turnTimerMinutes !== null && !(typeof settings.turnTimerMinutes === 'number' && settings.turnTimerMinutes > 0)) {
      return this.sendError(ws, 'badMessage', 'timer invalide');
    }
    // 7n · R-145 : la civ de l'hôte est validée (connue des données) ; la
    // Merveille Antique (Égypte 🔶) l'est par la liste fermée des params.
    const hostCiv = (settings as { civId?: string }).civId;
    if (hostCiv !== undefined && !CIVILIZATIONS.civs[hostCiv]) {
      return this.sendError(ws, 'badMessage', 'civilisation inconnue');
    }
    const hostWonder = (settings as { wonderId?: string }).wonderId;
    if (!isEgyptWonderChoiceValid(hostCiv, hostWonder)) {
      return this.sendError(ws, 'badMessage', 'merveille de départ invalide');
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
    let botCivId: string | undefined;
    if (solo) {
      if (rawBotCiv && rawBotCiv !== 'random') {
        botCivId = rawBotCiv;
      } else {
        const ids = Object.keys(CIVILIZATIONS.civs).sort(); // R-81 : tirage déterministe
        botCivId = ids[createRng((seed ^ 0x000b07) >>> 0).nextInt(ids.length)]!;
      }
    }
    const init = await this.gameStub(code).fetch('https://game.internal/internal/init', {
      method: 'POST',
      body: JSON.stringify({
        code,
        host: { id: att.playerId, name: att.name, civId: (settings as { civId?: string }).civId, wonderId: (settings as { wonderId?: string }).wonderId },
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
        ...((settings as { wonderId?: string }).wonderId ? { wonderId: (settings as { wonderId?: string }).wonderId } : {}),
      }],
      status: 'waiting',
      isPublic: settings.isPublic === true,
      settings: {
        mapId: settings.mapId,
        turnTimerMinutes: settings.turnTimerMinutes,
        isPublic: settings.isPublic === true,
        ...(solo ? { solo: true } : {}),
        ...(solo && botCivId ? { botCivId } : {}),
      },
      turn: 0,
      createdAt: Date.now(),
    };
    if (solo) {
      // Le bot rejoint via le chemin normal (GameDO : état initial créé au
      // join — même code que l'invitation d'un humain). Pas de socket : le
      // GameDO génère ses ordres à chaque résolution.
      const join = await this.gameStub(code).fetch('https://game.internal/internal/join', {
        method: 'POST',
        body: JSON.stringify({ player: { id: BOT_PLAYER_ID, name: BOT_NAME, bot: true, civId: botCivId } }),
      });
      if (!join.ok) {
        return this.sendError(ws, 'internal', `démarrage du bot impossible (${join.status})`);
      }
      game.players.push({ id: BOT_PLAYER_ID, name: BOT_NAME, bot: true, ...(botCivId ? { civId: botCivId } : {}) });
      game.status = 'active';
    }
    await this.putGame(game);
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'GameCreated', code });
    await this.broadcastList();
  }

  private async handleJoin(ws: WebSocket, att: WsAttachment, rawCode: string, civId?: string, wonderId?: string): Promise<void> {
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
    if (game.status !== 'waiting' || game.players.length >= 2) {
      return this.sendError(ws, 'gameFull', 'partie complète');
    }

    if (civId !== undefined && !CIVILIZATIONS.civs[civId]) {
      return this.sendError(ws, 'badMessage', 'civilisation inconnue');
    }
    if (!isEgyptWonderChoiceValid(civId, wonderId)) {
      return this.sendError(ws, 'badMessage', 'merveille de départ invalide');
    }
    const join = await this.gameStub(code).fetch('https://game.internal/internal/join', {
      method: 'POST',
      body: JSON.stringify({ player: { id: att.playerId, name: att.name, civId, wonderId } }),
    });
    if (!join.ok) {
      return this.sendError(ws, join.status === 409 ? 'gameFull' : 'internal', 'impossible de rejoindre la partie');
    }
    game.players.push({
      id: att.playerId,
      name: att.name,
      ...(civId ? { civId } : {}),
      ...(wonderId ? { wonderId } : {}),
    });
    game.status = 'active';
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

    if (game.status === 'active') {
      const res = await this.gameStub(code).fetch('https://game.internal/internal/abandon', {
        method: 'POST',
        body: JSON.stringify({ byPlayerId: att.playerId }),
      });
      if (!res.ok) return this.sendError(ws, 'internal', 'abandon impossible');
      game.status = 'finished'; // le GameDO notifie aussi gameFinished (idempotent)
    } else {
      // Partie en attente : suppression simple.
      await this.state.storage.delete(this.gameKey(code));
    }
    this.sendTo(ws, await this.gameListFor(att.playerId));
    await this.broadcastList();
  }
}
