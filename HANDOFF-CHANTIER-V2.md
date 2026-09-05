# HANDOFF CHANTIER V2 — Structures 3D : Nœud Serveur, cartes-ressources, cratère

Tu reprends le pilotage de l'implémentation. **Préalables :** `HANDOFF.md` §4, baseline **803 tests** + typecheck verts, **le rendu 3D V1 est ACCEPTÉ par Erik** (Option B hybride : terrain Three.js + surcouche sprites projetée), **sources visuelles qui font foi : [Refonte Cybernétique De Civilization Revolution.md](Refonte%20Cybernétique%20De%20Civilization%20Revolution.md) §Langage visuel + prototype [prototypes/tuile-secteur-memoire-flux/](prototypes/tuile-secteur-memoire-flux/)**, et les **réflexions de design d'Erik du 04/09** (ci-dessous — elles font foi, les défauts d'implémentation 🔶 sont à veto). `RULES.md` (R-92/93 ressources et révélation par tech, R-65/R-115 villes, 7m cratère). `schemaVersion` : **18 — aucune migration attendue (chantier de rendu pur)**. `packages/rules` non touché ; tout affichage passe par les helpers moteur partagés.

## Réflexions de design d'Erik (04/09 — intégrées ci-dessous)

1. **Ressources = cartes insérées dans des slots de tuiles** : les slots sont **tous de la même taille** (le slot est un élément standard de chaque tuile), mais la **carte qui en sort a taille, forme et visuel différents** selon la ressource — les cartes doivent avoir une **taille significative**. Au même titre que les ressources aux technologies non découvertes (R-92), les cartes sont **toujours visibles** : tant que la technologie associée n'est pas découverte, la carte a une **taille de base et un visuel neutre** (grisée) ; à la découverte, elle prend sa **taille pleine et son visuel propre** ;
2. **La ville est réimaginée en Nœud Serveur (Mainframe)** — structure 3D posée sur la tuile de ville.

## Décisions d'implémentation (défauts 🔶 — veto Erik possible)

- **Slot standard** : chaque tuile productive porte un emplacement de carte géométriquement identique (position/ancrage uniques, data-driven dans `visuel3d.json`) — le slot est discret (socle/encoche) et existe même sans ressource 🔶 (défaut : slot visible sur toute tuile à potentiel, vide si pas de ressource) ;
- **Cartes-ressources** : une carte par ressource (les 22 — `resources.json` data-driven : forme, couleur, pictogramme, éventuel relief 3D simple), **taille significative** (lisibles aux zooms intermédiaires — critère de test) ; **état neutre avant `revealedByTech`** : taille de base réduite + visuel gris/monochrome, sans identité lisible (miroir du marqueur « ? » 2D R-92 — le bonus reste nul tant que la tech manque, R-93) ; à la découverte, transition taille pleine + visuel propre (diffusion passive, snapshot suivant) ;
- **Nœud Serveur (Mainframe)** : structure 3D posée sur chaque case de ville, remplaçant le marqueur 2D ; **croît avec la population** 🔶 (défaut : 3 paliers de gabarit par tranches de pop, miroir R-60bis) ; **capitale distincte** 🔶 (défaut : couronne/tour d'antenne supplémentaire + accent joueur plus large) ; **modules de bâtiments** 🔶 — défaut : chaque bâtiment de la ville ajoute un **module générique par catégorie** (science/or/production/culture/défense) sur le Mainframe, art dédiée par bâtiment reportée (V3+ — à signaler) ; les merveilles hébergées affichent un **module doré distinct** 🔶 ;
- **Cratère** (7m) : déclinaison stérile déjà spécifiée en V1 — à réaliser dans cette passe ;
- **Autres entités de carte** 🔶 — défaut : huttes et villages/camps barbares passent aussi en structures 3D discrètes dans le langage cyber (ce sont des structures statiques) ; **les unités restent des sprites billboards** (le fait d'Erik « les autres structures 3D » vise les structures statiques — les unités volumétriques sont un calque ultérieur, à signaler) ;
- **Overlays inchangés** : cases travaillées, anneaux de sélection, flèches d'ordres, pings — rien ne bouge côté interaction.

## Mission — livrables dans l'ordre

- **L0 — Portage des structures dans la spec data-driven** (`visuel3d.json` : slots, cartes par ressource, Mainframe et ses paliers, cratère) + section « structures » validée par un test de chargeur ;
- **L1 — Mainframe** (toutes villes, capitale distincte, croissance par pop, modules de bâtiments/merveilles 🔶) — test : la structure suit l'état (pop, bâtiments, capture change l'accent propriétaire) ;
- **L2 — Cartes-ressources** (slot standard, 22 cartes, états neutre/révélé, transition R-92) — tests : neutre avant tech (taille + monochrome), pleine après, Espagne/Inde et autres traits respectés via les helpers partagés ;
- **L3 — Cratère + huttes/camps barbares** 🔶 — tests de présence/états ;
- **L4 — Vérification & livraison** : performance 40×40 (l'instanciation doit absorber ~1600 slots + ~centaines de cartes : objectif ≥ 60 FPS, draw calls comptés — le budget V1 était 27-41), tests d'interaction sans réécriture, e2e verts, GUI sur vraie partie (bascule 3D), captures `dev-logs/captures-v2-3d/`, CI, prod saine, **acceptation visuelle d'Erik obligatoire**.

## Critères d'acceptation
- Slots de taille identique partout ; cartes-ressources significatives, distinctes lisiblement, état neutre avant tech et pleine après (tests) ;
- Mainframe sur chaque ville : croissance par pop, capitale distincte, modules par catégorie, module doré des merveilles (tests d'état) ;
- Cratère stérile rendu ; huttes/camps en 3D discrète 🔶 ;
- Aucun changement gameplay : 803 tests verts minimum, schemaVersion 18, moteur/serveur intacts ;
- Performance ≥ 60 FPS en 40×40 (mesurée, comparée à V1) ; CI deploy vert.

## Périmètre interdit (cette session)
**Unités en volumes 3D** (calque ultérieur — les sprites restent) ; **art dédiée par bâtiment** (modules génériques) ; **renommage thématique (V3 — les noms de base restent dans le code, y compris « ville »)** ; **espionnage avancé** ; tout recalibrage gameplay ; toute migration schema.

## Fin de session
Rapport `REPORT-CHANTIER-V2.md` (décisions, perf, 🔶 à calibrer — taille des cartes, paliers du Mainframe, modules, slot vide, ce qui se vérifie en ligne avec le login OAuth d'Erik), arrêt, remise de la main au pilot.
