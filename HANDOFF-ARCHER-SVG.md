# HANDOFF-ARCHER-SVG — Remplacement du sprite archer par le SVG gothic-steampunk d'Erik (recoloriage ciblé du carquois)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X. Lis `HANDOFF.md` §4 (conventions), le rapport `docs/historique/rapports/REPORT-IMPORT-SVG.md` (pipeline, pièges sharp) et la mémoire du chantier dans `PROJET.md` (sections import SVG / accents). Source unique des palettes : `accents.json` / `accents.ts` (8 palettes × 3 teintes : #FEFEFE→reflet, #FFFFFF→base, #8C8C8C→ombre, tolérance ±2). **2D uniquement.** Les SVG d'Erik à la racine ne se committent JAMAIS.

## 1. Objectif (demande d'Erik du 21/09)

Remplacer le sprite de l'**archer** par son SVG `full-body-game-sprite-of-a-fierce-gothic-steampunk.svg` (racine du dépôt, 452 Ko). Deux consignes explicites :

1. **Le carquois n'est pas dans les bonnes couleurs** : l'agent doit **identifier les couleurs du carquois** dans le SVG et les modifier pour les ramener à la convention d'accent du pipeline. ⚠️ Erik signale que ces couleurs servent **peut-être ailleurs dans le SVG** — le recoloriage doit donc être **ciblé sur les formes du carquois uniquement** (édition par attribut `fill` de chemins identifiés, ou tout mécanisme équivalent), PAS un remplacement global de ces couleurs dans le document.
2. **Le style n'est pas celui du guerrier (bronze Recraft) — c'est voulu.** Erik veut essayer cet autre style. Ne pas « harmoniser » le sprite, ne pas le redessiner : import tel quel (après recoloriage du carquois). Consigner le choix dans le rapport (décision de style d'Erik, réversible).

## 2. Convention d'accent (le résultat attendu sur le carquois)

Comme le guerrier : le carquois devient la **zone d'accent** du sprite, dessinée avec les **3 gris exacts** — `#FEFEFE` (reflet), `#FFFFFF` (base), `#8C8C8C` (ombre) — aplats, opaques. Le pipeline (`import_svg.mjs`, mode `remplacementsPalette`) les mappe ensuite vers les 8 palettes de factions (7 joueurs + barbare rouge sang) en variantes **cuites** (pas de teintage). Mapping suggéré par luminance des couleurs actuelles du carquois : clair → #FEFEFE, médium → #FFFFFF, sombre → #8C8C8C (à ajuster à l'œil selon le modelé réel). **Les 3 gris ne doivent exister nulle part ailleurs sur le corps** (Erik : détails encre #2B2620 tolérés, convention painter, percement des détails sombres lum < 140 déjà géré par G2).

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, note l'état. `node assets-src/tools/import_svg.mjs --check` vert.
- Lis le profil du guerrier (`import_svg.profiles.json`) comme modèle : `cible: unite_archer`, `echelle` à calibrer, `remplacementsPalette`, G1-G5.

### L1 — Identification (travail d'analyse, à consigner)
- Rastériser le SVG (sharp, même rendu normalisé que le pipeline) et **localiser visuellement le carquois** (position, formes). Inventorier les `fill` exacts de SES chemins dans le source (les attributs, pas seulement la palette globale — croiser zones rendues et chemins).
- Vérifier si ces couleurs sont partagées ailleurs (cloak/tuniques rouges #751521/#9D1C2D etc.) : lister les collisions. Si collision, la sélection doit se faire **par identifiants de chemins** (recolorer les chemins du carquois dans une copie de travail du SVG, pas par find/replace global).
- **Livrable L1** : tableau dans le rapport — chaque couleur du carquois → nb de chemins → partagée ou non → couleur grise cible (reflet/base/ombre).

### L2 — SVG maître archer
- Créer la copie de travail recoloriée (dans `assets-src/`, zone de travail pipeline — pas la racine) : carquois → 3 gris, ciblage par chemins. Le reste du sprite **inchangé** (Erik assume le style).
- Vérifier : aucun des 3 gris hors carquois ; fond blanc pur (G1) ; dimensions/couverture G2-G3 ; poids G4 (452 Ko source, attention à la marge après raster — le gate porte sur le PNG cuit).

### L3 — Import + variantes cuites
- Profil `unite_archer` dans `import_svg.profiles.json`, **export en résolution ×2 (512×640)** — la résolution 256×320 est insuffisante à l'écran (constat 20/09 sur le guerrier, le standard va vers ×2) ; `echelle` calibrée sur le calibre guerrier (hauteur unités data-driven `calibration-unites.ts`, ancrage pieds au quart bas).
- `node import_svg.mjs <profil>` → gate G5 (8 teintes au pixel ±2) + A/B atelier : fiche `unite_archer_avant` (PNG extraits du HEAD).
- `sync-art`, suite de tests, typecheck.

### L4 — Vérification visuelle (avant tout commit — règle d'Erik)
- Atelier `#/atelier` : fiche archer ×8 variantes cuites, lisibilité des 3 teintes du carquois.
- Labo `#/labo-rendu` : archer posé en jeu (seul + cohabitation), calibre vs guerrier, netteté au zoom.
- **Captures dans `dev-logs/captures-archer-svg/`**.
- **ARRÊT POUR APPROBATION D'ERIK** : lui présenter l'archer recolorié (au moins J1 + barbare) avant commit — le choix des teintes reflet/base/ombre du carquois est subjectif.

### L5 — Rapport
- `REPORT-ARCHER-SVG.md` : tableau L1, décisions, écarts, ce qu'Erik valide en ligne, 🔶 de calibrage (echelle, répartition des 3 gris, éventuel retouches de teintes).

## 4. Critères d'acceptation

1. L'archer en jeu EST le sprite gothic-steampunk (style assumé, aucune harmonisation).
2. Le carquois porte l'accent du joueur (8 variantes cuites correctes, gate G5 vert) ; aucune trace des 3 gris hors carquois.
3. Les couleurs d'origine du carquois n'apparaissent plus sur le carquois ; le reste du sprite garde ses couleurs d'origine.
4. Calibre hauteur = guerrier, ancrage pieds correct, netteté correcte au zoom max (export ×2).
5. Suite verte, zéro changement moteur/serveur/protocole, SVG racine non commité.

## 5. Périmètre interdit

- Aucune retouche d'autres unités (guerrier, colon…), aucun changement `packages/rules`/`apps/server`/protocole ;
- Pas de redessin/lissage du style gothique ;
- Pas de commit des SVG d'Erik à la racine ; pas de déploiement manuel (CI au push après validation d'Erik) ;
- Pas de retouche de la résolution du guerrier (chantier séparé, proposition ×2 en attente du feu vert d'Erik).
