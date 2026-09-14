# HANDOFF-CIV-CAPITALE-FONDEE — Les bonus de civ au niveau de la capitale s'appliquent à la FONDATION

**Chantier gameplay de correction** (chapitre 2D). Constat d'Erik du 14/09 : la Grèce ne débute PAS avec son Tribunal. Cause identifiée par le pilotage : `civStartBuildings` (et les bonus capital-dépendants) sont appliqués **uniquement aux capitales préfabriquées de la carte au setup** (`map.ts` §setup) — or les joueurs **fondent leur capitale avec le Colon** (R-64), et `processFoundCity` n'applique pas ces bonus. La France n'a probablement jamais eu sa Cathédrale, l'Égypte sa merveille Antique.

## 1. Préalables

1. Lire `RULES.md` (R-64 fondation, R-145/7n civs et `civilizations.json` `start`), `packages/rules/src/civilizations.ts` (`civStartBuildings`, `civStartsAncientWonder`, `civStartsFreeGp`), `map.ts` §setup (l'application actuelle, lignes ~575-620).
2. Baseline : suite verte (**1134 tests**), typecheck 4/4, `schemaVersion` **23**, `git status` propre (atelier icônes possiblement en parallèle — ne pas toucher `assets-src`).
3. **Test-first** : chaque cas en test avant le moteur. Déterminisme R-80/R-81 (le tirage Égypte utilise son RNG dédié existant).

## 2. Mission

### M1 — Audit des bonus capital-dépendants (investigation d'abord)
Faire la liste EXACTE de ce que le setup applique au niveau capitale, et vérifier pour chacun s'il est manquant à la fondation :
1. `civStartBuildings` — Grèce Tribunal, France Cathédrale ;
2. Égypte — merveille Antique au tirage seedé (`egyptWonderRng`, `egypteWonderChoices`) ;
3. Amérique — GP gratuit posé sur la capitale (si capital-dépendant) ;
4. Tout autre traitement capital-dépendant du setup (dégagement du rayon, etc.).
Consigner le tableau complet (bonus × chemin de création : préfabriquée / fondée) dans le rapport AVANT de coder.

### M2 — Correctif (test-first)
1. `processFoundCity` (R-64) : à la fondation d'une ville **capitale**, appliquer les mêmes bonus capital-dépendants que le setup — bâtiments gratuits (prérequis R-111 non exigés, même convention), merveille Égypte (tirage seedé DÉDIÉ : même RNG salé que le setup pour rester déterministe, consommation documentée), GP Amérique posé sur la capitale si applicable.
2. **Invariant** : une civ dont la capitale est préfabriquée (cartes) ne doit PAS recevoir les bonus deux fois (garde `includes` existant) ; une partie où le joueur fonde sa capitale au tour 1 reçoit tout exactement une fois.
3. Le bot (choix de civ seedé) est couvert par le même chemin — vérifié par test.
4. Événement/journal si représentés (fondation : mention du bâtiment/merveille offerts, libellé pedagogique).

### M3 — Vérification
1. Tests : Grèce fondée → Tribunal dans la capitale ; France → Cathédrale ; Égypte → merveille au tirage, même seed = même merveille ; Amérique → GP ; double application impossible ; préfabriquée inchangée ; bot couvert.
2. e2e + partie solo **Grèce** (captures `dev-logs/captures-civ-capitale/`) : fondation au tour 1 → le Tribunal est dans la capitale (menu/vue ville), le bonus d'ère Médiévale gpFrequents ≠ touché ; journal lisible.
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 23 (aucune migration attendue), zéro diff 3D.

## 3. Périmètre interdit

- Les autres traits de civ (ères, uniques, or Aztèques — déjà au niveau joueur au setup) ; R-111 ; l'équilibrage ;
- Le 3D (contrainte dure) ; l'atelier icônes (parallèle — ne pas toucher `assets-src`).

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-CIV-CAPITALE-FONDEE.md` (y compris le tableau d'audit M1), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
