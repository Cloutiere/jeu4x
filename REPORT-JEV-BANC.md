# REPORT-JEV-BANC — Banc de calibrage 5 nations (30 Jev + 10 contrôle), 28/09

Mission exécutée : HANDOFF-JEV-BANC L0→L4, **arrêt L5 pour approbation** (rien de committé).

## Plan

- `sableuse/src/banc.mjs` : génération de plan (D3, planSeed tracé, refus d'écraser), exécution séquentielle repreneur (`etat.json` trace fait/échec/coupe-budget partie par partie, D1/D7), métriques depuis les journaux sans re-simulation (D5), agrégation → `RAPPORT.md` (D6).
- Extension harnais `sableuse/src/partie.mjs` (SABLEUSE uniquement) : `playerCount` (2 = 1v1 bit-identique, 3-5 = libreMulti 50×40 via `generateProceduralMap(seed,{playerCount})` + `civSetup` R-150 — identiques au serveur) et `sansJev` (armée de contrôle D4, zéro appel). Adapter/questions/condensé **gelés, appelés tels quels** (D2).
- Tests : `tests/banc.test.mjs` (3 nouveaux) — plan respecté + rotation équilibrée + refus d'écraser, exécution + reprise sans rejeu, agrégats exacts sur fixture. Suite sableuse **18/18 verte**. Un vrai bug de mon RNG de plan attrapé par le test (mulberry négatif → civs manquantes, corrigé).

## Exécution

- Fumée (L2) : 3 parties Jev réelles 5 nations → 0,0047 $/partie, ~10 s/partie (seuil d'arrêt 0,02 $ non approché). Rapport `sableuse/bancs/fumee-2026-09-28/`.
- Banc (L3) : `sableuse/bancs/banc-2026-09-28/` (planSeed 20260928) — **40/40 faites, 0 échec, 0 reprise nécessaire**. Contrôle : gratuit, ~2 s/partie.

## Coût

| Poste | Montant |
|---|---|
| Missions précédentes (journaux) | 0,0932 $ |
| Fumée (3 parties) | 0,0143 $ |
| Banc (30 parties Jev) | 0,1459 $ |
| **Cumul Erik** | **0,2534 $ / 2 $** |

## Résultats (le rapport complet lisible est `sableuse/bancs/banc-2026-09-28/RAPPORT.md`)

1. **~~Anomalie n°1~~ Reformulé après relecture d'Erik : départ lent, pas économie bloquée.** J'avais écrit « 0 marteau/0 science bloqués » — c'était trop dur : l'affectation automatique des citoyens place la nourriture d'abord et les tuiles de production arrivent dès que la pop monte (journaux : 0 marteau à pop 2-3 → 3 à pop 4 → 8 à pop 5 ; en 1v1 des unités et une poterie sont bien produites). Le vrai constat : (a) ce démarrage lent fait qu'à 5 nations, 50 tours ne suffisent pas — 40/40 non décidées ; (b) quasiment personne ne produit de colon (1 seule 2e ville en 40 parties ; Jev jamais, `fonder` en repli bot) ; (c) 🔶 la science affichée reste 0 et le progrès de recherche affiché reste à 0 alors que des techs se complètent — suspect d'AFFICHAGE du condensé sableuse (ma responsabilité, à vérifier en v3, pas le moteur).
2. Jev v2 tient très bien la charge : taux de repli **2 %** (36/1 494 appels), 0 erreur API, 0,0049 $/partie, latence médiane ~150 ms (pic isolé 73 s au tour 0 = démarrage à froid).
3. Partie 29 (seed 2150896) : seule partie vivante — barbares spawns, **capitale de p1 rasée par des barbares**, joueur éliminé. Tout le conflit du banc vient des barbares, jamais des nations entre elles.
4. Double Stonehenge en partie 29 : les deux joueurs étaient Égypte (merveille Antique gratuite du bonus de départ) — **la rotation du plan autorise des doublons de civs dans une même partie** alors que le lobby l'interdit (lobby.ts:587-588). Artefact du banc, à trancher pour le banc 2 (tirage sans remise par partie).
5. La nation Jev ne fonde jamais (`fonder` en repli bot, noul ≤ 0,42) — assumé D2, à relire avec le point 1 : tant que l'économie ne produit pas de marteaux, la question `fonder` est structurellement indécidable.

## Anomalies & limites

- Échantillon COARSE assumé (D1) : aucun winrate exploitable cette fois (toutes parties au plafond), les agrégats restent en place pour les bancs suivants.
- Le doublon-civs par partie (point 4) est un défaut de MON plan-generator, pas du moteur.
- `sableuse/bancs/` ajouté au .gitignore (D8) ; les RAPPORT.md restent committables au feu vert (aucun secret).

## Recommandation

Le banc **fonctionne** (reprise, coût, robustesse, rapport) mais le calibrage 5 nations a mis en évidence un sujet plus gros que Jev : l'économie antique multi ne décolle pas en 50 tours. Proposition d'ordre :

1. Le démarrage lent antique semble fidèle à la mécanique (nourriture d'abord, production ensuite) — rien à trancher côté règles. La suite se joue dans le banc : plafond plus long pour laisser les empires monter en puissance.
2. Banc 2 : plafond 100-150 tours (ou départ accéléré), tirage de civs sans remise par partie — coût estimé ~0,30-0,50 $ pour 40 parties.
3. v3 `fonder` : à garder pour après le point 1 — inutile de calibrer une question sur une économie à 0 marteau.

**En attente du feu vert Erik** : commit de `sableuse/src/banc.mjs`, `partie.mjs`, `tests/banc.test.mjs`, `.gitignore`, RAPPORT.md du banc + ce rapport. Aucune partie supplémentaire lancée.
