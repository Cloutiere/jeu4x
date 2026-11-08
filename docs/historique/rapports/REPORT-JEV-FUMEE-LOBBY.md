# REPORT-JEV-FUMEE-LOBBY — « Partie contre Jev » : la plomberie réelle

**Décisions Erik 28/10 (HANDOFF-JEV-FUMEE-LOBBY).** Jev v3 FIGÉ (zéro calibrage, D6) porté au serveur ; le GameDO l'appelle à chaque tour de Jev ; Erik joue une vraie partie contre lui depuis le lobby et l'observe en god mode. `schemaVersion` 28 inchangée (tout en méta/storage DO, hors état moteur).

## Ce qui est livré

### D1 — sélecteur d'adversaire au lobby
- `apps/web/src/pages/Lobby.svelte` : sélecteur « Adversaire : **Bot standard / Jev 🤖** » à côté de la difficulté (défaut Bot). Champ méta `adversaireJev` dans `GameCreationSettings` (packages/shared) — aucune migration.
- `apps/server/src/lobby.ts` : le champ traverse `handleCreateConfig` ; au **StartGame**, le PREMIER bot rempli devient Jev (`join` avec `jev: true`, nom **« Jev 🤖 »** — le badge du bandeau est le nom, diffusé partout par le mécanisme existant).
- Le chemin solo historique (case `solo` du vieux flux, hors UI) est inchangé.

