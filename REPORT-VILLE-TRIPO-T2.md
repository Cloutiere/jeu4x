
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
