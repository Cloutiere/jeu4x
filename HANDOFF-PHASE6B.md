# HANDOFF PHASE 6b — Génération procédurale des cartes

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~387 tests), les données maintenant en place : rendements (R-60), ressources data-driven (R-91..R-94), barbares/huttes (R-95..R-99), `schemaVersion` **8**.

**Base documentaire (décision d'Erik, 02/09) :** [Génération Procédurale Cartes Civilization.pdf](Génération%20Procédurale%20Cartes%20Civilization.pdf) — recherche sur le pipeline officiel de la franchise (CivFanatics, guide Civ VII). **On s'en base, mais mis à l'échelle** : nous sommes 1v1 sur une carte 40×40 — la tectonique Voronoï de Civ VII et le partitionnement régional multi-joueurs sont **hors de proportion**. Le principe directeur du document fait foi : **la couche d'équilibrage prime sur la couche géophysique** — la carte sert le gameplay et l'équité avant la géologie.

**Contrainte architecturale : le générateur vit dans `/packages/rules/src/progen/`** — pur, déterministe, testé (R-80), sans IO. Il **produit un `MapData` au format exact des cartes préfabriquées** et doit passer les mêmes validations (`parseMap`) : ainsi tout l'existant (loader, admin, migrations d'entités) se réutilise tel quel.

## Mission — livrables dans l'ordre

### L0 — Générateur géophysique (simplifié, d'après le PDF)

1. **Bruit fractal seedé** (simplex/perlin — implémentation maison déterministe, seed = graine de partie) → altitude 0..100.
2. **Masses terrestres** : seuillage niveau de la mer + **lignes de rift** simples (le PDF §rifts tectoniques : fractures qui abaissent l'altitude pour séparer les terres — version allégée : 1-2 axes de rift, pas de plaques) ; ratio terre/eau borné (cible 🔶 ~55 % de terre, pangée ou 2 continents selon un paramètre de settings).
3. **Climat par latitude** : bande équatoriale → désert (humidité basse), prairie/plaine (humidité moyenne), gradient modulé par l'altitude (montagne/colline plus froides). **Ombre pluviométrique 🔶 optionnel** (vents simples transportant l'humidité) — implémente seulement si simple ; sinon bruit d'humidité secondaire.
4. **Reliefs secondaires** : bruit de montagne/colline (masque secondaire, PDF §3) ; forêts sur terrains humides tempérés (règles §FeatureGenerator simplifiées).
5. **Pas de rivières** : notre moteur n'a pas de mécanique d'eau douce — hors périmètre (le PDF les couvre pour le jour où on les ajoutera).
6. Tests : déterminisme (même seed → même carte), tous les terrains valides, ratio terre borné, **connexité terrestre entre les deux zones de spawn** (BFS sur cases praticables).

### L1 — Équilibrage 1v1 par miroir (le cœur de l'équité)

Plutôt que le partitionnement régional multi-joueurs du PDF (Civ à 2-12 joueurs), la garantie d'équité la plus forte en 1v1 : **générer une demi-carte (20×40) puis la refléter** (miroir géométrique selon l'axe central). Tout ce qui existe côté joueur 1 existe à l'identique côté joueur 2 : terrain, ressources, villages, huttes.
1. Génération de la demi-carte par L0.
2. **Score de fertilité** des cases candidates (adapte le pseudocode du PDF aux **nôtres** rendements §2 : anneaux 1/2/3 pondérés [1.0, 0.6, 0.3], nourriture ×2 + production ×1.5, montagne pénalisée) → meilleur site de capitale de la demi-carte, contraintes : praticable, distance au bord du miroir ≥ `T-09` et ≥ 6 du bord de carte.
3. **Normalisation** (le PDF §NormalizeStartLocation) : si la fertilité du site < seuil (moyenne des N meilleurs sites × 0.8 🔶), injecter des ressources de bonus alimentaires (blé/bétail — déjà dans `resources.json` ? sinon élargir les données, marquer 🔶) dans les anneaux 1-2 jusqu'au seuil.
4. Miroir → carte complète ; spawns symétriques automatiques (la contrainte ≥ 12 cases est satisfaite par construction).
5. **Checksum d'équité** consigné : fertilité P1 vs P2 (identiques par miroir) + fertilité absolue vs seuil — loggé dans l'admin dump.

### L2 — Contenu procédural (ressources, villages, huttes)

1. **Ressources** : placement sur la demi-carte AVANT miroir, tiré des **`spawnWeights` de `resources.json`** (7c — le champ existe) par terrain, densité cible 🔶 (~1 ressource / 12 cases de terre), sans chevauchement capitale.
2. **Villages barbares (3) et huttes (2)** : posés sur la demi-carte (villages ≥ 6 cases du spawn pour éviter le siège précoce — leçon du calibrage 7d), puis reflétés.
3. Toutes les validations `parseMap` passent (le générateur appelle la validation elle-même).

### L3 — Intégration serveur & UI

1. `createGame` : nouvelle option de carte **`procedural-40`** (settings + lobby : 3e choix « Carte aléatoire (seed de partie) ») ; `GameDO.internal/init` appelle `generateMap(seed, settings)` **au lieu de** `loadBuiltinMap` — le seed existe déjà dans `meta` (créé par le LobbyDO), donc la carte est **déterministe et rejouable par partie**.
2. Les cartes préfabriquées restent disponibles (3 choix au total) ; la sélection par défaut des parties de test devient l'aléatoire (à confirmer à Erik si besoin).
3. Admin dump : parameters de génération (seed, ratio terre, scores de fertilité).

### L4 — Vérification & livraison

1. **Tests de propriété** (fast-check sur 50+ seeds) : carte valide (`parseMap` OK), spawns symétriques, connexion terrestre entre spawns, équité (delta fertilité = 0 par miroir ; absolue ≥ seuil), ressources/villages/huttes posés et uniques.
2. **e2e** : créer une partie aléatoire → les deux joueurs démarrent (guerrier adjacent, pas de colon — R-60/7c), barbares/huttes/ressources présents et symétriques.
3. **GUI locale vs bot** : jouer 10-15 tours sur une carte aléatoire (exploration, croissance, éventuel contact barbare) ; captures des 2-3 cartes générées différentes dans `docs/`.
4. README + rapport ; déploiement prod via CI ; vérification en ligne (créer une partie « Carte aléatoire » avec le login OAuth — lister pour Erik ce qui reste à vérifier par lui).

## Critères d'acceptation

1. Générateur **pur et déterministe** dans `/packages/rules/src/progen/`, testé (R-80), zéro IO.
2. 50+ seeds : zéro carte invalide, équité parfaite (miroir), connexité garantie.
3. Le format de sortie est le `MapData` existant — **aucun changement du loader ni des validations** (réutilisation intégrale).
4. Une partie « Carte aléatoire » se crée et se joue de bout en bout en ligne.
5. Suites vertes (~387+), typecheck propre, déployé en prod.

## Périmètre interdit (cette session)

Rivières/mécanique d'eau douce (nouvelle mécanique — future phase, le PDF servira), tectonique Voronoï Civ VII (hors proportion), naval, merveilles, culture (décision D2 en attente), engagements multi-participants, personnalisation visuelle (4.5 en attente). Toute interprétation : documenter + signaler.

## Fin de session

Rapport habituel (livrables, tests, ambiguïtés + interprétations, captures de cartes générées) + arrêt et remise de la main. Après 6b, les phases en attente sont : **4.5** (personnalisation visuelle — tes validations du BACKLOG sont actives) et la **suite de la Phase 7** (merveilles, naval, ressources culture — décision D2).
