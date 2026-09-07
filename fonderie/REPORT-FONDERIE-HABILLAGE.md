# REPORT-FONDERIE-HABILLAGE — Session du 07/09/2026

## Livrables

- **`fonderie/modeles/guerrier_v2.glb`** — le Guerrier 2.2 habillé au style STYLE-3D, **en attente de validation par Erik** (aucune promotion, aucun commit) :
  - **4 024 triangles** (le mesh 2.2 intact + 24 tris du ruban de visière) — compteur honnête du visualiseur ✓
  - **3 matériaux**, définitions reprises À L'IDENTIQUE du `guerrier.glb` v1 (facteurs en linéaire, cf. journal #7) : `corps` (translucide α 0.55, glyphes 256² émissifs), `neon` (#3DFFCE ×3.5, jamais teinté), `accent_joueur` (blanc neutre, teinté par propriétaire)
  - origine au SOL (Ymin = 0), corps recentré X/Z sur les pieds, **face -Z** (voir journal #5 : la source faisait face +Z, pivot 180° appliqué), Y-up, un nœud, zéro scène superflue
  - habillage : arêtes néon en LINES (1 135 segments : dièdre > 40° + frontières de matériau, **0 triangle**), fil émissif du tranchant (30 segments), cœur néon pectoral + colonne de données en LINES, ruban de visière (+24 tris)
- **`fonderie/modeles/guerrier_v2_ZONES.glb`** — DEBUG de la partition (1 matériau plat par zone + arêtes). Sélectable dans le visualiseur. À ne PAS promouvoir.
- **`fonderie/outils/habiller-guerrier.mjs`** — l'outil d'habillage (découpe par heuristiques géométriques, tous les seuils dans la table `S` en tête de fichier). Modes debug : `--tranches` (bandes de Y), `--calibre` (mesures fente/taille), `--carte` (carte ASCII de profondeur du visage), `--tete`, `--zoom Ymin Ymax [hab]`.
- **`fonderie/outils/raster.mjs`** — rasteriseur PNG partagé (z-buffer + Lambert, 5 vues ortho) : toute la session a été itérée sans navigateur. `rendre-png.mjs` réécrit dessus.
- **`fonderie/outils/inspecter-glb.mjs`, `analyser-zones.mjs`, `mesurer-guerrier.mjs`** — diagnostics du mesh source.
- **`fonderie/viewer.js` + `index.html`** — mode **A/B v1-v2** (bouton : `guerrier.glb` à gauche, `guerrier_v2.glb` à droite, mêmes caméra/réglages, hauteurs égalisées — les tailles réelles se calibrent en jeu via `visuel3d.json`), teinte J1/J2/J3 et fil de fer s'appliquant aux deux, modèle par défaut = `guerrier_v2.glb`.
- **`fonderie/outils/glb.mjs`** — paramètre optionnel `nom` (rétro-compatible, les 22 scripts existants inchangés).

## Découvertes importantes (à lire avant toute retouche)

1. **La source fait face +Z** (visière lisible depuis la caméra +Z, confirmé sur rendu corrigé + navigateur). L'outil applique un pivot 180° autour de Y : les seuils "avant" (visière, écusson, genoux, ceinture, cœur, lame en +X) sont calibrés APRÈS pivot. Ne pas supprimer le pivot.
2. **La posture 2.2 : épée levée pointant haut-arrière (+Z après pivot, +X), corps voûté en avant** (poitrine à z ≈ -0.15, haut du dos à +0.40, poignée d'épée très dégagée à x ≈ +0.5). C'est la silhouette validée — on a habillé, pas resculpté.
3. **Le casque a une ouverture irrégulière au dos-centre** (Y ≈ 1.70-1.82, artéfact du mesh source) : en jeu elle montre l'intérieur sombre du casque (corps = doubleSided) — invisible à l'échelle du jeu. Le néon de visière n'est PAS visible de dos (FrontSide). Si Erik la veut bouchée, c'est une retouche dédiée (session suivante).
4. **La fente de visière est une gorge peu profonde** sur la plaque faciale (pas un trou) : traitée par zone néon (bande Y 1.735-1.825) + ruban néon épousant la surface (+24 tris, pattern v1 « visière émissive »).
5. **Recentrage sur le corps, pas sur les bornes** : les pieds sont centrés sur la tuile, la pointe de l'épée dépasse le cercle tuile à X = +1.27 (l'épée est grande dans la pose validée). Choix défendable — Erik tranche.

## Journal des itérations

1. **v0 — pipeline** : écriture de l'exporteur-réutilisateur (glb.mjs + `nom`), raster PNG maison. Bug : minY/maxY pris sur la somme des sommets au lieu du centroïde → pieds vides, axe NaN. Corrigé.
2. **Bug du z-buffer raster** : `d = dot(p, avant)` garde le PLUS LOIN quand `avant` pointe vers la caméra → toutes les vues étaient des « rayons X » (surface opposée affichée). **C'est ce bug qui avait fait conclure « face -Z » à tort.** Corrigé (`d = -dot`), orientation re-vérifiée, pivot 180° ajouté.
3. **v1 zones** : première partition lisible ; défauts : ceinture trop large (mangeait le bas-ventre), visière posée sur le crâne, genoux débordant derrière la jambe pliée, hauts d'épaules classés « jambes » par la cascade de secours.
4. **Calibration** : `--calibre` (étranglement de taille à Y ≈ 0.80-0.87, face du casque), `--carte` (profondeur du visage), `--tete` (gros plan). Ceinture resserrée sur la créase, casque recentré (tête décalée à x ≈ +0.035), genoux par jambe (bandes différentes, la jambe arrière est plus basse) + test de normale frontale.
5. **La fausse fente** : la « concavité » détectée côté -Z était l'arrière du casque (ouverture dorsale, cf. découverte #3). La vraie visière est une gorge de la plaque faciale +Z (avant pivot).
6. **Visière** : bande diagonale essayée puis abandonnée ; zone néon resserrée sur la ligne de fente (Y 1.735-1.825) + ruban suivant la surface (12 tranches, +24 tris).
7. **Matériaux** : premiers facteurs écrits en sRGB brut → corps plus clair que le langage v1 (v1 écrit en linéaire via `THREE.Color`). Aligné à l'identique sur les valeurs du `guerrier.glb` v1. (Fausse piste avalée au passage : le « corps invisible » de l'A/B était un problème de repère caméra dans mon diagnostic, pas un défaut du GLB — vérifié dans le navigateur réel.)
8. **Validation navigateur réel** : `guerrier_v2.glb` chargé par le GLTFLoader du visualiseur : 4 024 tris au compteur honnête, 3 matériaux nommés, ~6 draw calls ; A/B fonctionnel (2 racines, teintes et wireframe appliqués aux deux) ; teinte accent vérifiée programmatiquement (accent seul change, néon constant). Captures `captures/ab-*.png`.

