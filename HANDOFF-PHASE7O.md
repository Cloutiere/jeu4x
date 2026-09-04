# HANDOFF PHASE 7o — Artefacts (reliques)

Tu reprends le pilotage de l'implémentation. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**759 tests**), **la spec d'Erik : [Artefacts Dans Civilization Revolution.md](Artefacts%20Dans%20Civilization%20Revolution.md) — elle fait foi**, `RULES.md` (R-98 huttes — pattern le plus proche, R-80 RNG seedé, R-92/93 ressources, R-111 remplacements, R-146 traits civs dont `tresorsDouble` Espagne et `villagesVilles` Mongols, R-147 ères), génération procédurale 6b/6c (labo `#/progen`, cartes miroir + checksum d'équité). `schemaVersion` actuel : **17**. Pièges : `orderShapeError` (probablement aucune nouvelle forme d'ordre — activation au pas de mouvement, comme les huttes), serveurs dev périmés, HMR.

**Contexte.** Les artefacts sont la dernière entité de carte manquante : complétion de l'exploration, pont naturel vers l'espionnage avancé (le Conquistador espagnol « facilite le repérage ») et prérequis des stratégies du doc (Arche différée, Atlantide pilotée). **Périmètre canon : les 6 artefacts du jeu de base ; les 6 DLC (Camelot, Sphinx, Aiguille, Terracotte, Rayon de Tesla, Babel) sont exclus v1** — données possibles, `dlcOnly: true` non générés.

## Règles canoniques (doc fait foi)

- **Génération** : au chargement de la carte, tirage **sans remise** de **3 à 6 artefacts** 🔶 (défaut proposé : **4**) parmi le pool de 6 ; RNG seedé R-80 (rejouable) ; chaque artefact est **unique** et **disparaît définitivement** à son activation.
- **Placement** 🔶 : priorité aux **îles isolées ou atolls d'une seule case** éloignées des continents ; **1 à 2 artefacts possibles sur le continent principal** (rare) ; l'**Atlantide est générée en haute mer** (océan profond, loin des côtes) et fait « presque systématiquement partie » du tirage — défaut : **toujours dans le pool tiré, poids renforcé** 🔶. Intégration **progen** (placement à la génération, symétrie miroir 6b garantie) et **cartes préfabriquées** 🔶 (défaut : artefacts tirés par seed aussi sur les cartes fixes — positions candidates marquées à la génération). La carte test du labo `#/progen` sert à calibrer le placement.
- **Activation** : **entrée sur la case** avec une unité terrestre (miroir huttes R-98) ; **exception Atlantide : pas de débarquement — une unité navale sur une case ADJACENTE suffit** ; une seule fois ; événement + journal + toast ; l'artefact disparaît.
- **Détection 🔶** : artefacts sous le brouillard ; trois leviers canon — (1) **survol de la case masquée = indice visuel 🔶** (le canon décrit un bourdonnement sonore : notre audio est différé — défaut : lueur/cursed marqueur discret au survol, veto possible), (2) **les huttes peuvent donner des indices** (défaut 🔶 : une récompense possible de `huttes.json` révèle le **nombre d'artefacts restants** ou la **position** d'un artefact — nouvelle entrée de table), (3) **Vol Spatial révèle tous les artefacts restants** (tech existante). Espagne `tresorsDouble` ×2 s'applique aux Sept Cités d'Or (hook R-146 déjà posé).

## Catalogue — les 6 artefacts du jeu de base (`artefacts.json`, data-driven)

