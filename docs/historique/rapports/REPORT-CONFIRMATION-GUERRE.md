# REPORT-CONFIRMATION-GUERRE — le fix `confianceGuerreSterile 0,3` en condition réelle

**Zéro code, zéro data modifiée.** Banc vanilla 3 parties (`--plafond 600`), les 3 seeds où la guerre muette a survécu au banc GUERRE-VIVANTE `868452e`. Banc : `sableuse/bancs/joueur-confirmation-guerre-2026-11-02`. Mètres : `devtmp/analyse-vanilla.py` + extraction brute des jugements dans les JSONL. **Coût 0,5055 $ ≤ 0,60 $**, 0 erreur 402 (sonde crédits OK avant lancement).

## Verdict : le fix est CONFIRMÉ en condition réelle

Les 3 critères principaux sont atteints — sauf un bémol chiffré (partie 3 coupée par le plafond budgétaire, §ci-dessous).

| Seed (avant : n° banc GV) | Avant (`868452e`) | Après (ce banc) |
|---|---|---|
| **3947827986** (partie 2, LE cas : 583 tours SANS combat, 0 paix) | indécise au plafond 600 | **FINIT — science t317** ; 10 guerres de ~30 tours, **9 paix acceptées**, 1 refus ; sans-combat 583 → **288** |
| 3802591813 (partie 4) | science t387 ; 129 combats, 303 tours sans combat, 0 paix, 224 refus | science t473 ; 143 combats, 361 sans-combat, 0 paix, 332 refus |
| 214915776 (partie 5) | science t296 ; 142 combats, 191 sans-combat, 0 paix, 221 refus | **coupée budget à t199** (Jev dominante : 34 techs vs 1, forces 1096 vs 26, 9 villes) ; 81 combats, 131 sans-combat, 0 paix, 110 refus |

Totaux 3 seeds : tours de guerre sans combat **1077 → 780** (et la partie 3 n'a tourné que 199/286 tours) ; paix conclues **0 → 9** ; combats inter-nations **271 → 227** (partie 3 tronquée) ; production militaire Jev en guerre **1,86 → 2,23/tour** ; expansion **7,3 fondations/partie ≥ 4 ✓** ; victoires 2/3 finies, 0 défaite.

## Critère 2 — les jugements honorés (transcript partie 1, seed 3947827986)

9 jugements `guerreSterile` posés, **tous sous la vieille gate 0,5** — tous HONORÉS (le banc d'avant écrasait ces choix à `decisionMin 0,5` : 512 choix `paix` perdus) :

```
t?  choix paix:p2    conf 0,38  (continuer 0,08 / paix 0,59 / assauts 0,33)
t?  choix assauts:p2 conf 0,22  (…/ paix 0,43 / assauts 0,48)   ← assauts aussi honoré
t?  choix paix:p2    conf 0,25 · 0,22 · 0,30 · 0,24 · 0,33 · 0,33 · 0,37
→ 9 événements PeaceAccepted p2→p1 au transcript, 9 guerres closes à ~30 tours
```

Le cycle observé : guerre mécanique d'écrasement (re-déclaration Jev tous les 31 tours, motif `ecrasement`) → jugement stérile à t+30 → paix acceptée → re-déclaration. La guerre ne stagne plus : elle se bat (assauts) ou se termine (paix), conformément à l'intention canon.

## Résiduel (consigné, NON retouché — main à Erik)

1. **Partie 2 (3802591813) : 0 question `guerreSterile` posée malgré 361 tours sans combat** — avec 143 combats disséminés, la gate « 30 tours / 0 bataille » ne retombe apparemment jamais (les combats réinitialisent la stérilité, 1-2 par guerre de 30 tours). Identique à l'avant (0 paix aussi) ; ni régression ni confirmation sur ce seed.
2. **Partie 3 coupée par le plafond 0,60 $ à t199** (les parties 1-2 ont coûté 0,45 $) — reprise possible : `node src/banc-joueur.mjs --plan bancs/joueur-confirmation-guerre-2026-11-02` après re-budgétation (état `coupe-budget` conservé).
3. Cycle guerre→paix→re-déclaration mécanique déjà connu (rapport GUERRE-VIVANTE) — visible ici sur 10 guerres de 30 tours dans la partie 1.

## Suites (handoff)

À l'acceptation du pilot : chapitre guerre clos, Erik joue contre le Jev complet (option B), puis backlog (conquête par direction, oscillation de marche bot, zapping de voie, miroir JvJ, atelier voix).
