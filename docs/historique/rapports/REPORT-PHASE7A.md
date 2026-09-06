# RAPPORT PHASE 7a — Technologies, première tranche

Date : 31/08/2026. Handoff : `HANDOFF-PHASE7A.md`. Tout le périmètre R-85/R-86/R-87 est implémenté, testé, déployé.

## 1. Livrables

### L0 — Données relationnelles + intégrité
- `packages/rules/src/data/techs.json` : les **9 technologies** de la table R-86 (Alphabet, Travail du bronze, Poterie, Équitation, Travail du fer, Écriture, Lettres, Code des lois, Navigation) — `{id, name, cost, prereqs[], unlocks{units, buildings, wonders}}`. Coûts 🔶 conformes à la table (20/20/20/20/30/30/40/40/50).
- `packages/rules/src/data/wonders.json` : **3 merveilles en données** (Oracle de Delphes, Colosse de Rhodes, Jardins suspendus) — `implemented: false`, non constructibles.
- `units.json` : ajout d'**Archer** (1/2/1, 15), **Cavalier** (2/1/2, 20), **Légion** (2/1/1, 10) — hpMax 3, vision 2 (table §3) — plus **Espion** et **Galère** en données seules (`implemented: false`, Galère `aquatic: true`). Nouveau champ `tech` sur chaque unité.
- `buildings.json` : champ `tech` sur les 6 bâtiments existants (**Grenier ← poterie — changement : il n'était pas verrouillé jusqu'ici**) + **Bibliothèque** (30 🔶, alphabet) et **Caserne** (20 🔶, travail du bronze), **Mine de fer ← travail du fer** (ajout du handoff, au-delà de la table R-86).
- **Tests d'intégrité référentielle** (`tests/techs.test.ts`) : toute `tech` référencée existe ; tout `prereq` existe et le graphe est **sans cycle** (tri de Kahn) ; **index inverse** tech↔items réciproque (y compris merveilles) ; **au départ, seuls Guerrier et Colon sont constructibles** (règle d'Erik gelée par test) ; coût > 0. Ces tests tournent dans la CI à chaque push.
- **Couche de requête** (`src/techs.ts`) : `availableTechs(player)`, `researchable(player)`, `lockedTechs(player)`, `isUnlocked(item, unlocked)`, `prereqsMet`, `productionDataOf(item)`, `itemsUnlockedBy(tech)` — pures, triées (R-81).

### L1 — Moteur (test-first)
- **État joueur** (v5) : `researching`, `scienceProgress` (par technologie), `techsUnlocked`, `scienceStored`. **Migration `schemaVersion` 4→5** additive et idempotente (testée, y compris idempotence et chaîne complète v1→v5).
- **R-85 accumulation** : en Phase C, la science des villes alimente `creditScience` → tech courante ; à coût atteint → `techsUnlocked` + événement **`TechResearched`** + débordement en réserve ; sans choix → réserve `scienceStored`, versée au premier choix (complétion immédiate possible).
- **`SetResearch(techId)`** : `src/research.ts` — `applySetResearch` PURE (clonage, validation : tech existante, non débloquée, prérequis satisfaits) ; changement libre, **progression conservée par technologie**.
- **R-87 déblocage** : `applySetProduction` (moteur) **refuse** tout item verrouillé (tech non débloquée ou `implemented: false`) — triple filtre client/serveur/moteur.
- Les files préexistantes ne sont pas re-filtrées au déblocage (villes valides, test dédié).

