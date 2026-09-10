
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
