# HANDOFF PHASE 7m — ICBM & SDI, espionnage jeu de base + décisions d'Erik

Tu reprends le pilotage de l'implémentation. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**659 tests**), **la spec d'Erik : [Nuclear and spy Game Mechanics Research.md](Nuclear%20and%20spy%20Game%20Mechanics%20Research.md) — elle fait foi, SAUF les décisions d'Erik du 05/09 qui ont préséance (Bloc 0)**, `RULES.md` (R-30/R-31 armées, R-33 fortification, R-115 merveilles, R-119 vol de GP, R-121 gouvernements, R-130 réserve, R-134 trésorerie, R-135 rush-buy, §8.9/§8.10), données présentes : `units.json` `icbm`, `buildings.json` `sdi`, `wonders.json` `projet_manhattan`. `schemaVersion` actuel : **15**. Pièges : `orderShapeError` avant toute nouvelle forme d'ordre, serveurs dev périmés, HMR.

**Contexte.** Le contenu existe en données (Manhattan, ICBM, SDI) mais aucune mécanique nucléaire ni les actions d'espionnage complètes n'existent. La 7m livre le nucléaire (avec les décisions d'Erik) et l'espionnage **identique au jeu de base** — la vision avancée d'Erik (infiltration, XP, menu de renseignement) est un chantier dédié consigné en `BACKLOG.md` idée 5, **hors périmètre**.

## Bloc 0 — Décisions d'Erik du 05/09 (préséance sur le rapport — faire en premier, test-first)

- **C13 — Résolution ICBM UNIFIÉE (révision du canon)** : toute ville ciblée (capitale ou non) **survit** — pas de destruction totale, pas de cratère :
  1. population réduite à **2** (jamais 1) ;
  2. **la moitié des bâtiments détruite au hasard** (RNG seedé R-80 ; moitié arrondie 🔶 — proposition ⌊n/2⌋ ; Palais exclu) ;
  3. **les merveilles sont PRÉSERVÉES** ;
  4. **toutes les unités — case de ville ET les 6 tuiles adjacentes — sont détruites**, amies comme ennemies, **aucun survivant** (le canon 80-90 % de zone est remplacé par 100 % dans le rayon) ;
  5. les GP installés (`settledGreatPersons`) sont **préservés** (miroir canon : les GP survivent à l'explosion) ;
  6. les GP « en attente de choix » présents dans le rayon sont détruits 🔶 (le canon ne tranche pas — proposition : détruits, comme toute unité).
- **C14 — La frappe ne valide PAS la domination** (canon conservé) : neutraliser une capitale n'en prend pas possession ; la victoire exige une occupation physique ultérieure.
- **Flag de lecture à signaler dans le rapport** : la résolution C13 est appliquée de façon unifiée (une seule règle pour capitale et ville ordinaire). Si Erik voulait garder la distinction canon (ville ordinaire rasée, capitale survivante), il le dira à l'acceptation — la structure de code doit permettre les deux (résolution data-driven).

## Nucléaire (canon du rapport — hors décisions Bloc 0)

- **Projet Manhattan** : 750 marteaux, Théorie atomique (données à auditer), complétion → **l'ICBM est instanciée dans la ville constructrice** ; **un seul missile par partie** (exclusivité — la complétion par l'autre joueur est impossible de toute façon, merveille unique R-129). La mervelle est rush-buyable (R-135) ; **l'unité ICBM n'est PAS achetable** (absente des files de production).
- **ICBM, unité mobile 0/0/40 PM** (audit `units.json` — 40 PM = portée globale pratique) : **nouvelle forme d'ordre `Launch { unitId, cible }`** — **valider `orderShapeError` EN PREMIER**. Cible = case visible (fog). Le missile est **consommé** au tir (une seule frappe).
- **Interdiction sous Démocratie** (R-121) : le tir est refusé si le gouvernement est la Démocratie (libellé UI explicite).
- **Pénalité culturelle 🔶** : une frappe coûte une pénalité de culture au tireur, **annulée sous Despotisme** (canon). Montant non documenté — **défaut proposé : −1 Jalon culturel** (si le joueur en a) ; alternative : −X points de culture cumulée. Calibrable, veto Erik.
- **Grande Muraille 🔶** : le tir nucléaire n'est PAS une attaque au sens R-133 — défaut : la Muraille ne bloque pas l'ICBM (arme stratégique) ; veto Erik possible.
- **SDI** : auditer nos données contre le canon — **200 marteaux, Superconducteurs, interception 100 % GARANTIE** du tir ciblant directement **la ville hôte** ; **couverture locale uniquement** (une SDI par ville pour tout protéger ; les premières ne protègent pas l'empire) ; le « SDI gratuit » du Premier découvreur est déjà en données (vérifier). **L'exploit canon est conservé** : un tir sur une case ADJACENTE à la ville protégée n'est pas intercepté et frappe le rayon C13.4 (SDI ≠ bouclier de zone).

## Espionnage — identique au jeu de base

- **Espion, unité 0/0/2** (25 marteaux, technologie Écriture — auditer `units.json`) : **visible** sur la carte, non-combattante ; **éliminé sans combat** si une unité militaire ennemie entre sur sa case hors d'une ville (vérifier l'interaction avec R-51/R-54 — défense 0). **Premier découvrir Écriture → Espion gratuit** (R-109, vérifier la récompense existante).
- **Réseau d'espions** : 3 espions sur la même case fusionnent (miroir des armées R-30/R-31) — efficacité accrue dans les duels.
- **Entrer dans une ville ennemie ouvre le menu d'actions** (extension du panneau d'unité) :
  1. **Voler de l'or** : pourcentage 🔶 de la trésorerie adverse (défaut proposé : **50 %**, data-driven) — la victime est notifiée avec le montant (R-134) ;
  2. **Enlever un Personnage Illustre** : un GP **« en attente de choix »** présent dans la ville est transféré (complète le vol de GP **installé** R-119 de 7g — les deux restent possibles, 🔶 écart canon signalé : le canon ne kidnappe que les non-installés) ;
  3. **Saboter la production** : les marteaux investis du projet en cours sont remis à zéro 🔶 (défaut : la **réserve permanente C7 n'est pas touchée**) ;
  4. **Détruire un bâtiment** : le tireur choisit 🔶 parmi les bâtiments non-Palais de la ville (le canon ne précise pas le mode de sélection) ;
  5. **Détruire les fortifications** : annule la fortification (R-33) de la meilleure unité défensive de la ville ;
  6. **Partir discrètement** : l'espion se repositionne sur une case adjacente, **non consommé**.
- **Consommation** : toute action hostile **consomme l'espion** (seule « Partir discrètement » le préserve).
- **Duel d'espions** : si un espion ennemi est en **garnison** dans la ville ciblée, un duel automatique précède l'action (RNG seedé R-80 ; matrice data-driven 🔶 — défaut proposé : isolé vs isolé 50 %, réseau vs isolé 90 %, réseau vs réseau 50 %). **Sans garnison : 0 % de risque** (succès automatique). Le perdant est détruit sans exécuter sa mission.
- **Contre-espionnage jeu de base = l'espion en garnison uniquement** (aucun bâtiment — canon explicite ; les bâtiments de contre-espionnage appartiennent à la vision avancée, BACKLOG idée 5).
- **Notifications** : la victime est notifiée de chaque action réussie (montant du vol, bâtiment détruit, GP enlevé — journal + toast).
- **Nouvelle(s) forme(s) d'ordre** (`SpyAction { unitId, action, ... }`) — **valider `orderShapeError` EN PREMIER**.

## Mission — livrables dans l'ordre

- **L0 — RULES.md (test-first)** : Bloc 0 (C13/C14 + flags), section nucléaire (R-138+ : Manhattan/ICBM/SDI/interdictions), section espionnage (actions, consommation, duels, garnison) ;
- **L1 — Moteur (test-first)** : Manhattan → ICBM instanciée ; `Launch` + résolution C13 ; interdiction Démocratie ; pénalité 🔶 ; SDI ; espion + réseau + menu d'actions + duels ; chaque test cite la R-xx, le bloc du rapport ou la décision C-xx ;
- **L2 — Serveur** : validateurs, événements (frappe, vol — filtrés fog : la trésorerie adverse reste non publique, l'événement de vol ne révèle que le montant subi), dump admin (ICBM en jeu, SDI par ville, espions — brouillé pour l'adversaire), migration **15→16** additive ;
- **L3 — UI** : bouton/ordre de lancement (confirmation explicite « cette action est irréversible »), cible sur la carte, animation d'explosion 🔶 (relecture 5.5), menu d'actions espion dans ville ennemie, badge espion en garnison, toasts victime/tireur, art espion/ICBM (generate.py + sync-art — auditer les sprites existants) ;
- **L4 — Vérification & livraison** : e2e (frappe complète C13, SDI interception + exploit adjacent, interdiction Démocratie, vol d'or avec débit/réception, duel d'espions, consommation), GUI vs bot sur 5174, captures `dev-logs/captures-7m/`, CI, prod health.

## Critères d'acceptation
- Un seul ICBM par partie, instancié chez le compléteur du Manhattan, non achetable ;
- Frappe sur une ville : pop = 2, moitié des bâtiments (seedé, rejouable), merveilles et GP installés préservés, TOUTES les unités du rayon 1 détruites, ville non capturée ;
- Tir refusé sous Démocratie ; pénalité culturelle appliquée, annulée sous Despotisme ;
- SDI : interception garantie du tir direct sur sa ville, aucune protection du tir adjacent ;
- Espion : les 6 actions, consommation correcte, duel d'espions en garnison, succès automatique sans garnison, notifications victime ;
- Baseline : tests verts (≥ 659 + nouveaux), typecheck vert, CI deploy vert.

## Périmètre interdit (cette session)
**Vision avancée de l'espionnage d'Erik (BACKLOG idée 5)** : infiltration/installation d'espion (disparition de la carte), expérience et points d'espionnage, bâtiments de contre-espionnage, menu de renseignement, fenêtre d'annulation au tour de la victime, redirection de troupes, réduction de brouillard, vol de technologie, vol d'unités, assassinat — **chantier dédié, à cadrer après la 7m** ; **civilisations (7n)** ; **artefacts** ; **territoire/flip culturel** ; aucun recalibrage au-delà du Bloc 0.

## Fin de session
Rapport `REPORT-PHASE7M.md` (décisions, écarts doc/moteur, 🔶 à calibrer — moitié de bâtiments, pénalité culturelle, % de vol d'or, matrice de duel, mode de sélection du bâtiment, ce qui se vérifie en ligne avec le login OAuth d'Erik), arrêt, remise de la main au pilot.
