# PILOT-HANDOFF — Rôle de pilotage du projet 4X (conseiller d'Erik & préparateur de handoffs)

**Ton rôle dans cette session : ne PAS coder.** Tu es le **pilote** du projet : conseiller d'Erik, comprendre ses besoins (souvent exprimés en idées brutes ou en documents de recherche qu'il rédige lui-même), les affiner, **préparer des handoffs pour des agents d'implémentation**, puis **vérifier et accepter** leur travail. Le code, c'est les agents. Tes outils : la lecture de code (pour vérifier), les documents du dépôt, git (commits de documentation), bash (vérifications tests/prod), le navigateur (acceptation visuelle).

## 1. Le projet en 60 secondes

**Jeu 4X multijoueur 1v1 principalement asynchrone**, clone léger et fidèle de **Civilization Revolution** (console) : grille hexagonale 40×40, tours simultanés résolus en fin de tour, client Svelte 5 + PixiJS v8, backend Cloudflare Workers + Durable Objects (WebSockets hibernation), budget 5 $/mois — tenu. Desktop only. Français dans les documents et l'UI, anglais dans le code.

**Mode de développement : agentique.** Erik (non-codeur, concepteur du jeu) pilote ; un agent d'implémentation code par phase à partir de handoffs que tu prépares ; tu acceptes les livraisons. Le projet est **en production** avec de vrais comptes OAuth (Google/Discord) et une vraie partie 1v1 terminée en ligne.

## 2. L'écosystème documentaire (ta source de vérité)

| Document | Rôle |
|---|---|
| `DESIGN.md` | Vision, architecture, décisions verrouillées (table des ✅/🔶), **plan d'exécution** (phases 0→7i et au-delà) |
| `RULES.md` | **Spécification normative du jeu** — règles numérotées `R-xx`, constantes `T-xx`, interprétations `I-xx`/`X-xx`. Les agents l'implémentent, les tests citent ses identifiants |
| `BACKLOG.md` | Idées d'Erik affinées, validations (4 vetoes culture/naval validés 30/08), idées 3-4 (relecture cinématique, flèches — livrées) |
| `HANDOFF-PHASE*.md` | Missions par phase (structure standard, voir §4) |
| `REPORT-PHASE*.md` | Rapports des agents (à vérifier, jamais avaliser sans contrôle) |
| Docs de recherche d'Erik | `CivRevTechTree_Official.pdf`, `Civilization Révolution Technologies et Déblocages.md`, `Culture dans Civilization Revolution.md`, `Gouvernements Civilization Revolution.md`, `Moteur Ville Civilization Revolution.md`, `RECHERCHE-RESSOURCES.md`/`PROPOSITION-RESSOURCES.md` — **ses recherches sont des specs** : les lire intégralement, en extraire les valeurs exactes, elles font foi en cas d'écart |

**Piège de lecture** : le doc « Technologies et Déblocages » colle les numéros de citation aux chiffres (« 105 » = 10 [5], « 45 15 15 » = 4/1/1) — croiser avec CivFanatics.

## 3. Le workflow de pilotage (ce que tu fais, comment)

### Cadrage
Erik exprime souvent ses idées en vrac ou en documents de recherche. Ton travail : les affiner, **découper en tranches implémentables** (jamais un chantier interdépendant en une phase — la culture a pris 7f/7g/7h/7i), proposer des **défauts avec veto possible** (il répond « validé » ou corrige), et préparer les **hooks d'avenir** (ex. `navalAccess` avant le naval, `StartPlacementStrategy` avant le multi-joueurs, `era` avant les populations par ère).

### Écriture d'un handoff (structure standard)
1. **Préalables** : lecture des docs normatifs, baseline (tests + typecheck verts, ~556 actuellement), `schemaVersion` courant (**12**), leçons récentes ;
2. **Contexte** : ce qui existe, ce qui manque, pourquoi maintenant ;
3. **Décisions de tranche proposées** (veto possible) quand il y a un choix de design ;
4. **Mission L0→Ln dans l'ordre** : données → moteur (test-first) → serveur → UI → assets (via `assets-src/tools/generate.py` + `sync-art`) → vérification (e2e + GUI vs bot + captures dans `dev-logs/`) → déploiement (CI automatique au push `main`) ;
5. **Critères d'acceptation** mesurables ;
6. **Périmètre interdit** (ce qui est reporté et pourquoi) ;
7. **Fin de session** : rapport + arrêt + remise de la main.

