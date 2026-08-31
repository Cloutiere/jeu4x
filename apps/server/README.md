# @game/server — Worker + Durable Objects (Phase 1)

Socle réseau du jeu 4X : Worker Cloudflare, `GameDO` (un par partie, WS
hibernation), `LobbyDO` (singleton), OAuth Google/Discord + stub local.
Contrats du protocole : `packages/shared` — moteur : `packages/rules`.
Ordres acceptés (Phase 6) : `Move`, `Attack`, `FoundCity`, `FormArmy`, `Hold`,
`Fortify`, `SetProduction` (item `{kind:'unit'|'building', id}` — R-62/R-66),
`SetWorkedTile` (`{cityId, tile: "q,r"|null}` — R-60). Le dump admin inclut
`workedTiles` et `buildings` des villes.

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

## Exploitation & observabilité (Phase 5 — L3)

Production : `https://game-4x-server-prod.erik-ai-studio.workers.dev`
(déploiement `wrangler deploy --env prod`, Worker + Static Assets même origine).

### Débug live — `wrangler tail`

```bash
npx wrangler tail --env prod          # flux de logs du Worker en production
npx wrangler tail --env prod --format pretty
```

Les erreurs d'ordres rejetées, les résolutions et les exceptions (try/catch
global §3.5) apparaissent dans le flux. Les logs sont aussi consultables dans
le dash Cloudflare (Workers & Pages → `game-4x-server-prod` → Logs ; l'observ
abilité est activée dans `wrangler.jsonc`).

### Endpoint admin (production)

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://game-4x-server-prod.erik-ai-studio.workers.dev/admin/game/<CODE>
```

Retourne le dump NON filtré d'une partie : `meta`, `state` (GameState complet,
non passé par le brouillard), `orders`, `locked`, `resolving`, `lastEvents`.
`ADMIN_TOKEN` est un secret posé via `wrangler secret put ADMIN_TOKEN`.

### Purge des parties terminées (T-12, DESIGN.md §4.6 — décision documentée)

Décision (Phase 5) : **purge manuelle différée, pas d'automatisme** en v1.
Motifs : volume minuscule (~10 parties au pic), stockage SQLite des DO
négligeable à cette échelle, et une alarme de purge LobbyDO ajouterait une
réplication inter-DO non triviale. Les parties terminées restent stockées
(statut `finished`, ignorées par le lobby, alarme supprimée). Si un besoin de
purge effective se présente (30 jours, 🔶), la voie simple sera un endpoint
admin `DELETE /admin/game/<code>` (même garde Bearer) supprimant le stockage
du GameDO — à ajouter en Phase 6/7 si Erik le demande.

### Coût — où le lire et cible

- Dash Cloudflare → **Workers & Pages** → `game-4x-server-prod` → onglet
  **Metrics** : requêtes, durée CPU, et consommation Durable Objects
  (requests + duration ; l'hibernation WebSocket rend la durée ≈ nulle entre
  les messages). Le stockage DO est visible dans Storage & Databases →
  Durable Objects.
- Cible (DESIGN.md §1) : **≪ 5 $/mois** (Workers Paid). Les mesures relevées
  lors de la vérification Phase 5 sont consignées dans le rapport de phase ;
  captures à renouveler après chaque vague de parties de test.

## CI/CD (Phase 5 — L4)

Le workflow `.github/workflows/deploy.yml` (à la racine du dépôt) déploie le
Worker complet (build web inclus — les assets sont servis par le Worker même,
pas de Cloudflare Pages) sur `push` vers `main` : install pnpm → tests →
typecheck → `wrangler deploy --env prod`.

Étapes côté Erik (le repo GitHub n'existait pas à la session Phase 5) :

1. Créer le repo GitHub et pousser : `git remote add origin <url> && git push -u origin main`.
2. Secret GitHub `CLOUDFLARE_API_TOKEN` (dash Cloudflare → My Profile → API
   Tokens → « Edit Cloudflare Workers » template, compte + zone Workers.dev).
3. Le premier push `main` déclenche tests + déploiement ; vert attendu.
