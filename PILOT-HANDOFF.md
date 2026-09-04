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
| Docs de recherche d'Erik | `CivRevTechTree_Official.pdf`, `Civilization Révolution Technologies et Déblocages.md`, `Culture dans Civilization Revolution.md`, `Gouvernements Civilization Revolution.md`, `Moteur Ville Civilization Revolution.md`, `Civilization Revolution _ Merveilles et Personnages.md` (GP Consume/Settle + catalogue merveilles + artefacts), `RECHERCHE-RESSOURCES.md`/`PROPOSITION-RESSOURCES.md` — **ses recherches sont des specs** : les lire intégralement, en extraire les valeurs exactes, elles font foi en cas d'écart |

**Piège de lecture** : le doc « Technologies et Déblocages » colle les numéros de citation aux chiffres (« 105 » = 10 [5], « 45 15 15 » = 4/1/1) — croiser avec CivFanatics.

## 3. Le workflow de pilotage (ce que tu fais, comment)

### Cadrage
Erik exprime souvent ses idées en vrac ou en documents de recherche. Ton travail : les affiner, **découper en tranches implémentables** (jamais un chantier interdépendant en une phase — la culture a pris 7f/7g/7h/7i), proposer des **défauts avec veto possible** (il répond « validé » ou corrige), et préparer les **hooks d'avenir** (ex. `navalAccess` avant le naval, `StartPlacementStrategy` avant le multi-joueurs, `era` avant les populations par ère).

### Écriture d'un handoff (structure standard)
1. **Préalables** : lecture des docs normatifs, baseline (tests + typecheck verts, ~659 actuellement), `schemaVersion` courant (**15**), leçons récentes ;
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

**Victoires implémentées** : domination, culture, scientifique. **Restantes** : économique (Banque mondiale, 20 000 or — 7l), ICBM (7m).

