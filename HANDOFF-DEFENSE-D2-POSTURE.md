# HANDOFF-D2-POSTURE — L'anti-collision suit la posture : universel pour la collision, défensif pour l'approche

**Mini-mission de correction sur ANTICOLLISION-CHASSE (`2eb4c16` — pushé, prod 200). Canon Erik validé le 14/11 : « je valide ce découpage ».**

## 1. Préalables

- L'écart à corriger (ton rapport A2 §6) : D2 appliqué STRICTEMENT ferme l'approche de siège — au banc bot, victoires 27-29 → 0-1/40, parties au plafond 150 (les armées campent/fortifient aux portes au lieu de fermer l'assaut), alors que le banc Jev est excellent (unités perdues −61 %, 0 collision, chutes 1).
- **Le découpage validé par Erik** — D2 se SPLITTE en deux moitiés posturales :
  1. **D2-collision — UNIVERSAL, inchangé** : jamais un pas qui atterrit SUR une case où un ennemi CONNU peut arriver ce même tour (portée d'arrivée × mouvement). C'est le fix GZJQZX (la cohabitation force la bataille) — il protège tout le monde, armées comprises.
  2. **D2-approche — POSTURE-DÉPENDANTE** : l'interdiction dà ≤ 1 d'un ennemi plus fort/égal ne s'applique QU'AUX unités **seules ou en posture défensive** (escort, garnison, exploration, patrouille). Les **armées de campagne en guerre déclarée** (effectif ≥ `effectifAssaut` — le seuil TB-SIEGE existant, table `bot.json`) **gardent l'approche du siège** : elles passent de toute façon par le gate R-190 pour l'assaut, et la courbe de pression k-durée régule le rythme. Exception posturale conservée : une unité SEULE (dernière combattante de ses villes) reste soumise à D2-approche même en guerre (leçon GZJQZX — sa mort ouvre la capitale).
- Baseline : rules 1214 / server 518 / web 793 / jev-port 52 / sableuse 228 verts, `schemaVersion` **28** (intacte), Deploy SUCCESS `9cce52c`→`2eb4c16`, prod 200. ⚠ Symboles dans chaque commit (`git show` + grep) ; `git status` avant acceptation.

## 2. Mission L0→L3

- **L0 — Tests FIRST** (`apps/server/tests/anticollision-chasse.test.ts` amendé) : armée de campagne (effectif ≥ seuil) en guerre déclarée, pas à d≤1 d'un défenseur plus fort → **PAS AUTORISÉ l'approche ? NON — AUTORISÉ** (rouge avant fix, non-régression du siège) ; la MÊME unité SEULE → pas refusé (GZJQZX protégé) ; D2-collision (atterrir SUR la case d'arrivée) → refusé POUR TOUS, armée comprise ; unité seule dernière combattante en guerre → refusé ; non-guerre → inchangé ; 30 seeds ; non-régression GZJQZX t36 re-simulé (toujours refusé) + NP8JEE.
- **L1 — Code** : `filtrerAntiCollision` prend la posture (campagne-guerre + effectif ≥ seuil → D2-approche éteinte, D2-collision active) — une condition, table `bot.json antiCollision` étendue (`effectifCampagne`), zéro refonte.
- **L2 — Bancs (l'arbitre du découpage)** : banc bot 40×3 AVANT (`2eb4c16`) / APRÈS (`devtmp/banc-bot-td-{AVANT,APRES}-d2posture.json`) — critères : **victoires revenue dans les marges historiques (≥ ~8/difficulté — cible ~8-27)** · parties ne plafonnent plus massivement à 150 · zéro collapse · piétinement 0→0. Banc Jev 10 seeds mêmes seeds (≤ 0,60 $) : **0 collision-perdue avec ennemi connu maintenue** · unités perdues ≤ 10/partie (la moitié du gain −61 % doit tenir) · chutes ≤ 2 · fondations ≥ 5,0 · D3UUQJ vert. Si un critère échoue → **arrêt-pour-approbation**, pas d'itération solo sur le seuil d'effectif.
- **L3 — Suites + déploiement** : suites complètes, captures locales, push, vérifier Deploy SUCCESS + prod 200 (re-run canonique si flocon).

## 3. Critères d'acceptation

Banc bot victoires ≥ ~8/difficulté (approche de siège restaurée) · banc Jev : 0 collision, unités perdues ≤ 10/partie · GZJQZX t36 toujours refusé · NP8JEE actif · zéro collapse · piétinement 0→0 · suites vertes · `schemaVersion` 28.

## 4. Périmètre interdit

D2-collision (inchangé), `gateAttaque.ts` (consulté, jamais modifié), `defenseVille.ts`, escortColon, condensé L4 / question L5, gainSite, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, `schemaVersion`.

## 5. Fin de session

Rapport `REPORT-D2-POSTURE.md` à la racine : les deux tableaux AVANT/APRÈS (bot ET Jev), le verdict par critère, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main.

**Pièges** : cache vitest `.vite` RACINE avant re-mesure ; banc via `tsx` (~28-74 min en contention) ; UN SEUL worker 8787 ; bancs lourds parallèles = flaky (re-passer isolés) ; Guerrier = mouvement 1 (positions à d ≤ 2 réels BFS) ; chaque commit porte ses symboles ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
