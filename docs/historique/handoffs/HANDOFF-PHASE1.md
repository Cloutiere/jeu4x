# HANDOFF PHASE 1 — Socle infrastructure & communication

Tu reprends le pilotage du développement. **Préalable : lire intégralement `DESIGN.md` (§3 Architecture notamment) et `RULES.md`, puis vérifier la baseline Phase 0** (`cd packages/rules && pnpm test` → 119 tests verts, `pnpm exec tsc --noEmit` → propre, `git log --oneline` → 6 commits). Les conventions du `HANDOFF.md` §4 restent en vigueur : docs en français / code en anglais, test-first, déterminisme, commits français un par livrable, aucune modification des règles hors L0.

**Prérequis utilisateur possiblement absents** (compte Cloudflare + Workers Paid, apps OAuth Google/Discord) : coder **en local** (wrangler dev, auth stubbée) sans attendre ; ne jamais bloquer dessus. Ne jamais committer de secret ; fournir `.dev.vars.example`.

## Contexte

Phase 0 (moteur pur) est complétée : `packages/rules` contient `resolveTurn` (phases A-D), `getFilteredState` (fog 3 états), journal d'événements séquencé, cartes 40×40, migrations de schéma. La Phase 1 construit le socle réseau : monorepo, Durable Objects, WebSockets hibernation, auth. **Livrable vérifiable : deux navigateurs voient la même partie vide en temps réel, avec reconnexion robuste.**

## Mission — livrables dans l'ordre

### L0 — Correctifs moteur (`packages/rules`) — à faire AVANT tout le reste

1. **R-56 en allocation globale deux-passes** (RULES.md §7.5, mis à jour le 29/08) : la Phase 0 a implémenté « premier résolu, premier servi ». Refondre : (a) résoudre tous les combats, (b) collecter les perdants à replier, (c) allouer les cases de repli libres **par PV décroissants** (tie : `unitId` croissant), (d) les perdants sans case reprennent le combat contre le vainqueur de leur propre combat (les vainqueurs ne quittent jamais la case) jusqu'à élimination. Tests dédiés : deux perdants, une case — le plus haut PV l'obtient désormais.
2. **Forfait (T-06)** : compteur `missedTurns` par joueur dans le GameState → **bump `schemaVersion` 1→2 + migration** (§3.8 DESIGN.md : exercice grandeur nature de la chaîne de migrations). Fonction `checkForfeit(state)` : au-delà de `T-06` verrouillages manqués consécutifs → événement `Victory` pour l'adversaire.
3. Mettre à jour la traçabilité du README ; suite 100 % verte + `tsc` propre. **Commit dédié.**

### L1 — Monorepo

