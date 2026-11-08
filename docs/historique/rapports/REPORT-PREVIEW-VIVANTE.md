# REPORT-PREVIEW-VIVANTE — Préview de trajet au survol + visuel AAA

**Livrée 18/10** (handoff décisions Erik 19/10, D1-D5). Client seul, zéro gameplay, `schemaVersion` 27 inchangée.

## Ce qui est livré

- **D1 — Préview vivante** : unité amie sélectionnée + survol d'une tuile = la préview COMPLÈTE du chemin de clic droit s'affiche et suit le curseur. MÊME calcul que la préview maintenue — un seul appel au cache `hoverCache.chemin` (BFS `pathTo`), priorité de destination, fog R-161 et PM hérités sans aucune règle nouvelle. Sortie de survol/désélection = disparition propre (recalcul au changement d'UI, existant `onNewUi`).
- **D2 — Geste inchangé** : clic droit maintenu = préview + confirmation au relâchement (code intact, `droitTraite`); le survol n'intercepte AUCUN clic (préview passive, même case = zéro redraw).
- **D3 — Visuel AAA data-driven** : nouveau module pur `apps/web/src/lib/render/preview-vivante.ts` portant le bloc `STYLE_PREVIEW_VIVANTE` (couleurs/alphas/épaisseurs/tirets/pointes/badge) + `coupeTourCourant` (tour courant = les `mp` premières cases, or plein ; suite du trajet = tirets discrets) + `previewVivanteAutorisee` (exclusions D5). Rendu : contour sombre sous le tracé or, pointes par case, grande pointe d'arrivée, badges (1)(2)… aux ruptures de tour, anneau de destination (rouge si ennemi visé, existant).
- **D4 — Perf** : pointermove throttlé à UNE décision par frame (`requestAnimationFrame`, les mousemove intermédiaires ne rafraîchissent que la position) ; cache BFS par (unité, tuile) inchangé ; même tuile = aucun redraw (zéro allocation par frame au repos) ; 60 FPS mesurés au mouvement continu (assert e2e ≈60 FPS).
- **D5 — Exclusions** : vue ville, relecture (`playback`), ordres non modifiables, unité ennemie sélectionnée → prédicat pur `previewVivanteAutorisee` (les modales/saisies texte couvrent le canvas, le pointermove n'atteint jamais la carte).

## Tests

- `tests/preview-vivante.test.ts` — 15 verts : coupe tour courant (propriétés), exclusions D5, bloc de style complet, câblage source (gate `droitMaintenu` supprimé du DESSIN mais geste de confirmation intact, throttle rAF, prédicat D5, unicité de l'appel au cache = propriété « même calcul que la préview maintenue »).
- Suite web complète : **691/691** ; svelte-check : **0 erreur**.

## E2E GUI (`devtmp/preview-vivante-gui.mjs`, ports wrangler 8787 = proxy Vite figé)

Partie réelle solo, guerrier sélectionné — 6/6 asserts verts, captures `dev-logs/captures-preview-vivante/` :
1. `1-survol-multitours` — préview complète au survol, badges (1)(2) ;
2. `2-survol-fog` — troncature R-161 : or plein (1), suite discrète (2), arrêt sur la case « Inexploré » (3) avec anneau de destination ;
3. `3-deselection-disparition` — clic à côté = désélection, couche flèche vide ;
4. `4-survol-couture` — survol près de la couture Est (🔶 à l'œil) ;
5. FPS ≈60 au balayage continu du curseur (assert ≥45).

## Pièges consignés

- **Pixi v8 : les classes s'appellent `_Graphics`/`_Text`** — un détecteur par `constructor.name === 'Graphics'` donne un FAUX NÉGATIF (première passe e2e « survol muet » alors que la préview était dessinée) ; `endsWith('Graphics')` et comptage récursif (les badges sont emboîtés).
- **Zoom départ ×1,75 : 5 cases à l'est = hors viewport** — les cibles de survol e2e doivent être proches (≤2 cases) ou la caméra recentrée sur la cible.
- **`centerOn` sur une tuile inexplorée = écran noir** (caméra dans la brume) — recentrer sur l'unité avant les étapes suivantes.
- Le re-clic sur l'unité sélectionnée la RE-SÉLECTIONNE (alternance de pile) — la désélection e2e passe par un clic sur une case vide connue.

## 🔶 À l'œil Erik (bloc de calibrage)

Toutes les valeurs sont dans `STYLE_PREVIEW_VIVANTE` (`preview-vivante.ts`), calibrables sans toucher au rendu :
`couleurTourCourant` 0xffd54f / `alphaTourCourant` 0.95 / `largeurTourCourant` 6 — `couleurSuite` 0xffe082 / `alphaSuite` 0.35 / `largeurSuite` 3 / `tiretSuite` 18 / `trouSuite` 14 — `couleurContour` 0x2b2620 / `alphaContour` 0.8 / `surplusContour` 3 — `taillePointeCase` 16 / `taillePointeArrivee` 30 — `couleurBadge` 0xffd54f.

À trancher à l'œil : lisibilité de la suite discrète sur forêt/désert, poids du contour, taille des pointes, survol SUR ENNEMI (anneau rouge existant, non capturé — aucun ennemi visible en ouverture de partie solo).
