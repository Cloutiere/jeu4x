# @game/server — Worker + Durable Objects (Phase 1)

Socle réseau du jeu 4X : Worker Cloudflare, `GameDO` (un par partie, WS
hibernation), `LobbyDO` (singleton), OAuth Google/Discord + stub local.
Contrats du protocole : `packages/shared` — moteur : `packages/rules`.

## Commandes

```bash
pnpm dev        # wrangler dev (http://127.0.0.1:8787) — utilise .dev.vars
pnpm test       # vitest-pool-workers : lobby, GameDO, crash-recovery idempotent
pnpm typecheck  # tsc --noEmit
pnpm deploy     # wrangler deploy (production — voir plus bas)
```

## Routes

| Route | Rôle |
|---|---|
| `GET /api/health` | healthcheck |
| `GET /auth/dev?name=Alice` | faux login (mode stub — local/tests) |
| `GET /auth/google` / `GET /auth/discord` | OAuth code flow (state anti-CSRF en cookie) |
| `GET /auth/:provider/callback` | callback OAuth → cookie session JWT |
| `GET /auth/logout` | purge du cookie |
| `GET /api/me` | session courante (`{ player: {id, name} | null }`) |
| `GET /ws/lobby` | WebSocket lobby (créer/rejoindre/lister/abandonner) |
| `GET /ws/game/<code>` | WebSocket de partie (ordres, fin de tour, snapshots) |
| `GET /admin/game/<code>` | dump d'état NON filtré — `Authorization: Bearer $ADMIN_TOKEN` |

Auth WebSocket : le cookie `session` part automatiquement sur `ws` même
origine ; un client non-navigateur peut passer le JWT en `?token=`.

## Vérification manuelle à deux onglets (livrable Phase 1)

1. **Backend** : `cp .dev.vars.example .dev.vars` puis `pnpm dev` (Worker sur :8787).
2. **Frontend** : à la racine, `pnpm dev:web` (Vite sur :5173, proxy `/api`,
   `/auth`, `/ws` vers :8787).
3. Onglet 1 → `http://localhost:5173` → login stub « Alice » → lobby →
   créer une partie (pangée, timer 0, publique) → la page de partie s'ouvre
   (« En attente du joueur 2 »).
4. Onglet 2 → login stub « Bob » → rejoindre la partie (code dans le lobby ou
   lien `#/join/<code>`) → les deux onglets voient le même état (tour 0).
5. Onglet 1 : soumettre un ordre (ex. `Move` d'un pas sur le guerrier) puis
   « Fin de tour » ; onglet 2 : « Fin de tour » → **les deux onglets reçoivent
   la résolution en temps réel** (`TurnResult` : événements + état tour 1).
6. **Reconnexion** : fermer l'onglet 2, faire résoudre un tour côté 1 (avec un
   timer, l'alarme auto-verrouille ; sinon les deux verrouillent), rouvrir
   l'onglet 2 → snapshot restauré + événements manqués dans le journal.
7. Debug : `curl -H "Authorization: Bearer $ADMIN_TOKEN" \
   http://127.0.0.1:8787/admin/game/<code>` (état non filtré).

## Persistance & crash-recovery (DESIGN.md §3.5)

- Le GameDO ne fait jamais confiance à sa mémoire au réveil : lazy-load SQLite
  + chaîne de migrations (`migrateState`).
- Résolution idempotente : le motif `{phase:"resolving", turn, orders, rngSeed}`
  est persisté AVANT `resolveTurn` ; une résolution interrompue est rejouée à
  l'identique par l'alarme (testé bit à bit dans `tests/idempotence.test.ts`).
- Brouillons d'ordres persistés à chaque modification ; alarme à chaque
  échéance de timer (auto-verrouillage + `checkForfeit` T-06).

## Déploiement (documenté — NON exécuté sans compte)

Prérequis : compte Cloudflare avec Workers Paid (Durable Objects), `wrangler
login`.

```bash
# Secrets de production (jamais dans le dépôt)
wrangler secret put AUTH_SECRET      # openssl rand -hex 32
wrangler secret put ADMIN_TOKEN      # openssl rand -hex 32
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put DISCORD_CLIENT_ID
wrangler secret put DISCORD_CLIENT_SECRET

# Migrations DO (new_sqlite_classes) puis déploiement
wrangler deploy --env prod
```

- **OAuth Google** (console.cloud.google.com → Identifiants → OAuth client
  « Application Web ») : URI de redirection autorisée =
  `https://<app>/auth/google/callback`.
- **OAuth Discord** (discord.com/developers → OAuth2) : redirect =
  `https://<app>/auth/discord/callback`.
- `APP_BASE_URL` (var `wrangler.jsonc` si besoin) : URL publique du frontend
  (Cloudflare Pages) — sert aux redirections post-login.
- **Frontend** : `pnpm --filter @game/web build` → déployer `apps/web/dist`
  sur Cloudflare Pages ; définir `VITE_API_BASE=https://<worker>` au build et
  autoriser les WebSockets (`wss://<worker>/ws/*`).

## Notes d'implémentation (Phase 1)

- Deux sockets par client : lobby (`/ws/lobby`) et partie (`/ws/game/<code>`) —
  un WebSocket n'est accepté que par un seul DO (contrainte plateforme) ; les
  messages de lobby sur un socket de partie (et inversement) sont rejetés.
- `GameCreated`/`GameJoined`/`AbandonGame` : extensions minimales du protocole
  L2 rendues nécessaires par le cycle de vie du LobbyDO (documenté au rapport).
- Ids joueurs : sessions réelles (`google:123`) mappées sur les ids moteur
  `p1`/`p2` (spawns de carte) via `meta.players`, par ordre de join.
- Le filtrage du journal est réutilisé tel quel du moteur (`filterEventsForPlayer`,
  `getFilteredState`) — aucune entité ennemie cachée ne quitte le DO.
