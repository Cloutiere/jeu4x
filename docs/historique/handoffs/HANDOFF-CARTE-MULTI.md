# HANDOFF-CARTE-MULTI — Carte jouable à 5 joueurs (carte libre unique, sièges 2-5)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (clone CivRev). Lis `RULES.md` (spécification normative — notamment R-157/T-44/T-45 spawn, artefacts placement insulaire, barbares, victoires), `HANDOFF.md` §4 (conventions), `PROJET.md` (état), et les rapports archivés : REPORT-SPAWN-START, phase 6b (génération miroir) et 7o (artefacts). **2D uniquement** (pivot 11/09). Baseline visée : `schemaVersion` **25**, ~1300 tests verts, typecheck, prod 200. **C'est un chantier moteur+serveur+UI** — test-first citant les R-xx, déterminisme (RNG seedé, jamais `Math.random`), data-driven, et **valider d'abord le validateur du GameDO (`orderShapeError`) pour toute nouvelle forme d'ordre**.

## 1. Objectif (demande d'Erik du 23/09)

Rendre la carte **jouable à 5 joueurs**. La dimension actuelle (40×40) reste bonne ; **la symétrie miroir 1v1 n'est plus viable** au-delà de deux joueurs. Erik a invité des questions de cadrage — **décisions ci-dessous posées par défaut (pilot, 23/09), veto possibles avant lancement** ; les considérer verrouillées sauf indication contraire d'Erik.

## 2. Décisions tranchées (défauts pilot — vetoables, Erik n'a pas répondu)

- **D1 — Géométrie : carte TOTALEMENT UNIQUE, sans aucune symétrie (veto d'Erik du 24/09 — la géométrie rotationnelle n'est « plus recherchée du tout »).** Génération libre et organique (dans la lignée CivRev) : chaque seed produit une carte distincte. L'équité ne vient PAS de la géométrie mais (a) du **placement équilibré des spawns** — 5 positions aussi équidistantes que possible du centre, distances joueur-à-joueur équilibrées par un critère de mesure data-driven (somme des écarts de distance, ou métrique équivalente — choix à consigner), sélection par le RNG seedé parmi des candidats ; et (b) de la **garantie R-157 par spawn** (D4). Zéro symétrie imposée : miroir comme rotation sont hors périmètre pour ce mode.
- **D2 — Sièges : de 2 à 5, humains OU bots.** Le lobby permet de créer une partie de 2 à 5 sièges ; chaque siège non occupé par un humain peut être rempli par un bot (extension du bot solo existant). Erik peut donc tester une vraie partie à 5 SEUL (1 humain + 4 bots). Le 1v1 actuel devient le cas particulier « 2 sièges ».
- **D3 — Le 1v1 est INCHANGÉ.** Les cartes préfabriquées et le miroir 1v1 actuels restent tels quels pour les parties à 2 (zéro régression acceptée : les tests existants passent sans retouche des cartes). Le mode multi (3-5 sièges) utilise la nouvelle génération libre.
- **D4 — R-157 pour CHAQUE spawn : la garantie (2F/2P/1E, purge rayon 2, 0 ressource) est appliquée aux 5 spawns** par la machinerie SPAWN-START existante. Les artefacts restent en placement insulaire **équidistant des 5 spawns** (généralisation de la règle actuelle, distance capitales conservée 🔶 à recalibrer si nécessaire).
- **D5 — Barbares : règles actuelles inchangées** (camps spatialisés existants). Pas de « secteur neutre » (concept lié à la symétrie, aboli avec D1) ; la densité sur carte 5P est 🔶 à l'œil, sans ajustement de règles.
- **D6 — Victoires, gouvernements, culture, espionnage, naval : inchangés.** Les conditions sont déjà par joueur ; le multi à N ne doit PAS ouvrir la diplomatie, les alliances, les équipes ni le spectateur (périmètre interdit §7).

## 3. État des lieux à auditer (L1 — inventaire des hypothèses « 2 joueurs »)

