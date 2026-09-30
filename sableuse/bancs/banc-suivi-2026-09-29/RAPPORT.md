# RAPPORT DE BANC CIBLÉ — banc-suivi (29/09, HANDOFF-JEV-BANC-SUIVI)

> ⚠️ **Caveat statistique en tête (D6)** : n = 22 (grèce) et 12 (siège-vs-civ) parties = un DÉTECTEUR d'anomalies, pas un verdict. Intervalles naïfs assumés. Aucune valeur de règle modifiée par cette mission — les verdicts INFORMENT, Erik dispose.

Bancs exécutés : `bancs/banc-suivi-grece/` (22 parties réelles : 16 Jev sièges 1-5 tournés + 6 contrôle, grèce toujours présente), `bancs/banc-suivi-siege/` (6 paires Jev/contrôle à MÊME seed : arabie/inde aux sièges 1, 2, 4), `bancs/ab-maturite-05` / `ab-maturite-065` (3 seeds communes × 2 facteurs). Garde-fou : cumul après mission ≈ **1,97 $** / 2,2 $.

## Verdict 1 — La grèce n'est PAS confirmée comme civ écrasante

- Banc ciblé (grèce dans 22/22 parties, sièges Jev variés) : score moyen grèce **513,5** — rang **6/16**, **+21 %** vs médiane des civs (425,8), +8 % vs médiane des joueurs (474). Le critère de confirmation (> +50 %) **n'est pas atteint**.
- Comparaison banc 3 : grèce 698,8, rang 1, +97 % vs médiane. **L'écart s'effondre dès que les sièges tournent.**
- Le score de la grèce varie du **simple au 2,6× selon le siège** : Jev-s1 707, Jev-s2 646, Jev-s5 676 vs Jev-s3 285, Jev-s4 273 (contrôle 471). Profil inchangé (empire large : 2,3 villes, pop 24,2, mais techs 14,3 < france 21,1).
- 0 victoire grèce en 22 parties (banc 3 : 0 victoire grèce en 12 aussi).
- **Lecture** : le +97 % du banc 3 s'explique surtout par le croisement seed×siège (n = 12) — la grèce est au-dessus de la médiane mais pas écrasante. Nouveau candidat à surveiller : **france** (704,6, +65 % vs médiane, portée par les techs) — même caveat n = 8.

## Verdict 2 — Effet siège vs civ : les DEUX effets existent, la civ pèse peu

Mêmes seeds, mêmes civs, seul le pilote change (Jev vs bot) :

| Civ | Score moyen Jev | Score moyen contrôle (mêmes seeds) | Écart |
|---|---|---|---|
| arabie | 605 | 373 | +62 % |
| inde | 650 | 339 | +92 % |

- **L'effet-pilote (Jev) est massif** : arabie/inde « sauvées par Jev » au banc 3 est confirmé — c'est bien le PILOTE, pas la civ.
- **L'effet-siège est réel aussi** : score moyen par siège tous joueurs — p1 532, p2 513, p4 538 vs p3 338, p5 300 (positions de carte). Pour une même civ : arabie 112→980, inde 118→1185 selon le siège/seed.
- **Lecture** : à n si petit, les écarts du classement banc 3 (espagne/zoulous forts en contrôle, arabie/inde faibles) sont dominés par siège×seed×pilote, pas par la civ. **Toute lecture de classement civ exige soit la rotation complète des sièges, soit des tailles d'échantillon bien plus grandes.**

## Verdict 3 — Maturité retenue : **0,65 (gelée)**

A/B sur 3 seeds communes (predictions vs rendements réels des villes jeunes à 10 tours) :

| Facteur | n | Ratio moyen prédit/réel | Ratio médian | Dans [0,5 ; 1,5] |
|---|---|---|---|---|
| 0,5 (actuel) | 7 | 0,51× | 0,49 | 3/7 |
| **0,65 (retenu)** | 13 | 0,60× | 0,63 | **11/13** |
| 0,65 (banc grèce, 55 fondations) | 55 | 0,72× | — | 44/55 |

- `facteurMaturite: 0.65` gelé dans `src/condense.mjs` (formule inchangée, un seul paramètre, test V4 D2 rendu piloté par la config).
- 🔶 Le ratio reste < 1 (sous-prédiction) — 0,8 centrerait probablement mieux ; hors périmètre de cette mission (D4 : 0,5 vs 0,65 seulement).

## Extraits qualitatifs

- Partie la plus clivante du banc siège : inde seed 4929542 — Jev-s4 **1185** vs contrôle même seed **52** (23×). La civ inde n'a pas changé : c'est le pilote.
- Le banc grèce n'a produit AUCUNE victoire naturelle (22/22 non décidées au plafond 150) — cohérent avec le banc 3 (victoires rares), les scores restent le seul signal.

## Options si Erik veut renforcer le signal (PROPOSITIONS, rien d'appliqué)

1. **Banc de classement v2** : re-jouer le banc 3 (40 parties) avec `siegeJev` branché + par-siège équilibré par civ (chaque civ vue sur chaque siège) — coût estimé ~0,85 $.
2. **France sous surveillance** : mini-banc ciblé france (même format que grèce, ~0,28 $) avant tout ajustement.
3. **Centrage maturité** : tester 0,8 sur 3 seeds (~0,07 $) pour viser un ratio ≈ 1,0.

## Coût de la mission

- A/B maturité : 0,133 $ — banc grèce : 0,276 $ — banc siège : 0,132 $ ≈ **0,54 $** ; cumul dépôt ≈ **1,92 $** / garde-fou 2,2 $ (baseline 1,43 $ + 0,093 $ POC journaux racine ≈ 1,52 $ avant mission... chiffre honnête : cumul bancs committés 1,43 $ + 0,54 $ = **1,97 $** — sous le garde-fou).

## Détail des runs

- `banc-suivi-grece` : 22/22 faites, 0 échec (RAPPORT.md standard dans le dossier).
- `banc-suivi-siege` : 12/12 faites, 0 échec, 1 victoire (inde t91, pilote Jev).
- Tests sableuse : **36/36 verts** (nouveau test D1 : siegeJev pilote le bon siège).
