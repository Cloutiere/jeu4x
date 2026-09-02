/**
 * GameDO — un Durable Object par partie, adressé par `idFromName(code)` (L3).
 *
 * Le code de 6 caractères EST l'identité de la partie (lien d'invitation).
 *
 * Hibernation (DESIGN.md §3.3) : `state.acceptWebSocket` + attachments
 * `{ playerId, token }` ; le DO se décharge de la mémoire entre les messages.
 * Règle d'or (§3.3) : ne JAMAIS faire confiance à la mémoire au réveil — tout
 * passe par `ensureLoaded()`, lazy-load du stockage SQLite avec exécution de
 * la chaîne de migrations (`migrateState`), puis `ensureResolved()` qui rejoue
 * une résolution interrompue (§3.5, motif idempotent).
 *
 * Ids joueurs : les sessions réelles ("google:123") sont mappées sur les ids
 * moteur ("p1"/"p2", spawns de la carte) via `meta.players`, par ordre de join.
 */
import {
  checkForfeit,
  createInitialState,
  filterEventsForPlayer,
  getFilteredState,
  loadBuiltinMap,
  loadBuiltinMapSync,
  applyMapEntities,
  migrateState,
  resolveTurn,
  applySetResearch,
  applySetConversion,
} from '@game/rules';
import type { CityId, GameEvent, GameState, Order, PlayerId, UnitId } from '@game/rules';
import { PROTO_VERSION } from '@game/shared';
import type { ClientToServerMessage, ErrorCode, GameCreationSettings, ServerToClientMessage } from '@game/shared';
import type { Env } from './env.js';
import { jsonResponse, sessionOfRequest } from './env.js';

export type EnginePlayerId = 'p1' | 'p2';
const ENGINE_IDS: EnginePlayerId[] = ['p1', 'p2'];

export interface GamePlayer {
  /** Id de session réel (ex. "google:123", "dev:alice"). */
  id: PlayerId;
  name: string;
  /** Id joueur dans le GameState moteur (spawn de la carte). */
  engineId: EnginePlayerId;
}

export interface GameMeta {
  code: string;
  status: 'waiting' | 'active' | 'finished';
  isPublic: boolean;
  hostId: PlayerId;
  players: GamePlayer[];
  settings: GameCreationSettings;
  /** Graine RNG de la partie (générée à la création, appliquée au démarrage). */
  seed: number;
  createdAt: number;
  /** Échéance du timer courant, epoch ms — null si pas de timer. */
  deadline: number | null;
  /** Motif de fin (admin/debug) : domination | forfeit | abandoned. */
  finishedReason?: 'domination' | 'forfeit' | 'abandoned';
}

/** Motif de persistance idempotent (DESIGN.md §3.5) — présent SSI la partie est en résolution. */
export interface PendingResolution {
  turn: number;
  /** Ordres verrouillés (par id moteur). */
  orders: Record<EnginePlayerId, Order[]>;
  rngSeed: number;
}

interface WsAttachment {
  playerId: PlayerId;
}

/** Sujet d'un ordre : remplace l'ordre brouillon existant du même sujet. */
function sameSubject(a: Order, b: Order): boolean {
  if (a.type === 'SetProduction' || b.type === 'SetProduction' || a.type === 'SetWorkedTile' || b.type === 'SetWorkedTile') {
    // Ordres de ville : un seul brouillon par ville et par type de sujet.
    if (a.type === b.type) {
      return (
        (a.type === 'SetProduction' || a.type === 'SetWorkedTile') &&
        (b.type === 'SetProduction' || b.type === 'SetWorkedTile') &&
        a.cityId === b.cityId
      );
    }
    return false;
  }
  if (a.type === 'FormArmy' && b.type === 'FormArmy') {
    return [...a.members].sort().join(',') === [...b.members].sort().join(',');
  }
  const ua = 'unitId' in a ? a.unitId : null;
  const ub = 'unitId' in b ? b.unitId : null;
  return ua !== null && ub !== null && ua === ub;
}