### L2 — Serveur
- Contrat `SetResearch` (`packages/shared`), handler GameDO : **action immédiate** traitée à la réception (pas un ordre de tour), persistée, puis **diffusion immédiate aux deux clients** (Snapshot filtré) — visible en temps réel. Autorisée en phase « orders » même verrouillé (le verrouillage porte sur les ordres) ; refusée pendant la résolution.
- `TechResearched` prolonge `lastEvents` (rejoué aux reconnexions via `missedEvents`).
- Snapshot filtré : les nouveaux champs joueur passent par `getFilteredState` sans filtrage supplémentaire (la recherche de l'adversaire reste visible — simplification documentée §4).
- Admin dump à jour (champs de recherche inclus). **Bot** : choisit une tech aléatoire disponible dès qu'il n'a pas de recherche en cours.

### L3 — UI
- **`ResearchPanel.svelte`** : menu depuis la barre supérieure (icône science + progression de la tech courante « Alphabet 8/20 » avec mini-barre) ; liste des techs disponibles (coût, barre de progression, débloquages listés unités/bâtiments/merveilles) ; techs verrouillées **grises avec « Requiert : … »** ; sélection = `SetResearch` ; bandeau « Choisissez une recherche — science en attente : N » si réserve.
- **Production filtrée** (CityPanel) : toutes les unités 7a + bâtiments, items verrouillés **grisés avec « Requiert : <tech> »** ; Espion/Galère non proposés (données seules).
- **Toast + journal** à `TechResearched` (labels `labels.ts`, playback `kind: good`).

### L4 — Assets
- `assets-src/tools/generate.py` : peintres **Archer** (arc + carquois), **Cavalier** (cheval + caparaçon), **Légion** (glaive + scutum, crête), emblèmes **Bibliothèque** (livres) et **Caserne** (tente militaire). Régénérés (30 fichiers entités), `pnpm sync-art` → 47 PNG, `--check` CONFORME, LICENSES.md/palette régénérées.

### L5 — Vérification
- **Scénario e2e moteur** (`tests/research.test.ts`) : réserve → Alphabet → complétion immédiate + `TechResearched` → Bibliothèque constructible → Travail du bronze (racine) → Archer produit et jouable (PM régénérés). ✔ en tests.
- **GUI locale vs bot** : partie créée contre le bot (FEFWQZ), menu de recherche vérifié à la souris (liste complète conforme §8.1, sélection d'Alphabet, barre « Alphabet 0/20 »), fondation/déplacements, fin de tour, résolution. Voir §3 pour les limites.
- **Déploiement prod** : push → CI (`deploy.yml`), vérification en ligne → voir §5.

## 2. Tests
- **271 tests verts sur le workspace** (baseline ~244) : `packages/rules` 200 (+25 : `techs.test.ts` 12, `research.test.ts` 13, citant R-85/R-86/R-87 ; migration v4→5 testée — défauts, idempotence, chaîne complète), `apps/web` 49, `apps/server` 22. `pnpm typecheck` : vert (4/4).
- Tests legacy mis à jour (gel d'états antérieurs) : roster v1 → roster 7a ; 6 → 8 bâtiments ; `CURRENT_SCHEMA_VERSION` 4 → 5 ; R-61 : la science va désormais en réserve (`scienceStored`) sans tech choisie ; e2e économie Phase 6 débloque Poterie/Lettres en amont (R-87).

## 3. Anomalies et points à surveiller (pour Erik)
1. **Science à 0/tour sur villes sans commerce** : avec le curseur 50/50 (T-14) et `floor()`, une ville à 1 commerce produit `floor(0.5)` = **0 science** — la recherche ne progresse pas sur la carte pédagogique (aucune case à commerce à proximité des capitales). Interprétation conservatrice (pas de changement de règle sans validation) ; options : arrondi sup, minimum +1, ou curseur par défaut ≠ 0.5. 🔶 À calibrer.
2. **Clic sur la case de capitale vide** (test local) : le clic sur une case de ville **sans unité** n'a pas sélectionné la ville dans mes essais automatisés ; les clics sur unités/chemins fonctionnent. La manipulation automatisée (sans écran) peut en être la cause — **à confirmer à la souris** ; si le bug se reproduit, la règle « case ville sans unité → selectCity » (interaction.ts règle 4) est à instrumenter.
3. **Progression de l'adversaire visible** : le snapshot diffuse `researching`/`techsUnlocked` de l'adversaire (le brouillard ne filtre que la vision). Civ Rev affiche les techs connues de l'adversaire dans la partie — assumé, mais signalé.
4. **Bibliothèque et Caserne sans effet** : leurs coûts 🔶 (30/20) sont posés, mais leurs effets (science / vétérans dans Civ Rev) ne sont définis nulle part dans RULES.md §8 — constructibles mais inertes en 7a. Décision à prendre pour la suite.

## 4. Interprétations choisies (simples et déterministes)
- **Poterie débloque le Grenier** (table R-86) — corrigé en cours de session (le premier jet l'omettait, attrapé par le test d'index inverse).
- **Mine de fer ← Travail du fer** : ajout du handoff (au-delà de la table R-86 qui ne cite que Légion + Atelier).
- **Débordement de recherche** : reporté en `scienceStored` (la « suivante » n'existe pas tant qu'aucun choix n'est fait) — cohérent avec la règle de réserve R-85.
- **SetResearch autorisé même après verrouillage des ordres** (phase « orders » uniquement) : c'est une action immédiate, pas un ordre.
- **Espion/Galère** : stats posées (0/1/2 — 30 et 1/1/2 — 30, 🔶) uniquement pour compléter les données ; non constructibles.
- **`player.science` (v6, cumul)** : champ conservé pour compat, plus alimenté depuis la 7a (la science va dans la recherche/réserve).

## 5. À tester en ligne par Erik (login OAuth réel)
1. Menu de recherche : progression qui monte à chaque tour sur une vraie partie (vérifier le point §3.1 — science 0/tour si la ville n'a pas de commerce).
2. Changement de recherche en cours de partie : progression conservée par tech.
3. Menu de production : Grenier/Bibliothèque/etc. grisés « Requiert : … » au départ ; déblocage effectif après complétion.
4. Le refus serveur d'un `SetProduction` sur item verrouillé (OrderAck négatif) — côté client les boutons sont déjà désactivés.
5. Toast + entrée de journal à `TechResearched`.
6. Le point §3.2 (clic sur capitale vide) à la souris.

## 6. Captures
- `docs/captures-7a/barre-recherche.png` — barre supérieure avec « Science Alphabet 0/20 ».
- `docs/captures-7a/menu-recherche.png` — menu de recherche ouvert (disponibles + verrouillées).

## 7. Suite logique
Le reste de la Phase 7 : effets des bâtiments Bibliothèque/Caserne (§3.4), merveilles (effets + constructibilité), naval (Galère), Espion, ressources de terrain, suite de l'arbre (2ᵉ colonne du PDF) — en tranches selon les priorités d'Erik.
