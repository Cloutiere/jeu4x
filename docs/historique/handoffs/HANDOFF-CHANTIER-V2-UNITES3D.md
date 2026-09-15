# HANDOFF CHANTIER — Brancher les unités 3D d'Erik sur le monde de jeu

Tu reprends le pilotage de l'implémentation. **Préalables :** `HANDOFF.md` §4, baseline **868+ tests** + typecheck verts, le constat d'Erik du 05/09 : **ses unités 3D (Guerrier « Script de Base », Sentinelle Réseau — commit `ba04abe`, atelier) s'affichent dans le labo `#/lab3d` mais PAS dans une vraie partie** (il voit encore les sprites 2D). `schemaVersion` **18 inchangée**, zéro gameplay.

**Diagnostic posé (à vérifier puis exploiter) :** la couche 3D `structures3d.ts` accepte déjà des **`unites`** (`EntiteStructure` avec `owner`/`type` — calque posé par l'atelier), et **`Lab3d.svelte` l'alimente** (assemblage depuis l'état filtré) — mais **`GameCanvas.svelte` ne transmet jamais `unites`** : le vrai jeu ne nourrit pas le calque. Le branchement est donc un travail d'intégration, pas de modélisation.

## Mission — livrables dans l'ordre

- **L1 — Branchement GameCanvas** : alimenter le calque `unites` de `structures3d` depuis l'état filtré **à chaque tick** (miroir exact de `Lab3d.svelte` : id, type, q, r, owner) — passer par un **module partagé** (comme `rendement.ts` : zéro logique dupliquée labo/jeu) ; les unités 3D doivent suivre **l'interpolation du playback** (mouvements animés) et l'élévation de leur case ;
- **L2 — Mapping type → modèle 3D, data-driven** (`visuel3d.json`, catalogue atelier) : `guerrier` → Script de Base, `archer` → Sentinelle Réseau ; **tout type SANS modèle 3D garde son sprite billboard** (liste data-driven — les ~24 autres types continuent en 2D sans régression) ; quand Erik modélise un nouveau type en atelier, il apparaît en 3D au jeu **sans nouveau code** (le catalogue pilote) ;
- **L3 — Surcouche des unités 3D** : pour une unité rendue en 3D, le **sprite d'art est masqué** mais le conteneur projeté reste — **barre de PV, anneau de sélection, badge de fortification, badge de pop** suivent la structure 3D ; accent propriétaire cohérent avec l'owner du modèle 3D ; les **fonctions pures de décision** (`clickAction`/`rightClickAction`) inchangées — le picking 3D existant doit sélectionner une unité 3D au clic (vérifier que le picking teste le calque unités ou la case) ;
- **L4 — Vérification & livraison** : tests (unité avec modèle → 3D visible + sprite masqué ; unité sans modèle → sprite ; playback suit ; sélection au clic), e2e existants verts, **GUI sur vraie partie solo** (le mode solo d'Erik est le banc parfait : fondation, mouvements, combat), perf 40×40 (60 FPS maintenu), captures `dev-logs/captures-unites3d/`, CI, prod saine, **acceptation visuelle d'Erik** (c'est son art).

## Critères d'acceptation
- En vraie partie 3D, le Guerrier et l'Archer s'affichent avec **les modèles 3D d'Erik**, aux bonnes cases, bonne couleur propriétaire ;
- Une unité SANS modèle garde son sprite (test) ; un nouveau modèle ajouté au catalogue apparaît sans code (test du mapping) ;
- Barre de PV / sélection / fortification suivent l'unité 3D ; playback animé suivi ;
- Performance ≥ 60 FPS ; 868+ tests verts, typecheck vert, CI deploy vert, schemaVersion 18.

## Périmètre interdit (cette session)
Modéliser de nouvelles unités (c'est le travail d'atelier d'Erik — le branchement doit les accueillir automatiquement) ; renommage V3 ; espionnage avancé ; tout changement gameplay/moteur/serveur ; **inspecter l'état du répertoire avant de commit** (retouches d'atelier d'Erik en cours — ne pas les aspirer).

## Fin de session
Rapport court `REPORT-CHANTIER-UNITES3D.md`, arrêt, remise de la main au pilot.
