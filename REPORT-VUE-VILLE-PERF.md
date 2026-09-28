# REPORT-VUE-VILLE-PERF — Lag et crash du zoom vue ville : correctifs de rendu (27/09)

**Mission exécutée (L0→L4), zéro gameplay/moteur/serveur/protocole, 2D et 3D rendu inchangés visuellement.** Le diagnostic du handoff §2 a été vérifié ligne par ligne : **confirmé intégralement** (tous les sites cités existent aux numéros indiqués, y compris après les commits récents — aucun rapport à corriger). **PAS DE COMMIT** : arrêt L5 pour approbation d'Erik (décisions D2-D5 vetoables).

## État final

- **Tests : 1 411 verts** (rules 897 · web **398** — 7 nouveaux `vue-ville-perf.test.ts` · server 116). **Typecheck 4/4.** `schemaVersion` 23 intouché, aucune règle, aucun ordre, aucun changement serveur.
- Fichiers modifiés : `apps/web/src/lib/render/GameCanvas.svelte`, `apps/web/src/pages/Game.svelte`, **nouveau** `apps/web/src/lib/render/pool-textes.ts`, **nouveau** `apps/web/tests/vue-ville-perf.test.ts`.
- Mesures et protocole : `dev-logs/perf-vue-ville/` (AVANT.md, APRES.md, bruts JSON). Captures : `dev-logs/captures-vue-ville-perf/` (vue ville finale, bandeau d'erreur d'injection, vue carte après sortie).
- Partie de validation solo **V4U5U2** (privée, 1 humain + 4 bots, tour 10) — abandonnable depuis le lobby.

## Diagnostic confirmé (constats d'exécution dans `dev-logs/perf-vue-ville/AVANT.md`)

