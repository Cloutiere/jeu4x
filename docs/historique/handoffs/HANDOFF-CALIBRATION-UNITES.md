# HANDOFF-CALIBRATION-UNITES — Hauteur des unités seules et regroupement par nation sur les cases instables

**Retouche de rendu du chapitre 2D.** Demande d'Erik du 20/09, deux volets : (1) **calibrer la hauteur des unités sur leur case quand elles sont seules**, (2) **régler leur positionnement quand elles sont plusieurs** (cases instables — cohabitations ENGAGEMENT) pour qu'elles soient **regroupées par nation**. **Unité de calibration : le guerrier Recraft** fraîchement importé — c'est LUI la référence de taille, pas l'ancien painter.

## 1. Préalables

1. Lire `docs/historique/rapports/REPORT-IMPORT-SVG.md` (le sprite importé, ses tailles) et le rendu des entités 2D (`GameCanvas.svelte` — pose des sprites, ancrage des pieds) ;
2. Baseline : suite verte, typecheck 4/4, `git status` propre.
3. **Zéro gameplay** : pose visuelle seulement ; le 3D intouché ; le labo `#/labo-combat` bénéficie des mêmes poses (c'est là qu'Erik teste les instables).

## 2. Mission

### M1 — La hauteur de référence (data-driven)
1. Poser l'ancrage des sprites sur **les pieds** (le bas du sprite touche le bas/centre-bas de l'hexagone, quel que soit le ratio du PNG) — aujourd'hui probablement centré, ce qui déborde ou flotte selon les proportions du Recraft ;
2. **Constantes data-driven** (config de rendu éditable par Erik sans code) : `hauteurUnite` (ratio de la hauteur de l'hexagone occupé par une unité seule — valeur initiale proposée ~0,55, à l'œil), échelle appliquée au guerrier Recraft puis aux autres sprites (chaque type peut avoir un ajustement individuel — les data du catalogue le permettent déjà si c'est le cas ; sinon l'ajouter) ;
3. **Le calibre = le guerrier** : toutes les tailles se règlent relativement à lui ; vérifier sur les anciens sprites painter (archer, colon…) qu'ils ne semblent ni géants ni nains à côté (ajustements individuels si nécessaire) ;
4. Valider en vue carte ET en vue ville, et au labo.

### M2 — Le positionnement multi-unités, groupé par nation
1. Sur une case instable (≥ 2 unités, cohabitation ENGAGEMENT), les unités sont disposées **en groupes par propriétaire/nation** : chaque nation forme un petit paquet compact, les paquets répartis dans l'hexagone (déterministe) ;
2. **Algorithme déterministe pur et testé** (positions relatives dans l'hexagone) : ordre des nations trié (R-81), unités de même nation empilées en petit éventail/colonne serrée, paquets espacés selon le nombre de nations (2 nations = gauche/droite ou haut/bas — à l'œil par Erik ; 3+ = répartition radiale) ;
3. Le drapeau/jeton de nation reste lisible sur chaque unité ; la sélection au clic dans un groupe doit rester praticable (picking : l'unité la plus haute/proche du curseur — tester le cycle de sélection existant PILE-AFFICHÉE) ;
4. Valider au **labo** (scénarios 2 et 3 nations cohabitantes) et en jeu (mêlées réelles, dispersions R-179-b).

### M3 — Vérification
1. Tests : fonction pure de placement (1, 2, 3+ unités, 1-3 nations, ordre déterministe), ancrage pieds (ratios de PNG différents) ;
2. e2e + captures `dev-logs/captures-calibration-unites/` : guerrier seul (hauteur de référence), 2 nations en cohabitation groupées, 3 nations, mêlée réelle, vue ville ;
3. Suite verte forcée, typecheck 4/4, zéro gameplay, zéro diff 3D.

## 3. Périmètre interdit

- Le moteur, les règles de cohabitation ; le 3D ; `assets-src` (les PNG ne changent pas — seule leur pose bouge) ; la vue ville des villes elles-mêmes.

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie) — Erik calibre les constantes à l'œil en session. Rapport `REPORT-CALIBRATION-UNITES.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main.