function orderTouchesUnit(order: Order, unitId: UnitId): boolean {
  return ('unitId' in order && order.unitId === unitId) || (order.type === 'FormArmy' && order.members.includes(unitId));
}

function isHex(v: unknown): v is { q: number; r: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    Number.isInteger((v as { q?: unknown }).q) &&
    Number.isInteger((v as { r?: unknown }).r)
  );
}

/** Validation structurelle côté serveur (le moteur re-valide tout à la résolution). */
function orderShapeError(order: unknown): string | null {
  if (typeof order !== 'object' || order === null) return 'ordre absent';
  const o = order as Record<string, unknown>;
  switch (o.type) {
    case 'Move':
      if (!Array.isArray(o.path) || o.path.length === 0 || o.path.length > 400 || !o.path.every(isHex)) {
        return 'chemin invalide';
      }
      return null;
    case 'Attack':
      return isHex(o.target) ? null : 'cible invalide';
    case 'FoundCity':
    case 'Hold':
    case 'Fortify':
      return typeof o.unitId === 'string' ? null : 'unitId manquant';
    case 'FormArmy':
      return Array.isArray(o.members) && o.members.length === 3 && new Set(o.members).size === 3 && o.members.every((m) => typeof m === 'string') && isHex(o.rally)
        ? null
        : 'membres/rendez-vous invalides';
    case 'SetProduction': {
      if (typeof o.cityId !== 'string') return 'ville invalide';
      const item = o.item as Record<string, unknown> | undefined;
      if (!item || typeof item !== 'object') return 'item invalide';
      if (item.kind !== 'unit' && item.kind !== 'building') return 'kind d’item invalide';
      return typeof item.id === 'string' ? null : 'id d’item invalide';
    }
    case 'SetWorkedTile':
      // tile : clé "q,r" ou null (désassignation) — la validité métier (rayon,
      // case libre, travaillable) est re-vérifiée par le moteur à la résolution.
      return typeof o.cityId === 'string' && (o.tile === null || typeof o.tile === 'string')
        ? null
        : 'ville/case invalides';
    default:
      return 'type d\'ordre inconnu';
  }
}

