# HANDOFF-DEPLACEMENT-PLANIFIE — Programmation des déplacements : aperçu, flèches, conflits, multi-étapes

**Priorité d'Erik du 06/09.** Précédent logique du futur chantier RELECTURE-3D (résolution visible) : on commence par rendre la **programmation** lisible, la relecture viendra après.

## 1. Préalables (obligatoires)

1. Lire `RULES.md`, `PROJET.md`, `PILOT-HANDOFF.md` (§3 rituel, §4 file), `HANDOFF.md` (conventions agent) et `docs/historique/rapports/REPORT-CALIBRAGE-CANON.md` (dernier livré).
2. Baseline attendue : **928 tests verts**, typecheck 4/4, `schemaVersion` **18**, CI et prod saines (commit `7f82a11`).
3. Leçons appliquées : **valider d'abord le validateur du GameDO (`orderShapeError`) pour toute nouvelle forme d'ordre** ; test-first citant les R-xx ; déterminisme total (RNG seedé, jamais `Math.random`) ; data-driven (constantées dans les JSON, zéro durcissement) ; serveur autoritaire, filtrage fog.
4. Vérifier `git status` avant de commencer (l'atelier d'Erik peut avoir des fichiers en cours — ne jamais absorber ses retouches).

## 2. Contexte

