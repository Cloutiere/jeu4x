# HANDOFF-RETRAIT-GP-ACCUMULATEURS — Suppression de la famille R-123 (GP de rendement)

**Chantier gameplay de retrait** (chapitre 2D). Décision d'Erik du 14/09, suite au diagnostic GP tour 18 : les **GP issus d'accumulateurs de rendement ont été implémentés par erreur — il ne doit pas en exister**. Les GP proviennent UNIQUEMENT de : **culture cumulée de l'empire** (paliers T-27), **certaines technologies**, **certaines merveilles**, **artefacts** — **plus les deux canaux qu'Erik maintient explicitement : le Leader (victoires de combat, T-31) et les paliers d'or (R-136)**.

## 1. Préalables

1. Lire `RULES.md` (R-123 — À ABROGER, T-30, T-31 inchangé, R-136 inchangé, R-114/R-126 révisées, C6 Settle), `PROJET.md`, `PILOT-HANDOFF.md` §3-§4, `docs/historique/rapports/REPORT-GP-CULTURE-EVENEMENTS.md` et `REPORT-CULTURE-FRONTIERES.md` (le champ `canal` du journal reste).
2. Baseline : suite verte (**1126 tests**), typecheck 4/4, `schemaVersion` **22** → **23** attendue, `git status` propre.
3. **Étape 0 — le travail CULTURE-FRONTIERES est NON COMMITÉ dans l'arbre** : sur demande explicite d'Erik, committer D'ABORD cet atome tel quel (rapport déjà archivé), PUIS entamer le retrait. Ne jamais mélanger les deux dans un commit.

## 2. Ce qui sort, ce qui reste

### SORT (mécanisme R-123 abrogé)
- Les accumulateurs de rendement par ville : Grand Savant (science), Grand Explorateur/Industriel (or), Grand Bâtisseur (production), Grand Humanitaire (nourriture `gpAccumFood` — dormant, sort avec la famille).
- Les champs d'état `gpAccum*` des villes, leur accumulation dans `processEconomy`, leurs 3-4 sites d'émission de GP, les seuils T-30 (`culture.json` `greatPersonYieldThresholdBase`/`Growth`), leurs libellés UI/journal et leurs jauges éventuelles.

### RESTE (intouché, verrouillé par tests)
- **Leader** (T-31 : 20 victoires de combat) ; **paliers d'or** (R-136 : 500/10 000, classe Explorateur) ; **paliers de culture** (T-27, tirage seedé D2) ; **GP gratuits de technologies** (Premier découvrir, 7j) ; **Confucius et les merveilles** à GP ; **artefacts** (Templiers/Confucius — T-43).
- Les effets **Consume** et **Settle** des GP (R-126 : Explorateur consume or, Bâtisseur ×0,5 coûts, multiplicateurs +50 % C6) — le retrait porte sur l'**obtention**, pas sur ce que font les GP.
- Le champ `canal` du journal (GP-CULTURE-FRONTIERES) : les raisons `'science'|'or'|'production'` disparaissent des émissions (plus aucun accumulateur), `'combat'`, `'culture'`, `'or'` (paliers), `'artefact'` restent.

## 3. Mission

### M1 — Moteur (test-first)
1. Retirer les accumulateurs : champs d'état, accumulation, émissions, seuils T-30 ; les tests R-123 (7h/7j) sont SUPPRIMÉS ou réécrits en « le canal n'existe plus » (garde-fou : aucune émission de GP quelle que soit la production/science/or/nourriture accumulée).
2. **Migration `schemaVersion` 22 → 23** : retrait des champs `gpAccum*`, idempotent ; les pins de tests portés à 23 ; partie existante reprise sans erreur.
3. Garde-fou global testé : en 100 tours de simulation, les seuls canaux d'émission observables sont culture/technologies/merveilles/artefacts/Leader/or.

### M2 — UI et données
1. `culture.json` : entrées T-30 supprimées (T-31 `leaderGpVictories` conservé) ; toute référence UI aux jauges d'accumulateurs retirée (`CityPanel`/`CityView`/tooltips — vérifier les deux, MENU-VILLE a son propre composant).
2. Journal : plus aucune émission « GP de production/science » possible (testé).

### M3 — Vérification
1. Suite verte forcée complète ; typecheck 4/4 ; `schemaVersion` 23 ; reprise d'une partie pré-23.
2. e2e + partie solo (captures `dev-logs/captures-retrait-gp-accumulateurs/`) : 40+ tours avec forte production/science — **aucun GP d'accumulateur** ; Leader et paliers d'or inchangés (par simulation moteur si non atteignables en solo) ; journal propre.
3. **Zéro diff 3D** (contrainte dure).

## 4. Critères d'acceptation

- Aucun GP ne peut plus sortir d'un accumulateur de rendement (science/or/production/nourriture) ; Leader, or, culture, technologies, merveilles, artefacts inchangés et verts.
- État nettoyé (`gpAccum*` disparus), migration 23 idempotente, journal sans canal rendement.
- Suite verte, typecheck 4/4, zéro diff 3D.

## 5. Périmètre interdit

- Les mécaniques Consume/Settle des GP, le ciblage des classes par tirage (D2 GP-CULTURE), `goldMilestoneGpClass` (R-136) ;
- Les anneaux culturels R-162/CULTURE-FRONTIERES (frontierRadius — livré) ; COLON-FONDATION (parallèle éventuel — vérifier `git status`) ; le 3D.

## 6. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-RETRAIT-GP-ACCUMULATEURS.md` (y compris la liste exacte des champs/entrées supprimés), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
