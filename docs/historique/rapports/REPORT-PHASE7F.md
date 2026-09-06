# RAPPORT — Phase 7f : Culture (tranche 1)

**Statut : complétée et déployée.** R-113..R-116 transcrites dans `RULES.md` §8.5, implémentées moteur/serveur/UI, couvertes par tests citant leur identifiant, migration `schemaVersion` 9→10 testée, e2e moteur + GUI locale vs bot réalisés, déploiement prod via CI.

## Livrables

### L0 — Règles écrites (`RULES.md` §8.5, test-first)
- **R-113 · Rendement culturel** : Palais +1 🔶/tour (capitale, `culturePerTurn` en données) + Temple +1/citoyen + Cathédrale +2/citoyen (`culturePerCitizen`) + bonus empire `perCity.culture` (R-109 : Religion/Imprimerie **activées**) ; **Stonehenge ×1,5** 🔶 la part Temple/Cathédrale tant qu'il n'est pas obsolète (Littératie). Scalaire sur la démographie (20 pop × Cathédrale = 40 🔶, exemple du doc d'Erik testé). Accumulation **par ville** (`city.cultureStored`).
- **R-114 · Personnages illustres** : au seuil **T-27** (base 🔶 20, **×2** par GP obtenu **par l'empire** — `greatPersonsObtained`), un GP pacifique 0/0/2 (`greatPerson: true`) apparaît — **Artiste/Penseur en alternance déterministe** 🔶 — sur la case de ville (sinon adjacente libre, perdu si aucune) ; événement `GreatPersonSpawned` ; jauge remise à zéro **par soustraction du seuil** (miroir R-63) ; au plus un GP par ville et par tour ; jamais productibles (`isProducible` les exclut — moteur, UI, bot).
- **R-115 · Installation et jalons** : ordre **`InstallPerson {unitId, cityId}`** (Phase C) — GP sur/adjacent à sa ville, consommé, **+1 jalon** (`player.cultureMilestones`), événements `InstallPerson` + `CultureMilestone`. **Merveille contrôlée = 1 jalon** (dynamique) : +1 construction/capture, −1 perte/rasement ; les merveilles **survivent à la capture** (`city.wonders`, transférées au captreur — contrairement aux bâtiments R-66).
- **R-116 · Nations Unies & victoire culturelle** : merveille **unique à l'empire**, coût **T-28 🔶 300** (`nations_unies.cost`), **verrouillée < 20 jalons** (`wonderProductionIssue`, moteur + UI + bot), **non accélérable** (aucune mécanique d'accélération GP n'existe), **suspendue** (progression gelée, marteaux conservés 🔶) si les jalons retombent sous 20, complétion → **`Victory(reason:'culture')`**.
- Constantes : `culture.json` (T-27 base 20, croissance ×2, 20 jalons — R-99 : calibrage par édition) ; T-28 = `wonders.json`.

### L1 — Moteur (`packages/rules`, pur et déterministe)
- **`culture.ts`** (nouveau) : `cultureGains` (source unique moteur/UI), `greatPersonThresholdFor`, `greatPersonTypeFor` (alternance), `isWonderObsolete` (R-110 appliquée aux merveilles), `wonderProductionIssue` (unicité d'empire, chantier en cours, jalons ONU, obsolescence), `wondersOwnedBy`.
- **`turn.ts`** : rendement culturel en Phase C + spawn GP (case ville sinon adjacente, tri R-81) ; **Colosse** = commerce brut ×2 avant conversion R-90 ; complétion de merveille (jalon, `WonderCompleted`, **Jardins +50 % pop** arrondi au plus proche + citoyens auto-assignés, **ONU → victoire**) ; suspension ONU ; `applyInstallPerson` ; transfert/perte des jalons aux captures/rasements (`processCityCaptures`).
- **Données** : `units.json` (+artiste, +penseur), `wonders.json` (4 merveilles `implemented: true` avec champs d'effets data-driven `templeCultureMult`/`commerceMult`/`populationGainPct`/`cultureVictory` ; ONU 500→**300**), `buildings.json` (Palais `culturePerTurn: 1`), `techs.json` (perCity culture Religion/Imprimerie activées), `culture.json` (nouveau).
- **`ProductionItem.kind: 'wonder'`** ; `canSetProduction` refuse les GP ; validation d'empire des merveilles dans `applySetProduction` (avec exclusion de la ville demanderesse pour la re-soumission).
- **Migration v9→v10** : `city.cultureStored: 0`, `city.wonders: []`, `player.cultureMilestones: 0`, `player.greatPersonsObtained: 0` — additive, idempotente, testée (valeurs existantes conservées).
- Événements : `GreatPersonSpawned`, `InstallPerson`, `CultureMilestone {player, delta, total, reason}`, `WonderCompleted` ; `Victory.reason` +`'culture'` ; refs de brouillard complétées.
- **Tests** : `tests/culture.test.ts` (21 tests, R-113..R-116 cités : scalaires, seuil croissant, alternance, spawn/position, refus de production de GP, installation + refus, dynamique des merveilles, unicité, verrou/suspension/victoire ONU, Colosse, obsolescence Stonehenge, migration, **2 e2e complets** — victoire culturelle et suspension par capture) ; `data.test.ts` (+GP, +culture.json) ; `techs.test.ts` (4 merveilles activées, T-28=300, R-87 exclut les GP) ; `state.test.ts`/`forfeit`/`economy`/`conversion`/`research` mis à jour v10.

### L2 — Serveur
- `orderShapeError` : `InstallPerson` + **kind `'wonder'`** (bug découvert au e2e GUI — voir « Interprétations & écarts ») ; `orderOwnerError` : unité ET ville possédées ; `GameMeta.finishedReason` +`'culture'` (dérivé de l'événement `Victory`) ; dump admin enrichi d'un résumé **`culture`** (jalons, GP, seuil courant, merveilles, chantiers).
- **Bot** : installe ses GP dès qu'ils sont sur/adjacent à une ville amie ; produit les merveilles (filtre R-87 + unicité + obsolescence) ; **vise l'ONU à 20 jalons** (priorité en tête de tirage) ; exclut les GP des productions. **Vérifié en partie réelle : le bot a engendré puis installé son GP** (jalon p2 au journal).

### L3 — UI + assets
- **Panneau de ville** : jauge de culture (accumulé/seuil T-27, culture/tour, icône lyre) ; puces « Merveilles (+1 jalon chacune) » ; section **« Produire — merveilles »** (4 merveilles, ONU verrouillée « Requiert : 20 jalons culturels (X/20) » — même validation `wonderProductionIssue` que le moteur).
- **Barre supérieure** : compteur **X/20** avec détail au survol (GP installés + merveilles — dérivés de l'état, source unique).
- **GP sur la carte** : sprites Artiste (palette/béret) et Penseur (livre/laurier) — placeholders PixiJS + assets `generate.py` (accent joueur) ; bouton **« S'installer dans c1 (+1 jalon) »** dans le panneau d'unité quand un GP ami est sur/adjacent à une ville amie.
- **Toasts/journal** : libellés fr des 4 nouveaux événements + motif de victoire culturelle ; annonce « Nations Unies disponibles ! » au passage de 20 jalons et « ONU SUSPENDUES » si retombée (dérivés du compteur, aucun nouvel événement requis) ; fx/`DURATIONS`/`TOAST_KINDS` complétés.
- **Assets** : `generate.py` — `unite_artiste`, `unite_penseur` (256×320), `batiment_nations_unies` (224×256), `icone_culture` (64×64) + accents ; `--check` CONFORME ; `sync-art` (122 fichiers) ; LICENSES régénérées.

### L4 — Vérification
1. **e2e moteur** (dans `culture.test.ts`) : capitale + Temple → culture accumulée → GP au seuil → installation → jalon → ONU débloquée à 20 jalons (fixture d'accélération) → complétion → **Victory(culture)** ; second e2e : capture d'une ville hôte de merveille pendant le chantier → jalon perdu → **ONU suspendue** (progression gelée).
2. **GUI locale vs bot** (vite + wrangler dev + navigateur automatisé, partie `DT4VUM`, carte pédagogique, ~60 tours réels) :
   - jauge de culture visible et accumulante (1/tour, Palais) ;
   - **GP Artiste apparu au tour 20** au seuil 20 🔶 (jauge remise à zéro) ; **installé à la souris** (sélection canvas → bouton « S'installer ») → **1/20** à la barre ;
   - **Stonehenge construit** via la file de production (+1 jalon → **2/20**), chip merveille visible, `WonderCompleted` au journal ;
   - **2e GP (Penseur) apparu au tour 60** (seuil 40, alternance) et installé → **3/20** ;
   - ONU verrouillée avec compteur live « (3/20) » ;
   - le **bot a engendré puis installé son propre GP** (jalon p2) et joue normalement ;
   - captures dans `dev-logs/captures-7f/` (GP sélectionné + bouton, barre 1/20 + journal, panneau ville + Stonehenge + ONU verrouillée).
3. **Déploiement** : commit + push main → CI `deploy.yml` (build, tests, typecheck, `wrangler deploy --env prod`) — voir « Points à vérifier en ligne ».

## Interprétations & écarts (signalés)

1. **Alternance Artiste/Penseur** 🔶 : le handoff offrait « alternance déterministe ou tirage seedé » — alternance retenue (Artiste d'abord, index = compteur avant incrément) : simple, sans tir RNG (la graine ne quitte pas la Phase B/ouvertures de huttes), lisibilité parfaite. Un tirage seedé serait un changement local dans `greatPersonTypeFor`.
2. **Jauge remise à zéro** : interprétée « par soustraction du seuil » (le surplus est conservé, miroir R-63/nourriture) — au plus un GP par ville et par tour. Le texte « remise à zéro » pouvait se lire « perte du surplus ».
3. **Stonehenge ×1,5** s'applique à la part `culturePerCitizen` (lignée Temple/Cathédrale — la Cathédrale « remplace le Temple ») : ni le Palais ni le bonus d'empire ne sont multipliés 🔶.
4. **GP perdu sans case libre** (ville encerclée) : comme l'unité gratuite des huttes (R-98) — interprétation documentée, le seuil est quand même consommé et le compteur incrémenté 🔶.
5. **Jalons des GP installés définitifs** : aucune perte (capture de la ville hôte ne les retire pas) — le vol par Espion (7g) sera la seule perte, conforme au doc d'Erik.
6. **Culture accumulée conservée à la capture** de ville (comme les merveilles) ; la file et la conversion, elles, sont réinitialisées (R-65).
7. **Double complétion concurrente d'une merveille** (deux villes de l'empire en chantier) : première arrivée compte, seconde no-op documenté.
8. **Obsolescence des merveilles appliquée** (Stonehenge par Littératie) : effet retiré ET retrait du menu, exemplaires bâtis conservent jalon + jauge — R-110 disait « effets 7f » ; c'était cette tranche.
9. **BUG CORRIGÉ (découvert au e2e GUI)** : `orderShapeError` (GameDO) refusait `kind: 'wonder'` à la SOUMISSION — les merveilles n'entraient jamais en file depuis le client malgré un moteur correct. Corrigé + test de non-régression (`orderShape.test.ts`), le validateur est exporté (pur).
10. **Libellé « Requiert » des merveilles** : `wonderProductionIssue` renvoie l'id technique brut (`travail_du_bronze`) pour le verrou par tech — mineur, à libelliser fr en 7g (`TECHS[tech]?.name`).

## Points à vérifier en ligne (Erik)

1. **Parties en cours migrées v10** : culture/jalons/GP à zéro — vérifier qu'aucune régression d'état.
2. **T-27 = 20 / ×2, ONU 300** 🔶 : rythme ressenti (un GP « palais seul » = 20 tours — long ; le Temple est quasi indispensable).
3. **ONU non accélérable** : rien à accélérer tant que le Constructeur n'existe pas (7h) — règle déjà verrouillée côté données.
4. **Suspension ONU** : tester en ligne une capture de ville hôte de merveille pendant un chantier.
5. **Alternance Artiste/Penseur** 🔶 : go/tirage seedé à la place ?

## Suites prévues

**7g — Naval & Espionnage** (le vol de GP par espions rejoindra les jalons — interaction prévue dans `CultureMilestone.reason`) · **7h — Gouvernements, Civilisations & merveilles** (mods gouvernementaux du rendement culturel : Monarchie ×2 Palais, Communisme coupe Temples/Cathédrales — hooks data-driven déjà en place) · points en suspens d'Erik : **conversion culturelle/territoire**, **D2 culture-ressources** (Encens/Soie — champ `culture` déjà porté par `resources.json`).
