# REPORT-VILLE-TRIPO — Session du 08/09/2026 (T1 — habillage en fonderie)

## Validation d'Erik (08/09, tour 3)

- **Variante A + corps émissif VALIDÉE à l'œil** (« ce que je vois actuellement est parfait ») : anneaux `accent_joueur` + texture Tripo intacte en baseColor ET en emissiveMap (facteur 0.7).
- Décisions consignées : lueur des anneaux 1.6 OK ; **échelle 2,6 OK** (débordement des anneaux accepté) ; **distinction capitale REPORTÉE** (défaut du handoff, pas d'objection) ; pas de couche émissive supplémentaire à faire (la carte émissive corps couvre le besoin).
- **Promotion effectuée** : `fonderie/modeles/ville_v1_A.glb` → **`assets-src/modeles/ville_v1.glb`**. L'intégration jeu (T2) reste une session séparée.
- **Mapping joueur → teinte tranché par Erik** (pour T2) : **J1 = `#3DFFCE`** (menthe/azur, la couleur néon d'identité), **J2 = `#FF9A3D`** (orange) ; le **rouge `#FF3D3D` reste réservé aux barbares**. Violet/bleu/jaune/rose (`#B03DFF`, `#3D9AFF`, `#FFE23D`, `#FF3DB8`) restent disponibles pour d'éventuels J3-J6.

## Livrables (validés)

- **`fonderie/modeles/ville_v1_A.glb`** — variante A : seuls les ANNEAUX en `accent_joueur` (teintés par le jeu, multiplication), le CORPS est la texture Tripo **copiée octet pour octet** (JPEG embarqué tel quel, matériau `corps_tripo` intact).
- **`fonderie/modeles/ville_v1_B.glb`** — variante B : anneaux teintés + corps entier en `accent_joueur` neutre-clair (texture unie claire + facteur cuit), à la manière du knight.
- Les deux : **3 664 triangles** (mesh Tripo intact, expandu à l'export — corps 2 165 + anneaux 1 499), **2 matériaux**, ~2 draw calls, origine au SOL, Y-up, hauteur **2,6 unités**, un nœud, zéro scène superflue.
- **Outil** : `fonderie/outils/habiller-ville.mjs` (table `S` unique) — modes `--preview` (5 vues source), `--calibre` (diagnostics radiaux par bande Y), `--zones` (rendu corps/anneaux colorés), export `--variante=A|B`.
- **`glb.mjs` étendu** : paramètre `imagesCustom` (liste libre d'images avec mimeType) — nécessaire pour embarquer le JPEG Tripo sans le transcoder. Rétro-compatible (les 22 v1 et le knight inchangés).
- **Visualiseur** : ville par défaut (`ville_v1_A.glb`), nouveau bouton **« A/B ville A|B »** (variantes côte à côte, hauteurs égalisées), caméra exposée dans `window.__fonderie` (débogage).

## Découvertes / décisions (à lire avant toute retouche)

1. **Pas de face avant** : la ville est quasi rotationnellement symétrique (vues avant/arrière/gauche identiques aux rendus `--preview`) — **pas de pivot**, la convention -Z est trivialement satisfaite.
2. **Ciblage des anneaux 100 % géométrique** (la texture JPEG est indéchiffrable sans décodeur, cf. méthode knight) :
   - enveloppe radiale de la tour = **percentile 0.15** du rayon des centroïdes par bande Y (bandes de 1/40 de hauteur), **lissée** (max glissant ±2 bandes) puis **clampée monotone descendant** (la tour est conique — sans le clamp, les bandes envahies par les anneaux prenaient le rayon DES anneaux pour l'enveloppe) ;
   - une bande est « anneau » si ≥ 40 triangles dépassent l'enveloppe + marge 0.03 **au-dessus du socle** (y > 0.12 — le mur d'enceinte du socle, d'abord capturé par erreur, est du corps) ;
   - dans une bande anneau, tout triangle au-delà du **bord interne** (rayon min détecté − 0.02) est anneau — pour capturer l'anneau ENTIER, pas seulement sa face externe.
   - Vérification visuelle : `captures/ville-zones-*.png` (5 vues, rouge = anneaux) — les 3 anneaux tombent juste, socle et balcons de la tour restent corps.
3. **Texture des anneaux** (nouvelle, 128²) : neutre-claire (235,238,236) pour que la teinte joueur se lise en multiplication + émissive (noir + barres de glyphes néon posées dans les triangles d'anneaux, 264 barres, PRNG graine 20260908) — les anneaux BRILLENT (emissiveStrength 1.6, visible bloom on comme off).
4. ⚠️ **Facteur de luminance du corps B : 1.2, PAS 6.6** (écart avec le knight, documenté) : la texture unie claire (235 ≈ 0.92) × 6.6 sature TOUS les canaux > 1.0 → le corps rend blanc écrêté et la teinte joueur devient invisible (constaté à l'écran, captures `ville-ab-j5*.png`). À 1.2 le corps reste neutre-clair sans saturer et la teinte multiplicative se lit. Le 6.6 du knight avait été calé par Erik sur SA texture repeinte plus sombre — la valeur n'est pas transposable telle quelle.
5. **Ordre à l'écran du mode A/B** : vérifié par capture sous teinte J5 (le corps B seul vire au jaune) — `-X` apparaît à DROITE ; A est posé à +1.5 pour être à gauche. Le project() de débogage donnait des valeurs incohérentes (matrices non à jour au moment de la mesure) : seule la capture fait foi.
6. **glTF indexé → expandu** à l'export (construireGLB ne gère pas les indices), comme le knight : 10 992 sommets exportés pour 3 664 tris, compteur honnête du visualiseur OK (3 664 par modèle, 7 328 en A/B).
7. **Retouche demandée par Erik (corps trop sombre vs rendu Tripo)** : la texture Tripo est AUSSI branchée comme `emissiveMap` du corps (`S.emissifCorps`, 0.7 par défaut) — toujours octet pour octet, aucune repeinte : ses lignes néon cuites brillent et la tour devient lisible aux réglages du jeu (`captures/ville-A-emissif.png`). Désactivable avec `emissifCorps: 0`.

## Ce qu'Erik doit regarder dans le visualiseur

http://localhost:5178/ — `ville_v1_A.glb` par défaut ; bouton **A/B ville A|B** ; teintes neutre/J1-J7 (seuls les anneaux doivent changer en A ; tout en B) ; Bloom on/off ; Grille tuile ; Fond clair.

- **Décisions attendues** :
  1. **Variante A ou B** (A = corps Tripo intact, B = teinte sur toute la ville) ;
  2. **Lueur des anneaux** : intensity 1.6 avec bloom — garder, monter, descendre ;
  3. **Échelle 2,6** (convention STYLE §5 ~2,5-2,75) — l'anneau externe déborde à rayon 1,8 (2 × 0,9) de la tuile : acceptable ou réduire ? ;
  4. **Point handoff §2.6** : distinction capitale — défaut proposé : REPORTÉE (même visuel partout en T2) ;
  5. (option handoff §2.3) couche émissive sur les fenêtres du corps : non faite — dire si voulue.
- Tous les seuils sont dans la table `S` de `outils/habiller-ville.mjs` — régénération en quelques secondes (`node outils/habiller-ville.mjs --variante=A|B`).

## Critères d'acceptation (état)

- ≤ 5 500 tris : **3 664 ✓** ; ≤ 3 matériaux : **2 ✓** ; origine au sol ✓ ; Y-up ✓ ; pas de face avant (symétrie) ✓ ; échelle 2,6 ✓ ; anneaux `accent_joueur` teintables (multiplication, vérifié J1/J2/J5 navigateur) ✓ ; corps A octet pour octet Tripo ✓ ; **validation à l'œil d'Erik ✓** (variante A + corps émissif promu).

## Périmètre respecté

- Lecture : STYLE-3D.md, FONDERIE.md, HANDOFF-VILLE-TRIPO.md, REPORT-FONDERIE-HABILLAGE-TRIPO.md, `image_ref/ville.glb`, `fonderie/`. Jeu/`apps/`/`packages/`/`visuel3d.json` : jamais ouverts.
- Écritures : `fonderie/` uniquement (`outils/habiller-ville.mjs`, `outils/glb.mjs`, `viewer.js`, `index.html`, `modeles/ville_v1_A|B.glb`, captures).
- **Rien ne se commit sans la demande explicite d'Erik.**

## Suite (hors de cette session)

1. Itérations visuelles d'Erik → table `S`.
2. Validation → promotion de la variante choisie vers `assets-src/modeles/` puis **T2 intégration** (remplacement du visuel Mainframe, pipeline .glb des unités, teinte multiplicative côté jeu) : session séparée.
