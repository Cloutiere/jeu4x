# HANDOFF-BOT-GATE-PRESSION-CAMPAGNE — k décroissant avec la durée de guerre (suite de K-GUERRE)

**Mission de SUIVI pour l'agent de BOT-GATE-K-GUERRE (ton commit local `23c4a07`, non poussé — c'est la base). Canon Erik validé le 11/11 (arbitrage « pression de campagne »).**

## 1. Préalables

- Constat de ton arrêt-pour-approbation : la stérilité (0,97-0,98) est **insensible au k** — les armées campent à l'anneau de ralliement et ne se croisent qu'à p ≈ 0,5, ce qu'aucun k ≥ 1,1 ne débloque. Erik a tranché : le levier est la **durée**.
- Baseline : ton commit local `23c4a07` (k modulé 2/1,3, 6 tests, rules 1180, suites vertes, RULES.md R-190 amendée), rien poussé.

## 2. Le canon validé (remplace la modulation 2/1,3)

**k = max(kPlancher ; kHorsGuerre − pente × toursDepuisDéclarationGuerre)** pour toute attaque entre belligérants d'une guerre DÉCLARÉE :
- **kHorsGuerre = 2** (attaque hors guerre déclarée, et barbares — jamais en guerre — restent à 2 : D3UUQJ protégé) ;
- **pente = 0,1 / tour** (tunable `bot.json gateAttaque`) : k = 1,3 à t=7, 1,1 à t=9 ;
- **kPlancher = 1,1** (tunable) : contact dès p ≥ 0,524 — un léger avantage suffit ; le suicide pur (p < 0,5) reste fermé À TOUT moment de la guerre ;
- La clé `kEnGuerre` (1,3 fixe) est **remplacée** par la courbe — supprimer la modulation plate, garder la structure de test.

## 3. Mission L0→L4

- **L0 — Tests FIRST** : accrochage p 0,5 refusé en guerre fraîche (t<5) / AUTORISÉ en guerre longue (t ≥ 9) ; suicide p 0,45 refusé à t=20 aussi ; D3UUQJ (barbares) toujours refusé ; courbe et plancher lisibles dans `bot.json` ; 30 seeds ; non-régression des 6 tests K-GUERRE amendés à la courbe.
- **L1 — Moteur** : la durée de guerre est déjà connue du gate (D3 porte `guerreAvec`) — porté la date de déclaration (existant : warsDepuis GUERRE-VIVANTE) jusqu'au choix de k. Une seule source de vérité pour « tours depuis déclaration ».
- **L2 — Banc horloge 40×3×150 AVANT (= `33d8379`) / APRÈS** (`devtmp/banc-horloge-{AVANT,APRES}-pression.json`) — critères inchangés : **stérilité normal/difficile < 0,90** · captures ≥ 6/4/5 · fréquence de guerre dans les marges AVANT (3,20/1,75/2,58). Si non atteint → **arrêt-pour-approbation** (chiffres consignés, PAS d'itération solo sur pente/plancher).
- **L3 — Banc bot 40×3 AVANT/APRÈS** — zéro collapse. Suites complètes, captures locales AVANT tout commit, push, vérifier Deploy SUCCESS + prod 200.

## 4. Critères d'acceptation

Stérilité < 0,90 (normal/difficile) · captures ≥ AVANT-gate · D3UUQJ vert · suicide p<0,5 fermé à toute durée · zéro collapse · suites vertes · `schemaVersion` 28.

## 5. Périmètre interdit

Inchangé : valeur tactique, sécurité locale, question tactique Jev, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, gainSite, `schemaVersion`.

## 6. Fin de session

Rapport `REPORT-BOT-GATE-PRESSION-CAMPAGNE.md` à la racine : tableaux AVANT/APRÈS, verdict par critère, la courbe k(t) effectivement testée, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main.

**Pièges** : cache vitest `.vite` RACINE avant re-mesure ; bancs via config dédiée ; UN SEUL worker 8787 ; timeout banc sableuse 600 s ; ne jamais committer les fichiers personnels d'Erik ni les secrets.
