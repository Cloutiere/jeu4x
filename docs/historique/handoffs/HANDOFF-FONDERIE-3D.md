# HANDOFF-FONDERIE-3D — Fonderie de modèles 3D isolée + refonte du Guerrier en .glb

**Contexte de ce handoff** : la première tentative de refonte du Guerrier (chantier ATELIER-GUERRIER-3D) a produit un résultat décevant — quelques centaines de tris, plafond structurel de l'assemblage de primitives en code, et un agent dont le contexte était contaminé par la plomberie du jeu. Décision d'Erik (le 06/09) : **séparer la fabrication des modèles du jeu** dans une « fonderie » isolée, avec un format d'échange standard (glTF) et un guide de style permanent.

## 1. Préalables

1. Lire **`STYLE-3D.md`** (racine — LE guide de style, appliqué tel quel) et **`ATELIER-ASSETS.md`** (pour le rituel de collaboration visuelle avec Erik : il regarde, il dit, tu itères — mais la fonderie a SON visualiseur, cf. §2).
2. **Périmètre de lecture STRICT** : tu as le droit de lire `STYLE-3D.md`, ce handoff, `image_ref/guerrier.jpg`, `fonderie/` et `assets-src/README.md`. **Il est INTERDIT de lire** `apps/`, `packages/`, `visuel3d.json`, `RULES.md`, `PILOT-HANDOFF.md`, les tests — c'est la leçon du chantier précédent : le contexte du jeu contamine la modélisation. Exception unique (§2.1) : `apps/web/package.json` UNIQUEMENT pour y lire la version de Three.js.
3. **Périmètre d'écriture STRICT** : `fonderie/` (nouveau dossier) et rien d'autre. Interdits : `pnpm dev:web`, tout serveur du jeu, tout fichier hors `fonderie/` (la promotion d'un asset validé se fait dans une session ultérieure).
4. `git status` propre au départ — vérifier ; les retouches d'autres sessions d'Erik ne doivent pas être absorbées.

## 2. Mission T1 — Le visualiseur (la fonderie)

### T1.1 — Arborescence et outillage
```
fonderie/
  index.html      ← la page du visualiseur (autonome, ouverte par double-clic OU via un serveur statique minimal)
  viewer.js       ← le visualiseur
  lib/            ← copie locale de Three.js (VERSION EXACTE du jeu — lire UNIQUEMENT apps/web/package.json pour ça) + GLTFLoader + OrbitControls + le post-traitement bloom
  modeles/        ← les .glb en cours de fabrication
```
- **Zéro dépendance au projet** : pas de Vite, pas de pnpm workspace, pas d'import depuis `apps/`. La page se charge seule (Three.js en fichiers locaux dans `fonderie/lib/`, pas de CDN — le poste doit fonctionner hors ligne).
- **Garde-fou de fidélité** : le rendu du visualiseur (tonalité, bloom, exposition) doit REPRODUIRE les réglages du jeu — copier les valeurs (version Three, paramètres du bloom, éclairage), ne jamais les importer. Sinon Erik validerait un look qui ne sera pas celui en partie. Ces réglages copiés sont consignés en commentaire dans `viewer.js`.

### T1.2 — Fonctionnalités du visualiseur (la demande explicite d'Erik)
- Chargement d'un `.glb` (liste des fichiers de `fonderie/modeles/` + glisser-déposer) ;
- **Modèle dans le VIDE** : aucun terrain, aucune tuile — fond uni ;
- **Caméra orbitale libre** : glisser = tourner, molette = zoom/dézoom, tous les angles sans restriction ;
- **Bloom on/off** (réglages copiés du jeu) ; **fond clair/sombre** ; **fil de fer (wireframe) on/off** (utile pour juger le maillage) ; **grille/repère d'échelle** optionnel (cercle de rayon 1 = la tuile de référence, cf. STYLE-3D §5) ;
- **Compteur de tris HONNÊTE** (somme réelle des meshes chargés, le chiffre du STYLE §4 s'y vérifie) + nombre de matériaux + nombre de draw calls approximatif ;
- Rotation automatique on/off (pour examiner le modèle qui tourne).

## 3. Mission T2 — Le Guerrier en .glb (itération avec Erik)

1. Re-partir de l'**image de référence `image_ref/guerrier.jpg`** et du `STYLE-3D.md` : humanoïde cyber holographique — casque à visière, épaulières, corps translucide, arêtes néon, épée à fil émissif, glyphes en texture. **Objectif de fidélité : l'essence et la silhouette, pas la copie pixel.**
2. Modéliser en **vraie géométrie de mesh** (cible 2 500-4 000 tris, hard-surface facetté — cf. STYLE §3-4) et exporter `fonderie/modeles/guerrier.glb` (conventions d'export §5 du STYLE : origine au sol, Y-up, face -Z, pas de scène superflue).
3. **Boucle d'itération avec Erik** (le cœur de la session) : tu présentes le modèle DANS LE VISUALISEUR (ouvrir `fonderie/index.html` — pas de terrain, pas de serveur de jeu), Erik tourne/zoom et te donne ses retouches, tu itères. Autant de tours que nécessaire.
4. Tenir un court journal des itérations (ce qui a changé à chaque tour, choix de modélisation) — il alimentera le rapport.
5. **La teinte joueur** : prévoir la claque de teinte (matériau séparé ou vertex-color) et la démontrer avec 2 variantes de teinte dans le visualiseur (Erik doit pouvoir juger J1/J2).

## 4. Critères d'acceptation

- `fonderie/index.html` s'ouvre sans le projet, hors ligne, et offre toutes les fonctions §T1.2 ; le compteur de tris affiche le vrai chiffre du Guerrier.
- Le Guerrier respecte `STYLE-3D.md` (essence, palette, < 5 000 tris, ≤ 3 matériaux) et **Erik le valide à l'œil dans le visualiseur** — c'est LUI qui décide, à chaque itération.
- Zéro fichier hors `fonderie/` modifié ; le jeu n'a pas été lancé ; aucun test du projet exécuté (rien à exécuter).
- Les paramètres de rendu copiés du jeu sont consignés dans `viewer.js` (commentaire) et dans le rapport.

## 5. Périmètre interdit

- **L'intégration au jeu** (chargement GLTF dans `apps/web`, mapping data-driven, retrait du gabarit paramétrique) : ce sera le handoff T3, lancé par le pilot APRÈS validation du .glb par Erik. Ne pas anticiper, même partiellement.
- La promotion `assets-src/modeles/` : session ultérieure, sur la base du .glb validé.
- Les autres unités (Archer, etc.) : une fois le workflow rodé sur le Guerrier, chaque unité sera une session de fonderie.
- Tout changement de gameplay, de spec visuelle du jeu (`visuel3d.json`), de `STYLE-3D.md` (proposer, Erik décide).

## 6. Fin de session

Rapport `REPORT-FONDERIE-3D.md` (dans `fonderie/` — PAS dans `docs/` : le pilot l'archivera), contenant : le journal d'itérations, le compte de tris/matériaux final, les réglages de rendu copiés, les captures des variantes. **Rien ne se commit sans la demande explicite d'Erik** (rituel atelier). Arrêt, remise de la main.
