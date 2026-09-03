# REPORT PHASE 7e — Arbre technologique complet & contenu terrestre

Date : 02/09/2026 · Précédent : `REPORT-PHASE7D.md` · Handoff : `HANDOFF-PHASE7E.md`

## Résumé

L'arbre technologique complet (46 technologies avec coûts/prérequis exacts, ères, Premier découvrir, obsolescences), tout le contenu terrestre (12 unités terrestres jouables, 22 bâtiments à effets, 21 merveilles en données) et les effets de bâtiments actifs (Remparts, Aqueduc, Marché/Banque, Université, Usine, Palais) sont livrés. **R-59 est implémentée réellement** (tests citant la règle). Migration `schemaVersion` **8 → 9** (`firstBy` + Palais dans les capitales). Suites vertes : **385 (rules) + 50 (web) + 29 (server) = 464 tests**, typecheck propre.

## Réponse à la question posée à Erik (Pionniers)

> Les Pionniers officiels coûtent 20 production et consomment 2 population — notre Colon est auto-consommé, sans pop. Garder la simplification ou adopter l'officiel ?

**Comportement officiel adopté** (décision d'Erik, appliquée en R-112, `packages/rules` §3.1bis de RULES.md) : le Colon coûte 20 production **+ 2 population de la ville à sa production** ; la fondation consomme toujours l'unité elle-même (R-64 inchangée). Interprétation tranchée et documentée : la ville doit avoir `pop ≥ 2` à la complétion, `pop = max(1, pop − 2)`, citoyens excédentaires retirés sans re-remplissage ; pop insuffisante → file **en attente** (progression conservée). Champ data-driven `unit.populationCost` (générique). Événement `PopulationConsumed`.

## L0 — Données

- **`techs.json`** : 46 technologies. Coûts exacts croisés document (« Technologies et Déblocages ») × CivFanatics ; écarts arbitrés CivFanatics et marqués 🔶 : **Écriture 40**, **Irrigation 60**, **Industrialisation 710** (le document portait « 30-40 », « 50-60 », « 530-710 »). Piège de lecture du document (chiffres collés aux citations) traité : `105` = 1/1 [5], etc. Champs : `era` (ancienne 18 / médiévale 6 / industrielle 12 / moderne 10), `firstToDiscover`, `obsoleteUnits[]`, `obsoleteWonders[]`.
- **`units.json`** : 23 types. Jouables : Archer (coût **10** — corrigé de 15, les deux sources concordent, 🔶 RULES §3.1 mise à jour), Piquier 1/3/1 (15, Démocratie), **Catapulte 4/1/1 à distance** (20, Mathématiques), Chevalier 4/2/2 (25, Féodalité), Fusilier 3/5/1 (20), **Canon 6/2/1 à distance** (30, Métallurgie), Infanterie moderne 4/8/1 (30), Char d'assaut 10/6/3 (50), **Artillerie 16/2/2 à distance** (50, Automobile). Données seules (`implemented:false`) : Espion (coût corrigé 30→25), Caravane, Galère (tech retirée : disponible d'office chez CivRev), Galion/Croiseur/Cuirassé avec `navalSupport` 15/35/65 (mécanique 7g), Sous-marin, Chasseur/Bombardier (`aerial`), Milice, ICBM. Colon : `populationCost: 2`.
- **`buildings.json`** : 22 bâtiments avec coûts exacts (CivFanatics Buildings). Nouveaux : Palais (`fixed`, +50 % défense), Temple, Marché, Remparts (+100 % défense), Aqueduc (seuil −⅓), Banque, Cathédrale, Université, Usine, SDI, 4 composants du Vaisseau (`implemented:false`). Corrections 7e : **Grenier +2 N** (résout le point ouvert 6c) et coûts 40/60/80/100/120 ; Atelier → tech Construction ; Mine de fer → tech Chemin de fer ; Tribunal → Littératie.
- **`wonders.json`** : 21 merveilles avec coût/tech/effet/obsolescence (`implemented:false` — effets 7f/7h).
- **`resources.json`** : **D4 achevé** — les 14 ressources dont la tech rejoignait l'arbre ont leur `revealedByTech` (Blé→Irrigation, Fer déjà là, Chêne→Construction, Pétrole→Combustion, etc.) ; `officialTech` nettoyé. `soie` suit le renommage `lettres` → **`litteratie`** (id aligné sur la source).

