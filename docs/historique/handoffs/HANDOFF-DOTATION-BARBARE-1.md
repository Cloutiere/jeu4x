# HANDOFF-DOTATION-BARBARE-1 — Dotation initiale des camps barbares : 3 → 1 (calibrage Erik 02/10)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` R-96 (T-50 dotation, rév. BARBARES-PILES gardien+satellites), `HANDOFF.md` §4. **L'ÉDITION JSON EST DÉJÀ FAITE** (pilot, sur dictée d'Erik) : `packages/rules/src/data/barbares.json` :: `initialUnits: 3 → 1`. Ta mission : **adapter les tests et la documentation, prouver les suites vertes, livrer**. **2D uniquement. AUCUN autre changement** — ni moteur, ni valeurs additionnelles (T-18=15 et T-50=1 sont les calibres voulus d'Erik, ne les retouche pas).

## 1. Contexte du calibrage (intention Erik)

Les camps barbares engendraient trop vite et se défendaient trop fort au départ. Deux calibrages successifs : **T-18 spawnInterval 10 → 15** (déjà livré, commit `a188fa0`) et **T-50 initialUnits 3 → 1** (cette mission) : **un camp ne se défend au début qu'avec SON GARDIEN seul** (plus de satellites de dotation) ; le réengendrement (toutes les 15 tours, jusqu'au cap T-22 = 3) reprend ensuite son rôle quand les barbares meurent.

## 2. État actuel

- JSON édité (non committé) ; **6 tests en échec** dans `packages/rules/tests/barbares.test.ts` — tous construits autour de la dotation 3 :
  1. **R-99** : constante `initialUnits` attendue 3 → attendre 1 ;
  2. **R-97 gardien/satellites** : plus de satellites de dotation — réécrire le scénario (gardien seul tient le camp ; un satellite peut être simulé par spawn T-18 si le comportement IA doit être testé) ;
  3. **R-96 hors cycle (tours 1-14)** : compte attendu 3 → 1 ;
  4. **R-96/T-22 « la dotation (3) ATTEINT le cap »** : obsolète — la dotation (1) est SOUS le cap : réécrire (respawn au tour 15 → 2 barbares, tour 30 → 3 = cap atteint, puis plus rien sans mort) ;
  5. **L4.1 scénario e2e** (village → attaque → hutte → destruction → rasement → défaite) : construit sur la dotation 3 — **l'adapter pour qu'il redevienne déterministe avec la dotation 1** (si l'enchaînement rasement/défaite exige plus de barbares, les provoquer par des réengendrements ou des unités barbares posées dans le fixture — l'état de campagne est un fixture, l'injecter explicitement est légitime) ;
  6. **Placements villages/huttes** : compteurs `spawnedUnits` initiaux attendus 3 → 1.
- ⚠️ Les tests hors barbares qui posent des barbares via `makeState`/fixtures peuvent aussi dépendre de la dotation : **lancer les suites COMPLÈTES** (rules, server, web) et adapter toute assertion de compte liée à la dotation initiale — sans affaiblir : les comportements testés (assaut un-par-un, cap, agression) doivent rester couverts, éventuellement via unités barbares injectées dans les fixtures.

## 3. Mission

1. Adapter les 6 tests + tout test transversal affecté (comportements préservés, valeurs mises à jour ou scénarios réécrits) ;
2. **RULES.md R-96** : réaligner la ligne T-50 (« dotation initiale = 1 gardien, plus de satellites de dotation — calibrage Erik 02/10 » ; les satellites restent possibles via réengendrement jusqu'au cap 3) et la table T-50 ;
3. Suites complètes vertes (rules + server + web) ×2, typecheck ;
4. Commit (JSON + tests + RULES) — Erik a déjà dicté la valeur, commit direct après suites vertes, puis push (CI déploie).

## 4. Critères d'acceptation
1. `initialUnits: 1` en place ; suites complètes vertes ×2.
2. Les comportements clés restent couverts : gardien tient le camp, assaut de pile un-par-un, cap T-22=3 par réengendrement, agression rayon 2.
3. RULES.md aligné ; zéro autre changement (ni moteur, ni valeurs, ni UI).

## 5. Périmètre interdit
- Toute autre valeur de `barbares.json` ; le code de spawn/IA ; l'UI ; la sableuse ; le protocole.
