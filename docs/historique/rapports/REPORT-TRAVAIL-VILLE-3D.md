# REPORT-TRAVAIL-VILLE-3D — Worked tiles en 3D, toggle optimiste, rayon de cultivation

**Date** : 08/09/2026 · **Handoff** : `HANDOFF-TRAVAIL-VILLE-3D.md` · **Statut** : livré, en attente d'acceptation visuelle d'Erik.

## Ce qui a été livré

### M1 — Contours de worked tiles en vraie 3D
- Nouveau `apps/web/src/lib/render3d/marqueurs3d.ts` : calque Three.js (`Marqueurs3D`) ajouté à la scène au même titre que terrain/structures. Les cadres des cases travaillées sont des **polylignes Line2** (`three/examples/jsm/lines`) posées SUR le relief — chaque sommet à l'élévation de sa tuile (eau plus basse, colline plus haute, +0.045 de surélévation anti z-fighting), **épaisseur constante en pixels écran** à tous les zooms (`LineMaterial` écran-espace), couleur joueur, depthWrite off, renderOrder 4 (conventions des effets existants).
- **Complément (retour d'Erik sur capture)** : le contour de POSSESSION de la case de ville elle-même, resté en PixiJS projeté (donc à plat, ignorant l'élévation), est lui aussi passé dans le calque 3D (miroir du trait 2D : inset 6, largeur 4, couleur joueur) — plus aucun hexagone 2D plaqué en mode 3D. Capture `3d-7-contour-ville-3d.png`.
- **Complément 2 (retour d'Erik sur capture)** : l'anneau de SÉLECTION (unité, ville) — l'hexagone ambre — est lui aussi passé dans le calque 3D (miroir du trait 2D : ambre inset 8 largeur 5 + liseré sombre inset 16, posé sur le relief de la case sélectionnée). Captures `3d-8-selection-unite-3d.png`, `3d-9-selection-ville-3d.png`. En 2D, l'anneau Pixi d'origine est conservé.
- Nouveau `apps/web/src/lib/render3d/contours.ts` : géométrie PURE (aucune dépendance Three) — `contourHexTile` (cadre d'une tuile, 6 sommets à l'élévation donnée) et `contourRegion` (contour extérieur générique). Testée unitairement.
- En 3D, le tracé PixiJS projeté (l'« hexagone plaqué 2D » du signalement) est **désactivé** pour les worked tiles ; le calque 2D conserve son rendu propre (double trait), alimenté par le même état effectif.

### M2 — Toggle immédiat, fin des « +/− »
- 2D et 3D : les marqueurs sont dessinés depuis `effectiveWorkedTiles(view, city)` (miroir exact de la file d'ordres, déjà utilisé par le prédicat de clic) — **apparition/disparition immédiate au clic**, sans marqueur d'attente. Les ordres restent soumis au serveur et validés comme avant (file `SetWorkedTile` inchangée) ; en cas de refus serveur, retour à l'état valide via le chemin d'erreur existant.
- **Supprimé** : le bloc des marqueurs « +/− » (`drawPendingMarker` + son bloc de rendu dans `rebuildOverlay`) — code mort retiré. Les indicateurs de file du panneau ville (CityPanel) sont inchangés.

### M3 — Rayon de cultivation
- `contourRegion(centre, rayon, size, elevationDe)` trace le **pourtour extérieur de l'anneau hexagonal** (collection d'arêtes de frontière par voisin axial en face + chaînage par suivi de bord/wall-follower) — **générique pour un rayon quelconque** (test unitaire rayon 1 = boucle de 18 arêtes, rayon 2 = boucle de 30 arêtes ; l'aqueduc étendra le rayon sans changement de rendu).
- Ligne seule couleur joueur, **aucune teinte de tuile** ; visible 2D (tracé Pixi) et 3D (Line2) ; affiché quand la ville est sélectionnée (défaut proposé — calibrage à l'œil par Erik).
- Fog : l'anneau est géométrique (le contour reste une boucle fermée même si une case du rayon est inexplorée) ; `elevationDe` retombe à 0 sous le fog — aucune donnée de terrain révélée, la portion masquée reste une simple ligne.
- Le rayon vient de `workRadiusOf(city.buildings)` (data-driven).

## Fichiers
- **Ajoutés** : `apps/web/src/lib/render3d/contours.ts`, `apps/web/src/lib/render3d/marqueurs3d.ts`, `apps/web/tests/contours3d.test.ts`.
- **Modifiés** : `apps/web/src/lib/render/GameCanvas.svelte` (calque marqueurs3d, overlay 2D en état effectif, suppression des « +/− », contour cultivation 2D).

## Vérifications
- **Tests** : 991 verts — rules 750, web **169** (+6 nouveaux `contours3d.test.ts` : rayon 1, rayon 2 (>1, génériCITÉ M3.4), élévation par tuile, fog, cadre de tuile), server 72. INTERACTION-3D (worked tiles) inchangés et verts.
- **Typecheck** : 0 erreur (4/4 packages). `schemaVersion` **19 inchangée** ; zéro touch à `packages/rules`, au serveur, au gameplay (nombre de worked tiles, file d'ordres, validation).
- **Vraie partie solo** (captures `dev-logs/captures-travail-ville-3d/`, partie FETFEB, Grèce vs bot, tour 31, ville c1 pop 4, 4 citoyens assignés) :
  - `3d-2-cultivation-et-worked.png` / `3d-6-finale-zoom-ville.png` : 3D — cadres worked tiles + grand contour de cultivation rouge suivant le relief ;
  - `3d-3-toggle-retrait-immediat.png` : retrait de (1,14) → contour disparu au clic (compteur marqueurs 8→6, aucun « − ») ;
  - `3d-4-toggle-ajout-immediat.png` : ajout de (1,13) → contour apparu au clic (6→8, aucun « + ») ;
  - `2d-ville-selectionnee-contours.png`, `2d-toggle-retrait-immediat.png` ((-1,15)), `2d-toggle-ajout-immediat.png` ((0,15)) : mêmes comportements en 2D.

## Notes / limites
- Épaisseur des lignes = pixels écran (lisible à tout zoom) ; sous le fog, l'élévation du contour retombe à 0 (approximation locale, ne révèle rien).
- Le contour de cultivation ne s'affiche que pour la ville SÉLECTIONNÉE (choix par défaut du handoff §M3.5) — une ligne à changer si Erik préfère « toujours visible ».
- Note de session : la partie XM9NBE d'Erik s'est terminée en défaite pendant les vérifications (overlay « Défaite » constaté) — elle était déjà au tour 40 contre le bot ; aucune donnée modifiée en dehors des ordres worked tiles de test sur la nouvelle partie solo FETFEB.
- Les serveurs de dev préexistants (:5174 vite / :8787 wrangler) ont été réutilisés ; l'instance wrangler redondante lancée par la session sur :8788 a été arrêtée.

## Fin de session
Non commité/poussé — sur demande explicite d'Erik (handoff §5). Handoff non archivé, PROJET.md/PILOT-HANDOFF.md non édités.