## L1 — Moteur

1. **R-59 (réelle)** : la Catapulte/Canon/Artillerie attaque **depuis sa case** (portée `T-13` = 1), **n'avance jamais** même victorieuse, ne subit **aucune riposte de mêlée** (X-5 conservé), échange standard contre une autre unité à distance, et le **défenseur à distance qui ne vainc pas cède systématiquement sa case** (R-59-d, repli R-54). Nouveauté 7e : l'attaquant à distance en survie mutuelle **reste simplement en place** (plus d'événement `Retreat` sur soi-même). Tests dédiés (3 tours, position inchangée, PV exacts, repli du défenseur).
2. **Effets de bâtiments (§8.4)** : Remparts/Palais → `S_def` (somme des `cityDefenseBonus`, test graine-29 : p_att 0,307 → 0,138) ; Aqueduc → seuil de croissance −⅓ ; Marché/Banque/Université → multiplicateurs or/science data-driven (`conversion.ts`, comportement R-88 d'Erik strictement préservé) ; Usine → production ×2 ; remises de coût empire (Communisme, Réseautage, plafond 90 %) dans `productionItemCost`.
3. **Premier découvrir (R-109)** : `firstBy` + `firstDiscovery.ts` (or, unité/bâtiment gratuit, population, perCity, remises, révélation de carte). Récompenses décrites mais NON appliquées : Personnages illustres (7h), culture (7f), unités non implémentées.
4. **R-110 Obsolescence** : `obsoleteUnitsFor`/`isUnitObsolete` + `canSetProduction` (le menu et le serveur retirent les unités obsolètes ; unités existantes conservées).
5. **R-111 Remplacement** : `requiresBuilding`/`replaces` validés au `SetProduction` ; la Banque retire littéralement le Marché à la complétion.
6. **Migration v9** : `firstBy: {}` + Palais dans les capitales existantes ; les nouvelles fondations reçoivent le Palais (moteur + `createInitialState`). Pas d'autre changement de forme (décision : tout le reste est donnée).

## L2 — Serveur & bot

Aucun changement de protocole (le serveur revalide `SetProduction` via `canSetProduction`, étendue R-87). Le **bot** produit aléatoirement : `pickProduction(city, player)` lit les mêmes JSON (unités implémentées non obsolètes, bâtiments non possédés/replacés avec prérequis satisfait, Colon bloqué si pop < 2) ; le moteur revalide tout.

## L3 — UI

- **CityPanel** : menu de production enrichi — `isProducible` (tech + implémentation + obsolescence + prérequis de bâtiment), bâtiments possédés/replacés retirés, libellés « remplace X — requiert Y », Colon « consomme 2 population », marqueur « — à distance », jauge de production miroir avec Usine ×2 et seuil de croissance avec Aqueduc.
- **UnitPanel** : badge « 🎯 À distance » (R-59) + boutons « Tirer sur » avec infobulle.
- **ResearchPanel** : arbre groupé **par ère** (Ancienne → Moderne), prérequis tracés, 🏅 récompense de Premier découvrir affichée, obsolescences libellées.
- **Journal/playback** : libellés + durées pour `FirstDiscovered` et `PopulationConsumed`.
- **Assets** : `generate.py` enrichi — 8 peintres d'unités (Piquier, Catapulte, Chevalier, Fusilier, Canon, Infanterie moderne, Char d'assaut, Artillerie) + 10 emblèmes de bâtiments (Palais, Temple, Marché, Remparts, Aqueduc, Banque, Cathédrale, Université, Usine, SDI) ; `--check` CONFORME ; `sync-art` : 115 fichiers dans le build.

## L4 — Vérification

- **e2e moteur** (`tests/phase7e.test.ts`) : recherche Mathématiques (chaîne prérequis + réserve) → Catapulte gratuite (Premier découvrir) → Remparts construits (coût 100) → tir sans avancer ni riposte, PV exacts.
- **Fumée locale serveur + bot** (wrangler dev) : deux parties créées via le lobby, bot P2 joint, verrouille, **production acceptée par le moteur** (Guerrier en file vérifié au dump admin), tour résolu.
- **GUI locale** (vite + navigateur automatisé) : login dev → lobby → création de partie pangée → arbre de recherche complet affiché par ère avec prérequis → Alphabet sélectionné → bot rejoint et joue. Le clic-canvas (sélection de ville en GUI) n'a pas pu être automatisé (captation d'image indisponible dans cet environnement) — le menu de ville est couvert par la logique partagée moteur/UI et la fumée serveur.
- **Déploiement** : commit + push → CI (`deploy.yml`).

