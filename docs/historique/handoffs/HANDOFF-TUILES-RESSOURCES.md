# HANDOFF-TUILES-RESSOURCES — Tuiles pleines par ressource révélée (art cuit) ; cachage conservé avant la tech

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X. Lis `HANDOFF.md` §4, `docs/historique/rapports/REPORT-IMPORT-SVG.md` (pipeline, mode tuile), `REPORT-TUILES-SVG.md` (conventions tuiles : recadrage bbox, fenêtre 224×256 collée haut, masque hexagone √3/2 + contour #2B2620, G2 trous), `packages/rules/src/data/resources.json`. **2D uniquement.** Les fichiers d'Erik (`new_ressources/`) ne se committent JAMAIS — copies en `assets-src/`.

## 1. Objectif (demande d'Erik du 26/09)

Erik a peint **21 tuiles de terrain avec la ressource cuite dans l'art** (`new_ressources/*.svg`, 2048²) — construites sur les tuiles de terrain existantes (dimensions intégrables). **Au lieu de poser un jeton d'icône par-dessus la tuile, la tuile entière est remplacée** par la variante à ressource — **une fois la ressource révélée par sa tech**. **Changement d'idée Erik du 26/09 (révision)** : le concept de ressources cachées jusqu'à leur tech est CONSERVÉ ; avant révélation, affichage actuel intact (tuile de terrain sans ressource + jeton « ressource inconnue »).

## 2. Décisions tranchées (défauts pilot + réponses Erik du 26/09 — vetoables)

- **D1 — Tuile pleine pour les 21 ressources fournies, UNE FOIS RÉVÉLÉES.** Une case dont la ressource a un art fourni ET est révélée (tech connue) affiche la **tuile-ressource complète** (plus de jeton par-dessus). Case à ressource NON révélée : affichage actuel exact — tuile de terrain sans ressource + jeton `res_inconnue` (aucun changement de ce côté). Mapping fichiers→ressources (croisé avec `resources.json`, vérifié pilot) : correspondances directes ×17 + **renames triviaux** : `boeuf_prairie`→`boeufs`, `gems_montagne`→`gemmes`, `poissons_rivage`→`poisson`, `souffre_desert`→`soufre`. Terrains couverts : prairie ×4 (bétail, blé, encens + boeufs), forêt ×3 (caoutchouc, chêne, gibier), colline ×3 (charbon, fer + aluminium manquant), montagne ×3 (gemmes, or, uranium), désert ×3 (épices, pétrole, soufre), plaine ×3 (marbre, soie, vin), eau/rivage ×3 (baleine, poisson, teinture).
- **D2 — Le cachage est CONSERVÉ (révision d'Erik du 26/09) : `resources.json` N'EST PAS MODIFIÉ** (`hiddenUntilRevealed`, `revealedByTech`, rendements : tout reste tel quel). Aucun changement moteur. Le rendu ajoute UNE règle : ressource révélée + art fourni → tuile-ressource ; tous les autres cas (non révélée, sans art) → comportement actuel (tuile de base + jeton). Le pilot réalignera RULES.md après acceptation si le canon d'affichage doit être précisé — l'agent consigne, n'édite pas RULES.
- **D3 — Aluminium : SANS art fourni (21/22) → affichage actuel conservé à tous les stades** (tuile + jeton, révélée ou non), en attendant le SVG d'Erik. Aucune cuisson aluminium dans cette mission.
- **D4 — Combos sans art → ancien affichage.** Si une ressource peut spawner sur un terrain pour lequel il n'y a pas d'art (ex. **blé : terrains prairie ET plaine**, art prairie seul), la variante fournie remplace la tuile pour TOUS ses terrains (l'art inclut son propre sol) — MAIS si l'écart visuel paraît problématable à l'œil, repli ancien affichage pour le combo orphelin et liste au rapport. L'agent consigne la liste exacte des combos couverts/orphelins.
- **D5 — Eau : les 3 tuiles-ressources (baleine, poisson, teinture) remplacent la tuile d'eau de leur case.** Fog et visibilité inchangés (l'art n'est visible que sur case visible — règles de filtrage existantes).
- **D6 — Zéro changement gameplay** : rendements, `spawnWeight`, placement, worked tiles, visibilité/révélation : tous inchangés — seul le RENDU des ressources RÉVÉLÉES change. Zéro migration d'état, parties existantes testées.
- **D7 — A/B et arrêt Erik** : fiches avant/après par ressource + carte complète ; arrêt pour approbation avant commit (visuel subjectif, règle d'Erik).

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, note l'état. Inventorie le rendu actuel des ressources (jeton/tuile : où la superposition est branchée dans GameCanvas, où `hiddenUntilRevealed`/révélation est consommée moteur + client, où « cartes neutres avant tech » est branché) — liste fichier:ligne dans le rapport.
- Vérifie que les SVG sources ont bien les mêmes proportions de sol que les tuiles livrées en TUILES-SVG (elles en dérivent) — le recadrage bbox + fenêtre haute doit reproduire l'alignement existant.

### L1 — Données
- Table de mapping ressource→tuile-ressource (data-driven, ex. `tuilesRessources` : 21 entrées + renames), consommée par le rendu ; aluminium et combos orphelins explicitement hors table (affichage actuel).
- Tests : mapping complet (21 entrées, ids valides, terrains cohérents avec `resources.json`) ; RÉVÉLATION : non révélée → tuile de base + `res_inconnue` (comportement actuel, tests existants intacts), révélée + art → tuile-ressource, révélée sans art (aluminium) → jeton.

### L2 — Cuisson (mode tuile du pipeline)
- Profils pour les 21 SVG → `tile_ressource_<id>` 224×256 (recadrage bbox, fenêtre collée haut, masque hexagone + contour — identiques aux tuiles de terrain), gates G2/G3/G4. Fiches A/B « avant » (tuile + jeton).
- Rendu : sélection de texture — ressource révélée avec art → tuile-ressource ; tous les autres cas → comportement actuel (tuile de base + jeton, y compris `res_inconnue` qui RESTE en flux actif). Glyphes de rendement, barres de PV, sélection : posés AU-DESSUS comme aujourd'hui.
- Moteur : AUCUN changement (D2/D6) — la révélation par tech fonctionne exactement comme aujourd'hui.

### L3 — Vérification
- Suite complète + typecheck verts ; parties existantes rejouables (D6).
- Labo `#/labo-rendu` + carte de test : chaque ressource posée sur son terrain, baleine/poisson/teinture sur l'eau, rendements au-dessus ; **les DEUX états** : non révélée (tuile + jeton inconnue) et révélée (tuile-ressource), aluminium en affichage actuel.
- **Captures `dev-logs/captures-tuiles-ressources/`** : fiche 21 ressources révélées, carte complète riche en ressources AUSSI en état non révélé (jetons inconnues sur tuiles nues), zoom, A/B avant/après.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Fiches + carte complète avant commit. Points de verdict : intégration sol (les arts cuits s'alignent avec les tuiles de terrain voisines), lisibilité des glyphes par-dessus, combos blé/orphelins, bascule révélée/non-révélée à la recherche de la tech.

### L5 — Rapport
- `REPORT-TUILES-RESSOURCES.md` : inventaire combos couverts/orphelins (D4), branchement rendu (révélée/non-révélée), confirmation zéro moteur, captures, ce qu'Erik valide en ligne, 🔶 (aluminium, blé-plaine, artefacts visuels de sol).

## 4. Critères d'acceptation

1. Une case à ressource couverte affiche la **tuile-ressource pleine** d'Erik (style intact), plus de jeton ; glyphes de rendement lisibles par-dessus.
2. **Avant révélation : affichage actuel exact** (tuile de terrain + jeton « inconnue ») ; à la révélation (tech) : bascule vers la tuile-ressource d'Erik. Le cachage jusqu'à la tech est préservé à l'identique.
3. Aluminium (et combos orphelins éventuels) en affichage actuel à tous les stades, listés.
4. Parties existantes rejouables sans erreur ; suite verte ; zéro changement de protocole ; fichiers d'Erik non commités.

## 5. Périmètre interdit
- Nouveaux arts (aluminium, variantes de terrain manquantes) — liste au rapport, Erik fournira ;
- `new_units/`, `new_icones/`, `new_barbares/` (vague 1 livrée) et tout autre asset ; 3D ;
- Rendements, spawn, placement, worked tiles, victoires — toute règle hors visibilité (D6) ;
- RULES.md (le pilot le réaligne après acceptation).
