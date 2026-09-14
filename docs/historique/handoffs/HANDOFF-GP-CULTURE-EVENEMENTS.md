# HANDOFF-GP-CULTURE-EVENEMENTS — Réalignement culture/GP/événements sur le vrai CivRev (ménage inclus)

**Chantier gameplay du chapitre 2D.** Source : constat et décision d'Erik du 13/09 (jouant au vrai CivRev). Trois concepts à bien séparer — **ne jamais les mélanger** :
1. **Culture par ville** (`city.cultureCumulee`) → élargit l'influence (anneaux R-162, visual-only) — **rien d'autre** ;
2. **Culture de la civilisation** (cumul EMPIRE) → franchit les **paliers T-27** (150, 267, 417…) ;
3. **Les 20 événements culturels** (`cultureMilestones`) → débloquent l'ONU → **victoire culturelle** : **paliers de culture franchis** + **merveilles** + **conversions de villes ennemies** (reportées — territoire). **Les GP n'y comptent PAS** (révision D7 — ils n'en ont jamais rien à voir).

## 1. Préalables

1. Lire `RULES.md` (R-113 rév., R-114 et la table T-27, R-116 ONU, R-126 jalons — À RÉVISER, R-127 ciblage — À ABROGER, R-119 vol d'espion, R-136 GP or, R-162 anneaux, §8.8 GP), `PROJET.md`, `PILOT-HANDOFF.md` §3-§4, le doc d'Erik `docs/recherche/Culture dans Civilization Revolution.md` (sa table « 20 jalons » est révisée par la décision du 13/09 : voir D6/D7).
2. Baseline : suite verte (**1070 tests**), typecheck 4/4, `schemaVersion` **20 → 21** attendue (ménage cultureStored — D5), `git status` propre, ALIGNEMENT-CROISSANCE committé (`0b1388f`).
3. **Test-first** : chaque révision en tests citant les règles révisées. **Déterminisme** : le tirage D2 est un RNG seedé dédié (précédent artefacts R-154 : RNG dérivé du seed de partie, résolu en phase C — jamais `Math.random`).

## 2. Décisions tranchées (validées par Erik le 13/09)

1. **D1 — Paliers GP sur le cumul EMPIRE, jamais soustraits** : le canal GP lit la **somme des `city.cultureCumulee` du joueur** (culture de la civilisation) contre la table T-27 indexée par le nombre de **paliers déjà franchis** (150, 267, 417, …). La culture n'est **plus jamais soustraite** — pas de remise à zéro de jauge. Vitesse validée par Erik.
2. **D2 — Classe 100 % aléatoire** : le ciblage technologique R-127 est **ABROGÉ**. La classe du GP est un **tirage uniforme seedé parmi les Personnages encore disponibles** de la partie (chaque figure nommée ne sort qu'une fois — le pool s'épuise ; repli déterministe documenté pool vide : rotation R-80 sur les classes). Aucune influence du joueur (ni tech en cours, ni choix).
3. **D3 — Lieu d'apparition** : la ville du joueur à la **plus haute culture cumulée** (tie-break cityId — déterministe R-81), posée sur sa case (sinon adjacente libre, mécanisme existant).
4. **D4 — Seuls les paliers de culture font avancer la table** : les GP obtenus par d'autres voies (technologies, paliers d'or R-136, Confucius T-43, merveilles) ne décalent **jamais** le prochain palier.
5. **D5 — MÉNAGE (décision Erik : rien n'est là pour durer)** : `city.cultureStored` est **supprimé de l'état** (plus de réservoir consommé). **Migration `schemaVersion` 20 → 21** : retrait du champ, idempotent ; les pins de tests portés à 21. Les parties en cours n'ont pas à survivre (vérifier quand même : reprise sans erreur).
6. **D6 (révisé avec Erik) — LE PALIER EST L'ÉVÉNEMENT** : franchir un **palier T-27** de culture de civilisation produit **DEUX conséquences simultanées** : **(a) +1 événement culturel** (+1 `cultureMilestone`, permanent, événement `CultureMilestone {reason:'cultureLevel'}`) et **(b) l'apparition d'un GP** (D1-D3). Rien d'autre ne fait avancer le compteur au titre de la culture.
7. **D7 — Les GP n'ont AUCUN lien avec le compteur des 20** : la règle « jalon à l'obtention d'un GP » (R-126) est **ABROGÉE** — installer un GP, en consommer un, en obtenir un gratuit (tech, or, Confucius) ne touche jamais `cultureMilestones`. **Conséquence assumée (consigner au rapport)** : le vol d'espion d'un GP installé (R-119) n'échange plus de jalons (il vole le GP et ses rendements, pas un point de victoire) ; la suspension ONU « jalons redescendus sous 20 par vol de GP » (R-116) disparaît par la même occasion — la suspension ne peut plus être déclenchée que par la perte d'une merveille (capture de la ville hôte). La pénalité ICBM R-140 (−1 jalon 🔶) reste et tombe sur le total quel que soit son origine.

## 3. Mission

### M1 — Moteur (test-first)
1. Culture de la civilisation : cumul empire = Σ `city.cultureCumulee` du joueur (aucun champ nouveau). Palier franchi = les DEUX conséquences D6(a) ET D6(b), atomiques dans la résolution de phase C (ordre déterministe : jalon émis PUIS GP spawné — à verrouiller par test).
2. Canal GP : D1/D2/D3/D4 (table indexée par paliers franchis ; classe = tirage seedé parmi figures disponibles ; spawn ville la plus cultivée, tie-break cityId ; neutralité des GP d'autres voies).
3. Jalons : recomposition des sources — **paliers T-27 franchis** (D6) + **merveilles** (R-115 dynamique : +1 construite/capturée, −1 ville hôte prise) + conversions (rien à faire — territoire reporté). **Suppression du couplage GP→jalon** (R-126 abrogée) : obtention, installation, consommation et vol de GP n'émettent plus rien sur `cultureMilestones` — tests réécrits.
4. **Ménage D5** : `cultureStored` retiré de l'état, des fixtures, des créations de ville, de l'UI ; `growth.json`/`culture.json` cohérents ; migration 20→21 (retrait du champ, idempotent) ; pins de tests à 21.
5. R-116 ONU : déblocage à 20 jalons inchangé ; suspension inchangée dans son mécanisme, mais sa cause « vol de GP » disparaît (D7) — test mis à jour (suspension par capture de merveille seulement).

### M2 — UI
1. Jauge culture : progression **EMPIRE** vers le prochain palier T-27 (somme cumulée → seuil suivant) — plus de jauge par ville à soustraction. `CityPanel` l'affiche (MENU-VILLE la réutilisera) ; libellé pédagogique (« Palier 2 : 117 / 267 »).
2. Compteur de jalons X/20 : sources visibles = **paliers de culture + merveilles** (journal/tooltips si représentés) — plus jamais « GP installé ».

### M3 — Vérification
1. Tests : D1 (cumul empire multi-villes, paliers successifs, pas de soustraction), D2 (déterminisme même seed, pool qui s'épuise, repli), D3 (tie-break), D4 (neutralité or/techs/Confucius/merveilles), **D6 (un palier = exactement +1 jalon ET un GP, dans cet ordre)**, **D7 (installer/voler/consommer un GP ne bouge plus rien)**, D5 (migration 21, reprise), ONU (débloquée à 20, suspension par perte de merveille seulement).
2. e2e + partie solo (captures `dev-logs/captures-gp-culture/`) : franchissement du palier 150 → jalon +1 ET GP spawné sur la ville la plus cultivée ; classe aléatoire ; compteur 1/20 ; reprise d'une partie pré-21 sans erreur.
3. `schemaVersion` 21 ; suite verte forcée ; typecheck 4/4 ; zéro diff 3D.

## 4. Critères d'acceptation

- Chaque palier T-27 franchi = exactement +1 événement culturel + 1 GP (classe aléatoire seedée, ville la plus cultivée) ; la culture n'est jamais soustraite ; les autres sources de GP sont neutres.
- `cultureMilestones` = paliers + merveilles uniquement ; les GP n'y touchent jamais (obtention, installation, vol).
- `cultureStored` disparu ; migration 21 idempotente ; suite verte, typecheck 4/4, zéro diff 3D.

## 5. Périmètre interdit

- Les anneaux culturels R-162 (inchangés) ; les conversions/flip de villes (territoire — backlog) ;
- Les mécaniques propres des GP or (R-136), Confucius (T-43) et GP de techs ; la victoire culturelle elle-même (20 jalons → ONU, inchangée) ;
- MENU-VILLE (chantier séparé — vérifier `git status` avant de toucher à l'UI, éviter les conflits de fichiers) ; le 3D (contrainte dure).

## 6. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-GP-CULTURE-EVENEMENTS.md` (y compris : forme du compteur de paliers, repli pool vide, pénalité ICBM R-140 sur les nouveaux jalons, suspension ONU révisée), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