Le moteur et le client ont hérité du 1v1. AVANT de coder, produire l'inventaire exhaustif des hypothèses « exactement 2 » (fichier:ligne) et le statut de chacune (générique déjà / à corriger / hors périmètre). Pistes connues :
- **Moteur** (`packages/rules`) : `state.players` (probablement générique), victoires (domination « capturer la capitale adverse » au pluriel ?), ONU, barbares, artefacts (miroir 6b = réflexion ; placement insulaire équidistant), générations `progen/settings.ts` (miroir, SPAWN-START, cartes préfabriquées), RNG seedé.
- **Serveur** (`apps/server`) : LobbyDO (création 2 sièges ? join, parties publiques, choix civ), GameDO (ordres par joueur, résolution simultanée N, filtrage fog N, `botPolicy` 1 bot, journal, `orderShapeError`), reconnexion/`missedEvents` par joueur.
- **Client** (`apps/web`) : lobby (2 places), bandeau de jeu (« Adversaire : X »), journal (noms), REPLAY-RESOLUTION (pré-état/événements par joueur — devrait être générique, à vérifier), PLACEMENT-MELEE (nations — générique), panneau diplomatie/contact s'il existe.
- Consigner l'inventaire dans le rapport ; toute découverte majeure (ex. moteur réellement binaire) remonte à Erik AVANT refonte profonde.

## 4. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, prod 200 ; note l'état exact (`schemaVersion`, compte de tests).
- Lecture : `RULES.md` (R-157, artefacts, barbares, victoires), `packages/rules/src/progen/` (miroir, settings), GameDO, LobbyDO, lobby UI.