1. **Entrée** : les 3 rebuilds (tuiles/entités/surcouche) tombaient dans la frame **t=0.00 de l'animation** (5/5 mesures), plus un rebuild de tuiles du ResizeObserver à t≈0,12 (masquage de la colonne de droite).
2. **Sortie** : **7 rebuilds en transit** (flags consommés à t=0.00 + re-invalidation de fin d'anim de CORRECTIFS-VUE-VILLE) — la surcouche était reconstruite 2× par cycle.
3. **`CityView.svelte`** montait SYNCHRONIQUEMENT au `vueVille.set` (Game.svelte) — sa construction partageait la frame de démarrage.
4. **`renderer.resize`** depuis le tick de fin d'animation (`poseVueVilleCible`) et changement de DPR possible en pleine anim (`suivreDpr`).
5. **Crash** : le `catch` du ticker annulait rAF + roue de secours puis **`throw err`** dans le callback rAF → exception non interceptée → boucle morte, application figée. (`Error: rebake... ` textures.ts : la classe d'erreur transitoire citée au §2 correspond au partage de Graphics détruits — mécanisme inchangé.)

## Changements par cause

### L1 · Crash — le ticker ne meurt plus (D2)
- `tick()` et `step()` (rendu Pixi/Three compris) sont blindés : toute erreur est **journalisée** (`console.error` + `window.__tickError`), affichée dans un **bandeau discret** (« Erreur d'affichage (N) — la partie continue », fermable, coin haut-droit du canvas), puis les 3 calques + caméra sont **re-invalidés** (la frame suivante repart d'un état propre — une couche à moitié construite se répare toute seule).
- Zéro avalement en silence : le bandeau réapparaît tant que l'erreur se reproduit (compteur).
- **Test d'injection** : hook dev `__game.injectTickError()` — vérifié en GUI : la boucle survit, le bandeau apparaît, les frames suivantes rendent (capture).
- Autres sites rAF vérifiés : seuls les labos Atelier/Lab3d ont des boucles rAF, et elles planifient la frame suivante AVANT le corps (une erreur n'y coupe pas la boucle) — hors chemin de jeu, intouchés.

### L2 · Rebuilds sortis des frames de transition (D3 + D5)
- Pendant les 450 ms d'animation, la frame ne fait **qu'interpoler la pose** (comme la molette). Les flags d'invalidation restent posés et sont consommés APRÈS la transition.
- **Budget par frame** : au plus UN calque reconstruit par frame — tuiles → entités → surcouche sur 3 frames consécutives (au lieu des 3 couches dans la même frame).
- **`CityView` montage différé** : nouveau signal `onVueVillePret` émis à la fin de l'animation d'entrée ; la page ne monte le menu qu'alors (la sortie le démonte immédiatement, inchangé).
- **Sortie (D5)** : plus de double passe — la re-invalidation de fin de sortie reste nécessaire (le dernier rebuild datait de l'état vue ville : unités masquées, rendements confinés) mais tombe hors frame animée, étalée par le budget. Le correctif M2 (restauration des unités) est préservé et re-vérifié en GUI.
- **Compromis D3 (à l'œil d'Erik)** : pendant l'anim, les calques « anciens » restent visibles (unités et surcouche de guerre disparaissent à l'ARRIVÉE, pas au départ) ; le menu apparaît à l'arrivée (~450 ms après le double-clic).

### L3 · Complexités (D4)
- **(a)** `effectiveWorkedTiles` + `new Set` sortis de la boucle par tuile du rayon (calculés une fois par rebuild — O(tuiles × ordres) → O(ordres)).
- **(b)** **Pool des Text de rendement** (`pool-textes.ts`, générique, testé sans Pixi) : clé texte+style (style constant du pool), réutilisation au rebuild suivant (relâchement au lieu de destruction), capacité bornée par clé (64 🔶), purge au démontage AVANT `app.destroy`. Aucun `new Text` par passe de rendements.
- **(c)** Culling toujours calculé depuis la pose CIBLE en vue ville — garanti par construction (les rebuilds ne tournent plus pendant la transition).
- **(d)** `renderer.resize` JAMAIS en frame animée : la fin d'animation recalcule la pose SANS resize et **reporte** tout écart de dimensions ou de DPR à la première frame non animée (le ResizeObserver garde son comportement autorisé).

### Instrumentation (dev uniquement, conservée)
- Journal `__game.perf()/perfReset()` : durées de chaque frame (`tickInner`), de chaque frame complète (`step`, rendu compris) et de chaque rebuild, avec l'état de transition. Zéro coût en production (`import.meta.env.DEV`).

## Mesures (machine de dev, état tour 10 — valeurs absolues petites, invariants machine-indépendants)

| | AVANT | APRÈS |
|---|---|---|
| Rebuilds dans les frames d'animation | 4 (entrée) / 7 (sortie) | **0 / 0** (8/8 répétitions, les 2 zooms) |
| Frame d'animation la plus lourde (`step`) | 2,9-6,9 ms (portait anim + rebuilds + menu) | **0,5-1,1 ms** (interpolation seule) |
| Charge de rebuild | concentrée dans l'anim | étalée : tuiles → entités → surcouche, 1 calque/frame, après l'anim |
| Surcouche par aller-retour | 2× dont 1 en anim | 2× (les deux états diffèrent), toutes deux hors anim |

Chiffres complets : `dev-logs/perf-vue-ville/APRES.md`.

## Ce qu'Erik valide en ligne (L5)
1. **Ressenti du double-clic** sur plusieurs villes (petites/rayon 2 avec Tribunal) : l'animation doit être fluide comme la molette ; à l'arrivée : rayon illuminé + rendements + menu — les unités/surcouche de guerre disparaissent À L'ARRIVÉE (compromis D3), le menu apparaît à l'arrivée.
2. **Sortie** (Fermer / Échap / double-clic hors ville) : unités et surcouche reviennent ~2 frames après l'arrivée de la caméra.
3. **Spam** : cliquer frénétiquement ville/Échap pendant les animations — l'application ne doit plus jamais figer.
4. **Bandeau d'erreur** : le look du marqueur (rouge sombre, coin haut-droit) — devrait n'apparaître qu'en cas de vraie erreur.
5. Hors vue ville : rien n'a changé (molette, sélection, mêlée, relecture — mêmes chemins, mêmes tests verts).

## 🔶 Ouverts (calibrage à l'œil)
- Durée d'anim 450 ms inchangée ; budget « 1 calque par frame » (3 frames pour une invalidation complète) ;
- look et libellé du bandeau d'erreur ;
- capacité du pool de Textes (64/clé) ;
- si le ressenti le demande : raccourcir la fenêtre sans menu (monter CityView à ~200 ms au lieu de la fin d'anim).

## Périmètre respecté
Aucun changement moteur/serveur/protocole/règles (`git status` : seuls GameCanvas.svelte, Game.svelte, pool-textes.ts, vue-ville-perf.test.ts + journaux dev-logs ; les modifications préexistantes d'Erik — CadreLobby.svelte, config.ts, captures — n'ont pas été touchées). REPLAY-RESOLUTION : zéro code touché, tests verts, chemin de relecture inchangé (invalide après reconnexion — comportement documenté, inchangé). 3D : le chemin `mode3dActif` conserve ses rebuilds par données (budget appliqué au seul chemin 2D), flag prod `rendu3d: false`.