| Artefact | Effet (défaut d'implémentation 🔶) |
|---|---|
| **Angkor Wat** | Une **merveille gratuite** dans une ville du découvreur — défaut : le **joueur choisit** la merveille (parmi les non construites non obsolètes, coût ignoré) **et la ville** (UI de choix au moment de l'activation) |
| **Arche d'Alliance** | Temple gratuit dans chaque ville sans Temple ; **Temples existants → Cathédrales** (remplacement R-111) |
| **Sept Cités d'Or** | Or versé à la trésorerie selon l'ère 🔶 — défaut : Ancienne 200, Médiévale 250, Industrielle 300, Moderne 400 ; **×2 Espagne** (`tresorsDouble`) |
| **École de Confucius** | **3 GP gratuits** 🔶 (classes par rotation R-127, posés à la capitale/cités, **sans jalon** — miroir C2/paliers) |
| **Chevaliers Templiers** | Une **unité militaire avancée** selon l'ère 🔶 — défaut : Ancienne/Médiévale → Chevalier, Industrielle → Canon, Moderne → Char (table data-driven) ; posé sur la case de l'artefact (sinon adjacente) |
| **Cité Perdue d'Atlantide** | **Complète les 3 technologies les moins coûteuses non débloquées** (octroi direct, tri déterministe par coût puis id — la « manipulation » décrite par le doc est un comportement canon à préserver) |

## Mission — livrables dans l'ordre

- **L0 — RULES.md (test-first)** : section Artefacts (R-151+ : génération, placement, activation, détection, catalogue) ;
- **L1 — Moteur (test-first)** : `artefacts.json` (pool, effets, poids de placement) ; génération à la création de carte (progen + cartes fixes) ; entités de carte + activation au pas de mouvement (miroir R-98) + Atlantide navale adjacente ; les 6 effets ; extension `huttes.json` (indices) ; Vol Spatial = révélation ; chaque test cite la R-xx ou le doc ;
- **L2 — Serveur** : artefacts dans le snapshot (filtrage fog — un artefact non exploré n'existe pas côté client), événements filtrés, dump admin (artefacts générés/restants/découverts), **migration 17→18 additive** (état d'artefacts) ;
- **L3 — UI + assets** : sprites des 6 artefacts (generate.py + sync-art), marqueur sur case explorée, indice de survol 🔶, toasts/journal (activation, indice hutte, révélation Vol Spatial), choix UI Angkor (merveille + ville), labo `#/progen` : affichage des artefacts pour le calibrage du placement ;
- **L4 — Vérification & livraison** : e2e (tirage seedé rejouable, placement insulaire + Atlantide haute mer, les 6 effets, unicité/disparition, Espagne ×2, indices hutte, Vol Spatial), GUI vs bot sur 5174, captures `dev-logs/captures-7o/`, CI, prod health.

## Critères d'acceptation
- 3–6 artefacts par carte, tirage sans remise, rejouable au même seed, symétrie miroir respectée ;
- Atlantide activée par unité navale adjacente ; artefacts terrestres par entrée sur la case ;
- Les 6 effets conformes au tableau ; Angkor = choix joueur ; Atlantide = les 3 techs les moins chères (test de tri déterministe) ;
- Espagne : Sept Cités ×2 (test) ; huttes : indice possible (test) ; Vol Spatial : révélation complète (test) ;
- Un artefact activé disparaît pour les deux joueurs ; un artefact non exploré reste invisible (fog) ;
- Baseline : tests verts (≥ 759 + nouveaux), typecheck vert, CI deploy vert.

## Périmètre interdit (cette session)
**Artefacts DLC** (Camelot, Sphinx, Aiguille, Terracotte, Rayon de Tesla, Babel — `dlcOnly: true` possibles en données, jamais générés) ; **chantier visuel 3D / spike** (prochaine étape après cette phase) ; **migration thématique nanotechnologique** (doc d'Erik attendu) ; **espionnage avancé** (dernier) ; territoire/flip culturel ; promotions/XP (doc en attente) ; aucun recalibrage hors 🔶 ci-dessus.

## Fin de session
Rapport `REPORT-PHASE7O.md` (décisions, 🔶 à calibrer — nombre par carte, tables d'or/unités/Confucius, placement, indices, ce qui se vérifie en ligne avec le login OAuth d'Erik), arrêt, remise de la main au pilot.