### L1 — Audit (§3) + données
- Inventaire des hypothèses 2-joueurs (livrable : section du rapport, tableau point par point).
- Données data-driven : `progen/settings.ts` étendu — mode `libre` multi {sieges: 2-5, rayonSpawn, métrique d'équidistance + tolérance, ordre de recherche des candidats}, sièges 2-5 dans la config lobby. Zéro durcissement.

### L2 — Génération multi libre (test-first, pur)
- Nouveau mode de génération **libre** (pas de symétrie, D1) dans `progen/` : composition organique de terrains déterministe seedée (réutiliser les briques existantes de la génération — archipel/côte/océan, économie des terrains), puis **placement des 5 spawns** par recherche seedée : candidats filtrés puis choisis sur critère d'équidistance data-driven (distance au centre + écarts de distances pairwise ; la métrique exacte est consignée et réglable en JSON), R-157 forcée par spawn (machinerie SPAWN-START existante : purge rayon 2, dotation voisinage).
- Artefacts : placement insulaire **équidistant des 5 spawns** (généralisation de la règle actuelle, distance capitales 🔶 à recalibrer).
- Cartes préfabriquées : **non concernées** (1v1 uniquement, D3). Si le chargeur de cartes préfabriquées doit refuser un siège ≠ 2, le faire proprement avec message.
- Tests : R-157 ×5 vert ; 100 % seeds conformes (comme SPAWN-START) ; équidistance des spawns dans la tolérance du critère (tie-breaks déterministes cités) ; déterminisme (même seed → même carte, octets) ; **1v1 inchangé** (les cartes 2 joueurs sortent IDENTIQUES à aujourd'hui — test de non-régression) ; diversité (N seeds → aucune paire identique, métrique de différence simple).

### L3 — Moteur & serveur multi
- Sièges 2-5 : LobbyDO (création avec nombre de sièges, join jusqu'à 5, remplissage bot par siège, choix civ par siège — 16 civs, unicité conservée), GameDO (N joueurs, ordres par joueur, résolution simultanée N, fog/journal/`missedEvents` par joueur, `botPolicy` étendu N bots avec seeds indépendants — le bot actuel est déjà internalisé et seedé, généraliser sans changer son comportement unitaire).
- **`orderShapeError` d'abord** : toute nouvelle forme (sièges, fill bot) validée par le validateur AVANT le handler (piège qui a coûté une phase).
- Migration `schemaVersion` si l'état change (sièges, meta lobby) — idempotent, parties 1v1 existantes testées inchangées après migration.
- Tests serveur : partie 5 (1 humain + 4 bots) jusqu'à une victoire en e2e (domination probablement la plus directe), reconnexion d'un joueur parmi 5, filtrage fog vérifié entre 3 joueurs, journal nommant chaque joueur/bot.

### L4 — Client
- Lobby : sélecteur de sièges (2-5), liste des sièges (humain/bot, civ), création/join ; bandeau de jeu : noms des N joueurs (le « Adversaire : X » devient générique ou disparaît selon l'audit L1) ; journal : noms N ; REPLAY-RESOLUTION : vérifier générique (pré-état + événements multi) ; PLACEMENT-MELEE : vérifier ≥3 nations sur une case.
- Labo `#/progen` : affichage d'une carte multi 5 spawns (curseur sièges), **statistiques d'équité visibles** (distances spawn-centre, distances pairwise, garantie R-157 par spawn, rendements par voisinage de spawn) — l'outil de calibrage visuel d'Erik.
- Aucun changement de rendu des tuiles/unités.

### L5 — Vérification
- Suites vertes (moteur + serveur + web + desktop inchangé), typecheck, **e2e : partie 5 complète (1 humain + 4 bots) avec victoire**, e2e 1v1 inchangé (les cartes préfabriquées actuelles passent sans retouche).
- **Captures `dev-logs/captures-carte-multi/`** avant tout commit : carte 5P labo (vue entière + zoom sur un voisinage de spawn + un camp barbare), partie solo 1+4 bots (début de partie, cohabitation multi-nations, journal N joueurs), carte 1v1 inchangée (A/B).

### L6 — ARRÊT POUR APPROBATION D'ERIK
La composition des cartes est subjective : présenter au moins 3 seeds différentes en 5P (captures labo, statistiques d'équité à l'appui) + la vue 1v1 inchangée. Verdicts attendus : allure générale des cartes libres, densité des camps barbares, lisibilité des 5 spawns. NE COMMITTER QU'APRÈS FEU VERT.

### L7 — Rapport
- `REPORT-CARTE-MULTI.md` : audit L1 (tableau), géométrie et garanties, résultats e2e, captures, ce qu'Erik valide en ligne (création partie 5 avec son login — les autres sièges en bots ; un second humain réel nécessiterait un second compte, à noter), 🔶 de calibrage (rayon spawn, tolérance d'équidistance, densité barbares, distance artefacts).

## 5. Critères d'acceptation

1. Une partie **1 humain + 4 bots** se joue de bout en bout en ligne jusqu'à une victoire, sans erreur console.
2. Carte 5P : **génération libre sans symétrie** (chaque seed unique), 5 spawns équidistants du centre dans la tolérance du critère d'équité, R-157 garanti ×5.
3. **Zéro régression 1v1** : cartes préfabriquées et parties existantes inchangées (tests de non-régression verts, migration idempotente testée).
4. Déterminisme : même seed → même carte ; artefacts équidistants des 5 spawns.
5. Fog, journal, relecture, mêlée corrects à N joueurs ; labo `#/progen` affiche le mode multi.
6. Data-driven (métrique d'équidistance, rayons, sièges réglables en JSON), `orderShapeError` validé avant handlers, suite verte complète.

## 6. Leçons récentes à respecter
- Ne jamais itérer en prod ; validation locale avec captures avant commit ;
- Les fichiers non trackés d'Erik (assets, new_units, new_tiles) ne se committent jamais ;
- Valider le validateur (`orderShapeError`) avant tout nouveau handler d'ordre ;
- Migration : chemins gelés, idempotence, parties existantes relancées en test.

## 7. Périmètre interdit (reporté)
- Diplomatie, alliances, équipes, échanges entre joueurs, spectateur ;
- Espionnage avancé (BACKLOG idée 5), tout nouveau type d'ordre de jeu ;
- Modification des règles de victoire, des barbares (au-delà du placement neutre), des artefacts (au-delà de l'équidistance 5) ;
- 3D, rendu des tuiles/unités, Electron (la coquille profite du multi sans changement) ;
- Remplacement du miroir 1v1 par le rotationnel pour les parties à 2 (D3).
