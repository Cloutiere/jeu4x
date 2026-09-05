# REPORT CHANTIER BOT-SOLO — Partie solo contre le bot interne du GameDO

**Session du 05/09/2026** — exécution de [`HANDOFF-CHANTIER-BOT-SOLO.md`](HANDOFF-CHANTIER-BOT-SOLO.md). **Livré, testé, déployé.**

## 1. Résultat en une phrase

Depuis le lobby, la case à cocher **« Partie solo (contre le bot) »** crée une partie **immédiatement jouable** contre un joueur bot interne au GameDO (pas de processus externe), en local comme en prod ; le bot joue chaque tour avec la politique de `bot.mjs` portée en TS pur et déterministe (RNG seedé), et l'e2e prouve une **victoire par domination contre le bot** (tour 32).

## 2. Livrables

| Niveau | Contenu | Fichiers |
|---|---|---|
| **L0** | Politique du bot en TS pur : `botPolicy(state, playerId, rng) → { orders, actions }` — portage fidèle de `bot.mjs` (seuils identiques : hold 40 %, fortifier 15 %, naviguer 80 %, embarquer 35 %, réassigner 20 %, rush si trésorerie ≥ coût × 1,3, GP toujours Settle, régimes sans Anarchie, ONU visée à 20 jalons, composants du Vaisseau en fin d'arbre) + `botTurnSeed(gameSeed, turn)` (dérivation déterministe R-80). `bot.mjs` conservé tel quel (duplication documentée — 🔶 du handoff : partage du cœur non raisonnable entre un client .mjs sans build et un module TS). 19 tests. | `apps/server/src/botPolicy.ts`, `tests/botPolicy.test.ts` |
| **L1** | GameDO : flag `bot: true` sur `GamePlayer` (meta uniquement), verrouillage du bot au EndTurn du joueur humain (la partie se résout immédiatement), génération des ordres du bot **à la résolution** (`startResolution`), ordres du bot passés par le **même validateur `orderShapeError`** puis persistés dans le motif `PendingResolution` (rejeu idempotent §3.5 — même entrée → même sortie), actions immédiates du bot (recherche R-85, régime R-122) appliquées via les mêmes helpers purs que les humains, événements joints au journal (`PendingResolution.botEvents`), le bot ne peut jamais être en forfait T-06 (l'alarme le verrouille sans incrémenter). | `apps/server/src/game.ts` |
| **L2** | Lobby : `GameCreationSettings.solo` + `botCivId` (types partagés) ; `handleCreate` crée la partie et fait rejoindre le bot **dans la même requête** (chemin `internal/join` normal — état initial créé par le GameDO), status **active** immédiat, pas de code d'invitation ; civ du bot imposée au lobby ou **tirage seedé** par le seed de partie (`createRng(seed ^ 0xb07)`, ids triés R-81) ; le bot n'est jamais indexé dans « mes parties » du pseudo-compte `bot`. | `apps/server/src/lobby.ts`, `packages/shared/src/index.ts` |
| **L3** | UI : case à cocher « Partie solo (contre le bot) » + menu « Civilisation du bot » (défaut **Aléatoire**) dans le formulaire de création ; badge **SOLO** + « contre Bot (civ) » dans « Mes parties » ; libellés du journal : les ids moteur sont résolus en noms (`eventLabel(event, nameOf)` — nouveau paramètre optionnel, Journal.svelte fournit le miroir engineId → nom) → **« Bot fonde une ville… »** au lieu de « p2 fonde… ». Interface de jeu inchangée. | `apps/web/src/pages/Lobby.svelte`, `components/Journal.svelte`, `lib/labels.ts` |
| **L4** | e2e « conditions réelles » sur wrangler dev : création solo au lobby → 32 tours joués → **victoire par domination** (capture de la capitale du bot, motif méta `domination`) + le bot prouvé vivant chaque tour (24 tours avec déplacements, 27 avec production) + contrôle « partie 2 joueurs pré-solo inchangée » + badge solo vérifié dans la GameList. GUI navigateur : création solo, 1 tour joué, badge SOLO vu — captures `dev-logs/captures-bot-solo/` (3 PNG). | `apps/server/src/botSolo-e2e.mjs`, `dev-logs/captures-bot-solo/` |

**Tests : 866 verts** (695 règles + 106 web + 65 serveur — **+27** vs baseline 839 : 19 botPolicy + 8 solo), typecheck 4/4.

## 3. Décisions 🔶 (défauts appliqués — veto Erik possible)

1. **Fog du bot : état COMPLET** (défaut du handoff, documenté dans l'en-tête de `botPolicy.ts`) — le bot est le serveur, équité non garantie ; bot de test simple.
2. **Civ du bot** : menu déroulant optionnel (défaut **Aléatoire** = tirage seedé par la partie, rejetouable) ; réutilise la validation 7n côté serveur. Le tirage ne consomme pas le seed de résolution (flux séparé, XOR `0xb07`).
3. **Migration : AUCUNE** — le flag bot vit dans `meta.players` (GameDO/LobbyDO) et dans les messages (`GamePlayerInfo.bot`, `GameSummary.players[].bot`), **pas dans le GameState** : `schemaVersion` reste **18**, zéro migration, parties existantes intactes (test dédié « parties pré-solo inchangées »).
4. **Le coût du rush du bot passe par le helper moteur `rushBuyCostOf`** (toutes réductions 7n comprises) là où `bot.mjs` garde son miroir minimal — écart assumé avec le client externe, documenté : c'est plus correct, et le moteur revalide tout de toute façon.
5. **Unicité mondiale des merveilles ajoutée au tirage du bot** (R-129, révision 7k postérieure à `bot.mjs`) : le bot ne produit plus une merveille déjà bâtie chez le rival.
6. **Abandon d'une partie solo** = l'adversaire (le bot) gagne par forfait — comportement standard inchangé.
7. **Timer solo** : le choix du formulaire s'applique normalement ; si Erik marche, l'alarme résout avec ses ordres courants, et le bot « répond » toujours (jamais de forfait pour lui).

## 4. Déterminisme (critère d'acceptation)

- Le RNG du bot est **dédié** : `botTurnSeed(gameSeed, turn)` — il ne consomme jamais le RNG de résolution du moteur (les flux sont séparés, testé).
- Même seed de partie + mêmes ordres d'Erik → mêmes ordres du bot → même partie (la génération est pure, et les ordres générés sont **persistés dans le motif de résolution** : un crash + reprise rejoue à l'identique, §3.5).
- 19 tests botPolicy dont déterminisme bit à bit (R-80) et validation `orderShapeError` de chaque forme.
- **Bug attrapé par la CI (corrigé)** : le tirage de production du bot mirrorait `bot.mjs` (filtres à la main) et pouvait choisir un item que le moteur refuse — unité unique d'une AUTRE civilisation (R-148, ex. Guerrier Impi pour un bot non-zoulou) ou Banque mondiale sous 20 000 or (R-137). L'ordre était alors ignoré à la résolution (production vide ce tour) et un test solo devenait floquant (~40 % selon le seed de partie, d'où l'échec CI). **Correctif** : le filtre final de `pickProduction` passe par le validateur moteur `canSetProduction` (source unique R-87 : tech, obsolescence, uniques + remplacement, GP, stratégiques, bâtiments R-66/R-111) + `wonderTreasuryLocked` (R-137). 10/10 exécutions vertes après correctif.

## 5. Vérifications (L4)

- **e2e** `node src/botSolo-e2e.mjs` (wrangler dev local) : **TOUS LES CONTRÔLES PASSÉS** — création solo au lobby, badge, Welcome avec joueur bot, victoire par domination au tour 32, bot actif chaque tour, partie classique 2 joueurs inchangée.
- **GUI** (navigateur réel, compte dev « TestSolo ») : case cochée → partie `GBJAVB` créée et ouverte, « Adversaire : Allemagne » (civ tirée), tour 0 → clic « Fin de tour » (dialogue « unités sans ordre » confirmé) → **tour 1 résolu, le bot a joué** ; « Mes parties » affiche le badge **SOLO — contre Bot(Allemagne)**. Captures : `dev-logs/captures-bot-solo/01..03*.png`.
- **En prod, à vérifier par Erik avec SON login OAuth** (listé §7).

## 6. Bugs et observations préexistants (hors périmètre — pour le pilot)

1. **Les parties finies restent « actives » dans « Mes parties »** : `LobbyDO.handleAbandon` met à jour sa copie mémoire sans `putGame`, et la notification `GameDO.notifyLobbyFinished` (fire-and-forget, `void`) est perdue à la fin de l'invocation worker — le statut `finished` n'atteint jamais le stockage du LobbyDO (constaté en dev sur 7 parties : toutes encore « active » côté lobby alors que le GameDO les a finies). **Préexistant (Phase 5), touche toutes les parties** — correctif candidat : `await this.putGame(game)` dans `handleAbandon` + `ctx.waitUntil` (ou await) pour la notification. Non corrigé ici (périmètre interdit).
2. Le test web `structures3d.test.ts` a échoué une fois en début de session (fichier en cours de modification par l'atelier d'Erik) — **vert en fin de session** (Erik a poussé sa correction en parallèle). Les fichiers de l'atelier (`render3d/*`, `tests/structures3d.test.ts`) n'ont **pas** été inclus dans ce chantier.
3. Doublons préexistants de `case 'Victory'/'FirstDiscovered'` dans `labels.ts` (le premier `case` gagne — les variantes « motifs » de la fin de partie sont du code mort). Comportement conservé tel quel ; nettoyage possible au chantier V3 (renommage/libellés).

## 7. À vérifier en ligne par Erik (son login OAuth)

1. Créer une partie solo depuis le lobby (case cochée, civ du bot au choix ou Aléatoire) → la partie s'ouvre immédiatement ;
2. Jouer quelques tours : le bot produit, recherche, déplace ses unités ; le journal nomme « Bot » ;
3. Le badge SOLO apparaît dans « Mes parties » (y compris sur mobile/desktop réel) ;
4. Gagner (ou perdre !) contre le bot : écran de victoire normatif, partie marquée finie ;
5. (Connu, préexistant — §6.1) la partie finie peut rester listée « active » dans « Mes parties » jusqu'à correctif du pilot.

## 8. Arrêt

Chantier terminé, code pushé sur `main` (CI deploy), remise de la main au pilot. `bot.mjs` reste utilisable pour les tests/e2e (deux implémentations de la même politique, écart documenté §3.4-3.5).
