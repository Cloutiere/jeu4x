# HANDOFF-ASSETS-4K — Pipeline PNG 4K + mise à jour guerrier/colon (4K) et tuiles de terrain (4K, avec variante « brume »)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `docs/historique/rapports/REPORT-IMPORT-SVG.md` (pipeline), `REPORT-ASSETS-6COULEURS.md` (mode « variantes fournies »), `REPORT-TUILES-SVG.md` (mode tuile), `REPORT-TUILES-RESSOURCES.md` (tuiles-ressources révélées/cachées). **2D uniquement.** Zéro changement moteur/serveur/protocole. **Les fichiers d'Erik (`new_units/`, `new_tiles/`) ne se committent JAMAIS** — copies en `assets-src/`.

## 1. Objectif (demande d'Erik du 02/10)

Passer les sources de ces assets au **4K raster** (décision du fil « SVG vs 4K » : le jeu cuit des PNG à taille fixe, donc le 4K source garde toute la fidélité là où la vectorisation en perdait) :

1. **Guerrier et colon ×6 couleurs** : nouveaux dessins 4K (`new_units/new_guerrier/`, `new_units/new_colon/`) ;
2. **Tuiles de terrain ×8** (arbre=forêt, prairie, plaine, colline, montagne, désert, océan, rivage) en 4K, chacune avec une **variante « brume »** (`*_4K_fog.png` — même terrain voilé) qui servira de visuel aux **ressources présentes mais non découvertes** ;
3. **Extension du pipeline** : accepter les sources PNG/JPEG en plus des SVG (même chaîne de normalisation — `sharp` lit tout ; zéro autre changement de mécanique).

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Sources unités = les `_trsp.png` 4K** (fond transparent réel) — JAMAIS les JPEG à fond incrusté. Nommage irrégulier à cartographier explicitement : `new_units/new_colon/colon_trsp_4k_{couleur}.png` (ardoise/bleu/jaune/orange/rouge/vert) et `new_units/new_guerrier/guerrier_{couleur}4K_trsp.png` (+ `guerrier_ardoise4K_trsp.png` — casse variable). Mapping couleur→faction inchangé (bleu→Saphir, rouge→Rouge Royal, vert→Émeraude, jaune→Jaune d'Or, orange→Cuivre Ardent, ardoise→Ardoise).
- **D2 — Cuisson unités inchangée** : mode « variantes fournies », export ×2 (512×640), calibre standard. A/B « avant » mis à jour (PNG du HEAD — les sprites actuels ARE les SVG cuits de la vague SPRITES-GUERRIER-COLON).
- **D3 — Sources tuiles = `new_tiles/{terrain}_4K.png` et `{terrain}_4K_fog.png`** (PNG transparents ; ⚠ les `_4K.jpeg` sont à damier incrusté — interdits). Cuisson mode tuile identique à l'actuel (recadrage bbox, fenêtre 224×256 collée haut, masque hexagone + contour #2B2620 2,5 px). Les 8 PNG 4K remplacent les SVG comme sources des terrains ; ⚠ sources déjà contourées noir : **ne PAS doubler le contour** — si le contour baked est visible après masque, le neutraliser (le masque inset coupe le bord) et laisser le pipeline poser le sien ; consigner la décision au rapport (périmètre du contour baked vs contour pipeline, capture à l'appui).
- **D4 — Variante brume = remplacement des textures « cacher » actuelles (CORRIGÉ après remarque Erik 02/10 : le jeton res_inconnue n'est plus affiché au rendu depuis la vague « cacher » du 26/09)** : le rendu actuel des ressources cachées non révélées utilise DÉJÀ une variante brume du terrain (textures.ts §« cacher », GameCanvas ~l.572-584 — les `*_cacher.*` du 26/09), **sans jeton**. Cette vague remplace ces textures par les cuissons des nouvelles **`{terrain}_4K_fog.png`** (même rôle, meilleure source, AUCUN nouveau mécanisme ni jeton). À la révélation : tuile-ressource pleine (inchangé).
- **D5 — Portée : terrains de base + brume SEULEMENT.** Les 21 tuiles-ressources révélées (`fer_colline` etc.) restent celles de TUILES-RESSOURCES — Erik n'a pas encore retouché les ressources (vague future). Les tuiles brumeuses ne remplacent pas non plus les tuiles-ressources cachées générales.
- **D6 — Aucun changement gameplay** : visibilité/fog/rendements/règles intacts — c'est un REMPLACEMENT DE TEXTURES (terrains + brume), pas une nouvelle règle. `schemaVersion` inchangée.

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts. Vérifie l'inventaire des 16 tuiles 4K PNG (8 × 2, transparence réelle — pas de damier) et des 12 `_trsp.png` unités ; table de mapping fichiers→cibles dans le rapport (nommage irrégulier d'Erik).

