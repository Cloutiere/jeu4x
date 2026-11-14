# HANDOFF-COLLISION-MOBILE — La collision ne compte que les ennemis MOBILES (suite de D2-POSTURE)

**Mini-mission de correction sur D2-POSTURE (ton commit `028773d`, pushé, prod 200). Canon Erik validé le 14/11 : levier « (a') ennemis mobiles seulement ».**

## 1. Préalables

- **Le diagnostic de ton arrêt** (le split était sémantiquement exact mais mécaniquement neutre) : toute tuile adjacente à un ennemi terrestre est déjà dans sa portée d'arrivée 1 tour → la clause COLLISION bloque elle-même toute approche de siège (banc bot victoires 0-1/40, parties au plafond). Le blocage est structurel, pas un seuil.
- **Le canon validé (a')** : la portée d'arrivée qui alimente la collision ne compte que les ennemis **MOBILES** — c'est-à-dire **ni fortifiés, ni en position de garnison canon** (dans une de SES villes, rôle garnison). Une garnison tient sa tuile par doctrine (L1 pour nous, Fortify R-33 pour tous) : elle n'« arrive » nulle part — elle n'est donc pas une menace d'ARRIVÉE. Conséquences :
  - **GZJQZX reste protégé** : u27 était mobile et marchait → collision détectée → u4 refuse le pas ✓ ;
  - **Le siège reprend** : l'armée approche une ville garnie — le défenseur garnisonné n'est pas une menace d'arrivée → la tuile adjacente est autorisée, l'assaut part au gate R-190 + TB-SIEGE à l'effectif (D2-approche `postureAssautSiege` du commit `028773d` reste en place) ;
  - **Risque résiduel accepté et mesuré** : une garnison peut SORTIR (attaque du défenseur) — c'est la guerre normale, pas une collision forcée à pièce de face ; le banc chiffrera.
- Baseline : ton commit `028773d` (pushé, prod 200), suites rules 1214 / server 525 / web 793 / jev-port 52 / sableuse 228. ⚠ symboles dans chaque commit, `git status` avant acceptation, **UNE seule mission**.

## 2. Mission L0→L3

- **L0 — Tests FIRST** (amende `anticollision-chasse.test.ts`) : pas adjacent à une ville ENNEMIE dont le défenseur est EN VILLE (garnison canon) → **PAS AUTORISÉ pour l'armée de campagne** (rouge avant fix) ; le MÊME défenseur mobile (hors ville, non fortifié) → pas REFUSÉ pour tous (GZJQZX inchangé — re-test) ; défenseur FORTIFIÉ hors ville → pas autorisé (fortifié = tient) ; sortie ennemie (le garnisonné sort et attaque) = guerre normale, hors périmètre collision ; D2-approche `postureAssautSiege` inchangée ; GZJQZX t36 re-simulé toujours refusé ; NP8JEE actif ; 30 seeds.
- **L1 — Code** : le calcul de portée d'arrivée dans `filtrerAntiCollision` exclut les ennemis **fortifiés ou en ville-canon-garnison** (une fonction pure locale, table `bot.json antiCollision` inchangée sauf si un champ émerge). D2-collision reste UNIVERSAL — seul le CALCUL de la menace se précise. `postureAssautSiege` reste (les non-mobiles exclus, l'exonération d'effectif devient redondante mais inoffensive — la retirer ou la garder : au choix le plus simple, consigner).
- **L2 — Bancs** : banc bot 40×3 AVANT (`028773d`) / APRÈS (`devtmp/banc-bot-td-{AVANT,APRES}-collision-mobile.json`) — critères : **victoires restaurées (≥ ~8/difficulté)** · parties ne plafonnent plus à 150 · zéro collapse · piétinement 0→0. Banc Jev 10 seeds mêmes seeds (≤ 0,60 $) : **0 collision-perdue avec ennemi MOBILE connu** (le critère canon, précisé) · unités perdues ≤ 10/partie · chutes ≤ 2 · fondations ≥ 5,0 · D3UUQJ vert. Si un critère échoue → **arrêt-pour-approbation**.
- **L3 — Suites + déploiement** : suites complètes, captures locales, push, vérifier Deploy SUCCESS + prod 200.

## 3. Critères d'acceptation

Pas adjacent à ville garnie autorisé pour l'armée (rouge avant fix) · ennemi mobile → collision inchangée (GZJQZX vert) · banc bot victoires ≥ ~8 · banc Jev 0 collision mobile, pertes ≤ 10, chutes ≤ 2, fondations ≥ 5,0 · zéro collapse · piétinement 0→0 · suites vertes · `schemaVersion` 28.

## 4. Périmètre interdit

`gateAttaque.ts` (consulté, jamais modifié), `defenseVille.ts`, escortColon, `postureAssautSiege` (conservée), condensé L4 / question L5, gainSite, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, `schemaVersion`.

## 5. Fin de session

Rapport `REPORT-COLLISION-MOBILE.md` à la racine : les tableaux AVANT/APRÈS (bot ET Jev), le sort des sorties de garnison observé au banc (chiffré), écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main.

**Pièges** : cache vitest `.vite` RACINE ; banc via `tsx` ; UN SEUL worker 8787 ; bancs en contention flaky ; Guerrier = mouvement 1 ; chaque commit porte ses symboles ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
