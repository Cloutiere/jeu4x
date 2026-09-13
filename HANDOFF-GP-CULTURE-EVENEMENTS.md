# HANDOFF-GP-CULTURE-EVENEMENTS — Réalignement culture/GP/événements sur le vrai CivRev (ménage inclus)

**Chantier gameplay du chapitre 2D.** Source : constat d'Erik en jeu (13/09) + canon confirmé. Trois concepts à bien séparer — **ne jamais les mélanger** :
1. **Culture par ville** (`city.cultureCumulee`) → élargit l'influence (anneaux R-162, visual-only) ET fait franchir à la ville des **niveaux de culture** ;
2. **Culture de la civilisation** (cumul EMPIRE) → fait apparaître les **GP culturels** aux paliers T-27 ;
3. **Les 20 événements culturels** (`cultureMilestones`) → débloquent l'ONU → **victoire culturelle** : GP + merveilles + **niveaux de culture de ville atteints** + conversions de villes ennemies (reportées — territoire).

## 1. Préalables

1. Lire `RULES.md` (R-113 rév., R-114 et la table T-27, R-116 ONU, R-126 jalons, R-127 ciblage, R-136 GP or, R-162 anneaux, §8.8 GP), `PROJET.md`, `PILOT-HANDOFF.md` §3-§4, le doc d'Erik `docs/recherche/Culture dans Civilization Revolution.md`.
2. Baseline : suite verte (**1070 tests**), typecheck 4/4, `schemaVersion` **20 → 21** attendue (ménage cultureStored — voir D5), `git status` propre, ALIGNEMENT-CROISSANCE committé (`0b1388f`).
3. **Test-first** : chaque révision en tests citant les règles révisées. **Déterminisme** : le tirage aléatoire D2 est un RNG seedé dédié (précédent artefacts R-154 : RNG dérivé du seed de partie, résolu en phase C — jamais `Math.random`).

## 2. Décisions tranchées (validées par Erik le 13/09)

