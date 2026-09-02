# REPORT-PHASE7D.md — Barbares & huttes livrés (R-95 à R-99)

Date : 01/09/2026 (soir). Exécution de [`HANDOFF-PHASE7D.md`](HANDOFF-PHASE7D.md) — dernier
prérequis de la génération procédurale (6b). Les règles ont été transcrites dans
[`RULES.md`](RULES.md) §7.9 (R-95..R-99, T-18..T-26), implémentées test-first dans le
moteur, exposées côté serveur, rendues côté client, et déployées.

## 1. Résultats

- **`pnpm test` : 387 tests verts** (310 rules / 50 web / 27 server — baseline 336, **+51**).
  `pnpm typecheck` et `pnpm build` verts partout.
- **Déploiement** (convention 7b/7c) : push → CI `Deploy` → prod vérifiée (voir §7).
- **Vérification GUI locale vs bot** : campagne réelle de ~40 tours sur carte Variée
  (partie `FB7VVN`) — barbares engendrés au tour 3, convergence, guerre d'attrition contre
  une unité fortifiée, vétérans des deux camps, rotations de renforts produits par la
  capitale. Captures : `docs/captures-7d/`.

## 2. Livrables

### L0 — Règles écrites (RULES.md §7.9)

- **R-95 · Faction barbare** : pseudo-joueur `barbarien` (constante `BARBARIAN_ID`),
  absent de `state.players` (aucun trésor, aucune recherche, **aucun forfait T-06**),
  en guerre permanente avec tout le monde (`areAtWar`), soumis à toutes les règles de
  combat/repli/fog, **n'ouvre pas les huttes**, butin de capture non crédité (pas de
  trésor), escalade guerrier → archer après `T-23` (tour 15).
- **R-96 · Villages barbares** : entités de carte (`villages`), 3 par carte, attaquables
  (`T-21` = 3 PV, défense 🔶 `villageDefense` = 1 de `barbares.json`), engendrement
  toutes les `T-18` tours (compteur `spawnCountdown`, premier au tour 3), cap
  `T-22` = 2 unités vivantes/village, destruction → `T-20` = 25 or + événements
  `VillageDestroyed`/`BootyGold`.
- **R-97 · IA déterministe** : `barbarianOrders(state)` — fonction pure appelée en tête
  de `resolveTurn` ; priorités 1) attaque adjacente, 2) pas vers l'ennemi le plus proche
  dans `T-19` = 6 (tie-breaks R-81), 3) tenir. Capture barbare d'une ville sans
  défenseur → **rasement** (`CityRazed`) ; capitale rasée → `Victory('razedCapital')`
  au profit de l'adversaire réel (les barbares ne gagnent jamais).
- **R-98 · Huttes bonus** : 2 par carte ; ouverture à l'entrée (Phase A), une seule fois ;
  récompense tirée au RNG seedé dans `huttes.json` : or `T-25`-`T-26` (15-50), unité
  gratuite (guerrier), science `T-24` = 20, révélation rayon 3 (ajout à `explored`),
  embuscade (2 barbares adjacents), rien — événement `HutOpened` dans tous les cas.
- **R-99 · Données de calibrage** : `barbares.json` + `huttes.json` — zéro durcissement
  de règle dans le code ; `constants.ts` ré-exporte T-18..T-26 ; tests d'intégrité.

### L1 — Moteur

- `barbares.ts` (nouveau) : `barbarianOrders`, `barbarianUnitType`, `createBarbarianUnit`,
  `drawHutReward`, `freeSpawnTiles`.
