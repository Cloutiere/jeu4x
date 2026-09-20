# REPORT — NETTETÉ-DÉZOOM (mipmaps) + PROTO BARRE 3 VIES

Date : 20/09/2026 (après-midi) · Base : 1b43536 (CALIBRATION-UNITES)

## 1. Netteté-dézoom : correctif déjà livré, validé aux deux extrêmes

Mission initiale : « guerrier importé SVG net au zoom mais embrouillé au dézoom ».
Constat : le correctif demandé existe **déjà** — `avecMipmaps()` dans
`apps/web/src/lib/render/textures.ts` (autoGenerateMipmaps + filtrage
trilinéaire sur tous les PNG d'art, guerrier cuit j1..j7 inclus), committé
dans 1b43536 le matin même.

Validation empirique de bout en bout (labo `#/labo-rendu`, rendu réel
GameCanvas, serveur vite local) :

- **ZOOM_MAX (2.25)** : guerrier net — `zoommax-guerrier.png`.
- **ZOOM_MIN (0.5)** : guerrier propre, sans scintillement ni traits disparus —
  `dezoom-mips-on.png` (+ agrandissement ×8 nearest via PowerShell/.NET).
- **Preuve A/B** : `avecMipmaps` neutralisé temporairement
  (`autoGenerateMipmaps=false`, `mipmapFilter='nearest'` = minification brute),
  recapture à zoom identique, **diff de 1267 px / 12 600** avec l'état mipmaps
  actives — le réglage agit bien. Code restauré à l'identique du HEAD
  (`textures.ts` sans diff).

Conclusion : si Erik revoit du flou, c'est un build antérieur à 1b43536 —
relancer la coquille Electron / redéployer le bundle.

Captures : `dev-logs/captures-mipmaps/`.

## 2. Proto barre de PV en 3 compartiments (demande Erik)

« Lignes qui séparent en 3 la barre » — 1 compartiment = 1 vie (hpMax = 3 sur
tous les types, units.json source unique).

Implémentation (`GameCanvas.svelte` uniquement) :

- Création : 3 sprites `hpFill0/1/2` (cellule 70/3 px, encoche de 3 px du fond
  `0x1b1b22`), même gabarit 80×10 collé au sommet du sprite (CALIBRATION-UNITES).
- Boucle de rendu : chaque cellule est pleine si sa vie est acquise, le remplissage
  couvre `ratio*3 - i` pour la vie en cours ; cellule **cachée** quand la vie est
  perdue ; couleur = accent du propriétaire (inchangée).

Captures des 3 états (facteur de PV simulé temporairement pour la démo, puis
restauré) : `dev-logs/captures-barre-3-vies/` — `barre-3-vies.png`,
`barre-2-vies.png`, `barre-1-vie.png`.

Variantes proposées à Erik (non tranchées) : encoches plus marquées, vidage
gauche→droite, contours par cellule.

## 3. Vérifications

- Tests web : **330/330**.
- Typecheck svelte-check : **0 erreur** (13 warnings préexistants).
- `textures.ts` identique au HEAD ; seul `GameCanvas.svelte` est modifié.

## 4. Non couvert / ouvert

- Rendu des barres dans le rendu 3D (Lab3d) non vérifié avec le proto.
- Décision d'Erik attendue sur le style des compartiments avant généralisation
  (barres de production/villes restent continues).
