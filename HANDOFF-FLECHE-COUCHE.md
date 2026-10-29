# HANDOFF-FLECHE-COUCHE — La flèche de déplacement au-dessus des structures

**Signalement Erik 04/10 (capture)** : la flèche de déplacement (FLECHE-MOUVEMENT) ne s'affiche PAS par-dessus les huttes, camps barbares, artefacts — ni (à vérifier) les villes. Attendu : **la flèche au-dessus de toutes les structures, mais EN DESSOUS des unités.**

## 1. Préalables

Contexte : la couche flèches a été dépliée à la couture par CARTE-RONDE T2 (`78952f7` — `wrap.ts`, `deplierPoints`/`copiesPolyline`) ; les structures (huttes, villages, artefacts, villes) et les unités cohabitent dans la couche entités — précédent de tri : l'anneau de sélection (`zIndex -90` dans entitiesLayer, REGLAGES-CALIBRAGE). Baseline : suites vertes (rules 993 + web 526 + server 120), `schemaVersion` 27, **client seul**. Vérifier `git status`.

## 2. Mission

- **L1 — test-first** : un test de tri (le motif `zIndex` existe déjà) : pour une flèche dont une case porte hutte ET une autre une unité, l'ordre de rendu attendu est structures < flèche < unités.
- **L2** : ajuster le `zIndex`/l'ordre de la couche flèches (segments, pointes, badges de tours — le bloc entier) : au-dessus de TOUTES les structures posées (huttes, villages barbares, artefacts, villes — y compris villes ennemies et merveilles posées), en dessous des sprites d'unités (et des barres PV/anneaux de sélection qui les accompagnent). Vérifier que la correction s'applique aux DEUX copies wrap (à cheval sur la couture aussi) et aux deux états (survol + ordre posé/chemin gelé).
- **L3** : capture GUI avant/après (`dev-logs/captures-fleche-couche/`) : flèche traversant une hutte, un camp, un artefact et une ville — visible au-dessus, passant sous l'unité si une case en porte une.
- **L4** : suites web vertes, svelte-check 0, commit, push, mini-rapport `REPORT-FLECHE-COUCHE.md`.

## 3. Périmètre interdit

Moteur/serveur, le reste de la pile d'affichage (la correction est une constante de tri, pas une refonte de calques), tout le 3D, `schemaVersion`.

## 4. Fin de session

Mini-rapport, arrêt, remise de la main.
