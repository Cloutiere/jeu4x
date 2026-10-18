# REPORT-ASSETS-UNITS-4K-VAGUE5

**Mission** : HANDOFF-ASSETS-UNITS-4K-VAGUE5 (décisions Erik 16/10) — les 13
dernières unités jouables passent en 4K ; après cette vague, **plus aucune
unité jouable n'est en SVG d'atelier** (D1). Client/asset seul,
`schemaVersion` 27.

**Écart au handoff, consigné** : la table §2 du handoff liste 9 types, mais le
titre et le critère d'acceptation (« ZÉRO unité jouable en SVG atelier »)
parlent de 13 — Erik a déposé AUSSI `new_fusiller`, `new_artillerie`,
`new_infanterie` et `new_tank` (sources ×6 _trsp complètes). Les 4 ont été
traitées avec le même pipeline : **fusiller, artillerie, infanterie_moderne,
char_d_assaut**. ⚠ Piège de nommage : le nom MOTEUR est « fusilier » (un l),
les fichiers d'Erik « fusiller_*.png » (consigné dans le profil).

## Livré

- **13 types recuits** (25 profils `import_svg` : 12 × (6couleurs + base) +
  `espion-universel`) = **73 cuites** (72 variantes j1..j6 + base espion) :
  piquier, sous_marin, canon, milice, caravane, icbm, chasseur, bombardier,
  fusilier, artillerie, infanterie_moderne, char_d_assaut (×6 palettes) +
  espion (universelle).
- **D2 — Canon** : sources JPEG opaques → transparence DÉRIVÉE par le labo
  (`devtmp/canon-transparence.mjs` : fond blanc connecté aux bords, seuil 26,
  frontière adoucie 1 px ; les blancs du dessin — reflets, intérieur du tube —
  préservés). Planches A/B par couleur :
  `dev-logs/captures-assets-units-4k-vague5/canon/ab_canon_<c>.png`.
  **Verdict à l'œil Erik attendu** — ré-export possible, veto facile.
- **D3 — Espion universelle** : une seule image (aucun accent, aucune teinte
  joueur) ; `unite_espion_accent.png` RETIRÉ du dépôt (public/art ET
  assets-src/exports, sinon sync-art le ressuscitait) ; test
  `atelier-catalogue.test.ts` : espion ajouté à `SANS_ACCENT`.
- **D4 — Uniques** : rien à faire (aliasing R-148) — spot-check : Obusier →
  artillerie, Canon 88 → canon, Mustang/Spitfire → chasseur, chars uniques →
  char_d_assaut héritent automatiquement des nouvelles bases cuites.
- **D5 — ICBM** : `icbm_bleu.png` (sans suffixe) vérifié **RGBA 4K**, utilisé
  comme variante bleue. Chemin de texture standard (aucun code ICBM spécifique
  côté web — passage `TOUS_TYPES_UNITES` + cuites `icbm@<palette>`).
- **D6 — Intouchés** : GP, barbares, bâtiments, gameplay — non touchés
  (artiste/penseur/scientifique/mogol/ingénieur = classes illustres HORS
  « unités jouables de combat », art atelier conservée).

## Calibre (convention des vagues : hauteur de contenu figée sur l'avant ×2)

