# HANDOFF-TUILES-SVG — Évaluation des nouvelles tuiles SVG d'Erik et remplacement des anciennes (5 terrains)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X. Lis `HANDOFF.md` §4 (conventions), `assets-src/SPEC-ART.md`, `assets-src/README.md`, le rapport `docs/historique/rapports/REPORT-IMPORT-SVG.md` (pipeline import SVG, pièges sharp) et `ATELIER-ASSETS.md` (rituel). **2D uniquement.** Zéro changement moteur/serveur/protocole. Les SVG d'Erik (`new_tiles/`, racine) ne se committent JAMAIS — seules les copies de travail `assets-src/` et les PNG cuits le sont.

## 1. Objectif (demande d'Erik du 22/09)

Erik a livré 5 nouvelles tuiles terrain en SVG dans `new_tiles/` : `prairie.svg`, `plaine.svg`, `colline.svg`, `montagne.svg`, `desert.svg` (2048×2048, dessin 1024², jusqu'à 3,1 Mo). Mission : **vérifier qu'elles sont utilisables** (gates du pipeline + visuel) puis **remplacer les tuiles actuelles** de ces 5 terrains.

⚠️ **Ces 5 tuiles arrivent d'un nouveau style** (même logique que l'archer gothique : Erik essaie, il tranche à l'œil). Ne pas harmoniser, ne pas redessiner. **Les terrains `eau`, `ocean`, `foret` restent à l'ancien style** pour l'instant — Erik jugera la cohérence sur la carte complète (voir D2 et l'arrêt L4).

## 2. État des lieux (vérifié par le pilot)

- **Tuiles actuelles** : `apps/web/public/art/tile_{prairie,plaine,colline,montagne,desert,eau,ocean,foret}.png` — **224×256**, peintes procéduralement par `generate.py` (fonctions `tile_prairie` l.230, `tile_plaine` l.262, `tile_colline` l.354, `tile_montagne` l.393, `tile_desert` l.433 ; registre l.4490-4495 ; gate `--check` `EXPECTED` l.4710 = `(224, 256)`). Convention generate.py l.170 : « terrain peint, **rogné à l'hexagone, bordure sombre 2.5 px** ».
- **Précédent d'import SVG** : `assets-src/tools/import_svg.mjs` (+ `import_svg.profiles.json`, tests) — rastérisation sharp (rendu normalisé, density fixe, rendu en DEUX passes — la taille intrinsèque du SVG importe peu), gates G1 blanc pur / G2 couverture / G3 dimensions / G4 poids 300 Ko / G5 teintes (variantes). Intégration generate.py : ligne painter **commentée** (rollback = réactiver + regenerate, modèle `unite_guerrier` l.4501).
- **Politique tuiles Recraft (mémoire du chantier)** : clip hexagone (√3/2) + contour `#2B2620` **en code** — le SVG source est un fond carré, le clip se fait au pipeline, pas dans le SVG.
- **Piège connu** : `tile_ville_sol` et les variantes 3D (« plaine sous grenier », rotations cuites colline) appartiennent au 3D en sommeil — ne pas les toucher.
- **Consommation jeu** : les tuiles sont chargées par le rendu 2D (mipmaps anti-aliasing déjà en place, netteté validée aux extrêmes de zoom — ne rien changer au chargement).

## 3. Décisions tranchées par défaut (veto possible)

- **D1 — Dimensions de sortie inchangées : 224×256, clip hexagonal, contour #2B2620 2,5 px** (identique à l'actuel, gate `--check` inchangé). Les SVG 2048² donnent de la marge de descente ; PAS d'export ×2 pour l'instant (le standard ×2 est en discussion pour les unités — aligner plus tard en une passe unique si Erik le tranche).
- **D2 — Remplacement des 5, conservation du reste** : prairie, plaine, colline, montagne, désert remplacées ; eau, océan, forêt (et `tile_ville_sol`) inchangées. Le mélange de styles est UN RISQUE IDENTIFIÉ : la vérification L4 inclut une **carte complète** pour juger la cohérence, et l'arrêt-pour-approbation d'Erik porte explicitement là-dessus (il pourra demander forêt/eau dans le même style en suivi).
- **D3 — Rollback trivial** : chaque `tile_*.png` remplacé garde sa ligne painter dans `generate.py` (commentée, pas supprimée) + fiche A/B « avant » à l'atelier. Revenir en arrière = réactiver + regenerate.
- **D4 — Aucune retouche artistique** des SVG (pas de lissage, pas de recoloriage, pas de recadrage créatif). Seuls ajustements autorisés : mise au fond blanc pur si nécessaire (G1), et tout ce qui relève du clip/contour déjà conventionnés.
- **D5 — Zéro changement code de rendu** : si une tuile semble exiger un changement de GameCanvas/chargement, c'est que la conception dérive — remonter le point dans le rapport.

