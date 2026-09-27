# REPORT-TUILES-RESSOURCES — Tuiles pleines par ressource révélée (art cuit) ; cachage conservé

Mission : HANDOFF-TUILES-RESSOURCES.md. **STATUT : vague 1 validée à l'œil par Erik le 26/09 (« c'est parfait ») ; vague 2 NEW-OTHERS intégrée le jour même (camp/hutte/artefacts) — verdict d'Erik attendu. RIEN n'est committé.**

## Vague 3 — tuiles « cacher » (26/09, après-midi)

Erik a fourni 7 tuiles « cacher » (`new_tiles/*_cacher.svg` : prairie, plaine, colline, montagne, désert, forêt via `arbre_cacher`, eau via `rivage_cacher`) — le terrain porte une **brume centrale** signalant « quelque chose est caché ici ». **Pas de variante océan : aucune ressource n'y spawn** (resources.json : eau seule).

- 7 profils `tuile-cacher-<terrain>` (mode tuile, ×1,0, gates vertes, max 112 Ko), sync-art fait.
- Rendu : `tile.resource === 'inconnue'` → `TUILES_CACHER[terrain]` (textures.ts, chargement optionnel, repli tuile de terrain si absent) ; le **jeton « ? » reste par-dessus la brume** (choix par défaut pour la lisibilité « c'est une RESSOURCE cachée » — VETO possible : si la brume seule suffit, retirer le jeton = condition `!resId` → `!inconnue` dans rebuildTiles).
- Sélection pure étendue : `nomTuilePour(terrain, 'inconnue')` → `tile_cacher_<terrain>` ; +2 tests (9 au total dans tuiles-ressources.test.ts).
- Captures refaites : `fiche-non-revelees-jeton-inconnue.png` montre les 7 terrains en état caché (brume + jeton).
- Suite : **897 + 391 + 116 verts, typecheck 0 erreur**.

## Vague 2 — NEW-OTHERS (26/09, retour d'Erik sur #/progen)

Retour : le **camp barbare n'était pas placé parfaitement sur sa tuile**, et `new_others/` contient la **hutte** amicale + **7 merveilles** (artefacts) + une **nouvelle version du camp** + `unit_barbare.svg` (déjà intégré) à intégrer.

- **Cause du décalage** : le sprite hexagonal du camp était ancré par son sommet bas à y=58 px alors que le sommet bas de la tuile de terrain est à +64 px (6 px de dérive). Correction dans les trois builders (`buildVillageContainer`/`buildHutContainer`/`buildArtefactContainer`, GameCanvas.svelte) : **y=64** — l'art s'assoit exactement sur l'hexagone.
- **Cuisson** : `tuile-barbare` repointé vers `new_others/tuile_barbare.svg` (nouvelle version peinte ; le dossier `new_barbares/` a disparu, `barbare-unite` repointé vers `new_others/unit_barbare.svg`) + nouveaux profils `tuile-hutte` et `artefact-<id>` ×7 (6 non-dlc + **grand_sphinx, dlcOnly : jamais rendu aujourd'hui, cuit par complétude**). Mode tuile ×1,0, hexagones pré-clippés (ratio 0,866-0,888).
- **Flag pipeline `cible.entite`** : sprite posé SUR une tuile — les trous intérieurs de l'art sont légitimes (le terrain se voit à travers ; École de Confucius en porte), la gate G2 décor-plein et le zoom adaptatif ne s'appliquent pas. G3/G4 inchangues.
- **Fin des accents hutte/artefacts** : l'art est peint — les PNG painter `hutte_accent`/`artefact_*_accent` sont SUPPRIMÉS (exports + public/art), generate.py commenté (convention TUILES-SVG, retour arrière documenté), catalogue atelier passé en base seule, test atelier-catalogue adapté. Règle de rendu : le calque teinté (or/rouge barbare) n'est dessiné QUE si `tex.accent !== tex.base` — les fallbacks painter gardent leur teinte, l'art peint reste intact.
- **Fix marqueurs fantômes (retour Erik sur #/progen : « croix, triangles et barres sous les tuiles spéciales »)** : `entityOrFallback` (textures.ts) retombait sur l'accent PLACEHOLDER painter quand le PNG d'accent était absent alors que la base cuite existait — l'état mixte dessinait les formes de secours teintées sous camp/hutte/artefacts. Correction : accent absent → accent = base chargée (sémantique `optionalEntity`) ; combiné à la règle « teinte seulement si accent !== base », les formes fantômes disparaissent. Visible en jeu comme au labo — serait parti en prod sinon.
- Sonde de scène : `__gameCanvas.app()` exposé (debug) + driver `dev-logs/sonde-marqueurs.mjs` qui a permis d'identifier les sprites fautifs.
- Labo `#/labo-rendu` : hutte en (5,0) et les 6 artefacts non-dlc en rangée 1, à côté du camp. Capture `captures-tuiles-ressources/camp-hutte-artefacts-new-others.png` (driver `driver-capture-new-others.mjs`).
- Suite : **897 + 390 + 116 verts, typecheck 0 erreur** (atelier-catalogue adapté aux arts sans accent).


## Changement d'idée consigné (alluminium)

Le handoff (D3) déclarait l'aluminium SANS art (21/22). Or `new_ressources/alluminium_colline.svg` EXISTE dans le dossier d'Erik (ajouté après la rédaction du handoff, vraisemblablement). **J'ai cuit et intégré l'aluminium : la table couvre 22/22 ressources.** Si ce SVG ne devait pas être retenu, retirer le profil `tuile-ressource-aluminium` et l'entrée `aluminium` de `TUILES_RESSOURCES` (textures.ts) — l'affichage retombe automatiquement sur tuile + jeton. VETO possible.

## Branchement rendu (révélée / non-révélée)

- **Moteur : ZÉRO changement** (D2/D6). Le cachage reste exactement celui d'avant : `filteredResource` (packages/rules/src/resources.ts:54) remplace l'id par `RESOURCE_UNKNOWN` tant que la tech manque, appliqué dans `getFilteredState` (packages/rules/src/fog.ts:163-165) ; `resources.json` intact (hiddenUntilRevealed, revealedByTech, rendements). Aucune migration, aucun changement de protocole.
- **Client — un seul lieu** : `rebuildTiles()` (apps/web/src/lib/render/GameCanvas.svelte:476) :
  - `resId` = tile.resource si identité diffusée ET texture `tile_ressource_<id>` chargée (l.503-508) → la **texture de la case devient la tuile-ressource pleine**, PAS de jeton ;
  - tout autre cas (ressource « inconnue » avant tech, ou sans art) → **affichage actuel exact** : tuile de terrain + jeton `res_inconnue` / `res_<id>` (l.539) ;
  - brouillard, glyphes de rendement, barres PV, sélection : inchangés, posés au-dessus comme aujourd'hui.
- Table data-driven `TUILES_RESSOURCES` + sélection pure `nomTuilePour()` (apps/web/src/lib/render/textures.ts:663-720) ; chargement optionnel des 22 cuites dans `loadTextures` (absence de PNG → null → repli jeton automatique).
- 3D : non touchée (TerrainWorld reçoit toujours `tile.resource` tel quel).

## Inventaire combos couverts / orphelins (D4)

**22 ressources couvertes, 0 sans art.** Correspondances directes ×17 + renames triviaux ×5 : `alluminium→aluminium`, `boeuf→boeufs`, `gems→gemmes`, `poissons→poisson`, `souffre→soufre`. Terrains : prairie ×4 (bétail, bœufs, blé, encens), plaine ×3 (marbre, soie, vin), colline ×3 (charbon, fer, aluminium), montagne ×3 (gemmes, or, uranium), forêt ×3 (caoutchouc, chêne, gibier), désert ×3 (épices, pétrole, soufre), eau ×3 (baleine, poisson, teinture).

**Orphelin unique : blé/plaine** — l'art (`ble_prairie.svg`) ne couvre que la prairie, mais la ressource spawn sur prairie ET plaine (resources.json). Application de D4 : la tuile-ressource remplace la tuile sur les DEUX terrains (l'art inclut son propre sol). À l'œil sur la fiche A/B, l'écart prairie/plaine paraît acceptable (sol similaire, vert → vert) — verdict Erik.

## Cuisson (L2)

- 22 profils `tuile-ressource-<id>` ajoutés à `assets-src/tools/import_svg.profiles.json` (mode `tuile`, 224×256, sources `new_ressources/*.svg` — fichiers d'Erik NON commités, comme la convention new_units/new_tiles).
- Toutes les gates vertes à ×1,0 (zéro zoom adaptatif nécessaire : les SVG héritent des proportions des tuiles TUILES-SVG, ratio mesuré 0,864–0,893, hexagones déjà clippés, fond transparent 41–45 %). Poids max 133 Ko (caoutchouc) < borne 300 Ko. `--check` rejoué : OK.
- `sync-art` fait : 22 `tile_ressource_<id>.png` dans `apps/web/public/art/`.

## Vérification (L3)

- **Suite : 897 (rules) + 390 (web, dont +8 tuiles-ressources) + 116 (server) verts, typecheck 0 erreur.** Parties existantes : zéro changement d'état/protocole — rejouables (le champ `resource` diffusé est inchangé ; seule la texture choisie par le client diffère).
- Tests nouveaux : `apps/web/tests/tuiles-ressources.test.ts` (table = 22 ids valides de resources.json, jamais « inconnue », art `tile_ressource_<id>`, cohérence terrains ; `nomTuilePour` : révélée→tuile pleine, inconnue→tuile terrain, blé/plaine couvert, null→tuile terrain).
- Labo `#/labo-rendu` étendu : rangées 8-10 = les 22 ressources RÉVÉLÉES sur leur terrain (tuile pleine), rangées miroir 12-14 = NON révélées (jeton « ? » sur tuile nue) — les DEUX états côte à côte ; eau incluse (carte passée à 8×15).

## Captures (`dev-logs/captures-tuiles-ressources/`, driver `driver-captures-tuiles-ressources.mjs`)

- `fiche-revelees-tuile-pleine.png` — les 22 tuiles-ressources en jeu, intégration de sol avec les tuiles voisines.
- `fiche-non-revelees-jeton-inconnue.png` — même cases avant révélation : tuile + jeton « inconnue » (affichage actuel exact).
- `zoom-eau-revelees-vs-inconnues.png` — baleine/poisson/teinture (D5) + uranium/or/gemmes en gros plan.
- `carte-complete-deux-etats.png` — carte complète dézoomée : unités, camp barbare, les deux états.
- `fiche-ab-avant-apres.png` — A/B par ressource (avant = tuile + jeton à l'échelle du jeu | après = tuile pleine), composée hors-ligne (`fiche-ab-tuiles-ressources.mjs`).

## Ce qu'Erik valide en ligne (STOP L4)

1. **Intégration de sol** : les arts cuits s'alignent-ils avec les tuiles de terrain voisines (fenêtre haute, contour #2B2620) ?
2. **Lisibilité des glyphes de rendement** par-dessus les tuiles pleines (capture révélée ; les glyphes n'apparaissent que sur cases travaillées en partie réelle).
3. **Combo blé/plaine** (D4) : la variante prairie acceptée sur les deux terrains, ou repli jeton pour blé-plaine ?
4. **Bascule révélée/non-révélée** à la recherche de la tech (labo : rangées 8-10 vs 12-14).
5. **Aluminium** : confirmation du SVG `alluminium_colline.svg` (fourni après le handoff — intégré).

## 🔶 Ouverts

- **Vague 2 (NEW-OTHERS)** : verdict d'Erik — alignement du camp/hutte/artefacts (y=64), arts sans accent, grand_sphinx cuit mais jamais rendu (dlcOnly).
- Aluminium (voir ci-dessus — veto possible).
- blé-plaine (D4) — verdict à l'œil.
- Artefacts visuels de sol possibles : le recadrage cover (fenêtre collée haut, excédent coupé en bas) est identique aux tuiles TUILES-SVG ; rien de signalé sur les 22, mais à surveiller au dézoom.
- **Défaut préexistant HORS mission** : `assets-src/tools/import_svg.test.mjs` — `remplacementsPalette4` échoue au HEAD (attend 8 variantes j1..j7+barbare, accents.json n'en produit plus que 6 depuis ASSETS-6COULEURS). Reproduit stash appliqué (avant mes changements). À corriger dans une mission pipeline dédiée.
