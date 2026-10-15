# REPORT-ICONES-BATIMENTS — Icônes bâtiments et merveilles (bannière + menu)

Mission exécutée le 15/10 d'après HANDOFF-ICONES-BATIMENTS.md (décisions Erik 14/10, D1-D5). Client seul, `schemaVersion` 27 inchangé, moteur/serveur/3D/vue ville dormante/Chroniques intouchés.

## Livré

- **Pipeline** : 42 profils `icone-batiment-<id>` / `icone-merveille-<id>` (mode « icône » 64×64, sources `new_icones/buildings/` et `new_icones/wonders/` `_trsp.png` — JAMAIS commitées, `new_icones/` ajouté au `.gitignore`) → `assets-src/exports/` → `apps/web/public/art/icone_batiment_<id>.png` / `icone_merveille_<id>.png`. Le mapping français→anglais vit dans les profils (`aqueduc`→`aqueduct`, `tribunal`→`courthouse`, `atelier_de_leonard`→`leonardo`, `nations_unies`→`onu`, `programme_apollo`→`appolo`…). 42/42 cuites RGBA vérifiées au pixel (64×64, aucune quasi vide).
- **Mapping pur** (`icones-unites.ts` étendu, test-first) : `nomIconeBatiment` / `nomIconeMerveille` (`icone_batiment_<id>` / `icone_merveille_<id>` = ID moteur), `iconeBannierePour` généralisée (unités, bâtiments ET merveilles — D1), `urlIconeProduction` (URL `/art/…` pour l'UI HTML, alias R-148 unités inclus).
- **textures.ts** : champs `iconesBatiments` / `iconesMerveilles` par ID moteur, chargement OPTIONNEL (absent → `null` = repli) — jamais de trou visuel.
- **Bannière (D1)** : le cercle production affiche l'icône du bâtiment OU de la merveille en tête de file (même position/échelle que l'icône d'unité, `rayonProd × 1,6`) ; initiale en repli sinon (D3 universel).
- **Menu (D2)** : icône par ligne des 3 onglets (Unités/Bâtiments/Merveilles) et par rang de la file, alignée au libellé ; PNG absent → `onerror` masque l'`img` (ligne propre, aucun trou).
- **Tests** : `icones-unites.test.ts` 31 (couverture mapping + bannière 3 sortes + URL pour TOUS les bâtiments/merveilles du moteur). Web : **659/659** ; svelte-check 0 erreur.

## Inventaire des icônes

- **Bâtiments : 21/22 couverts.** Manquante : `atelier` (aucune source Erik dans `new_icones/buildings/`) → repli initiale. Dès qu'Erik dépose `new_icones/buildings/<nom>_trsp.png`, un profil `icone-batiment-atelier` + une cuisson suffisent (zéro code).
- **Merveilles : 21/21 couvertes** (dont `grande_bibliotheque` ← « Great Library of Alexandria », `projet_manhattan` ← « manattan_project » [sic], `theatre_de_shakespeare` ← « theatre_shekespeare » [sic] — noms de fichiers d'Erik respectés).

## Vérification GUI (devtmp/icones-batiments-gui.mjs, captures `dev-logs/captures-icones-batiments/`)

12/12 asserts, vrais clics PanneauVille (worker 8794 + Vite dédié). Juge visuel : **6/6 pass** sur les captures (bannière grenier, bannière stonehenge, repli initiale, file, onglet bâtiments, onglet merveilles).

- t1 — grenier en tête → icône bâtiment dans le cercle prod, initiale masquée ;
- t2 — stonehenge en tête → icône merveille dans le cercle prod ;
- t3 — file 2 rangs (merveille + bâtiment) avec icônes chargées ; onglets Bâtiments/Merveilles avec icônes alignées au libellé ;
- t4 — art volontairement absente (requêtes PNG avortées = chemin de repli réel) → cercle = initiale « S », pas d'image cassée ; ligne du menu sans `img`.

## 🔶 À l'œil d'Erik

1. **Calibre bannière** : échelle `rayonProd × 1,6` (partagée avec les icônes d'unités) — `GameCanvas.svelte`, une constante.
2. **Calibres menu (D5, séparés)** : `.rang-icone` 20×20 (file) et `.opt-icone` 18×18 (lignes) — CSS PanneauVille, éditables à l'œil.
3. **Style** : les icônes d'Erik gardent leur fond doré circulaire intégré — dans le cercle prod de la bannière elles lisent « médaillon dans médaillon » 🔶 (à l'œil).
4. **atelier** : initiale « A » jusqu'à livraison d'une source.
