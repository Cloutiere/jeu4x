# REPORT-IMPORT-SVG — Pipeline d'import des SVG Recraft d'Erik + guerrier bronze

**Mission tenue (handoff IMPORT-SVG).** Zéro gameplay, zéro 3D : `assets-src` + outillage et la fiche catalogue uniquement. Rien n'est committé — validation locale avec captures d'abord (règle établie).

## 1. Choix de l'outil de rastérisation

**sharp 0.35.2 (libvips + librsvg), déjà présent dans `node_modules/.pnpm`** — zéro dépendance réseau, zéro installation. Vérifié au préalable : `cairosvg` absent de Python, `playwright` absent, mais sharp embarque le rendu SVG de librsvg avec anti-aliasing propre.

Pièges rencontrés et traités dans le code :
- **pnpm n'hoiste pas sharp** : résolution directe dans `node_modules/.pnpm/sharp@*/node_modules/sharp` (fonction `chargerSharp()`) ;
- **`extract` doit précéder `resize`** dans la chaîne sharp (l'ordre inverse est réinterprété sur l'image d'entrée → « bad extract area ») ;
- **rendu déterministe** : densité fixée par appel (`density: 144` → canvas 2048²), jamais de DPI ambigu ;
- le SVG Recraft porte un **bloc `<metadata>` C2PA** juste après `<svg …>` : l'extraction du calque accent passe par `indexOf('<svg')`, pas par le premier `>` du fichier.

## 2. Le pipeline (`assets-src/tools/import_svg.mjs`)

`node tools/import_svg.mjs <profil>` lit `import_svg.profiles.json` (Erik désigne explicitement chaque SVG — le pipeline n'importe QUE ces fichiers-là) et produit **exactement là où `sync-art` attend** : `assets-src/exports/<stem>.png` + `<stem>_accent.png`.

Deux modes de cible :
- **`unite`** (256×320) : bbox du contenu calculée à haute résolution, mise à l'échelle LANCZOS, ancré bas-centre avec marges du profil (guerrier : 14/6/10). Base et accent partagent la MÊME découpe → alignement au pixel.
- **`hex`** (tuile 224×256) : le SVG = décor SANS bordure, couvert puis **clippé dans la géométrie exacte du jeu** (pointy-top, largeur h·√3/2 ≈ 221,7, comme `hex_points` de generate.py) et **contour `#2B2620` 2,5 px tracé en code**. Testé par fixtures + test d'intégration (coins transparents, centre opaque, contour au sommet).

**Le calque accent** : sous-SVG ne contenant que les formes à remplissage blanc pur (`path|rect|circle|ellipse|polygon` — 19 paths blancs chez le guerrier), rendu avec la même géométrie que la base, puis **normalisé blanc exact** (le LANCZOS laisse sinon des px (254,254,254) — le `--check` de generate.py les refuse).

**Les gates (échec = refus + rendu de diagnostic `dev-logs/captures-import-svg/diag-*.png` avec cadres rouges) :**
- **G1 blanc pur** : tout pixel opaque de l'accent = (255,255,255) — seule tolérance : semi-transparence d'anti-aliasing en bord (blanc reste blanc, alpha partiel) ;
- **G2 pas de trou** : aucune zone transparente (alpha 0) enfermée de plus de 16 px² — les fentes de 1 px aux jonctions de paths blancs adjacents sont de l'AA (100 fentes ≤ 11 px² détectées chez le guerrier, sans effet : la base blanche reste visible dessous) ; un vrai trou (fixtures anneau) est rejeté ;
- **G3 dimensions** exactes du profil (porte pure `gateDimensions`, testée) ;
- **G4 poids** ≤ 300 Ko/PNG (guerrier : 46 Ko + 4 Ko).

**Idempotence** : deux exécutions → SHA-256 identiques (testé, plus vérifié en ligne de commande).

## 3. Profil du guerrier (`guerrier-bronze`)

SVG `full-body-game-sprite-of-an-ancient-bronze-age-war.svg` (racine, non commité — fichier d'Erik) → stem `unite_guerrier`, 256×320, marges 14/6/10, ancré bas, **`echelle: 0.75`** (retour d'Erik du 20/09 : « taille de base un peu grande » — le dessin occupe 75 % de sa valeur initiale dans le canvas, soit 228 px de haut contre 304, toujours posé au sol ; le PNG reste 256×320, seul le contenu est réduit). Sortie : `unite_guerrier.png` 30 Ko + `unite_guerrier_accent.png` 3 Ko, propagés dans `apps/web/public/art/` par `pnpm sync-art`.

**Retrait du remplacement** : dans `generate.py`, la ligne `"unite_guerrier": (256, 320, unite_guerrier)` est **commentée** (le painter reste intégralement dans le fichier). Retour arrière en un commit : réactiver la ligne + `python generate.py` (ou `git revert`).

**A/B atelier** : les PNG du painter ont été extraits du HEAD git → `exports/unite_guerrier_avant{,_accent}.png`, et une fiche « **Guerrier (peintre, AVANT import — comparaison A/B)** » (`unite_guerrier_avant`) est ajoutée au catalogue à côté du guerrier importé. La fiche du guerrier porte la mention « **IMPORT SVG (Recraft, import_svg.mjs)** ».

## 4. Vérification (M3)

- **Tests du convertisseur** `assets-src/tools/import_svg.test.mjs` : **8/8 verts** (`node --test assets-src/tools/import_svg.test.mjs`) — blanc impur rejeté, blanc pur+AA accepté, vrai trou rejeté, fentes AA acceptées, G3, résolutions produites (256×320, 256×256, hex 224×256 avec clip+contour), idempotence SHA-256 ;
- **Suite web** : **312/312 verts** (dont `atelier-catalogue.test.ts`, le filet de complétude, avec les nouvelles fiches) ;
- **Typecheck** : **4/4** (svelte-check 0 erreur, 13 warnings préexistants) ;
- **generate.py --check** : conforme pour l'import ; restent `unite_colon_accent` et `unite_chevalier_accent` « accent contient du non-blanc » — **préexistants au HEAD** (chantier atelier accents en cours, hors périmètre IMPORT-SVG) ;
- **Zéro gameplay** : `packages/rules`, serveur, 3D intouchés (diff limité à : outil + profils + tests + `generate.py` 1 ligne commentée + `catalogue.ts` + PNG exports/public).

## 5. Captures (`dev-logs/captures-import-svg/`)

- `atelier-guerrier-import.png` — fiche du guerrier importé (taille d'origine) : base, **accent Joueur 1 (menthe)**, **accent Joueur 2 (bleu vif)** teintés à la volée, mention IMPORT SVG ;
- `atelier-guerrier-import-75pc.png` — fiche après réduction à 75 % ;
- `atelier-guerrier-avant-peintre.png` — fiche A/B de l'ancien sprite peintre (même mécanique d'accent) ;
- `partie-depart-selection.png` — début de partie solo : le guerrier importé sur la carte, accent menthe J1, à côté du colon ;
- `partie-guerrier-j1-selectionne.png` — guerrier sélectionné : anneau de sélection, panneau « UNITÉ Guerrier PV 3/3 PM 1/1 », sprite et accent nets ;
- `partie-guerrier-j1-75pc.png` — guerrier à 75 % sur la carte (partie HWBJEN), proportionné au colon ;
- `diag-guerrier-bronze-trous.png` — rendu de diagnostic du gate G2 (preuve du refus avant tolérance AA documentée).

Note : le handoff disait « orange J2 » — la palette décidée le 13/09 (textures.ts §PLAYER_COLORS) est **J1 menthe néon, J2 bleu vif**, rouge réservé aux barbares (cuit dans leur base) ; la vérification a été faite contre cette palette réelle. Le bot de la partie solo (Grèce) reste sous le brouillard : les accents J2 et barbare sont vérifiés dans l'atelier, qui teinte avec les couleurs runtime.

## 6. Mode d'emploi — prochain asset (5 lignes)

1. Erik pose le SVG (Recraft payant = droits commerciaux ; déclaration IA Steam) à la racine ou dans `image_ref/` et le désigne ;
2. Dans `assets-src/tools/import_svg.profiles.json`, ajouter un profil : `"<nom>" : { "svg": "<chemin>", "stem": "<nom_de_catalogue>", "cible": { "mode": "unite", "w":256, "h":320, "margeX":14, "margeHaut":6, "margeBas":10, "echelle":1 } }` (ou `"mode":"hex","w":224,"h":256` pour une tuile) — `echelle` règle la taille du dessin dans le canvas (0.75 = 75 %) ;
3. `node assets-src/tools/import_svg.mjs <nom>` — les gates refusent avec diagnostic si le blanc n'est pas pur ou s'il y a un trou ;
4. Dans `generate.py`, commenter la ligne correspondante de `entities` (le painter reste) ; pour l'A/B, extraire l'ancien PNG du HEAD git sous `*_avant` et ajouter la fiche dans `catalogue.ts` (constante `IMPORTES`) ;
5. `pnpm sync-art` (apps/web) puis `pnpm test` — l'asset apparaît dans l'atelier et en partie.

## 7. Correctif « détails dans la zone d'accent » (retour d'Erik du 20/09)

**Constat** : en jeu, l'accent teinté (composé AU-DESSUS de la base — convention painter, `GameCanvas.buildUnitContainer` et atelier `composer()`) recouvrait les détails sombres de la zone d'accent : le bouclier du guerrier apparaissait comme un disque plein, rayons invisibles.

**Pourquoi pas l'inversion de l'ordre de composition** : l'accent SOUS la base effacerait la couleur joueur de **toutes les unités peintre** (leurs bases sont opaques dans la zone d'accent — le painter pose ses détails en gris DANS le calque accent, pas dans la base). Le correctif est donc fait là où réside l'écart : **le pipeline**.

**Correction (import_svg.mjs)** — convention painter appliquée au SVG : les détails sombres de la zone d'accent (luminance < `SEUIL_ENCRE` = 140, le seuil du painter, mesurée sur le rendu complet à haute résolution) sont **PERCÉS en transparence dans le calque accent**. À l'écran, la teinte s'applique au champ du bouclier tandis que les rayons de la **base** restent visibles à travers — sous toutes les teintes, sans toucher au moteur ni à l'atelier. Garde-fou : refus si aucun détail n'est percé (SVG dont les détails seraient hors zone blanche → ils seraient masqués par la teinte).

**G2 révisé** (« couverture de l'accent ») : un pixel transparent de l'accent n'est légitime que hors silhouette ou sur un pixel de base pas franchement clair (lum < `SEUIL_CLAIR` = 210 — les franges d'AA détail↔blanc plafonnent à ~200 mesurés ; le champ nu est ~250). Un trou sur le champ blanc = zone blanche manquante = refus. Tests : 10/10 (trou sur champ clair rejeté, détails percés acceptés, percement vérifié sur l'import).

**Lisibilité au rendu réel** (sprite 256×320 affiché à 128×160, échelle 0.5 — captures `partie-guerrier-details-visibles.png` et `partie-guerrier-zoom-details.png`) : l'étoile à 8 rayons reste discernable à l'échelle carte (~30 px de bouclier) et nette en zoom/atelier (`atelier-guerrier-accents-perces.png`). Si Erik la juge trop fine à l'échelle 64 px, deux leviers : (a) épaissir les rayons dans le SVG source Recraft (préféré — c'est le trait d'Erik), (b) ajout d'un paramètre de dilatation du percement dans le pipeline.

**Vérifié** : tests convertisseur 10/10, web 312/312, `generate.py --check` conforme pour le guerrier (restent colon/chevalier, préexistants). Non committé — attente du verdict d'Erik.

## 8. Variante cuite Joueur 1 (décision Erik 20/09 — « on oublie l'accent actuel »)

Nouveau mode du pipeline : `profil.remplacements` = { couleurSource → couleurCible } — remplacement **dans le texte SVG** (attributs `fill` et `stop-color`, insensible à la casse), rendu **sans calque accent** : l'asset porte sa couleur, le moteur n'a plus à teinter. Sortie : `unite_guerrier_j1.png` (256×320, sans `_accent`).

Profil `guerrier-j1-cuit`, couleurs demandées par Erik :

| Source | Cible | Occurrences dans le SVG |
|---|---|---|
| `#FFFFFF` | `#B84239` | **19** (champ du bouclier) |
| `#FEFEFE` | `#D55B52` | **0** — absent du fichier |
| `#8C8C8C` | `#8A3029` | **0** — absent du fichier |

Le SVG ne contient pas `FEFEFE` ni `8C8C8C` en littéraux ; les quasi-blancs réels sont les **stops du dégradé 5** (`#FAF9F9 → #FEFEFD`, l'ombrage du bouclier), mappés vers `#D55B52`. Le rendu pixel ne montre pas de gris `8C8C8C` (la rampe d'AA s'arrête à `#C8C8C8`, ce sont des franges d'anti-aliasing, pas des aplats). Si Erik veut d'autres correspondances, il suffit d'ajouter des paires au profil (une couleur source absente ne bloque pas — signalée ×0 ; un total nul est refusé).

**Périmètre** : la variante est visible dans l'atelier (fiche « Guerrier — variante cuite Joueur 1 », sans accent) — **ET le moteur l'utilise** : câblage fait le 20/09 (retour d'Erik « ce sont encore les anciennes couleurs ») — `textures.ts` : chargement optionnel `unite_guerrier_j1` + map `GameTextures.cuites` (clé `<type>@<owner>`) ; `GameCanvas.buildUnitContainer` : variante cuite = sprite unique SANS teinte d'accent ; atelier : la variante « accent Joueur 1 » de la fiche `unite_guerrier` affiche le PNG cuit (« Joueur 1 (cuit) »), repli teinte runtime si PNG absent. J2 et barbare inchangés (teinte runtime) — autres couleurs à definir avec Erik. Vérifié en partie solo : le guerrier J1 porte le bouclier rouge cuit (`partie-guerrier-j1-cuit-en-jeu.png`).

**Vérifié** : tests convertisseur 11/11 (nouveau test : les trois couleurs cibles présentes à l'identique, pas de `_accent`), web 312/312, svelte-check 0 erreur. Captures `atelier-guerrier-j1-cuit.png` (cuite) et `atelier-guerrier-j1-teinte-runtime.png` (teinte runtime, pour comparaison). Non committé.

## 9. État

**Accepté par Erik le 20/09** (« tout est parfait ») : percement des détails d'accent, variante cuite Joueur 1 et câblage moteur. Commité et poussé sur sa demande.
