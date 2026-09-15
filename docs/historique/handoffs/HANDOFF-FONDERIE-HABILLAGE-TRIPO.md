# HANDOFF-FONDERIE-HABILLAGE-TRIPO — Adapter le knight Tripo (texturé) au style du jeu

**Contexte** : le résultat de l'habillage du clay `guerrier_2.2.glb` (session précédente) a été **rejeté par Erik** — on ne le conserve pas. Erik a généré chez **Tripo** un knight texturé : **`image_ref/glowing+knight+3d+model.glb`** (5 492 tris, 1 mesh, UV + texture JPEG cuite, 1 seul matériau PBR `tripo_mat_...`, origine au sol, hauteur 1,0). Ce handoff couvre son adaptation au style STYLE-3D **en mode peintre** : on garde la géométrie et les UV, on remplace l'habillage.

**Pourquoi ce fichier est un meilleur point de départ** : avec des UV, l'habillage se fait en **2D sur la peau dépliée** (repeindre la texture), pas en découpant la géométrie triangle par triangle — c'est ce qui a échoué sur le 2.2.

## 1. Préalables

1. Lire **`STYLE-3D.md`**, **`FONDERIE.md`**, et le rapport précédent `fonderie/REPORT-FONDERIE-HABILLAGE.md` si présent (pour les leçons : z-buffer du raster, face +Z du 2.2, etc.).
2. Périmètre STRICT inchangé : lecture = ce handoff, `STYLE-3D.md`, `FONDERIE.md`, `image_ref/glowing+knight+3d+model.glb` + `image_ref/guerrier.jpg` (référence de style), `fonderie/`. Écriture = `fonderie/` uniquement. Jeu jamais lancé.
3. `git status` vérifié ; **ne pas absorber d'éventuels restes non commités de la session rejetée** — si `fonderie/modeles/guerrier_v2.glb` (rejeté) traîne encore, demander à Erik s'il faut le supprimer ou l'ignorer ; le nouveau fichier aura un nom non ambigu (`guerrier_v3.glb` si v2 existe encore, sinon `guerrier_v2.glb`).

## 2. Mission

### M1 — Analyse et cadrage
1. Parser le glb : confirmer tris/UV/texture ; **déterminer la direction « avant »** (visière/lame) — le 2.2 regardait +Z ; si le knight aussi, pivoter de 180° pour la convention **face -Z**.
2. Origine : déjà au sol (Y 0→1) — vérifier, recentrer en X/Z sur l'axe de la tuile.
3. Échelle : hauteur 1,0 → **mettre le modèle à l'échelle cible ~2,5-2,75 unités** dans le fichier (ou consigner le facteur — mais préférer un fichier autosuffisant, la convention STYLE §5 étant des unités de tuile).

### M2 — Repeindre la texture (le cœur du travail)
1. **Conserver les UV telles quelles** (la forme est validée, on ne refait pas le pliage).
2. Générer une **nouvelle texture** (l'encodeur PNG maison de `outils/glb.mjs` existe) dans la palette STYLE :
   - **Corps** : gris-bleu-vert sombre neutre (~#1C2E3C désaturé), **volontairement peu saturé et clair en luminance relative** pour que la teinte du joueur se lise en multiplication ;
   - **Lignes/arêtes** : le **#3DFFCE** peint sur les arêtes de plaques, joints d'armure, tranchant de lame — en repérant ces zones dans la texture existante (les zones claires/contrastées de la peinture Tripo indiquent où sont les reliefs) ou en projetant les arêtes géométriques dans l'espace UV ;
   - **Glyphes** : quelques lignes de code/binaires éparses, style des 22 unités existantes ;
   - **La fente de visière** (déjà cyan dans la texture Tripo) : cœur néon, pleine intensité.
3. Générer la **couche émissive** associée : noir partout, sauf les zones néon/glyphes/visière (c'est elle qui déclenche le bloom).
4. Résolution **512** (STYLE §4) — ou 1K si le niveau de détail des arêtes l'exige, à montrer à Erik.

### M3 — Matériaux conformes (le contrat du jeu)
- **2-3 matériaux nommés EXACTEMENT** :
  - `accent_joueur` : **le corps entier** (matériau PBR, texture repaintée en baseColor, semi-translucide alpha 0,45-0,6) — c'est LUI que le jeu teinte par propriétaire (J1/J2/barbare). La texture étant neutre, la teinte joueur se lira sur tout le corps, conformément au design accepté (« corps semi-transparent teinté par la couleur du joueur ») ;
  - `neon` : petit second mesh (ou zones clonées) portant visière, tranchant, éclats — #3DFFCE, émissif fort (`KHR_materials_emissive_strength`), **jamais teinté** ;
  - éventuellement 1 matériau d'intermédiaire si la découpe l'exige — ≤ 3 au total, compteur fait foi.
- La séparation corps/néon peut se faire **par sous-mesh cloné avec les mêmes UV** (on ne redécoupe PAS la géométrie triangle par triangle : au besoin, isoler seulement les quelques éléments saillants — lame, visière — par plages de sommets contiguës, ce qui est raisonnable sur un mesh de 7 000 sommets).

### M4 — Validation visuelle (la boucle avec Erik)
1. Dans le visualiseur : **A/B contre `chevalier.glb`** (même personnage, déjà en jeu) ET contre `guerrier.glb` (v1 en jeu) — même caméra, teintes J1/J2/J3 (accent sur le corps entier), bloom on/off, wireframe.
2. Avant le fini : montrer la **texture repeinte à plat** (l'image 2D elle-même) et le modèle en « zones brutes » — Erik valide la peinture avant l'habillage complet.
3. Boucle d'itération : Erik regarde, dit, tu ajustes. Captures à chaque tour notable dans `fonderie/captures/`.
4. Vérifier au compteur : ≤ 5 500 tris (on ne change pas la géométrie), ≤ 3 matériaux, origine au sol, face -Z.

## 3. Critères d'acceptation

- **Erik valide à l'œil** dans le visualiseur : essence STYLE-3D (translucide, néon #3DFFCE, holographique), silhouette knight préservée, teinte joueur lisible sur le corps.
- ≤ 5 500 tris, ≤ 3 matériaux nommés `accent_joueur`/`neon` (+1 max), origine au sol, face -Z, échelle ~2,5-2,75 unités.
- La teinte J1/J2/J3 change bien la couleur du corps SANS toucher au néon.
- Zéro fichier hors `fonderie/` ; commit uniquement sur la demande explicite d'Erik.

## 4. Périmètre interdit

- Re-sculpter la silhouette (le mesh Tripo est LA référence de forme) ; toucher aux UV ; modifier la géométrie au-delà du pivot d'orientation et de l'échelle.
- L'intégration au jeu (remplacement du guerrier ou du chevalier en jeu) : session séparée après validation.
- Les 22 unités existantes, `STYLE-3D.md` (proposer, Erik décide), le workflow du clay 2.2 (abandonné avec son résultat).

## 5. Fin de session

Journal d'itérations + captures, rapport dans `fonderie/`, arrêt, remise de la main. Ne rien archiver hors `fonderie/` (le pilot s'en charge).