**File d'attente** (replanifiée le 03/09 — Erik a fourni « Civilization Revolution _ Merveilles et Personnages.md », nouvelle orientation) :
1. **7j — Personnages Illustres : classes canoniques, Consume/Settle** — ✅ **complétée le 04/09** (REPORT-PHASE7J.md, commit `8eb8d83`, CI success, prod saine) : fusion Artiste/Penseur (R-114 rév.), 6 classes canoniques dont le Grand Humanitaire nouveau (canal croissance `gpAccumFood`), ordre `GreatPersonAction` Consume/Settle (R-126, `orderShapeError` validé en premier), jalon à l'obtention, `city.settledGreatPersons` (seuls les installés émettent/volables, R-119 rév.), Premier découvrir GP (Invention→Bâtisseur, Monarchie→Leader), ciblage technologique déterministe (R-127, `figures.json`), **migration 12→13**. **580 tests verts**. Bug réel trouvé en vivo : sprites des classes renommées → crash du ticker de rendu (corrigé, alias silhouettes 🔶 art dédiée en 7k). **Reste à vérifier en ligne avec le login d'Erik** : le dialogue Consume/Settle au clic sur un GP (non rejouable en automatisation — canvas), les boutons grisés « reporté », les chips GP installés. 🔶 à calibrer : seuil Humanitaire (réutilise T-30), jalon à l'obtention pour toutes classes, multiplicateurs Settle additifs, Leader « +3 XP » = vétérans.
2. **7k — Merveilles restantes & règles canoniques** — ✅ **complétée le 04/09** (REPORT-PHASE7K.md, commit `f83ba9f`, CI success, prod saine) : Bloc 0 C1–C3 (vetoes Erik), obsolescence **globale** (R-128, union `allKnownTechs`), exclusivité mondiale (R-129, tie-break cityId R-81 🔶), récupération des marteaux (R-130, `pendingSalvage` + fenêtre T-32 = 1 tour 🔶), merveille = jalon (R-131), 11 effets restants (R-132 : Grande Bibliothèque inerte en 1v1, Théâtre, Oxford seedé, Cie des Indes, Léonard, Troyes/Internet MAX, Complexe −20 %, Apollo tout l'arbre, Hollywood inactif, **Grande Muraille valide : bloque les attaques adverses**), Magna Carta corrigée (+1 culture **par citoyen**), **migration 13→14**, art dédiée GP (10 PNG). **613 tests verts**. **Reste à vérifier en ligne par Erik** : sélection ville/GP sur la carte, menu de production des merveilles (tooltips exclusivité/obsolète), signal « marteaux récupérables », Settle désactivé C3, sprites GP dédiés. **Décision Erik en attente** : ~~coût ONU~~ **TRANCHÉ le 04/09 — ONU = 500 marteaux (valeur du doc ; appliquer T-28/`nations_unies.cost` 300→500 dans la prochaine session agent, Bloc « corrections »)**. Banque mondiale = 500 marteaux (doc, à implémenter en 7l). Coûts du vaisseau spatial vérifiés conformes au canon (80/120/200/400). 🔶 calibrage 7k : fenêtre de récupération et plafond de conservation, tie-break, pool Oxford, « océanique » = ocean seul, cumul Troyes/Internet MAX, Apollo = 46 événements TechResearched ;
3. **7l — Or & trésorerie** — ✅ **complétée le 05/09** (REPORT-PHASE7L.md, commits `abd2ec1`/`f21961f`, CI success, prod saine) : Bloc 0 C4–C12 appliqué (croissance 10×n, table culture 150+, GP une instance/classe, réserve permanente C7 avec choix forcé, tie-break surplus C8, Cie des Indes côte incluse, Troyes×Internet ×4, ONU 500), trésorerie R-134 (zéro entretien, surplus de recherche → or, Gemmes/Or en or direct, barbare +50, sac 0,5 🔶, intérêts 2 % hook 7n), rush-buy R-135 (facteurs d'ère 2/3/5🔶/8, interdits ONU/WM, 1/ville/tour, Complexe −20 % achat), paliers R-136 (ladder data-driven 100→20 000), Banque mondiale R-137 = **victoire économique** (or non débité, condition dynamique), Explorateur consume or activé, migration 14→15 (report `gold`→`treasury`). **659 tests verts**. **Reste à vérifier en ligne par Erik** (liste §4 du rapport) : barre trésorerie/GPT/palier, bouton d'achat, dialogue de récupération, Consume Explorateur, Banque mondiale à 20 000, migration sur partie reprise, rendements Gemmes/Or. 🔶 à calibrer : facteur Industrielle ×5, sac de ville 0,5, classe des GP du canal or (R-127), caravane reportée ;
4. **7m — Fin de partie militaire & espionnage** : ICBM/SDI (données déjà présentes : `units.json` icbm, `buildings.json` sdi, Projet Manhattan), contre-espionnage ;
5. **7n — Civilisations & traits** (reporté, clés préparées 7i) : nécessite un **doc de recherche d'Erik sur les civilisations** (16 civs — bonus de départ + bonus par passage d'ère) ;
6. **Phase 8** — polish, équilibrage, esthétique ;
7. **Chantier visuel 3D** — deux voies documentées (2.5D isométrique via generate.py = quick win ; vraie 3D Three.js = phase dédiée, avec spike préalable) ;
8. **En suspens d'Erik à cadrer** : territoire/frontières (prérequis du flip culturel Artiste consume et d'Hollywood), sauts technologiques ;
9. **Calibrage — statut après les décisions d'Erik des 04-05/09** : ✅ **tranchés** — courbe de croissance = **10 × n linéaire** (canon, remplace 5×1,25^(n−2)) ; déficit alimentaire = pas de famine (validé) ; seuil GP culture = **table canon** (150, +33,33 croissant — remplace 20 ×2) ; un seul GP par type et par ville (pas d'effet cumulé) ; fenêtre de récupération = **réserve permanente** avec choix forcé ; tie-break = surplus de marteaux ; Cie des Indes = eau incluant côte ; Troyes/Internet = ×4 ; ONU = 500 ; Apollo = 46 entrées conservées ; rythme GP T-30/T-31 inchangés (aucune source contraire). **Encore en attente d'Erik** : commerce du centre-ville par tranche (0 sous pop 7) 🔶.
10. **Vetoes d'Erik du 04/09 (post-7j) — à corriger en tête du handoff 7k (Bloc 0)** : ① Grand Humanitaire produit par le **canal culture** comme les autres (canal nourriture `gpAccumFood` supprimé) ; ② **seuls les GP issus du canal culture** comptent comme Jalons culturels (les merveilles comptent toujours — écart volontaire avec la ligne générale du doc, révision datée) ; ③ **un seul GP d'un même type installé par ville** ; ④ Grande Muraille **validée** : l'adversaire ne peut pas attaquer tes unités ni tes villes tant qu'elle est debout.
11. **Rapports de recherche d'Erik en attente** : **XP & promotions d'unité** (le « +3 XP » du Leader est interprété « vétérans » faute de modèle — un vrai système XP/promotions demandera son doc) ; **territoire/frontières & conversion culturelle** (débloque le flip culturel Artiste/Hollywood). *Doc « Guide Civilisations » reçu et committé (prérequis 7n).*

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

1. **7l est livrée et vérifiée le 05/09** (659 tests, prod saine, `f21961f`) — reste la vérification en ligne par Erik (liste §4 du rapport). **Quatre victoires désormais implémentées** : domination, culture, scientifique, économique.
2. Recueillir ses votes de calibrage (§4 : 🔶 7l — facteur Industrielle ×5, sac de ville 0,5, classe des GP du canal or ; 🔶 7i restant — commerce du centre-ville par tranche) et les consigner.
3. **Préparer le handoff 7m — Fin de partie militaire & espionnage** : ICBM/SDI (données présentes : Projet Manhattan donne l'ICBM, SDI protège), contre-espionnage, vol d'or par espion (le fog filtre déjà la trésorerie — hook prêt). Votre call : « détruit la ville » vs « réduit la population » pour l'ICBM, à cadrer avec Erik si le doc ne couvre pas.
4. Puis **7n — Civilisations & traits** (doc « Guide Civilisations » d'Erik committé — 16 civs, bonus de départ + par ère, hooks économiques prêts : intérêts 2 %, rush ×0,5), phase **Artefacts** (Angkor Wat, Arche d'Alliance, École de Confucius, Atlantide — couplée à la génération procédurale), puis Phase 8.
