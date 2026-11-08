# REPORT-CARTE-MULTI — Carte jouable à 5 joueurs (génération libre, sièges 2-5)

> **Statut : EN ATTENTE DU FEU VERT D'ERIK (L6)** — rien n'est committé. La composition des cartes est subjective : Erik valide l'allure générale des cartes libres, la densité des camps barbares et la lisibilité des 5 spawns (3 seeds au labo `#/progen` + captures `dev-logs/captures-carte-multi/` + la vue 1v1 inchangée).

## 1. Baseline et résultats

| | Avant | Après |
|---|---|---|
| Tests | 1321 verts (868 règles + 81 serveur + 372 web) | **1357 verts** (895 + 88 + 374) |
| Typecheck | 0 erreur | 0 erreur |
| `schemaVersion` | 25 | **26** (migration additive, idempotente) |

## 2. Audit L1 — inventaire des hypothèses « exactement 2 joueurs »

**Constat majeur : le moteur de résolution est DÉJÀ N-joueurs** (`resolveTurn` parcourt `Object.keys(players)`, fog/journal/mêlée/barbares/ONU génériques, palette 4 tons p1..p7). Les verrous étaient localisés :

| Zone | Point | Statut avant | Traitement |
|---|---|---|---|
| Moteur `map.ts` | `parseMap` exigeait « exactement 2 joueurs » | À corriger | **2-5 joueurs**, distances capitales ALL-PAIRS ≥ 12 |
| Moteur `map.ts` | `diplomacy.war` = paire p1-p2 en dur | À corriger | **guerre universelle** (toutes paires — FFA ; à 2 : paire unique identique) |
| Moteur `turn.ts` | Domination = capture de LA capitale adverse | À corriger | **élimination** : la capture de sa capitale ORIGINALE élimine ; victoire du DERNIER en lice (à 2 : flux d'événements bit-identique) |
| Moteur `turn.ts` | `razedCapital` = victoire de « l'autre » | À corriger | même sémantique d'élimination (barbares ne gagnent jamais) |
| Moteur `forfeit.ts` | Forfait = victoire du premier autre trié | À corriger | élimination du fautif, la partie continue à 3+ |
| Moteur | Victoires science/culture/économique | Générique + garde | un joueur ÉLIMINÉ ne peut plus gagner |
| Moteur `progen/mirror.ts` | `mirror1v1` refuse playerCount ≠ 2 | Bloquant multi | conservé pour 2 sièges ; **`libreMulti`** nouveau (3-5) |
| Moteur `progen` | artefacts « équidistants des deux départs » | **GÉNÉRIQUE DÉJÀ** (min-distance à TOUTES les capitales) | testé ×5 |
| Serveur `game.ts` | `EnginePlayerId = 'p1'\|'p2'` + records 2 clés + capacity 2 + 1 bot | À corriger | **p1..p5**, blobs 2-sièges complétés à la lecture (aucune migration serveur), capacité = `settings.playerCount`, état créé au DERNIER siège, N bots à seeds indépendants |
| Serveur `lobby.ts` | solo = 1 bot, join ≤ 2 | À corriger | sièges 2-5, solo remplit TOUS les sièges vides de bots (`bot`, `bot:3`..`bot:5` — ids réservés par l'allowlist providers) |
| Serveur `botPolicy.ts` | `botTurnSeed(seed, tour)` sans joueur | À corriger | `botTurnSeed(seed, tour, engineId)` — l'id historique `'bot'` conserve la dérivation ORIGINALE (bot solo inchangé) |
| Client `Game.svelte` | « Adversaire : X », « joueur 2 », vainqueur « p3 » brut | À corriger | bandeau « Adversaire(s) : … » (2 sièges : libellé inchangé), attente générique, vainqueur nommé (humain/bot + civ), toasts nommés |
| Client `Lobby.svelte` | pas de sélecteur de sièges | À corriger | sélecteur 2-5 (verrouillé à 2 sur cartes préfabriquées), solo « N-1 sièges remplis de bots », listes avec N sièges |
| Client `Progen.svelte` | labo 1v1 seulement | À corriger | curseur sièges 2-5 + **panneau « Équité du placement libre »** (métrique D1 complète) |
| Client journal/replay/mêlée | — | **GÉNÉRIQUES DÉJÀ** (audit) — `PlayerDefeated` ajouté au journal + fog PUBLIC + playback |

Hors périmètre (inchangés) : diplomatie/alliances/équipes (§7), 3D, Electron, règles de victoire (seuils/types), barbares, palettes.

## 3. Génération libre (D1 — zéro symétrie)

Nouvelle stratégie `libreMulti` (`packages/rules/src/progen/libre.ts`) derrière la même interface `StartPlacementStrategy` (enregistrée sans cycle d'imports via `registerStrategy`) :

1. **Terrain organique** : la couche géophysique 6b génère la carte 40×40 entière (aucun découpage, aucun reflet) ;
2. **Sélection des spawns par critère d'équité D1** (data-driven, `progen/settings.ts`) :
   `score(S) = Σ_{i<j}(d_ij − d̄)² + wCentre·Σ_i(c_i − c̄)² + wFert·(fertilité max−min) + wSpread·(écart pairwise)²`
   — minimisé par **farthest-point sampling seedé** (80 restarts 🔶, premier départ tiré au RNG) + passes d'amélioration locale (bassin des 500 meilleurs sites 🔶 par fertilité) ; tie-breaks R-81 (liste (q,r) lexicographique) ;
3. **Porte d'acceptation** 🔶 `librePairSpreadMax = 8` : écart max−min des distances pairwise — sinon sous-graine suivante ;
4. **R-157 PAR SPAWN** : `forceSpawnNeighborhood` (re-paint 2F/2P/1E) + purge des ressources rayon 2 + normalisation R-103 (tolérante : un site infranormalisable est consigné, pas fatal) ;
5. Villages/huttes : TOTAUX 1v1 (6+6/6+6 🔶) aux distances aux N spawns — densité de référence conservée quelle que soit N (D5, à l'œil) ;
6. Artefacts : tirage 7o inchangé (déjà générique) — « équidistant des 5 spawns » = rang par distance minimale à TOUTES les capitales.

**Mesures (tests)** : 30 générations 3/4/5 joueurs × 6 seeds — 100 % conformes (R-157 ×N, parseMap, écart pairwise ≤ 8) ; déterminisme bit à bit ; diversité (aucune paire de seeds identique) ; fertilités de spawn typiques 57-67 (delta max−min consigné). Génération typique : 0,2-2 s (GameDO, au dernier join).

**Les 3 seeds présentés à Erik (5 sièges)** :

| Seed | Spawns (q,r) | Distances au centre | Pairwise (10 paires) | Fertilités | Écart pairwise | Score D1 |
|---|---|---|---|---|---|---|
| 4242 | (1,25) (7,13) (9,29) (19,9) (21,19) | 9 9 10 10 11 | 12×5, 18-20×5 | 66 66 63 65 55 | 8 | 410 |
| 777777 | (2,27) (4,15) (14,25) (16,7) (22,13) | 8 10 10 12 12 | 12×5, 18-20×5 | 61 65 63 63 61 | 8 | 430 |
| 20260924 | (0,28) (1,16) (12,25) (13,8) (20,13) | 10 12 8 11 10 | 12×5, 17-20×5 | 58 63 57 63 63 | 8 | 430 |

Chaque seed : 12 villages + 12 huttes (totaux 1v1 🔶), 4 artefacts. Déficits de couverture consignés (ex. soufre −8..−10 : le désert est rare en archipel — best-effort 🔶).

**Tolérance consignée 🔶 (vetoable)** : la garantie 6c « une ressource de chaque type par joueur » est **best-effort** en mode libre — une ressource rare (soufre = désert seul) peut ne pas offrir N cases éligibles ; le déficit par type est consigné au rapport (`couvertureManquants`, visible au labo). Sur les cartes miroir 1v1, rien n'a changé.

## 4. Décisions tranchées (à vetoer)

- **Élimination** : un joueur perd quand SA capitale ORIGINALE (jamais capturée avant — `wasCaptured`) est capturée ou rasée (ou forfait T-06 / abandon). À 2 : première élimination = fin de partie (flux 1v1 IDENTIQUE — testé). À 3+ : la partie continue, dernier en lice = victoire par domination. Zombie 🔶 : ses unités/villes restent (défendent, économie auto), le serveur refuse ses ordres, jamais de forfait pour lui.
- **Guerre universelle** (R-58) : toutes les paires de spawns en guerre — aucun contact pacifique possible (la diplomatie reste interdite §7).
- **Annihilation** (découverte e2e) : un joueur qui perd sa DERNIÈRE entité (unité ou ville — ex. colon tué par les barbares avant la fondation) est ÉLIMINÉ (événement `PlayerDefeated` cause `attrition`). Vérification ÉVÉNEMENTIELLE (kill, perte de ville) — jamais par balayage. Sans ceci, un joueur mort-vivant rend la domination infaisable. Sémantique plus forte qu'avant : un test 1v1 historique « ville rasée, la partie continue » modélisait ce zombie — corrigé (fixtures avec entité de refuge).
- **Le bot fonde sa capitale** (découverte e2e — trou PRÉEXISTANT) : `botPolicy` ignorait `FoundCity` — sur carte procédurale (départ Colon), le bot restait inerte TOUTE la partie (les tests bot solo historiques étaient sur pangee-40, démarrage capitale, et masquaient le trou). Le bot fonde dès le tour 0 (coût nul, R-64), puis enchaîne recherche/production. À 2 sièges sur carte préfabriquée : AUCUN changement (pas de colon).
- **Abandon à 3+** : le quitteur est éliminé, la partie continue (le lobby ne marque « finished » que si décisif).
- **Civs des bots** : tirage seedé SANS REMISE (civs distinctes tant que 16 ≥ N).
- **1v1** : miroir + cartes préfabriquées INCHANGÉS (D3) — les créations multi-sièges sur carte préfabriquée sont refusées avec message ; `generateProceduralMap(seed, {playerCount: 2})` sort les cartes miroir à l'octet près (test).

## 5. e2e et captures

- **e2e `apps/server/src/carte-multi-e2e.mjs`** (wrangler dev :8787) — **PASSANT** : création solo 5 sièges (retry sur seeds dont les 5 spawns partagent une masse terrestre — conquête terrestre des scripts), Alice fonde sa capitale (démarrage Colon), produit/rush-buy dans toutes ses villes, sièges R-57. **Résultat du run final : p2 éliminé tour 14 (par p1), 3 éliminations intermédiaires — la partie a CONTINUÉ à N — VICTOIRE p1 par DOMINATION au tour 206, méta `domination`.** Journal complet : `dev-logs/carte-multi-e2e.log`. *Nota* : l'e2e est TERRESTRE — les seeds où les spawns sont sur des îles séparées sont écartés (le naval reste jouable en vrai, non scripté).
- **Captures `dev-logs/captures-carte-multi/`** (driver `driver-captures-carte-multi.mjs`) : 3 seeds 5P au labo (vue entière + panneau d'équité + zoom voisinage/camp barbare), vue 1v1 de référence (A/B), partie réelle 5 sièges depuis le lobby (bandeau « Adversaires : Bot : Russie · Bot : Mongolie · … »), journal après 2 tours, cohabitation multi-nations (`#/labo-rendu`).

## 6. Ce qu'Erik valide en ligne (après feu vert)

1. **Allure générale des cartes libres** (3 seeds au labo `#/progen`, curseur « Sièges (2-5) ») — spawner lisibles, équidistants ;
2. **Densité des camps barbares** (12 villages + 12 huttes, totaux 1v1 🔶) ;
3. **La vue 1v1 inchangée** ;
4. En jeu : créer une partie « 5 joueurs — carte libre » coché solo → 4 bots aux civs distinctes ; le bandeau, le journal, les éliminations.
   *Nota comptes* : un second humain réel nécessiterait un second login (dev stub `?name=…` en local ; en prod, un second compte Google/Discord) — les autres sièges sont des bots.

## 7. 🔶 De calibrage (réglables dans `progen/settings.ts` + re-cuire labo)

`libreAttempts` (80), `libreCandidatePool` (500), `libreCenterWeight` (2), `libreFertilityWeight` (1), `libreSpreadWeight` (4), `librePairSpreadMax` (8), densités villages/huttes libres (totaux 1v1), tolérance de couverture ressources rares (best-effort), définition du zombie (économie auto des villes d'un éliminé).

## 8. Fichiers touchés (non commités — feu vert attendu)

- **Moteur** : `state.ts` (Player.defeated + migration 26 + `activePlayerIds`/`guerreUniverselle`), `events.ts` (`PlayerDefeated` + cause `attrition`), `fog.ts` (événement public), `map.ts` (2-5, all-pairs, guerre universelle), `turn.ts` (élimination, annihilation événementielle, gardes victoires), `forfeit.ts`, `fixtures.ts` ;
- **Progen** : `settings.ts` (`libreMulti` + 6 champs 🔶), `libre.ts` (NOUVEAU), `mirror.ts` (rapport `multi` + `registerStrategy`), `index.ts` (connexité N spawns, rapport multi) ;
- **Serveur** : `game.ts`, `lobby.ts`, `botPolicy.ts` (FoundCity départ Colon), e2e `carte-multi-e2e.mjs` (NOUVEAU) ;
- **Client** : `Game.svelte`, `Lobby.svelte`, `Progen.svelte`, `labels.ts`, `playback.ts`, `gameClient.ts` ;
- **Tests** : `tests/progen-libre.test.ts` (12), `tests/carte-multi.test.ts` (14), serveur `tests/carte-multi.test.ts` (7) NOUVEAUX ; pins de version 25→26 mis à jour (convention maison).
