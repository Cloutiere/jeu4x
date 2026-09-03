# REPORT-PHASE7H — Gouvernements, GP restants, victoire scientifique

**Statut : complétée et déployée.** R-121..R-125 transcrites dans `RULES.md` §8.7, implémentées moteur/serveur/UI, couvertes par tests citant leur identifiant, migration `schemaVersion` 11→**12** testée, scénario e2e moteur vert, session réelle driver + bot sur wrangler dev, déploiement prod via CI.

## 1. Livrables

### L0 — Règles écrites
- `RULES.md` §8.7 « Gouvernements, GP restants & victoire scientifique » (R-121..R-125), base documentaire : la spec d'Erik [`Gouvernements Civilization Revolution.md`](Gouvernements%20Civilization%20Revolution.md) — valeurs EXACTES (République colon 1 pop, Monarchie palais ×2, Démocratie +50 % or/science, Fondamentalisme +1/+1 terrestre & bibliothèques/universités nulles, Communisme +50 % marteaux & temples/cathédrales nulles).
- Constantes nouvelles : **T-29** `anarchyTurns` = 1 (`governments.json`), **T-30** `greatPersonYieldThresholdBase` = 20 ×2 par GP du type (`culture.json`), **T-31** `leaderGpVictories` = 20 (`culture.json`).

### L1 — Moteur (`packages/rules`)
- **Données** : `governments.json` (6 régimes, effets + libellés UI, calibrage sans code) ; 4 nouveaux GP `units.json` (`scientifique`, `mogul`, `ingenieur`, `leader` — pacifiques 0/0/2, `greatPerson: true`, jamais produits par les files) ; 4 composants du Vaisseau activés (`buildings.json`) ; merveilles activées : **Himeji** (`attackBonusEmpire: 1`), **Grande Pyramide** (`allGovernments`), **Magna Carta** (`tribunalCulturePerTurn: 1`), **Oracle** (`battleForeknowledge`) ; Grande Bibliothèque reste inerte en 1v1 (R-125).
- **`governments.ts`** (nouveau module pur) : `GOVERNMENTS`/`effectsFor`, `isInAnarchy`, `governmentIssue` (tech OU Grande Pyramide), `anarchyFreeAdoption` (fenêtre `techsUnlockedThisTurn`), `landCombatBonus`, `applySetGovernment` (action immédiate pure).
- **Modificateurs** : `conversionGains` (options gouvernement — Démocratie ±50 %, Fondamentalisme bibliothèques nulles), `cultureGains` (Monarchie palais ×2, Communisme temples nuls, Magna Carta +1 avec Tribunal), production ×1,5 Communisme, coût pop Colon 1 République (amende R-112), bonus +1/+1 dans `S_att`/`S_def` + Himeji +1 att empire (`turn.ts`/`combat.ts`), helper `combatOdds` (Oracle, UI).
- **Anarchie (R-122)** : `SetGovernment` manuel → `anarchyUntil = tour + T-29` ; résolution suivante : marteaux/fioles/or/culture à zéro, GP gelés, production gelée ; **refus de SetGovernment pendant l'anarchie** (interprétation tranchée) ; bascule **sans Anarchie** quand la tech du régime vient d'être complétée (`techsUnlockedThisTurn`, réinitialisé à chaque résolution — invitation du conseiller).
- **GP restants (R-123)** : accumulateurs par ville (`gpAccumGold/Science/Prod`), seuil T-30 ×2 par type (`greatPersonsByType`), spawn `spawnGreatPerson` partagé, au plus 1 GP/ville/tour (ordre déterministe culture → science → or → production), Leader à T-31 victoires de combat (`combatVictories` incrémenté à chaque coup fatal R-32, spawn capitale, seuil FIXE), installation = 1 jalon (R-115 inchangée, tous types).
- **Victoire scientifique (R-124)** : les 4 composants contrôlés (dérivés des `city.buildings` — choix documenté) → événement `Launch` → `Victory(reason:'science')`.
- **Événements** : `GovernmentChanged {player, government, anarchy}`, `Launch`, raison `science` ajoutée à `Victory` — filtrés fog (R-73).
- **Migration v11→v12** : joueur `government`/`anarchyUntil`/`greatPersonsByType`/`combatVictories`/`techsUnlockedThisTurn`, ville `gpAccumGold/Science/Prod` — additive, idempotent, testée.