### L1 — Pipeline PNG sources
- Étendre `import_svg.mjs` (ou son chargeur) : sources `.png`/`.jpeg` acceptées partout où `.svg` l'est (normalisation 2048² identique). Tests du chargeur (PNG transparent, JPEG refusé côté unités si transparence absente — G1 le détecte).

### L2 — Cuisson
- **Unités** : guerrier ×6 + colon ×6 depuis les `_trsp` 4K → `unite_guerrier@p1..p6`, `unite_colon@p1..p6` (D2), A/B avant.
- **Tuiles** : 8 terrains × 2 (normale/brume) → `tile_<terrain>` (remplacement) + **remplacement des textures « cacher »** par les cuissons des `_4K_fog` (mêmes clés/consommation que les cacher actuelles, 224×256, mêmes conventions) ; A/B avant pour les 8 remplacées.
- **Rendu brume (D4)** : sélection de texture — ressource cachée non révélée → la cuisson `_4K_fog` (à la place de la « cacher » actuelle, SANS jeton) ; révélée → tuile-ressource ; sans ressource → tuile normale. Testé (fixtures ressource cachée/révélée/absente).
- `sync-art`, suites + typecheck verts.

### L3 — Vérification visuelle AVANT tout commit
- Labo `#/labo-rendu` + partie solo : les 8 terrains en jeu (qualité 4K descendue), guerrier/colon ×6 au calibre, **cases à ressource cachée en tuile brumeuse (SANS jeton — comportement actuel)**, révélation → tuile-ressource, netteté aux extrêmes de zoom (mipmaps).
- **Captures `dev-logs/captures-assets-4k/`** : fiches terrains avant/après, paire normale/brume côte à côte, guerrier/colon ×6, calibre, zoom ×2.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Captures + verdicts (contour baked vs pipeline 🔶, calibre unités, lisibilité de la brume). NE COMMITTER QU'APRÈS FEU VERT.

### L5 — Rapport
- `REPORT-ASSETS-4K.md` : mapping sources, extension pipeline, décision contour, brume (règle d'affichage), A/B, ce qu'Erik valide en ligne, 🔶 (éventuel passage des tuiles en cuisson ×2 — décision séparée d'Erik), fichiers d'Erik non commités.

## 4. Critères d'acceptation
1. Unités et 8 terrains = les rendus 4K d'Erik (fidélité supérieure ou égale aux SVG cuits — A/B à l'appui), calibre/contours conformes.
2. Ressource cachée = tuile brumeuse 4K (SANS jeton — état actuel préservé) ; révélation = tuile-ressource ; aucun changement de règles.
3. Le pipeline accepte les sources raster (testé) ; suites vertes ; zéro changement moteur/serveur/protocole ; fichiers d'Erik non commités.

## 5. Périmètre interdit
- Les 21 tuiles-ressources (vague future d'Erik) ; toute retouche des sources ; le recoloriage ; moteur/serveur/protocole ; cuisson ×2 des tuiles (🔶 proposition au rapport seulement) ; la sableuse.
