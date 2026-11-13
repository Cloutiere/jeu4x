# HANDOFF-DEFENSE-VILLE-A2 — Mini-suivi cohérence rappel×escort + marqueur d'état, puis push (suite de DEFENSE-VILLE-A)

**Mission de SUIVI pour l'agent de DEFENSE-VILLE-A (ton commit local `2f95e59`, non poussé — c'est la base). Arbitrage Erik 12/11 : « mini-suivi cohérence puis push ». Les options (a) pousser tel quel et (b) retirer L6 sont REJETÉES.**

## 1. Préalables

- Ton diagnostic d'arrêt est accepté : la tranche A fonctionne où elle voit (p03/p09 fermés, élims 3→1, preuve rappel p08) ; les échecs sont des angles morts (fog → tranches B/C ; villes sans combattante → L3 tranche B). Les razes resteront probablement > 0 après ce suivi — c'est la limite fog CONSIGNÉE, pas un échec.
- Baseline : ton commit local `2f95e59` (rules 1211, server 464, suites vertes, symboles vérifiés), rien poussé.

## 2. Les deux correctifs canon (rien d'autre ne bouge)

1. **Cohérence rappel × escort (restaure la sonde escort 0)** : quand `planDefenseVille` rappelle une unité qui servait d'escorte à un colon (escorte en place au sens escortColon), la décision escort du colon est **réévaluée le même tour** — escort partie/absente + risque élevé → le colon attend en ville ou `doitRappelerColon` (il ne reste JAMAIS seul sur une route risquée parce que son escorte a été rappelée). C'est le canon escort étendu : le pari se réévalue quand les conditions changent. Test : escorte rappelée → colon réévalué (rouge avant fix).
2. **Marqueur d'état de rappel (l'option (c) de ton rapport)** : un marqueur léger (memo de tour, pas une nouvelle donnée persistée — `schemaVersion` 28 intacte) pose l'état « rappel en cours » par unité ; il est CONSOMMÉ à la dissolution de la menace. Objectif mesurable : **ping-pong ≤ baseline (136)**, idéalement nettement sous.

**L6 est GARDÉ** tel quel (verdict Erik via le pilot : on ne retire pas un canon « fondé sous les griffes » parce qu'une métrique fog le rend invisible ; réévaluation après la tranche C).

## 3. Mission (petite, une seule re-mesure)

- **L0 — Tests FIRST** : les 2 tests ci-dessus + non-régression des suites L1/L2 existantes (garnison, hystérésis, priorités, colon-exclu).
- **L1 — Code** : `defenseVille.ts`/botPolicy (réévaluation escort au rappel ; marqueur d'état), `bot.json defense` si un champ est nécessaire.
- **L2 — UNE re-mesure** sur les **mêmes seeds** (10 parties, ~0,3 $) + sonde : critères de push = **sonde escort 0** · **ping-pong ≤ 136** · élims < 3 · fondations ≥ 5,7 · zéro collapse banc bot. Les razes ne sont PAS un critère de ce suivi (limite fog consignée — tranches B/C). Si un critère échoue → **arrêt-pour-approbation** (chiffres consignés, pas d'itération solo).
- **L3 — Push + déploiement** : suites complètes, captures locales, push de `2f95e59` + ce suivi, vérifier Deploy SUCCESS + prod 200 (API GitHub).

## 4. Fin de session

Rapport `REPORT-DEFENSE-VILLE-A2.md` à la racine (ou §8bis de ton rapport A) : les deux tableaux AVANT/APRÈS, verdict par critère, écarts consignés. Puis arrêt, remise de la main. Tranches B/C attendent l'acceptation du pilot.

**Pièges** : cache vitest RACINE ; banc tsx (~28-29 min le banc bot si re-joué) ; UN SEUL worker 8787 ; ids recyclés dans les journaux ; chaque commit porte ses symboles (`git show` + grep) ; ne jamais committer les secrets.
