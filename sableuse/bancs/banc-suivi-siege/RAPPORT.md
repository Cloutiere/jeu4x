# RAPPORT DE BANC DE CALIBRAGE — banc-suivi-siege

Plan seed 20260930 — 6 parties Jev v2 + 6 contrôle, 5 nations, 50×40 libreMulti, plafond 150 tours.

> ⚠️ Échantillon COARSE (D1) : ~30 parties par bras = intervalles naïfs, détection d'anomalies — PAS un verdict définitif.

## V4 — Classement des civilisations par score moyen (horizon 150 tours)

> Score = villes×10 + pop×2 + techs×30 + merveilles×100 + trésorerie/10. Détection d'anomalies, PAS un verdict (D6).

| Rang | Civ | Score moy | Jev | Contrôle | Parties | villes | pop | techs | merveilles | trésorerie |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | japon | 820.3 | 859.5 | 781.0 | 4 | 1.0 | 14.5 | 24.0 | 0.0 | 620 |
| 2 | espagne | 567.0 | 567.0 | 567.0 | 2 | 0.0 | 0.0 | 18.0 | 0.0 | 271 |
| 3 | chine | 540.0 | 570.0 | 510.0 | 2 | 1.0 | 9.0 | 17.0 | 0.0 | 28 |
| 4 | zoulous | 510.5 | 527.0 | 494.0 | 2 | 1.0 | 13.5 | 15.5 | 0.0 | 94 |
| 5 | inde | 494.6 | 650.4 | 338.8 | 10 | 1.9 | 18.2 | 14.3 | 0.0 | 105 |
| 6 | arabie | 489.0 | 605.0 | 373.0 | 8 | 1.9 | 17.4 | 14.3 | 0.0 | 83 |
| 7 | france | 448.8 | 538.3 | 359.3 | 6 | 0.5 | 5.8 | 14.0 | 0.0 | 126 |
| 8 | allemagne | 444.0 | 425.0 | 463.0 | 4 | 1.0 | 10.5 | 13.5 | 0.0 | 85 |
| 9 | egypte | 425.0 | 378.5 | 471.5 | 4 | 0.5 | 7.0 | 13.3 | 0.0 | 87 |
| 10 | amerique | 307.5 | 258.5 | 356.5 | 4 | 0.5 | 4.5 | 9.5 | 0.0 | 87 |
| 11 | mongolie | 299.0 | 389.0 | 209.0 | 2 | 1.0 | 9.0 | 9.0 | 0.0 | 12 |
| 12 | azteques | 292.0 | 306.5 | 277.5 | 4 | 0.5 | 5.0 | 9.0 | 0.0 | 76 |
| 13 | rome | 267.8 | 268.0 | 267.5 | 4 | 0.5 | 5.5 | 8.0 | 0.0 | 120 |
| 14 | russie | 257.8 | 250.0 | 265.5 | 4 | 0.5 | 5.5 | 7.8 | 0.0 | 94 |

- ⚠️ Civ candidate écrasante au score : **japon** (820.3 vs médiane 444.0) — banc de suivi ciblé recommandé.

## V4 — Prédiction gainNet vs rendements réels (fondations Jev, villes JEUNES à 10 tours)

- 22 fondations comparées — ratio moyen prédit/réel : **0.80×** (cible ±50 %), 21/22 dans [0,5 ; 1,5].
- Détail (prédite → réel) : 4.6→9.0, 6.5→8.0, 5.0→7.0, 6.2→7.0, 5.7→8.0, 5.0→9.0, 5.7→8.0, 4.7→7.0, 6.5→9.0, 5.0→5.0, 6.3→5.0, 4.9→7.0 …

## V4 — Science débloquée (règle regle:conversion)

- Techs complétées par empire : moyenne **12.9**, min 2, max 20 (banc 2 : ~0). Parties sous le critère (≥ 2-3) : 0/12.

## Anomalies détectées

- Civs jamais gagnantes (≥5 parties jouées) : arabie, france.
- Type de victoire dominant : **razedCapital** (1 sur 1 parties décidées).
- 11/12 parties non décidées au plafond de 150 tours — envisager un plafond supérieur pour le banc 2.

