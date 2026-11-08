# HANDOFF-T3-ONU — T3 : la Grande Muraille impose la paix (+ fiches victoires à jour)

**Statut : prêt — LANCABLE.** Tranchés votés par Erik le 31/10 : **D1 VETOÉ** (les 20 jalons RESTENT le prérequis de l'ONU — conséquence : la victoire ONU immédiate à l'achèvement existe DÉJÀ dans le moteur, verrou culture `b43f298` ; AUCUN changement moteur côté ONU) ; **D2 VALIDÉ** dans sa version complète (ci-dessous) ; **Banque mondiale : 20 000 CONFIRMÉ** (R-137 inchangée — la mécanique existe déjà : trésorerie < 20 000 → chantier verrouillé ; achèvement = victoire économique immédiate, or non débité). Contexte : chapitre conquête fonctionnellement clos ; la variance victoires se tranche au corpus élargi de cette mission (D5).

## 0. Préalables

1. `RULES.md` : R-116 (culture/ONU — INCHANGÉE, le veto D1 la confirme), R-128 (Grande Muraille — à AMENDER, c'est le cœur de la mission), R-137 (Banque mondiale — confirmée, INTACTE), R-124 (science — INTACTE) ;
2. Code : `packages/rules/src/turn.ts` (contrôle `blocksEnemyAttacks` ~l.1600-1617/1766/1778-1781 : c'est une gate d'ATTAQUE — la nouvelle règle y ajoute la dimension DIPLOMATIQUE ; `completeWonder` — le point d'ancrage de la paix rétroactive ; `DeclareWar` côté diplomatie/serveur), `condense.mjs`/`joueur.ts` (bloc `victoire` — expose déjà les merveilles de victoire ; vérifier que la Muraille y est lisible), `botPolicy.ts` (course ONU B1 — INCHANGÉE, le seuil 16 jalons reste valide puisque les jalons restent), client (fiche merveille, toasts) ;
3. Discipline : tests FIRST (moteur), bancs bot gratuits, **banc Jev UNIQUE ≤ 0,60 $ sur 20 SEEDS** (corpus élargi, D5), banc via tsx, jev-port via config dédiée, suites complètes avant push, pas de mini-rebanc hors verdict Erik en session.

## 1. La règle D2 (votée — la mission)

**Grande Muraille « impose la paix »** tant qu'elle est debout (jusqu'à `obsoleteBy: ingenierie`) :
- **(a) Refus de déclaration** : `DeclareWar` REFUSÉ contre le propriétaire (raison explicite, même style que `AttackRefused reason:'paix'` — nouveau motif `grande_muraille`) ;
- **(b) Paix rétroactive à l'achèvement** : quand la merveille est achevée, les guerres en cours contre le propriétaire prennent fin immédiatement — paix imposée, événement PUBLIC (même canal que `PeaceAccepted`, motif `grande_muraille`), non négociée, gratuite pour tous les belligérants concernés ;
- **(c) Barbares non concernés** (ils ignorent la diplomatie — la gate d'attaque existante `blocksEnemyAttacks` reste telle quelle pour eux et pour tout le reste : la Muraille conserve son effet d'interdiction d'ATTAQUE actuel en parallèle) ;
- **(d) Obsolescence** : à `ingenierie`, la protection (a)+(b) disparaît (les guerres redeviennent déclarables) — l'effet d'attaque existant s'arrête déjà là, cohérence.
- **Intouchés** : ONU (jalons + victoire immédiate : TELS QUELS), Banque mondiale 20 000 (confirmée), science, domination, élimination/forfait, barbares razed, Angkor/anti-rush, `schemaVersion` 28 (consigner : événement public de paix imposée = données nouvelles dans les events, pas dans l'état persisté — si un test exige un bump, le justifier).

## 2. Mission L0→L4

- **L0** : préalables, suites vertes (rules 1114, server 401, sableuse 154, jev-port 30).
- **L1 — Tests FIRST (moteur + serveur)** : `DeclareWar` contre le propriétaire d'une Grande Muraille debout → refus motif `grande_muraille` ; à l'achèvement → chaque guerre en cours contre le propriétaire terminée (paix imposée, événement public lu par les deux camps) ; en guerre + Muraille achevée par un TIERS → rien pour les autres paires ; obsolescence Ingénierie → déclaration à nouveau possible ; barbares non concernés (razed toujours possible) ; gate d'attaque `blocksEnemyAttacks` inchangée ; ONU/Banque/science/domination inchangés (tests de non-régression) ; bloc condensé lisible (la Muraille et son propriétaire visibles si c'est déjà le cas des autres merveilles — sinon ajouter au bloc victoire, port TS bit-à-bit + tests croisés jev-port).
- **L2 — RULES.md** : R-128 amendée (impose la paix : refus de déclaration + paix rétroactive à l'achèvement, barbares exclus, fin à Ingénierie) ; R-116/R-137 confirmées (note « veto Erik 31/10 »).
- **L3 — Client** : fiche Grande Muraille (« Impose la paix — déclaration de guerre impossible contre son propriétaire ; achevée, elle met fin aux guerres en cours. Obsolète : Ingénierie ») ; toast de paix imposée ; fiche ONU clarifiée (« Achèvement avec 20 jalons culturels = victoire culturelle immédiate » — D1 veto : clarification d'affichage SEULEMENT). Captures locales avant commit.
- **L4 — Bancs + suites complètes** : bancs bot 40×3 avant/après (zéro soft-lock : la paix imposée ne doit pas créer de blocage permanent des guerres bot — surveiller les tours moyens) ; banc Jev UNIQUE ≤ 0,60 $ sur **20 seeds** (mètre `analyse-tbsiege.py`) : le tableau tranche LA VARIANCE (victoires Jev sur 20 parties — fourchette annoncée au rapport) ; parties finies par ONU/Muraille/Banque consignées ; conquête en non-régression. Suites, commit + push, rapport `REPORT-T3-ONU.md` (règle, tests, bancs, verdict variance).

## 3. Critères d'acceptation

1. La règle D2 active et prouvée aux tests ; RULES amendée ; client à jour ; ONU/Banque/science intouchés (veto D1 et confirmation 20 000 respectés) ;
2. Banc Jev 20 seeds : variance TRANCHÉE (victoires sur 20, fourchette) ; zéro soft-lock bot ;
3. Suites toutes vertes ; `schemaVersion` 28 ; budget ≤ 0,60 $ ; chaque paix imposée attribuable au transcript (événement + tour + paires).

## 4. Périmètre interdit

Toute autre mervelle/règle de victoire (D1 veto : NE PAS toucher aux jalons, au `cultureVictory`, ni à `treasuryRequired`) ; la chaîne conquête Jev (questions v8, déclaration mécanique : INTACTES) ; bots tactique (course ONU B1 : INTACTE — les jalons restent) ; Zii ; jamais de secret ni de fichier non tracké d'Erik.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : PROJET.md (chapitre victoires : 5 voies complètes), file restante : miroir Jev vs Jev (backlog), atelier voix de Zii, vieux 🔶.
