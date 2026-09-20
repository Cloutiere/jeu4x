# REPORT-ACCENTS-7-FACTIONS — Palette officielle 7 factions + barbare, variantes cuites ×8

**Mission tenue (handoff ACCENTS-7-FACTIONS).** Zéro gameplay, zéro 3D : palette data-driven + pipeline + rendu. **Rien n'est committé** — validation locale avec captures d'abord (règle établie). Suite verte forcée : web **319/319** (312 + 7 nouveaux), convertisseur **13/13**, typecheck **0 erreur** (13 warnings préexistants).

## 1. M1 — La palette data-driven, source unique

- **`apps/web/src/lib/render/accents.json`** : la table canonique d'Erik (fait foi, 20/09) — 7 joueurs × {reflet, base, ombre} + **barbare rouge sang** (`#DF424A`/`#B81D24`/`#7A0E13`, option B tranchée) = **8 palettes**. Le fichier porte aussi les 3 gris du maître (`#FEFEFE`/`#FFFFFF`/`#8C8C8C`).
- **`apps/web/src/lib/render/accents.ts`** : lecture + **schéma validé au chargement** (7 joueurs p1..p7 + barbare, hex `#RRGGBB`, 3 teintes distinctes par faction — une entrée invalide fait échouer le chargement). Exports : `FACTIONS`, `CLES_JOUEURS`, `PLAYER_COLORS` (bases, clé moteur `barbarien` pour le barbare), `couleurAccent(owner, tonalite='base')`, `LISTE_FACTIONS`, `suffixeCuit` (p1→j1 … barbare). **Tonalité BASE par défaut** pour tous les traits fins (anneaux, liserés, frontières, worked tiles, sélection, tooltips) via `playerColor()` de textures.ts, qui lit désormais la palette.
- **Inventaire des hex en dur remplacés** (grep des historiques `#3DFFCE`/`#FF9A3D`/`#D64545` + tout accent/drapeau/anneau) :

| Fichier | Avant (en dur) | Après |
|---|---|---|
| `textures.ts` | `PLAYER_COLORS` {p1 `0x3dffce` menthe, p2 `0x3b6fd6`, barbarien `0x8a7a66`} | lecture palette (bases p1..p7 + `barbarien`→rouge sang) |
| `Atelier.svelte` | `ACCENTS` 3 entrées (menthe/bleu vif/gris-brun) + `CUITES` {p1} | `ACCENTS` **8 entrées** depuis `LISTE_FACTIONS` (base) + `CUITES` ×8 |
| `LaboCombat.svelte` | `COULEURS_CAMP`/`TEXTE_CAMP` 6 hex littéraux (menthe/violet/ambre/rose/rouge plat) | palette (bases) + texte lisible calculé par luminance |
| `Lab3d.svelte` | `couleurDe` = `p2? 0x3b6fd6 : 0xd64545` | `playerColor` (palette) |

