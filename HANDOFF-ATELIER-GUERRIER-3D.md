# HANDOFF-ATELIER-GUERRIER-3D — Refonte du Guerrier 3D : humanoïde cyber (référence image)

**Session d'atelier visuel** — le rituel `ATELIER-ASSETS.md` s'applique intégralement : Erik regarde dans `#/atelier`, itère, et c'est LUI qui dit « commite ». Ce handoff cadrera la première livraison ; les itérations suivantes suivent le rituel.

## 1. Préalables

1. Lire `ATELIER-ASSETS.md` (le rituel — EN PREMIER), `PROJET.md`, `PILOT-HANDOFF.md` §3-§4.
2. Baseline : 928+ tests verts, typecheck 4/4, `git status` propre — **vérifier** (l'atelier d'Erik peut avoir des retouches non commitées ; ne jamais les absorber).
3. **Image de référence d'Erik : `image_ref/guerrier.jpg`** (racine du dépôt) — c'est LA cible visuelle : humanoïde cyber en wireframe facetté vert néon, casque à visière, épaulières, épée à fil lumineux, style « hologramme matriciel ». Le style (wireframe + glyphes binaires + lueur) compte plus que la copie exacte.
4. Rappels perf (discuté avec Erik le 06/09) : budget **< 5 000 triangles** pour l'unité complète ; cible réaliste 2 500-4 000 ; **1 mesh fusionné + 1-2 matériaux** (corps sombre + émissif néon) pour rester à ~1 draw call par unité ; géométrie angulaire/facettée (le style de l'image est déjà low-poly assumé).

## 2. Contexte technique (ce qui existe)

- Le calque unités 3D est **paramétrique** : `visuel3d.json` §`structures.uniteGuerrier` (corps, cœur, pattes, bras, arme) est consommé par `apps/web/src/lib/render3d/spec3d.ts` (validation du spec) et assemblé en code par `structures3d.ts` (pools de géométries, matériaux). Le catalogue `§structures.unites3d` mappe type moteur → gabarit (data-driven, entrée d'atelier sans nouveau code).
- Le Guerrier actuel (« Script de Base » : corps capsule + 4 pattes + bras + arme) est le gabarit `guerrier` — l'Archer (`archer`, lasso) partage la structure.
- L'atelier `#/atelier` expose les structures 3D du catalogue : une fois le gabarit enrichi, la fiche Guerrier doit montrer le nouveau modèle avec vue isolement, caméra orbitale, bascule Bloom, références A/B (`atelier:ref:*`).
- Pièges connus : HMR servant du vieux code (rechargement complet) ; `rAF` absent du navigateur d'automatisation → **valider par captures d'écran de l'atelier** (posées dans `dev-logs/`) et non par des tests de rendu.

## 3. Mission

### M1 — Étendre le gabarit `guerrier` vers l'humanoïde (data-driven)
1. Faire évoluer le gabarit `guerrier` (garder l'id et le mapping) vers un **humanoïde cyber** proche de l'image : casque à visière (pas de visage à modéliser), torse + épaulières en plaques facettées, bras/moufles, jambes/bottes, épée à lame plate avec **fil émissif** (matériau, pas de géométrie). Cœur néon conservé (identité du langage cyber, cf. Mainframe).
2. Le spec reste **data-driven** : étendre `visuel3d.json` §`uniteGuerrier` (ou remplacer par une structure de gabarit humanoïde) + validation dans `spec3d.ts` (le chargeur doit refuser un spec incomplet — étendre les tests du chargeur).
3. **Budget et batching** : un seul mesh fusionné par unité si possible, 2 matériaux max (corps sombre + émissif néon), < 5 000 tris — tracer le compte de triangles et de draw calls dans le rapport (mesuré dans l'atelier ou via un bench rapide).
4. L'effet « wireframe/hologramme » de la référence se fait **par shading** (matériau wireframe, arêtes émissives, texture), PAS par de la géométrie supplémentaire — ne pas mailler les lignes.
5. L'échelle/le survol doivent rester cohérents avec la tuile hexagonale (rayon 1) et le playback de déplacement existant (`AnimUnite`), barres PV et sélection projetées inchangées.

### M2 — Atelier
1. La fiche Guerrier de `#/atelier` montre le nouveau modèle (isolement, orbitale, Bloom, grille hex, A/B).
2. Captures du rendu dans `dev-logs/captures-guerrier-3d/` (plusieurs angles, bloom on/off, fond clair/sombre).
3. Le test de complétude du catalogue (`atelier-catalogue.test.ts`) reste vert.

### M3 — Effets de bord à vérifier (zéro changement gameplay)
- `packages/rules`, serveur : intouchés. `schemaVersion` inchangée (18).
- La 2D (sprite billboard) reste le rendu par défaut des autres types sans gabarit — rien d'autre ne change.
- Le rendu en PARTIE (GameCanvas, mode 3D) doit afficher le nouveau modèle sans régression (sélection, playback, barres) — capture en jeu si possible.
- L'Archer garde son gabarit actuel (sa réfection sera une session d'atelier ultérieure, même modèle de handoff).

### M4 — Rituel de validation avec Erik
1. Lancer `pnpm dev:web` (port 5174), ouvrir `#/atelier`, signaler l'atelier prêt, faire regarder le Guerrier à Erik.
2. Itérer selon ses retouches (le workflow §Workflow du rituel) — les paramètres data-driven sont faits pour ça.
3. **Ne commiter QUE sur sa demande explicite**, atome par atome, `pnpm test` + `pnpm typecheck` verts avant.

## 4. Critères d'acceptation

- Le Guerrier 3D ressemble à la référence (humanoïde facetté, visière, épée à fil lumineux, langage néon du jeu — pas besoin d'identique) ; Erik valide à l'œil dans l'atelier.
- < 5 000 tris, ≤ 2 matériaux, ~1 draw call par unité (chiffré dans le rapport).
- Spec validé par le chargeur (tests étendus), suite complète verte, typecheck 4/4.
- Zéro régression en partie 3D (capture à l'appui) ; catalogue atelier complet (test vert).

## 5. Périmètre interdit

- Archer et autres types d'unités (sessions ultérieures) ; sprites 2D ; terrains/structures ; tout fichier gameplay (`packages/rules`, serveur, tests gameplay) ; renommage V3.
- Import d'un modèle externe (glTF/FBX) : cette tranche reste procédurale/code — si l'import de modèles s'avère nécessaire un jour, ce sera un chantier de pipeline dédié.
- Toute décision esthétique non cadrée par l'image : proposer, montrer, attendre Erik.

## 6. Fin de session

Rapport `REPORT-ATELIER-GUERRIER-3D.md` (choix de modélisation, budget tris/draw calls, captures, retouches d'Erik appliquées), arrêt, remise de la main. Ne pas archiver le handoff ni éditer PROJET.md/PILOT-HANDOFF.md (le pilot s'en charge).
