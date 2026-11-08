# HANDOFF-PREVIEW-VIVANTE — Préview de trajet au survol + visuel AAA

**Décisions Erik 19/10** (tranchés D1-D5 présentés — veto possible). Unité sélectionnée : le chemin que prendrait le clic droit s'affiche EN DIRECT sous le curseur, avec un rendu au standard AAA.

## 1. Préalables

- Lire FLECHE-MOUVEMENT (survol anneau, préview multi-tours au clic droit maintenu — `preview.ts`, source unique 2D), R-158..R-161 (MultiStep, priorité de destination, aperçu optimiste, limite fog), `wrap.ts` (couture), la couche flèche (FLECHE-COUCHE), VUE-VILLE-PERF (zéro allocation par frame).
- Baseline : suites vertes à jour, `schemaVersion` 27, **client seul — zéro gameplay**. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 19/10 — non négociables)

- **D1 — Préview vivante** : unité sélectionnée (sienne, ordres modifiables) + survol d'une tuile = la préview COMPLÈTE du chemin de clic droit s'affiche et suit le curseur ; sortie de survol/désélection = disparition. MÊME calcul que la préview maintenue (aucune règle nouvelle : priorité de destination, fog R-161, PM).
- **D2 — Geste inchangé, préview passive** : clic droit maintenu = préview + confirmation au relâcher (inchangé) ; le survol n'intercepte AUCUN clic (sélection, culture TUILE-OCCUPEE, alternance intacts).
- **D3 — Visuel AAA (calibrage data-driven)** : polyligne fluide avec contour sombre, pointes par case, badges de tours aux ruptures, anneau de destination, tour courant = or plein / suite du trajet discrète ; alphas/épaisseurs/animations dans un bloc de style, à l'œil Erik.
- **D4 — Perf** : recalcul au plus UNE FOIS par frame (throttle mousemove), cache par tuile survolée, zéro allocation par frame, 60 FPS au pan.
- **D5 — Exclusions** : vue ville, relecture, modales, saisie texte, unité ennemie sélectionnée (lecture seule) → pas de préview vivante.

## 3. Mission

- **L1 — test-first (client)** : même résultat préview survol vs préview maintenue (propriété), throttle (une décision par frame), exclusions D5, calibrage respecté.
- **L2 — rendu** : branchement hover → préview (réutilisation stricte de `preview.ts`/FLECHE-MOUVEMENT), nouveau style D3 sur la couche flèche, couture.
- **L3 — captures GUI avant commit** (`dev-logs/captures-preview-vivante/`) : unité sélectionnée + survol multi-tours (badges), survol sur ennemi (arrivée disputée), survol près couture, désélection = disparition, 60 FPS au mouvement continu du curseur.
- **L4** : suites web vertes, svelte-check 0, commit, push, rapport `REPORT-PREVIEW-VIVANTE.md` (bloc de calibrage, 🔶 à l'œil).

## 4. Critères d'acceptation

1. La préview suit le curseur en direct et disparaît proprement ;
2. Identique à la préview du clic droit maintenu (mêmes règles) ;
3. Rendu AAA lisible sur tous terrains, calibrable sans code ;
4. Aucune interception de clic, 60 FPS, couture propre.

## 5. Périmètre interdit

Moteur/serveur/protocole ; le geste de confirmation clic droit ; la sélection et le clic TUILE-OCCUPEE ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Rapport (bloc de style, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