1. **D1 — Paliers GP sur le cumul EMPIRE, jamais soustraits** : le canal GP lit la **somme des `city.cultureCumulee` du joueur** (culture de la civilisation) contre la table T-27 indexée par le nombre de **GP culturels déjà obtenus** (150, 267, 417, …). La culture n'est **plus jamais soustraite** — pas de remise à zéro de jauge. Vitesse validée par Erik (Palais révisé : 1er GP à 150 tombe vite — c'est canon).
2. **D2 — Classe 100 % aléatoire** : le ciblage technologique R-127 est **ABROGÉ**. La classe du GP est un **tirage uniforme seedé parmi les Personnages encore disponibles** de la partie (chaque figure nommée ne sort qu'une fois — le pool s'épuise ; repli déterministe documenté pool vide : rotation R-80 sur les classes). Aucune influence du joueur (ni tech en cours, ni choix).
3. **D3 — Lieu d'apparition** : la ville du joueur à la **plus haute culture cumulée** (tie-break cityId — déterministe R-81), posée sur sa case (sinon adjacente libre, mécanisme existant).
4. **D4 — Seuls les GP culturels avancent la table** : GP de technologies, GP des paliers d'or (R-136) et Confucius (T-43) sont **neutres** pour l'index T-27 (ils n'accélèrent ni ne retardent les prochains GP culturels). Leurs mécaniques propres sont inchangées.
5. **D5 — MÉNAGE (décision Erik : rien n'est là pour durer)** : `city.cultureStored` est **supprimé de l'état** (plus de réservoir consommé). **Migration `schemaVersion` 20 → 21** : retrait du champ, idempotent ; les pins de tests portés à 21. Les parties en cours n'ont pas à survivre (vérifier quand même : reprise sans erreur).
6. **D6 — Les niveaux de culture de ville comptent comme événements culturels** (défaut proposé par le pilotage, canon « cities reaching new culture levels » — Erik peut corriger avant lancement) : chaque franchissement d'un **seuil T-51 par une ville** (10/100/1 000/10 000 cumulés de la ville) = **+1 `cultureMilestone`** au propriétaire, **permanent** (même si la ville est perdue ensuite — à vérifier contre R-115 : les merveilles sont dynamiques, les jalons de niveau ne le sont PAS), événement `CultureMilestone {reason:'cultureLevel'}`.

## 3. Mission

### M1 — Moteur (test-first)
1. Canal GP (`turn.ts`/`culture.ts`) : déclencheur = somme empire des `cultureCumulee` ≥ `T-27[index]` où `index` = nb de GP **culturels** déjà obtenus (nouveau compteur dédié ou dérivation — l'agent choisit la forme la plus propre et la documente ; D4 verrouillé par tests : or/techs/Confucius neutres).
2. Classe : `greatPersonClassFor` réécrit en tirage seedé parmi les figures disponibles (D2) ; R-127 abrogée (fonction conservée si utilisée ailleurs — sinon supprimée, ménage D5).
3. Spawn : D3 (ville à la plus haute culture cumulée).
4. Jalons : D6 (+1 par niveau de ville franchi, permanent, `reason:'cultureLevel'`) — attention aux interactions : ONU (R-116 : le compteur débloque ET maintient le chantier), vol d'espion R-119 (les jalons de niveau ne sont pas volables — seuls les GP installés font foi), pénalité ICBM R-140 (soustrait un jalon quel que soit son origine 🔶).
5. **Ménage D5** : `cultureStored` retiré de l'état, des fixtures, de la migration (20→21), et de l'UI ; les tests qui le citent réécrits.

### M2 — UI
1. Jauge culture : progression **EMPIRE** vers le prochain palier T-27 (somme cumulée → seuil suivant) ; plus de jauge par ville à soustraction. `CityPanel` (et plus tard MENU-VILLE) l'affiche ; libellé pédagogique.
2. Compteur de jalons X/20 inchangé visuellement, mais la liste des sources gagne « niveau de culture » (journal/tooltip si représentés).

### M3 — Vérification
1. Tests : D1 (cumul empire multi-villes, paliers, pas de soustraction), D2 (déterminisme même seed, pool qui s'épuise, repli), D3 (tie-break), D4 (neutralité des autres sources), D6 (+1 par seuil de ville, permanence, ONU débloquée), D5 (migration 21, reprise).
2. e2e + partie solo (captures `dev-logs/captures-gp-culture/`) : 1er GP culturel au cumul 150 (Palais révisé), classe aléatoire, spawn sur la ville la plus cultivée ; franchir 10 cumulés dans une ville = 15/20 jauge de jalon bouge ; reprise d'une partie pré-21 sans erreur.
3. `schemaVersion` 21 ; suite verte forcée ; typecheck 4/4 ; zéro diff 3D.

## 4. Critères d'acceptation

- GP culturels aux paliers T-27 sur le cumul empire, classe aléatoire seedée parmi les disponibles, spawn sur la ville la plus cultivée ; autres sources GP neutres pour la table.
- Chaque niveau de culture de ville franchi = +1 événement culturel permanent.
- `cultureStored` disparu ; migration 21 idempotente ; suite verte, typecheck 4/4, zéro diff 3D.

## 5. Périmètre interdit

- Les anneaux culturels R-162 (déjà branchés sur `cultureCumulee` — inchangés) ; les conversions/flip de villes (territoire — backlog) ;
- Les mécaniques propres des GP or (R-136), Confucius (T-43) et GP de techs ; la victoire culturelle elle-même (20 jalons → ONU, inchangée) ;
- MENU-VILLE (en cours séparément — ne pas entrer en conflit avec ses fichiers ; vérifier `git status` avant de toucher à l'UI) ; le 3D (contrainte dure).

## 6. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-GP-CULTURE-EVENEMENTS.md` (y compris : forme du compteur culturels-only, repli pool vide, comportement R-140 sur un jalon de niveau), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