export class GameDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private loaded = false;
  private meta: GameMeta | null = null;
  private game: GameState | null = null;
  private orders: Record<EnginePlayerId, Order[]> = { p1: [], p2: [] };
  private locked: Record<EnginePlayerId, boolean> = { p1: false, p2: false };
  private resolving: PendingResolution | null = null;
  private lastEvents: GameEvent[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // -----------------------------------------------------------------------
  // Chargement paresseux + reprise de résolution (§3.3 / §3.5)
  // -----------------------------------------------------------------------

  /** Retourne true si une résolution interrompue vient d'être rejouée au chargement. */
  private async ensureLoaded(): Promise<boolean> {
    if (this.loaded) return false;
    const meta = await this.state.storage.get<GameMeta>('meta');
    const rawGame = await this.state.storage.get<GameState>('game');
    this.meta = meta ?? null;
    // La chaîne de migrations tourne à CHAQUE chargement (§3.8).
    this.game = rawGame ? migrateState<GameState>(rawGame as unknown as Record<string, unknown>) : null;
    // Phase 7d (R-96/R-98) : les états migrés v7 n'ont ni villages ni huttes —
    // la migration moteur est additive (tableaux vides) ; l'enrichissement
    // depuis la carte est fait ICI, le serveur étant seul à connaître
    // `meta.settings.mapId`. Idempotent : après la première application,
    // `mapId` est persisté avec le prochain état.
    if (this.game && meta && !this.game.mapId) {
      try {
        this.game = applyMapEntities(this.game, loadBuiltinMapSync(meta.settings.mapId));
        await this.state.storage.put({ game: this.game });
      } catch {
        // Carte inconnue des données courantes : partie sans villages (dégradé).
      }
    }
    this.orders = (await this.state.storage.get<Record<EnginePlayerId, Order[]>>('orders')) ?? { p1: [], p2: [] };
    this.locked = (await this.state.storage.get<Record<EnginePlayerId, boolean>>('locked')) ?? { p1: false, p2: false };
    this.resolving = (await this.state.storage.get<PendingResolution>('resolving')) ?? null;
    this.lastEvents = (await this.state.storage.get<GameEvent[]>('lastEvents')) ?? [];
    this.loaded = true;
    return this.ensureResolved();
  }

  /** §3.5 : une résolution interrompue est rejouée à l'identique. Retourne true si une résolution vient de se terminer. */
  private async ensureResolved(): Promise<boolean> {
    if (!this.resolving) return false;
    if (this.game && this.game.phase === 'resolving') {
      await this.finishResolution(); // même entrée → même sortie (moteur pur, R-80)
      return true;
    }
    // Le nouvel état a été persisté mais le motif pas encore supprimé : purger.
    this.resolving = null;
    await this.state.storage.delete('resolving');
    return false;
  }

  private engineIdOf(playerId: PlayerId): EnginePlayerId {
    const player = this.meta?.players.find((p) => p.id === playerId);
    if (!player) throw new Error('joueur absent de la partie');
    return player.engineId;
  }

  // -----------------------------------------------------------------------
  // Routes internes (Worker / LobbyDO) + upgrade WebSocket
  // -----------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/internal/init':
        return this.handleInit(request);
      case '/internal/join':
        return this.handleJoin(request);
      case '/internal/abandon':
        return this.handleAbandon(request);
      case '/internal/admin':
        return this.handleAdminDump();
      default:
        break;
    }
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return jsonResponse({ error: 'notFound' }, 404);
    }
    return this.handleWebSocketUpgrade(request);
  }

  private async readJson<T>(request: Request): Promise<T | null> {
    try {
      return (await request.json()) as T;
    } catch {
      return null;
    }
  }

  /** Création (hôte) — appelé par le LobbyDO après génération du code. Idempotent. */
  private async handleInit(request: Request): Promise<Response> {
    const body = await this.readJson<{
      code: string;
      host: { id: PlayerId; name: string };
      settings: GameCreationSettings;
      isPublic: boolean;
      seed: number;
    }>(request);
    if (!body?.code || !body.host || !body.settings || typeof body.seed !== 'number') {
      return jsonResponse({ error: 'badRequest' }, 400);
    }
    if (this.meta) {
      if (this.meta.hostId === body.host.id) return jsonResponse({ ok: true });
      return jsonResponse({ error: 'alreadyExists' }, 409);
    }
    this.meta = {
      code: body.code,
      status: 'waiting',
      isPublic: body.isPublic,
      hostId: body.host.id,
      players: [{ id: body.host.id, name: body.host.name, engineId: 'p1' }],
      settings: body.settings,
      seed: body.seed >>> 0,
      createdAt: Date.now(),
      deadline: null,
    };
    await this.state.storage.put({ meta: this.meta });
    return jsonResponse({ ok: true });
  }

  /** Join du joueur B — le LobbyDO a déjà validé (existe, place libre, non terminée). */
  private async handleJoin(request: Request): Promise<Response> {
    const body = await this.readJson<{ player: { id: PlayerId; name: string } }>(request);
    if (!body?.player) return jsonResponse({ error: 'badRequest' }, 400);
    if (!this.meta) return jsonResponse({ error: 'notFound' }, 404);
    if (this.meta.status !== 'waiting') return jsonResponse({ error: 'gameFull' }, 409);
    if (this.meta.players.some((p) => p.id === body.player.id)) return jsonResponse({ ok: true });
    if (this.meta.players.length >= 2) return jsonResponse({ error: 'gameFull' }, 409);

    this.meta.players.push({ id: body.player.id, name: body.player.name, engineId: 'p2' });
    this.meta.status = 'active';

    // État moteur initial : carte préfabriquée + graine de la partie.
    const map = await loadBuiltinMap(this.meta.settings.mapId);
    this.game = createInitialState(map, this.meta.seed);
    this.orders = { p1: [], p2: [] };
    this.locked = { p1: false, p2: false };
    this.resolving = null;
    this.lastEvents = [];

    await this.state.storage.put({ meta: this.meta, game: this.game, orders: this.orders, locked: this.locked });
    await this.scheduleTimer();
    this.broadcast((playerId) => this.snapshotFor(playerId, null));
    return jsonResponse({ ok: true });
  }

  /** Abandon : l'adversaire gagne (traité comme un forfait, RULES.md §1). */
  private async handleAbandon(request: Request): Promise<Response> {
    const body = await this.readJson<{ byPlayerId: PlayerId }>(request);
    if (!this.meta) return jsonResponse({ error: 'notFound' }, 404);
    if (!body?.byPlayerId) return jsonResponse({ error: 'badRequest' }, 400);
    if (this.meta.status !== 'active' || !this.game) return jsonResponse({ error: 'notActive' }, 409);
    const quitter = this.meta.players.find((p) => p.id === body.byPlayerId);
    if (!quitter) return jsonResponse({ error: 'notInGame' }, 403);
    const winner: EnginePlayerId = quitter.engineId === 'p1' ? 'p2' : 'p1';
    const seq = this.game.lastEventSeq + 1;
    const events: GameEvent[] = [{ seq, type: 'Victory', winner, reason: 'forfeit' }];
    this.game.lastEventSeq = seq;
    await this.finishGame('abandoned', winner, events);
    return jsonResponse({ ok: true });
  }

  /** Dump d'état NON filtré (admin debug — protégé par ADMIN_TOKEN côté Worker).
   *  Phase 7d : inclut un résumé `barbares` (villages, huttes, compteurs). */
  private handleAdminDump(): Response {
    const game = this.game;
    const barbares = game
      ? {
          villages: game.villages.map((v) => ({
            id: v.id,
            q: v.q,
            r: v.r,
            hp: v.hp,
            spawnCountdown: v.spawnCountdown,
            unitésVivantes: v.spawnedUnits.filter((id) => game.units[id]).length,
          })),
          huts: game.huts.map((h) => ({ id: h.id, q: h.q, r: h.r })),
        }
      : null;
    return jsonResponse({
      meta: this.meta,
      state: this.game,
      orders: this.orders,
      locked: this.locked,
      resolving: this.resolving,
      lastEvents: this.lastEvents,
      barbares,
    });
  }

  // -----------------------------------------------------------------------
  // WebSocket — auth au connect, hibernation, messages
  // -----------------------------------------------------------------------

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const claims = await sessionOfRequest(request, this.env);
    if (!claims) return jsonResponse({ error: 'unauthorized' }, 401);
    if (!this.meta || !this.meta.players.some((p) => p.id === claims.sub)) {
      return jsonResponse({ error: 'notInGame' }, 403);
    }

    const pair = new WebSocketPair();
    const server = pair[1]!;
    server.serializeAttachment({ playerId: claims.sub } satisfies WsAttachment);
    this.state.acceptWebSocket(server);

    this.sendWelcome(server);
    // Au connect, le seq réel du client est inconnu (reconnexion ?) : les
    // événements de la dernière résolution sont inclus ; le client dédoublonne.
    const snapshot = this.snapshotFor(claims.sub, null);
    if (snapshot) this.sendTo(server, snapshot);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private sendTo(ws: WebSocket, message: ServerToClientMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // socket fermée entre-temps : sans conséquence
    }
  }

  private sendError(ws: WebSocket, code: ErrorCode, message: string): void {
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'Error', code, message });
  }

  /** Refus métier d'un ordre/verrouillage : OrderAck négatif (jamais fatal, §3.5). */
  private sendOrderRejection(ws: WebSocket, reason: string): void {
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'OrderAck', accepted: false, order: null, reason });
  }

  private sendWelcome(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as WsAttachment | null;
    if (!this.meta || !att) return;
    const engineId = this.engineIdOf(att.playerId);
    this.sendTo(ws, {
      proto: PROTO_VERSION,
      type: 'Welcome',
      playerId: att.playerId,
      gameCode: this.meta.code,
      turn: this.game?.turn ?? 0,
      phase: this.game?.phase ?? 'orders',
      seq: this.game?.lastEventSeq ?? 0,
      players: this.meta.players,
      status: this.meta.status,
      locked: this.locked[engineId] === true,
    });
  }

  /** Snapshot filtré (§3.4-1) : état + brouillons du joueur + événements de résolution manqués.
   * `clientLastSeq` null = inconnu (première connexion) → les événements de la
   * dernière résolution sont inclus ; le client dédoublonne par seq. */
  private snapshotFor(playerId: PlayerId, clientLastSeq: number | null): ServerToClientMessage | null {
    if (!this.game) return null; // partie en attente du joueur B
    const engineId = this.engineIdOf(playerId);
    const missed =
      this.lastEvents.length > 0 && (clientLastSeq === null || this.lastEvents[0]!.seq > clientLastSeq)
        ? filterEventsForPlayer(this.game, engineId, this.lastEvents)
        : [];
    return {
      proto: PROTO_VERSION,
      type: 'Snapshot',
      seq: this.game.lastEventSeq,
      state: getFilteredState(this.game, engineId),
      orders: this.orders[engineId] ?? [],
      missedEvents: missed,
      locked: this.locked[engineId] === true,
    };
  }

  private broadcast(build: (playerId: PlayerId) => ServerToClientMessage | null): void {
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (!att) continue;
      const message = build(att.playerId);
      if (message) this.sendTo(ws, message);
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ensureLoaded();
    if (typeof message !== 'string') {
      this.sendError(ws, 'badMessage', 'messages binaires non supportés');
      return;
    }
    let msg: ClientToServerMessage;
    try {
      msg = JSON.parse(message) as ClientToServerMessage;
    } catch {
      this.sendError(ws, 'badMessage', 'JSON invalide');
      return;
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
        case 'SubmitOrder':
        case 'ReplaceOrder':
          await this.handleOrder(ws, att.playerId, msg.order);
          break;
        case 'CancelOrder':
          await this.handleCancel(ws, att.playerId, msg.unitId, msg.cityId);
          break;
        case 'EndTurn':
          await this.handleEndTurn(ws, att.playerId);
          break;
        case 'SetResearch':
          await this.handleSetResearch(ws, att.playerId, (msg as { techId: string }).techId);
          break;
        case 'SetConversion':
          await this.handleSetConversion(
            ws,
            att.playerId,
            (msg as { cityId: string }).cityId,
            (msg as { target: 'gold' | 'science' }).target,
          );
          break;
        case 'ResyncRequest':
          this.sendWelcome(ws);
          {
            const snap = this.snapshotFor(att.playerId, msg.lastSeq);
            if (snap) this.sendTo(ws, snap);
          }
          break;
        case 'CreateGame':
        case 'JoinGame':
        case 'ListGames':
        case 'AbandonGame':
          this.sendError(ws, 'badMessage', 'message de lobby : connecter /ws/lobby');
          break;
        default:
          this.sendError(ws, 'badMessage', 'type de message inconnu');
      }
    } catch (err) {
      // Une action invalide est rejetée pour un joueur, jamais fatale (§3.5).
      this.sendError(ws, 'internal', err instanceof Error ? err.message : 'erreur interne');
    }
  }

  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    // Hibernation : rien à faire — les brouillons et la partie persistent (§3.3).
  }

  // -----------------------------------------------------------------------
  // Ordres (autoritaires côté serveur, persistés à chaque modification)
  // -----------------------------------------------------------------------

  private async handleOrder(ws: WebSocket, playerId: PlayerId, order: Order): Promise<void> {
    const shapeError = orderShapeError(order);
    if (shapeError) return this.sendOrderRejection(ws, shapeError);
    if (!this.game || !this.meta || this.meta.status !== 'active' || this.game.phase !== 'orders') {
      return this.sendOrderRejection(ws, 'ordres non modifiables (résolution ou partie terminée)');
    }
    const engineId = this.engineIdOf(playerId);
    if (this.locked[engineId]) {
      return this.sendOrderRejection(ws, 'ordres verrouillés (Fin de tour déjà validé)');
    }
    const ownerError = this.orderOwnerError(engineId, order);
    if (ownerError) return this.sendOrderRejection(ws, ownerError);

    this.orders[engineId] = [...this.orders[engineId].filter((o) => !sameSubject(o, order)), order];
    await this.state.storage.put({ orders: this.orders });
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'OrderAck', accepted: true, order, reason: null });
  }

  /**
   * R-85 · SetResearch — action IMMÉDIATE (pas un ordre de tour) : appliquée
   * à la réception (moteur pur applySetResearch), persistée, puis diffusée
   * immédiatement aux deux clients (Snapshot — visible en temps réel, sans
   * attendre la résolution). Autorisée en phase « orders », même verrouillé
   * (le verrouillage porte sur les ordres, pas sur cette action) ; refusée
   * pendant la résolution.
   */
  private async handleSetResearch(ws: WebSocket, playerId: PlayerId, techId: string): Promise<void> {
    if (typeof techId !== 'string' || techId.length === 0) {
      return this.sendOrderRejection(ws, 'techId requis');
    }
    if (!this.game || !this.meta || this.meta.status !== 'active') {
      return this.sendOrderRejection(ws, 'recherche impossible (partie non active)');
    }
    if (this.game.phase !== 'orders') {
      return this.sendOrderRejection(ws, 'recherche non modifiable (résolution en cours)');
    }
    const engineId = this.engineIdOf(playerId);
    const result = applySetResearch(this.game, engineId, techId);
    if (!result.ok) return this.sendOrderRejection(ws, result.reason);
    this.game = result.state;
    if (result.events.length > 0) {
      // Complétion immédiate (réserve versée) : prolonger le journal diffusé.
      this.lastEvents = [...this.lastEvents, ...result.events];
    }
    await this.state.storage.put({ game: this.game, lastEvents: this.lastEvents });
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'OrderAck', accepted: true, order: null, reason: 'recherche mise à jour' });
    this.broadcast((pid) => this.snapshotFor(pid, null));
  }

  /**
   * R-90 · SetConversion (Phase 7b) — action IMMÉDIATE (pas un ordre de tour),
   * même contrat que SetResearch : appliquée à la réception (moteur pur
   * applySetConversion), persistée, puis diffusée immédiatement aux deux
   * clients. Autorisée en phase « orders », même verrouillé ; refusée pendant
   * la résolution.
   */
  private async handleSetConversion(
    ws: WebSocket,
    playerId: PlayerId,
    cityId: string,
    target: 'gold' | 'science',
  ): Promise<void> {
    if (typeof cityId !== 'string' || cityId.length === 0) {
      return this.sendOrderRejection(ws, 'cityId requis');
    }
    if (target !== 'gold' && target !== 'science') {
      return this.sendOrderRejection(ws, 'target requis (gold|science)');
    }
    if (!this.game || !this.meta || this.meta.status !== 'active') {
      return this.sendOrderRejection(ws, 'conversion impossible (partie non active)');
    }
    if (this.game.phase !== 'orders') {
      return this.sendOrderRejection(ws, 'conversion non modifiable (résolution en cours)');
    }
    const engineId = this.engineIdOf(playerId);
    const result = applySetConversion(this.game, engineId, cityId, target);
    if (!result.ok) return this.sendOrderRejection(ws, result.reason);
    this.game = result.state;
    await this.state.storage.put({ game: this.game });
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'OrderAck', accepted: true, order: null, reason: 'conversion mise à jour' });
    this.broadcast((pid) => this.snapshotFor(pid, null));
  }

  private orderOwnerError(engineId: EnginePlayerId, order: Order): string | null {
    const units = this.game?.units ?? {};
    const cities = this.game?.cities ?? {};
    const ownsUnit = (id: UnitId) => units[id]?.owner === engineId;
    switch (order.type) {
      case 'Move':
      case 'Attack':
      case 'FoundCity':
      case 'Hold':
      case 'Fortify':
        return ownsUnit(order.unitId) ? null : `unité ${order.unitId} inconnue ou non possédée`;
      case 'FormArmy':
        return order.members.every(ownsUnit) ? null : 'une des unités est inconnue ou non possédée';
      case 'SetProduction':
      case 'SetWorkedTile':
        return cities[order.cityId]?.owner === engineId ? null : `ville ${order.cityId} inconnue ou non possédée`;
      default:
        return 'ordre inconnu';
    }
  }

  private async handleCancel(ws: WebSocket, playerId: PlayerId, unitId?: UnitId, cityId?: CityId): Promise<void> {
    if (!this.game || !this.meta || this.meta.status !== 'active' || this.game.phase !== 'orders') {
      return this.sendOrderRejection(ws, 'ordres non modifiables');
    }
    const engineId = this.engineIdOf(playerId);
    if (this.locked[engineId]) return this.sendOrderRejection(ws, 'ordres verrouillés');
    if (!unitId && !cityId) return this.sendOrderRejection(ws, 'unitId ou cityId requis');
    const before = this.orders[engineId] ?? [];
    this.orders[engineId] =
      cityId !== undefined
        ? before.filter(
            (o) =>
              !((o.type === 'SetProduction' || o.type === 'SetWorkedTile') && o.cityId === cityId),
          )
        : before.filter((o) => !orderTouchesUnit(o, unitId!));
    const removed = this.orders[engineId].length !== before.length;
    if (removed) await this.state.storage.put({ orders: this.orders });
    this.sendTo(ws, {
      proto: PROTO_VERSION,
      type: 'OrderAck',
      accepted: removed,
      order: null,
      reason: removed ? null : 'aucun ordre à annuler',
    });
  }

  /** « Fin de tour » : verrouillage irrévocable (RULES.md §4) ; résolution si les deux ont verrouillé. */
  private async handleEndTurn(ws: WebSocket, playerId: PlayerId): Promise<void> {
    if (!this.game || !this.meta || this.meta.status !== 'active' || this.game.phase !== 'orders') {
      return this.sendOrderRejection(ws, 'verrouillage impossible (résolution ou partie terminée)');
    }
    const engineId = this.engineIdOf(playerId);
    if (this.locked[engineId]) return this.sendOrderRejection(ws, 'ordres déjà verrouillés');
    this.locked[engineId] = true;
    this.game.players[engineId]!.missedTurns = 0; // verrouillage dans les temps : compteur T-06 remis à zéro
    await this.state.storage.put({ locked: this.locked, game: this.game });
    this.sendTo(ws, { proto: PROTO_VERSION, type: 'OrderAck', accepted: true, order: null, reason: 'verrouillé' });
    if (this.locked.p1 && this.locked.p2) await this.startResolution();
  }

  // -----------------------------------------------------------------------
  // Résolution idempotente (DESIGN.md §3.5) + diffusion
  // -----------------------------------------------------------------------

  private async startResolution(): Promise<void> {
    if (!this.game) return;
    // 1. Persister le motif AVANT de résoudre : un crash ici est repris par
    //    ensureResolved()/l'alarme, qui rejoueront à l'identique.
    const orders: Record<EnginePlayerId, Order[]> = { p1: [...(this.orders.p1 ?? [])], p2: [...(this.orders.p2 ?? [])] };
    this.resolving = { turn: this.game.turn, orders, rngSeed: this.game.rngSeed };
    this.game.phase = 'resolving';
    await this.state.storage.put({ game: this.game, resolving: this.resolving });
    // 2-3. Résoudre puis persister le résultat.
    await this.finishResolution();
  }

  private async finishResolution(): Promise<void> {
    const input = this.resolving;
    if (!input || !this.game) return;
    const result = resolveTurn(this.game, input.orders, input.rngSeed);
    this.game = result.newState;
    this.lastEvents = result.events;
    this.resolving = null;
    this.locked = { p1: false, p2: false };
    this.orders = { p1: [], p2: [] }; // brouillons consommés par la résolution
    // Persistance atomique : état + journal + remises à zéro, motif supprimé.
    await this.state.storage.transaction(async (tx) => {
      await tx.put({ game: this.game, lastEvents: this.lastEvents, orders: this.orders, locked: this.locked });
      await tx.delete('resolving');
    });
    if (this.game.winner) {
      await this.finishGame('domination', this.game.winner as EnginePlayerId, result.events);
      return;
    }
    await this.scheduleTimer();
    this.broadcastTurnResult(result.events);
  }

  /** Diffuse les événements filtrés par joueur + l'état post-résolution (§3.4-2/4). */
  private broadcastTurnResult(events: GameEvent[]): void {
    if (!this.game) return;
    this.broadcast((playerId) => {
      const engineId = this.engineIdOf(playerId);
      return {
        proto: PROTO_VERSION,
        type: 'TurnResult',
        seq: this.game!.lastEventSeq,
        turn: this.game!.turn,
        events: filterEventsForPlayer(this.game!, engineId, events),
        state: getFilteredState(this.game!, engineId),
      };
    });
  }

  private async finishGame(
    reason: 'domination' | 'forfeit' | 'abandoned',
    winner: EnginePlayerId | null,
    events: GameEvent[],
    forState?: GameState,
  ): Promise<void> {
    const game = forState ?? this.game;
    if (!game || !this.meta) return;
    this.game = game;
    if (winner) game.winner = winner;
    this.meta.status = 'finished';
    this.meta.finishedReason = reason;
    this.meta.deadline = null;
    this.lastEvents = events; // journal de la fin de partie (TurnResult des clients)
    await this.state.storage.put({ meta: this.meta, game, lastEvents: events });
    await this.state.storage.deleteAlarm();
    this.broadcastTurnResult(events);
    void this.notifyLobbyFinished();
  }

  /** Fire-and-forget : le LobbyDO met à jour son index (statut finished). */
  private async notifyLobbyFinished(): Promise<void> {
    try {
      const stub = this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'));
      await stub.fetch('https://lobby.internal/gameFinished', {
        method: 'POST',
        body: JSON.stringify({ code: this.meta?.code }),
      });
    } catch {
      // best effort — la liste se corrigera au prochain ListGames
    }
  }

  // -----------------------------------------------------------------------
  // Timer & alarme (échéance → auto-verrouillage + résolution ; forfait T-06)
  // -----------------------------------------------------------------------

  private async scheduleTimer(): Promise<void> {
    if (!this.meta || this.meta.status !== 'active') return;
    const minutes = this.meta.settings.turnTimerMinutes;
    if (minutes === null || minutes <= 0) {
      this.meta.deadline = null;
      await this.state.storage.deleteAlarm();
      return;
    }
    const deadline = Date.now() + minutes * 60_000;
    this.meta.deadline = deadline;
    await this.state.storage.put({ meta: this.meta });
    await this.state.storage.setAlarm(deadline);
  }

  async alarm(): Promise<void> {
    const replayed = await this.ensureLoaded();
    if (!this.meta || this.meta.status !== 'active' || !this.game) return;
    // Une résolution interrompue vient d'être terminée (reprise à froid ou à
    // chaud) : ne pas enchaîner sur l'échéance du timer (elle a déjà replanifié).
    if (replayed || (await this.ensureResolved())) return;

    // Échéance du timer : auto-verrouillage des ordres courants (§4.6).
    for (const engineId of ENGINE_IDS) {
      if (this.locked[engineId]) {
        this.game.players[engineId]!.missedTurns = 0; // verrouillé dans les temps
      } else {
        this.locked[engineId] = true;
        this.game.players[engineId]!.missedTurns += 1; // timer manqué (T-06)
      }
    }
    // Forfait : au-delà de T-06 verrouillages manqués consécutifs (RULES.md §1).
    const forfeit = checkForfeit(this.game);
    if (forfeit.events.length > 0) {
      await this.finishGame('forfeit', (forfeit.state.winner ?? null) as EnginePlayerId | null, forfeit.events, forfeit.state);
      return;
    }
    await this.state.storage.put({ locked: this.locked, game: this.game });
    // Tout le monde est verrouillé (manuellement ou par auto-verrouillage) → résolution.
    await this.startResolution();
  }
}
