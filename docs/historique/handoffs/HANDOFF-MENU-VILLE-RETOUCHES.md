# HANDOFF-MENU-VILLE-RETOUCHES — Chiffre de population sur la case de ville + icône de conversion dans la vue ville

**Deux retouches UI du chapitre « menus »** (constats d'Erik du 14/09, capture à l'appui). Zéro gameplay.

## 1. Préalables

Baseline : suite verte (**1157 tests**), typecheck 4/4, `schemaVersion` **23**, `git status` propre. Rendu 2D = seul chemin actif ; le 3D reste intouché (contrainte dure).

## 2. Retouche 1 — Le chiffre de population va SUR la case de la ville

Le badge de population est actuellement posé sur la **tuile en haut à droite** de la ville et **cache l'icône de rendement de cette tuile** (capture d'Erik). 

**Mission** : le badge de population se pose **sur la case même de la ville** (intégré au visuel de la tuile de ville — position/échelle/contraste 🔶 à calibrer à l'œil par Erik), libérant la tuile voisine et son icône. Le badge doit rester lisible sur tous les terrains (contour/ombre conservés). Valider en vue carte ET en vue ville.

## 3. Retouche 2 — L'icône de commerce reflète la conversion, dans la VUE VILLE seulement

Dans la vue ville, les tuiles du rayon affichent l'icône **commerce** sur leurs rendements — même quand la ville convertit son commerce.

**Mission** :
1. **Vue ville** : si la ville convertit son commerce en **science**, l'icône des rendements de commerce des tuiles devient l'**icône sciences** ; en **or**, l'icône **or**. Le reflet suit le bouton de conversion en temps réel (bascule ⇄ → icônes mises à jour immédiatement, comme les autres compteurs).
2. **Vue carte du monde** : les tuiles affichent **toujours l'icône commerce**, quel que soit le choix de conversion de la ville (inchangé).
3. Implémentation : même source de vérité que le bouton (état de conversion R-90 de la ville), aucun calcul moteur nouveau — c'est un choix d'icône au rendu.

## 4. Vérification

1. Tests : position du badge (purs si possible), choix d'icône selon la conversion (ville en science → sciences ; en or → or ; vue carte → commerce).
2. e2e + captures `dev-logs/captures-menu-ville-retouches/` : badge sur la case de ville (tuile voisine dégagée), tuile maritime avec icône sciences en conversion science, bascule ⇄ en direct, vue carte inchangée.
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 23, zéro diff 3D.

## 5. Périmètre interdit

- La sémantique R-90, tout moteur ; le 3D ; les autres badges/icônes (chiffres de rendement, hexagones worked tiles, frontières) ; `assets-src` (atelier parallèle éventuel).

## 6. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-MENU-VILLE-RETOUCHES.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main.