- `#FF9A3D` : **aucune occurrence** dans le dépôt (hex historique disparu avant ce chantier).
- **Cas UI restants (verdict demandé à l'œil)** : (a) la croix rouge `0xd64545` des ordres d'attaque (GameCanvas) est un marqueur d'ordre, pas une couleur de faction — laissée telle quelle ; (b) la sélection `0xffe082`/anneaux de spawn `0x00b4d8` sont neutres (tous joueurs) — inchangés ; (c) le **chrome des pages** atelier/lab3d (titres, bordures actives `#3dffce` en CSS) est le thème de l'outil, pas un accent de faction — inchangé ; Erik veut-il un thème de page neutre ? ; (d) fallback `0x8a5ad6` pour owner inconnu (jamais atteint en partie normale).

## 2. M2 — Le pipeline : variantes cuites ×8

- **`import_svg.mjs`** : nouveau mode profil **`remplacementsPalette`** = { couleurSource → TONALITÉ (`reflet`|`base`|`ombre`) }. Pour chaque faction de `accents.json` (même fichier que le web — source unique), le mapping des 3 gris est appliqué au texte SVG (fill + stop-color, tolérance de lecture inchangée) et **un PNG par faction est produit** : `unite_guerrier_j1..j7` + `unite_guerrier_barbare`. Profils : `guerrier-j1-cuit` remplacé par `guerrier-cuite` (mapping : `#FFFFFF`→base, `#FEFEFE`/`#FEFEFD`/`#FAF9F9`→reflet, `#8C8C8C`→ombre).
- **Gate G5 (teintes au pixel)** : chaque teinte attendue dont la SOURCE existe dans le SVG doit être présente au pixel (±2 par canal, anti-aliasing ignoré). Rappel mesuré (rapport IMPORT-SVG §8) : le SVG Recraft du guerrier ne porte ni `#FEFEFE` ni `#8C8C8C` en littéraux — chaque variante ne contient donc réellement que **base ×19 + reflet ×2 (stops du dégradé)** ; la teinte ombre est mappée ×0 et n'est pas exigée au rendu (testé ×0 → gate OK).
- **Moteur** : `loadTextures` charge les 7 PNG cuits → `GameTextures.cuites` clés `guerrier@p1`..`guerrier@p7` ; `buildUnitContainer` rend la variante cuite SANS teinte d'accent, **repli teinte runtime si le PNG d'un owner est absent** (compat, déjà en place). Le barbare garde ses sprites dédiés (`barbare_<type>`, rouge déjà cuit dans la base R-95) — sa palette 3 teintes sert aux accents de repli (village barbare, hutte) désormais **rouge sang** au lieu de gris-brun.
- **8 variantes générées** (35 Ko chacune, gates G3/G4/G5 OK, sortie `exports/` → `pnpm sync-art` → `public/art/`).

## 3. M3 — Vérification

- **Tests convertisseur** (`import_svg.test.mjs`) **13/13** : +2 tests — `remplacementsPalette` produit bien 8 variantes portant les 3 teintes de leur faction au pixel (J1 = table Erik exacte, barbare = rouge sang) ; `gateTeintes` tolérance ±2 (exact OK, +2 OK, +7 refusé). Idempotence SHA-256 inchangée.
- **Tests web** `accents-palette.test.ts` (7 tests) : schéma (7+1 entrées, hex valides, teintes distinctes, bases deux à deux distinctes), table canonique échantillonnée (J1/J4/J7/barbare), `PLAYER_COLORS` complet, suffixes cuits.
- **Suite web : 319/319** (filet catalogue : les 8 fiches `unite_guerrier_j1..j7/_barbare` existent dans `public/art/`). Typecheck : 0 erreur.
- **Atelier** : la fiche `unite_guerrier` affiche les **8 variantes cuites côte à côte** (base + 7 joueurs + barbare) ; le catalogue porte 8 fiches « Guerrier — variante cuite … » (les 7 guerriers côte à côte dans la grille Sprites 2D).
- **Zéro gameplay** : `packages/*`, serveur, `generate.py` intouchés. Zéro diff 3D (seul Lab3d lit désormais la palette pour ses teintes d'accent 2D-posées). Fichiers racine d'Erik intouchés.

## 4. Captures (`dev-logs/captures-accents-7-factions/`)

**Réordonnancement Erik (20/09, après première passe)** : l'ordre des palettes J1..J7 a été inversé à sa demande — 1→5, 2→1, 3→3, 4→2, 5→6, 6→4, 7→7. Table finale : **J1 Bleu Acier, J2 Ocre Jaune, J3 Vert Mousse, J4 Gris Ardoise, J5 Rouge Brique, J6 Bleu-Vert Canard, J7 Rouge Bourgogne** (barbare inchangé). Variantes cuites régénérées, captures refaites, tests mis à jour — suite verte.

- `atelier-guerrier-accents-8-palettes-fullpage.png` — fiche du guerrier : base + **accents Joueur 1..7 (cuits)** dans le nouvel ordre, **accent Barbare (cuit)** rouge sang visible ;
- `labo-camps-j1-j5-barbare.png` — labo 5 nations : 6 guerriers posés, J1 bleu acier, J2 ocre jaune, J3 vert mousse, J4 gris ardoise, J5 rouge brique, barbare rouge sang (jetons camps) ;
- `partie-guerrier-j1-cuit-selection.png` — partie solo HNW87M (France) : guerrier J1 avec son bouclier **bleu acier** cuit, sélectionné (anneau neutre), panneau UNITÉ.

Note : le serveur de dev d'Erik tournait déjà sur 5174 — captures faites contre ce serveur (HMR a servi le code à jour). La partie solo HNW87M a été créée pour la capture (tour 0, sans ordre).

## 5. À l'œil d'Erik (leviers prévus)

- Verdict sur les cas UI restants (§1a–d) ;
- reflet/ombre pour les états (survol = reflet, sélection forte = ombre) : non câblé — `couleurAccent(owner, tonalite)` est prêt ;
- si Erik veut l'ombre visible sur le guerrier, il faut un gris `#8C8C8C` (ou un stop sombre) dans le SVG source Recraft.

## 6. État

Non committé — commit/push sur demande explicite d'Erik.
