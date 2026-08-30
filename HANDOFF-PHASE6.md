# HANDOFF PHASE 6 — Économie des terrains & bâtiments

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts, et **lire attentivement les règles révisées dans `RULES.md`** : **§2** (table des terrains révisée — nouveaux rendements, désert et mer productifs, forêt +50 %), **R-60** (cases travaillées / citoyens, rayon 6 → 18 avec Tribunal), **R-63** (croissance 10 × pop — la calibration T-15=25 est **annulée**, retour à 10), **R-66** (bâtiments d'amélioration), **§4** (nouvel ordre `SetWorkedTile`), **§11** (T-08b=1, T-15=10).

Contexte : Phases 0→5.5 complétées, jeu en production ([workers.dev](https://game-4x-server-prod.erik-ai-studio.workers.dev)), CI/CD actif (**tout push `main` = tests + déploiement auto** — prévois des commits cohérents, la prod suit). `packages/rules` est de nouveau modifiable. `schemaVersion` actuel : **3**.

**Cette phase transforme l'économie minimale en véritable modèle Civ Revolution** : rendements réels par terrain, citoyens qui travaillent des cases, bâtiments d'amélioration, commerce réparti or/science. C'est le plus gros chantier moteur depuis la Phase 0 — test-first, par petits commits verticaux.

## Mission — livrables dans l'ordre

### L0 — Données (source unique)

- `terrain.json` : rendements §2 ; **renommer le champ `gold` en `commerce`** (données, pas état : pas de migration) ; ajouter **`desert`** (0/0/1) ; **`eau` garde son id** (les cartes existantes y réfèrent) mais prend les rendements de la **mer** (0/0/2) et s'affiche « Mer » ; **`foret` defenseBonus 0.5** ; nouvelles entrées de rendement pour montagne (0/1/0) ; `case de ville` inchangée (2/1/1).
- Nouveau `buildings.json` (data-driven) : id, nom, effet (terrain ciblé + bonus), coût (R-66 : 20/30/40/30/30/40 🔶). Le Tribunal a un effet spécial (`workRadius: 2`).
- Cartes préfabriquées : ajouter des cases `desert` (légende + quelques tuiles) sur les 2 cartes 40×40 pour rendre le Comptoir testable — **re-valider les cartes** (spawns, distances) après édition.

### L1 — Moteur (test-first, plusieurs commits)

1. **Rendements** : calcul `tileYield(tile, city)` = base §2 + bonus des bâtiments de la ville par terrain travaillé (R-66). Commerce ≠ or : le commerce alimente la répartition or/science (R-61, `scienceRatio` déjà en place) ; production et nourriture directes.
2. **Cases travaillées (R-60)** : villes avec `workedTiles` (≤ pop) ; centre-ville automatique et gratuit ; rayon `T-08b`=1, **2 avec Tribunal** ; montagne/mer travaillables ; auto-assignation déterministe (nourriture > production > commerce, tie-break `(q,r)`) à la fondation, à la croissance et quand une case devient indisponible ; nouvelle **migration `schemaVersion` 3→4** (workedTiles par défaut = auto-assignation du state chargé, `buildings: []`).
3. **Ordre `SetWorkedTile(cityId, tile|null)`** : validations (rayon, libre, existante, travaillable) ; `OrderAck` ; re-assignation par échange au sein de la même ville.
4. **Croissance (R-63)** : seuil `10 × pop`, remise à zéro, +1 pop = +1 citoyen auto-assigné ; `+T-16` production par pop conservé.
5. **Bâtiments (R-66)** : items de production étendus (`{kind:'unit'|'building'}`) ; une fois construit → `city.buildings` (permanent, non duplicable) ; **perdu si la ville est capturée** ; Tribunal → rayon (l'auto-assignation peut alors remplir jusqu'à 18 cases).
6. **Propriétés** : cumuls de ville toujours ≥ 0 ; une case travaillée l'est par exactement une ville ; croissance reproductible (RNG seedé inchangé).

### L2 — Serveur

Contrats (`SetWorkedTile`, items de production étendus) ; validation côté `GameDO` ; admin dump incluant `workedTiles`/`buildings` ; bot : `SetWorkedTile` aléatoire valide de temps en temps (optionnel).

### L3 — UI (le cœur du livrable visible)

1. **Cases travaillées en surbrillance** : anneau/cadre de la couleur du propriétaire sur chaque case travaillée par la ville sélectionnée (+ au survol de toute ville).
2. **Overlay rendements masquable** : petit indicateur N/P/C sur chaque case explorée — **bouton de bascule** (afficher/masquer) dans la barre supérieure.
3. **Menu de ville enrichi** : cumuls **Nourriture / Production / Commerce** (+ or/science après répartition) ; jauge de croissance (nourriture accumulée / seuil `10 × pop`) ; liste des citoyens avec leur case (clic sur une case de la carte = réassignation quand la ville est sélectionnée, cf. R-60) ; liste des bâtiments possédés ; menu de production **unités + bâtiments** (nom, coût, effet).
4. Icônes : commerce (nouvelle), nourriture, production, or existantes.

### L4 — Assets via le générateur (pipeline existante)

Étendre **`assets-src/tools/generate.py`** : `tile_desert.png`, emblèmes des 6 bâtiments (pour menu de ville + file), `icone_commerce.png` — même style flat, mêmes gabarits que les P0. Régénérer (`python tools/generate.py`), `pnpm sync-art`, mettre `LICENSES.md`/`palette.txt` à jour. Les bâtiments étant des emblèmes de ville (pas posés sur les cases), pas de nouveaux sprites de tuile bâtiment.

### L5 — Vérification & livraison

1. **Scénario e2e** (tests + vérification GUI locale vs bot) : fonder une ville → pop 2 par les vrais rendements (jauge visible) → assigner le citoyen à une plaine → construire le **Grenier** → vérifier +1 N sur cette case dans les cumuls → réassigner le citoyen → construire le **Tribunal** → rayon 2 (cases travaillables étendues, surbrillance).
2. Déploiement prod (push main → CI) + vérification en ligne (création de partie, un tour avec production de bâtiment).
3. README web/server à jour ; rapport habituel (livrables, tests, ambiguïtés + interprétations, captures).

## Critères d'acceptation

1. Chaque règle nouvelle (R-60 révisé, R-63, R-66) couverte par des tests citant son identifiant ; suites globalement vertes ; `schemaVersion` 4 avec migration testée.
2. Le scénario e2e §L5 passe, en tests **et** à la souris.
3. Cumuls de ville exacts : centre gratuit + Σ cases travaillées + bonus bâtiments ; commerce réparti or/science par le curseur.
4. Assets nouveaux générés et visibles en jeu ; overlay masquable.
5. Déployé en prod via le CI/CD, vérifié en ligne.

## Périmètre interdit (cette session)

Pas de génération procédurale (6b), pas de personnalisation visuelle (4.5), pas d'arbre technologique ni d'unités nouvelles (Phase 7 — les bâtiments ne nécessitent **aucune tech** en v1), pas d'engagements multi-participants, pas de spécialistes citoyens (Civ Rev : hors périmètre sauf demande d'Erik). Tout changement de règle non prévu : documenter comme interprétation et signaler au rapport.

## Fin de session

Rapport habituel + arrêt et remise de la main. Prochaines phases : 6b (génération procédurale — maintenant possible avec les rendements réels) puis 4.5 (personnalisation visuelle).
