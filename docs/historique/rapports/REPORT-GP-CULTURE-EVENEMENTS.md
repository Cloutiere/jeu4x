# REPORT-GP-CULTURE-EVENEMENTS — Culture/GP/événements réalignés sur le vrai CivRev

**Chantier gameplay du chapitre 2D (handoff révisé avec Erik le 13/09 — LE PALIER EST L'ÉVÉNEMENT).** Mission exécutée intégralement (M1+M2+M3). Validation locale en partie solo AVANT tout commit (règle établie) — captures dans `dev-logs/captures-gp-culture/`. **Pas de commit** (sur demande explicite d'Erik).

## 1. Ce qui a été livré

Les trois concepts sont désormais bien séparés :
1. **Culture par ville** (`city.cultureCumulee`) → anneaux culturels R-162 (visual-only, inchangés) ;
2. **Culture de la civilisation** = Σ des `city.cultureCumulee` → franchit les **paliers T-27** (150, 267, 417…), **jamais soustraite** ;
3. **Les 20 événements culturels** = **paliers T-27 + merveilles uniquement** → ONU → victoire culturelle. **Les GP n'y comptent PLUS jamais** (R-126 abrogée).

### M1 — Moteur (packages/rules)

- **D1 — Cumul EMPIRE, jamais soustraite** : nouveau helper pur `cultureEmpireOf(cities, playerId)` (Σ `cultureCumulee`, tri R-81). Le canal GP ne consomme plus rien : l'ancienne jauge par ville `cultureStored` (accumulation + soustraction du seuil) est **supprimée du moteur**.
- **D4 — `player.culturePaliers`** (champ nouveau, migration 22) : nombre de **paliers déjà franchis** — index dans la table canon `greatPersonCultureThresholds` via `greatPersonThresholdFor(culturePaliers)`. Seuls les paliers de culture avancent l'index : les GP de techs, du canal or (R-136), de Confucius (T-43) et des merveilles incrémentent `greatPersonsObtained`/T-30 mais **ne décalent jamais le prochain palier** (verrouillé par tests).
- **D6 — Le palier est l'événement** : en fin de `processEconomy` (après la boucle des villes — le cumul du tour est complet), boucle déterministe par joueur (R-81). Chaque palier franchi = **(a) +1 jalon** (`CultureMilestone`, nouvelle raison `'cultureLevel'`) **PUIS (b) 1 GP spawné** — ordre verrouillé par test ; plusieurs paliers peuvent tomber dans la même résolution. Le multiplicateur de trait R-149 (×0,75 Grèce/Rome) reste appliqué au seuil effectif.
- **D2 — Tirage seedé** : `greatPersonClassTire(rng, greatPersonsByType, greatPersonsObtained)` — tirage **uniforme** parmi les créneaux de figures disponibles (par classe : `figures.length − greatPersonsByType[classe]`, chaque figure ne sort qu'une fois). RNG **dédié** `createRng(rngSeed ^ GP_CULTURE_SEED_SALT)` (miroir artefacts R-154) : n'avance pas le RNG de Phase B, résolution rejouable à l'identique. **Repli déterministe pool vide** : rotation R-80 sur les 6 classes (index = `greatPersonsObtained`). **R-127 (ciblage technologique) ABROGÉE** : `greatPersonClassFor` supprimée, remplacée par `greatPersonRotationClass(index)` pour les octrois hors canal culture (Amérique à la création de carte, Confucius T-43 — rotation pure, plus aucune influence de la tech en cours). `figureClassForTech` reste (Premier découvrir R-109).
- **D3 — Lieu** : `villeLaPlusCultivee(cities, playerId)` — plus haute `cultureCumulee`, tie-break cityId croissant (R-81) ; posé sur la case de la ville sinon adjacente libre (mécanisme existant).
- **D7 — R-126 abrogée** : `spawnGreatPerson` n'émet plus AUCUN jalon (paramètre `countsAsMilestone` supprimé, raison `'obtain'` disparue) ; le **vol d'espion** (R-119) n'échange plus de jalons (les deux émissions `'gpStolen'` supprimées — l'espion vole le GP et ses rendements, pas un point de victoire) ; Settle/Consume n'ont jamais émis (inchangé). Helper dérivé `installedGreatPersonsOf` (jalons − merveilles) supprimé — il n'a plus de sens. **Conséquence consignée** : la suspension ONU « jalons redescendus par vol » disparaît — elle ne peut plus être déclenchée que par la **perte d'une merveille** (capture de la ville hôte) ; la **pénalité ICBM R-140 (−1 jalon 🔶) reste** et tombe sur le total quelle que soit son origine (inchangée).
- **R-116 ONU** : déblocage à 20 jalons et gel de progression inchangés ; seules les causes de suspension sont réduites (D7).
- **Raisons d'événement** (`events.ts`) : `'cultureLevel' | 'wonderBuilt' | 'wonderCaptured' | 'wonderLost' | 'nuke'` (les `'obtain'`/`'install'`/`'gpStolen'` sont retirées du type).

### Ménage D5 + migration