## 4. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, `python tools/generate.py --check` vert, note l'état.
- Vérifie le §2 (registre generate.py, conventions de clip). Lis un profil d'`import_svg.profiles.json` pour le format.

### L1 — Évaluation d'utilisabilité (à consigner dans le rapport, tuile par tuile)
- Rastériser chaque SVG (sharp, rendu normalisé 2048²). Vérifier : fond blanc pur ou transparent (G1 — documenter l'état réel : les SVG n'ont pas de rect de fond visible au premier coup d'œil) ; couverture du cadrage (le sujet remplit-il le carré ? marges ?) ; contenu complet (rien de coupé au bord) ; poids PNG cuit estimé (G4).
- Verdict par tuile : UTILISABLE TELLE QUELLE / UTILISABLE APRÈS X (précis) / INUTILISABLE (pourquoi — ex. sujet coupé, fond non neutralisable). **Ne pas forcer une tuile douteuse : la remonter à Erik avec capture.**

### L2 — Extension pipeline (mode tuile)
- Étendre `import_svg.mjs` (ou profil dédié) : mode `tuile` = rastérisation → fond blanc forcé si transparent → **clip hexagone √3/2 centré** → contour `#2B2620` 2,5 px → sortie 224×256 → gates G1-G4 (G5 non applicable, pas d'accent). Réutiliser au maximum l'existant (rendu normalisé deux passes). Tests du mode (clip au pixel sur un SVG de test géométrique, comme les tests existants).
- Profils pour les 5 tuiles dans `import_svg.profiles.json`, cibles `tile_prairie` … `tile_desert`.

### L3 — Cuisson + intégration
- `node import_svg.mjs <chaque profil>` → PNG 224×256 dans `apps/web/public/art/` (remplacement) ; lignes painter des 5 fonctions commentées avec la mention d'import (modèle guerrier) ; `--check` vert.
- A/B atelier : fiches `tile_<n>_avant` (PNG extraits du HEAD avant remplacement).
- Suite + typecheck verts.

### L4 — Vérification visuelle + ARRÊT POUR APPROBATION D'ERIK
- Labo `#/labo-rendu` et/ou partie locale : **carte complète** avec les 5 nouvelles tuiles mêlées aux anciennes eau/océan/forêt — juger la cohérence (styles, saturation, luminosité, lisibilité des glyphes de rendement par-dessus, parois/relief de colline-montagne).
- Captures dans `dev-logs/captures-tuiles-svg/` (fiches A/B par tuile + cartes complètes 2D aux deux extrêmes de zoom — mipmap check).
- **STOP : présenter à Erik** les 5 tuiles en fiches A/B + au moins une carte complète AVANT tout commit. Points explicites de verdict : (1) chaque tuile garde-t-elle sa lisibilité au dézoom ? (2) le mélange avec eau/forêt/océan anciennes est-il acceptable ou faut-il les refaire dans le nouveau style ? (3) calibrage éventuel (marges du clip ?).

### L5 — Rapport
- `REPORT-TUILES-SVG.md` : verdicts L1, extension pipeline (mode tuile), résultats gates, captures, ce qu'Erik doit valider, 🔶 (marges de clip, poids, éventuel forêt/eau/océan dans le nouveau style).

## 5. Critères d'acceptation

1. Les 5 tuiles en jeu SONT les SVG d'Erik (style intact), rognées hexagone, contour sombre, 224×256, `--check` vert.
2. Lisibilité et netteté au dézoom max équivalentes à l'actuel (mipmaps effectifs).
3. A/B disponibles à l'atelier ; rollback possible en réactivant les lignes painter.
4. Extension pipeline testée ; suite verte ; zéro changement moteur/serveur/protocole/rendu ; SVG d'Erik non commités.

## 6. Périmètre interdit

- `tile_ville_sol`, variantes 3D (« plaine sous grenier », rotations), eau/océan/forêt (sauf verdict d'Erik à l'arrêt L4) ;
- Tout changement du rendu 2D, du chargement d'assets, du moteur/serveur ;
- Retouche artistique des SVG ; commit des fichiers de `new_tiles/` ;
- L'archer (mission suspendue, préview labo à préserver).
