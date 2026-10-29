# HANDOFF-JEV-FUMEE-LOBBY — « Partie contre Jev » : la plomberie réelle, testée par une vraie partie

**Décisions Erik 28/10.** Fumée = test minimal de bout en bout : le GameDO appelle le LLM à chaque tour de Jev, Erik joue UNE vraie partie contre lui — et l'observe en **god mode**. V3 figée (aucun calibrage), itération 4 (fin de partie) reste au banc.

## 1. Préalables

- Lire le harnais v3 (`sableuse/src/joueur.mjs`, `condense.mjs`, `questions-joueur.json` — la décision JEV V3 FIGÉE à porter telle quelle), DIPLOMATIE-T2 (interfaces), GOD-MODE (solo/bots — Jev est un bot, la porte reste ouverte), le lobby (case solo + difficulté — miroir méta), la résolution du GameDO (`game.ts` — handlers immédiats, motif de partie), les pièges harnais consignés (v3 : FoundCity direct après MultiStep, colon re-émis, BFS pasVersRoutier).
- Baseline : suites vertes, `schemaVersion` 28 — la difficulté/adversaire vivent en **méta** (aucune migration). Vérifier `git status`.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — L'option lobby** : dans la case solo, un sélecteur d'adversaire : **Bot standard / Jev** (défaut Bot, stocké en méta, affiché au bandeau « Jev 🤖 »). Visible de tous (le seul compte réel est celui d'Erik) ; Jev n'est PAS une difficulté — c'est un ADVERSAIRE distinct.
- **D2 — Le pipeline décisionnel porté au serveur** : le condensé v3 + les questions v3 + la traduction en ordres (du mjs sableuse vers un module TS du serveur — mêmes formats, mêmes portes, **comportement identique prouvé par tests croisés** : mêmes condensés ⇒ mêmes décisions sur fixtures). L'appel LLM : le SDK du harnais si compatible Workers, sinon un appel `fetch` direct équivalent — au choix de l'agent, consigné.
- **D3 — Clé et budget** : clé API en **secret Cloudflare** (`wrangler secret put`, jamais dans le git ; `.dev.vars` pour le local) ; **compteur de budget par partie** persisté côté GameDO (hors état moteur), plafond **0,25 $/partie** (marge ×10 sur le réel 0,017) — au plafond : Jev devient bot pur pour le reste de la partie (consigné dans le journal + Chronique neutre si observé).
- **D4 — Repli permanent** : erreur/timeout API → ce tour joue le bot standard ; **3 échecs consécutifs** → Jev désactivé pour le reste de la partie (bot pur, consigné). Aucune partie jamais bloquée ; la latence d'appel (≈ centaines de ms) est absorbée par la résolution existante — mesurée au rapport.
- **D5 — Observation god mode** : rien de nouveau à coder si tout passe par les ordres canon — la guerre déclarée par Jev, ses armées, ses fondations sont visibles en god mode et racontées par les Chroniques (les décisions NOTABLES de Jev — déclaration, paix, échange — sont déjà des événements ; vérifier qu'aucun n'est filtré à tort).
- **D6 — Zéro calibrage** : questions v3 figées ; `schemaVersion` 28 ; le bot standard et les autres modes inchangés.

## 3. Mission

- **L1 — port test-first (serveur)** : condensé/questions/traduction en TS avec FAUSSE LLM (tests croisés sableuse↔serveur sur fixtures : mêmes décisions) ; compteur budget ; replis D4.
- **L2 — GameDO** : adversaire Jev en méta, appel au tour de Jev, budget, replis, journal de partie (condensé + réponse + décisions — réutilisable pour l'itération 4).
- **L3 — lobby + affichage** : sélecteur D1, badge Jev, vérification god mode.
- **L4 — fumée locale puis prod** : wrangler dev avec la clé locale — l'agent scripte une partie courte contre Jev (vérifier plomberie + budget + repli en coupant la clé en cours de route) ; puis **deploy** ; Erik joue LA partie fumée (1 tour suffit à la plomberie, une partie complète au verdict).
- **L5** : rapport `REPORT-JEV-FUMEE-LOBBY.md` (latence mesurée, budget réel, incidents, 🔶), commit (jamais de clés), arrêt, remise de la main.

## 4. Critères d'acceptation

1. Erik joue une vraie partie contre Jev depuis le lobby, en prod ;
2. En god mode, il VOIT Jev agir (guerres, armées, fondations) ;
3. Repli éprouvé (clé coupée → bot, partie continue) ; budget plafonné ;
4. Suites vertes, `schemaVersion` 28, zéro secret dans le dépôt.

## 5. Périmètre interdit

Tout calibrage de Jev (v3 figée), l'itération 4 (banc), le chat, les échanges humain↔humain pendus, T3, `schemaVersion`.

## 6. Fin de session

Rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik ni des secrets.
