# HANDOFF-CONVERGENCE-FINALE — Transit allié + tolérance barbares conditionnelle : la passe FINALE du chapitre siège

**Mission FINALE — pour l'agent de DIAG-CONVERGENCE (ton diagnostic `f00f986`, ton outil `devtmp/diag-convergence.ts` — c'est la base). Canon Erik validé le 15/11. Comme A3 : **UNE re-mesure, puis push DANS LES DEUX ISSUES — aucune itération au-delà.** Le levier V3-(ii)/D1-CAMPAGNE (`0f5a92e`) est DÉJÀ en prod (conforme `36c744b`) et reste en place.**

## 1. Préalables

- **Ton diagnostic** : 63,3 % des tours-membres de convergence = `rallier` SANS PAS — **ROUTE-NULL 44,6 %** (`pasVersRoutier` exige un transit libre de TOUTE unité : `botPolicy.ts:408/446`, glouton `pasVers` idem, → Fortify perpétuel `botPolicy.ts:2689-2702`), **FILTRE-D2 18,7 %** (barbares errants sur la route), D1 résiduel 17,1 % (voulu), marche progressive 73 % (saine), cible mobile acquittée 0/40, `maxEffectifRayon 0,1` re-confirmé avec wrap.
- Baseline : main actuelle (D1-CAMPAGNE `0f5a92e` en prod, Deploy SUCCESS, prod 200), suites rules 1214 / server 536 / web 793 / jev-port 52 / sableuse 228, `schemaVersion` **28**. ⚠ symboles dans chaque commit, `git status` avant acceptation, **UNE seule mission**.

## 2. Le canon validé (2 volets, une mission, une règle de décision pré-enregistrée)

1. **(a) Transit allié** : `pasVersRoutier` (et le glouton `pasVers` pour les objectifs rallier/offensiver) admet les cases occupées par des **alliés** comme TRANSIT (pas comme arrivée — le pas final reste libre, R-30 gère le contact d'arrivée) ; lève les 44,6 %. Ennemis : jamais en transit (inchangé). Table `bot.json` si un champ émerge.
2. **(b) Règle de décision PRÉ-ENREGISTRÉE** (posée dans la même mission, activée ou non par la mesure) : après (a), la sonde re-mesure la part de **FILTRE-D2** dans les blocages de convergence restants — si elle **domine** (majoritaire), la **tolérance aux barbares errants** s'active pour les membres de campagne offensive en guerre déclarée (le pas de convergence est admis malgré la portée d'arrivée d'un barbare errant — D2-collision par civils et D2-collision contre un barbare qui ARRIVE sur la même case restent universels). Garde dure : **pertes Jev ≤ 11** — si la re-mesure dépasse → arrêt-pour-approbation, (b) est retiré avant push. Si FILTRE-D2 ne domine pas → (b) reste inerte (consigné, non activé).
3. **Fin de partie garantie** : **UNE seule re-mesure finale** (banc bot 40×3 AVANT = main actuelle / APRÈS + banc Jev 10 seeds mêmes seeds ≤ 0,60 $), puis **push dans les DEUX issues** :
   - **Issue A** — convergence restaurée (maxEffectifRayon en hausse nette, siège reprend) ET victoires bot restaurées en partie + banc Jev vert → push net ;
   - **Issue B** — convergence restaurée mais victoires partielles → **push QUAND MÊME** avec les chiffres consignés : **le chapitre siège est CLOS** (gate → escarmouche → k-durée → anti-collision → collision-mobile → D1-campagne → convergence), le verdict final sera **à l'œil d'Erik vs Jev en prod**.
   - **Arrêt-pour-approbation** uniquement si régression (pertes Jev > 11, GZJQZX cassé, zéro collapse violé, piétinement > 0) — pas d'itération solo.

## 3. Mission L0→L3

- **L0 — Tests FIRST** (amendes) : membre entouré d'alliés, objectif `rallier` → pas émis **à travers les alliés** (rouge avant fix) ; arrivée sur la cible → R-30 inchangée ; transit ennemi → toujours refusé ; (b) si activé : membre de campagne, pas croisant la portée d'un barbare errant → admis (rouge avant fix) ; le MÊME pas vers un ennemi de civilisation ou vers une case d'arrivée commune → toujours refusé ; scout/escorte → tolérance NON applicable (D2 entier) ; GZJQZX t36 toujours refusé ; NP8JEE actif ; 30 seeds ; non-régression explor/escort/tranche A.
- **L1 — Code** : transit allié dans `pasVersRoutier`/`pasVers` ; (b) codé mais **activé conditionnellement** selon la mesure L2 (la condition pré-enregistrée §2.2 est LE test de décision).
- **L2 — Re-mesure UNE FOIS** : banc bot 40×3 AVANT (main) / APRÈS (`devtmp/banc-bot-td-{AVANT,APRES}-convergence.json`) + banc Jev 10 seeds mêmes seeds + TON diag re-joué (maxEffectifRayon, causes de blocage avant/après).
- **L3 — Suites + déploiement** : suites complètes, captures locales, push (issue A ou B), vérifier Deploy SUCCESS + prod 200 (re-run canonique si flocon).

## 4. Critères d'acceptation

Convergence restaurée (maxEffectifRayon ↑ net, diag re-joué) · ROUTE-NULL → ~0 · chutes ≤ 2 · fondations ≥ 5,0 · D3UUQJ vert · pertes Jev ≤ 11 · zéro collapse · piétinement 0→0 · suites vertes · `schemaVersion` 28.

## 5. Périmètre interdit

R-30 (arrivée), D2-collision universelle (la tolérance (b) est une EXCEPTION bornée campagne-barbares-errants, jamais un retrait), D1 pour les non-campagne, escortColon, gate R-190 (consulté), `defenseVille.ts`, gainSite, questions Jev, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, `schemaVersion`.

## 6. Fin de session

Rapport `REPORT-CONVERGENCE-FINALE.md` à la racine : diag re-joué avant/après (causes de blocage), tableaux bancs, l'issue atteinte, (b) activé ou inerte (chiffré), écarts consignés, ⚠ CI/Deploy à vérifier. **Clôture du chapitre siège** — remise de la main, le pilot archive et propose la suite.

**Pièges** : cache vitest `.vite` RACINE ; banc via `tsx` ; UN SEUL worker 8787 ; bancs en contention flaky (re-passer isolés) ; Guerrier = mouvement 1 ; TOUTE distance wrappée (`hexDistanceW`) ; chaque commit porte ses symboles ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