| Unité | Avant (256×320) | Cible | Mode | Résultat |
|---|---|---|---|---|
| piquier | 251 | 502 | hauteur | 502 ✓ ×6 |
| milice | 205 | 410 | hauteur | 410 ✓ ×6 |
| caravane | 188 | 376 | hauteur | 376 ✓ ×6 |
| icbm | 231 | 462 | hauteur (bleu/jaune : LARGEUR) | 462 ×4 ; bleu 432, jaune 450 🔶 |
| canon | 260 | 520 | LARGEUR (art quasi carrée) | ~450 (−13 %) 🔶 exception catapulte |
| sous_marin | 135 | 270 | hauteur | 270 ✓ ×6 |
| chasseur | 207 | 414 | LARGEUR (jet de profil ~2,2:1) | ~160-205 🔶 |
| bombardier | 233 | 466 | LARGEUR (débordait 476-494) | ~430-446 🔶 |
| fusilier | SANS art atelier | 356 (= infanterie_moderne, fantassin comparable) | hauteur | 356 ✓ ×6 🔶 cible arbitraire |
| artillerie | 264 | 528 | LARGEUR (l'avant aurait débordé) | ~432-463 🔶 |
| infanterie_moderne | 178 | 356 | hauteur | 356 ✓ ×6 |
| char_d_assaut | 196 | 392 | hauteur | 392 ✓ ×6 |
| espion | 210 | 420 | hauteur | 420 ✓ |

Vérifié au pixel après cuisson : toutes les cuites à ±1 px de la cible,
largeur ≤ 457 (arrondi). Mesures : `devtmp/bboxes-vague5.json`.

## Validation (L3, avant commit)

- **Partie réelle (GameCanvas)** : rangées VAGUE5 ajoutées au labo-rendu
  (`LaboRendu.svelte` : 12 types ×6 palettes r=20..42 + espion ×6 r=46,
  hauteur carte 17→48) — capture `labo-vague5-vue-large.png` (rendu réel).
- **Atelier** : planches par unité `atelier-<type>.png` (13 recherches) ;
  catalogue étendu (+72 variantes, doc VAGUE5).
- **Planches de calibre** : `planche-calibre-vague5.png` (13 rangées ×6 sur
  prairie) + `planche-calibre-vague5-complement.png` (les 4 du complément) —
  lisibles pour le verdict à l'œil.
- **Asserts e2e** (`devtmp/vague5-gui.mjs`, Vite 5174 + msedge) : 72 cuites +
  12 bases servies (magic bytes PNG — le repli SPA de Vite renvoie 200 HTML sur
  un fichier absent, piège consigné), espion base OK + accent absent.

## Suites

- web **667/667** verts ; svelte-check **0 erreur** (17 warnings a11y
  préexistants) ; `import_svg.test.mjs` **18/18**.
- Pièges rencontrés et consignés : `each_key_duplicate` (les bases
  `unite_<id>` sont DÉJÀ au catalogue via la boucle UNIT_TYPES — ne pousser
  QUE les variantes j*) ; Vite sert 200 sur 404 réel (vérifier les magic
  bytes) ; sync-art copie TOUT exports/ → retirer de exports/ tout fichier
  supprimé de public/art ; « fusiller » (fichiers Erik) ≠ « fusilier »
  (moteur).

## Inventaire final des sources (`new_units/` — JAMAIS committées)

- RGBA 4K ✓ ×6 : piquier, sous-marin (tiret normalisé `_`), milice, caravane,
  icbm ×5 + icbm_bleu.png (RGBA vérifié), fighter→chasseur, bomber→bombardier,
  fusiller→fusilier, artillerie, infanterie→infanterie_moderne,
  tank→char_d_assaut.
- Universelle ×1 : espion.
- Dérivées labo : canon ×6 (JPEG → _trsp, D2).
- Copies normalisées dans `assets-src/modeles/4k/` (gitignoré), profils dans
  `import_svg.profiles.json`.

## 🔶 À l'œil Erik (recalage `echelleParVariante` en 1 ligne par variante)

1. **Canon** — transparence dérivée (D2) : halo/franges éventuelles ;
   hauteur −13 % (exception catapulte, art quasi carrée).
2. **Chasseur** — calibre LARGEUR-calée (jet de profil très large) : paraît
   petit face au bombardier (vue de dessus) ; recalage possible.
3. **Artillerie** — LARGEUR-calée (~432-463 vs cible 528, art très large).
4. **ICBM bleu/jaune** — largeur-calées (456), hauteur 432/450 vs 462.
5. **Fusiller** — cible de calibre arbitraire (356, aucun avant existant).
6. Calibre général des 13 en partie réelle.
