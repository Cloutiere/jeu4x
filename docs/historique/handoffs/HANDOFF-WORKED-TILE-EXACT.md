# HANDOFF-WORKED-TILE-EXACT — Désélectionner exactement la tuile cliquée

**Chantier gameplay de correction** (chapitre 2D). Constat d'Erik du 14/09 : cliquer une tuile cultivée pour la libérer ne libère pas TOUJOURS CETTE tuile — le moteur semble suivre l'ordre d'attribution. Règle voulue : **cliquer une tuile cultivée = CETTE tuile précise sort des terrains cultivés**, et le citoyen ainsi libéré redevient un **ouvrier intérieur disponible** (à réaffecter sur une nouvelle tuile).

## 1. Préalables

1. Lire `RULES.md` R-60 (l'assignation et la sémantique `SetWorkedTile` — la clause « désassigner = cibler une autre case déjà travaillée **(échange)** » est LA règle à réviser, déjà notée « à réaligner » dans PILOT-HANDOFF), `docs/historique/rapports/REPORT-INTERACTION-3D.md` (worked tiles = file d'ordres par ville, miroir `effectiveWorkedTiles`), `PILOT-HANDOFF.md` §3-§4.
2. Baseline : suite verte (**1126 tests**), typecheck 4/4, `schemaVersion` **23** (aucune migration attendue — la liste `workedTiles` ne change pas de forme), `git status` propre.
3. **Test-first** : la révision de R-60 en tests avant le moteur. `orderShapeError` inchangé si l'ordre garde sa forme (ville, case) — à vérifier ; si une nouvelle forme d'ordre est nécessaire, **valider `orderShapeError` d'abord** (piège déjà coûté une phase).

## 2. Mission

### M1 — Moteur (R-60 rév.)
1. `SetWorkedTile(ville, case)` où `case` est **déjà travaillée par la ville** = **désélection exacte** : la case sort de `city.workedTiles`, le citoyen correspondant redevient disponible (citoyen intérieur R-88 — la tranche de commerce intérieure s'applique automatiquement).
2. La clause « échange » est ABROGÉE (plus de permutation automatique vers la case ciblée). La ré-affectation vers une nouvelle tuile = un second ordre explicite (clic sur une tuile libre du rayon), comme aujourd'hui.
3. **Temps réel et miroir** : `effectiveWorkedTiles` (file d'ordres/aperçu) applique la même sémantique exacte — la zone (ZONE-CULTIVEE), les hexagones, la frontière culturelle (palier 1) et les compteurs de ville (nourriture/production/commerce, `toursAvantCroissance`) suivent immédiatement, y compris dans la vue ville (MENU-VILLE `clickActionVueVille` — même règle aux deux endroits, source unique).
4. Assignation automatique inchangée (fondation/croissance, priorité N > P > C, tie-break R-81).

### M2 — Vérification
1. Tests : désélection exacte (3 tuiles travaillées A/B/C → cibler B libère B, pas A), citoyen intérieur recompté, ré-affectation explicite ensuite, « échange » abrogé (l'ancien contrat réécrit), temps réel (file d'ordres), vue ville = même comportement, autorités (autre ville) et rayon intouchés.
2. e2e + partie solo (captures `dev-logs/captures-worked-tile-exact/`) : 3 tuiles cultivées, désélection de celle du milieu → ses hexagones disparaissent, les deux autres restent ; chiffres de la ville mis à jour ; ré-affectation sur une nouvelle tuile ; sortie/entrée vue ville sans surprise.
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 23, zéro diff 3D.

## 3. Périmètre interdit

- L'assignation automatique, le rayon de travail (6/18), le cap de citoyens, les autres ordres ; `orderShapeError` sauf vérification préalable (§1.3) ;
- Le 3D (contrainte dure) ; COLON-FONDATION (parallèle éventuel — vérifier `git status` avant d'éditer).

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-WORKED-TILE-EXACT.md` (y compris : la forme d'ordre conservée ou migrée), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