### L2 — Serveur
- Message `SetGovernment` (`@game/shared`), handler GameDO (même contrat que SetResearch/SetConversion — forme validée d'abord, leçon 7f), événement `GovernmentChanged` ajouté au journal diffusé, diffusion immédiate aux deux clients.
- Dump admin : section `gouvernements` (régime, anarchie, GP par type, victoires de combat) + `vaisseau` (4 composants par joueur). `finishedReason: 'science'` supporté.
- **Bot** : adopte République puis Démocratie/Communisme (bascules sans Anarchie uniquement, selon rendements approximés), priorise les composants du vaisseau quand Vol spatial est débloqué, installe ses GP de tous types (chemin 7f existant, étendu aux 4 nouveaux types).

### L3 — UI
- **`GovernmentPanel.svelte`** (nouveau) : 6 régimes avec bonus ET pénalités, verrous « 🔒 tech requise », bouton « Adopter » (avertissement Anarchie / mention « sans Anarchie »), bandeau d'anarchie ; bouton barre supérieure « Gouvernement <régime actif> » + icône portique.
- Bandeau Anarchie sur la carte pendant le tour concerné ; toasts conseiller (complétion d'une tech de gouvernement, changement de régime, lancement du vaisseau).
- **GP restants** : 4 sprites (`unite_scientifique/mogul/ingenieur/leader.png` + accents) via `generate.py` + `sync-art` (LICENSES régénérée) ; bouton d'installation 7f fonctionne pour tous les types ; jauges GP or/science/production par ville (CityPanel, seuil T-30 dynamique).
- **Vaisseau spatial** : section empire (4 composants ✅/⬜) dans la barre latérale ; libellé victoire « scientifique » dans l'overlay.
- **Oracle** : pré-confirmation de combat sur les boutons d'attaque (% de toucher par round, formule exacte §7.4 incluant Fondamentalisme/Himeji/fortification/bâtiments) quand l'empire contrôle l'Oracle non obsolète.

## 2. Vérification

- **Suites** : rules **459** (dont 32 nouveaux `phase7h.test.ts` : R-121..R-125 + migration + e2e), server **34**, web **50** = **543 verts** ; `pnpm typecheck` vert ; `generate.py --check` CONFORME.
- **e2e moteur** (handoff L4-1) : République (colon 1 pop, mesuré 3→2 pop vs 3→1 en despotisme) → Monarchie (palais ×2 mesuré) → Anarchie (tout à zéro, GP gelés, reprise au tour suivant) → Fondamentalisme (+1/+1, bibliothèque nulle) → Communisme (+50 % marteaux, temples nuls) → 4 composants → `Launch` → victoire scientifique ; Himeji (+1 atk via helper pur, mesure déterministe) ; Grande Pyramide (régime sans tech).
- **Session réelle** (wrangler dev, partie MQBMGH) : création depuis l'UI, bot joint, tour résolu, journal propre ; menu de gouvernement affiché (6 régimes, verrous, bonus/pénalités), section Vaisseau visible, dump admin conforme (régime, anarchie, GP par type, vaisseau, `schemaVersion: 12`).
- **Captures** : `dev-logs/captures-7h/menu-gouvernement.png`, `dev-logs/captures-7h/barre-journal-vaisseau.png`.

## 3. Interprétations d'implémentation (signalées)

1. **Anarchie & nourriture** : le doc cite marteaux/fioles/or/culture — la nourriture n'est PAS paralysée (croissance normale pendant l'anarchie).
2. **SetGovernment pendant l'anarchie** : refusé (pas de re-programmation — option simple du handoff, tranchée).
3. **Adoption sans Anarchie** : fenêtre = techs complétées pendant la dernière résolution (`techsUnlockedThisTurn`, reset en tête de `resolveTurn`) — le conseiller invite pendant le tour qui suit la complétion uniquement.
4. **GP gelés en anarchie** : tous types (culture, rendement, Leader).
5. **Leader** : seuil T-31 FIXE (pas de croissance ×2 — le handoff ne le prévoit pas) ; un seul Leader par partie ; spawn sur la capitale (sinon première ville) ; les victoires = coups fatals R-32 (attaquant OU défenseur, villages compris, armées comptent comme leur signataire).
6. **Un GP par ville et par tour** : étendu à TOUS les types (culture → science → or → production, ordre déterministe).
7. **Démocratie +50 %** : appliqué aux gains de conversion (or ET science, y compris résiduel Bibliothèque si présent), round half up, avant l'ajout du bonus empire « premier découvrir » (qui n'est pas multiplié).
8. **Pacifisme démocratique** : hooks posés (`effects.pacifism`) mais sans effet en 1v1 guerre permanente — documenté dans `governments.json` (libellé pénalité) et RULES.md.
9. **Oracle** : la « révélation » affiche la probabilité exacte de toucher par round (formule §7.4 complète) et marque le vainqueur attendu ; le tir seedé reste à la résolution (🔶 simple, documenté).
10. **Composants du vaisseau** : dérivés des bâtiments des villes (pas de compteur joueur) — une capture détruit les composants comme tout bâtiment (R-66), cohérent avec R-124.
11. **Himeji/Fondamentalisme sur les villages** : le bonus d'attaque ne s'applique PAS aux attaques de villages barbares (aligné sur l'exclusion du soutien naval R-118) ; il s'applique à tous les combats d'unités.
12. **Divergence de calibrage des eaux du bot** : le bot choisit Démocratie vs Communisme par une approximation des rendements travaillés (le moteur reste la source de vérité) — documenté dans `bot.mjs`.

## 4. Déploiement

- Commits `20067ed` (feat) + `3f9c751` (docs) + push `main` → CI `deploy.yml` **run #44 : success** (`wrangler deploy --env prod`).
- Vérifications en ligne : serveur prod `https://game-4x-server-prod.erik-ai-studio.workers.dev` → HTTP 200 ; sprites 7h servis (`icone_gouvernement.png`, `unite_scientifique.png`, `unite_leader.png` → 200). Le stub `/auth/dev` est désactivé en prod (Google OAuth uniquement — attendu) : la vérification interactive en ligne (menu de gouvernement, anarchie, vaisseau) est à faire par Erik via son login Google — liste ci-dessous.

## 5. Vérifications en ligne pour Erik

1. Ouvrir une partie → bouton « Gouvernement — Despotisme » dans la barre supérieure : 6 régimes, verrous, bonus/pénalités, avertissement Anarchie.
2. Après la complétion de Code des lois / Monarchie / Démocratie / Religion / Communisme : toast du conseiller + bouton « Adopter » SANS Anarchie pendant un tour.
3. Changement manuel : bandeau ⚔️ ANARCHIE au tour suivant (or/fioles/marteaux/culture figés), régime actif ensuite.
4. Jauges GP (science/or/production) dans le menu de ville ; installation des 4 types de GP = +1 jalon.
5. Tech Vol spatial → 4 composants produisibles ; section « Vaisseau spatial » ; à 4/4 : toast de lancement + victoire scientifique.
6. Merveilles : Himeji (+1 atk), Grande Pyramide (régimes sans tech), Magna Carta (Tribunal +1 culture), Oracle (édition des % sur les boutons d'attaque).

## 6. Suite

**7i — Civilisations & traits de départ, rush-buy, contre-espionnage, ICBM/SDI, Grande Muraille** ; puis **Phase 8 — polish, équilibrage & esthétique**. En suspens à cadrer par Erik : conversion culturelle/territoire, D2 culture-ressources, sauts technologiques, Banque mondiale (20 000 or — mécanique non écrite).
