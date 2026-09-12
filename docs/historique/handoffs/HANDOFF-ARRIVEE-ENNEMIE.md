# HANDOFF-ARRIVEE-ENNEMIE — Visualiser une arrivée programmée sur une tuile à unité ennemie

**Chantier du chapitre 2D** (post-pivot du 11/09, suite directe de FLECHE-MOUVEMENT — voir `docs/historique/rapports/REPORT-FLECHE-MOUVEMENT.md`). Décision d'Erik du 12/09, tranchée : **fantôme translucide décalé côté d'arrivée + anneau rouge**.

## 1. Préalables

1. Lire `RULES.md` (R-158 MultiStep, R-159 priorité de destination, R-160 aperçu optimiste, R-161 limite fog), `PROJET.md` (§pivot du 11/09), `PILOT-HANDOFF.md` §3-§4, le rapport FLECHE-MOUVEMENT (état final des flèches : anneau de survol, préview clic droit maintenu, badges de tours, chemin gelé).
2. Baseline : suite verte (**1036 tests**), typecheck 4/4, `schemaVersion` **19**, `git status` propre. **Rendu 2D = seul chemin actif** (`rendu3d: false` — ne pas réactiver) ; le code 3D doit rester correct (estampillage `poser3d` comme pour les badges).
3. **Zéro gameplay** : `packages/rules` src, serveur, `orderShapeError`, R-158..161 intouchés. UX de programmation sur l'existant.

## 2. Contexte

Quand une unité amie est programmée pour s'arrêter sur une tuile occupée par une **unité ennemie visible**, le joueur ne voit rien qui le distingue d'une arrivée sur case vide : le sprite ennemi masque la situation et rien n'annonce le contact. Il faut montrer **les deux présences** et **l'incertitude** (résolution simultanée : l'ennemi peut avoir bougé — modèle Diplomacy, PAS une prédiction de combat à la Into the Breach).

## 3. Décisions tranchées (validées par Erik le 12/09)

- **L'ennemie reste en grandeur normale à sa place** (pas de décalage du sprite existant).
- **L'unité programmée s'affiche en fantôme translucide, plus petite, décalée vers le bord de l'hexagone d'où elle arrive** (cohérent avec la flèche qui y mène). Transparence et ratio de taille = constantes data-driven/constantes en tête de bloc, calibrage 🔶 à l'œil par Erik.
- **Surbrillance différenciée** : anneau ambre actuel = destination normale ; **anneau rouge** (ou pulsé, constantes 🔶) = destination occupée par un ennemi. Le rouge s'applique à l'anneau de la tuile d'arrivée (survol ET ordre posé).
- **Le visuel reflète la réalité moteur, pas une intention** : investiguer d'abord ce que fait le moteur quand le mouvement résout sur un ennemi resté en place (attaque ? blocage/repli R-159 ?) et consigner dans le rapport ; l'affichage doit rester un aperçu d'arrivée, jamais une promesse de résultat de combat.

## 4. Mission

### M1 — Détection et état
1. Dans la logique d'affichage existante (aperçu optimiste `previewPrograms` / `arretProchaineResolution`, source de vérité UI), détecter : case d'arrêt programmée d'une unité amie + unité ennemie **visible** dessus (fog : R-161 prime — tuile inconnue = rien de spécial, pas d'ennemi affiché).
2. Fonction pure testée (style `interaction.ts`) : entrée = unité + chemin/arrêt + état filtré ; sortie = { ennemiPrésent, side d'arrivée }. C'est elle qui alimente le rendu, 2D d'abord.

### M2 — Rendu 2D
1. **Fantôme** : sprite de l'unité programmée en translucide réduit, décalé vers le bord d'arrivée, posé au-dessus du terrain et sous/à côté du sprite ennemi sans le chevaucher entièrement. Pas d'impact sur le picking (le clic sur la tuile garde ses priorités actuelles : sélection d'unité, etc.).
2. **Anneau rouge** sur la tuile d'arrivée quand `ennemiPrésent` (survol et ordre posé — intégrer aux blocs anneau/flèche de FLECHE-MOUVEMENT dans `GameCanvas.svelte`).
3. Le chemin gelé entre les tours bénéficie du même traitement (le fantôme et l'anneau persistent tant que l'ordre vit, même contrat que la flèche gelée).

### M3 — Plusieurs unités vers la même case
1. Deux unités programmées (deux amies, ou amie + ennemie déjà gérée par M2) : réutiliser le langage « pile ×N » existant de DEPLACEMENT-PLANIFIÉ plutôt que d'empiler des fantômes. Fantôme unique + badge ×N si plus de deux présences.

### M4 — Cohérence et vérification
1. Tests : fantôme/anneau présents quand ennemi visible, absents en fog, disparus quand l'ordre est annulé/consommé/replié (R-159), ×N au-delà de deux, fonctions pures couvertes.
2. e2e + vraie partie solo (captures `dev-logs/captures-arrivee-ennemie/`) : programmation vers un barbare ou une unité adverse visible → fantôme + anneau rouge ; annulation → disparition ; résolution → conforme au moteur.
3. Bench : pas de recalcul par frame de la détection (dériver de l'état déjà calculé pour les flèches, pas de nouveau BFS).
4. 3D : estampillage `poser3d` pour la reprojection (mode coupé en prod, code resté correct, tests 3D existants verts).

## 5. Critères d'acceptation

- Tuile d'arrivée à ennemi visible = ennemi intact + fantôme translucide réduit côté d'arrivée + anneau rouge, en survol comme en ordre posé, et sur le chemin gelé entre les tours.
- Fog : aucun de ces marqueurs sur tuile inconnue.
- Annulation/consommation/repli R-159 = marqueurs disparus, miroir du moteur.
- Suite verte, typecheck 4/4, zéro gameplay, `schemaVersion` 19.

## 6. Périmètre interdit

- R-158..161, ordres, serveur, résolution (aucune sémantique nouvelle : l'arrivée sur ennemi se comporte exactement comme aujourd'hui) ;
- Prédiction de combat / résultat affiché (refusé — résolution simultanée) ;
- Le mode 3D en prod (drapeau `rendu3d` intouchable) ; les menus ; le visuel 2D des sprites.

## 7. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie — pas d'itération en prod). Rapport `REPORT-ARRIVEE-ENNEMIE.md` (y compris : ce que fait le moteur quand le mouvement résout sur un ennemi resté en place), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