### D2 — pipeline décisionnel porté au serveur
- `apps/server/src/jev/` : `condense.ts` + `joueur.ts` (port mécanique de `sableuse/src/condense.mjs` + `joueur.mjs`, v3 figée), `questions-joueur.json` (copie à l'identique du harnais — testée bit à bit), `orchestre.ts` (miroir du mode « Jev JOUEUR » de `partie.mjs`), `etat.ts` (budget/replis/memo), `client.ts` (SDK `@typesafe-ai/sdk` — 100 % fetch, compatible Workers ; `defaultModel` jev-latest, timeout 20 s, 1 retry).
- **Tests croisés** (D2, `apps/server/tests-jev/jev-port.test.ts`, config Node dédiée `vitest.jev.config.ts`) : mêmes états filtrés ⇒ mêmes condensés, questions, décisions (ordres/actions/diplomatie/memo) harnais ⇄ serveur, y compris fondation programmée (MultiStep), réponses indécises (repli de conversion) et erreur API. **18/18 verts**.
- Memo inter-tours persisté en storage DO (`jevEtat`, ensembles en arrays) : recherche tenue, fondation programmée, liste noire des cases, échanges refusés, « capitale post-colon ».

### D3 — clé et budget
- Clé : secret GitHub Actions `TYPESAFE_API_KEY` (posé via API, chiffré libsodium — le PAT d'Erik avait les scopes `repo`/`workflow`) → `deploy.yml` la synchronise en **secret Cloudflare** à chaque déploiement (`wrangler secret put --env prod`, idempotent). Rien dans le dépôt ; `.dev.vars` local (gitignoré) pour `wrangler dev`.
- Compteur **0,25 $/partie** (`PLAFOND_BUDGET_USD`), hors état moteur (`storage 'jevEtat'`) ; formule de coût du harnais (jetons d'entrée × 0,042 $/M — consignée 🔶 : le coût de sortie n'est pas compté, même approximation que les bancs). Au plafond : Jev devient bot pur pour le reste de la partie.
- **Journal de partie** : une entrée par tour sous `jevjournal:<tour>` (condensé + questions + réponses + décisions + latence + budget) — le corpus de l'itération 4. Route admin `GET /admin/game/:code/jev[?tour=N]` (ADMIN_TOKEN) ; résumé `jev` dans le dump admin.

### D4 — repli permanent
- Clé absente / Jev désactivé / rien de décidable / erreur ou **timeout API (20 s)** → ce tour joue le bot standard (plan vide, aucun appel).
- **3 échecs consécutifs** → Jev désactivé pour la partie (`desactive: 'echecs'`), consigné dans le dump admin ; un succès ultérieur ne réactive PAS.
- **Éprouvé localement** : wrangler lancé avec une clé volontairement fausse, 4 tours joués — échecs 1→2→3, désactivation au tour 3, tour 4 résolu en bot pur, aucune partie bloquée.

### D5 — god mode
Rien à coder : Jev est un bot (`aAutreHumain` ne le compte pas), ses décisions passent par les formes canon (SetProduction/SetResearch/SetConversion, DeclareWar/ProposePeace/TradeTechs, ordres FoundCity/MultiStep) — toutes visibles en god mode et racontées par les Chroniques. Vérifié en fumée (ToggleGodMode envoyé, snapshot révélé).

## Sémantique du tour Jev dans le GameDO (miroir du harnais)
1. Plan bot standard pour tous les bots (tactique — inchangé) ;
2. Décision LLM de Jev sur l'état **filtré fog**, avant application des actions ;
3. Les déclarations `DeclareWar` du bot du siège Jev (et des autres bots si `bloqueGuerreBot`) sont retirées — Jev a le dernier mot sur la guerre ;
4. Les ordres bot touchant le colon d'une fondation programmée sont retirés (discipline v3) ;
5. Actions immédiates de Jev APRÈS celles du bot (recherche tenue, conversion) ;
6. Diplomatie argumentée appliquée sur l'état complet, réponse de la cible seedée canon T2 (tirage `negoc-*`, une itération) ; refus d'échange mémorisé ;
7. Post-résolution idempotente : fondation rejetée → case en liste noire ; fondation réussie → programmation consommée ; colon produit → règle « capitale post-colon ». Les attentes voyagent dans le motif de résolution (`resolving.jevAttentes`) — un crash pendant la résolution rejoue à l'identique sans rappeler le LLM.

## Fumée (L4)
Locale (wrangler dev, clé `.dev.vars`, script `devtmp/jev-fumee.mjs`) :
- Partie réelle 5 sièges (4 bots, premier = Jev « Jev 🤖 »), 3 tours joués : 3 appels LLM, budget **0,0003 $**, journal 3 tours, recherche tenue (« poterie »), **tour 0 : Jev choisit « fonder » → ordre FoundCity émis** (124 ms, 2 203 jetons — latence absorbée par la résolution, invisible côté client).
- Route `/admin/game/:code/jev?tour=0` : entrée complète vérifiée (condensé + questions fonder/rechercher/guerre + ordre).
- Repli : clé fausse → 3 échecs → `desactive: 'echecs'`, la partie continue (4 tours joués).
Prod : déployée par push (CI Deploy) ; la première partie fumée d'Erik reste à jouer (1 tour suffit à la plomberie, une partie complète au verdict).

## Déploiement prod (L4)
- Commits 68cc82c → 56eacd9 → f766e88 ; **Deploy vert** sur f766e88 (les deux premiers runs ont échoué en CI — incidents ci-dessous, corrigés).
- Vérification prod : accueil HTTP 200 sur game-4x-server-prod.erik-ai-studio.workers.dev ; bundle assets/index-DuKk-Q4Z.js contient « Jev 🤖 » et adversaireJev (sélecteur du lobby servi).
- La partie fumée d'Erik reste à jouer en prod (critère 1 du handoff — remise de la main).

## Incidents CI (corrigés, consignés)
1. **carte-multi rouge** (68cc82c) : ma première restructuration appliquait les actions bot en DEUX passes (tous les plans d'abord, puis toutes les actions) — l'ordre canon BOT-SOLO est ENTRELACÉ (plan généré puis actions appliquées avant le bot suivant) ; les plans des bots suivants dépendaient de l'état post-actions des précédents (p5 sans recherche). Corrigé 56eacd9 : entrelacement rétabli, décision Jev en pré-passe sur l'état pré-actions (canon harnais).
2. **tests-jev rouges en CI** : le harnais sableuse est HORS workspace — ses node_modules ne sont pas installés en CI et @game/rules n'était pas résoluble depuis sableuse/src/*.mjs (la remontée ne passe que localement). Corrigé f766e88 : alias Vite @game/rules → packages/rules/src/index.ts dans vitest.jev.config.ts.

## Addendum session (28-29/10) — la fumée d'Erik et ses trois corrections

La partie fumée réelle d'Erik (les deux configurations) a révélé trois problèmes, tous corrigés et déployés :

1. **JEV-REPERAGE (30e2b48, Deploy vert)** : Erik ne savait pas quelle couleur portait Jev. Le bandeau « Adversaires » affiche désormais la pastille de couleur de chaque adversaire — exactement celle de ses bannières en carte (`paletteDe` → factions4, miroir du rendu) ; la pastille de nation (à gauche du médaillon) porte un badge 🤖 visible SANS survol pour Jev.
2. **JEV-DUEL-MIROIR (f41779d, Deploy vert)** : le duel 1v1 symétrique revient au lobby (sélecteur « Configuration : Libre 5 sièges / Duel miroir ») et le flux solo historique honore `adversaireJev`. C'est le calibrage de référence du banc v3 (mirror1v1 40×40). Note : le labo #/progen ne crée PAS de parties — il n'existait donc AUCUNE UI pour le 1v1 miroir avant ce fix.
3. **FIX JEV-ORDRES-JETÉS (c64fec4, Deploy vert)** — le bug majeur de l'intégration : les ordres LLM de Jev (SetProduction de la capitale, MultiStep/FoundCity du colon) étaient calculés, journalisés, facturés… puis JAMAIS fusionnés dans le motif. Le bot standard jouait tout son siège — d'où les observations d'Erik : « merveille systématique en début » (= arbitrage BOT-TB du bot) et « guerrier qui oscille sur deux cases » (= assemblage BOT-ARMEE du bot). Fix : fusion sujet-par-sujet canon `fusionnerPlan` du harnais dans startResolution ; tests jev 20 verts (2 nouveaux). **Après fix, vérifié en jeu par Erik : Jev explore et bâtit son colon rapidement.**

### Observations d'Erik consignées → backlog itération 4 (v3 figée, hors périmètre)
- **Guerre au premier contact** : la cible « voisin le plus faible » est calculée sur les forces VISIBLES — à zéro contact, le rapport est gonflé (ennemi à 0) et Jev déclare confiant. Levier itération 4 : ne proposer la question « guerre » qu'avec un contact réel (au moins une unité/ville ennemie visible).
- **Huttes ignorées** : `botPolicy` n'a AUCUNE conscience des huttes (vérifié) — le tactique passe à côté sans intention ; les ouvertures ne se font qu'au hasard des poses. Levier : pondérer les huttes connues dans l'exploration du scout (profite à TOUS les bots, pas seulement Jev).
- Comportement post-fix validé par Erik : exploration OK, colon rapide, guerre au contact = comportement v3 attendu (37 guerres/10 parties au banc).

### État de clôture
- Commits de la mission : 68cc82c, 56eacd9, f766e88, 376f2e1, 30e2b48, f41779d, c64fec4 — **Deploy vert sur c64fec4** (dernier commit de code), prod vérifiée par bundle.
- Suites : serveur 332 + jev 20 (config Node dédiée) + web 700 verts ; svelte-check 0 erreurs.
- Itération 4 (fin de partie + calibrages ci-dessus) : HORS périmètre — handoff à rédiger quand Erik décide d'enchaîner ; corpus prêt via `jevjournal:<tour>` (route admin `/admin/game/:code/jev[?tour=N]`).

## Suites
- serveur **331 verts** (pool Workers) + **18 verts** (jev, Node) — `pnpm -C apps/server test` enchaîne les deux configs ;
- web **700 verts**, rules **1101 verts**, `pnpm build` + `pnpm typecheck` 4/4.

## Incidents & pièges (consignés)
- **wrangler dev zombie** : une instance lancée AVANT l'ajout de la clé dans `.dev.vars` garde un env DO sans le secret — le DO voyait `TYPESAFE_API_KEY` absent, Jev jouait bot silencieusement (le dump admin `jev` l'a montré : `client=null`). Toujours relancer wrangler après avoir édité `.dev.vars` (piège connu des missions précédentes, retrouvé).
- `console.log` du worker n'arrive pas dans un `wrangler dev | tee` sous ce shell — diagnostic fait via le dump admin.
- `TypeSafeClient` : la clé se passe par `apiKey` (pas d'env var partagée DO/Workers) et le modèle par `defaultModel` ; timeout/retry configurables au constructeur.

## 🔶 à l'œil Erik / résidus assumés
1. **Diplomatie Jev → humain** : la réponse du JOUEUR à une paix/échange proposée par Jev est simulée par le même décideur déterministe que les bots (précédent BOT-TC « la décision s'applique aux DEUX sens »). Erik n'a jamais le choix d'accepter/refuser une offre de Jev — à cadrer si ça gêne en partie réelle.
2. **Coût de budget** : compté sur les jetons d'entrée seuls (formule harnais) ; la sortie (~réponses courtes) est négligeable mais non comptée.
3. **Une seule civ de Jev** : le lobby tire la civ normalement (Jev a ici « égypte »/« angleterre »/« japon » selon les fumées — pas d'interdiction posée).
4. Le plafond 0,25 $ n'a pas été atteint en fumée (0,0003 $/3 tours ≈ 0,01 $/150 tours — marge ×25 observée, cohérente avec l'estimation du handoff).
5. La paire `warsDepuis`/`batailles` du condensé diplomatie vit dans l'état moteur (diplomatie T2) — vérifiée présente au fil des tours de fumée via les Chroniques 🔶 (non capturée e2e).

## Fichiers
- `apps/server/src/jev/` (6 fichiers), `apps/server/src/{game,lobby,env,index}.ts`, `apps/server/tsconfig.json` (`resolveJsonModule`), `vitest.{config,jev}.ts`, `package.json` (+ `@typesafe-ai/sdk`), `tests-jev/` ;
- `packages/shared/src/index.ts` (`adversaireJev`, `jev` sur les joueurs résumés) ; `apps/web/src/pages/Lobby.svelte` (sélecteur) ;
- `.github/workflows/deploy.yml` (synchronisation du secret) ; `devtmp/jev-fumee.mjs` (fumée re-jouable : `node devtmp/jev-fumee.mjs [port] [tours] [1|0]`).
