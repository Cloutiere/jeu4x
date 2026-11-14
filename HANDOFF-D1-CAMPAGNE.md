# HANDOFF-D1-CAMPAGNE — Les barbares ne déclenchent plus la poursuite D1 pour l'armée de campagne offensive (mission FINALE du chapitre siège)

**Mission FINALE — pour l'agent de DIAG-VERROUS-SIEGE (ton diagnostic `e031095`, ton outil `devtmp/diag-verrous-siege.ts` — c'est la base). Canon Erik validé le 14/11 : levier **V3-(ii)**. Comme A3 : **UNE re-mesure, puis push DANS LES DEUX ISSUES — aucune itération D2/COLLISION/D1-suite.****

## 1. Préalables

- **Le diagnostic est ton verdict** : V3 (D1 épinglant) = 44-48 % des tours-membres épinglés, **94 % par des barbares en errance domestique** ; V2 (effectif 4) = symptôme de V3 (maxEffectifRayon moyen 0,1, jamais ≥ 4, armées de 6-8 existent) ; V1 (gate tôt) acquitté (0 refus à k=2). Ordre de pose consigné : V3 seul, V2 seulement si nécessaire APRÈS, jamais ensemble.
- Baseline : ton commit `2b4e386` (pushé, prod 200), suites rules 1214 / server 531 / web 793 / jev-port 52 / sableuse 228, `schemaVersion` **28**. ⚠ symboles dans chaque commit (`git show` + grep), `git status` avant acceptation, **UNE seule mission**.

## 2. Le canon validé (un seul levier)

**V3-(ii) : les barbares sont exclus du DÉCLENCHEUR de poursuite D1 pour les membres de l'armée de campagne offensive** — exclusivement :
- **Qui** : uniquement les membres d'une **armée de campagne en guerre déclarée en cours** (`postureAssautSiege`/fusionnerPlan — la définition d'armée de campagne que tu connais) ;
- **Quoi** : les barbares (et seulement eux) ne comptent plus comme « chasseur » dans la détection de poursuite de ces membres — les ennemis de civilisation en guerre déclarée **continuent** de déclencher D1 pour tout le monde ;
- **Qui reste protégé** : scouts, escortes, garnisons, unités seules, membres SANS campagne offensive en cours — leur D1-barbares reste **entier** (leçon GZJQZX : la protection des chassés près de leurs villes est canon) ;
- **D2-collision mobile reste UNIVERSAL** (`estEnnemiMobile` inchangé — les barbares mobiles bloquent toujours le pas sur leur case d'arrivée) ; `postureAssautSiege`, `effectifCampagne 4` : inchangés (V2 ne bouge PAS).

Implémentation minimale : la détection de poursuite (memo `antiCollision` / `planAntiCollision`) filtre le chasseur par camp pour ce sous-population — une condition, table `bot.json antiCollision` étendue si un champ émerge (`d1CampagneBarbares: false`).

## 3. Mission L0→L3

- **L0 — Tests FIRST** (amende tes tests) : membre de campagne en guerre déclarée + barbare en errance adjacent → **pas de poursuite**, l'unité continue sa campagne (rouge avant fix) ; le MÊME membre + ennemi de civilisation en guerre → poursuite inchangée ; scout/escorte/garnison + barbare → D1 inchangé (protégés) ; D2-collision barbares inchangée (pas sur la case d'arrivée toujours refusé) ; GZJQZX t36 re-simulé toujours refusé ; NP8JEE actif ; 30 seeds ; non-régression : exploration, escortColon, tranche A.
- **L1 — Code** : le filtre de camp dans la détection (une condition), miroirs bit-à-bit harnais/port si le memo passe par là.
- **L2 — Re-mesure UNE FOIS** : banc bot 40×3 AVANT (`2b4e386`) / APRÈS (`devtmp/banc-bot-td-{AVANT,APRES}-d1campagne.json`) — **critères de push, dans les deux issues** :
  - **Issue A** : victoires restaurées vers les marges historiques (≥ ~8/difficulté) ET banc Jev vert (0 collision mobile, pertes ≤ 10, chutes ≤ 2, fondations ≥ 5,0, D3UUQJ vert) → push net ;
  - **Issue B** : restauration partielle (au-dessus de 2/2/1, plafond 150 relâché) avec banc Jev vert → **push QUAND MÊME** avec les chiffres consignés — fin de partie, le chapitre siège est clos, le verdict final sera à l'œil d'Erik vs Jev en prod ;
  - **Arrêt-pour-approbation** uniquement si le banc Jev se dégrade (collisions > 0, pertes > 10, chutes > 2) ou banc bot en dessous de 2/2/1 (régression) — pas d'itération solo sur les seuils.
  - **Preuve mécanique** : re-jouer TON diagnostic (`devtmp/diag-verrous-siege.ts`) avant/après — les tours-membres épinglés par barbares pour membres de campagne doivent tomber ~0.
- **L3 — Suites + déploiement** : suites complètes, captures locales, push, vérifier Deploy SUCCESS + prod 200 (re-run canonique si flocon).

## 4. Fin de session

Rapport `REPORT-D1-CAMPAGNE.md` à la racine : le diag re-joué avant/après (épinglages barbares ~0), les tableaux bancs AVANT/APRÈS, l'issue atteinte, écarts consignés, ⚠ CI/Deploy à vérifier. **Clôture du chapitre siège** (gate → escarmouche → k-durée → anti-collision → collision-mobile → D1-campagne). Puis arrêt, remise de la main — le pilot archive et propose la suite (Sanctuaire V1, pression défensive, tranche B).

**Pièges** : cache vitest `.vite` RACINE ; banc via `tsx` ; UN SEUL worker 8787 ; bancs en contention flaky (re-passer isolés) ; Guerrier = mouvement 1 ; chaque commit porte ses symboles ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
