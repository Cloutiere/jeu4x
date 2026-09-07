# REPORT-FONDERIE-LOT — Habillage du lot d'assets externes Tripo (sessions 07/09/2026)

Suite de [HANDOFF-FONDERIE-LOT.md](HANDOFF-FONDERIE-LOT.md) — mode peintre, un modèle à la
fois, validation d'Erik à l'œil pour chaque modèle. **Les 18 modèles du lot sont validés par
Erik** (« tout est parfait ») ; commits atome par atome à sa demande, puis commit final du lot.

## Livrables — 18 .glb dans `fonderie/modeles/` (tous validés, non promus)

| Modèle | Tris | Rotation appliquée | Zones néon | Remarque |
|---|---|---|---|---|
| barbare_v3.glb | 3 510 | +90° Y (regarde +X) | crête/tête + bras-griffe | 1er du lot ; teinte J7 rouge réservée |
| archer_v3.glb | 5 182 | +90° Y | arc+flèche+bras d'arc, visage | v2.0 retenu (v1 hors budget 7 949, écarté) |
| legion_v3.glb | 4 536 | pivot 180° | gladius + visage | re-génération demandée par Erik (1.0 = 6 198 tris) |
| espion_v3.glb | 4 342 | pivot 180° | dague + outil d'injection + visage | accroupi, hauteur 1.95 |
| catapulte_v3.glb | 4 164 | pivot 180° | tube lanceur + face caisse | c'est un lance-missiles lourd (Erik valide le look) |
| artillerie_v3.glb | 3 895 | pivot 180° | rail-cannon + blocs caisse | très long (z ±1.3) |
| bombardier_v3.glb | 4 182 | pivot 180° | tentacules memétiques + nez | 1 279 segments, payload néon |
| char_v3.glb | 3 767 | pivot 180° | double canon + glacis | |
| canon_v3.glb | 4 331 | pivot 180° | canon rotatif d'épaule + cabine | fût lisse : seulement 103 segments (assumé) |
| infanterie_v3.glb | 4 786 | pivot 180° | bouclier + SMG + visière | |
| icbm_v3.glb | 4 376 | PCA + tangage 13,8° | ogive + tuyères | couché comme la v1, long (z -2.2..+1.0) |
| piquier_v3.glb | 4 840 | pivot 180° | lance + casque + bouclier | **échelle 3.7** (source bas 0.70) |
| chevalier_v3.glb | 4 767 | pivot 180° | lance + visière | coexiste avec knight_v3 (choix à l'intégration) |
| gallion_v3.glb | 4 596 | PCA (53° de lacet source) | éperon + château | signe de l'axe corrigé (éperon à -Z) |
| galere_v3.glb | 4 615 | lacet -90° | extrémités + tambour central | quasi symétrique proue/poupe |
| cuirasse_v3.glb | 4 397 | lacet -90° | tourelles + château | long en X dans le source |
| croiseur_v3.glb | 4 352 | lacet +90° | batteries de canons + passerelle | long en X, proue à +X (inverse du cuirasse) |
| fusiller_v3.glb | 4 692 | pivot 180° | fusil + casque | |

Conventions appliquées partout : géométrie + UV Tripo intactes, texture repeinte 1024²
(corps opaque neutre-clair `accent_joueur` facteur 6.6 cuit, liserés #3DFFCE, glyphes),
couche émissive dérivée, néon en LINES (jamais teinté), origine au sol / Y-up / face -Z,
2 matériaux, échelle 2.6 sauf mention. Tous ≤ 5 500 tris.

## Outils

- `outils/habiller-<nom>.mjs` — un outil par modèle, tous dérivés du `habiller-knight.mjs`
  de la session HABILLAGE-TRIPO (modes `--preview` / `--zones` / plein, table `S` des seuils).
- Deux mécanismes nouveaux ajoutés au répertoire :
  - **alignement PCA de l'axe** (chasseur, gallion, icbm) : les sources Tripo ne sont pas
    toujours alignées (lacet 36-53°, cabré 14-27°, roulis 8°) — l'axe est mesuré puis
    aligné sur -Z, avec remise au sol. Convention : `S.axeFuselage` = vecteur proue.
  - **tangage/roulis résiduels mesurés après alignement** (corrections automatiques loggées).

## Leçons / découvertes de la session

1. **Chaque asset Tripo a sa propre orientation** : +Z (knight, archer 2.0, legion, espion,
   catapulte, artillerie, bombardier, char, canon, infanterie, piquier, chevalier), +X
   (barbare), -X (colon, cuirasse, galere, gallion), et parfois une diagonale complète
   (chasseur, gallion, icbm). Le passage `--preview` AVANT tout est impératif ; la direction
   de la caméra « avant » du raster a été étalonnée empiriquement sur `knight_v3.glb`
   (validé face -Z) : la vue « avant » montre le côté -Z du modèle.
2. **Budget** : deux sources ont dépassé 5 500 tris (archer 1.0 : 7 949, legion 1.0 : 6 198).
   Dans les deux cas Erik a re-généré chez Tripo (archer 2.0 : 5 182 ; legion 2.0 : 4 536) —
   re-génération > décimation locale, à refaire si le cas se reproduit.
3. **Vérification numérique des zones obligatoire** (compter les triangles par boîte) : les
   rendus de zones seules en couleurs vives (`canozone-*`, `colz-*`) évitent de valider une
   zone noyée dans la teinte.
4. **Ne pas faire confiance aux vues 3/4** pour l'orientation : se référer aux cartes de
   centroides + mesures. Deux faux départs sur le colon et l'icbm (rotation opposée, puis
   cabré résiduel) — tous corrigés et vérifiés numériquement.
5. **Échelle par modèle** : le piquier (source 0.70) a requis `echelle: 3.7` pour rester à
   hauteur d'humanide ; les navires/missile débordent la tuile en longueur (comme la v1) —
   recalage fin via `visuel3d.json` à l'intégration (session séparée).
6. Mes previews ont un temps **écrasé les captures `knight-*.png`** (copie d'outil avec noms
   non renommés) — régénérées depuis `habiller-knight.mjs`. Captures de travail poubelle
   supprimées ; restent les `*-zones-*`, `*-carte-*` et un jeu de vues par modèle.

## Archive

- `modeles/archer_v3-src1.0.glb` — l'habillage du source archer 1.0 (écarté, conservé pour A/B).
- Dépôts Erik dans `image_ref/` commis avec le lot (`*_tripo.glb`, `*_tripo_2.0.glb`, références).
- `image_ref/cavalier.jpg` supprimée du disque par Erik avant le commit (remplacée par
  cavalier_2.0/2.1.jpg) — suppression incluse dans le commit.

## Périmètre respecté

- Écritures limitées à `fonderie/` (+ commits des dépôts `image_ref/`). Jeu, `apps/`,
  `packages/`, `visuel3d.json` : jamais ouverts.
- **Aucune promotion** dans `assets-src/modeles/`, **aucun mapping** `visuel3d.json` :
  intégration = session séparée (19 unités v1 + knight_v3 + 18 modèles de ce lot en attente
  de mapping et de calibrage `echelle`).

## Suite (hors de cette session)

1. Intégration au jeu : promotion des `_v3.glb` validés + mapping `visuel3d.json` +
   calibrage `echelle` par type (les hauteurs vont de 0.93 à 2.60).
2. Décisions en suspens signalées : choix knight_v3 vs chevalier_v3 ; sens du colon et de
   la galère (quasi symétriques) ; couché/vertical de l'ICBM.
