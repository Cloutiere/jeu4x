# RAPPORT DE BANC DE CALIBRAGE — banc-suivi-grece

Plan seed 20260929 — 16 parties Jev v2 + 6 contrôle, 5 nations, 50×40 libreMulti, plafond 150 tours.

> ⚠️ Échantillon COARSE (D1) : ~30 parties par bras = intervalles naïfs, détection d'anomalies — PAS un verdict définitif.

## V4 — Classement des civilisations par score moyen (horizon 150 tours)

> Score = villes×10 + pop×2 + techs×30 + merveilles×100 + trésorerie/10. Détection d'anomalies, PAS un verdict (D6).

| Rang | Civ | Score moy | Jev | Contrôle | Parties | villes | pop | techs | merveilles | trésorerie |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | france | 704.6 | 760.4 | 611.7 | 8 | 0.8 | 11.5 | 21.1 | 0.0 | 406 |
| 2 | japon | 574.0 | 1012.0 | 355.0 | 3 | 0.7 | 9.7 | 17.0 | 0.0 | 385 |
| 3 | espagne | 553.7 | 553.7 | — | 3 | 1.0 | 11.3 | 17.0 | 0.0 | 119 |
| 4 | chine | 539.3 | 563.2 | 420.0 | 6 | 0.5 | 4.7 | 16.8 | 0.0 | 204 |
| 5 | allemagne | 527.3 | 527.3 | — | 3 | 0.7 | 9.7 | 16.3 | 0.0 | 117 |
| 6 | grece | 513.5 | 529.3 | 471.3 | 22 | 2.3 | 24.2 | 14.3 | 0.0 | 132 |
| 7 | mongolie | 504.0 | 432.7 | 611.0 | 5 | 1.4 | 14.4 | 14.6 | 0.0 | 235 |
| 8 | azteques | 455.0 | 598.3 | 25.0 | 8 | 0.9 | 11.0 | 13.8 | 0.0 | 123 |
| 9 | arabie | 425.8 | 370.8 | 701.0 | 6 | 0.7 | 9.5 | 13.2 | 0.0 | 57 |
| 10 | russie | 420.1 | 374.0 | 697.0 | 7 | 0.7 | 9.1 | 12.7 | 0.0 | 137 |
| 11 | rome | 401.7 | 472.3 | 331.0 | 6 | 0.8 | 9.3 | 12.2 | 0.0 | 101 |
| 12 | amerique | 397.4 | 603.5 | 260.0 | 5 | 0.6 | 5.4 | 11.8 | 0.0 | 272 |
| 13 | angleterre | 355.4 | 437.4 | 218.7 | 8 | 0.9 | 7.3 | 11.0 | 0.0 | 26 |
| 14 | inde | 269.2 | 269.2 | — | 6 | 0.7 | 7.2 | 8.0 | 0.0 | 86 |
| 15 | egypte | 247.5 | 282.9 | 0.0 | 8 | 0.3 | 2.8 | 7.9 | 0.0 | 36 |
| 16 | zoulous | 217.5 | 171.8 | 309.0 | 6 | 0.8 | 7.5 | 6.3 | 0.0 | 43 |

- ⚠️ Civ candidate écrasante au score : **france** (704.6 vs médiane 425.8) — banc de suivi ciblé recommandé.

## V4 — Prédiction gainNet vs rendements réels (fondations Jev, villes JEUNES à 10 tours)

- 55 fondations comparées — ratio moyen prédit/réel : **0.72×** (cible ±50 %), 44/55 dans [0,5 ; 1,5].
- Détail (prédite → réel) : 5.0→8.0, 4.9→5.0, 2.4→5.0, 5.0→8.0, 4.9→8.0, 3.6→6.0, 4.6→8.0, 4.9→8.0, 6.3→5.0, 5.5→11.0, 4.7→8.0, 4.6→5.0 …

## V4 — Science débloquée (règle regle:conversion)

- Techs complétées par empire : moyenne **12.8**, min 4, max 18 (banc 2 : ~0). Parties sous le critère (≥ 2-3) : 0/22.

## Anomalies détectées

- Civs jamais gagnantes (≥5 parties jouées) : amerique, arabie, azteques, chine, egypte, angleterre, france, grece, inde, mongolie, rome, russie, zoulous.
- 22/22 parties non décidées au plafond de 150 tours — envisager un plafond supérieur pour le banc 2.

## Winrate par civilisation (tous sièges et bras confondus)

