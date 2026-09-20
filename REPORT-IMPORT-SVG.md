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

## 7. État

Validé localement, **en attente du verdict d'Erik** (A/B atelier : `unite_guerrier` vs `unite_guerrier_avant`). Commit/push sur demande explicite. Serveurs dev arrêtés.