Aujourd'hui, un joueur programme ses ordres (mouvement, fondation, attaque…) mais **ne voit ni ses ordres posés ni leur effet prévu** : pas de flèches, pas d'aperçu des positions finales, et un ordre par unité (le Colon ne peut PAS bouger d'une case ET fonder dans le même tour — l'un OU l'autre). En résolution simultanée, deux unités peuvent se retrouver en concurrence sur la même case de destination sans règle explicite. Le joueur doit comprendre, AVANT la fin du tour, ce que feront ses troupes.

Ce chantier introduit : l'**aperçu de programmation** (flèches + positions finales prévues, y compris situations « impossibles en apparence »), des **règles de résolution des destinations disputées**, la **limite de pénétration du fog**, et les **ordres multi-étapes** dans un même tour.

## 3. Décisions TRANCHÉES par Erik le 06/09 (ne pas rouvrir)

| # | Décision |
|---|---|
| D1 | **Aperçu optimiste** : chaque ordre est affiché comme s'il réussissait, + **cases disputées surlignées** (destination revendiquée par ≥ 2 unités amies). Pas de prédiction exacte (les ordres ennemis sont inconnus en tours simultanés). |
| D2 | **Conflit amie/amie sur une destination** : la première unité de la nation à avoir été programmée **obtient la case**. La seconde **s'arrête à la dernière case libre avant la destination**, en avançant au maximum de ses PM restants (ex. : 2 PM et une case franchissable avant la destination → elle avance d'une case et s'y arrête). |
| D3 | **Édition** : re-programmer une unité **remplace** son ordre (priorité conservée). Annuler puis re-programmer la remet **en fin de file de priorité**. La priorité = ordre chronologique de première programmation du tour. |
| D4 | **Unité ennemie sur la case de destination** : ce n'est pas un conflit — y entrer **est une attaque**, résolue par le système de combat existant. La pile visuelle ne concerne que les cas amies (et ami+ennemi sur une tuile ciblée). |
| D5 | **Multi-étapes** : un ordre peut enchaîner **déplacement(s) puis UNE action finale** (fondation, attaque, etc.) dans le même tour, dans la limite des PM (ex. Colon : 1 case puis fonder). Hors périmètre : action PUIS re-mouvement. |
| D6 | **Fog — limite de pénétration** : une unité ne peut entrer que sur **UNE seule case inconnue par tour**, quelle que soit sa portée (une unité à 5 PM à 3 cases du fog entre sur la première case inconnue et **s'y arrête**), et seulement si le terrain le permet. S'applique au pathfinding, à la programmation ET à l'aperçu. |

Autres points déjà tranchés à respecter : ordres « impossibles en apparence » acceptés à la programmation (2 unités amies vers la même tuile ; tuile de l'ennemi ciblé) — c'est la résolution qui tranche ; tout ordre posé reste une intention valide même s'il sera partiellement ou totalement annulé à la résolution.

**Règles nouvelles à écrire dans RULES.md** : prendre les prochains identifiants libres (R-158+ , T-xx) : forme d'ordre multi-étapes, priorité de destination (chronologie de programmation), repli sur dernière case libre, limite fog 1 case inconnue/tour. Valeurs calibrables → JSON.

## 4. Mission L0→L6

### L0 — Moteur : forme d'ordre multi-étapes (test-first)
1. **Commencer par `orderShapeError`** (GameDO) : définir et valider la nouvelle forme d'ordre composite AVANT tout le reste (piège coûteux par le passé). Structure proposée (à affiner en implémentant) : liste ordonnée d'étapes `{ déplacements: chemin, actionFinale?: … }`, plafonnée à D5.
2. `packages/rules` : extension des types d'ordres et de la résolution — déplacements successifs dans la limite des PM, action finale exécutée après le(s) mouvement(s) si encore valide.
3. Un ordre multi-étapes qui échoue en cours de route (case devenue invalide, PM épuisés) exécute ce qui peut l'être et s'arrête — jamais de crash ni d'ordre « fantôme ».
4. Tests citant les nouvelles R-xx : Colon 2 PM = bouger 1 + fonder ; PM insuffisants pour l'action finale → action annulée, mouvement conservé ; chemin bloqué en cours d'étapes.

### L1 — Moteur : résolution des destinations disputées (test-first)
1. File de priorité par nation = chronologie de programmation (index d'ordre croissant, déterministe).
2. À la résolution : première unité programmée obtient la case ; la suivante **s'arrête à la dernière case libre avant la destination** en consommant ses PM normalement (D2). Tests : 2 unités même destination ; 3 unités ; repli à 0 case disponible (unité reste sur place) ; repli à mi-chemin avec PM restants.
3. Unité ennemie sur la destination = attaque (D4) — réutiliser le combat existant, aucun nouveau duel. Deux unités de nations DIFFÉRENTES sans attaque déclarée ne peuvent pas viser la même case libre (la case ennemie est une attaque ; une case libre visée par deux nations = premier ordre résolu dans l'ordre de résolution existant — vérifier et tester le comportement actuel, l'aligner si besoin).
4. Ordres ennemis et RNG : la résolution reste seedée et reproductible — les tests verrouillent le déterminisme.

### L2 — Moteur : limite fog (test-first)
1. Pénétration du fog plafonnée à **1 case inconnue par tour** (D6), dans le pathfinding ET la résolution : le chemin s'arrête sur la première case inconnue (si terrain franchissable), le reste du chemin est ignoré.
2. Tests : unité 5 PM à 3 cases du fog ; case inconnue infranchissable (montagne/eau sans navale) → arrêt AVANT le fog ; enchaînement avec action finale après une entrée dans le fog → action annulée (l'étape suivante part d'une case inconnue).

### L3 — Serveur : persistance, migration, filtrage
1. Persistance des ordres composites + index de priorité de programmation dans le motif §3.5.
2. **`schemaVersion` 18 → 19** : migration (anciens ordres simples = composites à une étape), tests de reprise de partie pré-19.
3. Filtrage fog : l'aperçu d'un joueur ne révèle rien au-delà de son visible (pas de fuite d'identité — cf. bug 7o corrigé).
4. Le bot continue d'émettre des ordres à une étape (compatibles composite) — pas d'intelligence multi-étapes pour lui.

### L4 — UI de programmation (2D et 3D)
1. **Flèches de programmation** par unité (chemin prévu, couleur = nation), en 2D comme en 3D.
2. **Fantômes** d'unités aux destinations prévues ; **pile** si plusieurs unités partagent une tuile (badge de comptage, liste au clic).
3. **Cases disputées surlignées** (D1) au fil de la programmation.
4. Édition : re-cliquer/clic droit pour remplacer (D3) ; annulation d'un ordre posé ; infobulle montrant les étapes de l'ordre (ex. « 1. déplacer → 2. fonder ») et ce qui sera exécuté en cas d'échec partiel.
5. Entrée dans le fog : la flèche s'arrête au bord du visible + un pas ; le reste est tu (D6).
6. Transparence pédagogique habituelle (tooltips explicitant la règle de priorité si une case disputée est survolée).

### L5 — Vérification
1. e2e : programmation multi-étapes d'un Colon, conflit amie/amie avec repli, pénétration fog, reprise d'une partie migrée.
2. GUI vs bot sur une vraie partie locale (captures dans `dev-logs/captures-deplacement-planifie/`), y compris en mode 3D (unités 3D branchées ou sprites billboard — ne pas bloquer sur UNITES-3D).

### L6 — Fin de session
Rapport `REPORT-DEPLACEMENT-PLANIFIE.md`, arrêt, remise de la main. Ne pas archiver le handoff ni éditer PROJET.md/PILOT-HANDOFF.md (le pilot s'en charge après vérification).

## 5. Critères d'acceptation (mesurables)

- `orderShapeError` validé pour la forme composite **avant** implémentation du moteur (tracer dans le rapport).
- Tous les tests nouveaux citent les R-xx/T-xx écrits dans RULES.md ; suite complète verte (baseline 928 + nouveaux) ; typecheck 4/4.
- D1→D6 chacune couverte par au moins un test moteur déterministe.
- Migration 18→19 : une partie créée avant le déploiement reprend sans erreur et ses ordres restent valides.
- En jeu : flèches + fantômes + pile + surlignage des disputées visibles en 2D ET 3D ; un Colon peut bouger puis fonder dans le même tour.
- Aucune fuite d'information par le fog dans l'aperçu (test de filtrage).

## 6. Périmètre interdit (reporté et pourquoi)

- **Action puis re-mouvement** dans un même ordre (D5 limite l'enchaînement) — complexité de résolution, sera étendu si le besoin se confirme en jeu.
- **Bot multi-étapes** — le bot reste à ordres simples.
- **RELECTURE-3D** (revoir la résolution animée) — chantier suivant, ne pas anticiper.
- **UNITES-3D, V3 renommage, espionnage avancé** — file inchangée.
- Toute règle de résolution mouvement/attaque non listée ci-dessus : si un cas non prévu émerge, le consigner dans le rapport en 🔶 avec proposition — NE PAS inventer une règle.

## 7. Fin de session

Commit + push quand Erik est satisfait (c'est LUI qui déclenche), CI verte, prod déployée, rapport remis.