| Civ | Parties | Victoires | Winrate | V. Jev | V. contrôle |
|---|---|---|---|---|---|
| amerique | 5 | 0 | 0 % | 0 | 0 |
| arabie | 6 | 0 | 0 % | 0 | 0 |
| azteques | 8 | 0 | 0 % | 0 | 0 |
| chine | 6 | 0 | 0 % | 0 | 0 |
| egypte | 8 | 0 | 0 % | 0 | 0 |
| angleterre | 8 | 0 | 0 % | 0 | 0 |
| france | 8 | 0 | 0 % | 0 | 0 |
| allemagne | 3 | 0 | 0 % | 0 | 0 |
| grece | 22 | 0 | 0 % | 0 | 0 |
| inde | 6 | 0 | 0 % | 0 | 0 |
| japon | 3 | 0 | 0 % | 0 | 0 |
| mongolie | 5 | 0 | 0 % | 0 | 0 |
| rome | 6 | 0 | 0 % | 0 | 0 |
| russie | 7 | 0 | 0 % | 0 | 0 |
| espagne | 3 | 0 | 0 % | 0 | 0 |
| zoulous | 6 | 0 | 0 % | 0 | 0 |

## Types de victoire

| Type | Jev | Contrôle | Total |
|---|---|---|---|
| non décidée (plafond) | 16 | 6 | 22 |

## Longueur des parties

- Moyenne : **151.0 tours**, écart-type 0.0, min 151, max 151.
- Jev : 151.0 tours en moyenne — contrôle : 151.0.

## Expansion — villes fondées par joueur (moyenne par partie)

| Bras | villes/joueur moy | max | Jev (nation pilotée) |
|---|---|---|---|
| Jev | 1.69 | 2 | 4.19 (dont fondations décidées par Jev : 5.25/partie) |
| Contrôle | 1.00 | 1 | — |

## Technologies complétées (moyenne par joueur)

- Jev : 13.39 — contrôle : 11.07.

## Guerres inter-nations (hors barbares)

- 18/22 parties avec au moins un combat entre deux nations.
- Paires les plus belligérantes : p1|p3 (6), p3|p5 (5), p1|p2 (5), p2|p4 (5), p4|p5 (4).

## Jev vs bot

- La nation pilotée par Jev gagne **0/16** de ses parties (0 %) ; référence bot pur : chaque bras contrôle donne 20 % par siège.
- Taux de repli moyen : 6 % des tours (115 replis / 2066 appels).
- Coût banc : **0.2762 $** (0.0173 $/partie Jev), latence moy 181 ms, max 701 ms.

## Détail par partie

| # | Bras | Seed | Gagnant (civ) | Type | Tours | Villes | Techs | Replis | Coût $ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | jev | 6161146 | — | — | 151 | 11 | 90 | 18 | 0.0226 |
| 2 | jev | 6169065 | — | — | 151 | 7 | 91 | 1 | 0.0204 |
| 3 | jev | 6176984 | — | — | 151 | 8 | 36 | 0 | 0.0117 |
| 4 | jev | 6184903 | — | — | 151 | 8 | 46 | 20 | 0.0191 |
| 5 | jev | 6192822 | — | — | 151 | 6 | 20 | 2 | 0.0086 |
| 6 | jev | 6200741 | — | — | 151 | 12 | 92 | 13 | 0.0220 |
| 7 | jev | 6208660 | — | — | 151 | 8 | 92 | 18 | 0.0206 |
| 8 | jev | 6216579 | — | — | 151 | 6 | 49 | 2 | 0.0050 |
| 9 | jev | 6224498 | — | — | 151 | 9 | 49 | 1 | 0.0155 |
| 10 | jev | 6232417 | — | — | 151 | 11 | 69 | 0 | 0.0214 |
| 11 | jev | 6240336 | — | — | 151 | 10 | 81 | 13 | 0.0226 |
| 12 | jev | 6248255 | — | — | 151 | 8 | 51 | 6 | 0.0205 |
| 13 | jev | 6256174 | — | — | 151 | 10 | 81 | 4 | 0.0218 |
| 14 | jev | 6264093 | — | — | 151 | 5 | 61 | 0 | 0.0041 |
| 15 | jev | 6272012 | — | — | 151 | 8 | 77 | 2 | 0.0193 |
| 16 | jev | 6279931 | — | — | 151 | 8 | 86 | 15 | 0.0208 |
| 17 | contrôle | 6261146 | — | — | 151 | 5 | 32 | 0 | 0.0000 |
| 18 | contrôle | 6269065 | — | — | 151 | 5 | 66 | 0 | 0.0000 |
| 19 | contrôle | 6276984 | — | — | 151 | 5 | 83 | 0 | 0.0000 |
| 20 | contrôle | 6284903 | — | — | 151 | 5 | 59 | 0 | 0.0000 |
| 21 | contrôle | 6292822 | — | — | 151 | 5 | 51 | 0 | 0.0000 |
| 22 | contrôle | 6300741 | — | — | 151 | 5 | 41 | 0 | 0.0000 |