## Interprétations & écarts (signalés)

1. **Colon/R-112** : `pop ≥ 2` exigée (jamais de ville à 0), `max(1, pop−2)` — la règle CivRev exacte sur la ville de taille 2 est incertaine ; 🔶 calibrable.
2. **Aqueduc** : seuil `round(10 × pop × 2/3)` 🔶 (le « +50 % de taux » CivRev ≈ −33 % de seuil).
3. **Remparts/Palais** : bonus additifs entre eux et avec T-02 (Palais 0,5 + Remparts 1,0 + ville 0,5 = ×3) — CivRev ne publie pas la formule.
4. **Premier découvrir — ville bénéficiaire** : « dans une ville » = première ville du joueur (capitale prioritaire, cityId croissant) — le jeu original laisse choisir 🔶.
5. **Remises de coût** plafonnées à 90 %, coût minimal 1.
6. **Galère** : tech retirée (`null`) — disponible d'office chez CivRev ; notre donnée 7a la rattachait à Navigation.
7. **Espion** : coût corrigé 30 → 25 (source).
8. **Archer** : coût corrigé 15 → 10 (les deux sources concordent ; l'amendement du handoff anticipait un écart « 10 ici vs 15 CivFanatics » qui n'existe pas).
9. **Sauts technologiques** (majorité des prérequis + finissable ≤ 10 tours) : documenté RULES §8.1, **différé 7f+** (annoncé dans l'amendement).
10. **Attaque à distance et villages** : l'entrée dans une case de village (Phase A) reste le déclencheur du combat, même pour une unité à distance — le « tir sans avancer » concerne les cibles à unité (`Attack` explicite et collision) ; 🔶 à recalibrer en 7g avec le bombardement naval/aérien.
11. **Unités à distance et capture de ville** : si un tir tue le défenseur d'une ville, l'unité reste sur la case (elle y était entrée par son mouvement) → capture R-65 normale.
12. **Le bug de fumée découvert** n'en est pas un produit : mon script lisait `snapshot.phase` (inexistant à la racine) au lieu de `snapshot.state.phase` — à noter, le champ public n'expose pas `phase`.

## Points à vérifier en ligne (Erik)

1. Partie en cours migrée v9 : capitales dotées du Palais (vérifier la défense ressentie).
2. Coût du Grenier (40) et bonus +2 N : rythme de croissance — calibrage attendu.
3. Colon à 2 pop : ressenti du démarrage « ville pop 1 ne peut pas produire de Colon immédiatement ».
4. Multiplicateurs Marché/Banque/Université sur l'économie à plusieurs villes.
5. Récompenses de Premier découvrir (unité gratuite au spawn de la capitale) : est-ce le bon ciblage ?

## Suites prévues

**7f — Culture** (spec d'Erik : `Culture dans Civilization Revolution.md` — moteur culturel, Temple/Cathédrale actifs, merveilles culturelles, sauts technologiques) · **7g — Naval & Espionnage** (données déjà posées : `navalSupport`, unités navales) · **7h — Gouvernements & Civilisations + effets des merveilles**.
