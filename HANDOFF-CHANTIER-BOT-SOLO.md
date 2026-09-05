# HANDOFF CHANTIER — Partie solo contre le bot (bot interne du GameDO)

Tu reprends le pilotage de l'implémentation. **Préalables :** `HANDOFF.md` §4, baseline **829 tests** + typecheck verts, `RULES.md` (résolution simultanée Phase A-C, R-80 RNG seedé, R-135 rush-buy — la politique du bot existe : **`apps/server/src/bot.mjs`, ~585 lignes, client externe utilisé depuis la Phase 3**). `schemaVersion` : **18**. Pièges : `orderShapeError`, serveurs dev périmés.

**Contexte.** Erik teste en jouant les deux camps ; il veut créer **une partie solo contre le bot** directement depuis le lobby, sans lancer de processus externe. Le cerveau du bot existe (`bot.mjs` : ordres valides aléatoires, production filtrée R-87, rush-buy R-135, GP en Settle déterministe, régimes/vaisseau) — mais c'est un **client Node externe**, inutilisable en prod. Le chantier : **internaliser le bot dans le GameDO** + **l'option de création au lobby**. « Le bot n'a pas besoin d'être très sophistiqué » (Erik) — la politique actuelle suffit.

## Décisions d'implémentation (défauts 🔶 — veto Erik possible)

- **Le bot est un joueur interne du GameDO** 🔶 (défaut) : à la résolution (Phase B), le DO **génère les ordres du bot** via la politique portée en TS serveur (pur, déterministe — RNG seedé dédié dérivé du seed de partie, R-80 ; le moteur revalide tout comme pour un humain). Avantages : fonctionne en prod ET en local, zéro processus à gérer, la partie se résout dès qu'Erik termine son tour. Le script externe `bot.mjs` est **conservé tel quel** pour les tests/e2e (deux implémentations de la même politique : partager le cœur si raisonnable 🔶, sinon documenter la duplication) ;
- **Fog du bot 🔶** : défaut — le bot joue sur l'état **complet** (c'est le serveur ; bot de test simple, équité non garantie) ; alternative : état filtré du bot (plus honnête, plus coûteux). Documenter le choix ;
- **Lobby 🔶** : case à cocher **« Partie solo (contre le bot) »** dans le formulaire de création. Cochée : la partie est créée **avec p2 = joueur bot** (nom « Bot », flag `bot: true`), **démarre immédiatement** (pas de code d'invitation ni d'attente), apparaît dans « Mes parties » avec un badge « solo » ; Erik joue p1 et le tour se résout à sa fin de tour. Décochée : comportement actuel inchangé ;
- **Civ du bot 🔶** : défaut — menu déroulant optionnel dans le lobby (défaut « aléatoire » = tirage seedé par la partie) ; réutilise le choix de civ 7n côté serveur ;
- **Pas de difficulté** (un seul niveau, le bot actuel) — l'escalade de difficulté est un chantier futur si Erik le demande ;
- **Fin de partie** : les 4 victoires s'appliquent normalement (battre le bot = victoire homologuée en solo 🔶 — défaut : oui, les parties solo apparaissent dans « Mes parties » comme les autres, marquées « solo ») ;
- **Migration 🔶** : si le flag bot vit dans le GameState, migration **18→19 additive** (`bot: false` par joueur) ; si côté meta uniquement, aucune.

## Mission — livrables dans l'ordre

- **L0 — Politique du bot en TS serveur (test-first)** : portage de `bot.mjs` en module pur déterministe `botPolicy(state, playerId, rng)` → liste d'ordres valides (mêmes règles : Hold/Move/production/rush/GP Settle/recherche/gouvernement) ; chaque test cite le comportement porté ; le DO l'exécute en Phase B pour le joueur bot ;
- **L1 — GameDO** : flag bot, génération des ordres à la résolution, validation `orderShapeError` inchangée (les ordres du bot passent par le même validateur), fin de partie en solo, journal (« Bot fonde une ville… ») ;
- **L2 — Lobby/serveur** : case à cocher, création immédiate, badge solo, civ du bot 🔶 ;
- **L3 — UI** : badge « solo » dans les listes, libellés (l'adversaire s'appelle « Bot »), rien d'autre — l'interface de jeu est inchangée (le bot n'a pas d'UI) ;
- **L4 — Vérification & livraison** : e2e (création solo → victoire par domination contre le bot ; le bot joue ses tours ; parties pré-solo migrées), GUI (créer une partie solo depuis le lobby et jouer quelques tours — c'est LE critère d'Erik), captures `dev-logs/captures-bot-solo/`, CI, prod saine — **en prod, Erik créera sa première partie solo avec son login** (à lister dans le rapport).

## Critères d'acceptation
- Depuis le lobby, **une case à cocher crée une partie solo jouable immédiatement** contre le bot, en local comme en prod ;
- Le bot joue chaque tour (ordres valides, production, GP, rush selon sa politique) sans processus externe ;
- Déterminisme : même seed + mêmes ordres d'Erik → même partie (le RNG du bot est seedé) ;
- Les parties existantes (2 joueurs) sont inchangées ; 829 tests verts minimum, typecheck vert, CI deploy vert.

## Périmètre interdit (cette session)
Difficultés multiples ; IA avancée (stratégie réelle) ; 3+ joueurs ; renommage V3 ; espionnage avancé ; chantiers visuels (l'atelier d'Erik continue en parallèle — ne pas toucher à la page `#/atelier` ni à `visuel3d.json`, et **vérifier l'état du répertoire avant de commit** : Erik travaille sur les assets en même temps — si des fichiers de l'atelier sont modifiés, ne pas les inclure).

## Fin de session
Rapport `REPORT-CHANTIER-BOT-SOLO.md` (décisions, 🔶 — fog du bot, civ, migration, ce qui se vérifie en ligne avec le login OAuth d'Erik), arrêt, remise de la main au pilot.
