# HANDOFF PHASE 7a — Technologies, première tranche

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~244 tests), et les **règles nouvelles dans `RULES.md` §8.1** (R-85 recherche, R-86 arbre relationnel, R-87 débloquage) + **§3** (table des unités enrichie : Archer, Cavalier, Légion). `schemaVersion` actuel : **4**.

Contexte : Phases 0→6 complétées, économie Civ Revolution en place (rendements, citoyens, bâtiments, commerce or/science — R-60/R-63/R-66), jeu en production avec CI/CD actif. Le PDF [CivRevTechTree_Official.pdf](CivRevTechTree_Official.pdf) est la référence de l'arbre complet — cette phase n'implémente que la **première colonne + les techs verrouillant les bâtiments économiques** (9 techs, table R-86).

**Décision d'Erik (31/08) : les données de technologies forment une base relationnelle — mais embarquée, pas D1** : fichiers normalisés + couche de requête + tests d'intégrité. La calibration se fait en éditant les données + `git push` (le CI déploie). D1 ne se justifiera que si les données deviennent dynamiques (édition en jeu) — hors périmètre.

## Mission — livrables dans l'ordre

### L0 — Données relationnelles + intégrité (test-first)

1. **`techs.json`** : les 9 technologies de la table R-86 — `{id, name, cost, prereqs[], unlocks{units[], buildings[], wonders[]}}`. Merveilles en données (oracle, colosse, jardins — `implemented: false`, non constructibles).
2. **Références croisées** : `units.json` — ajouter `archer` (1/2/1, 15), `cavalier` (2/1/2, 20), `legion` (2/1/1, 10) + champ `tech` sur chaque unité/bâtiment ; `espion`/`galere` en données (champ `aquatic`/`implemented:false`, non constructibles en v1) ; `buildings.json` — champ `tech` (Bibliothèque ← alphabet, Caserne ← bronze, Atelier ← fer, Comptoir ← lois, Tribunal ← lettres, Port ← navigation ; Grenier ← poterie — **changement : il n'était pas verrouillé jusqu'ici**) ; Mine de fer ← travail du fer.
3. **Tests d'intégrité référentielle** (cœur de la « base relationnelle ») : toute `tech` référencée existe ; tout `prereq` existe et n'forme pas de cycle ; index inverse tech→items cohérent ; **au départ, seuls Guerrier/Colon sont constructibles** (test qui gèle la règle d'Erik) ; coût > 0.
4. Couche de requête dans `packages/rules` : `availableTechs(player)`, `isUnlocked(item, player)`, `researchable(player)` — pures, testées.

### L1 — Moteur (test-first)

1. **État joueur** : `researching: techId | null`, `scienceProgress: Record<techId, number>`, `techsUnlocked: techId[]` — **migration `schemaVersion` 4→5** (défauts vides, idempotente).
2. **Accumulation (R-85)** : en Phase C, la science des villes alimente la tech courante ; à coût atteint → `techsUnlocked` + événement `TechResearched` + débordement reporté ; sans choix → la science s'accumule en réserve (`scienceStored`) et se verse au premier choix.
3. **Action `SetResearch(techId)`** : immédiate (pas un ordre de tour — traitée à la réception, validée : existe, non débloquée, prérequis OK) ; changement autorisé à tout moment, progression conservée **par tech**.
4. **Débloquage (R-87)** : `processAction` **refuse** `SetProduction` sur un item verrouillé (client ET serveur filtrent).
5. Les bâtiments déjà en file **au moment du déblocage d'une tech** ne changent pas ; les villes en construction d'un item restent valides.

### L2 — Serveur

Contrats (`SetResearch`, `TechResearched` événement, `researching`/`scienceProgress`/`techsUnlocked` dans le snapshot filtré) ; validation GameDO de l'action immédiate ; **diffusion immédiate aux deux clients** (pas d'attente de résolution — c'est une action de phase « orders » visible en temps réel) ; admin dump à jour ; bot : choisit une tech aléatoire disponible dès qu'il en a les moyens.

### L3 — UI

1. **Menu de choix technologique** : accessible depuis la barre supérieure (icône science + progression de la tech courante) — liste des techs disponibles (prérequis satisfaits) avec coût, progression (barre), débloquages listés (unités/bâtiments/merveilles) ; tech verrouillée = grise avec ses prérequis ; sélection = `SetResearch` ; changement libre.
2. **Production filtrée** : items verrouillés grisés avec « Requiert : <tech> » ; items débloqués apparaissent à la complétion.
3. **Toast + entrée de journal** à `TechResearched` ; science réserve visible si aucun choix fait (« Choisissez une recherche — science en attente : N »).

### L4 — Assets (générateur)

`tools/generate.py` : sprites base+accent pour **Archer, Cavalier, Légion** (gabarits unités 256×320, silhouettes distinctes : arc, cheval, glaive/légion romaine) ; emblèmes **Bibliothèque** et **Caserne** (gabarits bâtiments). Régénérer, `pnpm sync-art`, LICENSES/palette à jour. (Merveilles et Espion/Galère : plus tard.)

### L5 — Vérification & livraison

1. **Scénario e2e moteur** : science accumulée en réserve → choix Alphabet → complétion → Bibliothèque constructible → Travail du bronze (après Alphabet? non — racine) → Archer produit et jouable.
2. **GUI locale vs bot** : menu de recherche, progression qui monte à chaque tour (cumuls de ville), déblocage → item apparaît dans le menu de production, unité produite ; changement de recherche conserve la progression.
3. Déploiement prod (push → CI) + vérification en ligne (le login OAuth réel permet à Erik de tester — signaler dans le rapport ce qui doit être testé par lui).
4. README + rapport habituel (livrables, tests, ambiguïtés + interprétations, captures).

## Critères d'acceptation

1. Tests d'intégrité référentielle de la base (L0.3) — la « base relationnelle » est vérifiée par la CI à chaque push.
2. Chaque règle (R-85/R-86/R-87) couverte par tests citant son identifiant ; migration v4→5 testée ; suites vertes (~244+).
3. Le scénario e2e §L5 passe, en tests et à la souris.
4. Débloquage effectif côté serveur (SetProduction sur verrouillé → refus).
5. Déployé en prod via CI/CD, vérifié.

## Périmètre interdit (cette session)

Pas de merveilles constructibles ni leurs effets ; pas d'Espion/Galère jouables (données seules) ; pas de naval ; pas de ressources de terrain (concept d'Erik, Phase 7 — les données s'y préparent naturellement) ; pas de gouvernement/monarchie (données PDF plus tard) ; pas de procédurale (6b) ni personnalisation (4.5). Toute interprétation : documenter + signaler.

## Fin de session

Rapport habituel + arrêt et remise de la main. La suite logique : **le reste de la Phase 7** (le vrai contenu Civ Revolution — merveilles, naval, ressources de terrain, suite de l'arbre avec tes calibrages), en tranches selon tes priorités.
