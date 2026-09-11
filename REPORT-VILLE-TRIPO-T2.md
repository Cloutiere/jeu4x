
## Addendum (08/09, même session — demande d'Erik) : VILLAGE barbare en .glb

- **Nouvel asset** `image_ref/barbare_tripo_2.glb` (9 592 tris, 1 matériau texturé, origine au sol,
  1,0 × 0,59 × 0,87) → **`assets-src/modeles/village_barbare_v1.glb`** + `public/modeles/`.
- **Outil fonderie** `outils/preparer-structure-tripo.mjs` : réécriture GLB sans re-encodage
  (binaire intact) — la texture du source reste octet pour octet en baseColor ET est branchée en
  emissiveMap (force 0.7) : **même rendu de luminosité que la ville**. Couleurs d'ORIGINE
  conservées (aucune teinte joueur ni rouge barbare — le .glb n'a pas de matériau `accent_joueur`,
  le calque ne teinte donc rien).
- **Spec** `visuel3d.json` §`structures.villageBarbare3d` : `{ glb, echelle: 0.65, rotation: 0 }`
  (calée sur le dôme procédural : rayon 0,26 + mur 0,33). Absent = fallback dôme procédural.
- **GameCanvas** : même bascule que les villes — les villages sortent du planificateur quand la
  spec existe, rendus par un monde `UnitesGLBWorld` dédié. **Les huttes restent procédurales**
  (décision implicite : Erik a fourni UN asset « village » ; même traitement disponible sur
  demande).
- 186 tests verts (2 nouveaux), svelte-check 0 erreur. Capture fonderie :
  `captures/village-barbare-v1.png`.

## Addendum 2 (08/09 — demande d'Erik) : HUTTES en .glb

- **Nouvel asset** `image_ref/hutte_tripo.glb` (6 446 tris, 1 matériau texturé, origine au sol,
  1,0 de haut) → **`assets-src/modeles/hutte_v1.glb`** + `public/modeles/`.
- Même traitement que le village (`preparer-structure-tripo.mjs`, force 0.7) : couleurs d'ORIGINE,
  luminosité par texture aussi en emissiveMap.
- **Spec** `visuel3d.json` §`structures.hutte3d` : `{ glb, echelle: 0.3, rotation: 0 }` (calée sur
  le dôme procédural rayon 0,17). Absent = fallback dôme procédural. Export `HUTTE_TRIPO3D`
  (le nom `HUTTE3D` était déjà pris par la spec procédurale du dôme).
- **GameCanvas** : même bascule que les villages — huttes hors planificateur quand la spec existe,
  monde `UnitesGLBWorld` dédié.
- 188 tests verts, svelte-check 0 erreur.

## Addendum 3 (08/09 — demande d'Erik) : TUILE prairie en .glb

- **Nouvel asset** `image_ref/prairie.glb` (4 994 tris, 1 matériau texturé) →
  **`assets-src/modeles/prairie_v1.glb`** + `public/modeles/`.
