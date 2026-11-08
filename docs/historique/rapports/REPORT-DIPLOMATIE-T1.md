# REPORT-DIPLOMATIE-T1 — L'état de guerre : Paix / Guerre entre nations

**Livré le 21/10/2026.** Fondation de la diplomatie (décisions Erik 19/10, HANDOFF-DIPLOMATIE-T1) : état **PUBLIC Paix/Guerre par paire**, attaquer exige la Guerre (refus nommés), action immédiate **DeclareWar** publique et mutuelle, bots passifs (T1), espionnage et caravane intacts. T2 (négociation) et T3 (ONU/Grande Muraille paix) hors périmètre.

## 1. Moteur (packages/rules)

- **`diplomatie.ts` (nouveau module pur)** : `applyDeclareWar(state, playerId, target)` — même contrat que `applySetGovernment` (état cloné, `{ ok, state, events } | { ok, false, reason }`) ; valide nation connue/en lice/non soi-même/pas déjà en guerre ; paire triée ajoutée à `diplomacy.war` ; événement `WarDeclared`. `paireGuerre(a,b)` helper.
- **Paix par défaut** : `map.ts` — `createInitialState` pose `diplomacy: { war: [] }` (abrogation de la guerre universelle R-58 ; `guerreUniverselle` supprimée). Les **fixtures de test gardent la guerre universelle par défaut** (zéro casse des ~50 fichiers de tests existants ; les scénarios de paix passent `warPairs: []`).
- **Migration v27 → v28** (`state.ts`, `CURRENT_SCHEMA_VERSION = 28`) : `war` **vidé au chargement** — reprise d'anciennes parties = Paix partout (critère d'acceptation #3). **Migration justifiée** (le handoff demande de justifier si migration quand même) : le champ `diplomacy.war` EXISTAIT et portait la guerre universelle — « défaut absent = Paix » ne suffit pas, la lecture seule aurait repris en guerre permanente ; un bump additif (vide) sans transformation d'aucun autre champ.
- **Gate D2 — attaquer exige la Guerre** (mêlée et distance par le même chemin) :
  - ordre `Attack` explicite (`turn.ts` Phase A) : le fizzle silencieux R-58-a devient un **refus nommé** `AttackRefused { player, unitId, target, reason: 'paix' }` + trace `attaque-refusee` — aucun PM consommé, aucun combat ;
  - **entrée ennemie en mouvement** : l'unité s'arrête DEVANT (chemin gelé, zéro PM), refus nommé ;
  - **entrée dans une ville étrangère** (vide ou défendue) : refus nommé, arrêt devant ; exceptions espion (infiltration R-143) et caravane (livraison, branchée plus haut) ;
  - **capture de ville** (`processCityCaptures`) : ceinture de sécurité — skip si `!areAtWar` (les barbares exclus, R-95 intact) ;
  - **ICBM** (`applyLaunches`) : refus `NukeLaunched.outcome: 'refused', reason: 'paix'` (union de `reason` étendue), missile **conservé**, si AUCUNE victime potentielle (ville ciblée + unités du rayon 1) n'est en guerre avec le lanceur. Cible mixte 🔶 : la frappe passe (consigné).
  - **défense territoriale D2 🔶** : inchangée — un pacifique qui marche sur une case occupée est capturé (`capturePeaceful`, détention en Paix). La gate ne concerne que les marcheurs MILITAIRES.
