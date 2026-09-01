# HANDOFF PHASE 7c — Terrains & ressources exhaustives (recherche déléguée + données éditables)

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~297 tests), `RULES.md` §2/§8.1 (terrains, techs R-85/R-86/R-87), `assets-src/tools/generate.py` (pipeline d'art), [CivRevTechTree_Official.pdf](CivRevTechTree_Official.pdf) (référence officielle), `schemaVersion` actuel : **6**.

**Mission d'Erik (01/09)** : finaliser terrains et ressources. **La recherche documentaire est DÉLÉGUÉE À TOI** (wikis Civilization, le PDF officiel, le jeu de référence) — Erik ne fait pas la recherche à ta place. Contrainte structurelle : **rien de codé en dur** — terrain comme ressource doivent rester **éditables en données** (ex. le diamant apparaît aujourd'hui sur montagne et demain sur colline : l'édition d'un tableau suffit ; la visibilité d'une ressource peut dépendre d'une tech ; la tech qui la débloque et son bonus peuvent changer). Enfin, **le concept de « culture »** (certaines ressources de Civ Revolution génèrent des unités de culture — concept inexistant chez nous) doit être instruit et **proposé à Erik avant toute implémentation**.

## Mission — trois temps, avec un ARRÊT pour approbation avant l'implémentation du système de ressources

### L0 — Immédiat, sans dépendance : carte de test variée + nouveau démarrage (demandes d'Erik)

1. **Carte 40×40 « variée »** (nouvelle carte préfabriquée, ex. `variee-40.json`) : tous les terrains présents en quantités significatives (prairie, plaine, forêt, colline, montagne, désert, mer/littoral — la pangée actuelle a été dessinée avant le désert et l'économie), spawns symétriques à distance réglementaire, **re-validation complète** par le loader.
2. **Démarrage modifié (décision d'Erik)** : plus de Colon au départ — **1 Guerrier placé à côté de la ville** (case adjacente praticable). Impacte : les 3+ cartes (spawns), la validation du loader (unités attendues), fixtures, tests et le bot si nécessaire. Le loader doit désormais **refuser** toute carte avec des spawns non conformes à ce schéma.
3. Sélection de cette carte comme défaut des parties de test (le lobby propose les 3). Tests verts, commit.

### L1 — Recherche exhaustive (documentaire, aucune implémentation)

Documenter dans **`RECHERCHE-RESSOURCES.md`** (à la racine) :
1. **Terrains de Civ Revolution** : liste exhaustive (y compris ceux hors prototype : rivière? oasis? glace?), rendements officiels, particularités (défense, traversée).
2. **Ressources** : liste **exhaustive** des ressources du jeu (Fruits, Game, Game animals, Chasse, Iron, Oak/Gold, Incense, Silk, Wheat, Cattle, Whale, Coal, Sulfur, Oil, Rubber, Uranium, Aluminum, Marble, Oxen, Wine, Dye, Gemmes/Diamonds…) — pour chacune : terrains d'apparition officiels, effet exact (rendements, bonus de combat,其他), **technologie qui la révèle/débloque** (ex. le fer visible après Travail du fer ?), apparition dans l'arbre officiel (Ressources du PDF).
3. **Le concept de culture** : ce qui génère de la culture dans Civ Revolution (grandes personnes ? ressources ? bâtiments ?), comment l'agent recommande de le modéliser chez nous (nouveau compteur ? unités de « culture » ? condition d'apparition ?) — **une recommandation argumentée, pas d'implémentation**.
4. Sources citées (wikis, PDF, pages précises).

### L2 — Proposition de modèle de données éditable (ARRÊT pour approbation)

Concevoir et **proposer** (sans implémenter le système de ressources) :
1. **`resources.json`** : schéma normalisé par ressource — `{id, name, terrains:[ids d'apparition], yields:{N/P/C ou bonus}, combatBonus?, revealedByTech?: id, cultureHook?}` — **tout champ éditable sans code** (le scénario diamant d'Erik : changer `terrains:["montagne"]` en `["montagne","colline"]` doit suffire) ;
2. **Placement** : ressources posées sur les cartes (préfabriquées : placements explicites ; future procédurale : poids/rareté par ressource — champ prévu dès maintenant) ;
3. **Visibilité** : une ressource `revealedByTech` est **invisible pour un joueur tant que la tech n'est pas débloquée** (le brouillard filtre déjà l'état — préciser l'interaction fog/tech) ;
4. **Intégrité** : tests (terrains existants, techs existantes, index inverse) comme pour les techs ;
5. La **décision culture** (go/no-go selon la recommandation L1.3) ;
6. Les **impacts sur le moteur** (yields calculés, filtrage, combat) chiffrés en livrables.
Présenter le tout à Erik → **ARRÊT, rendre la main**.

### Temps suivant (après approbation — session ultérieure)

Implémentation du modèle approuvé (moteur, serveur, UI — ressources visibles sur la carte, filtrage par tech, bonus au rendement/combat, génération éventuelle de culture), nouvelles sprites via le générateur, e2e, déploiement. Le handoff d'implémentation sera écrit après décision d'Erik.

## Critères d'acceptation de CETTE session (L0-L2)

1. Carte `variee-40` valide et sélectionnable ; démarrage sans Colon conformément à la décision d'Erik, sur toutes les cartes ; tests verts.
2. `RECHERCHE-RESSOURCES.md` : recherche exhaustive **avec sources**, culture instruite avec recommandation.
3. Proposition de schéma `resources.json` + plan d'implémentation, présentés clairement.
4. Aucun changement de règles ni de moteur hors L0 ; tout est commité/poussé (CI verte).

## Périmètre interdit (cette session)

Implémentation des ressources (après approbation), barbares/huttes (7d), procédurale (6b), naval, merveilles. La recherche documentaire cite ses sources ; ne rien inventer sans le marquer.

## Fin de session

Rapport + `RECHERCHE-RESSOURCES.md` + proposition, **arrêt et remise de la main** — Erik décide (modèle, culture, calibrage), puis le handoff d'implémentation suivra, et la Phase 7d (barbares/huttes) pourra être cadrée en parallèle.
