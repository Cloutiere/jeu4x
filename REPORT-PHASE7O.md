# REPORT-PHASE7O — Artefacts (reliques)

**Date :** 04/09/2026 · **Commit :** `89dd447` · **Tests :** 796 verts (695 règles + 63 web + 38 serveur) · **Typecheck :** vert · **`schemaVersion` :** 17 → **18**

---

## 1. Livré

Base documentaire : la spécification d'Erik [`Artefacts Dans Civilization Revolution.md`](Artefacts%20Dans%20Civilization%20Revolution.md) (**elle fait foi**) + `RULES.md` §7.10 (**R-151..R-156** — écrites en tête de phase, test-first). Périmètre canon respecté : **les 6 artefacts du jeu de base** ; les 6 DLC sont en données (`dlcOnly: true`), **jamais générés** (test).

- **L0 — RULES.md** : section §7.10 (génération R-151, placement R-152, activation R-153, catalogue/effets R-154, détection R-155, données/migration R-156) + constantes **T-38..T-43**.
- **L1 — Moteur** (`packages/rules/src/artefacts.ts`, ~700 lignes, pur et déterministe) :
  - **Tirage** R-151 : sans remise parmi le pool, **RNG dédié** `(seed ^ 0x5f3759df)` — même seed → même tirage **et même placement** (rejouable) ; le RNG de résolution n'est **pas consommé** ; **Atlantide toujours tirée** 🔶 ; count **4** 🔶 (borné 3–6).
  - **Placement** R-152 : composantes de terre (BFS) → **îles ≤ 5 cases** 🔶 à **≥ 6 des deux départs** 🔶, sinon continent (≤ **2** 🔶, sauf plancher canon de 3), classées par **équidistance** (min-distance aux deux départs, décroissante) puis (q, r) — R-81 ; **Atlantide** : `ocean` à **≥ 2 de toute terre** 🔶 (repli : l'eau la plus éloignée de la terre) ; espacement ≥ **4** 🔶 entre artefacts.
  - **Activation** R-153 : appel `activateArtefactAt` après **chaque pas de mouvement** (miroir exact des 4 sites `openHutAt`) ; entrée sur la case pour les terrestres ; **Atlantide : unité navale à distance ≤ 1** (entrée comprise, aucun débarquement) ; barbares exclus (R-95 transposé) ; une seule fois (artefact retiré de l'état).
  - **Les 6 effets** R-154 (voir §2) + **`ChooseWonder`** (action immédiate — Angkor) ; **indice de hutte** `artefact_indice` (R-155) ; **Vol Spatial révèle la carte entière** au chercheur (hook dans `creditScience` — toute complétion, miroir de la révélation Premier découvrir R-109) ; `freeSpawnTiles` exclut les cases d'artefacts (une unité qui **apparaît** n'active pas — seule l'entrée active).
  - **progen** : les artefacts sont posés **à la génération** (portés par `MapData.artefacts` — labo, export JSON, dump admin) ; les **cartes fixes** sont tirées par seed à la création d'état (mêmes algorithmes, mêmes données) ; rapport progen : ligne `artefacts` dans `counts`.
- **L2 — Serveur** : message `ChooseWonder { cityId, wonderId }` (protocole) + handler GameDO (contrat `SetGovernment` : action immédiate, autorisée verrouillé, refusée en résolution, journal prolongé) ; fog : artefacts inexplorés **absents de l'état diffusé** + **pings de présence** `artifactPings` (case seule, sans identité) + choix Angkor **privés** ; dump admin : section `artefacts` (**générés / restants / activés** — générés rejoués depuis carte+seed — et choix Angkor en attente) ; **migration 17 → 18** additive (`artefacts: []`, `pendingArtefactChoices: []` — idempotente, testée).
- **L3 — UI + assets** : **6 sprites dédiés** (`generate.py` : 12 PNG `artefact_<id>[_accent].png` + `sync-art`, fallbacks programmatiques distincts dans `textures.ts`) ; rendu carte dans `GameCanvas` (fog identique huttes, accent doré) ; **tooltip** « Artefact : <nom> » ; **lueur de survol** 🔶 sur les cases masquées à artefact (ping — canon du « bourdonnement », audio différé) ; toasts/journal (`ArtifactActivated` : fx case + toast ; libellé d'effet complet par artefact) ; **modale Angkor** (choix merveille + ville, « Décider plus tard », tooltip d'effet des merveilles) ; labo `#/progen` : ligne **« Artefacts (7o) »** au checksum + artefacts rendus/exportés.
- **L4 — Vérification** : 37 tests moteurs (`phase7o.test.ts` — chaque test cite R-xx) + e2e **serveur réel** `apps/server/src/artefact-e2e.mjs` (2 clients stub + dump admin : tirage seedé, fog/pings, **marche de 28 tours, activation par entrée, disparition pour les deux joueurs, Angkor → ChooseWonder → Colosse posé + jalon**) ; GUI vs bot sur 5174 (création Variée/Espagne vs bot Zoulous, tour résolu) ; captures `dev-logs/captures-7o/` ; CI deploy au push.

## 2. Les 6 effets (R-154 — conformité tableau du handoff)

| Artefact | Implémentation | Test |
|---|---|---|
| **Angkor Wat** | Activation → `pendingArtefactChoices` (aucun effet immédiat) ; action `ChooseWonder` : merveille **non construite n'importe où** (R-129), **non obsolète** (R-128, union des techs), implémentée, **hors victoire/stratégique** 🔶 (ONU, Banque mondiale, Manhattan) ; ville amie quelconque ; pose avec complétion canonique (jalon R-131, effets R-132 — Jardins, Oxford, Apollo, Léonard ; chantiers concurrents → récupération R-130) | pending, pose + jalon, refus ×5, liste UI triée |
| **Arche d'Alliance** | Chaque ville du découvreur : sans Temple/Cathédrale → **Temple** ; avec Temple → **Cathédrale** (remplacement R-111) ; Cathédrale intacte ; villes adverses épargnées | BuildingCompleted par ville |
| **Sept Cités d'Or** | **200/250/300/400** selon l'ère persistée (T-41) → trésorerie ; **×2 Espagne** (`tresorsDouble` — même multiplicateur que les huttes, hook R-146) ; libellé du trait mis à jour (les artefacts ne sont plus « phase suivante ») | ère Antique 200, Moderne 400, Espagne 400 |
| **École de Confucius** | **3 GP** par **rotation pure R-127** (`greatPersonClassFor(null, greatPersonsObtained + i)`) posés à la capitale (sinon cité, case libre adjacente — R-30) ; **sans jalon** (miroir C2) ; escalade T-27/T-30 alimentée (+3) | 3 spawns, classes distinctes, compteurs |
| **Chevaliers Templiers** | Unité par ère : **chevalier/chevalier/canon/char d'assaut** (T-42) ; **remplacement par l'unique** (R-148 — Espagne + Féodalité → Conquistador) ; vétérans de trait (Allemagne) ; posé sur la case de l'artefact (occupée par l'activateur → adjacente libre) | ère table, Conquistador |
| **Cité Perdue d'Atlantide** | **3 techs les moins coûteuses non débloquées** — pool = tout l'arbre non connu (pas de filtre de prérequis), tri **coût puis id** (R-81, test de tri déterministe) ; octroi direct (**ni `firstBy` ni Premier découvrir**) ; la tech **en cours** fait partie du pool (recherche libérée, sans surplus) ; arbre complet → artefact consommé sans effet | tri exact, researching libéré, no-tech |

## 3. Interprétations d'implémentation (documentées, veto Erik possible)

1. **« Symétrie miroir garantie » (R-152) 🔶** : les artefacts étant **uniques** (deux Atlantides violeraient R-151), la duplication miroir des villages/huttes est impossible. L'équité miroir s'applique au **choix des cases** : classement par **équidistance aux deux départs** (aucun déséquilibre structurel entre P1 et P2). Le terrain/ressources/villages/huttes restent strictement miroirs (inchangés).
2. **`islandMaxSize` 5** 🔶 (le « 3 » initial ne trouvait aucune île candidate sur les seeds d'archipel testés — le canon « îles isolées » couvre des îlots de 1-5 cases).
3. **Count FIXE 4** 🔶 (pas de tirage du nombre) ; sur une carte **sans îles candidates**, les artefacts terrestres tombent sur le continent au plus **2** (rare, canon) puis retombent à **3** si le plancher canon l'exige — le canon « 3 à 6 » tient toujours (test).
4. **Angkor 🔶** : 3 merveilles **non proposées** (ONU/Banque mondiale/Manhattan — leurs verrous dynamiques R-116/R-137/R-138 seraient contournés par un octroi gratuit). Les **effets de complétion R-132 sont appliqués** : Oxford tire au RNG **dérivé de `rngSeed` en lecture seule** (la graine de résolution n'avance jamais hors Phase B — R-80).
5. **Atlantide — pas de filtre de prérequis** : « les 3 technologies les moins coûteuses **non débloquées** » (handoff) lue littéralement ; la « manipulation » du doc (chercher les techs bon marché avant d'approcher) est préservée par construction (test du tri).
6. **Atlantide — distance ≤ 1** : entrer **sur** la case océane active aussi (cas limite) ; une unité **terrestre** adjacente n'active jamais ; le **débarquement seul n'active pas** (miroir des interprétations huttes R-98).
7. **Ping de survol 🔶** : le canon révèle la **présence** au survol (bourdonnement) — l'état diffusé porte donc `artifactPings` (case seule, **jamais l'identité** ni l'effet) ; l'UI montre une lueur dorée discrète au survol. Note anti-triche : c'est une fuite volontaire de présence, canon-fidèle ; un client hacké verrait des « points d'intérêt », pas les artefacts.
8. **Indice de hutte 🔶** : **une seule entrée** de table (poids 8, `reveal` 15→12 pour équilibrer) ; l'effet (nombre restant **ou** position du plus proche de la hutte) est tiré **50/50 au RNG** de la résolution (amendement R-80, Phase A — comme toute récompense) ; une position révélée **ajoute la case à `explored`** (marqueur persistant — le canon dit « affiche brièvement », notre toast étant éphémère, la case révélée garantit la lisibilité).
9. **Confucius — rotation pure** 🔶 : le ciblage « figure de la tech en cours » (R-127) donnerait 3 GP de la MÊME classe d'un coup ; l'artefact utilise la rotation seule (indices successifs) — variété canon.
10. **Vol Spatial** : la révélation s'applique à **toute complétion** de la tech (le canon dit « l'obtention » — pas seulement le Premier découvrir, qui conserve en plus sa récompense R-109 existante).
11. **Migration 17→18** : les parties migrées n'ont **aucun artefact** (ils naissent à la création de carte) — aucun enrichissement rétroactif, idempotent (test).
12. **Spawn sur artefact** : les unités engendrées (huttes, villages) n'aboutissent jamais sur une case d'artefact (`freeSpawnTiles` exclue) ; une unité **produite en ville** pourrait théoriquement s'y poser sans activer (cas non atteint en pratique — documenté).

## 4. Écarts/constats de vérification

- **Bug attrapé par les tests** (corrigé) : les pings de survol étaient calculés **après** le filtrage des artefacts — toujours vides. Dérivés maintenant de la liste complète **avant** filtrage.
- **pangee-40** : les artefacts terrestres tombent **toujours** sur les îlots de bordure (cases extrêmes, équidistance maximale) — canon « priorité insulaire » mais sur cette carte aucune relique n'est joignable à pied ; l'e2e terrestre utilise donc **variee-40** (reliques continentales, reachable). Sur les cartes **procédurales archipel** (défaut), le mix insulaire/continental est naturel.
- **Coordonnées de fixtures** : la rangée 9 d'une carte 12×10 couvre q ∈ [−4..7] — un artefact de test posé en (11,9) était **hors carte** (leçon : les fixtures offset exigent des coordonnées axiales réelles).
- **Doublons de `case` dans `eventLabel`** (FirstDiscovered/Victory) : warning esbuild **préexistant** (deux switchs distincts), non touché.

## 5. 🔶 À calibrer (édition `artefacts.json` / `huttes.json` + push)

- `count` **4** (canon 3–6) ; `atlantisAlwaysDrawn` **true**.
- Placement : `islandMaxSize` **5**, `minDistanceToCapitals` **6**, `maxMainland` **2**, `spacing` **4**, `atlantisMinLandDistance` **2**.
- Sept Cités d'Or : **200/250/300/400** (T-41).
- Templiers : **chevalier/chevalier/canon/char d'assaut** (T-42).
- Confucius **3 GP** ; Atlantide **3 techs** (T-43).
- Indice hutte : `indicePositionChance` **0,5** ; poids `artefact_indice` **8** (`huttes.json`).
- Angkor : liste fermée des merveilles non proposées (3 — code, déplacer en données si besoin d'édition).

## 6. À vérifier en ligne par Erik (login OAuth — stub coupé en prod)

1. **Labo `#/progen`** : ligne « Artefacts (7o) » au checksum ; artefacts visibles sur la carte (sprite doré) + tooltip au survol ; l'export JSON les porte.
2. **En partie** : les reliques apparaissent sur les cases **explorées** ; les cases masquées à artefact montrent une **lueur dorée au survol** (discret) ; le toast/journal « Artefact « … » activé » détaille l'effet.
3. **Activation terrestre** : marcher sur une relique (e2e local : 28 tours sur Variée) — disparition pour les deux joueurs.
4. **Atlantide** : amener un **Galion** (haute mer) **adjacent** à la relique — les 3 techs les moins chères tombent (toast) ; la tech en cours est libérée si visée.
5. **Modale Angkor** : après activation, choix **merveille + ville** (« Décider plus tard » possible ; merveilles à victoire absentes) — canvas non validé en automatisation (rAF absent), à voir en ligne.
6. **Espagne** : Sept Cités d'Or → **400** (ère Antique, ×2).
7. **Vol Spatial** : compléter la tech → la carte entière apparaît (artefacts restants visibles).
8. **Migration** : reprendre une partie créée avant 7o — aucun artefact (normal, aucun crash).

## 7. Reste à faire (hors périmètre 7o — déjà consigné)

- Périmètre interdit respecté : **DLC** (données seules), **spike visuel 3D** (prochain chantier), **thème nanotechnologique** (doc d'Erik attendu), **espionnage avancé** (dernier), territoire/flip, promotions/XP — rien n'a été touché.
- Note de dépôt : un document **« Refonte Cybernétique De Civilization Revolution.md »** (non suivi) est apparu à la racine — très probablement le rapport nanotechnologique d'Erik ; **non committé** (hors périmètre, au pilot d'en disposer), de même que `prototypes/` (non suivi, préexistant).

## 8. Environnement & incidents de session (transparence)

- **Port 5174 occupé** par un Vite périmé (piège connu du handoff) : processus tué, serveur relancé — vérifier `dev-logs/web7o.log` en cas de doute. Le Vite local écoute sur **[::1]** (IPv6) : `curl 127.0.0.1:5174` échoue, `localhost` fonctionne.
- Les captures GUI ont été prises malgré l'absence de rAF (miroir 7n) : le canvas Pixi ne se rend pas dans le navigateur intégré — la validation visuelle finale (sprites en jeu, lueur de survol) reste à faire **par Erik en ligne** (§6).
- Le bot GUI a quitté normalement après sa participation (script borné) ; la partie de test locale VEUDFP reste en dev (hors prod).

## 9. Arrêt

Phase 7o livrée, poussée, CI deploy au push. Prochaines étapes planifiées : **spike visuel 3D** (2.5D isométrique via generate.py vs Three.js — cadrage), puis **thème nanotechnologique** (attendre le doc d'Erik), **espionnage avancé en dernier**.