## Winrate par civilisation (tous sièges et bras confondus)

| Civ | Parties | Victoires | Winrate | V. Jev | V. contrôle |
|---|---|---|---|---|---|
| inde | 10 | 1 | 10 % | 0 | 1 |
| amerique | 4 | 0 | 0 % | 0 | 0 |
| arabie | 8 | 0 | 0 % | 0 | 0 |
| azteques | 4 | 0 | 0 % | 0 | 0 |
| chine | 2 | 0 | 0 % | 0 | 0 |
| egypte | 4 | 0 | 0 % | 0 | 0 |
| angleterre | 0 | 0 | — | 0 | 0 |
| france | 6 | 0 | 0 % | 0 | 0 |
| allemagne | 4 | 0 | 0 % | 0 | 0 |
| grece | 0 | 0 | — | 0 | 0 |
| japon | 4 | 0 | 0 % | 0 | 0 |
| mongolie | 2 | 0 | 0 % | 0 | 0 |
| rome | 4 | 0 | 0 % | 0 | 0 |
| russie | 4 | 0 | 0 % | 0 | 0 |
| espagne | 2 | 0 | 0 % | 0 | 0 |
| zoulous | 2 | 0 | 0 % | 0 | 0 |

## Types de victoire

| Type | Jev | Contrôle | Total |
|---|---|---|---|
| razedCapital | 0 | 1 | 1 |
| non décidée (plafond) | 6 | 5 | 11 |

## Longueur des parties

- Moyenne : **146.0 tours**, écart-type 17.3, min 91, max 151.
- Jev : 151.0 tours en moyenne — contrôle : 141.0.

## Expansion — villes fondées par joueur (moyenne par partie)

| Bras | villes/joueur moy | max | Jev (nation pilotée) |
|---|---|---|---|
| Jev | 1.73 | 2 | 4.67 (dont fondations décidées par Jev : 6.17/partie) |
| Contrôle | 1.00 | 1 | — |

## Technologies complétées (moyenne par joueur)

- Jev : 14.20 — contrôle : 11.67.

## Guerres inter-nations (hors barbares)

- 8/12 parties avec au moins un combat entre deux nations.
- Paires les plus belligérantes : p2|p4 (3), p4|p5 (3), p1|p2 (3), p1|p3 (1), p3|p5 (1).

## Jev vs bot

- La nation pilotée par Jev gagne **0/6** de ses parties (0 %) ; référence bot pur : chaque bras contrôle donne 20 % par siège.
- Taux de repli moyen : 10 % des tours (91 replis / 906 appels).
- Coût banc : **0.1321 $** (0.0220 $/partie Jev), latence moy 158 ms, max 471 ms.

## Détail par partie

| # | Bras | Seed | Gagnant (civ) | Type | Tours | Villes | Techs | Replis | Coût $ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | jev | 4850352 | — | — | 151 | 11 | 89 | 17 | 0.0236 |
| 2 | contrôle | 4850352 | — | — | 151 | 5 | 87 | 0 | 0.0000 |
| 3 | jev | 4866190 | — | — | 151 | 7 | 42 | 18 | 0.0228 |
| 4 | contrôle | 4866190 | — | — | 151 | 5 | 33 | 0 | 0.0000 |
| 5 | jev | 4882028 | — | — | 151 | 6 | 98 | 27 | 0.0178 |
| 6 | contrôle | 4882028 | — | — | 151 | 5 | 87 | 0 | 0.0000 |
| 7 | jev | 4897866 | — | — | 151 | 10 | 76 | 10 | 0.0216 |
| 8 | contrôle | 4897866 | — | — | 151 | 5 | 59 | 0 | 0.0000 |
| 9 | jev | 4913704 | — | — | 151 | 6 | 63 | 8 | 0.0202 |
| 10 | contrôle | 4913704 | — | — | 151 | 5 | 72 | 0 | 0.0000 |
| 11 | jev | 4929542 | — | — | 151 | 12 | 58 | 11 | 0.0261 |
| 12 | contrôle | 4929542 | inde | razedCapital | 91 | 5 | 12 | 0 | 0.0000 |
