# HANDOFF-FONDERIE-HABILLAGE — Habiller le guerrier 2.2 (clay externe) au style du jeu

**Contexte** : Erik a généré une silhouette de Guerrier avec un outil externe image→3D. Le fichier **`image_ref/guerrier_2.2.glb`** contient la FORME validée (4 000 tris exactement, 1 mesh fusionné, hauteur 1,96) mais il est **nu** : aucun matériau, aucune UV, POSITION seule, origine au centre du corps. Ce handoff couvre l'habillage au style du jeu et la conformité d'export, dans la fonderie, avec validation d'Erik à l'œil.

## 1. Préalables

1. Lire **`STYLE-3D.md`** (LE guide — appliqué tel quel), **`FONDERIE.md`**, `fonderie/REPORT-FONDERIE-3D.md` (le langage déjà appliqué aux 22 unités : 3 matériaux, LINES pour les effets, `accent_joueur`).
2. **Périmètre STRICT** (identique au handoff fonderie) : lecture limitée à ce handoff, `STYLE-3D.md`, `FONDERIE.md`, `image_ref/guerrier_2.2.glb` (+ `image_ref/guerrier.jpg` si utile comme référence de style), `fonderie/`. **Interdits** : `apps/`, `packages/`, `visuel3d.json`, le jeu, `pnpm dev:web`. Écriture limitée à `fonderie/`.
3. `git status` vérifié au départ (les retouches d'Erik ne sont pas à absorber).
4. Base de travail : **`image_ref/guerrier_2.2.glb` UNIQUEMENT** (le 2.0/2.1 font 190 000 tris — ne pas les utiliser).

## 2. Mission

### M1 — L'outil d'habillage (`fonderie/outils/habiller-guerrier.mjs`)
1. Charger le mesh 2.2 (parse glb existant dans `outils/glb.mjs` à étendre ou réutiliser) et le **découper en zones matériaux**. Sans UV, la découpe se fait par heuristiques géométriques (bandes de hauteur, saillances, symétrie des membres) — l'objectif est une partition VISUELLEMENT PROPRE, pas parfaite au triangle : les transitions entre corps/néon/accent doivent suivre des lignes logiques (bords de plaques, articulations).
2. Définir les zones cibles (à ajuster à l'œil avec Erik) : **casque/visière** (néon sur la fente), **torse + épaulières** (corps translucide + arêtes), **bras/jambes** (corps), **épée** (lame corps + FIL émissif néon), **accents** (épaulières sup., gardes, genoux, écusson → matériau `accent_joueur`). Le cœur néon pectoral du langage du jeu doit exister (élément ajouté en géométrie LINES ou petit mesh — le budget le permet, cf. M2).
3. Les **arêtes néon** (signature du style) : soit en second mesh d'arêtes (LINES — 0 triangle), soit en matériau émissif sur les plaques. Même vocabulaire que les 22 unités existantes.
4. **Corriger l'origine** : pivot au SOL, centré sur la tuile (Y min = 0), face avant vers **-Z** (déterminer l'avant d'après `image_ref/guerrier.jpg` — la visière et la lame l'indiquent).

### M2 — Conformité STYLE-3D (verrouillée)
- **Budget : le mesh fait déjà 4 000 tris — le consommé est le consommé.** Les ajouts géométriques éventuels (cœur, fil de lame) doivent rester **en LINES** (0 triangle) ou être négociés par re-décimation légère (< 5 000 au total, compteur du visualiseur fait foi).
- **≤ 3 matériaux**, nommés EXACTEMENT : `corps` (translucide teinté ~#1C2E3C, alpha 0.35-0.6, texture de glyphes émissive légère), `neon` (#3DFFCE, émissif fort via `KHR_materials_emissive_strength`), **`accent_joueur`** (blanc neutre — c'est lui que le jeu teinte par propriétaire ; le néon n'est JAMAIS teinté).
- Export `fonderie/modeles/guerrier_v2.glb` : un nœud, origine au sol, Y-up, face -Z, pas de scène superflue.

### M3 — Validation visuelle (le cœur de la session)
1. Le visualiseur (`fonderie/index.html`) doit proposer **l'A/B** : `guerrier.glb` (v1 actuelle en jeu) à côté de `guerrier_v2.glb`, même caméra, teintes J1/J2/J3, bloom on/off, wireframe pour juger la découpe des zones.
2. Pendant la découpe, un mode « zones brutes » (couleurs plat par zone) permet à Erik de valider la PARTITION avant l'habillage final — évite d'itérer sur du fini.
3. **Boucle d'itération avec Erik** : il regarde, il dit, tu ajustes. Autant de tours que nécessaire. Les captures de chaque itération notable vont dans `fonderie/captures/`.

## 3. Critères d'acceptation

- Erik valide le rendu à l'œil dans le visualiseur (essence STYLE-3D respectée, silhouette 2.2 préservée).
- ≤ 5 000 tris au compteur HONNÊTE du visualiseur, ≤ 3 matériaux correctement nommés, origine au sol, face -Z (vérifiable dans le visualiseur : le modèle « pose » sur la grille et regarde -Z).
- Teinte joueur démontrée sur les 3 teintes (accent seul change, néon constant).
- Zéro fichier hors `fonderie/` touché ; le jeu n'a pas été lancé.

## 4. Périmètre interdit

- L'intégration au jeu (remplacement du guerrier.glb actuel) : session séparée après validation, sur demande d'Erik au pilot.
- Les 21 autres unités, les sprites 2D, `visuel3d.json`, `STYLE-3D.md` (proposer, Erik décide).
- Re-modéliser la silhouette : la forme 2.2 est LA référence — on habille, on ne resculpte (micro-retouches locales admises si un artefact de décimation saute aux yeux, signalé à Erik).

## 5. Fin de session

Journal d'itérations + captures, **commit uniquement sur la demande explicite d'Erik**, arrêt, remise de la main. Rapport dans `fonderie/` (le pilot archive).
