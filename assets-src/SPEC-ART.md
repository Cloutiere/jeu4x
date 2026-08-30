# SPEC-ART — Spécification des fichiers d'art

**Version :** v1 · **Rôle :** contrat entre la production artistique (toi, un artiste, ou un outil IA) et la pipeline technique du client (`apps/web`, PixiJS v8).
**Règle d'or :** la Phase 3 fonctionne avec des placeholders **générés à l'exécution** — l'art réel n'est bloquant pour rien. Il se branche ensuite par simple remplacement de fichiers, à condition de respecter CE document (dimensions, ratios, nommage).

---

## 1. Où vont les fichiers

```
/assets-src/
├── SPEC-ART.md      ← ce document (le contrat)
├── README.md        ← note d'accueil + pointeur vers la spec
├── LICENSES.md      ← provenance + licence de CHAQUE fichier (obligatoire, même pour ton propre art)
├── sources/         ← fichiers de travail (Krita/Inkscape/Aseprite/PSD) — jamais chargés par le jeu
└── exports/         ← PNG finaux, prêts à être chargés par PixiJS — seuls fichiers que le code lit
```

Format de livraison : **PNG 32 bits RGBA, fond transparent**, pas d'entrelacement. Les sources restent dans `sources/`.

## 2. Décision préalable : la direction de style (à trancher par toi)

| Option | Avantages | Contraintes |
|---|---|---|
| **A. Flat stylisé « board-game »** (recommandé) | Cohérent avec les placeholders géométriques (transition douce), produit rapidement dans Inkscape/Krita, lisible à tous les zooms, tolérant aux imprécisions | Moins « incrustable » qu'un style peint |
| B. Pixel art | Charme rétro, fichiers minuscules, faisable seul | Discipline stricte (grille, palette figée), très long à bien faire, cohabite mal avec les placeholders |
| C. Peint / réaliste léger (style Civ) | Le plus « vendeur » | Beaucoup plus long et coûteux, exige un vrai artiste |