## Ce qu'Erik doit regarder dans le visualiseur

- http://localhost:5178/ (`lancer-fonderie.bat` si le serveur n'est plus lancé) : **A/B v1-v2** activé, puis chaque modèle seul ; teintes J1/J2/J3 ; Bloom on/off ; Fil de fer (juger la découpe) ; Grille tuile (origine au sol, corps centré, épée débordant la tuile à +X) ; `guerrier_v2_ZONES.glb` au menu pour la partition.
- Points probables de retouche (seuils tous dans la table `S` de `habiller-guerrier.mjs`) : hauteur/largeur de la bande de visière, taille de l'écusson, genoux, ceinture, densité des arêtes néon (seuil dièdre 40°), position du cœur.
- Décisions attendues : recentrage corps vs bornes (découverte #5), ruban de visière gardé ou remplacé par la seule zone, ouverture dorsale du casque à boucher ou pas (découverte #3).

## Périmètre respecté

- Lecture : handoff, STYLE-3D.md, FONDERIE.md, REPORT-FONDERIE-3D.md, `image_ref/guerrier_2.2.glb`, `image_ref/guerrier.jpg`, `fonderie/`. Le jeu, `apps/`, `packages/`, `visuel3d.json` : jamais ouverts.
- Écritures : `fonderie/` uniquement (outils, modeles, captures, viewer, index, glb.mjs, ce rapport).
- **Rien ne se commit sans la demande explicite d'Erik.**

## Suite (hors de cette session)

1. Itérations visuelles d'Erik → ajustements de seuils (`node outils/habiller-guerrier.mjs` re-génère tout en < 2 s).
2. Validation à l'œil → promotion `assets-src/modeles/` + intégration jeu (remplacement du guerrier.glb, `echelle` dans `visuel3d.json`) : session séparée.
