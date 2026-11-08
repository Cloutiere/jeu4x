# REPORT-BATAILLE-COMPLETE — Canon Erik 31/10 : une attaque = la mort de l'une ou l'autre

**Mission** : HANDOFF-BATAILLE-COMPLETE.md — remplacer l'échange unique (T-03) par la BATAILLE COMPLÈTE mêlée, sans retraite, fin de la survivance mutuelle post-attaque ; distance intacte (R-59).

## 1. La règle livrée

- **B1 — Bataille complète** : `performExchange` (packages/rules/src/turn.ts) enchaîne les assauts R-51 (même formule `p = S_att²/(S_att²+S_def²)`, un jet seedé PAR assaut) jusqu'à la mort d'un camp. `EXCHANGES_PER_ATTACK` SUPPRIMÉE de constants.ts (choix consigné : disparition, pas d'illimité symbolique — la boucle mêlée est `while hp>0 && hp>0`, la distance reste 1 assaut).
- **B2 — Pas de retraite** : le perdant meurt sur place. L'attaquant de mêlée N'ENTRE PLUS avant le combat (l'ancienne prise de place R-176 est retirée quand un défenseur désigné tient la case — exception : l'entrée physique sur un camp barbare R-183 reste en Phase A). Le vainqueur avance par `advanceIfMelee`, qui N'ENTRE PAS si un autre militaire ennemi tient encore la case (R-159-b étendu au vainqueur : la ville n'est prise qu'à la mort du DERNIER défenseur).
- **B3 — Fin de la survivance mutuelle post-attaque** : la cohabitation ne peut plus NAÎTRE d'une attaque. La mêlée de Phase E (R-180) reste pour les cohabitations nées des AUTRES chemins (entrées simultanées sur case sans défenseur, résidus amicaux R-179-b). R-178 rév. A (report) abrogée — cas principal caduc.
- **B4 — Séquentiel maintenu** : les assiégeants attaquent un par un (R-177) ; dès que le défenseur meurt, les suivants n'attaquent plus (ordre fizzle) ; les blessures PERSISTENT entre batailles.
- **B5 — Distance INTACTE** : un tir reste UN assaut (1 PV garanti, sans riposte, jamais d'entrée, survie possible après tir — testée).
- **B6 — R-149 (overrun)** : toujours ATTEIGNABLE et conservé (écrasement instantané SANS perte pour l'attaquant, vs bataille complète qui laisse le vainqueur blessé) — le test phase7n verrouille la différence : non-Zoulou 4<6 → plus d'écrasement → le défenseur meurt quand même MAIS l'attaquant encaisse. Non supprimé (décision séparée).
- **B7 — Intouchés respectés** : armées, vétérans, barbares (tests barbares 56 verts), Grande Muraille, gouvernements, R-162 HealRefused, CANON-SIEGE (soin 1 PV, exclusivité fortif/soin, bonus ville 0,25), `schemaVersion` 28 (aucune structure persistée changée — consigné).

## 2. Maths AVANT/APRÈS — scénario de l'audit du siège

6 chevaliers (S_att 4, 3 PV) vs piquier capitale fortifiée+Palais (S_def 5,10 — CANON-SIEGE), Monte-Carlo 20 000 runs (`python`, seedé) :

| | AVANT (T-03, 1 échange/attaque) | APRÈS (bataille complète) |
|---|---|---|
| Issue en 151 tours | **0 chute** (la partie 10 du banc calibrage : 173 échanges, 60 Heal, garnison immortelle) | **chute 99,4 %** — tour moyen de chute **5**, pertes 1,3/6 assaillants |
| S_def 4,80 (soin +1, sans fortif) | 0 chute | chute 99,7 % — tour moyen 4, pertes 1,1/6 |

Le canon « elle cède sauf écrasement » tient : la mort de l'un des deux est garantie par construction (chaque assaut retire 1 PV, somme finie).

## 3. Tests

- **FIRST rouges 7/9** puis verts : `packages/rules/tests/bataille-complete.test.ts` — 10 tests : mort d'un camp TOUJOURS (60 seeds), bataille multi-assauts, déterminisme, attaquant perdant mort sans capture, vainqueur avance/entre, ville avec 2e défenseur = pas d'entrée, capture de ville au dernier défenseur (CityCaptured), blessures persistantes, arrêt de la séquence d'assiègeants, distance = 1 PV garanti/1 assaut.
- **22 verrous anciens mis à jour** (12 fichiers) : tous verrouillaient l'échange unique ou la cohabitation post-attaque (combat-explique, fortify, engagement ×6, engagement-dispute ×2, barbares, phase7e ×2, phase7g ×2, phase7n, turn ×2, fog, e2e). Aucune règle hors périmètre modifiée. Sableuse : 1 test re-calé (seed 97→99 — la bataille complète change la consommation RNG, le bot déclarait avant Jev).

Suites AVANT push : **rules 1114/1114** (68 fichiers, 1104 + 10 nouveaux) / **server 401** / **sableuse 140** / **jev-port 30** / **web 712** / **svelte-check 0 erreur** (26 avertissements préexistants) / **typechecks rules + server verts**.

## 4. Bancs

**Bancs bot 40×3** (corpus identique, stash avant/après, devtmp/banc-bot-td-{AVANT,APRES}-bataille.json) :

| Difficulté | Villes AVANT→APRÈS | Tours AVANT→APRÈS |
|---|---|---|
| facile | 1,9 → 1,9 | 137 → 137 (+0,4) |
| normal | 1,9 → 1,9 | 130 → 137 (+7,4) |
| difficile | 1,9 → 1,9 | 126 → 125 (−1,1) |

**Zéro collapse** (villes/empire stables partout) ; pas de baisse marquée des tours en bot vs bot — attendu : les guerres bot-vs-bot restent rares/stériles (verrou décisionnel déjà consigné), la bataille complète change la RÉSOLUTION des combats, pas la décision d'attaquer. 🔶 normal +7,4 tours consigné SANS recalibrage (interdit sans Erik).

**Banc Jev UNIQUE** bancs/joueur-bataille-2026-10-31 : 10 parties, **0,2327 $ ≤ 0,50 $**, 0 erreur API. Mètre analyse-tbsiege.py (même script que TB-SIEGE) :

| Métrique | Valeur | Critère |
|---|---|---|
| **Victoires Jev** | **1/10** | ✗ cible 4 |
| Percée (combats ≤ 3 de la capitale adverse) | 4/10 = 40 % | ✓ (≥ 40 %) |
| **Captures de capitales par Jev** | **1** (première de l'histoire des bancs Jev : 0 avant) | — |
| Stériles sans déclaration | 7/10 | ✗ |
| 0 guerre avant rencontre | ✓ | ✓ |
| Fondations Jev/partie | 1,9 | ✗ (≥ 2,5) |

Partie 8 (seed 2837671077) : percée à distance 1, 10 combats au contact de la capitale — avant la bataille complète ce siège ne produisait RIEN ; la victoire unique (seed 3802591813) vient en 57 tours.

## 5. Suites AVANT push

- rules : **1114/1114 verts** (68 fichiers) ; server : **401 verts** ; sableuse : **140 verts** ; jev-port : **30 verts** ; web : **712 verts** (1 verrou re-calé : labo-combat seed 42→1, déroulement de l'assaut de pile décalé par la consommation RNG des batailles) ; svelte-check : **0 erreur** ; typechecks rules + server **verts**.

## 6. Verrou suivant — diagnostic chiffré (critère d'acceptation 2, Erik tranche)

Le siège EST levé au niveau mécanique (chute 99,4 % au Monte-Carlo, 1 capture réelle au banc, percée 40 %) mais le decisionnel n'exploite pas l'ouverture : **7/10 parties sans UNE déclaration Jev** (contre 1/10 au calibrage offensif — variance inter-seeds et re-calage du canal finPartie à l'œil), et les guerres déclarées restent tardives. La bataille complète a rendu chaque guerre DÉCISIVE ; il faut maintenant que Jev DÉCLARE. Étage suivant (décisionnel) : abaisser guerreTotaleRapportMin, ou autoriser la déclaration dès le signal domination mécanique, ou re-brancher le seuil stériles (7/10).

## 7. Verdict Erik (à trancher)

1. **Accepter** la bataille complète telle quelle (recommandé : canon appliqué, zéro collapse, distance intacte, overrun conservé) ;
2. **Étage suivant** : mission décisionnelle (déclarations Jev) — la mécanique de conquête est prête ;
3. 🔶 Divers à l'œil : banc bot normal +7,4 tours (consigné), fondations Jev 1,9/partie, R-149 (overrun) désormais redondant en pratique → suppression ou conservation ?