Recommandation : **A maintenant**, éventuellement C plus tard — les mêmes fichiers étant remplacés à qualité égale de pipeline. Quel que soit le choix : **silhouettes très lisibles**, car le zoom minimun est 0,5× (une case fait alors ~56 px à l'écran).

## 3. Contraintes techniques (le contrat non négociable)

### 3.1 Géométrie des tuiles

- Hexagones **pointy-top** (pointe en haut), ratio largeur/hauteur = √3/2 ≈ **0,866** — à respecter exactement.
- Base logique du jeu : hexagone de rayon R = 64 px → boîte utile **~111 × 128 px**.
- Livraison en **2×** pour la netteté au zoom : canvas tuile = **224 × 256 px**, hexagone inscrit touchant les bords haut/bas, centré horizontalement (marges latérales ~1 px).
- Les tuiles s'assemblent bord à bord **sans transition** : chaque tuile a une bordure hexagonale fine sombre (2-3 px à 2×) — look « plateau de jeu » assumé, pas de tuiles de raccord à produire.

### 3.2 Ancrages

- **Tuiles** : ancrage = centre du canvas = centre de l'hexagone.
- **Unités** : canvas **256 × 320 px** (2×) ; ancrage = **bas-centre** du canvas, posé au centre de la case ; la silhouette peut dépasser en haut de l'hexagone (taille cible : ~60-70 % de la largeur de case).
- **Villes** : comme les tuiles (224 × 256), bâtiment centré, ~70 % de la largeur de case.

### 3.3 Couleurs de joueur (accent layers)

Les entités appartiennent à un joueur → dessiner **deux calques par entité** :
1. `<nom>.png` : le sprite de base, **en couleurs neutres/désaturées** (jamais de rouge ou bleu franc dans la base) ;
2. `<nom>_accent.png` : canvas identique, **transparent partout sauf les zones d'accent** (bannière, bouclier, cape, toits) — remplies en blanc pur.

Le code teinte le calque accent avec la couleur du joueur (rouge = joueur 1, bleu = joueur 2, extensible à 8). Résultat : un seul dessin par unité, décliné à l'infini.

### 3.4 Règles de qualité

- Aucun texte dans les images.
- Lumière uniforme venant du **haut-gauche** sur toutes les tuiles.
- Détails fins interdits s'ils disparaissent à 0,5× (test : réduire l'image à 25 % — l'identité du terrain doit rester évidente).
- Palette restreinte et réutilisée (~24-32 couleurs, voir §5).

### 3.5 Nommage (aligné sur les ids des données JSON — pas de table de mapping)

`snake_case`, préfixe de catégorie, **sans accent** :

```
tile_prairie.png / tile_plaine.png / tile_foret.png / tile_colline.png / tile_montagne.png / tile_eau.png / tile_ville_sol.png
unite_guerrier.png + unite_guerrier_accent.png
unite_colon.png + unite_colon_accent.png
ville_settlement.png + ville_settlement_accent.png
ville_capitale.png + ville_capitale_accent.png
icone_or.png / icone_science.png / icone_nourriture.png / icone_production.png / icone_pv.png / icone_pm.png / icone_fin_tour.png / icone_reseau.png
```

(Fog, anneau de sélection, effets de combat, indicateurs d'ordre : **programmatiques** en v1 — aucun fichier à produire.)

## 4. Palette de départ (suggérée — ajustable, mais à figer AVANT de produire)

Rôles plutôt que valeurs exactes ; figer les hex dans `LICENSES.md`-annexe ou un `palette.txt` :

- Prairie : 2 verts clair-jaune · Plaine : 1 vert-jaune terne + 1 ocre
- Forêt : vert profond + vert medium · Colline : vert + brun pente
- Montagne : 2 gris + blanc neige · Eau : 2 bleus (fond + vague claire)
- Sol bâti : brun chemin + terre · Accent joueurs : rouge vif (#D64545) et bleu vif (#3B6FD6)
- UI/contour : gris-brun très sombre (#2B2620)

## 5. Liste complète des assets, par priorité

### P0 — Remplace les placeholders (utile dès la fin de Phase 3 / Phase 4) — ~18 fichiers

| Fichier | Canvas (2×) | Description visuelle |
|---|---|---|
| `tile_prairie.png` | 224×256 | Herbe claire, 2-3 touffes/fleurs discrètes |
| `tile_plaine.png` | 224×256 | Herbe plus terne/jaunie, relief plat |
| `tile_foret.png` | 224×256 | 2-3 arbres au feuillage distinct, ombres courtes |
| `tile_colline.png` | 224×256 | Pente nette avec sommet arrondi, lignes de niveau |
| `tile_montagne.png` | 224×256 | Pics rocheux, sommet neigeux, cassant |
| `tile_eau.png` | 224×256 | Bleu profond, 2-3 lignes de vagues claires stylisées |
| `tile_ville_sol.png` | 224×256 | Sol/chemin autour de l'emplacement du bâtiment |
| `unite_guerrier.png` + `_accent` | 256×320 | Personnage massue + bouclier (bouclier = accent), posture trapue |
| `unite_colon.png` + `_accent` | 256×320 | Personnage charrette/bâton de pèlerin (capuche ou sac = accent) — silhouette très distincte du guerrier |
| `ville_settlement.png` + `_accent` | 224×256 | 2-3 huttes/maisons groupées (toits = accent), bannière |
| `ville_capitale.png` + `_accent` | 224×256 | Version plus grande/muraille + grand drapeau (accent) |
| `icone_or.png` … `icone_reseau.png` (8) | 64×64 | Pièce, fiole, épi, marteau, cœur/croix, éclair/botte, sablier, signal — lecture immédiate à 24 px |

### P1 — Polish (Phases 4-5) — facultatif, ~10 fichiers

Variantes de tuiles (2-3 par terrain, choix aléatoire déterministe par seed), rivage/eau côtière, anneau de sélection dessiné, portrait d'écran de victoire, logo de l'écran titre.

### P2 — Contenu Phase 7 (arbre Civ Revolution complet) — ~25 fichiers

Unités : légion, archer, cavalier, piquier, catapulte, chevalier, fusilier, canon, infanterie moderne, char d'assaut, artillerie, galère, galion, croiseur, cuirassé, sous-marin, chasseur, bombardier, caravane, espion, milice + 2-3 grandes personnes. Même gabarit que P0 (base + accent). Note : les unités navales/aériennes n'ont de sens qu'avec l'eau navigable (Phase 7) — produire après le v1 terrestre.

**Chaque unité doit se distinguer par sa silhouette à 0,5×** (l'arme ou l'attribut porte l'identité : arc, lance, canon…), pas par sa couleur.

## 6. Checklist de réception (à vérifier fichier par fichier)

- [ ] Canvas aux dimensions exactes du tableau §5, fond transparent, hexagone/ratio conformes (§3.1)
- [ ] Ancrage respecté (unités : bas-centre)
- [ ] Accent livré en canvas identique, zones blanches alignées au pixel
- [ ] Test zoom 25 % : le terrain/l'unité reste identifiable
- [ ] Bordure hexagonale sombre présente, lumière haut-gauche, aucun texte
- [ ] Nom conforme au §3.5, déposé dans `exports/`, ligne correspondante dans `LICENSES.md`

## 7. Outils suggérés

- Option A : **Inkscape** (vectoriel, gratuit) ou **Krita** (gratuit) — export PNG 2× direct.
- Option B : **Aseprite** (~15 €) — attention : livrer en 1× exact (112×128 tuiles, 128×160 unités) avec scaling « nearest » côté code ; le préciser dans `LICENSES.md`.
- TexturePacker et autres packers : **inutiles pour l'instant** — PixiJS charge les PNG individuels ; un atlas pourra être généré plus tard par script si le besoin de performance se présente.