- `state.ts` : `BarbarianVillage`/`Hut`, champs `villages`/`huts`/`mapId`,
  `isBarbarian()`, `areAtWar` (guerre permanente barbares), **schemaVersion 7 → 8**
  (migration additive + test d'idempotence) ; serveur : `applyMapEntities` enrichit les
  états migrés v7 depuis la carte (`meta.settings.mapId`).
- `turn.ts` : fusion des ordres barbares en tête de résolution ; entrée sur village
  (R-57 transposé, unité pacifique capturée I-4) ; plans `villageAttack` (le village
  subit les rounds R-51 sans riposter, repli R-52/R-54/R-56) ; `processVillages`
  (Phase C) ; rasement dans `processCityCaptures` ; ouverture des huttes à chaque pas
  de mouvement (gold/unit/science `creditScience`/reveal `explored`/ambush).
- `events.ts` : `BarbarianSpawned`, `VillageDestroyed`, `CityRazed`, `HutOpened(reward)`,
  `Victory.reason += 'razedCapital'`, `BootyGold` élargi (`sourceVillageId`).
- `map.ts` : `villages`/`huts` dans le JSON + validations `parseMap` (praticable, hors
  capitale, unicité village/hutte — ressources AUTORISÉES sous un village, CivRev) ;
  ids `v{n}`/`h{n}` par (q,r) croissant.
- `fog.ts` : villages/huttes diffusés dès que la case est **explorée** (entités statiques,
  L3.3 du handoff) ; invisibles sinon.
- **Interactions L1.5/L1.6 testées** : collision barbare/civilisation (R-53 normale,
  sans dégât) ; aucun ordre `Fortify` généré (impossible de fortifier) ; forfait T-06
  non affecté (barbares hors `players`) ; soins R-71 ; vétérans R-32 ; anti-triche
  (l'état filtré ne montre ni barbares hors vision ni villages/huttes inexplorés ; les
  ordres barbares ne sont jamais persistés ni diffusés ; journal filtré) ; idempotence
  R-80 bit à bit avec villages/huttes/barbares.

### L2 — Serveur

- **Zéro changement de protocole** (les barbares vivent dans `resolveTurn`).
- `GameDO.ensureLoaded` : enrichissement des états migrés v7 (villages/huttes/mapId
  depuis `meta.settings.mapId`) — testé (état v7 simulé → enrichi au chargement).
- Admin dump : résumé `barbares` (villages avec hp/spawnCountdown/unités vivantes, huttes).
- **Asynchrone vérifié par test** : résolution déclenchée par UN SEUL joueur verrouillé +
  échéance du timer (alarme) — les villages engendrent, l'IA barbare joue, l'état reste
  cohérent, et **aucune unité barbare ne fuit vers les clients** (fog).

### L3 — UI

- Sprites via `generate.py` (+4 entités, `--check` CONFORME) : `unite_barbare_guerrier`,
  `unite_barbare_archer` (256×320), `village_barbare`, `hutte` (224×256) ; `sync-art`
  (78 fichiers).
- Rendu : barbares avec sprites dédiés + **accent gris-brun** (`PLAYER_COLORS.barbarien`,
  ni rouge ni bleu) ; villages (barre de PV T-21) et huttes comme entités ennemies avec
  fog appliqué (teinte atténuée hors du champ visible).
- Toasts/journal : libellés FR pour les 4 nouveaux événements (`hutRewardLabel`),
  durées de playback, effets (destroy/good/bad). Victoire `razedCapital` libellée.

### L4 — Vérification

- **Scénario e2e seedé complet** (`tests/barbares.test.ts` §L4.1) : engendrement T-18 au
  tour 3 → barbare attaque l'unité adjacente → hutte ouverte (les 6 récompenses, une
  graine chacune) → village détruit + or T-20 → ville sans défenseur rasée → capitale
  rasée → `Victory('razedCapital')` + défaite — invariants R-30 vérifiés en fin de partie.
- **GUI locale vs bot** : campagne ~40 tours (variee) — voir §4.
- README moteur mis à jour (structure, traçabilité R-95..R-99, migrations v8).

## 3. Erratum & interprétations (signalées pour validation)

1. **Erratum T-22/T-24 (handoff)** : le texte de R-96 citait `T-24` pour le cap par
   village, la liste des constantes `T-22`. Normalisé **T-22 = capPerVillage** ;
   T-24 affecté au boost science des huttes (`hutScienceBoost` = 20, valeur non fournie
   dans le handoff — 🔶 à calibrer). Idem : T-25/T-26 (bornes or 15-50) et les poids de
   la table de récompenses (30/20/15/15/10/10) n'étaient pas chiffrés — choix 🔶
   documentés, éditables sans code.
2. **Engendrement sur case ADJACENTE** (et non sur la case du village) : un barbare
   engendré sur sa case de village s'y campait (priorité « attaquer adjacent ») et
   rendait le village inexpugnable. L'engendrement adjacent (tri (q,r), report si
   aucune case libre) est documenté dans R-96.
