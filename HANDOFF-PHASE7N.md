# HANDOFF PHASE 7n — Civilisations & traits + corrections 7m

Tu reprends le pilotage de l'implémentation. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**711 tests**), **la spec d'Erik : [Guide Civilisations Civilization Revolution.md](Guide%20Civilisations%20Civilization%20Revolution.md) — elle fait foi** (16 civilisations, avantages de départ, bonus d'ère cumulatifs, unités uniques), `RULES.md` (R-64/D3 clés civs préparées 7i, R-111 remplacements, R-121 gouvernements/Anarchie, R-126/R-127 GP, R-134..R-137 économie, §8.11 7m), hooks prêts : intérêts 2 % (`treasuryInterestOf`), rush ×0,5 (`rushHalfPrice`), Chine +1 pop fondation, Rome Moderne 6. `schemaVersion` actuel : **16**. Pièges : `orderShapeError`, serveurs dev périmés, HMR.

**Contexte.** Les clés de civilisations attendent depuis la 7i. Le doc d'Erik fournit les **16 civs** avec trois composantes : avantage de départ, **bonus d'ère cumulatifs** (jamais éteints), unités uniques (remplacements). La 7n implémente ce qui se branche sur des mécaniques existantes et documente en inactif le reste. **Bloc 0 d'abord** : corrections 7m d'Erik du 05/09.

## Bloc 0 — Corrections 7m (décisions d'Erik du 06/09 — faire en premier, test-first)

- **C15 — La distinction canon de l'ICBM est RÉTABLIE** (révision de C13) : la règle « ville survit, pop 2, ⌈n/2⌉ bâtiments, merveilles préservées » s'applique **à la CAPITALE seulement**. Une **ville ordinaire est RASÉE** (canon) : ville effacée de la carte, population zéro, bâtiments **et merveilles** détruits, garnison anéantie, **cratère** — la case devient stérile et **non fondable** 🔶 (défaut : cratère permanent ; alternative : réutilisabe après N tours — le canon est muet). Le rayon 1 (6 tuiles) annihile toutes les unités dans les deux cas (règle C13.4 conservée). Tests C13 réécrits (capitale + ville ordinaire).
- **C16 — Moitié des bâtiments : arrondi vers le HAUT** (⌈n/2⌉ — 5 bâtiments → 3 détruits) ; sélection seedée R-80, Palais exclu (inchangé).
- **C17 — La Grande Muraille bloque le missile nucléaire** (révision R-140) : tant qu'elle est debout (non obsolète, R-128), toute frappe visant une ville du propriétaire de la Muraille est **annulée** — missile consommé, aucun dégât (miroir SDI R-141) ; portée **empire** (miroir de son effet d'attaque R-133). 🔶 la Muraille ne bloque pas les tirs sur les cases adjacentes (l'exploit R-141 reste possible).
- **C18 — Destruction de bâtiment par espion : choix, coût et risque** (révision R-143) : le tireur choisit le bâtiment **avant** l'action (`buildingId` déjà porté par l'ordre) ; **le coût et le risque croissent avec la valeur de production** du bâtiment (« plus facile de détruire une Bibliothèque qu'une Université »). **Défauts data-driven 🔶 (`espionnage.json`)** : coût en or = `round(marteaux × 0,5)` débité au lancement (non remboursé) ; réussite = `clamp(0,9 − marteaux/500 ; 0,4 ; 0,9)` (RNG seedé R-80) ; **échec = espion perdu + or perdu** (défaut) ; merveilles non ciblables (inchangé). Veto Erik possible sur les deux formules.

## Les ères : décision de tranche (veto Erik — défaut proposé)

Le canon définit l'ère par **nombre de technologies découvertes** : Médiévale à **5 techs**, Industrielle à **14**, Moderne à **24** (indifférent à la branche), transition **au tour suivant**. Notre moteur définit l'ère par la tech **la plus avancée** (`techEraOf`, R-64/D3). **Défaut proposé : aligner le canon** — ère = paliers de comptage data-driven (5/14/24), utilisée partout (pop de fondation R-64/D3, facteurs de rush R-135, injection Explorateur, bonus de civ, pénalité nucléaire). Alternative (si veto) : conserver la définition tech la plus avancée, écart documenté. **Cette décision traverse tout le handoff — la trancher en L0.**

## Mission — livrables dans l'ordre

### L0 — RULES.md (test-first)
Bloc 0 (C15–C18), nouvelle section **Civilisations** (R-145+) : définition des ères retenue, structure des traits (départ / 4 ères / unités uniques), cumulativité, politique des traits inactifs. `civilizations.json` (16 civs : id, nom FR, dirigeant, avantage de départ, bonus par ère, unités uniques avec remplacement + stats du doc) et `eras.json` (seuils 5/14/24 🔶).

### L1 — Moteur (test-first)
1. **Ères** : franchissement au comptage (transition appliquée au tour suivant), événement `EraChanged` ;
2. **Traits de civilisation** — système de modificateurs typés data-driven ; implémenter les traits mappables sur des mécaniques existantes, dont notamment : Chine (Écriture départ, +1 pop fondation, Alphabétisation gratuite, Bibliothèques −50 %, immunité Anarchie), Rome (Code des lois + République départ, Merveilles −50 %, GP plus fréquents, +1 pop fondation ère Moderne), Mongols (+50 % commerce villes capturées 🔶, **villages→villes** 🔶 trancher : ouvrir une hutte fonde une ville pop 1 — canon, mécanique nouvelle petite), cavalerie +1 PM, montagnes +2 P, Communisme gratuite, Égypte (Merveille Antique gratuite au départ 🔶 — proposition : le joueur choisit une merveille de l'ère Antique au setup), désert +1 N +1 C, Inde (accès immédiat à toutes les ressources — R-92/R-93), Colons −50 %, Grèce (Tribunal départ, Démocratie gratuite, GP plus fréquents, +1 N maritime), Amérique (GP gratuit départ, intérêts 2 % — hook R-134, rush unités −50 % — hook R-135, plaines +1 N, Usines ×3), Allemagne (Guerriers vétérans départ, Forêt +1 P, Casernes −50 %, intérêts 2 %), Russie (carte environnante révélée, plaines +1 N, Loyauté 🔶 inactif sans promotions, Fusiliers/Espions −50 %), Zoulous (**écrasement 4:1** 🔶 — ajouter la règle Overrun au combat R-51..56, data-driven), Aztèques (or de départ 🔶, auto-soin après victoire 🔶, Temples +3 science, routes −50 % inactif, +50 % or empire), Arabie (Religion + Fondamentalisme départ, caravanes +50 % inactif, Mathématiques gratuite, Cavalerie/Chevaliers +1 attaque, intérêts 2 %), Espagne (Navigation départ, **trésors/artefacts ×2** 🔶 hook artefacts inactif sans artefacts, +1 naval, +50 % or, Collines +1 P), France (Cathédrale départ, Poterie gratuite, routes inactif, Canons +2 attaque, Fusiliers +1 PM), Japon (Inhumation départ, maritime +1 N, Samouraïs +1 attaque, Anarchie immunité, Loyauté 🔶) ;
3. **Traits NON mappables = inactifs documentés** (routes — pas d'ouvriers ; caravanes — reportées 7l ; élite automatique & promotions Loyauté — pas de système d'XP/promotions, doc demandé) ;
4. **Unités uniques** (~19) : données `units.json` avec `uniqueTo` + `replaces` (pattern R-111) — remplacement automatique dans les menus de production quand la tech est débloquée, stats exactes du doc (Impi +1 PM, Samouraï +14 attaque — vérifier nos échelles, Archer long +1 déf 🔶 canon dit +1, le texte du doc dit +14 : **auditer contre CivFanatics et le doc, signaler**) ;
5. **Avantages de départ** appliqués à la création de partie (setup déterministe) ;
6. Chaque test cite la R-xx ou la ligne du doc d'Erik.

### L2 — Serveur
Choix de civilisation dans le **lobby** (chaque joueur choisit à la création/au join 🔶 — défaut : choix à la création, stocké dans `meta.players`), diffusion, fog (la civ adverse est **publique** — canon), traits côté état filtré, **migration 16→17** additive (`civId` par joueur, défaut `neutre` pour les parties existantes — aucun trait).

### L3 — UI + assets
Écran de sélection de civ (16 cartes : nom, dirigeant, avantage de départ, résumé des bonus d'ère, unités uniques), badge civ + bandeau d'ère dans la barre supérieure, tooltips des traits actifs (et mention des inactifs), bandeau « Ère Médiévale ! » (événement), **art des unités uniques** via `generate.py` + `sync-art` (si le volume explose la session : alias teintés par accent joueur 🔶 et art dédiée reportée — à signaler au pilot), écran de choix de la merveille Égypte 🔶.

### L4 — Vérification & livraison
e2e (partie complète avec 2 civs différentes : départ bonus, transition d'ère au comptage, bonus d'ère cumulés, unité unique en production, migration), GUI vs bot sur 5174 (le bot joue une civ déterministe 🔶), captures `dev-logs/captures-7n/`, CI, prod health.

## Critères d'acceptation
- 16 civs jouables dans le lobby, choix persisté, visible par l'adversaire ;
- Ère par comptage (5/14/24) si défaut retenu : transition au tour suivant, événement visible ;
- Bonus d'ère **cumulatifs** (test : une civ en ère Moderne a ses 5 avantages actifs simultanément) ;
- Unités uniques remplacent l'unité standard au menu dès la tech requise (test au moins sur 3 civs) ;
- Les 4 corrections C15–C18 passent leurs tests de révision (nucléaire : capitale survit, ville ordinaire rasée, Muraille bloque, coût/risque de sabotage croissant) ;
- Baseline : tests verts (≥ 711 + nouveaux), typecheck vert, CI deploy vert.

## Périmètre interdit (cette session)
**Espionnage avancé** (BACKLOG idée 5 — en fin de feuille de route, après le chantier de thème, doc de recherche 4X déjà commandé par Erik) ; **artefacts** (phase suivante) ; **chantier visuel 3D** (après artefacts — spike technos demandé) ; **migration thématique nanotechnologique** (après stabilisation — doc d'Erik à venir, renommage global des techs/unités) ; **territoire/flip culturel** ; promotions/XP d'unités (doc de recherche en attente) ; aucun recalibrage au-delà du Bloc 0.

## Fin de session
Rapport `REPORT-PHASE7N.md` (décisions, écarts doc/moteur — notamment les stats d'unités uniques croisées CivFanatics, 🔶 à calibrer, ce qui se vérifie en ligne avec le login OAuth d'Erik), arrêt, remise de la main au pilot.