- **`city.cultureStored` SUPPRIMÉ de l'état** (interface `City`, créations de ville dans `fixtures.ts`/`map.ts`/`turn.ts`, payload serveur).
- **`schemaVersion` 21 → 22** (`CURRENT_SCHEMA_VERSION = 22`) : (a) retrait du champ sur chaque ville, (b) additif `players.culturePaliers: 0`. Idempotent ; **les parties en cours reprennent sans erreur** (perte de progression du réservoir v21 assumée — D1 « jamais soustraite » + D5 « rien n'est là pour durer », consignée dans la migration). Pins de tests portés à 22 (rules 15 fichiers, server 1).

### M2 — UI (apps/web)

- **CityPanel** : la jauge de culture est celle de la **CIVILISATION** — cumul EMPIRE (Σ `cultureCumulee` des villes du joueur) vers le **prochain palier T-27**, libellé pédagogique **« Palier 2 : 246 / 267 »** + « 15 culture/tour (cette ville) ». Plus aucune jauge par ville à soustraction (MENU-VILLE réutilisera ce bloc).
- **Compteur X/20** (`Game.svelte`) : tooltip réécrit — « chaque palier de culture de civilisation franchi compte +1, chaque merveille contrôlée compte +1 — les GP n'y comptent PLUS (R-126 abrogée) » avec le détail « N palier(s) + M merveille(s) ». Plus jamais « GP installé ».
- **Journal** : nouvelle étiquette « palier de culture franchi » (`labels.ts`) ; l'ancienne mention « jauge remise à zéro » des `GreatPersonSpawned` est retirée (hot-fix en session, revalidée).

## 2. Vérification

- **Tests** : **1091 verts** (rules 784 — dont **7 nouveaux** dans `tests/gp-culture-evenements.test.ts` couvrant D1 multi-villes/paliers successifs/jamais soustraite, D2 déterminisme + repli, D3 tie-break, D4 neutralité, D5 migration/reprise v21, D6 ordre jalon→GP, D7 vol/settle sans jalon ; web 235 ; server 72). Tests réécrits : culture, phase7g (vol sans échange de jalons, suspension ONU par vol supprimée), phase7j (fusion/tirage, Humanitaire), phase7h/7k/expansion-culturelle (`cultureCumulee`), pins de migration.
- **Typecheck 4/4** ; **zéro diff 3D** (aucun fichier fonderie/3D touché).
- **e2e solo** (partie FDY3DD — France vs bot Espagne, Pangée 40×40, jouée 24 tours dans le navigateur) :
  - Tour 18 : **palier 150 franchi → « +1 jalon culturel (palier de culture franchi) — total 1/20 » PUIS « Grand Artiste / Penseur apparaît dans c1 »** (classe tirée — aléatoire seedé) ; compteur **1/20** au header avec le nouveau tooltip ;
  - Deux **Grands Bâtisseurs** d'accumulateurs (T-30, tours ~10 et ~22) : **aucun jalon émis** — D7 vérifié en jeu (`greatPersonsObtained: 3`, `cultureMilestones: 1`) ;
  - CityPanel : **« Palier 2 : 246 / 267 »** ; état brut : `schemaVersion 22`, `culturePaliers 1`, `cultureCumulee 246` (jamais soustraite), **0 occurrence de `cultureStored`** ;
  - **Reprise d'une partie pré-21** : couverte par tests (fixtures v19 et v21 dégradées, re-migration + résolution sans erreur) — non reproductible en solo sur le serveur de dev (aucun endpoint d'injection d'état), constaté au rapport.
- Captures : `dev-logs/captures-gp-culture/01-compteur-jalons-journal-palier.png`, `02-citypanel-jauge-empire.png`, `03-debug-etat-culturePaliers.png`, `03-etat-brut-extraits.txt`.

## 3. Points d'attention / suites

- **Forme du compteur de paliers** : simple entier `culturePaliers` par joueur (index dans la table) — pas de jauge persistée côté état (le cumul fait foi) ; l'UI dérive la progression du cumul empire.
- **Repli pool vide** : rotation R-80 des 6 classes, déterministe (testé avec compteurs saturés).
- **ICBM R-140** : −1 jalon 🔶 inchangé, s'applique au total (jalons désormais d'origine paliers/merveilles uniquement).
- **Escalade T-30** : inchangée (toute obtention de GP — y compris les GP de palier — incrémente `greatPersonsByType`/`greatPersonsObtained`) ; l'index de palier reste indépendant (D4).
- **Bots** (`bot.mjs`/`botPolicy.ts`) : leurs heuristiques « GP installés ≈ jalons − merveilles » (ciblage de vol) ne sont plus exactes sous D7 (le vol ne rapporte plus de jalon) — laissées telles quelles (pur bot 🔶, aucune erreur), à réviser si Erik le souhaite.
- **Écart libellé** signalé : le journal des `GreatPersonSpawned` des accumulateurs n'indique pas leur canal (culture vs T-30) — distinguable au contexte, non bloquant.
- Périmètre interdit respecté : anneaux R-162, conversions/flip (territoire), canaux or/Confucius/techs, victoire culturelle (20 jalons → ONU), MENU-VILLE, 3D — intouchés.
