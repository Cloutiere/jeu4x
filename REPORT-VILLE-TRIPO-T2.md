
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