3. **Halte X-2 non applicable aux barbares** : sans record joueur, leur `initialVisible`
   était vide → tout sighting gelifait leurs ordres (ils ne bougeaient jamais).
   R-95 amended : les barbares ne subissent pas la halte (ordres régénérés à chaque
   résolution).
4. **Bug préexistant corrigé (R-30)** : deux collisions sur la même case avec le même
   détenteur perdant attribuaient la case aux DEUX challengers (tie-break « moins de
   cases parcourues » favorisant les challengers n'ayant pas bougé) — co-location
   dans l'état final, observée en campagne locale. Correctif : une case gagnée par
   `winnerTakesTile` ne peut être attribuée qu'une fois (premier attributaire dans
   l'ordre R-56) — test de régression ajouté.
5. **Ouverture de hutte** : uniquement lors d'un **pas de mouvement** (replis et
   collisions gagnantes n'ouvrent pas) ; une hutte sous ennemi s'ouvre à l'entrée,
   avant le combat planifié ; le RNG est consommé dès la Phase A (amendement de R-80
   documenté dans RULES.md §10).
6. **Barbares vs huttes/économie** : capture d'un pacifique par un barbare = destruction
   SANS butin (pas de trésor) ; l'escalade R-95 s'applique aux embuscades ; l'unité
   gratuite des huttes est toujours un guerrier (table R-98).
7. **Villages sur ressources autorisés** (CivRev : « always on top of a resource ») —
   les placements variee s'ancrent sur la paire de soie.

## 4. GUI locale vs bot (observations de campagne)

Campagne variee (~40 tours) : engendrement au tour 3 observé (3 villages), convergence
des barbares dans le rayon d'aggro T-19, guerre d'attrition contre une unité fortifiée
(les assaillants perdent ~75 % des rounds contre fortifié + ville), vétérans obtenus des
DEUX côtés (R-32), renforts produits par la capitale et montée en ligne. Captures dans
`docs/captures-7d/` : `barbares-en-approche-tour9.png`, `attaque-barbare-tour10.png`,
`fortifie-assaillie-tour11.png`, `variee-fortifie-assaillee.png`, `offensive-village.png`.

**Non capturé en GUI** : les toasts `VillageDestroyed`/`HutOpened` — le siège du village
variee (défenseurs régénérés toutes les 3 tours, cap 2) n'a pas été mené à terme en
temps de session ; ces deux mécanismes sont **intégralement couverts par le scénario e2e
moteur** (L4.1, déterministe) et par les tests serveur (dump admin des compteurs).

**Observation de calibrage 🔶 pour Erik** : sur `pedagogique-40` et `pangee-40`, les 3
villages forment un cluster central → 6 barbares convergent en un seul front dès
qu'une unité approche ; une économie de début de partie (1 guerrier, production
~1-2/tour) ne peut pas percer ce bloc. Sur `variee-40`, le village isolé (2 barbares
max) est affrontable seul. Options : espacer les clusters (édition des cartes),
réduire `capPerVillage`, ou augmenter `spawnInterval` — tout est en données (R-99).

## 5. Limites connues

- Les barbares restent terrestres (naval interdit cette session) ; `hexLine` sans
  pathfinding : un obstacle infranchissable sur la ligne d'aggro fait tenir l'unité
  (premier pas alternatif réducteur de distance si existant).
- La case d'une ville rasée garde le terrain `'ville'` (rendements 2/1/1) — considéré
  comme ruines ; à calibrer plus tard si souhaité.
- Un attaquant campant sur la case d'un village vivant bloque son engendrement
  (case occupée → report) et le village ne peut être attaqué qu'en ré-entrant —
  cohérent avec le modèle « village défendu » (R-57 transposé).

## 6. Périmètre interdit — respecté

Génération procédurale (6b — prochaine phase), naval, merveilles, culture (D2),
engagements multi-participants, diplomaties : non touchés. `spawnWeight` des
ressources toujours réservé à 6b.

## 7. Déploiement

Push → CI `Deploy` → prod `https://game-4x-server-prod.erik-ai-studio.workers.dev`
vérifiée (assets `unite_barbare_guerrier.png`, `village_barbare.png`, `hutte.png`
servis ; nouvelle partie = villages/huttes présentes, migration v8 appliquée).
