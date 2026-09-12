# HANDOFF-FLECHE-MOUVEMENT — La flèche de déplacement vivante (survol → clic → persistance)

**Premier chantier du chapitre 2D** (post-pivot du 11/09). Décision d'Erik du 11/09, sa demande textuelle : *« quand je clique sur une unité et que je déplace mon curseur, je veux qu'une flèche apparaisse et montre le chemin que l'unité va parcourir. Si je re-clique sur une autre case, elle définit cette case comme tuile d'arrivée. L'unité va se déplacer ce qu'elle peut effectuer comme mouvement le prochain tour (c'est une programmation qui est montrée, le mouvement réel ne se résout qu'au moment où tous les joueurs ont confirmé leur coup). La flèche demeure affichée sur le terrain pour les prochains coups, à moins que le mouvement de l'unité n'ait été interrompu par le mouvement d'une autre unité. »*

## 1. Préalables

1. Lire `RULES.md` (R-158 MultiStep, R-159 priorité de destination, R-160 aperçu optimiste, R-161 limite fog, R-40..43 déplacements), `PROJET.md` (§pivot du 11/09), `PILOT-HANDOFF.md` §3-§4, et les rapports archivés DEPLACEMENT-PLANIFIE + CORRECTIFS-SELECTION (l'état de l'aperçu/flèches/fantômes et le schéma de clics actuel : clic gauche = programmation, clic droit = sélection).
2. Baseline : tests verts, typecheck 4/4, `schemaVersion` **19**, `git status` propre. **Rendu 2D = le seul chemin actif** (drapeau `rendu3d: false`, pivot du 11/09) — le travail est d'abord 2D ; la couche 3D reste compatible (elle est coupée en prod, mais le code doit rester correct pour la reprise).
3. **Zéro gameplay** : `packages/rules`, serveur, `orderShapeError`, R-158..161 intouchés. C'est de l'UX de programmation sur l'existant.

## 2. Mission

### M1 — La flèche de survol (le nouveau comportement central)
1. **Unité sélectionnée + curseur qui se déplace = une flèche vivante apparaît immédiatement**, suivant le curseur case par case, montrant le chemin que l'unité parcourrait (pathfinding existant : `pathTo`, coût en PM, terrains, R-161 fog = la flèche s'arrête au bord du visible + 1 pas).
2. La flèche de survol est **différenciée visuellement** de la flèche d'ordre posé (ex. pointillée ou plus discrète) — Erik tranche le style à l'œil ; elle n'existe qu'avec une unité sélectionnée et disparaît dès que le curseur quitte une case atteignable ou que la sélection change.
3. Performance : le recalcul du chemin au déplacement du curseur ne doit pas coûter (cache du pathfinding par case cible, recalcul seulement quand la case sous le curseur change).

### M2 — Le clic d'arrivée (re-ciblage)
1. **Clic sur une case = cette case devient la tuile d'arrivée** de l'unité sélectionnée (ordre programmé, remplacement d'ordre existant : priorité conservée, R-159/D3 — le mécanisme `upsertOrderPreservingPriority` existe).
2. Re-cliquer une autre case **re-cible** l'arrivée sans étape intermédiaire (pas de « dé-glisser » : la flèche de survol saute au nouveau chemin).
3. La flèche d'ordre posé (solide, style actuel ou ajusté par Erik) remplace la flèche de survol au clic et demeure.
4. Les autres interactions programmées restent comme elles sont : action finale MultiStep (bouton Colon), annulation, priorité.

### M3 — La persistance de la flèche entre les tours (le point à investiguer)
**Voulu par Erik** : la flèche **reste affichée sur le terrain pour les prochains coups** tant que l'ordre vit — **sauf si le mouvement a été interrompu** (conflit de destination R-159, blocage, mouvement achevé).
1. Investiguer l'existant : après résolution, les **chemins gelés** (composites) sont-ils déjà affichés ? (les flèches pointillées tronquées fog existent dans DEPLACEMENT-PLANIFIÉ — vérifier leur comportement réel en jeu, tour après tour.)
2. Comportement cible : après résolution du tour, la flèche reflète **le chemin restant** (gelé) si le mouvement continue ; elle **disparaît ou se tronque** si le mouvement est achevé ou interrompu (conflit R-159 — la position réelle de l'unité fait foi, miroir du moteur, PAS un état UI inventé). L'aperçu optimiste existant (`preview.ts`, position optimiste de l'unité à sa destination) reste la source de vérité UI.
3. Si l'existant couvre déjà ce comportement : le vérifier par tests/e2e, corriger les écarts, et le consigner (« déjà en place, confirmé ») plutôt que de réinventer.

### M4 — Cohérence et vérification
1. 2D d'abord (chemin actif), 3D : le code de flèche partagé doit rester correct (la couche 3D est coupée en prod mais pas supprimée — les tests 3D existants restent verts).
2. Tests : flèche de survol apparaît/disparaît avec la sélection ; clic re-cible (priorité conservée) ; fog : survol tronqué à 1 pas dans l'inconnu ; persistance post-résolution conforme à M3.
3. e2e + vraie partie solo (captures `dev-logs/captures-fleche-mouvement/`) : sélection → survol → clic → re-clic ailleurs → fin de tour → flèche restante ou disparue selon le cas.
4. Bench sans régression (le survol recalcule au déplacement du curseur).

## 3. Critères d'acceptation

- Sélection d'unité + mouvement du curseur = flèche de survol vivante suivant le chemin réel (PM, terrains, fog), style validé par Erik.
- Clic = tuile d'arrivée ; re-clic ailleurs = re-ciblage immédiat, priorité conservée.
- La flèche d'ordre persiste entre les tours tant que le mouvement vit ; interrompu/achevé = disparition ou troncature conforme au moteur.
- Suite verte, typecheck 4/4, bench sans régression, zéro gameplay, `schemaVersion` 19.

## 4. Périmètre interdit

- R-158..161, ordres, serveur, résolution (le survol ne programme RIEN — seul le clic pose l'ordre) ;
- Le mode 3D en prod (drapeau `rendu3d` — ne pas le réactiver) ;
- Les menus, le visuel 2D des sprites, RELECTURE-3D (en sommeil).

## 5. Fin de session

Rapport `REPORT-FLECHE-MOUVEMENT.md`, commit/push sur demande explicite d'Erik (validation locale avant commit — règle établie), arrêt, remise de la main.
