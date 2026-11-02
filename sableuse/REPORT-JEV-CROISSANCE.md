# REPORT-JEV-CROISSANCE — Fenêtre de fondation rouverte + banc de confirmation

**Livré (commit de ce push).** Mission de calibrage DATA + confirmation (HANDOFF-JEV-CROISSANCE, Erik 02/11). Un seul changement : `configCondense.gainSite` (data, harnais + port TS bit-à-bit) — logique, `cibleEcrasement`, questions v9, moteur : INTACTS.

## 1. L1 — Localisation + recalcul (le tableau qui a validé les valeurs AVANT de dépenser 1 $)

`gainSite` vit côté **harnais** : `sableuse/src/condense.mjs` (`configCondense.gainSite`, consommé par `gainNetSite` → `sitesCorrects` dans `src/joueur.mjs`), port TS bit-à-bit `apps/server/src/jev/condense.ts`. **Les bots classiques ne le lisent jamais** (ils passent par `botPolicy`/`sitesFondation`-moteur via `penaliteDistanceSite`, constante distincte, inchangée).

Méthode : script `sableuse/devtmp/recalcul-gainsite.mjs` — rejoue 3 seeds du corpus via `jouerPartie` avec le client FAUX (gratuit, trajectoire fidèle y compris diplomatie), échantillonne l'état filtré à t50/t100/t200/t300, compte `sitesCorrects` sous chaque variante (comptage PUR — `configCondense` muté entre les comptages). Instrumentation harnais minime ajoutée : paramètre `sonde` optionnel de `jouerPartie` (null par défaut, jamais utilisé par les bancs réels).

**Sites corrects (t50;t100;t200;t300)** — null = partie déjà finie avant ce tour :

| variante | seed 214915776 | seed 3538506724 | seed 3947827986 |
|---|---|---|---|
| V0 témoin (pd=2, c=0,5/0,25) | 0,0,—,— | 0,0,0,5 | 0,0,0,— |
| V1 pd=1 | 3,5,—,— | 2,5,0,5 | 1,5,5,— |
| **V2 pd=1 + couronnes 0,75/0,375** | **5,5,—,—** | **5,5,5,5** | **5,5,5,—** |
| V3 pd=1 + maturité 0,85 | 4,5,—,— | 5,5,2,5 | 5,5,5,— |

Le verrou du banc stratege est reproduit en V0 : **0 site correct dès t50-t100**. V1 (le levier fort seul) se referme encore à t200 (seed 3538506724). **V2 est le seul jeu ≥ 3 sites jusqu'à t300 sur tous les seeds** → retenu. `risque` INCHANGÉ (D1) ; V3 consigné comme repli si le banc décevait.

Le calcul à la main (plaine pure, 1 rendement/tuile) : ancien `0,65×(0,5×6+0,25×12) − 2d = 3,9 − 2d` → positif SEULEMENT à distance ≤ 1 ; nouveau `0,65×(0,75×6+0,375×12) − d = 5,85 − d` → positif jusqu'à distance 5. La fenêtre passe de « la case à côté » à « 5 cases ».

## 2. L2 — Tests + banc bot