- Racine : `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `package.json` racine avec scripts, `turbo.json` (pipelines `build`/`test`/`typecheck`).
- `packages/rules` : consommé tel quel (aucun changement hors L0).
- `packages/shared` : contrats TypeScript (voir L2).
- `apps/web` : Vite + Svelte 5 en SPA (build statique, prêt pour Cloudflare Pages — pas de SSR).
- `apps/server` : Worker Cloudflare + Durable Objects via Wrangler v4 ; `wrangler.jsonc` avec bindings DO + `migrations` (`new_sqlite_classes`), environnement `dev`/`prod`.

### L2 — Contrats (`packages/shared`)

- `protoVersion` explicite dans chaque message.
- `ClientToServerMessage` : `Auth` (token de session), `SubmitOrder`, `ReplaceOrder`, `CancelOrder`, `EndTurn`, `ResyncRequest`, `CreateGame`, `JoinGame`, `ListGames`.
- `ServerToClientMessage` : `Welcome`, `Snapshot` (état filtré + `seq`), `TurnResult` (événements filtrés + `seq`), `OrderAck`, `Error`, `GameList`, `GameCreated`.
- Les types d'ordres/événements sont **ré-exportés** de `@game/rules` (source unique, pas de duplication).

### L3 — `GameDO` (un par partie, `idFromName(code)`)

- Cycle de vie : création avec settings (timer 🔶), join du joueur B, refus si pleine/terminée.
- WebSocket : `state.acceptWebSocket` + **hibernation** ; `serializeAttachment({ playerId, sessionToken })` ; auth au connect (token JWT = cookie, passé en query param du WS URL).
- **Ne jamais faire confiance à la mémoire au réveil** : lazy-load du GameState depuis le stockage SQLite, exécution de la chaîne de migrations au chargement.
- Ordres : autoritaires côté serveur, **persistés à chaque modification** ; « Fin de tour » verrouille (irrévocable).
- Résolution quand les 2 joueurs ont verrouillé, avec le motif de persistance idempotent de `DESIGN.md` §3.5 : `{phase:"resolving", turn, orders, rngSeed}` → `resolveTurn` → `{phase:"orders", turn+1, newState, events}`. Une résolution interrompue est **rejouée à l'identique** par l'alarme.
- Alarms : échéance du timer → auto-verrouillage des ordres courants + résolution ; `checkForfeit` (L0) à chaque échéance.
- Sync (§3.4) : au connect/reconnect → `Snapshot` filtré + `seq` courant ; après résolution → `TurnResult` (événements filtrés par joueur, `fog.ts` déjà prêt) ; `ResyncRequest` → nouveau snapshot. Aucun rattrapage par diffs approximatifs.
- Endpoint admin debug (protégé par secret `ADMIN_TOKEN`) : dump de l'état.

### L4 — `LobbyDO` (singleton `idFromName("lobby")`)

- Création de partie : code 6 caractères (alphabet sans ambiguïté, vérification de collision), le code = nom du `GameDO` = lien d'invitation `/join/<code>`.
- Listing des parties publiques en attente + index `playerId → parties actives` (pour « mes parties »).
- Join par code (validation : existe, place libre, non terminée). Abandon de partie.

### L5 — Authentification

- OAuth **code flow** Google + Discord côté Worker (routes `/auth/:provider`, `/auth/:provider/callback`, paramètre `state` anti-CSRF).
- Session = cookie **JWT signé** (HttpOnly, Secure ; secret `AUTH_SECRET` en wrangler secret). `playerId` stable = `{provider, providerId}`.
- DEV : variable `DEV_STUB_AUTH` → `/auth/dev?name=...` (faux login) pour le local et les tests. Si les secrets OAuth sont absents, l'app démarre quand même en mode stub avec un avertissement.

### L6 — Client minimal (`apps/web`)

- Pages : login (stub + boutons OAuth), lobby (créer/rejoindre/mes parties), partie.
- Page de partie **sans rendu de carte** (Phase 3) : barre supérieure (tour, phase, ressources, statut réseau), bouton « Fin de tour », affichage brut de l'état filtré + liste du journal d'événements.
- Stores Svelte alimentés par les messages WS ; détection de trou de `seq` → `ResyncRequest` automatique ; reconnexion avec backoff.
- Deux onglets sur le même code doivent voir l'état et la résolution en temps réel.

### L7 — Tests & qualité

- `@cloudflare/vitest-pool-workers` pour les DO : reconnexion (snapshot restauré), trou de `seq` → resync, **crash pendant `resolveTurn` → l'alarme rejoue et aboutit au même résultat** (idempotence), alarme timer → auto-lock + résolution, forfait T-06, persistance des brouillons d'ordres.
- Scripts racine : `pnpm test` (rules + DO), `pnpm typecheck`, `pnpm build`.
- `apps/server/README.md` : scénario de vérification manuelle à deux onglets + étapes de déploiement (documentées, **non exécutées** sans compte).

## Critères d'acceptation

1. `pnpm test` vert à la racine (moteur + DO), `tsc --noEmit` propre dans chaque paquet.
2. Deux onglets sur le même code de partie partagent l'état en temps réel ; la reconnexion d'un onglet restaure snapshot + événements manqués.
3. Une exception injectée pendant la résolution est récupérée par l'alarme avec un résultat bit-à-bit identique.
4. Aucun secret dans le dépôt ; `.dev.vars.example` fourni.
5. Zéro dépendance runtime nouvelle dans `packages/rules` ; dépendances serveur/web justifiées et minimales.

## Périmètre interdit (cette session)

- Pas de PixiJS ni de rendu de carte (Phase 3) ; pas de changement de règles de jeu (hors L0) ; pas de D1/KV ; pas de déploiement production ; pas de push distant.
- Ne pas modifier `RULES.md`/`DESIGN.md` hors annotations « implémenté en Lx ».

## Fin de session

Rapport : livrables, résultats de tests, ambiguïtés + interprétations choisies, ce qui reste (déploiement réel, OAuth réels), et **proposition pour la Phase 3** (rendu PixiJS & UI — la Phase 2 étant absorbée). S'arrêter ensuite et rendre la main.
