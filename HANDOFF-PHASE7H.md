# HANDOFF PHASE 7h — Gouvernements, Personnages Illustres restants & victoire scientifique

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**510 tests** : rules 427, server 33, web 50), **la spec rédigée par Erik : [Gouvernements Civilization Revolution.md](Gouvernements%20Civilization%20Revolution.md) — elle fait foi, valeurs exactes**, `RULES.md` (R-112 Colon 2 pop, R-113..R-116 culture, R-117..R-119 naval/espion, R-109..R-111 techs). `schemaVersion` actuel : **11**.

Contexte 7g (livré) : naval complet (transport 1 terrestre, soutien naval `S_att`, naufrage), Espion + `SpyMission` vol de GP (R-119, jalon `gpStolen`, escalade inchangée), production navale côtière, UI/sprites/bot, migration v10→v11 (`aboard`/`cargo`). Session réelle : 3 vols de GP in-vivo.

**⚠️ Leçon 7f/7g : toute nouvelle forme d'ordre/item passe d'abord par le validateur du GameDO (`orderShapeError`)** — c'est là que la file des merveilles s'était perdue.

## Mission — livrables dans l'ordre

### L0 — Règles écrites (RULES.md §8.7 « Gouvernements », test-first)

- **R-121 · Gouvernements.** `governments.json` (data-driven) : les **6 régimes** avec les modificateurs **exactement** comme dans le document d'Erik :
  - **Despotisme** (défaut, tech : null) : aucun bonus ; nukes sans pénalité culturelle (hook 7i) ;
  - **République** (Code des lois) : **coût pop du Colon = 1** (amende R-112) ;
  - **Monarchie** (Monarchie) : **culture du Palais ×2** (amende R-113) ;
  - **Démocratie** (Démocratie) : **+50 % Or et Science de toutes les villes** ; pacifisme (interdiction de déclarer la guerre, acceptation obligatoire des paix, nukes interdits — **en 1v1 guerre permanente, ces hooks sont posés mais sans effet tant que la diplomatie n'existe pas** — documenter explicitement) ;
  - **Fondamentalisme** (Religion) : **+1 Attaque et +1 Défense fixes à toutes les unités terrestres** ; **science des Bibliothèques et Universités = 0** ;
  - **Communisme** (Communisme) : **+50 % Production (marteaux)** de toutes les villes ; **culture des Temples/Cathédrales = 0**.
- **R-122 · Transitions et Anarchie.** Changement **manuel** = action immédiate → **1 tour d'Anarchie** (marteaux, fioles, or, culture : **tout à zéro** pendant la résolution suivante ; aucun bonus ancien/nouveau ; les GP ne spawn pas) puis nouveau régime actif. À la **complétion de la tech de gouvernement** : bascule possible **sans Anarchie** (invitation du conseiller : toast + bouton). **Grande Pyramide** (merveille) = accès à tous les régimes sans tech. `anarchyTurns` 🔶 (1).
- **R-123 · GP restants.** **Scientifique** (science), **Mogul** (or), **Ingénieur** (production) : spawn **par ville** au seuil de leur rendement accumulé (mécanique R-114 ; seuil base `T-30` 🔶 20, ×2 par GP obtenu de ce type) ; **Leader** (combat) : seuil = `T-31` 🔶 victoires de combat de l'empire. **Installation = 1 jalon** (R-115, tous types). Alternance déterministe par type (comme R-114).
- **R-124 · Victoire scientifique.** Les **4 composants du vaisseau** (données 7e : Habitation 400, Support de vie 120, Carburant 80, Propulsion 200, tech Space Flight) → **les 4 contrôlés par le joueur** (villes quelconques) → événement `Launch` → `Victory(reason:'science')`.
- **R-125 · Merveilles tractables** : **Himeji** (+**1** Attaque à toutes les unités de l'empire — la valeur du doc d'Erik), **Grande Pyramide** (tous régimes), **Magna Carta** (Tribunal = +1 culture/tour 🔶), **Oracle** (l'issue exacte du combat est révélée avant confirmation — UI 🔶). **Grande Bibliothèque** : en données mais sans effet en 1v1 (exige « découverte par 2 autres nations » — impossible en 1v1 🔶, activera en multi).
- **Migration `schemaVersion` 11→12** : `player.government`, `player.anarchyUntil`, compteurs GP par type, composants du vaisseau par joueur (ou dérivés des villes — au choix, documenter).

### L1 — Moteur (test-first, pur, déterministe R-80..R-82)

1. **Modificateurs** injectés dans `processEconomy` et la formule de combat : république (coût pop colon 1 — amende R-112), démocratie (+50 % or/science **avant** répartition R-61), fondamentalisme (+1/+1 terrestre dans `S_att`/`S_def` §7.4 + science bibliothèque/université = 0), communisme (+50 % marteaux + culture temples/cathédrales = 0), monarchie (palais ×2 en culture R-113).
2. **Anarchie** : pendant le tour d'anarchie, tout à zéro, GP gelés, production gelée (marteaux à 0) ; action `SetGovernment` **refusée pendant l'anarchie** 🔶 (ou re-programmation — trancher, documenter).
3. **GP restants** (R-123) : accumulateurs par ville pour science/or/production (déjà calculés en Phase C) + compteur de victoires empire pour Leader ; spawn sur la ville ; installation = jalon (R-115 réutilisée).
4. **Victoire scientifique** (R-124) : suivi des 4 composants par joueur → `Launch` → victoire.
5. **Merveilles** (R-125) : Himeji (+1 atk empire), Grande Pyramide, Magna Carta, Oracle (flag UI).
6. **Tests** : chaque modificateur avant/après (même seed), anarchie (tout à zéro + GP gelés), république (colon 1 pop), fondamentalisme (bibliothèque nulle), communisme (temples nulles), monarchie (palais ×2), science victory (4 composants → Launch), Himeji, Grande Pyramide.

### L2 — Serveur

Action immédiate `SetGovernment` (même forme que `SetResearch`/`SetConversion` — **valider d'abord `orderShapeError`**, leçon 7f), validation GameDO (tech ou Grande Pyramide, pas déjà actif), anarchyUntil fixé, diffusion immédiate aux deux clients ; admin dump (régime, anarchie, composants) ; **bot** : adopte République puis Démocratie/Communisme selon ses yields, produit les composants du vaisseau en fin d'arbre, installe ses GP de tous types.

### L3 — UI

1. **Menu de gouvernement** (bouton barre supérieure) : régimes disponibles (techs ✓ ou Grande Pyramide), modificateurs **et pénalités** affichés, bouton « Adopter » avec **avertissement Anarchie 1 tour** ; régime actif ; bandeau Anarchie pendant le tour concerné ; toast d'invitation sans anarchie à la complétion d'une tech de gouvernement.
2. **GP restants** : 4 sprites (Scientifique/Mogul/Ingénieur/Leader) via `generate.py`, bouton d'installation (chemin 7f), jauges par ville.
3. **Victoire scientifique** : section « Vaisseau spatial » (4 composants, état construit/restant) dans l'UI empire ; toast de lancement.
4. **Oracle** : pré-confirmation de combat avec l'issue exacte (🔶 simple).
5. Emblèmes manquants (Banque/Université/Usine si absents) ; `sync-art`, LICENSES.
6. **Leçon 7g** : captures GUI « journal + barre supérieure », scénarios courts (les clics canvas headless sont fragiles).

### L4 — Vérification & livraison

1. **e2e moteur** : République (colon 1 pop) → Monarchie (palais ×2) → anarchie manuelle (rendements nuls 1 tour) → Fondamentalisme (+1/+1, bibliothèque nulle) → Communisme (+50 % marteaux, temples nuls) → 4 composants → `Launch` → victoire scientifique → Himeji (+1 atk mesuré) → Grande Pyramide (régime sans tech).
2. **GUI locale vs bot** : menu de gouvernement, anarchie visible, GP des 4 types installés, composants du vaisseau ; captures.
3. Déploiement prod via CI ; lister pour Erik les vérifications en ligne.

## Critères d'acceptation

1. R-121..R-125 dans `RULES.md`, couvertes par tests citant leur identifiant ; migration v11→12 testée ; suites vertes (≥ 510).
2. Le scénario e2e complet passe (gouvernements → GP restants → victoire scientifique → merveilles tractables).
3. Tous les modificateurs data-driven (`governments.json`) — calibrage sans code ; Grande Pyramide et Anarchie conformes au doc d'Erik.
4. Déployé en prod, vérifié.

## Périmètre interdit (cette session)

**Civilisations et traits de départ (7i)** — retirées du titre de cette phase, elles méritent leur propre jalon (choix à la création de partie, bonus type Rome/France/Égypte, variantes d'unités nationales) ; rush-buy avec or (décision d'Erik à cadrer — mécanique relevée dans le doc), contre-espionnage (7i), ICBM/SDI (7i), Grande Muraille/peace (diplomatie), conversion culturelle/territoire (en suspens), D2 culture-ressources (en suspens), sauts technologiques (en suspens), naval (livré). Toute interprétation : documenter + signaler.

## Fin de session

Rapport habituel (`REPORT-PHASE7H.md`) + captures + remise de la main. Suite prévue : **7i — Civilisations & traits, rush-buy, contre-espionnage, ICBM/SDI, Grande Muraille**, puis **Phase 8 — polish, équilibrage & esthétique** (ou selon les priorités d'Erik). Les en suspens (territoire/conversion, D2, sauts tech) restent à cadrer par Erik quand il le voudra.