- L'asset ÉPOUSE déjà l'hexagone (empreinte 0,858 × 1,0 pour un hex 0,866 × 1,0) :
  **échelle 1.0, rotation 0**. `dy` -0.095 cuit dans le nœud (nouveau paramètre de
  `preparer-structure-tripo.mjs` — translation JSON, binaire intact) pour que sa
  surface AFFLEURE le haut du prisme : substrat procédural conservé dessous (coins
  de l'hex), **glyphes de rendement (voies de nourriture) toujours visibles
  au-dessus**. Couleurs d'ORIGINE, émissif 0.7.
- **Spec** `visuel3d.json` §`structures.tuilePrairie3d` (absent = substrat seul).
- **`unitesglb.ts`** : capacité des pools paramétrable (défaut 512) — le calque
  prairie utilise 2048 (jusqu'à ~1600 tuiles sur 40×40).
- **GameCanvas** : monde dédié `prairiesGlb`, une instance par tuile prairie de
  l'état filtré (visible = pleine, explorée = atténuée fog, inexplorée absente).
- 189 tests verts, svelte-check 0 erreur.

## Addendum 4 (08/09 — demande d'Erik) : TUILE plaine SOUS GRENIER en .glb

- **Asset source** `image_ref/plaine_on_tripo.glb` (8 757 tris, 1 matériau texturé, empreinte
  hexagonale comme la prairie) → **`assets-src/modeles/plaine_grenier_v1.glb`**.
- **Les bus sont PEINTS dans la texture** (aucun relief) : nouvelle méthode de ciblage —
  couverture néon par triangle en espace UV (texture décodée via `sharp`, seule dépendance
  externe, déjà dans le dépôt ; NODE_PATH requis), puis regroupement en 5 bandes parallèles
  détectées automatiquement (-0.430, -0.237, **+0.102 = centre**, +0.247, +0.441).
- **Variante demandée** : bus central ALLUMÉ, 2 bus de chaque côté en **cuivre éteint** :
  - triangles des bus latéraux → matériau `bus_cuivre` (couleur pleine `#B87333`, metal 0.6,
    rough 0.6, ZÉRO émissif — 386 tris) ;
  - carte émissive = texture source **masquée** (régions UV des bus latéraux noircies,
    `captures/plaine-grenier-emissive.jpg`) — le bus central seul brille.
- **Condition de jeu** : tuile `plaine` TRAVAILLÉE par une ville possédant le **grenier**
  (R-66 : +2 nourriture sur plaine). Rendu par le même calque que les prairies (monde dédié,
  capacité 2048). dy -0.099 cuit (affleure le prisme, glyphes de rendement au-dessus).
- **Spec** `visuel3d.json` §`structures.tuilePlaineGrenier3d`. 190 tests verts, svelte-check 0 erreur.

## Addendum 5 (08/09 — retour d'Erik en ligne) : la tuile grenier REMPLACE le substrat

- **Échelle corrigée 1.0 → 2.0** : l'asset fait la MOITIÉ de l'hexagone (le dy cuit -0.099
  passe à -0.198 avec l'échelle d'instance — la surface affleure toujours).
- **Masquage du substrat** : `TerrainWorld.update(tiles, recouvertes?)` — pour les tuiles
  plaine sous grenier (helper partagé `clesPlaineGrenier()` dans GameCanvas), la face
  supérieure procédurale et ses glyphes sont sautés ; **les parois restent** (pas de trou
  dans le plateau).
- 190 tests verts, svelte-check 0 erreur.

## Addendum 6 (08/09 — retour d'Erik en ligne) : la prairie REMPLACE aussi le substrat

- **Prairie : échelle 1.0 → 2.0** + masquage du substrat procédural sous les tuiles prairie
  (haut + glyphes sautés, parois conservées) — même mécanique que la plaine grenier.
- Helper généralisé `clesTuilesGlb()` : clés des tuiles remplacées (prairies + plaines sous
  grenier), partagé terrain ↔ calque .glb.
- **Note condition plaine grenier** : la tuile n'apparaît que sur une plaine TRAVAILLÉE par une
  ville possédant le grenier CONSTRUIT — dans une partie neuve, rien à voir tant qu'aucun
  grenier n'est bâti (comportement attendu, confirmé à Erik).
- 190 tests verts, svelte-check 0 erreur.

## Addendum 7 (08/09 — clarification d'Erik) : les DEUX variantes de plaine

- **plaine_v1.glb** (base, bus central allumé + bus latéraux cuivre éteint — la version
  fabriquée par `habiller-plaine-grenier.mjs`) : REMPLACE le substrat procédural sur
  **TOUTES** les tuiles plaine. Spec §`structures.tuilePlaine3d` (echelle 2.0).
- **plaine_grenier_v1.glb** (l'asset « plaine on » fourni par Erik, TOUS les bus allumés,
  texture intacte + emissive 0.7 via `preparer-structure-tripo.mjs`) : posée à la place de
  la base sur les plaines TRAVAILLÉES par une ville au grenier (R-66).
  Spec §`structures.tuilePlaineGrenier3d` (echelle 2.0).
- `clesTuilesGlb()` : prairies + plaines (toujours recouvertes) ; la variante grenier est
  choisie dans le calque selon `workedTileOwner()` + `buildings.includes('grenier')`.
- 191 tests verts, svelte-check 0 erreur.

## Addendum 8 (08/09 — retour d'Erik) : hauteur des tuiles alignée

- Les REBORDS des deux modèles n'avaient pas la même hauteur cuite : prairie à 0.000,
  plaine à −0.016 (plateau −0.041) — la plaine paraissait enfoncée.
- **dy plaine recuit : −0.099 → −0.182** (rebord affleurant à 0, comme la prairie ;
  plateau conservé en creux d'origine). Mesure par percentiles des faces supérieures
  (normales > 0.9) dans les deux fichiers.
- Fichiers régénérés et repromus ; ni spec ni code changés.

## Addendum 9 (08/09 — retour d'Erik, correction de l'addendum 8)

- L'alignement sur 0 (rebord prairie) SUR-CORRIGEAIT : la plaine passait au-dessus.
- **Repère correct = le niveau du rebord de la PLAINE (−0.016 en unités jeu)** : prairie
  recuite dy −0.095 → **−0.103** (rebord prairie −0.016 = rebord plaine ; plateaux
  −0.032 vs −0.041, quasi égaux). dy plaine revient à −0.099.
- Fichiers prairie/plaine régénérés et repromus.

## Addendum 10 (08/09 — hauteur : la forêt est l'étalon)

- Constat terrain (Erik) : 3 hauteurs visibles — prairie trop haute, plaine trop basse,
  référence = la tuile forêt PROCÉDURALE (top à y=0 exactement).
- Le rendu de profil des fichiers déployés (`captures/tuiles-profil.png`) montrait des
  fichiers affleurants ±0.016 : les écarts venaient des CACHES edge Cloudflare qui servaient
  des versions périmées DIFFÉRENTES par URL (chaque correctif dy ne propageait pas partout).
- **Solution définitive : renommage v2** (URLs jamais mises en cache) —
  `prairie_v2.glb` (dy -0.095), `plaine_v2.glb` (dy -0.182), `plaine_grenier_v2.glb`
  (dy -0.182) : les trois rebords à 0.000 = niveau forêt. Anciens v1 retirés de
  `public/modeles/`, specs et tests mis à jour. 191 tests verts, svelte-check 0 erreur.

## Addendum 11 (11/09 — cause racine des hauteurs fausses trouvée)

- **Le parseur du jeu (`parserModeleGLB`) ignorait les transformations des nœuds glTF** :
  le dy d'affleurement cuit par `preparer-structure-tripo.mjs` (translation du nœud) était
  perdu à l'instancing → tuile posée SUR le sol (base au niveau du haut de la forêt).
  La plaine (habiller-plaine-grenier) cuit son dy DANS LES SOMMETS — d'où les deux
  comportements divergents observés.
- **Correctif** : `parserModeleGLB` applique désormais `matrixWorld` aux géométries
  (mesh + lignes) dont le transform n'est pas l'identité — toute la classe de bug éliminée
  pour les futurs assets. Les 23 unités (nœuds identités) : aucun impact.
- Test de régression ajouté (translation de nœud répercutée dans la géométrie parsée).
- **État des hauteurs attendu en jeu** : prairie rim 0.000, plaine rim 0.000,
  plaine grenier rim 0.000, forêt procédurale 0.000 — tout affleure.
- 192 tests verts, svelte-check 0 erreur.

## Addendum 12 (11/09 — calage fin d'Erik) : plateau de la plaine relevé

- Prairie et forêt alignées (addendum 11). Reste : le PLATEAU utile de la plaine est
  ~0.12 plus bas que celui de la prairie (profils internes différents des deux modèles).
- **survol 0.12** posé sur `tuilePlaine3d` et `tuilePlaineGrenier3d` — calibrage EN DIRECT
  sans re-cuisson des fichiers (champ data-driven existant). Erik ajuste la valeur à l'œil.

## Addendum 13 (11/09 — demande d'Erik) : TUILE montagne en .glb

- **Asset** `image_ref/montagne_tripo.glb` (4 684 tris, 1 matériau, 0,998 × 0,314 × 0,998) →
  **`assets-src/modeles/montagne_v1.glb`** + `public/modeles/`.
- **Pose demandée** : base de la montagne au niveau 0 (= le sommet des autres tuiles), son
  propre sommet culminant plus haut. dy −0.31 cuit (le terrain `montagne` est à elev 0.62 :
  0.62 + (0 − 0.31) × 2 = 0). Couleurs d'origine, emissive 0.7.
- **Spec** `visuel3d.json` §`structures.tuileMontagne3d` (echelle 2.0) ; substrat procédural
  masqué (haut + glyphes, parois conservées) via `clesTuilesGlb()` ; rendu par le calque
  .glb des tuiles. 193 tests verts, svelte-check 0 erreur.

## Addendum 14 (11/09 — retour d'Erik) : montagne orientée

- `rotation: 30` sur `tuileMontagne3d` — l'hexagone du modèle était à 30° de la grille
  (symétrie 60° de l'hexagone : +30 et −30 équivalents). Data-driven, sans code.

## Addendum 15 (11/09 — retour d'Erik) : rotation exacte de la montagne

- Mesure des sommets de contour : modèle à 15°+60k, grille à 30°+60k → **rotation 15**
  (30 sur-rotait). Data-driven.

## Addendum 16 (11/09) : signe de la rotation

- rotY(θ) du jeu déplace les angles en −θ : modèle 15° → viser 30° donne **rotation −15**
  (+15 et +30 plaçaient les sommets à 0° puis −15°, jamais sur la grille).