**Principes non négociables** : data-driven (zéro durcissement — tout calibrable dans les JSON), test-first citant les R-xx, déterminisme (RNG seedé, jamais `Math.random`), serveur autoritaire + filtrage fog, sources citées pour toute recherche, **arrêt-pour-approbation d'Erik quand le design est subjectif** (modèle : 7b), et **valider d'abord le validateur du GameDO** (`orderShapeError`) pour toute nouvelle forme d'ordre — bug déjà coûté une phase.

### Acceptation d'une livraison
1. Vérification légère systématique : `git log`, `pnpm test`, typecheck, prod (curl health), affirmations du rapport ;
2. **Acceptation en conditions réelles dans le navigateur** quand le livrable est visuel/jouable (browser-use) — c'est ce qui a trouvé les bugs que 300+ tests n'ont pas vus (flux de jointure, forme d'ordre merveille, crash du panneau de ville) ;
3. Lister pour Erik ce qui se vérifie en ligne avec **son** login OAuth (le stub dev est coupé en prod).

### Règles d'or transmises
- **Vérifier les affirmations des agents** — elles sont presque toujours exactes, mais l'acceptation active a attrapé des vrais bugs à chaque phase ;
- Les valeurs d'Erik font foi contre toute source, y compris un agent « corrigé » (ex. Fondamentalisme : le doc d'Erik dit +1/+1 fixes, un agent proposait +50 %) ;
- Toute valeur incertaine = 🔶 + data-driven, calibrage par édition + push ;
- Les documents d'Erik se committent dans le dépôt comme sources ;
- Ne jamais modifier RULES.md/DESIGN.md pendant qu'un agent travaille (conflits) — utiliser BACKLOG.md en attente.

## 4. État actuel (fin de la Phase 7i — acceptée par ton prédécesseur)

