# REPORT-FONDERIE-HABILLAGE-TRIPO — Session du 07/09/2026

## Livrable (en attente de validation par Erik)

- **`fonderie/modeles/knight_v3.glb`** — le knight Tripo adapté au style STYLE-3D **en mode peintre** (géométrie + UV du source intactes, habillage repeint) :
  - **5 492 triangles** (mesh Tripo intact, expandu à l'export — `construireGLB` ne gère pas les indices) + **370 segments néon en LINES** (0 tri) — compteur du visualiseur : 5 492 tris, 2 matériaux, ~2 draw calls ✓
  - **2 matériaux** : `accent_joueur` (LE corps entier : baseColor texture repeinte 1024², alpha BLEND 0.55, doubleSided, émissive = carte glyphes/liserés, strength 0.9) et `neon` (visière + tranchant en LINES, #3DFFCE, strength 3.5, jamais teinté)
  - origine au SOL (Y 0 → 2.6), **face -Z** (le knight Tripo regarde +Z, pivot 180° — même cas que le 2.2), Y-up, un nœud, zéro scène superflue, échelle **2.6 unités** dans le fichier
  - texture 1024² (STYLE §4 dit 512 ; 1K choisi car la carte porte liserés + glyphes + jitter —PNG maison, ~140 Ko) : **à montrer à Erik** (artefact à valider ou rétrograder)
  - **corps OPAQUE** (α 1.0, alphaMode OPAQUE) et **facteur de luminance 6.6** — choix explicite d'Erik au tour 2 (voir découverte #7). Pour revenir au translucide STYLE : `alphaCorps: 0.55` dans la table `S`
- **Cartes à plat** : `captures/knight-carte-base.png` (corps gris-vert désaturé #949C9A + liserés cyan + jitter de panneaux) et `captures/knight-carte-emissive.png` (noir + liserés modérés + 141 barres de glyphes) — l'émissive déclenche le bloom.
- **`fonderie/outils/habiller-knight.mjs`** — l'outil (tous les seuils dans la table `S`) : modes `--preview` (5 vues source), `--calibre` (pieds/bandes Y/histogramme X), `--zones` (rendu coloré visière/lame pour vérifier la sélection avant peinture).
- **`fonderie/outils/glb.mjs`** — paramètre optionnel `imageEmissive` (2e image/texture pour l'émissive ; rétro-compatible, les 22 scripts v1 inchangés).
- **`fonderie/viewer.js` + `index.html`** — bouton A/B généralisé : **chevalier.glb (en jeu) à gauche vs modèle sélectionné à droite** (knight_v3 par défaut), hauteurs égalisées à 2.6 ; le compteur honnête compte maintenant les matériaux des LineSegments ; modèle par défaut = `knight_v3.glb`.

## Découvertes / décisions (à lire avant toute retouche)

1. **Le knight Tripo regarde +Z** (confirmé par rendus --preview avant/après pivot) → pivot 180°, il fait face **-Z** comme le jeu.
2. **La pose est penchée EN ARRIÈRE** : pieds à z +0.07..+0.28, tête en avant à z -0.27..-0.04 (espace pivoté), lame balayant l'avant-haut côté +X. Pose conservée (mode peintre, pas de re-sculpture).
3. **Recentrage sur les pieds** (décision v2 #5 reprise) : dx +0.046, dz -0.190 appliqués — les pieds sont au centre de la tuile, la lame déborde devant (z min -1.34 à l'échelle 2.6) et le corps penche en arrière. Alternatif (centrage bornes) rejeté : les pieds seraient au bord arrière de la tuile.
4. **Zones néon sélectionnées géométriquement** (pas de lecture de la texture JPEG Tripo, indéchiffrable sans décodeur) : visière = triangles de la tête (y 0.78-1.0) côté avant (z < -0.06 après recentrage) ; lame = x > 0.16, y > 0.42, z < -0.15 (le gant est exclu par le seuil z). Vérifiées visuellement sur `captures/knight-zones-*.png` (rouge = visière, bleu = lame) : la sélection tombe juste.
5. **1 057 arêtes ignorées comme coutures UV** (saut > 0.06 dans l'atlas) : les liserés néon s'interrompent aux coutures — invisible à l'échelle de jeu, mais c'est le premier réglage à bouger (`S.seuilUV`) si des liserés manquent.
6. **Bug d'export détecté au navigateur** : indices ignorés par `construireGLB` → le loader lisait 6 965 sommets = 2 322 « tris ». Corrigé en expandrant positions/normales/UV à l'export (comme les 22 v1). Vérifié au compteur : 5 492.
7. **Le pipeline de rendu écrase `material.color` avec la teinte** : `appliquerTeinte` du visualiseur faisait `color.set(teinte)` à chaque chargement — tout facteur > 1 du glb était effacé (le corps v1 n'a pas le souci car son matériau `corps` n'est PAS la claque teintée). Corrigé : la teinte **multiplie** désormais la couleur de base du glb (`userData.couleurBase` × teinte). ATTENTION pour l'intégration jeu : le code de teinte du jeu devra multiplier aussi, sinon le facteur 6.6 du corps sera perdu en jeu.
8. **Luminance du corps opaque** : à facteur 2.2 (équivalent v1) le corps opaque rend très sombre dans ce pipeline (constaté, cause exacte du pipeline non creusée). Erik a choisi **6.6** après test à l'écran de 2.2 / 4.4 / 6.6. En translucide (α 0.55), l'assombrissement sera plus fort encore — à retester si on revient au STYLE translucide.
9. **Tour 3 (demande d'Erik : 3 teintes accent supplémentaires, pas de rouge franc — réservé aux barbares)** : J4 bleu `#3D9AFF`, J5 jaune `#FFE23D`, J6 rose `#FF3DB8` (magenta, distinct du rouge barbare) ajoutées au visualiseur (`viewer.js` TEINTES + boutons `index.html`). Vérifiées à l'écran sur le knight : les trois teintent le corps sans toucher au néon. Captures `captures/teinte-j4-bleu.png`, `teinte-j5-jaune.png`, `teinte-j6-rose.png`. **Validation d'Erik attendue** ; l'ajout au jeu est une session séparée.
10. **Tour 4** : J7 rouge `#FF3D3D` ajoutée — **réservée aux barbares** (infobulle « barbares uniquement »). Capture `captures/teinte-j7-rouge-barbares.png`. Erik a validé l'ensemble et demandé le commit de l'atome (fonderie complète) + push.

## Journal des itérations

1. Parsing source : 5 492 tris, 6 965 sommets, UV + texture JPEG cuite, 1 matériau, origine au sol, hauteur 1.0, X/Z symétriques (bornes).
2. `--preview` → face +Z confirmée ; pivot appliqué partout (positions + normales).
3. `--calibre` → pieds z +0.19/x -0.046, pose penchée arrière, lame à +X.
4. `--zones` → visière/lame bien placées (captures rouges/bleus), 370 segments néon.
5. Peinture : jitter de panneaux par triangle (relief discret, PRNG déterministe graine 20260907), liserés dièdre > 35°, glyphes posés À L'INTÉRIEUR des triangles UV (jamais hors îlot), émissive = noir + glyphes/liserés.
6. Export + navigateur réel : bug indices (2 322 tris) → expandu → 5 492 au compteur honnête, 2 matériaux, ~2 draw calls.
7. Validation navigateur : A/B contre chevalier.glb (le knight_v3 lit « holographique » : corps sombre translucide, liserés cyan, glyphes), teinte J1 appliquée au corps seul (le néon ne bouge pas), grille tuile : pieds centrés. Captures `captures/ab-knight-chevalier.png`, `captures/navigateur-knight-j1-grille.png`.
8. **Tour 2 (demande d'Erik : enlever la transparence)** : `alphaCorps: 1.0` + alphaMode OPAQUE ; chasse au facteur de luminance (découvertes #7/#8) ; facteur 6.6 cuit dans le fichier après choix d'Erik. Captures `captures/navigateur-knight-opaque.png` (vue d'ensemble) et `captures/navigateur-knight-opaque-2.png`.

## Ce qu'Erik doit regarder dans le visualiseur

- http://localhost:5178/ — `knight_v3.glb` par défaut ; bouton **A/B chevalier** ; teintes J1/J2/J3 (le corps entier doit changer, le néon rester #3DFFCE) ; Bloom on/off ; Fil de fer ; Grille tuile.
- **Décisions attendues** :
  1. Texture 1024² OK ou rétrograder à 512 ;
  2. recentrage pieds vs bornes (découverte #3) ;
  3. densité/lisibilité des liserés (seuil dièdre 35°, largeur 1.7 px) et des glyphes (141 barres) ;
  4. visière en LINES suffisante ou vouloir une zone pleine ;
  5. `guerrier_v2.glb` + `guerrier_v2_ZONES.glb` (session rejetée précédente) : supprimer ou garder ?
- Tous les seuils sont dans la table `S` de `outils/habiller-knight.mjs` — régénération en quelques secondes.

## Critères d'acceptation (état)

- ≤ 5 500 tris : **5 492 ✓** ; ≤ 3 matériaux nommés : **2 (`accent_joueur`, `neon`) ✓** ; origine au sol ✓ ; face -Z ✓ ; échelle 2.6 ✓ ; teinte J1 lisible sur le corps sans toucher au néon ✓ (vérifié navigateur).
- Reste : **validation à l'œil par Erik** (aucune promotion, aucun commit).

## Périmètre respecté

- Lecture : handoff, STYLE-3D.md, FONDERIE.md, REPORT-FONDERIE-HABILLAGE.md, `image_ref/glowing+knight+3d+model.glb`, `fonderie/`. Jeu/`apps/`/`packages/`/`visuel3d.json` : jamais ouverts. `guerrier_v2.glb` laissé en place (décision de suppression à Erik).
- Écritures : `fonderie/` uniquement.
- **Rien ne se commit sans la demande explicite d'Erik.**

## Suite (hors de cette session)

1. Itérations visuelles d'Erik → ajustements de `S` (`node outils/habiller-knight.mjs`).
2. Validation → promotion `assets-src/modeles/` + intégration jeu (remplacement chevalier ou guerrier, `echelle` dans `visuel3d.json`) : session séparée.
