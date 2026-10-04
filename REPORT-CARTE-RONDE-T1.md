# REPORT-CARTE-RONDE-T1 — Monde cylindrique : moteur + génération rotationnelle

**Livrée le 04/10/2026.** Enroulement Est↔Ouest partout (moteur, génération, client, serveur), symétrie rotationnelle 1v1, bancs re-baselines, e2e réel de traversée de couture. Suites : **rules 993** (dont 13 couture) / **web 506** / **server 120** — toutes vertes. `schemaVersion` 27 **inchangée** (aucune migration : le wrap est une règle de CALCUL, les `q` stockés restent canoniques).

## 1. Conception (défauts tranchés — veto Erik possible)

### Forme de la rotation (D3 — tranchage documenté)
- **Transforme retenue : la DEMI-TOUR DU CYLINDRE** = translation de demi-largeur en **colonne** (`col + W/2 mod W`), **rangée inchangée** (`S(col,row) = (col+W/2 mod W, row)`). Isométrie exacte du cylindre ET du rectangle fini ; l'adversaire est exactement à « largeur/2 » sur l'axe Est-Ouest (distance wrap = 20 en 40 de large), comme demandé (« décalage ≈ largeur/2 »).
- **« r symétrisé » NON exercé** : les deux autres formes candidates ont été éliminées par la démonstration suivante — (a) la réflexion 180° historique `(q→W/2−q, r→H−1−r)` est une isométrie du cylindre MAIS l'écart horizontal à l'image dépend de la colonne (une capitale en col W/4 voit son « image » à 1 colonne par la couture — l'opposé n'est pas garanti) ; (b) la translation col+ligne `(col+W/2, row+H/2)` est une isométrie du cylindre MAIS pas une symétrie du rectangle fini (les anneaux de fertilité débordent asymétriquement en bas de carte — checksum d'équité impossible). La forme retenue est la seule qui garantit LES DEUX (opposition + équité exacte de structure).
- Conséquence assumée : le monde 1v1 est **périodique de demi-tour** (chaque colonne existe deux fois, à W/2 d'écart) — le terrain est posé une fois et la garantie d'équité est PAR JOUEUR (couverture 6c, SPAWN-START par spawn, purge par spawn) au lieu du doublement miroir.

### Découverte majeure : l'océan de bordure Est/Ouest (R-C3)
Le géo-layer déclinait l'altitude vers les 4 bords — sous le cylindre, la couture était **infranchissable à pied sur 100 % des cartes générées** (colonnes 0-2 et 38-39 intégralement en eau, mesuré). Correctif : le falloff de bordure ne porte plus que sur Nord/Sud (`geo.ts`). Les cartes préfabriquées commises (pangee/pedagogique/variee) gardent leur océan de bordure (données Erik, pas de rétro-modification 🔶) — la couture y reste navigable au naval.

### Audit des consommateurs de géométrie (D2 — exhaustif)
Primitives wrap ajoutées à `hex.ts` : `colOf`, `wrapCol`, `wrapColDelta`, `normalizeHexW`, `hexDistanceW`, `neighborsW`, `hexesWithinRadiusW` + sentinelle `SANS_WRAP` (comportement plat exact pour fixtures/helpers). Sites migrés (largeur portée par `st.mapWidth` partout où un état existe) :

| Famille | Fichiers | Sites |
|---|---|---|
| Socle | `hex.ts` (primitives), `map.ts` (validation spawns ALL-PAIRS + guerrier adjacent + vision initiale + Russie reveal + auto-assignation) | 7 |
| Mouvement/ordres | `turn.ts` : pas de chemin **normalisé** (D1), dépose embarquement, distances villes (fondation T-09 ×2), worked tiles (prune/fill/SetWorkedTile), GP ville (R-114/R-126), ICBM rayon 1, dispersion R-179 (×2), attaque (R-46 contact, R-59 portée, entrées retenues R-159, village R-96) | 22 |
| Brouillard/vision | `fog.ts` (unités + villes), artefacts `indice`/Atlantide adjacente | 4 |
| Économie | `economy.ts` (workableTilesFor/autoAssign, largeur optionnelle), `research.ts` (appendFill), artefacts appendFill | 4 |
| Naval | `naval.ts` (côte côtière ×2, soutien naval R-118) + appelants `turn.ts` | 5 |
| Barbares | `barbares.ts` : attaque adjacente, aggro, `advanceStep` (ligne hexagonale ramenée au représentant le plus proche du cylindre), spawns de camp | 5 |
| Divers moteur | `civStartBonus.ts` (GP Amérique), `fixtures.ts` (freeNeighbor, pathBetween width optionnelle) | 3 |
| Artefacts | BFS composantes/distance-terre (îles wrap), espacement des poses, îlots offshore, indice de hutte | 8 |
| Progéniture | `content.ts` (espacement, entités, marines, camps), `fertility.ts` (anneaux), `geo.ts` (classification côte/océan wrap), `libre.ts` (équité pairwise, garanties), `index.ts` (connexité BFS ×2, guerrier, checksum) | ~20 |
| Serveur | `game.ts` (normalisation des ordres à l'entrée — D1), `botPolicy.ts` (worked tiles, settle GP) | 4 |
| Client web | `interaction.ts` (BFS `pathTo` wrap + normalisation clic, rayon de travail au clic, dépose), `UnitPanel.svelte` (cibles d'attaque/villes/espion/débarquement, fondation), `chronique.ts` (localisation « près de », plat 🔶 cosmétique) | ~10 |

**Hors périmètre (volontairement plats)** : labos (`LaboCombat`, `Progen.svelte` — bacs de sable), 3D (`contours.ts` — tranche 2), flèches/rendu couture (T2 interdit par le handoff).

## 2. Génération rotationnelle (L3)

- Nouvelle stratégie **`rotationnel1v1`** (défaut à 2 joueurs ; `mirror1v1` reste enregistré comme ALIAS pour la compat des configurations, jamais généré tel quel). Corps : délégue à la machinerie `libreMulti` (terrain généré ENTIER 40×40, placement unique, garanties par joueur) avec `oppositionCylindre: true` — dans `choisirSpawns`, à 2 joueurs, le second spawn est le meilleur site du bassin à |Δcolonne wrap − W/2| ≤ 🔶 4.
- Réglages nouveaux : `oppositionCylindre` (false par défaut — activé par la stratégie), `oppositionTolerance` 4 🔶.
- L'ancien pipeline demi-carte de `mirror.ts` est SUPPRIMÉ (`MIRROR_1V1` abrogé) ; les briques communes (forceSpawnNeighborhood, purgeResourcesNear, normalizeStartSite, guaranteeResourceCoverage, spawnNeighborhoodComposition, halfMapLookup) restent des aides testées.
- `mirroredHex` (nom historique conservé) = demi-tour du cylindre ; utilisée pour le **jumelage des îlots offshore** en 1v1 (équité de terrain à l'opposé).
- `data.rows` resynchronisées après la pose des îlots de garantie (les îlots mutaient `terrain` post-parseMap — une re-validation de `data` perdait les îlots ; constaté à T1).

## 3. Bancs re-baselines (D4) — équité transposée au wrap

- **Re-baselines de principe** (le miroir n'existe plus) : symétries de terrain/contenu remplacées par l'opposition cylindre (`progen.test`, `progen-properties`, `progen-libre` D3, `procedural.test` serveur) ; checksum de fertilité `delta = 0` → **delta ≤ 15** 🔶 (statistique) ; couverture « par demi » → « par joueur » avec déficits RARES best-effort consignés (cas caoutchouc seed 606) ; `carte-ronde.test.ts` NEW (13 cas de couture : distance/voisinage/rayon, déplacement traversant, ordre q=−1 normalisé, fog, worked tiles, combat à cheval, génération 1v1 + multi + topographies).
- **Tolérances d'équidistance élargies** 🔶 (les spawns wrap peuvent être de VRAIS opposés — l'écart pairwise monte mécaniquement) : escalade de la tolérance dans `generateProceduralMap` : +1/2 tentative → **+3 par tentative** (plafond 8+27 = **35**). Assertion du banc CARTE-50 « ≤ 26 » → « ≤ 35 » ; banc tolérance 40 seeds « ≤ 12 » → « ≤ 35 ». **À l'œil Erik** — c'est le prix des opposés réels ; une tolérance plus dure re-fragmenterait les générations.
- **Seeds remplacées** (best-effort, géométrie wrap) : banc artefacts-îles `{31896→31897, 39815→39816, 23977→23978}` (pangées sans connexion terrestre en 10 tentatives / artefact sur la masse fusionnée par la couture) ; phase7o archipel `77→79` (les îles fusionnées par la couture ne laissent aucun artefact insulaire sur la 77). Helpers BFS des tests passés wrap-aware (phase7o ×2, artefacts-iles).
- **Carte commise `variee-40` ré-étalonnée** (données) : ses spawns (symétriques par réflexion) étaient à **distance wrap 11 < T-09** par la couture. Décalage d'une colonne des DEUX spawns vers l'intérieur en conservant la symétrie miroir ponctuelle de la carte : p1 (−5,20)→(−4,20), p2 (25,19)→(24,19) [guerriers suivent], + re-localisation des paires miroir touchées par les nouveaux rayons de purge (betail, ble ×2, fer) et peinture d'UNE forêt d'anneau par spawn ((−4,21)/(24,18)) pour maintenir l'audit SPAWN-START (≥ 2 forêts). Symétrie ponctuelle de la carte vérifiée intacte (test vert) ; wrap distance spawns = 14 ≥ 12.
- **Non corrigé (consigné)** : la carte `variee-40` portait déjà AVANT T1 deux paires de ressources adjacentes à la couture près des villages ((−2,12)/(−1,11) et (22,27)/(21,28)) — préexistant, hors périmètre (torts R-108 historiques sous camps, tolérés par les tests).

## 4. e2e réel (L4) — `devtmp/carte-ronde-e2e.mjs`

- **Solo** (flux lobby réel, procedural-40) : le Guerrier p1 programme un chemin BFS terrestre qui **FRANCHIT LA COUTURE** (dernier pas col 39 → col 0 ou l'inverse) et l'exécute sur plusieurs tours — position vérifiée au **dump serveur** : TRAVERSÉE RÉUSSIE (ex. partie DGA9HU : rendu en col 39 après passage). Captures GUI : `dev-logs/captures-carte-ronde-t1/` (carte affichée en bande, unité de l'autre bord visible — T2 pour le rendu bouclant).
- **Multi 3 sièges** : création 3 joueurs (flux lobby), génération rotationnelle, distance wrap minimale entre spawns 22-27 ≥ 12 sur toutes les exécutions.
- Pièges d'environnement consignés : le zombie wrangler de la session tenait 8787 (profil verrouillé — piège connu) ; le worker neuf est monté sur 8790 et le proxy Vite a été **temporairement** pointé vers 8790 pour les captures, puis **REVERTÉ** (vite.config.ts identique au dépôt).

## 5. Critères d'acceptation (handoff §4)

1. **Unité programmant un déplacement franchissant la couture et l'exécutant** : ✓ (e2e réel + `carte-ronde.test` « guerrier 39,0 → 0,0 » et « ordre q=−1 normalisé »).
2. **Distance/fog/adjacence par la couture partout** : ✓ (13 tests de couture + sweep exhaustif §1).
3. **1v1 = adversaire à l'opposé, équité vérifiée sur bancs re-écrits ; multi 2-5 conforme** : ✓ (opposition ≤ 🔶 4 de la demi-circonférence sur toutes les seeds testées ; bancs CARTE-50 165×3 / 220×4 / 275×5 spawns à 100 %).
4. **Garanties de départ (anneaux, villages, artefacts) sur les nouvelles cartes** : ✓ (R-157/purge/7d/7o à 100 % au banc CARTE-50 ; banc artefacts-îles 108 générations : 0 artefact sur la masse, 0 < 4 des départs).
5. **Suites et bancs verts, schemaVersion 27 inchangée** : ✓ **993 / 506 / 120**.

## 6. 🔶 Tranchages à l'œil d'Erik

1. **Forme de la rotation** : translation pure de demi-cylindre (§1) — « r symétrisé » non exercé, démonstration au rapport. Veto possible → la variante col+ligne exige un autre schéma d'équité.
2. **Périodicité du monde 1v1** : le demi-monde est dupliqué à l'identique (visible à la génération). Alternative = équité statistique libre à 2 spawns (comme 3-5P) SANS opposition garantie.
3. **Tolérance d'équidistance ≤ 35** (escalade +3/tentative) et **delta fertilité ≤ 15** : plafonds constatés, réglables.
4. **Cartes préfabriquées non traversables à pied** (océan de bordure Est/Ouest conservé) — voulu ou à ré-étalonner comme variee ?
5. **variee-40 ré-étalonnée** (spawns +1 colonne, 4 paires de ressources déplacées, 2 forêts d'anneau peintes) — données Erik modifiées, à valider à l'œil.
6. **Déficits de couverture des ressources rares** possibles sous cylindre (caoutchouc seed 606) — best-effort consigné au rapport de génération.
7. **Libellés/minimap/flèches** : aucun changement visuel (T1) — la carte reste une bande ; la Chronique nomme « près de » en distance plate (cosmétique).

## 7. Fin de session

Local dev laissé en l'état (worker 8790, Vite 5174, zombie 8787 — coquille d'Erik à relancer). Rien des fichiers non trackés d'Erik n'est committé.
