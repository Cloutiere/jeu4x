# HANDOFF-CANON-SIEGE — Le canon siège d'Erik : fin de la garnison immortelle

**Statut : prêt — NON LANCÉ.** Décisions votées par Erik le 31/10 à l'issue de l'audit du siège (26 combats adjacents, 0 chute ; garnison mathématiquement immortelle : bonus ~+95-145 % cumulés ET soin +2 PV/tour en ville pendant que l'assiégeant a HealRefused). **Fixes 1, 2a et 2b validés tels quels ; T-03 (échanges par attaque > 1) en RÉSERVE** — on l'examinera aux résultats du banc.

## 0. Préalables

1. `RULES.md` : R-51 (math de combat), R-71 (soins, révisée ORDRES-UNITES), R-173..R-178 (ENGAGEMENT), R-175 (fortification persistante — le texte devra être amendé, voir L3) ; lecture de l'audit : `turn.ts:1122-1132` (conditions bonus), `turn.ts:1001-1017` (Fortify), `turn.ts:2542-2562` (Heal, taux ligne 2557), `turn.ts:2437-2441` (HealRefused R-162), `turn.ts:5358-5362` (Fortify lève Heal — le miroir à implémenter), `data/terrain.json` (bonus ville 0,5), `constants.ts:10` (`CITY_DEFENSE_BONUS = 0.25` défini JAMAIS importé — la révision T-02 du 26/10 non branchée).
2. ⚠ **C'est du MOTEUR** — le périmètre habituellement interdit est ici ouvert SUR CES TROIS FIXES SEULEMENT, votés par Erik (il fait foi sur toute valeur du jeu). Tout autre changement de règle repasse par lui.
3. Discipline : tests FIRST, bancs bot gratuits (40×3, stash avant/après), banc Jev UNIQUE ≤ 0,50 $ (les 10 seeds), suites jev-port via `vitest.jev.config.ts`, banc via tsx, `CityRazed` ≠ `CityCaptured` au mètre (exclure barbares), computeVisibleTiles sur unités.

## 1. Les trois fixes (défauts tranchés — déjà votés, ne rien étendre)

- **FIX 1 — brancher la révision T-02 oubliée** : bonus défensif de la case VILLE 0,5 → **0,25**. Un seul endroit : `data/terrain.json` (`ville.defenseBonus`). ⚠ vérifier qu'aucun autre data ou code ne durcit 0,5 pour la ville (la constante `CITY_DEFENSE_BONUS` de constants.ts:10 reste morte OU devient la source unique — choisir la source unique data-driven et le consigner).
- **FIX 2a — le soin lève la fortification** (miroir exact du `turn.ts:5358-5362` existant) : la pose d'un ordre `Heal` met `fortified = false` (et l'unité doit re-fortifier pour retrouver le +10 %, la perdant à chaque re-soumission de Heal). R-175 amendée : la fortification persiste « tant que l'unité est en vie, demeure et N'EST PAS en soin ».
- **FIX 2b — soin 1 PV/tour partout** : `turn.ts:2557` → `heal = 1` (la ville ne soigne plus plus vite que la campagne). La règle « 2 en ville » disparaît ; R-71 amendée en conséquence. HealRefused (R-162, assiégeant dans les anneaux) inchangé — l'asymétrie qui reste est canon : le défenseur peut soigner, l'assiégeant non, mais à 1 PV/tour et jamais fortifié en même temps.
- **Intouchés** : T-03 (`EXCHANGES_PER_ATTACK = 1`, en réserve) ; Palais +35 %, Remparts +50 %, vétérans ×1,5, Grande Muraille (blocage), barbares (jamais de Heal), R-59 (distance), R-177 (séquentiel), R-162, condition « ville sans défenseur » pour la capture, `schemaVersion` 28 (⚠ si les tests moteur exigent un bump de version de sauvegarde pour les états persistés, le justifier et le consigner — sinon ne pas toucher).

## 2. Mission L0→L4

- **L0** : préalables, suites vertes (server 401, sableuse 140, jev-port 30, rules 1101) ; `git status` propre.
- **L1 — Tests FIRST (rules)** : FIX 1 (bonus ville lu = 0,25 au calcul de `combatStrengthsOf`) ; FIX 2a (Heal posé sur une unité fortifiée → `fortified === false` ET soin actif ; Fortify sur unité en soin → soin levé, déjà vert, non-régression ; l'unité perd le +10 % le tour du soin) ; FIX 2b (+1 PV/tour en ville comme en campagne ; HealRefused inchangé). Mettre à jour les tests verrouillant les anciennes valeurs (les trouver par grep des valeurs 2/0,5 dans les tests moteur et d'engagement).
- **L2 — Effet math consigné** : recalculer le scénario de l'audit (6 guerriers vs piquier en capitale fortifiée+Palais) AVANT/APRÈS — le rapport doit montrer les nouvelles probabilités (attendu : défense ~4,7 → guerrier ~4,7 %, chevalier ~42 %, et 0 régénération sous siège). C'est la preuve que le canon « elle cède sauf écrasement » tient.
- **L3 — RULES.md** : amender R-71 (1 PV partout), R-175 (fortification lève le soin / le soin lève la fortification, exclusivité bilatérale), et la valeur du bonus ville (T-02 ENFIN appliquée) — courts, à la façon du dépôt.
- **L4 — Bancs** : (a) bancs bot 40×3 gratuits avant/après (stash) : les villes doivent tomber PLUS VITE en guerre bot vs bot (consigné) sans collapse (aucune difficulté où les bots s'effondrent — si un profil s'effondre, le consigner pour Erik, ne PAS retoucher les valeurs) ; (b) banc Jev UNIQUE ≤ 0,50 $ (10 seeds) : tableau vs TB-SIEGE (même mètre `analyse-tbsiege.py`) — captures de capitales (50 % → attendu ≥), victoires (2/10 → LE critère ≥ 4/10 si le siège était le verrou), percée, stériles, 0 guerre avant rencontre, fondations ≥ 2,5. Suites complètes, commit + push, rapport `REPORT-CANON-SIEGE.md` (fixes, maths avant/après, deux bancs, verdict T-03 en réserve : nécessaire ou non).

## 3. Critères d'acceptation

1. Les trois fixes actifs et prouvés aux tests ; R-71/R-175/T-02 amendées ; source unique data-driven pour le bonus ville ;
2. Banc Jev : victoires ≥ 4/10 OU diagnostic chiffré montrant que le verrou suivant est ailleurs (alors Erik tranche : activer T-03 ou recalibrer) ;
3. Bancs bot sans collapse ; suites toutes vertes ; chaque capture attribuable au transcript.

## 4. Périmètre interdit

Tout autre changement de règle (T-03, R-59, Palais, Remparts, vétérans, Grande Muraille, capture) : INTERDIT sans verdict Erik. Jev/harnais (aucune question ni seuil ne bouge), bots tactique (front A de TB-SIEGE vient d'être livré — non touché), Zii, client. Jamais de secret ni de fichier non tracké d'Erik ; pas de mini-rebanc Jev hors verdict Erik en session.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : examen des résultats du banc avec Erik (T-03 en réserve), puis T3 (à cadrer).
