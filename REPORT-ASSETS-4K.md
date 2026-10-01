# REPORT-ASSETS-4K — Pipeline PNG 4K + guerrier/colon 4K + tuiles de terrain 4K (et brume)

> Mission du 02/10 (HANDOFF-ASSETS-4K.md). 2D uniquement, zéro changement moteur/serveur/protocole, `schemaVersion` inchangée. **AUCUN COMMIT — arrêt pour approbation d'Erik (L4).**

## 1. Mapping des sources (nommage irrégulier d'Erik, D1/D3)

Copies fidèles des fichiers d'Erik en `assets-src/modeles/4k/` (les originaux `new_units/`, `new_tiles/` ne se committent JAMAIS) :

| Cible (stem) | Source 4K |
|---|---|
| `unite_guerrier_j1..j6` + `unite_guerrier` | `new_units/new_guerrier/guerrier_{bleu,rouge,jaune,orange}4k_trsp.png`, `guerrier_{vert,ardoise}4K_trsp.png` (casse K variable) |
| `unite_colon_j1..j6` + `unite_colon` | `new_units/new_colon/colon_trsp_4k_{bleu,rouge,vert,jaune,orange,ardoise}.png` |
| `tile_prairie/plaine/colline/montagne/desert` | `new_tiles/{terrain}_4K.png` |
| `tile_foret` / `tile_eau` / `tile_ocean` | `new_tiles/arbre_4K.png` / `rivage_4K.png` / `ocean_4K.png` |
| `tile_cacher_{prairie,plaine,colline,montagne,desert,foret,eau}` | `new_tiles/{terrain}_4K_fog.png` (arbre→foret, rivage→eau) ; océan : pas de variante (aucune ressource n'y spawn, inchangé) |

Mapping couleur→faction inchangé (bleu→Saphir J1, rouge→Rouge Royal J2, vert→Émeraude J3, jaune→Jaune d'Or J4, orange→Cuivre Ardent J5, ardoise→Ardoise J6). Les JPEG (`*_4K.jpeg`, damier incrusté) n'ont JAMAIS été utilisés — seuls les `_trsp.png` / PNG transparents.

## 2. Extension pipeline (L1)

`assets-src/tools/import_svg.mjs` :
- Sources `.png`/`.jpeg` acceptées partout où `.svg` l'est (regex `RE_RASTER`, même normalisation 2048² → LANCZOS). Une source **JPEG est refusée en mode « unite »** (pas de transparence — fond incrusté interdit).
- **`SEUIL_BBOX = 9`** (correctif nécessaire) : les raster 4K portent un **fantôme alpha 1-8 sur tout le canvas** (jusqu'à 44 % des px du rivage) qui gonflait la bbox et faussait le cadrage cover du mode tuile — G2 refusait 6 tuiles sur 15. La bbox ignore désormais alpha < 9.
- Plafond du zoom cover adaptatif 1,08 → **1,16** (au final inutilisé : après correctif bbox, toutes les tuiles passent à ×1,00).
- `POIDS_MAX` 300 → **400 Ko** (le détail des 4K dépasse l'ancien plafond ; max observé 331 Ko).
- Tests : `import_svg.test.mjs` **18/18 verts** dont 3 nouveaux (PNG unité accepté, JPEG unité refusé, PNG tuile hexagonale). ⚠ réaligné au passage `remplacementsPalette4` (attendait encore 8 variantes de l'ère 7 factions — échec préexistant à HEAD, hors suite CI ; attend désormais les 6 de `ordre_joueurs4`).

## 3. Cuisson (L2) et calibre (D2)

- 14 sprites unités (512×640, mode « variantes fournies », echelle 0,8808 inchangée) + 15 tuiles (224×256, mode tuile : bbox, fenêtre collée haut, masque hexagone + contour #2B2620 2,5 px).
- **Calibre vérifié au pixel** : hauteur de contenu identique à l'avant sur **10/12 variantes** (±2 px, ex. guerrier j1 487 vs 486, colon j1 418/418). 🔶 **2 écarts** : guerrier j3 Émeraude **481 vs 521 (−8 %)** et j4 Jaune d'Or **511 vs 487 (+5 %)** — proportions des nouveaux dessins (le vert SVG était plus étroit, le jaune 4K plus large). Une Variante par variante (`echelleParVariante`, implémenté puis **retiré**) peut recaler si Erik préfère — l'option est disponible en 1 ligne par faction.
- **Contour (décision D3)** : les sources 4K sont pré-contourées (anneau noir ~1,7 px à l'échelle tuile). Après masque, l'anneau baked **coïncide avec le contour pipeline** — pas de doublement visible (captures `bord-tile_prairie.png`, `bord-tile_eau.png` ×6). Le contour pipeline est conservé tel quel.
- **Brume (D4)** : les cuissons `_4K_fog` REMPLACENT les textures « cacher » du 26/09 aux MÊMES clés (`tile_cacher_*`) — zéro changement de code de sélection (`nomTuilePour` intact, tests tuiles-ressources 9/9). Ressource cachée non révélée = tuile brumeuse SANS jeton ; révélation = tuile-ressource (intouchée, D5) ; les 21 tuiles-ressources ne sont PAS retouchées.

## 4. Vérification (L3) — `dev-logs/captures-assets-4k/`

- `ab-prairie.png`, `ab-foret-eau.png` : nouveau/brume/avant côte à côte (fidélité 4K nettement supérieure).
- `ab-guerrier.png`, `ab-guerrier2.png`, `ab-colon.png` : ×6 avant/après (même personnage, rendu 4K plus riche).
- `labo-unites-6nations.png`, `labo-unites-zoom2.png` : rendu réel (GameCanvas), archer SVG + colon 4K, cohabitation, zoom.
- `solo-depart/dezoome/zoom-max.png` : les 8 terrains 4K en jeu, netteté au zoom extrême (mipmaps OK).
- `brume-essai1.png` + `brume-essai1-zoom.png` : **case à ressource cachée EN JEU = tuile brumeuse 4K, SANS jeton**, voisine d'une prairie normale.
- Suites : web **461/461**, svelte-check **0 erreur**, typecheck monorepo **4/4**, import_svg **18/18**.

## 5. Ce qu'Erik valide en ligne (L4)

1. Les rendus 4K (unités ×6 guerrier/colon, 8 terrains, brume) — A/B à l'appui.
2. Le calibre, et les 2 écarts j3 (−8 %)/j4 (+5 %) : accepter ou demander le recalage par variante.
3. Le contour (baked + pipeline confondus) et la lisibilité de la brume.
4. 🔶 Non tranché (hors périmètre, décision séparée) : cuisson tuiles ×2 (448×512) pour le zoom extrême — les sources 4K le permettraient sans perte.

## 6. Vague 2 (ajout Erik du 02/10, même mission) — ressources 4K + hutte + barbare

- **20 tuiles-ressources repassées en 4K trsp** (`tile_ressource_*`, clés et consommation inchangées — révélation = tuile-ressource, intouché). Renames conservés : alluminium→aluminium, boeuf→boeufs, gems→gemmes, poissons→poisson, souffre→soufre.
- **Boeufs** : source `oxen_prairie_4k_trsp.png` (pas de `boeuf_*_4k_trsp` — oxen considéré comme le nouveau boeuf ; à confirmer à l'œil, planche `ab-ressources.png`).
- **Hutte** (`hutte_4k_trsp`) et **camp barbare** (`tuile_barbare_4k_trsp` → `village_barbare`) en 4K ; **barbare** (`unit_barbare_4K_trsp` → `unite_barbare_guerrier`) calibre vérifié : contenu 441×453 vs avant 441×455 ✓.
- 🔶 ~~2 ressources SANS source 4K trsp~~ **RÉSOLU** : aluminium et gemmes fournies puis cuites en 4K (planche `ab-aluminium-gemmes.png`) — les 22 tuiles-ressources sont désormais en 4K.
- 🔶 **Baleine : deux sources 4K** (`baleine_rivage` ET `baleine_ocean`) — j'ai gardé rivage (clé actuelle `tile_ressource_baleine`). Si Erik veut une variante océan distincte, c'est un changement de données (TUILES_RESSOURCES par terrain), hors périmètre.
- Planches : `ab-ressources.png` (fer/blé/or/hutte avant-après), `ab-barbare.png` (camp + barbare). Suites revérifiées : web 461/461, typecheck 4/4. Total copies 4K : **51 fichiers (~450 Mo)**.

## 7. Divers

- 🔶 Les copies sources en `assets-src/modeles/4k/` pèsent **~594 Mo** (53 PNG 4K, vagues 1+2+aluminium/gemmes) — c'est la politique « copies en assets-src » du handoff, mais le poids du dépôt à commit est à confirmer par Erik.
- Fichiers d'Erik (`new_units/`, `new_tiles/`) non commités, inchangés. Scripts de capture : `devtmp/capture-assets-4k.mjs`, `devtmp/capture-brume-4k.mjs` (devtmp, non commités).
- Pipeline : `echelleParVariante` reste implémenté dans import_svg.mjs (optionnel, non utilisé — utile si Erik demande le recalage j3/j4).
