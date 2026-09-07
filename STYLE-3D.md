# STYLE-3D — Guide de style des modèles 3D d'unités (fonderie)

**Ce document fixe l'essence visuelle de tous les modèles 3D d'unités du jeu.** Il est écrit une fois avec Erik et lu au début de CHAQUE session de fonderie — l'agent ne re-dérive pas le style, il l'applique. Toute modification passe par Erik (c'est SON guide).

## 1. L'essence (les mots d'Erik, non négociables)

> **A sleek geometric construct made of translucent wireframe shapes and glowing neon mint green code lines (#3DFFCE).**

Traduction opérationnelle : une construction géométrique épurée de formes filaires translucides, parcourue de lignes de code en vert néon menthe (#3DFFCE). Le modèle doit évoquer une **construction de données holographique**, pas un robot solide ni un personnage charnel.

## 2. Palette et matériaux

| Élément | Règle |
|---|---|
| Néon (arêtes, fil d'arme, cœur, lignes de code) | **#3DFFCE** — émissif intense. C'est LA couleur d'identité du jeu (cœurs, nervures, glyphes déjà dans visuel3d.json) |
| Corps | **Teinté par la couleur du joueur** (le matériau `accent_joueur` — le néon n'est JAMAIS teinté). Deux modes validés par Erik : **opaque** (sur assets externes texturés — texture neutre-claire, la teinte multiplie ; compensation de luminance cuite dans le fichier, ex. ×6.6) ou **translucide** (fabrication maison, alpha 0.35-0.6, structures internes visibles) |
| Translucence | Corps en matériau semi-transparent (opacity ~0.35-0.6) ; les formes internes (cœur, structure) restent visibles À TRAVERS le corps — c'est le côté « hologramme » |
| Arêtes | Liserés néon sur les arêtes principales (edges emissive ou second mesh d'arêtes), pas de contour noir « cartoon » |
| Glyphes | Les lignes de code / binaires sont une **texture émissive**, jamais de la géométrie |
| Interdits | Aucune texture photoréaliste, aucun métal rugueux terne, aucune couleur saturée hors palette (accents joueur exceptés) |

## 3. Géométrie

- **Hard-surface facetté uniquement** : plaques à arêtes vives, extrusions, biseaux nets, prismes. Pas de courbes lissées organiques (un cylindre lissé = coûteux ET hors style ; un prisme facetté = les deux bons).
- Silhouette **lisible en petit** : le modèle est vu en jeu à la taille d'une tuile — les détails doivent rester perceptibles au zoom de jeu, les micro-détails ne comptent pas.
- Pas de visage humain : visière/casque plein, moufles, pieds-cales. Le Guerrier de référence a un casque à visière : c'est le pattern.

## 4. Budgets techniques (stricts)

| Budget | Valeur |
|---|---|
| Triangles par unité | **< 5 000**, cible 2 500-4 000 (comptés sur le mesh final, arêtes/émissifs compris s'ils sont géométriques) |
| Matériaux par unité | **≤ 3** (corps translucide teinté, néon émissif, éventuellement 1 accent) |
| Draw calls visés en jeu | ~1 par unité (mesh fusionné) — la modélisation doit s'y prêter |
| Textures | Petites (≤ 512px), 1-2 par modèle max (glyphes/émissif) |
| Animation | Hors scope fonderie v1 (le playback de déplacement est géré par le jeu) |

## 5. Format et conventions d'export

- **Un fichier `.glb` par unité**, nommé en anglais minuscule (`guerrier.glb` — le nom du TYPE moteur, pas un nom créatif).
- **Échelle de référence** : le modèle est modelisé pour tenir dans une tuile hexagonale de **rayon 1** (unités Three.js du jeu) ; origine **au sol, centrée** sur la tuile, axe **Y vers le haut**, face « avant » vers -Z (convention du jeu).
- Aucune scène embarquée superflue (pas de lumières, caméras ou sol dans le .glb — uniquement le modèle et ses matériaux).
- Le compteur de tris du visualiseur fait foi ; le chiffre est reporté dans le rapport de session.

## 6. Le rituel de validation (Erik décide à l'œil)

1. L'agent produit le `.glb` dans `fonderie/modeles/` ;
2. Erik l'ouvre dans le visualiseur (`fonderie/index.html`) : rotation, zoom, bloom on/off, fond clair/sombre ;
3. Erik valide, demande des retouches, ou rejette — le modèle n'est « promu » dans `assets-src/modeles/` qu'après SON accord explicite ;
4. La promotion + l'intégration au jeu sont une session séparée (jamais dans la même session que la fabrication).