- Tests FIRST (`sableuse/tests/croissance.test.mjs`, 5 verts, rouges 2/5 avant l'application) : verrou de valeur (pd=1, 0,75/0,375, risque 3 intouché, maturité 0,65 gelée), garde « seuil logique intouché » (`seuilRentable ≤ 2`), fenêtre ouverte à d3/d5 vs fermée à d2 sous l'ancien calibrage, `sitesCorrects ≥ 3` au tour 1 sur seed réel.
- Parité config bit à bit ajoutée à jev-port (**36 verts**).
- **2 re-cals consignés** : (a) `v3.test.mjs` — artefacts flottants des parts 0,75/0,375, `toBe` → `toBeCloseTo` (au dixième, l'arrondi du condensé) ; (b) `joueur.test.mjs` D2 — le test était **VACUEUX** sous l'ancien calibrage (0 candidat sur la fixture, jamais exécuté) ; il tourne maintenant et son attente du 1ᵉʳ tour ne correspondait plus au canon actuel (le SetProduction du colon part du tour SUIVANT via le memo — re-émission anti-écrasement). Recalé sur le canon, logique intacte.
- Banc bot 40×3 AVANT/APRÈS (agrégats `devtmp/banc-bot-td-APRES-croissance.json` vs `-APRES-tbsiege.json`) : villes 1,83-1,95 (bande historique), tours 125-137 — **zéro drift, zéro collapse**, conforme à l'analyse (les bots ne lisent pas `configCondense`).

Suites AVANT push : sableuse **203** / jev-port **36** / server **401** / web **712** / svelte-check 0 erreur / typechecks rules+server verts.

## 3. L3 — Banc UNIQUE `bancs/joueur-croissance-2026-11-02` (vanilla, plafond 600, les 5 seeds du banc stratege COMPLÈTES)

**0,6387 $ ≤ 1,00 $, 0 erreur API, 5/5 parties complètes.**

| partie | seed | fin | victoire | villes Jev (fondations) | techs Jev vs bot | déclarations Jev |
|---|---|---|---|---|---|---|
| 1 | 3538506724 | **t332** | **science** | 4 (5) | 46 vs 2 | 0 |
| 2 | 3947827986 | t369 | **science** | 4 (4) | 46 vs 2 | 0 |
| 3 | 2121991107 | t51 | razedCapital ⚠ | 3 (4) | 0 vs 0 | 0 |
| 4 | 3802591813 | t316 | **science** | 6 (6) | 46 vs 2 | 0 |
| 5 | 214915776 | t310 | **science** | 8 (8) | 46 vs 2 | 0 |

- **Expansion : 5,4 fondations/partie, 5,0 villes finales (vs 2,0 au banc stratege — cible ≥ 4 ATTEINTE)** ✓. La fenêtre calibrée tient jusqu'au bout (8 fondations partie 5, contre 0-1 sites corrects au témoin).
- **Partie 1 TRANCHE** : elle FINIT — victoire science t332 (le plafond 600 n'est même pas atteint). Le correctif D-B bis n'a pas eu à jouer (voir ci-dessous).
- **Non-régression ✓** : 5 victoires / 5 parties (le banc stratege avait 3/4 finies). Temps science nettement plus court (t310-369 vs t425-473) — l'expansion paie la science.
- ⚠ **Partie 3 (anomalie à consigner)** : victoire `razedCapital` t51 — la capitale du bot a été rasée **par les barbares** (`byPlayer:'barbarien'`, CityRazed seq 465), la règle de victoire attribue à Jev. Pas une victoire Jev. (Sa propre ville c3 a aussi été rasée par les barbares 2 événements plus tard.)

## 4. Écrasement : 0 déclaration — pourquoi, chiffré

**Aucune déclaration Jev (aucun motif) dans les 5 parties.** La cause est structurelle et ne concerne PAS le correctif D-B bis :

- le bot p2 déclare la guerre **t11-18** dans les 5 parties (au moment de la déclaration, `rapportForces` = 0-1 — Jev est encore faible) ;
- Jev passe alors TOUTE la partie `enGuerre: true` (vérifié au dernier tour de chaque partie) ;
- `cibleEcrasement` exclut par CONCEPTION les rivaux déjà en guerre (on ne déclare pas deux fois la guerre) — la branche écrasement est donc **structurellement muette quand le bot déclare tôt**, exactement comme l'était `cibleGuerreTotale` au banc decisionnel. Le correctif D-B bis reste prouvé aux tests (cas reconstitué) ; il n'a simplement aucune occasion de tirer ici.
- Les guerres sont de plus STÉRILES en partie 1/2/4/5 : `guerresInterNations: []` (0 combat) — 320+ tours de guerre nominale sans un seul échange, pendant que Jev gagne par la science. Partie 3 : 7 CombatExchange seulement.

**Le verrou suivant est donc le couple guerre précoce du bot × guerre stérile** : tant que le bot déclare t11-18, aucune branche de déclaration Jev (domination, écrasement, espace) ne peut s'exercer, et la guerre déclarée ne produit pas de combat. Leviers candidats pour Erik (CHIFFRÉS, NON APPLIQUÉS — D2/D4) :

1. **Trancher la guerre stérile** : si `enGuerre` depuis N tours avec 0 bataille et rapport ≥ seuil, soit chercher la PAIX (grille T2 déjà prête), soit convertir en ASSAUTS (la marche/siège existent — c'est la décision qui manque, proche du verrou décisionnel 7/10 déjà diagnostiqué) ;
2. **La branche écrasement ne peut pas voir ce cas** — une extension « guerre stérile → objectif capitale » serait une NOUVELLE mécanique (pas un calibrage), à cadrer avant tout codage ;
3. Scission de config (banc Jev vs prod) : sans objet ici — l'effet bot est nul par construction et prouvé au banc 40×3.

## 5. Verdict demandé à Erik

1. **Expansion : cible atteinte** (5,4/partie ≥ 4) — le chapitre croissance peut se clôturer ;
2. **Écrasement : critère non atteint, cause structurelle chiffrée (§4)** — le rapport propose les leviers sans les appliquer ;
3. Anomalie partie 3 (victoire attribuée après raze barbare) — nouvelle règle moteur à cadrer séparément si tu veux la trancher.

Fin de session : rapport + arrêt + remise de la main.