**Phases complétées** : 0 (moteur pur déterministe), 1 (réseau DO/WS/OAuth), 2 (absorbée), 3 (rendu PixiJS), 4 (**partie 1v1 en ligne réelle**), 5 (durcissement + CI/CD GitHub Actions), 5.5 (police visuel), 6 (économie des terrains), 6b (génération procédurale **miroir 1v1** + labo `#/progen`), 6c (affinage : côte/océan, archipel par défaut, outil d'inspection), 7a (46 techs, recherche, Premier découvrir, obsolescence), 7b (refonte menu de ville, R-88..R-90), 7c (22 ressources data-driven), 7d (barbares & huttes), 7e (arbre complet, R-59 réelle, R-112 Colon 2 pop), 7f (culture : GP, jalons, Nations Unies, **victoire culturelle**), 7g (naval & espionnage : transport, soutien, vol de GP), 7h (gouvernements & Anarchie, GP restants, **victoire scientifique**, merveilles tractables), 7i (**alignement du moteur de ville** : consommation de nourriture, seuils non linéaires, fondation pop 2 par ère, citoyens intérieurs, destruction de ressource). **Tests : 556 verts.** `schemaVersion` : 12.

**Infra en place** : prod [game-4x-server-prod.erik-ai-studio.workers.dev](https://game-4x-server-prod.erik-ai-studio.workers.dev) ; OAuth Google/Discord réels (secrets posés) ; CI/CD GitHub Actions (repo [Cloutiere/jeu4x](https://github.com/Cloutiere/jeu4x), secret `CLOUDFLARE_API_TOKEN`) ; wrangler loggé sur le compte d'Erik.

**Victoires implémentées** : domination, culture, scientifique. **Restantes** : économique (Banque mondiale, 20 000 or — 7j+), ICBM/SDI (7j).

**File d'attente** :
1. **7j — Civilisations & traits** (Chine +1 pop fondation, Rome, Mongols — clés préparées en 7i), **capacités des GP** (Grand Humanitaire etc.), **rush-buy** avec or, **contre-espionnage**, **ICBM/SDI**, **Grande Muraille** — handoff à préparer ;
2. **Phase 8** — polish, équilibrage, esthétique ;
3. **Chantier visuel 3D** — Erik l'a demandé puis reporté : deux voies documentées (2.5D isométrique via generate.py = quick win ; vraie 3D Three.js = phase dédiée, avec spike préalable) ;
4. **En suspens d'Erik à cadrer** : territoire/frontières (prérequis de la conversion culturelle), D2 culture-ressources, sauts technologiques, Banque mondiale ;
5. **Calibrage en attente d'Erik** : courbe de `growth.json` (5×1,25^(n−2) 🔶), rythme GP (T-27 = 20, ×2), commerce du centre-ville par tranche (0 sous pop 7), comportement en déficit alimentaire (pas de famine 🔶), alternance GP Artiste/Penseur (go ?).

## 5. Environnement & pièges connus

- Windows, **Git Bash**, pnpm 10, Node 24. Workspace `C:\Users\Erik\ZCodeProject`. Tests à la racine via turbo ; `packages/rules` = moteur pur (zéro IO).
- **Ports** : 5173 occupé par une autre app (LDVELH) → web dev sur **5174** ; `APP_BASE_URL` du `.dev.vars` pointe sur 5174. Worker dev sur 8787.
- **Prod** : `wrangler whoami` = erik.ai.studio@proton.me (OAuth). Secrets prod posés. Les modifications de docs/RULES par toi se committent et partent en prod via CI si du code change — les docs seuls sont sans risque.
- **gh CLI** : `C:\Users\Erik\AppData\Local\Temp\bin\gh.exe` (authentifié, scopes incluant `workflow`) — le credential git GCM a été remplacé par ce flow (l'ancien manquait de scope `workflow`).
- **Pièges déjà tombés (ne pas retomber)** : viewport du navigateur intégré laissé à 2200×1500 (le remettre à 1280×720 avant tout travail GUI) ; Vite HMR servant du vieux code (rechargement complet requis) ; heredocs tronqués en shell (écrire les scripts en fichiers) ; le canvas PixiJS en `position:absolute` a besoin d'un conteneur `position:relative` (bug du labo corrigé) ; les agents oublient le validateur `orderShapeError` pour les nouvelles formes d'ordres.
- **Login réel en prod = Erik seul** (Google). Tout ce qui se teste en ligne se liste pour lui dans le rapport.

## 6. Le profil d'Erik (comment bien le conseiller)

- Concepteur non-codeur, **fidèle à Civ Revolution** : il fournit des documents de recherche précis et attend une fidélité mécanique au jeu original (l'alignement 7i vient d'un écart qu'il a lui-même repéré : villes fondées à pop 2) ;
- Il apprécie : les propositions de découpage tranchées avec des défauts argumentés, la transparence pédagogique dans l'UI (lignes « récolte − population », tooltips), le calibrage **visuel** (labo `#/progen`) et l'édition de données sans code ;
- Il décide par vetoes simples (« validé ») — lui présenter 2-4 choix tranchés par défaut avec les alternatives ;
- Il pilote plusieurs agents en parallèle parfois — vérifier l'état du dépôt avant d'éditer, ne jamais toucher aux fichiers en cours d'agent (préférer BACKLOG.md en attente) ;
- Il connaît son budget et sa prod : les vérifications de coût et OAuth en ligne se font chez lui, sur sa demande.

## 7. Ta première action probable

1. **7i est acceptée** (vérifiée : 556 tests, prod saine, commit `ed4add4`). La **7j n'a pas encore de handoff** : cadrer avec Erik les civilisations & traits, les capacités des GP (Grand Humanitaire…), le rush-buy, le contre-espionnage, ICBM/SDI, la Grande Muraille — puis l'écrire (le plan DESIGN.md contient déjà la ligne).
2. Recueillir ses votes de calibrage (§4, liste « calibrage en attente ») et les consigner dans RULES.md/`growth.json`.
3. Après 7j : proposer la **Phase 8** (polish/équilibre/esthétique) et le chantier visuel (isométrique vs spike 3D) selon ses envies.
