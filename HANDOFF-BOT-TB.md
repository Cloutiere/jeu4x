# HANDOFF-BOT-TB — Le bot « gère son empire » : rendements, production pondérée, recherche orientée, trésorerie

**Décisions Erik 24/10** (« lance T-B »). Deuxième tranche du bot standard : les arbitres économiques remplacent le hasard. T-C (guerre/diplomatie) suivra — HORS PÉRIMÈTRE. Sert de squelette stratégique au futur Jev-joueur.

## 1. Préalables

- Lire `apps/server/src/botPolicy.ts` (BOT-TA/T-EXPLORATION livrés — objectifs par unité), `packages/rules/src/data/bot.json` (profils), les helpers moteur d'économie (`tileYield`/récolte — miroir obligatoire, jamais de duplication de formule), R-66/R-93, R-111 (remplacements), R-129 (exclusivité merveilles), le banc botSolo (échec 300 tours PRÉEXISTANT — consigné, T-C recadrera avec la guerre ; ne PAS « réparer » ici).
- Baseline : suites vertes à jour (rules ~1101 / server ~166 / web ~698), `schemaVersion` 27, **serveur seul**. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Citoyens sur les meilleurs rendements** : au lieu d'une réassignation aléatoire (20 %), chaque ville avec citoyens mal placés reçoit un plan optimal déterministe : le bot choisit les worked tiles au meilleur rendement selon son BESOIN pondéré (nourriture pour croître si non bloquée ; marteaux si en guerre ou production militaire en tête de file ; or si trésorerie basse — les poids sont des données). Tuiles travaillées via la file `SetWorkedTile` existante (miroir `applySetWorkedTile`, plafond pop, désélection d'abord si pleine).
- **D2 — Production pondérée** : `pickProduction` cesse d'être aléatoire — arbitrage par situation : ① besoin militaire (en guerre, ou barbares actifs proches → unité) ; ② pop au plafond ou presque → colon (si site légal) ; ③ bâtiments économiques manquants (ordre déterministe par impact : Bibliothèque/Agriculture-line, Marché…) ; ④ merveille si pionnier (première disponible, R-129) ; ⑤ repli = l'actuel. Poids et ordres data-driven (`bot.json`).
- **D3 — Recherche orientée** : un OBJECTIF (donnée par profil : « militaire » → chemin vers sa tech militaire clé ; « économique » → arbre économique ; défaut = chemin le moins cher vers l'ère suivante), complétion de la chaîne de prérequis via l'arbre existant — plus de tech au hasard.
- **D4 — Trésorerie intelligente** : rush-buy conservé (coût + 30 % de réserve) MAIS seulement si l'item est prioritaire (D2 ①/②) ; épargne minimale (donnée) avant tout achat.
- **D5 — Déterminisme/data-driven** : même seed ⇒ mêmes décisions (propriété testée) ; tous les seuils/poids dans `bot.json` (3 profils) ; le bloc D5 de BOT-TA (hook difficulté) est respecté — seul « normal » actif.
- **D6 — Unités intouchées** : les objectifs T-A (soigner/attaquer/garnison/patrouille) ne changent PAS — seule l'économie est retravaillée.

## 3. Mission

- **L1 — test-first (serveur)** : suite `bot-tb.test.ts` : plan de worked tiles (meilleur rendement par besoin, plafond pop, désélection d'abord), production pondérée (5 cas de situation : guerre, plafond pop, bâtiments, merveille, repli), recherche orientée (chaîne de prérequis complète, objectif atteint), trésorerie (rush seulement prioritaire + réserve), même seed ⇒ mêmes ordres, reprise de partie.
- **L2 — implémentation** : D1-D4 (fonctions pures séparées de l'émission, miroirs exacts des formules moteur).
- **L3 — bancs** : bancs bot solo existants verts (sauf l'échec 300 tours consigné — consigner l'évolution, ne pas « réparer ») ; scénarios scriptés au dump serveur ; **captures GUI god mode** (`dev-logs/captures-bot-tb/`) — Erik jugera à l'œil (villes qui croissent, marteaux bien placés).
- **L4** : suites vertes, typecheck, commit, push, rapport `REPORT-BOT-TB.md` (blocs data-driven, 🔶, liste « à juger en jouant par Erik »).

## 4. Critères d'acceptation

1. Les villes du bot croissent et produisent selon des arbitrages visibles (god mode : worked tiles optimaux, files cohérentes avec la situation) ;
2. Recherche dirigée vers un objectif (pas de hasard) ; rush discipliné ;
3. Déterminisme verrouillé ; `bot.json` enrichi (3 profils) ;
4. Bancs/suites verts, `schemaVersion` 27.

## 5. Périmètre interdit

T-C (déclarations, agressivité, diplomatie), le fog du bot, les valeurs de gameplay (rendements, coûts), les objectifs d'unité T-A, `schemaVersion`.

## 6. Fin de session

Rapport (seuils, scénarios, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