- **Exceptions intactes (D5)** : espionnage (aucun check de guerre dans `espionnage.ts` — prouvé en test : vol de GP réussi en Paix, `areAtWar` toujours false) ; caravane (livraison en Paix ET en guerre — prouvé en test) ; mêlée Phase E et soutien naval R-118 : jamais atteignables en Paix par mouvement (l'entrée étant refusée, la cohabitation transfrontalière ne se produit plus 🔶 consigné).
- **Événements** (`events.ts`) : `WarDeclared { from, on }` et `AttackRefused` + cas `eventRefs` ; `fog.ts` : `WarDeclared` ajouté à `PUBLIC_EVENTS` (exportée) — guerre = annonce, fog standard pour `AttackRefused` (touche son joueur).

## 2. Serveur (apps/server)

- `orderShapeError` : cas `DeclareWar` (forme `player: string` validée EN PREMIER, leçon 7f) ;
- `handleDeclareWar` : même contrat que `handleSetGovernment` (phase orders requise, moteur pur, `lastEventSeq+1`, persist, OrderAck « guerre déclarée », broadcast snapshot) ;
- message `DeclareWar { player }` ajouté à l'union `ClientToServerMessage` (packages/shared) ;
- **bots D4** : `BotAction` ne porte pas `DeclareWar` (prouvé par test sur plans générés) ; leurs attaques passent par la même gate.

## 3. Client (apps/web)

- `gameClient.declareWar(playerId)` ;
- **pastille de nation** (Game.svelte) : ligne d'état au survol (« ⚔ En guerre » / « 🕊 Paix »), **badge ⚔** (coin du cadre) en guerre, **bouton ⚔ « Déclarer la guerre »** sinon (jamais sur une nation éliminée) ;
- **modale de confirmation** (« La guerre est publique et mutuelle — vos attaques comme les siennes seront débloquées ; l'espionnage et les caravanes ne sont pas concernés ») → `DeclareWar` ;
- **Chroniques** (`chronique.ts`) : `WarDeclared` (annonce monde — des trois points de vue), `AttackRefused` (catégorie menaces, son joueur) ; `labels.ts` + durées/priorités playback.
- svelte-check : **0 erreur**.

## 4. Tests (L1 — écrits d'abord)

- **`packages/rules/tests/diplomatie-t1.test.ts` (14)** : gate Attack (refus nommé, zéro PM/zéro combat), entrée refusée, tir à distance, capture de ville refusée, **exception défense territoriale** (colon marcheur détenu), ICBM refusée (missile conservé), `DeclareWar` (paire, `WarDeclared`, mutualité des deux sens, refus soi-même/inconnue/déjà en guerre), `WarDeclared` public, espionnage libre en Paix, caravane en Paix et en guerre, **migration v27→v28** (Paix partout), nouvelles parties en Paix.
- **`apps/server/tests/diplomatie-t1.test.ts` (2)** : forme `orderShapeError` ; aucun plan de bot ne porte `DeclareWar`.
- **Révisions sémantiques** (abrogation R-58-b / R-43-marcheur) : `turn.test.ts` (entrée en paix = refus nommé, plus d'incident/cohabitation ; capturer un pacifique exige la guerre), `caravane.test.ts` (idem), `map.test.ts` (Paix par défaut) + **pins de version 27 → 28** (19 fichiers de tests rules, 1 server) — mécanique, aucune sémantique.
- **Suites** : rules **1101/1101**, server **125/125**, web **691/691**, tsc rules+server **0**, svelte-check **0**.

## 5. Captures GUI (L4 — `dev-logs/captures-diplomatie-t1/`, script `devtmp/diplomatie-t1-gui.mjs`)

Solo 1v1 pangee-40 réel (wrangler local) : **A** pastilles en Paix (bouton ⚔, zéro badge) ; **B** attaque refusée en Paix (Move sur la case ville ennemie → `AttackRefused`, arrêt devant, zéro combat) ; **C** modale « publique et mutuelle » ; **D** badge ⚔ après déclaration (paire `[["p1","p2"]]` vérifiée au dump) ; **E** en guerre : combat/capture résolus (CombatExchange **ou** CityCaptured — obtenu ✓).

## 6. 🔶 Consignés (à l'œil / périmètre)

1. **D2 défense territoriale** : tranché par défaut (marcheur pacifique capturé-détenu sur ta case) — à valider à l'œil en jeu réel.
2. **D4 ripostes du bot** : couvertes par la gate existante (défense = jamais gate) — mêlée de riposte à l'œil.
3. **ICBM cible mixte** (nation en guerre + nation en Paix dans le rayon) : la frappe passe — canon muet sur les collatéraux.
4. **Caravane livrée en guerre en GUI** : non jouée en e2e (tech Monnaie + production — déjà non obtenu dans la mission CARAVANE) ; prouvé en unitaires (diplomatie-t1.test.ts + caravane.test.ts).
5. **Refus d'attaque en Paix** : la cible mobile (garnison patrouilleuse) peut quitter sa case pendant la Phase A — fizzle silencieux préexistant (pas d'ennemi présent à la résolution) ; l'e2e utilise la case ville, déterministe.
6. **Pièges e2e consignés** : `EndTurn` est REJETÉ sans production/recherche sélectionnée (blocage t6, pas un gel — SetProduction via **SubmitOrder**, SetResearch à prérequis nuls type `poterie`) ; spawns procéduraux sur **îlots** (marine requise — utiliser `pangee-40`) ; BFS e2e doit être **wrap-canonique** (colonne = q + ⌊r/2⌋ repliée, CARTE-RONDE T1) ; workerd zombies → tout tuer avant run.
7. Mêlée Phase E et soutien naval R-118 **non gate-és directement** : inatteignables en Paix par mouvement (l'entrée est refusée) — si un jour une cohabitation en Paix devient possible (débarquement T2?), gater alors Phase E.

## 7. Fin de session

Règle unique **R-187** (RULES.md §7.7bis), R-58 marquée ABROGÉE, renvoi R-95 mis à jour. Aucun fichier non tracké d'Erik committé. Deploy : CI verte puis prod (vérifier le bundle).
