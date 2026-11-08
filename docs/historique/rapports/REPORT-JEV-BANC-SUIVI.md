# REPORT-JEV-BANC-SUIVI — banc ciblé grèce, siège-vs-civ, maturité (29/09)

Mission exécutée d'après `HANDOFF-JEV-BANC-SUIVI.md` (feu vert Erik 29/09). Outil HORS LIGNE — zéro changement moteur/serveur/jeu. **Aucune valeur de règle modifiée** hormis le facteur de maturité de la sableuse, re-calibré et gelé (D4, prévu par la mission). **RIEN N'EST COMMITTÉ — arrêt pour approbation (L3).**

## D1 — `siegeJev` branché et testé

Le point §5 du V4 était exact : `partie.mjs` accepte `engineJev` depuis V4, mais `banc.mjs` ne le passait jamais — Jev jouait toujours p2 quel que soit le siège annoncé du plan. Correctif : `banc.mjs` passe désormais `engineJev: 'p' + p.siegeJev` (contrôle → `undefined`, comportement harnais par défaut inchangé, rétro-compat bancs précédents). Test fixture nouveau : sur un plan à 2 parties (sièges 4 et 2), le journal `meta` montre bien le siège demandé pilote `jev`, un seul par partie. Suite sableuse **36/36 verts**.

## D4 — Maturité re-calibrée : 0,65 gelé

A/B réel sur 3 seeds communes × 2 valeurs (0,133 $) : 0,65 mieux centré partout (ratio médian 0,63 vs 0,49 ; 11/13 dans [0,5 ; 1,5] vs 3/7). Confirmé sur grand échantillon par le banc grèce lancé après le gel : 55 fondations, ratio moyen 0,72×, 44/55 dans la bande. `facteurMaturite: 0.65` gelé dans `sableuse/src/condense.mjs` ; le test V4 D2 lit le facteur dans la config au lieu de le coder en dur. 🔶 le ratio reste < 1 (sous-prédiction systématique) : 0,8 centrerait probablement mieux — hors périmètre D4.

## D2 — Verdict grèce : NON confirmée

Banc ciblé `bancs/banc-suivi-grece/` (22 parties réelles, 0,276 $ — grèce dans TOUTES les parties, 16 Jev sièges 1-5 tournés + 6 contrôle) : grèce **513,5, rang 6/16, +21 % vs médiane** (critère de confirmation > +50 % non atteint) contre +97 % au banc 3. Son score varie de 273 à 707 selon le siège. Le classement du banc 3 était contaminé par le croisement seed×siège (et Jev-p2 constant). Profil qualitatif inchangé : empire large (2,3 villes, pop 24,2) mais techs moyennes. 0 victoire grèce en 22 parties. Nouveau candidat à surveiller : **france** (704,6, portée par les techs — n = 8, même caveat).

## D3 — Verdict siège vs civ : les deux effets, la civ pèse peu

Banc `bancs/banc-suivi-siege/` (12 parties réelles, 0,132 $ — arabie/inde aux sièges 1/2/4, paires Jev/contrôle à MÊME seed) :

- Effet-pilote massif : arabie 605 vs 373 (+62 %), inde 650 vs 339 (+92 %) — mêmes seeds. Les « civs sauvées par Jev » du banc 3 le sont par le pilote, pas par un artefact.
- Effet-siège réel : p1/p2/p4 ≈ 530-540 vs p3 338, p5 300 (tous joueurs) ; une même civ varie de 112 à 1185 selon siège×seed.
- Lecture : à ce n, le classement civ du banc 3 est dominé par siège×seed×pilote. Toute future lecture de classement exige une rotation équilibrée sièges×civs ou un n bien plus grand.

## Verdicts, comparaison banc 3 et options

Rapport consolidé : `sableuse/bancs/banc-suivi-2026-09-29/RAPPORT.md` (rapports standard dans chaque dossier de banc). Options PROPOSÉES sans application (Erik dispose) : (1) banc de classement v2 avec sièges branchés et équilibrés (~0,85 $), (2) mini-banc ciblé france (~0,28 $), (3) test maturité 0,8 (~0,07 $).

## Critères d'acceptation

1. `siegeJev` branché + test fixture — ✅
2. Trois verdicts chiffrés (grèce non confirmée +21 % ; siège-vs-civ départagé ; maturité 0,65 gelée) — ✅
3. Aucune valeur de règle modifiée (hors facteur maturité sableuse D4 prévu) ; suites 36/36 verts ; zéro changement moteur/serveur/jeu ; zéro secret — ✅
4. Coût mission 0,54 $, cumul ≈ 1,97 $ / 2,2 $ ; tous les bancs résumables (etat.json) ; journaux gitignés — ✅

## 🔶 Ouverts

- Ratio maturité 0,72× < 1 (sous-prédiction) — 0,8 candidat, non testé (hors D4).
- Banc ciblé grèce : 0/22 victoires (scores seulement) — les victoires naturelles restent rares à 150 tours.
- `bancs/ab-maturite-05/065` et `bancs/banc-suivi-{grece,siege}` créés ; les anciens bancs intacts.
