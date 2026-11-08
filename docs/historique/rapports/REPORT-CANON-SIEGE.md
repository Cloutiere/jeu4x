# REPORT-CANON-SIEGE — Le canon siège d'Erik : fin de la garnison immortelle

**31/10/2026 — mission livrée.** Les trois fixes votés sont actifs, prouvés aux tests, RULES amendée, bancs exécutés. T-03 reste en RÉSERVE — verdict Erik requis (§4).

## 1. Les trois fixes (périmètre voté, rien étendu)

| Fix | Site | Changement |
|---|---|---|
| **FIX 1** — T-02 branchée | `packages/rules/src/data/terrain.json` (`ville.defenseBonus`) | 0,5 → **0,25**. **Source unique data-driven** : `terrainDefenseBonus` (turn.ts:961) lisait déjà `TERRAINS` ; aucun autre data ni code ne durcit 0,5 pour la ville (grep consigné). La constante `CITY_DEFENSE_BONUS = 0.25` (constants.ts:10) reste **morte** — choix consigné : la source unique est le data, la constante redondante n'est pas branchée (zéro changement de comportement, elle peut être supprimée plus tard). |
| **FIX 2a** — le soin lève la fortification | `turn.ts` `applyPersistentUnitOrders`, branche `Heal` (pose) | `unit.fortified = false` à la pose du soin — miroir exact du `Fortify` qui lève le soin (déjà vert). Exclusivité bilatérale R-175. |
| **FIX 2b** — soin 1 PV/tour partout | `turn.ts` `processHealOrders` | `heal = 1` inconditionnel (l'ancien `ville ? 2 : 1` abrogé). `cityAt` devenu inutile dans la fonction, retiré. HealRefused (R-162) **inchangé**. |

**Intouchés respectés** : T-03 (`EXCHANGES_PER_ATTACK = 1`), Palais +35 %, Remparts +50 %, vétérans, Grande Muraille, barbares, R-59/R-177/R-162, condition « ville sans défenseur », `schemaVersion` **28 inchangée** (aucune migration d'état requise : les fixes ne changent aucune structure persistée — consigné).

## 2. Tests FIRST

Rouges d'abord (5 échecs), verts après fix :

- `tests/data.test.ts` — ville `defenseBonus` = 0,25 (verrou des données).
- `tests/combat-explique.test.ts` — **FIX 1 au calcul** : défenseur stabilisé sur case `ville` → modificateur nommé « ville » = 0,25 dans `combatStrengthsOf`, force = base × 1,25 (prouve que la donnée est LUE au combat, pas seulement stockée).
- `tests/ordres-unites.test.ts` — FIX 2a (Heal posé sur fortifiée → `fortified === false` ET soin actif +1 ce tour) ; FIX 2a miroir (Fortify sur unité en soin → soin levé, non-régression) ; FIX 2b (+1 PV/tour EN VILLE, ordre persiste).
- Verrous d'anciennes valeurs mis à jour (grep 0,5/+2, prévu au handoff) : `tests/state.test.ts` (+25 %), `tests/turn.test.ts` (soin +1 en ville aussi).

**Suites AVANT push — toutes vertes** : rules **1104** / server **401** / sableuse **140** / jev-port **30** / web **712** / svelte-check **0 erreur** / typechecks verts.

## 3. L2 — Maths AVANT/APRÈS (scénario de l'audit : 6 assiégeants vs piquier en capitale fortifiée + Palais)

`devtmp/maths-canon-siege.py` (sortie : `devtmp/maths-canon-siege-sortie.txt`) — R-51 : p = S_att²/(S_att²+S_def²), 1 round/attaque.

| Régime de la garnison | S_def | guerrier p(touche) | chevalier p(touche) | régénération |
|---|---|---|---|---|
| AVANT (0,5 + fortif 0,1 + Palais 0,35) | 5,85 | 2,84 % | 31,86 % | **+2/tour CUMULÉE avec la fortification** |
| APRÈS fortifié sans soin (0,25+0,1+0,35) | 5,10 | 3,70 % | 38,09 % | **0/tour** |
| APRÈS en soin sans fortif (0,25+0+0,35) | 4,80 | 4,16 % | **40,98 %** | +1/tour |

Chevalier attendu du handoff ~42 % : mesuré 38,1 % (fortifié) / 41,0 % (en soin) — la fourchette tient (le handoff ne précisait pas le régime de la garnison). **Verdict : le canon « elle cède sauf écrasement » tient** — avant, la garnison cumulait +95 % de bonus ET +2 PV/tour : course d'attrition mathématiquement injouable. Après, l'alternance soin/fortification borne la régénération à 1 PV/tour sans le +10 % : tout assiégeant dont la cadence de dégâts dépasse 1 PV/tour gagne la course.

## 4. L4 — Bancs

### Bancs bot 40×3 (stash AVANT/APRÈS, même corpus — `devtmp/banc-bot-td-{AVANT,APRES}-canon-siege.json`)

| Difficulté | Villes (avant→après) | PV mil | Tours moyens |
|---|---|---|---|
| facile | 1,9 → 1,9 | 266 → 264 | 137,1 → 136,7 |
| normal | 1,9 → 1,9 | 240 → 241 | 129,5 → 129,6 |
| difficile | 1,9 → 1,9 | 234 → 231 | **128,4 → 126,1** |

**Zéro collapse** sur les trois difficultés (villes/empire stables 1,9). Tours moyens en baisse côté difficile (guerres plus décisives) ; l'agrégat du banc ne compte pas les captures — l'effet « villes qui tombent plus vite » se lit en −2,3 tours moyens, faible car les guerres bot vs bot du corpus visent rarement la capitale (consigné).

### Banc Jev UNIQUE — `bancs/joueur-canon-siege-2026-10-31` : **0,1971 $ ≤ 0,50 $**, 0 erreur API

MÊME MÈRE `devtmp/analyse-tbsiege.py` sur les deux bancs (10 seeds identiques) :

| Mètre | TB-SIEGE (avant) | CANON-SIEGE (après) | Cible |
|---|---|---|---|
| **Victoires Jev** | 2/10 | **2/10** | ≥ 4/10 ✗ |
| Captures de capitales (Jev) | 2 | **2** | ≥ 50 % des guerres 🔶 |
| Percée | 2/10 | 2/10 | ≥ 40 % ✗ |
| Stériles sans déclaration | 6/10 | 8/10 | — |
| 0 guerre avant rencontre | ✓ | ✓ | ✓ |
| Fondations Jev/partie | 1,9 | 1,8 | ≥ 2,5 ✗ |
| Capitales Jev prises | 0 | 0 | ✓ |

**Verdict : les fixes n'ont PAS bougé le mètre Jev** (résultats quasi bit-à-bit identiques à TB-SIEGE). Diagnostic chiffré — le verrou est AILLEURS, sur deux étages distincts :

1. **L'étage décisionnel domine** : 8/10 parties sans UNE déclaration Jev (dont 6 parties calmes de 151 tours). Tant que Jev ne déclare pas, le siège n'a pas l'occasion de tomber — les 2 victoires viennent encore de guerres déclarées PAR le bot (contre-attaques : partie 3, capture de capitale t25 ; partie 4, percée + capture t56). Les leviers décisionnels (gate finPartie D-B, seuils) sont hors périmètre de cette mission.
2. **L'étage siège, quand il a lieu** : partie 10 — 173 échanges au contact, dist min 1, **0 chute en 151 tours**, 60 `HealCompleted`. Même à 1 PV/tour, un défenseur qui soigne tient contre une cadence d'assauts < 1 dégât/tour utile : c'est EXACTEMENT le cas d'emploi de **T-03** (échanges par attaque > 1), qui multiplierait le débit de dégâts par assaut.

**Verdict Erik requis (critère d'acceptation §3.2)** : victoires 2/10 < 4/10 → activer **T-03** (réserve, prête) ou recalibrer l'étage décisionnel (déclarations) — les deux chiffres penchent pour T-03 SUR LA PARTIE SIÈGE (partie 10 en est la démonstration) mais il ne lèvera pas les 6 parties calmes sans déclaration.

## 5. Fin de session

Commit + push. À l'acceptation : T-03 (réserve) et/ou recalibrage décisionnel, puis T3 (à cadrer).
